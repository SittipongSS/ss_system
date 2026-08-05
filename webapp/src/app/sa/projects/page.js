"use client";
import { TableScroll } from "@/components/ui/Table";
import Select from "@/components/ui/Select";

// หน้ารวมโครงการ (/sa/projects — เฟส B, SALES_REVAMP_PLAN §5):
// โครงการ = ภาชนะรวมดีล (SCENT→NPD→RE-ORDER…) — ตารางทุกโครงการพร้อม KPI
// FC Total / Actual / FC คงเหลือ ต่อแถว (rollup จากดีล — ห้ามกรอกมูลค่าที่โครงการ)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search, RefreshCw, Target, LineChart, BarChart3, ClipboardList, Plus } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { useCan } from "@/lib/roleContext";
import { dealTypeTooltip, summarizeProjectDealTypes } from "@/lib/sales/projectDealTypes";
import styles from "./page.module.css";
import { CLOSED_WORK_STATUSES, PROJECT_WORK_STATUSES, projectStatusLabel } from "@/lib/pm/projectLifecycle";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName } from "@/lib/format";
import { brandDisplayFromList } from "@/lib/master/brands";
import { businessLineLabel, isBusinessLine } from "@/lib/master/businessLines";

/* เงินเต็มรูปแบบ ไม่ย่อ K/M (มติผู้ใช้ 2026-08-02) — ตัวเลขที่ย่อแล้วเอาไปเทียบกับ
   ใบเสนอราคา/SO ไม่ได้ ต้องเปิดหน้าอื่นดูเลขจริงอยู่ดี · คอลัมน์จัดการที่ถอดออกไป
   คืนความกว้างมาให้พอดี */
const money = (v) => fmtMoney(v);

export default function ProjectsIndexPage() {
  const canView = useCan("salesplan:view");
  /* ⚠️ หน้านี้ "อ่านอย่างเดียว" โดยเจตนา (มติผู้ใช้ 2026-08-02) — ต่างจากหน้ารายการ
     ลีด/ดีล ที่ยังมีปุ่มก้าวถัดไป + เมนู "…" ในแถว
     ทำไม: การควบคุมโครงการทั้งชุดอยู่บนการ์ด Record Control ของหน้ารายละเอียดแล้ว
     (#902) การมีปุ่มสองที่แปลว่าต้องดูแลกติกาสองที่ และแถวก็ยาวจนเลขเงินไม่มีที่อยู่
     ⇒ ถ้าจะเอาปุ่มกลับมา ให้เอา `RecordActionMenu` + lifecycle เดิมกลับมาทั้งก้อน
     อย่าเขียนปุ่มเฉพาะกิจใหม่ */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active = ไม่รวม Done/Drop

  const [showCreateModal, setShowCreateModal] = useState(false);
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

  /* การเดินสถานะ (ระงับ / ยกเลิก / ดึงกลับ / ขอปิด / อนุมัติปิด) และการแก้ไข-ลบ
     ย้ายไปอยู่บนการ์ด Record Control ของหน้ารายละเอียดทั้งหมดแล้ว (#902)
     หน้านี้จึงไม่ยิง PATCH / DELETE / POST close อีกต่อไป — โหลดอย่างเดียว */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      /* 🐞 ของเดิมกรองด้วย ["Done","Drop"] ซึ่ง **ไม่ใช่ค่าที่มีอยู่จริง** — CHECK ของตาราง
         ยอมแค่ New / In Progress / Completed / On Hold / Dropped
         ผลคือ "กำลังดำเนินการ" ไม่เคยกรองอะไรออกเลย และเลือก Done/Drop แล้วตารางว่างตลอด */
      if (statusFilter === "active" && CLOSED_WORK_STATUSES.includes(p.status)) return false;
      if (statusFilter === "closed" && !CLOSED_WORK_STATUSES.includes(p.status)) return false;
      if (!["active", "all", "closed"].includes(statusFilter) && p.status !== statusFilter) return false;
      if (!q) return true;
      const brand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
      return [p.code, p.name, p.customerName, brand, p.formulaName, ...(p.deals || []).map((d) => d.title)]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, customers]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, { resetKey: `${query}|${statusFilter}` });

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
    // 🐞 ของเดิมนับ "Done" แต่ project_tasks ใช้ Pending / In Progress / Completed
    //    คอลัมน์ "ขั้นตอน" จึงอ่านว่า 0/N ทุกแถวมาตลอด
    const done = tasks.filter((t) => t.status === "Completed").length;
    return `${done}/${tasks.length}`;
  };

  if (!canView) {
    return (
      <SaWorkspace icon={<FolderKanban size={22} />} title="โครงการ">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </SaWorkspace>
    );
  }

  return (
    <SaWorkspace
      icon={<FolderKanban size={22} />}
      title="โครงการ"
      subtitle="ภาชนะรวมดีลของลูกค้าแต่ละงาน — มูลค่าโครงการ rollup จากดีลทุกใบ (FC Total · Actual · FC คงเหลือ)"
      headerRight={
        <div className="flex gap-2">
          <button type="button" className="btn ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </button>
          <button type="button" className="btn btn-accent" onClick={() => setShowCreateModal(true)}>
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

        <SaMetricStrip>
          <SaMetric icon={<BarChart3 />} label="FC Total" value={money(totals.fcTotal)} note="แผนทั้งหมดของโครงการที่แสดง" />
          <SaMetric icon={<LineChart />} label="Actual" value={money(totals.actual)} note="ยอดจาก ใบสั่งขายที่อนุมัติแล้ว" tone="good" />
          <SaMetric icon={<Target />} label="FC คงเหลือ" value={money(totals.fcRemaining)} note="ดีลเปิดที่ยังต้องตามปิด" tone={totals.fcRemaining ? "warning" : undefined} />
          <SaMetric icon={<ClipboardList />} label="โครงการ / ดีล" value={`${filtered.length} / ${totals.deals}`} note="ตามตัวกรองปัจจุบัน" />
          {/* ⚠️ เคยมีตัวนับ "ยังไม่ระบุสาย" อยู่ตรงนี้ — ถอดออก (มติผู้ใช้ 2026-08-05)
              ฟอร์มสร้าง/แก้โครงการบังคับเลือกสายแล้ว ตัวนับจึงเป็น 0 ตลอด และ
              แถบนี้เป็นแถบเงินล้วน · ตัวทวงยังอยู่ที่ป้ายในแถวตารางด้านล่าง
              ⇒ ถ้าวันไหนสายกลับมาว่างได้อีก (เช่นนำเข้าข้อมูลตรงเข้า DB)
                 ให้เอาตัวนับกลับมา อย่าปล่อยให้ NULL หายเงียบเหมือน `projects.type` */}
        </SaMetricStrip>

        <SaSection icon={<FolderKanban size={17} />} title="ทะเบียนโครงการ" subtitle="ค้นหา กรอง และเปิดดูข้อมูลโครงการทั้งหมด" actions={<span className="ui-badge">{filtered.length} โครงการ</span>}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาโครงการ / ลูกค้า / สูตร / ดีล" aria-label="ค้นหาโครงการ" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 170 }}>
              <option value="active">กำลังดำเนินการ</option>
              <option value="all">ทุกสถานะ</option>
              <option value="closed">ปิด/ยกเลิกแล้ว</option>
              {/* ตัวเลือกรายสถานะมาจากรายชื่อจริง — เดิมพิมพ์ค่าที่ระบบไม่รู้จักไว้ 2 ค่า */}
              {PROJECT_WORK_STATUSES.map((status) => (
                <option key={status} value={status}>{projectStatusLabel(status)}</option>
              ))}
            </Select>
            <div className="spacer" />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
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
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const r = p.dealsRollup || {};
                  const projectBrand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
                  const dealTypes = summarizeProjectDealTypes(p.deals);
                  return (
                    <DetailRow key={p.id} href={`/sa/projects/${p.code || p.id}`} className="premium-row">
                      <td>
                        {/* prefetch={false}: ลิสต์ยาว — กัน RSC prefetch ต่อแถว */}
                        <Link prefetch={false} href={`/sa/projects/${p.code || p.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้าโครงการ">
                          <strong>{p.name || "-"}</strong>
                          <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                            {p.code || p.id}{p.formulaName ? ` · สูตร ${p.formulaName}` : ""}
                          </span>
                          {/* ⚠️ ป้ายนี้คือตัวทวงที่ตัวกรองพัดหายไม่ได้ — ต่างจากตัวนับบนแถบ KPI
                              ที่ขยับตามตัวกรอง · โครงการที่ยังไม่ระบุสายต้องสะดุดตาตรงที่มันอยู่ */}
                          <span className={`ui-badge ${styles.lineBadge}${isBusinessLine(p.line) ? "" : ` ${styles.lineBadgeUnset}`}`}>
                            {businessLineLabel(p.line)}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <strong style={{ display: "block", fontWeight: "var(--fw-bold)" }}>{p.customerName || "-"}</strong>
                        <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{projectBrand || "-"}</span>
                      </td>
                      <td>
                        {/* โครงการสะสมดีลไปเรื่อย ๆ — คอลัมน์นี้ตอบว่า "ผ่านงานชนิดไหนมาแล้วกี่ครั้ง"
                            ไม่ใช่ชื่อดีลใบแรกใบเดียวเหมือนเดิม (มติผู้ใช้ 2026-08-02)
                            ชนิดมีแค่ 3 → ยาวสุด 3 ชิป ไม่ต้องมีกติกาตัดทิ้งให้ข้อมูลหายเงียบ */}
                        {dealTypes.length ? (
                          <div className={styles.dealTypes}>
                            {dealTypes.map((row) => (
                              <Link
                                key={row.type}
                                prefetch={false}
                                /* 1 ใบ → ไปดีลใบนั้นเลย · หลายใบ → ไปหน้าโครงการที่ลิสต์ครบ
                                   ความหมายเดียวกันทั้งสองทาง: "กดแล้วได้เห็นดีลกลุ่มนี้" */
                                href={row.count === 1
                                  ? `/sales-planning/deals/${row.deals[0].id}`
                                  : `/sa/projects/${p.code || p.id}`}
                                className={styles.dealTypeChip}
                                title={dealTypeTooltip(row)}
                              >
                                {dealTypeBadge(row.type, "ui-badge-cell ui-badge-w-deal-type")}
                                {row.count > 1 && <span className={styles.dealTypeCount}>×{row.count}</span>}
                              </Link>
                            ))}
                          </div>
                        ) : <span style={{ color: "var(--text-3)" }}>-</span>}
                      </td>
                      <td className="num mono">{money(r.fcTotal || 0)}</td>
                      <td className="num mono" style={{ color: "var(--green)" }}>{money(r.actual || 0)}</td>
                      <td className="num mono" style={{ color: (r.fcRemaining || 0) > 0 ? "var(--amber)" : "var(--text-3)" }}>{money(r.fcRemaining || 0)}</td>
                      <td>{taskProgress(p)}</td>
                      <td>{p.aeOwner ? fmtName({ name: p.aeOwner }) : (p.team || "-")}</td>
                    </DetailRow>
                  );
                })}
                {!filtered.length && !loading && (
                  <tr>
                    <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีโครงการตามตัวกรองนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>
          {filtered.length > 0 && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
        </div>
      {/* เหลือแค่ "สร้าง" — แก้ไขโครงการที่มีอยู่ทำที่หน้ารายละเอียด (การ์ด Control) */}
      <SalesProjectCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(data) => {
          setShowCreateModal(false);
          const project = data?.project;
          if (project?.code || project?.id) window.location.href = `/sa/projects/${project.code || project.id}`;
          else load();
        }}
        customers={customers}
        categories={categories}
      />
    </SaWorkspace>
  );
}
