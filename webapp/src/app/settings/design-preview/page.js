"use client";

/* ต้นแบบดีไซน์ของระบบ — หน้าจอเดียวที่รวม primitive กลางทุกตัวไว้ให้ดูพร้อมกัน

   มีไว้สองอย่าง:
   1) คนทำหน้าใหม่เปิดดูก่อนว่า "ของกลางมีอะไรให้ใช้บ้าง" แทนการก๊อปคลาสจากหน้าอื่น
      (ที่ผ่านมาคือสาเหตุที่ปุ่ม/ตาราง/การ์ดหน้าตาไม่ตรงกันข้ามโมดูล)
   2) เปลี่ยนโทเคนหรือ primitive แล้วเปิดหน้านี้หน้าเดียวก็เห็นผลกระทบทั้งระบบ
      ทั้งโหมดสว่างและมืด (สลับธีมที่แถบบนได้เลย)

   หน้านี้ห้ามผูกกับข้อมูลจริงหรือ API ใด ๆ — ต้องเปิดได้เสมอแม้ระบบหลังบ้านล่ม */

import { useState } from "react";
import {
  Palette, Plus, Search, Inbox, Trash2, Check, Info, Undo2,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartCanvas, ChartLegend, ChartTooltip } from "@/components/ui/ChartCard";
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
import SortControl from "@/components/ui/SortControl";
import FilterPopover from "@/components/ui/FilterPopover";
import Pager from "@/components/ui/Pager";
import { notifyToast } from "@/components/ui/Toast";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import RecordControlCard from "@/components/ui/RecordControlCard";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import { defineLifecycle } from "@/lib/recordLifecycle";
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

const TONES = ["neutral", "primary", "accent", "danger", "warning"];
const BADGE_TONES = ["neutral", "success", "warning", "danger", "info", "accent"];

const ROWS = [
  { code: "QT-26070128", customer: "บริษัท สหมิตร โปรดักส์ จำกัด", amount: 485000, tone: "warning", status: "รออนุมัติ" },
  { code: "QT-26070096", customer: "Bright Living Co., Ltd.", amount: 920000, tone: "success", status: "อนุมัติแล้ว" },
  { code: "QT-26070087", customer: "Maison Life Co., Ltd.", amount: 780000, tone: "neutral", status: "ฉบับร่าง" },
];

const money = (value) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      subtitle="primitive กลางทุกตัวในหน้าเดียว — หน้าใหม่ให้หยิบจากที่นี่ ไม่ต้องก๊อปคลาสจากหน้าอื่น"
      back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
    >
      <div className={styles.stack}>
        <StatusNotice
          tone="info"
          action={<Button as="a" href="/settings/design-preview/compare" size="sm">เทียบกับต้นแบบทีละข้อ</Button>}
        >
          หน้านี้ไม่ต่อกับข้อมูลจริง เปลี่ยนโทเคนใน <code>globals.css</code> หรือแก้ primitive ใน
          {" "}<code>components/ui/</code> แล้วเปิดหน้านี้เพื่อดูผลทั้งระบบพร้อมกัน ทั้งโหมดสว่างและมืด
        </StatusNotice>

        <WorkspaceSection title="พื้นผิว" subtitle="ชั้นพื้นหลังของหน้า การ์ด และแผงลอย">
          <Swatches items={SURFACES} />
          <p className={styles.note}>
            แผงที่ลอยทับเนื้อหา (dropdown / popover / ปฏิทิน) ต้องใช้ <code>--panel-float</code> ที่ทึบ 100%
            เท่านั้น — <code>--panel</code> โปร่ง 8% และต้องมาคู่กับ backdrop-filter
          </p>
        </WorkspaceSection>

        <WorkspaceSection title="สี" subtitle="ความหมายของแต่ละสี — ห้ามใช้ค่าสีดิบนอก token">
          <Swatches items={COLORS} />
        </WorkspaceSection>

        <WorkspaceSection title="ตัวอักษร" subtitle="IBM Plex Sans Thai — ชั้นพิมพ์เดียวทั้งระบบ">
          <div className={styles.typeSample}>
            <h1>หัวเรื่องหน้า · Page title</h1>
            <h2>หัวข้อส่วน · Section</h2>
            <p>เนื้อความปกติ ใช้กับคำอธิบายและข้อมูลทั่วไปในหน้าจอ</p>
            <p className={styles.note}>ข้อความรอง — คำอธิบายใต้ช่องกรอกและหมายเหตุ</p>
            <p className={styles.mono}>1,234,567.89 · QT-26070128 · ตัวเลขและรหัสใช้ฟอนต์ mono</p>
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          title="ปุ่ม"
          subtitle="components/ui/Button.js — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาสปุ่มเอง"
        >
          <div className={styles.stack}>
            {["filled", "outline", "ghost"].map((variant) => (
              <div key={variant} className={styles.row}>
                <span className={styles.caption}>{variant}</span>
                {TONES.map((tone) => (
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
        </WorkspaceSection>

        <WorkspaceSection title="ป้ายสถานะ" subtitle="StatusBadge · Tag · CountBadge">
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
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="ตัวควบคุมบนแถบเครื่องมือ" subtitle="ทุกตัวสูงเท่ากันที่ --ctl-h">
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
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="ฟอร์ม" subtitle="ช่องกรอกทั้งระบบใช้ .premium-input ชุดเดียว">
          <div className={styles.formGrid}>
            <label className={styles.field}>
              ช่องข้อความ
              <input className="premium-input" defaultValue="บริษัท สหมิตร โปรดักส์ จำกัด" />
            </label>
            <label className={styles.field}>
              ดรอปดาวน์
              <Select value={docType} onChange={(event) => setDocType(event.target.value)}>
                <option value="qt">ใบเสนอราคา</option>
                <option value="so">Sale Order</option>
              </Select>
            </label>
            <label className={styles.field}>
              ช่องที่ผิดพลาด
              <input className="premium-input error" defaultValue="" placeholder="ต้องกรอกช่องนี้" />
            </label>
            <label className={styles.field}>
              ช่องที่ล็อก
              <input className="premium-input" defaultValue="QT-26070128" readOnly disabled />
            </label>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="ตาราง" subtitle="TableShell รวม toolbar → ตาราง → ท้ายตาราง ไว้ในพาเนลเดียว">
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
        </WorkspaceSection>

        <WorkspaceSection
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
        </WorkspaceSection>

        <WorkspaceSection
          title="แถบปุ่มท้ายฟอร์ม"
          subtitle="ลอยติดขอบล่างขณะเลื่อน — ต้องทึบ 100% ไม่ให้ช่องกรอกทะลุขึ้นมา"
        >
          <div className={styles.scrollDemo}>
            <div className={styles.formGrid}>
              {["ผู้ประสานงาน (AC)", "ผู้ตรวจสอบ", "ทีมที่รับผิดชอบ", "วันเริ่มโครงการ", "วันส่งมอบ", "หมายเหตุ"].map((label) => (
                <label key={label} className={styles.field}>
                  {label}
                  <input className="premium-input" defaultValue="— ไม่ระบุ —" />
                </label>
              ))}
            </div>
            <div className="form-action-bar">
              <Button variant="quiet">ยกเลิก</Button>
              <Button tone="primary">สร้างโครงการ</Button>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="ตัวเลขสรุป" subtitle="MetricStrip สำหรับแถบ KPI · KpiCard สำหรับการ์ดเดี่ยว">
          <div className={styles.stack}>
            <MetricStrip>
              <Metric icon={<Check size={16} />} label="อนุมัติแล้ว" value="18" note="5 ใบสัปดาห์นี้" />
              <Metric icon={<Info size={16} />} label="รออนุมัติ" value="9" note="3 ใบใกล้เลยกำหนด" tone="warning" />
              <Metric icon={<Inbox size={16} />} label="ฉบับร่าง" value="12" />
            </MetricStrip>
            <div className={styles.formGrid}>
              <KpiCard label="ยอดขายเดือนนี้" value={4820000} hint="+12.4% เทียบเดือนก่อน" tone="accent" />
              <KpiCard label="เป้าหมายเดือน" value={6500000} hint="ทำได้แล้ว 74.2%" tone="info" />
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="สถานะและการแจ้งเตือน" subtitle="StatusNotice · Toast · ConfirmDialog · ReasonDialog · EmptyState">
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
        </WorkspaceSection>

        <WorkspaceSection
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
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </TableShell>
                <p className={styles.caption}>
                  แถวตารางเหลือ 3 อย่าง: ปุ่มก้าวถัดไปปุ่มเดียว · ไอคอนแก้ไข/ลบ · ลิงก์ &quot;จัดการ&quot;
                  {" "}ไปหน้ารายละเอียด — ปุ่มที่เหลือทั้งหมดอยู่บนการ์ดฝั่งซ้าย
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
        </WorkspaceSection>
      </div>
    </Workspace>
  );
}
