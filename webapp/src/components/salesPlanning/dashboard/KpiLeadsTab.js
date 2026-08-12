"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Filter, Users, PhoneCall, CalendarClock, PieChart as PieIcon } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LabelList, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import { ChartCanvas, ChartLegend, ChartTooltip, ChartEmptyState } from "@/components/ui/ChartCard";
import { CHART_CATEGORICAL, CHART_AXIS_TICK } from "@/lib/chartTheme";
import { Metric as SaMetric, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import { CHANNEL_GROUP_LABELS, LEAD_CHANNEL_LABELS, slaPendingTone } from "@/lib/sales/leads";
import { TEAM_LABELS } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { fmtName, fmtPercent } from "@/lib/format";
import styles from "./KpiLeadsTab.module.css";

const pct = (hit, total) => (total ? fmtPercent((hit / total) * 100) : "-");

/* สามด่านของเส้นทางลีด วัดด้วยกติกาเดียวกัน (≤1 วันทำการ) ต่างกันแค่คู่ timestamp —
   ประกาศเป็นลิสต์เพื่อให้เพิ่ม/ลดด่านแล้วไม่ต้องไล่แก้ JSX ทีละใบ
   ⚠️ หมายเหตุใต้ตัวเลขต้องสั้นระดับ "ทัน x/y · ค้างตอนนี้ z" เท่านั้น — `.ui-metric em`
   เป็น nowrap + ellipsis แต่กล่องข้างในไม่มี min-width:0 ellipsis เลยไม่ทำงาน
   ข้อความยาวจึงล้นไปทับการ์ดข้าง ๆ (เจอตอนลองใส่ชื่อผู้รับผิดชอบด่านลงไป) */
const SLA_STAGES = [
  { key: "screen", icon: <Filter />, label: "SLA คัดกรอง ≤1 วันทำการ" },
  { key: "assign", icon: <Users />, label: "SLA กระจาย ≤1 วันทำการ" },
  { key: "contact", icon: <PhoneCall />, label: "SLA ติดต่อกลับ ≤1 วันทำการ" },
];

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
const OUTCOME_CARDS = [
  { key: "in", label: "ลีดเข้า", value: (f) => f.total ?? "-", note: () => "ตัวหารของทุกอัตราในแถวนี้" },
  { key: "meet", label: "นัดประชุมได้", value: (f) => pct(f.meeting, f.total), note: (f) => `${f.meeting ?? 0} จาก ${f.total ?? 0} ใบ` },
  { key: "won", label: "เปิดลูกค้า", value: (f) => pct(f.qualified, f.total), note: (f) => `${f.qualified ?? 0} จาก ${f.total ?? 0} ใบ` },
  { key: "lost", label: "ไม่ไปต่อ", value: (f) => pct(f.disqualified, f.total), note: (f) => `${f.disqualified ?? 0} จาก ${f.total ?? 0} ใบ` },
];

export default function KpiLeadsTab({ month, teamFilter }) {
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
      const q = new URLSearchParams({ month });
      if (teamFilter && teamFilter !== "all") q.set("team", teamFilter);
      const res = await fetch(`/api/sales-planning/leads/kpi?${q.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลด KPI ลีดไม่สำเร็จ");
      setKpi(await res.json());
    } catch (e) {
      setError(e.message || "โหลด KPI ลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, teamFilter]);

  useEffect(() => { load(); }, [load]);

  // ห่อ useMemo เพราะ `kpi?.funnel || {}` สร้างอ็อบเจกต์ใหม่ทุกเรนเดอร์เมื่อ kpi ยังว่าง
  // ⇒ useMemo ที่พึ่ง `f` จะคำนวณใหม่ทุกครั้ง (eslint react-hooks จับได้)
  const f = useMemo(() => kpi?.funnel || {}, [kpi]);
  const sla = kpi?.sla || {};

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

      <SaSection icon={<Filter size={17} />} title="Funnel ลีด → ลูกค้า" subtitle={`ติดตามการเปลี่ยนผ่านของลีดในแต่ละขั้น · เดือน ${kpi?.month || month}`}>
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
        {/* คุณภาพของ funnel ข้างบน — เปอร์เซ็นต์อ่านคู่กับจำนวนดิบในกริดเดียวกันไม่ได้
            (คนละหน่วย) จึงแยกเป็นแถวของตัวเองใต้ส่วนเดียวกัน */}
        <div className={styles.qualityGrid} aria-busy={loading}>
          {/* "ค้างตอนนี้" ไม่ใช่ "ค้างของเดือนนี้" — ตัวเลขนี้ไม่ผูกกับเดือนที่เลือก
              โดยเจตนา (ลีดที่ค้างข้ามเดือนมาคือใบที่ต้องทวงที่สุด) ป้ายจึงต้องบอกให้ชัด */}
          {SLA_STAGES.map(({ key, icon, label }) => {
            const s = sla[key] || {};
            return (
              <SaMetric
                key={key}
                icon={icon}
                label={label}
                value={pct(s.hit, s.checked)}
                note={`ทัน ${s.hit ?? 0}/${s.checked ?? 0} · ค้างตอนนี้ ${s.pending ?? "-"}`}
                tone={slaPendingTone(s.pending)}
              />
            );
          })}
        </div>
        {/* ผลลัพธ์แยกกริดของตัวเอง ไม่ต่อท้าย SLA — สองชุดตอบคนละคำถาม
            (ทันเวลาไหม vs ได้ผลเท่าไร) และรวมกริดเดียวแล้วจะตัดบรรทัดค้างเป็นแถวเศษ */}
        <div className={styles.qualityGrid} aria-busy={loading}>
          {OUTCOME_CARDS.map(({ key, label, value, note }) => (
            <SaMetric key={key} icon={<CalendarClock />} label={label} value={value(f)} note={note(f)} />
          ))}
        </div>
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
            </table></TableScroll>
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
              <ChartCanvas className={styles.channelBars}>
                <ResponsiveContainer width="100%" height="100%">
                  {/* แท่งซ้อน = สถานะ ณ ตอนนี้ ใบหนึ่งอยู่ได้ช่องเดียว ความยาวรวมจึงเท่าจำนวนลีด
                      ของช่องทางนั้นพอดี (channelRollup มีเทสคุมไว้) */}
                  <BarChart data={channels} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }} barSize={14}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" width={78} tickLine={false} axisLine={false} tick={CHART_AXIS_TICK} />
                    <RTooltip cursor={{ fill: "var(--panel-3)" }} content={<ChartTooltip valueFormatter={(v) => `${v} ใบ`} />} />
                    {STATUS_SERIES.map((st, i) => (
                      <Bar key={st.key} dataKey={st.key} name={st.label} stackId="s" fill={st.color}
                        radius={i === STATUS_SERIES.length - 1 ? [0, 3, 3, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCanvas>
            </div>
            <ChartLegend items={[
              ...groups.map((g, i) => ({ key: `g-${g.key}`, label: `${g.label} ${g.value}`, color: GROUP_COLORS[i % GROUP_COLORS.length] })),
              ...STATUS_SERIES.map((st) => ({ key: st.key, label: st.label, color: st.color })),
            ]} />
            <TableScroll surface="embedded"><table>
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
          <ChartEmptyState>ยังไม่มีลีดในเดือนนี้</ChartEmptyState>
        )}
      </SaSection>

      {/* AE: SLA ติดต่อ + ผลต่อคน */}
      <SaSection icon={<PhoneCall size={17} />} title="รายผู้รับผิดชอบ (AE KPI)" subtitle="เรียงตามของค้างมากสุด · คอลัมน์ผลงานเป็นของเดือนที่เลือก ส่วน “ค้างตอนนี้” ไม่ผูกกับเดือน">
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
                  <td>{TEAM_LABELS[a.team] || a.team || "-"}</td>
                  <td className="num mono">{a.assigned}</td>
                  <td className="num mono">{a.contacted}</td>
                  <td className="num mono">{pct(a.slaHit, a.contacted)}</td>
                  <td className="num mono">{a.meetings}</td>
                  <td className="num mono">{a.qualified}</td>
                  {/* 🐞 ห้ามเขียน `a.pending || "-"` — 0 คือ "ไม่มีของค้าง" ซึ่งเป็นคำตอบจริง
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
          </table></TableScroll>
      </SaSection>
    </div>
  );
}
