"use client";
import Select from "@/components/ui/Select";

// หน้ารวมโครงการ (/sa/projects — เฟส B, SALES_REVAMP_PLAN §5):
// โครงการ = ภาชนะรวมดีล (SCENT→NPD→RE-ORDER…) — ตารางทุกโครงการพร้อม KPI
// FC Total / Actual / FC คงเหลือ ต่อแถว (rollup จากดีล — ห้ามกรอกมูลค่าที่โครงการ)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search, RefreshCw, Target, LineChart, BarChart3, ClipboardList, Plus, Pencil, Trash2 } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { useCan } from "@/lib/roleContext";
import { dealTypeBadge, KpiCard } from "@/components/salesPlanning/ui";
import { fmtMoneyCompact, fmtName } from "@/lib/format";
import { brandDisplayFromList } from "@/lib/master/brands";

const money = (v) => fmtMoneyCompact(v);

export default function ProjectsIndexPage() {
  const canView = useCan("salesplan:view");
  const canEdit = useCan("salesplan:edit");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active = ไม่รวม Done/Drop

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [res, custRes, catRes] = await Promise.all([
        fetch("/api/pm/projects"),
        fetch("/api/master/customers"),
        fetch("/api/master/product-types"),
      ]);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดโครงการไม่สำเร็จ");
      setRows(await res.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (e) {
      setError(e.message || "โหลดโครงการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteProject = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/pm/projects/${deleteTarget.id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    setDeleteTarget(null);
    if (!res.ok) {
      setError(payload.error || "ลบโครงการไม่สำเร็จ");
      return;
    }
    await load();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter === "active" && ["Done", "Drop"].includes(p.status)) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const brand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
      return [p.code, p.name, p.customerName, brand, p.formulaName, ...(p.deals || []).map((d) => d.title)]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, customers]);

  // KPI รวมของโครงการที่กรองอยู่ — บวกจาก rollup ต่อโครงการ (นิยามเดียวกับต่อแถว)
  const totals = useMemo(() => {
    const t = { fcTotal: 0, actual: 0, fcRemaining: 0, deals: 0 };
    for (const p of filtered) {
      const r = p.dealsRollup || {};
      t.fcTotal += Number(r.fcTotal || 0);
      t.actual += Number(r.actual || 0);
      t.fcRemaining += Number(r.fcRemaining || 0);
      t.deals += Number(r.dealCount || 0);
    }
    return t;
  }, [filtered]);

  const taskProgress = (p) => {
    const tasks = p.tasks || [];
    if (!tasks.length) return "-";
    const done = tasks.filter((t) => t.status === "Done").length;
    return `${done}/${tasks.length}`;
  };

  if (!canView) {
    return (
      <Workspace icon={<FolderKanban size={22} />} title="โครงการ">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title="โครงการ"
      subtitle="ภาชนะรวมดีลของลูกค้าแต่ละงาน — มูลค่าโครงการ rollup จากดีลทุกใบ (FC Total · Actual · FC คงเหลือ)"
      headerRight={
        <div className="flex gap-2">
          <button type="button" className="btn ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </button>
          <button type="button" className="btn primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} aria-hidden="true" /> สร้างโครงการ
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        <section className="kpi-grid" aria-busy={loading}>
          <KpiCard icon={<BarChart3 size={16} aria-hidden="true" />} label="FC Total" value={money(totals.fcTotal)} hint="แผนทั้งหมดของโครงการที่แสดง" />
          <KpiCard icon={<LineChart size={16} aria-hidden="true" />} label="Actual" value={money(totals.actual)} hint="ยอดเก็บจริง (ดีล Won)" />
          <KpiCard icon={<Target size={16} aria-hidden="true" />} label="FC คงเหลือ" value={money(totals.fcRemaining)} hint="ดีลเปิดที่ยังต้องตามปิด" />
          <KpiCard icon={<ClipboardList size={16} aria-hidden="true" />} label="โครงการ / ดีล" value={`${filtered.length} / ${totals.deals}`} hint="ตามตัวกรองปัจจุบัน" />
        </section>

        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาโครงการ / ลูกค้า / สูตร / ดีล" aria-label="ค้นหาโครงการ" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 170 }}>
              <option value="active">กำลังดำเนินการ</option>
              <option value="all">ทุกสถานะ</option>
              <option value="Done">Done</option>
              <option value="Drop">Drop</option>
            </Select>
            <div className="spacer" />
            <span className="ui-badge">{filtered.length} โครงการ</span>
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>โครงการ</th>
                  <th>ลูกค้า</th>
                  <th>ดีล</th>
                  <th className="num">FC Total</th>
                  <th className="num">Actual</th>
                  <th className="num">FC คงเหลือ</th>
                  <th>ขั้นตอน</th>
                  <th>ผู้ดูแล (AE)</th>
                  <th style={{ textAlign: "right" }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const r = p.dealsRollup || {};
                  const projectBrand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
                  const firstDeal = (p.deals || [])[0];
                  const canEditProject = canEdit && p.canEdit && !["On Hold", "Dropped", "Completed"].includes(p.status);
                  const canDeleteProject = !!p.canDelete;
                  return (
                    <DetailRow key={p.id} href={`/sa/projects/${p.code || p.id}`} className="premium-row">
                      <td>
                        <Link href={`/sa/projects/${p.code || p.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้าโครงการ">
                          <strong>{p.name || "-"}</strong>
                          <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                            {p.code || p.id}{p.formulaName ? ` · สูตร ${p.formulaName}` : ""}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <strong style={{ display: "block", fontWeight: 650 }}>{p.customerName || "-"}</strong>
                        <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: 12 }}>{projectBrand || "-"}</span>
                      </td>
                      <td>
                        <div style={{ minWidth: 150 }}>
                          {firstDeal ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              {dealTypeBadge(firstDeal.dealType || firstDeal.metadata?.projectType)}
                              <Link href={`/sa/deals/${firstDeal.id}`} className="linklike" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstDeal.title || "-"}</Link>
                            </div>
                          ) : <span style={{ color: "var(--text-3)" }}>-</span>}
                          <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: 12 }}>{(p.deals || []).length} ดีล</span>
                        </div>
                      </td>
                      <td className="num mono">{money(r.fcTotal || 0)}</td>
                      <td className="num mono" style={{ color: "var(--green)" }}>{money(r.actual || 0)}</td>
                      <td className="num mono" style={{ color: (r.fcRemaining || 0) > 0 ? "var(--amber)" : "var(--text-3)" }}>{money(r.fcRemaining || 0)}</td>
                      <td>{taskProgress(p)}</td>
                      <td>{p.aeOwner ? fmtName({ name: p.aeOwner }) : (p.team || "-")}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="flex items-center gap-2 justify-end">
                          {canEditProject && (
                            <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={() => setEditingProject(p)} aria-label={`แก้ไข ${p.name || p.code}`} title="แก้ไขโครงการ">
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                          )}
                          {canDeleteProject && (
                            <button type="button" className="btn-icon danger" onClick={() => setDeleteTarget(p)} aria-label={`ลบ ${p.name || p.code}`} title="ลบโครงการ">
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}
                          {!canEditProject && !canDeleteProject && <span style={{ color: "var(--text-3)" }}>-</span>}
                        </div>
                      </td>
                    </DetailRow>
                  );
                })}
                {!filtered.length && !loading && (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีโครงการตามตัวกรองนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      <SalesProjectCreateModal
        open={showCreateModal || !!editingProject}
        onClose={() => { setShowCreateModal(false); setEditingProject(null); }}
        editingId={editingProject?.id || null}
        initialData={editingProject}
        onSuccess={(data) => {
          if (editingProject) {
            setEditingProject(null);
            load();
            return;
          }
          setShowCreateModal(false);
          const project = data?.project;
          if (project?.code || project?.id) window.location.href = `/sa/projects/${project.code || project.id}`;
          else load();
        }}
        customers={customers}
        categories={categories}
      />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteProject}
        title="ลบโครงการ"
        message={deleteTarget ? `ต้องการลบโครงการ “${deleteTarget.code || deleteTarget.id} — ${deleteTarget.name || "-"}” และขั้นตอนทั้งหมดใช่หรือไม่?${(deleteTarget.deals || []).length ? " หากโครงการยังผูกกับดีล ระบบจะไม่อนุญาตให้ลบจากหน้านี้" : ""}` : ""}
        confirmLabel="ลบ"
      />
    </Workspace>
  );
}
