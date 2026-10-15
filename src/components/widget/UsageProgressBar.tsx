import { getUsageColor } from "../../utils/formatters";
import { useI18n } from "../../i18n";

type UsageProgressBarProps = {
  percent: number | null;
};

export default function UsageProgressBar({ percent }: UsageProgressBarProps) {
  const { t } = useI18n();
  const hasValue = percent != null && Number.isFinite(percent);
  const clampedPercent = hasValue ? Math.max(0, Math.min(100, percent)) : 0;
  const barColor = hasValue ? getUsageColor(clampedPercent) : "var(--text-muted)";

  return (
    <div className="progress-container" title={hasValue ? undefined : t("widget.providerCard.percentageUnavailable")}>
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
        {hasValue ? `${Math.round(clampedPercent)}%` : "—"}
      </span>
    </div>
  );
}
