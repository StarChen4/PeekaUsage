use std::collections::HashSet;
use std::time::Duration;

use chrono::{DateTime, Datelike, TimeZone, Utc};
use reqwest::{Client, Response};
use serde::Deserialize;

use super::traits::ProviderError;

/// 统计周期使用固定的月边界，请求的截止时间另取当前时间，避免每次刷新重置趋势。
pub(super) fn month_bounds(now: DateTime<Utc>) -> (DateTime<Utc>, DateTime<Utc>) {
    let start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .expect("无法计算本月起始时间");
    let (year, month) = if now.month() == 12 {
        (now.year() + 1, 1)
    } else {
        (now.year(), now.month() + 1)
    };
    let end = Utc
        .with_ymd_and_hms(year, month, 1, 0, 0, 0)
        .single()
        .expect("无法计算下月起始时间");
    (start, end)
}

pub(super) fn new_client() -> Client {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("PeekaUsage/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("初始化供应商 HTTP 客户端失败")
}

pub(super) fn check_response(
    response: Response,
    auth_message: &str,
) -> Result<Response, ProviderError> {
    match response.status().as_u16() {
        200..=299 => Ok(response),
        401 | 403 => Err(ProviderError::AuthError(auth_message.into())),
        429 => {
            let retry_after = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok());
            Err(ProviderError::RateLimited(match retry_after {
                Some(value) => format!("请求过于频繁，请稍后重试（Retry-After: {value}）"),
                None => "请求过于频繁，请稍后重试".into(),
            }))
        }
        _ => Err(ProviderError::RequestError(format!(
            "HTTP {}",
            response.status()
        ))),
    }
}

/// 同时接受数字和十进制字符串，拒绝未知类型与非有限值。
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(super) enum ApiNumber {
    Number(f64),
    Text(String),
}

impl ApiNumber {
    pub fn value(&self) -> Result<f64, ProviderError> {
        let value = match self {
            Self::Number(value) => *value,
            Self::Text(value) => value
                .parse::<f64>()
                .map_err(|_| ProviderError::ParseError("金额或利用率不是有效数字".into()))?,
        };
        if !value.is_finite() {
            return Err(ProviderError::ParseError("金额或利用率不是有限数字".into()));
        }
        Ok(value)
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct Pagination {
    pub has_more: bool,
    pub next_page: Option<String>,
}

impl Pagination {
    pub fn next(self, seen: &mut HashSet<String>) -> Result<Option<String>, ProviderError> {
        if !self.has_more {
            return Ok(None);
        }
        let cursor = self
            .next_page
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                ProviderError::ParseError("成本报告有后续页面，但缺少分页游标".into())
            })?;
        if !seen.insert(cursor.clone()) || seen.len() > 64 {
            return Err(ProviderError::ParseError(
                "成本报告分页游标重复或页数异常".into(),
            ));
        }
        Ok(Some(cursor))
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    pub struct MockServer {
        pub url: String,
        requests: Arc<Mutex<Vec<String>>>,
        task: tokio::task::JoinHandle<()>,
    }

    impl MockServer {
        pub async fn start(responses: Vec<(u16, &str)>) -> Self {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let responses: Vec<_> = responses
                .into_iter()
                .map(|(status, body)| (status, body.to_string()))
                .collect();
            let requests = Arc::new(Mutex::new(Vec::new()));
            let captured = requests.clone();
            let task = tokio::spawn(async move {
                for (status, body) in responses {
                    let (mut stream, _) =
                        tokio::time::timeout(Duration::from_secs(5), listener.accept())
                            .await
                            .expect("未收到预期请求")
                            .unwrap();
                    let mut request = Vec::new();
                    while !request.ends_with(b"\r\n\r\n") {
                        let mut buffer = [0; 1024];
                        let length = stream.read(&mut buffer).await.unwrap();
                        assert!(length > 0, "请求头尚未完整时连接已关闭");
                        request.extend_from_slice(&buffer[..length]);
                    }
                    captured
                        .lock()
                        .unwrap()
                        .push(String::from_utf8(request).unwrap());
                    let response = format!("HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                    stream.write_all(response.as_bytes()).await.unwrap();
                }
            });
            Self {
                url,
                requests,
                task,
            }
        }

        pub async fn finish(self) -> Vec<String> {
            self.task.await.unwrap();
            let requests = self.requests.lock().unwrap().clone();
            requests
        }
    }

    #[test]
    fn invalid_numbers_and_pagination_are_rejected() {
        for value in ["NaN", "inf", "不是数字"] {
            assert!(ApiNumber::Text(value.into()).value().is_err());
        }
        let mut seen = HashSet::new();
        assert!(Pagination {
            has_more: true,
            next_page: None
        }
        .next(&mut seen)
        .is_err());
        assert!(Pagination {
            has_more: true,
            next_page: Some("second".into())
        }
        .next(&mut seen)
        .is_ok());
        assert!(Pagination {
            has_more: true,
            next_page: Some("second".into())
        }
        .next(&mut seen)
        .is_err());
    }

    #[test]
    fn monthly_period_is_stable_across_refreshes_and_year_boundaries() {
        let first = Utc.with_ymd_and_hms(2026, 12, 15, 1, 0, 0).unwrap();
        let second = Utc.with_ymd_and_hms(2026, 12, 16, 3, 0, 0).unwrap();
        assert_eq!(month_bounds(first), month_bounds(second));
        assert_eq!(
            month_bounds(first).1,
            Utc.with_ymd_and_hms(2027, 1, 1, 0, 0, 0).unwrap()
        );
    }
}
