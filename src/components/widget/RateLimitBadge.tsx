import type { RateLimitData } from "../../types/provider";
import { formatNumber } from "../../utils/formatters";

type RateLimitBadgeProps = {
  rateLimit: RateLimitData;
};

export default function RateLimitBadge({ rateLimit }: RateLimitBadgeProps) {
  return (
    <div className="rate-limit-badges">
      {rateLimit.requestsPerMinute != null && rateLimit.requestsPerMinuteLimit != null && (
        <span className="badge">
          RPM: {rateLimit.requestsPerMinute}/{rateLimit.requestsPerMinuteLimit}
        </span>
      )}
      {rateLimit.tokensPerMinute != null && rateLimit.tokensPerMinuteLimit != null && (
        <span className="badge">
          TPM: {formatNumber(rateLimit.tokensPerMinute)}/{formatNumber(rateLimit.tokensPerMinuteLimit)}
        </span>
      )}
    </div>
  );
}
