import styles from "./Badge.module.css";

export default function CountBadge({
  count,
  tone = "neutral",
  max,
  label = "จำนวนรายการ",
  className = "",
}) {
  const numericCount = Number(count) || 0;
  const visibleCount = Number.isFinite(max) && numericCount > max ? `${max}+` : numericCount.toLocaleString("th-TH");
  return (
    <span
      className={`${styles.base} ${styles.count} ${className}`.trim()}
      data-tone={tone}
      aria-label={`${label} ${numericCount.toLocaleString("th-TH")}`}
    >
      {visibleCount}
    </span>
  );
}
