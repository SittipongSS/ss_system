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
// + ยอด SO "รออนุมัติ" เป็นบรรทัดรองใต้ Actual ทั้งแถบ KPI และต่อแถว — ตัวเลขแยก
//   ไม่รวมเข้า Actual (มติผู้ใช้ 2026-09-11 · mig 0353 · lib/pm/projectPendingApproval)
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FolderKanban, Search, RefreshCw, Target, LineChart, BarChart3, Layers, Plus, Flag, GitBranch, UserRound } from "lucide-react";
import SaWorkspace, { ListPanel, Metric as SaMetric, MetricStrip as SaMetricStrip } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import StatusNotice from "@/components/ui/StatusNotice";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import Pager from "@/components/ui/Pager";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import { useCan, useRole } from "@/lib/roleContext";
import { viewScope } from "@/lib/permissions";
import {
  PROJECT_SCOPE_DEFAULT,
  UNSET_LINE,
  filterProjects,
  projectsClearedHref,
  projectsWaitingOnMeFrom,
  projectsWaitingOnMeHref,
  withWaitingOnMe,
} from "@/lib/pm/projectListFilter";
import { dealTypeTooltip, summarizeProjectDealTypes } from "@/lib/sales/projectDealTypes";
import styles from "./page.module.css";
import { PROJECT_WORK_STATUSES, projectStatusLabel } from "@/lib/pm/projectLifecycle";
import { dealTypeBadge } from "@/components/salesPlanning/ui";
import PendingApprovalAmount from "@/components/salesPlanning/PendingApprovalAmount";
import { sumProjectRollups } from "@/lib/pm/projectPendingApproval";
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
const SCOPE_DEFAULT = PROJECT_SCOPE_DEFAULT;

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
     ⭐ ตัวกรองนี้อยู่ใน **URL ที่เดียว** (ตรวจตัวเลข M17a · แทนกติกา "อ่านครั้งเดียว" ของ ม-115 ·
        แพตเทิร์นเดียวกับ `productionJobsLink` #1915) — เดิมอ่านเข้า useState ตอนเมานต์ ⇒ อยู่บนหน้านี้แล้ว
        กดป้ายเมนูไม่มีอะไรเปลี่ยน · ปุ่ม × ล้างแค่ state ⇒ URL ยังมี `?count=` กดป้ายซ้ำก็ไป URL เดิม
        ตอนนี้: เปิด = ไป `?count=projectCloses` · × / เอาติ๊กออก = `router.replace` URL ที่ถอดพารามิเตอร์
     ⚠️ **เปิดเมื่อไรต้องเปิดสถานะเป็น "ทั้งหมด" + ล้างค้นหา/สายธุรกิจ** (initializer + effect ข้างล่าง) — โครงการที่ขอปิด
        มักอยู่สถานะ Completed ซึ่งค่าตั้งต้น "active" กรองทิ้ง และตัวกรองที่ค้างทำให้แถวน้อยกว่าเลขบนป้าย */
  const router = useRouter();
  const searchParams = useSearchParams();
  const waitingOnMeOnly = projectsWaitingOnMeFrom(searchParams);
  const setWaitingOnMeOnly = useCallback((on) => {
    router.replace(on ? projectsWaitingOnMeHref(searchParams) : projectsClearedHref(searchParams), { scroll: false });
  }, [router, searchParams]);
  const [statusFilter, setStatusFilter] = useState(waitingOnMeOnly ? withWaitingOnMe().status : SCOPE_DEFAULT); // active = ไม่รวม Done/Drop
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

  /* เปิด "รอฉันเซ็นปิด" **ขณะอยู่บนหน้านี้** (กดป้ายเมนูซ้ำ · ติ๊กในปุ่มตัวกรอง) = ล้างตัวกรองที่ค้าง —
     ผูกกับ "จังหวะที่ค่าใน URL เปลี่ยนจากปิดเป็นเปิด" เพราะคอมโพเนนต์ไม่เมานต์ใหม่ (ค่าที่ล้างมาจาก `withWaitingOnMe`)
     ⚠️ **ห้ามล้างตอนเมานต์** — เมานต์พร้อม `?count=` มีสองทาง: เข้าใหม่จากหน้าอื่น (useStickyState เริ่มค่าตั้งต้น
        ให้เองอยู่แล้ว + initializer ของสถานะเป็น "ทั้งหมด") กับกดย้อน/F5 (useStickyState คืนค่าที่ผู้ใช้ตั้งไว้ตาม
        มติ 2026-08-25 "ย้อนกลับ = กลับไปที่เดิม") · ล้างตอนเมานต์ = ลบค่าที่คืนมาทิ้งทุกครั้งที่กดย้อน */
  const prevWaitingOnMe = useRef(waitingOnMeOnly);
  useEffect(() => {
    const turnedOn = waitingOnMeOnly && !prevWaitingOnMe.current;
    prevWaitingOnMe.current = waitingOnMeOnly;
    if (!turnedOn) return;
    const cleared = withWaitingOnMe();
    setStatusFilter(cleared.status);
    setQuery(cleared.query);
    setLineFilter(cleared.lines);
  }, [waitingOnMeOnly, setQuery, setLineFilter]);

  /* การเดินสถานะ (ระงับ / ยกเลิก / ดึงกลับ / ขอปิด / อนุมัติปิด) และการแก้ไข-ลบ
     ย้ายไปอยู่บนการ์ด Record Control ของหน้ารายละเอียดทั้งหมดแล้ว (#902)
     หน้านี้จึงไม่ยิง PATCH / DELETE / POST close อีกต่อไป — โหลดอย่างเดียว */

  /* ⭐ คนอยู่หลายทีมต้องเลือกดูทีละทีมได้ (IS-26080012 — ผู้แจ้ง: role ปัจจุบัน ณ 20/10 = AC ขอบเขต team · ตรวจจากบัญชี)
     โผล่เฉพาะคนที่อยู่ตั้งแต่ 2 ทีมขึ้นไป · ค่าที่เลือกจำข้ามหน้าให้แล้วใน hook
     ⚠️ **เฉพาะขอบเขต 'team'** (ตรวจตัวเลข M17b) — กติกาเดียวกับหน้าดีล/ลีด/คำร้อง/ปฏิทิน (ADR 0015)
        🐞 เดิมกรองทุกคนที่อยู่หลายทีม ⇒ หัวหน้า (ขอบเขต 'all') ที่อยู่ 2 ทีมไม่เห็นโครงการทีมอื่น/ไม่มีทีม
        แม้เลือกครบทุกชิป ⇒ FC Total / "โครงการ / ดีล" ขาด และแถวน้อยกว่าป้ายเมนู "รอฉันเซ็นปิด" */
  const myTeams = useMyTeamsFilter();
  const role = useRole();
  const teamScoped = viewScope(role) === "team";
  // ผู้อนุมัติปิด — server ติดธงเดียวกันให้ทุกแถว (ไม่มีสิทธิ์ = ไม่โชว์ตัวเลือก "รอฉันเซ็นปิด")
  const canApproveCloses = useMemo(() => rows.some((p) => p.canApproveClose === true), [rows]);

  /* ตัวกรองแถวอยู่ที่ `lib/pm/projectListFilter` — ตัวเดียวกับที่เทสต์เทียบกับตัวนับของป้ายเมนู */
  const filtered = useMemo(() => filterProjects(rows, {
    query,
    status: statusFilter,
    lines: lineFilter,
    waitingOnMe: waitingOnMeOnly,
    teamMatches: teamScoped ? myTeams.matches : null,
    brandOf: (p) => brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand),
  }), [rows, query, statusFilter, lineFilter, waitingOnMeOnly, customers, myTeams, teamScoped]);

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
  // ยอด SO รออนุมัติรวมเป็นกองแยก (pendingApproval) ไม่ปนกับ actual — มติ 2026-09-11
  const totals = useMemo(() => sumProjectRollups(filtered), [filtered]);

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
                    {/* ยอด SO รออนุมัติเป็นบรรทัดรองในเซลล์ Actual — ไม่เพิ่มคอลัมน์ (colSpan คงเดิม)
                        ชิ้นกลางระบายสีเอง จึงไม่ติดเขียวของเซลล์ · ไม่มีใบรออนุมัติ = ไม่เรนเดอร์ */}
                    <td className="num mono" style={{ color: "var(--green)" }}>
                      {money(r.actual || 0)}
                      <PendingApprovalAmount amount={r.pendingApproval} count={r.pendingApprovalCount} />
                    </td>
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
        <SaMetricStrip>
          <SaMetric icon={<BarChart3 />} label="FC Total" value={money(totals.fcTotal)} note="แผนทั้งหมดของโครงการที่แสดง" />
          {/* ยอด SO รออนุมัติวางเป็นบรรทัดที่สองของ note — ตัวเลข Actual ยังเป็นใบอนุมัติล้วน
              ⚠️ amber ของแถบนี้แปลว่า "FC คงเหลือ" อยู่แล้ว ชิ้นรออนุมัติจึงมีคำกำกับเสมอ
              (ไม่ใช้สีเป็นสัญญาณเดียว) · ไม่มีใบรออนุมัติ = เหลือ note เดิมบรรทัดเดียว */}
          <SaMetric
            icon={<LineChart />}
            label="Actual"
            value={money(totals.actual)}
            note={(
              <>
                ยอดจาก ใบสั่งขายที่อนุมัติแล้ว
                <PendingApprovalAmount
                  amount={totals.pendingApproval}
                  count={totals.pendingApprovalCount}
                  className={styles.metricPending}
                />
              </>
            )}
            tone="good"
          />
          <SaMetric icon={<Target />} label="FC คงเหลือ" value={money(totals.fcRemaining)} note="ดีลเปิดที่ยังต้องตามปิด" tone={totals.fcRemaining ? "warning" : undefined} />
          <SaMetric icon={<Layers />} label="โครงการ / ดีล" value={`${filtered.length} / ${totals.deals}`} note="ตามตัวกรองปัจจุบัน" />
          {/* ⚠️ เคยมีตัวนับ "ยังไม่ระบุสาย" อยู่ตรงนี้ — ถอดออก (มติผู้ใช้ 2026-08-05)
              ฟอร์มสร้าง/แก้โครงการบังคับเลือกสายแล้ว ตัวนับจึงเป็น 0 ตลอด และ
              แถบนี้เป็นแถบเงินล้วน · ตัวทวงยังอยู่ที่ป้ายในแถวตารางด้านล่าง
              ⇒ ถ้าวันไหนสายกลับมาว่างได้อีก (เช่นนำเข้าข้อมูลตรงเข้า DB)
                 ให้เอาตัวนับกลับมา อย่าปล่อยให้ NULL หายเงียบเหมือน `projects.type` */}
        </SaMetricStrip>

        {/* แผงรายการ (มติผู้ใช้ 2026-09-15 · UI_DESIGN_SYSTEM.md §รายการ) — ป้ายจำนวน = โครงการหลัง
            ค้นหา/กรองทุกหน้า (เท่ายอดของ Pager) · เครื่องมือส่งเป็น fragment เข้า `toolbar` */}
        <ListPanel
          icon={<FolderKanban size={17} aria-hidden="true" />}
          title="ทะเบียนโครงการ"
          subtitle="ค้นหา กรอง และเปิดดูข้อมูลโครงการทั้งหมด"
          count={`${filtered.length} โครงการ`}
          toolbar={(
          <>
            <div className="search-glass">
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาโครงการ / ลูกค้า / สูตร / ดีล" aria-label="ค้นหาโครงการ" />
            </div>
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันเซ็นปิด ×</Button>
            )}
            {teamScoped && <MyTeamsFilter teams={myTeams.teams} selected={myTeams.selected} onChange={myTeams.setSelected} />}
            {/* ตัวกรองรวมในปุ่มเดียว (มาตรฐานทั้งระบบ) — สถานะเป็นกลุ่มเลือกค่าเดียว
                เพราะ "กำลังดำเนินการ / ปิดแล้ว / ทุกสถานะ" เป็นขอบเขตที่ทับกันไม่ได้ */}
            <FilterPopover
              count={filterCount}
              onClear={() => { setStatusFilter(SCOPE_DEFAULT); setLineFilter([]); if (waitingOnMeOnly) setWaitingOnMeOnly(false); }}
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
                    { value: UNSET_LINE, label: businessLineLabel(null) },
                  ],
                  selected: lineFilter, onChange: setLineFilter,
                },
                /* "รอฉันเซ็นปิด" มีได้เฉพาะผู้อนุมัติปิด (ธง `_waitingOnMe`) — คนอื่นติ๊กแล้วได้ 0 แถวเสมอ
                   ⇒ ไม่มีสิทธิ์ = ไม่โชว์ (กฎการมองเห็นของ UI) · ยังโชว์ตอนเปิดค้างจากลิงก์เก่าให้เอาติ๊กออกได้ */
                ...(canApproveCloses || waitingOnMeOnly ? [{
                  key: "mine", label: "งานของฉัน", icon: UserRound,
                  options: [{ value: "waiting", label: "รอฉันเซ็นปิด" }],
                  selected: waitingOnMeOnly ? ["waiting"] : [],
                  onChange: (values) => setWaitingOnMeOnly(values.length > 0),
                }] : []),
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
          </>
          )}
        >
          {/* โหลดรายการไม่สำเร็จ = ข้อความในเนื้อแผงพร้อมทางลองใหม่ (เดิมกล่อง glass-panel แดงลอยเหนือหน้า)
              ⚠️ `error` ของหน้านี้มาจาก load() ทางเดียว */}
          {error && (
            <StatusNotice tone="error" className="mb-4" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>
              {error}
            </StatusNotice>
          )}

          <TableScroll surface="embedded" className="premium-glass-table table-responsive" aria-busy={loading}><table className="w-full text-sm">
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
        </ListPanel>
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
