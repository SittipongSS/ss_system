"use client";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import useMyTeamsFilter from "@/lib/useMyTeamsFilter";

// หน้ารวมโครงการ (/sa/projects — เฟส B, SALES_REVAMP_PLAN §5):
// โครงการ = ภาชนะรวมดีล (SCENT→NPD→RE-ORDER…) — ตารางทุกโครงการพร้อม KPI
// FC Total / Actual / FC คงเหลือ ต่อแถว (rollup จากดีล — ห้ามกรอกมูลค่าที่โครงการ)
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FolderKanban, Search, RefreshCw, Target, LineChart, BarChart3, Layers, Plus, Flag, GitBranch, UserRound } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import Pager from "@/components/ui/Pager";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import { useCan } from "@/lib/roleContext";
import { dealTypeTooltip, summarizeProjectDealTypes } from "@/lib/sales/projectDealTypes";
import styles from "./page.module.css";
import { CLOSED_WORK_STATUSES, PROJECT_WORK_STATUSES, projectStatusLabel } from "@/lib/pm/projectLifecycle";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName, naText, NA } from "@/lib/format";
import { brandDisplayFromList } from "@/lib/master/brands";
import { BUSINESS_LINES, businessLineLabel, businessLineTone, isBusinessLine } from "@/lib/master/businessLines";
import { apiFetch } from "@/lib/apiFetch";

/* เงินเต็มรูปแบบ ไม่ย่อ K/M (มติผู้ใช้ 2026-08-02) — ตัวเลขที่ย่อแล้วเอาไปเทียบกับ
   ใบเสนอราคา/SO ไม่ได้ ต้องเปิดหน้าอื่นดูเลขจริงอยู่ดี · คอลัมน์จัดการที่ถอดออกไป
   คืนความกว้างมาให้พอดี */
const money = (v) => fmtMoney(v);

/* ── มุมมองของตาราง: เรียง · จัดกลุ่ม (มติผู้ใช้ 2026-08-15) ────────────────
   ปุ่มอยู่ใน `ui/ViewMenus` · ตัวจัดถังอยู่ใน `lib/listGrouping` — ที่นี่ประกาศแค่
   หัวข้อของหน้านี้ ทรงเดียวกับทุกตารางในระบบ */
const SORT_OPTIONS = [
  { value: "recent", label: "ล่าสุด", dir: "asc" },
  { value: "code", label: "รหัสโครงการ", dir: "desc" },
  { value: "customer", label: "ลูกค้า", dir: "asc" },
  { value: "fcTotal", label: "FC Total", dir: "desc" },
  { value: "fcRemaining", label: "FC คงเหลือ", dir: "desc" },
];
const SORT_DEFAULT = "recent";
const sortDirOf = (key) => SORT_OPTIONS.find((option) => option.value === key)?.dir || "asc";

const GROUP_OPTIONS = [
  { value: "none", label: "ไม่จัดกลุ่ม" },
  { value: "customer", label: "ลูกค้า" },
  { value: "owner", label: "ผู้ดูแล (AE)" },
  { value: "line", label: "สายธุรกิจ" },
  { value: "status", label: "สถานะ" },
];

/* ขอบเขตสถานะ — ค่าเดียวกับ dropdown เดิม แต่ย้ายเข้าปุ่มตัวกรองรวม
   ⚠️ เป็นกลุ่ม **เลือกค่าเดียว** (`single`) เพราะ "กำลังดำเนินการ" กับ "ปิดแล้ว"
   เป็นขอบเขตที่ทับกันไม่ได้ ต่างจากหมวดอื่นที่เลือกหลายค่าได้ */
const SCOPE_DEFAULT = "active";

function compareProjects(a, b, key, dir) {
  const mul = dir === "desc" ? -1 : 1;
  const text = (value) => String(value || "");
  const rollup = (row) => row.dealsRollup || {};
  if (key === "fcTotal" || key === "fcRemaining") {
    const field = key === "fcTotal" ? "fcTotal" : "fcRemaining";
    const diff = (Number(rollup(a)[field]) || 0) - (Number(rollup(b)[field]) || 0);
    if (diff) return diff * mul;
  } else if (key === "customer") {
    const byName = text(a.customerName).localeCompare(text(b.customerName), "th");
    if (byName) return byName * mul;
  }
  const byCode = text(a.code || a.id).localeCompare(text(b.code || b.id), "th");
  return key === "code" ? byCode * mul : byCode;
}

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

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
  const [query, setQuery] = useStickyState("query", "");
  /* ⭐ `?count=projectCloses` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายนับ "คำขอปิดที่รอ
     ฉันเซ็น" ไม่ใช่จำนวนโครงการ ⇒ กรองด้วยธง `_waitingOnMe` จาก server ซึ่งรู้ทั้ง
     closeStatus และว่าใครเป็นคนยื่น (คนยื่นเซ็นให้ตัวเองไม่ได้ จึงไม่นับใบของตัวเอง)
     ⚠️ **ต้องเปิดสถานะเป็น "ทั้งหมด" ด้วย** — โครงการที่ขอปิดมักอยู่สถานะ Completed
     ซึ่งค่าตั้งต้น "active" กรองทิ้ง ⇒ กดจากป้ายแล้วเจอลิสต์ว่างทั้งที่มีของรออยู่ */
  const fromNavCount = useSearchParams().get("count") === "projectCloses";
  const [statusFilter, setStatusFilter] = useState(fromNavCount ? "all" : SCOPE_DEFAULT); // active = ไม่รวม Done/Drop
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(fromNavCount);
  const [lineFilter, setLineFilter] = useStickyState("lineFilter", EMPTY);
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [sortKey, setSortKey] = useStickyState("sortKey", SORT_DEFAULT);
  const [sortDir, setSortDir] = useStickyState("sortDir", sortDirOf(SORT_DEFAULT));
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [res, custRes, catRes] = await Promise.all([
        apiFetch("/api/pm/projects"),
        apiFetch("/api/master/customers"),
        apiFetch("/api/master/product-types"),
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

  /* ⭐ คนอยู่หลายทีมต้องเลือกดูทีละทีมได้ (IS-26080012 — ผู้ใช้อยู่ ODM+SV แจ้งเอง)
     โผล่เฉพาะคนที่อยู่ตั้งแต่ 2 ทีมขึ้นไป · ค่าที่เลือกจำข้ามหน้าให้แล้วใน hook */
  const myTeams = useMyTeamsFilter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      /* 🐞 ของเดิมกรองด้วย ["Done","Drop"] ซึ่ง **ไม่ใช่ค่าที่มีอยู่จริง** — CHECK ของตาราง
         ยอมแค่ New / In Progress / Completed / On Hold / Dropped
         ผลคือ "กำลังดำเนินการ" ไม่เคยกรองอะไรออกเลย และเลือก Done/Drop แล้วตารางว่างตลอด */
      if (!myTeams.matches(p.team)) return false;
      if (waitingOnMeOnly && !p._waitingOnMe) return false;
      if (statusFilter === "active" && CLOSED_WORK_STATUSES.includes(p.status)) return false;
      if (statusFilter === "closed" && !CLOSED_WORK_STATUSES.includes(p.status)) return false;
      if (!["active", "all", "closed"].includes(statusFilter) && p.status !== statusFilter) return false;
      // สายธุรกิจ: "ยังไม่ระบุสาย" เป็นตัวเลือกจริง — ของที่ยังไม่กรอกต้องหาเจอ ไม่ใช่หายเงียบ
      if (lineFilter.length && !lineFilter.includes(isBusinessLine(p.line) ? p.line : "__unset")) return false;
      if (!q) return true;
      const brand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
      return [p.code, p.name, p.customerName, brand, p.formulaName, ...(p.deals || []).map((d) => d.title)]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, lineFilter, waitingOnMeOnly, customers, myTeams]);

  /* `recent` = ลำดับที่ API ส่งมา — ไม่คิดใหม่ที่นี่ · สลับทิศคือกลับลำดับเดิม */
  const sorted = useMemo(() => {
    if (sortKey === SORT_DEFAULT) return sortDir === "desc" ? [...filtered].reverse() : filtered;
    return [...filtered].sort((a, b) => compareProjects(a, b, sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const buckets = useMemo(() => {
    if (groupBy === "none") return null;
    return bucketList(sorted, (p) => {
      const weight = Number(p.dealsRollup?.fcTotal) || 0;
      if (groupBy === "customer") {
        return { key: p.customerId || String(p.customerName || "").trim(), label: p.customerName || "ไม่ระบุลูกค้า", weight };
      }
      if (groupBy === "owner") {
        /* ⚠️ โครงการเก็บผู้ดูแลเป็น **ชื่อ** (`aeOwner`) ไม่มี id ⇒ กุญแจต้องใช้ชื่อ
           ตามข้อมูลที่มีจริง · ทีมเป็นบรรทัดรองไว้แยกคนชื่อซ้ำด้วยตา */
        const name = String(p.aeOwner || "").trim();
        return { key: name, label: name ? fmtName({ name }) : "ไม่ระบุผู้ดูแล", sub: p.team || null, weight };
      }
      if (groupBy === "line") {
        return {
          key: isBusinessLine(p.line) ? p.line : "",
          label: businessLineLabel(p.line),
          missing: !isBusinessLine(p.line),
          weight,
        };
      }
      return { key: p.status, label: projectStatusLabel(p.status), weight };
    });
  }, [sorted, groupBy]);

  const toggleBucket = useCallback((key) => setCollapsed((current) => toggleBucketKey(current, key)), []);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);
  const filterCount = (statusFilter === SCOPE_DEFAULT ? 0 : 1) + lineFilter.length + (waitingOnMeOnly ? 1 : 0);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(sorted, {
      resetKey: `${query}|${statusFilter}|${lineFilter.join()}|${waitingOnMeOnly}|${myTeams.selected.join(",")}|${sortKey}|${sortDir}`,
    });

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

  /* ── แถวของโครงการหนึ่งโครงการ — ใช้ทั้งโหมดปกติและโหมดจัดกลุ่ม ────────
     ⚠️ ฟังก์ชันตัวเดียว ไม่ใช่ markup สองสำเนาในสองสาขาของ tbody (AGENTS.md) */
  const projectRow = (p) => {
                const r = p.dealsRollup || {};
                const projectBrand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand);
                const dealTypes = summarizeProjectDealTypes(p.deals);
                return (
                  <DetailRow key={p.id} href={`/sa/projects/${p.code || p.id}`} className="premium-row">
                    <td>
                      {/* prefetch={false}: ลิสต์ยาว — กัน RSC prefetch ต่อแถว */}
                      <Link prefetch={false} href={`/sa/projects/${p.code || p.id}`} className="linklike linklike-block" title="เปิดหน้าโครงการ">
                        {/* รหัสบน · ชื่อล่าง (มติผู้ใช้ 2026-08-12 — ทุกตารางทรงเดียว) */}
                        <span className="mono block text-[12px] text-[var(--accent)]">
                          {p.code || p.id}
                        </span>
                        <strong>{naText(p.name)}</strong>
                        <span className="block text-[12px] text-[var(--text-3)]">
                          {p.formulaName ? `สูตร ${p.formulaName}` : ""}
                        </span>
                        {/* ⚠️ ป้ายนี้คือตัวทวงที่ตัวกรองพัดหายไม่ได้ — ต่างจากตัวนับบนแถบ KPI
                            ที่ขยับตามตัวกรอง · โครงการที่ยังไม่ระบุสายต้องสะดุดตาตรงที่มันอยู่ */}
                        <span
                          className={`ui-badge ${styles.lineBadge}${isBusinessLine(p.line) ? "" : ` ${styles.lineBadgeUnset}`}`}
                          data-tone={businessLineTone(p.line) || undefined}
                        >
                          {businessLineLabel(p.line)}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <strong style={{ display: "block", fontWeight: "var(--fw-bold)" }}>{naText(p.customerName)}</strong>
                      <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{naText(projectBrand)}</span>
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
                      ) : <span style={{ color: "var(--text-3)" }}>{NA}</span>}
                    </td>
                    <td className="num mono">{money(r.fcTotal || 0)}</td>
                    <td className="num mono" style={{ color: "var(--green)" }}>{money(r.actual || 0)}</td>
                    <td className="num mono" style={{ color: (r.fcRemaining || 0) > 0 ? "var(--amber)" : "var(--text-3)" }}>{money(r.fcRemaining || 0)}</td>
                    <td>{taskProgress(p)}</td>
                    <td>{p.aeOwner ? fmtName({ name: p.aeOwner }) : (naText(p.team))}</td>
                  </DetailRow>
                );
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
          <SaMetric icon={<Layers />} label="โครงการ / ดีล" value={`${filtered.length} / ${totals.deals}`} note="ตามตัวกรองปัจจุบัน" />
          {/* ⚠️ เคยมีตัวนับ "ยังไม่ระบุสาย" อยู่ตรงนี้ — ถอดออก (มติผู้ใช้ 2026-08-05)
              ฟอร์มสร้าง/แก้โครงการบังคับเลือกสายแล้ว ตัวนับจึงเป็น 0 ตลอด และ
              แถบนี้เป็นแถบเงินล้วน · ตัวทวงยังอยู่ที่ป้ายในแถวตารางด้านล่าง
              ⇒ ถ้าวันไหนสายกลับมาว่างได้อีก (เช่นนำเข้าข้อมูลตรงเข้า DB)
                 ให้เอาตัวนับกลับมา อย่าปล่อยให้ NULL หายเงียบเหมือน `projects.type` */}
        </SaMetricStrip>

        <SaSection icon={<FolderKanban size={17} />} title="ทะเบียนโครงการ" subtitle="ค้นหา กรอง และเปิดดูข้อมูลโครงการทั้งหมด" actions={<span className="ui-badge">{filtered.length} โครงการ</span>}>
          <div className="toolbar">
            <div className="search-glass" style={{ width: 300 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาโครงการ / ลูกค้า / สูตร / ดีล" aria-label="ค้นหาโครงการ" />
            </div>
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันเซ็นปิด ×</Button>
            )}
            <MyTeamsFilter teams={myTeams.teams} selected={myTeams.selected} onChange={myTeams.setSelected} />
            {/* ตัวกรองรวมในปุ่มเดียว (มาตรฐานทั้งระบบ) — สถานะเป็นกลุ่มเลือกค่าเดียว
                เพราะ "กำลังดำเนินการ / ปิดแล้ว / ทุกสถานะ" เป็นขอบเขตที่ทับกันไม่ได้ */}
            <FilterPopover
              count={filterCount}
              onClear={() => { setStatusFilter(SCOPE_DEFAULT); setLineFilter([]); setWaitingOnMeOnly(false); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: Flag, single: true,
                  options: [
                    { value: "active", label: "กำลังดำเนินการ" },
                    { value: "all", label: "ทุกสถานะ" },
                    { value: "closed", label: "ปิด/ยกเลิกแล้ว" },
                    /* ตัวเลือกรายสถานะมาจากรายชื่อจริง — เดิมพิมพ์ค่าที่ระบบไม่รู้จักไว้ 2 ค่า */
                    ...PROJECT_WORK_STATUSES.map((status) => ({ value: status, label: projectStatusLabel(status) })),
                  ],
                  selected: [statusFilter],
                  // กดค่าที่เลือกอยู่ซ้ำ = กลับไปขอบเขตตั้งต้น ไม่ใช่ "ไม่มีสถานะเลย" ซึ่งจะได้ตารางว่าง
                  onChange: (values) => setStatusFilter(values[0] || SCOPE_DEFAULT),
                },
                {
                  key: "line", label: "สายธุรกิจ", icon: GitBranch,
                  options: [
                    ...BUSINESS_LINES.map((line) => ({ value: line, label: businessLineLabel(line) })),
                    { value: "__unset", label: businessLineLabel(null) },
                  ],
                  selected: lineFilter, onChange: setLineFilter,
                },
                {
                  key: "mine", label: "งานของฉัน", icon: UserRound,
                  options: [{ value: "waiting", label: "รอฉันเซ็นปิด" }],
                  selected: waitingOnMeOnly ? ["waiting"] : [],
                  onChange: (values) => setWaitingOnMeOnly(values.length > 0),
                },
              ]}
            />
            <GroupMenu
              title="จัดกลุ่มโครงการ"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={GROUP_OPTIONS}
            />
            {!!buckets?.length && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((bucket) => bucket.key)))}
              />
            )}
            <div className="spacer" />
            <SortMenu
              title="เรียงลำดับโครงการ"
              value={sortKey}
              defaultValue={SORT_DEFAULT}
              onChange={(value) => { setSortKey(value); setSortDir(sortDirOf(value)); }}
              options={SORT_OPTIONS}
            />
            <SortDirButton dir={sortDir} onToggle={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} />
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
                {/* โหมดจัดกลุ่ม: หัวกลุ่มเต็มแถว แถวโครงการข้างในเป็น `projectRow` ตัวเดียวกัน */}
                {buckets ? buckets.map((bucket) => {
                  const bucketCollapsed = collapsed.has(bucket.key);
                  return (
                    <Fragment key={bucket.key}>
                      <TableGroupRow
                        colSpan={8}
                        label={bucket.label}
                        sub={bucket.sub}
                        badge={`${bucket.count} โครงการ`}
                        total={money(bucket.total)}
                        totalTitle="FC Total รวมของกลุ่มนี้"
                        collapsed={bucketCollapsed}
                        onToggle={() => toggleBucket(bucket.key)}
                      />
                      {!bucketCollapsed && bucket.items.map(projectRow)}
                    </Fragment>
                  );
                }) : pageRows.map(projectRow)}
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
          {/* โหมดจัดกลุ่มไม่แบ่งหน้า — แบ่งหน้าจะหั่นกลุ่มคาหน้าแล้วยอดหัวกลุ่มไม่ตรงกับแถว */}
          {filtered.length > 0 && !buckets && (
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
