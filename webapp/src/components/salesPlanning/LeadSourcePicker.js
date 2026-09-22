"use client";
/* ช่อง "ลีดต้นทาง" — ตัวเดียวของฟอร์มเพิ่มดีล (DealCreateModal) และฟอร์มแก้ไขดีล (หน้ารวมดีล · หน้าดีล)
   (กติกา AGENTS.md: ฟอร์มแก้ = ฟอร์มสร้าง ⇒ ช่องนี้ต้องเป็น component เดียว ไม่ใช่ก๊อปสองชุด)

   มติผู้ใช้ 2026-09-22: SA ลืมกด "เปิดดีลจากลีดนี้" ⇒ เลือกลีดได้ตอนเพิ่มดีล · และ (รอบสอง) ตอนแก้ไขดีลด้วย
   · รายการมาจาก `GET /leads?linkable=1` — server กรองด้วยด่านเดียวกับที่ใช้ผูกจริง (leadLinkError)
   · โหลดตอน mount (ผู้เรียก mount เฉพาะตอนโมดัลเปิด) · โหลดพลาด ≠ ไม่มีลีดให้ผูก ⇒ บอกเหตุ

   ต่างกันแค่ "โหมด" ผ่าน props:
   · `via="create"` = สร้างดีลใหม่ (ประวัติลีด create_deal) · `via="link"` = ดีลเดิม (ประวัติลีด link_deal)
   · `linkedNote` = ดีลนี้ผูกลีดอยู่แล้ว ⇒ โชว์ข้อความแทนช่องเลือก (ถอด/เปลี่ยนที่แผงจัดการของหน้าดีล)
   · `blocker` = ดีลที่ผูกลีดไม่ได้ (SO ย้อนหลัง · สหมิตร) ⇒ โชว์เหตุแทนช่องเลือก
   · `lockedNote` = ล็อกช่องพร้อมบอกเหตุ (ฟอร์มเพิ่มดีลหลังสร้างไปแล้วบางใบ) */
import { useEffect, useState } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import { leadLinkEffects, leadLinkOptions } from "@/lib/sales/dealLeadLink";
import styles from "./LeadSourcePicker.module.css";

export default function LeadSourcePicker({
  value = "",
  /* (leadId, leadRow|null) — ผู้เรียกเก็บแถวไว้ใช้ต่อ (ช่องทางของลีดไปกับ metadata ตอนสร้าง) */
  onChange,
  via = "create",
  ownerId = null,
  ownerName = "",
  disabled = false,
  linkedNote = "",
  blocker = "",
  lockedNote = "",
  /* บรรทัดท้ายรายการผลลัพธ์ (เช่น "ผูกกับทุกใบในรอบนี้") */
  extraEffect = "",
  className = "",
}) {
  const inactive = !!linkedNote || !!blocker;
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(!inactive);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (inactive) return undefined;
    let alive = true;
    setLoading(true);
    apiJson("/api/sales-planning/leads?linkable=1", { fallbackError: "โหลดรายการลีดไม่สำเร็จ" })
      .then((rows) => { if (alive) setLeads(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (alive) setLoadError(e.message || "โหลดรายการลีดไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    const cancel = () => { alive = false; };
    return cancel;
  }, [inactive]);

  const picked = leads.find((row) => row.id === value) || null;
  const saveWord = via === "create" ? "ดีลยังสร้างได้ตามปกติ" : "ดีลยังบันทึกได้ตามปกติ";

  let note = null;
  if (linkedNote) note = <p className={styles.hint}>{linkedNote}</p>;
  else if (blocker) note = <p className={styles.hint}>{blocker}</p>;
  else if (loadError) note = <p className={styles.error} role="alert">โหลดรายการลีดไม่สำเร็จ: {loadError} — {saveWord} ผูกลีดย้อนหลังได้ที่หน้าดีล</p>;
  else if (lockedNote) note = <p className={styles.hint}>{lockedNote}</p>;
  else if (picked) {
    note = (
      <ul className={styles.effects}>
        {leadLinkEffects(picked, { via }).map((line) => <li key={line}>{line}</li>)}
        {extraEffect ? <li>{extraEffect}</li> : null}
      </ul>
    );
  } else {
    note = <p className={styles.hint}>ลูกค้ามาจากลีดในคิว? เลือกลีดที่นี่ — ลีดจะเปลี่ยนเป็นเปิดลูกค้าแล้ว และระบบเลิกทวงติดตาม</p>;
  }

  return (
    <div className={`${styles.wrap} ${className}`.trim()}>
      <label className={styles.field}>
        ลีดต้นทาง (ถ้ามี)
        {inactive ? null : (
          <SearchableSelect
            className="w-full"
            entity="lead"
            ariaLabel="ลีดต้นทาง"
            value={value}
            onChange={(id) => onChange?.(id, leads.find((row) => row.id === id) || null)}
            disabled={disabled || !!lockedNote || loading || !!loadError}
            /* ⚠️ ตัวเลือก "ไม่ผูกลีด" (ค่าว่าง) ใส่เฉพาะตอนโหลดเสร็จ — ค่าเริ่มต้นเป็นค่าว่าง ถ้าใส่ไว้ตลอด
               ช่องจะขึ้น "ไม่ผูกลีด" ระหว่างโหลดแทน placeholder "กำลังโหลด" */
            options={loading || loadError ? [] : [
              { value: "", label: "— ไม่ผูกลีด (ดีลนี้ไม่ได้มาจากลีดในคิว) —" },
              ...leadLinkOptions(leads, { ownerId, ownerName, fmtDate }),
            ]}
            placeholder={loading ? "กำลังโหลดลีด…" : loadError ? "โหลดรายการลีดไม่สำเร็จ" : "— ไม่ผูกลีด —"}
            searchPlaceholder="ค้นหาชื่อ บริษัท เบอร์โทร หรืออีเมล…"
            emptyText="ไม่พบลีดที่ตรงกับคำค้น"
          />
        )}
      </label>
      {note}
    </div>
  );
}
