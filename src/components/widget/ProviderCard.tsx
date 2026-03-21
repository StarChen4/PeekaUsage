import { useI18n } from "../../i18n";
import type { ApiKeyUsageSummary, UsageSummary } from "../../types/provider";
import { calcUsagePercent, formatCurrency } from "../../utils/formatters";
import ProviderIcon from "../common/ProviderIcon";
import RateLimitBadge from "./RateLimitBadge";
import SubscriptionBadge from "./SubscriptionBadge";
import UsageProgressBar from "./UsageProgressBar";

type ProviderCardProps = {
  provider: UsageSummary;
  isRefreshing?: boolean;
  onRefresh: () => void;
};

export default function ProviderCard({
  provider,
  isRefreshing = false,
  onRefresh,
}: ProviderCardProps) {
  const { t } = useI18n();
  const hasSubscription = !!provider.subscription;
  const hasApiUsage = provider.apiKeyUsages.length > 0;
  const hasMultipleApiKeys = provider.apiKeyUsages.length > 1;

  function usagePercent(item: ApiKeyUsageSummary) {
    if (!item.usage) {
      return 0;
    }

    return calcUsagePercent(item.usage.totalUsed, item.usage.totalBudget);
  }

  return (
    <div className={`provider-card${provider.status === "error" ? " is-error" : ""}`}>
      <div className="card-header">
        <div className="provider-title">
          <ProviderIcon providerId={provider.providerId} size={20} />
          <span className="provider-name">{provider.displayName}</span>
        </div>
        <button
          className={`refresh-btn${isRefreshing ? " is-spinning" : ""}`}
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

      {hasSubscription && provider.subscription && (
        <SubscriptionBadge subscription={provider.subscription} />
      )}

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
                  {item.usage.remaining != null && (
                    <span className="balance-info">
                      {t("widget.providerCard.balance")}: {formatCurrency(item.usage.remaining, item.usage.currency)}
                    </span>
                  )}
                </div>
              )}

              {item.usage?.totalBudget && (
                <UsageProgressBar percent={usagePercent(item)} />
              )}

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

      {provider.status === "error" && !hasSubscription && !hasApiUsage && (
        <div className="error-msg">{provider.errorMessage}</div>
      )}
    </div>
  );
}
