//! 刷新节流：避免轮询、手动刷新和设置页验证把供应商接口打到 429。
//!
//! 每个凭据有独立的最小刷新间隔和退避状态，同一站点还可以共享请求预算。
//! 被节流时返回上一次成功的数据并标记限流截止时间，没有缓存才返回错误。

use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};

use super::traits::ProviderError;

/// 首次 429 且没有 Retry-After 时的等待时间，之后每次翻倍。
const BASE_BACKOFF: Duration = Duration::from_secs(60);
const MAX_BACKOFF: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Copy)]
pub struct ThrottlePolicy {
    /// 同一凭据两次真实请求之间的最短间隔，间隔内直接返回缓存。
    pub min_interval: Duration,
    /// 同一站点在时间窗内允许的请求数。
    pub site_budget: Option<(usize, Duration)>,
}

pub struct ThrottleOutcome<T> {
    pub value: T,
    pub fetched_at: DateTime<Utc>,
    /// 有值表示这次没有真正请求，返回的是缓存，限流在该时间后解除。
    pub limited_until: Option<DateTime<Utc>>,
}

struct Cached<T> {
    value: T,
    at: Instant,
    fetched_at: DateTime<Utc>,
}

struct Entry<T> {
    cached: Option<Cached<T>>,
    cooldown_until: Option<Instant>,
    failures: u32,
}

#[derive(Default)]
struct Site {
    requests: VecDeque<Instant>,
    cooldown_until: Option<Instant>,
}

pub struct RequestThrottle<T> {
    entries: Mutex<HashMap<String, Arc<tokio::sync::Mutex<Entry<T>>>>>,
    sites: Mutex<HashMap<String, Site>>,
}

impl<T: Clone> RequestThrottle<T> {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            sites: Mutex::new(HashMap::new()),
        }
    }

    /// 生成缓存键时只保留凭据哈希，不在键里保存原文。
    pub fn key(parts: &[&str], credential: &str) -> String {
        let mut hasher = DefaultHasher::new();
        credential.hash(&mut hasher);
        format!("{}#{:016x}", parts.join("|"), hasher.finish())
    }

    pub async fn run<F, Fut>(
        &self,
        key: &str,
        site: Option<&str>,
        policy: ThrottlePolicy,
        fetch: F,
    ) -> Result<ThrottleOutcome<T>, ProviderError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, ProviderError>>,
    {
        let entry = {
            let mut entries = self.entries.lock().unwrap();
            entries
                .entry(key.to_string())
                .or_insert_with(|| {
                    Arc::new(tokio::sync::Mutex::new(Entry {
                        cached: None,
                        cooldown_until: None,
                        failures: 0,
                    }))
                })
                .clone()
        };
        // 同一凭据的并发刷新排队，后到的请求直接拿到前一个的结果。
        let mut entry = entry.lock().await;
        let now = Instant::now();

        if let Some(cached) = entry.cached.as_ref() {
            if now.duration_since(cached.at) < policy.min_interval {
                return Ok(ThrottleOutcome {
                    value: cached.value.clone(),
                    fetched_at: cached.fetched_at,
                    limited_until: None,
                });
            }
        }

        // 先看凭据自身冷却，再登记站点预算，避免没发出的请求也占用预算。
        if let Some(until) = entry.cooldown_until.filter(|until| *until > now) {
            return Self::limited(&entry, until, now);
        }
        if let Some(until) = self.reserve_site(site, policy, now) {
            return Self::limited(&entry, until, now);
        }

        match fetch().await {
            Ok(value) => {
                entry.failures = 0;
                entry.cooldown_until = None;
                let fetched_at = Utc::now();
                entry.cached = Some(Cached {
                    value: value.clone(),
                    at: Instant::now(),
                    fetched_at,
                });
                Ok(ThrottleOutcome {
                    value,
                    fetched_at,
                    limited_until: None,
                })
            }
            Err(ProviderError::RateLimited(message, retry_after)) => {
                entry.failures = entry.failures.saturating_add(1);
                let wait = retry_after
                    .map(Duration::from_secs)
                    .unwrap_or_else(|| {
                        BASE_BACKOFF.saturating_mul(1 << (entry.failures - 1).min(5))
                    })
                    .min(MAX_BACKOFF);
                let until = Instant::now() + wait;
                entry.cooldown_until = Some(until);
                if let Some(site) = site {
                    let mut sites = self.sites.lock().unwrap();
                    sites.entry(site.to_string()).or_default().cooldown_until = Some(until);
                }
                if entry.cached.is_some() {
                    Self::limited(&entry, until, Instant::now())
                } else {
                    Err(ProviderError::RateLimited(message, Some(wait.as_secs())))
                }
            }
            Err(error) => Err(error),
        }
    }

    /// 检查站点预算；未超限时登记本次请求，超限时返回可再次请求的时间。
    fn reserve_site(
        &self,
        site: Option<&str>,
        policy: ThrottlePolicy,
        now: Instant,
    ) -> Option<Instant> {
        let site = site?;
        let mut sites = self.sites.lock().unwrap();
        let state = sites.entry(site.to_string()).or_default();
        if let Some(until) = state.cooldown_until.filter(|until| *until > now) {
            return Some(until);
        }
        if let Some((budget, window)) = policy.site_budget {
            while state
                .requests
                .front()
                .is_some_and(|at| now.duration_since(*at) >= window)
            {
                state.requests.pop_front();
            }
            if state.requests.len() >= budget {
                return state.requests.front().map(|oldest| *oldest + window);
            }
        }
        state.requests.push_back(now);
        None
    }

    fn limited(
        entry: &Entry<T>,
        until: Instant,
        now: Instant,
    ) -> Result<ThrottleOutcome<T>, ProviderError> {
        let wait = until.saturating_duration_since(now);
        let limited_until =
            Utc::now() + chrono::Duration::from_std(wait).unwrap_or(chrono::Duration::zero());
        match entry.cached.as_ref() {
            Some(cached) => Ok(ThrottleOutcome {
                value: cached.value.clone(),
                fetched_at: cached.fetched_at,
                limited_until: Some(limited_until),
            }),
            None => {
                let seconds = wait.as_secs().max(1);
                Err(ProviderError::RateLimited(
                    format!("已暂停查询以避免触发限流，约 {seconds} 秒后恢复"),
                    Some(seconds),
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const POLICY: ThrottlePolicy = ThrottlePolicy {
        min_interval: Duration::from_secs(60),
        site_budget: None,
    };

    async fn call(
        throttle: &RequestThrottle<u32>,
        key: &str,
        site: Option<&str>,
        policy: ThrottlePolicy,
        counter: &AtomicUsize,
        result: Result<u32, ProviderError>,
    ) -> Result<ThrottleOutcome<u32>, ProviderError> {
        throttle
            .run(key, site, policy, || async {
                counter.fetch_add(1, Ordering::SeqCst);
                result
            })
            .await
    }

    #[tokio::test]
    async fn repeated_refreshes_within_the_interval_reuse_the_cache() {
        let throttle = RequestThrottle::new();
        let counter = AtomicUsize::new(0);
        let first = call(&throttle, "a", None, POLICY, &counter, Ok(1))
            .await
            .unwrap();
        let second = call(&throttle, "a", None, POLICY, &counter, Ok(2))
            .await
            .unwrap();
        assert_eq!((first.value, second.value), (1, 1));
        assert!(second.limited_until.is_none());
        assert_eq!(counter.load(Ordering::SeqCst), 1);
        // 不同凭据互不影响。
        call(&throttle, "b", None, POLICY, &counter, Ok(3))
            .await
            .unwrap();
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn rate_limit_starts_a_cooldown_and_serves_cached_data() {
        let throttle = RequestThrottle::new();
        let counter = AtomicUsize::new(0);
        let no_interval = ThrottlePolicy {
            min_interval: Duration::ZERO,
            site_budget: None,
        };
        call(&throttle, "a", None, no_interval, &counter, Ok(7))
            .await
            .unwrap();
        let limited = call(
            &throttle,
            "a",
            None,
            no_interval,
            &counter,
            Err(ProviderError::RateLimited("429".into(), Some(120))),
        )
        .await
        .unwrap();
        assert_eq!(limited.value, 7);
        assert!(limited.limited_until.is_some());
        // 冷却期内不再发请求。
        let again = call(&throttle, "a", None, no_interval, &counter, Ok(8))
            .await
            .unwrap();
        assert_eq!(again.value, 7);
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn rate_limit_without_cache_is_an_error_with_wait_time() {
        let throttle = RequestThrottle::new();
        let counter = AtomicUsize::new(0);
        let error = call(
            &throttle,
            "a",
            None,
            POLICY,
            &counter,
            Err(ProviderError::RateLimited("429".into(), None)),
        )
        .await
        .err()
        .unwrap();
        assert!(matches!(error, ProviderError::RateLimited(_, Some(60))));
        let error = call(&throttle, "a", None, POLICY, &counter, Ok(1))
            .await
            .err()
            .unwrap();
        assert!(matches!(error, ProviderError::RateLimited(..)));
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn keys_on_one_site_share_the_site_budget_and_cooldown() {
        let throttle = RequestThrottle::new();
        let counter = AtomicUsize::new(0);
        let policy = ThrottlePolicy {
            min_interval: Duration::ZERO,
            site_budget: Some((2, Duration::from_secs(600))),
        };
        call(&throttle, "a", Some("s"), policy, &counter, Ok(1))
            .await
            .unwrap();
        call(&throttle, "b", Some("s"), policy, &counter, Ok(2))
            .await
            .unwrap();
        let limited = call(&throttle, "a", Some("s"), policy, &counter, Ok(3))
            .await
            .unwrap();
        assert_eq!(limited.value, 1);
        assert!(limited.limited_until.is_some());
        assert!(call(&throttle, "c", Some("s"), policy, &counter, Ok(4))
            .await
            .is_err());
        // 其他站点不受影响。
        call(&throttle, "c", Some("t"), policy, &counter, Ok(5))
            .await
            .unwrap();
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn other_errors_do_not_start_a_cooldown() {
        let throttle = RequestThrottle::new();
        let counter = AtomicUsize::new(0);
        let no_interval = ThrottlePolicy {
            min_interval: Duration::ZERO,
            site_budget: None,
        };
        assert!(call(
            &throttle,
            "a",
            None,
            no_interval,
            &counter,
            Err(ProviderError::RequestError("HTTP 500".into()))
        )
        .await
        .is_err());
        call(&throttle, "a", None, no_interval, &counter, Ok(1))
            .await
            .unwrap();
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }
}
