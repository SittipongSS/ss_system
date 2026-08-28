"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { ChartColumn, ClipboardList, Info, Search, TriangleAlert } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import {
  FINANCE_STATE_OPTIONS,
  ORDER_GROUP_OPTIONS,
  ORDER_SORT_DEFAULT,
  ORDER_SORT_DIR,
  ORDER_SORT_OPTIONS,
  filterOrders,
  financeStateOf,
  groupOrders,
  sortOrders,
} from "@/lib/sales/reportOrderView";
import MonthRangePicker from "@/components/ui/MonthRangePicker";
import { useCan, useRole } from "@/lib/roleContext";
import { TEAM_LABELS } from "@/lib/permissions";
import { historyYearOptions } from "@/lib/sales/historyEntry";
import { carryIn, closedCountOnAxis } from "@/lib/sales/performanceMath";
import { currentMonth, formatMonthLabel, monthRangeOfWholeYear } from "@/lib/datePeriods";
import { fmtMoney, fmtPercent, NA } from "@/lib/format";
import StatusNotice from "@/components/ui/StatusNotice";
import styles from "./page.module.css";

/* รายงานยอดขาย — เป้าเทียบยอดจริงตามช่วงเดือน แล้วเจาะลงถึงใบสั่งขาย
 *
 * ⭐ **หน้าของตัวเอง ไม่ใช่ส่วนขยายของแท็บผลงานขาย** (มติผู้ใช้ 2026-08-26 หลังรื้อรอบสอง)
 * แท็บผลงานขายเป็นจอ *เฝ้าดู* รายปี (บอร์ดเช้า · heatmap · YoY) ส่วนหน้านี้เป็นจอ
 * *ค้นแล้วเอาออก* ตามช่วง — คนละผู้ใช้ คนละหน้าที่ · ยัดรวมกันแล้วต้องทุบของที่ไม่ได้พัง
 *
 * 🔒 `salesplan:target` เท่านั้น (หัวหน้าฝ่ายขาย + admin) เพราะกางยอดรายคนทั้งฝ่ายในหน้าเดียว
 *
 * ⚠️ **ไทม์ไลน์ของข้อมูลจริงไม่เท่ากันทุกระดับ** (ตรวจกับ prod 2026-08-26):
 *   2023–2024  กรอกยอดรายเดือนย้อนหลังได้ · ไม่มีเป้า
 *   2025       ยอดบริษัทกรอกมือครบ 12 เดือน · ไม่มีเป้า
 *   ม.ค. 2026  เป้าบริษัทเริ่มมีทั้งปี
 *   ก.ค. 2026  **แบ่งทีมจริงเดือนนี้** ⇒ เป้าทีม/รายคนเริ่มมี
 *   ส.ค. 2026  **ย้ายเข้าระบบเดือนนี้** ⇒ ยอดรายคนมาจากใบสั่งขายตั้งแต่นี่ไป
 * ⇒ เดือนก่อนแบ่งทีมต้องขึ้นว่า "ยังไม่แบ่งทีม" ไม่ใช่ปล่อยว่างให้ดูเหมือนข้อมูลหาย
 */

const SCOPES = [
  { value: "month", label: "รายเดือน" },
  { value: "team", label: "รายทีม" },
  { value: "person", label: "รายคน" },
];

const sum = (arr) => (arr || []).reduce((s, v) => s + Number(v || 0), 0);
const money = (v) => fmtMoney(v);
const pct = (actual, target) => (target > 0 ? fmtPercent((actual / target) * 100) : NA);

export default function SalesReportPage() {
  const canTarget = useCan("salesplan:target");
  const role = useRole();

  const now = useMemo(() => new Date(), []);
  const thisMonth = currentMonth(now);
  const thisYear = thisMonth.slice(0, 4);
  /* ขอบล่างของช่วง = ปีเก่าสุดที่ "หน้ากรอกยอดย้อนหลัง" ยอมให้กรอก — ผูกกับกติกาเดียวกัน
     ไม่ฝังเลขปีไว้ในโค้ด ไม่งั้นปีหน้าขอบค้างอยู่ที่เดิมโดยไม่มีใครสังเกต */
  const minMonth = `${historyYearOptions(now).at(-1)}-01`;

  // ตั้งต้นที่ "ปีนี้" — ช่วงเดียวที่มีเป้าครบทุกเดือน
  const [range, setRange] = useState(() => monthRangeOfWholeYear(thisYear));
  const [scope, setScope] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/report?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดรายงานไม่สำเร็จ");
      const json = await res.json();
      if (!isLatest()) return; // ช่วงเปลี่ยนระหว่างรอ — ทิ้งคำตอบรอบเก่าทั้งก้อน
      setData(json);
    } catch (e) {
      if (isLatest() && !opts?.background) setError(e.message || "โหลดรายงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [range.from, range.to, startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  // ห่อไว้ก่อน — อาเรย์ใหม่ทุกเรนเดอร์จะทำให้ useMemo/useCallback ข้างล่างคิดใหม่ทุกครั้ง
  const months = useMemo(() => data?.months || [], [data]);
  const nowAxis = useMemo(() => ({ year: Number(thisMonth.slice(0, 4)), monthIdx: Number(thisMonth.slice(5, 7)) - 1 }), [thisMonth]);
  const closedCount = useMemo(() => closedCountOnAxis(months, nowAxis), [months, nowAxis]);

  /* เดือนที่ยังไม่จบไม่เข้าผลรวม — เอาเป้าเต็มเดือนไปเทียบยอดครึ่งเดือนแล้วอ่านผิดทุกครั้ง
     (บทเรียนเดียวกับ yearSummary ของแท็บผลงานขาย) */
  const rowStat = useCallback((row) => {
    if (!row) return { target: 0, actual: 0 };
    return {
      target: sum(row.target.slice(0, closedCount)),
      actual: sum(row.actual.slice(0, closedCount)),
    };
  }, [closedCount]);

  const company = data?.company || null;
  const companyStat = rowStat(company);

  /* 🐞 **% และส่วนต่างต้องเทียบเฉพาะเดือนที่ "มีเป้า"** (UAT 2026-08-27)
     ช่วงที่คร่อมยุคก่อนตั้งเป้า (2023–2025 ไม่มีเป้าเลย) จะเอายอดของทุกเดือนไปหาร
     เป้าของไม่กี่เดือน — ของจริงที่เจอ: ธ.ค. 2023 – ม.ค. 2026 ขึ้น **2,367%**
     เพราะ 26 เดือนมียอด แต่มีเป้าแค่เดือนเดียว
     ⇒ "ขายจริง" ยังเป็นยอดรวมทุกเดือนที่จบแล้ว (เป็นข้อเท็จจริง ไม่ได้เทียบกับอะไร)
        ส่วน % กับส่วนต่างจำกัดเฉพาะเดือนที่ตั้งเป้าไว้ และบอกจำนวนเดือนกำกับ */
  const targetIdx = useMemo(() => months
    .map((_, i) => i)
    .filter((i) => i < closedCount && Number(company?.target[i] || 0) > 0), [months, closedCount, company]);
  const cmp = useMemo(() => ({
    target: targetIdx.reduce((sum, i) => sum + Number(company?.target[i] || 0), 0),
    actual: targetIdx.reduce((sum, i) => sum + Number(company?.actual[i] || 0), 0),
  }), [targetIdx, company]);

  /* 🪤 **เดือนที่ "แยกยอดรายคน" จริง ๆ ไม่ใช่ทุกเดือนในช่วง** — ก่อนย้ายเข้าระบบ (ส.ค. 2026)
     ยอดถูกกรอกไว้ระดับบริษัทอย่างเดียว แถวรายคนของเดือนพวกนั้นจึงเป็น 0 ทั้งแถว
     ถ้าเอา 0 ไปหารเป้าที่ตั้งไว้ (ก.ค. มีเป้ารายคนแล้ว) รายงานจะบอกว่า "ทุกคนทำได้ 0%"
     ทั้งที่ความจริงคือ *ไม่รู้* เพราะไม่เคยแยกยอด — คนละเรื่องกับทำไม่ได้
     ⇒ มุมมองรายทีม/รายคนคิดเฉพาะเดือนที่มียอดแยกจริงเท่านั้น */
  const splitIdx = useMemo(() => {
    const people = data?.people || [];
    return months.map((_, i) => i).filter((i) => i < closedCount && people.some((p) => Number(p.actual[i] || 0) > 0));
  }, [data, months, closedCount]);
  const peopleActualTotal = sum((data?.people || []).map((p) => sum(splitIdx.map((i) => p.actual[i]))));
  const companySplitActual = sum(splitIdx.map((i) => company?.actual[i]));

  if (!canTarget) {
    return (
      <Workspace icon={<ChartColumn size={22} />} title="รายงานยอดขาย" back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}>
        <StatusNotice tone="warning" title="ไม่มีสิทธิ์เปิดรายงานนี้">
          เปิดได้เฉพาะหัวหน้าฝ่ายขายและผู้ดูแลระบบ{role ? ` — บัญชีนี้เป็น ${role}` : ""}
        </StatusNotice>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<ChartColumn size={22} />}
      title="รายงานยอดขาย"
      subtitle="เป้าเทียบยอดขายจริงตามช่วงที่เลือก · เจาะลงถึงใบสั่งขายที่อนุมัติแล้ว"
      back={{ href: "/sa/targets", label: "กลับหน้าวางเป้า" }}
      loading={loading}
      headerRight={
        <MonthRangePicker
          from={range.from}
          to={range.to}
          min={minMonth}
          now={now}
          onChange={setRange}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {error && <StatusNotice tone="error">{error}</StatusNotice>}

        <section className="ui-metric-strip">
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span>
              <small>เป้าของงวดที่จบแล้ว</small>
              <strong>{money(cmp.target)}</strong>
              <em>{targetIdx.length ? `ตั้งเป้าไว้ ${targetIdx.length} เดือน` : "ยังไม่ได้ตั้งเป้าในช่วงนี้"}</em>
            </span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>ขายจริง</small><strong>{money(companyStat.actual)}</strong>
              <em>{closedCount} เดือนที่จบแล้ว · ไม่รวม VAT ท้ายใบ</em></span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>% ทำได้</small><strong>{pct(cmp.actual, cmp.target)}</strong>
              <em>{cmp.target > 0
                ? `เทียบเฉพาะ ${targetIdx.length} เดือนที่ตั้งเป้า${cmp.actual >= cmp.target ? " · ถึงเป้า" : " · ต่ำกว่าเป้า"}`
                : "ยังไม่ได้ตั้งเป้าในช่วงนี้"}</em></span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>ส่วนต่าง</small>
              {/* ไม่มีเป้า = เทียบไม่ได้ ต้องขึ้นขีดเหมือน % — ของเดิมโชว์ (ยอดจริง − 0)
                  ซึ่งอ่านเป็น "เกินเป้า 135 ล้าน" ในช่วงปี 2023–2024 ที่ยังไม่เคยตั้งเป้า */}
              <strong className={cmp.target > 0 ? (cmp.actual - cmp.target >= 0 ? styles.up : styles.down) : undefined}>
                {cmp.target > 0 ? money(cmp.actual - cmp.target) : NA}
              </strong>
              <em>{cmp.target > 0 ? `เทียบเป้าของ ${targetIdx.length} เดือนนั้น` : "ไม่มีเป้าให้เทียบ"}</em></span>
          </span>
        </section>

        {/* กระทบยอดสามระดับ — ระบบเก็บบริษัท/ทีม/รายคนเป็นสามเส้นแยกกัน ไม่ได้บวกขึ้นไป
            กรอกรายคนไม่ตรงกับยอดบริษัทจึงไม่มีอะไรเตือน ต้องบอกตรงนี้ก่อนเอาไปคิดคอมมิชชั่น */}
        {closedCount > 0 && !splitIdx.length && (
          <div className="alert-banner">
            <span className="alert-banner-icon"><Info size={17} /></span>
            <span className="alert-banner-text">
              ช่วงนี้ยังไม่มีเดือนที่<b>แยกยอดรายคน</b> — ดูได้เฉพาะยอดรวมของทั้งบริษัท ·
              {" "}ฝ่ายขายแบ่งทีมเมื่อ ก.ค. 2026 และย้ายเข้าระบบเมื่อ ส.ค. 2026
              {" "}(ยอดรายคนก่อนหน้านั้นต้องกรอกที่หน้า “ยอดขายย้อนหลัง” ถ้าต้องการ)
            </span>
          </div>
        )}
        {splitIdx.length > 0 && Math.abs(companySplitActual - peopleActualTotal) > 1 && (
          <div className="alert-banner" data-tone="danger">
            <span className="alert-banner-icon"><TriangleAlert size={17} /></span>
            <span className="alert-banner-text">
              เฉพาะ {splitIdx.length} เดือนที่แยกยอดรายคน: ยอดบริษัท <b>{money(companySplitActual)}</b>
              {" "}ไม่ตรงกับผลรวมรายคน <b>{money(peopleActualTotal)}</b>
              {" "}(ต่าง {money(Math.abs(companySplitActual - peopleActualTotal))}) —
              {" "}ระบบเก็บบริษัท/ทีม/รายคนเป็นสามเส้นแยกกัน กรอกไม่ตรงกันจะไม่มีอะไรเตือน
              {" "}ต้องแก้ให้ตรงก่อนเอาไปคิดคอมมิชชั่น
            </span>
          </div>
        )}

        {/* ⭐ ตัวสลับมุมมองอยู่ใน **หัวการ์ดสรุป** ไม่ใช่ toolbar ของหน้า (รื้อ 2026-08-27)
            ของเดิมมันลอยอยู่กลางหน้าในตำแหน่งที่หน้าอื่นวาง "ตัวกรอง" แต่คุมแค่ตารางบน
            คนกดแล้วไม่รู้ว่ามีผลกับอะไร — ตัวคุมต้องอยู่ติดกับของที่มันคุม */}
        <SummaryCard
          scope={scope} onScope={setScope}
          data={data} months={months} closedCount={closedCount} splitIdx={splitIdx}
        />

        <OrderSearchCard orders={data?.orders || []} people={data?.people || []} />
      </div>
    </Workspace>
  );
}

/* ── การ์ดสรุป — หัวการ์ดถือตัวสลับมุมมอง เนื้อในเปลี่ยนตามที่เลือก ────────── */
function SummaryCard({ scope, onScope, data, months, closedCount, splitIdx }) {
  return (
    <section className="ui-section">
      <div className="ui-section-header">
        <div className="ui-section-title">
          <ChartColumn size={17} aria-hidden="true" />
          <div>
            <h2>สรุปยอด</h2>
            <p>{months.length} เดือนในช่วง · จบแล้ว {closedCount} เดือน</p>
          </div>
        </div>
        <div className="ui-section-actions">
          <Segmented ariaLabel="มุมมองสรุป" options={SCOPES} value={scope} onChange={onScope} />
        </div>
      </div>
      {/* ⚠️ ต้องอยู่ใน `.ui-section-body` — เปลือกการ์ดใส่ระยะขอบให้ตัวเลื่อนตารางที่เป็น
          *ลูกตรง* ของ `.ui-section` โดยคิดว่าไม่มีชั้นนี้ พอไม่มี body ตารางจะกว้างเกินการ์ด
          32px แล้วโดน `overflow: hidden` ตัดคอลัมน์ขวาสุดทิ้งโดยเลื่อนตามไปดูไม่ได้ */}
      <div className="ui-section-body">
        {scope === "month" && <MonthTable data={data} closedCount={closedCount} />}
        {scope === "team" && <GroupTable rows={data?.teams || []} idx={splitIdx} months={months} kind="team" />}
        {scope === "person" && <GroupTable rows={data?.people || []} idx={splitIdx} months={months} kind="person" />}
      </div>
    </section>
  );
}

/* ── รายเดือน ─────────────────────────────────────────────────────────── */
function MonthTable({ data, closedCount }) {
  const months = data?.months || [];
  const company = data?.company;
  if (!company) return null;

  /* ทบยอด: เป้าที่ต้องปิดของเดือนนี้ = เป้าเดือนนี้ + ยอดที่ขาดสะสมในปีเดียวกัน
     ⭐ รีเซ็ตทุกต้นปีปฏิทิน (มติผู้ใช้ 2026-08-26) — `carryIn` รับ months แล้วตัดรอบให้เอง */
  return (
    <>
      <TableScroll surface="embedded" family="list">
        <table>
          <thead>
            <tr>
              <th className={styles.colPeriod}>งวด</th>
              <th className={`num ${styles.colMoneySm}`}>เป้า</th>
              <th className={`num ${styles.colMoneySm}`}>ทบยกมา</th>
              <th className={`num ${styles.colMoney}`}>ต้องปิด</th>
              <th className={`num ${styles.colMoney}`}>ขายจริง</th>
              <th className={`num ${styles.colMoneySm}`}>ส่วนต่าง</th>
              <th className={`num ${styles.colPct}`}>% ทำได้</th>
              <th className={styles.colSource}>ที่มาของยอด</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month, i) => {
              const target = Number(company.target[i] || 0);
              const actual = Number(company.actual[i] || 0);
              const closed = i < closedCount;
              const carry = closed ? carryIn(company.target, company.actual, i, closedCount, months) : 0;
              const mustClose = target + carry;
              const diff = actual - mustClose;
              return (
                <tr key={month}>
                  <td>
                    {formatMonthLabel(month)}
                    {!closed && <span className="ui-badge warning">ยังไม่จบเดือน</span>}
                  </td>
                  <td className="num">{target ? money(target) : NA}</td>
                  <td className="num">{carry ? money(carry) : NA}</td>
                  <td className="num">{mustClose ? money(mustClose) : NA}</td>
                  <td className="num">{actual ? money(actual) : NA}</td>
                  <td className={`num ${closed && mustClose ? (diff >= 0 ? styles.up : styles.down) : ""}`.trim()}>
                    {closed && mustClose ? money(diff) : NA}
                  </td>
                  <td className="num">{closed ? pct(actual, mustClose) : NA}</td>
                  <td>
                    {company.history[i]
                      ? <span className="ui-badge">กรอกย้อนหลัง</span>
                      : (actual ? <span className="ui-badge info">จากใบสั่งขาย</span> : NA)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <div className={`ui-table-footer ${styles.footNote}`}>
        เรียงตามเวลาจริง ข้ามปีปฏิทินได้ · ทบยอดที่ขาดเข้างวดถัดไปและรีเซ็ตทุกต้นปี ·
        {" "}เดือนที่ยังไม่จบไม่คิด % และไม่เข้าผลรวมด้านบน · เดือนที่ไม่ได้ตั้งเป้าขึ้นขีด ไม่ใช่ 0%
      </div>
    </>
  );
}

/* ── รายทีม / รายคน ───────────────────────────────────────────────────── */
function GroupTable({ rows, idx, months, kind }) {
  // ไม่มีเดือนที่แยกยอด = ไม่มีอะไรให้เทียบ ต่างจาก "ไม่มีคน" — ต้องบอกคนละแบบ
  const empty = !rows.length || !idx.length;
  const label = kind === "team" ? "ทีม" : "ผู้รับผิดชอบ";
  const pick = (arr) => idx.reduce((s, i) => s + Number(arr[i] || 0), 0);
  return (
    <>
      {empty ? (
        <div className={`empty-state dashed ${styles.emptyBox}`}>
          <strong>ช่วงนี้ยังไม่มีเดือนที่แยกยอดราย{label}</strong>
          <span>
            ฝ่ายขายแบ่งทีมเมื่อ ก.ค. 2026 และย้ายเข้าระบบเมื่อ ส.ค. 2026 —
            {" "}ก่อนหน้านั้นยอดถูกกรอกไว้ระดับบริษัทอย่างเดียว จึงเทียบราย{label}ไม่ได้
            {" "}(เดือนที่ยังไม่จบก็ยังไม่นับ)
          </span>
        </div>
      ) : (
        <TableScroll surface="embedded" family="list">
          <table>
            <thead>
              <tr>
                <th className={styles.colName}>{label}</th>
                {kind === "person" && <th className={styles.colTeam}>ทีม</th>}
                <th className={`num ${styles.colMoneySm}`}>เป้า</th>
                <th className={`num ${styles.colMoney}`}>ขายจริง</th>
                <th className={`num ${styles.colMoneySm}`}>ส่วนต่าง</th>
                <th className={`num ${styles.colPct}`}>% ทำได้</th>
              </tr>
            </thead>
            <tbody>
              {/* เรียงตามยอดขายจริงมากไปน้อย — รายงานนี้ใช้ประชุมสรุปยอดและคิดคอมมิชชั่น
                  ลำดับตามที่ฐานข้อมูลคืนมาอ่านไม่รู้เรื่องเวลากางในที่ประชุม */}
              {[...rows].sort((a, b) => pick(b.actual) - pick(a.actual)).map((row) => {
                const target = pick(row.target);
                const actual = pick(row.actual);
                const diff = actual - target;
                return (
                  <tr key={row.ownerId || row.team}>
                    <td>{kind === "team" ? (TEAM_LABELS[row.team] || row.team) : row.ownerName}</td>
                    {kind === "person" && <td>{TEAM_LABELS[row.team] || row.team || NA}</td>}
                    <td className="num">{target ? money(target) : NA}</td>
                    <td className="num">{actual ? money(actual) : NA}</td>
                    <td className={`num ${target ? (diff >= 0 ? styles.up : styles.down) : ""}`.trim()}>
                      {target ? money(diff) : NA}
                    </td>
                    <td className="num">{pct(actual, target)}</td>
                  </tr>
                );
              })}
            </tbody>
            {/* แถวรวม — ต้องมี เพราะคนอ่านต้องกระทบยอดกับหัวรายงานได้ทันทีในที่ประชุม */}
            <tfoot>
              <tr>
                <td>รวม {rows.length} {kind === "team" ? "ทีม" : "คน"}</td>
                {kind === "person" && <td>{NA}</td>}
                <td className={`num ${styles.colMoneySm}`}>{money(rows.reduce((s, r) => s + pick(r.target), 0))}</td>
                <td className={`num ${styles.colMoney}`}>{money(rows.reduce((s, r) => s + pick(r.actual), 0))}</td>
                <td className="num">
                  {money(rows.reduce((s, r) => s + pick(r.actual) - pick(r.target), 0))}
                </td>
                <td className="num">
                  {pct(rows.reduce((s, r) => s + pick(r.actual), 0), rows.reduce((s, r) => s + pick(r.target), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      )}
      {!empty && (
        <div className={`ui-table-footer ${styles.footNote}`}>
          คิดเฉพาะ <b>{idx.length} เดือน</b>ที่จบแล้วและมีการแยกยอดราย{label}จริง
          {idx.length ? ` (${months[idx[0]] ? formatMonthLabel(months[idx[0]]) : ""} – ${months[idx.at(-1)] ? formatMonthLabel(months[idx.at(-1)]) : ""})` : ""}
          {" "}· ยอดรวมจาก<b>ใบสั่งขายที่อนุมัติแล้ว</b> และเดือนที่กรอกยอดย้อนหลังไว้
        </div>
      )}
    </>
  );
}

/* ── ค้นหาใบสั่งขาย ───────────────────────────────────────────────────────
   ⭐ **ไม่แสดงรายการจนกว่าจะกดค้นหา** (มติผู้ใช้ 2026-08-27)
   ของเดิมกางทุกใบทันที — 82 ใบ = ตารางสูง 4,686px คิดเป็น 77% ของทั้งหน้า
   ดันตารางสรุปหายจากจอ และสิ้นปีจะเป็นหลายร้อยใบ
   ⇒ ใส่เงื่อนไขก่อน แล้วค่อยกด — คนเปิดรายงานมาดู "สรุป" เป็นหลัก ส่วนรายใบคือ
   การไล่หาเฉพาะกิจ (ใบของใคร ลูกค้าไหน รอบัญชีตรวจกี่ใบ)

   ⚠️ ใบทั้งช่วงถูกส่งมากับ response อยู่แล้ว การกดค้นหาจึงเป็นการ *กรองในหน้า*
   ไม่ยิงเซิร์ฟเวอร์ใหม่ — เร็วทันที และตัวเลขตรงกับสรุปด้านบนเสมอเพราะมาจากก้อนเดียวกัน */
function OrderSearchCard({ orders, people }) {
  const [draft, setDraft] = useState({ q: "", owners: [], teams: [], finance: [] });
  const [applied, setApplied] = useState(null);   // null = ยังไม่เคยกดค้นหา
  const [groupBy, setGroupBy] = useState("none");
  const [sortKey, setSortKey] = useState(ORDER_SORT_DEFAULT);
  const [sortDir, setSortDir] = useState(ORDER_SORT_DIR[ORDER_SORT_DEFAULT]);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const ownerOptions = useMemo(() => people
    .filter((p) => p.ownerId)
    .map((p) => ({ value: p.ownerId, label: p.ownerName || p.ownerId })), [people]);
  const teamOptions = useMemo(() => [...new Set(orders.map((o) => o.team).filter(Boolean))]
    .map((team) => ({ value: team, label: TEAM_LABELS[team] || team })), [orders]);

  const filterCount = draft.owners.length + draft.teams.length + draft.finance.length;
  const setDraftField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => setDraft({ q: "", owners: [], teams: [], finance: [] });

  const groups = useMemo(() => {
    if (!applied) return [];
    return groupOrders(sortOrders(filterOrders(orders, applied), sortKey, sortDir), groupBy, { teamLabels: TEAM_LABELS });
  }, [applied, orders, sortKey, sortDir, groupBy]);
  const shown = groups.reduce((sum, g) => sum + g.count, 0);
  const shownTotal = groups.reduce((sum, g) => sum + g.total, 0);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  return (
    <section className="ui-section">
      <div className="ui-section-header">
        <div className="ui-section-title">
          <ClipboardList size={17} aria-hidden="true" />
          <div>
            <h2>ใบสั่งขาย</h2>
            <p>มีในช่วงนี้ {orders.length} ใบ · เฉพาะใบที่อนุมัติแล้ว งวดคิดจากวันที่อนุมัติตามเวลาไทย</p>
          </div>
        </div>
      </div>

      <div className="ui-section-body">
        {/* ลำดับบน toolbar ตามกติกากลางของ ViewMenus: ค้นหา · ตัวกรอง · จัดกลุ่ม · spacer · เรียง */}
        <div className={styles.toolbarRow}>
          <div className="search-glass">
            <Search size={16} color="var(--text-3)" />
            <input
              autoComplete="off"
              value={draft.q}
              onChange={(e) => setDraftField("q", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setApplied({ ...draft }); }}
              placeholder="เลขที่ใบ / ใบเสนอราคา / ลูกค้า / ผู้รับผิดชอบ"
              aria-label="ค้นหาใบสั่งขาย"
            />
          </div>
          <FilterPopover
            count={filterCount}
            onClear={clearFilters}
            groups={[
              { key: "owners", label: "ผู้รับผิดชอบ", options: ownerOptions, selected: draft.owners, onChange: (v) => setDraftField("owners", v) },
              { key: "teams", label: "ทีม", options: teamOptions, selected: draft.teams, onChange: (v) => setDraftField("teams", v) },
              { key: "finance", label: "ขั้นบัญชี", options: FINANCE_STATE_OPTIONS, selected: draft.finance, onChange: (v) => setDraftField("finance", v) },
            ]}
          />
          <Button tone="accent" onClick={() => setApplied({ ...draft })}>
            <Search size={15} aria-hidden="true" /> ค้นหา
          </Button>
          {applied && (
            <Button variant="quiet" size="sm" onClick={() => { clearFilters(); setApplied(null); }}>
              ล้าง ×
            </Button>
          )}

          {applied && (
            <>
              <GroupMenu
                title="จัดกลุ่มใบ"
                value={groupBy}
                onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
                options={ORDER_GROUP_OPTIONS}
              />
              {groupBy !== "none" && groups.length > 0 && (
                <CollapseAllButton
                  collapsed={allCollapsed}
                  onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
                />
              )}
              <span className="spacer" />
              {/* เปลี่ยนแบบเรียง = ตั้งทิศตั้งต้นของแบบนั้นให้ด้วย (กติกาเดียวกับทะเบียนการชำระ) */}
              <SortMenu
                title="เรียงลำดับใบ"
                value={sortKey}
                defaultValue={ORDER_SORT_DEFAULT}
                onChange={(value) => { setSortKey(value); setSortDir(ORDER_SORT_DIR[value]); }}
                options={ORDER_SORT_OPTIONS}
              />
              <SortDirButton dir={sortDir} onToggle={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} />
            </>
          )}
        </div>

        {!applied ? (
          <EmptyState dashed plain icon={Search} className={styles.emptyBox}>
            <strong>ใส่เงื่อนไขแล้วกด “ค้นหา”</strong>
            <span>
              ช่วงนี้มีใบสั่งขายที่อนุมัติแล้ว {orders.length} ใบ — กดค้นหาโดยไม่ใส่อะไรเลยก็ได้ จะขึ้นทั้งหมด
            </span>
          </EmptyState>
        ) : !shown ? (
          <EmptyState dashed plain icon={Search} className={styles.emptyBox}>
            <strong>ไม่พบใบที่ตรงกับเงื่อนไข</strong>
            <span>ลองลดตัวกรอง หรือค้นด้วยเลขที่ใบ/ชื่อลูกค้าแทน</span>
          </EmptyState>
        ) : (
          <>
            <div className={styles.resultNote}>
              พบ <b>{shown}</b> ใบ จาก {orders.length} ใบในช่วง · ยอดที่นับรวม <b>{money(shownTotal)}</b>
            </div>
            <TableScroll surface="embedded" family="list">
              <table>
                <thead>
                  <tr>
                    <th className={styles.colPeriod}>งวด</th>
                    <th className={styles.colDoc}>ใบสั่งขาย</th>
                    <th className={`num ${styles.colMoney}`}>ใบเสนอราคา</th>
                    <th className={styles.colName}>ลูกค้า</th>
                    <th className={styles.colDoc}>ผู้รับผิดชอบ</th>
                    <th className={`num ${styles.colCount}`}>บรรทัด</th>
                    <th className={`num ${styles.colMoney}`}>ยอดที่นับ</th>
                    <th className={`num ${styles.colMoneySm}`}>VAT</th>
                    <th className={`num ${styles.colMoney}`}>ยอดหน้าใบ</th>
                    <th className={`num ${styles.colMoneySm}`}>ขั้นบัญชี</th>
                  </tr>
                </thead>
                {groups.map((group) => {
                  const isCollapsed = collapsed.has(group.key);
                  return (
                    <tbody key={group.key}>
                      {group.label && (
                        <tr className="group-row">
                          <td colSpan={10}>
                            <button
                              type="button"
                              className="linklike"
                              onClick={() => setCollapsed((prev) => {
                                const next = new Set(prev);
                                if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                                return next;
                              })}
                            >
                              {isCollapsed ? "▸" : "▾"} {group.label} · {group.count} ใบ · {money(group.total)}
                            </button>
                          </td>
                        </tr>
                      )}
                      {!isCollapsed && group.orders.map((o) => (
                        <tr key={o.id}>
                          <td>{formatMonthLabel(o.month)}</td>
                          <td>
                            <a href={`/sa/sales-orders/${o.id}`}>{o.orderNumber}</a>
                            {/* ใบที่ส่วนลดท้ายใบเต็มจำนวน — ต้องขึ้นครบทุกใบ ห้ามกรองทิ้ง (มติผู้ใช้) */}
                            {o.free && <span className="ui-badge warning">ไม่คิดเงิน</span>}
                          </td>
                          <td className="num">{o.quoteNumber || NA}</td>
                          <td>{o.customerName || NA}</td>
                          <td>{o.ownerName || NA}</td>
                          <td className="num">{o.lineCount}</td>
                          <td className="num">{money(o.amount)}</td>
                          <td className="num">{o.vatAmount ? money(o.vatAmount) : NA}</td>
                          <td className="num">{money(o.totalAmount)}</td>
                          <td className="num">
                            {financeStateOf(o) === "approved"
                              ? <span className="ui-badge success">ตรวจแล้ว</span>
                              : <span className="ui-badge">รอตรวจ</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
                <tfoot>
                  <tr>
                    <td colSpan={6}>รวมที่ค้นเจอ {shown} ใบ</td>
                    <td className="num">{money(shownTotal)}</td>
                    <td className="num">{money(groups.flatMap((g) => g.orders).reduce((s, o) => s + o.vatAmount, 0))}</td>
                    <td className="num">{money(groups.flatMap((g) => g.orders).reduce((s, o) => s + o.totalAmount, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </TableScroll>
          </>
        )}

        <div className={styles.footNote}>
          <Info size={13} aria-hidden="true" />{" "}
          <b>ยอดที่นับ</b> = ยอดที่เข้ารายงาน (ยอดหน้าใบ − VAT ที่บวกท้ายใบ) ·
          {" "}รายการสินค้าและจำนวนอยู่ในใบ กดเลขที่ใบเพื่อเปิดดู
        </div>
      </div>
    </section>
  );
}
