import { isValidElement } from "react";
import styles from "./ChartCard.module.css";

/* `title` = หัวกำกับของชุดสี — จำเป็นเมื่อการ์ดหนึ่งมีคำอธิบายมากกว่าหนึ่งชุด
   🐞 การ์ด "ช่องทางที่ลีดเข้ามา" เคยต่อสองชุดเป็นแถวเดียว (กลุ่มช่องทางของวงกลม +
   สถานะของแท่ง) แล้วสีชนกันพอดี: `--chart-cat-1` กับ `--blue` เป็น #466990 ตัวเดียวกัน
   และ `--chart-cat-3` กับ `--green` เป็น #357558 ⇒ สีเดียวกันมีสองความหมายในแถวเดียว */
export function ChartLegend({ items = [], className = "", title = "" }) {
  return (
    <div className={`${styles.legend} ${className}`.trim()} aria-label={title || "คำอธิบายชุดข้อมูล"}>
      {title ? <span className={styles.legendTitle}>{title}</span> : null}
      {items.map((item) => (
        <span key={item.key || item.label} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ "--legend-color": item.color }} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTooltip({
  active,
  payload = [],
  label,
  labelFormatter,
  valueFormatter,
}) {
  if (!active || !payload.length) return null;
  return (
    <div className={styles.tooltip}>
      {label !== undefined ? <strong>{labelFormatter ? labelFormatter(label) : label}</strong> : null}
      {payload.map((entry, index) => (
        <div className={styles.tooltipRow} key={`${entry.dataKey || entry.name}-${index}`}>
          <span className={styles.tooltipLabel}>
            <span className={styles.legendSwatch} style={{ "--legend-color": entry.color }} aria-hidden="true" />
            {entry.name}
          </span>
          <b>{valueFormatter ? valueFormatter(entry.value, entry.name, entry) : entry.value}</b>
        </div>
      ))}
    </div>
  );
}

export function ChartEmptyState({ children = "ยังไม่มีข้อมูลสำหรับกราฟ" }) {
  return <div className={styles.empty}>{children}</div>;
}

export function ChartCanvas({ children, className = "", ...props }) {
  return (
    <div className={`${styles.canvas} ${className}`.trim()} data-chart-canvas {...props}>
      {children}
    </div>
  );
}

export function ChartSummary({ items = [] }) {
  return (
    <div className={styles.summary}>
      {items.map((item) => (
        <div key={item.key || item.label}>
          <small>{item.label}</small>
          <strong>{item.value ?? "-"}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ChartCard({
  icon: Icon,
  title,
  description,
  legend,
  actions,
  summary,
  minHeight = 260,
  className = "",
  bodyClassName = "",
  children,
}) {
  return (
    <section className={`${styles.card} ${className}`.trim()} style={{ "--chart-min-height": `${minHeight}px` }}>
      {(title || description || legend || actions) ? (
        <header className={styles.header}>
          <div className={styles.title}>
            {Icon ? (isValidElement(Icon) ? Icon : <Icon size={17} aria-hidden="true" />) : null}
            <div>
              {title ? <h2>{title}</h2> : null}
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          {(legend || actions) ? <div className={styles.headerAside}>{legend}{actions}</div> : null}
        </header>
      ) : null}
      <div className={`${styles.body} ${bodyClassName}`.trim()}>{children}</div>
      {summary}
    </section>
  );
}
