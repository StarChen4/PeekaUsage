/** 格式化货币 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  if (currency === "USD") {
    return `$${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${currency}`;
}

/** 格式化百分比 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** 计算使用百分比 */
export function calcUsagePercent(used: number, budget: number | null): number {
  if (!budget || budget <= 0) return 0;
  return Math.min(100, (used / budget) * 100);
}

/** 根据百分比获取颜色等级 */
export function getUsageColor(percent: number): string {
  if (percent < 60) return "var(--color-success)";
  if (percent < 85) return "var(--color-warning)";
  return "var(--color-danger)";
}

/** 格式化数字（带 k/M 后缀） */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

/** 格式化时间（相对时间） */
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}
