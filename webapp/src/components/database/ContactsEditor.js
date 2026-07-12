"use client";
import PhoneInput from "@/components/ui/PhoneInput";
import { Plus, Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";

// Editor for a customer's list of contacts (migration 0033). Each contact is
// { role, name, phone, email } where role = department. The first contact is
// treated as primary (synced back to the legacy contactPerson/phone/email by
// the API). Controlled: value = array, onChange(nextArray).
const ROLES = ["จัดซื้อ", "การเงิน", "เทคนิค", "อื่นๆ"];

export default function ContactsEditor({ value = [], onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { role: "", name: "", phone: "", email: "" }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <div className="text-[11px] text-[var(--text-3)]">ยังไม่มีผู้ติดต่อ — กด “เพิ่มผู้ติดต่อ”</div>
      )}
      {rows.map((c, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-start">
          <Select value={c.role || ""} onChange={(e) => update(i, { role: e.target.value })} style={{ width: "108px" }}>
            <option value="">แผนก…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <input className="premium-input text-xs" style={{ flex: "1 1 130px", minWidth: "110px" }} placeholder="ชื่อผู้ติดต่อ" value={c.name || ""} onChange={(e) => update(i, { name: e.target.value })} />
          <PhoneInput className="text-xs" style={{ flex: "1 1 140px", minWidth: "120px" }} placeholder="เบอร์" value={c.phone || ""} onChange={(value) => update(i, { phone: value })} />
          <input className="premium-input text-xs" style={{ flex: "1 1 150px", minWidth: "120px" }} placeholder="อีเมล" value={c.email || ""} onChange={(e) => update(i, { email: e.target.value })} />
          <button type="button" className="btn-icon danger" onClick={() => remove(i)} title="ลบผู้ติดต่อ" style={{ marginTop: "2px" }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn" style={{ alignSelf: "flex-start", fontSize: "12px" }} onClick={add}>
        <Plus size={14} /> เพิ่มผู้ติดต่อ
      </button>
    </div>
  );
}
