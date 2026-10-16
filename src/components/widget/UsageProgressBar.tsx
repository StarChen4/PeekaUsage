import { getUsageColor } from "../../utils/formatters";
import { useI18n } from "../../i18n";

type UsageProgressBarProps = {
  percent: number | null;
  isUnlimited?: boolean;
};

export default function UsageProgressBar({ percent, isUnlimited = false }: UsageProgressBarProps) {
  const { t } = useI18n();
  const hasValue = !isUnlimited && percent != null && Number.isFinite(percent);
  const clampedPercent = hasValue ? Math.max(0, Math.min(100, percent)) : 0;
  const barColor = hasValue ? getUsageColor(clampedPercent) : "var(--color-text-muted)";
  const unavailableTitle = t(isUnlimited ? "widget.providerCard.unlimitedQuotaHint" : "widget.providerCard.percentageUnavailable");

  return (
    <div className="progress-container" title={hasValue ? undefined : unavailableTitle} aria-label={hasValue ? undefined : unavailableTitle}>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${clampedPercent}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <span className="progress-label" style={{ color: barColor }}>
        {isUnlimited ? "∞" : hasValue ? `${Math.round(clampedPercent)}%` : "—"}
      </span>
    </div>
  );
}
