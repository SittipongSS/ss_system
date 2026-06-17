"use client";
// ตัวเลือก "งานที่ต้องรอให้เสร็จก่อน" (predecessors) — ใช้ร่วมกันทุกวิว:
// List inline-edit, Table modal, ฟอร์มเพิ่มขั้นตอน, และ popover บน Table/Gantt.
// controlled: value = array ของ task id, onChange(nextIds).
// กันลูป: ปิดตัวเลือกที่ (ทางสาย predecessor) ขึ้นกับ selfId อยู่แล้ว — เลือกแล้วจะวน A→B→A.
import { useMemo, useState } from "react";

// id ทั้งหมดที่ "ขึ้นกับ selfId" (ลูกหลานในกราฟ predecessor) — เลือกเป็น predecessor
// ของ selfId ไม่ได้ เพราะจะเกิดวงจร. BFS ตามสาย successor (pred → ผู้ที่อ้างถึง pred).
function descendantsOf(selfId, tasks) {
  if (!selfId) return new Set();
  const succ = new Map();
  tasks.forEach((t) => (Array.isArray(t.predecessors) ? t.predecessors : []).forEach((p) => {
    if (!succ.has(p)) succ.set(p, []);
    succ.get(p).push(t.id);
  }));
  const seen = new Set();
  const stack = [selfId];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of succ.get(cur) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen;
}

const numLabel = (t) => (t.displayNumber != null ? `${t.displayNumber}. ` : "");

export default function PredecessorPicker({ tasks, selfId = null, value = [], onChange, maxHeight = 120 }) {
  const others = useMemo(() => tasks.filter((t) => t.id !== selfId), [tasks, selfId]);
  const cyclic = useMemo(() => descendantsOf(selfId, tasks), [selfId, tasks]);
  const sel = new Set(value || []);
  const toggle = (id, checked) =>
    onChange(checked ? [...(value || []), id] : (value || []).filter((x) => x !== id));

  if (others.length === 0) {
    return <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center", padding: "8px" }}>ไม่มีขั้นตอนงานอื่น</div>;
  }
  return (
    <div style={{ maxHeight, overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
      {others.map((t) => {
        const blocked = cyclic.has(t.id);
        return (
          <label key={t.id}
            title={blocked ? "เลือกไม่ได้ — ขั้นตอนนี้ขึ้นกับงานปัจจุบันอยู่แล้ว (จะเกิดวงจร)" : undefined}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.4 : 1 }}>
            <input type="checkbox" disabled={blocked} checked={sel.has(t.id)}
              onChange={(e) => toggle(t.id, e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            <span>{numLabel(t)}{t.name}</span>
          </label>
        );
      })}
    </div>
  );
}

// Popover ลอย — ใช้ใน Table cell และบาร์ Gantt. ถือ draft ภายใน แล้ว commit ครั้งเดียวตอนกด
// "บันทึก" (กัน PATCH+reload รัวทุกครั้งที่ติ๊ก). anchor = { x, y } พิกัดเมาส์ตอนคลิก.
export function PredecessorPopover({ task, tasks, anchor, onSave, onClose }) {
  const [draft, setDraft] = useState(Array.isArray(task.predecessors) ? task.predecessors : []);
  const W = 280;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, anchor.x), vw - W - 8);
  const top = Math.min(Math.max(8, anchor.y), vh - 300);
  const norm = (a) => JSON.stringify([...(a || [])].sort());
  const changed = norm(draft) !== norm(task.predecessors);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
      <div style={{ position: "fixed", left, top, width: W, zIndex: 1001, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.28)", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          งานที่ต้องรอให้เสร็จก่อน · {task.name}
        </div>
        <PredecessorPicker tasks={tasks} selfId={task.id} value={draft} onChange={setDraft} maxHeight={200} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="btn btn-secondary sm" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary sm" disabled={!changed} onClick={() => onSave(draft)}>บันทึก</button>
        </div>
      </div>
    </>
  );
}
