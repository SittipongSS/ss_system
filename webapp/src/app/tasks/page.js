"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Search, LayoutGrid, List, CheckCircle2, Clock, AlertTriangle, User } from "lucide-react";

const TASK_STATUS_TH = { Pending: "รอ", "In Progress": "ทำอยู่", Completed: "เสร็จ" };
const ROLE_OPTIONS = ["All", "SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Pending = ยังไม่เริ่ม, In Progress = เทียบวันกำหนดเสร็จ, Completed = เสร็จ
const getUrgencyInfo = (task) => {
  if (task.status === "Completed") return { color: "var(--green)", label: "เสร็จแล้ว", icon: <CheckCircle2 size={12} /> };
  if (task.status === "Pending") return { color: "var(--text-3)", label: "ยังไม่เริ่ม", icon: <Clock size={12} /> };
  if (!task.finishDate) return { color: "var(--text-2)", label: "กำลังทำ", icon: <Clock size={12} /> };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const finish = new Date(task.finishDate); finish.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((finish - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { color: "var(--red)", label: `เลยกำหนด ${Math.abs(diffDays)} วัน`, icon: <AlertTriangle size={12} /> };
  if (diffDays <= 3) return { color: "var(--amber)", label: `เหลือ ${diffDays} วัน`, icon: <Clock size={12} /> };
  return { color: "var(--text-2)", label: `เหลือ ${diffDays} วัน`, icon: <Clock size={12} /> };
};

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [viewMode, setViewMode] = useState("table"); // 'board' | 'table'

  useEffect(() => {
    Promise.all([
      fetch("/api/pm/project-tasks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])),
    ]).then(([t, p]) => {
      const pmap = Object.fromEntries((p || []).map((x) => [x.id, x]));
      setProjects(pmap);

      const allTasks = t || [];
      const byProject = {};
      allTasks.forEach(task => {
        if (!byProject[task.projectId]) byProject[task.projectId] = [];
        byProject[task.projectId].push(task);
      });
      
      const processed = [];
      Object.keys(byProject).forEach(pId => {
        const pTasks = byProject[pId].sort((a,b) => a.stepOrder - b.stepOrder);
        let currentPhase = null;
        let phaseNum = 0;
        let taskInPhase = 0;
        pTasks.forEach(task => {
          const phase = task.phase || "—";
          if (phase !== currentPhase) {
            currentPhase = phase;
            phaseNum++;
            taskInPhase = 1;
          } else {
            taskInPhase++;
          }
          const proj = pmap[task.projectId] || {};
          processed.push({
            ...task,
            projectCode: proj.code || "-", projectName: proj.name || "-", aeOwner: proj.aeOwner || "",
            displayNumber: `${phaseNum}.${taskInPhase}`
          });
        });
      });
      setTasks(processed);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => tasks.filter((t) => {
    const matchRole = roleFilter === "All" || t.role === roleFilter;
    const matchSearch = !q || [t.name, t.projectName, t.projectCode].some((v) => (v || "").toLowerCase().includes(q));
    return matchRole && matchSearch;
  }), [tasks, roleFilter, q]);

  const grouped = {
    Pending: filtered.filter((t) => t.status === "Pending"),
    "In Progress": filtered.filter((t) => t.status === "In Progress"),
    Completed: filtered.filter((t) => t.status === "Completed"),
  };

  const tasksByProject = useMemo(() => {
    const groups = new Map();
    filtered.forEach((t) => {
      if (!groups.has(t.projectId)) groups.set(t.projectId, { projectId: t.projectId, projectCode: t.projectCode, projectName: t.projectName, tasks: [] });
      groups.get(t.projectId).tasks.push(t);
    });
    return Array.from(groups.values());
  }, [filtered]);

  const colTitle = (s) => s === "Pending" ? "รอคิว (Pending)" : s === "In Progress" ? "กำลังทำ (In Progress)" : "เสร็จแล้ว (Completed)";
  const goProject = (t) => t.projectId && router.push(`/projects/${t.projectId}`);

  const renderSegBtn = (active, onClick, children) => (
    <button onClick={onClick} className="btn" style={{ background: active ? "var(--panel)" : "transparent", color: active ? "var(--text)" : "var(--text-2)", border: active ? "1px solid var(--border)" : "1px solid transparent", boxShadow: "none" }}>{children}</button>
  );

  return (
    <div>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> งาน (Tasks)</h1>
          <p>ศูนย์รวมงาน — ดูขั้นตอนที่ต้องทำข้ามโปรเจกต์ทั้งหมดได้ในที่เดียว</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "16px", marginBottom: "24px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-glass" style={{ width: "240px" }}>
            <Search size={18} color="var(--text-3)" />
            <input type="text" placeholder="ค้นหางาน / รหัสโปรเจกต์..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="premium-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: "150px" }}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r === "All" ? "ทุกแผนก (All)" : r}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", background: "var(--bg)", borderRadius: "var(--radius)", padding: "4px", border: "1px solid var(--border)", gap: "4px" }}>
          {renderSegBtn(viewMode === "board", () => setViewMode("board"), <><LayoutGrid size={14} /> Board</>)}
          {renderSegBtn(viewMode === "table", () => setViewMode("table"), <><List size={14} /> Table</>)}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>กำลังโหลดข้อมูล...</div>
      ) : viewMode === "board" ? (
        <div style={{ display: "flex", gap: "24px", overflowX: "auto", paddingBottom: "16px" }}>
          {["Pending", "In Progress", "Completed"].map((status) => (
            <div key={status} style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--panel-2)", borderRadius: "12px", borderTop: `3px solid ${status === "Completed" ? "var(--green)" : status === "In Progress" ? "var(--accent)" : "var(--border)"}` }}>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{colTitle(status)}</h3>
                <span style={{ fontSize: "12px", background: "var(--bg)", padding: "2px 8px", borderRadius: "12px" }}>{grouped[status].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {grouped[status].length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", background: "var(--panel)", borderRadius: "12px", border: "1px dashed var(--border)", color: "var(--text-3)", fontSize: "13px" }}>ไม่มีงานในสถานะนี้</div>
                ) : grouped[status].map((task) => {
                  const urgency = getUrgencyInfo(task);
                  return (
                    <div key={task.id} className="glass-panel hover-card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", cursor: "pointer" }} onClick={() => goProject(task)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ fontSize: "10px", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)" }} className="font-mono">{task.projectCode}</span>
                        <span style={{ fontSize: "11px", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>{task.role}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-2)", marginBottom: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.projectName}</div>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{task.displayNumber}. {task.name}</h4>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-3)" }}>
                          <User size={12} /> {task.aeOwner || "—"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", color: urgency.color, fontWeight: 500 }}>
                          {urgency.icon} {urgency.label}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>กำหนดเสร็จ: {fmtDate(task.finishDate)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="premium-glass-table table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th>สถานะ</th>
                <th>ชื่องาน (Task)</th>
                <th>แผนก</th>
                <th>ผู้ดูแล</th>
                <th>กำหนดเสร็จ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>ไม่มีงาน</td></tr>
              ) : tasksByProject.map((group) => (
                <Fragment key={group.projectId}>
                  <tr onClick={() => group.projectId && router.push(`/projects/${group.projectId}`)} style={{ cursor: "pointer" }}>
                    <td colSpan={5} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" }}>
                        <span style={{ fontSize: "11px", background: "var(--bg)", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border)" }} className="font-mono">{group.projectCode}</span>
                        <span>{group.projectName}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 500 }}>({group.tasks.length} งาน)</span>
                      </div>
                    </td>
                  </tr>
                  {group.tasks.map((task) => {
                    const urgency = getUrgencyInfo(task);
                    return (
                      <tr key={task.id} className="premium-row" style={{ cursor: "pointer" }} onClick={() => goProject(task)}>
                        <td>
                          <span className={`status-pill ${task.status === "Completed" ? "success" : ""}`}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: task.status === "Completed" ? "var(--green)" : task.status === "In Progress" ? "var(--accent)" : "var(--text-3)" }} />
                            {TASK_STATUS_TH[task.status] || task.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{task.displayNumber}. {task.name}</td>
                        <td><span style={{ fontSize: "11px", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>{task.role}</span></td>
                        <td style={{ fontSize: "13px" }}>{task.aeOwner || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td>
                          <div style={{ fontSize: "13px" }}>{fmtDate(task.finishDate)}</div>
                          <div style={{ fontSize: "11px", color: urgency.color, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>{urgency.icon} {urgency.label}</div>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
