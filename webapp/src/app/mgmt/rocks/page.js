"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import { useState, useEffect, useMemo, useCallback } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { Target, Plus, Trash2, X, Check } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Textarea from "@/components/ui/Textarea";
import { apiFetch } from "@/lib/apiFetch";
import AccessDenied from "@/components/ui/AccessDenied";
import { accessState } from "@/lib/accessGate";
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
      const res = await apiFetch(`/api/mgmt/rocks/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ improved, goals }),
      });
      if (res.ok) onSaved?.(await res.json());
      else notifyToast.error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirmAction(`ลบข้อมูล Rock & Improve ของแผนก ${deptLabel}?`))) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/mgmt/rocks/${row.id}`, { method: "DELETE" });
      if (res.ok) onDeleted?.(row.id);
      else notifyToast.error((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  return (
    <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="pill" style={{ fontSize: "var(--fs-7)" }}>{deptLabel}</span>
        {canEdit && <button className="btn-icon" style={{ color: "var(--red)" }} onClick={remove} disabled={busy} title="ลบ" aria-label="ลบ"><Trash2 size={15} /></button>}
      </div>

      <div>
        <label style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", display: "block", marginBottom: 4 }}>สิ่งที่ดีขึ้น</label>
        <Textarea className="w-full" rows={2} value={improved} onChange={(e) => setImproved(e.target.value)} disabled={!canEdit} placeholder="สรุปสิ่งที่พัฒนาขึ้น..." />
      </div>

      <div>
        <label style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", display: "block", marginBottom: 4 }}>ROCK — เป้าหมายต่อไป</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {goals.length === 0 && <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", fontStyle: "italic" }}>ยังไม่มีเป้าหมาย</div>}
          {goals.map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-7)" }}>
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
  const canEdit = useCan("mgmt:edit");
  const canMgmt = useCan("mgmt:view");
  const [year, setYear] = useState(nowYear);
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDept, setAddDept] = useState("");
  useEffect(() => {
    apiFetch("/api/mgmt/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    try {
      const res = await apiFetch(`/api/mgmt/rocks?year=${year}`);
      const data = res.ok ? await res.json() : [];
      if (!isLatest()) return; // เปลี่ยนปีระหว่างรอ — คำตอบนี้เป็นของปีเก่า
      setRows(data);
    } catch { if (isLatest() && !opts?.background) setRows([]); }
    if (isLatest()) setLoading(false);
  }, [year, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const deptLabel = useCallback((code) => departments.find((d) => d.code === code)?.label || code, [departments]);
  const addable = useMemo(() => {
    const used = new Set(rows.map((r) => r.deptCode));
    return departments.filter((d) => !used.has(d.code));
  }, [departments, rows]);

  const addRow = async () => {
    if (!addDept) return;
    const res = await apiFetch("/api/mgmt/rocks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, deptCode: addDept, goals: [] }),
    });
    if (res.ok) { const created = await res.json(); setRows((p) => [...p, created]); setAddDept(""); }
    else notifyToast.error((await res.json().catch(() => ({}))).error || "เพิ่มไม่สำเร็จ");
  };
  /* ⛔ ไม่มีสิทธิ์ = บอกให้รู้ พร้อมทางกลับ — เดิมเด้งไป /home เงียบ ๆ จนแยกไม่ออก
     ว่าเข้าไม่ได้หรือกดลิงก์ผิด (กฎ: docs/ui-visibility-rule.md) */
  if (accessState(role, canMgmt) === "denied") {
    return (
      <AccessDenied
        icon={<Target size={22} />}
        title="Rock & Improve"
        message="งานบริหารเปิดให้ผู้บริหารและผู้ดูแลระบบเท่านั้น"
        back={{ href: "/mgmt", label: "กลับหน้าภาพรวมงานบริหาร" }}
      />
    );
  }
  return (
    <Workspace
      icon={<Target size={22} />}
      title="Rock & Improve"
      subtitle="เป้าหมายและสิ่งที่พัฒนาขึ้น แยกตามแผนก (รายปี)"
      headerRight={(
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="premium-input" style={{ width: 120 }}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {y}</option>)}
          </Select>
        </div>
      )}
    >
      {canEdit && addable.length > 0 && (
        <div className="glass-panel" style={{ padding: "12px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>เพิ่มแผนก:</span>
          <Select className="premium-input" style={{ width: 180 }} value={addDept} onChange={(e) => setAddDept(e.target.value)}>
            <option value="">— เลือกแผนก —</option>
            {addable.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </Select>
          <button className="btn btn-primary" onClick={addRow} disabled={!addDept}><Plus size={14} /> เพิ่ม</button>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={6} />
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
    </Workspace>
  );
}
