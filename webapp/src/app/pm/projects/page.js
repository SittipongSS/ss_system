"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban, Plus, Search, LayoutGrid, List, Calendar,
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Activity, XCircle, PauseCircle, CircleDashed, Check, Pause, Loader,
  Filter, ArrowUpDown, ArrowUp, ArrowDown,
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | NPD | Re-Order
  const [statusFilter, setStatusFilter] = useState("all"); // all | New | On Track | Delayed | On Hold
  const [sortKey, setSortKey] = useState("default"); // default | due | progress | name | code
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [showArchive, setShowArchive] = useState(false);
  const [archiveStatusFilter, setArchiveStatusFilter] = useState("all"); // all | Completed | Dropped
  const [archiveSortKey, setArchiveSortKey] = useState("code"); // code | name | customer | progress | due
  const [archiveSortDir, setArchiveSortDir] = useState("desc"); // asc | desc
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

    // Concurrent editing: while this tab sits open, another user may add or
    // change projects. Refetch the list whenever the tab regains focus so a
    // returning user sees the latest instead of a stale snapshot.
    const onVisible = () => { if (document.visibilityState === "visible") fetchProjects(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
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
    if (!editingId) router.push(`/pm/projects/${data.code || data.id}`);
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

  // ใช้สถานะที่คำนวณ (computed) เพื่อให้สอดคล้องกับตารางงานหลัก —
  // โปรเจกต์ที่ทำครบทุกขั้นตอน (computed = Completed) จะเข้าคลังเสมอ แม้ status ใน DB ยังไม่ใช่ Completed
  const completedProjects = filtered.filter((p) => getComputedStatus(p) === "Completed");
  const droppedProjects = filtered.filter((p) => getComputedStatus(p) === "Dropped");
  const onHoldProjects = filtered.filter((p) => getComputedStatus(p) === "On Hold");

  // โปรเจกต์ที่กำลังดำเนินการ (ไม่รวมที่ปิด/ยกเลิก/ระงับ) + กรอง + เรียงลำดับ
  const activeProjects = useMemo(() => {
    let list = filtered.filter((p) => {
      const cs = getComputedStatus(p);
      return cs !== "Completed" && cs !== "Dropped" && cs !== "On Hold";
    });
    if (typeFilter !== "all") list = list.filter((p) => p.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((p) => getComputedStatus(p) === statusFilter);

    if (sortKey !== "default") {
      const dir = sortDir === "asc" ? 1 : -1;
      const cmpNum = (av, bv) => {
        // ค่าว่างไปท้ายเสมอ ไม่ว่าทิศทางใด
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      };
      list = [...list].sort((a, b) => {
        switch (sortKey) {
          case "due":
            return cmpNum(a.dueDate ? new Date(a.dueDate).getTime() : null, b.dueDate ? new Date(b.dueDate).getTime() : null);
          case "progress":
            return (getProgress(a).pct - getProgress(b).pct) * dir;
          case "name":
            return (a.name || "").localeCompare(b.name || "", "th") * dir;
          case "code":
            return (a.code || "").localeCompare(b.code || "", "th") * dir;
          default:
            return 0;
        }
      });
    }
    return list;
  }, [filtered, typeFilter, statusFilter, sortKey, sortDir]);

  const activeFilterCount = (typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  // คลังเก็บ — โปรเจกต์ที่ปิดงาน/พักไว้ (Completed/Dropped/On Hold) + กรองสถานะ + เรียงลำดับ
  const archiveProjects = useMemo(() => {
    let list = filtered.filter((p) => {
      const cs = getComputedStatus(p);
      return cs === "Completed" || cs === "Dropped" || cs === "On Hold";
    });
    if (archiveStatusFilter !== "all") list = list.filter((p) => getComputedStatus(p) === archiveStatusFilter);

    const dir = archiveSortDir === "asc" ? 1 : -1;
    const cmpNum = (av, bv) => {
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    };
    return [...list].sort((a, b) => {
      switch (archiveSortKey) {
        case "name": return (a.name || "").localeCompare(b.name || "", "th") * dir;
        case "customer": return (a.customerName || "").localeCompare(b.customerName || "", "th") * dir;
        case "progress": return (getProgress(a).pct - getProgress(b).pct) * dir;
        case "due": return cmpNum(a.dueDate ? new Date(a.dueDate).getTime() : null, b.dueDate ? new Date(b.dueDate).getTime() : null);
        case "code":
        default: return (a.code || "").localeCompare(b.code || "", "th") * dir;
      }
    });
  }, [filtered, archiveStatusFilter, archiveSortKey, archiveSortDir]);

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

        <div style={{ cursor: "pointer" }} onClick={() => router.push(`/pm/projects/${p.code || p.id}`)}>
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

  const renderArchiveRow = (p) => {
    const { pct, done, total } = getProgress(p);
    const cStatus = getComputedStatus(p);
    return (
      <tr key={p.id} className="premium-row" style={{ cursor: "pointer", opacity: 0.85 }} onClick={() => router.push(`/pm/projects/${p.code || p.id}`)}>
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
              <div style={{ height: "100%", width: `${pct}%`, background: cStatus === "Completed" ? "var(--green)" : "var(--text-3)" }} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{done}/{total}</span>
          </div>
        </td>
        <td style={{ fontSize: "12px" }}>{fmtDate(p.dueDate)}</td>
        <td>
          <span className={`status-pill ${statusPillClass(cStatus)}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDotColor(cStatus) }} />
            {cStatus}
          </span>
          {cStatus === "Dropped" && p.metadata?.lossReason && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "4px", maxWidth: "160px" }}>{p.metadata.lossReason}</div>}
        </td>
        {(canEdit || canDelete) && (
          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", gap: "6px" }}>
              {canDelete && <button onClick={() => handleDelete(p)} title="ลบ" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "2px", display: "flex" }}><Trash2 size={14} /></button>}
            </div>
          </td>
        )}
      </tr>
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
          {/* แถบกรอง + เรียงลำดับ */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>
                <Filter size={14} /> กรอง
              </span>
              <select className="premium-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ fontSize: "12px", height: "34px", width: "auto" }} title="กรองตามประเภทโปรเจกต์">
                <option value="all">ทุกประเภท</option>
                <option value="NPD">NPD</option>
                <option value="RE-ORDER">Re-Order</option>
              </select>
              <select className="premium-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: "12px", height: "34px", width: "auto" }} title="กรองตามสถานะ">
                <option value="all">ทุกสถานะ</option>
                <option value="New">New (ใหม่)</option>
                <option value="On Track">On Track (ตามแผน)</option>
                <option value="Delayed">Delayed (ล่าช้า)</option>
              </select>
              {activeFilterCount > 0 && (
                <button onClick={() => { setTypeFilter("all"); setStatusFilter("all"); }} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }} title="ล้างตัวกรอง">
                  <X size={13} /> ล้าง ({activeFilterCount})
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>
                <ArrowUpDown size={14} /> เรียง
              </span>
              <select className="premium-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ fontSize: "12px", height: "34px", width: "auto" }} title="เรียงลำดับตาม">
                <option value="default">เริ่มต้น</option>
                <option value="due">กำหนดส่ง</option>
                <option value="progress">ความคืบหน้า</option>
                <option value="name">ชื่อโปรเจกต์</option>
                <option value="code">รหัส</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                disabled={sortKey === "default"}
                title={sortDir === "asc" ? "น้อยไปมาก (A→Z)" : "มากไปน้อย (Z→A)"}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--panel)", color: sortKey === "default" ? "var(--text-3)" : "var(--text-2)", cursor: sortKey === "default" ? "not-allowed" : "pointer", opacity: sortKey === "default" ? 0.5 : 1 }}
              >
                {sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              </button>
            </div>
          </div>

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
                {activeProjects.length === 0 ? (
                  <tr><td colSpan={canEdit || canDelete ? 10 : 9} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>{activeFilterCount > 0 || q ? "ไม่พบโครงการตามเงื่อนไข" : "ยังไม่มีโครงการ"}</td></tr>
                ) : activeProjects.map((p) => {
                const { pct, done, total } = getProgress(p);
                const overdue = getOverdueCount(p);
                const cStatus = getComputedStatus(p);
                return (
                  <tr key={p.id} className="premium-row" style={{ cursor: "pointer" }} onClick={() => router.push(`/pm/projects/${p.code || p.id}`)}>
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
              <span>คลังเก็บ: โปรเจกต์ที่ปิดงาน/พักไว้</span>
              <span style={{ background: "var(--green-soft, var(--panel-2))", color: "var(--green)", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><Check size={12} strokeWidth={3} /> {completedProjects.length}</span>
              <span style={{ background: "var(--red-soft, var(--panel-2))", color: "var(--red)", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><X size={12} strokeWidth={3} /> {droppedProjects.length}</span>
              <span style={{ background: "var(--amber-soft, var(--panel-2))", color: "var(--amber)", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><Pause size={12} strokeWidth={3} /> {onHoldProjects.length}</span>
            </button>

            {showArchive && (
              <div style={{ padding: "14px 18px 20px", borderTop: "1px solid var(--border)" }}>
                {/* toolbar คลัง: กรองสถานะ (segmented) + เรียงลำดับ */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
                  <div style={{ display: "inline-flex", background: "var(--panel)", borderRadius: "8px", padding: "4px", border: "1px solid var(--border)", gap: "2px" }}>
                    {[
                      { key: "all", label: `ทั้งหมด ${completedProjects.length + droppedProjects.length + onHoldProjects.length}`, color: "var(--text)" },
                      { key: "Completed", label: `เสร็จสิ้น ${completedProjects.length}`, color: "var(--green)" },
                      { key: "Dropped", label: `ยกเลิก ${droppedProjects.length}`, color: "var(--red)" },
                      { key: "On Hold", label: `ระงับ ${onHoldProjects.length}`, color: "var(--amber)" },
                    ].map((opt) => (
                      <button key={opt.key} onClick={() => setArchiveStatusFilter(opt.key)}
                        style={{ padding: "5px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
                          background: archiveStatusFilter === opt.key ? "var(--accent)" : "transparent",
                          color: archiveStatusFilter === opt.key ? "#fff" : opt.color }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>
                      <ArrowUpDown size={14} /> เรียง
                    </span>
                    <select className="premium-select" value={archiveSortKey} onChange={(e) => setArchiveSortKey(e.target.value)} style={{ fontSize: "12px", height: "34px", width: "auto" }} title="เรียงลำดับคลังตาม">
                      <option value="code">รหัส</option>
                      <option value="name">ชื่อโปรเจกต์</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="progress">ความคืบหน้า</option>
                      <option value="due">กำหนดส่ง</option>
                    </select>
                    <button onClick={() => setArchiveSortDir((d) => (d === "asc" ? "desc" : "asc"))} title={archiveSortDir === "asc" ? "น้อยไปมาก (A→Z)" : "มากไปน้อย (Z→A)"}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-2)", cursor: "pointer" }}>
                      {archiveSortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                    </button>
                  </div>
                </div>

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
                        <th>กำหนดส่ง</th>
                        <th>สถานะ</th>
                        {(canEdit || canDelete) && <th style={{ width: "70px", textAlign: "center" }}>จัดการ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {archiveProjects.length === 0 ? (
                        <tr><td colSpan={canEdit || canDelete ? 9 : 8} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>
                          {q || archiveStatusFilter !== "all" ? "ไม่พบโปรเจกต์ในคลังตามเงื่อนไข" : "ยังไม่มีโปรเจกต์ที่ปิดงาน"}
                        </td></tr>
                      ) : archiveProjects.map(renderArchiveRow)}
                    </tbody>
                  </table>
                </div>
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
      />
    </div>
  );
}
