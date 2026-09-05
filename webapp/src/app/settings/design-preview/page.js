"use client";

/* ต้นแบบดีไซน์ของระบบ — หน้าจอเดียวที่รวม primitive กลางทุกตัวไว้ให้ดูพร้อมกัน

   มีไว้สองอย่าง:
   1) คนทำหน้าใหม่เปิดดูก่อนว่า "ของกลางมีอะไรให้ใช้บ้าง" แทนการก๊อปคลาสจากหน้าอื่น
      (ที่ผ่านมาคือสาเหตุที่ปุ่ม/ตาราง/การ์ดหน้าตาไม่ตรงกันข้ามโมดูล)
   2) เปลี่ยนโทเคนหรือ primitive แล้วเปิดหน้านี้หน้าเดียวก็เห็นผลกระทบทั้งระบบ
      ทั้งโหมดสว่างและมืด (สลับธีมที่แถบบนได้เลย)

   หน้านี้ห้ามผูกกับข้อมูลจริงหรือ API ใด ๆ — ต้องเปิดได้เสมอแม้ระบบหลังบ้านล่ม */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Palette,
  Pencil, Plus, Search, Inbox, Trash2, Check, Info, Undo2, Users,
  CalendarClock, ChevronDown, FileText, LayoutGrid, Settings, UserRound,
  TriangleAlert, ShieldAlert, CircleHelp,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartCard, { ChartCanvas, ChartLegend, ChartTooltip } from "@/components/ui/ChartCard";
import {
  CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_PROPS, CHART_LINE_TYPE, CHART_STROKE_WIDTH,
} from "@/lib/chartTheme";
import Workspace, { WorkspaceSection, MetricStrip, Metric } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import { ActionBar, ActionButton } from "@/components/ui/ActionButtons";
import GatedAction from "@/components/ui/GatedAction";
import { TableScroll, TableShell, TableEmpty } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import Tag from "@/components/ui/Tag";
import CountBadge from "@/components/ui/CountBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import AlertBanner from "@/components/ui/AlertBanner";
/* ⚠️ ต้องตั้งชื่อใหม่ — ไฟล์นี้อิมพอร์ต `Tooltip` ของ recharts ไว้ใช้กับกราฟแล้ว
   (ชื่อชนกันข้ามไลบรารี) · ที่หน้าอื่นให้อิมพอร์ตเป็น `Tooltip` ตามปกติ */
import UiTooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import KpiCard from "@/components/ui/KpiCard";
import Tabs from "@/components/ui/Tabs";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import CodeStrip from "@/components/ui/CodeStrip";
import PendingFiles from "@/components/ui/PendingFiles";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import DateTimeInput from "@/components/ui/DateTimeInput";
import MonthPicker from "@/components/ui/MonthPicker";
import DayRangePicker from "@/components/ui/DayRangePicker";
import MonthRangePicker from "@/components/ui/MonthRangePicker";
import MonthGrid from "@/components/ui/MonthGrid";
import SortControl from "@/components/ui/SortControl";
import FilterPopover from "@/components/ui/FilterPopover";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import MoneyInput from "@/components/ui/MoneyInput";
import PhoneInput from "@/components/ui/PhoneInput";
import NationalIdInput from "@/components/ui/NationalIdInput";
import MaskedNumberInput from "@/components/ui/MaskedNumberInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TwoPanePicker from "@/components/ui/TwoPanePicker";
import PersonSelect from "@/components/ui/PersonSelect";
import PersonLoadSelect from "@/components/ui/PersonLoadSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import OptionTiles from "@/components/ui/OptionTiles";
import ChoiceChips from "@/components/ui/ChoiceChips";
import StageSteps from "@/components/ui/StageSteps";
import BusinessLineSelect from "@/components/ui/BusinessLineSelect";
import TeamPickerField from "@/components/ui/TeamPickerField";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import PhotoThumb from "@/components/ui/PhotoThumb";
import MenuSelect from "@/components/ui/MenuSelect";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import StepTrack from "@/components/ui/StepTrack";
import RowActionMenu from "@/components/ui/RowActionMenu";
import SaveStatus from "@/components/ui/SaveStatus";
import FormActions from "@/components/ui/FormActions";
import ReadableText from "@/components/ui/ReadableText";
import RichText from "@/components/ui/RichText";
import FormZone from "@/components/ui/FormZone";
import SectionRail from "@/components/ui/SectionRail";
import EditableLineList from "@/components/ui/EditableLineList";
import Pager from "@/components/ui/Pager";
import { notifyToast } from "@/components/ui/Toast";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import RecordControlCard from "@/components/ui/RecordControlCard";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import DetailRow from "@/components/ui/DetailRow";
import ClickableCard from "@/components/ui/ClickableCard";
import ApprovalQueue from "@/components/ui/ApprovalQueue";
import {
  ContextCard, ContextGrid, ContextualRightRail, DetailCard, DetailPageLayout,
} from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentReadinessList,
} from "@/components/ui/DocumentControlPanel";
import VersionControlCard from "@/components/ui/VersionControlCard";
import ActionQueue from "@/components/ui/ActionQueue";
import AccessDenied from "@/components/ui/AccessDenied";
import { defineLifecycle } from "@/lib/recordLifecycle";
import { addDays, addMonths } from "@/lib/datePeriods";
import { STATUS_TONES, toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";
import { fmtMoney, fmtNumber } from "@/lib/format";

const SURFACES = [
  { cls: styles.bg, token: "--bg", use: "พื้นหน้า" },
  { cls: styles.panel, token: "--panel", use: "การ์ด/ตาราง (กระจก)" },
  { cls: styles.panel2, token: "--panel-2", use: "หัวตาราง/hover" },
  { cls: styles.panelFloat, token: "--panel-float", use: "แผงลอย (ทึบ 100%)" },
  { cls: styles.border, token: "--border-strong", use: "เส้นขอบเน้น" },
];

const COLORS = [
  { cls: styles.accent, token: "--accent", use: "เริ่มของใหม่" },
  { cls: styles.accentSoft, token: "--accent-soft", use: "พื้นเน้นอ่อน" },
  { cls: styles.navy, token: "--navy", use: "ยืนยัน/บันทึก" },
  { cls: styles.green, token: "--green", use: "สำเร็จ" },
  { cls: styles.amber, token: "--amber", use: "เตือน/รอ" },
  { cls: styles.red, token: "--red", use: "อันตราย/ผิดพลาด" },
  { cls: styles.blue, token: "--blue", use: "ข้อมูล" },
  { cls: styles.text, token: "--text", use: "ตัวอักษรหลัก" },
  { cls: styles.text3, token: "--text-3", use: "ตัวอักษรรอง" },
];

const BUTTON_TONES = ["neutral", "primary", "accent", "danger", "warning"]; // คนละชุดกับ STATUS_TONES (ดู lib/ui/tone.js)

/* ความหมายของแต่ละโทน — **ก๊อปคำมาจากคอมเมนต์ของ `TONES` ใน components/ui/Button.js**
   ซึ่งเป็นเจ้าของกฎ · `buttonPrimitive.test.mjs` บังคับให้สองที่พูดตรงกัน
   🐞 ก่อน 2026-09-02 หน้านี้พิมพ์แค่ *ชื่อ* tone เป็นป้ายปุ่ม ส่วนความหมายไปโผล่คนละ
   section บนช่องสี `--accent` / `--navy` (ผูกกับชื่อ *โทเคน* ไม่ใช่ชื่อ *tone*)
   ⇒ คนที่เปิดพรีวิวเพื่อหาคำตอบว่า "ปุ่มนี้ควร accent หรือ primary" หาไม่เจอ
   แล้วไปเดาจากเอกสารที่เขียนผิดแทน */
const TONE_MEANING = {
  neutral: "การกระทำรอง — พื้นเดียวกับ panel",
  primary: "navy = ยืนยันสิ่งที่ทำอยู่ (บันทึก/ยืนยัน/อนุมัติ/พิมพ์)",
  accent: "terracotta = เริ่มของใหม่ — จอละ 1 ปุ่มเท่านั้น",
  danger: "ทำลาย/ปิดเส้นทาง (ลบ · ยกเลิก · ตีกลับ)",
  warning: "ยังกู้ได้แต่มีของหลุด (ย้อนการอนุมัติ · พัก)",
};
/* tone ที่โชว์ = ลิสต์กลางจาก lib/ui/tone.js — เพิ่ม tone ใหม่แล้วหน้านี้ขึ้นเอง
   (เดิมหน้านี้ถือลิสต์ของตัวเอง แล้วตกหล่นได้เงียบ ๆ) */
const BADGE_TONES = STATUS_TONES;

/* ชื่อคลาสป้ายเก่าที่ยังเหลือในโค้ด + จำนวนจุดที่ใช้จริง
   ⚠️ ตัวเลขพวกนี้เคยเขียนฝังไว้ในข้อความแล้วไม่มีใครอัปเดต — หน้าต้นแบบจึงบอกเลข
   ที่คลาดจากของจริงอยู่หลายเดือน `badgeFamilies.test.mjs` ตรวจให้ตรงกับการนับจริง
   ทุกครั้งที่รันเทสต์แล้ว (เลขเปลี่ยน = เทสต์ตก ให้แก้ตัวเลขตรงนี้) */
const BADGE_FAMILIES = [
  { cls: "ui-badge", count: 199 },
  { cls: "status-pill", count: 44 },
  { cls: "chip", count: 23 },
];

const ROWS = [
  { code: "QT-26070128", customer: "บริษัท สหมิตร โปรดักส์ จำกัด", amount: 485000, tone: "warning", status: "รออนุมัติ" },
  { code: "QT-26070096", customer: "Bright Living Co., Ltd.", amount: 920000, tone: "success", status: "อนุมัติแล้ว" },
  { code: "QT-26070087", customer: "Maison Life Co., Ltd.", amount: 780000, tone: "neutral", status: "ฉบับร่าง" },
];

/* บรรทัดสินค้าสำหรับตารางในหน้ารายละเอียด — คนละชุดกับ ROWS (ซึ่งเป็น "รายการเอกสาร"
   มี code/customer/amount) เคยเผลอเอา ROWS มาใช้แล้วหน้าพังทั้งหน้าเพราะไม่มีฟิลด์ qty/total */
const DEMO_LINE_ITEMS = [
  { code: "RD-0142", name: "ก้านไม้หอม 100 ml — กลิ่น Forest night", qty: 1200, total: 186000 },
  { code: "RD-0143", name: "ก้านไม้หอม 50 ml — กลิ่น Forest night", qty: 800, total: 96200 },
  { code: "CN-0071", name: "เทียนหอมในแก้ว 220 g", qty: 600, total: 204000 },
];

const money = (value) => fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* วันนี้แบบ ISO (โซนเวลาเครื่อง) — ใช้เป็น min ของตัวอย่าง "ห้ามเลือกย้อนหลัง" */
const DEMO_TODAY = (() => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

/* ── "วันนี้" ที่ตัวเลือกช่วง/ปฏิทินต้องกิน ─────────────────────────────────
   ⚠️ ทั้ง `DayRangePicker` `MonthRangePicker` `MonthGrid` **รับวันนี้เข้ามาเป็น prop**
   ไม่ได้อ่านนาฬิกาเอง (MonthRangePicker มีค่าตั้งต้นเป็น `new Date()` ซึ่งคือนาฬิกา
   *เครื่องผู้ใช้* ไม่ใช่เวลาไทย) ⇒ หน้านี้แตกทุกค่าจาก `DEMO_TODAY` ก้อนเดียวข้างบน
   ห้ามเรียก `new Date()` ตอนเรนเดอร์ (ด่าน `npm run check:thaitime` + กติกาเวลาไทย
   ที่คอมเมนต์ของ MonthGrid เขียนไว้เองเรื่อง SSR/CSR ต้องได้วันเดียวกัน) */
const DEMO_MONTH = DEMO_TODAY.slice(0, 7);
// เที่ยงคืน UTC = 07:00 เวลาไทย ⇒ ยังเป็นวันเดียวกันเมื่อ `currentMonth()` แปลงเป็น Asia/Bangkok
const DEMO_NOW = new Date(`${DEMO_TODAY}T00:00:00Z`);
const DEMO_GRID_YEAR = Number(DEMO_TODAY.slice(0, 4));
const DEMO_GRID_MONTH = Number(DEMO_TODAY.slice(5, 7)) - 1; // MonthGrid นับเดือนแบบ 0-based
const DEMO_DAY_RANGE = { from: addDays(DEMO_TODAY, -6), to: DEMO_TODAY };
const DEMO_MONTH_RANGE = { from: addMonths(DEMO_MONTH, -2), to: DEMO_MONTH };
// วันที่ "มีข้อมูล" — โชว์เป็นจุดใต้ตัวเลขในปฏิทินสองเดือนของ DayRangePicker
const DEMO_MARKED_DAYS = [-1, -3, -4, -9, -12].map((back) => addDays(DEMO_TODAY, back));
/* ทะเบียนวันหยุดเขียนมือ — ของจริงมาจาก /settings/holidays (หน้านี้ห้ามยิง API)
   คีย์เป็นวันในเดือนที่กำลังแสดง เพื่อให้เห็นช่องสีวันหยุดเสมอไม่ว่าเปิดเดือนไหน */
const DEMO_HOLIDAYS = new Map([
  [`${DEMO_MONTH}-05`, "วันหยุดบริษัท (ตัวอย่าง)"],
  [`${DEMO_MONTH}-19`, "วันหยุดนักขัตฤกษ์ (ตัวอย่าง)"],
]);
/* "ของที่อยู่ในช่อง" — MonthGrid ไม่รู้จักนัด/งานเลย มันส่ง context ของช่องมาให้แล้ว
   ปล่อยให้หน้าเรียกวาดเอง · ตรึงเป็นวันที่ในเดือนที่กำลังแสดง จะได้เห็นทุกครั้งที่เปิดหน้า */
const DEMO_APPOINTMENTS = new Map([
  [`${DEMO_MONTH}-12`, "นัดส่งตัวอย่าง 10:00"],
  [`${DEMO_MONTH}-21`, "ตรวจไซต์ 13:30"],
]);

/* ⚠️ ค่าเป็น **บาทเต็มจำนวน** ไม่ใช่หน่วยล้าน — กราฟจัดรูปแบบด้วย `fmtMoney` ตัวกลาง
   ตัวเดียวกับทั้งระบบ (เงินโชว์เต็มหลัก ห้ามย่อ M/K) · เดิมชุดนี้เก็บเป็น 4.82 = ฿4.82M
   แล้วเติม "M" ต่อท้ายเองใน tooltip ⇒ ใส่ formatter กลางเฉย ๆ จะอ่านว่า "฿4.82" ผิดไป 10⁶ */
const CHART_DATA = [
  { month: "เม.ย.", actual: 3800000, target: 4200000 },
  { month: "พ.ค.", actual: 4400000, target: 4600000 },
  { month: "มิ.ย.", actual: 5100000, target: 5000000 },
  { month: "ก.ค.", actual: 4820000, target: 6500000 },
];

function Swatches({ items }) {
  return (
    <div className={styles.swatchGrid}>
      {items.map((item) => (
        <div key={item.token} className={styles.swatch}>
          <span className={`${styles.swatchChip} ${item.cls}`} aria-hidden="true" />
          <span className={styles.swatchName}>{item.token}</span>
          <span className={styles.swatchUse}>{item.use}</span>
        </div>
      ))}
    </div>
  );
}

/* ⚠️ `load` = **ภาระงานที่ติดมากับตัวคนแล้ว** ไม่ใช่ของที่ช่องเลือกไปหาเอง —
   ของจริงมาจาก `withWorkload(users, leadWorkloadFrom(rows, todayKey))` ใน
   lib/sales/leadWorkload.js · คีย์ต้องตรงกับ `WORKLOAD_FIELDS` เป๊ะ
   (holding · waitingContact · lateFollowUp) ไม่งั้น `PersonLoadSelect` โชว์ 0 ทุกช่อง
   เงียบ ๆ เพราะมันถอย `EMPTY_WORKLOAD` ให้เมื่ออ่านคีย์ไม่เจอ
   ตั้งค่าให้เห็นทั้งสองสี: u3 เลยติดตาม 0 = เขียว · u2 มี 2 ใบ = แดง (ช่อง `alert`
   ช่องเดียวที่ทาสี · อีกสองช่องนับเฉย ๆ เพราะถือ 11 ใบไม่ได้แปลว่าผิด) */
const DEMO_USERS = [
  { id: "u1", name: "สิทธิพงษ์ ศรีสุข", team: "KA", department: "SA", load: { holding: 4, waitingContact: 1, lateFollowUp: 0 } },
  { id: "u2", name: "ปัทมา วงศ์ทอง", team: "ODM", department: "SA", load: { holding: 11, waitingContact: 6, lateFollowUp: 2 } },
  // อยู่สองทีม — ป้ายใต้ชื่อมาจาก `userTeams()` + `TEAM_LABELS` ไม่ใช่ช่อง team เดี่ยว
  { id: "u3", name: "ธนวัฒน์ อินทรโชติ", team: "ODM", teams: ["ODM", "KA"], department: "SA", load: { holding: 0, waitingContact: 0, lateFollowUp: 0 } },
];

/* ป้ายกำกับรายคนของ PersonLoadSelect — `label` ต่อท้ายชื่อ · `warning` เป็นบรรทัด
   เตือนใต้รายชื่อที่ขึ้น **เฉพาะตอนคนนั้นถูกเลือก** (เตือน ไม่ห้าม)
   ของจริงคำนวณจากใบที่กำลังมอบหมาย จึงรับ record มาด้วย — ที่นี่ไม่มี record */
const demoLoadNote = (user) => (user?.id === "u2"
  ? {
    label: "เคยถือลีดรายนี้มาแล้ว",
    warning: "คนนี้มีใบเลยวันติดตามค้างอยู่ 2 ใบ — มอบหมายเพิ่มได้ แต่ให้รู้ก่อนว่ากำลังทับของค้าง",
  }
  : null);

/* ท่อนของรหัส FG สำหรับ CodeStrip — **เขียนมือ ไม่เรียก `fgCodeParts` ตัวจริง**
   (lib/master/masterCodes.js) เพราะของจริงต้องมีรหัส AR ของลูกค้าและตารางหมวดจาก
   ทะเบียน ซึ่งหน้านี้ห้ามไปแตะ · โครงและชื่อ tone ตรงกันทุกท่อน
   ⚠️ ท่อน `run` ปล่อยว่างไว้ตลอด — ของจริงเลขรันถูก "จอง" ตอนกดบันทึก จึงยังไม่มี
   ค่าให้โชว์ระหว่างกรอก และนั่นคือเหตุผลที่ primitive นี้ต้องมี placeholder แทนที่
   จะซ่อนท่อนทิ้ง (ซ่อนแล้วคนกรอกจะไม่รู้ว่ายังเหลืออีกกี่ท่อนกว่าจะได้รหัส) */
const demoFgParts = (categoryCode) => {
  const [main = null, sub = null] = categoryCode ? categoryCode.split("-") : [];
  return [
    { key: "prefix", label: "คงที่", value: "FG", tone: "fixed" },
    { key: "customer", label: "ลูกค้า", value: "0128", tone: "from", placeholder: "AAAA" },
    { key: "main", label: "หมวดหลัก", value: main, tone: "from", placeholder: "BB" },
    { key: "sub", label: "หมวดรอง", value: sub, tone: "from", placeholder: "CCC" },
    { key: "run", label: "เลขถัดไป", value: null, tone: "new", placeholder: "DDDDD" },
  ];
};

const DEMO_CUSTOMERS = [
  { value: "c1", label: "บริษัท สหมิตร โปรดักส์ จำกัด" },
  { value: "c2", label: "ห้างหุ้นส่วนจำกัด กลิ่นหอม" },
  { value: "c3", label: "บริษัท เอ็กซ์แซมเปิล รีเทล จำกัด" },
];

/* หมวดสินค้าตัวอย่าง — โครงเดียวกับแถวจริงจาก /api/product-types
   (mainCategoryCode + typeCode ประกอบเป็นรหัส "MM-TTT") */
/* ตัวเลือกสองชั้นตัวอย่าง — โครงเดียวกับที่ DealPicker ป้อนให้ TwoPanePicker จริง
   (กลุ่ม = โครงการ + ถัง "ทั้งหมด" · รายการ = ดีล) */
const DEMO_PICKER_DEALS = [
  { value: "d1", label: "Rinvala Sachet 500", meta: "บจก.รินวาลา · FC 2026-08", search: "rinvala sachet รินวาลา 2026-08" },
  { value: "d2", label: "Rinvala Sachet 500", meta: "บจก.รินวาลา · FC 2026-11", search: "rinvala sachet รินวาลา 2026-11" },
  { value: "d3", label: "Diffuser 100ml รอบ 2", meta: "สมชายโฮม · FC 2026-09", search: "diffuser สมชาย 2026-09" },
];
const DEMO_PICKER_GROUPS = [
  { key: "all", label: "ดีลทั้งหมด", search: "ทั้งหมด", items: DEMO_PICKER_DEALS },
  { key: "p1", label: "KA_Rinvala", meta: "PJ-26080012 · บจก.รินวาลา", search: "PJ-26080012 KA_Rinvala รินวาลา", items: DEMO_PICKER_DEALS.slice(0, 2) },
  { key: "p2", label: "ODM_Somchai", meta: "PJ-26080033 · สมชายโฮม", search: "PJ-26080033 ODM_Somchai สมชาย", items: DEMO_PICKER_DEALS.slice(2) },
];

const DEMO_CATEGORIES = [
  { mainCategoryCode: "AR", mainCategoryName: "Air care", typeCode: "RD", nameTh: "ก้านไม้หอม" },
  { mainCategoryCode: "AR", mainCategoryName: "Air care", typeCode: "SPR", nameTh: "สเปรย์ปรับอากาศ" },
  { mainCategoryCode: "CN", mainCategoryName: "Candle", typeCode: "JAR", nameTh: "เทียนหอมในแก้ว" },
];

const DEMO_LONG_TEXT = [
  "ลูกค้าลองกลิ่นรอบที่สองแล้วให้ความเห็นว่าโทนไม้ยังหนักไปสำหรับห้องนอน",
  "ขอให้ลดลงประมาณหนึ่งในสาม แล้วเพิ่มความสดช่วงต้นให้ชัดขึ้น",
  "",
  "ส่วนเรื่องบรรจุภัณฑ์ ขอให้ใช้ขวดทรงเดิมแต่เปลี่ยนฉลากเป็นกระดาษผิวด้าน",
  "และขอตัวอย่างอีก 3 ชิ้นสำหรับนำเสนอผู้บริหารภายในสิ้นเดือนนี้",
  "หากทันจะเริ่มสั่งผลิตล็อตแรกในไตรมาสหน้า",
].join("\n");

/* ข้อความเดียวกันแต่มีของครบ **สามชนิดที่ `parseRichText` รู้จัก** — URL · @ชื่อคน ·
   รหัสเอกสาร · ถ้าไม่มีสักชนิด `RichText` จะตกไปใช้ `ReadableText` ตรง ๆ (ทางเดินปกติ
   ของเธรดส่วนใหญ่) แล้วตัวอย่างนี้ก็จะสาธิตอะไรไม่ได้เลย
   ⚠️ ชื่อที่ถูก @ ต้อง**ส่งมาทาง `mentionNames`** — ชื่อไทยมีช่องว่าง เดาขอบเขตจาก
   ข้อความดิบไม่ได้ ไม่ส่งมาก็ไม่ไฮไลต์ (ของจริงมาจาก `meta.mentionNames` ของโพสต์) */
const DEMO_MENTION_NAMES = ["ปัทมา วงศ์ทอง"];
const DEMO_RICH_TEXT = [
  "สรุปที่คุยกับลูกค้าเมื่อเช้า อ้างตาม QT-26090242-0 ที่ส่งไปแล้ว",
  "ราคายืนตามเดิม แต่ขอเลื่อนวันส่งของออกไปอีกสองสัปดาห์",
  "",
  "@ปัทมา วงศ์ทอง ช่วยตรวจสเปกฉลากในไฟล์นี้ให้หน่อย",
  "https://www.scentandsense.co.th/brief/forest-night",
  "ถ้าติดอะไรให้เปิดใบแจ้งปัญหาต่อจาก IS-26080037 ได้เลย",
].join("\n");

/* รูปแบบเลขบัญชีธนาคาร 10 หลัก `xxx-x-xxxxx-x` — มีอยู่เฉพาะหน้าต้นแบบ ระบบจริงยัง
   ไม่มีช่องนี้ · จงใจใส่ไว้เพื่อให้คนที่ต้องทำช่อง mask ตัวใหม่เจอ **ฐาน**
   (`MaskedNumberInput` + `format` + `maxDigits`) ไม่ใช่ก๊อป PhoneInput ไปแก้ regex
   ⚠️ ตัวจัดรูปแบบรับ "ตัวเลขล้วน" แล้วคืนสตริงที่มีตัวคั่น — ค่าที่เก็บยังเป็นเลขล้วน
   เสมอ (กติกาเดียวกับ MoneyInput/PhoneInput ทั้งหมวด) */
const formatBankAccount = (digits) => {
  const only = String(digits || "").replace(/\D/g, "").slice(0, 10);
  return [only.slice(0, 3), only.slice(3, 4), only.slice(4, 9), only.slice(9, 10)]
    .filter(Boolean).join("-");
};

/* ── ชุดตัวอย่างของส่วน "โครงของฟอร์มยาว" ───────────────────────────────────
   ราง **ชุดตายตัว** — โครงเดียวกับ 5 ส่วนของแบบฟอร์ม PDR ซึ่งเป็นผู้เรียกรายแรก
   `base` = จำนวนช่องที่ "กรอกไว้แล้ว" ในตัวอย่าง · ตั้งค่าให้เห็น **จุดสีครบสามสถานะ
   พร้อมกันตั้งแต่เปิดหน้า** (เขียว = ครบ · เหลือง = เริ่มแล้ว · เทา = ยังว่าง)
   ส่วน `optional` คือส่วนที่ไม่มีช่องไหนบังคับเลย ⇒ **ต้องไม่ขึ้น "0/6" เหมือนงานค้าง** */
const DEMO_RAIL_SECTIONS = [
  { key: "head", label: "1. ข้อมูลหัวใบ", total: 4, base: 4 },
  { key: "target", label: "2. เป้าหมายสินค้า", total: 5, base: 2 },
  { key: "brief", label: "3. บรีฟกลิ่น", total: 4, base: 0 },
  { key: "pack", label: "4. บรรจุภัณฑ์", total: 3, base: 3 },
  { key: "sign", label: "5. ตารางลายเซ็น", total: 6, base: 0, optional: true },
];

// ชนิดเอกสารตัวอย่างของราง "ของที่ผู้ใช้สร้างเอง 0..N" (โครงเดียวกับ requests/DocumentLines)
const DEMO_DOC_TYPES = [
  { value: "coa", label: "COA" },
  { value: "ifra", label: "IFRA" },
  { value: "msds", label: "MSDS" },
];
const DEMO_DOC_LABEL = (type) => DEMO_DOC_TYPES.find((t) => t.value === type)?.label || "ยังไม่เลือกชนิด";
/* ⚠️ แถวไม่มี id — คีย์เป็น **ตำแหน่ง** เหมือนผู้เรียกจริง (requests/DocumentLines):
   แถวยังไม่มี id จนกว่าจะบันทึก · ลบแถวกลางแล้วคีย์ของตัวที่เหลือขยับตาม ซึ่งถูกต้อง
   เพราะเนื้อของมันก็มาจาก `rows[at]` ตำแหน่งใหม่เหมือนกัน */
const DEMO_DOC_ROWS = [
  { type: "coa", spec: "ล็อตผลิตเดือนนี้ ภาษาอังกฤษ" },
  { type: "ifra", spec: "" },
];

// บรรทัดของ EditableLineList (โครงเดียวกับข้อ 2.2/2.3 ของ PDR ซึ่งเป็นผู้เรียกจริงที่เหลืออยู่)
const DEMO_FORM_LINES = [
  { kind: "AR-RD", scent: "Forest night", price: "1,200" },
  { kind: "CN-JAR", scent: "", price: "" },
];

/* ── คิวรออนุมัติ ─────────────────────────────────────────────────────────
   5 ใบ **โดยตั้งใจ** — `QUEUE_PREVIEW` ของ ApprovalQueue คือ 3 ⇒ ต้องเกินถึงจะเห็น
   ปุ่ม "ดูอีก 2 รายการ" ซึ่งเป็นพฤติกรรมที่คนต้องรู้ก่อนเอาไปใช้กับคิวยาว ๆ */
const DEMO_QUEUE_MASTERS = [
  { id: "AR-1042", code: "AR-1042", name: "บริษัท สหมิตร โปรดักส์ จำกัด", team: "KA" },
  { id: "AR-1043", code: "AR-1043", name: "Bright Living Co., Ltd.", team: "ODM" },
  { id: "AR-1044", code: "AR-1044", name: "ห้างหุ้นส่วนจำกัด กลิ่นหอม", team: "KA" },
  { id: "AR-1045", code: "AR-1045", name: "Maison Life Co., Ltd.", team: "SV" },
  { id: "AR-1046", code: "AR-1046", name: "บริษัท เอ็กซ์แซมเปิล รีเทล จำกัด", team: "ODM" },
];
const DEMO_QUEUE_DOCS = [
  { id: "QT-26090242-0", customer: "บริษัท สหมิตร โปรดักส์ จำกัด", amount: 486200 },
  { id: "QT-26090238-1", customer: "Bright Living Co., Ltd.", amount: 920000 },
];

/* lifecycle ตัวอย่างสำหรับหน้าต้นแบบ — โครงเดียวกับที่ ลีด/ดีล/โครงการ จะประกาศจริง
   ประกาศไว้นอก component เพราะ defineLifecycle ตรวจความถูกต้องตอนประกาศ (ทำครั้งเดียว) */
const DEMO_LIFECYCLE = defineLifecycle({
  entity: "demo",
  noun: "รายการตัวอย่าง",
  statuses: {
    draft: { label: "ร่าง", tone: "neutral", description: "ยังไม่ยื่นอนุมัติ แก้ไขได้อิสระ" },
    pending: { label: "รออนุมัติ", tone: "warning", description: "รอผู้อนุมัติตรวจ — ผู้ยื่นดึงกลับได้" },
    active: { label: "ดำเนินการ", tone: "info", description: "อนุมัติแล้ว กำลังเดินงาน" },
    done: { label: "เสร็จสิ้น", tone: "success", description: "ปิดงานเรียบร้อย" },
    cancelled: { label: "ยกเลิก", tone: "danger", description: "หยุดกลางทาง เหตุผลอยู่ในประวัติ" },
  },
  cancelledStatuses: ["cancelled"],
  steps: [
    { id: "draft", label: "ร่าง", hint: "กรอกข้อมูล", statuses: ["draft"] },
    { id: "approve", label: "อนุมัติ", hint: "ผู้อนุมัติตรวจ", statuses: ["pending"] },
    { id: "run", label: "ดำเนินการ", hint: "เดินงานตามแผน", statuses: ["active"] },
    { id: "close", label: "ปิดงาน", statuses: ["done"] },
  ],
  transitions: [
    { id: "submit", label: "ยื่นอนุมัติ", kind: "submit", slot: "primary", from: "draft", to: "pending" },
    {
      id: "approve",
      label: "อนุมัติ",
      kind: "approve",
      slot: "primary",
      from: "pending",
      to: "active",
      // visible = เรื่องสิทธิ์ → คนไม่มีสิทธิ์ไม่เห็นปุ่มนี้เลย
      visible: (record, user) => user?.role === "boss",
      confirm: { title: "อนุมัติรายการนี้?", message: "อนุมัติแล้วรายการจะเดินไปขั้นดำเนินการ" },
    },
    {
      id: "reject",
      label: "ตีกลับ",
      kind: "reject",
      from: "pending",
      to: "draft",
      reason: "required",
      visible: (record, user) => user?.role === "boss",
      reasonPolicy: {
        title: "ตีกลับให้ผู้ยื่นแก้",
        description: "รายการจะกลับเป็นร่าง พร้อมเหตุผลที่คุณระบุ",
        detail: "ผู้ยื่นจะเห็นเหตุผลนี้และได้รับแจ้งเตือน",
        label: "เหตุผลที่ตีกลับ",
        placeholder: "ระบุสิ่งที่ต้องแก้ให้ชัดเจน",
      },
    },
    {
      id: "withdraw",
      label: "ดึงกลับมาแก้ไข",
      kind: "withdraw",
      slot: "secondary",
      from: "pending",
      to: "draft",
      // ดึงคำขอของตัวเองกลับ = กล่องยืนยันพอ ไม่บังคับเหตุผล (มติ 2026-07-28)
      confirm: { title: "ดึงกลับมาแก้ไข", message: "รายการจะออกจากคิวอนุมัติและกลับเป็นร่าง ยื่นใหม่ได้ภายหลัง" },
    },
    {
      id: "close",
      label: "ปิดงาน",
      kind: "submit",
      slot: "primary",
      from: "active",
      to: "done",
      // allow = เรื่องเงื่อนไข → เห็นปุ่มแต่กดไม่ได้ พร้อมบอกเหตุ
      allow: (record) => (record.openTasks > 0 ? `ยังมีงานค้าง ${record.openTasks} ขั้นตอน` : true),
    },
    {
      id: "drop",
      label: "ยกเลิกรายการ",
      kind: "drop",
      from: ["draft", "pending", "active"],
      to: "cancelled",
      reason: "required",
      reasonPolicy: {
        title: "ยกเลิกรายการนี้",
        description: "ตัวอย่าง transition ที่ขอข้อมูลเพิ่มนอกจากเหตุผล",
        label: "รายละเอียดที่ลูกค้าแจ้ง",
      },
      fields: [
        {
          name: "lossReason",
          type: "select",
          label: "สาเหตุ",
          required: true,
          options: [
            { value: "price", label: "ราคาสูงเกินไป" },
            { value: "competitor", label: "คู่แข่งได้งาน" },
            { value: "postpone", label: "ลูกค้าเลื่อนโครงการ" },
          ],
        },
        { name: "owner", type: "person", label: "ผู้รับผิดชอบที่แจ้งข่าว", users: DEMO_USERS },
        { name: "lostValue", type: "money", label: "มูลค่าที่เสียไป (บาท)" },
        { name: "decidedAt", type: "datetime", label: "ลูกค้าแจ้งเมื่อ", hint: "เว้นว่างได้ ไม่บังคับ" },
      ],
    },
    { id: "edit", label: "แก้ไขรายการ", kind: "edit", slot: "secondary" },
  ],
});

const DEMO_STATUSES = ["draft", "pending", "active", "done", "cancelled"];

/* ── ตัวอย่างของ "ตัวเลือกที่ไม่ใช่ดรอปดาวน์" ──────────────────────────────
   ยกคำจากของจริงมาทั้งชุด (ประเภทดีล · แบรนด์ลูกค้า · ขั้นของดีล) เพราะหน้านี้
   ต้องตอบคำถาม **"ควรใช้ตัวไหน"** ไม่ใช่ "หน้าตาเป็นยังไง" — ตัวอย่างที่ตั้งชื่อ
   ลอย ๆ (ตัวเลือก ก/ข/ค) ตอบคำถามนั้นไม่ได้ */

/* แผ่นสุดท้ายปิดไว้โดยเจตนา — สาธิตกฎ "ป้ายของตัวเลือกที่กดไม่ได้ต้องบอกเหตุผล
   ในตัวเอง" เพราะแผ่นเลือกไม่มีที่ให้ tooltip (บรรทัดรองคือที่เดียวที่มี) */
const DEMO_DEAL_TYPES = [
  { value: "scent", label: "SCENT", description: "ขายกลิ่นที่มีอยู่แล้ว", tone: "amber" },
  { value: "npd", label: "NPD", description: "พัฒนากลิ่นใหม่", tone: "violet" },
  { value: "reorder", label: "RE-ORDER", description: "ต้องมีสูตรที่ผลิตแล้วก่อน", tone: "blue", disabled: true },
];

/* ทีมของระบบจริง (ODM/KA/SV) — เขียนมือในหน้านี้ ไม่ได้อ่านจากทีมของคนที่เปิดหน้า
   ดูเหตุผลที่บล็อกกฎของ MyTeamsFilter ในส่วนนั้น */
const DEMO_TEAMS = ["ODM", "KA", "SV"];
const DEMO_TEAM_TILES = [
  { value: "ODM", label: "New ODM" },
  { value: "KA", label: "Key Account" },
  { value: "SV", label: "Services" },
];

/* ชิปเลือกหนึ่ง — ตัวแรกเป็น ghost ("ยังไม่ระบุ" เส้นประ) ซึ่งเป็นคำตอบที่ถูกต้อง
   ไม่ใช่ค่าที่ยังไม่ได้กรอก */
const DEMO_BRANDS = [
  { value: "", label: "ยังไม่ระบุ", ghost: true },
  { value: "bright", label: "Bright Living" },
  { value: "maison", label: "Maison Life" },
  { value: "sahamit", label: "สหมิตร" },
];

const DEMO_CHIP_FILTER = [
  { value: "draft", label: "ฉบับร่าง" },
  { value: "pending", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
];

/* `sub` = ผลของการเลือกขั้นนั้น (FC%) — เหตุผลทั้งหมดที่ช่อง FC แยกถูกยุบทิ้งได้
   `cut` ที่ขั้นแรกของกลุ่มปลาย = เส้นหนาคั่นก่อน Won/Lost */
const DEMO_DEAL_STAGES = [
  { value: "qualify", label: "คัดกรอง", sub: "FC 10%" },
  { value: "present", label: "นำเสนอ", sub: "FC 30%" },
  { value: "negotiate", label: "ต่อรอง", sub: "FC 60%" },
  { value: "won", label: "ปิดได้", sub: "FC 100%", tone: "win", cut: true },
  { value: "lost", label: "ไม่ไปต่อ", sub: "FC 0%", tone: "lose" },
];

/* ── ราง (StepTrack) ────────────────────────────────────────────────────
   รางจริงของใบสั่งขาย — สามขั้น ตามที่ `lib/sales/salesOrderListTrack.js` ตัดสิน */
const DEMO_SO_TRACK = [
  { key: "doc", label: "AE Sup", state: "done" },
  { key: "pay", label: "เก็บเงิน", state: "now", note: "เก็บแล้ว 1 จาก 3 งวด" },
  { key: "close", label: "บัญชีปิดใบ", state: "todo" },
];

/* รางสาธิตห้าสถานะ — ไม่ใช่ใบจริง (ใบจริงไม่มีทั้ง bad และ skip พร้อมกัน)
   วางไว้เพื่อให้เทียบ *รูปหมุด* ได้ในสายตาเดียว โดยเฉพาะ skip ที่เป็นวงกลมกลวง */
const DEMO_TRACK_STATES = [
  { key: "done", label: "done · ผ่านมาแล้ว", state: "done" },
  { key: "now", label: "now · ค้างอยู่ตรงนี้", state: "now" },
  { key: "bad", label: "bad · ตีกลับ", state: "bad", note: "คนที่ต้องลงมือคือผู้ยื่น" },
  { key: "skip", label: "skip · ใบนี้ไม่มีขั้นนี้", state: "skip", note: "ใบยอด 0 ไม่มีขั้นเก็บเงิน" },
  { key: "todo", label: "todo · ยังไม่ถึงคิว", state: "todo" },
];

/* ── ภาพย่อ (PhotoThumb) ────────────────────────────────────────────────
   รูปที่เปิดได้ = SVG ฝังในไฟล์ ไม่ยิงเน็ต (หน้านี้ต้องเปิดได้แม้หลังบ้านล่ม)
   สีเป็นชื่อสีมาตรฐาน ไม่ใช่โทเคน เพราะนี่คือ **เนื้อในของรูป** ไม่ใช่ผิวของ UI */
const DEMO_PHOTO_OK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E"
  + "%3Crect width='120' height='120' fill='silver'/%3E"
  + "%3Ccircle cx='40' cy='40' r='15' fill='white'/%3E"
  + "%3Cpath d='M8 112 L48 62 L78 98 L96 78 L120 112 Z' fill='gray'/%3E%3C/svg%3E";

/* รูปที่เปิดไม่ได้ = data: ที่ถอดรหัสไม่เป็นภาพ ⇒ `onerror` ยิงโดยไม่ต้องต่อเน็ตเลย
   ของจริงคือโทเคน Drive หมดอายุแล้ว `/file` ตอบ 502 (ดูหัว components/ui/PhotoThumb.js) */
const DEMO_PHOTO_BROKEN = "data:image/png;base64,ZGVzaWduLXByZXZpZXc=";

/* หน้านี้เคยเป็นหน้าเดียวยาว 19 ส่วนติดกัน (วัดจริง 10,217px ≈ 12.8 จอที่ 1280×800)
   หาของไม่เจอถ้าไม่รู้ว่ามันอยู่ช่วงไหน — จัดเป็น 5 กลุ่มตาม *หน้าที่* ของ primitive
   แล้วแสดงทีละกลุ่ม (ไม่ใช่แค่ลิงก์กระโดด เพราะความยาวจะเท่าเดิม) */
const GROUPS = [
  { key: "foundation", label: "พื้นฐาน", hint: "โทเคนที่ทุกอย่างอ้างถึง — พื้นผิว สี ตัวอักษร" },
  { key: "controls", label: "ตัวควบคุม", hint: "ของที่ผู้ใช้กดและกรอก" },
  { key: "data", label: "แสดงข้อมูล", hint: "ของที่อ่านอย่างเดียว — ตาราง กราฟ ป้าย ตัวเลข" },
  { key: "feedback", label: "การตอบสนอง", hint: "ระบบพูดกลับหาผู้ใช้" },
  { key: "shell", label: "โครงหน้า", hint: "กรอบที่ห่อทุกหน้า — นำทาง หน้ารายละเอียด จุดจัดการ record" },
];

/* ห่อ WorkspaceSection ให้รู้จักกลุ่ม — ตั้งใจไม่ใช้ CSS ซ่อน (display:none) เพราะ
   กราฟกับแผงลอยคำนวณขนาดจากกล่องจริง ถ้าซ่อนไว้แล้วค่อยโชว์จะได้ขนาดเพี้ยน */
function Section({ group, active, ...props }) {
  if (group !== active) return null;
  return <WorkspaceSection {...props} />;
}

export default function DesignPreviewPage() {
  const [tab, setTab] = useState("overview");
  // ตะกร้าไฟล์ตัวอย่างของหน้าต้นแบบ — ลาก/วางใส่ได้จริง ไม่ได้อัปที่ไหน
  const [demoFiles, setDemoFiles] = useState([]);
  const [view, setView] = useState("list");
  const [queueTab, setQueueTab] = useState("todo");
  const [sort, setSort] = useState("date");
  const [direction, setDirection] = useState("desc");
  const [filters, setFilters] = useState([]);
  const [page, setPage] = useState(1);
  const [docType, setDocType] = useState("qt");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [reasonDemo, setReasonDemo] = useState(null); // null = ปิด, string = เปิดพร้อมค่าที่พิมพ์
  const [demoDate, setDemoDate] = useState(DEMO_TODAY);
  const [demoDateBounded, setDemoDateBounded] = useState(DEMO_TODAY);
  const [demoTime, setDemoTime] = useState("09:30");
  const [demoDateTime, setDemoDateTime] = useState(`${DEMO_TODAY}T14:00`);
  const [demoMonth, setDemoMonth] = useState(DEMO_TODAY.slice(0, 7));
  const [demoAllMonths, setDemoAllMonths] = useState(false);
  const [teamFilter, setTeamFilter] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [demoMoney, setDemoMoney] = useState(125000.5);
  const [demoMoneyNeg, setDemoMoneyNeg] = useState(-4800);
  const [demoPhone, setDemoPhone] = useState("0812345678");
  const [demoNationalId, setDemoNationalId] = useState("1234567890123");
  // ช่อง mask ที่เรียก MaskedNumberInput (ฐาน) ตรง ๆ — เก็บเลขล้วน ตัวคั่นเกิดตอนแสดง
  const [demoBankAccount, setDemoBankAccount] = useState("1234567890");
  const [demoCustomer, setDemoCustomer] = useState("c1");
  const [demoFreeText, setDemoFreeText] = useState("");
  const [demoPerson, setDemoPerson] = useState("u1");
  const [demoCategory, setDemoCategory] = useState("AR-RD");
  const [demoTwoPane, setDemoTwoPane] = useState("");
  const [demoDirty, setDemoDirty] = useState(false);
  const [demoSaving, setDemoSaving] = useState(false);
  /* ── CodeStrip · PersonLoadSelect · GatedAction · AlertBanner ──────────────
     สามตัวหลังไม่มี "ค่า" ให้เก็บ มีแต่ *เหตุการณ์* ⇒ เก็บบรรทัดสะท้อน callback
     แบบเดียวกับ `recordLog` ข้างล่าง แทนการต่อ API ให้ดูผลจริง */
  const [demoCodeCategory, setDemoCodeCategory] = useState("");
  const [demoLoadPerson, setDemoLoadPerson] = useState("");
  const [demoGateLog, setDemoGateLog] = useState("");
  const [demoBannerLog, setDemoBannerLog] = useState("");
  const [group, setGroup] = useState(GROUPS[0].key);
  /* ── ตัวเลือกที่ไม่ใช่ดรอปดาวน์ ─────────────────────────────────────────
     ค่าตั้งต้นของสายธุรกิจเป็นสตริงว่างโดยเจตนา = "ยังไม่ระบุ" ซึ่งเป็นสถานะที่
     ถูกต้อง ห้ามใส่ค่าตั้งต้นให้ (ดูหัว lib/master/businessLines.js) */
  const [demoDealType, setDemoDealType] = useState("scent");
  const [demoMyTeams, setDemoMyTeams] = useState(["ODM", "SV"]);
  const [demoBrand, setDemoBrand] = useState("bright");
  const [demoChipFilter, setDemoChipFilter] = useState(["pending"]);
  const [demoStage, setDemoStage] = useState("negotiate");
  const [demoLine, setDemoLine] = useState("");
  const [demoOwnerTeam, setDemoOwnerTeam] = useState("ODM");
  const [demoShownTeams, setDemoShownTeams] = useState(["ODM", "SV"]);
  /* ── ปุ่มคุมมุมมองบน toolbar (ViewMenus/MenuSelect) ── */
  const [demoGroupBy, setDemoGroupBy] = useState("none");
  const [demoCollapsed, setDemoCollapsed] = useState(false);
  const [demoSortKey, setDemoSortKey] = useState("date");
  const [demoSortDir, setDemoSortDir] = useState("desc");
  const [demoDensity, setDemoDensity] = useState("comfortable");
  /* ── เมนูท้ายแถวของหน้าที่ไม่มี lifecycle ── */
  const [rowMenuLog, setRowMenuLog] = useState("");
  const [rowMenuBusy, setRowMenuBusy] = useState(false);
  /* ── ช่วงวัน · ช่วงเดือน · กริดปฏิทิน ────────────────────────────────────
     ค่าตั้งต้นแตกมาจาก DEMO_TODAY ทั้งหมด (ดูบล็อกโทเคนเวลาข้างบน) */
  const [demoDayRange, setDemoDayRange] = useState(DEMO_DAY_RANGE);
  const [demoMonthRange, setDemoMonthRange] = useState(DEMO_MONTH_RANGE);
  const [demoGridDay, setDemoGridDay] = useState("");
  /* ── โครงของฟอร์มยาว: FormZone · SectionRail · EditableLineList ──────────
     `demoRailNotes` ทำให้จุดสีบนรางขยับจริงตอนพิมพ์ — ไม่ใช่ตัวเลขตายที่วางไว้ดู */
  const [demoRailSection, setDemoRailSection] = useState("target");
  const [demoRailNotes, setDemoRailNotes] = useState({});
  const [demoDocRows, setDemoDocRows] = useState(DEMO_DOC_ROWS);
  const [demoDocAt, setDemoDocAt] = useState(0);
  const [demoLines, setDemoLines] = useState(DEMO_FORM_LINES);
  const [demoLineAt, setDemoLineAt] = useState(1);
  const [demoLinePick, setDemoLinePick] = useState("");
  /* ── คิวรออนุมัติ — ตัดสินในที่เลย (onDecide) ─────────────────────────────
     `onDecide` เป็นของผู้เรียกล้วน ๆ ตัว primitive ไม่ยิงเน็ตเอง ⇒ ที่นี่แค่ตัดใบออก
     จากอาร์เรย์แล้วเขียนบรรทัดสะท้อน callback (ท่าเดียวกับ `recordLog` ข้างล่าง) */
  const [demoQueue, setDemoQueue] = useState(DEMO_QUEUE_MASTERS);
  const [demoQueueLog, setDemoQueueLog] = useState("");
  const [recordStatus, setRecordStatus] = useState("pending");
  const [recordRole, setRecordRole] = useState("boss");
  const [recordLog, setRecordLog] = useState("");
  const demoRecord = { id: "demo-1", status: recordStatus, openTasks: recordStatus === "active" ? 2 : 0 };
  const demoUser = { id: "u1", role: recordRole };
  const runDemoTransition = (id, values) => {
    const filled = Object.entries(values).filter(([, value]) => value !== "" && value != null);
    setRecordLog(`onTransition("${id}"${filled.length ? `, ${JSON.stringify(Object.fromEntries(filled))}` : ""})`);
    const to = DEMO_LIFECYCLE.get(id)?.to;
    if (to) setRecordStatus(to);
  };

  /* ── ราง "ชุดตายตัว" ────────────────────────────────────────────────────
     จำนวนช่องที่กรอกแล้วคิดสดจากช่องในเนื้อฝั่งขวา ⇒ พิมพ์แล้ว **จุดสีขยับจริง**
     (ส่วนที่ยังว่าง: เทา → เหลือง · ส่วนไม่บังคับ: ไม่มีตัวเลข → "กรอก 1" จุดเขียว)
     ไม่ใช่ตัวเลขตายที่วางไว้ให้ดูรูป */
  const railSections = DEMO_RAIL_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    count: {
      filled: Math.min(section.total, section.base + (demoRailNotes[section.key]?.trim() ? 1 : 0)),
      total: section.total,
      optional: section.optional,
    },
  }));
  const setRailNote = (key, value) => setDemoRailNotes((prev) => ({ ...prev, [key]: value }));
  const railLabel = DEMO_RAIL_SECTIONS.find((section) => section.key === demoRailSection)?.label || "";

  /* ── ราง "ของที่ผู้ใช้สร้างเอง 0..N" ─────────────────────────────────────
     ⚠️ ลบ **แถวที่ระบุ** ไม่ใช่แถวที่เปิดอยู่ (ปุ่มถังขยะอยู่ที่แต่ละแถวในราง) และตัวที่
     เปิดอยู่ต้องขยับตามเมื่อลบตัวก่อนหน้า ไม่งั้นเนื้อฝั่งขวากระโดดเป็นของอีกแถว
     โดยที่คนกดไม่ได้สั่ง — กติกาเดียวกับ requests/DocumentLines */
  const docRow = demoDocRows[demoDocAt] || null;
  const patchDocRow = (patch) => setDemoDocRows((rows) => rows.map((row, i) => (i === demoDocAt ? { ...row, ...patch } : row)));
  const addDocRow = () => {
    setDemoDocRows((rows) => [...rows, { type: "", spec: "" }]);
    setDemoDocAt(demoDocRows.length);
  };
  const removeDocRow = (index) => {
    setDemoDocRows((rows) => rows.filter((_, i) => i !== index));
    setDemoDocAt((at) => Math.max(0, index < at ? at - 1 : Math.min(at, demoDocRows.length - 2)));
  };

  // ── แถวยุบ (EditableLineList) ──
  const lineRow = demoLines[demoLineAt] || null;
  const patchLineRow = (patch) => setDemoLines((rows) => rows.map((row, i) => (i === demoLineAt ? { ...row, ...patch } : row)));
  const addLineRow = () => {
    // ⭐ เหตุผลที่ `addControl` ต้องอยู่ **ในแถวเดียวกับปุ่ม**: ต้องเลือกก่อนถึงจะเพิ่มได้
    if (!demoLinePick) { notifyToast.warning("เลือกประเภทสินค้าก่อน แล้วจึงกดเพิ่ม"); return; }
    setDemoLines((rows) => [...rows, { kind: demoLinePick, scent: "", price: "" }]);
    setDemoLineAt(demoLines.length);   // เพิ่มแล้วต้องได้กรอกต่อทันที
    setDemoLinePick("");
  };

  /* ⚠️ `href` ของ `<ClickableCard>` กับของ `<Link>` ในการ์ด ต้องเป็น **นิพจน์เดียวกันเป๊ะ**
     — ด่าน `CARD_MIRROR` ใน `npm run audit:ui` เทียบ *ข้อความตรงตัว* (ต่างกันแม้ช่องว่าง
     ก็ถือว่าไม่ตรง) ⇒ ยกเป็นตัวแปรเดียวเหมือนที่ `detailHref` ของตาราง DetailRow ทำ
     · ใช้แองเคอร์รายใบด้วยเหตุผลเดียวกับตารางข้างบน (หน้าสาธิตไม่มีปลายทางจริง) */
  const demoCardHref = "#AR-1042";

  /* คิวรออนุมัติ — `onDecide` เป็นของผู้เรียกทั้งหมด (primitive ไม่ยิงเน็ตเอง)
     ⚠️ รับ **ทั้งระเบียน** ไม่ใช่ id เพราะโมดัลยืนยันของหน้าจริงต้องเอ่ยชื่อของที่กำลังอนุมัติ */
  const decideDemoQueue = (record, status) => {
    setDemoQueue((items) => items.filter((item) => item.id !== record.id));
    setDemoQueueLog(`onDecide({ id: "${record.id}", … }, "${status}")`);
    notifyToast.info(`ตัวอย่าง: ${status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"} ${record.code}`);
  };

  return (
    <Workspace
      icon={<Palette size={22} />}
      title="ต้นแบบดีไซน์ระบบ"
      subtitle="primitive กลางของระบบ แยกเป็น 5 กลุ่มตามหน้าที่ — หน้าใหม่ให้หยิบจากที่นี่ ไม่ต้องก๊อปคลาสจากหน้าอื่น"
      toolbar={(
        <Tabs
          ariaLabel="กลุ่มของต้นแบบ"
          value={group}
          onChange={setGroup}
          tabs={GROUPS.map((entry) => ({ key: entry.key, label: entry.label }))}
        />
      )}
    >
      <div className={styles.stack}>
        <StatusNotice
          tone="info"
          action={<Button as="a" href="/settings/design-preview/compare" size="sm">เทียบกับต้นแบบทีละข้อ</Button>}
        >
          <strong>{GROUPS.find((entry) => entry.key === group)?.hint}</strong>
          <br />
          หน้านี้ไม่ต่อกับข้อมูลจริง เปลี่ยนโทเคนใน <code>globals.css</code> หรือแก้ primitive ใน
          {" "}<code>components/ui/</code> แล้วเปิดหน้านี้เพื่อดูผลทั้งระบบพร้อมกัน ทั้งโหมดสว่างและมืด
        </StatusNotice>

        <Section group="shell" active={group}
          title="แถบนำทาง"
          subtitle="components/AppLayout.js — แถบบนสุด 2 ชั้น ตรึงทั้งระบบ ไม่มี sidebar / bottom nav / drawer"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="โครงนำทางมีแบบเดียว">
              <strong>ชั้นบน (พื้นนาวี)</strong> = ตัวตนของระบบ — โลโก้ · ปุ่มสลับระบบ · ปุ่มผู้ใช้/ตั้งค่า ·
              {" "}<strong>ชั้นล่าง</strong> = เมนูของระบบที่เปิดอยู่ ไอคอน + ข้อความ เมนูที่อยู่จะไฮไลต์
              {" "}สีแบรนด์ · จอแคบเลื่อนแนวนอน <strong>ไม่มี drawer</strong> · หน้าตั้งค่าซ่อนชั้นล่างทิ้ง
            </StatusNotice>
            {/* จำลองแบบไม่โต้ตอบ — ของจริงอยู่บนหัวหน้านี้อยู่แล้ว ตรงนี้ไว้ดูโครงกับสถานะ */}
            <div className={styles.pageFrame}>
              <div className={styles.navDemo} aria-hidden="true">
                <div className={styles.navSystem}>
                  <span className={styles.navBrand}>SCENT &amp; SENSE</span>
                  <span className={styles.navSysBtn}>
                    <LayoutGrid size={15} /> บริหารงานขาย <ChevronDown size={14} />
                  </span>
                  {/* spacer ของจริงบน toolbar — ที่นี่มีไว้ให้เห็นว่าสองคู่ปุ่มถูกดันแยกกัน
                  ไม่ใช่เรียงติดกันสี่ปุ่ม */}
              <span className={styles.spacer} />
                  <span className={styles.navGlobal}><Settings size={15} /></span>
                  <span className={styles.navGlobal}><UserRound size={15} /></span>
                </div>
                <div className={styles.navMenu}>
                  <span className={`${styles.navItem} ${styles.navItemActive}`}><Inbox size={16} /> ภาพรวม</span>
                  <span className={styles.navItem}><Users size={16} /> ลีด</span>
                  <span className={styles.navItem}><Search size={16} /> ดีล</span>
                  <span className={styles.navItem}><FileText size={16} /> ใบเสนอราคา</span>
                </div>
              </div>
            </div>
            <p className={styles.note}>
              เมนูมาจาก <code>menuItems</code> ต่อระบบใน <code>AppLayout</code> และกรองด้วยสิทธิ์
              {" "}(<code>canUser</code>) — หน้าใหม่ที่ต้องมีเมนูให้เพิ่มที่นั่นที่เดียว ไม่ใช่ทำลิงก์เองในหน้า
            </p>
          </div>
        </Section>

        <Section group="foundation" active={group} title="พื้นผิว" subtitle="ชั้นพื้นหลังของหน้า การ์ด และแผงลอย">
          <Swatches items={SURFACES} />
          <p className={styles.note}>
            แผงที่ลอยทับเนื้อหา (dropdown / popover / ปฏิทิน) ต้องใช้ <code>--panel-float</code> ที่ทึบ 100%
            เท่านั้น — <code>--panel</code> โปร่ง 8% และต้องมาคู่กับ backdrop-filter
          </p>
        </Section>

        <Section group="foundation" active={group} title="สี" subtitle="ความหมายของแต่ละสี — ห้ามใช้ค่าสีดิบนอก token">
          <Swatches items={COLORS} />
        </Section>

        <Section group="foundation" active={group} title="ตัวอักษร" subtitle="Sarabun — ชั้นพิมพ์เดียวทั้งระบบ">
          <div className={styles.typeSample}>
            <h1>หัวเรื่องหน้า · Page title</h1>
            <h2>หัวข้อส่วน · Section</h2>
            <p>เนื้อความปกติ ใช้กับคำอธิบายและข้อมูลทั่วไปในหน้าจอ</p>
            <p className={styles.note}>ข้อความรอง — คำอธิบายใต้ช่องกรอกและหมายเหตุ</p>
            <p className={styles.mono}>1,234,567.89 · QT-26070128 · ตัวเลขและรหัสใช้ฟอนต์ mono</p>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ปุ่ม"
          subtitle="components/ui/Button.js — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาสปุ่มเอง · เงื่อนไขยังไม่ครบให้ห่อด้วย GatedAction ไม่ใช่ซ่อนปุ่ม"
        >
          <div className={styles.stack}>
            {["filled", "outline", "ghost"].map((variant) => (
              <div key={variant} className={styles.row}>
                <span className={styles.caption}>{variant}</span>
                {BUTTON_TONES.map((tone) => (
                  <Button key={tone} tone={tone} variant={variant}>{tone}</Button>
                ))}
              </div>
            ))}
            <div className={styles.row}>
              <span className={styles.caption}>พื้นฐาน / เล็ก</span>
              <Button>ปุ่มพื้นฐาน</Button>
              <Button size="sm">ขนาดเล็ก</Button>
              <Button tone="accent" icon={<Plus size={14} />}>เพิ่มรายการ</Button>
              <Button iconOnly aria-label="ค้นหา" icon={<Search size={15} />} />
              <Button disabled>ปิดใช้งาน</Button>
            </div>
            <ul className={styles.note}>
              {BUTTON_TONES.map((tone) => (
                <li key={tone}><code>{tone}</code> — {TONE_MEANING[tone]}</li>
              ))}
            </ul>
            <p className={styles.note}>
              <strong>โทนบอก “ความหมาย” ไม่ใช่ “อันดับ” —</strong> <code>accent</code> กับ <code>primary</code>
              {" "}ไม่ได้แข่งกันว่าใครสำคัญกว่า ⇒ ปุ่มยืนยันเป็น <code>primary</code> เสมอ
              {" "}<em>แม้เป็นปุ่มทึบตัวเดียวบนจอนั้น</em> · “จอ” = เปลือกหน้า หรือโมดัล/ลิ้นชักที่เปิดอยู่
              {" "}นับแยกใบ (แถวตารางที่ซ้ำกัน N แถว = N ปุ่ม ไม่ใช่ 1)
              {" "}เจ้าของกฎคือ <code>TONES</code> ใน <code>components/ui/Button.js</code>
            </p>
            <div className={styles.row}>
              <span className={styles.caption}>quiet vs ghost</span>
              <Button variant="quiet">quiet (ข้อความสีปกติ)</Button>
              <Button variant="ghost" tone="danger">ghost (ข้อความตามสี)</Button>
            </div>
            <p className={styles.note}>
              ⚠️ <code>quiet</code> (<code>.btn.ghost</code>) กับ <code>ghost</code> (<code>.btn.action-ghost</code>)
              เกือบซ้ำกัน มีมาก่อนการรวม primitive ทั้งคู่ — ต้องเลือกให้เหลือแบบเดียวแล้วไล่แก้ที่เรียกใช้
            </p>
            <div className={styles.row}>
              <span className={styles.caption}>ปุ่มตามความหมาย</span>
              <ActionBar>
                <ActionButton kind="approve" />
                <ActionButton kind="reject" />
                <ActionButton kind="revise" />
                <ActionButton kind="revoke" />
                <ActionButton kind="delete" />
              </ActionBar>
            </div>
            <p className={styles.note}>
              ปุ่มที่มีความหมายตาม workflow ให้ใช้ <code>ActionButton kind=&quot;…&quot;</code> เสมอ —
              สี ไอคอน และคำเรียกผูกไว้ที่เดียว ส่ง kind ที่ไม่มีจริงจะตกเป็นปุ่มเทาเงียบ ๆ
            </p>

            {/* ── ปุ่มที่ยังกดไม่ได้ (GatedAction) ────────────────────────────────
                อยู่ในส่วน "ปุ่ม" เพราะมันเรนเดอร์ <Button> ตรง ๆ ไม่ใช่ญาติห่าง ๆ —
                กฎของมันคือกฎเรื่องปุ่ม · สองปุ่มข้างล่างตั้งใจให้ **หน้าตาเหมือนกันเป๊ะ
                และอยู่ตำแหน่งเดิม** ต่างกันแค่ตอนกด */}
            <div className={styles.row}>
              <span className={styles.caption}>เงื่อนไขครบ</span>
              <GatedAction
                tone="accent"
                icon={<Plus size={14} />}
                blocker=""
                /* ในหน้าต้นแบบใช้ `onClick` ไม่ใช่ `href` — ถ้าส่ง href มันจะ
                   `router.push` แล้วเด้งออกจากหน้าไปเลยตอนกด */
                onClick={() => setDemoGateLog('onClick() — เงื่อนไขครบ ปุ่มทำงานตามปกติ')}
              >
                สร้างใบสั่งขาย
              </GatedAction>
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>ยังไม่ครบ (กดดู)</span>
              <GatedAction
                tone="accent"
                icon={<Plus size={14} />}
                blocker="ยังไม่มีใบเสนอราคาที่อนุมัติ"
                onClick={() => setDemoGateLog("ไม่มีทางถึงบรรทัดนี้ — blocker ตัดก่อน")}
              >
                สร้างใบสั่งขาย
              </GatedAction>
            </div>
            {demoGateLog ? (
              <p className={`${styles.caption} ${styles.mono}`}>{demoGateLog}</p>
            ) : (
              <p className={styles.caption}>
                กดทั้งสองปุ่มเทียบกัน — ปุ่มบนทำงาน · ปุ่มล่างขึ้น toast แดงบอกเหตุ
                {" "}แล้ว<strong>ยังอยู่ที่เดิม</strong> ไม่หาย ไม่ถูกข้อความแทนที่ ไม่ขยับ
              </p>
            )}
            <StatusNotice tone="info" title="ซ่อนปุ่มเงียบ ๆ = คนถามว่าปุ่มอยู่ไหน">
              <strong>มติผู้ใช้ 2026-08-22</strong> — ก่อนหน้านั้น<strong>หน้าดีลหน้าเดียว</strong>
              {" "}ปฏิบัติกับ &quot;เงื่อนไขยังไม่ครบ&quot; สามแบบพร้อมกัน: คำร้องเอาข้อความมา
              {" "}<em>แทนที่</em>ปุ่ม · ใบเสนอราคา<em>ซ่อน</em>ปุ่มเงียบ ๆ · สัญญา<em>โชว์</em>ปุ่ม
              {" "}แล้วบอกเหตุตอนกด ⇒ เลือกท่าของสัญญาเป็นมาตรฐาน เพราะปุ่มที่หายไปไม่ได้สอน
              {" "}อะไรใคร และข้อความแทนที่ปุ่มทำให้แถบเครื่องมือขยับตำแหน่งไปมาตามสถานะของแถว
              <br />
              ⚠️ <code>blocker</code> ต้องมาจาก<strong>ด่านตัวเดียวกับที่ server ใช้ปฏิเสธจริง</strong>
              {" "}(เช่น <code>quotationDealBlocker</code> ที่อยู่ไฟล์เดียวกับ
              {" "}<code>eligibleQuotationDeals</code>) — ห้ามคิดเงื่อนไขขึ้นเองตรงจุดที่วางปุ่ม
              {" "}ไม่งั้นวันหนึ่งปุ่มกับด่านจะพูดคนละเรื่อง
              <br />
              ⚠️ <strong>ไม่ใช่ตัวแทนของ <code>disabled</code></strong>{" — "}<code>disabled</code> ยังถูก
              {" "}สำหรับ &quot;กำลังบันทึกอยู่&quot; (สถานะชั่วคราวที่ไม่มีเหตุให้อธิบาย ดูปุ่ม
              {" "}<code>ปิดใช้งาน</code> ในแถวบนสุด) · ตัวนี้มีไว้สำหรับเงื่อนไขของ<em>ข้อมูล</em>
              {" "}ซึ่งผู้ใช้แก้ได้และต้องรู้ว่าต้องไปแก้ที่ไหน
            </StatusNotice>
          </div>
        </Section>

        {/* ── ลิงก์ vs ข้อความที่กดได้ vs ปุ่ม (2026-09-02) ─────────────────────────
            เพิ่มเพราะหน้านี้ไม่เคยมีตัวอย่างของสามทรงนี้เลย ทั้งที่มันเป็นชั้นกลางที่
            ใช้กันเยอะที่สุดรองจากปุ่ม — คลาสจึงงอกกันเองแล้วแปลว่าคนละอย่างในแต่ละหน้า */}
        <Section group="controls" active={group}
          title="ลิงก์ · ข้อความที่กดได้ · ปุ่ม"
          subtitle="เลือกจาก “กดแล้วเกิดอะไร” ไม่ใช่จาก “มีที่ว่างแค่ไหน”"
        >
          <div className={styles.stack}>
            <div className={styles.row}>
              <span className={styles.caption}>มี URL ปลายทาง</span>
              <a className="linklike" href="/home">.linklike — เส้นใต้ทึบ + accent-ink</a>
              <a className="linklike mono" href="/home">SO-26090001</a>
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>ทำงานในหน้านี้</span>
              <button type="button" className="text-action">.text-action — เส้นประ + --text-2</button>
              <button type="button" className="text-action" disabled>กดไม่ได้</button>
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>ปุ่มเต็มตัว</span>
              <Button size="sm" variant="ghost">Button — มีพื้นที่ให้เป้าสัมผัส</Button>
            </div>
            <p className={styles.note}>
              <strong>เส้นใต้ทึบ + <code>--accent-ink</code> = “กดแล้วไปที่อื่น”</strong> ⇒
              {" "}ปุ่มที่ทำงานอยู่ในหน้าเดิม <em>ห้าม</em> ใช้ทรงนี้ ·
              {" "}<strong>เส้นประ + <code>--text-2</code> = “เกิดอะไรขึ้นตรงนี้”</strong>
              {" "}(ท่าเดียวกับ <code>.table-metric-button</code>) ·
              {" "}ทั้งเซลล์/ทั้งแถวเป็นเป้าเดียวใช้ <code>.table-row-link</code> (สีสืบทอด ·
              {" "}ทาพื้นตอนชี้) ไม่ใช่ <code>.linklike</code> ไม่งั้นคอลัมน์แรกกลายเป็นทะเลตัวหนังสือสีลิงก์
            </p>
            <p className={styles.note}>
              🐞 ก่อน 2026-09-02 <code>.linklike</code> เป็น <code>color: inherit</code> +
              {" "}เปลี่ยนสีเฉพาะตอน hover ⇒ ลิงก์ 52 จุดดูเหมือนข้อความธรรมดา
              {" "}คนใช้คีย์บอร์ด/จอสัมผัสไม่มีทางรู้ว่ากดได้ (WCAG §1.4.1 · §2.4.7)
              {" "}· <code>.rich-link</code> ยุบรวมเข้า <code>.linklike</code> แล้ว
            </p>
          </div>
        </Section>

        <Section group="data" active={group} title="ป้ายสถานะ" subtitle="StatusBadge · Tag · CountBadge">
          <div className={styles.stack}>
            <div className={styles.row}>
              <span className={styles.caption}>StatusBadge</span>
              {BADGE_TONES.map((tone) => (
                <StatusBadge key={tone} tone={tone} label={tone} dot />
              ))}
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>Tag</span>
              <Tag tone="accent">สหมิตร</Tag>
              <Tag tone="info" onRemove={() => {}}>กรองแล้ว</Tag>
              <CountBadge count={12} tone="warning" />
            </div>

            {/* ⚠️ ตั้งใจโชว์ชื่อเก่าไว้เทียบ — ไม่ใช่ตัวอย่างให้ลอกไปใช้
                **รูปทรงยุบเสร็จแล้วใน #803** ทั้งสามชื่อใช้บล็อกเดียวกับ Badge.module.css
                ที่เหลือคือไล่เปลี่ยน *ชื่อ* ในโค้ดให้เป็น <StatusBadge>
                ตัวเลขต่อแถวถูกเทสต์ตรวจให้ตรงกับของจริงเสมอ (badgeFamilies.test.mjs) */}
            <StatusNotice tone="info" title="รูปทรงยุบเสร็จแล้ว เหลือแค่ชื่อ">
              สามแถวข้างล่างใช้ชื่อคลาสเก่า แต่ตอนนี้ดึงค่าจาก<strong>บล็อกเดียวกับ</strong>
              {" "}<code>StatusBadge</code>/<code>Tag</code> ข้างบนแล้ว — วัดจริงบน production
              {" "}ทั้งสี่ชุดได้สูง 24.9px · padding 3px 10px · 11.5/17.25 · มุมโค้ง 8px เท่ากันหมด
              {" "}และโทนสี (<code>success</code>/<code>warning</code>/<code>danger</code>)
              {" "}ใช้ได้กับทุกชื่อ · ที่เหลือคือไล่เปลี่ยนชื่อในโค้ดเป็น <code>&lt;StatusBadge&gt;</code>
              {" "}ซึ่งต้องทำทีละหน้า (สคริปต์แปลงรวดเดียวทำโทนหายเงียบ ๆ มาแล้ว)
            </StatusNotice>
            {/* ทุกแถวใช้โทนชุดเดียวกัน เพื่อให้เห็นด้วยตาว่า "ชื่อต่างกันแต่ได้ของเหมือนกัน"
                เดิมมีแค่แถว .status-pill ที่ใส่ success ทำให้ดูเหมือนอีกสองชื่อรับโทนไม่ได้ */}
            {BADGE_FAMILIES.map(({ cls, count }) => (
              <div key={cls} className={styles.row}>
                <span className={styles.caption}>.{cls} · {count} จุด</span>
                <span className={cls}>รออนุมัติ</span>
                <span className={`${cls} success`}>อนุมัติแล้ว</span>
                <span className={`${cls} danger`}>ไม่อนุมัติ</span>
              </div>
            ))}

            {/* ── ราง (StepTrack) — ต่อท้ายส่วนป้ายเพราะเป็นของอ่านอย่างเดียวเหมือนกัน
                และคนที่มาหา "จะบอกสถานะยังไง" ต้องเจอทั้งสองตัวในจอเดียว */}
            <StatusNotice tone="info" title="ป้ายตอบว่าตอนนี้อยู่ไหน · รางตอบว่าค้างที่ใคร">
              คนเปิดหน้ารายการถามว่า <b>&quot;ใบไหนค้างที่ใคร&quot;</b> ซึ่งเป็นคำถามเรื่อง<b>ลำดับขั้น</b>
              {" "}— ป้ายสถานะเดียวบอกได้แค่จุดปัจจุบัน แต่ไม่บอกว่าผ่านอะไรมาแล้วและเหลืออะไรอีก
              {" "}⇒ ใช้ <code>StepTrack</code> ในคอลัมน์ของตาราง แล้วป้ายจะเหลือหน้าที่เดิมของมัน
              <br />
              จำนวนขั้น<b>ไม่ตายตัว</b> — ใบสั่งขายเดินสามขั้น คำร้องเดินห้าขั้น · คอมโพเนนต์ไม่รู้จัก
              {" "}ขั้นไหนเลย มันวาดตามที่ส่งมา
            </StatusNotice>

            <div className={styles.stack}>
              <span className={styles.caption}>ราง 3 ขั้นของใบสั่งขาย (ของจริง)</span>
              <div className={styles.trackBox}>
                <StepTrack steps={DEMO_SO_TRACK} ariaLabel="ตัวอย่างรางของใบสั่งขาย" />
              </div>

              <span className={styles.caption}>ห้าสถานะของหมุด วางเทียบกัน</span>
              <div className={styles.trackBox}>
                <StepTrack steps={DEMO_TRACK_STATES} ariaLabel="ตัวอย่างสถานะของหมุด" />
              </div>

              <span className={styles.caption}>โหมด compact — เหลือแต่จุด ชื่อขั้นย้ายไป tooltip</span>
              <div className={styles.trackBox}>
                <StepTrack steps={DEMO_TRACK_STATES} compact ariaLabel="ตัวอย่างรางโหมดย่อ" />
              </div>
            </div>

            <p className={styles.note}>
              <b><code>skip</code> เป็นวงกลมกลวง</b> = ขั้นที่<b>ใบนี้ไม่มี</b> (ใบยอด 0 ไม่มีขั้นเก็บเงิน —
              {" "}มติผู้ใช้ 2026-08-18) คนละเรื่องกับ <code>todo</code> (ยังไม่ถึงคิว) และ <code>done</code>
              {" "}(ผ่านมาแล้ว) · เป็นรูปเดียวที่ยังไม่ถูกใช้ ⇒ อ่านออกจาก<b>รูป</b>ก่อนอ่านจาก<b>สี</b>
              {" "}· เส้นที่นำไปสู่ขั้นที่ข้ามเป็น<b>เส้นประ</b> ไม่ใช่เขียว เพราะช่วงนั้นไม่ได้เดินผ่าน มันไม่มีอยู่
              <br />
              🐞 โหมด <code>compact</code> เกิดเพราะรางห้าขั้นพร้อมป้ายคำกินคอลัมน์ 320px ในตารางคิวคำร้อง
              {" "}= 27% ของทั้งตาราง จนตารางล้นกรอบบนจอ 1440 (มติผู้ใช้ 2026-08-23) ·{" "}
              <b>ชื่อขั้นต้องไปอยู่ใน tooltip ไม่ใช่หายไปเฉย ๆ</b> — ตำแหน่งจุดบอกได้ว่าเดินถึงไหน
              {" "}แต่บอกไม่ได้ว่าขั้นนั้นชื่ออะไร (ป้ายยังอยู่ใน DOM เสมอ ซ่อนด้วย CSS เพื่อให้
              {" "}โปรแกรมอ่านหน้าจอยังอ่านได้)
            </p>

            <StatusNotice tone="warning" title="ตรรกะไม่ได้อยู่ใน StepTrack และมันไม่ใช่ workflowSteps ของการ์ดเอกสาร">
              <b>1) คอมโพเนนต์นี้วาดอย่างเดียว</b> — การตัดสินว่าขั้นไหนเป็น <code>done</code> ·{" "}
              <code>now</code> · <code>bad</code> · <code>skip</code> อยู่ที่{" "}
              <code>lib/sales/salesOrderListTrack.js</code> (ใบสั่งขาย)
              {" "}และ <code>lib/requests/queueTrack.js</code> (คำร้อง) ซึ่งมีเทสต์ของตัวเอง · แยกไว้เพราะ
              {" "}เทสต์ node อิมพอร์ต JSX ไม่ได้ และมีที่เรียกที่อ่านผลชุดเดียวกันโดยไม่วาดราง (ป้ายสรุปบนจอแคบ)
              {" "}⇒ <b>หน้ารายการใหม่เขียนตัวตัดสินของตัวเองใน lib แล้วส่ง steps มา</b> ไม่ใช่ยัดเงื่อนไขในจอ
              <br />
              <b>2) คนละตัวกับ <code>DocumentControlCard workflowSteps</code></b> (กลุ่ม &quot;โครงหน้า&quot;) —
              {" "}รางนี้เป็น<b>แถวเดียวในคอลัมน์ของตาราง</b> ตอบคำถามของคนที่กวาดสายตาหลายสิบใบ ·
              {" "}ส่วนอันนั้นเป็น<b>ขั้นในการ์ดจัดการเอกสารของใบเดียว</b> ที่วางคู่กับปุ่มลงมือ ⇒ ใบเดียวกัน
              {" "}เห็นได้ทั้งสองที่ ไม่ได้แปลว่าซ้ำซ้อน
              <br />
              🐞 และเป็นเหตุผลที่รางถูกยกออกมาเป็นคอมโพเนนต์<b>ตั้งแต่ที่ใช้ที่สอง ไม่รอที่สาม</b> — ทางที่ง่ายกว่า
              {" "}ตอนนั้นคือก๊อป CSS ไปอีกไฟล์ ซึ่งคือจุดเริ่มของ &quot;สองอันที่เพี้ยนหากัน&quot;
            </StatusNotice>
          </div>
        </Section>

        <Section group="controls" active={group} title="ตัวควบคุมบนแถบเครื่องมือ" subtitle="Tabs · Segmented · SortControl · FilterPopover · MultiSelectFilter · ViewSwitcher · ViewMenus — ทุกตัวสูงเท่ากันที่ --ctl-h">
          <div className={styles.stack}>
            <Tabs
              tabs={[
                { key: "overview", label: "ภาพรวม" },
                { key: "detail", label: "รายละเอียด" },
                { key: "history", label: "ประวัติ" },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className={styles.row}>
              <Segmented
                options={[{ value: "list", label: "รายการ" }, { value: "grid", label: "ตาราง" }]}
                value={view}
                onChange={setView}
                ariaLabel="มุมมอง"
              />
              <SortControl
                options={[{ value: "date", label: "วันที่" }, { value: "amount", label: "มูลค่า" }]}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                direction={direction}
                onDirectionChange={setDirection}
              />
              <FilterPopover
                count={filters.length}
                onClear={() => setFilters([])}
                groups={[{
                  key: "status",
                  label: "สถานะ",
                  options: [
                    { value: "draft", label: "ฉบับร่าง" },
                    { value: "pending", label: "รออนุมัติ" },
                    { value: "approved", label: "อนุมัติแล้ว" },
                  ],
                  selected: filters,
                  onChange: setFilters,
                }]}
              />
              {/* ตัวกรองมิติเดียว — ใช้เมื่อมีมิติเดียวจริง ๆ ถ้ามีตั้งแต่ 2 มิติขึ้นไป
                  ต้องยุบเป็น FilterPopover ปุ่มเดียว (มติ 2026-07-18) */}
              <MultiSelectFilter
                label="ทีม"
                icon={Users}
                options={[
                  { value: "a", label: "ทีม A" },
                  { value: "b", label: "ทีม B" },
                  { value: "c", label: "ทีม C" },
                ]}
                selected={teamFilter}
                onChange={setTeamFilter}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>
                ป้ายจำนวน — ส่ง <code>count</code> เป็นตัวเลข ห้ามต่อ &quot;(6)&quot; ท้ายป้ายชื่อ
                (เลขในสตริงทำให้ปุ่มกว้างไม่เท่ากันแล้วแถบขยับตอนจำนวนเปลี่ยน)
              </span>
              <Segmented
                ariaLabel="ตัวอย่างป้ายจำนวน"
                value={queueTab}
                onChange={setQueueTab}
                options={[
                  { value: "todo", label: "รอฉันตอบ", count: 6 },
                  { value: "mine", label: "ที่ฉันเปิด", count: 5 },
                  { value: "history", label: "ประวัติ", count: 128 },
                ]}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.caption}>ViewSwitcher — Segmented ที่ผูกไอคอน/ป้ายของแต่ละมุมมองไว้แล้ว</span>
              <ViewSwitcher
                value={viewMode}
                onChange={setViewMode}
                modes={["list", "table", "board", "calendar"]}
              />
              <ViewSwitcher
                value={viewMode}
                onChange={setViewMode}
                modes={["list", "table", "board", "calendar"]}
                showLabels
                ariaLabel="มุมมองพร้อมป้าย"
              />
            </div>

            <StatusNotice tone="warning" title="ปุ่มเรียงมีสองทรง — ทรงที่หน้าจริงใช้คือ ViewMenus">
              แถวบนโชว์ <code>SortControl</code> (ป้ายอยู่<b>นอก</b>ปุ่ม) ซึ่งเป็น<b>ทรงเก่า</b> ·
              {" "}ส่วน <code>ViewMenus.SortMenu</code> ข้างล่าง (ชื่อ+ไอคอนอยู่<b>ใน</b>ปุ่ม ทรงเดียวกับ
              {" "}ปุ่มตัวกรองข้าง ๆ) คือทรงที่ <b>7 หน้าใช้จริงวันนี้</b> — หน้าใหม่หยิบตัวล่าง
              {" "}เดิมแต่ละหน้าประกอบปุ่มพวกนี้เองทีละชิ้น ⇒ ไอคอน ป้าย และ tooltip ค่อย ๆ เพี้ยนกันไปทีละหน้า
              {" "}จนต้องยกมารวมไฟล์เดียว 2026-08-15 ตอนกระจายไป 5 ตาราง
            </StatusNotice>

            <StatusNotice tone="info" title="ลำดับบน toolbar ที่ยึดกันทั้งเว็บ">
              ค้นหา · ตัวกรอง · [จัดกลุ่ม + ย่อ/ขยาย] · <i>spacer</i> · [เรียง + ทิศทาง]
              {" "}— ปุ่มย่อ/ขยายเกาะไปกับปุ่มจัดกลุ่ม และปุ่มทิศทางเกาะไปกับปุ่มเรียงเสมอ
              {" "}(ยกมาจากหัว <code>components/ui/ViewMenus.js</code> ซึ่งเป็นเจ้าของกฎ)
            </StatusNotice>

            <div className={styles.row}>
              <span className={styles.caption}>ViewMenus — จัดกลุ่ม · ย่อ/ขยาย · เรียง · ทิศทาง</span>
              <GroupMenu
                value={demoGroupBy}
                onChange={setDemoGroupBy}
                options={[
                  { value: "none", label: "ไม่จัดกลุ่ม" },
                  { value: "customer", label: "ลูกค้า" },
                  { value: "owner", label: "ผู้รับผิดชอบ" },
                ]}
              />
              {/* ปุ่มย่อ/ขยายโผล่เฉพาะตอนจัดกลุ่มอยู่จริง — ไม่มีกลุ่มก็ไม่มีอะไรให้ย่อ */}
              {demoGroupBy !== "none" ? (
                <CollapseAllButton collapsed={demoCollapsed} onToggle={() => setDemoCollapsed((value) => !value)} />
              ) : null}
              <span className={styles.navSpacer} />
              <SortMenu
                value={demoSortKey}
                onChange={setDemoSortKey}
                defaultValue="date"
                options={[
                  { value: "date", label: "วันที่" },
                  { value: "amount", label: "มูลค่า" },
                  { value: "customer", label: "ลูกค้า" },
                ]}
              />
              <SortDirButton
                dir={demoSortDir}
                onToggle={() => setDemoSortDir((value) => (value === "desc" ? "asc" : "desc"))}
              />
            </div>

            <p className={styles.note}>
              <b><code>isActive</code></b> = ค่าที่<b>ไม่ใช่ค่าตั้งต้นของหน้านั้น</b> ⇒ ปุ่มติดสี accent
              {" "}พร้อมชิปบอกค่า (แบบเดียวกับ badge จำนวนของปุ่มตัวกรอง) — ลองเปลี่ยนจัดกลุ่มเป็น
              {" "}&quot;ลูกค้า&quot; แล้วดูปุ่มซ้าย · <b><code>showValue</code></b> ของปุ่มเรียงโชว์ชิป
              {" "}<b>เสมอ</b> แม้เป็นค่าตั้งต้น เพราะ &quot;เรียง&quot; ไม่มีสถานะ &quot;ปิด&quot; ให้ซ่อนชิปได้
              {" "}ตารางถูกเรียงอยู่ตลอดเวลา
              <br />
              ป้ายของปุ่มย่อ/ขยายบอก <b>สิ่งที่จะเกิดเมื่อกด</b> (&quot;ย่อทุกกลุ่ม&quot;) ไม่ใช่สถานะปัจจุบัน
              {" "}— ปุ่มที่ป้ายบอกสถานะทำให้คนกดแล้วได้ตรงข้ามกับที่อ่าน
            </p>

            <div className={styles.row}>
              <span className={styles.caption}>MenuSelect — ฐานของสองปุ่มข้างบน (ใช้ตรง ๆ ได้เมื่อไม่ใช่ จัดกลุ่ม/เรียง)</span>
              <MenuSelect
                icon={LayoutGrid}
                label="ความหนาแน่น"
                value={demoDensity}
                onChange={setDemoDensity}
                options={[
                  { value: "comfortable", label: "ปกติ" },
                  { value: "compact", label: "แน่น" },
                ]}
                isActive={(value) => value !== "comfortable"}
              />
            </div>

            <p className={styles.note}>
              ท่าเดียวกับ SearchableSelect → PersonSelect: <code>MenuSelect</code> เป็นฐาน ·{" "}
              <code>GroupMenu</code>/<code>SortMenu</code> คือตัวห่อที่ตรึงไอคอน ป้าย และกติกา
              {" "}<code>isActive</code> ของสองงานนั้นไว้แล้ว ⇒ <b>อย่าเรียก MenuSelect ตรง ๆ เพื่อทำปุ่ม
              {" "}จัดกลุ่ม/เรียงอีกชุด</b> · เมนูเปิดผ่าน portal + <code>position: fixed</code> เหมือน
              {" "}ปุ่มตัวกรอง วางเป็น absolute ในการ์ดจะโดน <code>overflow</code> ตัดทิ้ง
            </p>

            {/* ค่าที่เก็บจริงของแถบเครื่องมือ — ไม่ตรงกับที่เห็นบนปุ่มเมื่อไร แปลว่าเพี้ยน */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`group="${demoGroupBy}" · collapsed=${demoCollapsed} · sort="${demoSortKey}" · dir="${demoSortDir}" · density="${demoDensity}"`}
            </p>
          </div>
        </Section>

        <Section group="controls" active={group} title="ฟอร์ม" subtitle="ช่องกรอกทุกช่องมาจาก <Input> ตัวเดียว — ไม่ต้องเขียนคลาสเอง · ดรอปดาวน์ใช้ Select · หลายบรรทัดใช้ Textarea · ค่าที่ระบบประกอบให้ (รหัส) ไม่ใช่ช่องกรอก ใช้ CodeStrip">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              ช่องข้อความ
              <Input defaultValue="บริษัท สหมิตร โปรดักส์ จำกัด" />
            </label>
            <label className={styles.field}>
              ดรอปดาวน์
              <Select value={docType} onChange={(event) => setDocType(event.target.value)}>
                <option value="qt">ใบเสนอราคา</option>
                <option value="so">ใบสั่งขาย</option>
              </Select>
            </label>
            <label className={styles.field}>
              ช่องที่ผิดพลาด
              <Input invalid defaultValue="" placeholder="ต้องกรอกช่องนี้" />
            </label>
            <label className={styles.field}>
              ช่องที่ล็อก
              <Input defaultValue="QT-26070128" readOnly disabled />
            </label>
            <label className={styles.field}>
              ตัวเลข/รหัสเอกสาร (mono)
              <Input mono defaultValue="QT-26070128" />
            </label>
            <label className={styles.field}>
              พิมพ์เองได้ + มีรายการแนะนำ (combo)
              <Input combo list="design-preview-combo" defaultValue="" placeholder="พิมพ์ชื่อบริษัท" />
              <datalist id="design-preview-combo">
                <option value="บริษัท สหมิตร โปรดักส์ จำกัด" />
                <option value="บริษัท เซนต์ แอนด์ เซนส์ จำกัด" />
              </datalist>
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              ช่องหลายบรรทัด (พื้นขั้นต่ำ 3 บรรทัด)
              <Textarea defaultValue="" placeholder="รายละเอียดเพิ่มเติม" />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              ช่องหลายบรรทัดที่ขอพื้นมากกว่า <code>{"rows={6}"}</code>
              <Textarea rows={6} defaultValue="" placeholder="พิมพ์ต่อไปเรื่อย ๆ — กล่องโตตามเนื้อหาจนถึงเพดาน แล้วค่อยเลื่อนในกล่อง" />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              กล่องวางข้อมูลดิบ <code>variant=&quot;data&quot;</code>
              <Textarea
                variant="data"
                defaultValue={'{ "poNumber": "PO-26070128", "lines": 3 }'}
                readOnly
              />
            </label>
          </div>
          <StatusNotice tone="info" title="ช่องหลายบรรทัดมีทรงเดียว ต่างกันแค่ฟอนต์">
            ขนาดของทั้งสองแบบมาจากกติกาชุดเดียวกัน: <b>พื้นขั้นต่ำ 3 บรรทัด</b> ·{" "}
            <code>rows</code> ขอพื้นมากกว่านั้นได้แต่ขอให้เตี้ยกว่าไม่ได้ ·{" "}
            <b>โตตามที่พิมพ์</b>จนถึงเพดาน 40vh · <b>ลากขยายเองได้</b> ทั้งคู่
            <br />
            เลือก <code>variant=&quot;data&quot;</code> เมื่อเนื้อในเป็น <b>ข้อมูลดิบ</b>
            (JSON/ล็อก) ที่ต้องการฟอนต์ mono เท่านั้น — <b>ไม่ใช่เพราะอยากได้กล่องใหญ่กว่า</b>
            ซึ่งเป็นเหตุผลที่ทำให้ข้อความไทย 21 จุดไปอยู่ในฟอนต์ mono มาก่อน (แก้แล้ว 2026-08-12)
          </StatusNotice>
          <StatusNotice tone="info" title="อย่าเติม w-full / text-xs / h-[32px] ที่ปลายทาง">
            <code>.premium-input</code> ตั้งความกว้าง 100% ความสูง <code>--ctl-h</code> และขนาด
            ตัวอักษรไว้แล้ว — ที่ผ่านมามี 50 จุดเติม <code>w-full</code> ซ้ำ และบางจุดเขียน
            <code>h-[30px]</code> ทับความสูงมาตรฐาน ทำให้ช่องกรอกในฟอร์มเดียวกันสูงไม่เท่ากัน
          </StatusNotice>

          {/* ── ค่าที่ระบบประกอบให้ ไม่ใช่ช่องที่คนกรอก (CodeStrip) ─────────────
              ปิดท้ายส่วนฟอร์มเพราะมันอยู่ *ในฟอร์ม* แต่ไม่ใช่ช่องกรอก — เป็นผลลัพธ์
              ของช่องอื่นที่ต้องเห็นก่อนกดบันทึก */}
          <div className={styles.stack}>
            <span className={styles.caption}>
              ค่าที่ระบบประกอบให้ ไม่ใช่ช่องที่คนกรอก — <code>ui/CodeStrip</code>
            </span>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                หมวดสินค้า (คำตอบที่ทำให้รหัสเปลี่ยน)
                <Select
                  value={demoCodeCategory}
                  onChange={(event) => setDemoCodeCategory(event.target.value)}
                >
                  <option value="">— ยังไม่เลือกหมวด —</option>
                  <option value="01-001">01-001 · ก้านไม้หอม</option>
                  <option value="02-014">02-014 · น้ำหอม</option>
                </Select>
              </label>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.caption}>รหัสสินค้า (FG) ที่ระบบจะออกให้</span>
                <CodeStrip parts={demoFgParts(demoCodeCategory)} ariaLabel="รหัสสินค้าที่ระบบจะออกให้" />
              </div>
            </div>
            {/* ค่าที่แถบประกอบได้จริง — ถ้าแถวนี้ไม่ตรงกับที่เห็นบนแถบ แปลว่าเพี้ยนแล้ว */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`category="${demoCodeCategory}" · ${demoFgParts(demoCodeCategory).map((part) => part.value || part.placeholder).join("-")}`}
            </p>
            <StatusNotice tone="info" title="จำนวนท่อนคงที่เสมอ — ท่อนที่ยังตอบไม่ครบเป็นช่องว่าง ไม่ใช่หายไป">
              <strong>มติผู้ใช้ 2026-08-12 (&quot;แบบ A&quot; จากม็อกสามทาง)</strong> — รหัสที่ระบบ
              {" "}ออกให้ต้องเห็นตั้งแต่ก่อนกดบันทึกว่าจะได้เลขอะไร และ<strong>แต่ละท่อนมาจาก
              {" "}คำตอบไหน</strong> · รหัส FG ประกอบจากสามคำตอบคนละที่ (ลูกค้า · หมวด · เลขรัน)
              {" "}ถ้าโชว์เป็นข้อความก้อนเดียว คนกรอกจะไม่รู้ว่าจะแก้ท่อนที่ผิดได้ที่ช่องไหน
              <br />
              สลับหมวดดู: ท่อน <code>หมวดหลัก</code>/<code>หมวดรอง</code> เปลี่ยนตาม ส่วนท่อน
              {" "}<code>เลขถัดไป</code> จางค้างไว้เพราะของจริง<strong>จองตอนกดบันทึก</strong> —
              {" "}นั่นคือเหตุผลที่ท่อนที่ยังว่างต้องเป็น placeholder ไม่ใช่ซ่อนทิ้ง
              <br />
              โทนบอกที่มาของท่อน: <code>fixed</code> = คงที่ตลอด (สีจาง) ·
              {" "}<code>from</code> = มาจากคำตอบในฟอร์ม · <code>new</code> = เลขที่ระบบเพิ่งออกให้
              {" "}(สีเน้น — ท่อนเดียวในรหัสที่ยังไม่มีใครเคยเห็นมาก่อน)
              <br />
              เส้นประของกรอบเป็นภาษาเดียวกับ <code>.deal-derived</code> คือ &quot;ค่าที่ระบบเติมให้
              {" "}ไม่ใช่ช่องที่แก้ได้&quot; — ท่อนของจริงมาจาก <code>fgCodeParts</code>/<code>arCodeParts</code>
              {" "}ใน <code>lib/master/masterCodes.js</code> ที่เดียว ห้ามประกอบสตริงเองที่หน้าเรียก
            </StatusNotice>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ตัวเลือกที่ไม่ใช่ดรอปดาวน์"
          subtitle="OptionTiles · ChoiceChips · StageSteps — เลือกทรงจากจำนวนตัวเลือก ไม่ใช่จากที่ว่างบนฟอร์ม"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="ชุดเล็กตายตัวต้องกางให้เห็น ไม่ใช่ซ่อนในดรอปดาวน์">
              มติผู้ใช้ 2026-08-08: <b>&quot;ไม่จำเป็นต้องใช้ dropdown ทุกอย่าง รู้ว่ามันง่าย
              แต่อยากให้ผู้ใช้ใช้ง่ายกว่า&quot;</b> — dropdown ซ่อนจำนวนตัวเลือกไว้จนกว่าจะกด
              {" "}· ตารางเต็มของ &quot;ข้อมูลแบบไหนใช้คอนโทรลอะไร&quot; อยู่ที่{" "}
              <code>docs/form-design-rules.md</code> §3
              <br />
              ตายตัว 2–4 = <code>OptionTiles</code> · ลำดับขั้น 4–8 = <code>StageSteps</code> ·
              {" "}ไดนามิกสั้น ≤6 = <code>ChoiceChips</code> · ยาวกว่านั้น/ชื่อยาว/คนเยอะ ={" "}
              <code>SearchableSelect</code> (ดูส่วน &quot;ดรอปดาวน์ที่ค้นหาได้&quot;)
              <br />
              ⚠️ <b>เกิน 6 ตัวเมื่อไร ผู้เรียกต้องถอยไปดรอปดาวน์เอง</b> — ชิปไม่ได้ถอยให้
              {" "}และ <b>AE ไม่ใช้ชิป</b> (ชื่อยาว คนเยอะ — มติเดียวกัน)
            </StatusNotice>

            {/* ใช้ div + span ไม่ใช่ <label> — ตัวเลือกพวกนี้เป็น <button> ทั้งชุด ซึ่งไม่ใช่
                labelable element (เหตุผลเดียวกับส่วน "ดรอปดาวน์ที่ค้นหาได้") */}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.caption}>ประเภทดีล — ตายตัว มีบรรทัดรอง + สีประจำประเภท</span>
                <OptionTiles
                  ariaLabel="ประเภทดีล"
                  value={demoDealType}
                  onChange={setDemoDealType}
                  options={DEMO_DEAL_TYPES}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>แบรนด์ของลูกค้า — ไดนามิก มัก 1–3 ตัว ไม่มีบรรทัดรอง</span>
                <ChoiceChips
                  ariaLabel="แบรนด์ของลูกค้า"
                  value={demoBrand}
                  onChange={setDemoBrand}
                  options={DEMO_BRANDS}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.caption}>สถานะดีล — ตัวเลือกที่เป็น &quot;ลำดับ&quot; บรรทัดรองคือผลของการเลือก</span>
                <StageSteps
                  ariaLabel="สถานะดีล"
                  value={demoStage}
                  onChange={setDemoStage}
                  steps={DEMO_DEAL_STAGES}
                />
              </div>
            </div>

            <p className={styles.note}>
              แผ่น <b>RE-ORDER</b> ปิดไว้โดยเจตนา — <b>ป้ายของตัวเลือกที่กดไม่ได้ต้องบอกเหตุผลในตัวเอง</b>
              {" "}เพราะแผ่นเลือกกับดรอปดาวน์ไม่มีที่ให้ tooltip (ต่างจากปุ่มที่มี <code>disabledReason</code>)
              {" "}· ชิป <b>&quot;ยังไม่ระบุ&quot;</b> เป็นเส้นประ (<code>ghost</code>) เพราะเป็นคำตอบที่ถูกต้อง
              {" "}ไม่ใช่ช่องที่ยังไม่ได้กรอก · <code>sub</code> ใต้ขั้นดีลคือ FC% ของขั้นนั้น ซึ่งเป็นเหตุผล
              {" "}ที่ช่อง FC แยกถูกยุบทิ้งได้ทั้งช่อง
            </p>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.caption}>OptionTiles multiple — &quot;คนนี้อยู่ทีมไหนบ้าง&quot; (หน้าตั้งค่าผู้ใช้)</span>
                <OptionTiles
                  multiple
                  ariaLabel="ทีมที่สังกัด"
                  value={demoMyTeams}
                  onChange={setDemoMyTeams}
                  options={DEMO_TEAM_TILES}
                />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>ChoiceChips multiple — ตัวกรองสถานะ (ลองปิดจนเหลือตัวเดียว)</span>
                <ChoiceChips
                  multiple
                  ariaLabel="กรองสถานะ"
                  value={demoChipFilter}
                  onChange={setDemoChipFilter}
                  options={DEMO_CHIP_FILTER}
                />
              </div>
            </div>

            <p className={styles.note}>
              โหมด multiple ของทั้งสองตัว <b>คืนค่าเรียงตาม <code>options</code> เสมอ ไม่ใช่ตามลำดับที่กด</b>
              {" "}— ป้ายบนหน้าจอจะได้ไม่สลับที่ · ปิดชิปจนเหลือตัวเดียวแล้วจะเห็นว่า
              {" "}<b>ตัวสุดท้ายขึ้นเป็นปุ่มที่กดไม่ลง</b> (<code>minSelected</code> ตั้งต้น 1) ไม่ใช่ปล่อยให้
              {" "}เลือกครบศูนย์ เพราะตัวกรองที่ว่างเปล่าทำให้ลิสต์อ่านเหมือน &quot;ไม่มีข้อมูล&quot; ซึ่งไม่จริง
            </p>

            <StatusNotice tone="info" title="ตัวห่อสำเร็จรูป — ฐานเดิม แต่ผูกทะเบียนกลางไว้แล้ว">
              <code>BusinessLineSelect</code> = OptionTiles + <code>BUSINESS_LINES</code> ·{" "}
              <code>TeamPickerField</code> กับ <code>MyTeamsFilter</code> = ChoiceChips +{" "}
              <code>TEAM_LABELS</code> — ฟอร์มใหม่<b>หยิบตัวห่อ ไม่ใช่ประกอบตัวเลือกเอง</b> เพราะทุกฟอร์ม
              {" "}เขียนลงคอลัมน์เดียวกัน ปล่อยให้ต่างคนต่างวาดเมื่อไรมันเพี้ยนหากันเสมอ (กฎเดียวกับ
              {" "}ฟอร์มสร้าง/แก้ใน <code>AGENTS.md</code>)
            </StatusNotice>

            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.caption}>BusinessLineSelect — สายธุรกิจของโครงการ (ยังไม่กด = ยังไม่ระบุ)</span>
                <BusinessLineSelect value={demoLine} onChange={setDemoLine} />
              </div>
              {/* ส่ง className ทับค่าตั้งต้น `form-group col-span-2` — คอลัมน์ของหน้านี้ไม่ใช่
                  กริดฟอร์มของหน้าจริง การกินสองคอลัมน์ที่นี่ไม่ได้แปลว่าอะไร */}
              <TeamPickerField
                className="form-group"
                teams={DEMO_TEAMS}
                value={demoOwnerTeam}
                onChange={setDemoOwnerTeam}
              />
              <div className={styles.field}>
                <span className={styles.caption}>MyTeamsFilter — ตัวกรอง &quot;แสดงทีมไหนบ้าง&quot; ข้างตัวสลับขอบเขต</span>
                <MyTeamsFilter teams={DEMO_TEAMS} selected={demoShownTeams} onChange={setDemoShownTeams} />
              </div>
            </div>

            <p className={styles.note}>
              ⚠️ <b>ทั้ง TeamPickerField และ MyTeamsFilter คืน <code>null</code> เมื่อ{" "}
              <code>teams.length &lt; 2</code></b> — คนอยู่ทีมเดียว (ซึ่งคือคนส่วนใหญ่ของระบบ) ไม่เห็น
              {" "}ช่องนี้เลย เพราะทีมนั้นคือคำตอบเดียวอยู่แล้ว ⇒ ที่ไหนก็ตามที่สาธิตหรือทดสอบ
              {" "}<b>ต้องส่งอย่างน้อย 2 ทีมเสมอ</b> ไม่งั้นจอว่างแล้วคนถัดไปจะสรุปว่าคอมโพเนนต์พัง
              <br />
              สองตัวนี้ถามคนละคำถามแม้จะเป็นชิปเหมือนกัน: <b>TeamPickerField = &quot;งานใบนี้เข้าทีมไหน&quot;</b>
              {" "}(ค่าที่บันทึกลงใบ · ด่านจริงอยู่ที่ <code>attributionTeam()</code> ฝั่ง server) ·{" "}
              <b>MyTeamsFilter = &quot;ตอนนี้อยากเห็นทีมไหน&quot;</b> (มุมมองของคนเปิดจอ ไม่แตะข้อมูล)
            </p>

            <StatusNotice tone="warning" title="หน้าจริงห้ามถือ state ของ MyTeamsFilter เอง">
              หน้านี้ส่ง <code>teams</code> เขียนมือ + <code>useState</code> เพราะหน้าต้นแบบห้ามอ่านบริบท
              ของผู้ใช้จริง — แต่<b>หน้า feature ต้องใช้ <code>useMyTeamsFilter()</code></b> ซึ่งอ่านทีมจริงจาก{" "}
              <code>useTeams()</code> แล้วจำค่าไว้ใน <code>sessionStorage</code> คีย์{" "}
              <code>ss.myTeamsFilter</code> ที่<b>ใช้ร่วมกันทุกหน้า</b> ⇒ ถ้าหน้านี้เรียก hook นั้น
              {" "}การกดเล่นบนหน้าต้นแบบจะไปแก้ตัวกรองของหน้าดีล/ลีด/คำร้องของคนที่เปิดดูจริง ๆ
              {" "}(ท่าเดียวกับแถบนำทางในกลุ่ม &quot;โครงหน้า&quot; ที่จำลองไว้แล้วเขียนกฎกำกับ)
            </StatusNotice>

            {/* ค่าที่เก็บจริง — ถ้าแถวนี้ไม่ตรงกับที่เห็นบนแผ่น/ชิป แปลว่าเพี้ยนแล้ว */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`dealType="${demoDealType}" · brand="${demoBrand}" · stage="${demoStage}" · line="${demoLine}"`}
              <br />
              {`myTeams=${JSON.stringify(demoMyTeams)} · filter=${JSON.stringify(demoChipFilter)} · ownerTeam="${demoOwnerTeam}" · shownTeams=${JSON.stringify(demoShownTeams)}`}
            </p>
          </div>
        </Section>

        {/* ── โครงของฟอร์มยาว ───────────────────────────────────────────────
            สามตัวนี้ตอบ **คำถามเดียวกัน**: "ฟอร์มยาวเกินหนึ่งจอแล้ว ทำยังไง" ⇒ ต้องวาง
            ข้างกัน · คอมเมนต์ในไฟล์ของแต่ละตัวเขียนกฎของตัวเองไว้ครบ แต่อ่านทีละไฟล์
            แล้วเทียบกันไม่ได้ ⇒ คนเลือกจากตัวที่บังเอิญเจอก่อน ซึ่งเป็นที่มาของ
            "หัวข้อคำร้องสองหัวข้อมีผังคนละแบบในแท็บชื่อเดียวกัน" ที่ต้องมาไล่แก้ทีหลัง */}
        <Section group="controls" active={group}
          title="โครงของฟอร์มยาว"
          subtitle="FormZone คั่นโซน · SectionRail ราง 2 ชั้น · EditableLineList แถวยุบ — เลือกจาก “ของในฟอร์มมาจากไหน” ไม่ใช่จาก “ยาวแค่ไหน”"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="เลือกสามทางจากรูปร่างของเนื้อหา ไม่ใช่จากความยาว">
              <b>1) ยังเป็นสายเดียว แค่ขาดจังหวะ → <code>FormZone</code></b> — ช่องทั้งหมดรู้ล่วงหน้า
              และไหลต่อกันได้ ไม่มีอะไรให้สลับ · แค่คั่นว่า &quot;กำลังกรอกเรื่องอะไรอยู่&quot;
              <br />
              <b>2) เนื้อยาวเกินจะโชว์พร้อมกัน → <code>SectionRail</code></b> — รายชื่อส่วนอยู่ซ้าย
              เนื้อของส่วนที่เลือกอยู่ขวา · ใช้ได้ทั้ง<b>ชุดตายตัว</b> (5 ส่วนของ PDR) และ
              {" "}<b>ของที่ผู้ใช้สร้างเอง 0..N</b> (ขอเอกสาร · พัฒนาผลิตภัณฑ์)
              <br />
              <b>3) แถวที่กรอกเสร็จยุบเหลือบรรทัดสรุป → <code>EditableLineList</code></b> — เห็นของ
              ทั้งชุดพร้อมกันและแถวสรุปกินเต็มความกว้าง จึงใส่รายละเอียดได้เยอะกว่าราง 13rem
              <br />
              ⚠️ <b>ข้อ 2 กับ 3 เคยสลับกัน</b> — มติ 2026-08-09 ให้ &quot;ของที่ผู้ใช้สร้างเอง&quot; ใช้แถวยุบ
              แล้ว<b>ถูกทับด้วยมติ 2026-08-24/25</b> ให้ย้ายไปเป็นราง เพราะแท็บ &quot;รายละเอียด&quot; ของ
              หัวข้ออื่นเป็นรางหมดแล้ว ⇒ <b>ความคงเส้นคงวาชนะรายละเอียดบนแถวสรุป</b> ·
              วันนี้ <code>EditableLineList</code> เหลือผู้เรียกจริงที่ <b>ข้อ 2.2/2.3 ของ PDR ที่เดียว</b>
              {" "}และ<b>ห้ามถอยของที่เป็นรางแล้วกลับไปเป็นแถวยุบโดยไม่ถามเจ้าของงานก่อน</b>
            </StatusNotice>

            {/* ── 1) FormZone ─────────────────────────────────────────────── */}
            <div className={styles.stack}>
              <span className={styles.caption}>
                FormZone — คั่นโซนในฟอร์มที่ยังไหลเป็นสายเดียว
              </span>
              {/* ⚠️ **ต้องส่ง `col-span-2` มาเอง** เมื่ออยู่ในกริดสองคอลัมน์ — ไม่งั้นหัวโซน
                  กลายเป็น "ช่องหนึ่ง" ในคอลัมน์ซ้ายแล้วมีช่องกรอกมายืนข้าง ๆ
                  (เจอจริงตอนทดสอบ 2026-08-09) · ผู้เรียกจริงทุกจุดในระบบส่ง `col-span-2` มาครบ */}
              <div className="form-grid cols-2">
                <FormZone title="ตัวตนกลิ่น" className="col-span-2" />
                <label>
                  ชื่อกลิ่น
                  <Input defaultValue="Forest night" />
                </label>
                <label>
                  รหัสกลิ่น
                  <Input mono defaultValue="SC-0142" />
                </label>
                <FormZone title="ข้อมูลเสริม" note="ว่างได้ทุกช่อง" className="col-span-2" />
                <label>
                  ผู้คิดค้น
                  <Input defaultValue="" placeholder="ชื่อผู้คิดค้น" />
                </label>
                <label>
                  หมายเหตุ
                  <Input defaultValue="" placeholder="บันทึกเพิ่มเติม" />
                </label>
              </div>
              <p className={styles.note}>
                <b>โน้ตท้ายเส้นใช้กับเงื่อนไขของทั้งโซน</b> (ตัวอย่างข้างบน: &quot;ว่างได้ทุกช่อง&quot;)
                {" "}ไม่ใช่คำอธิบายของช่องใดช่องหนึ่ง · <b>จำนวนโซนไม่ตายตัว</b> ใส่เท่าที่หัวข้อนั้น
                มีจริง — โซนที่มีของใต้หัวแค่ช่องเดียวคือพิธีที่ไม่ช่วยอะไร
                <br />
                🐞 ที่มา: คำร้องพัฒนากลิ่นเคยมี <b>52 ช่องไหลรวดเป็นสายเดียว</b> โดยมีคำอธิบาย
                จาง ๆ (<code>.hint</code>) 12 จุดทำหน้าที่แทนหัวข้อไปโดยปริยาย
              </p>
            </div>

            {/* ── 2) SectionRail ──────────────────────────────────────────── */}
            <div className={styles.stack}>
              <span className={styles.caption}>
                SectionRail (ก) ชุดตายตัวรู้ล่วงหน้า — 5 ส่วนของแบบฟอร์ม PDR
              </span>
              {/* พิมพ์ในช่องฝั่งขวาแล้ว **จุดสีกับตัวเลขบนรางขยับจริง** — ไม่ใช่ตัวเลขตาย */}
              <div className={styles.railDemo}>
                <SectionRail
                  sections={railSections}
                  value={demoRailSection}
                  onChange={setDemoRailSection}
                  ariaLabel="ส่วนของแบบฟอร์มตัวอย่าง"
                >
                  <div className={styles.stack}>
                    <span className={styles.caption}>{railLabel}</span>
                    <label className={styles.field}>
                      หมายเหตุของส่วนนี้ (พิมพ์แล้วดูจุดสีบนราง)
                      <Input
                        value={demoRailNotes[demoRailSection] || ""}
                        onChange={(event) => setRailNote(demoRailSection, event.target.value)}
                        placeholder="พิมพ์อะไรก็ได้"
                      />
                    </label>
                  </div>
                </SectionRail>
              </div>
              <p className={styles.note}>
                จุดสีบอก &quot;แตะแล้วหรือยัง&quot;: <b>เขียว = ครบ</b> · <b>เหลือง = เริ่มแล้ว</b> ·
                {" "}<b>เทา = ยังว่าง</b> · ส่วนที่ <code>optional: true</code> (ข้อ 5 ตารางลายเซ็น) คือ
                ส่วนที่<b>ไม่มีช่องไหนบังคับเลย</b> ⇒ ตัวหารไม่มีความหมาย โชว์แค่ &quot;กรอก N&quot;
                {" "}และไม่มีสถานะ &quot;ยังไม่ครบ&quot;
                {" "}🐞 เดิมส่วนพวกนี้ขึ้น <code>0/6</code> กับจุดเทาเหมือนงานค้าง ทั้งที่เว้นว่างได้
                ตามตั้งใจ ⇒ อ่านเป็นหนี้ที่ไม่มีวันเคลียร์
                <br />
                ⚠️ ผู้เรียกกำหนดสีจุดเองได้ด้วย <code>tone</code> — &quot;ครบ/ไม่ครบ&quot; ไม่ได้วัดด้วย
                จำนวนช่องเสมอไป (ดูตัวอย่าง ข) · ⚠️ จอแคบ ราง<b>ไม่ยุบเป็นดรอปดาวน์</b>
                {" "}แต่กลายเป็นแถบเลื่อนแนวนอนด้านบน — ยุบเมื่อไร จำนวนที่กรอกแล้วของส่วนอื่น
                หายไปจากสายตาทั้งหมด แล้วรางก็ไม่ต่างจากลิ้นชักเดิม
              </p>

              <span className={styles.caption}>
                SectionRail (ข) ของที่ผู้ใช้สร้างเอง 0..N — ปุ่มเพิ่มอยู่ใน <code>navFooter</code>
              </span>
              <div className={styles.railDemo}>
                <SectionRail
                  ariaLabel="รายการเอกสารที่ขอ (ตัวอย่าง)"
                  /* ⚠️ คีย์เป็น **ตำแหน่ง** ไม่ใช่ id — แถวยังไม่มี id จนกว่าจะบันทึก */
                  sections={demoDocRows.map((row, index) => ({
                    key: `row-${index}`,
                    label: `${index + 1}. ${DEMO_DOC_LABEL(row.type)}`,
                    // tone เขียนเอง: แถวครบเมื่อ *เลือกชนิดแล้ว และมีรายละเอียด* ไม่ใช่ "กี่ช่องจากกี่ช่อง"
                    tone: row.type && row.spec.trim() ? "full" : "none",
                    /* ⭐ **ปุ่มของรายการอยู่ที่รายการ** (มติ 2026-08-24) — เดิมปุ่มลบอยู่บนหัวของ
                       เนื้อฝั่งขวา ซึ่งอ่านเหมือนปุ่มของ *ช่องที่กำลังเปิด* ไม่ใช่ของ *รายการ*
                       ⚠️ หน้าจริงบังคับให้เหลืออย่างน้อย 1 แถว (ด่านส่ง) จึงซ่อนถังขยะเมื่อเหลือ
                       แถวเดียว · ที่นี่ลบได้จนหมดเพื่อให้เห็น `emptyText` ด้วยตา */
                    action: {
                      icon: <Trash2 size={14} aria-hidden="true" />,
                      title: `ลบ ${DEMO_DOC_LABEL(row.type)}`,
                      onClick: () => removeDocRow(index),
                    },
                  }))}
                  value={`row-${demoDocAt}`}
                  onChange={(key) => setDemoDocAt(Number(key.replace("row-", "")))}
                  emptyText="ยังไม่มีรายการ — กดปุ่มข้างซ้ายเพื่อเพิ่มรายการแรก"
                  navFooter={(
                    /* ⭐ terracotta = "เริ่มของใหม่" ตรงความหมายของปุ่มนี้พอดี
                       🐞 ปุ่มพื้นฐาน (`btn` เปล่า) **มองไม่เห็นในราง**: พื้นปุ่มเป็น --panel ซึ่ง
                       เข้มกว่าพื้นราง (--panel-2) ⇒ อ่านเป็นช่องยุบ ๆ (ผู้ใช้ทัก 2026-08-24) */
                    <Button size="sm" tone="accent" icon={<Plus size={14} aria-hidden="true" />} onClick={addDocRow}>
                      เพิ่มเอกสาร
                    </Button>
                  )}
                >
                  {docRow ? (
                    <div className={styles.stack}>
                      <label className={styles.field}>
                        ชนิดเอกสาร
                        <Select value={docRow.type} onChange={(event) => patchDocRow({ type: event.target.value })}>
                          <option value="">— เลือกชนิดเอกสาร —</option>
                          {DEMO_DOC_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </Select>
                      </label>
                      <label className={styles.field}>
                        รายละเอียดที่ขอ
                        <Textarea
                          value={docRow.spec}
                          onChange={(event) => patchDocRow({ spec: event.target.value })}
                          placeholder="ระบุสิ่งที่ต้องการให้ชัดเจน"
                        />
                      </label>
                    </div>
                  ) : null}
                </SectionRail>
              </div>
              <p className={styles.note}>
                ลบให้หมดทุกแถวเพื่อดู <code>emptyText</code>:{" "}
                <b>ยังไม่มีรายการต้องบอกว่าให้ทำอะไร
                ไม่ใช่ปล่อยฝั่งขวาว่าง</b> · และปุ่ม &quot;เพิ่ม…&quot; ต้องอยู่ <b>ในราง</b> ไม่ใช่ใต้กล่อง
                ทั้งใบ ไม่งั้นมันอ่านเหมือนปุ่มของเนื้อฝั่งขวาที่กำลังเปิดอยู่
              </p>
            </div>

            {/* ── 3) EditableLineList ─────────────────────────────────────── */}
            <div className={styles.stack}>
              <span className={styles.caption}>
                EditableLineList — แถวที่กรอกเสร็จยุบเหลือบรรทัดสรุป เปิดเฉพาะใบที่กำลังกรอก
              </span>
              <EditableLineList
                count={demoLines.length}
                active={demoLineAt}
                onActiveChange={setDemoLineAt}
                addLabel="เพิ่มรายการ"
                onAdd={addLineRow}
                emptyText="ยังไม่มีรายการ — เลือกประเภทสินค้าแล้วกดเพิ่ม"
                /* ⭐ คอนโทรลที่ต้องเลือกก่อนถึงจะกดเพิ่มได้ ต้องอยู่ **ในแถวเดียวกับปุ่ม**
                   ไม่ใช่ลอยอยู่เหนือรายการ (ของจริง: ช่อง "ประเภทสินค้า" ของ PDR 2.2) */
                addControl={(
                  <Select
                    value={demoLinePick}
                    aria-label="เลือกประเภทสินค้าที่จะเพิ่ม"
                    onChange={(event) => setDemoLinePick(event.target.value)}
                  >
                    <option value="">— เลือกประเภทสินค้า —</option>
                    {DEMO_CATEGORIES.map((category) => {
                      const code = `${category.mainCategoryCode}-${category.typeCode}`;
                      return <option key={code} value={code}>{`${code} · ${category.nameTh}`}</option>;
                    })}
                  </Select>
                )}
                renderSummary={(index) => {
                  const row = demoLines[index];
                  const ready = Boolean(row.kind && row.scent.trim() && row.price.trim());
                  return (
                    <>
                      <span className="line-summary-dot" data-ok={ready ? "1" : undefined} aria-hidden="true" />
                      <span className="line-summary-main">{row.kind || "ยังไม่เลือกประเภท"}</span>
                      <span className="line-summary-sub">
                        {ready ? `กลิ่น ${row.scent} · ${row.price} บาท/ชิ้น` : "ยังกรอกไม่ครบ"}
                      </span>
                    </>
                  );
                }}
              >
                {lineRow ? (
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      ประเภทสินค้า
                      <Input mono value={lineRow.kind} onChange={(event) => patchLineRow({ kind: event.target.value })} />
                    </label>
                    <label className={styles.field}>
                      กลิ่น
                      <Input value={lineRow.scent} onChange={(event) => patchLineRow({ scent: event.target.value })} placeholder="ชื่อกลิ่น" />
                    </label>
                    <label className={styles.field}>
                      ราคาขาย (บาท/ชิ้น)
                      <Input value={lineRow.price} onChange={(event) => patchLineRow({ price: event.target.value })} placeholder="0" />
                    </label>
                  </div>
                ) : null}
              </EditableLineList>

              <span className={styles.caption}>
                ลิสต์ที่ยังไม่มีแถวเลย (<code>count === 0</code>)
              </span>
              {/* ⚠️ ใบที่เพิ่งเลือกหัวข้อจะมาถึงตรงนี้พร้อม **ศูนย์แถวเสมอ** ⇒ ต้องบอกว่าให้ทำ
                  อะไรต่อ ไม่ใช่ปล่อยว่างแล้วให้เดาว่าปุ่มไหนคือปุ่มเริ่ม */}
              <EditableLineList
                count={0}
                active={0}
                onActiveChange={() => {}}
                renderSummary={() => null}
                onAdd={() => notifyToast.info("ตัวอย่าง: เพิ่มรายการแรก")}
                addLabel="เพิ่มรายการแรก"
                emptyText="ยังไม่มีรายการ — กดปุ่มข้างล่างเพื่อเพิ่มรายการแรก"
              />
              <p className={styles.note}>
                <b>แถวที่ยุบแล้วทั้งแถวเป็นปุ่ม</b> — กดตรงไหนก็เปิดได้ ไม่ต้องเล็งปุ่ม &quot;แก้&quot; ·
                {" "}<b>ตัวเลขบนแถวยุบต้องจัดรูปแบบเหมือนในช่องกรอก</b> (ช่องโชว์
                {" "}<code>1,200.00</code> แต่แถวยุบเคยโชว์ <code>1200</code> ดิบ ๆ อ่านเหมือนคนละค่ากัน)
              </p>
            </div>

            {/* ค่าที่เก็บจริง — ถ้าแถวนี้ไม่ตรงกับที่เห็นบนราง/แถวยุบ แปลว่าเพี้ยนแล้ว */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`rail="${demoRailSection}" · railNotes=${JSON.stringify(demoRailNotes)}`}
              <br />
              {`docRows=${demoDocRows.length} (เปิดอยู่ ${demoDocAt}) · lines=${demoLines.length} (เปิดอยู่ ${demoLineAt}) · linePick="${demoLinePick}"`}
            </p>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="แนบไฟล์"
          subtitle="ui/PendingFiles + lib/ui/useFileIntake — กดเลือก · ลากมาวาง · Ctrl+V ทางเดียวกันทั้งระบบ"
        >
          <div className={styles.stack}>
            <PendingFiles files={demoFiles} onChange={setDemoFiles} />
            <StatusNotice tone="info" title="ห้ามเขียน <input type=&quot;file&quot;> เองอีก">
              ก่อน 2026-08-12 จุดแนบไฟล์ 13 จุดเขียน input ของตัวเองทั้งหมด ⇒ วางจากคลิปบอร์ด
              ได้ 2 จุด ลากได้ 2 จุด ที่เหลือกดปุ่มอย่างเดียว โดยไม่มีใครตั้งใจให้ต่างกัน
              (ผู้ใช้แจ้งเข้ามาเองว่า <b>&quot;ไฟล์แนบอยาก ctrl+V ได้ค่ะ&quot;</b> — IS-26080013)
              <br />
              ไฟล์ที่ยังไม่บันทึก ใช้ <code>ui/PendingFiles</code> · ของที่บันทึกแล้วบนเซิร์ฟเวอร์
              ใช้ <code>AttachmentsPanel</code> · จอที่มีทางอัปของตัวเองจริง ๆ เรียก{" "}
              <code>lib/ui/useFileIntake</code> เพื่อให้ลาก/วางทำงานเหมือนกัน — มีเทสต์กันไว้แล้ว
            </StatusNotice>

            {/* ชิ้นที่สามของประโยคข้างบน — PendingFiles/AttachmentsPanel เป็นตัวถือ *รายการ*
                ส่วนภาพย่อของแต่ละไฟล์ (และของเธรดอัปเดต) วาดด้วย PhotoThumb ตัวเดียวกันหมด */}
            <div className={styles.row}>
              <span className={styles.caption}>PhotoThumb — ภาพย่อของไฟล์แนบและเธรดอัปเดต</span>
              <span className={styles.photoBox}>
                <PhotoThumb src={DEMO_PHOTO_OK} alt="ตัวอย่างภาพย่อที่เปิดได้" className={styles.photoImg} />
              </span>
              <span className={styles.photoBox}>
                <PhotoThumb src={DEMO_PHOTO_BROKEN} alt="ตัวอย่างภาพย่อที่เปิดไม่ได้" className={styles.photoImg} />
              </span>
            </div>

            <StatusNotice tone="info" title="รูปที่เปิดไม่ได้ต้องพูด ไม่ใช่เหลือกรอบว่าง">
              🐞 ไฟล์แนบอยู่บน Google Drive · โทเคนหมดอายุหรือสิทธิ์หลุดเมื่อไร <code>/file</code> ตอบ 502
              {" "}แล้ว <code>&lt;img&gt;</code> ที่พังจะเหลือกรอบว่าง (หรือไอคอนรูปแตกของเบราว์เซอร์) ซึ่ง
              {" "}<b>อ่านเหมือนระบบกำลังโหลดค้าง</b> — ผู้ใช้ถ่ายจอมาถาม 2026-08-19 ⇒ กล่องขวาคือสถานะนั้น
              {" "}และเป็นเหตุผลทั้งหมดที่ primitive ตัวนี้มีอยู่
              <br />
              ⚠️ <b><code>onError</code> อย่างเดียวไม่พอ</b> — หน้าเรนเดอร์จากเซิร์ฟเวอร์ ⇒ รูปเริ่มโหลด
              {" "}(และพัง) ตั้งแต่ก่อน React ผูก handler · ต้องถามสภาพจริงตอนผูก ref ด้วย
              {" "}(<code>complete</code> = จบแล้ว · <code>naturalWidth === 0</code> = จบแบบพัง)
              {" "}· และจำ <b>src ที่พัง</b> ไม่ใช่ธง true/false ไม่งั้นเปลี่ยนรูปในช่องเดิม (rev ใหม่ ·
              {" "}เลื่อน lightbox) แล้วรูปที่ยังดีอยู่จะขึ้นว่าเปิดไม่ได้
              <br />
              รูปซ้ายเป็น SVG ฝังในไฟล์และรูปขวาเป็น <code>data:</code> ที่ถอดรหัสไม่เป็นภาพ —
              {" "}ทั้งคู่<b>ไม่ยิงเน็ตเลย</b> ตามกติกาของหน้านี้
            </StatusNotice>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ช่องกรอกเฉพาะทาง"
          subtitle="MoneyInput · PhoneInput · NationalIdInput — สองตัวหลังห่อ MaskedNumberInput อีกที · ทุกตัวเก็บค่าดิบ แล้วจัดรูปแบบตอนแสดง"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="อย่าเขียน input เองแล้วใส่ลูกน้ำ/ขีดเอง">
              ช่องพวกนี้จัดรูปแบบ<strong>ระหว่างพิมพ์</strong>พร้อมคืนตำแหน่งเคอร์เซอร์ให้ถูก —
              ของที่เขียนเองมักทำให้เคอร์เซอร์กระโดดไปท้ายช่องทุกครั้งที่แทรกตัวคั่น
              และค่าที่ส่งขึ้น API ต้องเป็นตัวเลขล้วนเสมอ ไม่ใช่สตริงที่มีลูกน้ำ
            </StatusNotice>

            <div className={styles.formGrid}>
              {/* ไม่ต้องส่ง className="premium-input" — primitive พวกนี้ใส่ให้เองแล้ว
                  (MoneyInput เติม numeric-input, ช่อง masked เติม tabular-nums ต่อท้าย) */}
              <label className={styles.field}>
                จำนวนเงิน
                <MoneyInput value={demoMoney} onChange={setDemoMoney} />
              </label>
              <label className={styles.field}>
                จำนวนเงิน (ติดลบได้ — ใบลดหนี้)
                <MoneyInput value={demoMoneyNeg} onChange={setDemoMoneyNeg} allowNegative />
              </label>
              <label className={styles.field}>
                เบอร์โทร
                <PhoneInput value={demoPhone} onChange={setDemoPhone} />
              </label>
              <label className={styles.field}>
                เลขประจำตัวประชาชน
                <NationalIdInput value={demoNationalId} onChange={setDemoNationalId} />
              </label>
              {/* ⭐ **ฐานของสองช่องข้างบน** — `PhoneInput` กับ `NationalIdInput` คือ
                  `MaskedNumberInput` ที่ผูก `format` + `maxDigits` ไว้ให้เท่านั้น (ไฟล์ละ 4 บรรทัด)
                  ⇒ ช่อง mask ตัวใหม่ให้เรียกฐานตัวนี้พร้อมตัวจัดรูปแบบของตัวเอง
                  **ห้ามก๊อป PhoneInput ไปแก้ regex** ซึ่งจะได้ตรรกะคืนตำแหน่งเคอร์เซอร์
                  ชุดที่สองที่ไม่มีใครดูแล */}
              <label className={styles.field}>
                เลขบัญชีธนาคาร (เรียก MaskedNumberInput ตรง ๆ)
                <MaskedNumberInput
                  value={demoBankAccount}
                  onChange={setDemoBankAccount}
                  format={formatBankAccount}
                  maxDigits={10}
                  placeholder="123-4-56789-0"
                  aria-label="เลขบัญชีธนาคารตัวอย่าง"
                />
              </label>
            </div>

            <p className={styles.note}>
              ช่องที่สี่ไม่มีในระบบจริง — วางไว้ให้เห็น<strong>ฐาน</strong>ของทั้งหมวด:
              {" "}<code>MaskedNumberInput</code> รับ <code>format(digits)</code> กับ{" "}
              <code>maxDigits</code> แล้วจัดการ<strong>ตำแหน่งเคอร์เซอร์ตอนแทรกตัวคั่น</strong>ให้เอง
              (นับหลักตัวเลขก่อนเคอร์เซอร์ แล้ววางกลับที่หลักเดิมหลังจัดรูปแบบ)
            </p>

            {/* ค่าที่เก็บจริง — แพตเทิร์นเดียวกับส่วนวันที่/เวลา ถ้าแถวนี้ไม่ตรงกับที่เห็นในช่อง แปลว่าเพี้ยน */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`money=${demoMoney ?? "null"} · moneyNeg=${demoMoneyNeg ?? "null"} · phone="${demoPhone}" · nationalId="${demoNationalId}" · bankAccount="${demoBankAccount}"`}
            </p>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ดรอปดาวน์ที่ค้นหาได้"
          subtitle="SearchableSelect เป็นฐาน — PersonSelect และ ProductCategorySelect ห่อทับอีกที · ถามว่า “ตอนนี้ใครยังตามงานไหว” ให้ข้ามไป PersonLoadSelect"
        >
          <div className={styles.stack}>
            {/* ใช้ div + span ไม่ใช่ <label> — ตัวคุมของดรอปดาวน์พวกนี้เป็น <button>
                ซึ่งเป็น labelable element การคลิกข้อความกำกับจะเด้ง dropdown เปิดแล้วปิดทันที */}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.caption}>เลือกลูกค้า (ค้นหาได้)</span>
                <SearchableSelect
                  value={demoCustomer}
                  onChange={setDemoCustomer}
                  options={DEMO_CUSTOMERS}
                  placeholder="เลือกลูกค้า"
                  ariaLabel="ลูกค้าตัวอย่าง"
                />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>พิมพ์ค่าที่ไม่มีในลิสต์ได้ (allowFreeText)</span>
                <SearchableSelect
                  value={demoFreeText}
                  onChange={setDemoFreeText}
                  options={DEMO_CUSTOMERS}
                  allowFreeText
                  placeholder="เลือกหรือพิมพ์เอง"
                  ariaLabel="ช่องที่พิมพ์เองได้"
                />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>เลือกคน (PersonSelect — ค้นด้วยชื่อหรือนามสกุล)</span>
                <PersonSelect
                  users={DEMO_USERS}
                  value={demoPerson}
                  onChange={setDemoPerson}
                  ariaLabel="ผู้รับผิดชอบตัวอย่าง"
                />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>ลิสต์ว่าง — ต้องบอกว่าว่าง ไม่ใช่เปิดแล้วไม่มีอะไร</span>
                <SearchableSelect
                  value=""
                  onChange={() => {}}
                  options={[]}
                  emptyText="ยังไม่มีข้อมูลในทะเบียน"
                  placeholder="ไม่มีตัวเลือก"
                  ariaLabel="ดรอปดาวน์ที่ยังไม่มีข้อมูล"
                />
              </div>

              {/* ── ทางแยกของ PersonSelect ข้างบน (PersonLoadSelect) ──────────────
                  วางไว้ใน formGrid เดียวกันโดยตั้งใจ — สองตัวนี้คือจุดที่คนเลือกผิดบ่อย
                  ที่สุดในหมวดนี้ · กินเต็มแถวเพราะรูปทรงของมันคือ "หนึ่งคนหนึ่งแถว"
                  ซึ่งเป็นสิ่งที่แก้ข้อกังวลเรื่องชื่อยาว/คนเยอะ แทนการพับลงดรอปดาวน์ */}
              <div className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.caption}>
                  เลือกคนโดยเห็นภาระงานพร้อมกัน (PersonLoadSelect) — กดเลือกดูได้
                </span>
                <PersonLoadSelect
                  users={DEMO_USERS}
                  value={demoLoadPerson}
                  onChange={setDemoLoadPerson}
                  noteOf={demoLoadNote}
                  ariaLabel="ผู้รับผิดชอบตามภาระงานตัวอย่าง"
                />
                <p className={`${styles.caption} ${styles.mono}`}>
                  {`loadPerson="${demoLoadPerson}"`}
                </p>
                <p className={styles.note}>
                  <strong>เลือกจาก &quot;คำถามที่กำลังถาม&quot; ไม่ใช่จากที่ว่างบนจอ</strong> —
                  {" "}ถามว่า <em>ใคร</em> (ผู้รับผิดชอบดีล · ผู้ตรวจ) ⇒ <code>PersonSelect</code>
                  {" "}ดรอปดาวน์ ตามมติ 2026-08-08 ที่ยังจริงอยู่สำหรับช่องแบบนั้น (ชื่อยาว คนเยอะ) ·
                  {" "}ถามว่า <em>ตอนนี้ใครยังตามงานไหว</em> (กล่องมอบหมายลีด) ⇒ <code>PersonLoadSelect</code>
                  {" "}เพราะคำถามนี้ตอบไม่ได้ถ้าตัวเลขถูกพับอยู่ในดรอปดาวน์ที่ต้องกดเปิดทีละครั้ง
                </p>
                <p className={styles.note}>
                  ตัวเลขไม่ได้ถูกไปหาเอง — มันติดมากับรายชื่อแล้วผ่าน <code>withWorkload()</code>
                  {" "}(<code>lib/sales/leadWorkload.js</code>) · ช่อง <code>เลยติดตาม</code> เป็นช่องเดียวที่
                  {" "}ทาสี (แดง = มากกว่าศูนย์ · เขียว = ศูนย์) อีกสองช่องนับเฉย ๆ เพราะถือ 11 ใบ
                  {" "}ไม่ได้แปลว่าผิด แปลว่าต้องชั่งน้ำหนักเอง · เลือก <strong>ปัทมา</strong> เพื่อดู
                  {" "}<code>noteOf</code> ที่คืน <code>{"{ label, warning }"}</code>{" — "}<code>label</code>
                  {" "}ต่อท้ายชื่อในแถวที่ <code>noteOf</code> คืนค่า (แถวอื่นคืน <code>null</code> จึงไม่มีป้าย)
                  {" "}ส่วน <code>warning</code> ขึ้นเป็นบรรทัดใต้รายชื่อ<strong>เฉพาะตอนคนนั้นถูกเลือก</strong>
                  {" "}(เตือน <em>ไม่ห้าม</em> — ยังกดยืนยันต่อได้)
                  <br />
                  ⚠️ ตัวเลขนี้คือ<strong>ของค้าง ณ ตอนนี้ ไม่ใช่ผลงานรายเดือน</strong> — ห้ามเอาไปคิดเป็น KPI
                </p>
              </div>
            </div>

            <div className={styles.stack}>
              <span className={styles.caption}>
                ProductCategorySelect — ช่องเดียว หมวดหลักเป็นหัวกลุ่มในลิสต์ ค้นได้ทั้งรหัส ไทย และอังกฤษ
              </span>
              <ProductCategorySelect
                categories={DEMO_CATEGORIES}
                value={demoCategory}
                onChange={setDemoCategory}
              />
              <p className={`${styles.caption} ${styles.mono}`}>
                {`customer="${demoCustomer}" · freeText="${demoFreeText}" · person="${demoPerson}" · category="${demoCategory}"`}
              </p>
            </div>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ตัวเลือกสองชั้น (TwoPanePicker)"
          subtitle="ของที่มีกลุ่มตามธรรมชาติและรายการยาว — กลุ่มอยู่ซ้าย รายการอยู่ขวา ค้นได้ทั้งสองฝั่ง"
        >
          <div className={styles.stack}>
            <div className={styles.field}>
              <span className={styles.caption}>
                เลือกดีล (DealPicker ห่อทับอีกที) — ถัง “ทั้งหมด” ไม่เคยถูกกรองทิ้งจากฝั่งซ้าย
                เพราะเป็นทางออกของคนที่จำได้แค่ชื่อของชั้นล่าง
              </span>
              <TwoPanePicker
                groups={DEMO_PICKER_GROUPS}
                value={demoTwoPane}
                onChange={setDemoTwoPane}
                allGroupKey="all"
                headLabel="เลือกดีล"
                headMeta={`ทั้งหมด ${DEMO_PICKER_GROUPS[0].items.length} ดีล`}
                groupSearchPlaceholder="ค้นหาโครงการ / ลูกค้า…"
                itemSearchPlaceholder="ค้นหาดีล / ลูกค้า…"
                placeholder="— เลือกดีล —"
                ariaLabel="ตัวเลือกสองชั้นตัวอย่าง"
              />
            </div>
            <p className={`${styles.caption} ${styles.mono}`}>{`value="${demoTwoPane}"`}</p>
            <span className={styles.caption}>
              ⚠️ อย่าใช้กับลิสต์สั้นหรือของชั้นเดียว — นั่นคืองานของ SearchableSelect
            </span>
          </div>
        </Section>

        <Section group="data" active={group}
          title="ข้อความยาวของผู้ใช้"
          subtitle="ReadableText เป็นฐาน — RichText ห่อทับอีกที: RichText ตัดสิน “อะไรเป็นลิงก์” ส่วน ReadableText ตัดสิน “ยาวเกินไหม”"
        >
          <div className={styles.stack}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.caption}>ข้อความสั้น — ไม่มีปุ่มขยาย</span>
                <ReadableText text={"ลูกค้าขอให้ลดโทนไม้ลง"} />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>ข้อความยาว — ตัดที่ 4 บรรทัดแล้วมีปุ่มขยาย</span>
                <ReadableText text={DEMO_LONG_TEXT} />
              </div>
              <div className={styles.field}>
                <span className={styles.caption}>
                  ข้อความที่มีลิงก์ในตัว (RichText) — ลิงก์ · @ชื่อคน · รหัสเอกสาร
                </span>
                {/* ⚠️ ต้องส่ง `mentionNames` มาด้วย ไม่งั้น @ชื่อคนจะเป็นข้อความธรรมดา —
                    ชื่อไทยมีช่องว่าง เดาขอบเขตจากข้อความดิบไม่ได้ */}
                <RichText text={DEMO_RICH_TEXT} mentionNames={DEMO_MENTION_NAMES} />
              </div>
            </div>

            <StatusNotice tone="info" title="ประกอบจากชิ้นส่วน — ห้าม dangerouslySetInnerHTML">
              <code>parseRichText</code> คืน <strong>รายการชิ้นส่วน</strong>{" "}
              (<code>text</code> · <code>url</code> · <code>mention</code> · <code>doc</code>)
              {" "}แล้ว <code>RichText</code> ประกอบเป็น element เอง ⇒ ทุกตัวอักษรที่ผู้ใช้พิมพ์
              ลงมาผ่าน text node ของ React เสมอ · ข้อความพวกนี้<strong>มาจากผู้ใช้ทั้งก้อน</strong>
              {" "}การแปลงเป็น HTML แล้วยัดเข้า <code>dangerouslySetInnerHTML</code> คือช่อง XSS ตรง ๆ
              <br />
              สามชนิดตัดสินใจคนละแบบโดยตั้งใจ:{" "}
              <strong>URL</strong> เปิดแท็บใหม่พร้อม <code>rel=&quot;noopener noreferrer nofollow&quot;</code>
              {" "}(หน้าปลายทางที่ผู้ใช้พิมพ์เองต้องแตะ <code>window.opener</code> ไม่ได้ และไม่รับ referrer
              ของระบบภายใน) · <strong>@ชื่อคน</strong> เป็น <code>&lt;mark&gt;</code>{" "}
              <strong>ไม่ใช่ลิงก์</strong> เพราะระบบไม่มีหน้าโปรไฟล์รายคน ·{" "}
              <strong>รหัสเอกสาร</strong> ไปเส้นทางกลาง <code>/go/&lt;รหัส&gt;</code> ที่ resolve
              แล้ว redirect ตอนกด — ไม่ใช่ยิงฐานข้อมูลหา id ตอนวาดข้อความ
            </StatusNotice>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="วันที่ เดือน และเวลา"
          subtitle="ค่าจุดเดียว: DateInput · TimeInput · DateTimeInput · MonthPicker — ช่วง: DayRangePicker · MonthRangePicker — ทั้งเดือน: MonthGrid · ทุกตัวเก็บค่าเป็น ISO ไม่พึ่ง locale ของเบราว์เซอร์"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="เก็บ ISO แสดงแบบไทย">
              ช่องพวกนี้ <strong>เก็บ</strong> เป็น <code>YYYY-MM-DD</code> · <code>YYYY-MM</code> ·
              {" "}<code>HH:mm</code> · <code>YYYY-MM-DDTHH:mm</code> เสมอ แต่ <strong>แสดง</strong> เป็น
              {" "}<code>DD/MM/YYYY</code> และ 24 ชั่วโมง — ห้ามใช้ <code>&lt;input type=&quot;date&quot;&gt;</code>
              {" "}เพราะหน้าตาและรูปแบบจะเปลี่ยนตามภาษาของเครื่องผู้ใช้
            </StatusNotice>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                เลือกวันที่
                <DateInput value={demoDate} onChange={setDemoDate} ariaLabel="วันที่ตัวอย่าง" />
              </label>
              <label className={styles.field}>
                เลือกวันที่ (จำกัดช่วง — ห้ามก่อนวันนี้)
                <DateInput value={demoDateBounded} onChange={setDemoDateBounded} min={DEMO_TODAY} ariaLabel="วันที่ในช่วงที่กำหนด" />
              </label>
              <label className={styles.field}>
                เลือกเวลา
                <TimeInput value={demoTime} onChange={setDemoTime} ariaLabel="เวลาตัวอย่าง" />
              </label>
              <label className={styles.field}>
                เลือกวันที่ + เวลา
                <DateTimeInput value={demoDateTime} onChange={setDemoDateTime} />
              </label>
            </div>

            <div className={styles.stack}>
              <span className={styles.caption}>เลือกเดือน (งวด) — ปีเป็น พ.ศ. ตามค่าตั้งต้น</span>
              <MonthPicker value={demoMonth} onChange={setDemoMonth} ariaLabel="งวดเดือนตัวอย่าง" />
              <span className={styles.caption}>เลือกเดือน + ตัวเลือก &quot;ทุกเดือน&quot;</span>
              <MonthPicker
                value={demoMonth}
                onChange={setDemoMonth}
                allMonths={demoAllMonths}
                onAllMonths={setDemoAllMonths}
                ariaLabel="งวดเดือนพร้อมทุกเดือน"
              />
              <p className={styles.caption}>
                PageUp / PageDown เลื่อนเดือน · กด Shift ค้างไว้เลื่อนทีละปี
              </p>
            </div>

            {/* ── ช่วงวัน / ช่วงเดือน ───────────────────────────────────────────
                คนละงานกับสี่ช่องข้างบน: ข้างบนคือ **ค่าจุดเดียว** (วันนัด · เวลาเข้าไซต์)
                ตรงนี้คือ **ช่วง** ที่ใช้กรองรายการหรือรายงาน */}
            <div className={styles.stack}>
              <StatusNotice tone="info" title="ชิปทางลัดเป็นของหลัก ปฏิทินเป็นของรอง">
                คนที่ใช้จริงถามว่า <strong>&quot;สัปดาห์นี้&quot;</strong> / <strong>&quot;7 วันล่าสุด&quot;</strong>
                {" "}/ <strong>&quot;ไตรมาสนี้&quot;</strong> ไม่ใช่มานั่งเลือกขอบเองทุกครั้ง — การพิมพ์วันสองครั้ง
                เพื่อให้ได้ช่วงเดิมทุกสัปดาห์คือการทำงานซ้ำที่ IS-26080023 ขอให้เลิกทำ ⇒ เปิดแผงแล้ว
                <strong>ชิปอยู่บนสุด</strong> ปฏิทินอยู่ล่าง · อย่าเอา <code>DateInput</code> สองช่อง
                มาวางคู่กันแทน
                <br />
                ⚠️ ทั้งคู่รับ <strong>วันนี้เข้ามาเป็น prop</strong> (<code>today</code> / <code>now</code>)
                {" "}ไม่ได้อ่านนาฬิกาเอง — ค่าตั้งต้นของ <code>MonthRangePicker</code> คือ{" "}
                <code>new Date()</code> ซึ่งเป็นนาฬิกา<strong>เครื่องผู้ใช้</strong> ไม่ใช่เวลาไทย
                {" "}⇒ หน้าเรียกต้องส่งวันไทยมาให้เสมอ ไม่งั้นช่วงเลื่อนตาม timezone ของเบราว์เซอร์
              </StatusNotice>

              <div className={styles.row}>
                <span className={styles.caption}>ช่วงวัน (DayRangePicker)</span>
                {/* `markedDays` = วันที่มีข้อมูลจริง — จุดใต้ตัวเลขบอกว่ากำลังลากคลุมวันว่างกี่วัน
                    ไม่ส่งมาก็ไม่มีจุด และคำอธิบายท้ายแผงก็ไม่โฆษณาจุดที่ไม่มีอยู่จริง */}
                <DayRangePicker
                  from={demoDayRange.from}
                  to={demoDayRange.to}
                  today={DEMO_TODAY}
                  onChange={setDemoDayRange}
                  markedDays={DEMO_MARKED_DAYS}
                  ariaLabel="ช่วงวันตัวอย่าง"
                />
              </div>

              <div className={styles.row}>
                <span className={styles.caption}>ช่วงเดือน (MonthRangePicker)</span>
                {/* ⭐ เป็น **เดือน** ไม่ใช่วัน โดยตั้งใจ: ยอดขายไม่มีความละเอียดระดับวัน
                    (ยอดปิดบัคเก็ตเป็นเดือน · เป้าและยอดย้อนหลังเก็บเป็นแถวรายเดือน)
                    ⇒ ตัวเลือกรายวันจะให้ตัวเลขที่ไม่มีทางถูก */}
                <MonthRangePicker
                  from={demoMonthRange.from}
                  to={demoMonthRange.to}
                  now={DEMO_NOW}
                  onChange={setDemoMonthRange}
                  ariaLabel="ช่วงเดือนตัวอย่าง"
                />
              </div>
            </div>

            {/* ── กริดปฏิทินทั้งเดือน ─────────────────────────────────────────
                วางไว้ในกลุ่ม "ตัวควบคุม" ไม่ใช่ "แสดงข้อมูล" เพราะช่องกดได้ และเพราะคนที่
                มาหา "ปฏิทิน" จะเปิดกลุ่มวันที่เป็นที่แรก */}
            <div className={styles.stack}>
              <span className={styles.caption}>ปฏิทินทั้งเดือน (MonthGrid) — กดที่วันทำการดูได้</span>
              <MonthGrid
                year={DEMO_GRID_YEAR}
                month={DEMO_GRID_MONTH}
                todayISO={DEMO_TODAY}
                holidayOf={(iso) => DEMO_HOLIDAYS.get(iso)}
                onDayClick={setDemoGridDay}
                /* เสาร์–อาทิตย์หยุดอยู่แล้ว ไม่มีอะไรให้กด — disabled ไม่กินตำแหน่ง tab */
                dayDisabled={({ isWeekend }) => isWeekend}
                dayLabel={({ iso, isWeekend, isHoliday, holidayName, isToday }) => {
                  const state = isHoliday ? `วันหยุด: ${holidayName}` : isWeekend ? "วันหยุดสุดสัปดาห์" : "วันทำการ";
                  return `${iso}${isToday ? " (วันนี้)" : ""} · ${state}`;
                }}
              >
                {/* ⭐ primitive ถือแค่ **โครงกับสถานะของช่อง** — "ของที่อยู่ในช่อง" (นัด · งาน ·
                    ป้ายวันหยุด) เป็นของหน้าเรียกเสมอ เพราะแต่ละหน้าคนละเรื่องจริง ๆ
                    children รับ { iso, day, dow, isWeekend, isHoliday, holidayName, isToday } */}
                {({ iso }) => {
                  const appointment = DEMO_APPOINTMENTS.get(iso);
                  return appointment ? <small className={styles.calendarChip}>{appointment}</small> : null;
                }}
              </MonthGrid>
              <p className={styles.note}>
                ⚠️ <strong>หน้า service/schedule ใช้ตัวนี้ไม่ได้โดยเจตนา</strong> — นั่นเป็นกริด
                {" "}<strong>เจ้าหน้าที่ × วัน</strong> ไม่ใช่กริดของเดือน (มันมีจังหวะเส้นร่วมแบบเดียวกัน
                อยู่แล้ว) · ก่อนมี primitive ตัวนี้ ปฏิทินสามหน้าเขียนกริดเองคนละชุด สูงช่อง
                {" "}<code>74 / 92 / 104px</code> มุม <code>8 / 10px</code> ช่องไฟ <code>6px</code>
              </p>
            </div>

            {/* ค่าที่เก็บจริงโชว์ไว้ให้เห็น — เคยมีบั๊กที่ช่องแสดงค่าหนึ่งแต่เก็บอีกค่าหนึ่ง
                ถ้าแถวนี้ไม่ตรงกับที่เห็นในช่อง แปลว่าเพี้ยนแล้ว */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`date=${demoDate || "\"\""} · bounded=${demoDateBounded || "\"\""} · time=${demoTime || "\"\""} · dateTime=${demoDateTime || "\"\""} · month=${demoMonth}${demoAllMonths ? " (ทุกเดือน)" : ""}`}
            </p>
            <p className={`${styles.caption} ${styles.mono}`}>
              {`dayRange={from:"${demoDayRange?.from || ""}", to:"${demoDayRange?.to || ""}"} · monthRange={from:"${demoMonthRange?.from || ""}", to:"${demoMonthRange?.to || ""}"} · gridDay=${demoGridDay ? `"${demoGridDay}"` : "(ยังไม่ได้กด)"}`}
            </p>
          </div>
        </Section>

        <Section group="data" active={group} title="ตาราง" subtitle="TableShell รวม toolbar → ตาราง → ท้ายตาราง (Pager) ไว้ในพาเนลเดียว">
          <TableShell
            toolbar={<Button size="sm" icon={<Search size={14} />}>ค้นหา</Button>}
            footer={<Pager page={page} pageCount={4} total={64} pageSize={20} onPage={setPage} />}
          >
            <table>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า</th>
                  <th className={styles.numeric}>มูลค่า</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.code}>
                    <td className={styles.mono}>{row.code}</td>
                    <td>{row.customer}</td>
                    <td className={styles.numeric}>{money(row.amount)}</td>
                    <td><StatusBadge tone={row.tone} label={row.status} dot /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <p className={styles.note}>
            ตัวเลขและจำนวนเงินชิดขวาเสมอ · หัวตารางใช้ <code>--panel-2</code> ·
            ตารางที่ไม่ใช่รายการให้ระบุ <code>family=&quot;editable&quot;</code> หรือ <code>family=&quot;matrix&quot;</code>
          </p>

          <p className={styles.note}>
            ตารางเดี่ยวที่ไม่มีการ์ดครอบ ใช้ <code>TableScroll</code> เปล่า ๆ ได้เลย —
            มันเป็นพื้นข้อมูลให้ในตัว (<code>surface=&quot;auto&quot;</code>) ถ้าอยู่ในการ์ดอยู่แล้วให้ส่ง
            {" "}<code>surface=&quot;embedded&quot;</code> ไม่งั้นจะได้กรอบซ้อนกรอบ
          </p>
          <TableScroll>
            <table>
              <thead>
                <tr><th>เลขที่</th><th>ลูกค้า</th><th className={styles.numeric}>มูลค่า</th></tr>
              </thead>
              <tbody>
                {ROWS.slice(0, 2).map((row) => (
                  <tr key={row.code}>
                    <td className={styles.mono}>{row.code}</td>
                    <td>{row.customer}</td>
                    <td className={styles.numeric}>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Section>

        <Section group="data" active={group}
          title="กราฟ"
          subtitle="ครอบด้วย ChartCanvas เสมอ · สีและเส้นมาจาก lib/chartTheme.js"
        >
          <div className={styles.chartBox}>
            <ChartCanvas>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={CHART_DATA}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis dataKey="month" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis width={110} tickFormatter={fmtMoney} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(value) => fmtMoney(value)} />} />
                  <Bar dataKey="target" name="เป้าหมาย" fill={CHART_COLORS.target} radius={[4, 4, 0, 0]} maxBarSize={38} />
                  <Line
                    dataKey="actual"
                    name="ยอดจริง"
                    type={CHART_LINE_TYPE}
                    stroke={CHART_COLORS.actual}
                    strokeWidth={CHART_STROKE_WIDTH.primary}
                    dot={{ r: 4, strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCanvas>
          </div>
          <ChartLegend
            items={[
              { key: "actual", label: "ยอดจริง", color: CHART_COLORS.actual },
              { key: "target", label: "เป้าหมาย", color: CHART_COLORS.target },
            ]}
          />
          <p className={styles.note}>
            เงินบนแกนและใน tooltip เดินผ่าน <code>fmtMoney</code> เสมอ — <strong>เต็มหลัก ไม่ย่อ</strong>
            {" "}(ห้ามต่อ <code>฿{"{value}"}M</code> เอง) · ป้ายเต็มยาวกว่า <code>width</code> ตั้งต้น 60px
            {" "}ของ <code>&lt;YAxis&gt;</code> จึงต้องกาง <code>{"width={110}"}</code> คู่กันเสมอ ไม่งั้นเลขโดนตัด
          </p>
          <p className={styles.note}>
            ⛔ ห้ามใส่ <code>max-width</code> ให้ <code>.recharts-wrapper</code> — Recharts วางกราฟไว้ใน
            กล่องวัดขนาดที่กว้าง 0 ทำให้ <code>100%</code> คิดออกมาเป็น 0 แล้วกราฟหายทั้งอัน
            เหลือแต่คำอธิบายสี (เคยหลุด prod มาแล้ว)
          </p>

          {/* วาง ChartCanvas ใน ChartCard ตรง ๆ — ต้องได้ความสูงจาก prop minHeight เอง
              ถ้ากราฟข้างล่างนี้หาย แปลว่ากฎ .body > .canvas หลุดไป */}
          <ChartCard
            title="วางใน ChartCard ตรง ๆ"
            description="ไม่ต้องมี div ครอบตั้งความสูงเอง — ความสูงมาจาก prop minHeight"
            minHeight={220}
          >
            <ChartCanvas>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={CHART_DATA}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis dataKey="month" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis width={110} tickFormatter={fmtMoney} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(value) => fmtMoney(value)} />} />
                  <Bar dataKey="target" name="เป้าหมาย" fill={CHART_COLORS.target} radius={[4, 4, 0, 0]} maxBarSize={38} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCanvas>
          </ChartCard>
          <p className={styles.note}>
            ⛔ <code>.canvas</code> ตั้ง <code>height: 100%</code> ไว้ ถ้าแม่มีแค่ <code>min-height</code>
            เบราว์เซอร์จะตีเป็น <code>auto</code> = สูง 0 แล้ว <code>ResponsiveContainer</code> ไม่วาดอะไรเลย
            — การ์ดจึงต้องส่งความสูงเป็นตัวเลขจริงให้ลูกตรงของมันเสมอ
          </p>
        </Section>

        <Section group="controls" active={group}
          title="แถบปุ่มท้ายฟอร์ม"
          subtitle="FormActions = SaveStatus + ปุ่มบันทึก/ยกเลิก · ลอยติดขอบล่างขณะเลื่อน ต้องทึบ 100% ไม่ให้ช่องกรอกทะลุขึ้นมา"
        >
          <div className={styles.stack}>
            {/* SaveStatus ทุกสถานะวางเทียบกัน — FormActions เลือกให้เองจาก dirty/saving/error */}
            <div className={styles.row}>
              <SaveStatus status="dirty" />
              <SaveStatus status="saving" />
              <SaveStatus status="saved" />
              <SaveStatus status="error" message="บันทึกไม่สำเร็จ — เลขที่เอกสารซ้ำ" />
            </div>
            <p className={styles.note}>
              ระบบนี้<strong>ไม่มี auto-save</strong> — ทุกหน้าที่แก้ข้อมูลได้ต้องมีแถบนี้
              กด &quot;จำลองว่ามีการแก้ไข&quot; แล้วกดบันทึกเพื่อดูวงจรจริง
              {" "}<code>dirty</code> → <code>saving</code> → <code>saved</code> ·
              ปุ่มบันทึกกดไม่ได้เมื่อไม่มีอะไรเปลี่ยน
            </p>
            <div className={styles.row}>
              <Button size="sm" onClick={() => setDemoDirty(true)} disabled={demoDirty || demoSaving}>
                จำลองว่ามีการแก้ไข
              </Button>
            </div>
            {/* .scrollDemo ตรึงแถบไว้ในกรอบ ไม่ให้ไปลอยท้ายหน้าจริงของหน้าต้นแบบเอง */}
            <div className={styles.scrollDemo}>
              <div className={styles.formGrid}>
                {["ผู้ประสานงาน (AC)", "ผู้ตรวจสอบ", "ทีมที่รับผิดชอบ", "วันเริ่มโครงการ", "วันส่งมอบ", "หมายเหตุ"].map((label) => (
                  <label key={label} className={styles.field}>
                    {label}
                    <Input
                      defaultValue="— ไม่ระบุ —"
                      onChange={() => setDemoDirty(true)}
                    />
                  </label>
                ))}
              </div>
              <FormActions
                dirty={demoDirty}
                saving={demoSaving}
                saveLabel="สร้างโครงการ"
                onCancel={() => setDemoDirty(false)}
                onSave={() => {
                  setDemoSaving(true);
                  setTimeout(() => { setDemoSaving(false); setDemoDirty(false); }, 900);
                }}
              />
            </div>
          </div>
        </Section>

        <Section group="data" active={group} title="ตัวเลขสรุป" subtitle="MetricStrip สำหรับแถบ KPI · KpiCard สำหรับการ์ดเดี่ยว">
          <div className={styles.stack}>
            <MetricStrip>
              <Metric icon={<Check size={16} />} label="อนุมัติแล้ว" value="18" note="5 ใบสัปดาห์นี้" />
              <Metric icon={<Info size={16} />} label="รออนุมัติ" value="9" note="3 ใบใกล้เลยกำหนด" tone="warning" />
              <Metric icon={<Inbox size={16} />} label="ฉบับร่าง" value="12" />
            </MetricStrip>
            {/* ไม่ส่ง icon = ไม่มีกรอบไอคอน — แถบนับขั้น (Funnel ลีด) ใช้แบบนี้
                เคยได้กล่องสีจางว่างเปล่าเพราะ Metric เรนเดอร์กรอบทิ้งไว้เสมอ */}
            <MetricStrip>
              <Metric label="เข้า" value="57" note="จำนวนลีด" />
              <Metric label="คัดกรองแล้ว" value="57" note="จำนวนลีด" />
              <Metric label="ติดต่อแล้ว" value="19" note="จำนวนลีด" />
            </MetricStrip>
            <div className={styles.formGrid}>
              <KpiCard label="ยอดขายเดือนนี้" value={4820000} hint="+12.4% เทียบเดือนก่อน" tone="accent" />
              <KpiCard label="เป้าหมายเดือน" value={6500000} hint="ทำได้แล้ว 74.2%" tone="info" />
            </div>
          </div>
        </Section>

        <Section group="feedback" active={group} title="สถานะและการแจ้งเตือน" subtitle="AlertBanner · StatusNotice · Toast · ConfirmDialog · ReasonDialog · SkeletonRows · EmptyState · Tooltip">
          <div className={styles.stack}>
            {/* ── AlertBanner ────────────────────────────────────────────────────
                วางบนสุดคู่กับ StatusNotice สามโทนข้างล่างโดยตั้งใจ — สองตัวนี้หน้าตา
                ใกล้กันจนคนหยิบสลับกันประจำ ทั้งที่ตอบคนละคำถาม */}
            <AlertBanner
              tone="warning"
              icon={TriangleAlert}
              action={(
                <Button size="sm" onClick={() => setDemoBannerLog('onShowLate() — เปิดตารางพร้อมตัวกรอง status=late (กรองมาให้แล้ว)')}>
                  ดูรายการที่เลยกำหนด
                </Button>
              )}
            >
              <strong>3 ใบเลยวันที่นัดลูกค้าไว้</strong>
              {" — เงียบต่อจนครบ 5 วันทำการ ระบบจะส่งกลับคิวคัดกรองอัตโนมัติ"}
            </AlertBanner>
            <AlertBanner
              tone="danger"
              icon={ShieldAlert}
              action={(
                <Button size="sm" tone="danger" variant="outline" onClick={() => setDemoBannerLog('onShowBounced() — เปิดตารางพร้อมตัวกรอง status=bounced')}>
                  เปิดใบที่ถูกตีกลับ
                </Button>
              )}
            >
              <strong>2 ใบถูกตีกลับเมื่อ 9 วันก่อน และยังไม่มีใครแก้</strong>
              {" — ใบพวกนี้ไม่มีคิวไหนคอยทวงให้ ค้างจนกว่าจะมีคนเปิดเอง"}
            </AlertBanner>
            {demoBannerLog ? (
              <p className={`${styles.caption} ${styles.mono}`}>{demoBannerLog}</p>
            ) : (
              <p className={styles.caption}>
                กดปุ่มในแถบดูได้ — แถบส่งออกมาแค่ callback เดียว หน้า feature เป็นคนพาไปตัวกรอง
              </p>
            )}
            <StatusNotice tone="info" title="StatusNotice หรือ AlertBanner — ถามว่าอ่านจบแล้วต้องเดินไปไหนต่อ">
              <strong><code>StatusNotice</code> อธิบายสถานะของสิ่งที่อยู่ตรงนั้น</strong> (ใบนี้เลยวันยืนราคา ·
              {" "}บันทึกไม่สำเร็จเพราะอะไร) — อ่านจบแล้วจบตรงนั้น ·
              {" "}<strong><code>AlertBanner</code> บอกว่า &quot;มีของค้าง N ใบ&quot;</strong> ซึ่งไม่ได้อยู่ตรงหน้า
              {" "}⇒ ต้องมี <code>action</code> ที่พาไป<strong>ตัวกรองที่กรองใบพวกนั้นให้แล้ว</strong>
              <br />
              ⚠️ <strong>ปุ่มต้องพาไปที่ตัวกรอง ไม่ใช่บอกเฉย ๆ</strong> — เตือนแล้วยังต้องไล่หาเองใน
              {" "}ตารางร้อยแถว คนจะเลิกอ่านแถบนี้ภายในสัปดาห์เดียว (บทเรียนจากแถบทบทวน FC)
              {" "}ทั้งสองแถวข้างบนจึงมี <code>action</code> ครบ ไม่มีแถบไหนบอกเฉย ๆ
              <br />
              โทน: <code>warning</code> = ยังไม่มีอะไรพัง แค่มีงานต้องทำก่อนถึงเส้น ·
              {" "}<code>danger</code> = ของค้างที่ผิดปกติไปแล้ว · ที่มา: ยกออกมาจาก
              {" "}<code>ForecastReviewBanner</code> เมื่อ 2026-08-11 ตอนหน้าคำร้องต้องการแถบเดียวกัน —
              {" "}ก๊อปไฟล์ที่สองแล้วมันจะเพี้ยนหากันภายในเดือนเดียว (โรคเดียวกับที่ AGENTS.md
              {" "}ห้ามเรื่องฟอร์มสร้าง/แก้)
              <br />
              ⚠️ <strong>แถบเดียวเท่านั้นต่อหน้า เรียงตามความด่วน</strong> — ที่นี่โชว์สองแถบเพื่อเทียบโทน
              {" "}เท่านั้น · ซ้อนสองแถบบนหน้าจริงคือกลับไปเป็นกำแพงตัวเลขอีกแบบ
            </StatusNotice>
            <StatusNotice tone="success" title="บันทึกแล้ว">ข้อมูลถูกบันทึกเรียบร้อย</StatusNotice>
            <StatusNotice tone="warning" title="ต้องตรวจสอบ">ใบเสนอราคานี้เลยวันยืนราคาแล้ว</StatusNotice>
            <StatusNotice tone="error" title="บันทึกไม่สำเร็จ">ไม่พบลูกค้าที่เลือก</StatusNotice>
            <div className={styles.row}>
              <Button onClick={() => notifyToast("บันทึกเรียบร้อย", "success")}>ทดสอบ Toast</Button>
              <Button
                tone="danger"
                onClick={() => confirmAction({
                  description: "ลบใบเสนอราคานี้ถาวรหรือไม่",
                  destructive: true,
                  confirmLabel: "ลบถาวร",
                })}
                icon={<Trash2 size={14} />}
              >
                ทดสอบกล่องยืนยัน
              </Button>
              {/* ทุก transition ที่ถอยหลัง/ยกเลิก/ปฏิเสธ ใช้กล่องนี้ — ห้ามใช้ window.prompt (audit บล็อกไว้) */}
              <Button tone="warning" onClick={() => setReasonDemo("")} icon={<Undo2 size={14} />}>
                ทดสอบกล่องกรอกเหตุผล
              </Button>
              <Button variant="quiet" onClick={() => setShowSkeleton((value) => !value)}>
                {showSkeleton ? "ดูสถานะว่าง" : "ดูสถานะกำลังโหลด"}
              </Button>
            </div>
            <ReasonDialog
              open={reasonDemo !== null}
              title="ตีกลับให้ผู้จัดทำแก้ไข"
              description="ตัวอย่างกล่องกรอกเหตุผล — ใช้แทน window.prompt ทุกกรณี"
              detail="ผู้จัดทำจะเห็นเหตุผลนี้บนเอกสารและได้รับแจ้งเตือน"
              label="เหตุผลที่ตีกลับ"
              value={reasonDemo || ""}
              onChange={setReasonDemo}
              onClose={() => setReasonDemo(null)}
              onConfirm={() => { setReasonDemo(null); notifyToast("ส่งเหตุผลแล้ว", "success"); }}
              confirmLabel="ยืนยันตีกลับ"
              placeholder="ระบุสิ่งที่ต้องแก้ให้ชัดเจน"
              helpText={`อย่างน้อย 10 ตัวอักษร · ${(reasonDemo || "").length}/500`}
              error={reasonDemo && reasonDemo.trim().length < 10 ? "กรุณาระบุอย่างน้อย 10 ตัวอักษร" : ""}
              minLength={10}
            />
            {showSkeleton ? (
              <SkeletonRows rows={3} />
            ) : (
              <EmptyState icon={Inbox} action={{ label: "สร้างใบแรก", onClick: () => {} }}>
                ยังไม่มีใบเสนอราคาในช่วงที่เลือก
              </EmptyState>
            )}
            <TableShell>
              <table>
                <thead>
                  <tr><th>เลขที่</th><th>ลูกค้า</th><th>สถานะ</th></tr>
                </thead>
                <tbody>
                  <TableEmpty colSpan={3} title="ไม่พบรายการที่ค้นหา" description="ลองล้างตัวกรองแล้วค้นใหม่" />
                </tbody>
              </table>
            </TableShell>

            {/* ── คำอธิบายลอยเมื่อชี้ (Tooltip) ──────────────────────────────────
                ปิดท้ายส่วน "การตอบสนอง" เพราะมันคือระบบพูดกลับหาผู้ใช้เหมือนกัน
                แค่พูดตอนชี้แทนตอนกด · สองทางเข้าต้องเห็นคู่กัน ไม่งั้นคนจะรู้จักแค่ทางเดียว */}
            <div className={styles.stack}>
              <span className={styles.caption}>คำอธิบายลอยเมื่อชี้ — <code>ui/Tooltip</code> สองทางเข้า</span>
              <div className={styles.row}>
                <span className={styles.caption}>ครอบเอง</span>
                {/* ทางเข้าที่ 1 — ใช้เมื่อ **รู้จักตัวที่ชี้ตอนเขียนโค้ด** (หมุดในราง
                    StepTrack ใช้ท่านี้) · ครอบ element ตัวเดียว ไม่มี wrapper เพิ่มใน DOM */}
                <UiTooltip label="รออนุมัติ" note="ยื่นเมื่อ 29/07/2569 · รอผู้จัดการตรวจ">
                  <Button size="sm" variant="ghost" icon={<CircleHelp size={14} />}>ชี้ (หรือแท็บมา) ที่ปุ่มนี้</Button>
                </UiTooltip>
              </div>
              <div className={styles.row}>
                <span className={styles.caption}>ประกาศด้วย data-tip</span>
                {/* ทางเข้าที่ 2 — ไม่ต้องครอบอะไร แค่ติดแอตทริบิวต์ แล้ว <TooltipHost />
                    ตัวเดียวที่ mount ไว้ใน AppLayout เป็นคนดักให้ทั้งแอป
                    (`data-tip-label` = หัวข้อ · `data-tip` = เนื้อ) */}
                <Button
                  size="sm"
                  variant="quiet"
                  data-tip-label="ยอดที่ยังไม่ออกใบ"
                  data-tip="รวมดีลที่ปิด Won แล้วแต่ยังไม่มีใบเสนอราคาอนุมัติ"
                >
                  486,200.00
                </Button>
              </div>
              <span className={styles.caption}>
                และเซลล์ตารางที่ถูก <code>--cell-text-max</code> ตัด — ไม่ต้องประกาศอะไรเลย
              </span>
              {/* 🪤 ตารางสาธิตนี้ต้องบังคับ `white-space: nowrap` เอง (ดู .tipCellDemo)
                  — `TableScroll` ชั้นใหม่ตั้งแค่เพดาน 220px + ellipsis ส่วน nowrap ยังมา
                  จากคลาสชั้นเก่า `.premium-table` ⇒ ตารางที่ห่อด้วย TableScroll เปล่า ๆ
                  ข้อความยาวจะขึ้นบรรทัดใหม่แทนที่จะถูกตัด แล้วกล่องไม่มีวันขึ้นให้ดู */}
              <TableScroll className={styles.tipCellDemo}>
                <table>
                  <thead>
                    <tr><th>ลูกค้า</th><th>หมายเหตุจากลูกค้า</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>บริษัท สหมิตร โปรดักส์ จำกัด</td>
                      <td>ลูกค้าขอให้ลดโทนไม้ลงราวหนึ่งในสาม แล้วเพิ่มความสดช่วงต้นให้ชัดขึ้นก่อนส่งตัวอย่างรอบสาม</td>
                    </tr>
                  </tbody>
                </table>
              </TableScroll>
              <StatusNotice tone="info" title="ทำไมไม่ใช้ title ของเบราว์เซอร์">
                <code>title</code> วาดด้วย<strong>ระบบปฏิบัติการ</strong> — ฟอนต์ สี มุม เงา ไม่ใช่ของเรา ·
                {" "}หน่วงก่อนขึ้นประมาณหนึ่งวินาที · ธีมมืดยังได้กล่องขาวของ OS · และขึ้นตรงเคอร์เซอร์
                {" "}ไม่ได้เกาะกับตัวที่ชี้ ⇒ ทั้งหน้าเป็นดีไซน์ของเรายกเว้นกล่องนี้กล่องเดียว
                {" "}(มติผู้ใช้ 2026-08-24)
                <br />
                ⚠️ <strong>ไม่ผูก aria โดยเจตนา</strong> — กล่องเป็นภาพล้วน (<code>aria-hidden</code>)
                {" "}ข้อความจริงต้องมีอยู่ใน DOM อยู่แล้ว (ป้ายขั้นที่ซ่อนแบบ visually-hidden ·
                {" "}ข้อความเต็มในเซลล์ที่ถูกตัดด้วย CSS ยังอยู่ครบ) ⇒ โปรแกรมอ่านหน้าจออ่านของจริง
                {" "}ไม่ใช่อ่านซ้ำจากกล่องลอย · <strong>อย่าเอากล่องนี้ไปใส่ข้อมูลที่หาไม่ได้จากที่อื่น</strong>
                <br />
                ⚠️ ตัวดักกลางจะ<strong>เงียบ</strong>เมื่อชี้ของที่มีกล่องของตัวเองแล้ว
                {" "}(<code>data-tip-own</code>) — ไม่งั้นหมุดที่อยู่ในเซลล์ซึ่งถูกตัดพอดีจะได้สองกล่อง
                {" "}ซ้อนกัน (เจอจริงตอน UAT 2026-08-24) · และ <code>TooltipHost</code> ต้องมีตัวเดียว
                {" "}ทั้งแอป (<code>tooltip.test.mjs</code> ตรวจไว้) อย่า mount เพิ่มในหน้า
              </StatusNotice>
            </div>
          </div>
        </Section>

        <Section group="shell" active={group}
          title="จุดจัดการเดียวต่อ record"
          subtitle="recordLifecycle · RecordControlCard · RecordActionMenu · TransitionDialog"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info" title="ประกาศกติกาครั้งเดียว ใช้ได้ทั้งการ์ดและแถวตาราง">
              ลีด/ดีล/โครงการ ประกาศ <code>defineLifecycle()</code> ที่เดียว แล้วทั้งการ์ดขวาและปุ่มท้ายแถว
              กิน <code>lifecycle.available(record, user)</code> ตัวเดียวกัน — เห็นปุ่มไหนในแถว แปลว่าในการ์ดก็กดได้
              {" "}สลับสถานะและบทบาทข้างล่างเพื่อดูว่าปุ่มเปลี่ยนตามอะไร
            </StatusNotice>

            <div className={styles.row}>
              <Segmented
                ariaLabel="สถานะตัวอย่าง"
                value={recordStatus}
                onChange={setRecordStatus}
                options={DEMO_STATUSES.map((status) => ({
                  value: status,
                  label: DEMO_LIFECYCLE.statuses[status].label,
                }))}
              />
              <Segmented
                ariaLabel="บทบาทผู้ใช้ตัวอย่าง"
                value={recordRole}
                onChange={setRecordRole}
                options={[
                  { value: "boss", label: "ผู้อนุมัติ" },
                  { value: "staff", label: "พนักงาน" },
                ]}
              />
            </div>

            <p className={styles.caption}>
              <strong>visible vs allow ห้ามสลับ</strong> — เลือก &quot;พนักงาน&quot; ที่สถานะรออนุมัติ: ปุ่มอนุมัติ/ตีกลับ
              {" "}<em>หายไปเลย</em> (ไม่มีสิทธิ์รู้ว่ามีปุ่ม) · เลือกสถานะดำเนินการ: ปุ่มปิดงาน <em>ยังโชว์แต่กดไม่ได้</em>
              {" "}พร้อมบอกเหตุว่ายังมีงานค้าง
            </p>

            <div className={styles.formGrid}>
              <RecordControlCard
                lifecycle={DEMO_LIFECYCLE}
                record={demoRecord}
                user={demoUser}
                onTransition={runDemoTransition}
                /* id ต้องไม่ชนกับ transition ของ lifecycle (ตัวอย่างนี้มี transition ชื่อ
                   `edit` อยู่แล้ว) — ชนแล้วการ์ดจะทิ้งตัวที่ส่งมา ไม่ใช่โชว์ทั้งคู่ */
                extraActions={[
                  { id: "record-edit", kind: "edit", slot: "secondary", label: "แก้ไขข้อมูล", icon: Pencil, onClick: () => notifyToast.info("ตัวอย่าง: เปิดโหมดแก้ไขในหน้า") },
                  { id: "record-delete", kind: "delete", slot: "danger", label: "ลบรายการนี้", icon: Trash2, onClick: () => notifyToast.warning("ตัวอย่าง: เปิดกล่องยืนยันลบ") },
                ]}
              />
              <div className={styles.stack}>
                <TableShell>
                  <table>
                    <thead>
                      <tr><th>รายการ</th><th>สถานะ</th><th className="text-right">จัดการ</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>DEMO-0001</td>
                        <td>
                          <StatusBadge
                            dot
                            tone={DEMO_LIFECYCLE.statusMeta(demoRecord).tone}
                            label={DEMO_LIFECYCLE.statusMeta(demoRecord).label}
                          />
                        </td>
                        <td>
                          <RecordActionMenu
                            lifecycle={DEMO_LIFECYCLE}
                            record={demoRecord}
                            user={demoUser}
                            manageHref="/settings/design-preview"
                            onTransition={runDemoTransition}
                            onEdit={() => setRecordLog('onEdit("DEMO-0001")')}
                            onDelete={() => setRecordLog('onDelete("DEMO-0001")')}
                            canDelete
                            recordLabel="DEMO-0001"
                            /* ทางไปหน้าอื่นที่ lifecycle ไม่รู้จัก — ใช้ href เพื่อให้เป็น
                               <Link> จริง (เปิดแท็บใหม่/คัดลอกลิงก์ได้) ไม่ใช่ปุ่มที่ router.push */
                            extraItems={[
                              { id: "demo-timeline", label: "ไทม์ไลน์", icon: CalendarClock, href: "/settings/design-preview" },
                              { id: "demo-doc", label: "เอกสารที่เกี่ยวข้อง", icon: FileText, href: "/settings/design-preview" },
                            ]}
                          />
                        </td>
                      </tr>
                      {/* แถวที่สอง — หน้าที่ **ไม่มี lifecycle** เรียก RowActionMenu ตรง ๆ
                          (6 ใน 7 ที่เรียกจริงวันนี้เป็นแบบนี้: งานส่วนตัว · ทะเบียนกลิ่น ·
                          ทะเบียนสูตร · กระดานบรีฟ · กระดานพัฒนาสูตร · งวดชำระของ SO) */}
                      <tr>
                        <td>DEMO-0002</td>
                        <td><StatusBadge tone="neutral" label="ไม่ผูก lifecycle" /></td>
                        <td>
                          <RowActionMenu
                            label="การจัดการของ DEMO-0002"
                            busy={rowMenuBusy}
                            items={[
                              /* href = <Link> จริง เปิดแท็บใหม่/คัดลอกลิงก์ได้ ไม่ใช่ปุ่มที่ router.push */
                              { id: "open", label: "เปิดหน้าเต็ม", icon: FileText, href: "/settings/design-preview" },
                              { id: "edit", label: "แก้ไขรายการ", icon: Pencil, onClick: () => setRowMenuLog('onClick("edit")') },
                              /* กดไม่ได้ = ยังโชว์ พร้อมเหตุผลใน title (กติกาเดียวกับปุ่มติดด่าน) */
                              { id: "history", label: "ประวัติการแก้ไข", icon: CalendarClock, disabled: true, disabledReason: "รายการนี้ยังไม่เคยถูกแก้" },
                              { id: "recall", label: "ดึงกลับมาแก้", icon: Undo2, tone: "warning", separatorBefore: true, onClick: () => setRowMenuLog('onClick("recall")') },
                              { id: "delete", label: "ลบรายการนี้", icon: Trash2, tone: "danger", onClick: () => setRowMenuLog('onClick("delete")') },
                            ]}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </TableShell>
                <div className={styles.row}>
                  <span className={styles.caption}>
                    แถวล่างใช้ <code>RowActionMenu</code> ตรง ๆ — <code>items</code> ครบทุกฟีเจอร์:
                    {" "}<code>href</code> · <code>disabled</code> + <code>disabledReason</code> ·{" "}
                    <code>tone: warning|danger</code> · <code>separatorBefore</code>
                  </span>
                  <Button size="sm" onClick={() => setRowMenuBusy((value) => !value)}>
                    {rowMenuBusy ? "เลิกจำลอง busy" : "จำลอง busy (กำลังบันทึก)"}
                  </Button>
                </div>
                {rowMenuLog ? (
                  <p className={`${styles.caption} ${styles.mono}`}>{rowMenuLog}</p>
                ) : (
                  <p className={styles.caption}>เปิดเมนู &quot;…&quot; ของแถวล่างแล้วกดดู — รายการที่กดไม่ได้จะไม่ยิง callback</p>
                )}
                <StatusNotice tone="info" title="เมนูท้ายแถวต้องเปิดผ่าน portal เสมอ">
                  <code>RowActionMenu</code> ตั้งใจให้ <b>generic ไม่ผูกกับ lifecycle</b> เพราะยังมีหน้ารายการ
                  {" "}อีก ~24 หน้าที่รอย้ายมาใช้ท่านี้ — <code>RecordActionMenu</code> (แถวบน) คือตัวห่อที่
                  {" "}อ่าน <code>lifecycle.available()</code> แล้วประกอบ <code>items</code> ให้เอง ⇒ หน้าที่มี
                  {" "}lifecycle ใช้ตัวห่อ · หน้าที่ยังไม่มี ส่ง <code>items</code> เองได้เลย ไม่ต้องรอ
                  <br />
                  ⚠️ เมนูเปิดผ่าน <b>portal + <code>position: fixed</code></b> — วางเป็น absolute ในแถว
                  {" "}จะโดน <code>overflow</code> ของ <code>TableScroll</code> ตัดหายทันที (กติกาเดียวกับ
                  {" "}<code>FilterPopover</code> และเมนูของ <code>MenuSelect</code>)
                  <br />
                  <code>busy</code> ปิดทั้งปุ่มเปิดและทุกรายการพร้อมกัน — กดปุ่มข้างบนดูได้ · ใช้ตอนแถวนั้น
                  {" "}กำลังบันทึกอยู่ ไม่ใช่ตอนที่ผู้ใช้ไม่มีสิทธิ์ (ไม่มีสิทธิ์ = ไม่ส่งรายการนั้นมาตั้งแต่แรก)
                </StatusNotice>
                <p className={styles.caption}>
                  แถวตารางเหลือ 2 ชิ้น: ปุ่มก้าวถัดไปปุ่มเดียว มีสีตามขั้น (rowTone) และเมนู
                  {" "}&quot;…&quot; ที่รวมของที่เหลือ (ย้ายสถานะอื่น · แก้ไข · ลบ) — เมนูเปิดผ่าน portal
                  {" "}จึงไม่โดนกรอบตารางตัด · ลิงก์ &quot;จัดการ&quot; ใส่เฉพาะตารางที่ชื่อในแถวยังไม่เป็นลิงก์
                </p>
                {recordLog ? (
                  <p className={`${styles.caption} ${styles.mono}`}>{recordLog}</p>
                ) : (
                  <p className={styles.caption}>กดปุ่มดูได้ — หน้า feature ส่งมาแค่ <code>onTransition(id, values)</code></p>
                )}
                <p className={styles.caption}>
                  ปุ่ม &quot;ยกเลิกรายการ&quot; คือตัวอย่าง TransitionDialog ที่มี <code>fields</code> —
                  {" "}ช่องเลือก/เลือกคน/จำนวนเงิน/วันเวลา ใช้ primitive เดิมทุกช่อง ไม่มี input ใหม่
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section group="shell" active={group}
          title="โครงหน้ารายละเอียด"
          subtitle="DetailOverview หัวเรื่อง · DetailPageLayout เนื้อหาซ้าย + รางขวา · DocumentControlCard จุดจัดการเอกสาร · VersionControlCard ร่าง/เผยแพร่"
        >
          <div className={styles.stack}>
            <StatusNotice tone="info">
              ทุกหน้ารายละเอียดของระบบ (ใบเสนอราคา · SO · ใบขอราคาผลิต · ดีล · โครงการ) ใช้ชุดนี้
              ชุดเดียว — หน้าใหม่ประกอบจาก primitive พวกนี้ ไม่ต้องวางโครงเอง
            </StatusNotice>

            <DetailOverview
              eyebrow="ใบเสนอราคา"
              title="QT-26070128"
              description="บริษัท สหมิตร โปรดักส์ จำกัด — ก้านไม้หอม 6 รายการ"
              badges={<DetailStateBadge label="รออนุมัติ" color={toneColor("warning")} />}
              actions={<Button size="sm" icon={<Search size={14} />}>ดูเอกสาร</Button>}
              facts={[
                { label: "มูลค่ารวม", value: `${money(486200)} บาท` },
                { label: "ผู้จัดทำ", value: "สิทธิพงษ์ ศรีสุข" },
                { label: "วันที่ออก", value: "29/07/2569" },
                { label: "ยืนราคาถึง", value: "28/08/2569" },
              ]}
            />

            <DetailPageLayout
              aside={(
                <ContextualRightRail>
                  <DocumentControlCard
                    status="รออนุมัติ"
                    statusColor={toneColor("warning")}
                    statusDescription="ยื่นเมื่อ 29/07/2569 · รอผู้จัดการอนุมัติ"
                    workflowSteps={[
                      { id: "draft", label: "ร่าง", state: "done" },
                      { id: "submit", label: "ยื่นอนุมัติ", state: "done", hint: "29/07/2569" },
                      { id: "approve", label: "อนุมัติ", state: "current" },
                      { id: "send", label: "ส่งลูกค้า", state: "pending" },
                    ]}
                    primaryAction={{ id: "approve", label: "อนุมัติ", tone: "primary" }}
                    secondaryActions={[{ id: "reject", label: "ตีกลับ" }]}
                    dangerActions={[{ id: "withdraw", label: "ดึงกลับ" }]}
                  >
                    <DocumentReadinessList
                      items={[
                        { id: "customer", label: "ข้อมูลลูกค้าครบ", detail: "เลขผู้เสียภาษี · ที่อยู่", ready: true },
                        { id: "price", label: "ราคาผลิตอนุมัติแล้ว", ready: true },
                        { id: "sign", label: "ลายเซ็นผู้อนุมัติ", detail: "ยังไม่ได้อัปโหลด", ready: false },
                      ]}
                    />
                  </DocumentControlCard>
                  <VersionControlCard
                    published={{ label: "เวอร์ชัน 3", meta: "เผยแพร่ 12/07/2569" }}
                    draft={{ label: "ร่างใหม่", meta: "แก้ล่าสุด 29/07/2569" }}
                    dirty
                    onSaveDraft={() => {}}
                    onPublish={() => {}}
                    onDiscard={() => {}}
                  />
                </ContextualRightRail>
              )}
            >
              <DetailCard icon={Inbox} eyebrow="รายการสินค้า" title="6 รายการ" meta="รวม 486,200.00 บาท">
                <TableScroll surface="embedded">
                  <table>
                    <thead>
                      <tr><th>รหัส</th><th>รายการ</th><th className={styles.numeric}>จำนวน</th><th className={styles.numeric}>รวม</th></tr>
                    </thead>
                    <tbody>
                      {/* DetailRow = แถวที่ทั้งแถวคลิกได้ **ด้วยเมาส์** — ทางเข้าจริงคือ <Link>
                          ในเซลล์แรก (คีย์บอร์ด · โปรแกรมอ่านหน้าจอ · คลิกขวาเปิดแท็บใหม่) และปุ่ม/
                          ลิงก์อื่นในแถวยังทำงานของตัวเองตามเดิม · href ของแถวกับของลิงก์ต้องเป็น
                          **ตัวเดียวกัน** ⇒ ด่าน ROW_MIRROR ใน `npm run audit:ui` บังคับไว้
                          ที่นี่จึงยกเป็น detailHref ตัวเดียวให้เห็นท่าที่ควรลอก
                          🐞 แก้ 2026-09-02: ของเดิมเป็น `href="#"` โดย **ไม่มีลิงก์ในเซลล์เลย** —
                          หน้าต้นแบบสาธิตท่าที่ผิดอยู่ ซึ่งอันตรายกว่าด่านแดง เพราะคนก๊อปไปทั้งบล็อก */}
                      {DEMO_LINE_ITEMS.map((row) => {
                        /* หน้าสาธิตไม่มีปลายทางจริง จึงใช้แองเคอร์ **รายแถว** ไม่ใช่ `#` เปล่า:
                           `#` เท่ากันทุกแถว (สาธิต "แต่ละแถวมีปลายทางของตัวเอง" ไม่ได้) และกดแล้ว
                           เด้งขึ้นหัวหน้า ส่วนแองเคอร์รายแถวไม่ขยับหน้าไปไหนเพราะไม่มี id นั้นจริง
                           🪤 ไม่ใส่ prefetch={false} เหมือน 8 หน้าจริง — หน้าจริงใส่เพราะลิสต์ยาว
                           ยิง RSC prefetch เป็นพันครั้ง/วัน · ที่นี่ 3 แถวและ href เป็นแองเคอร์
                           ใส่แล้วจะสอนผิดว่า "ต้องใส่เสมอ" */
                        const detailHref = `#${row.code}`;
                        return (
                          <DetailRow key={row.code} href={detailHref}>
                            <td>
                              {/* `linklike mono` = ทรงเดียวกับเลขที่เอกสารในหน้า SO/QT/finance
                                  และเป็นที่มาของวงโฟกัส (`.linklike:focus-visible`) — หลังถอด
                                  `.detail-row:focus-visible` ทิ้ง วงโฟกัสอยู่รอบ *ลิงก์* ไม่ใช่รอบแถว
                                  คนที่เปิดหน้านี้ต้องเห็นความต่างนั้นด้วยตา */}
                              <Link href={detailHref} className="linklike mono">{row.code}</Link>
                            </td>
                            <td>{row.name}</td>
                            <td className="num">{fmtNumber(row.qty)}</td>
                            <td className="num">{money(row.total)}</td>
                          </DetailRow>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </DetailCard>

              <ContextGrid>
                <ContextCard
                  href="#"
                  icon={Inbox}
                  eyebrow="ดีลต้นทาง"
                  title="D-2569-0042"
                  subtitle="บริษัท สหมิตร โปรดักส์ จำกัด"
                  badges={<DetailStateBadge label="เจรจา" color={toneColor("info")} />}
                  facts={[{ label: "มูลค่า", value: money(486200) }, { label: "โอกาส", value: "60%" }]}
                />
                <ContextCard
                  href="#"
                  icon={Inbox}
                  eyebrow="ใบขอราคาผลิต"
                  title="CR-2569-0018"
                  subtitle="อนุมัติราคาแล้ว"
                  badges={<DetailStateBadge label="อนุมัติแล้ว" color={toneColor("success")} />}
                />
              </ContextGrid>
            </DetailPageLayout>

            {/* ── ClickableCard = ฝาแฝดของ DetailRow ฝั่งการ์ด ────────────────────
                ต่างกันแค่เรนเดอร์ `<div>` แทน `<tr>` เท่านั้น และมีด่านคู่กันใน
                `npm run audit:ui`: `ROW_MIRROR` คุมตารางข้างบน · `CARD_MIRROR` คุมการ์ดนี้
                (hard-zero ทั้งคู่) ⇒ วางติดกันเพื่อให้เห็นว่าเป็นกฎเดียวกันคนละแท็ก */}
            <div className={styles.stack}>
              <span className={styles.caption}>
                ClickableCard — การ์ดที่ทั้งใบคลิกได้ (ฝาแฝดของตาราง DetailRow ข้างบน)
              </span>

              <StatusNotice tone="warning" title="เลือกสามทางจาก “ข้างในมี interactive ไหม” ไม่ใช่จากหน้าตา">
                <b>1) ข้างในไม่มีปุ่ม/ลิงก์/ช่องกรอกเลย → ห่อทั้งใบด้วย <code>&lt;Link className=&quot;card-link&quot;&gt;</code></b>
                {" "}(ย้าย className/style ของ <code>&lt;div&gt;</code> เดิมขึ้นไปทั้งชุด) ⇒{" "}
                <b>ไม่ต้องใช้ ClickableCard เลย</b> และไม่ต้องพึ่งด่านอะไร
                <br />
                <b>2) ข้างในมีปุ่ม/ลิงก์ของตัวเอง → ใช้ <code>ClickableCard</code></b> เพราะห่อทั้งใบไม่ได้
                {" "}(<code>&lt;a&gt;</code> ห้ามมี interactive descendant) ⇒ ทางเข้าจริงคือ{" "}
                <code>&lt;Link&gt;</code> ที่หัวการ์ด ด้วย <b>href นิพจน์เดียวกันเป๊ะ</b> ส่วน{" "}
                <code>onClick</code> บน <code>&lt;div&gt;</code> เหลือเป็น <b>ทางลัดของเมาส์</b>
                <br />
                <b>3) การ์ดที่ทำงานอยู่ในหน้าเดิม</b> (เปิดโมดัล · ย่อ-ขยาย) → <code>&lt;button type=&quot;button&quot;&gt;</code>
                {" "}ไม่ใช่ไฟล์นี้ · และ <code>&lt;div&gt;</code> ข้างในต้องกลายเป็น <code>&lt;span&gt;</code> ก่อน
                <br />
                🪤 กับดักที่เจอจริงตอนไล่ทีละใบ: <b>การ์ดที่ปุ่มโผล่แบบมีเงื่อนไข</b>
                {" "}(<code>pending &amp;&amp; canApproveRow</code>) อ่านผ่าน ๆ เหมือนไม่มีปุ่ม ⇒ ครอบทั้งใบไป
                แล้วจะได้ <code>&lt;a&gt;</code> ที่มี <code>&lt;button&gt;</code> อยู่ข้างใน<b>เฉพาะบัญชีผู้อนุมัติ</b>
                {" "}ซึ่งคนเขียนไม่มีวันเห็นบนเครื่องตัวเอง — ต้องอ่าน<b>ทุกกิ่ง ternary</b>ก่อนตัดสิน
                <br />
                🪤 <code>&lt;ClickableCard … /&gt;</code> แบบ self-closing <b>ตกด่านเสมอ</b> (หาแท็กปิดไม่เจอ
                → เนื้อว่าง → ไม่มีลิงก์) · 🚫 ห้ามใส่ <code>role</code>/<code>tabIndex</code>/<code>onKeyDown</code>
                {" "}บน <code>&lt;div&gt;</code> ตัวนี้ ด้วยเหตุผลเดียวกับที่ถอดออกจาก <code>&lt;tr&gt;</code> ของ DetailRow
              </StatusNotice>

              <div className={styles.formGrid}>
                {/* ท่า 2 — มีปุ่มอยู่ข้างใน จึงห่อทั้งใบไม่ได้ */}
                <ClickableCard href={demoCardHref} className={`${styles.demoCard} clickable-row cursor-pointer p-4 flex flex-col gap-2`}>
                  {/* ทางเข้าจริงของคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/คลิกขวาเปิดแท็บใหม่ อยู่ที่นี่
                      🪤 ไม่แปลงเป็น <strong> — `.linklike-block > strong` จะเติมเส้นใต้จาง ๆ
                         เข้ามาแล้วหน้าตาการ์ดเปลี่ยนจากของเดิม (ท่าเดียวกับทะเบียนลูกค้า) */}
                  <Link href={demoCardHref} className="min-w-0 linklike linklike-block" title="เปิดหน้าลูกค้า">
                    <div className={styles.mono}>AR-1042</div>
                    <div>บริษัท สหมิตร โปรดักส์ จำกัด</div>
                  </Link>
                  <span className={styles.caption}>ทีม KA · รออนุมัติ</span>
                  {/* ปุ่มของตัวเอง = เหตุผลที่การ์ดใบนี้ห่อทั้งใบไม่ได้ · `isInteractiveTarget`
                      เห็นปุ่มเองผ่าน closest() จึงไม่ต้องมีตัวห่อ stopPropagation อีกชั้น */}
                  <ActionBar>
                    <ActionButton kind="approve" type="button" onClick={() => notifyToast.info("ตัวอย่าง: อนุมัติ AR-1042")} />
                    <ActionButton kind="reject" type="button" label="ไม่อนุมัติ" onClick={() => notifyToast.info("ตัวอย่าง: ตีกลับ AR-1042")} />
                  </ActionBar>
                </ClickableCard>

                {/* ท่า 1 — ข้างในไม่มี interactive เลย ⇒ ไม่ต้องใช้ ClickableCard */}
                <Link href="#AR-1043" className={`card-link ${styles.demoCard} p-4 flex flex-col gap-2`}>
                  <span className={styles.mono}>AR-1043</span>
                  <span>Bright Living Co., Ltd.</span>
                  <span className={styles.caption}>ทีม ODM · อนุมัติแล้ว</span>
                </Link>
              </div>
            </div>

            <div className={styles.stack}>
              <span className={styles.caption}>ActionQueue — คิวงานค้างบนหน้าภาพรวม</span>
              <ActionQueue
                items={[
                  { id: "a1", title: "ใบเสนอราคา 3 ใบรออนุมัติ", subtitle: "เกินกำหนด 1 ใบ", tone: "warning", onClick: () => {} },
                  { id: "a2", title: "ลีดใหม่ 5 รายรอคัดกรอง", tone: "info", onClick: () => {} },
                ]}
              />
              <span className={styles.caption}>ActionQueue ตอนไม่มีงานค้าง</span>
              <ActionQueue items={[]} />
            </div>

            {/* ── ApprovalQueue — คนละตัวกับ ActionQueue ข้างบน ────────────────
                สองตัวนี้หน้าตาใกล้กันจนหยิบผิดกันมาแล้ว วางติดกันเพื่อให้เห็นเส้นแบ่ง */}
            <div className={styles.stack}>
              <span className={styles.caption}>
                ApprovalQueue — ของที่รอ “คนที่กำลังดูอยู่” อนุมัติ คาดเหนือตารางของทะเบียนนั้น
              </span>

              <StatusNotice tone="info" title="ActionQueue พาไปที่อื่น · ApprovalQueue ให้ตัดสินตรงนี้">
                <b>ActionQueue</b> = สรุปงานค้างบนหน้าภาพรวม แต่ละแถวคือ &quot;ไปดูต่อที่ไหน&quot; ·{" "}
                <b>ApprovalQueue</b> = ใบที่รอ<b>บัญชีที่เปิดจออยู่</b>อนุมัติ คาดไว้เหนือตารางของ
                ทะเบียนนั้น และ<b>ว่างเมื่อไรหายไปทั้งกล่อง</b> (<code>if (!items.length) return null</code>)
                {" "}เพื่อไม่ให้รกสำหรับคนที่ไม่ใช่ผู้อนุมัติ — ไม่มีสถานะ &quot;คิวว่าง&quot; ให้โชว์
                <br />
                ปุ่มท้ายแถวมีสองทาง เลือกตาม<b>ต้นทุนของการตัดสิน</b>:{" "}
                <b><code>onDecide</code></b> = ติ๊กจบในลิสต์ ใช้กับระเบียนสั้นที่อ่านจบในบรรทัดเดียว
                (ลูกค้า · สินค้า) · <b><code>renderAction</code></b> = ปุ่ม &quot;เปิดใบ&quot; ใช้กับเอกสารขาย
                เพราะการอนุมัติ QT/SO <b>ตรึงลายเซ็นผู้อนุมัติกับ fingerprint ของเนื้อใบ</b> ⇒
                ผู้อนุมัติต้องเห็นรายการ/ราคาก่อนกด และโมดัลยืนยันต้องบอกผลลัพธ์
                (ยอด Actual · งวดชำระ) ตามกติกา <code>approvalPrompt</code>
                <br />
                ⚠️ <code>rowHref</code> เป็น prop <b>บังคับ</b> — คิวนี้มีงานเดียวคือ &quot;พาไปเปิดของ
                ที่รออยู่&quot; แถวที่ไม่พาไปไหนไม่ใช่งานของคิวนี้ · ทางเข้าเป็น{" "}
                <code>&lt;Link&gt;</code> ในบล็อกข้อความ (ห่อทั้งแถวไม่ได้ เพราะทุกแถวมีปุ่มของตัวเอง
                อยู่ท้ายแถวเสมอทุกโหมด)
              </StatusNotice>

              <span className={styles.caption}>
                โหมด onDecide — ตัดสินในที่เลย (ใส่ 5 ใบเพื่อให้เกิน QUEUE_PREVIEW=3 แล้วเห็นปุ่ม “ดูอีก…”)
              </span>
              <ApprovalQueue
                items={demoQueue}
                onDecide={decideDemoQueue}
                primary={(record) => record.code}
                secondary={(record) => `${record.name} · ทีม ${record.team}`}
                /* หน้าสาธิตไม่มีปลายทางจริง จึงใช้แองเคอร์ **รายแถว** ไม่ใช่ `#` เปล่า
                   (เหตุผลเดียวกับตาราง DetailRow ข้างบน) */
                rowHref={(record) => `#${record.id}`}
              />
              {demoQueue.length === 0 && (
                <p className={styles.note}>
                  คิวว่างแล้ว ⇒ <b>กล่องหายไปทั้งใบ</b> ไม่เหลือหัวข้อค้างไว้ — นี่คือพฤติกรรมที่ถูก
                </p>
              )}
              <div className={styles.row}>
                <Button size="sm" icon={<Undo2 size={14} aria-hidden="true" />} onClick={() => { setDemoQueue(DEMO_QUEUE_MASTERS); setDemoQueueLog(""); }}>
                  คืนค่าคิว
                </Button>
                {demoQueueLog
                  ? <span className={`${styles.caption} ${styles.mono}`}>{demoQueueLog}</span>
                  : <span className={styles.caption}>กดอนุมัติ/ไม่อนุมัติดูได้ — หน้า feature ส่งมาแค่ <code>onDecide(record, status)</code></span>}
              </div>

              <span className={styles.caption}>
                โหมด renderAction — ไปตัดสินที่หน้าเอกสาร (ใบเสนอราคา · ใบสั่งขาย)
              </span>
              <ApprovalQueue
                items={DEMO_QUEUE_DOCS}
                unit="ใบ"
                primary={(doc) => doc.id}
                secondary={(doc) => `${doc.customer} · ${fmtMoney(doc.amount)}`}
                rowHref={(doc) => `#${doc.id}`}
                renderAction={(doc) => (
                  <Button as={Link} href={`#${doc.id}`} tone="primary" size="sm">เปิดใบเพื่ออนุมัติ</Button>
                )}
              />
            </div>

            {/* AccessDenied เป็น "สถานะทั้งหน้า" ไม่ใช่ชิ้นส่วนที่เอาไปวางในหน้าอื่น
                วางในกรอบเพื่อให้เห็นว่าหน้าตาเต็มหน้าเป็นแบบไหน */}
            <div className={styles.stack}>
              <span className={styles.caption}>AccessDenied — หน้าที่สิทธิ์ไม่ถึง (แสดงในกรอบจำลอง)</span>
              <div className={styles.pageFrame}>
                <AccessDenied
                  title="ใบเสนอราคา"
                  message="บัญชีของคุณไม่มีสิทธิ์เปิดหน้านี้ — ติดต่อผู้ดูแลระบบถ้าคิดว่าควรเข้าได้"
                />
              </div>
            </div>
          </div>
        </Section>
      </div>
    </Workspace>
  );
}
