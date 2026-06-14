"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban, Plus, Search, AlertTriangle, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Check, Pause,
  Filter, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import Select from "@/components/ui/Select";

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
  // delete scope mirrors the API: superuser (all) + team lead (own team).
  const canDelete = isSuperuser(role) || role === "senior_ae";
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
          case "customer":
            return (a.customerName || "").localeCompare(b.customerName || "", "th") * dir;
          case "type":
            return (a.type || "").localeCompare(b.type || "", "th") * dir;
          case "category":
            return ((a.productSubCategory || a.productMainCategory || "")).localeCompare(b.productSubCategory || b.productMainCategory || "", "th") * dir;
          case "owner":
            return (a.aeOwner || "").localeCompare(b.aeOwner || "", "th") * dir;
          case "step":
            return (getCurrentStep(a) || "").localeCompare(getCurrentStep(b) || "", "th") * dir;
          case "status":
            return (getComputedStatus(a) || "").localeCompare(getComputedStatus(b) || "", "th") * dir;
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
        case "type": return (a.type || "").localeCompare(b.type || "", "th") * dir;
        case "category": return ((a.productSubCategory || a.productMainCategory || "")).localeCompare(b.productSubCategory || b.productMainCategory || "", "th") * dir;
        case "owner": return (a.aeOwner || "").localeCompare(b.aeOwner || "", "th") * dir;
        case "status": return (getComputedStatus(a) || "").localeCompare(getComputedStatus(b) || "", "th") * dir;
        case "code":
        default: return (a.code || "").localeCompare(b.code || "", "th") * dir;
      }
    });
  }, [filtered, archiveStatusFilter, archiveSortKey, archiveSortDir]);

  // map code 'XX' → main category name (for list display)
  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || "";

  // หัวตารางกดเรียง (ตารางหลัก)
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;
  const sortableTh = (key, label) => (
    <th onClick={() => toggleSort(key)} style={{ cursor: "pointer", userSelect: "none" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>{label} {sortArrow(key)}</span>
    </th>
  );

  // หัวตารางกดเรียง (คลังเก็บ)
  const toggleArchiveSort = (key) => {
    if (archiveSortKey === key) setArchiveSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setArchiveSortKey(key); setArchiveSortDir("asc"); }
  };
  const archiveArrow = (key) => archiveSortKey === key
    ? (archiveSortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;
  const archiveTh = (key, label) => (
    <th onClick={() => toggleArchiveSort(key)} style={{ cursor: "pointer", userSelect: "none" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>{label} {archiveArrow(key)}</span>
    </th>
  );

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
        <td><span className="ui-badge" style={typeStyle(p.type)}>{p.type}</span></td>
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
            <div className="progress" style={{ flex: 1 }}>
              <span className={cStatus === "Completed" ? "done" : ""} style={{ width: `${pct}%` }} />
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
            <div style={{ display: "inline-flex", gap: "4px" }}>
              {canDelete && <button className="btn-icon danger" onClick={() => handleDelete(p)} aria-label="ลบโปรเจกต์" title="ลบ"><Trash2 size={14} /></button>}
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
          {/* แถบเครื่องมือ: ค้นหา + กรอง + เรียงลำดับ */}
          <div className="toolbar">
            <div className="search-glass" style={{ width: "240px" }}>
              <Search size={18} color="var(--text-3)" />
              <input type="text" placeholder="ค้นหาโปรเจกต์..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="toolbar" style={{ gap: "8px" }}>
              <span className="toolbar-label"><Filter size={14} /> กรอง</span>
              <Select compact value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} title="กรองตามประเภทโปรเจกต์">
                <option value="all">ทุกประเภท</option>
                <option value="NPD">NPD</option>
                <option value="RE-ORDER">Re-Order</option>
              </Select>
              <Select compact value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="กรองตามสถานะ">
                <option value="all">ทุกสถานะ</option>
                <option value="New">New (ใหม่)</option>
                <option value="On Track">On Track (ตามแผน)</option>
                <option value="Delayed">Delayed (ล่าช้า)</option>
              </Select>
              {activeFilterCount > 0 && (
                <button className="btn ghost" onClick={() => { setTypeFilter("all"); setStatusFilter("all"); }} style={{ fontSize: "12px", color: "var(--text-3)" }} title="ล้างตัวกรอง">
                  <X size={13} /> ล้าง ({activeFilterCount})
                </button>
              )}
            </div>

            <div className="spacer toolbar" style={{ gap: "8px" }}>
              <span className="toolbar-label"><ArrowUpDown size={14} /> เรียง</span>
              <Select compact value={sortKey} onChange={(e) => setSortKey(e.target.value)} title="เรียงลำดับตาม">
                <option value="default">เริ่มต้น</option>
                <option value="due">กำหนดส่ง</option>
                <option value="progress">ความคืบหน้า</option>
                <option value="name">ชื่อโปรเจกต์</option>
                <option value="code">รหัส</option>
              </Select>
              <button
                className="btn-icon"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                disabled={sortKey === "default"}
                aria-label={sortDir === "asc" ? "เรียงน้อยไปมาก กดเพื่อสลับ" : "เรียงมากไปน้อย กดเพื่อสลับ"}
                title={sortDir === "asc" ? "น้อยไปมาก (A→Z)" : "มากไปน้อย (Z→A)"}
              >
                {sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              </button>
            </div>
          </div>

          <div className="premium-glass-table table-responsive">
            <table className="premium-table">
              <thead>
                <tr>
                  {sortableTh("code", "โปรเจกต์")}
                  {sortableTh("customer", "ลูกค้า")}
                  {sortableTh("type", "ประเภท")}
                  {sortableTh("category", "หมวดสินค้า")}
                  {sortableTh("owner", "ผู้ดูแล")}
                  {sortableTh("progress", "ความคืบหน้า")}
                  {sortableTh("step", "ขั้นตอนปัจจุบัน")}
                  {sortableTh("due", "กำหนดส่ง")}
                  {sortableTh("status", "สถานะ")}
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
                    <td><span className="ui-badge" style={typeStyle(p.type)}>{p.type}</span></td>
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
                        <div className="progress" style={{ flex: 1 }}>
                          <span className={cStatus === "Completed" ? "done" : ""} style={{ width: `${pct}%` }} />
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
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          {canEdit && <button className="btn-icon" onClick={() => openEdit(p)} aria-label="แก้ไขโปรเจกต์" title="แก้ไข"><Edit2 size={14} /></button>}
                          {canDelete && <button className="btn-icon danger" onClick={() => handleDelete(p)} aria-label="ลบโปรเจกต์" title="ลบ"><Trash2 size={14} /></button>}
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
              <span className="chip" style={{ background: "var(--green-soft)", color: "var(--green)", borderColor: "transparent" }}><Check size={12} strokeWidth={3} /> {completedProjects.length}</span>
              <span className="chip" style={{ background: "var(--red-soft)", color: "var(--red)", borderColor: "transparent" }}><X size={12} strokeWidth={3} /> {droppedProjects.length}</span>
              <span className="chip" style={{ background: "var(--amber-soft)", color: "var(--amber)", borderColor: "transparent" }}><Pause size={12} strokeWidth={3} /> {onHoldProjects.length}</span>
            </button>

            {showArchive && (
              <div style={{ padding: "14px 18px 20px", borderTop: "1px solid var(--border)" }}>
                {/* toolbar คลัง: กรองสถานะ (segmented) + เรียงลำดับ */}
                <div className="toolbar" style={{ marginBottom: "14px" }}>
                  <div className="segmented">
                    {[
                      { key: "all", label: `ทั้งหมด ${completedProjects.length + droppedProjects.length + onHoldProjects.length}`, color: "var(--text-2)" },
                      { key: "Completed", label: `เสร็จสิ้น ${completedProjects.length}`, color: "var(--green)" },
                      { key: "Dropped", label: `ยกเลิก ${droppedProjects.length}`, color: "var(--red)" },
                      { key: "On Hold", label: `ระงับ ${onHoldProjects.length}`, color: "var(--amber)" },
                    ].map((opt) => (
                      <button key={opt.key} onClick={() => setArchiveStatusFilter(opt.key)}
                        className={archiveStatusFilter === opt.key ? "active" : ""}
                        style={archiveStatusFilter === opt.key ? undefined : { color: opt.color }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="spacer toolbar" style={{ gap: "8px" }}>
                    <span className="toolbar-label"><ArrowUpDown size={14} /> เรียง</span>
                    <Select compact value={archiveSortKey} onChange={(e) => setArchiveSortKey(e.target.value)} title="เรียงลำดับคลังตาม">
                      <option value="code">รหัส</option>
                      <option value="name">ชื่อโปรเจกต์</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="progress">ความคืบหน้า</option>
                      <option value="due">กำหนดส่ง</option>
                    </Select>
                    <button className="btn-icon" onClick={() => setArchiveSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      aria-label={archiveSortDir === "asc" ? "เรียงน้อยไปมาก กดเพื่อสลับ" : "เรียงมากไปน้อย กดเพื่อสลับ"}
                      title={archiveSortDir === "asc" ? "น้อยไปมาก (A→Z)" : "มากไปน้อย (Z→A)"}>
                      {archiveSortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                    </button>
                  </div>
                </div>

                <div className="premium-glass-table table-responsive">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        {archiveTh("code", "โปรเจกต์")}
                        {archiveTh("customer", "ลูกค้า")}
                        {archiveTh("type", "ประเภท")}
                        {archiveTh("category", "หมวดสินค้า")}
                        {archiveTh("owner", "ผู้ดูแล")}
                        {archiveTh("progress", "ความคืบหน้า")}
                        {archiveTh("due", "กำหนดส่ง")}
                        {archiveTh("status", "สถานะ")}
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
