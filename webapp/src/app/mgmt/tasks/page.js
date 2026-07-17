"use client";
import Select from "@/components/ui/Select";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Plus, RotateCcw, Search } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import TaskFormModal from "@/components/mgmt/TaskFormModal";
import TaskDrawer from "@/components/mgmt/TaskDrawer";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, toBuddhistYear } from "@/lib/mgmt/constants";
import { cachedFetchJson } from "@/lib/apiCache";

const nowYear = new Date().getFullYear();
const YEAR_OPTIONS = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
const STATUS_CLASS = { done: "ok", in_progress: "", todo: "", cancelled: "danger" };
const fmt = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

export default function MgmtTasksPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("mgmt:edit");
  const canMgmt = useCan("mgmt:view");

  const [year, setYear] = useState(nowYear);
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", deptCode: "", status: "", priority: "" });

  const [formOpen, setFormOpen] = useState(false);
  const [formTask, setFormTask] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);

  useEffect(() => {
    fetch("/api/mgmt/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ year: String(year) });
    if (filters.deptCode) p.set("deptCode", filters.deptCode);
    if (filters.status) p.set("status", filters.status);
    if (filters.priority) p.set("priority", filters.priority);
    try {
      const res = await fetch(`/api/mgmt/tasks?${p}`);
      setTasks(res.ok ? await res.json() : []);
    } catch { setTasks([]); }
    setLoading(false);
  }, [year, filters.deptCode, filters.status, filters.priority]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      (t.title || "").toLowerCase().includes(q) ||
      (t.assigneeName || "").toLowerCase().includes(q) ||
      (t.deptCode || "").toLowerCase().includes(q));
  }, [tasks, filters.q]);

  const upsertRow = (row) => setTasks((prev) => {
    const i = prev.findIndex((t) => t.id === row.id);
    if (i === -1) return [...prev, row];
    const next = [...prev]; next[i] = row; return next;
  });
  const dropRow = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const openCreate = () => { setFormTask(null); setFormOpen(true); };
  const openEdit = (t) => { setSelected(null); setFormTask(t); setFormOpen(true); };

  if (role && !canMgmt) return null;

  return (
    <>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> รายการงาน</h1>
          <p>ติดตามงานบริหาร แยกตามแผนก · คลิกแถวเพื่อดูรายละเอียด/แนบไฟล์</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="premium-input" style={{ width: 120 }}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {toBuddhistYear(y)}</option>)}
          </Select>
          {canEdit && <button className="btn btn-accent flex items-center gap-1.5" onClick={openCreate}><Plus size={16} /> เพิ่มงาน</button>}
        </div>
      </div>

      {/* filters */}
      <div className="glass-panel" style={{ padding: "12px 14px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
          <label>ค้นหา</label>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--text-3)" }} />
            <input className="premium-input w-full" style={{ paddingLeft: 30 }} value={filters.q} placeholder="ชื่องาน, แผนก, ผู้รับผิดชอบ" onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>แผนก</label>
          <Select className="premium-input" value={filters.deptCode} onChange={(e) => setFilters((f) => ({ ...f, deptCode: e.target.value }))}>
            <option value="">ทั้งหมด</option>
            {departments.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </Select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>สถานะ</label>
          <Select className="premium-input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">ทั้งหมด</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>ลำดับ</label>
          <Select className="premium-input" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
            <option value="">ทั้งหมด</option>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
          </Select>
        </div>
        <button className="btn" onClick={() => setFilters({ q: "", deptCode: "", status: "", priority: "" })}><RotateCcw size={14} /> ล้าง</button>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีงานในปีนี้</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--panel-2)", color: "var(--text-3)", fontSize: 12 }}>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 36 }}>#</th>
                <th style={{ textAlign: "left", padding: "10px 8px" }}>รายการ</th>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 90 }}>แผนก</th>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 120 }}>ผู้รับผิดชอบ</th>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 90 }}>สิ้นสุด</th>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 120 }}>สถานะ</th>
                <th style={{ textAlign: "left", padding: "10px 8px", width: 70 }}>ลำดับ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} onClick={() => setSelected(t)} style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                  <td style={{ padding: "10px 8px", color: "var(--text-3)" }}>{i + 1}</td>
                  <td style={{ padding: "10px 8px" }}>{t.title}</td>
                  <td style={{ padding: "10px 8px" }}>{t.deptCode ? <span className="pill">{t.deptCode}</span> : "—"}</td>
                  <td style={{ padding: "10px 8px", color: "var(--text-2)" }}>{t.assigneeName || "—"}</td>
                  <td style={{ padding: "10px 8px", color: "var(--text-2)" }}>{fmt(t.dueDate)}</td>
                  <td style={{ padding: "10px 8px" }}><span className={`pill ${STATUS_CLASS[t.status] || ""}`}>{TASK_STATUS_LABELS[t.status] || t.status}</span></td>
                  <td style={{ padding: "10px 8px" }}>{t.priority === "urgent" ? <span className="pill danger">ด่วน</span> : <span style={{ color: "var(--text-3)" }}>ปกติ</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(row) => upsertRow(row)}
        task={formTask}
        departments={departments}
        users={users}
      />
      <TaskDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        task={selected}
        canEdit={canEdit}
        onEdit={openEdit}
        onChanged={(row) => { upsertRow(row); setSelected(row); }}
        onDeleted={dropRow}
      />
    </>
  );
}
