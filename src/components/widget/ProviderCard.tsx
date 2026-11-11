import type { CSSProperties } from "react";
import { useI18n } from "../../i18n";
import type { ApiKeyUsageSummary, UsageSummary } from "../../types/provider";
import type { WidgetDisplayMode } from "../../types/settings";
import { calcUsagePercent, formatCurrency, languageToLocale } from "../../utils/formatters";
import ProviderIcon from "../common/ProviderIcon";
import RateLimitBadge from "./RateLimitBadge";
import SubscriptionBadge from "./SubscriptionBadge";
import UsageProgressBar from "./UsageProgressBar";

type ProviderCardProps = {
  provider: UsageSummary;
  displayMode?: WidgetDisplayMode;
  useCompactColorMarkers?: boolean;
  isRefreshing?: boolean;
  onRefresh: () => void;
};

export default function ProviderCard({
  provider,
  displayMode = "detailed",
  useCompactColorMarkers = false,
  isRefreshing = false,
  onRefresh,
}: ProviderCardProps) {
  const { t, language } = useI18n();
  const locale = languageToLocale(language);
  const hasSubscription = provider.subscriptions.length > 0;
  const hasApiUsage = provider.apiKeyUsages.length > 0;
  const hasMultipleApiKeys = provider.apiKeyUsages.length > 1;
  const compactApiItems = provider.apiKeyUsages.filter((item) => item.usage);
  const compactApiErrors = provider.apiKeyUsages.filter((item) => item.errorMessage);
  const compactSubscriptionErrors = provider.subscriptions.filter((item) => item.usage.status === "error" && item.usage.errorMessage);
  const compactVisibleSubscriptions = provider.subscriptions.filter((subscription) => {
    if (subscription.usage.status !== "success") {
      return false;
    }

    const extra = subscription.usage.extraUsage;
    const hasExtra = !!extra?.isEnabled && extra.monthlyLimitUsd !== null && extra.utilization != null;
    return subscription.usage.windows.length > 0 || hasExtra;
  });
  const useSubscriptionColorMarkers = useCompactColorMarkers && compactVisibleSubscriptions.length > 1;
  const useApiColorMarkers = useCompactColorMarkers && compactApiItems.length > 1;

  function usagePercent(item: ApiKeyUsageSummary) {
    const usage = item.usage;
    if (!usage) {
      return null;
    }

    // 无限额令牌改看钱包：账户已用占钱包总额（已用 + 余额）的比例。
    if (usage.isUnlimited) {
      const walletTotal = walletTotalOf(item);
      return walletTotal ? calcUsagePercent(usage.accountUsed ?? 0, walletTotal) : null;
    }

    if (usage.totalBudget == null || usage.totalBudget <= 0) {
      return null;
    }

    return calcUsagePercent(usage.totalUsed, usage.totalBudget);
  }

  function walletTotalOf(item: ApiKeyUsageSummary) {
    const usage = item.usage;
    if (usage?.accountRemaining == null || usage.accountUsed == null) {
      return null;
    }
    const total = usage.accountRemaining + usage.accountUsed;
    return total > 0 ? total : null;
  }

  /** 进度条是否显示无穷：只有无限额且没有钱包数据时才没有可算的比例。 */
  function showsInfinity(item: ApiKeyUsageSummary) {
    return !!item.usage?.isUnlimited && walletTotalOf(item) == null;
  }

  function formatTime(value: string) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function limitedText(fetchedAt: string | null | undefined, limitedUntil: string | null | undefined) {
    if (!limitedUntil) {
      return null;
    }
    return {
      label: t("widget.providerCard.limited", { time: fetchedAt ? formatTime(fetchedAt) : "—" }),
      title: t("widget.providerCard.limitedHint", { time: formatTime(limitedUntil) }),
    };
  }

  function expiryText(expiresAt: string | null | undefined) {
    if (!expiresAt) {
      return null;
    }
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(diffMs)) {
      return null;
    }
    if (diffMs <= 0) {
      return { label: t("widget.providerCard.expired"), tone: "danger" };
    }
    const days = Math.ceil(diffMs / 86_400_000);
    if (days <= 7) {
      return { label: t("widget.providerCard.expiresSoon", { days }), tone: "warning" };
    }
    const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(expiresAt));
    return { label: t("widget.providerCard.expiresAt", { date }), tone: "muted" };
  }

  return (
    <div className={`provider-card${provider.status === "error" ? " is-error" : ""}${displayMode === "compact" ? " is-compact" : ""}`}>
      <div className="card-header">
        <div className="provider-title">
          <ProviderIcon providerId={provider.providerId} size={displayMode === "compact" ? 16 : 20} />
          <span className="provider-name">{provider.displayName}</span>
        </div>
        <button
          className={`refresh-btn${isRefreshing ? " is-spinning" : ""}${displayMode === "compact" ? " is-compact" : ""}`}
          disabled={isRefreshing}
          type="button"
          title={t("widget.actions.refreshProvider")}
          aria-label={t("widget.actions.refreshProvider")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
            <path
              d="M20 5.5v5h-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </div>

      {displayMode === "compact" ? (
        <>
          {(compactVisibleSubscriptions.length > 0 || compactApiItems.length > 0) ? (
            <div className="compact-metrics">
              {provider.subscriptions.map((subscription) => {
                if (subscription.usage.status !== "success") {
                  return null;
                }

                const extra = subscription.usage.extraUsage;
                const hasExtra = !!extra?.isEnabled && extra.monthlyLimitUsd !== null && extra.utilization != null;
                const hasWindows = subscription.usage.windows.length > 0;

                if (!hasWindows && !hasExtra) {
                  return null;
                }

                return (
                  <div
                    key={subscription.subscriptionId}
                    className={`compact-subscription-group${useSubscriptionColorMarkers ? " has-marker" : ""}`}
                    style={{ "--compact-marker-color": subscription.color } as CSSProperties}
                  >
                    {!useSubscriptionColorMarkers && (
                      <div className="compact-subscription-title" title={subscription.subscriptionName}>
                        {subscription.subscriptionName}
                      </div>
                    )}
                    {subscription.usage.windows.map((window, index) => (
                      <div key={`${subscription.subscriptionId}-${window.label}-${index}`} className="compact-metric-row">
                        <span className="compact-metric-label" title={window.label}>
                          {formatCompactSubscriptionWindowLabel(window.label, t("widget.providerCard.subscriptionShort"))}
                        </span>
                        <div className="compact-metric-bar">
                          <UsageProgressBar percent={window.utilization} />
                        </div>
                      </div>
                    ))}
                    {hasExtra && (
                      <div className="compact-metric-row">
                        <span className="compact-metric-label" title={t("widget.subscription.extraUsageLabel")}>
                          {formatCompactSubscriptionWindowLabel(t("widget.subscription.extraUsageLabel"), t("widget.providerCard.subscriptionShort"))}
                        </span>
                        <div className="compact-metric-bar">
                          <UsageProgressBar percent={extra!.utilization!} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {compactApiItems.map((item) => {
                const limited = limitedText(item.fetchedAt, item.limitedUntil);
                const titleParts = [
                  item.keyName,
                  t(`widget.providerCard.usageScopes.${item.usage?.scope ?? "key"}`),
                  item.usage?.isUnlimited && walletTotalOf(item) != null ? t("widget.providerCard.wallet") : null,
                  limited?.label,
                ].filter(Boolean);
                return (
                  <div
                    key={item.keyId}
                    className={`compact-metric-row${useApiColorMarkers ? " has-marker" : ""}${limited ? " is-limited" : ""}`}
                    style={useApiColorMarkers ? ({ "--compact-marker-color": item.color } as CSSProperties) : undefined}
                    title={limited?.title}
                  >
                    {useApiColorMarkers ? (
                      <span className="compact-metric-marker" aria-hidden="true" />
                    ) : (
                      <span className="compact-metric-label" title={titleParts.join(" · ")}>
                        {formatCompactApiLabel(item.keyName, t("widget.providerCard.apiShort"))}
                      </span>
                    )}
                    <div className="compact-metric-bar">
                      <UsageProgressBar percent={usagePercent(item)} isUnlimited={showsInfinity(item)} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {compactSubscriptionErrors.map((item) => (
            <div key={`${item.subscriptionId}-error`} className="compact-error-msg">
              {item.subscriptionName}: {item.usage.errorMessage}
            </div>
          ))}

          {compactApiErrors.map((item) => (
            <div key={`${item.keyId}-error`} className="compact-error-msg">
              {hasMultipleApiKeys ? `${item.keyName}: ${item.errorMessage}` : item.errorMessage}
            </div>
          ))}

          {provider.status === "error" && !hasSubscription && !hasApiUsage && provider.errorMessage && (
            <div className="compact-error-msg">{provider.errorMessage}</div>
          )}
        </>
      ) : (
        <>
          {provider.subscriptions.map((subscription) => (
            <SubscriptionBadge key={subscription.subscriptionId} subscription={subscription} />
          ))}

          {hasApiUsage && (
            <div className="api-section">
              <div className="api-header-block">
                {hasSubscription && <div className="api-label">{t("widget.providerCard.apiLabel")}</div>}
                {provider.usage && (
                  <div className="api-total">
                    <span className="api-total-label">
                      {hasMultipleApiKeys ? t("widget.providerCard.total") : t("widget.providerCard.current")}
                    </span>
                    <span className="usage-amount">
                      {formatCurrency(provider.usage.totalUsed, provider.usage.currency)}
                    </span>
                    {provider.usage.remaining != null && (
                      <span className="balance-info">
                        {t("widget.providerCard.balance")}: {formatCurrency(provider.usage.remaining, provider.usage.currency)}
                      </span>
                    )}
                    {hasMultipleApiKeys && provider.usage.accountRemaining != null && (
                      <span className="balance-info">
                        {t("widget.providerCard.wallet")}: {formatCurrency(provider.usage.accountRemaining, provider.usage.currency)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {provider.apiKeyUsages.map((item) => (
                <div
                  key={item.keyId}
                  className={`api-key-usage${item.status === "error" ? " is-error" : ""}`}
                >
                  <div className="api-key-header">
                    <span className="api-key-name">{item.keyName}</span>
                    {item.usage && (
                      <span className="api-key-amount">
                        {formatCurrency(item.usage.totalUsed, item.usage.currency)}
                      </span>
                    )}
                  </div>

                  {item.usage && (
                    <div className="api-key-meta">
                      <span>{t(`widget.providerCard.usageScopes.${item.usage.scope ?? "key"}`)}</span>
                      {item.usage.isUnlimited && (
                        <span title={t("widget.providerCard.unlimitedQuotaHint")}>{t("widget.providerCard.unlimitedQuota")}</span>
                      )}
                      {item.usage.remaining != null && (
                        <span className="balance-info">
                          {t("widget.providerCard.balance")}: {formatCurrency(item.usage.remaining, item.usage.currency)}
                        </span>
                      )}
                    </div>
                  )}

                  {item.usage?.accountRemaining != null && (
                    <div className="api-key-meta">
                      <span className="balance-info">
                        {t("widget.providerCard.wallet")}: {formatCurrency(item.usage.accountRemaining, item.usage.currency)}
                      </span>
                      {item.usage.accountUsed != null && (
                        <span className="balance-info">
                          {t("widget.providerCard.walletUsed")}: {formatCurrency(item.usage.accountUsed, item.usage.currency)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 只有可用额度被钱包压低时才单独显示，避免和余额重复。 */}
                  {item.usage?.effectiveRemaining != null
                    && item.usage.remaining != null
                    && item.usage.effectiveRemaining < item.usage.remaining && (
                    <div className="api-key-meta">
                      <span className="balance-info is-warning" title={t("widget.providerCard.availableHint")}>
                        {t("widget.providerCard.available")}: {formatCurrency(item.usage.effectiveRemaining, item.usage.currency)}
                      </span>
                    </div>
                  )}

                  {item.usage?.isUnlimited && item.usage.accountRemaining == null && provider.providerId === "newapi" && (
                    <div className="api-key-hint">{t("widget.providerCard.walletHint")}</div>
                  )}

                  {(item.usage?.totalBudget || item.usage?.isUnlimited) && (
                    <UsageProgressBar percent={usagePercent(item)} isUnlimited={showsInfinity(item)} />
                  )}

                  {(() => {
                    const expiry = expiryText(item.usage?.expiresAt);
                    const models = item.usage?.modelLimits;
                    if (!expiry && !models?.length) {
                      return null;
                    }
                    return (
                      <div className="api-key-tags">
                        {expiry && <span className={`api-key-tag is-${expiry.tone}`} title={item.usage?.expiresAt ?? undefined}>{expiry.label}</span>}
                        {models && models.length > 0 && (
                          <span className="api-key-tag is-muted" title={models.join("\n")}>
                            {t("widget.providerCard.modelLimits", { count: models.length })}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const limited = limitedText(item.fetchedAt, item.limitedUntil);
                    return limited ? <div className="api-key-hint is-warning" title={limited.title}>{limited.label}</div> : null;
                  })()}

                  {item.errorMessage && (
                    <div className="api-key-error">{item.errorMessage}</div>
                  )}

                  {item.rateLimit && provider.apiKeyUsages.length === 1 && (
                    <RateLimitBadge rateLimit={item.rateLimit} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {displayMode !== "compact" && provider.status === "error" && !hasSubscription && !hasApiUsage && (
        <div className="error-msg">{provider.errorMessage}</div>
      )}
    </div>
  );
}

function formatCompactSubscriptionWindowLabel(label: string, fallback: string): string {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return fallback;
  }

  return trimmedLabel;
}

function formatCompactApiLabel(keyName: string, apiShort: string): string {
  const trimmed = keyName.trim();
  return trimmed || apiShort;
}
