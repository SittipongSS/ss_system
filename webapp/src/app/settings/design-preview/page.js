"use client";

/* ต้นแบบดีไซน์ของระบบ — หน้าจอเดียวที่รวม primitive กลางทุกตัวไว้ให้ดูพร้อมกัน

   มีไว้สองอย่าง:
   1) คนทำหน้าใหม่เปิดดูก่อนว่า "ของกลางมีอะไรให้ใช้บ้าง" แทนการก๊อปคลาสจากหน้าอื่น
      (ที่ผ่านมาคือสาเหตุที่ปุ่ม/ตาราง/การ์ดหน้าตาไม่ตรงกันข้ามโมดูล)
   2) เปลี่ยนโทเคนหรือ primitive แล้วเปิดหน้านี้หน้าเดียวก็เห็นผลกระทบทั้งระบบ
      ทั้งโหมดสว่างและมืด (สลับธีมที่แถบบนได้เลย)

   หน้านี้ห้ามผูกกับข้อมูลจริงหรือ API ใด ๆ — ต้องเปิดได้เสมอแม้ระบบหลังบ้านล่ม */

import { useEffect, useState } from "react";
import {
  Palette,
  Pencil, Plus, Search, Inbox, Trash2, Check, Info, Undo2, Users,
  CalendarClock, ChevronDown, FileText, LayoutGrid, Settings, UserRound,
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
import { TableScroll, TableShell, TableEmpty } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import Tag from "@/components/ui/Tag";
import CountBadge from "@/components/ui/CountBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import KpiCard from "@/components/ui/KpiCard";
import Tabs from "@/components/ui/Tabs";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import DateTimeInput from "@/components/ui/DateTimeInput";
import MonthPicker from "@/components/ui/MonthPicker";
import SortControl from "@/components/ui/SortControl";
import FilterPopover from "@/components/ui/FilterPopover";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import MoneyInput from "@/components/ui/MoneyInput";
import PhoneInput from "@/components/ui/PhoneInput";
import NationalIdInput from "@/components/ui/NationalIdInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TwoPanePicker from "@/components/ui/TwoPanePicker";
import PersonSelect from "@/components/ui/PersonSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import SaveStatus from "@/components/ui/SaveStatus";
import FormActions from "@/components/ui/FormActions";
import ReadableText from "@/components/ui/ReadableText";
import Pager from "@/components/ui/Pager";
import { notifyToast } from "@/components/ui/Toast";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import RecordControlCard from "@/components/ui/RecordControlCard";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import DetailRow from "@/components/ui/DetailRow";
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
import { STATUS_TONES, toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";

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
/* tone ที่โชว์ = ลิสต์กลางจาก lib/ui/tone.js — เพิ่ม tone ใหม่แล้วหน้านี้ขึ้นเอง
   (เดิมหน้านี้ถือลิสต์ของตัวเอง แล้วตกหล่นได้เงียบ ๆ) */
const BADGE_TONES = STATUS_TONES;

/* ชื่อคลาสป้ายเก่าที่ยังเหลือในโค้ด + จำนวนจุดที่ใช้จริง
   ⚠️ ตัวเลขพวกนี้เคยเขียนฝังไว้ในข้อความแล้วไม่มีใครอัปเดต — หน้าต้นแบบจึงบอกเลข
   ที่คลาดจากของจริงอยู่หลายเดือน `badgeFamilies.test.mjs` ตรวจให้ตรงกับการนับจริง
   ทุกครั้งที่รันเทสต์แล้ว (เลขเปลี่ยน = เทสต์ตก ให้แก้ตัวเลขตรงนี้) */
const BADGE_FAMILIES = [
  { cls: "ui-badge", count: 157 },
  { cls: "status-pill", count: 44 },
  { cls: "chip", count: 22 },
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

const money = (value) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* วันนี้แบบ ISO (โซนเวลาเครื่อง) — ใช้เป็น min ของตัวอย่าง "ห้ามเลือกย้อนหลัง" */
const DEMO_TODAY = (() => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const CHART_DATA = [
  { month: "เม.ย.", actual: 3.8, target: 4.2 },
  { month: "พ.ค.", actual: 4.4, target: 4.6 },
  { month: "มิ.ย.", actual: 5.1, target: 5.0 },
  { month: "ก.ค.", actual: 4.82, target: 6.5 },
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

const DEMO_USERS = [
  { id: "u1", name: "สิทธิพงษ์ ศรีสุข", team: "KA", department: "SA" },
  { id: "u2", name: "ปัทมา วงศ์ทอง", team: "ODM", department: "SA" },
];

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

/* สวิตช์ดีไซน์ v2 "โต๊ะช่าง" (docs/design-v2-plan.md) — เก็บใน localStorage.ds
   แล้วให้ theme-init ใน layout.js ติด attribute ก่อน paint ทุกหน้า
   อยู่บนหน้านี้หน้าเดียวโดยเจตนา: คนที่ต้องเห็น v2 ระหว่างพัฒนาคือคนที่เปิด
   หน้าต้นแบบอยู่แล้ว ผู้ใช้ทั่วไปไม่มีทางสลับโดยบังเอิญ */
function DesignV2Toggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.documentElement.getAttribute("data-ds") === "v2");
  }, []);
  const flip = () => {
    const next = !on;
    setOn(next);
    if (next) {
      localStorage.ds = "v2";
      document.documentElement.setAttribute("data-ds", "v2");
    } else {
      localStorage.removeItem("ds");
      document.documentElement.removeAttribute("data-ds");
    }
  };
  return (
    <Button size="sm" variant={on ? undefined : "quiet"} tone={on ? "accent" : undefined} onClick={flip}>
      ดีไซน์ v2 (โต๊ะช่าง): {on ? "เปิด" : "ปิด"}
    </Button>
  );
}

export default function DesignPreviewPage() {
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState("list");
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
  const [demoCustomer, setDemoCustomer] = useState("c1");
  const [demoFreeText, setDemoFreeText] = useState("");
  const [demoPerson, setDemoPerson] = useState("u1");
  const [demoCategory, setDemoCategory] = useState("AR-RD");
  const [demoTwoPane, setDemoTwoPane] = useState("");
  const [demoDirty, setDemoDirty] = useState(false);
  const [demoSaving, setDemoSaving] = useState(false);
  const [group, setGroup] = useState(GROUPS[0].key);
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

  return (
    <Workspace
      icon={<Palette size={22} />}
      title="ต้นแบบดีไซน์ระบบ"
      subtitle="primitive กลางของระบบ แยกเป็น 5 กลุ่มตามหน้าที่ — หน้าใหม่ให้หยิบจากที่นี่ ไม่ต้องก๊อปคลาสจากหน้าอื่น"
      back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
      headerRight={<DesignV2Toggle />}
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
                  <span className={styles.navSpacer} />
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

        <Section group="foundation" active={group} title="ตัวอักษร" subtitle="IBM Plex Sans Thai — ชั้นพิมพ์เดียวทั้งระบบ">
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
          subtitle="components/ui/Button.js — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาสปุ่มเอง"
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
          </div>
        </Section>

        <Section group="controls" active={group} title="ตัวควบคุมบนแถบเครื่องมือ" subtitle="ทุกตัวสูงเท่ากันที่ --ctl-h">
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
          </div>
        </Section>

        <Section group="controls" active={group} title="ฟอร์ม" subtitle="ช่องกรอกทุกช่องมาจาก <Input> ตัวเดียว — ไม่ต้องเขียนคลาสเอง">
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
              ช่องหลายบรรทัด
              <Textarea defaultValue="" placeholder="รายละเอียดเพิ่มเติม" />
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
          <StatusNotice tone="info" title="ช่องหลายบรรทัดมีสองงาน อย่าสลับกัน">
            <code>&lt;Textarea&gt;</code> เปล่า ๆ = <b>ช่องกรอกของฟอร์ม</b> (หน้าตาเดียวกับ
            ช่องบรรทัดเดียว) ส่วน <code>variant=&quot;data&quot;</code> = <b>กล่องวางข้อมูลดิบ</b>
            ฟอนต์ mono สูงคงที่ ลากขยายไม่ได้ — สำหรับ JSON/ล็อก/ข้อความที่ก๊อปมาวาง
            เคยมี <code>&lt;textarea&gt;</code> 3 จุดที่ไม่ใส่คลาสเลย ได้กล่องไม่มีขอบ
            พื้นโปร่งใส และสีตัวอักษรไม่เปลี่ยนตามธีม
          </StatusNotice>
          <StatusNotice tone="info" title="อย่าเติม w-full / text-xs / h-[32px] ที่ปลายทาง">
            <code>.premium-input</code> ตั้งความกว้าง 100% ความสูง <code>--ctl-h</code> และขนาด
            ตัวอักษรไว้แล้ว — ที่ผ่านมามี 50 จุดเติม <code>w-full</code> ซ้ำ และบางจุดเขียน
            <code>h-[30px]</code> ทับความสูงมาตรฐาน ทำให้ช่องกรอกในฟอร์มเดียวกันสูงไม่เท่ากัน
          </StatusNotice>
        </Section>

        <Section group="controls" active={group}
          title="ช่องกรอกเฉพาะทาง"
          subtitle="MoneyInput · PhoneInput · NationalIdInput — ทุกตัวเก็บค่าดิบ แล้วจัดรูปแบบตอนแสดง"
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
            </div>

            {/* ค่าที่เก็บจริง — แพตเทิร์นเดียวกับส่วนวันที่/เวลา ถ้าแถวนี้ไม่ตรงกับที่เห็นในช่อง แปลว่าเพี้ยน */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`money=${demoMoney ?? "null"} · moneyNeg=${demoMoneyNeg ?? "null"} · phone="${demoPhone}" · nationalId="${demoNationalId}"`}
            </p>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="ดรอปดาวน์ที่ค้นหาได้"
          subtitle="SearchableSelect เป็นฐาน — PersonSelect และ ProductCategorySelect ห่อทับอีกที"
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
          subtitle="ReadableText — คงการขึ้นบรรทัดที่ผู้ใช้พิมพ์ และขึ้นปุ่มขยายเฉพาะตอนที่ล้นจริง"
        >
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <span className={styles.caption}>ข้อความสั้น — ไม่มีปุ่มขยาย</span>
              <ReadableText text={"ลูกค้าขอให้ลดโทนไม้ลง"} />
            </div>
            <div className={styles.field}>
              <span className={styles.caption}>ข้อความยาว — ตัดที่ 4 บรรทัดแล้วมีปุ่มขยาย</span>
              <ReadableText text={DEMO_LONG_TEXT} />
            </div>
          </div>
        </Section>

        <Section group="controls" active={group}
          title="วันที่ เดือน และเวลา"
          subtitle="DateInput · MonthPicker · TimeInput · DateTimeInput — ทุกตัวเก็บค่าเป็น ISO ไม่พึ่ง locale ของเบราว์เซอร์"
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

            {/* ค่าที่เก็บจริงโชว์ไว้ให้เห็น — เคยมีบั๊กที่ช่องแสดงค่าหนึ่งแต่เก็บอีกค่าหนึ่ง
                ถ้าแถวนี้ไม่ตรงกับที่เห็นในช่อง แปลว่าเพี้ยนแล้ว */}
            <p className={`${styles.caption} ${styles.mono}`}>
              {`date=${demoDate || "\"\""} · bounded=${demoDateBounded || "\"\""} · time=${demoTime || "\"\""} · dateTime=${demoDateTime || "\"\""} · month=${demoMonth}${demoAllMonths ? " (ทุกเดือน)" : ""}`}
            </p>
          </div>
        </Section>

        <Section group="data" active={group} title="ตาราง" subtitle="TableShell รวม toolbar → ตาราง → ท้ายตาราง ไว้ในพาเนลเดียว">
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
                  <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(value) => `฿${value}M`} />} />
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
                  <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(value) => `฿${value}M`} />} />
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

        <Section group="feedback" active={group} title="สถานะและการแจ้งเตือน" subtitle="StatusNotice · Toast · ConfirmDialog · ReasonDialog · EmptyState">
          <div className={styles.stack}>
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
                    </tbody>
                  </table>
                </TableShell>
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
          subtitle="DetailOverview หัวเรื่อง · DetailPageLayout เนื้อหาซ้าย + รางขวา · DocumentControlCard จุดจัดการเอกสาร"
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
                      {/* DetailRow = แถวที่ทั้งแถวคลิกไปหน้ารายละเอียดได้ (ไม่ใช่แค่ลิงก์ในเซลล์)
                          แต่ยังกดปุ่ม/ลิงก์ข้างในได้ตามปกติ */}
                      {DEMO_LINE_ITEMS.map((row) => (
                        <DetailRow key={row.code} href="#">
                          <td className="mono">{row.code}</td>
                          <td>{row.name}</td>
                          <td className="num">{row.qty.toLocaleString("th-TH")}</td>
                          <td className="num">{money(row.total)}</td>
                        </DetailRow>
                      ))}
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
