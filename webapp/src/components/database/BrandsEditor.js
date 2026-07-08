"use client";
import { Plus, Trash2 } from "lucide-react";

// Editor for a customer's brands (migration 0059). Each brand is { th, en }
// where th = ชื่อไทย (ใช้เป็นชื่อหลัก/คีย์), en = ชื่ออังกฤษ (ไม่บังคับ).
// Controlled: value = array, onChange(nextArray). Mirrors ContactsEditor.
// หมายเหตุ: ปรับแค่ "รูปทรง" ให้เป็น {th,en} — ไม่ trim ระหว่างพิมพ์ ไม่งั้นเคาะ
// เว้นวรรคท้ายคำไม่ได้ (โดน trim ทิ้งทุก re-render). trim จริงทำตอนบันทึกที่ API.
const asRow = (b) => (typeof b === "string" ? { th: b, en: "" } : { th: b?.th ?? "", en: b?.en ?? "" });

export default function BrandsEditor({ value = [], onChange }) {
  const rows = (Array.isArray(value) ? value : []).map(asRow);
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { th: "", en: "" }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <div className="text-[11px] text-[var(--text-3)]">ยังไม่มีแบรนด์ — กด “เพิ่มแบรนด์”</div>
      )}
      {rows.map((b, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-start">
          <input className="premium-input text-xs" style={{ flex: "1 1 160px", minWidth: "130px" }} placeholder="ชื่อแบรนด์ (ไทย)" value={b.th || ""} onChange={(e) => update(i, { th: e.target.value })} />
          <input className="premium-input text-xs" style={{ flex: "1 1 160px", minWidth: "130px" }} placeholder="ชื่อแบรนด์ (อังกฤษ)" value={b.en || ""} onChange={(e) => update(i, { en: e.target.value })} />
          <button type="button" className="btn-icon danger" onClick={() => remove(i)} title="ลบแบรนด์" style={{ marginTop: "2px" }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn" style={{ alignSelf: "flex-start", fontSize: "12px" }} onClick={add}>
        <Plus size={14} /> เพิ่มแบรนด์
      </button>
    </div>
  );
}
