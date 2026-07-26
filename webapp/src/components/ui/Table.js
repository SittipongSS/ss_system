import styles from "./Table.module.css";

export function TableToolbar({ children, className = "", ...props }) {
  return <div className={`${styles.toolbar} ${className}`.trim()} {...props}>{children}</div>;
}

/* surface = "auto"     → ตัวมันเองเป็นพื้นข้อมูล (พื้นการ์ด + ขอบ + มุมมน + เงา)
   surface = "embedded" → อยู่ในการ์ดอยู่แล้ว ไม่ต้องมีกรอบซ้อน

   ค่าเริ่มต้นเป็น "auto" เพราะครึ่งหนึ่งของตารางในระบบ (46 จุด) วาง TableScroll เปล่า ๆ
   ไม่มีการ์ดครอบ ตารางเลยลอยอยู่บนพื้นหน้าไม่มีพื้นรอง — ผู้ใช้รายงานว่า "พื้นตารางหายไป"
   ที่หน้าขอราคาผลิตและหน้าวัสดุ (2026-07-27) จุดที่มีการ์ดเก่าครอบอยู่แล้วส่ง embedded */
export function TableScroll({
  children,
  family = "list",
  surface = "auto",
  minWidth,
  className = "",
  ...props
}) {
  return (
    <div
      className={`${styles.scroll} ${className}`.trim()}
      data-family={family}
      data-surface={surface}
      style={minWidth ? { "--table-min-width": `${minWidth}px` } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export function TableEmpty({
  title = "ยังไม่มีรายการ",
  description,
  action,
  colSpan,
}) {
  const content = (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
  return colSpan ? <tr><td colSpan={colSpan}>{content}</td></tr> : content;
}

export function TableShell({
  title,
  description,
  actions,
  toolbar,
  footer,
  family = "list",
  minWidth,
  className = "",
  children,
}) {
  return (
    <section className={`${styles.shell} ${className}`.trim()} data-table-family={family}>
      {(title || description || actions) ? (
        <header className={styles.header}>
          <div className={styles.heading}>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {toolbar ? <TableToolbar>{toolbar}</TableToolbar> : null}
      <TableScroll family={family} surface="embedded" minWidth={minWidth}>{children}</TableScroll>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export default TableShell;
