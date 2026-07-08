"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Target, Plus, Trash2, X, Check } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import { toBuddhistYear } from "@/lib/mgmt/constants";

const nowYear = new Date().getFullYear();
const YEAR_OPTIONS = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];

function RockCard({ row, deptLabel, canEdit, onSaved, onDeleted }) {
  const [improved, setImproved] = useState(row.improved || "");
  const [goals, setGoals] = useState(Array.isArray(row.goals) ? row.goals : []);
  const [newGoal, setNewGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = improved !== (row.improved || "") || JSON.stringify(goals) !== JSON.stringify(row.goals || []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/rocks/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ improved, goals }),
      });
      if (res.ok) onSaved?.(await res.json());
      else alert((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`ลบข้อมูล Rock & Improve ของแผนก ${deptLabel}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/rocks/${row.id}`, { method: "DELETE" });
      if (res.ok) onDeleted?.(row.id);
      else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  return (
    <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="pill" style={{ fontSize: 13 }}>{deptLabel}</span>
        {canEdit && <button className="btn-icon" style={{ color: "var(--red)" }} onClick={remove} disabled={busy} title="ลบ" aria-label="ลบ"><Trash2 size={15} /></button>}
      </div>

      <div>
        <label style={{ fontSize: 12, color: "var(--text-3)", display: "block", marginBottom: 4 }}>สิ่งที่ดีขึ้น</label>
        <textarea className="premium-input w-full" rows={2} value={improved} onChange={(e) => setImproved(e.target.value)} disabled={!canEdit} placeholder="สรุปสิ่งที่พัฒนาขึ้น..." />
      </div>

      <div>
        <label style={{ fontSize: 12, color: "var(--text-3)", display: "block", marginBottom: 4 }}>ROCK — เป้าหมายต่อไป</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {goals.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>ยังไม่มีเป้าหมาย</div>}
          {goals.map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ color: "var(--accent)" }}>›</span>
              <span style={{ flex: 1 }}>{g}</span>
              {canEdit && <button className="btn-icon" onClick={() => setGoals(goals.filter((_, j) => j !== i))} title="ลบเป้าหมาย" aria-label="ลบเป้าหมาย"><X size={13} /></button>}
            </div>
          ))}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input className="premium-input" style={{ flex: 1 }} value={newGoal} placeholder="เพิ่มเป้าหมาย..." onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newGoal.trim()) { setGoals([...goals, newGoal.trim()]); setNewGoal(""); } }} />
            <button className="btn" onClick={() => { if (newGoal.trim()) { setGoals([...goals, newGoal.trim()]); setNewGoal(""); } }}><Plus size={14} /></button>
          </div>
        )}
      </div>

      {canEdit && dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={save} disabled={busy}><Check size={14} /> บันทึก</button>
        </div>
      )}
    </div>
  );
}

export default function MgmtRocksPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("mgmt:edit");
  const canMgmt = useCan("mgmt:view");
  const [year, setYear] = useState(nowYear);
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDept, setAddDept] = useState("");

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);
  useEffect(() => {
    fetch("/api/mgmt/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mgmt/rocks?year=${year}`);
      setRows(res.ok ? await res.json() : []);
    } catch { setRows([]); }
    setLoading(false);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const deptLabel = useCallback((code) => departments.find((d) => d.code === code)?.label || code, [departments]);
  const addable = useMemo(() => {
    const used = new Set(rows.map((r) => r.deptCode));
    return departments.filter((d) => !used.has(d.code));
  }, [departments, rows]);

  const addRow = async () => {
    if (!addDept) return;
    const res = await fetch("/api/mgmt/rocks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, deptCode: addDept, goals: [] }),
    });
    if (res.ok) { const created = await res.json(); setRows((p) => [...p, created]); setAddDept(""); }
    else alert((await res.json().catch(() => ({}))).error || "เพิ่มไม่สำเร็จ");
  };

  if (role && !canMgmt) return null;

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><Target size={22} /></span> Rock &amp; Improve</h1>
          <p>เป้าหมายและสิ่งที่พัฒนาขึ้น แยกตามแผนก (รายปี)</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="premium-input" style={{ width: 120 }}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {toBuddhistYear(y)}</option>)}
          </select>
        </div>
      </div>

      {canEdit && addable.length > 0 && (
        <div className="glass-panel" style={{ padding: "12px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>เพิ่มแผนก:</span>
          <select className="premium-input" style={{ width: 180 }} value={addDept} onChange={(e) => setAddDept(e.target.value)}>
            <option value="">— เลือกแผนก —</option>
            {addable.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addRow} disabled={!addDept}><Plus size={14} /> เพิ่ม</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div className="glass-panel" style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีข้อมูลในปีนี้ — เพิ่มแผนกเพื่อเริ่ม</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {rows.map((r) => (
            <RockCard
              key={r.id}
              row={r}
              deptLabel={deptLabel(r.deptCode)}
              canEdit={canEdit}
              onSaved={(u) => setRows((p) => p.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={(id) => setRows((p) => p.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
