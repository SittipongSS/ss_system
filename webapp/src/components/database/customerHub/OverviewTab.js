"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { ClipboardList, Clock3, Handshake, ListTodo, MessageCircleQuestion, TrendingUp, Wallet } from "lucide-react";
import ChartCard, { ChartCanvas, ChartSummary, ChartTooltip } from "@/components/ui/ChartCard";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { CHART_CATEGORICAL } from "@/lib/chartTheme";
import { formatMonthLabel } from "@/lib/datePeriods";
import { STAGE_LABELS } from "@/lib/salesPlanning";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/statuses";
import { REQUEST_DEPT_LABELS } from "@/lib/master/requestTypes";
import { followUps, monthlyActual, recentEvents } from "@/lib/master/customerHub";
import { fmtDate, fmtDateTime, fmtMoney, naText } from "@/lib/format";
import styles from "./customerHub.module.css";

/* ── แท็บภาพรวมของหน้าลูกค้า (งวด H2 · มติเจ้าของ 13/11/2026 ข้อ 2: เปิดหน้ามาเจอแท็บนี้) ─────────────────
 *
 * สามคำถามที่คนเปิดหน้าลูกค้าอยากรู้ก่อน:
 *  1 ต้องตามอะไรต่อ — งวดเกินกำหนด · คำร้องค้าง · ใบสั่งขายยังไม่อนุมัติ · ดีลที่ยังเปิด (ลิงก์ตรงไปที่ใบ)
 *  2 ลูกค้าซื้อเท่าไรช่วงนี้ — Actual 12 เดือน ตัวคิดเดียวกับรายงานยอดขาย (monthlyActual)
 *  3 ล่าสุดเกิดอะไรขึ้น — เหตุการณ์จากวันที่บนใบ 6 รายการ (ความเคลื่อนไหวรวมจากทุกเธรดคืองวด H3)
 * ⚠️ กลุ่มที่ผู้ดูไม่มีสิทธิ์ (server ส่ง visible:false) ไม่มีรายการ/ไม่มีกราฟ — จอไม่ตัดสินสิทธิ์เอง (มติ 4)
 */
const FOLLOW_LIMIT = 8;
const KIND_ICON = { overdue: Wallet, request: MessageCircleQuestion, order: ClipboardList, deal: Handshake };

function followDetail(item) {
  if (item.kind === "overdue") return `ครบกำหนด ${fmtDate(item.dueDate)} · ${fmtMoney(item.amount)}`;
  if (item.kind === "request") return [REQUEST_DEPT_LABELS[item.dept]?.name || item.dept, REQUEST_STATUS_LABELS[item.status]].filter(Boolean).join(" · ");
  if (item.kind === "order") return SALES_ORDER_STATUS_LABELS[item.status] || item.status;
  return [STAGE_LABELS[item.stage] || item.stage, item.amount ? fmtMoney(item.amount) : null].filter(Boolean).join(" · ");
}

export default function OverviewTab({ hub, today, onGo }) {
  const items = useMemo(() => followUps(hub, today), [hub, today]);
  const actual = useMemo(
    () => (hub.sales.visible ? monthlyActual(hub.sales.orders, hub.finance.installments) : null),
    [hub],
  );
  const recent = useMemo(() => recentEvents(hub), [hub]);
  const shown = items.slice(0, FOLLOW_LIMIT);
  const nothingVisible = !hub.sales.visible && !hub.requests.visible && !hub.finance.visible;

  return (
    <div className={styles.overview}>
      <DetailCard icon={ListTodo} eyebrow="FOLLOW UP" title="ต้องตามต่อ">
        {shown.length ? (
          <ul className={styles.followList}>
            {shown.map((item) => {
              const Icon = KIND_ICON[item.kind] || ListTodo;
              return (
                <li key={item.key} className={styles.followItem}>
                  <Icon size={16} aria-hidden="true" className={styles.followIcon} />
                  <div className={styles.followBody}>
                    <div className={styles.followHead}>
                      <Link prefetch={false} href={item.href} className="linklike font-mono">{item.code || "ร่าง"}</Link>
                      {item.kind === "overdue" && <StatusBadge tone="danger" label="เกินกำหนด" />}
                    </div>
                    <span className={styles.followTitle}>{item.title}</span>
                    <span className={styles.followMeta}>{followDetail(item)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState plain>{nothingVisible ? "ไม่มีข้อมูลที่คุณดูได้ในส่วนนี้" : "ไม่มีงานค้างของลูกค้ารายนี้"}</EmptyState>
        )}
        {items.length > FOLLOW_LIMIT && (
          <p className={styles.followMore}>{`และอีก ${items.length - FOLLOW_LIMIT} รายการ — ดูในแท็บการขาย คำร้อง และการเงิน`}</p>
        )}
      </DetailCard>

      {actual ? (
        <ChartCard
          icon={TrendingUp}
          title="Actual รายเดือน"
          description="12 เดือนล่าสุด · ก่อน VAT · ตัวคิดเดียวกับรายงานยอดขาย"
          minHeight={220}
          summary={<ChartSummary items={[{ key: "total", label: "รวม 12 เดือน", value: fmtMoney(actual.total) }]} />}
        >
          {actual.total > 0 ? (
            <ChartCanvas>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actual.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={(m) => formatMonthLabel(m, { includeYear: false })} tick={{ fontSize: "var(--fs-3)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tick={{ fontSize: "var(--fs-3)", fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={44} />
                  <RTooltip cursor={{ fill: "var(--panel-3)" }} content={<ChartTooltip labelFormatter={(m) => formatMonthLabel(m)} valueFormatter={(v) => fmtMoney(v)} />} />
                  <Bar dataKey="amount" name="Actual" fill={CHART_CATEGORICAL[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCanvas>
          ) : (
            <EmptyState plain>ยังไม่มี Actual ใน 12 เดือนล่าสุด</EmptyState>
          )}
        </ChartCard>
      ) : null}

      <DetailCard
        icon={Clock3}
        eyebrow="RECENT"
        title="ล่าสุด"
        className={styles.wide}
      >
        {recent.length ? (
          <ul className={styles.feed}>
            {recent.map((e) => (
              <li key={e.key} className={styles.feedItem}>
                <span className={styles.feedWhen}>{fmtDateTime(e.at)}</span>
                <span className={styles.feedWhat}>
                  <Link prefetch={false} href={e.href} className="linklike font-mono">{naText(e.code)}</Link>
                  <span>{e.text}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState plain>ยังไม่มีเหตุการณ์ที่คุณดูได้</EmptyState>
        )}
        <div className={styles.feedActions}>
          <Button size="sm" onClick={() => onGo("activity")}>ดูความเคลื่อนไหวทั้งหมด</Button>
        </div>
      </DetailCard>
    </div>
  );
}

