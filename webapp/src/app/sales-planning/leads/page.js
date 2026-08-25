"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";

// หน้าลีด (/sa/leads — Sales Revamp เฟส C): คิวรับลีดของ Marketing →
// คัดกรอง (Supervisor เลือกทีม) → กระจาย (Senior เลือก AE) → ติดต่อ/นัด → เปิดลูกค้า.
// SLA 1 วันทำการ **ทั้งสามด่าน** (คัดกรอง · กระจาย · ติดต่อกลับ) วัดจาก timestamp อัตโนมัติ
// โชว์ครบบนแถบ KPI ของหน้านี้ · ตัวเลขเชิงลึก (รายช่องทาง · รายคน) อยู่ที่แท็บ "KPI ลีด"
import { useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { Handshake, Inbox, Plus, Search, PhoneCall, CalendarClock, Filter, Users, UserRound, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import SortControl from "@/components/ui/SortControl";
import Segmented from "@/components/ui/Segmented";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import useMyTeamsFilter from "@/lib/useMyTeamsFilter";
import FilterPopover from "@/components/ui/FilterPopover";
import { canSeeLeadKpi, leadScopes } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import useDealOwners from "@/lib/sales/useDealOwners";
import { livePersonName } from "@/lib/ui/personName";
import { useCan, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { TEAMS, TEAM_LABELS } from "@/lib/permissions";
import DealCreateModal from "@/components/salesPlanning/DealCreateModal";
import LeadFormFields, { leadFormBlocker } from "@/components/salesPlanning/LeadFormFields";
import PendingFiles from "@/components/ui/PendingFiles";
import { postUpdateWithFiles } from "@/lib/master/updatePost";
import LeadQueueSummary from "@/components/salesPlanning/LeadQueueSummary";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import { buildLeadTransitionPayload, createLeadLifecycle, leadDealAction, LEAD_TRANSITION_ACTIONS } from "@/lib/sales/leadLifecycle";
import useLeadWorkload from "@/lib/sales/useLeadWorkload";
import {
  LEAD_CHANNELS, LEAD_CHANNEL_LABELS, channelGroupOf, LEAD_STATUSES, LEAD_STATUS_LABELS,
  LEAD_SLA_STAGES, leadSlaNote, leadBudgetText, SERVICE_INTEREST_LABELS,
  canEditLead, canDeleteLead, canCreateLead, canCreateDealFromLead, slaPendingTone, leadFollowUpState,
} from "@/lib/sales/leads";
import { MonthPicker, SCOPE_LABELS, thisMonth, yearOfMonth } from "@/components/salesPlanning/ui";
import DayRangePicker from "@/components/ui/DayRangePicker";
import { addDays, businessDayKey } from "@/lib/datePeriods";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent, naText, NA } from "@/lib/format";
import { cachedFetchJson } from "@/lib/apiCache";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { usePagination } from "@/lib/usePagination";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import Pager from "@/components/ui/Pager";
import DetailRow from "@/components/ui/DetailRow";
import styles from "./page.module.css";

/* ไอคอนของสามด่าน — ป้ายกับกติกาอยู่ที่ `LEAD_SLA_STAGES` (lib ฝั่งข้อมูลไม่ import react) */
const SLA_STAGE_ICONS = { screen: <Filter />, assign: <Users />, contact: <PhoneCall /> };

/* ค่าแทน "ยังไม่มีทีม" ในตัวกรอง — ลีดที่ยังไม่ถูกคัดกรองมี team = null
   ซึ่งใส่เป็น value ของ checkbox ตรง ๆ ไม่ได้ */
const NO_TEAM = "__no_team__";
/* เช่นเดียวกัน — ลีดที่ยังไม่ถูกมอบหมายมี assigneeId = null */
const NO_ASSIGNEE = "__no_assignee__";

const initialForm = {
  id: null, channel: "chatcone_line", contactName: "", company: "", email: "",
  contactChannel: "", phone: "", serviceInterest: "diffuser", serviceDetail: "",
  budget: "", budgetMax: "", details: "",
};

/* ป้ายสถานะ/ช่องทาง — ความกว้างและสีอยู่ใน page.module.css ทั้งหมด
   (ของเดิมเป็น inline style อ่านสีจาก LEAD_STATUS_COLORS ทำให้ป้ายในคอลัมน์เดียวกัน
   กว้างไม่เท่ากัน และหน้าเพจต้องรู้จักสีของทุกสถานะเอง) */
function statusBadge(status) {
  return (
    <span className={["ui-badge", "ui-badge-cell", "ui-badge-w-lead", styles[status]].filter(Boolean).join(" ")}>
      {LEAD_STATUS_LABELS[status] || status}
    </span>
  );
}

function channelBadge(channel) {
  const group = channelGroupOf(channel);
  return (
    <span className={["ui-badge", "ui-badge-cell", "ui-badge-w-channel", styles[group]].filter(Boolean).join(" ")}>
      {LEAD_CHANNEL_LABELS[channel] || channel}
    </span>
  );
}

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function LeadsPage() {
  const canLead = useCan("salesplan:lead");
  const canView = useCan("salesplan:view");
  const role = useRole();
  /* ตัวเลขภาระงานสำหรับกล่องมอบหมาย — hook ยิงเฉพาะตำแหน่งที่มอบหมายได้ */
  const workload = useLeadWorkload(role);
  const team = useTeam();
  const teams = useTeams();
  // อยู่หลายทีม → เลือกได้ว่าขอบเขต "ทีม" จะรวมทีมไหนบ้าง
  const myTeams = useMyTeamsFilter();
  const canCreate = canCreateLead(role);
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null))
      .catch(() => setMeId(null));
  }, []);

  const [leads, setLeads] = useState([]);
  const [kpi, setKpi] = useState(null);
  /* รายชื่อผู้ใช้ 2 หน้าที่ แยกกันคนละชุดโดยตั้งใจ:
     - `directory` (รวมคนที่ปิดบัญชีแล้ว) = ใช้ *อ่านชื่อปัจจุบัน* ของผู้รับผิดชอบ
       ในแถว — ต้องมีคนที่ลาออกด้วย ไม่งั้นลีดเก่าตกไปใช้ชื่อที่ค้างในแถว
     - `users` (เฉพาะคนที่ยังทำงาน) = dropdown มอบหมายงาน
     ⚠️ ต้องโหลดโดยไม่ติดเงื่อนไข role เพราะทุกคนที่เปิดหน้านี้ได้ต้องอ่านชื่อออก
     (ของเดิมโหลดเฉพาะ role ที่ทำคิวได้) · ยิงไม่ผ่าน = [] แล้วถอยไปชื่อในแถวเอง */
  const directory = usePeopleDirectory();
  const users = useMemo(() => directory.filter((u) => !u.disabled), [directory]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  // หมวดสินค้า (product-types) — DealFormFields ในโมดัลสร้างดีลใช้ (hotfix: state ตัวนี้
  // หลุดตอนแยกฟอร์มใน #287 ทำหน้า crash ตอนเปิดโมดัล)
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useStickyState("query", "");
  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) — ทุกหมวด
  // multi-select, ว่าง = ทั้งหมด. "คิวงาน" (ซ่อนลีดที่ปิดแล้ว) เดิมเป็นค่าตั้งต้นของ
  // dropdown สถานะ — แยกเป็นหมวดของตัวเองและติ๊กไว้ตั้งแต่แรกเพื่อคงพฤติกรรมเดิม
  // (badge จะขึ้น 1 ให้เห็นว่ามีตัวกรองอยู่ ไม่ใช่ซ่อนเงียบ ๆ แบบเดิม)
  /* มิติที่กรองได้ = สถานะ · ทีมเจ้าของงาน · ช่องทาง (มติผู้ใช้ 2026-08-05)
     เดิมมีหมวด "คิวงาน" ที่ติ๊ก `openOnly` ไว้ตั้งแต่แรกเพื่อซ่อนลีดที่ปิดแล้ว —
     ถอดออกเพราะมันไม่ใช่ *มิติของข้อมูล* แต่เป็นทางลัดที่ทับกับตัวกรองสถานะ
     (ซ่อนที่ปิดแล้ว = เลือกสถานะที่ยังเปิดอยู่) และการติ๊กไว้เงียบ ๆ ทำให้ผู้ใช้
     เห็นจำนวนลีดไม่ตรงกับที่มีจริงโดยไม่รู้ตัว · ตอนนี้ไม่ติ๊กอะไรไว้ = เห็นทุกใบ */
  /* ขอบเขตที่กำลังดู — "ของฉัน / ทีม / ทั้งหมด" (มติผู้ใช้ 2026-08-05)
     ⚠️ ตั้งต้นที่ตัว **กว้างสุด** ไม่ใช่ตัวแรก: วันนี้ทุกคนเห็นทุกใบที่ API คืนมา
     ถ้าตั้งต้นเป็น "ของฉัน" คนที่เคยเห็นคิวทั้งทีมจะเปิดหน้ามาแล้วของหายไปเฉย ๆ
     (หน้าดีลตั้งต้นที่ตัวแรกได้เพราะมันเป็นแบบนั้นมาแต่ต้น) */
  const scopes = useMemo(() => leadScopes(role), [role]);
  const [scope, setScope] = useStickyState("scope", null);
  const activeScope = scope && scopes.includes(scope) ? scope : scopes[scopes.length - 1];

  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", EMPTY);
  const [teamFilter, setTeamFilter] = useStickyState("teamFilter", EMPTY);
  const [assigneeFilter, setAssigneeFilter] = useStickyState("assigneeFilter", EMPTY);
  const [channelFilter, setChannelFilter] = useStickyState("channelFilter", EMPTY);
  const [sortKey, setSortKey] = useStickyState("sortKey", "created");
  const [sortDir, setSortDir] = useStickyState("sortDir", "desc");

  const SORT_OPTIONS = [
    { key: "created", label: "รับล่าสุด" },
    { key: "name", label: CUSTOMER_NAME_LABEL },
    { key: "status", label: "สถานะ" },
    { key: "budget", label: "Budget" },
  ];

  // ทิศตั้งต้นต่อคีย์: ตัวหนังสือ/สถานะอ่าน ก→ฮ (asc), วันที่/ยอดเอาใหม่/มากก่อน (desc)
  const defaultDir = (key) => (key === "name" || key === "status" ? "asc" : "desc");
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(defaultDir(key)); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />; // open = ยังไม่ปิด
  const [month, setMonth] = useStickyState("month", thisMonth());
  const [allMonths, setAllMonths] = useStickyState("allMonths", false);
  /* โหมดช่วงเวลา (IS-26080023) — Marketing นับลีดรายวัน/สัปดาห์เทียบยอด Spending Ads
     ⚠️ ค่าตั้งต้นยังเป็น "รายเดือน" · คนที่ไม่ได้ทำงานรายวันต้องไม่เจออะไรใหม่
     วันนี้คิดจาก **วันไทย** ไม่ใช่ `new Date()` ของเบราว์เซอร์ ไม่งั้นช่วง "สัปดาห์นี้"
     ของคนที่ตั้งเครื่องเป็น timezone อื่นจะเลื่อนไปคนละสัปดาห์กับตัวเลขที่ server นับ */
  const todayTh = businessDayKey(new Date().toISOString());
  const [periodMode, setPeriodMode] = useState("month");
  const [range, setRange] = useState(() => ({ from: addDays(todayTh, -13), to: todayTh }));
  const [busy, setBusy] = useState("");

  // modals
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  // ไฟล์อ้างอิงที่แนบไว้ตอนกรอกลีดใหม่ — ยังไม่มี id ให้อัป จึงถือไว้จนลีดเกิด
  const [pendingFiles, setPendingFiles] = useState([]);

  // ยิง KPI เฉพาะ role ที่ API ยอมให้อ่าน — คนอื่นเคยได้ 403 ทุกครั้งที่เปิด/เปลี่ยนเดือน
  // (ทิ้งไปเปล่า ๆ เพราะแถบตัวเลขก็ไม่ขึ้นให้เขาอยู่แล้ว) · ด่านเดียวกับที่ใช้ตัดสินการ render
  const showKpi = canSeeLeadKpi(role);
  /* ⭐ **แยกสองก้อนที่ผันตามคนละอย่าง** (แก้ 2026-08-25)
     🐞 ของเดิมมัด "รายการลีด" กับ "แถบ KPI" ไว้ใน `Promise.all` เดียวกัน ทั้งที่
     `/api/sales-planning/leads` **ไม่รับพารามิเตอร์ตัวกรองเลยสักตัว** ⇒ เลื่อนช่วงวัน
     ทีละวันในช่วง 14 วัน = ดึงรายการลีดทั้งก้อนซ้ำ 14 รอบโดยไม่มีอะไรเปลี่ยน
     ผลข้างเคียงที่ผู้ใช้เห็น: ตารางกระพริบ/หายทุกครั้งที่ขยับตัวกรองซึ่งไม่เกี่ยวกับตาราง
     ⚠️ ตัวนับรอบ **แยกชุดกัน** — ชุดเดียวจะทำให้การโหลดของก้อนหนึ่งไปทิ้งคำตอบ
     ของอีกก้อน (ดูหมายเหตุใน lib/ui/useLatestRun) */
  const startLeadsRun = useLatestRun();
  const loadLeads = useCallback(async (opts) => {
    const isLatest = startLeadsRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/leads");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดลีดไม่สำเร็จ");
      const rows = await res.json();
      if (!isLatest()) return;
      setLeads(rows);
    } catch (e) {
      // รอบเก่าที่ล้มต้องไม่พ่นข้อความทับหน้าที่กำลังโหลดของใหม่อยู่
      if (isLatest() && !opts?.background) setError(e.message || "โหลดลีดไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startLeadsRun]);

  /* ⚠️ ก้อนนี้คือก้อนที่ผันตามตัวกรองจริง ๆ · มีช่องวันที่ ⇒ เลื่อนทีละวันคือยิงซ้อนกัน
     หลายรอบ คำตอบมาผิดลำดับเมื่อไรตัวเลขจะเป็นของช่วงที่เลื่อนผ่านไปแล้ว
     ⚠️ **ไม่มีสถานะโหลดของตัวเอง** โดยตั้งใจ — ตัวเลขเปลี่ยนค่าอยู่กับที่อ่านง่ายกว่า
     แถบตัวเลขที่หายแล้วโผล่ (และตารางข้างล่างไม่เกี่ยวกับตัวกรองนี้เลย) */
  const startKpiRun = useLatestRun();
  const loadKpi = useCallback(async () => {
    if (!showKpi) { setKpi(null); return; }
    const isLatest = startKpiRun();
    try {
      // ติ๊ก "ทุกเดือน" = ทุกเดือนของปีที่เลือก (เดิมส่ง month=all = ทุกปีตั้งแต่เปิดระบบ)
      // โหมดช่วงวันส่ง from/to ซึ่ง API ให้มาก่อน month/year (IS-26080023)
      const res = await fetch(periodMode === "range"
        ? `/api/sales-planning/leads/kpi?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
        : allMonths
          ? `/api/sales-planning/leads/kpi?year=${encodeURIComponent(yearOfMonth(month) || "")}`
          : `/api/sales-planning/leads/kpi?month=${encodeURIComponent(month)}`);
      const data = res.ok ? await res.json() : null;
      if (!isLatest()) return; // ตัวกรองขยับไปแล้ว — คำตอบนี้เป็นของช่วงเก่า
      setKpi(data);
    } catch {
      // แถบตัวเลขพังต้องไม่ทำให้คิวลีดพัง — คงเลขเดิมไว้เงียบ ๆ
    }
  }, [month, allMonths, periodMode, range.from, range.to, showKpi, startKpiRun]);

  /** ดึงใหม่ทั้งหน้า — ใช้หลังทำรายการที่กระทบทั้งตารางและตัวเลข */
  const load = useCallback(async (opts) => {
    await Promise.all([loadLeads(opts), loadKpi()]);
  }, [loadLeads, loadKpi]);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { loadKpi(); }, [loadKpi]);
  useRevalidateOnFocus(load);

  // รายชื่อ AE (มอบหมาย) + ลูกค้า (qualify) — โหลดเมื่อ role ทำงานคิวได้เท่านั้น
  useEffect(() => {
    if (role === "marketing" || !canLead) return;
    fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
    // โครงการ — โมดัลแตกดีลจากลีดเลือกโครงการได้เหมือนหน้ารวมดีล (ไม่งั้นดีลที่มาจาก
    // ลีดจะไม่มีโครงการติดมาเลย แล้วสอบถาม RD ในนามดีลนั้นไม่ได้)
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((d) => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, [role, canLead]);

  // ชื่อผู้รับผิดชอบที่ควรขึ้นจอ — อ่านจาก `assigneeId` ไม่ใช่สำเนาชื่อในแถว
  // (prod มี 64 แถวที่ `assigneeName` เป็นชื่อย่อ/ชื่อเก่าซึ่งไม่ตรงบัญชีใครเลย)
  const assigneeNameOf = useCallback(
    (lead) => livePersonName(directory, lead?.assigneeId, lead?.assigneeName),
    [directory],
  );

  /* วันหยุด — ใช้นับ "ค้างกี่วันทำการ" บนการ์ดสรุป (เส้นเดียวกับที่ SLA ใช้ฝั่ง server)
     โหลดพลาด = Set ว่าง ⇒ นับเสาร์อาทิตย์ถูกอยู่ แต่วันหยุดนักขัตฤกษ์จะถูกนับเป็นวันทำการ
     (ตัวเลขพองนิดหน่อย ดีกว่าการ์ดหายทั้งใบ) */
  const [holidays, setHolidays] = useState(() => new Set());
  useEffect(() => {
    cachedFetchJson("/api/holidays")
      .then((rows) => setHolidays(new Set((Array.isArray(rows) ? rows : []).map((h) => h.date))))
      .catch(() => {});
  }, []);

  /* ลีดในขอบเขตที่กำลังดู **ก่อน** ตัวกรองค้นหา/สถานะ/ช่องทาง
     การ์ดสรุปตอบคำถาม "ของใครค้างอยู่" ซึ่งต้องนิ่งไม่ว่าจะพิมพ์ค้นหาอะไรอยู่ —
     ตัวกรองมีไว้ *หาใบ* ไม่ใช่เปลี่ยนภาพรวม (และการ์ดเองเป็นตัวสั่งตัวกรอง) */
  const scopedLeads = useMemo(() => leads.filter((l) => {
    if (activeScope === "mine" && meId) return l.assigneeId === meId || l.createdBy === meId;
    // "ทีมของฉัน" = ทุกทีมที่สังกัด (คนเดียวอยู่ได้หลายทีม)
    if (activeScope === "team" && teams.length) return teams.includes(l.team) && myTeams.matches(l.team);
    return true;
  }), [leads, activeScope, meId, teams, myTeams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = leads.filter((l) => {
      // ขอบเขต: "ของฉัน" = ถูกมอบให้เรา หรือเรากรอกเข้ามา (ตรงกับสาขา ae ของ
      // applyLeadScope) · "ทีม" = ทีมเดียวกับเรา · "ทั้งหมด" = ไม่กรอง
      if (activeScope === "mine" && meId && !(l.assigneeId === meId || l.createdBy === meId)) return false;
      if (activeScope === "team" && teams.length && !(teams.includes(l.team) && myTeams.matches(l.team))) return false;
      if (statusFilter.length && !statusFilter.includes(l.status)) return false;
      // ลีดที่ยังไม่คัดกรองไม่มีทีม (team = null) — ต้องมีตัวเลือกของตัวเอง
      // ไม่งั้นพอกรองทีม คิวกลางจะหายไปทั้งก้อนโดยไม่มีอะไรบอก
      if (teamFilter.length && !teamFilter.includes(l.team || NO_TEAM)) return false;
      // แยกจากทีมโดยตั้งใจ: หัวหน้าทีมอยากดู "ทีมตัวเอง" กับ "ใบของ AE คนนี้"
      // คนละคำถามกัน และลีดของทีมอาจยังไม่มีผู้รับผิดชอบ
      if (assigneeFilter.length && !assigneeFilter.includes(l.assigneeId || NO_ASSIGNEE)) return false;
      if (channelFilter.length && !channelFilter.includes(l.channel)) return false;
      if (!q) return true;
      // ค้นด้วยชื่อ *ปัจจุบัน* — ไม่งั้นพิมพ์ชื่อใหม่ของ AE แล้วหาลีดของเขาไม่เจอ
      return [l.contactName, l.company, l.phone, l.email, l.details, assigneeNameOf(l)].some((v) => (v || "").toLowerCase().includes(q));
    });
    
    const mul = sortDir === "desc" ? -1 : 1;
    /* ลำดับของสถานะบนเส้นทาง — สถานะแปลกหน้าไปท้ายสุด
       🐞 เดิมเขียน `LEAD_STATUSES.indexOf(s) || 99` ซึ่ง **พังกับตัวแรกของลิสต์**:
       `indexOf('new')` = 0 แล้ว `0 || 99` = 99 ⇒ "รอคัดกรอง" (คิวกลางที่ต้องคัดก่อนใคร)
       ตกไปอยู่ท้ายสุดตอนเรียง ก→ฮ ส่วนสถานะที่ไม่รู้จักได้ -1 แล้วไปโผล่หัวแทน
       ตรวจจริงบน prod: กดเรียงสถานะแล้วใบรอคัดกรองที่ค้าง 12 วันทำการไปอยู่หน้าสุดท้าย */
    const statusRank = (status) => {
      const i = LEAD_STATUSES.indexOf(status);
      return i < 0 ? 99 : i;
    };
    return result.sort((a, b) => {
      if (sortKey === "name") return (a.contactName || "").localeCompare(b.contactName || "", "th") * mul;
      if (sortKey === "status") return (statusRank(a.status) - statusRank(b.status)) * mul;
      if (sortKey === "budget") return ((a.budget || 0) - (b.budget || 0)) * mul;
      // asc = เก่า→ใหม่ ให้ desc (ค่าตั้งต้น) โชว์ล่าสุดก่อน — เดิมกลับทิศ ทำให้เปิดหน้ามาเจอลีดเก่าสุด
      return ((a.createdAt || "") < (b.createdAt || "") ? -1 : 1) * mul;
    });
  }, [leads, query, activeScope, meId, teams, myTeams, statusFilter, teamFilter, assigneeFilter, channelFilter, sortKey, sortDir, assigneeNameOf]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, {
      resetKey: `${activeScope}|${query}|${statusFilter.join()}|${teamFilter.join()}|${assigneeFilter.join()}|${channelFilter.join()}|${sortKey}|${sortDir}`,
    });

  /* จำนวนต่อตัวเลือก — โชว์ท้ายป้ายในแผงกรอง ให้เห็นว่าติ๊กแล้วจะเหลือกี่ใบ
     ก่อนกด (นับจากลีดทั้งหมดที่โหลดมา ไม่ใช่จากผลกรองปัจจุบัน) */
  const countBy = useMemo(() => {
    const status = {}; const team = {}; const assignee = {}; const channel = {};
    for (const l of leads) {
      status[l.status] = (status[l.status] || 0) + 1;
      team[l.team || NO_TEAM] = (team[l.team || NO_TEAM] || 0) + 1;
      assignee[l.assigneeId || NO_ASSIGNEE] = (assignee[l.assigneeId || NO_ASSIGNEE] || 0) + 1;
      channel[l.channel] = (channel[l.channel] || 0) + 1;
    }
    return { status, team, assignee, channel };
  }, [leads]);

  /* ตัวเลือก "ผู้รับผิดชอบ" มาจาก **คนที่ถือลีดอยู่จริง** ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ —
     ทะเบียนผู้ใช้มีคนที่ไม่เคยแตะคิวลีดเลยเยอะ ถ้าเอามาทั้งหมดจะเลื่อนหาไม่เจอ
     ชื่อใช้ตัวเดียวกับที่แสดงในแถว (assigneeNameOf → ชื่อปัจจุบัน ไม่ใช่ชื่อที่ค้างในแถว)
     ไม่งั้นกรองด้วยชื่อที่เห็นในตารางแล้วหาไม่เจอ */
  const assigneeOptions = useMemo(() => {
    const byId = new Map();
    for (const l of leads) {
      if (!l.assigneeId) continue;
      if (!byId.has(l.assigneeId)) byId.set(l.assigneeId, assigneeNameOf(l) || l.assigneeName || l.assigneeId);
    }
    const rows = [...byId.entries()]
      .map(([id, name]) => ({ value: id, label: `${name} (${countBy.assignee[id] || 0})` }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
    const none = countBy.assignee[NO_ASSIGNEE] || 0;
    // ใบที่ยังไม่มีเจ้าของ = คิวที่หัวหน้าทีมต้องกระจาย — ต้องกรองเจาะได้
    return none ? [...rows, { value: NO_ASSIGNEE, label: `ยังไม่มอบหมาย (${none})` }] : rows;
  }, [leads, countBy, assigneeNameOf]);

  // ด่านเดียวกับที่ปุ่มใช้ — ห้ามเขียนเงื่อนไขเพิ่มที่ปุ่ม (ปุ่มจางแบบไม่บอกเหตุผล)
  const leadBlocker = formOpen ? leadFormBlocker(form) : "";

  const saveLead = async (e) => {
    e?.preventDefault?.();
    const blocked = leadFormBlocker(form);
    if (blocked) { setError(blocked); return; }
    setBusy("save");
    setError("");
    try {
      const res = await fetch(form.id ? `/api/sales-planning/leads/${form.id}` : "/api/sales-planning/leads", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกลีดไม่สำเร็จ");
      /* ⭐ ไฟล์ที่แนบไว้ตอนกรอก อัปหลังลีดเกิด (IS-26080014) — ก่อนหน้านี้ต้องบันทึกลีด
         ให้เสร็จ เปิดหน้ารายละเอียด แล้วค่อยแปะรูปในเธรด ⇒ คนกรอกลีดจากแชทลูกค้า
         (ทีม Marketing) มีรูปอ้างอิงอยู่ในมือตั้งแต่ตอนนั้นแต่ไม่มีที่ให้วาง
         ⚠️ ลงเธรด ไม่ใช่ตาราง attachments — หน้าลีดไม่มีแผงเอกสารแนบ ไฟล์ที่ลง
         ตารางนั้นจะไม่โผล่ที่ไหนเลย (ทะเบียน updateAccess ตั้ง attachments: true
         ให้ลีดไว้แล้วด้วยเหตุผลเดียวกัน: "สกรีนช็อตแชท/นามบัตร = หลักฐานต้นทาง")
         ⚠️ ลีดถูกสร้างสำเร็จไปแล้ว ณ จุดนี้ — ไฟล์พลาดต้องไม่ทำให้ทั้งรายการล้ม
         แค่บอกให้ไปแนบต่อที่หน้ารายละเอียด */
      const created = await res.json().catch(() => null);
      let fileError = "";
      if (!form.id && pendingFiles.length && created?.id) {
        try {
          await postUpdateWithFiles({
            entityType: "lead",
            entityId: created.id,
            body: "ไฟล์อ้างอิงจากตอนรับลีด",
            files: pendingFiles,
          });
        } catch (upErr) {
          fileError = `บันทึกลีดแล้ว แต่แนบไฟล์ไม่สำเร็จ (${upErr.message}) — แนบต่อได้ที่หน้ารายละเอียดลีด`;
        }
      }
      setPendingFiles([]);
      setFormOpen(false);
      if (fileError) setError(fileError);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกลีดไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  /* จุดเดียวที่ปุ่มในแถววิ่งเข้า — คืน false = ไม่สำเร็จ RecordActionMenu จะค้างกล่องไว้
     พร้อมค่าที่กรอก ผู้ใช้ไม่ต้องพิมพ์ใหม่ (สัญญาเดียวกับหน้ารายละเอียด) */
  const runTransition = async (lead, actionId, values) => {
    if (!LEAD_TRANSITION_ACTIONS.includes(actionId)) return false;
    setBusy("action");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/${lead.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLeadTransitionPayload({ action: actionId, values, users })),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  const canCreateDeals = canCreateDealFromLead(role);
  const [dealModal, setDealModal] = useState(null); // lead ที่กำลังเปิดดีลให้


  const deleteLead = async (lead) => {
    if (!(await confirmAction(`ลบลีด "${lead.contactName}"? การลบย้อนกลับไม่ได้`))) return;
    setError("");
    const res = await fetch(`/api/sales-planning/leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "ลบลีดไม่สำเร็จ");
    await load();
  };

  const viewer = useMemo(() => ({ role, id: meId, team }), [role, meId, team]);
  /* ผู้รับผิดชอบ (AE) ของดีลที่จะเปิดจากลีดนี้ — กติกา "เฉพาะทีมตัวเอง" อยู่ใน hook
     ที่เดียว (หน้ารวมดีลใช้ตัวเดียวกัน) */
  const dealOwners = useDealOwners(meId);
  /* กติกา "ลีดใบนี้ทำอะไรได้บ้าง" มาจากไฟล์เดียวกับหน้ารายละเอียด — เดิมหน้านี้มี
     rowActions() ของตัวเองที่คิดซ้ำจาก LEAD_TRANSITIONS + เช็ค role เอง แล้วเพี้ยนจาก
     หน้ารายละเอียดได้เงียบ ๆ (เจอจริง: contact บังคับเหตุผลที่นี่ แต่หน้าโน้นไม่บังคับ) */
  const lifecycle = useMemo(
    () => createLeadLifecycle({ users, canCreateDeals, viewerTeam: team, workload }),
    [users, canCreateDeals, team, workload],
  );
  /* "เปิดดีล" ไม่ใช่ขั้นในเส้นทาง (ดู leadDealAction) — ในแถวจึงมี **ช่องของตัวเอง**
     แยกจากปุ่มก้าวถัดไป (มติผู้ใช้ 2026-08-04) ไม่ใช่ซ่อนในเมนู "…" ซึ่งหาไม่เจอ
     โดยเฉพาะขั้น "นัดประชุมแล้ว"/"เปิดลูกค้าแล้ว" ที่ไม่มีก้าวถัดไปเหลือแล้ว
     งานที่ต้องทำจริงคือเปิดดีล · ใช้ descriptor ตัวเดียวกับหน้ารายละเอียด
     ห้ามคิดเงื่อนไขซ้ำที่นี่ — ป้ายในแถวใช้ rowLabel (สั้นกว่า label บนการ์ด) */
  const dealActionFor = (lead) => {
    const action = leadDealAction({
      lead, user: viewer, canCreateDeals, icon: Handshake, onClick: () => setDealModal(lead),
    });
    return { ...action, label: action.rowLabel };
  };
  // นโยบายเดียวกับ API (lib/sales/leads.js) — ปุ่มโชว์เฉพาะเมื่อ action จะสำเร็จจริง
  const canEditRow = (lead) => canEditLead({ role, id: meId, team }, lead);
  const canDeleteRow = (lead) => canDeleteLead({ role, id: meId, team }, lead);

  const slaPct = (s) => (s && s.checked ? fmtPercent((s.hit / s.checked) * 100) : NA);

  /* ตัวเลือกเดือนคุม **แถบตัวเลขด้านบนเท่านั้น** ไม่ได้กรองตารางข้างล่าง
     🐞 มันอยู่หัวหน้าข้างปุ่ม "รับลีดใหม่" จึงอ่านเป็นตัวกรองทั้งหน้า แล้วคนเห็น
     "ลีดเข้า 128 · เดือน 2026-08" อยู่เหนือตารางที่ลิสต์ลีดทั้งหมดตลอดกาล
     = ตัวเลขสองชุดบนจอเดียวกันที่ไม่มีทางตรงกัน (ตรวจเจอ 2026-08-08)

     ⚠️ **ไม่กรองตารางตามเดือน** โดยเจตนา — คิวงานต้องโชว์ทุกใบที่ยังไม่ปิดไม่ว่าจะ
     เข้ามาเดือนไหน ตัดด้วยเดือนแล้วลีดที่ค้างข้ามเดือน (ใบที่ต้องทวงที่สุด) จะหายจากคิว
     ⇒ แก้ด้วยการเขียนขอบเขตของแต่ละส่วนให้ชัด ไม่ใช่ย้ายพฤติกรรมของตาราง */
  const periodNote = periodMode === "range"
    ? `${fmtDate(range.from)} – ${fmtDate(range.to)}`
    : allMonths ? `ทั้งปี ${yearOfMonth(month) || ""}`.trim() : `เดือน ${month}`;

  if (!canLead && !canView) {
    return (
      <SaWorkspace icon={<Inbox size={22} />} title="ลีด">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </SaWorkspace>
    );
  }

  return (
    <SaWorkspace
      icon={<Inbox size={22} />}
      title="บริหารงานขาย — ลีด"
      subtitle="Marketing กรอกลีดรายวัน → คัดกรองส่งทีมใน 1 วันทำการ → AE ติดต่อกลับใน 1 วันทำการ"
      headerRight={
        <>
          {/* สลับหน่วยของงวด — รายเดือนคือค่าตั้งต้นเดิม ช่วงวันเพิ่มมาให้ Marketing
              (IS-26080023) · ใช้ `Segmented` ตัวกลาง ไม่ก๊อปแถบปุ่มขึ้นมาเอง */}
          <Segmented
            ariaLabel="หน่วยของงวด"
            value={periodMode}
            onChange={setPeriodMode}
            options={[{ value: "month", label: "รายเดือน" }, { value: "range", label: "ช่วงวัน" }]}
          />
          {periodMode === "range" ? (
            <DayRangePicker
              from={range.from}
              to={range.to}
              today={todayTh}
              markedDays={Object.keys(kpi?.byDay || {})}
              onChange={setRange}
            />
          ) : (
            <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
          )}
          {canCreate && (
            <button type="button" className="btn btn-accent" onClick={() => { setForm(initialForm); setPendingFiles([]); setFormOpen(true); }}>
              <Plus size={15} aria-hidden="true" /> รับลีดใหม่
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

          {/* ขอบเขต + ทางไป KPI เต็ม อยู่ใต้หัวหน้า เหนือแถบ KPI — ตำแหน่งเดียวกับ
              หน้าไปป์ไลน์ดีล (มติผู้ใช้ 2026-08-05) ขอบเขตจำกัด "ชุดข้อมูลของทั้งหน้า"
              ทั้งตัวเลขและตาราง จึงต้องอยู่เหนือทุกอย่าง ไม่ใช่ปนกับตัวกรองที่ทำงาน
              ภายในชุดนั้น · ลิงก์ KPI เต็มอยู่ลำดับเดียวกัน จึงอยู่แถวเดียวกัน

              ⚠️ เงื่อนไขของสองตัวนี้ **คนละตัวโดยเจตนา** — ตัวสลับไม่ผูกกับ canSeeLeadKpi
              เพราะ KPI ลีดเปิดให้เฉพาะผู้กำกับดูแล/ทีม intake แต่ขอบเขตเป็นของคนทำงาน
              คิวทุกคน (senior_ae/ac/ae ไม่เห็น KPI แต่ต้องสลับขอบเขตได้)
              ⇒ แถวนี้โผล่เมื่อมีอย่างน้อยหนึ่งอย่าง ไม่ใช่ผูกกับสิทธิ์ใดสิทธิ์หนึ่ง */}
          {(scopes.length > 1 || showKpi) && (
            <div className="scope-row">
              {scopes.length > 1 && (
                <Segmented
                  ariaLabel="ขอบเขตของคิวลีด"
                  className="scope-toggle"
                  value={activeScope}
                  onChange={setScope}
                  options={scopes.map((key) => ({ value: key, label: SCOPE_LABELS[key] }))}
                />
              )}
              {activeScope === "team" && (
                <MyTeamsFilter teams={myTeams.teams} selected={myTeams.selected} onChange={myTeams.setSelected} />
              )}
              {showKpi && (
                <Link href="/sa/dashboard?tab=lead_kpi" className="linklike kpi-full-link">ดู KPI เต็ม →</Link>
              )}
            </div>
          )}

          {/* แถบตัวเลขขึ้นเฉพาะคนที่ API ยอมให้อ่าน — `canSeeLeadKpi` เป็นด่านเดียวกับที่
              /api/sales-planning/leads/kpi ใช้ (superuser · marketing · ผู้สังเกตการณ์)
              🐞 เดิม render ไม่มีเงื่อนไข ⇒ AE/AC/Senior AE ที่โดน 403 เปิดหน้ามาเจอ
              การ์ดเปล่าโชว์ "-" สี่ใบทุกครั้ง กินพื้นที่บนสุดของหน้าไปฟรี ๆ แถมชวนให้คิดว่า
              ระบบพัง ทั้งที่ตั้งใจไม่ให้เห็น (ลิงก์ "ดู KPI เต็ม" ข้างบนกันด่านนี้อยู่แล้ว) */}
          {showKpi && (
          <SaMetricStrip aria-busy={loading}>
            <SaMetric icon={<Inbox />} label="ลีดเข้า" value={naText(kpi?.funnel?.total)} note={periodNote} />
            {/* "ค้างตอนนี้" ไม่ผูกกับเดือนที่เลือกโดยเจตนา — ลีดที่ค้างข้ามเดือนมาคือใบที่
                ต้องทวงที่สุด ถ้าตัดด้วยเดือนมันจะหายไปทั้งที่ยังไม่มีใครแตะ
                ⚠️ ป้ายมาจาก `LEAD_SLA_STAGES` ที่เดียวร่วมกับแท็บ "KPI ลีด" — เคยสะกดเอง
                ทั้งสองจอ แล้วแก้คำที่จอเดียว (#1171) จนสองจอเรียกเลขตัวเดียวกันคนละชื่อ
                ด่านคัดกรองจึงขึ้น "ค้างทั้งบริษัท" ตามของจริง: คิวกลางไม่มีทีม API เลย
                นับโดยไม่ใส่ตัวกรองทีม */}
            {LEAD_SLA_STAGES.map(({ key, label, pendingLabel }) => (
              <SaMetric
                key={key}
                icon={SLA_STAGE_ICONS[key]}
                label={label}
                value={slaPct(kpi?.sla?.[key])}
                note={leadSlaNote(kpi?.sla?.[key] || {}, pendingLabel)}
                tone={slaPendingTone(kpi?.sla?.[key]?.pending)}
              />
            ))}
            {/* อัตราปิด = เปิดลูกค้า ÷ ลีดเข้า · ตัวหารเดียวกับแท็บ KPI เต็ม ตัวเลขจึงตรงกันสองจอ
                ⚠️ โน้ตสั้นแค่นี้เพราะแถบมี 5 ช่องแล้ว — ยาวกว่านี้โดน ellipsis ตัดกลางคัน
                (ก่อนหน้านี้เขียนโซ่ "เข้า → ติดต่อ → เปิดลูกค้า" แล้วโดนตัดจริง)
                รายละเอียดว่าหล่นตรงไหนอยู่ที่แท็บ "KPI ลีด" ซึ่งมีที่พอ */}
            <SaMetric icon={<CalendarClock />} label="อัตราปิด (เปิดลูกค้า)" value={kpi?.funnel?.total ? fmtPercent((kpi.funnel.qualified / kpi.funnel.total) * 100) : NA} note={`${kpi?.funnel?.qualified ?? 0} จาก ${kpi?.funnel?.total ?? 0} ใบ`} />
          </SaMetricStrip>
          )}

        {/* การ์ด "ค้างคิว" — อะไรค้าง ค้างกี่วันทำการ ใครถือ
            ต่างจากแถบ KPI ด้านบนตรงที่**ไม่ผูกกับเดือน**: ของค้างคือของค้าง ไม่ว่าจะ
            เข้ามาเดือนไหน · กดชื่อขั้น/ชื่อคนแล้วกรองตารางให้เลย จะได้ลงมือต่อได้ทันที
            ⚠️ ตัวเลขมาจาก summarizeLeadQueue ตัวเดียวกับการ์ดสรุปเช้าเข้าแชท */}
        <LeadQueueSummary
          leads={scopedLeads}
          directory={directory}
          holidays={holidays}
          scopeLabel={scopes.length > 1 ? SCOPE_LABELS[activeScope] : null}
          showOwners={activeScope !== "mine"}
          // API แนบบริบทการตีกลับมากับแถวแล้ว (ดู attachBounceContext)
          withBounceContext
          onPickStatus={(status) => setStatusFilter([status])}
          onPickOwner={(assigneeId) => setAssigneeFilter([assigneeId])}
        />

        {/* ⚠️ subtitle ต้องบอกให้ชัดว่าตารางนี้ไม่ได้ผูกกับตัวเลือกเดือนด้านบน — ไม่งั้น
            "ลีดเข้า 128 · เดือน 2026-08" กับ "743 ลีด" บนจอเดียวกันจะอ่านเป็นความขัดแย้ง */}
        <SaSection icon={<Inbox size={17} />} title="คิวลีด" subtitle="ค้นหา คัดกรอง และติดตามลีดจนพร้อมส่งต่อเป็นดีล — แสดงทุกเดือน ไม่ผูกกับตัวเลือกเดือนด้านบน" actions={<span className="ui-badge">{filtered.length} ลีด · ทุกเดือน</span>}>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <div className="search-glass" style={{ width: 260 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาลีด / บริษัท / เบอร์" aria-label="ค้นหาลีด" />
            </div>
            <FilterPopover
              count={statusFilter.length + teamFilter.length + assigneeFilter.length + channelFilter.length}
              onClear={() => { setStatusFilter([]); setTeamFilter([]); setAssigneeFilter([]); setChannelFilter([]); }}
              groups={[
                {
                  key: "status", label: "สถานะ", icon: Filter,
                  options: LEAD_STATUSES.map((s) => ({ value: s, label: `${LEAD_STATUS_LABELS[s]} (${countBy.status[s] || 0})` })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "team", label: "ทีมเจ้าของงาน", icon: Users,
                  options: [
                    ...TEAMS.map((t) => ({ value: t, label: `${TEAM_LABELS[t] || t} (${countBy.team[t] || 0})` })),
                    // คิวกลางที่ยังไม่ถูกคัดกรอง — ไม่ใช่ "ไม่มีข้อมูล" แต่เป็นสถานะจริงของงาน
                    { value: NO_TEAM, label: `ยังไม่คัดกรอง (${countBy.team[NO_TEAM] || 0})` },
                  ],
                  selected: teamFilter, onChange: setTeamFilter,
                },
                {
                  key: "assignee", label: "ผู้รับผิดชอบ", icon: UserRound,
                  options: assigneeOptions,
                  selected: assigneeFilter, onChange: setAssigneeFilter,
                },
                {
                  key: "channel", label: "ช่องทาง", icon: PhoneCall,
                  options: LEAD_CHANNELS.map((c) => ({ value: c, label: `${LEAD_CHANNEL_LABELS[c] || c} (${countBy.channel[c] || 0})` })),
                  selected: channelFilter, onChange: setChannelFilter,
                },
              ]}
            />
            <div className="spacer" />
            <SortControl
              value={sortKey}
              onChange={(event) => { setSortKey(event.target.value); setSortDir(defaultDir(event.target.value)); }}
              options={SORT_OPTIONS}
              direction={sortDir}
              onDirectionChange={setSortDir}
              selectStyle={{ width: 120 }}
            />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead>
                <tr>
                  <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>ลูกค้า/ผู้ติดต่อ {sortArrow("name")}</span></th>
                  <th>ช่องทาง</th>
                  <th>บริการที่สนใจ</th>
                  <th className="num" onClick={() => handleSort("budget")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>Budget {sortArrow("budget")}</span></th>
                  <th>ทีม / ผู้รับผิดชอบ</th>
                  <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none", textAlign: "center" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" }}>สถานะ {sortArrow("status")}</span></th>
                  {/* ⭐ วันติดตามต่อ (mig 0289) — **คำสัญญาที่ AE ให้ลูกค้าไว้** ต้องอ่านได้จาก
                      ตารางโดยไม่ต้องเปิดใบ · รวมช่องเดียวกับ "รับเมื่อ" เพราะตารางนี้มี 8
                      คอลัมน์อยู่แล้ว เพิ่มช่องใหม่จะดันให้เลื่อนแนวนอนบนจอ 1280
                      ใบที่ยังไม่มีวันติดตามยังโชว์ "รับเมื่อ" เหมือนเดิมทุกประการ */}
                  <th onClick={() => handleSort("created")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>ติดตามต่อ / รับเมื่อ {sortArrow("created")}</span></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {/* DetailRow แทน <tr onClick> ดิบ — ท่าเดียวกับหน้าดีล/โครงการ
                    ได้ 2 อย่างที่ของเดิมไม่มี: กด Enter/Space บนแถวได้ (คีย์บอร์ด) และ
                    `isInteractiveTarget` กันแถวยิง router.push ซ้ำตอนกดลิงก์ชื่อ/ปุ่มข้างใน */}
                {pageRows.map((lead) => (
                  <DetailRow key={lead.id} href={`/sa/leads/${lead.id}`} className="premium-row">
                    <td>
                      {/* ชื่อเป็นลิงก์จริง ไม่ใช่ข้อความในแถวที่กดได้ — คลิกทั้งแถวใช้ได้เฉพาะ
                          เมาส์ ส่วนลิงก์ได้ทั้งคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/เปิดแท็บใหม่
                          ท่าเดียวกับหน้าดีลและหน้าโครงการ (`linklike` = ลิงก์ที่ไม่ทำสีทับข้อความ)
                          prefetch={false}: ลิสต์ยาว ๆ เคยยิง RSC prefetch เป็นพันครั้ง/วัน */}
                      <Link prefetch={false} href={`/sa/leads/${lead.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้ารายละเอียดลีด">
                        <strong>{lead.contactName}</strong>
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                          {naText([lead.company, lead.phone, lead.email || lead.contactChannel].filter(Boolean).join(" · "))}
                        </span>
                      </Link>
                    </td>
                    <td>{channelBadge(lead.channel)}</td>
                    <td>
                      {SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest}
                      {lead.serviceDetail && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{lead.serviceDetail}</span>}
                    </td>
                    <td className="num mono">{leadBudgetText(lead, fmtMoney, "-")}</td>
                    <td>
                      {lead.team ? `${TEAM_LABELS[lead.team] || lead.team}` : NA}
                      {assigneeNameOf(lead) && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{assigneeNameOf(lead)}</span>}
                      {/* ⭐ ใบที่ถูกตีกลับไม่มีทีม/ผู้รับ (bounce ล้างทิ้ง) ⇒ ช่องนี้ขึ้น "—" ว่าง
                          พอดี · เจ้าของ *คนก่อน* คือคำตอบของคำถามเดียวกับคอลัมน์นี้
                          🪤 เคยวางไว้ใต้ป้ายสถานะ — ช่องนั้นกว้าง 118px ทำให้ชื่อคน + ชื่อทีม
                          ตัดเป็นสามบรรทัด (วัดจากจอจริง ไม่ได้เดา) */}
                      {!lead.team && lead.bounce?.previousAssigneeName && (
                        <span className={styles.bounceWho}>
                          เคยอยู่กับ {lead.bounce.previousAssigneeName}
                          {lead.bounce.previousTeam ? ` · ${TEAM_LABELS[lead.bounce.previousTeam] || lead.bounce.previousTeam}` : ""}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                        {statusBadge(lead.status)}
                        {/* ⭐ ใบที่ถูกส่งกลับโผล่ในคิวคัดกรอง **เหมือนลีดใหม่ทุกประการ**
                            (bounce ล้าง team/assignee ทิ้ง) ⇒ ผู้ดูแลคัดเข้าทีมเดิม
                            มอบคนเดิม แล้ววนรอบใหม่ · เพดาน 2 รอบกันได้แค่รอบที่ 3
                            ป้ายนี้คือสิ่งเดียวที่ทำให้คนตัดสินใจรู้ว่าเคยลองอะไรมาแล้ว */}
                        {lead.bounce?.autoRounds > 0 && (
                          <span className={styles.bounceTag} data-hot={lead.bounce.autoRounds >= 2 || undefined}>
                            ส่งกลับ รอบที่ {lead.bounce.autoRounds}
                          </span>
                        )}
                      </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-6)", color: "var(--text-2)" }}>
                      {lead.followUpAt ? (
                        <>
                          {/* เลยกำหนดแล้วต้องเห็นตั้งแต่กวาดตา — ทวงประจำวันเห็นใบนี้อยู่แล้ว
                              แต่ตารางเป็นที่ที่คนเปิดดูเองตอนวางแผนวัน */}
                          <strong className={styles.followUp} data-tone={leadFollowUpState(lead.followUpAt)}>
                            {fmtDate(lead.followUpAt)}
                          </strong>
                          <span className={styles.followUpSub}>รับเมื่อ {fmtDate(lead.createdAt)}</span>
                        </>
                      ) : fmtDateTime(lead.createdAt)}
                    </td>
                    <td className="num" onClick={(event) => event.stopPropagation()}>
                      {/* กติกาว่าปุ่มไหนโผล่มาจาก lifecycle ตัวเดียวกับหน้ารายละเอียด —
                          แถวโชว์ "ก้าวถัดไป" 1 ปุ่ม (มีสีตามขั้น) + เมนู "…" ที่รวม
                          ตีกลับ/ไม่ไปต่อ/แก้ไข/ลบ (มติผู้ใช้ 2026-08-01)

                          ไม่ส่ง manageHref: ตารางนี้ชื่อลีดเป็นลิงก์ไปหน้ารายละเอียดอยู่แล้ว
                          ลิงก์ "จัดการ" ท้ายแถวจึงเป็นทางที่สองไปที่เดิม — กินที่และแย่งสายตา
                          จากปุ่มก้าวถัดไป (มติผู้ใช้ 2026-08-01) */}
                      <RecordActionMenu
                        lifecycle={lifecycle}
                        record={lead}
                        user={viewer}
                        busy={!!busy}
                        recordLabel={lead.contactName}
                        sideAction={dealActionFor(lead)}
                        onTransition={(actionId, values) => runTransition(lead, actionId, values)}
                        canEdit={canEditRow(lead)}
                        canDelete={canDeleteRow(lead)}
                        onEdit={() => { setForm({ id: lead.id, channel: lead.channel, contactName: lead.contactName || "", company: lead.company || "", email: lead.email || "", contactChannel: lead.contactChannel || "", phone: lead.phone || "", serviceInterest: lead.serviceInterest || "other", serviceDetail: lead.serviceDetail || "", budget: lead.budget ?? "", budgetMax: lead.budgetMax ?? "", details: lead.details || "" }); setPendingFiles([]); setFormOpen(true); }}
                        onDelete={() => deleteLead(lead)}
                      />
                    </td>
                  </DetailRow>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีลีดตามตัวกรองนี้ {canCreate ? "— เริ่มจากปุ่มรับลีดใหม่" : ""}</td></tr>
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

      {/* ฟอร์มรับ/แก้ลีด — ชุดช่องกรอกเป็น component เดียวกับฟอร์มแก้บนหน้ารายละเอียด
          (LeadFormFields) ตามกฎ AGENTS.md · ด่านบังคับก็ตัวเดียวกัน (leadFormBlocker) */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? "แก้ไขลีด" : "รับลีดใหม่"}
        size="xl"
        footer={(
          <>
            {leadBlocker && <span className="drawer-footer-note">⚠ {leadBlocker}</span>}
            <Button variant="quiet" onClick={() => setFormOpen(false)} disabled={busy === "save"}>ยกเลิก</Button>
            <Button tone="primary" onClick={saveLead} disabled={busy === "save" || !!leadBlocker}>
              <Plus size={14} aria-hidden="true" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึกลีด"}
            </Button>
          </>
        )}
      >
        <form onSubmit={saveLead} className="form-grid cols-2" aria-busy={busy === "save"}>
          <LeadFormFields form={form} onPatch={(patch) => setForm((f) => ({ ...f, ...patch }))} disabled={busy === "save"} />
          {/* ⭐ แนบไฟล์ได้ตั้งแต่ตอนรับลีด (IS-26080014) — โหมดสร้างเท่านั้น
              แพตเทิร์นเดียวกับโมดัลงาน: สร้าง = ถือไฟล์ไว้อัปหลังบันทึก ·
              แก้ = ไปแนบที่เธรดบนหน้ารายละเอียด ซึ่งลบ/ตอบกลับ/เห็นว่าใครแนบได้ */}
          {!form.id && (
            <div className="form-group col-span-2">
              <span className="toolbar-label">ไฟล์อ้างอิงจากลูกค้า <span className="pending-files-note">(ไม่บังคับ · เช่น รูปบรรจุภัณฑ์ · สินค้าอ้างอิง · สกรีนช็อตแชท)</span></span>
              <PendingFiles
                files={pendingFiles} onChange={setPendingFiles}
                disabled={busy === "save"} onOversize={setError}
              />
            </div>
          )}
        </form>
      </Modal>

      {/* สร้างดีลจากลีด — ฟอร์มเดียวกับที่หน้ารายละเอียดใช้
          mount ตอนเปิดเท่านั้น (ดูคำเตือนใน DealCreateModal) · key = รีเซ็ตฟอร์มเมื่อสลับลีด */}
      {dealModal && (
        <DealCreateModal
          owners={dealOwners.owners}
          defaultOwnerId={dealOwners.defaultOwnerId}
          lockedOwner={dealOwners.lockedOwner}
          key={dealModal.id}
          lead={dealModal}
          customers={customers}
          projects={projects}
          categories={categories}
          onClose={() => setDealModal(null)}
        />
      )}
    </SaWorkspace>
  );
}
