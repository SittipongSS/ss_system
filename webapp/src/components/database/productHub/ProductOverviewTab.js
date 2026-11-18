"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Clock3, ListTodo, TrendingUp } from "lucide-react";
import ChartCard, { ChartCanvas, ChartSummary, ChartTooltip } from "@/components/ui/ChartCard";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import { CHART_CATEGORICAL } from "@/lib/chartTheme";
import { formatMonthLabel } from "@/lib/datePeriods";
import { productMonthlyOrders } from "@/lib/master/productHub";
import { fmtDateTime, fmtMoney, fmtNumber, naText } from "@/lib/format";
import styles from "./productHub.module.css";

/* ── หน้าสินค้าศูนย์รวม · แท็บภาพรวม (งวด S2 · มติเจ้าของ 18/11/2026 ข้อ 4 · docs/product-hub-plan.md) ─────────
 *
 * สามคำถามแรกของคนเปิดหน้าสินค้า (ทรงเดียวกับแท็บภาพรวมของหน้าลูกค้า):
 *  1 ต้องตามต่อ — ตีกลับ · ทะเบียนสรรพสามิต · SO รออนุมัติ · BOM (รายการคิดไว้แล้วที่หน้า: productFollowUps) — กดพาไปแท็บของเรื่อง
 *  2 ขายไปเท่าไรช่วงนี้ — ยอดสั่งซื้อ 12 เดือน ใบที่นับ = ตัวเดียวกับตัวเลขบนหัว · **ปุ่มสลับมูลค่า/จำนวนอยู่ที่กราฟนี้** (มติ 2)
 *     เฉพาะผู้เห็นโมดูลขาย (มติ 5 — ไม่มีสิทธิ์ = ไม่มีการ์ดนี้)
 *  3 ล่าสุดเกิดอะไรขึ้น — เหตุการณ์จากวันที่บนแถว 6 รายการ (เธรดเต็มอยู่แท็บความเคลื่อนไหว)
 */
/* โทนของรายการ → สีจุด (ผูกใน CSS ด้วย data-tone · ไม่ใช้ inline style) */
const TONE_KEYS = new Set(["danger", "warning", "info", "neutral"]);

export default function ProductOverviewTab({ followUps = [], sales = null, events = [], unit = "", onGo }) {
  const [axis, setAxis] = useState("amount");
  const monthly = useMemo(() => (sales?.visible ? productMonthlyOrders(sales) : null), [sales]);
  const isQty = axis === "qty";
  const fmtAxis = (v) => (isQty ? fmtNumber(v) : fmtMoney(v));
  const tick = (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v);

  return (
    <div className={styles.grid2}>
      <DetailCard icon={ListTodo} eyebrow="FOLLOW UP" title="ต้องตามต่อ">
        {followUps.length ? (
          <ul className={styles.followList}>
            {followUps.map((item) => (
              <li key={item.key} className={styles.followItem}>
                <i className={styles.followDot} data-tone={TONE_KEYS.has(item.tone) ? item.tone : "neutral"} aria-hidden="true" />
                <div className={styles.followBody}>
                  <button type="button" className={`linklike ${styles.followTitle}`} onClick={() => onGo(item.tab)}>{item.title}</button>
                  {item.detail ? <span className={styles.followMeta}>{item.detail}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState plain>ไม่มีเรื่องค้างของสินค้านี้</EmptyState>
        )}
      </DetailCard>

      {monthly ? (
        <ChartCard
          icon={TrendingUp}
          title="ยอดสั่งซื้อรายเดือน"
          description={`12 เดือนล่าสุด · ใบสั่งขายที่อนุมัติแล้ว · ${isQty ? `หน่วย ${unit}` : "ก่อน VAT"}`}
          minHeight={220}
          actions={(
            <Segmented
              ariaLabel="แกนกราฟ"
              selection="radio"
              value={axis}
              onChange={setAxis}
              options={[{ value: "amount", label: "มูลค่า" }, { value: "qty", label: "จำนวน" }]}
            />
          )}
          summary={(
            <ChartSummary items={[
              { key: "amount", label: "รวม 12 เดือน", value: fmtMoney(monthly.total.amount) },
              { key: "qty", label: "จำนวน", value: `${fmtNumber(monthly.total.qty)} ${unit}` },
              { key: "orders", label: "ใบสั่งขาย", value: `${fmtNumber(monthly.total.orders)} ใบ` },
            ]} />
          )}
        >
          {monthly.total.orders > 0 ? (
            <ChartCanvas>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={(m) => formatMonthLabel(m, { includeYear: false })} tick={{ fontSize: "var(--fs-3)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={tick} tick={{ fontSize: "var(--fs-3)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={44} />
                  <RTooltip cursor={{ fill: "var(--panel-3)" }} content={<ChartTooltip labelFormatter={(m) => formatMonthLabel(m)} valueFormatter={(v) => (isQty ? `${fmtAxis(v)} ${unit}` : fmtAxis(v))} />} />
                  <Bar dataKey={axis} name={isQty ? "จำนวน" : "มูลค่า"} fill={CHART_CATEGORICAL[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCanvas>
          ) : (
            <EmptyState plain>ยังไม่มีใบสั่งขายที่อนุมัติใน 12 เดือนล่าสุด</EmptyState>
          )}
        </ChartCard>
      ) : null}

      <DetailCard icon={Clock3} eyebrow="RECENT" title="ล่าสุด" className={styles.wide}>
        {events.length ? (
          <ul className={styles.feed}>
            {events.map((e) => (
              <li key={e.key} className={styles.feedItem}>
                <span className={styles.feedWhen}>{fmtDateTime(e.at)}</span>
                <span className={styles.feedWhat}>
                  {e.href
                    ? <Link prefetch={false} href={e.href} className="linklike font-mono">{naText(e.code)}</Link>
                    : <button type="button" className="linklike font-mono" onClick={() => onGo(e.tab)}>{naText(e.code)}</button>}
                  <span>{e.text}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState plain>ยังไม่มีเหตุการณ์ที่คุณดูได้</EmptyState>
        )}
        <div className={styles.feedActions}>
          <Button size="sm" onClick={() => onGo("log")}>ดูความเคลื่อนไหวทั้งหมด</Button>
        </div>
      </DetailCard>
    </div>
  );
}
