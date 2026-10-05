"use client";

/* ── ช่อง "ลูกค้าอื่นที่ใช้ได้" ของกลิ่น/สูตร (ม-150 · มติผู้ใช้ 2026-10-05) ─────────────────────
   ⭐ ตัวเดียวทั้งสามที่: ฟอร์มสร้าง/แก้กลิ่น · ฟอร์มสร้าง/แก้สูตร · โมดัลของการ์ด "ลูกค้าที่ใช้ร่วม"
      — รายชื่อ + ปุ่มเอาออก + ช่องค้นหาเพิ่ม · เขียนสองชุดเมื่อไร ป้าย/ตัวกรองเจ้าของเลื่อนออกจากกัน
   · `value` = `[{ customerId, customerName }]` (เก็บชื่อไว้ด้วย — ลูกค้าที่ถูกลบจากทะเบียนแล้วยังต้องขึ้นชื่อเดิม)
   · ตัวเลือกตัดเจ้าของ (ใช้ได้อยู่แล้ว) และรายที่อยู่ในชุดแล้วออก
   · `emptyText={null}` = ชุดว่างไม่มีบรรทัดบอก (ฟอร์มสร้าง — ช่องค้นหาบอกอยู่แล้วว่าทำอะไร)
   ⚠️ เป็นแค่ของบนจอ — ด่านจริง (สิทธิ์ · ลูกค้ามีจริง · เลิกแชร์คนที่ใช้อยู่ = 409) อยู่ที่ server */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { customerSelectOptions } from "@/components/master/customerOption";
import { customerSnapshotName } from "@/lib/master/customerName";
import styles from "./registryForm.module.css";

export default function RegistryShareField({
  customers = [], ownerId = "", value = [], onChange, disabled = false, loading = false,
  emptyText = "ยังไม่ได้แชร์ให้ลูกค้ารายอื่น", ariaLabel = "เพิ่มลูกค้าที่ใช้ได้",
}) {
  const [pick, setPick] = useState("");

  const options = useMemo(() => {
    const taken = new Set([ownerId, ...value.map((d) => d.customerId)].filter(Boolean));
    return customerSelectOptions((customers || []).filter((c) => !taken.has(c.id)));
  }, [customers, value, ownerId]);

  const add = (customerId) => {
    if (!customerId) return;
    const c = (customers || []).find((x) => x.id === customerId);
    onChange([...value, { customerId, customerName: customerSnapshotName(c) || customerId }]);
    setPick("");
  };

  return (
    <>
      {value.length ? (
        <ul className={styles.shareList}>
          {value.map((d) => (
            <li key={d.customerId} className={styles.shareItem}>
              <span>{d.customerName || d.customerId}</span>
              <Button
                size="sm" variant="quiet" iconOnly icon={<X size={14} aria-hidden="true" />}
                aria-label={`เลิกแชร์ ${d.customerName || d.customerId}`}
                onClick={() => onChange(value.filter((x) => x.customerId !== d.customerId))}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
      ) : emptyText ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : null}
      <SearchableSelect
        value={pick}
        onChange={add}
        options={options}
        disabled={disabled || loading}
        placeholder={loading ? "กำลังโหลดรายชื่อลูกค้า…" : "ค้นหาลูกค้าเพื่อเพิ่ม"}
        emptyText="ไม่มีลูกค้าให้เพิ่มแล้ว"
        ariaLabel={ariaLabel}
      />
    </>
  );
}

/** แถวกลิ่น/สูตร → ค่าของช่องนี้ (ฟอร์มแก้ · โมดัลการ์ด)
 *  ⚠️ แถวที่ไม่ได้ติดรายชื่อแชร์มา (ไม่ผ่าน `attachShares`) คืน `null` ไม่ใช่ `[]` — payload ข้ามคีย์ให้
 *     ไม่งั้นกดบันทึกแก้ชื่อเฉย ๆ = ส่ง `[]` = เลิกแชร์ทุกรายเงียบ ๆ */
export function sharesToField(entity) {
  if (!Array.isArray(entity?.sharedCustomers)) return null;
  return entity.sharedCustomers.map((s) => ({ customerId: s.customerId, customerName: s.customerName }));
}
