import styles from "./Badge.module.css";

const SIZE_CLASS = {
  sm: styles.small,
  md: "",
  lg: styles.large,
};

export default function StatusBadge({
  label,
  children,
  tone = "neutral",
  icon: Icon,
  iconSize = 13,
  showIcon = true,
  dot = false,
  size = "md",
  className = "",
  title,
}) {
  return (
    <span
      className={[
        styles.base,
        SIZE_CLASS[size] || "",
        dot ? styles.dot : "",
        className,
      ].filter(Boolean).join(" ")}
      data-tone={tone}
      title={title}
    >
      {showIcon && Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}
      <span className={styles.label}>{label ?? children}</span>
    </span>
  );
}
