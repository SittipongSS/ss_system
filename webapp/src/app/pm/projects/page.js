"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban, Plus, Search, AlertTriangle, ChevronDown, ChevronRight,
  Edit2, Trash2, X, Check, Pause,
  Tag, CircleDot, Package, UserCog, PenLine, Building2,
} from "lucide-react";
import { apiCache } from "@/lib/apiCache";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { useSortableTable, SortTh } from "@/lib/useSortableTable";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";
import SkeletonRows from "@/components/ui/Skeleton";
import FilterPopover from "@/components/ui/FilterPopover";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { fmtDateNumeric } from "@/lib/format";
import { getComputedStatus, statusDotColor, statusPillClass, getProgress, getCurrentStep, getOverdueCount } from "@/lib/pm/derived";

const typeStyle = (type) => type === "NPD"
  ? { background: "var(--accent-soft)", color: "var(--accent)" }
  : { background: "var(--blue-soft)", color: "var(--blue)" };

// คีย์หมวดสินค้าใช้กรอง: ยึด subCategory ก่อน ไม่มีก็ใช้ mainCategory (ค่าว่าง = ไม่ระบุ)
const catKeyOf = (p) => p.productSubCategory || p.productMainCategory || "";

// ค่าที่ใช้เปรียบเทียบของแต่ละคอลัมน์ — ใช้ร่วมกันทั้งตารางหลักและคลังเก็บ (useSortableTable)
const ROW_ACCESSORS = {
  code: (p) => p.code,
  customer: (p) => p.metadata?.brand || p.customerName,
  type: (p) => p.type,
  category: (p) => p.productSubCategory || p.productMainCategory || "",
  owner: (p) => p.aeOwner,
  progress: (p) => getProgress(p).pct,
  step: (p) => getCurrentStep(p),
  due: (p) => (p.dueDate ? new Date(p.dueDate) : null),
  status: (p) => getComputedStatus(p),
};

export default function ProjectsPage() {
  const router = useRouter();
  const canEdit = useCan("pm:edit");
  const role = useRole();
  // delete scope mirrors the API: superuser (all) + team lead (own team).
  const canDelete = isSuperuser(role) || role === "senior_ae";
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };
  const [projects, setProjects] = useState(() => apiCache.get("/api/pm/projects") ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has("/api/pm/projects"));
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [search, setSearch] = useState("");
  // ตัวกรองทุกตัวเป็น multi-select (array). ว่าง = ไม่กรอง (แสดงทุกค่า)
  const [typeFilters, setTypeFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [ownerFilters, setOwnerFilters] = useState([]);
  const [preparerFilters, setPreparerFilters] = useState([]);
  const [customerFilters, setCustomerFilters] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveStatusFilter, setArchiveStatusFilter] = useState("all"); // all | Completed | Dropped
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

  const openEdit = (p) => {
    setEditingId(p.id);
    setInitialData(p);
    setShowForm(true);
  };

  const handleFormSuccess = async (data) => {
    setShowForm(false);
    apiCache.delete?.("/api/pm/projects");
    await fetchProjects();
    // เชื่อมสินค้า (FG) ไม่สำเร็จ → เตือน (อย่าแสดง "สำเร็จ" ทับ) ผู้ใช้จะได้ไปผูกใหม่
    if (data?.productWarning) { setToast({ kind: "error", msg: data.productWarning }); return; }
    if (!editingId) {
      // รหัสโครงการสร้างอัตโนมัติฝั่งเซิร์ฟเวอร์ — แจ้งให้ผู้ใช้เห็นก่อนนำทางเข้าหน้าโปรเจกต์
      if (data.code) setToast({ kind: "success", msg: `สร้างโปรเจกต์สำเร็จ — รหัส ${data.code}` });
      router.push(`/pm/projects/${data.code || data.id}`);
    }
  };

  const handleDelete = async (p) => {
    if (!(await askConfirm({ title: "ลบโปรเจกต์", message: `ต้องการลบโปรเจกต์ "${p.code} — ${p.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`, confirmLabel: "ลบ" }))) return;
    setProjects((list) => list.filter((x) => x.id !== p.id));
    const res = await fetch(`/api/pm/projects/${p.id}`, { method: "DELETE" });
    apiCache.delete?.("/api/pm/projects");
    if (!res.ok) {
      setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ" });
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

  // โปรเจกต์ที่กำลังดำเนินการ (ไม่รวมที่ปิด/ยกเลิก/ระงับ) + กรอง — เรียงลำดับทำผ่าน useSortableTable
  const activeFiltered = useMemo(() => {
    let list = filtered.filter((p) => {
      const cs = getComputedStatus(p);
      return cs !== "Completed" && cs !== "Dropped" && cs !== "On Hold";
    });
    if (typeFilters.length) list = list.filter((p) => typeFilters.includes(p.type));
    if (statusFilters.length) list = list.filter((p) => statusFilters.includes(getComputedStatus(p)));
    if (categoryFilters.length) list = list.filter((p) => categoryFilters.includes(catKeyOf(p)));
    if (ownerFilters.length) list = list.filter((p) => ownerFilters.includes(p.aeOwner || ""));
    if (preparerFilters.length) list = list.filter((p) => preparerFilters.includes(p.preparedBy || ""));
    if (customerFilters.length) list = list.filter((p) => customerFilters.includes(p.customerName || ""));
    return list;
  }, [filtered, typeFilters, statusFilters, categoryFilters, ownerFilters, preparerFilters, customerFilters]);
  const activeSort = useSortableTable(activeFiltered, ROW_ACCESSORS);
  const activeProjects = activeSort.sorted;
  const activePage = usePagination(activeProjects, {
    resetKey: `${q}|${activeProjects.length}|${activeSort.sortKey}|${activeSort.sortDir}`,
  });

  const allFilters = [typeFilters, statusFilters, categoryFilters, ownerFilters, preparerFilters, customerFilters];
  const activeFilterCount = allFilters.filter((f) => f.length > 0).length;
  const clearAllFilters = () => {
    setTypeFilters([]); setStatusFilters([]); setCategoryFilters([]);
    setOwnerFilters([]); setPreparerFilters([]); setCustomerFilters([]);
  };

  // คลังเก็บ — โปรเจกต์ที่ปิดงาน/พักไว้ (Completed/Dropped/On Hold) + กรองสถานะ — เรียงผ่าน useSortableTable
  const archiveFiltered = useMemo(() => {
    let list = filtered.filter((p) => {
      const cs = getComputedStatus(p);
      return cs === "Completed" || cs === "Dropped" || cs === "On Hold";
    });
    if (archiveStatusFilter !== "all") list = list.filter((p) => getComputedStatus(p) === archiveStatusFilter);
    return list;
  }, [filtered, archiveStatusFilter]);
  const archiveSort = useSortableTable(archiveFiltered, ROW_ACCESSORS, { key: "code", dir: "desc" });
  const archiveProjects = archiveSort.sorted;
  const archivePage = usePagination(archiveProjects, {
    resetKey: `${q}|${archiveStatusFilter}|${archiveProjects.length}|${archiveSort.sortKey}|${archiveSort.sortDir}`,
  });

  // map code 'XX' → main category name (for list display)
  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || "";

  // ตัวเลือกของแต่ละตัวกรอง — derive จากรายการโปรเจกต์จริง (เฉพาะค่าที่มีใช้งาน)
  const typeOptions = [
    { value: "NPD", label: "NPD" },
    { value: "RE-ORDER", label: "Re-Order" },
  ];
  const statusOptions = [
    { value: "New", label: "New (ใหม่)" },
    { value: "On Track", label: "On Track (ตามแผน)" },
    { value: "Delayed", label: "Delayed (ล่าช้า)" },
  ];
  const uniqOptions = (values) =>
    [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")).map((v) => ({ value: v, label: v }));
  const ownerOptions = useMemo(() => uniqOptions(projects.map((p) => p.aeOwner)), [projects]);
  const preparerOptions = useMemo(() => uniqOptions(projects.map((p) => p.preparedBy)), [projects]);
  const customerOptions = useMemo(() => uniqOptions(projects.map((p) => p.customerName)), [projects]);
  const categoryOptions = useMemo(() => {
    const map = new Map();
    for (const p of projects) {
      const key = catKeyOf(p);
      if (!key || map.has(key)) continue;
      map.set(key, p.productSubCategory || mainCatName(p.productMainCategory) || p.productMainCategory || key);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "th"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, categories]);

  const mainColSpan = (canEdit || canDelete) ? 10 : 9;
  const archiveColSpan = (canEdit || canDelete) ? 9 : 8;

  // แถวเดียวใช้ได้ทั้งตารางหลักและคลังเก็บ — archive: จางลง, ไม่โชว์คอลัมน์ขั้นตอน/แถบเลยกำหนด, ไม่มีปุ่มแก้ไข
  const renderRow = (p, { archive = false } = {}) => {
    const { pct, done, total } = getProgress(p);
    const overdue = getOverdueCount(p);
    const cStatus = getComputedStatus(p);
    return (
      <tr key={p.id} className="premium-row" style={{ cursor: "pointer", ...(archive ? { opacity: 0.85 } : null) }} onClick={() => router.push(`/pm/projects/${p.code || p.id}`)}>
        <td>
          <div style={{ fontSize: "11px", color: "var(--text-3)" }} className="font-mono">{p.code}</div>
          <div style={{ fontSize: "13px", fontWeight: 500 }}>{p.name}</div>
        </td>
        <td>
          {p.metadata?.brand ? (
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>{p.metadata.brand}</div>
              <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{p.customerName || "-"}</div>
            </div>
          ) : (
            <div style={{ fontSize: "13px" }}>{p.customerName || "-"}</div>
          )}
        </td>
        <td><span className="ui-badge" style={typeStyle(p.type)}>{p.type}</span></td>
        <td style={{ fontSize: "12px", maxWidth: "180px" }}>
          {p.productSubCategory || p.productMainCategory ? (
            <div>
              {p.productSubCategory && <div style={{ fontWeight: 500 }}>{p.productSubCategory}</div>}
              {p.productMainCategory && <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{mainCatName(p.productMainCategory) || p.productMainCategory}</div>}
            </div>
          ) : <span style={{ color: "var(--text-3)" }}>-</span>}
        </td>
        <td style={{ fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.preparedBy ? `ผู้จัดทำ: ${p.preparedBy}` : undefined}>{p.aeOwner || "-"}</td>
        <td style={{ minWidth: "120px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="progress" style={{ flex: 1 }}>
              <span className={cStatus === "Completed" ? "done" : ""} style={{ width: `${pct}%` }} />
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{done}/{total}</span>
          </div>
          {!archive && overdue > 0 && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "2px", display: "flex", alignItems: "center", gap: "2px" }}><AlertTriangle size={10} /> เลยกำหนด {overdue} งาน</div>}
        </td>
        {!archive && <td style={{ fontSize: "12px", maxWidth: "200px" }}>{getCurrentStep(p)}</td>}
        <td style={{ fontSize: "12px" }}>{fmtDateNumeric(p.dueDate)}</td>
        <td>
          <span className={`status-pill dot ${statusPillClass(cStatus)}`} style={{ "--dot": statusDotColor(cStatus) }}>
            {cStatus}
          </span>
          {cStatus === "Dropped" && p.metadata?.lossReason && <div style={{ fontSize: "10px", color: "var(--red)", marginTop: "4px", ...(archive ? { maxWidth: "160px" } : null) }}>{p.metadata.lossReason}</div>}
        </td>
        {(canEdit || canDelete) && (
          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", gap: "4px" }}>
              {canEdit && !archive && <button className="btn-icon" onClick={() => openEdit(p)} aria-label="แก้ไขโปรเจกต์" title="แก้ไข"><Edit2 size={14} /></button>}
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
          {/* Sales เป็นแม่ (แผน merge เฟส 2): โครงการเกิดจากบริหารงานขาย — ปุ่มนี้พาไป
              สร้างโครงการที่นั่น แล้วกด "สร้างงานผลิต" เพื่อได้ timeline PM. */}
          {canEdit && (
            <Link href="/sales-planning/deals" className="btn btn-primary" style={{ padding: "0 18px", fontWeight: 600 }} title="โครงการเริ่มที่บริหารงานขาย แล้วส่งต่อมาเป็นงานผลิต">
              <Plus size={16} /> สร้างโครงการ (ที่บริหารงานขาย)
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* แถบเครื่องมือ: ค้นหา + กรอง + เรียงลำดับ */}
          <div className="toolbar">
            <div className="search-glass" style={{ width: "240px" }}>
              <Search size={18} color="var(--text-3)" />
              <input type="text" placeholder="ค้นหาโปรเจกต์..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FilterPopover
              count={activeFilterCount}
              onClear={clearAllFilters}
              groups={[
                { key: "type", label: "ประเภท", icon: Tag, options: typeOptions, selected: typeFilters, onChange: setTypeFilters, single: true },
                { key: "status", label: "สถานะ", icon: CircleDot, options: statusOptions, selected: statusFilters, onChange: setStatusFilters },
                { key: "category", label: "หมวดสินค้า", icon: Package, options: categoryOptions, selected: categoryFilters, onChange: setCategoryFilters },
                { key: "owner", label: "ผู้ดูแล", icon: UserCog, options: ownerOptions, selected: ownerFilters, onChange: setOwnerFilters },
                { key: "preparer", label: "ผู้จัดทำ", icon: PenLine, options: preparerOptions, selected: preparerFilters, onChange: setPreparerFilters },
                { key: "customer", label: "ลูกค้า", icon: Building2, options: customerOptions, selected: customerFilters, onChange: setCustomerFilters },
              ]}
            />
          </div>

          <div className="premium-glass-table table-responsive">
            <table className="premium-table">
              <thead>
                <tr>
                  <SortTh label="โปรเจกต์" sortKey="code" sort={activeSort} />
                  <SortTh label="แบรนด์" sortKey="customer" sort={activeSort} />
                  <SortTh label="ประเภท" sortKey="type" sort={activeSort} />
                  <SortTh label="หมวดสินค้า" sortKey="category" sort={activeSort} />
                  <SortTh label="ผู้ดูแล" sortKey="owner" sort={activeSort} />
                  <SortTh label="ความคืบหน้า" sortKey="progress" sort={activeSort} />
                  <SortTh label="ขั้นตอนปัจจุบัน" sortKey="step" sort={activeSort} />
                  <SortTh label="กำหนดส่ง" sortKey="due" sort={activeSort} />
                  <SortTh label="สถานะ" sortKey="status" sort={activeSort} />
                  {(canEdit || canDelete) && <th style={{ width: "70px", textAlign: "center" }}>จัดการ</th>}
                </tr>
              </thead>
              <tbody>
                {activeProjects.length === 0 ? (
                  <tr><td colSpan={mainColSpan} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>{activeFilterCount > 0 || q ? "ไม่พบโครงการตามเงื่อนไข" : "ยังไม่มีโครงการ"}</td></tr>
                ) : (
                  activePage.pageRows.map((p) => renderRow(p))
                )}
              </tbody>
            </table>
          </div>
          {activeProjects.length > 0 && (
            <Pager
              page={activePage.page}
              pageCount={activePage.pageCount}
              total={activePage.total}
              onPage={activePage.setPage}
              pageSize={activePage.pageSize}
              onPageSize={activePage.setPageSize}
            />
          )}

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
                {/* toolbar คลัง: กรองสถานะ (segmented) — เรียงลำดับทำที่หัวคอลัมน์ */}
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
                </div>

                <div className="premium-glass-table table-responsive">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <SortTh label="โปรเจกต์" sortKey="code" sort={archiveSort} />
                        <SortTh label="แบรนด์" sortKey="customer" sort={archiveSort} />
                        <SortTh label="ประเภท" sortKey="type" sort={archiveSort} />
                        <SortTh label="หมวดสินค้า" sortKey="category" sort={archiveSort} />
                        <SortTh label="ผู้ดูแล" sortKey="owner" sort={archiveSort} />
                        <SortTh label="ความคืบหน้า" sortKey="progress" sort={archiveSort} />
                        <SortTh label="กำหนดส่ง" sortKey="due" sort={archiveSort} />
                        <SortTh label="สถานะ" sortKey="status" sort={archiveSort} />
                        {(canEdit || canDelete) && <th style={{ width: "70px", textAlign: "center" }}>จัดการ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {archiveProjects.length === 0 ? (
                        <tr><td colSpan={archiveColSpan} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>
                          {q || archiveStatusFilter !== "all" ? "ไม่พบโปรเจกต์ในคลังตามเงื่อนไข" : "ยังไม่มีโปรเจกต์ที่ปิดงาน"}
                        </td></tr>
                      ) : archivePage.pageRows.map((p) => renderRow(p, { archive: true }))}
                    </tbody>
                  </table>
                </div>
                {archiveProjects.length > 0 && (
                  <Pager
                    page={archivePage.page}
                    pageCount={archivePage.pageCount}
                    total={archivePage.total}
                    onPage={archivePage.setPage}
                    pageSize={archivePage.pageSize}
                    onPageSize={archivePage.setPageSize}
                  />
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
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
      <ConfirmModal
        open={!!confirmState}
        onClose={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || "ยืนยัน"}
        danger={confirmState?.danger ?? true}
      />
    </div>
  );
}
