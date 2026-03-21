import { getUsageColor } from "../../utils/formatters";

type UsageProgressBarProps = {
  percent: number;
};

export default function UsageProgressBar({ percent }: UsageProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const barColor = getUsageColor(clampedPercent);

  return (
    <div className="progress-container">
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
        {Math.round(clampedPercent)}%
      </span>
    </div>
  );
}
