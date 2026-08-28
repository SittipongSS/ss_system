"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Filter, Users, PhoneCall, CalendarClock, Ban, PieChart as PieIcon } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LabelList, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import { ChartCanvas, ChartLegend, ChartTooltip, ChartEmptyState } from "@/components/ui/ChartCard";
import Segmented from "@/components/ui/Segmented";
import { CHART_CATEGORICAL, CHART_AXIS_TICK } from "@/lib/chartTheme";
import { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import {
  CHANNEL_GROUP_LABELS, LEAD_CHANNEL_LABELS, LEAD_SLA_STAGES, leadSlaNote, slaPendingTone,
} from "@/lib/sales/leads";
import { TEAM_LABELS } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { fmtName, fmtPercent, naText, NA } from "@/lib/format";
import { periodScopeLabel, yearOfMonth } from "@/lib/datePeriods";
import { leadDailyBuckets, leadDailyTotals } from "@/lib/sales/leadDailyBuckets";
import { fmtDate } from "@/lib/format";
import styles from "./KpiLeadsTab.module.css";
import { apiFetch } from "@/lib/apiFetch";

const pct = (hit, total) => (total ? fmtPercent((hit / total) * 100) : NA);

/* สามด่านของเส้นทางลีด วัดด้วยกติกาเดียวกัน (≤1 วันทำการ) ต่างกันแค่คู่ timestamp —
   ประกาศเป็นลิสต์เพื่อให้เพิ่ม/ลดด่านแล้วไม่ต้องไล่แก้ JSX ทีละใบ
   ⚠️ หมายเหตุใต้ตัวเลขต้องสั้นระดับ "ทัน x/y · ค้างตอนนี้ z" — `.ui-metric em` เป็น
   nowrap + ellipsis (กล่องในมี min-width:0 แล้ว ellipsis จึงทำงาน ไม่ล้นทับการ์ดข้าง ๆ
   เหมือนเดิม) แต่ยาวเกินก็ยังโดนตัดหายอยู่ดี — ความสั้นคือเงื่อนไขที่อ่านออก

   ⚠️ `pendingLabel` ของด่านคัดกรองต่างจากอีกสองด่าน **โดยเจตนา** — ของค้างด่านนี้คือคิว
   กลางที่ยังไม่มีทีม API จึงนับโดยไม่ใส่ตัวกรองทีม (ดู countLeadsByStatus ใน route)
   เลือกทีมอยู่แล้วเห็น "ค้างตอนนี้" เป็นเลขทั้งบริษัทข้าง ๆ % ของทีม = อ่านผิดแน่นอน
   ถ้าไม่บอกว่ามันคนละขอบเขต */
/* ป้ายมาจาก `LEAD_SLA_STAGES` ที่เดียว — หน้าคิวลีดอ่านลิสต์เดียวกันนี้
   ที่นี่เติมแค่ไอคอน เพราะ lib ฝั่งข้อมูลต้องไม่ import react */
const STAGE_ICONS = { screen: <Filter />, assign: <Users />, contact: <PhoneCall /> };

/* สีวงกลม = ชุดจำแนกประเภทของระบบ (3 ตัวแรกผ่านตัวตรวจ CVD ทุกข้อในทั้งสองธีม)
   ⚠️ วงกลมรับได้แค่ระดับ **กลุ่ม** 3 ชิ้น ไม่ใช่รายช่องทาง 6 ชิ้น — วัดด้วย
   validate_palette แบบ all-pairs แล้วคู่ที่ 2↔6 ของชุดนี้ได้ ΔE 2.3 กับสายตาปกติ
   (เกณฑ์ขั้นต่ำ 15) = คนตาปกติก็แยกไม่ออก · รายช่องทางจึงไปอยู่บนแท่งกับตารางที่มีชื่อกำกับ */
const GROUP_COLORS = CHART_CATEGORICAL.slice(0, 3);

/* แท่งซ้อน = **สถานะ ณ ตอนนี้** ไม่ใช่ขั้นของ funnel — ใบหนึ่งอยู่ได้ช่องเดียว
   เรียงจากผลดีไปผลเสียแล้วปิดท้ายด้วยของที่ยังไม่แตะ · จงใจไม่ให้เขียวไปติดแดง
   (คู่ที่ตาบอดสีอ่านพลาดบ่อยที่สุด) และทุกช่องมีป้ายใน legend ไม่ได้ใช้สีลอย ๆ */
const STATUS_SERIES = [
  { key: "won", label: "เปิดลูกค้า", color: "var(--green)" },
  { key: "talking", label: "คุยอยู่", color: "var(--blue)" },
  { key: "lost", label: "ไม่ไปต่อ", color: "var(--red)" },
  { key: "untouched", label: "ยังไม่ได้ติดต่อ", color: "var(--text-3)" },
];

/* สี่ตัวที่ฝ่ายขายอยากวัดจริง ๆ (มติผู้ใช้ 2026-08-12)
 *   ลีดเข้า · นัดประชุมได้ · เปิดลูกค้า · ไม่ไปต่อ
 *
 * ⚠️ **ไม่ใช่โซ่** — สามตัวหลังวัดเทียบ `total` ตัวเดียวกันหมด ไม่ต่อกันเป็นลูกศร
 * เพราะมันซ้อนทับกันได้และไม่ครบร้อย:
 *   · นัด ∩ เปิดลูกค้า ≠ ว่าง — ทั้งปีมี 6 ใบที่เปิดลูกค้า โดย 2 ใบเคยนัด
 *   · เปิดลูกค้ามาจาก create_deal ซึ่งไปได้จากทั้ง contacted และ meeting ⇒ ข้ามนัดได้
 *     เดือน ส.ค. จึงได้ นัด 2 แต่เปิดลูกค้า 4 — ต่อเป็นโซ่เมื่อไรปลายสายจะมากกว่าต้นสาย
 *     อ่านแล้วเหมือนระบบคำนวณพัง (🐞 โน้ตเดิมเขียน "ลีด 53 → นัด 2 → เปิดลูกค้า 4" จริง ๆ)
 *   · ที่เหลือยังเดินอยู่ในคิว สามตัวนี้จึงรวมกันไม่ถึง 100% โดยธรรมชาติ
 *
 * ตัวหารร่วม = "ลีดที่เข้ามาเดือนนี้" ทำให้เทียบข้ามเดือน/ข้ามทีมได้ตรง ๆ
 * ส่วนคำถาม "หล่นตรงไหนระหว่างทาง" ตอบด้วยกริด Funnel ข้างบนที่มีครบทุกขั้นอยู่แล้ว
 *
 * ⚠️ โน้ตต้องสั้นระดับนี้ — `.ui-metric em` เป็น nowrap + ellipsis ที่ไม่ทำงาน
 * (ไม่มี min-width:0) ข้อความยาวจะล้นไปทับการ์ดข้าง ๆ
 */
/* ⭐ **อัตราแปลง** เป็นการ์ดแรก — ตัวเศษคือ "เคยนัด **หรือ** เปิดดีล"
   🐞 เดิมเป็น `pct(f.meeting, f.total)` = นับแค่เคยนัด · `LEAD_TRANSITIONS.contacted`
   มี `create_deal` ⇒ ปิดดีลได้โดยไม่ต้องนัด (ส.ค. 2026: นัด 2 แต่เปิดลูกค้า 4)
   ⇒ **ผลลัพธ์ที่ดีที่สุดเคยได้คะแนนศูนย์** · และตัวส่วนเดิมกินลีดซ้ำ/สแปมด้วย
   ตัวเลขชุดนี้มาจาก `o` (kpi.outcome) ไม่ใช่ `f` (kpi.funnel) — คนละตัวหาร */
const OUTCOME_CARDS = [
  {
    key: "rate", label: "อัตราแปลง เปิดลีด → นัดประชุม",
    value: (f, o) => (o.pct == null ? NA : fmtPercent(o.pct)),
    note: (f, o) => `${o.reached ?? 0} จาก ${o.countable ?? 0} ใบที่นับ`,
  },
  { key: "in", label: "ลีดเข้า", value: (f) => naText(f.total), note: (f, o) => (o.excluded ? `ตัดออกจากตัวส่วน ${o.excluded} ใบ` : "ตัวหารของทุกอัตราในแถวนี้") },
  {
    key: "meet", label: "เคยนัดประชุม",
    value: (f, o) => pct(o.meeting, o.countable),
    // ⚠️ ตัวเลขที่อธิบายว่าทำไมตัวเศษถึงมากกว่าจำนวนนัด — ไม่มีบรรทัดนี้แล้วอ่านเหมือนบวกผิด
    note: (f, o) => (o.wonWithoutMeeting ? `${o.meeting ?? 0} ใบ · เปิดดีลโดยไม่ผ่านนัดอีก ${o.wonWithoutMeeting}` : `${o.meeting ?? 0} จาก ${o.countable ?? 0} ใบ`),
  },
  { key: "lost", label: "ไม่ไปต่อ", value: (f, o) => pct(o.lost, o.countable), note: (f, o) => `${o.lost ?? 0} จาก ${o.countable ?? 0} ใบ` },
];

export default function KpiLeadsTab({ month, allMonths = false, teamFilter, rangeFrom = null, rangeTo = null }) {
  /* ชื่อคน — อ่านจาก id ไม่ใช่สำเนาชื่อที่ค้างอยู่ในแถว (ท่าเดียวกับหน้าคิวลีด)
     🐞 ตารางสองใบนี้เคยโชว์ `assigneeName` / `createdByName` ตรง ๆ ซึ่งเป็น snapshot
     ตอนที่บันทึก — prod มี 64 แถวที่เป็นชื่อย่อ/ชื่อเก่าที่ไม่ตรงบัญชีใครเลย ⇒ ตาราง
     ประเมินผลรายคนขึ้นชื่อที่หาตัวคนไม่เจอ ขณะที่หน้าคิวลีดข้าง ๆ ขึ้นชื่อปัจจุบัน
     ⚠️ ต้องรวมคนที่ปิดบัญชีแล้วด้วย — KPI ย้อนหลังมีคนที่ลาออกไปแล้วเสมอ */
  const directory = usePeopleDirectory();
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      /* ติ๊ก "ทุกเดือน" ⇒ ส่ง `year` ไม่ใช่ `month=all` — `all` แปลว่า *ทุกปีตั้งแต่
         เปิดระบบ* ซึ่งไม่ตรงกับปีที่ค้างอยู่บนปุ่มเลือกงวด (มติ 2026-07-29) */
      /* โหมดช่วงวัน (IS-26080023) มาก่อน month/year — ลำดับเดียวกับฝั่ง route
         ไม่งั้นหน้าจอโชว์ช่วงวันแต่ตัวเลขเป็นของทั้งเดือน โดยไม่มีอะไรฟ้อง */
      const q = rangeFrom && rangeTo ? new URLSearchParams({ from: rangeFrom, to: rangeTo })
        : allMonths ? new URLSearchParams({ year: yearOfMonth(month) || "" })
          : new URLSearchParams({ month });
      if (teamFilter && teamFilter !== "all") q.set("team", teamFilter);
      const res = await apiFetch(`/api/sales-planning/leads/kpi?${q.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลด KPI ลีดไม่สำเร็จ");
      setKpi(await res.json());
    } catch (e) {
      setError(e.message || "โหลด KPI ลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, allMonths, rangeFrom, rangeTo, teamFilter]);

  useEffect(() => { load(); }, [load]);

  // ห่อ useMemo เพราะ `kpi?.funnel || {}` สร้างอ็อบเจกต์ใหม่ทุกเรนเดอร์เมื่อ kpi ยังว่าง
  // ⇒ useMemo ที่พึ่ง `f` จะคำนวณใหม่ทุกครั้ง (eslint react-hooks จับได้)
  const f = useMemo(() => kpi?.funnel || {}, [kpi]);
  // เหตุผลเดียวกับ `f` — `kpi?.lostReasons || {}` สร้างอ็อบเจกต์ใหม่ทุกเรนเดอร์เมื่อ kpi ยังว่าง
  const lost = useMemo(() => kpi?.lostReasons || {}, [kpi]);
  // เหตุผลเดียวกับ `f` — สร้างอ็อบเจกต์ใหม่ทุกเรนเดอร์เมื่อ kpi ยังว่าง
  const o = useMemo(() => kpi?.outcome || {}, [kpi]);
  const sla = kpi?.sla || {};
  /* ป้ายงวดคิดจากค่าที่หน้าจอถืออยู่ ไม่ใช่ `kpi.month` ที่ตอบกลับมา — โหมดทั้งปี
     route ไม่ได้ใช้ `month` แต่ยังคืนค่าถอย (เดือนปัจจุบัน) ติดมาด้วย */
  const scopeLabel = rangeFrom && rangeTo
    ? `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`
    : periodScopeLabel(month, allMonths);

  // ป้ายไทยเติมที่นี่ครั้งเดียว ทั้งแท่งและตารางใช้ตัวเดียวกัน จะได้ไม่หลุดกันคนละชื่อ
  const channels = useMemo(
    () => (kpi?.byChannel || []).map((c) => ({ ...c, label: LEAD_CHANNEL_LABELS[c.channel] || c.channel })),
    [kpi],
  );
  /* แถวของผัง — สีบอกบทบาท: ด่านหลักสีเดียวกันหมด · แขนง "นัด" คนละสี · ปลายทางเขียว
     `?? 0` ตรงนี้ปลอดภัยเพราะทุกค่ามาจาก rows.filter().length ของ route (ไม่มีทางเป็น null
     ต่างจาก bounced ที่นับแยกและล้มได้ — ซึ่งไม่ได้อยู่ในผังนี้แล้ว) */
  const funnelRows = useMemo(() => [
    { label: "เข้า", value: f.total ?? 0, color: "var(--chart-cat-1)" },
    { label: "คัดกรองแล้ว", value: f.screened ?? 0, color: "var(--chart-cat-1)" },
    { label: "มอบหมายแล้ว", value: f.assigned ?? 0, color: "var(--chart-cat-1)" },
    { label: "ติดต่อแล้ว", value: f.contacted ?? 0, color: "var(--chart-cat-1)" },
    { label: "ผ่านนัดประชุม", value: f.meeting ?? 0, color: "var(--violet)" },
    { label: "เปิดลูกค้า", value: f.qualified ?? 0, color: "var(--green)" },
  ], [f]);

  /* แถวรวมของสองตารางล่าง — ไม่ใช่ของประดับ: มันคือด่านที่จับได้ว่าตัวเลขในตารางกับ
     ผัง Funnel ข้างบนหลุดจากกัน (ส.ค. 2026 ผังเคยขึ้น "มอบหมายแล้ว 56" ขณะที่ตาราง AE
     รวมได้ 54 — ไม่มีใครเห็นจนต้องไล่บวกเอง) */
  const aeTotals = useMemo(() => {
    const rows = kpi?.byAssignee || [];
    const sum = (key) => rows.reduce((n, r) => n + (r[key] || 0), 0);
    return {
      assigned: sum("assigned"), contacted: sum("contacted"), slaHit: sum("slaHit"),
      meetings: sum("meetings"), qualified: sum("qualified"), pending: sum("pending"),
    };
  }, [kpi]);

  /* ⚠️ "วันที่กรอก" ของแถวรวม **ไม่ใช่ผลบวกของคอลัมน์** — สองคนกรอกวันเดียวกันนับเป็น
     วันเดียว จึงต้องนับจาก `byDay` (คีย์ = วันไทยที่มีลีดเข้าจริง) ไม่งั้นค่าเฉลี่ยรวม
     จะต่ำกว่าความจริงเสมอและไม่ตรงกับที่หน้าอื่นรายงาน */
  const creatorTotals = useMemo(() => {
    const count = (kpi?.byCreator || []).reduce((n, c) => n + (c.count || 0), 0);
    const days = Object.keys(kpi?.byDay || {}).length;
    return { count, days, perDay: days ? +(count / days).toFixed(1) : 0 };
  }, [kpi]);

  /* ── ลีดเข้ารายวัน/รายสัปดาห์ (IS-26080023) ───────────────────────────────
     Marketing นับลีดรายสัปดาห์เทียบยอด Spending Ads · ตัวเลขรายวันคำนวณอยู่แล้วที่
     route (`byDay`) แต่ไม่เคยมีที่ให้ดู — เดิมถูกใช้แค่หา "มีลีดกี่วัน" ไปหารค่าเฉลี่ย

     ⚠️ `byDay` มีเฉพาะวันที่ **มีลีด** ⇒ ต้องกางเป็นทุกวันของงวดจาก `kpi.days` ที่ route
     ส่งมาให้ ไม่งั้นกราฟจะยุบวันว่างทิ้งแล้ว "วันที่ยิงแอดแล้วไม่มีลีด" หายไปจากสายตา
     ซึ่งเป็นข้อมูลที่คนดูต้องเห็นที่สุด (มติผู้ใช้ 2026-08-13)

     🔴 ถังรายสัปดาห์เริ่ม **วันจันทร์** (`weekStartOf`) ตามที่ Marketing นับจริง —
     คนละเรื่องกับตารางปฏิทินที่ขึ้นต้นวันอาทิตย์ (มติ 2026-07-15) · และห้ามหาวันใน
     สัปดาห์ด้วย `new Date(...).getUTCDay()` เพราะ timestamp มี offset +07 แล้ววันจันทร์
     จะตกไปสัปดาห์ก่อนทั้งก้อน */
  const [dayUnit, setDayUnit] = useState("day");
  const dayBuckets = useMemo(
    () => leadDailyBuckets({ byDay: kpi?.byDay, days: kpi?.days, unit: dayUnit })
      .map((b) => ({
        ...b,
        // ชื่อใน tooltip เป็นวันไทยอ่านออก — lib คืนคีย์ดิบเพื่อให้เทสต์ทาบง่าย
        name: b.name.includes('..')
          ? b.name.split('..').map((d) => fmtDate(d)).join(' – ')
          : fmtDate(b.name),
      })),
    [kpi, dayUnit],
  );
  const dayTotals = useMemo(() => leadDailyTotals(dayBuckets, kpi?.days), [dayBuckets, kpi]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const c of channels) map.set(c.group, (map.get(c.group) || 0) + c.count);
    return [...map.entries()]
      .map(([key, value]) => ({ key, value, label: CHANNEL_GROUP_LABELS[key] || key }))
      .sort((a, b) => b.value - a.value);
  }, [channels]);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className={`glass-panel ${styles.errorBox}`} role="alert">{error}</div>
      )}

      {/* ⚠️ เคยมีแถบ KPI 4 การ์ด (ลีดเข้า · SLA คัดกรอง · SLA ติดต่อ · Conversion) อยู่ตรงนี้
          — **ชุดเดียวกับที่หน้าคิวลีดแสดงอยู่แล้วเป๊ะ** คนกดลิงก์ "ดู KPI เต็ม" มาจึงต้อง
          เลื่อนผ่านของที่เพิ่งเห็นก่อนถึงของใหม่ (มติผู้ใช้ 2026-08-05)
          ตัวเลข SLA/Conversion ไม่ได้หายไปไหน — ย้ายลงมาอยู่ในส่วน Funnel ข้างล่างนี้
          ซึ่งเป็นที่ที่มันอ่านคู่กับจำนวนลีดแต่ละขั้นได้พอดี
          ⇒ อย่าเอาแถบซ้ำกลับมา ถ้าอยากให้หน้านี้มีพาดหัว ให้เป็นตัวเลขที่หน้าคิวลีด
            *ไม่มี* เท่านั้น */}

      <SaSection icon={<Filter size={17} />} title="Funnel ลีด → ลูกค้า" subtitle={`ติดตามการเปลี่ยนผ่านของลีดในแต่ละขั้น · ${scopeLabel}`}>
        {/* ผังลดหลั่นเป็น **กราฟแท่ง** ไม่ใช่กล่องตัวเลข 8 ใบ — ตัวเลขล้วนอ่านไม่ออกว่า
            หล่นตรงไหน ต้องเอามาลบกันเองในหัว ส่วนความยาวแท่งบอกได้ในแวบเดียว
            ⚠️ "ผ่านนัดประชุม" เป็น **แขนง** ไม่ใช่ด่าน (สีคนละตัว) — create_deal ข้ามขั้นนัดได้
            จึงมีเดือนที่นัดน้อยกว่าเปิดลูกค้า · ใส่ไว้ให้เห็นจำนวน ไม่ได้แปลว่าต้องผ่าน
            ⚠️ ไม่มี "ตีกลับ" ในผัง (มติผู้ใช้ 2026-08-11) และ "ไม่ไปต่อ" อยู่ในแถบผลลัพธ์ข้างล่าง */}
        <ChartCanvas className={styles.funnelChart} aria-busy={loading}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelRows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barSize={16}>
              <XAxis type="number" hide domain={[0, Math.max(1, f.total || 1)]} />
              <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} tick={CHART_AXIS_TICK} />
              <RTooltip cursor={{ fill: "var(--panel-3)" }} content={<ChartTooltip valueFormatter={(v) => `${v} ใบ`} />} />
              <Bar dataKey="value" name="จำนวนลีด" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {funnelRows.map((r) => <Cell key={r.label} fill={r.color} />)}
                <LabelList dataKey="value" position="right" fill="var(--text-2)" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCanvas>
        {/* เหตุผลที่แท่งล่างสองอันสวนทางกันต้องอยู่ **บนจอ** ไม่ใช่ในคอมเมนต์โค้ด —
            คนอ่านเห็นแท่งเรียงลงมาแล้วเจอ "นัด 2 · เปิดลูกค้า 4" จะอ่านว่าระบบคำนวณพัง
            สีที่ต่างกันบอกไม่ได้ว่ามันคนละชนิด (มีคนถามจริงตอนตรวจ 2026-08-12) */}
        <p className={styles.chartNote}>
          “ผ่านนัดประชุม” เป็นแขนง ไม่ใช่ด่าน — เปิดดีลได้ตั้งแต่ขั้น “ติดต่อแล้ว” จำนวนเปิดลูกค้าจึงมากกว่านัดได้
        </p>
        {/* คุณภาพของ funnel ข้างบน — เปอร์เซ็นต์อ่านคู่กับจำนวนดิบในกริดเดียวกันไม่ได้
            (คนละหน่วย) จึงแยกเป็นแถวของตัวเองใต้ส่วนเดียวกัน */}
        {/* ใช้ `MetricStrip` ไม่ใช่กริดของตัวเอง — แถบกลางมีเส้นคั่น 1px ระหว่างช่องและ
            กรอบรอบแถบให้อยู่แล้ว (กริดเดิมเป็นการ์ดลอยไม่มีอะไรแบ่ง อ่านไม่ออกว่าเลข
            ไหนคู่กับป้ายไหนเวลามีหลายใบเรียงกัน) */}
        <SaMetricStrip className={styles.qualityStrip} aria-busy={loading}>
          {/* "ค้างตอนนี้" ไม่ใช่ "ค้างของเดือนนี้" — ตัวเลขนี้ไม่ผูกกับเดือนที่เลือก
              โดยเจตนา (ลีดที่ค้างข้ามเดือนมาคือใบที่ต้องทวงที่สุด) ป้ายจึงต้องบอกให้ชัด */}
          {LEAD_SLA_STAGES.map(({ key, label, pendingLabel }) => {
            const s = sla[key] || {};
            return (
              <SaMetric
                key={key}
                icon={STAGE_ICONS[key]}
                label={label}
                value={pct(s.hit, s.checked)}
                note={leadSlaNote(s, pendingLabel)}
                tone={slaPendingTone(s.pending)}
              />
            );
          })}
        </SaMetricStrip>
        {/* ผลลัพธ์แยกแถบของตัวเอง ไม่ต่อท้าย SLA — สองชุดตอบคนละคำถาม
            (ทันเวลาไหม vs ได้ผลเท่าไร) และรวมแถบเดียวแล้วจะตัดบรรทัดค้างเป็นแถวเศษ */}
        {/* 🪤 อ่านประวัติลีดไม่สำเร็จ = ตัวเลข **ต่ำกว่าความจริง** เพราะใบที่ถูกตีกลับ
            จะหายจากตัวเศษ (bounce ล้าง meetingAt) · เงียบไว้แล้วคนอ่านจะสรุปว่าผลงานตก
            ⚠️ ขึ้นเฉพาะตอนโหลดเสร็จแล้วเท่านั้น — ระหว่างโหลด `outcome` ยังว่าง
            ซึ่งไม่ได้แปลว่าอ่านไม่ได้ */}
        {!loading && o.basis === "row" && o.total ? (
          <p className={styles.basisWarning} role="status">
            อ่านประวัติลีดไม่สำเร็จ — ตัวเลขชุดนี้นับจากคอลัมน์บนแถวลีดแทน
            ใบที่เคยถูกตีกลับจะไม่ถูกนับว่าเคยนัดประชุม ทำให้อัตราแปลงต่ำกว่าความจริง
          </p>
        ) : null}
        <SaMetricStrip className={styles.qualityStrip} aria-busy={loading}>
          {OUTCOME_CARDS.map(({ key, label, value, note }) => (
            <SaMetric key={key} icon={<CalendarClock />} label={label} value={value(f, o)} note={note(f, o)} />
          ))}
        </SaMetricStrip>
      </SaSection>

      {/* Marketing: กรอกรายวัน */}
        <SaSection icon={<Inbox size={17} />} title="การกรอกลีด (Marketing KPI)" subtitle="ปริมาณลีดแยกตามผู้กรอก">
          <TableScroll surface="embedded"><table>
              <thead><tr><th>ผู้กรอก</th><th className="num">ลีด</th><th className="num">วันที่กรอก</th><th className="num">เฉลี่ย/วัน</th></tr></thead>
              <tbody>
                {(kpi?.byCreator || []).map((c) => (
                  <tr key={c.createdBy || c.name} className="premium-row">
                    <td>{livePersonName(directory, c.createdBy, c.name) || c.name}</td>
                    <td className="num mono">{c.count}</td>
                    <td className="num mono">{c.days}</td>
                    <td className="num mono">{c.perDay}</td>
                  </tr>
                ))}
                {!(kpi?.byCreator || []).length && <tr><td colSpan={4} className={styles.emptyCell}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
              {(kpi?.byCreator || []).length ? (
                <tfoot><tr className="premium-row">
                  <td><strong>รวม</strong></td>
                  <td className="num mono"><strong>{creatorTotals.count}</strong></td>
                  <td className="num mono"><strong>{creatorTotals.days}</strong></td>
                  <td className="num mono"><strong>{creatorTotals.perDay}</strong></td>
                </tr></tfoot>
              ) : null}
            </table></TableScroll>
      </SaSection>

      {/* ── ลีดเข้ารายวัน (IS-26080023) ────────────────────────────────────────
          Marketing นับลีดรายสัปดาห์เทียบยอด Spending Ads — ระบบไม่ได้เก็บยอดแอด
          จึงเทียบให้ในจอไม่ได้ ปุ่มคัดลอกคือทางที่เอาไปวางข้าง sheet เดิมของเขา */}
      <SaSection
        icon={<CalendarClock size={17} />}
        title={dayUnit === "day" ? "ลีดเข้ารายวัน" : "ลีดเข้ารายสัปดาห์"}
        subtitle={dayTotals.count
          ? `${scopeLabel} · ${dayTotals.count} ลีด · เฉลี่ย ${dayTotals.perDay} ต่อวันที่มีลีดเข้า (${dayTotals.withLeads} วันจาก ${dayTotals.spanDays} วัน)`
          : `${scopeLabel} · ยังไม่มีลีดในงวดนี้`}
        actions={(
          <Segmented
            ariaLabel="หน่วยเวลาของกราฟ"
            value={dayUnit}
            onChange={setDayUnit}
            options={[{ value: "day", label: "รายวัน" }, { value: "week", label: "รายสัปดาห์" }]}
          />
        )}
      >
        {dayBuckets.length ? (
          <>
            <ChartCanvas className={styles.dailyChart} aria-busy={loading}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayBuckets} margin={{ top: 16, right: 8, bottom: 4, left: 4 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={CHART_AXIS_TICK} interval="preserveStartEnd" />
                  <YAxis width={30} tickLine={false} axisLine={false} tick={CHART_AXIS_TICK} allowDecimals={false} />
                  <RTooltip
                    cursor={{ fill: "var(--panel-3)" }}
                    content={(
                      <ChartTooltip
                        /* ตารางตัวเลขถูกถอดออกตามที่ผู้ใช้สั่ง (2026-08-13) — ข้อมูลที่เคย
                           อยู่ในคอลัมน์ "วันที่มีลีด" กับป้าย "ไม่เต็มสัปดาห์" จึงต้องย้าย
                           มาอยู่ในทูลทิป ไม่ใช่หายไปเฉย ๆ */
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload;
                          if (!row) return "";
                          return dayUnit === "week" && row.partial ? `${row.name} (ไม่เต็มสัปดาห์)` : row.name;
                        }}
                        valueFormatter={(v, _n, entry) => (dayUnit === "week"
                          ? `${v} ใบ · มีลีด ${entry?.payload?.withLeads ?? 0} วัน`
                          : `${v} ใบ`)}
                      />
                    )}
                  />
                  {/* `minPointSize` = วันที่ได้ศูนย์ยังได้ตอขีดบาง ๆ ไม่ใช่หายไปจากผัง
                      (recharts ไม่วาดสี่เหลี่ยมสูงศูนย์) — วันว่างคือข้อมูลที่ต้องเห็น */}
                  <Bar dataKey="count" name="ลีดเข้า" fill={CHART_CATEGORICAL[0]} radius={[3, 3, 0, 0]} minPointSize={2} isAnimationActive={false}>
                    <LabelList dataKey="count" position="top" fill="var(--text-2)" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCanvas>
            {/* ⚠️ ข้อความนี้ต้องอยู่ **บนจอ** ไม่ใช่ในคอมเมนต์ — คนเห็นแท่งศูนย์เรียงกัน
                แล้วจะคิดว่ากราฟพัง ทั้งที่วันว่างคือข้อมูลที่เขาต้องการเห็น */}
            <p className={styles.chartNote}>
              {dayUnit === "day"
                ? "วันที่ไม่มีลีดยังโชว์เป็นแท่งศูนย์ — “วันที่ยิงแอดแล้วไม่มีลีด” คือข้อมูลที่ต้องเห็น ไม่ใช่ช่องว่างที่ยุบทิ้ง"
                : "สัปดาห์เริ่มวันจันทร์ · สัปดาห์หัวท้ายงวดไม่ครบเจ็ดวัน — ชี้ที่แท่งเพื่อดูช่วงวันจริงก่อนสรุปว่าลีดตก"}
            </p>
          </>
        ) : (
          <ChartEmptyState>ยังไม่มีลีดในงวดนี้ — เลือกช่วงวันอื่น หรือเปลี่ยนไปดูรายเดือน</ChartEmptyState>
        )}
      </SaSection>

      {/* ช่องทาง — วงกลม (สัดส่วนระดับกลุ่ม) · แท่ง (สถานะปัจจุบันรายช่องทาง) · ตาราง (Funnel)
          สามอันตอบคนละคำถามของเรื่องเดียวกัน จึงอยู่ในส่วนเดียวกัน */}
      <SaSection
        icon={<PieIcon size={17} />}
        title="ช่องทางที่ลีดเข้ามา"
        subtitle="วงกลม = สัดส่วนระดับกลุ่ม · แท่ง = สถานะปัจจุบันของแต่ละช่องทาง · ตาราง = Funnel รายช่องทาง"
      >
        {channels.length ? (
          <>
            <div className={styles.channelFigure}>
              <div className={styles.channelCol}>
              <ChartCanvas className={styles.donut}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* 🐞 `isAnimationActive={false}` **จำเป็น** ไม่ใช่เรื่องความชอบ — Recharts 3.9.2
                        เรนเดอร์ `<Pie>` ที่เปิดอนิเมชัน (ค่าเริ่มต้น) ออกมาเป็น sector เปล่าไม่มี
                        path เลย = วงกลมหายทั้งวง และไม่มี error อะไรฟ้อง
                        ⚠️ กราฟวงกลมเดิมของหน้าสหมิตร/ภาษี/ฐานข้อมูลติดบั๊กเดียวกันอยู่ตอนนี้
                        (ตรวจ 2026-08-12: sector 1 อัน path 0) — ใครไปแก้ที่นั่นให้ใส่ prop นี้ด้วย */}
                    <Pie data={groups} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                      {groups.map((g, i) => <Cell key={g.key} fill={GROUP_COLORS[i % GROUP_COLORS.length]} />)}
                    </Pie>
                    <RTooltip content={<ChartTooltip valueFormatter={(v) => `${v} ใบ (${pct(v, f.total)})`} />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCanvas>
              <ChartLegend
                items={groups.map((g, i) => ({
                  key: `g-${g.key}`,
                  label: `${g.label} ${g.value} (${pct(g.value, f.total)})`,
                  color: GROUP_COLORS[i % GROUP_COLORS.length],
                }))}
              />
              </div>
              <div className={styles.channelCol}>
              <ChartLegend
                items={STATUS_SERIES.map((st) => ({ key: st.key, label: st.label, color: st.color }))}
              />
              <ChartCanvas className={styles.channelBars}>
                <ResponsiveContainer width="100%" height="100%">
                  {/* แท่งซ้อน = สถานะ ณ ตอนนี้ ใบหนึ่งอยู่ได้ช่องเดียว ความยาวรวมจึงเท่าจำนวนลีด
                      ของช่องทางนั้นพอดี (channelRollup มีเทสคุมไว้) */}
                  <BarChart data={channels} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }} barSize={14}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" width={78} tickLine={false} axisLine={false} tick={CHART_AXIS_TICK} />
                    <RTooltip cursor={{ fill: "var(--panel-3)" }} content={<ChartTooltip valueFormatter={(v) => `${v} ใบ`} />} />
                    {/* 🐞 `isAnimationActive={false}` **จำเป็น** เหมือน `<Pie>` ข้างบน — recharts 3.9.2
                        ทำอนิเมชันของ `<Bar>` ที่ซ้อนกอง (stackId) ไม่จบ: เปิดหน้ามาแท่งไม่ขึ้นเลย
                        สักอัน (path 0 ชิ้น) พอเลื่อนจอให้กราฟเข้ามาในสายตาถึงโผล่ แต่ค้างกลางทาง
                        — ค่าสูงสุด 21 ใบวาดยาวแค่ ~55px บนผืนกว้าง 963px และไม่มี error อะไรฟ้อง
                        ⚠️ พิสูจน์แล้วว่าไม่ใช่เรื่องขนาด: ตรึง `width={800}` ตัด ResponsiveContainer
                        ออกก็ยังไม่ขึ้น · กราฟอื่นทุกอันในไฟล์นี้ปิดอนิเมชันไว้ตั้งแต่แรกจึงไม่เคยเจอ
                        (เจอตอนตรวจด้วยตา 2026-08-13 · ผู้ใช้ทักว่ากราฟหน้าตาแปลก) */}
                    {STATUS_SERIES.map((st, i) => (
                      <Bar key={st.key} dataKey={st.key} name={st.label} stackId="s" fill={st.color}
                        radius={i === STATUS_SERIES.length - 1 ? [0, 3, 3, 0] : 0} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCanvas>
              </div>
            </div>
            <TableScroll surface="embedded" className={styles.channelTable}><table>
              <thead><tr>
                <th>ช่องทาง</th><th>กลุ่ม</th>
                <th className="num">ลีดเข้า</th><th className="num">ติดต่อแล้ว</th>
                <th className="num">นัดได้</th><th className="num">เปิดลูกค้า</th>
              </tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel} className="premium-row">
                    <td>{c.label}</td>
                    <td>{CHANNEL_GROUP_LABELS[c.group] || c.group}</td>
                    <td className="num mono">{c.count}</td>
                    <td className="num mono">{c.contacted}</td>
                    <td className="num mono">{c.meeting}</td>
                    <td className="num mono">{c.qualified}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="premium-row">
                <td><strong>รวม</strong></td><td />
                <td className="num mono"><strong>{f.total ?? 0}</strong></td>
                <td className="num mono"><strong>{f.contacted ?? 0}</strong></td>
                <td className="num mono"><strong>{f.meeting ?? 0}</strong></td>
                <td className="num mono"><strong>{f.qualified ?? 0}</strong></td>
              </tr></tfoot>
            </table></TableScroll>
          </>
        ) : (
          <ChartEmptyState>ยังไม่มีลีด · {scopeLabel}</ChartEmptyState>
        )}
      </SaSection>

      {/* ⭐ "แพ้เพราะอะไร" (mig 0290) — ก่อนหน้านี้ `disqualifiedReason` ถูกเขียนทุกใบ
          แต่ไม่มีจอไหนอ่านเลย และแท็บนี้มีแค่การ์ด "ไม่ไปต่อ %" ซึ่งตอบได้แค่แพ้เท่าไร
          ⚠️ แถวที่เป็น 0 ยังขึ้น — "เดือนนี้ไม่มีใครแพ้เพราะราคาเลย" คือข้อมูล ไม่ใช่
          ความว่างเปล่า · และเรียงตามลิสต์คงที่ ไม่ใช่ตามจำนวน ไม่งั้นอ่านเทียบข้ามเดือนไม่ได้ */}
      <SaSection
        icon={<Ban size={17} />}
        title="เหตุผลที่ไม่ไปต่อ"
        subtitle={`${lost.total ?? 0} ใบของ${scopeLabel} · นับเป็นแพ้ ${lost.countedTotal ?? 0} · ไม่นับ ${lost.excluded ?? 0}`}
      >
        {lost.total ? (
          <TableScroll surface="embedded"><table>
            <thead><tr><th>เหตุผล</th><th className="num">ใบ</th><th className="num">สัดส่วน</th></tr></thead>
            <tbody>
              {(lost.reasons || []).map((r) => (
                <tr key={r.code} className={`premium-row ${r.countable ? "" : styles.mutedRow}`.trim()}>
                  <td>{r.label}</td>
                  <td className="num mono">{r.count}</td>
                  {/* ⚠️ ตัวหาร = ใบที่นับเป็นแพ้จริง ไม่ใช่ทุกใบที่ปิด — ไม่งั้นสแปมจะไปกด
                      สัดส่วนของเหตุผลจริงทุกแถวให้ดูเล็กลง · แถวที่ไม่นับจึงไม่มี % ให้อ่าน */}
                  <td className="num mono">{r.countable ? pct(r.count, lost.countedTotal) : "ไม่นับ"}</td>
                </tr>
              ))}
              {/* ใบเก่าก่อน mig 0290 — แยกจาก "อื่นๆ" โดยเจตนา: "อื่นๆ" คือสิ่งที่ AE
                  เลือกเอง ส่วนตัวนี้คือของที่ระบบไม่เคยถาม ปนกันแล้วจะอ่านว่า "อื่นๆ"
                  พุ่งขึ้นทั้งที่ไม่มีใครเลือกมันเพิ่มเลย */}
              {lost.unknown ? (
                <tr className={`premium-row ${styles.mutedRow}`}>
                  <td>ไม่ระบุ (ใบก่อนเริ่มเก็บรหัส)</td>
                  <td className="num mono">{lost.unknown}</td>
                  <td className="num mono">{pct(lost.unknown, lost.countedTotal)}</td>
                </tr>
              ) : null}
            </tbody>
          </table></TableScroll>
        ) : (
          <ChartEmptyState>ยังไม่มีลีดที่ปิดว่าไม่ไปต่อ · {scopeLabel}</ChartEmptyState>
        )}
      </SaSection>

      {/* AE: SLA ติดต่อ + ผลต่อคน */}
      <SaSection icon={<PhoneCall size={17} />} title="รายผู้รับผิดชอบ (AE KPI)" subtitle={`เรียงตามของค้างมากสุด · คอลัมน์ผลงานเป็นของ${scopeLabel} ส่วน “ค้างตอนนี้” ไม่ผูกกับงวด`}>
        <TableScroll surface="embedded"><table>
            {/* "ค้างตอนนี้" อยู่ท้ายสุด (มติผู้ใช้ 2026-08-12) — คอลัมน์ซ้ายไล่ตามลำดับงาน
                ของเดือน (รับมอบ → ติดต่อ → SLA → นัด → เปิดลูกค้า) ตัวนี้คนละขอบเขตเวลา
                จึงไม่แทรกกลาง · ตารางยังเรียงตามคอลัมน์นี้อยู่ (บอกไว้ที่ subtitle) */}
            <thead><tr><th>AE</th><th>ทีม</th><th className="num">รับมอบ</th><th className="num">ติดต่อแล้ว</th><th className="num">SLA ทัน</th><th className="num">นัด</th><th className="num">เปิดลูกค้า</th><th className="num">ค้างตอนนี้</th></tr></thead>
            <tbody>
              {(kpi?.byAssignee || []).map((a) => (
                <tr key={a.assigneeId} className="premium-row">
                  <td>{livePersonName(directory, a.assigneeId, a.name) || fmtName({ name: a.name })}</td>
                  {/* ป้ายทีมเต็ม ("Key Account") ไม่ใช่รหัสดิบ ("KA") — ที่อื่นในระบบใช้ TEAM_LABELS หมด */}
                  <td>{TEAM_LABELS[a.team] || naText(a.team)}</td>
                  <td className="num mono">{a.assigned}</td>
                  <td className="num mono">{a.contacted}</td>
                  {/* 🐞 % เปล่า ๆ โกหกได้เต็มปาก — ตัวหารคือ "ใบที่ติดต่อแล้ว" ไม่ใช่ "ใบที่รับมอบ"
                      คนที่รับ 11 ใบ ติดต่อไป 2 ใบ ทันทั้งคู่ จึงขึ้น 100.00% ทั้งที่ค้างอยู่ 10 ใบ
                      (ส.ค. 2026 มีแถวแบบนี้จริง) · การ์ด SLA ข้างบนโชว์ "ทัน x/y" อยู่แล้ว
                      คอลัมน์นี้ต้องโชว์ตัวหารเหมือนกัน ไม่งั้นสองที่บนจอเดียวกันเชื่อถือไม่เท่ากัน */}
                  <td className="num mono">
                    {pct(a.slaHit, a.contacted)}
                    {a.contacted ? <span className={styles.cellSub}>{a.slaHit}/{a.contacted}</span> : null}
                  </td>
                  <td className="num mono">{a.meetings}</td>
                  <td className="num mono">{a.qualified}</td>
                  {/* naText(🐞 ห้ามเขียน `a.pending)` — 0 คือ "ไม่มีของค้าง" ซึ่งเป็นคำตอบจริง
                      ส่วน "-" ในระบบนี้แปลว่า "นับไม่ได้" (ดู slaPendingTone) · เขียนแบบนั้น
                      แล้วคนที่เคลียร์งานหมดจะดูเหมือนไม่มีข้อมูล และไม่ตรงกับคอลัมน์ข้าง ๆ
                      ที่โชว์ 0 ตามปกติ · เน้นสีเฉพาะคนที่มีของค้างจริงพอ
                      (ไม่ต้อง `?? 0` — withAssigneePending การันตีว่าเป็นตัวเลขเสมอ
                       คิวรีล้มก็ได้ 0 ต่างจาก sla.pending ที่ล้มแล้วเป็น null จริง ๆ) */}
                  <td className="num mono" style={a.pending ? { color: "var(--red)", fontWeight: "var(--fw-semibold)" } : undefined}>
                    {a.pending}
                  </td>
                </tr>
              ))}
              {!(kpi?.byAssignee || []).length && <tr><td colSpan={8} className={styles.emptyCell}>ยังไม่มีข้อมูล</td></tr>}
            </tbody>
            {(kpi?.byAssignee || []).length ? (
              <tfoot><tr className="premium-row">
                <td><strong>รวม</strong></td><td />
                <td className="num mono"><strong>{aeTotals.assigned}</strong></td>
                <td className="num mono"><strong>{aeTotals.contacted}</strong></td>
                <td className="num mono">
                  <strong>{pct(aeTotals.slaHit, aeTotals.contacted)}</strong>
                  {aeTotals.contacted ? <span className={styles.cellSub}>{aeTotals.slaHit}/{aeTotals.contacted}</span> : null}
                </td>
                <td className="num mono"><strong>{aeTotals.meetings}</strong></td>
                <td className="num mono"><strong>{aeTotals.qualified}</strong></td>
                <td className="num mono"><strong>{aeTotals.pending}</strong></td>
              </tr></tfoot>
            ) : null}
          </table></TableScroll>
      </SaSection>
    </div>
  );
}
