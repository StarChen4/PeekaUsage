import { useI18n } from "../../i18n";
import type { ExtraUsage, SubscriptionUsage } from "../../types/provider";
import UsageProgressBar from "./UsageProgressBar";

type SubscriptionBadgeProps = {
  subscription: SubscriptionUsage;
};

export default function SubscriptionBadge({ subscription }: SubscriptionBadgeProps) {
  const { t } = useI18n();
  const planLabel = subscription.planName ?? t("widget.subscription.fallbackPlan");

  function formatResetTime(isoStr: string): string {
    const reset = new Date(isoStr);
    const now = Date.now();
    const diffMs = reset.getTime() - now;

    if (diffMs <= 0) {
      return t("widget.subscription.resetSoon");
    }

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) {
      return t("widget.subscription.resetInMinutes", { count: diffMin });
    }

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return t("widget.subscription.resetInHours", { count: diffHr });
    }

    const diffDay = Math.floor(diffHr / 24);
    return t("widget.subscription.resetInDays", { count: diffDay });
  }

  function renderExtraUsage(extra: ExtraUsage) {
    if (!extra.isEnabled) return null;

    const label = t("widget.subscription.extraUsageLabel");
    const resetText = extra.resetsAt
      ? formatResetTime(extra.resetsAt)
      : t("widget.subscription.extraUsageResetsMonthly");

    if (extra.monthlyLimitUsd === null) {
      return (
        <div className="sub-window sub-window--extra">
          <div className="window-header">
            <span className="window-label">{label}</span>
            <span className="window-reset">{t("widget.subscription.extraUsageUnlimited")}</span>
          </div>
        </div>
      );
    }

    const utilization = extra.utilization ?? 0;
    const usedStr = extra.usedUsd != null ? extra.usedUsd.toFixed(2) : "0.00";
    const limitStr = extra.monthlyLimitUsd.toFixed(2);

    return (
      <div className="sub-window sub-window--extra">
        <div className="window-header">
          <span className="window-label">{label}</span>
          <span className="window-reset" title={extra.resetsAt ?? undefined}>
            {resetText}
          </span>
        </div>
        <UsageProgressBar percent={utilization} />
        <div className="extra-usage-spent">
          {t("widget.subscription.extraUsageSpent", { used: usedStr, limit: limitStr })}
        </div>
      </div>
    );
  }

  return (
    <div className="subscription-section">
      <div className="sub-header">
        <span className="sub-label">{planLabel}</span>
        {subscription.status === "error" && (
          <span className="sub-error" title={subscription.errorMessage ?? ""}>
            ⚠
          </span>
        )}
      </div>

      {subscription.status === "success" && subscription.windows.length > 0 && (
        <div className="sub-windows">
          {subscription.windows.map((win, index) => (
            <div key={`${win.label}-${index}`} className="sub-window">
              <div className="window-header">
                <span className="window-label">{win.label}</span>
                {win.resetsAt && (
                  <span className="window-reset" title={win.resetsAt}>
                    {formatResetTime(win.resetsAt)}
                  </span>
                )}
              </div>
              <UsageProgressBar percent={win.utilization} />
            </div>
          ))}
          {subscription.extraUsage && renderExtraUsage(subscription.extraUsage)}
        </div>
      )}

      {subscription.status === "error" && (
        <div className="sub-error-msg">{subscription.errorMessage}</div>
      )}
    </div>
  );
}
