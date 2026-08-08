"use client";
// ── ของที่ RD ส่ง = แถวคำร้อง + กลิ่นในทะเบียน (P3b) ───────────────────────
//
// ⭐ **กรอกที่เดียว เข้าทะเบียนเลย** — RD ไม่ต้องเปิดหน้าทะเบียนอีกจอแล้วพิมพ์ซ้ำ
// ซึ่งเป็นวิธีที่ข้อมูลสองที่เริ่ม drift กัน
//
// ⚠️ **รหัสซ้ำเตือนที่ช่อง ไม่ใช่ตอนกดส่ง** — ปล่อยไปตายที่ DB จะได้ error 23505
// ภาษาอังกฤษ และมาตอนที่คนกรอกไปหมดแล้วซึ่งสายเกินจะไล่แก้ทีละช่อง
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { businessDate } from "@/lib/businessDate";
import {
  MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";
import styles from "./scentDelivery.module.css";

// ⭐ **สองวัน ไม่ใช่วันเดียว** (มติผู้ใช้ 2026-08-08 · ม-66 · mig 0224):
//   · `producedAt` = RD ผลิตกลิ่นตัวนี้เสร็จวันไหน → ไปอยู่บน **ตัวกลิ่น** ในทะเบียน
//   · `readyAt`    = พร้อมส่งมอบให้ฝ่ายขายวันไหน  → ไปอยู่บน **แถวคำร้อง**
// กลิ่นตัวหนึ่งอาจผลิตเสร็จวันที่ 1 แต่รอตัวอื่นในชุดจนพร้อมส่งพร้อมกันวันที่ 8
// `_files` = File[] ค้างในฟอร์ม (ม-91) — แถวสายกลิ่นเกิดตอนกดส่ง จึงยังไม่มี
// entityId ให้อัป ⇒ อัปหลังแถวเกิด (แพตเทิร์นเดียวกับหน้าสร้างคำร้อง · ม-84)
// ⚠️ ขีดล่างนำหน้า = ของฟอร์มล้วน ห้ามส่งเข้า payload (ดูตอน submit ใน page.js)
export const emptyDeliveryRow = () => ({
  name: "", code: "", producedAt: businessDate(), readyAt: businessDate(),
  derivedFromScentId: "", spec: "", briefId: "", targetItemId: "", _files: [],
});

// ⭐ ช่องของ **รอบแก้** — แถวรออยู่แล้ว บรีฟกับกลิ่นต้นทางระบบรู้แล้ว ⇒ ไม่ถามซ้ำ
// (ค่าสองตัวนั้นถูก server เขียนทับด้วยของจริงอยู่ดี ดู lib/requests/rework.js)
export const reworkDeliveryRow = (slot) => ({
  ...emptyDeliveryRow(),
  targetItemId: slot.targetItemId,
  briefId: slot.briefId || "",
  derivedFromScentId: slot.derivedFromScentId || "",
  _sourceLabel: slot.sourceLabel || "",
  _customerNote: slot.customerNote || "",
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

// รหัสนี้ชนกับอะไร — คืนข้อความไทย หรือ null
// ⚠️ เทียบแบบไม่สนตัวพิมพ์ ให้ตรงกับ `scents_code_uk` ซึ่งเป็น lower(btrim(code))
export function codeConflict(code, index, rows, registryCodes) {
  const key = norm(code);
  if (!key) return null;
  if (registryCodes.has(key)) return "รหัสนี้มีในทะเบียนแล้ว";
  const earlier = rows.findIndex((r, i) => i !== index && norm(r.code) === key);
  return earlier === -1 ? null : `ซ้ำกับรายการที่ ${earlier + 1}`;
}

export default function ScentDeliveryFields({
  rows, onChange, scents = [], customerId = null, disabled = false, briefs = [],
}) {
  // ⭐ **บรีฟก้อนเดียว = ไม่ต้องถาม** (มติผู้ใช้) — ช่องที่มีตัวเลือกเดียวแต่ยังบังคับ
  // ให้กด คือขั้นตอนที่ไม่ได้ตัดสินใจอะไร · server เลือกให้เองอยู่แล้ว
  const askBrief = briefs.length > 1;
  const registryCodes = new Set(scents.map((s) => norm(s.code)).filter(Boolean));
  const patch = (i, next) => onChange(rows.map((r, j) => (i === j ? { ...r, ...next } : r)));

  // "เลขที่อ้างอิง" — เลือกได้เฉพาะกลิ่นของลูกค้ารายเดียวกัน (มติ 9)
  // ด่านจริงอยู่ฝั่ง server · ตัวกรองนี้กันคนกดผิด ไม่ได้กันคนยิง API ตรง
  const lineage = scents
    .filter((s) => s.customerId === customerId)
    .map((s) => ({
      value: s.id,
      label: `${s.code ? `${s.code} · ` : ""}${s.name}`,
      search: [s.code, s.name, s.customerTradeName].filter(Boolean).join(" "),
    }));

  return (
    <div className={styles.wrap}>
      {rows.map((row, i) => {
        const conflict = codeConflict(row.code, i, rows, registryCodes);
        return (
          <div key={i} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.rowNo}>
                {row.targetItemId ? `รอบแก้ของ ${row._sourceLabel || "รายการก่อนหน้า"}` : `รายการที่ ${i + 1}`}
              </span>
              {/* ⚠️ แถวรอบแก้ลบไม่ได้ — มันคืองานที่ลูกค้าสั่งไว้ ไม่ใช่บรรทัดที่ RD
                  เพิ่งเพิ่มเอง · ลบทิ้งได้เมื่อไรก็เท่ากับทิ้งงานเงียบ ๆ */}
              {rows.length > 1 && !row.targetItemId && (
                <Button
                  size="sm" variant="ghost" tone="danger" disabled={disabled}
                  title="ลบรายการนี้"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                />
              )}
            </div>

            {/* คำพูดลูกค้าอยู่ตรงหัวช่องที่กำลังจะกรอก ไม่ใช่ให้ไถกลับไปอ่านบนราง */}
            {row.targetItemId && row._customerNote && (
              <p className={styles.customerNote}>
                <strong>ลูกค้าบอกว่า:</strong> {row._customerNote}
              </p>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor={`d-name-${i}`}>ชื่อกลิ่น</label>
                <Input
                  id={`d-name-${i}`} value={row.name} disabled={disabled}
                  placeholder="ชื่อจริงที่ RD ตั้ง"
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`d-code-${i}`}>รหัสกลิ่น</label>
                <Input
                  id={`d-code-${i}`} mono value={row.code} disabled={disabled}
                  invalid={!!conflict} placeholder="เช่น SC-2026-001"
                  onChange={(e) => patch(i, { code: e.target.value })}
                />
                {conflict && <p className={styles.error}>{conflict}</p>}
              </div>
              {/* ⭐ วันผลิตมาก่อนวันพร้อมส่งบนจอ — เรียงตามลำดับเวลาจริงของงาน
                  ⚠️ ทั้งคู่ไม่บังคับ: ไม่กรอกวันผลิต = ถือว่าผลิตเสร็จวันเดียวกับที่
                  ส่งมอบ ซึ่งเป็นเคสส่วนใหญ่ · บังคับทั้งสองช่องแล้วคนต้องพิมพ์ซ้ำเปล่า ๆ */}
              <div className="form-group">
                <label htmlFor={`d-produced-${i}`}>วันที่ผลิตกลิ่น</label>
                <DateInput
                  id={`d-produced-${i}`} value={row.producedAt} disabled={disabled}
                  onChange={(v) => patch(i, { producedAt: v })}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`d-ready-${i}`}>วันที่พร้อมส่ง</label>
                <DateInput
                  id={`d-ready-${i}`} value={row.readyAt} disabled={disabled}
                  onChange={(v) => patch(i, { readyAt: v })}
                />
              </div>
              {askBrief && !row.targetItemId && (
                <div className="form-group">
                  <label htmlFor={`d-brief-${i}`}>ตอบบรีฟก้อนไหน *</label>
                  <Select
                    id={`d-brief-${i}`} value={row.briefId || ""} disabled={disabled}
                    onChange={(e) => patch(i, { briefId: e.target.value })}
                    options={[
                      { value: "", label: "— เลือกบรีฟ —" },
                      ...briefs.map((b, n) => ({
                        value: b.id, label: b.label || `กลิ่นที่ ${n + 1}`,
                      })),
                    ]}
                  />
                  {/* 1 บรีฟ : หลาย direction — เสนอสองทางจากบรีฟเดียวกันได้ */}
                  <span className={styles.hint}>เลือกก้อนเดิมซ้ำได้ ถ้าเสนอหลายทางจากบรีฟเดียว</span>
                </div>
              )}
              {row.targetItemId ? (
                // ⭐ รอบแก้: แก้มาจากตัวไหน **ระบบรู้แล้ว** — แสดงเป็นข้อความ ไม่ใช่
                // ช่องให้เลือก · คำตอบมีตัวเดียว ให้เลือกเมื่อไรก็ชี้ผิดตัวได้
                <div className="form-group">
                  <span className="toolbar-label">แก้มาจากกลิ่น</span>
                  <p className={styles.locked}>
                    {row._sourceLabel || "—"}
                    <span className={styles.hint}> · ผูกให้อัตโนมัติ พร้อมบรีฟก้อนเดิม</span>
                  </p>
                </div>
              ) : (
              <div className="form-group">
                <label htmlFor={`d-from-${i}`}>
                  แก้มาจากกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <SearchableSelect
                  id={`d-from-${i}`} value={row.derivedFromScentId}
                  disabled={disabled || !lineage.length}
                  onChange={(v) => patch(i, { derivedFromScentId: v })}
                  options={[{ value: "", label: "— ไม่ได้แก้มาจากตัวไหน —" }, ...lineage]}
                  placeholder="ค้นด้วยรหัสหรือชื่อกลิ่น"
                  emptyText="ลูกค้ารายนี้ยังไม่มีกลิ่นอื่นในทะเบียน"
                />
              </div>
              )}
              <div className="form-group col-span-2">
                <label htmlFor={`d-spec-${i}`}>
                  รายละเอียด <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <Textarea
                  id={`d-spec-${i}`} rows={2} value={row.spec} disabled={disabled}
                  placeholder="ทิศทางกลิ่น / สิ่งที่ต่างจากตัวก่อนหน้า"
                  onChange={(e) => patch(i, { spec: e.target.value })}
                />
              </div>
              {/* ไฟล์ประกอบของ direction นี้ (ม-91) — ไม่บังคับ: ตัวงานคือกลิ่นที่
                  เข้าทะเบียน ไฟล์เป็นของแถม ต่างจากสายเอกสารที่ไฟล์คือตัวงาน */}
              <div className="form-group col-span-2">
                <span className="toolbar-label">
                  ไฟล์ประกอบ <span className={styles.hint}>(ไม่บังคับ · อัปให้หลังส่ง)</span>
                </span>
                <label className={styles.fileDrop}>
                  <Paperclip size={14} aria-hidden="true" />
                  <span>เลือกไฟล์ (สูงสุด {MAX_UPLOAD_MB} MB ต่อไฟล์)</span>
                  <input
                    type="file" multiple accept={UPLOAD_ACCEPT_ATTR} disabled={disabled}
                    className={styles.fileInput}
                    onChange={(e) => {
                      const picked = Array.from(e.target.files || [])
                        .filter((f) => f.size <= MAX_UPLOAD_BYTES);
                      if (picked.length) patch(i, { _files: [...(row._files || []), ...picked] });
                      e.target.value = "";
                    }}
                  />
                </label>
                {!!(row._files || []).length && (
                  <ul className={styles.fileList}>
                    {(row._files || []).map((f, fi) => (
                      <li key={`${f.name}-${fi}`} className={styles.fileRow}>
                        <span className={styles.fileName}>{f.name}</span>
                        <Button
                          iconOnly icon={<X size={13} />} disabled={disabled}
                          onClick={() => patch(i, { _files: (row._files || []).filter((_, j) => j !== fi) })}
                          aria-label={`เอา ${f.name} ออก`}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Button
        size="sm" disabled={disabled}
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={() => onChange([...rows, emptyDeliveryRow()])}
      >
        เพิ่มอีก direction
      </Button>
    </div>
  );
}
