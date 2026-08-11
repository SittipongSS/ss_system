import styles from "./Badge.module.css";
import { fmtNumber } from "@/lib/format";

export default function CountBadge({
  count,
  tone = "neutral",
  max,
  label = "จำนวนรายการ",
  className = "",
}) {
  const numericCount = Number(count) || 0;
  const visibleCount = Number.isFinite(max) && numericCount > max ? `${max}+` : fmtNumber(numericCount);
  return (
    <span
      className={`${styles.base} ${styles.count} ${className}`.trim()}
      data-tone={tone}
      aria-label={`${label} ${fmtNumber(numericCount)}`}
    >
      {visibleCount}
    </span>
  );
}
