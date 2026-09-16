export const formatPeso = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1_000_000) {
    return `\u20B1${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `\u20B1${(num / 1_000).toFixed(1)}K`;
  }
  return `\u20B1${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatCompact = (n) => {
  const num = Number(n || 0);
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
};
