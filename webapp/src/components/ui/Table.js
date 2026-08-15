import { ChevronDown, ChevronRight } from "lucide-react";
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
  // ⭐ `cells="stacked"` = ตารางที่เซลล์ซ้อนสองบรรทัด ⇒ ชิดบนทั้งแถว
  // (กฎ 5 · UI_DESIGN_SYSTEM.md §ป้ายในตาราง) — ค่าตั้งต้น `middle` ถูกสำหรับ
  // แถวบรรทัดเดียว แต่พอมีเซลล์สองบรรทัดปนบรรทัดเดียว บรรทัดแรกของแต่ละเซลล์
  // จะไม่อยู่ระดับเดียวกัน ⇒ อ่านข้ามคอลัมน์ไม่เป็นแนว
  // ⚠️ เป็น prop ของ **ตาราง** ไม่ใช่คลาสที่หน้าเขียนเอง — กฎอยู่ที่ Table.module.css
  // ที่เดียว ไม่งั้นแต่ละหน้าต้องสู้ specificity กับ `.scroll[data-family] td` เอง
  cells = "default",
  minWidth,
  className = "",
  ...props
}) {
  return (
    <div
      className={`${styles.scroll} ${className}`.trim()}
      data-family={family}
      data-surface={surface}
      data-cells={cells}
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

/* ── หัวกลุ่มในตาราง (โหมด "จัดกลุ่ม" บน toolbar · มติผู้ใช้ 2026-08-15) ──────
   ⭐ **markup ชุดเดียวของทั้งเว็บ** — ทุกหน้าที่มีปุ่มจัดกลุ่มเรียกตัวนี้ ไม่เขียน
   `<tr class="group-row">` เอง · สไตล์อยู่ที่ `.ui-group-row` ใน globals.css
   ⚠️ ต้องส่ง `colSpan` เท่าจำนวนคอลัมน์จริงของตาราง ไม่งั้นหัวกลุ่มไม่เต็มแถว
   props: label = ชื่อกลุ่ม · sub = บรรทัดรอง (รหัสลูกค้า/ทีม) · badge = "n ใบ"
          total = ยอดรวมชิดขวา (ส่งเป็นข้อความที่ format แล้ว) */
export function TableGroupRow({ colSpan, label, sub, badge, total, totalTitle, collapsed, onToggle }) {
  return (
    <tr className="ui-group-row">
      <td colSpan={colSpan}>
        <button type="button" onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed
            ? <ChevronRight size={15} aria-hidden="true" />
            : <ChevronDown size={15} aria-hidden="true" />}
          <strong>{label}</strong>
          {sub ? <span className="ar-code">{sub}</span> : null}
          {badge ? <span className="ui-badge">{badge}</span> : null}
          {total ? <span className="ui-group-total mono" title={totalTitle}>{total}</span> : null}
        </button>
      </td>
    </tr>
  );
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
