"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { ChartColumn, Info, TriangleAlert } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
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
              <strong>{money(companyStat.target)}</strong>
              <em>{closedCount ? `${closedCount} เดือนที่จบแล้ว` : "ยังไม่มีเดือนที่จบในช่วงนี้"}</em>
            </span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>ขายจริง</small><strong>{money(companyStat.actual)}</strong><em>ไม่รวม VAT ที่บวกท้ายใบ</em></span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>% ทำได้</small><strong>{pct(companyStat.actual, companyStat.target)}</strong>
              <em>{companyStat.target > 0 ? (companyStat.actual >= companyStat.target ? "ถึงเป้า" : "ต่ำกว่าเป้า") : "ยังไม่ได้ตั้งเป้าในช่วงนี้"}</em></span>
          </span>
          <span className="ui-metric">
            <span className="ui-metric-icon"><ChartColumn size={16} /></span>
            <span><small>ส่วนต่าง</small>
              <strong className={companyStat.actual - companyStat.target >= 0 ? styles.up : styles.down}>
                {money(companyStat.actual - companyStat.target)}
              </strong>
              <em>เทียบเป้าของงวดที่จบแล้ว</em></span>
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

        <div className={styles.toolbarRow}>
          <Segmented ariaLabel="มุมมอง" options={SCOPES} value={scope} onChange={setScope} />
          <span className="spacer" />
          <span className={styles.toolbarNote}>
            {months.length} เดือน · จบแล้ว {closedCount} เดือน · ใบสั่งขายในช่วง {(data?.orders || []).length} ใบ
          </span>
        </div>

        {scope === "month" && <MonthTable data={data} closedCount={closedCount} />}
        {scope === "team" && <GroupTable rows={data?.teams || []} idx={splitIdx} months={months} kind="team" />}
        {scope === "person" && <GroupTable rows={data?.people || []} idx={splitIdx} months={months} kind="person" />}

        <OrderTable orders={data?.orders || []} />
      </div>
    </Workspace>
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
    <section className="ui-table-shell">
      <div className="ui-table-header">
        <div>
          <h2>รายเดือน</h2>
          <p>เป้า เทียบ ขายจริง เรียงตามเวลาจริง ข้ามปีปฏิทินได้ · ทบยอดที่ขาดเข้างวดถัดไป และรีเซ็ตทุกต้นปี</p>
        </div>
      </div>
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
        เดือนที่ยังไม่จบไม่คิด % และไม่เข้าผลรวมด้านบน · เดือนที่ไม่ได้ตั้งเป้าขึ้นขีด ไม่ใช่ 0%
      </div>
    </section>
  );
}

/* ── รายทีม / รายคน ───────────────────────────────────────────────────── */
function GroupTable({ rows, idx, months, kind }) {
  // ไม่มีเดือนที่แยกยอด = ไม่มีอะไรให้เทียบ ต่างจาก "ไม่มีคน" — ต้องบอกคนละแบบ
  const empty = !rows.length || !idx.length;
  const label = kind === "team" ? "ทีม" : "ผู้รับผิดชอบ";
  const pick = (arr) => idx.reduce((s, i) => s + Number(arr[i] || 0), 0);
  return (
    <section className="ui-table-shell">
      <div className="ui-table-header">
        <div>
          <h2>{kind === "team" ? "รายทีม" : "รายคน"}</h2>
          <p>
            คิดเฉพาะ <b>{idx.length} เดือน</b>ที่จบแล้วและมีการแยกยอดราย{label}จริง
            {idx.length ? ` (${months[idx[0]] ? formatMonthLabel(months[idx[0]]) : ""} – ${months[idx.at(-1)] ? formatMonthLabel(months[idx.at(-1)]) : ""})` : ""}
            {" "}· ยอดรวมจาก<b>ใบสั่งขายที่อนุมัติแล้ว</b> และเดือนที่กรอกยอดย้อนหลังไว้
          </p>
        </div>
      </div>
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
              {rows.map((row) => {
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
          </table>
        </TableScroll>
      )}
    </section>
  );
}

/* ── ใบสั่งขายในช่วง ──────────────────────────────────────────────────── */
function OrderTable({ orders }) {
  return (
    <section className="ui-table-shell">
      <div className="ui-table-header">
        <div>
          <h2>ใบสั่งขายในช่วงนี้</h2>
          <p>เฉพาะใบที่อนุมัติแล้ว · งวดของยอดคิดจากวันที่อนุมัติตามเวลาไทย ไม่ใช่วันที่บนใบ</p>
        </div>
      </div>
      {!orders.length ? (
        <div className={`empty-state dashed ${styles.emptyBox}`}>
          <strong>ไม่มีใบสั่งขายที่อนุมัติในช่วงนี้</strong>
          <span>ยอดของช่วงนี้ (ถ้ามี) มาจากการกรอกย้อนหลัง ซึ่งไม่มีใบอยู่เบื้องหลัง</span>
        </div>
      ) : (
        <TableScroll surface="embedded" family="list">
          <table>
            <thead>
              <tr>
                <th className={styles.colPeriod}>งวด</th>
                <th className={styles.colDoc}>ใบสั่งขาย</th>
                <th className={styles.colMoney}>ใบเสนอราคา</th>
                <th className={styles.colName}>ลูกค้า</th>
                <th className={styles.colDoc}>ผู้รับผิดชอบ</th>
                <th className={`num ${styles.colCount}`}>บรรทัด</th>
                <th className={`num ${styles.colMoney}`}>ยอดที่นับ</th>
                <th className={`num ${styles.colMoneySm}`}>VAT</th>
                <th className={`num ${styles.colMoney}`}>ยอดหน้าใบ</th>
                <th className={styles.colMoneySm}>ขั้นบัญชี</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatMonthLabel(o.month)}</td>
                  <td>
                    <a href={`/sa/sales-orders/${o.id}`}>{o.orderNumber}</a>
                    {/* ใบที่ส่วนลดท้ายใบเต็มจำนวน — ต้องขึ้นครบทุกใบ ห้ามกรองทิ้ง (มติผู้ใช้) */}
                    {o.free && <span className="ui-badge warning">ไม่คิดเงิน</span>}
                  </td>
                  <td>{o.quoteNumber || NA}</td>
                  <td>{o.customerName || NA}</td>
                  <td>{o.ownerName || NA}</td>
                  <td className="num">{o.lineCount}</td>
                  <td className="num">{money(o.amount)}</td>
                  <td className="num">{o.vatAmount ? money(o.vatAmount) : NA}</td>
                  <td className="num">{money(o.totalAmount)}</td>
                  <td>
                    {o.financeStatus === "approved"
                      ? <span className="ui-badge success">บัญชีตรวจแล้ว</span>
                      : <span className="ui-badge">รอบัญชีตรวจ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>รวม {orders.length} ใบ</td>
                <td className="num">{money(orders.reduce((s, o) => s + o.amount, 0))}</td>
                <td className="num">{money(orders.reduce((s, o) => s + o.vatAmount, 0))}</td>
                <td className="num">{money(orders.reduce((s, o) => s + o.totalAmount, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      )}
      <div className={`ui-table-footer ${styles.footNote}`}>
        <Info size={13} aria-hidden="true" /> 
        <b>ยอดที่นับ</b> = ยอดที่เข้ารายงาน (ยอดหน้าใบ − VAT ที่บวกท้ายใบ) ·
        {" "}รายการสินค้าและจำนวนอยู่ในใบ กดเลขที่ใบเพื่อเปิดดู
      </div>
    </section>
  );
}
