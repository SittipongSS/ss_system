"use client";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useState, useEffect, useMemo, useCallback } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useRouter } from "next/navigation";
import { ListTodo, Plus, RotateCcw, Search } from "lucide-react";
import { useRole, useCan } from "@/lib/roleContext";
import TaskFormModal from "@/components/mgmt/TaskFormModal";
import TaskDrawer from "@/components/mgmt/TaskDrawer";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/mgmt/constants";
import { cachedFetchJson } from "@/lib/apiCache";
import EmptyState from "@/components/ui/EmptyState";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import { naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

const nowYear = new Date().getFullYear();
const YEAR_OPTIONS = [nowYear + 1, nowYear, nowYear - 1, nowYear - 2, nowYear - 3];
const STATUS_CLASS = { done: "ok", in_progress: "", todo: "", cancelled: "danger" };
const EMPTY_FILTERS = { q: "", deptCode: "", status: "", priority: "" };
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
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  /* ⭐ `?count=mgmtTasks` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-116) · ป้ายนับงานที่ยังไม่จบและ
     มอบหมายให้ฉัน ⇒ กดแล้วต้องเจอเท่านั้น ไม่ใช่งานทั้งปีของทุกฝ่าย
     ⚠️ ธง `_waitingOnMe` มาจาก server ด้วย helper ตัวเดียวกับที่ป้ายใช้นับ — หน้านี้ไม่รู้
     ว่าใครล็อกอินอยู่ (มีแต่ role) คำนวณเองไม่ได้
     ⚠️ อ่านครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่า — ไม่งั้นกดล้างตัวกรองไม่ได้ */
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(
    () => new URLSearchParams(window.location.search).get("count") === "mgmtTasks",
  );

  const [formOpen, setFormOpen] = useState(false);
  const [formTask, setFormTask] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { if (role && !canMgmt) router.replace("/home"); }, [role, canMgmt, router]);

  useEffect(() => {
    apiFetch("/api/mgmt/departments").then((r) => (r.ok ? r.json() : [])).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const loadTasks = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    const p = new URLSearchParams({ year: String(year) });
    if (filters.deptCode) p.set("deptCode", filters.deptCode);
    if (filters.status) p.set("status", filters.status);
    if (filters.priority) p.set("priority", filters.priority);
    try {
      const res = await apiFetch(`/api/mgmt/tasks?${p}`);
      const rows = res.ok ? await res.json() : [];
      if (!isLatest()) return; // ตัวกรอง/ปีเปลี่ยนไปแล้ว — คำตอบนี้เป็นของชุดเก่า
      setTasks(rows);
    } catch { if (isLatest() && !opts?.background) setTasks([]); }
    if (isLatest()) setLoading(false);
  }, [year, filters.deptCode, filters.status, filters.priority, startRun]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useRevalidateOnFocus(loadTasks);

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const base = waitingOnMeOnly ? tasks.filter((t) => t._waitingOnMe) : tasks;
    if (!q) return base;
    return base.filter((t) =>
      (t.title || "").toLowerCase().includes(q) ||
      (t.assigneeName || "").toLowerCase().includes(q) ||
      (t.deptCode || "").toLowerCase().includes(q));
  }, [tasks, filters.q, waitingOnMeOnly]);
  // มีตัวกรองอยู่ = "ไม่พบ" ไม่ใช่ "ยังไม่มีงาน" — สองคำนี้พาคนอ่านไปคนละทาง
  const filtering = !!(filters.q.trim() || filters.deptCode || filters.status || filters.priority || waitingOnMeOnly);

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
    <Workspace
      icon={<ListTodo size={22} />}
      title="รายการงาน"
      subtitle="ติดตามงานบริหาร แยกตามแผนก · คลิกแถวเพื่อดูรายละเอียด/แนบไฟล์"
      headerRight={canEdit ? (
        <button className="btn btn-accent flex items-center gap-1.5" onClick={openCreate}><Plus size={16} /> เพิ่มงาน</button>
      ) : null}
    >
      {/* แผงรายการ (มติผู้ใช้ 2026-09-15) — กล่องตัวกรองเดิมกลายเป็นแถบเครื่องมือของแผง ·
          ตัวเลือกปีย้ายจากหัวหน้าเข้าแถบด้วย เพราะคุมแค่รายการนี้ (หน้านี้มีรายการเดียว)
          ⚠️ ตัวเลือกในแถบไม่มีป้ายเหนือช่องแล้ว ⇒ ตัวเลือกแรกบอกชื่อตัวกรองเอง ("ทุกแผนก")
             และทุกช่องมี aria-label
          ⚠️ loading แทนที่เฉพาะเนื้อ — ช่องค้นหา/ตัวเลือกไม่หลุดโฟกัสระหว่างโหลดตามตัวกรองใหม่ */}
      <ListPanel
        icon={<ListTodo size={17} aria-hidden="true" />}
        title={`รายการงานปี ${year}`}
        subtitle="กดชื่องานเพื่อดูรายละเอียด แนบไฟล์ หรือแก้ไข"
        count={loading ? null : `${rows.length} งาน`}
        loading={loading}
        skeletonRows={7}
        toolbar={(
          <>
            {/* ช่องค้นหาต้องขึ้นก่อน — จอ ≤680px ช่องค้นหากว้างเต็มแถว ถ้าปีนำหน้า ปีจะค้างอยู่แถวเดียวโดด ๆ */}
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={filters.q} placeholder="ชื่องาน, แผนก, ผู้รับผิดชอบ" aria-label="ค้นหางาน" onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
            </div>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปีของรายการงาน">
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>ปี {y}</option>)}
            </Select>
            <Select value={filters.deptCode} onChange={(e) => setFilters((f) => ({ ...f, deptCode: e.target.value }))} aria-label="กรองตามแผนก">
              <option value="">ทุกแผนก</option>
              {departments.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </Select>
            <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="กรองตามสถานะ">
              <option value="">ทุกสถานะ</option>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
            </Select>
            <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="กรองตามลำดับความสำคัญ">
              <option value="">ทุกลำดับ</option>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
            </Select>
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันลงมือ ×</Button>
            )}
            <div className="spacer" />
            <Button icon={<RotateCcw size={14} />} onClick={() => setFilters(EMPTY_FILTERS)}>ล้าง</Button>
          </>
        )}
      >
        {rows.length === 0 ? (
          <EmptyState plain icon={ListTodo}>
            {filtering ? "ไม่พบงานที่ตรงกับตัวกรอง" : `ยังไม่มีงานในปี ${year}`}
          </EmptyState>
        ) : (
          <TableScroll surface="embedded" family="list">
          <table className="premium-table">
            <thead>
              <tr style={{ background: "var(--panel-2)", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
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
                /* ⚠️ ทั้งแถวเคยเป็น `onClick` ซึ่งเมาส์กดได้แต่คีย์บอร์ดเข้าไม่ถึงเลย
                   (WCAG 2.1.1 — 7 เซลล์เป็นข้อความกับ pill ล้วน ไม่มีอะไรโฟกัสได้)
                   ⇒ ย้ายตัวสั่งงานมาไว้ที่ชื่อเรื่องเป็น <button> จริง · ลิ้นชักเปิด
                   ในหน้าเดิม ไม่ได้พาไปไหน จึงเป็น `.text-action` (เส้นประ)
                   ไม่ใช่ `.linklike` (เส้นทึบ = มี URL) */
                <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 8px", color: "var(--text-3)" }}>{i + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    {/* `.text-action-block` = ทั้งเซลล์เป็นเป้าเดียว + ชิดซ้าย —
                        ปุ่มเปล่าจัดข้อความกึ่งกลางตาม UA ซึ่งเห็นทันทีที่ชื่องานตัดบรรทัด */}
                    <button type="button" className="text-action text-action-block" onClick={() => setSelected(t)}>{t.title}</button>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{t.deptCode ? <span className="pill">{t.deptCode}</span> : NA}</td>
                  <td style={{ padding: "10px 8px", color: "var(--text-2)" }}>{naText(t.assigneeName)}</td>
                  <td style={{ padding: "10px 8px", color: "var(--text-2)" }}>{fmt(t.dueDate)}</td>
                  <td style={{ padding: "10px 8px" }}><span className={`pill ${STATUS_CLASS[t.status] || ""}`}>{TASK_STATUS_LABELS[t.status] || t.status}</span></td>
                  <td style={{ padding: "10px 8px" }}>{t.priority === "urgent" ? <span className="pill danger">ด่วน</span> : <span style={{ color: "var(--text-3)" }}>ปกติ</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        )}
      </ListPanel>

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
    </Workspace>
  );
}
