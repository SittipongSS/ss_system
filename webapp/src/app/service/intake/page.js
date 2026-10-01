"use client";
// ── งานเข้าใหม่ (เฟส 4) — ทางที่งานขายเดินมาถึงฝ่าย TS ───────────────────
//
// ⭐ **ที่มาเป็นตัวเลข**: ชีตของทีมมี 102 จุดที่ลูกค้าจ่ายเงินแล้วแต่ไม่มีคิวบริการ
//   งานพวกนั้นไม่ได้หายไป — มันไม่เคยเดินมาถึงฝ่าย TS เลย เพราะไม่มีหน้าไหนพา
//   ใบสั่งขายมาให้ · หน้านี้คือทางนั้น
//
// ⚠️ **หน้านี้ไม่ใช่ที่สร้างงาน** — ทุกแถวมีต้นเรื่องเป็นใบสั่งขายที่อนุมัติแล้ว
//   ไม่มีปุ่ม "สร้างใหม่" ที่ไหนในหน้านี้โดยตั้งใจ (มติ 2026-08-28 · กติกาเดียวกับ
//   ที่ถอดปุ่ม + ออกจากทุกช่องว่างของหน้าจัดคิวเจ้าหน้าที่)
//
// ⚠️ ใบที่ตอบไม่ได้ว่าสายอะไรขึ้นแถบของมันเอง ระบบไม่เดาให้ — เดาเมื่อไร ใบสายสินค้า
//   จะไหลเข้าคิวบริการ หรือใบบริการจะหายเงียบ ทั้งสองทางแย่พอกัน
//
// 🔄 **mig 0392 (PR-A · D14): TS ไม่ผูกโซนอีกแล้ว** — ฝ่ายขายตั้งแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ · ช่วงบริการ
//   ที่หน้าใบสั่งขาย อนุมัติแล้วรอบขายของโซนเกิดเอง ⇒ งานแรกของ TS คือ "รอตั้งรอบ" (แท็บตั้งต้น)
//   · วิซาร์ดผูกโซน (`IntakeWizard`) ถูกถอดทั้งไฟล์ · `POST /api/service/intake/bind` ตอบ 409
//   · แท็บ `bind` (คีย์เดิม) = ใบเดิมที่อนุมัติก่อน 0392 รอฝ่ายขายตั้งงานบริการ — **ดูอย่างเดียว** ไม่มีปุ่ม
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, CalendarPlus, ChevronDown, ChevronRight, ClipboardList, Info, LayoutGrid, Link2, MapPin, Search,
} from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { DEFAULT_PAGE_SIZE, usePagination } from "@/lib/usePagination";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pager from "@/components/ui/Pager";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import Tabs from "@/components/ui/Tabs";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { ROUNDS_SOLD_LABEL, VISIT_KIND_LABELS } from "@/lib/service/rounds";
import { INTAKE_TABS, INTAKE_TAB_HINTS, INTAKE_TAB_LABELS, planRoundsSoldText } from "@/lib/service/intake";
import { holidayGapText } from "@/lib/service/cadence";
import {
  LEGACY_SETUP_FILTERS, LEGACY_SETUP_FILTER_LABELS, legacySetupFilterCounts, legacySetupHaystack, legacySetupStatusView,
} from "@/lib/service/legacySetupQueue";
import { isHistoricalOrder } from "@/lib/sales/historicalOrders";
import { SERVICE_SETUP_LINE_TEXT } from "@/lib/sales/serviceSetup";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch, apiJson } from "@/lib/apiFetch";
/* ⭐ แท็บรอตั้งรอบ (PR-C · C7) — ข้อเท็จจริงของแถวคำนวณที่ route (`intakePlanFacts`) · หน้าวาด + ตั้งรอบจากแถว */
import ServicePlanModal from "@/components/service/ServicePlanModal";
import OrphanPlanStrip from "@/components/service/intakePlan/OrphanPlanStrip";
import PlanZoneDetail from "@/components/service/intakePlan/PlanZoneDetail";
import { CadenceCell, ContractChip, PeriodCell } from "@/components/service/intakePlan/PlanFactCells";
import {
  OTHER_PLAN_TEXT, PLAN_EMPTY_TEXT, PLAN_TAB_STAMPED_NOTE, STAMPED_BADGE_LABEL, planCountLabel, planTotals, planTotalsLine,
} from "@/lib/service/intakePlanFacts";
import { canBeServiceAssignee, canEditService } from "@/lib/permissions";
import { useCan, useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { notifyToast } from "@/lib/feedback";

const LOAD_ERROR_TITLE = "โหลดคิวงานเข้าใหม่ไม่สำเร็จ";

/* 🐞 จอการ์ดใช้ขนาดหน้าเท่าตาราง (25) — การ์ดหนึ่งใบสูงกว่าแถวสามเท่า แถบแบ่งหน้าจึงไปอยู่
   ลึก 5,000px บนมือถือ ⇒ มุมมองการ์ดเริ่มที่ 10 ใบ (ตัวเลือกเดิมของ Pager) */
const CARD_PAGE_SIZE = 10;

/* แท็บใบเดิม (mig 0392 · D14) — หัวแผงและคำอธิบายของตัวเอง (ม็อก TsIntakeLegacy) · ดูอย่างเดียว
   คำเรียกช่อง (จำนวนรอบบริการ · รอบละกี่แพ็ค — มติ 29/09) มาจากแคตตาล็อกเดียวกับหน้าใบสั่งขาย */
const LEGACY_PANEL_TITLE = "รายการรอฝ่ายขายตั้งงานบริการ";
const LEGACY_PANEL_SUB = `ดูอย่างเดียว — แพ็คเกจ · ${SERVICE_SETUP_LINE_TEXT.roundsLabel} · โซน · ${SERVICE_SETUP_LINE_TEXT.packsLabel} · ช่วงบริการ ฝ่ายขายตั้งที่หน้าใบสั่งขาย`;

/* ตารางแท็บรอตั้งรอบ (PR-C · ม็อก TsIntakePlan) — 8 คอลัมน์ข้อมูล + คอลัมน์ปุ่ม · แถวรายละเอียดโซนกินเต็มแถว */
const PLAN_COLUMNS = 9;
/* ชื่อโซนของแถว — ใบเดิม/ย้อนหลังไม่มี "แพ็คต่อรอบ" (C-D3) ⇒ เหลือชื่อโซนอย่างเดียว */
const zoneNames = (row) => (row.zones || []).map((z) => z.name).filter(Boolean).join(" · ") || naText(null);
/* id ของกล่องรายละเอียดโซน (aria-controls) — คีย์แถวมีอักขระ \u0000 คั่นไซต์กับใบ ⇒ แปลงให้เป็น id ที่ใช้ได้ */
const zoneDetailId = (row) => `plan-zones-${String(row.key || row.siteId).replace(/[^A-Za-z0-9_-]/g, "-")}`;

/* 🐞 เดิมตัดสตริง ISO ตรง ๆ — ขึ้น "2026-08-14" ข้างป้าย "จ่ายถึง 14/08/2026" ในแถวเดียวกัน
   และอนุมัติหลังเที่ยงคืนเวลาไทยจะขึ้นวันก่อนหน้า · fmtDate คิดวันไทยให้ */
const approvedText = (row) => {
  const value = row.approvedAt || row.orderDate;
  return value ? fmtDate(value) : naText(null);
};

/* แถบแท็บล้นกล่อง (จอ 320: เนื้อ 351px ในกล่อง 292px) — ลูกศรขวาย้ายโฟกัสไปแท็บที่ถูกตัด
   แต่แถบไม่เลื่อนตาม ⇒ แท็บที่โฟกัสอยู่ครึ่งตัวใต้ขอบจาง วงโฟกัสขาดที่ขอบขวา
   ⇒ โฟกัสลงแท็บไหน เลื่อนแถบให้แท็บนั้นเข้ากล่องเต็มตัว (แท็บสุดท้าย = เลื่อนสุด ขอบจางหายเอง)
   ⚠️ เลื่อนเฉพาะแกนนอนของแถบ — `scrollIntoView` ลากทั้งหน้าขึ้นลงตามไปด้วย
   ⚠️ พฤติกรรมนี้ควรอยู่ใน components/ui/Tabs.js ให้ทุกแถบแท็บได้เท่ากัน — ย้ายเข้าไปเมื่อไร ลบตัวนี้ทิ้ง */
function revealFocusedTab(event) {
  const tab = event.target;
  if (tab.getAttribute?.("role") !== "tab") return;
  revealTab(tab);
  /* 🪤 ลูกศรทั้งย้ายโฟกัสและ "เลือก" แท็บ (Tabs โหมด automatic) — วาดใหม่แล้วแถบกว้างขึ้นอีกเศษพิกเซล
     วัดจริงที่ 320: ตอนโฟกัสเลื่อนได้สุดแค่ 58 หลังวาดสุดเป็น 59 ⇒ ค้างที่ 58 ขอบจาง 3.6px ทับท้ายแท็บ
     ⇒ วัดซ้ำหลัง React commit · setTimeout ไม่ใช่ rAF เหตุผลเดียวกับ lib/ui/scrollToTopOf.js */
  setTimeout(() => revealTab(tab), 0);
}

function revealTab(tab) {
  const list = tab.parentElement;
  if (!list || list.scrollWidth <= list.clientWidth) return;
  // แท็บหัว/ท้าย = เลื่อนสุดทางไปเลย ไม่คิดจากระยะที่มีเศษ sub-pixel · ค่าเกินสุดแถบ เบราว์เซอร์ตัดให้เอง
  if (!tab.nextElementSibling) { list.scrollLeft = list.scrollWidth; return; }
  if (!tab.previousElementSibling) { list.scrollLeft = 0; return; }
  const tabBox = tab.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  if (tabBox.right > listBox.right) list.scrollLeft += Math.ceil(tabBox.right - listBox.right);
  else if (tabBox.left < listBox.left) list.scrollLeft -= Math.ceil(listBox.left - tabBox.left);
}

/* เซลล์สถานะการตั้งงานบริการของใบเดิม — ป้าย + บรรทัดรองหนึ่งบรรทัด (ตาราง · การ์ดใช้ตัวเดียว)
   ข้อความมาจาก `legacySetupStatusView` ⇒ สองมุมมองพูดตรงกันและค้นเจอคำเดียวกัน (legacySetupHaystack) */
function LegacySetupStatus({ row }) {
  const view = legacySetupStatusView(row);
  return (
    <>
      <StatusBadge tone={view.tone} size="sm" dot label={view.label} title={view.label} />
      {view.sub ? <span className={`cell-sub ${styles.statusSub}`}>{view.sub}</span> : null}
    </>
  );
}

function ContractBadge({ readiness }) {
  return (
    <span className={`ui-badge ${readiness?.hasContract ? "success" : "warning"}`}>
      {readiness?.hasContract ? readiness.contractNo : "ยังไม่ผูกสัญญา"}
    </span>
  );
}

/* ชิปเงินของใบ — ถังตั้งรอบส่งแถวเอง (ชื่อช่องชุดเดียวกับ `orderReadiness` · lib/service/intake.js)
   `label` = คำนำหน้าวัน: ตั้งต้น "จ่ายถึง" · ถังตั้งรอบ "เงินครอบถึง" (ม็อก TsIntake 22/09)
   ⚠️ แท็บใบเดิม (mig 0392) ไม่มีชิปนี้โดยตั้งใจ — ใบเดิมยังไม่เปิดงานให้ TS เรื่องเงินยังไม่ใช่คำถามของขั้นนี้ */
function PaidBadge({ readiness, label = "จ่ายถึง" }) {
  /* ⭐ ใบยอด 0 ไม่มีงวดให้เก็บ (มติ 22/09 · mig 0374) — ตัวตัดสินเดียวกับ visitGate ข้อ② (ผ่านด่านเงินเอง)
     ป้าย "ยังไม่มีงวดที่รับรอง" จะส่ง TS ไปทวงเงินที่ไม่มีให้เก็บ · 🔄 แทนชิป "ยกเว้นด่านเงิน" ของ 0360 ที่ถอดแล้ว */
  if (readiness?.paymentNotRequired) return <StatusBadge tone="neutral" label="ไม่มีงวดให้เก็บ" />;
  /* ⚠️ "ยังไม่มีงวดที่รับรอง" ไม่ใช่ "ยังไม่มีเงินเข้า" — ใบย้อนหลังที่เพิ่งอนุมัติมีงวดยกมาที่เก็บเงินแล้ว
     แต่บัญชียังไม่รับรอง ⇒ บอกว่าเงินไม่เข้าคือส่ง TS ไปถามลูกค้าผิดเรื่อง */
  return (
    <span className={`ui-badge ${readiness?.coveredToday ? "success" : "warning"}`}>
      {readiness?.paidThrough ? `${label} ${fmtDate(readiness.paidThrough)}` : "ยังไม่มีงวดที่รับรอง"}
    </span>
  );
}

export default function ServiceIntakePage() {
  /* ⭐ แท็บตั้งต้น = "รอตั้งรอบ" เสมอ (mig 0392 · D14) — ทุกใบมาถึง TS ที่ถังนี้ก่อน (รอบขายเกิดตอนอนุมัติ)
     🔄 ถอดตัวสลับแท็บอัตโนมัติ "ถังผูกโซนว่างแล้วไปถังตั้งรอบ" (มติ 22/09) — ถังผูกโซนไม่มีแล้ว แท็บแรกคือถังตั้งรอบอยู่แล้ว */
  const [tab, setTab] = useState("plan");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  /* ตัวกรองสถานะ + คำค้นของแท็บใบเดิม — ใช้เฉพาะแท็บนั้น (แท็บอื่นไม่มีแถบเครื่องมือนี้) */
  const [legacyFilter, setLegacyFilter] = useState("all");
  const [search, setSearch] = useState("");

  /* ⭐ ตั้งรอบจากแถว (PR-C · C-D12) — ปุ่มเป็นของฝ่ายบริการ (`POST /api/service/plans` บังคับ `canEditService`)
     ⇒ ถามด่านตัวเดียวกันที่จอ · ไม่มีสิทธิ์ = ไม่มีปุ่ม (กติกา "ไม่มีสิทธิ์ = ไม่โชว์")
     ⚠️ ประกอบ user จากสี่ context ให้ครบ — `canEditService` อ่าน department (ท่าเดียวกับแท็บงานบริการของใบ)
     ⚠️ hook ทุกตัวอยู่บนสุดของหน้า ไม่อยู่ใน `.map` ของแถว (กฎ 19) */
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(
    () => canEditService({ role, team, teams, department }),
    [role, team, teams, department],
  );
  /* ลิงก์ "เปิดใบสั่งขาย" — เฉพาะคนที่เปิดสายขายได้ (ไม่มีสิทธิ์ = กดแล้วเด้ง ⇒ ไม่โชว์) */
  const canOpenSo = useCan("salesplan:view");
  /* แถวที่กำลังตั้งรอบ = **ภาพถ่ายตอนกด** ไม่ใช่ค่าที่อ่านจาก `data` ใหม่ทุกครั้ง — กลับมามองแท็บแล้วหน้าโหลดใหม่
     (`useRevalidateOnFocus`) ต้องไม่เปลี่ยน props ของโมดัลระหว่างพิมพ์ (critique M6) · ตั้งที่ openPlan/closePlan เท่านั้น */
  const [planRow, setPlanRow] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const techniciansAsked = useRef(false);
  /* แถวที่กางรายละเอียดโซนอยู่ (คีย์แถว) — โหลดใหม่แล้วยังกางค้างตามเดิม */
  const [openZones, setOpenZones] = useState(() => new Set());

  const startRun = useLatestRun();
  // ของที่โหลดสำเร็จล่าสุด — ให้รอบเบื้องหลังรู้ว่ามีของเดิมยืนอยู่บนจอไหม (อ่านใน callback เท่านั้น)
  const dataRef = useRef(null);
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    /* 🐞 เคยล้าง loadError ตรงนี้ทุกรอบ รวมรอบเบื้องหลังตอนกลับมามองแท็บ ⇒ กล่องแจ้งโหลดพัง
       หายระหว่างรอ แล้วรอบนั้นพังซ้ำก็ไม่ตั้งคืน ⇒ จอเหลือ "ไม่มีใบสั่งขายรอผูกโซน" = คิวว่างปลอม
       ⇒ error ล้างได้ทางเดียวคือโหลดสำเร็จ */
    try {
      const res = await apiFetch("/api/service/intake");
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || LOAD_ERROR_TITLE);
      dataRef.current = body;
      setData(body);
      setLoadError("");
    } catch (e) {
      /* ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "ไม่มีงานค้าง" หน้าตาเหมือนกัน
         จนแยกไม่ออก แล้วฝ่าย TS จะเชื่อว่าไม่มีอะไรต้องทำ ซึ่งคือรูเดิมที่หน้านี้มาปิด
         รอบเบื้องหลังเงียบได้เฉพาะตอนมีของเดิมยืนอยู่บนจอ — ไม่มีของเดิม = ต้องบอกว่าพัง */
      if (isLatest() && (!opts?.background || !dataRef.current)) {
        setLoadError(e.message || LOAD_ERROR_TITLE);
      }
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  /* ── ตั้งรอบจากแถว (PR-C · C7) ─────────────────────────────────────────────────────────────
     รายชื่อเจ้าหน้าที่โหลดตอนเปิดครั้งแรก (ท่าเดียวกับหน้าไซต์/แท็บงานบริการ) · โหลดพัง = ลองใหม่ได้ตอนเปิดครั้งหน้า */
  const openPlan = useCallback((row) => {
    setPlanRow(row);
    if (techniciansAsked.current) return;
    techniciansAsked.current = true;
    apiJson("/api/pm/assignable-users", { fallbackError: "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ" })
      .then((rows) => setTechnicians((Array.isArray(rows) ? rows : []).filter(canBeServiceAssignee)))
      .catch((e) => {
        techniciansAsked.current = false;
        notifyToast.error(e.message || "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ");
      });
  }, []);
  const closePlan = useCallback(() => setPlanRow(null), []);
  /* บันทึก = สร้างรอบ + สร้างนัดทันที (route gen ให้เอง) แล้วโหลดคิวใหม่ ⇒ แถวหลุดจากคิว (มีรอบของใบนี้แล้ว)
     ⚠️ พังแล้วโยนต่อ — โมดัลโชว์ข้อความผิดพลาดในตัวเองและไม่ปิด (ServicePlanModal.submit) */
  const savePlan = useCallback(async (form) => {
    const body = await apiJson("/api/service/plans", { method: "POST", json: form, fallbackError: "ตั้งรอบไม่สำเร็จ" });
    const generated = Array.isArray(body?.generated) ? body.generated.length : 0;
    const saved = generated ? `ตั้งรอบแล้ว · สร้างนัดให้ ${fmtNumber(generated)} ครั้ง` : "ตั้งรอบแล้ว · ยังไม่มีนัดที่ต้องสร้าง";
    /* ปีที่รอบนี้ไปถึงแต่ยังไม่มีวันหยุดในระบบ (mig 0397) — นัดของปีนั้นเลื่อนหนีได้แค่เสาร์–อาทิตย์ · เตือนต่อท้าย ไม่บล็อก */
    const holidayGap = holidayGapText(body?.holidayGapYears);
    notifyToast.success(holidayGap ? `${saved} · ${holidayGap}` : saved);
    await load({ background: true });
  }, [load]);
  /* บันทึกมาตรฐาน มล. ในรายละเอียดโซนแล้ว — แก้ค่าในแถวบนจอ (ไม่โหลดทั้งคิวใหม่เพื่อช่องเดียว) */
  const patchTerm = useCallback((term) => {
    if (!term?.id) return;
    setData((prev) => (prev?.plan ? {
      ...prev,
      plan: prev.plan.map((row) => (row.termDetails?.some((t) => t.id === term.id)
        ? {
          ...row,
          termDetails: row.termDetails.map((t) => (t.id === term.id ? { ...t, standardMlPerMonth: term.standardMlPerMonth ?? null } : t)),
        }
        : row)),
    } : prev));
  }, []);
  const toggleZones = useCallback((key) => {
    setOpenZones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const counts = data?.counts || { bind: 0, plan: 0, visit: 0, unknownLine: 0 };

  /* 🐞 จอตั้งเคยได้ตาราง 720px ในกล่อง 360px — ปุ่ม "รับเข้าไซต์" อยู่นอกจอทุกแถว
     ⇒ จอตั้ง/จอแคบเป็นการ์ด จอนอนเป็นตาราง (ทรงเดียวกับ /database/sites) สลับเองได้ที่หัวหน้า */
  const [view, setView] = useResponsiveView({ portrait: "cards", landscape: "table" });
  const legacyRows = useMemo(() => data?.bind || [], [data]);
  const legacyCounts = useMemo(() => legacySetupFilterCounts(legacyRows), [legacyRows]);
  /* ใบเดิมที่ลูกค้ายังไม่มีไซต์ในทะเบียน — งานติดที่ TS (เพิ่มไซต์) ไม่ใช่ฝ่ายขาย ⇒ บอกจำนวนที่โน้ตของแท็บ */
  const legacyNoSite = useMemo(
    () => legacyRows.filter((row) => row.noSite && (row.state === "not_started" || row.state === "editing")).length,
    [legacyRows],
  );
  const needle = search.trim().toLocaleLowerCase("th");
  /* แท็บใบเดิม: ตัวกรองสถานะ + คำค้น (คำค้น = ทุกอย่างที่ตาเห็นบนแถว · legacySetupHaystack)
     ⚠️ ป้ายเลขบนตัวกรองนับจากแถวทั้งหมด ไม่ใช่หลังค้นหา — เลขบนปุ่มคือ "มีกี่ใบในสถานะนี้" */
  const tabRows = useMemo(() => {
    if (tab !== "bind") return data?.[tab] || [];
    return legacyRows.filter((row) => (legacyFilter === "all" || row.state === legacyFilter)
      && (!needle || legacySetupHaystack(row).includes(needle)));
  }, [data, tab, legacyRows, legacyFilter, needle]);
  const viewPageSize = view === "cards" ? CARD_PAGE_SIZE : DEFAULT_PAGE_SIZE;
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(tabRows, { resetKey: `${tab}|${legacyFilter}|${needle}`, defaultSize: viewPageSize });
  /* มุมมองตัดสินหลัง mount (ก่อน mount ถือเป็นจอนอน = ตาราง) ⇒ `defaultSize` ตอนเริ่มไม่พอ
     ต้องตามมุมมองที่เปลี่ยน · แต่ถ้าคนเลือกจำนวนต่อหน้าเองแล้ว สลับมุมมองต้องไม่ทับค่าที่เลือก */
  const pageSizePicked = useRef(false);
  /* 🐞 เปลี่ยนขนาดหน้า = usePagination พากลับหน้า 1 ⇒ สลับมุมมองจากการ์ดหน้า 4 (ใบที่ 31–33)
     ไปตารางแล้วตกหน้า 1 หลงที่ · จำ "แถวแรกที่เห็นอยู่" ไว้ แล้วไปหน้าที่มีแถวนั้นหลังรีเซ็ต
     ⚠️ effect ตัวที่สองต้องประกาศ **หลัง** usePagination — effect รันตามลำดับประกาศ
        setPage(1) ของ hook มาก่อน ค่าที่ตั้งตรงนี้จึงชนะ */
  const keepFirstRow = useRef(null);
  useEffect(() => {
    if (pageSizePicked.current || pageSize === viewPageSize) return;
    keepFirstRow.current = (page - 1) * pageSize;
    setPageSize(viewPageSize);
  }, [viewPageSize, page, pageSize, setPageSize]);
  useEffect(() => {
    if (keepFirstRow.current === null) return;
    setPage(Math.floor(keepFirstRow.current / pageSize) + 1);
    keepFirstRow.current = null;
  }, [pageSize, setPage]);
  const pickPageSize = useCallback((size) => {
    pageSizePicked.current = true;
    setPageSize(size);
  }, [setPageSize]);
  // โหลดพัง = ไม่รู้ตัวเลข ⇒ ไม่โชว์ตัวเลขเก่าหรือศูนย์บนแท็บ/ถังใบไม่ระบุสาย
  const showCounts = Boolean(data) && !loadError;
  /* ใบสั่งขายย้อนหลังในถังตั้งรอบ — เลขที่ใบ (ไม่ซ้ำ) สำหรับโน้ต "โซนผูกจากฝ่ายขายแล้ว" */
  const historicalPlanOrders = useMemo(
    () => [...new Set((data?.plan || []).filter(isHistoricalOrder).map((row) => row.orderNumber || row.salesOrderId))],
    [data],
  );
  /* ยอดของแท็บรอตั้งรอบ (C-D21 · [owner]) — ป้ายจำนวน "{n} แถว" (แถว = ไซต์ × ใบ = ตัวนับบนเมนู = ยอดของ Pager)
     + บรรทัดรวม "ทั้งหมด s ไซต์ · o ใบ · z โซน · p แพ็ค/รอบ" เหนือ Pager */
  const planSum = useMemo(() => planTotals(data?.plan || []), [data]);

  return (
    <Workspace
      icon={<ArrowDownToLine size={20} aria-hidden="true" />}
      title="งานเข้าใหม่"
      subtitle="ใบสั่งขายสายบริการที่อนุมัติแล้ว — ใบใหม่มาพร้อมโซนและรอบ · ใบเดิมรอฝ่ายขายตั้งงานบริการ"
    >
      {/* แถบแท็บห่อกล่องของตัวเอง — ถือขอบจางตอนแท็บล้น และเลื่อนแท็บที่โฟกัสเข้ากล่อง
          🔄 คำอธิบายของแท็บเคยอยู่ใต้แท็บในกล่องนี้ ⇒ ย้ายไปเป็นคำอธิบายของแผงรายการ (มติผู้ใช้ 2026-09-15) */}
      <div className={styles.tabBlock} onFocus={revealFocusedTab}>
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="คิวงานเข้าใหม่"
          tabs={INTAKE_TABS.map((key) => ({
            key,
            /* 🐞 ยังโหลดไม่เสร็จ/โหลดพัง เคยขึ้น "0 · 0 · 0" = อ่านเป็นคิวว่าง
               ⇒ ไม่มีข้อมูล = ไม่มีตัวเลข */
            label: showCounts ? `${INTAKE_TAB_LABELS[key]} ${counts[key] ?? 0}` : INTAKE_TAB_LABELS[key],
          }))}
        />
      </div>

      {/* ⭐ ถังที่ระบบตอบไม่ได้ — ขึ้นเหนือคิวเสมอ ไม่ว่าจะอยู่แท็บไหน
          ฝ่าย TS แก้เองไม่ได้ (สายธุรกิจเป็นของโครงการ) จึงบอกว่าต้องไปหาใคร */}
      {showCounts && counts.unknownLine > 0 && (
        <section className={styles.unknown} aria-label="ใบที่ยังไม่ระบุสายธุรกิจ">
          <p className={styles.unknownHead}>
            <AlertTriangle size={14} aria-hidden="true" />
            <b>{counts.unknownLine} ใบยังไม่ระบุสายธุรกิจ</b> — ระบบไม่เดาให้ ต้องให้ฝ่ายขายระบุสายที่โครงการก่อน
          </p>
          <ul className={styles.unknownList}>
            {(data?.unknownLine || []).map((row) => (
              <li key={row.orderId}>
                <b>{row.code}</b>
                <span>{naText(row.customerName)}</span>
                {/* 🔄 mig 0392: แถวมาจากถังใบเดิม — นับ "รายการที่ต้องตั้ง" ไม่ใช่บรรทัดที่ยังไม่ผูกโซน */}
                <span>{fmtNumber(row.progress?.total ?? 0)} รายการ</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⭐ ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — ฝ่ายขายเลือกโซนจากทะเบียนตอนคีย์ และรอบขายเกิดตอน
          AE Sup อนุมัติ ⇒ TS เห็นใบนี้ครั้งแรกที่แท็บนี้ · บอกไว้ว่าไม่ต้องผูกซ้ำ (ม็อก TsIntake)
          🔄 mig 0392: ถัง "รอตั้งไซต์/โซน" ถอดแล้ว — ประโยคไม่ชี้ไปหาแท็บที่ไม่มีแล้ว · ขึ้นเฉพาะตอนมีใบย้อนหลังในแท็บนี้จริง */}
      {showCounts && tab === "plan" && historicalPlanOrders.length > 0 && (
        <StatusNotice tone="info" icon={Link2}
          title="โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว — ใบย้อนหลังขึ้นที่ ‘รอตั้งรอบ’ ตรง ๆ">
          {`${historicalPlanOrders.join(" · ")} เลือกโซนจากทะเบียนไซต์ตอนคีย์ใบ · ฝ่าย TS ตั้งรอบอย่างเดียว ไม่ต้องผูกซ้ำ`
            + " · นัดที่เลยวัน “เงินครอบถึง” จะเป็นร่างรอบัญชีรับรองงวดถัดไปในหน้าจัดคิว"}
        </StatusNotice>
      )}

      {/* ⭐ PR-C (C7): ใบที่ฝ่ายขายตั้งโซนแล้ว (ตรา 0392) มาพร้อมโซน · แพ็คต่อรอบ · รอบที่ขาย — โซนผิดแก้ที่ใบ (Rev.) ไม่ใช่ที่นี่
          🪤 ขึ้นต้นด้วย `showCounts &&` เสมอ (L1) — ยาม slice ของ historicalServiceSide ตัดก้อนใบเดิมถึงก้อนแท็บตั้งรอบ
             ก้อนแรกของไฟล์ (เงื่อนไขแท็บเปล่า ๆ ตามด้วยวงเล็บ) ⇒ ขึ้นต้นแบบนั้นเหนือก้อนใบเดิมเมื่อไร ก้อนที่ยามอ่านว่างทันที */}
      {showCounts && tab === "plan" && planSum.anyStamped && (
        <StatusNotice tone="info">
          {PLAN_TAB_STAMPED_NOTE}
        </StatusNotice>
      )}
      {/* รอบกำพร้า (C-D11) — รอบที่ยังเดินแต่ใบของมันไม่มีผลแล้ว · ไม่มี = ไม่วาดอะไร */}
      {showCounts && tab === "plan" && <OrphanPlanStrip orphans={data?.orphans} />}

      {/* ⭐ รายการ = ListPanel ใบเดียว ชื่อ · คำอธิบาย · จำนวน เดินตามแท็บ (มติผู้ใช้ 2026-09-15)
          · ป้ายจำนวน = แถวของแท็บนั้นทั้งหมด = ยอดของ Pager · ยังไม่รู้ (โหลด/พัง) = ขีด ไม่ใช่ 0
          · `loading` แทนที่เฉพาะเนื้อ — แท็บกับตัวสลับมุมมองยืนอยู่ระหว่างโหลด */}
      {/* ⭐ แท็บใบเดิม (mig 0392 · D14) — บอกก่อนว่าใบพวกนี้คืออะไรและใครทำ (TS ไม่ต้องผูกโซน) ·
          ขึ้นเหนือแผงแบบโน้ตของแท็บ (ม็อก TsIntakeLegacy) เพราะคำอธิบายของแผงเป็นเรื่อง "ดูอย่างเดียว" */}
      {tab === "bind" && (
        <StatusNotice tone="info" icon={Info}>
          {INTAKE_TAB_HINTS.bind}
          {legacyNoSite ? (
            <span className="cell-sub">
              {`${fmtNumber(legacyNoSite)} ใบรอไซต์ในทะเบียน — ลูกค้ายังไม่มีไซต์ TS เพิ่มไซต์ก่อน ฝ่ายขายจึงเลือกโซนได้`}
            </span>
          ) : null}
        </StatusNotice>
      )}

      <ListPanel
        icon={tab === "bind"
          ? <ClipboardList size={17} aria-hidden="true" />
          : <ArrowDownToLine size={17} aria-hidden="true" />}
        title={tab === "bind" ? LEGACY_PANEL_TITLE : `รายการ${INTAKE_TAB_LABELS[tab]}`}
        /* คำอธิบายพูดถึง "ของที่อยู่ในคิว" — โหลดพังแล้วยังขึ้นคำอธิบาย อ่านเหมือนคิวว่างปกติ */
        subtitle={loadError ? null : (tab === "bind" ? LEGACY_PANEL_SUB : INTAKE_TAB_HINTS[tab])}
        /* แท็บรอตั้งรอบนับ "แถว" (ไซต์ × ใบ · C-D21) — ใบเดียวลงหลายไซต์ = หลายแถว ⇒ "ใบ" ผิดหน่วย */
        count={showCounts ? (tab === "plan" ? planCountLabel(planSum) : `${tabRows.length} ${tab === "visit" ? "รอบ" : "ใบ"}`) : null}
        loading={loading}
        toolbar={(
          <>
            {/* แท็บใบเดิม: ค้นหา + ตัวกรองสถานะ (เลขบนปุ่ม = ใบในสถานะนั้นทั้งหมด) — แท็บอื่นไม่มี */}
            {tab === "bind" && (
              <>
                <div className={`search-glass ${styles.searchInput}`}>
                  <Search size={15} aria-hidden="true" />
                  <Input
                    autoComplete="off"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาใบสั่งขาย ลูกค้า ผู้ดูแล"
                    aria-label="ค้นหาใบสั่งขาย ลูกค้า ผู้ดูแลฝ่ายขาย สถานะ หรือสัญญา"
                  />
                </div>
                <Segmented
                  ariaLabel="สถานะการตั้งงานบริการ"
                  className={styles.legacyFilter}
                  value={legacyFilter}
                  onChange={setLegacyFilter}
                  options={LEGACY_SETUP_FILTERS.map((key) => ({
                    value: key,
                    label: LEGACY_SETUP_FILTER_LABELS[key],
                    count: showCounts ? legacyCounts[key] : null,
                  }))}
                />
              </>
            )}
            {/* 🔄 ตัวสลับมุมมองย้ายจากหัวหน้าเข้าแถบเครื่องมือของแผง ท้ายแถบเหมือน /database/sites ·
                /database/assets (มติผู้ใช้ 2026-09-15 · ListPanel) — แทนผลตรวจรอบสองวันเดียวกัน
                ที่ยอมให้อยู่หัวหน้าเพราะหน้านี้ยังไม่มีแถบเครื่องมือ */}
            <div className="spacer" />
            <ViewSwitcher
              value={view} onChange={setView} ariaLabel="มุมมองคิวงานเข้าใหม่"
              modes={["table", { value: "cards", icon: LayoutGrid, label: "การ์ด" }]}
            />
          </>
        )}
      >
        {/* 🐞 โหลดพังเคยเป็นข้อความเล็กสีปกติเหนือแท็บ ไม่มีทรงข้อผิดพลาด ไม่มีทางไปต่อ
            ⇒ ขึ้นกล่องแจ้งข้อผิดพลาดตรงที่คิวควรอยู่ + ปุ่มลองใหม่ (ทรงเดียวกับ /database/assets) */}
        {loadError ? (
          <StatusNotice tone="error" title={LOAD_ERROR_TITLE}
            action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
            {loadError === LOAD_ERROR_TITLE
              ? "ยังไม่รู้ว่ามีงานค้างอยู่เท่าไร — ไม่ได้แปลว่าคิวว่าง"
              : loadError}
          </StatusNotice>
        ) : (
          <>
            {/* ⭐ แท็บใบเดิม (mig 0392 · D14) — **ดูอย่างเดียว**: ไม่มีปุ่ม · ไม่มีชิปเงิน · ไม่มีป้าย "ย้อนหลัง"
                (ใบในแท็บนี้เป็นใบ pipeline ทั้งหมดโดยนิยาม — ใบย้อนหลังเปิดงานให้ TS ตอนอนุมัติแล้ว)
                ⚠️ ขั้น "ติดทะเบียนไซต์ — ขาด n สาขา" ของม็อกเลื่อนไป PR-B (ต้องเดาจำนวนสาขาจากหมายเหตุบรรทัด · D24) */}
            {tab === "bind" && (
              legacyRows.length === 0 ? (
                <EmptyState plain icon={ClipboardList}>
                  ไม่มีใบเดิมรอฝ่ายขายตั้งงานบริการ — ใบใหม่ฝ่ายขายตั้งโซนและรอบมาพร้อมใบ แล้วขึ้น ‘รอตั้งรอบ’ เอง
                </EmptyState>
              ) : tabRows.length === 0 ? (
                <EmptyState
                  plain
                  icon={Search}
                  action={{ label: "ล้างตัวกรอง", onClick: () => { setSearch(""); setLegacyFilter("all"); } }}
                >
                  {needle
                    ? `ไม่มีใบที่ตรงกับ “${search.trim()}”`
                    : `ไม่มีใบในสถานะ “${LEGACY_SETUP_FILTER_LABELS[legacyFilter]}”`}
                </EmptyState>
              ) : view === "cards" ? (
                <ul className={styles.cardList} aria-label={LEGACY_PANEL_TITLE}>
                  {pageRows.map((row) => (
                    <li key={row.orderId} className={styles.card}>
                      <div className={styles.cardHead}>
                        <span className={`mono ${styles.cardCode}`}>{row.code}</span>
                        <strong className={styles.cardTitle}>{naText(row.customerName)}</strong>
                      </div>
                      <p className={styles.cardMeta}>
                        อนุมัติ <span className="mono">{approvedText(row)}</span>
                        {" · "}ผู้ดูแลฝ่ายขาย {naText(row.ownerName)}
                      </p>
                      <div className={styles.cardStatus}><LegacySetupStatus row={row} /></div>
                      <div className={styles.cardFoot}>
                        <ContractBadge readiness={row.readiness} />
                        <Link href={`/sa/sales-orders/${row.orderId}`} className={`linklike ${styles.cardFootLink}`}>
                          เปิดใบสั่งขาย
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                /* คอลัมน์ตามม็อก TsIntakeLegacy · เซลล์สถานะ = ป้าย + บรรทัดรองหนึ่งบรรทัด (ตัวเดียวกับการ์ด) */
                <TableScroll family="list" minWidth={900} cells="stacked">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">ใบสั่งขาย · ลูกค้า</th>
                        <th scope="col" className="num">อนุมัติเมื่อ</th>
                        <th scope="col">ผู้ดูแลฝ่ายขาย</th>
                        <th scope="col">สถานะการตั้งงานบริการ</th>
                        <th scope="col">สัญญา</th>
                        <th scope="col" className={styles.actionCell} aria-label="ลิงก์" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.orderId}>
                          {/* รหัสบน · ชื่อล่าง — ทรงเดียวกับทุกตารางในระบบ */}
                          <th scope="row">
                            <span className="mono">{row.code}</span>
                            <span className={`cell-sub ${styles.rowHeadSub}`}>{naText(row.customerName)}</span>
                          </th>
                          <td className={`num ${styles.nowrap}`}>{approvedText(row)}</td>
                          <td>{naText(row.ownerName)}</td>
                          <td className={styles.statusCell}><LegacySetupStatus row={row} /></td>
                          <td className="ui-badge-cell ui-badge-w-contract-no"><ContractBadge readiness={row.readiness} /></td>
                          <td className={styles.actionCell}>
                            <div className={styles.rowAction}>
                              <Link href={`/sa/sales-orders/${row.orderId}`} className="linklike">
                                เปิดใบสั่งขาย
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )
            )}

            {tab === "plan" && (
              (data?.plan || []).length === 0 ? (
                <EmptyState plain icon={CalendarPlus}>
                  {PLAN_EMPTY_TEXT}
                </EmptyState>
              ) : view === "cards" ? (
                /* การ์ด (จอตั้ง/จอแคบ) — ข้อเท็จจริงชุดเดียวกับตาราง · ปุ่มท้ายการ์ด · รายละเอียดโซนเป็นรายการ (ไม่ใช่ตารางในการ์ด) */
                <ul className={styles.cardList} aria-label="ไซต์ที่รอตั้งรอบ">
                  {pageRows.map((row) => {
                    const zonesOpen = openZones.has(row.key);
                    const detailId = zoneDetailId(row);
                    return (
                      <li key={row.key || row.siteId} className={styles.card}>
                        {/* รหัสบน · ชื่อล่าง — รหัสไซต์พาไปหน้าไซต์ (แทนลิงก์ "ตั้งรอบที่หน้าไซต์" เดิม · C-D12) */}
                        <div className={styles.cardHead}>
                          <Link href={`/database/sites/${row.siteId}`} className={`mono linklike ${styles.cardSiteCode}`}>
                            {naText(row.site?.code)}
                          </Link>
                          <strong className={styles.cardTitle}>{naText(row.site?.name)}</strong>
                          <span className={styles.cardSub}>{naText(row.site?.customerName)}</span>
                        </div>
                        {row.unboundPlans > 0 && (
                          <p className={styles.cardMeta}>
                            {OTHER_PLAN_TEXT.unbound(row.unboundPlans)}
                          </p>
                        )}
                        {/* รอบของใบอื่น/รอบเดิมที่ต้องย้ายมาใบนี้ (review 29/09) — ตั้งรอบซ้ำ = นัดซ้อนที่ไซต์เดียวกัน */}
                        {row.otherPlanNote && (
                          <p className={styles.cardMeta}>{row.otherPlanNote}</p>
                        )}
                        <p className={styles.cardMeta}>
                          <span className="mono">{naText(row.orderNumber)}</span>
                          {row.stamped && <> <StatusBadge tone="success" size="sm" label={STAMPED_BADGE_LABEL} /></>}
                          {/* ใบย้อนหลัง — ป้ายชุดเดียวกับถังผูกโซน (มติ 22/09 · ม็อก TsIntake) */}
                          {isHistoricalOrder(row) && <> <StatusBadge tone="info" size="sm" label="ย้อนหลัง" /></>}
                        </p>
                        <dl className={styles.cardFacts}>
                          <div className={styles.cardFact}>
                            <dt>โซน · แพ็ค/รอบ</dt>
                            <dd>
                              {row.zonePacksText ?? zoneNames(row)}
                              {row.termDetails?.length ? (
                                <button
                                  type="button"
                                  className={`text-action ${styles.zoneToggle}`}
                                  aria-expanded={zonesOpen}
                                  aria-controls={zonesOpen ? detailId : undefined}
                                  onClick={() => toggleZones(row.key)}
                                >
                                  {zonesOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                                  {zonesOpen ? "ซ่อนรายละเอียดโซน" : "รายละเอียดโซน"}
                                </button>
                              ) : null}
                            </dd>
                          </div>
                          <div className={styles.cardFact}>
                            <dt>{ROUNDS_SOLD_LABEL}</dt>
                            <dd>
                              {planRoundsSoldText(row)?.value || naText(null)}
                              {/* รอบไม่เท่ากันระหว่างรายการในไซต์เดียว — บอกทุกค่า + คำแนะนำ (ไม่โชว์แค่ตัวมากสุดเงียบ ๆ) */}
                              {planRoundsSoldText(row)?.hint ? <span className="cell-sub">{planRoundsSoldText(row).hint}</span> : null}
                            </dd>
                          </div>
                          <div className={styles.cardFact}>
                            <dt>ช่วงบริการ</dt>
                            <dd><PeriodCell row={row} /></dd>
                          </div>
                          <div className={styles.cardFact}>
                            <dt>รอบที่แนะนำ</dt>
                            <dd><CadenceCell row={row} /></dd>
                          </div>
                        </dl>
                        {/* ชิปสัญญา + เงินครอบถึง แถวเดียว — ป้ายพูดตัวเองครบ ("CT-…" / "ยังไม่ผูก — …" · "เงินครอบถึง dd/mm/yyyy")
                            ⭐ เงินครอบถึง (มติ 22/09 · ม็อก TsIntake) — นัดหลังวันนั้นจะจอดเป็นร่างรอบัญชีรับรองงวดถัดไป */}
                        <div className={styles.cardBadges}>
                          <ContractChip row={row} />
                          <PaidBadge readiness={row} label="เงินครอบถึง" />
                        </div>
                        {zonesOpen && (
                          <PlanZoneDetail id={detailId} row={row} canEdit={canEdit} onSaved={patchTerm} layout="list" />
                        )}
                        {(canEdit || (canOpenSo && row.salesOrderId)) && (
                          <div className={styles.cardActions}>
                            {/* รอบเดิมของไซต์ยังผูกใบก่อน Rev. (stale) — ทางหลักคือย้ายรอบนั้นมาใบนี้ที่หน้าไซต์ (ไม่ใช่สร้างซ้อน) */}
                            {canEdit && row.stalePlanToMove && (
                              <Button as={Link} href={`/database/sites/${row.siteId}`} tone="primary" size="sm">
                                {OTHER_PLAN_TEXT.moveAction}
                              </Button>
                            )}
                            {/* ปุ่มซ้ำทุกแถว = navy (ม็อก .btn.primary) — accent มีได้หน้าละปุ่มเดียว (UI_DESIGN_SYSTEM ข้อ 8 · review 29/09) */}
                            {canEdit && (
                              <Button tone={row.stalePlanToMove ? "neutral" : "primary"} size="sm" onClick={() => openPlan(row)}>
                                ตั้งรอบ
                              </Button>
                            )}
                            {canOpenSo && row.salesOrderId && (
                              <Link href={`/sa/sales-orders/${row.salesOrderId}`} className={`linklike ${styles.cardFootLink}`}>
                                เปิดใบสั่งขาย
                              </Link>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                /* 🔴 **หนึ่งแถว = (ไซต์, ใบสั่งขาย)** ไม่ใช่หนึ่งไซต์ — ไซต์เดียวโผล่ได้
                    หลายแถวเมื่อมีหลายใบ (ขายเพิ่ม/ออก Rev.) ⇒ ต้องมีคอลัมน์ใบ ไม่งั้น
                    สองแถวพิมพ์ข้อความเหมือนกันเป๊ะ · และคีย์ต้องเป็น `row.key`
                    (เดิมเป็น `row.siteId` ซึ่งซ้ำทันทีที่มีสองใบ) */
                /* 🔄 PR-C (C7 · ม็อก TsIntakePlan): คอลัมน์ "ลูกค้า" ย้ายเป็นบรรทัดรองใต้เลขใบ · +ช่วงบริการ · รอบที่แนะนำ ·
                    สัญญา · ปุ่มตั้งรอบ ⇒ minWidth 1000 → 1240 · แถวรายละเอียดโซน (กางได้) ตามหลังแถวของมัน */
                <TableScroll family="list" minWidth={1240} cells="stacked">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">ไซต์</th>
                        <th scope="col">ใบสั่งขาย</th>
                        <th scope="col">โซน · แพ็ค/รอบ</th>
                        <th scope="col">{ROUNDS_SOLD_LABEL}</th>
                        <th scope="col">ช่วงบริการ</th>
                        <th scope="col">รอบที่แนะนำ</th>
                        <th scope="col">สัญญา</th>
                        <th scope="col">เงินครอบถึง</th>
                        <th scope="col" className={styles.actionCell} aria-label="การกระทำ" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => {
                        const zonesOpen = openZones.has(row.key);
                        const detailId = zoneDetailId(row);
                        return (
                          <Fragment key={row.key || row.siteId}>
                            <tr>
                              {/* รหัสบน · ชื่อล่าง — รหัสไซต์พาไปหน้าไซต์ (แทนลิงก์ "ตั้งรอบที่หน้าไซต์" เดิม · C-D12) */}
                              <th scope="row">
                                {/* คอลัมน์ระบุตัวตน ⇒ .table-row-link ไม่ใช่ .linklike (UI_DESIGN_SYSTEM "อย่าเพิ่มจุดใหม่" · ท่าเดียวกับ /service) */}
                                <Link href={`/database/sites/${row.siteId}`} className="table-row-link mono">
                                  {naText(row.site?.code)}
                                </Link>
                                <span className={`cell-sub ${styles.rowHeadSub}`}>{naText(row.site?.name)}</span>
                                {/* ⚠️ คำเตือนพิมพ์ทุกแถวที่เข้าเงื่อนไข ไม่ใช่แถวแรกแถวเดียว —
                                    รอบที่ยังไม่ผูกใบเดินอยู่จริงที่ไซต์นี้ กดสร้างทับ = นัดซ้อน */}
                                {row.unboundPlans > 0 && (
                                  <span className={`cell-sub ${styles.rowHeadSub}`}>
                                    {OTHER_PLAN_TEXT.unbound(row.unboundPlans)}
                                  </span>
                                )}
                                {/* รอบของใบอื่น/รอบเดิมที่ต้องย้ายมาใบนี้ (review 29/09) — ทรงเดียวกับคำเตือนรอบไม่ผูกใบ */}
                                {row.otherPlanNote && (
                                  <span className={`cell-sub ${styles.rowHeadSub}`}>{row.otherPlanNote}</span>
                                )}
                              </th>
                              <td>
                                <span className="mono">{naText(row.orderNumber)}</span>
                                <span className="cell-sub">{naText(row.site?.customerName)}</span>
                                {row.stamped && (
                                  <span className="cell-sub"><StatusBadge tone="success" size="sm" label={STAMPED_BADGE_LABEL} /></span>
                                )}
                                {/* ใบย้อนหลัง — ป้ายชุดเดียวกับถังผูกโซน (มติ 22/09 · ม็อก TsIntake) */}
                                {isHistoricalOrder(row) && (
                                  <span className="cell-sub"><StatusBadge tone="info" size="sm" label="ย้อนหลัง" /></span>
                                )}
                              </td>
                              <td>
                                {row.zonePacksText ?? zoneNames(row)}
                                {row.termDetails?.length ? (
                                  <span className="cell-sub">
                                    <button
                                      type="button"
                                      className={`text-action ${styles.zoneToggle}`}
                                      aria-expanded={zonesOpen}
                                      aria-controls={zonesOpen ? detailId : undefined}
                                      onClick={() => toggleZones(row.key)}
                                    >
                                      {zonesOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                                      {zonesOpen ? "ซ่อนรายละเอียดโซน" : "รายละเอียดโซน"}
                                    </button>
                                  </span>
                                ) : null}
                              </td>
                              <td>
                                {planRoundsSoldText(row)?.value || naText(null)}
                                {planRoundsSoldText(row)?.hint ? <span className="cell-sub">{planRoundsSoldText(row).hint}</span> : null}
                              </td>
                              <td className={styles.nowrap}><PeriodCell row={row} /></td>
                              <td className={styles.nowrap}><CadenceCell row={row} /></td>
                              <td className={`ui-badge-cell ${styles.contractCell}`}><ContractChip row={row} /></td>
                              {/* ⭐ เงินครอบถึง — นัดหลังวันนั้นจอดเป็นร่าง "SA → FN" จนบัญชีรับรองงวดถัดไป (visitGate ข้อ②) */}
                              <td className="ui-badge-cell ui-badge-w-paid"><PaidBadge readiness={row} label="เงินครอบถึง" /></td>
                              <td className={styles.actionCell}>
                                <div className={styles.rowActions}>
                                  {canEdit && row.stalePlanToMove && (
                                    <Button as={Link} href={`/database/sites/${row.siteId}`} tone="primary" size="sm">
                                      {OTHER_PLAN_TEXT.moveAction}
                                    </Button>
                                  )}
                                  {canEdit && (
                                    <Button tone={row.stalePlanToMove ? "neutral" : "primary"} size="sm" onClick={() => openPlan(row)}>
                                      ตั้งรอบ
                                    </Button>
                                  )}
                                  {canOpenSo && row.salesOrderId && (
                                    <Link href={`/sa/sales-orders/${row.salesOrderId}`} className="linklike">
                                      เปิดใบสั่งขาย
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {/* รายละเอียดโซน — เต็มแถว · `ui-cell-wide` ถอดเพดาน 220px ของเซลล์ลิสต์ (ช่อง มล. กว้างกว่านั้น) */}
                            {zonesOpen && (
                              <tr>
                                <td colSpan={PLAN_COLUMNS} className="ui-cell-wide">
                                  <PlanZoneDetail id={detailId} row={row} canEdit={canEdit} onSaved={patchTerm} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              )
            )}

            {tab === "visit" && (
              (data?.visit || []).length === 0 ? (
                <EmptyState plain icon={MapPin}>
                  ทุกรอบมีนัดข้างหน้าแล้ว — รอบที่เดินอยู่แต่ไม่มีนัดล่วงหน้าเลยจะมาอยู่ที่นี่
                </EmptyState>
              ) : view === "cards" ? (
                <ul className={styles.cardList} aria-label="รอบที่ยังไม่มีนัด">
                  {pageRows.map((row) => (
                    <li key={row.planId} className={styles.card}>
                      <div className={styles.cardHead}>
                        <strong className={styles.cardTitle}>{naText(row.site?.name)}</strong>
                        <span className={styles.cardSub}>
                          {VISIT_KIND_LABELS[row.kind] || row.kind} · {naText(row.cadenceText)}
                        </span>
                      </div>
                      <p className={styles.cardMeta}>
                        <span className="mono">{naText(row.salesOrderNumber)}</span>
                        {" · "}เจ้าหน้าที่ประจำ {naText(row.assigneeName)}
                      </p>
                      <Link href={`/database/sites/${row.siteId}`} className={`linklike ${styles.cardLink}`}>
                        เติมนัดที่หน้าไซต์
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <TableScroll family="list" minWidth={900}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">ไซต์</th>
                        {/* ⚠️ ไซต์เดียวมีได้หลายรอบ (คนละใบ/คนละชนิดงาน) ⇒ ความถี่ ("ทุกเดือน วันที่ 22" · "ทุก N วัน")
                            อย่างเดียวแยกแถวไม่ออก · ค่าพวกนี้ `visitQueue` คืนมาอยู่แล้ว
                            แต่จอไม่เคยวาด */}
                        <th scope="col">ชนิดงาน</th>
                        <th scope="col">รอบ</th>
                        <th scope="col">ใบสั่งขาย</th>
                        <th scope="col">เจ้าหน้าที่ประจำ</th>
                        <th scope="col" className={styles.actionCell} aria-label="การกระทำ" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr key={row.planId}>
                          <th scope="row">{naText(row.site?.name)}</th>
                          <td>{VISIT_KIND_LABELS[row.kind] || row.kind}</td>
                          <td>{naText(row.cadenceText)}</td>
                          <td className="mono">{naText(row.salesOrderNumber)}</td>
                          <td>{naText(row.assigneeName)}</td>
                          <td className={styles.actionCell}>
                            <div className={styles.rowAction}>
                              <Link href={`/database/sites/${row.siteId}`} className="linklike">
                                เติมนัดที่หน้าไซต์
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )
            )}

            {/* คิวยาวขึ้นทุกครั้งที่มีใบอนุมัติใหม่ — แบ่งหน้าแทนการปักหัวตาราง
                (ของเหนือตารางสูง ปักแล้วได้สกรอลล์สองชั้น ดู `pinned` ใน Table.js) */}
            {/* บรรทัดรวมของแท็บรอตั้งรอบ (C-D21) — ป้ายจำนวนนับแถว ส่วนนี้บอกว่าแถวทั้งหมดครอบกี่ไซต์/ใบ/โซน/แพ็ค */}
            {tab === "plan" && tabRows.length > 0 ? (
              <p className={styles.planTotals}>{planTotalsLine(planSum)}</p>
            ) : null}
            {tabRows.length > 0 && (
              <Pager
                page={page}
                pageCount={pageCount}
                total={total}
                onPage={setPage}
                pageSize={pageSize}
                onPageSize={pickPageSize}
                itemLabel={tab === "plan" ? "แถว" : tab === "visit" ? "รอบ" : "ใบ"}
              />
            )}
          </>
        )}
      </ListPanel>

      {/* ⭐ **โมดัลตัวเดียวกับหน้าไซต์/แท็บงานบริการของใบ** — ห้ามก๊อปฟอร์มที่สอง (AGENTS.md)
          · ใบของรอบตรึงจากแถว: `salesOrderId` ของแถว + `salesOrders={null}` (ไม่มีช่องเลือกใบ ⇒ TS เผลอเลือก
            "ไม่ผูกใบ" ไม่ได้ · critique L2) · แถบบริบทของโมดัลบอกเลขใบ
          · `context`/`prefill` มาจากตัวคำนวณของแถว (ช่วงบริการ · ข้อเสนอความถี่แบบกด "ใช้" — ไม่เติมเงียบ · C-D6)
          · `roundsSold` = รอบที่ขายของไซต์ × ใบนี้ (ไม่ใช่ของทั้งใบ) — `planRoundsSold` ของตัวคำนวณแถว: แถวที่ช่วงบริการต่างกัน
            รายรายการ (ใบแยกรายรายการ · mig 0400) = null ⇒ โมดัลไม่เทียบจำนวนนัดกับตัวเลขที่อ้างคนละช่วง */}
      {canEdit && (
        <ServicePlanModal
          open={!!planRow}
          siteId={planRow?.siteId}
          technicians={technicians}
          roundsSold={planRow?.planRoundsSold ?? null}
          salesOrderId={planRow?.salesOrderId}
          salesOrders={null}
          context={planRow?.context}
          prefill={planRow?.prefill}
          accessDays={planRow?.site?.accessDays}
          onClose={closePlan}
          onSave={savePlan}
        />
      )}
    </Workspace>
  );
}
