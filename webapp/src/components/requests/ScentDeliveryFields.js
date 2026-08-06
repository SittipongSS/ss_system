"use client";
// ── ของที่ RD ส่ง = แถวคำร้อง + กลิ่นในทะเบียน (P3b) ───────────────────────
//
// ⭐ **กรอกที่เดียว เข้าทะเบียนเลย** — RD ไม่ต้องเปิดหน้าทะเบียนอีกจอแล้วพิมพ์ซ้ำ
// ซึ่งเป็นวิธีที่ข้อมูลสองที่เริ่ม drift กัน
//
// ⚠️ **รหัสซ้ำเตือนที่ช่อง ไม่ใช่ตอนกดส่ง** — ปล่อยไปตายที่ DB จะได้ error 23505
// ภาษาอังกฤษ และมาตอนที่คนกรอกไปหมดแล้วซึ่งสายเกินจะไล่แก้ทีละช่อง
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { businessDate } from "@/lib/businessDate";
import styles from "./scentDelivery.module.css";

export const emptyDeliveryRow = () => ({
  name: "", code: "", sentAt: businessDate(), derivedFromScentId: "", spec: "", briefId: "",
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
              <span className={styles.rowNo}>รายการที่ {i + 1}</span>
              {rows.length > 1 && (
                <Button
                  size="sm" variant="ghost" tone="danger" disabled={disabled}
                  title="ลบรายการนี้"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                />
              )}
            </div>

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
              <div className="form-group">
                <label htmlFor={`d-sent-${i}`}>วันที่ส่ง</label>
                <DateInput
                  id={`d-sent-${i}`} value={row.sentAt} disabled={disabled}
                  onChange={(v) => patch(i, { sentAt: v })}
                />
              </div>
              {askBrief && (
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
