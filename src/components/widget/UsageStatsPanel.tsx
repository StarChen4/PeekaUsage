import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import type { UsageSummary } from "../../types/provider";
import type {
  ProviderStatsSnapshot,
  StatsRange,
  UsageForecast,
  UsageStatsSnapshot,
} from "../../types/stats";
import { formatCurrency, formatPercent } from "../../utils/formatters";
import { getUsageStatsSnapshot } from "../../utils/ipc";
import ProviderIcon from "../common/ProviderIcon";

type UsageStatsPanelProps = {
  open: boolean;
  providers: UsageSummary[];
  onClose: () => void;
};

export default function UsageStatsPanel({
  open,
  providers,
  onClose,
}: UsageStatsPanelProps) {
  const { language, t } = useI18n();
  const [range, setRange] = useState<StatsRange>("day");
  const [snapshot, setSnapshot] = useState<UsageStatsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshToken = useMemo(
    () => providers
      .filter((provider) => provider.enabled)
      .map((provider) => `${provider.providerId}:${provider.lastUpdated ?? ""}:${provider.status}`)
      .join("|"),
    [providers],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setRange("day");
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getUsageStatsSnapshot(range)
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }
        setSnapshot(nextSnapshot);
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, range, refreshToken]);

  if (!open) {
    return null;
  }

  const locale = languageToLocale(language);
  const lastSampleAt = getLatestSampleTime(snapshot?.providers ?? []);

  return (
    <div className="stats-panel" role="dialog" aria-modal="false" aria-label={t("widget.stats.title")}>
      <div className="stats-panel-header">
        <div className="stats-panel-title-row">
          <h3 className="stats-panel-title">{t("widget.stats.title")}</h3>
          <button
            className="stats-close-btn"
            type="button"
            aria-label={t("widget.stats.close")}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6 6 18"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>

        <div className="stats-range-switch" role="tablist" aria-label={t("widget.stats.range.ariaLabel")}>
          {(["day", "month"] as const).map((item) => (
            <button
              key={item}
              className={`stats-range-btn${range === item ? " is-active" : ""}`}
              type="button"
              aria-pressed={range === item}
              onClick={() => setRange(item)}
            >
              {t(`widget.stats.range.${item}`)}
            </button>
          ))}
        </div>
      </div>

      {snapshot?.healthNotices.length ? (
        <div className="stats-notices">
          {snapshot.healthNotices.map((notice) => (
            <div
              key={notice.code}
              className={`stats-notice is-${notice.level}`}
            >
              {t(`widget.stats.notices.${notice.code}`)}
            </div>
          ))}
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="stats-empty-state">{t("widget.stats.loading")}</div>
      ) : error ? (
        <div className="stats-empty-state is-error">
          {t("widget.stats.loadFailed", { message: error })}
        </div>
      ) : !snapshot || snapshot.providers.length === 0 ? (
        <div className="stats-empty-state">{t("widget.stats.empty")}</div>
      ) : (
        <div className="stats-scroll-body">
          <div className="stats-overview-grid">
            <div className="stats-overview-card">
              <span className="stats-overview-label">{t("widget.stats.summary.providerCount")}</span>
              <strong className="stats-overview-value">{snapshot.providers.length}</strong>
            </div>
            <div className="stats-overview-card">
              <span className="stats-overview-label">{t("widget.stats.summary.lastSampleAt")}</span>
              <strong className="stats-overview-value">
                {lastSampleAt ? formatDateTime(lastSampleAt, locale) : t("widget.stats.value.unavailable")}
              </strong>
            </div>
            <div className="stats-overview-card">
              <span className="stats-overview-label">{t("widget.stats.summary.range")}</span>
              <strong className="stats-overview-value">{t(`widget.stats.summary.${range}Description`)}</strong>
            </div>
          </div>

          <div className="stats-provider-list">
            {snapshot.providers.map((provider) => (
              <article key={provider.providerId} className="stats-provider-card">
                <div className="stats-provider-header">
                  <div className="stats-provider-title">
                    <ProviderIcon providerId={provider.providerId} size={18} />
                    <span>{provider.displayName}</span>
                  </div>
                  <span className="stats-provider-time">
                    {provider.lastSampleAt
                      ? formatDateTime(provider.lastSampleAt, locale)
                      : t("widget.stats.value.unavailable")}
                  </span>
                </div>

                {provider.apiSummary ? (
                  <div className="stats-section-card">
                    <div className="stats-section-title">{t("widget.stats.api.title")}</div>
                    <div className="stats-metric-grid">
                      <MetricBlock
                        label={t(`widget.stats.api.${range}Usage`)}
                        value={formatCurrency(provider.apiSummary.rangeUsed, provider.apiSummary.currency)}
                      />
                      <MetricBlock
                        label={t("widget.stats.api.currentRemaining")}
                        value={provider.apiSummary.currentRemaining != null
                          ? formatCurrency(provider.apiSummary.currentRemaining, provider.apiSummary.currency)
                          : t("widget.stats.forecast.notApplicable")}
                      />
                      <MetricBlock
                        label={t("widget.stats.api.forecast")}
                        value={formatForecast(provider.apiSummary.forecast, t)}
                      />
                      <MetricBlock
                        label={t("widget.stats.api.recentVelocity")}
                        value={provider.apiSummary.recentVelocity != null
                          ? t("widget.stats.value.currencyPerHour", {
                            value: formatCurrency(provider.apiSummary.recentVelocity, provider.apiSummary.currency),
                          })
                          : t("widget.stats.forecast.insufficientData")}
                      />
                    </div>
                  </div>
                ) : null}

                {provider.subscriptionTrends.length ? (
                  <div className="stats-section-card">
                    <div className="stats-section-title">{t("widget.stats.subscription.title")}</div>
                    <div className="stats-trend-list">
                      {provider.subscriptionTrends.map((trend) => (
                        <div
                          key={`${trend.subscriptionId}-${trend.kind}-${trend.label}`}
                          className="stats-trend-card"
                        >
                          <div className="stats-trend-header">
                            <div>
                              <div className="stats-trend-name">{trend.subscriptionName}</div>
                              <div className="stats-trend-label">
                                {trend.kind === "extraUsage"
                                  ? t("widget.subscription.extraUsageLabel")
                                  : trend.label}
                              </div>
                            </div>
                            <div className="stats-trend-current">
                              {formatPercent(trend.currentUtilization)}
                            </div>
                          </div>

                          <div className="stats-metric-grid">
                            <MetricBlock
                              label={t("widget.stats.subscription.currentUtilization")}
                              value={formatPercent(trend.currentUtilization)}
                            />
                            <MetricBlock
                              label={t(`widget.stats.subscription.${range}Delta`)}
                              value={formatPercent(trend.rangeDelta)}
                            />
                            <MetricBlock
                              label={t("widget.stats.subscription.forecast")}
                              value={formatForecast(trend.forecast, t)}
                            />
                            <MetricBlock
                              label={t("widget.stats.subscription.recentVelocity")}
                              value={trend.recentVelocity != null
                                ? t("widget.stats.value.percentPerHour", {
                                  value: formatPercent(trend.recentVelocity),
                                })
                                : t("widget.stats.forecast.insufficientData")}
                            />
                          </div>

                          {trend.kind === "extraUsage" && trend.currentUsed != null && trend.currentLimit != null ? (
                            <div className="stats-trend-extra-line">
                              {t("widget.stats.subscription.usedLimit", {
                                used: formatCurrency(trend.currentUsed, trend.currency ?? "USD"),
                                limit: formatCurrency(trend.currentLimit, trend.currency ?? "USD"),
                              })}
                            </div>
                          ) : null}

                          {trend.resetsAt ? (
                            <div className="stats-trend-reset">
                              {t("widget.stats.subscription.resetAt", {
                                time: formatDateTime(trend.resetsAt, locale),
                              })}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats-metric-block">
      <span className="stats-metric-label">{label}</span>
      <strong className="stats-metric-value">{value}</strong>
    </div>
  );
}

function languageToLocale(language: string): string {
  if (language === "zh-Hant") {
    return "zh-Hant";
  }

  if (language === "en") {
    return "en-US";
  }

  return "zh-CN";
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getLatestSampleTime(providers: ProviderStatsSnapshot[]): string | null {
  let latest: string | null = null;

  for (const provider of providers) {
    if (!provider.lastSampleAt) {
      continue;
    }

    if (!latest || new Date(provider.lastSampleAt).getTime() > new Date(latest).getTime()) {
      latest = provider.lastSampleAt;
    }
  }

  return latest;
}

function formatForecast(
  forecast: UsageForecast,
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string,
): string {
  switch (forecast.status) {
    case "available":
      if (forecast.hoursRemaining == null || forecast.hoursRemaining <= 0.01) {
        return t("widget.stats.forecast.now");
      }
      return t("widget.stats.forecast.available", {
        duration: formatDuration(forecast.hoursRemaining, t),
      });
    case "unlikelyBeforeReset":
      return t("widget.stats.forecast.unlikelyBeforeReset");
    case "notApplicable":
      return t("widget.stats.forecast.notApplicable");
    case "insufficientData":
    default:
      return t("widget.stats.forecast.insufficientData");
  }
}

function formatDuration(
  hours: number,
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string,
): string {
  if (hours >= 48) {
    return t("widget.stats.duration.days", { value: Math.round(hours / 24) });
  }

  if (hours >= 1) {
    return t("widget.stats.duration.hours", { value: Math.round(hours * 10) / 10 });
  }

  return t("widget.stats.duration.minutes", { value: Math.max(1, Math.round(hours * 60)) });
}
