import { useI18n } from "../../i18n";
import type { ExtraUsage, SubscriptionUsageSummary } from "../../types/provider";
import UsageProgressBar from "./UsageProgressBar";

type SubscriptionBadgeProps = {
  subscription: SubscriptionUsageSummary;
};

export default function SubscriptionBadge({ subscription }: SubscriptionBadgeProps) {
  const { t } = useI18n();
  const usage = subscription.usage;
  const planLabel = usage.planName ?? t("widget.subscription.fallbackPlan");

  function formatResetTime(isoStr: string): string {
    const reset = new Date(isoStr);
    const now = Date.now();
    const diffMs = reset.getTime() - now;
    if (diffMs <= 0) return t("widget.subscription.resetSoon");
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return t("widget.subscription.resetInMinutes", { count: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return t("widget.subscription.resetInHours", { count: diffHr });
    return t("widget.subscription.resetInDays", { count: Math.floor(diffHr / 24) });
  }

  function renderExtraUsage(extra: ExtraUsage) {
    if (!extra.isEnabled) return null;
    const label = t("widget.subscription.extraUsageLabel");
    const resetText = extra.resetsAt ? formatResetTime(extra.resetsAt) : t("widget.subscription.extraUsageResetsMonthly");
    if (extra.monthlyLimitUsd === null) {
      return <div className="sub-window sub-window--extra"><div className="window-header"><span className="window-label">{label}</span><span className="window-reset">{t("widget.subscription.extraUsageUnlimited")}</span></div></div>;
    }
    const utilization = extra.utilization ?? 0;
    const usedStr = extra.usedUsd != null ? extra.usedUsd.toFixed(2) : "0.00";
    const limitStr = extra.monthlyLimitUsd.toFixed(2);
    return (
      <div className="sub-window sub-window--extra">
        <div className="window-header"><span className="window-label">{label}</span><span className="window-reset" title={extra.resetsAt ?? undefined}>{resetText}</span></div>
        <UsageProgressBar percent={utilization} />
        <div className="extra-usage-spent">{t("widget.subscription.extraUsageSpent", { used: usedStr, limit: limitStr })}</div>
      </div>
    );
  }

  return (
    <div className="subscription-section">
      <div className="sub-header">
        <span className="sub-label">{subscription.subscriptionName}</span>
        {usage.status === "error" && <span className="sub-error" title={usage.errorMessage ?? ""}>!</span>}
      </div>
      <div className="sub-plan-label">{planLabel}</div>
      {usage.status === "success" && usage.windows.length > 0 && (
        <div className="sub-windows">
          {usage.windows.map((win, index) => (
            <div key={`${subscription.subscriptionId}-${win.label}-${index}`} className="sub-window">
              <div className="window-header">
                <span className="window-label">{win.label}</span>
                {win.resetsAt && <span className="window-reset" title={win.resetsAt}>{formatResetTime(win.resetsAt)}</span>}
              </div>
              <UsageProgressBar percent={win.utilization} />
            </div>
          ))}
          {usage.extraUsage && renderExtraUsage(usage.extraUsage)}
        </div>
      )}
      {usage.status === "error" && <div className="sub-error-msg">{usage.errorMessage}</div>}
    </div>
  );
}
