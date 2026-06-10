"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban, Plus, Search, LayoutGrid, List, Calendar,
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Activity, XCircle, PauseCircle, CircleDashed, Check, Pause, Loader,
} from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole } from "@/lib/roleContext";
import ProjectFormModal from "@/components/pm/ProjectFormModal";

const URGENCY_COLUMNS = [
  { key: "Do Now", label: "🔥 Do Now (งานด่วน)" },
  { key: "Schedule", label: "📅 Schedule (งานตามแผน)" },
  { key: "Delegate", label: "👥 Delegate (มอบหมาย)" },
];

const typeStyle = (type) => type === "NPD"
  ? { background: "var(--accent-soft)", color: "var(--accent)" }
  : { background: "var(--blue-soft)", color: "var(--blue)" };

const getComputedStatus = (p) => {
  if (p.status === "Dropped") return "Dropped";
  if (p.status === "On Hold") return "On Hold";
  
  const total = p.tasks?.length || 0;
  const done = p.tasks?.filter((t) => t.status === "Completed").length || 0;
  if (total > 0 && done === total) return "Completed";
  
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = (p.tasks || []).filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
  if (overdueCount > 0) return "Delayed";
  
  if (total === 0 || p.tasks.every(t => t.status === "Pending")) return "New";
  
  return "On Track";
};

const statusDotColor = (s) => s === "Completed" ? "var(--green)" : s === "On Track" ? "var(--green)" : s === "Delayed" ? "var(--red)" : s === "On Hold" ? "var(--amber)" : s === "Dropped" ? "var(--red)" : "var(--accent)";
const statusPillClass = (s) => s === "Completed" ? "success" : s === "On Track" ? "success" : s === "Delayed" ? "danger" : s === "On Hold" ? "warning" : s === "Dropped" ? "danger" : "primary";

// ===== progress helpers (mirror ss-cj) =====
const getProgress = (p) => {
  const total = p.tasks?.length || 0;
  const done = p.tasks?.filter((t) => t.status === "Completed").length || 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
};
const getCurrentStep = (p) => {
  if (getComputedStatus(p) === "Completed") return "เสร็จสิ้นทุกขั้นตอน";
  const active = p.tasks?.find((t) => t.status === "In Progress");
  return active ? active.name : (p.tasks?.find((t) => t.status === "Pending")?.name || "-");
};
const getOverdueCount = (p) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (p.tasks || []).filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
};
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function ProjectsPage() {
  const router = useRouter();
  const canEdit = useCan("pm:edit");
  const role = useRole();
  // delete scope mirrors the API: supervisor (all) + team lead (own team).
  const canDelete = role === "ae_supervisor" || role === "senior_ae";
  const [projects, setProjects] = useState(() => apiCache.get("/api/pm/projects") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/pm/projects"));
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [initialData, setInitialData] = useState(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/pm/projects");
      if (res.ok) {
        const data = await res.json();
        apiCache.set("/api/pm/projects", data);
        setProjects(data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
    fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(d || [])).catch(() => {});
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(d || [])).catch(() => {});
  }, []);

  const openCreate = () => { setEditingId(null); setInitialData(null); setShowForm(true); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setInitialData(p);
    setShowForm(true);
  };

  const handleFormSuccess = async (data) => {
    setShowForm(false);
    apiCache.delete?.("/api/pm/projects");
    await fetchProjects();
    if (!editingId) router.push(`/projects/${data.id}`);
  };

  const handleDelete = async (p) => {
    if (!confirm(`ต้องการลบโปรเจกต์ "${p.code} — ${p.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`)) return;
    setProjects((list) => list.filter((x) => x.id !== p.id));
    const res = await fetch(`/api/pm/projects/${p.id}`, { method: "DELETE" });
    apiCache.delete?.("/api/pm/projects");
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
      fetchProjects();
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => projects.filter((p) => {
    if (!q) return true;
    return [p.code, p.name, p.customerName].some((v) => (v || "").toLowerCase().includes(q));
  }), [projects, q]);

  const completedProjects = filtered.filter((p) => p.status === "Completed");
  const droppedProjects = filtered.filter((p) => p.status === "Dropped");

  // map code 'XX' → main category name (for list display)
  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || "";

  // ===== Kanban card =====
  const renderCard = (p) => {
    const { pct } = getProgress(p);
    const overdue = getOverdueCount(p);
    const cStatus = getComputedStatus(p);
    const isLocked = p.status === "On Hold" || p.status === "Dropped";
    return (
      <div key={p.id} className="glass-panel hover-card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: "11px", ...typeStyle(p.type), padding: "4px 8px", borderRadius: "6px", fontWeight: 600 }}>{p.type}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }} className="font-mono">{p.code}</span>
            {canEdit && <button onClick={() => openEdit(p)} title="แก้ไข" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "2px", display: "flex" }}><Edit2 size={13} /></button>}
            {canDelete && <button onClick={() => handleDelete(p)} title="ลบ" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "2px", display: "flex" }}><Trash2 size={13} /></button>}
          </div>
        </div>

        <div style={{ cursor: "pointer" }} onClick={() => router.push(`/projects/${p.id}`)}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "4px", lineHeight: 1.4 }}>{p.name}</div>
          <div style={{ fontSize: "12px", color: "var(--text-2)" }}>{p.customerName || "-"}</div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-3)", marginBottom: "4px" }}>
            <span>ความคืบหน้า {pct}%</span>
            {overdue > 0 && <span style={{ color: "var(--red)", display: "flex", alignItems: "center", gap: "2px" }}><AlertTriangle size={10} /> เลย {overdue}</span>}
          </div>
          <div style={{ height: "5px", background: "var(--bg)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: cStatus === "Completed" ? "var(--green)" : "var(--accent)", transition: "width 0.3s" }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          <span className={`status-pill ${statusPillClass(cStatus)}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDotColor(cStatus) }} /> {cStatus}
          </span>
          <div style={{ fontSize: "11px", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "4px" }}>
            <Calendar size={12} /> {fmtDate(p.dueDate)}
          </div>
        </div>
      </div>
    );
  };

  const renderArchiveCard = (p) => {
    const cStatus = getComputedStatus(p);
    return (
      <div key={p.id} className="glass-panel hover-card" style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", opacity: 0.85, filter: "grayscale(30%)", cursor: "pointer" }} onClick={() => router.push(`/projects/${p.id}`)}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "120px", flexShrink: 0 }}>
            <span style={{ fontSize: "10px", ...typeStyle(p.type), padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>{p.type}</span>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }} className="font-mono">{p.code}</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
            <div style={{ fontSize: "11px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.customerName || "-"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px", width: "90px" }}>
            <Calendar size={12} /> {fmtDate(p.dueDate)}
          </div>
          <span className={`status-pill ${statusPillClass(cStatus)}`} style={{ padding: "2px 8px", fontSize: "11px", width: "95px", justifyContent: "center", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDotColor(cStatus) }} /> {cStatus}
          </span>
          <div style={{ width: "24px", display: "flex", justifyContent: "flex-end" }}>
            {canDelete && <button onClick={(e) => { e.stopPropagation(); handleDelete(p); }} title="ลบ" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "2px", display: "flex" }}><Trash2 size={14} /></button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><FolderKanban size={22} /></span> โครงการ</h1>
          <p>ระบบจัดการโปรเจกต์และติดตามงาน (NPD &amp; Re-Order)</p>
        </div>
        <div className="header-content" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-glass" style={{ width: "220px" }}>
            <Search size={18} color="var(--text-3)" />
            <input type="text" placeholder="ค้นหาโปรเจกต์..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate} style={{ padding: "0 18px", fontWeight: 600 }}>
              <Plus size={16} /> สร้างโปรเจกต์ใหม่
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>กำลังโหลดข้อมูล...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="premium-glass-table table-responsive">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>โปรเจกต์</th>
                  <th>ลูกค้า</th>
                  <th>ประเภท</th>
                  <th>หมวดสินค้า</th>
                  <th>ผู้ดูแล</th>
                  <th>ความคืบหน้า</th>
                  <th>ขั้นตอนปัจจุบัน</th>
                  <th>กำหนดส่ง</th>
                  <th>สถานะ</th>
                  {(canEdit || canDelete) && <th style={{ width: "70px", textAlign: "center" }}>จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.filter(p => getComputedStatus(p) !== "Completed" && getComputedStatus(p) !== "Dropped").length === 0 ? (
                  <tr><td colSpan={canEdit || canDelete ? 10 : 9} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>ยังไม่มีโครงการ</td></tr>
                ) : filtered.filter(p => getComputedStatus(p) !== "Completed" && getComputedStatus(p) !== "Dropped").map((p) => {
                const { pct, done, total } = getProgress(p);
                const overdue = getOverdueCount(p);
                const cStatus = getComputedStatus(p);
                return (
                  <tr key={p.id} className="premium-row" style={{ cursor: "pointer" }} onClick={() => router.push(`/projects/${p.id}`)}>
                    <td>
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }} className="font-mono">{p.code}</div>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>{p.name}</div>
                    </td>
                    <td>{p.customerName || "-"}</td>
                    <td><span style={{ fontSize: "11px", ...typeStyle(p.type), padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>{p.type}</span></td>
                    <td style={{ fontSize: "12px", maxWidth: "180px" }}>
                      {p.productSubCategory || p.productMainCategory ? (
                        <div>
                          {p.productSubCategory && <div style={{ fontWeight: 500 }}>{p.productSubCategory}</div>}
                          {p.productMainCategory && <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{mainCatName(p.productMainCategory) || p.productMainCategory}</div>}
                        </div>
                      ) : <span style={{ color: "var(--text-3)" }}>-</span>}
                    </td>
                    <td style={{ fontSize: "12px" }}>{p.aeOwner || "-"}</td>
                    <td style={{ minWidth: "120px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "5px", background: "var(--bg)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: cStatus === "Completed" ? "var(--green)" : "var(--accent)" }} />
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{done}/{total}</span>
                      </div>
                      {overdue > 0 && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "2px", display: "flex", alignItems: "center", gap: "2px" }}><AlertTriangle size={10} /> เลยกำหนด {overdue} งาน</div>}
                    </td>
                    <td style={{ fontSize: "12px", maxWidth: "200px" }}>{getCurrentStep(p)}</td>
                    <td style={{ fontSize: "12px" }}>{fmtDate(p.dueDate)}</td>
                    <td>
                      <span className={`status-pill ${statusPillClass(cStatus)}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDotColor(cStatus) }} />
                        {cStatus}
                      </span>
                      {cStatus === "Dropped" && p.metadata?.lossReason && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "4px" }}>{p.metadata.lossReason}</div>}
                    </td>
                    {(canEdit || canDelete) && (
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          {canEdit && <button onClick={() => openEdit(p)} title="แก้ไข" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "2px", display: "flex" }}><Edit2 size={14} /></button>}
                          {canDelete && <button onClick={() => handleDelete(p)} title="ลบ" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "2px", display: "flex" }}><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {/* คลังเก็บ — โปรเจกต์ที่ปิดงานแล้ว */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)", fontSize: "14px", fontWeight: 600 }}
            >
              {showArchive ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>คลังเก็บ: โปรเจกต์ที่ปิดงานแล้ว</span>
              <span style={{ background: "var(--green-soft, var(--panel-2))", color: "var(--green)", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><Check size={12} strokeWidth={3} /> {completedProjects.length}</span>
              <span style={{ background: "var(--red-soft, var(--panel-2))", color: "var(--red)", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><X size={12} strokeWidth={3} /> {droppedProjects.length}</span>
            </button>

            {showArchive && (
              <div style={{ padding: "4px 18px 20px", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600, margin: "16px 0 10px", display: "flex", alignItems: "center", gap: "6px" }}><Check size={14} strokeWidth={3} color="var(--green)" /> เสร็จสิ้น (Completed)</div>
                {completedProjects.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>ยังไม่มีโปรเจกต์ที่เสร็จสิ้น</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{completedProjects.map(renderArchiveCard)}</div>
                )}

                <div style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600, margin: "24px 0 10px", display: "flex", alignItems: "center", gap: "6px" }}><X size={14} strokeWidth={3} color="var(--red)" /> ยกเลิก (Dropped)</div>
                {droppedProjects.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>ไม่มีโปรเจกต์ที่ถูกยกเลิก</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{droppedProjects.map(renderArchiveCard)}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ProjectFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        editingId={editingId}
        initialData={initialData}
        onSuccess={handleFormSuccess}
        customers={customers}
        categories={categories}
        allProducts={allProducts}
        users={users}
      />
    </div>
  );
}
