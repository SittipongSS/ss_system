"use client";
import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, PlusCircle, X, Flag, FileText, GanttChart,
  ListTodo, AlertTriangle, CheckCircle2, Clock, Calendar, User,
  TrendingUp, Edit2, Trash2, Save, ChevronDown, ChevronRight,
  Activity, XCircle, PauseCircle, CircleDashed, PlayCircle,
  Check, Play, Loader, Pause,
} from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import Modal from "@/components/Modal";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ProjectFormModal from "@/components/pm/ProjectFormModal";

const STATUS_TH = {
  New: "ใหม่ (New)", "In Progress": "ดำเนินการ (Active)", Completed: "เสร็จสิ้น (Completed)",
  "On Hold": "ระงับ (On Hold)", Dropped: "ยกเลิก (Dropped)",
};

const getComputedStatus = (p) => {
  if (!p) return "";
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

const ROLES = ["SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

const PHASE_COLORS = ["var(--accent)", "var(--purple)", "var(--blue)", "var(--amber)", "#f97316", "var(--green)", "var(--accent)"];

const typeStyle = (type) => type === "NPD"
  ? { background: "var(--purple)", color: "#fff" }
  : { background: "var(--blue)", color: "#fff" };

// per-department badge colors (mirror ss-cj)
const roleStyle = (role) => {
  switch (role) {
    case "SA":  return { bg: "color-mix(in srgb, var(--accent) 12%, transparent)",  border: "color-mix(in srgb, var(--accent) 35%, transparent)",  color: "var(--accent)" };
    case "RD":  return { bg: "color-mix(in srgb, var(--purple) 12%, transparent)", border: "color-mix(in srgb, var(--purple) 35%, transparent)", color: "var(--purple)" };
    case "PC":  return { bg: "color-mix(in srgb, var(--blue) 12%, transparent)",   border: "color-mix(in srgb, var(--blue) 35%, transparent)",   color: "var(--blue)" };
    case "PD":  return { bg: "color-mix(in srgb, var(--blue) 10%, transparent)",   border: "color-mix(in srgb, var(--blue) 25%, transparent)",   color: "var(--blue)" };
    case "QC":  return { bg: "color-mix(in srgb, var(--green) 12%, transparent)",  border: "color-mix(in srgb, var(--green) 35%, transparent)",  color: "var(--green)" };
    case "LG":  return { bg: "color-mix(in srgb, var(--amber) 12%, transparent)",  border: "color-mix(in srgb, var(--amber) 35%, transparent)",  color: "var(--amber)" };
    case "WH":  return { bg: "color-mix(in srgb, var(--text-2) 10%, transparent)", border: "color-mix(in srgb, var(--text-2) 25%, transparent)", color: "var(--text-2)" };
    case "ALL": return { bg: "color-mix(in srgb, var(--red) 10%, transparent)",    border: "color-mix(in srgb, var(--red) 25%, transparent)",    color: "var(--red)" };
    default:    return { bg: "var(--bg)", border: "var(--border)", color: "var(--text-2)" };
  }
};

const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Actual vs planned finish variance (mirror ss-cj)
const getVariance = (task) => {
  if (task.status !== "Completed" || !task.actualFinishDate || !task.finishDate) return null;
  const plan = new Date(task.finishDate); plan.setHours(0, 0, 0, 0);
  const actual = new Date(task.actualFinishDate); actual.setHours(0, 0, 0, 0);
  const diff = Math.round((actual - plan) / (1000 * 60 * 60 * 24));
  if (diff > 0) return { color: "var(--red)", label: `ช้ากว่าแผน ${diff} วัน` };
  if (diff < 0) return { color: "var(--green)", label: `เร็วกว่าแผน ${Math.abs(diff)} วัน` };
  return { color: "var(--green)", label: "ตรงตามแผน" };
};

function SearchableSelect({ options, value, onChange, placeholder }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selectedOpt = options.find(o => o.id === value);
  const display = open ? search : (selectedOpt ? `${selectedOpt.fgCode} — ${selectedOpt.productDescription || selectedOpt.brandName || ""}` : "");

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return options.filter(o => o.fgCode?.toLowerCase().includes(s) || o.productDescription?.toLowerCase().includes(s)).slice(0, 50);
  }, [options, search]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        className="premium-input"
        value={display}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); onChange(""); }}
        onFocus={() => { setSearch(""); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder || "ค้นหา..."}
        style={{ width: "100%", padding: "4px 10px", fontSize: "12px", height: "30px" }}
      />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "6px", maxHeight: "200px", overflowY: "auto", zIndex: 50, marginTop: "4px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {filtered.length === 0 ? <div style={{ padding: "6px 10px", fontSize: "12px", color: "var(--text-3)" }}>ไม่พบรายการ</div> : filtered.map(opt => (
            <div
              key={opt.id}
              onMouseDown={(e) => e.preventDefault()} // prevent blur before click
              onClick={() => { onChange(opt.id); setOpen(false); }}
              style={{ padding: "6px 10px", fontSize: "12px", cursor: "pointer", borderBottom: "1px solid var(--border)", color: "var(--text)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel-2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <strong>{opt.fgCode}</strong> — {opt.productDescription || opt.brandName || ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const hasEditCap = useCan("pm:edit");
  const userRole = useRole();
  const userName = typeof window !== "undefined" ? localStorage.getItem("userName") : "";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [addingProduct, setAddingProduct] = useState("");
  const [view, setView] = useState("list"); // list | document
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [taskForm, setTaskForm] = useState({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", isMilestone: false });
  const [collapsedPhases, setCollapsedPhases] = useState(() => new Set());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm/projects/${id}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (isFirstLoad.current) {
          const phases = new Set((d.tasks || []).map(t => t.phase).filter(Boolean));
          setCollapsedPhases(phases);
          isFirstLoad.current = false;
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
    fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(d || [])).catch(() => {});
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(d || [])).catch(() => {});
  }, []);

  const updateProject = async (patch) => {
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { const updated = await res.json(); setData((d) => ({ ...d, ...updated })); }
    return res.ok;
  };

  const updateTask = async (taskId, patch) => {
    const res = await fetch(`/api/pm/project-tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) {
      // a date/duration change may shift downstream steps → reload fully
      if (patch.startDate || patch.durationDays) { await load(); return; }
      const updated = await res.json();
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? updated : t)) }));
    }
  };

  const addProduct = async () => {
    if (!addingProduct) return;
    const newProducts = [...(data.projectProducts || []).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty })), { productId: addingProduct, orderQty: "", productionQty: "" }];
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts }),
    });
    if (res.ok) { setAddingProduct(""); load(); }
    else alert((await res.json()).error || "ผูกสินค้าไม่สำเร็จ");
  };

  const removeProduct = async (productId) => {
    const newProducts = (data.projectProducts || []).filter(p => p.productId !== productId).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty }));
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts }),
    });
    if (res.ok) load();
  };

  const updateProductQty = async (productId, field, value) => {
    const newProducts = (data.projectProducts || []).map(p => ({
      productId: p.productId,
      orderQty: p.productId === productId && field === 'orderQty' ? value : p.orderQty,
      productionQty: p.productId === productId && field === 'productionQty' ? value : p.productionQty,
    }));
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts }),
    });
    if (res.ok) load();
  };

  const dropProject = async () => {
    const reason = prompt("กรุณาระบุเหตุผลที่ลูกค้ายกเลิกหรือไม่ไปต่อ (เช่น ราคาแพงไป, ลูกค้าเปลี่ยนใจ, คู่แข่งได้งาน):");
    if (!reason) return;
    if (!confirm(`ต้องการยกเลิกโปรเจกต์นี้เนื่องจาก: "${reason}" ใช่หรือไม่?`)) return;
    await updateProject({ status: "Dropped", metadata: { ...(data.metadata || {}), lossReason: reason } });
  };

  const handleDeleteProject = async () => {
    if (!confirm(`ต้องการลบโปรเจกต์ "${p.code} — ${p.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`)) return;
    const res = await fetch(`/api/pm/projects/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/projects");
    } else {
      alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/pm/project-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        projectId: id, 
        ...taskForm, 
        durationDays: Number(taskForm.durationDays) || 1,
        startDate: taskForm.startDate || null,
        assignee: taskForm.assignee || null
      }),
    });
    if (res.ok) {
      setShowAddTask(false);
      setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", isMilestone: false });
      load();
    } else alert((await res.json()).error || "เพิ่มขั้นตอนไม่สำเร็จ");
  };

  const deleteTask = async (taskId, name) => {
    if (!confirm(`ต้องการลบขั้นตอน "${name}" ใช่หรือไม่?`)) return;
    const res = await fetch(`/api/pm/project-tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
  };

  const togglePhase = (phase) => setCollapsedPhases((prev) => {
    const next = new Set(prev);
    next.has(phase) ? next.delete(phase) : next.add(phase);
    return next;
  });

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditForm({
      name: task.name, role: task.role || "SA", assignee: task.assignee || "",
      durationDays: task.durationDays ?? 1, startDate: task.startDate || "",
      isMilestone: !!task.isMilestone, phase: task.phase || "",
      predecessors: task.predecessors || [],
    });
  };
  const saveEditing = async (taskId) => {
    await updateTask(taskId, {
      name: editForm.name, role: editForm.role, assignee: editForm.assignee || null,
      durationDays: Number(editForm.durationDays) || 1,
      startDate: editForm.startDate || null,
      isMilestone: editForm.isMilestone, phase: editForm.phase || null,
      predecessors: editForm.predecessors || [],
    });
    setEditingTaskId(null);
    setEditForm(null);
  };

  const handleToggleTask = (task) => {
    if (task.status === "Pending") return;
    updateTask(task.id, { status: task.status === "Completed" ? "In Progress" : "Completed" });
  };

  const tasks = data?.tasks || [];
  const phaseColorMap = useMemo(() => {
    const seen = [];
    tasks.forEach((t) => { if (t.phase && !seen.includes(t.phase)) seen.push(t.phase); });
    const m = {};
    seen.forEach((p, i) => { m[p] = PHASE_COLORS[i % PHASE_COLORS.length]; });
    return m;
  }, [tasks]);

  const processedTasks = useMemo(() => {
    let currentPhase = null;
    let phaseNum = 0;
    let taskInPhase = 0;
    
    return tasks.map(task => {
      const p = task.phase || "—";
      if (p !== currentPhase) {
        currentPhase = p;
        phaseNum++;
        taskInPhase = 1;
      } else {
        taskInPhase++;
      }
      return {
        ...task,
        phaseNum,
        taskInPhase,
        displayNumber: `${phaseNum}.${taskInPhase}`
      };
    });
  }, [tasks]);

  if (loading) return <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>กำลังโหลดข้อมูล...</div>;
  if (!data) return <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>ไม่พบโครงการ</div>;

  const p = data;
  const hasWriteAccess = hasEditCap && !!data.canEdit;
  const isLocked = p.status === "On Hold" || p.status === "Dropped" || p.status === "Completed";
  const canEdit = hasWriteAccess && !isLocked;
  const linkedIds = new Set((p.projectProducts || []).map((x) => x.productId));
  const formPhases = [...new Set(processedTasks.map((t) => t.phase).filter(Boolean))];

  const total = processedTasks.length;
  const done = processedTasks.filter((t) => t.status === "Completed").length;
  const inProg = processedTasks.filter((t) => t.status === "In Progress").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = processedTasks.filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
  const isDone = pct === 100;
  const accent = isDone ? "var(--green)" : "var(--accent)";
  const milestones = processedTasks.filter((t) => t.isMilestone);

  const renderChip = (Icon, label, color) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color, background: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`, padding: "4px 10px", borderRadius: "20px" }}>
      <Icon size={13} /> {label}
    </span>
  );

  const renderViewBtn = (mode, Icon, label) => (
    <button onClick={() => setView(mode)} style={{ background: view === mode ? "var(--accent)" : "transparent", color: view === mode ? "#fff" : "var(--text-2)", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
      <Icon size={14} /> {label}
    </button>
  );

  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || mc;

  const fgUI = (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {(p.projectProducts || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(p.projectProducts || []).map((pp) => {
            const actualProd = pp.product || {};
            return (
              <div key={pp.productId} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "10px 12px", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span className="font-mono text-[13px] font-semibold">{actualProd.fgCode}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{actualProd.volume ? `(${actualProd.volume} ml)` : ""}</span>
                    <span style={{ fontSize: "11px", background: "var(--blue-soft)", color: "var(--blue)", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                      {mainCatName(actualProd.productMainCategory) || "ไม่มีหมวด"}
                    </span>
                  </div>
                  {canEdit && <button onClick={() => removeProduct(pp.productId)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px" }}><X size={16} /></button>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: "150px" }}>
                    {actualProd.productDescription || actualProd.brandName || "-"}
                  </div>
                  <div style={{ display: "flex", gap: "8px", width: "220px", flexShrink: 0 }}>
                    <input type="text" placeholder="สั่งซื้อ" defaultValue={pp.orderQty || ""} disabled={!canEdit} onBlur={(e) => { if (e.target.value !== (pp.orderQty || "")) updateProductQty(pp.productId, "orderQty", e.target.value); }} className="premium-input w-full text-[12px] h-[30px]" />
                    <input type="text" placeholder="ผลิต" defaultValue={pp.productionQty || ""} disabled={!canEdit} onBlur={(e) => { if (e.target.value !== (pp.productionQty || "")) updateProductQty(pp.productId, "productionQty", e.target.value); }} className="premium-input w-full text-[12px] h-[30px]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          <SearchableSelect
            options={allProducts.filter(pr => !linkedIds.has(pr.id))}
            value={addingProduct}
            onChange={setAddingProduct}
            placeholder="ค้นหา Product Code (FG)..."
          />
          <button onClick={addProduct} disabled={!addingProduct} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0, height: "30px", opacity: addingProduct ? 1 : 0.5 }}><Plus size={14} /> เพิ่ม</button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Top Header Section */}
      <Link
        href="/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-2)",
          fontSize: "13px",
          fontWeight: 500,
          marginBottom: "14px",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} /> กลับไปหน้ารวมโปรเจกต์
      </Link>

      {/* Header (ss-cj Timeline header style) */}
      <div className="glass-panel" style={{ borderRadius: "16px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 600 }}>
                <span style={{ background: "var(--accent)", color: "#fff", padding: "7px", borderRadius: "9px", display: "flex" }}>
                  <GanttChart size={18} />
                </span>
                <span>Timeline Project: {p.code}</span>
                {canEdit && (
                  <div style={{ display: "flex", gap: "4px", marginLeft: "4px" }}>
                    <button onClick={() => setShowEditProject(true)} title="แก้ไขโปรเจกต์" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px", display: "flex" }}><Edit2 size={16} /></button>
                    <button onClick={handleDeleteProject} title="ลบโปรเจกต์" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px", display: "flex" }}><Trash2 size={16} /></button>
                  </div>
                )}
              </h2>
              <p style={{ margin: "5px 0 0 40px", fontSize: "12.5px", color: "var(--text-2)" }}>
                {p.name} | ลูกค้า: {p.customerName || "-"} | AE: {p.aeOwner || "-"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", background: "var(--panel)", borderRadius: "8px", padding: "4px", border: "1px solid var(--border)" }}>
                {renderViewBtn("list", ListTodo, "List")}
                {renderViewBtn("document", FileText, "Gantt")}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "24px", fontSize: "12px", flexWrap: "wrap" }}>
            <div><span style={{ color: "var(--text-3)" }}>วันเริ่ม: </span>{p.startDate || "-"}</div>
            <div><span style={{ color: "var(--text-3)" }}>กำหนดส่ง: </span>{p.dueDate || "-"}</div>
            <div><span style={{ color: "var(--text-3)" }}>หมวดสินค้า: </span>{p.productMainCategory || "-"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`status-pill ${statusPillClass(getComputedStatus(p))}`} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusDotColor(getComputedStatus(p)) }} />
              {getComputedStatus(p)}
            </span>
          </div>
        </div>

        </div>

      {p.status === "Dropped" && (
        <div style={{ marginBottom: "24px", padding: "18px 24px", background: "color-mix(in srgb, var(--red) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)", borderRadius: "12px", borderLeft: "5px solid var(--red)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", zIndex: 10, position: "relative" }}>
          <div>
            <div style={{ color: "var(--red)", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}><X size={16} strokeWidth={3} /> โปรเจกต์นี้ถูกยกเลิกแล้ว</div>
            {p.metadata?.lossReason && (
              <div style={{ fontSize: "13px", color: "var(--red)", display: "flex", alignItems: "flex-start", gap: "6px", fontWeight: 500 }}>
                <span style={{ fontWeight: 700 }}>เหตุผล:</span> <span>{p.metadata.lossReason}</span>
              </div>
            )}
          </div>
          {hasWriteAccess && (userRole === "senior_ae" || userRole === "ae_supervisor") && (
            <button
              type="button"
              onClick={() => updateProject({ status: "In Progress" })}
              style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Activity size={14} /> ดึงกลับมาดำเนินการ (Restore)
            </button>
          )}
        </div>
      )}

      <div style={{ opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none", transition: "all 0.3s", pointerEvents: isLocked ? "none" : "auto" }}>
      {view === "document" ? (
        <div className="glass-panel" style={{ padding: "20px", marginBottom: "24px" }}>
          <ProjectDocumentView
            project={p}
            canEdit={canEdit}
            onUpdateProject={updateProject}
            onUpdateTask={updateTask}
            fgUI={fgUI}
            statusLabel={getComputedStatus(p)}
            statusColor={statusDotColor(getComputedStatus(p))}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>ความคืบหน้า (Progress List)</div>
            {canEdit && (
              <button onClick={() => { setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [], assignee: "", startDate: "", isMilestone: false }); setShowAddTask(true); }} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "6px" }}>
                <Plus size={14} /> เพิ่มขั้นตอน
              </button>
            )}
          </div>

          {/* progress summary & milestones */}
          <div className="glass-panel" style={{ padding: "20px 22px", background: "var(--panel-2)", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span style={{ fontSize: "36px", fontWeight: 700, lineHeight: 1, color: accent, letterSpacing: "-1px" }}>
                  {pct}<span style={{ fontSize: "18px", fontWeight: 600 }}>%</span>
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <TrendingUp size={15} color={accent} /> เสร็จแล้ว {done} จาก {total} ขั้นตอน
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {renderChip(CircleDashed, `รอดำเนินการ ${total - done - inProg}`, "var(--text-3)")}
                {renderChip(Clock, `กำลังทำ ${inProg}`, "var(--accent)")}
                {renderChip(CheckCircle2, `เสร็จสิ้น ${done}`, "var(--green)")}
                {overdue > 0 && renderChip(AlertTriangle, `เลยกำหนด ${overdue}`, "var(--red)")}
              </div>
            </div>
            <div style={{ height: "8px", background: "var(--bg)", borderRadius: "6px", overflow: "hidden", marginBottom: milestones.length > 0 ? "16px" : "0" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: "6px", background: isDone ? "var(--green)" : "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #fff))", transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </div>

            {/* milestone stepping stones */}
            {milestones.length > 0 && (
              <div style={{ paddingTop: "16px", borderTop: "1px dashed var(--border)", overflowX: "auto", paddingBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "max-content", paddingBottom: "4px" }}>
                  {milestones.map((m, i) => {
                    const mDone = m.status === "Completed";
                    const mProg = m.status === "In Progress";
                    const color = mDone ? "var(--green)" : (mProg ? "var(--accent)" : "var(--border-strong)");
                    const icon = mDone ? <Check size={14} strokeWidth={3} color="#fff" /> : (mProg ? <Clock size={14} strokeWidth={2.5} color="#fff" /> : <span style={{ fontSize: "10px", color: "var(--text-3)" }}>{m.displayNumber || (i + 1)}</span>);
                    return (
                      <Fragment key={m.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: mDone || mProg ? 1 : 0.6 }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: mDone || mProg ? color : "var(--bg)", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: mDone || mProg ? "var(--text)" : "var(--text-2)" }}>{m.name}</div>
                        </div>
                        {i < milestones.length - 1 && <div style={{ width: "30px", height: "2px", background: mDone ? "var(--green)" : "var(--border)" }} />}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {total === 0 && (
            <div className="glass-panel" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีขั้นตอนงาน</div>
          )}

          {/* task timeline */}
          {processedTasks.map((task, idx) => {
            const isCompleted = task.status === "Completed";
            const isInProgress = task.status === "In Progress";
            const isEditing = editingTaskId === task.id;
            const prevPhase = processedTasks[idx - 1]?.phase ?? null;
            const isFirstOfPhase = task.phase && task.phase !== prevPhase;
            const isCollapsedPhase = task.phase && collapsedPhases.has(task.phase);
            if (isCollapsedPhase && !isFirstOfPhase) return null;

            const phaseHeader = isFirstOfPhase ? (() => {
              const phaseTasks = processedTasks.filter((t) => t.phase === task.phase);
              const d = phaseTasks.filter((t) => t.status === "Completed").length;
              const tot = phaseTasks.length;
              const ppct = tot ? Math.round((d / tot) * 100) : 0;
              const allDone = d === tot;
              const hasActive = phaseTasks.some((t) => t.status === "In Progress");
              const color = allDone ? "var(--green)" : hasActive ? "var(--accent)" : "var(--text-3)";
              return { done: d, total: tot, pct: ppct, allDone, color, accent: phaseColorMap[task.phase] || "var(--accent)", num: task.phaseNum };
            })() : null;

            const nextSamePhase = processedTasks[idx + 1]?.phase === task.phase;
            const showConnector = nextSamePhase;

            return (
              <div key={task.id} style={{ display: "flex", flexDirection: "column" }}>
                {isFirstOfPhase && phaseHeader && (
                  <button onClick={() => togglePhase(task.phase)} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "9px 14px", marginBottom: isCollapsedPhase ? "0" : "8px", background: `color-mix(in srgb, ${phaseHeader.accent} 7%, var(--panel))`, border: "none", borderLeft: `3px solid ${phaseHeader.accent}`, borderRadius: "10px", cursor: "pointer", textAlign: "left" }}>
                    {isCollapsedPhase ? <ChevronRight size={14} color={phaseHeader.accent} /> : <ChevronDown size={14} color={phaseHeader.accent} />}
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{phaseHeader.num}. {task.phase}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: phaseHeader.color }}>{phaseHeader.done}/{phaseHeader.total}</span>
                    {phaseHeader.allDone ? <CheckCircle2 size={13} color="var(--green)" /> : (
                      <div style={{ width: "52px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${phaseHeader.pct}%`, background: phaseHeader.color, borderRadius: "2px", transition: "width 0.3s" }} />
                      </div>
                    )}
                  </button>
                )}

                {!isCollapsedPhase && (
                  <div style={{ display: "flex", flexDirection: "column", paddingLeft: task.phase ? "12px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
                      {/* Milestone icon outside card */}
                      <div style={{ width: "28px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {task.isMilestone && <Flag size={14} color="var(--amber)" strokeWidth={2.5} />}
                      </div>
                    <div style={{ flex: 1, display: "flex", gap: "16px", padding: "16px 18px", background: task.isMilestone ? "color-mix(in srgb, var(--amber) 8%, transparent)" : (isCompleted ? "color-mix(in srgb, var(--green) 5%, transparent)" : (isInProgress ? "var(--panel-2)" : "var(--panel)")), border: `1px solid ${isCompleted ? "color-mix(in srgb, var(--green) 30%, transparent)" : (isInProgress ? "var(--accent)" : (task.isMilestone ? "color-mix(in srgb, var(--amber) 35%, transparent)" : "var(--border)"))}`, borderRadius: "14px", transition: "all 0.2s", position: "relative", boxShadow: isInProgress ? "0 6px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)" : "none" }}>
                      {showConnector && <div style={{ position: "absolute", left: "29px", top: "50px", bottom: "-20px", width: "2px", background: isCompleted ? "var(--green)" : "var(--border)", borderRadius: "2px", zIndex: 0 }} />}

                      <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <button onClick={() => canEdit && handleToggleTask(task)} disabled={!canEdit || task.status === "Pending" || isEditing} style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isCompleted ? "var(--green)" : (isInProgress ? "var(--accent)" : "var(--bg)"), border: `2px solid ${isCompleted ? "var(--green)" : (isInProgress ? "var(--accent)" : "var(--border)")}`, color: "#fff", cursor: !canEdit || task.status === "Pending" || isEditing ? "not-allowed" : "pointer", padding: 0, boxShadow: isInProgress ? "0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)" : "none", transition: "all 0.2s" }}>
                          {isCompleted ? <Check size={16} strokeWidth={3} /> : (isInProgress ? <Clock size={15} strokeWidth={2.5} /> : <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)" }}>{task.displayNumber}</span>)}
                        </button>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--panel)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <input className="premium-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="ชื่อขั้นตอน" style={{ flex: 1 }} />
                              <select className="premium-select" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} style={{ width: "100px" }}>
                                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>วันที่เริ่ม:</label>
                                <input type="date" className="premium-input" value={editForm.startDate || ""} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} style={{ width: "150px" }} title="วันเริ่มของขั้นตอนนี้" />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>จำนวนวัน:</label>
                                <input type="number" min="1" className="premium-input" value={editForm.durationDays} onChange={(e) => setEditForm({ ...editForm, durationDays: e.target.value })} style={{ width: "64px" }} title="จำนวนวันทำการของขั้นตอนนี้" />
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-2)", cursor: "pointer" }}>
                                <input type="checkbox" checked={editForm.isMilestone || false} onChange={(e) => setEditForm({ ...editForm, isMilestone: e.target.checked })} style={{ accentColor: "var(--amber)", cursor: "pointer" }} />
                                ตั้งเป็น Milestone
                              </label>
                            </div>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                              <label style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600 }}>งานที่ต้องรอให้เสร็จก่อน (Predecessors):</label>
                              <div style={{ maxHeight: "120px", overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                                {processedTasks.filter(t => t.id !== task.id).length === 0 ? (
                                  <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center" }}>ไม่มีขั้นตอนงานอื่น</div>
                                ) : processedTasks.filter(t => t.id !== task.id).map((t) => (
                                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
                                    <input 
                                      type="checkbox" 
                                      checked={editForm.predecessors?.includes(t.id) || false}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setEditForm(f => ({
                                          ...f,
                                          predecessors: checked ? [...(f.predecessors || []), t.id] : (f.predecessors || []).filter(id => id !== t.id)
                                        }));
                                      }}
                                      style={{ accentColor: "var(--accent)" }}
                                    />
                                    <span>{t.displayNumber}. {t.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div style={{ fontSize: "11px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Calendar size={11} /> ระบบคำนวณวันเสร็จจากวันเริ่ม + จำนวนวันทำการ
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                              <button className="btn btn-secondary" onClick={() => { setEditingTaskId(null); setEditForm(null); }} style={{ padding: "4px 12px", fontSize: "12px" }}>ยกเลิก</button>
                              <button className="btn btn-primary" onClick={() => saveEditing(task.id)} style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}><Save size={14} /> บันทึก</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "8px" }}>
                              <h4 style={{ margin: 0, fontSize: "15px", color: isCompleted ? "var(--green)" : "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span>{task.displayNumber}. {task.name}</span>
                              </h4>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                {(() => { const rs = roleStyle(task.role); return (
                                  <span style={{ fontSize: "11px", fontWeight: 700, color: rs.color, background: rs.bg, padding: "3px 9px", borderRadius: "12px", border: `1px solid ${rs.border}` }}>{task.role}</span>
                                ); })()}
                                {canEdit && (
                                  <select className="premium-select" value={task.status} onChange={(e) => updateTask(task.id, { status: e.target.value })} style={{ fontSize: "11px", padding: "4px 26px 4px 10px", height: "auto", width: "auto", minWidth: "120px" }}>
                                    <option value="Pending">○ รอดำเนินการ</option>
                                    <option value="In Progress">◷ กำลังทำ</option>
                                    <option value="Completed">✓ เสร็จแล้ว</option>
                                  </select>
                                )}
                                {canEdit && (
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    <button onClick={() => startEditing(task)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px" }} title="แก้ไข"><Edit2 size={14} /></button>
                                    <button onClick={() => deleteTask(task.id, task.name)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "4px" }} title="ลบขั้นตอน"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-3)", marginTop: "8px", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><Clock size={14} /> {task.durationDays} วันทำการ</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> {formatDate(task.startDate)} - {formatDate(task.finishDate)}</div>
                            </div>
                            {(() => {
                              const v = getVariance(task);
                              return v ? (
                                <div style={{ fontSize: "11px", color: v.color, marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                                  <CheckCircle2 size={12} /> เสร็จจริง {formatDate(task.actualFinishDate)} · {v.label}
                                </div>
                              ) : null;
                            })()}
                          </>
                        )}
                      </div>

                      {isInProgress && !isEditing && canEdit && (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <button className="btn btn-primary" onClick={() => updateTask(task.id, { status: "Completed" })} style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "8px", background: "var(--green)", borderColor: "var(--green)" }}>✔ ทำเสร็จแล้ว</button>
                        </div>
                      )}
                    </div>
                    </div>{/* close milestone wrapper */}

                    {canEdit && !isEditing && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0", zIndex: 2 }}>
                        <button onClick={() => { setTaskForm({ name: "", role: task.role || "SA", phase: task.phase || "", durationDays: 1 }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอน">
                          <PlusCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}
      </div>

      {/* Footer — ยกเลิกโปรเจกต์ (Drop) หรือ On Hold */}
      {hasWriteAccess && p.status !== "Completed" && p.status !== "Dropped" && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          {p.status === "On Hold" ? (
            (p.aeOwner === userName || userRole === "ae_supervisor") && (
              <button
                type="button"
                onClick={() => updateProject({ status: "In Progress" })}
                style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <CheckCircle2 size={14} /> ดึงกลับมาดำเนินการ (Restore)
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                onClick={() => updateProject({ status: "On Hold" })}
                style={{ background: "var(--amber)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Clock size={14} /> ระงับชั่วคราว (On Hold)
              </button>
              <button
                type="button"
                onClick={dropProject}
                style={{ background: "var(--red)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <X size={14} /> ยกเลิกโปรเจกต์ (Drop)
              </button>
            </>
          )}

          {p.status === "On Hold" && (
            <button
              type="button"
              onClick={dropProject}
              style={{ background: "var(--red)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <X size={14} /> ยกเลิกโปรเจกต์ (Drop)
            </button>
          )}
        </div>
      )}

      {/* Add task modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="เพิ่มขั้นตอน" size="md">
        <form onSubmit={addTask}>
          <div className="grid gap-[14px]">
            <div className="form-group">
              <label>ชื่อขั้นตอน <span className="text-[var(--red)]">*</span></label>
              <input value={taskForm.name} onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))} required className="premium-input w-full" placeholder="ระบุชื่อขั้นตอน" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>แผนก (Role)</label>
                <select value={taskForm.role} onChange={(e) => setTaskForm((f) => ({ ...f, role: e.target.value }))} className="premium-input w-full">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label>วันที่เริ่ม <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เว้นว่างเพื่ออิงตามงานที่รอ)</span></label>
                <input type="date" value={taskForm.startDate} onChange={(e) => setTaskForm((f) => ({ ...f, startDate: e.target.value }))} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>จำนวนวันทำการ</label>
                <input type="number" min="1" value={taskForm.durationDays} onChange={(e) => setTaskForm((f) => ({ ...f, durationDays: e.target.value }))} className="premium-input w-full" />
              </div>
            </div>

            <div className="form-group">
              <label>เฟส (Phase)</label>
              <input list="phase-list" value={taskForm.phase} onChange={(e) => setTaskForm((f) => ({ ...f, phase: e.target.value }))} className="premium-input w-full" placeholder="เลือกหรือพิมพ์เฟสใหม่" />
              <datalist id="phase-list">{formPhases.map((ph) => <option key={ph} value={ph} />)}</datalist>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text)", fontWeight: 500 }}>
              <input type="checkbox" checked={taskForm.isMilestone} onChange={(e) => setTaskForm((f) => ({ ...f, isMilestone: e.target.checked }))} style={{ accentColor: "var(--amber)", width: "16px", height: "16px", cursor: "pointer" }} />
              ตั้งเป็น Milestone <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)", padding: "2px 8px", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)", marginLeft: "4px", display: "inline-flex", alignItems: "center", fontWeight: 600 }}><Flag size={10} style={{ marginRight: "4px" }} /> จุดสังเกตหลัก</span>
            </label>

            <div className="form-group border-t border-[var(--border)] pt-[14px]">
              <label>งานที่ต้องรอให้เสร็จก่อน (Predecessors) <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เลือกได้หลายงาน)</span></label>
              <div style={{ maxHeight: "150px", overflowY: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {tasks.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center" }}>ยังไม่มีขั้นตอนงานในโปรเจกต์</div>
                ) : tasks.map((t, i) => (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={taskForm.predecessors?.includes(t.id) || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTaskForm(f => ({
                          ...f,
                          predecessors: checked ? [...(f.predecessors || []), t.id] : (f.predecessors || []).filter(id => id !== t.id)
                        }));
                      }}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span>{i + 1}. {t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowAddTask(false)} className="btn">ยกเลิก</button>
            <button type="submit" className="btn btn-primary px-8">เพิ่ม</button>
          </div>
        </form>
      </Modal>

      {showEditProject && (
        <ProjectFormModal
          open={showEditProject}
          onClose={() => setShowEditProject(false)}
          editingId={p.id}
          initialData={p}
          onSuccess={(updatedData) => {
            setShowEditProject(false);
            setData((d) => ({ ...d, ...updatedData }));
          }}
          customers={customers}
          categories={categories}
          allProducts={allProducts}
          users={users}
        />
      )}
    </div>
  );
}
