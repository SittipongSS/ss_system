"use client";
// ── บาร์ "ต้องทำอะไรต่อ" ของทั้งใบ — บนสุดของเนื้อ (งวด 1 ของรอบรื้อ) ─────
//
// ⭐ **ที่เดียวของปุ่มระดับใบ** — ก่อนหน้านี้ปุ่มกระจายสามชั้นตามโครงของหัวข้อ:
// การ์ด control ขวา (หัวข้อธง Control Panel) · หัวใบ (โครงเดิม) · แถบท้ายเธรด
// (หัวข้อที่ไม่มีแถว) ⇒ คนที่สลับไปมาระหว่างหัวข้อต้องเรียนรู้สามที่
//
// ⭐ **ประโยคเดียว + ปุ่มเดียว** — ประโยคมาจากรางของใบ (`requestRailSteps`) ก้อน
// เดียวกับที่การ์ดขวาวาด ⇒ บาร์กับรางขัดกันไม่ได้เชิงโครงสร้าง
//
// ⚠️ **ย้าย ไม่ก๊อป** (กติกาเดิมของ ม-49/ม-57/ม-94 ที่ยังใช้อยู่ แค่เปลี่ยนที่) —
// การ์ดขวาเลิกรับปุ่ม · หัวใบเลิกรับปุ่ม · แถบท้ายเธรดเหลือแต่ก้าว **รายแถว**
//
// ⚠️ ไม่มีกติกาปุ่มของตัวเอง — รับ `primaryAction`/`menuItems` ที่เปลือกประกอบมาแล้ว
// ผ่าน `normalizeDocumentControlActions` ตัวเดิม (`visible: false` ถูกตัดทิ้งก่อนถึงที่นี่)
import { ActionButton } from "@/components/ui/ActionButtons";
import RowActionMenu from "@/components/ui/RowActionMenu";
import styles from "./requestActionBar.module.css";

export default function RequestActionBar({
  title,
  hint = null,
  primaryAction = null,
  menuItems = [],
  busy = false,
  docNo = "",
}) {
  // ไม่มีอะไรจะบอกและไม่มีอะไรให้กด = ไม่ต้องมีบาร์ (ดีกว่ากล่องเปล่า)
  if (!title && !primaryAction && !menuItems.length) return null;

  return (
    <section
      className={styles.bar}
      /* ⚠️ **ไม่ใช่ตาเรา ≠ ไม่มีบาร์** — ประโยคยังต้องบอกว่ารอใครอยู่ แค่ไม่มีปุ่มหลัก
         และโทนขอบเบาลงเพื่อไม่ให้แย่งสายตากับใบที่ถึงตาเราจริง ๆ */
      data-idle={primaryAction ? undefined : "1"}
      aria-label="ก้าวถัดไปของคำร้องนี้"
    >
      <div className={styles.what}>
        <strong>{title}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={styles.actions}>
        {primaryAction ? (
          <ActionButton
            kind={primaryAction.kind}
            label={primaryAction.label}
            icon={primaryAction.icon}
            variant="filled"
            disabled={busy || primaryAction.disabled}
            title={primaryAction.disabledReason || primaryAction.title}
            onClick={primaryAction.onClick}
          />
        ) : null}
        {menuItems.length ? (
          <RowActionMenu
            label={`การจัดการของ ${docNo || "คำร้อง"}`}
            items={menuItems}
            busy={busy}
          />
        ) : null}
      </div>
    </section>
  );
}
