"use client";
// ── ช่อง ② "แพ็คเกจ FG" ของบรรทัดพิมพ์เองที่ตอบว่าเป็นงานบริการ (mig 0392 · PR-A · อยู่ในตาราง ServiceSetupGrid ตั้งแต่ 01/10) ──
//
// ⭐ ตัวเลือก = FG หมวด 02-001 ที่อนุมัติแล้วและยังใช้งาน ของลูกค้าในใบ **และนิติบุคคลเดียวกัน** (ก้อน GET `fgOptions`)
//   ตัวที่เป็นของใบลูกค้าอื่นในนิติบุคคลเดียวกันพกป้าย "ของ AR-xxxx" (ร่องรอยเดียวว่าหยิบข้ามใบมา)
// ⭐ ลูกค้ายังไม่มีแพ็คเกจเลย = บอกทางไปสร้าง (ฐานข้อมูลสินค้า) ไม่ใช่ดรอปดาวน์ว่าง ๆ
// ⚠️ แพ็คเกจที่บรรทัดถืออยู่แต่ไม่อยู่ในตัวเลือกแล้ว (ปิดใช้งาน · ของนิติบุคคลอื่น) ยังโชว์เป็นค่าที่ถืออยู่ + บอกเหตุ
//   ไม่ใช่เด้งเป็น "ยังไม่เลือก" (อ่านผิดว่าไม่ได้ตั้ง) — เลือกตัวใหม่ทับได้
import Link from "next/link";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { lineFieldId } from "./serviceSetupDraft";
import styles from "./ServiceSetupFields.module.css";

const optionSearch = (option) => [option.fgCode, option.name, option.ownerArCode].filter(Boolean).join(" ").toLowerCase();

/**
 * @param lineId · @param lineNo เลขรายการ (ป้ายสำหรับโปรแกรมอ่านหน้าจอ)
 * @param value serviceProductId ที่ถืออยู่ · @param fgCode รหัสของตัวที่ถืออยู่ (ใช้บอกเหตุเมื่อหลุดจากตัวเลือก)
 * @param options `view.fgOptions` · @param error ข้อความหลังกด (null = ไม่แดง) · @param onChange `(productId|null) => void`
 * ⚠️ ไม่มีป้ายเหนือช่อง — ตารางงานบริการมีหัวคอลัมน์ ② "แพ็คเกจ FG" (และป้ายของการ์ดตอนพับ) แล้ว
 */
export default function ServiceFgPicker({ lineId, lineNo, value = null, fgCode = null, options = [], error = null, onChange }) {
  const list = Array.isArray(options) ? options : [];
  const current = list.find((option) => option.id === value) || null;
  const selectOptions = [
    ...(value && !current ? [{
      value,
      label: `${fgCode || value} — ไม่อยู่ในแพ็คเกจที่เลือกได้แล้ว`,
      disabled: true,
      search: String(fgCode || value).toLowerCase(),
    }] : []),
    ...list.map((option) => ({
      value: option.id,
      label: `${option.fgCode} · ${option.name}`,
      search: optionSearch(option),
      render: (
        <span className={styles.fgOption}>
          <span className={styles.fgCode}>{option.fgCode}</span>
          <span className={styles.fgName}>{option.name}</span>
          {option.ownerArCode ? <span className={styles.fgOwner}>ของ {option.ownerArCode}</span> : null}
        </span>
      ),
    })),
  ];

  return (
    <div className={styles.field} id={lineFieldId(lineId, "fg")} data-invalid={error ? "" : undefined}>
      {selectOptions.length ? (
        <SearchableSelect
          size="sm"
          value={value || ""}
          onChange={(next) => onChange?.(next || null)}
          options={selectOptions}
          placeholder="เลือกแพ็คเกจ"
          searchPlaceholder="ค้นหารหัส FG หรือชื่อแพ็คเกจ"
          ariaLabel={`แพ็คเกจ (FG) รายการ ${lineNo}`}
          emptyText={(query) => (query ? `ไม่พบแพ็คเกจที่ตรง “${query}”` : "ไม่มีแพ็คเกจให้เลือก")}
        />
      ) : null}
      {!list.length ? (
        <p className={styles.hint}>
          ลูกค้ารายนี้ยังไม่มีแพ็คเกจหมวด 02-001 ในฐานข้อมูลสินค้า — สร้าง FG แล้วให้ผู้จัดการฝ่ายขายอนุมัติก่อน ·{" "}
          <Link href="/database/products">เปิดฐานข้อมูลสินค้า</Link>
        </p>
      ) : null}
      {current?.ownerArCode ? <span className={styles.fgOwner}>ของ {current.ownerArCode} (นิติบุคคลเดียวกัน)</span> : null}
      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
    </div>
  );
}
