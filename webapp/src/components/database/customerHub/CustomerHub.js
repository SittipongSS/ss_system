"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Beaker, CalendarDays, ClipboardCheck, ClipboardList, FileSignature, FileText, Flag, FlaskConical, Handshake,
  Inbox, Layers, MessageCircleQuestion, Package, Tag, Users, Wallet,
} from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import ProductStatusPill from "@/components/ProductStatusPill";
import HubListPanel from "./HubListPanel";
import OverviewTab from "./OverviewTab";
import ActivityTab from "./ActivityTab";
import styles from "./customerHub.module.css";
import { QUOTE_STATUS_LABELS } from "@/components/salesPlanning/ui";
import { DEAL_TYPE_LABELS, STAGE_LABELS } from "@/lib/salesPlanning";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES } from "@/lib/sales/salesOrderFinanceApproval";
import { INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES } from "@/lib/sales/salesOrderPayments";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES, contractKindLabel } from "@/lib/sales/contracts";
import { LEAD_STATUS_LABELS } from "@/lib/sales/leads";
import { REQUEST_STATUS_LABELS, requestStatusView } from "@/lib/requests/statuses";
import { REQUEST_DEPT_LABELS, requestKindLabel } from "@/lib/master/requestTypes";
import { statusMeta as exciseStatusMeta } from "@/lib/excise/workflow";
import { SCENT_STATUS_LABELS, SCENT_STATUS_TONES } from "@/lib/master/scents";
import { FORMULA_STATUS_LABELS, FORMULA_STATUS_TONES } from "@/lib/master/formulas";
import { formulaLabelParts, formulaSearchText, scentLabelParts, scentSearchText } from "@/lib/master/registryLabel";
import { isExciseOrder } from "@/lib/sales/historicalOrders";
import {
  buildDealRows, contractText, dealRowText, installmentState, installmentText, leadText, matchesQuery, orderText,
  productOrderStats, quoteText, registrationText, requestText, hubText, todayKey,
} from "@/lib/master/customerHub";
import { fmtDate, fmtMoney, naText, NA, productNameBoth } from "@/lib/format";

/* ── หน้าลูกค้าศูนย์รวม · แท็บข้อมูลที่เกี่ยวข้อง (งวด H1 · มติเจ้าของ 13/11/2026 · docs/customer-hub-plan.md) ─────
 *
 * มติที่ล็อกไว้ในไฟล์นี้:
 *  1 แท็บการขายเปิดที่มุมมอง "ตามดีล" — ดีลหนึ่งแถวเห็น QT → SO → ชำระ → Actual · ตาราง QT/SO/สัญญา/ลีด สลับดูได้
 *  3 ลีดขึ้นเฉพาะที่เป็นดีลแล้ว (ข้อมูลมาจาก server แล้ว)
 *  4 กลุ่มที่ผู้ดูไม่มีสิทธิ์ = แท็บไม่โผล่ (server ส่ง visible:false) — จอไม่ตัดสินสิทธิ์เอง
 *  6 แท็บสรรพสามิต = ทะเบียน + SO ค่าสรรพสามิต · โผล่เมื่อมีของ
 *  7 คำค้นช่องเดียวกรองทุกแท็บ · ตัวเลขบนแท็บ = จำนวนที่เจอ · กรอง/จัดกลุ่ม/เรียง/ตัดหน้า ตามตารางในแผน
 */
const time = (v) => { const ms = Date.parse(v || ""); return Number.isFinite(ms) ? ms : 0; };
const byTime = (key) => (a, b) => time(key(a)) - time(key(b));
const byNum = (key) => (a, b) => (Number(key(a)) || 0) - (Number(key(b)) || 0);
const byText = (key) => (a, b) => String(key(a) || "").localeCompare(String(key(b) || ""), "th");
const optionsOf = (rows, keyOf, labelOf) => {
  const seen = new Map();
  for (const row of rows) { const k = keyOf(row); if (k && !seen.has(k)) seen.set(k, labelOf(k, row)); }
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
};
const inValues = (keyOf) => (row, values) => values.includes(keyOf(row));

const STAGE_TONES = {
  lead: "neutral", qualified: "neutral", timeline_proposed: "info", quotation: "info", awaiting_confirm: "info",
  deposit_pending: "warning", won: "success", in_project: "success", lost: "danger",
};
const QUOTE_TONES = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", cancelled: "danger", revised: "neutral", closed: "neutral" };
const ORDER_TONES = { draft: "neutral", pending_approval: "warning", approved: "success", rejected: "danger", revised: "neutral", approval_revoked: "warning", cancelled: "danger" };

const Code = ({ children }) => <span className="font-mono text-xs">{children}</span>;
const Sub = ({ children }) => (children ? <span className="block text-xs text-[var(--text-3)] truncate">{children}</span> : null);
const Money = ({ value }) => <span className="font-mono">{fmtMoney(value)}</span>;
const DocLink = ({ href, children }) => <Link prefetch={false} href={href} className="linklike font-mono text-xs">{children}</Link>;

/* ── การขาย ──────────────────────────────────────────────────────────────────────────── */
function SalesTab({ hub, query, onQuery, today }) {
  const { deals, leads, quotations, orders, contracts } = hub.sales;
  const [view, setView] = useState("deal");
  const [showOldQuotes, setShowOldQuotes] = useState(false);
  const dealCode = useMemo(() => new Map(deals.map((d) => [d.id, d.code || d.title])), [deals]);
  const dealRows = useMemo(() => buildDealRows({
    deals, quotations, orders, installments: hub.finance.installments, requests: hub.requests.rows, contracts, leads,
  }, today), [deals, quotations, orders, hub.finance.installments, hub.requests.rows, contracts, leads, today]);
  const saleQuotes = useMemo(() => quotations.filter((q) => !isExciseOrder(q)), [quotations]);
  const latestQuoteIds = useMemo(() => {
    const latest = new Map();
    for (const q of saleQuotes) {
      const key = q.baseNumber || q.quoteNumber || q.id;
      const cur = latest.get(key);
      if (!cur || (Number(q.revisionNo) || 0) > (Number(cur.revisionNo) || 0)) latest.set(key, q);
    }
    return new Set([...latest.values()].map((q) => q.id));
  }, [saleQuotes]);
  const quoteRows = showOldQuotes ? saleQuotes : saleQuotes.filter((q) => latestQuoteIds.has(q.id));
  const saleOrders = useMemo(() => orders.filter((o) => !isExciseOrder(o)), [orders]);
  const leadDeal = useMemo(() => new Map(deals.filter((d) => d.leadId).map((d) => [d.leadId, d])), [deals]);

  const count = (rows, text) => rows.filter((r) => matchesQuery(text(r), query)).length;
  const switcher = (
    <Segmented
      ariaLabel="มุมมองการขาย"
      value={view}
      onChange={setView}
      options={[
        { value: "deal", label: "ตามดีล", count: count(dealRows, dealRowText) },
        { value: "quote", label: "ใบเสนอราคา", count: count(quoteRows, (q) => quoteText(q, dealCode.get(q.dealId))) },
        { value: "order", label: "ใบสั่งขาย", count: count(saleOrders, (o) => orderText(o, dealCode.get(o.dealId))) },
        { value: "contract", label: "สัญญา", count: count(contracts, (c) => contractText(c, dealCode.get(c.dealId))) },
        { value: "lead", label: "ลีด", count: count(leads, leadText) },
      ]}
    />
  );
  const common = { query, onQuery, extraToolbar: switcher };

  if (view === "quote") {
    const olderCount = saleQuotes.length - latestQuoteIds.size;
    return (
      <HubListPanel
        {...common}
        stateKey="hub-quote"
        icon={<FileText size={17} aria-hidden="true" />}
        title="ใบเสนอราคา"
        subtitle="ฉบับล่าสุดของแต่ละสาย · กดเลขที่เพื่อเปิดใบ"
        unit="ใบ"
        rows={quoteRows}
        searchPlaceholder="ค้นหาเลข QT / เลขอ้างอิง / ดีล"
        textOf={(q) => quoteText(q, dealCode.get(q.dealId))}
        extraToolbar={(
          <>
            {switcher}
            {olderCount > 0 && (
              <Button size="sm" onClick={() => setShowOldQuotes((v) => !v)}>
                {showOldQuotes ? "ซ่อน Rev. เก่า" : `แสดง Rev. เก่า (${olderCount})`}
              </Button>
            )}
          </>
        )}
        filters={[{
          key: "status", label: "สถานะ", icon: Flag,
          options: optionsOf(quoteRows, (q) => q.status, (k) => QUOTE_STATUS_LABELS[k] || k),
          test: inValues((q) => q.status),
        }]}
        sorts={[
          { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((q) => q.quoteDate || q.createdAt) },
          { value: "amount", label: "ยอดรวม", dir: "desc", compare: byNum((q) => q.totalAmount) },
        ]}
        rowHref={(q) => `/sa/quotations/${q.id}`}
        rowClassName={(q) => (latestQuoteIds.has(q.id) ? "" : "opacity-[var(--op-muted)]")}
        columns={[
          { key: "no", label: "เลขที่", render: (q) => <Code>{q.quoteNumber}</Code> },
          { key: "deal", label: "ดีล", render: (q) => <Code>{naText(dealCode.get(q.dealId))}</Code> },
          { key: "date", label: "วันที่", render: (q) => fmtDate(q.quoteDate || q.createdAt) },
          { key: "status", label: "สถานะ", render: (q) => <StatusBadge tone={QUOTE_TONES[q.status] || "neutral"} label={QUOTE_STATUS_LABELS[q.status] || q.status} /> },
          { key: "total", label: "ยอดรวม", className: "num", render: (q) => <Money value={q.totalAmount} /> },
        ]}
        emptyText="ยังไม่มีใบเสนอราคาของลูกค้ารายนี้"
      />
    );
  }

  if (view === "order") {
    return (
      <HubListPanel
        {...common}
        stateKey="hub-order"
        icon={<ClipboardList size={17} aria-hidden="true" />}
        title="ใบสั่งขาย"
        subtitle="รวมใบย้อนหลัง · ใบค่าสรรพสามิตอยู่แท็บสรรพสามิต"
        unit="ใบ"
        rows={saleOrders}
        searchPlaceholder="ค้นหาเลข SO / เลข PO ลูกค้า / ดีล"
        textOf={(o) => orderText(o, dealCode.get(o.dealId))}
        filters={[
          { key: "status", label: "สถานะ", icon: Flag, options: optionsOf(saleOrders, (o) => o.status, (k) => SALES_ORDER_STATUS_LABELS[k] || k), test: inValues((o) => o.status) },
          { key: "finance", label: "สถานะบัญชี", icon: Wallet, options: optionsOf(saleOrders, (o) => o.financeStatus, (k) => FINANCE_STATUS_LABELS[k] || k), test: inValues((o) => o.financeStatus) },
        ]}
        sorts={[
          { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((o) => o.orderDate || o.createdAt) },
          { value: "amount", label: "ยอดรวม", dir: "desc", compare: byNum((o) => o.totalAmount) },
        ]}
        rowHref={(o) => `/sa/sales-orders/${o.id}`}
        columns={[
          { key: "no", label: "เลขที่", render: (o) => <><Code>{o.orderNumber}</Code><Sub>{o.referenceDoc ? `PO ${o.referenceDoc}` : null}</Sub></> },
          { key: "deal", label: "ดีล", render: (o) => <Code>{naText(dealCode.get(o.dealId))}</Code> },
          { key: "date", label: "วันที่", render: (o) => fmtDate(o.orderDate || o.createdAt) },
          { key: "status", label: "สถานะ", render: (o) => <StatusBadge tone={ORDER_TONES[o.status] || "neutral"} label={SALES_ORDER_STATUS_LABELS[o.status] || o.status} /> },
          { key: "finance", label: "บัญชี", render: (o) => (o.financeStatus ? <StatusBadge tone={FINANCE_STATUS_TONES[o.financeStatus] || "neutral"} label={FINANCE_STATUS_LABELS[o.financeStatus] || o.financeStatus} /> : NA) },
          { key: "total", label: "ยอดรวม", className: "num", render: (o) => <Money value={o.totalAmount} /> },
        ]}
        emptyText="ยังไม่มีใบสั่งขายของลูกค้ารายนี้"
      />
    );
  }

  if (view === "contract") {
    return (
      <HubListPanel
        {...common}
        stateKey="hub-contract"
        icon={<FileSignature size={17} aria-hidden="true" />}
        title="สัญญา"
        subtitle="ฉบับล่าสุดของแต่ละสาย"
        unit="ฉบับ"
        rows={contracts}
        searchPlaceholder="ค้นหาเลขสัญญา / เลขเอกสารภายนอก / ดีล"
        textOf={(c) => contractText(c, dealCode.get(c.dealId))}
        filters={[{ key: "status", label: "สถานะ", icon: Flag, options: optionsOf(contracts, (c) => c.status, (k) => CONTRACT_STATUS_LABELS[k] || k), test: inValues((c) => c.status) }]}
        sorts={[{ value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((c) => c.contractDate || c.createdAt) }]}
        rowHref={(c) => `/sa/contracts/${c.id}`}
        columns={[
          { key: "no", label: "เลขที่", render: (c) => <><Code>{c.contractNo || NA}</Code><Sub>{c.externalRef}</Sub></> },
          { key: "kind", label: "ชนิด", render: (c) => contractKindLabel(c.kind) },
          { key: "deal", label: "ดีล", render: (c) => <Code>{naText(dealCode.get(c.dealId))}</Code> },
          { key: "date", label: "วันที่", render: (c) => fmtDate(c.contractDate || c.createdAt) },
          { key: "status", label: "สถานะ", render: (c) => <StatusBadge tone={CONTRACT_STATUS_TONES[c.status] || "neutral"} label={CONTRACT_STATUS_LABELS[c.status] || c.status} /> },
        ]}
        emptyText="ยังไม่มีสัญญาของลูกค้ารายนี้"
      />
    );
  }

  if (view === "lead") {
    return (
      <HubListPanel
        {...common}
        stateKey="hub-lead"
        icon={<Inbox size={17} aria-hidden="true" />}
        title="ลีด"
        subtitle="เฉพาะลีดที่เปิดเป็นดีลแล้ว (มติ 13/11/2026)"
        unit="ลีด"
        rows={leads}
        searchPlaceholder="ค้นหาบริษัท / ผู้ติดต่อ / ช่องทาง"
        textOf={leadText}
        sorts={[{ value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((l) => l.createdAt) }]}
        rowHref={(l) => `/sa/leads/${l.id}`}
        columns={[
          { key: "who", label: "บริษัท / ผู้ติดต่อ", render: (l) => <><span>{naText(l.company)}</span><Sub>{l.contactName}</Sub></> },
          { key: "channel", label: "ช่องทาง", render: (l) => naText(l.channel) },
          { key: "deal", label: "ดีล", render: (l) => <Code>{naText(leadDeal.get(l.id)?.code)}</Code> },
          { key: "status", label: "สถานะ", render: (l) => naText(LEAD_STATUS_LABELS[l.status] || l.status) },
          { key: "date", label: "วันที่", render: (l) => fmtDate(l.createdAt) },
        ]}
        emptyText="ยังไม่มีลีดที่เปิดเป็นดีลของลูกค้ารายนี้"
      />
    );
  }

  return (
    <HubListPanel
      {...common}
      stateKey="hub-deal"
      icon={<Handshake size={17} aria-hidden="true" />}
      title="ดีล"
      subtitle="หนึ่งแถวเห็นทั้งเส้น: ใบเสนอราคา → ใบสั่งขาย → การชำระ → Actual"
      unit="ดีล"
      rows={dealRows}
      searchPlaceholder="ค้นหาดีล / เลข QT / เลข SO / เลข PO ลูกค้า"
      textOf={dealRowText}
      filters={[
        { key: "stage", label: "ขั้น", icon: Flag, options: optionsOf(dealRows, (r) => r.deal.stage, (k) => STAGE_LABELS[k] || k), test: inValues((r) => r.deal.stage) },
        { key: "type", label: "ประเภทดีล", icon: Tag, options: optionsOf(dealRows, (r) => r.deal.dealType, (k) => DEAL_TYPE_LABELS[k] || k), test: inValues((r) => r.deal.dealType) },
        { key: "year", label: "ปี", icon: CalendarDays, options: optionsOf(dealRows, (r) => r.year, (k) => k), test: inValues((r) => r.year) },
      ]}
      groups={[
        { value: "none", label: "ไม่จัดกลุ่ม" },
        { value: "year", label: "ปี", weighted: "Actual รวม", describe: (r) => ({ key: r.year || "__none", label: r.year || "ไม่ระบุปี", weight: r.actual }) },
        { value: "type", label: "ประเภทดีล", weighted: "Actual รวม", describe: (r) => ({ key: r.deal.dealType || "__none", label: DEAL_TYPE_LABELS[r.deal.dealType] || "ไม่ระบุ", weight: r.actual }) },
      ]}
      sorts={[
        { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((r) => r.deal.createdAt) },
        { value: "value", label: "มูลค่า", dir: "desc", compare: byNum((r) => r.deal.wonValue || r.deal.projectValue) },
        { value: "actual", label: "Actual", dir: "desc", compare: byNum((r) => r.actual) },
      ]}
      rowHref={(r) => `/sa/deals/${r.deal.id}`}
      columns={[
        { key: "deal", label: "ดีล", render: (r) => <><Code>{r.deal.code || NA}</Code><Sub>{r.deal.title}</Sub></> },
        { key: "type", label: "ประเภท · หมวด", render: (r) => <><span>{DEAL_TYPE_LABELS[r.deal.dealType] || naText(r.deal.dealType)}</span><Sub>{r.deal.categoryCode || NA}</Sub></> },
        { key: "stage", label: "ขั้น", render: (r) => <StatusBadge tone={STAGE_TONES[r.deal.stage] || "neutral"} label={STAGE_LABELS[r.deal.stage] || r.deal.stage} /> },
        {
          key: "quote", label: "ใบเสนอราคา",
          render: (r) => (r.quote
            ? <><DocLink href={`/sa/quotations/${r.quote.id}`}>{r.quote.quoteNumber}</DocLink><Sub>{`${fmtMoney(r.quote.totalAmount)}${r.olderQuotes ? ` · ฉบับเก่า ${r.olderQuotes}` : ""}`}</Sub></>
            : <Sub>{r.requestCount ? `คำร้อง ${r.requestCount} ใบ` : NA}</Sub>),
        },
        {
          key: "order", label: "ใบสั่งขาย",
          render: (r) => (r.order
            ? <><DocLink href={`/sa/sales-orders/${r.order.id}`}>{r.order.orderNumber}</DocLink><Sub>{SALES_ORDER_STATUS_LABELS[r.order.status] || r.order.status}</Sub></>
            : NA),
        },
        {
          key: "pay", label: "ชำระ",
          render: (r) => (r.payment.count
            ? <><span>{`${r.payment.paid}/${r.payment.count} งวด`}</span>{r.payment.outstanding > 0 && <Sub>{`ค้าง ${fmtMoney(r.payment.outstanding)}`}</Sub>}{r.payment.overdue && <StatusBadge tone="danger" label="เกินกำหนด" />}</>
            : NA),
        },
        { key: "actual", label: "Actual", className: "num", render: (r) => (r.order ? <Money value={r.actual} /> : NA) },
      ]}
      emptyText="ยังไม่มีดีลของลูกค้ารายนี้"
    />
  );
}

/* ── สินค้า ──────────────────────────────────────────────────────────────────────────── */
function ProductsTab({ products, scents, formulas, hub, query, onQuery }) {
  const [view, setView] = useState("fg");
  const stats = useMemo(() => productOrderStats(hub.orderLines, hub.sales.orders), [hub.orderLines, hub.sales.orders]);
  const fgRows = useMemo(() => products.map((p) => ({ id: p.id, product: p, stat: stats.byProduct.get(p.id) || null })), [products, stats]);
  const fgText = (r) => hubText(r.product.fgCode, productNameBoth(r.product), r.product.brandName, r.product.brandNameEn);
  const scentText = (s) => hubText(scentSearchText(s), s.sharedFrom);
  const formulaText = (f) => hubText(formulaSearchText(f), f.sharedFrom);
  const count = (rows, text) => rows.filter((r) => matchesQuery(text(r), query)).length;
  const switcher = (
    <Segmented
      ariaLabel="มุมมองสินค้า"
      value={view}
      onChange={setView}
      options={[
        { value: "fg", label: "สินค้า FG", count: count(fgRows, fgText) },
        { value: "scent", label: "กลิ่น", count: count(scents, scentText) },
        { value: "formula", label: "สูตร", count: count(formulas, formulaText) },
      ]}
    />
  );
  const common = { query, onQuery, extraToolbar: switcher };
  const ownership = { key: "own", label: "ที่มา", icon: Users, options: [{ value: "own", label: "ของลูกค้ารายนี้" }, { value: "shared", label: "แชร์มาจากลูกค้าอื่น" }], test: (row, values) => values.includes(row.sharedFrom ? "shared" : "own") };

  if (view === "scent" || view === "formula") {
    const isScent = view === "scent";
    const labels = isScent ? SCENT_STATUS_LABELS : FORMULA_STATUS_LABELS;
    const tones = isScent ? SCENT_STATUS_TONES : FORMULA_STATUS_TONES;
    const rows = isScent ? scents : formulas;
    return (
      <HubListPanel
        {...common}
        stateKey={isScent ? "hub-scent" : "hub-formula"}
        icon={isScent ? <FlaskConical size={17} aria-hidden="true" /> : <Beaker size={17} aria-hidden="true" />}
        title={isScent ? "กลิ่น" : "สูตร"}
        subtitle="อ่านอย่างเดียว · จัดการที่ทะเบียน · รวมที่แชร์มา"
        unit="รายการ"
        rows={rows}
        searchPlaceholder="ค้นหารหัส / ชื่อ"
        textOf={isScent ? scentText : formulaText}
        filters={[
          { key: "status", label: "สถานะ", icon: Flag, options: optionsOf(rows, (r) => r.status, (k) => labels[k] || k), test: inValues((r) => r.status) },
          ownership,
        ]}
        sorts={[
          { value: "name", label: "ชื่อ", dir: "asc", compare: byText((r) => r.name) },
          { value: "code", label: "รหัส", dir: "asc", compare: byText((r) => r.code) },
        ]}
        rowHref={(r) => `/database/${isScent ? "scents" : "formulas"}?q=${encodeURIComponent(r.code || r.name)}`}
        columns={[
          { key: "name", label: isScent ? "กลิ่น" : "สูตร", render: (r) => {
            // PF บน · ชื่อ · วันที่ล่าง (มติเจ้าของ 13/11) — วันที่ของกลิ่น = วันผลิต (คอลัมน์ขวาคือวันส่ง คนละวัน)
            const parts = isScent ? scentLabelParts(r) : formulaLabelParts(r);
            return <><Code>{parts.code}</Code><Sub>{`${parts.name} · ${parts.date}`}</Sub></>;
          } },
          { key: "status", label: "สถานะ", render: (r) => <StatusBadge tone={tones[r.status]} label={labels[r.status] || r.status} /> },
          { key: "from", label: "ที่มา", render: (r) => (r.sharedFrom ? `แชร์จาก ${r.sharedFrom}` : "ของลูกค้ารายนี้") },
          { key: "date", label: isScent ? "ส่งให้ลูกค้า" : "วันที่สูตร", render: (r) => fmtDate(isScent ? r.sentAt : r.formulaDate) },
        ]}
        emptyText={isScent ? "ยังไม่มีกลิ่นของลูกค้ารายนี้" : "ยังไม่มีสูตรของลูกค้ารายนี้"}
      />
    );
  }

  return (
    <HubListPanel
      {...common}
      stateKey="hub-fg"
      icon={<Package size={17} aria-hidden="true" />}
      title="สินค้า FG"
      subtitle="สั่งแล้ว = จำนวนใบสั่งขายที่อนุมัติแล้ว · ยอดก่อน VAT"
      unit="รายการ"
      rows={fgRows}
      searchPlaceholder="ค้นหารหัส FG / ชื่อสินค้า / แบรนด์"
      textOf={fgText}
      filters={[
        { key: "cat", label: "หมวด", icon: Layers, options: optionsOf(fgRows, (r) => r.product.categoryCode, (k) => k), test: inValues((r) => r.product.categoryCode) },
        { key: "approval", label: "การอนุมัติ", icon: Flag, options: [{ value: "approved", label: "อนุมัติแล้ว" }, { value: "pending", label: "รออนุมัติ" }, { value: "rejected", label: "ไม่อนุมัติ" }], test: inValues((r) => r.product.approvalStatus || r.product.status) },
        { key: "active", label: "การใช้งาน", icon: Tag, options: [{ value: "on", label: "ใช้งานอยู่" }, { value: "off", label: "พักใช้" }], test: (r, values) => values.includes(r.product.isActive === false ? "off" : "on") },
        { key: "ordered", label: "การสั่ง", icon: ClipboardList, options: [{ value: "yes", label: "เคยสั่ง" }, { value: "no", label: "ยังไม่เคยสั่ง" }], test: (r, values) => values.includes(r.stat ? "yes" : "no") },
      ]}
      groups={[
        { value: "none", label: "ไม่จัดกลุ่ม" },
        { value: "cat", label: "หมวด", weighted: "ยอดสั่งรวม", describe: (r) => ({ key: r.product.categoryCode || "__none", label: r.product.categoryCode || "ไม่ระบุหมวด", weight: r.stat?.total || 0 }) },
      ]}
      sorts={[
        { value: "total", label: "ยอดสั่งรวม", dir: "desc", compare: byNum((r) => r.stat?.total) },
        { value: "last", label: "สั่งล่าสุด", dir: "desc", compare: byText((r) => r.stat?.lastDate) },
        { value: "code", label: "รหัส", dir: "asc", compare: byText((r) => r.product.fgCode) },
      ]}
      rowHref={(r) => `/database/products/${r.product.id}`}
      columns={[
        { key: "fg", label: "สินค้า", render: (r) => <><Code>{r.product.fgCode}</Code><Sub>{productNameBoth(r.product)}</Sub></> },
        { key: "cat", label: "หมวด", render: (r) => <Code>{naText(r.product.categoryCode)}</Code> },
        { key: "status", label: "การอนุมัติ", render: (r) => <ProductStatusPill status={r.product.status} /> },
        { key: "orders", label: "สั่งแล้ว", className: "num", render: (r) => (r.stat ? `${r.stat.orders} ใบ` : NA) },
        { key: "last", label: "สั่งล่าสุด", render: (r) => (r.stat ? fmtDate(r.stat.lastDate) : NA) },
        { key: "total", label: "ยอดสั่งรวม", className: "num", render: (r) => (r.stat ? <Money value={r.stat.total} /> : NA) },
      ]}
      footer={stats.manual.length > 0 ? (
        <p className="text-xs text-[var(--text-3)] mt-3">
          {`บรรทัดที่กรอกเองบนใบสั่งขาย (ไม่มีในทะเบียนสินค้า): ${stats.manual.map((m) => `${m.fgCode || m.description || "ไม่ระบุ"} ${m.orders} ใบ ${fmtMoney(m.total)}`).join(" · ")}`}
        </p>
      ) : null}
      emptyText="ยังไม่มีสินค้าของลูกค้ารายนี้"
    />
  );
}

/* ── คำร้อง ──────────────────────────────────────────────────────────────────────────── */
function RequestsTab({ hub, query, onQuery }) {
  const rows = hub.requests.rows;
  const dealCode = useMemo(() => new Map(hub.sales.deals.map((d) => [d.id, d.code])), [hub.sales.deals]);
  return (
    <HubListPanel
      query={query}
      onQuery={onQuery}
      stateKey="hub-request"
      icon={<MessageCircleQuestion size={17} aria-hidden="true" />}
      title="คำร้อง"
      subtitle="คำร้องถึงทุกฝ่ายที่ผูกลูกค้ารายนี้"
      unit="ใบ"
      rows={rows}
      searchPlaceholder="ค้นหาเลขที่ / หัวเรื่อง / ผู้ขอ / ดีล"
      textOf={(r) => requestText(r, dealCode.get(r.dealId))}
      filters={[
        { key: "status", label: "สถานะ", icon: Flag, options: optionsOf(rows, (r) => r.status, (k) => REQUEST_STATUS_LABELS[k] || k), test: inValues((r) => r.status) },
        { key: "dept", label: "ฝ่าย", icon: Users, options: optionsOf(rows, (r) => r.dept, (k) => REQUEST_DEPT_LABELS[k]?.name || k), test: inValues((r) => r.dept) },
        { key: "kind", label: "หัวข้อ", icon: Tag, options: optionsOf(rows, (r) => r.kind, (k) => requestKindLabel(k)), test: inValues((r) => r.kind) },
      ]}
      sorts={[
        { value: "recent", label: "ยื่นล่าสุด", dir: "desc", compare: byTime((r) => r.submittedAt || r.createdAt) },
        { value: "due", label: "กำหนดส่ง", dir: "asc", compare: byText((r) => r.committedDueDate || r.requestedDueDate || "9999") },
      ]}
      rowHref={(r) => `/requests/${r.id}`}
      columns={[
        { key: "no", label: "คำร้อง", render: (r) => <><Code>{r.docNo || "ร่าง"}</Code><Sub>{r.title}</Sub></> },
        { key: "dept", label: "ฝ่าย · หัวข้อ", render: (r) => <><span>{REQUEST_DEPT_LABELS[r.dept]?.name || naText(r.dept)}</span><Sub>{requestKindLabel(r.kind)}</Sub></> },
        { key: "deal", label: "ดีล", render: (r) => <Code>{naText(dealCode.get(r.dealId))}</Code> },
        { key: "status", label: "สถานะ", render: (r) => { const v = requestStatusView(r); return <StatusBadge tone={v.tone} label={v.label} />; } },
        { key: "date", label: "ยื่นเมื่อ", render: (r) => fmtDate(r.submittedAt || r.createdAt) },
        { key: "due", label: "กำหนดส่ง", render: (r) => fmtDate(r.committedDueDate || r.requestedDueDate) },
      ]}
      emptyText="ยังไม่มีคำร้องของลูกค้ารายนี้"
    />
  );
}

/* ── การเงิน (งวดชำระ) ───────────────────────────────────────────────────────────────── */
function FinanceTab({ hub, query, onQuery, today }) {
  const orderById = useMemo(() => new Map(hub.sales.orders.map((o) => [o.id, o])), [hub.sales.orders]);
  const rows = useMemo(() => hub.finance.installments.map((inst) => {
    const order = orderById.get(inst.salesOrderId) || null;
    return { id: inst.id, inst, order, ...installmentState(inst, order, today) };
  }), [hub.finance.installments, orderById, today]);
  return (
    <HubListPanel
      query={query}
      onQuery={onQuery}
      stateKey="hub-finance"
      icon={<Wallet size={17} aria-hidden="true" />}
      title="งวดชำระ"
      subtitle="งวดของทุกใบสั่งขายที่คุณเห็นได้ · เกินกำหนดนับตามวันไทย"
      unit="งวด"
      rows={rows}
      searchPlaceholder="ค้นหาเลข SO / ชื่องวด / เลขใบกำกับภาษี"
      textOf={(r) => installmentText(r.inst, r.order?.orderNumber)}
      filters={[
        { key: "status", label: "สถานะงวด", icon: Flag, options: optionsOf(rows, (r) => r.display, (k) => INSTALLMENT_STATUS_LABELS[k] || k), test: inValues((r) => r.display) },
        { key: "overdue", label: "กำหนดชำระ", icon: CalendarDays, options: [{ value: "overdue", label: "เกินกำหนด" }, { value: "ok", label: "ยังไม่เกิน / ชำระแล้ว" }], test: (r, values) => values.includes(r.overdue ? "overdue" : "ok") },
      ]}
      groups={[
        { value: "none", label: "ไม่จัดกลุ่ม" },
        { value: "order", label: "ใบสั่งขาย", weighted: "ยอดงวดรวม", describe: (r) => ({ key: r.inst.salesOrderId, label: r.order?.orderNumber || "ไม่พบใบ", weight: r.inst.amount }) },
      ]}
      sorts={[
        { value: "due", label: "กำหนดชำระ", dir: "desc", compare: byText((r) => r.inst.dueDate) },
        { value: "amount", label: "ยอด", dir: "desc", compare: byNum((r) => r.inst.amount) },
      ]}
      rowHref={(r) => `/sa/sales-orders/${r.inst.salesOrderId}`}
      columns={[
        { key: "so", label: "ใบสั่งขาย", render: (r) => <Code>{naText(r.order?.orderNumber)}</Code> },
        { key: "seq", label: "งวด", render: (r) => <><span>{`งวด ${r.inst.seq ?? NA}`}</span><Sub>{r.inst.label}</Sub></> },
        { key: "due", label: "กำหนดชำระ", render: (r) => fmtDate(r.inst.dueDate) },
        { key: "status", label: "สถานะ", render: (r) => <><StatusBadge tone={INSTALLMENT_STATUS_TONES[r.display] || "neutral"} label={INSTALLMENT_STATUS_LABELS[r.display] || r.display} />{r.overdue && <StatusBadge tone="danger" label="เกินกำหนด" />}</> },
        { key: "paid", label: "วันที่รับ", render: (r) => fmtDate(r.inst.paidOn || r.inst.confirmedAt) },
        { key: "amount", label: "ยอด", className: "num", render: (r) => <Money value={r.inst.amount} /> },
      ]}
      emptyText="ยังไม่มีงวดชำระของลูกค้ารายนี้"
    />
  );
}

/* ── สรรพสามิต (มติ 6) ─────────────────────────────────────────────────────────────────── */
function ExciseTab({ registrations, hub, query, onQuery }) {
  const [view, setView] = useState(registrations.length ? "reg" : "order");
  const orders = hub.excise.orders;
  const count = (rows, text) => rows.filter((r) => matchesQuery(text(r), query)).length;
  const switcher = (
    <Segmented
      ariaLabel="มุมมองสรรพสามิต"
      value={view}
      onChange={setView}
      options={[
        { value: "reg", label: "ทะเบียน", count: count(registrations, registrationText) },
        { value: "order", label: "ใบค่าสรรพสามิต", count: count(orders, (o) => orderText(o)) },
      ]}
    />
  );
  if (view === "order") {
    return (
      <HubListPanel
        query={query}
        onQuery={onQuery}
        extraToolbar={switcher}
        stateKey="hub-excise-order"
        icon={<ClipboardList size={17} aria-hidden="true" />}
        title="ใบสั่งขายค่าสรรพสามิต"
        subtitle="เงินรับแทน ไม่นับเป็นยอดขาย"
        unit="ใบ"
        rows={orders}
        searchPlaceholder="ค้นหาเลข SO"
        textOf={(o) => orderText(o)}
        filters={[{ key: "status", label: "สถานะ", icon: Flag, options: optionsOf(orders, (o) => o.status, (k) => SALES_ORDER_STATUS_LABELS[k] || k), test: inValues((o) => o.status) }]}
        sorts={[{ value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((o) => o.orderDate || o.createdAt) }]}
        rowHref={(o) => `/sa/sales-orders/${o.id}`}
        columns={[
          { key: "no", label: "เลขที่", render: (o) => <Code>{o.orderNumber}</Code> },
          { key: "date", label: "วันที่", render: (o) => fmtDate(o.orderDate || o.createdAt) },
          { key: "status", label: "สถานะ", render: (o) => <StatusBadge tone={ORDER_TONES[o.status] || "neutral"} label={SALES_ORDER_STATUS_LABELS[o.status] || o.status} /> },
          { key: "total", label: "ยอดรวม", className: "num", render: (o) => <Money value={o.totalAmount} /> },
        ]}
        emptyText="ยังไม่มีใบสั่งขายค่าสรรพสามิตของลูกค้ารายนี้"
      />
    );
  }
  return (
    <HubListPanel
      query={query}
      onQuery={onQuery}
      extraToolbar={switcher}
      stateKey="hub-excise-reg"
      icon={<ClipboardCheck size={17} aria-hidden="true" />}
      title="ทะเบียนสรรพสามิต"
      subtitle="อ่านอย่างเดียว · จัดการที่หน้าสินค้า/ระบบภาษี"
      unit="ทะเบียน"
      rows={registrations}
      searchPlaceholder="ค้นหารหัส FG / ชื่อสินค้า / เลขอนุมัติ"
      textOf={registrationText}
      filters={[{ key: "status", label: "สถานะ", icon: Flag, options: optionsOf(registrations, (r) => r.status, (k) => exciseStatusMeta(k).label), test: inValues((r) => r.status) }]}
      sorts={[
        { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((r) => r.createdAt) },
        { value: "code", label: "รหัส FG", dir: "asc", compare: byText((r) => r.fgCode) },
      ]}
      rowHref={(r) => `/go/registration/${r.id}`}
      columns={[
        { key: "fg", label: "สินค้า", render: (r) => <><Code>{r.fgCode}</Code><Sub>{r.productName}</Sub></> },
        { key: "approval", label: "เลขอนุมัติ", render: (r) => <Code>{naText(r.approvalNumber)}</Code> },
        { key: "status", label: "สถานะ", render: (r) => { const m = exciseStatusMeta(r.status); return <StatusBadge tone={m.tone} label={m.label} />; } },
      ]}
      emptyText="ยังไม่มีทะเบียนสรรพสามิตของลูกค้ารายนี้"
    />
  );
}

/* ── ตัวแท็บ ───────────────────────────────────────────────────────────────────────────── */
/* ── ตัวแท็บของทั้งหน้า (งวด H2) ───────────────────────────────────────────────────────────
 * ลำดับ: ภาพรวม · ข้อมูลลูกค้า · การขาย · สินค้า · คำร้อง · การเงิน · สรรพสามิต · บริการ · เอกสาร · ความเคลื่อนไหว
 * ⭐ มติ 2: เปิดหน้ามาที่ "ภาพรวม" · ข้อมูลลูกค้า (การ์ดโปรไฟล์ + วางบิล) เป็นแท็บที่สอง
 * `profile` · `docs` · `activity` = เนื้อหาที่หน้าลูกค้าเป็นเจ้าของ (ฟอร์ม/เธรด/ไฟล์แนบ) ส่งมาเป็น render function
 *   `activity` = เธรดลูกค้าตัวเต็ม — แท็บความเคลื่อนไหว (H3) เปิดมันเมื่อเลือกชิป "ลูกค้า" · สายรวมทุกเธรดมาจาก ActivityTab
 * `hashTabs` — ลิงก์ที่ชี้ส่วนในแท็บ (เช่น `#billing-rule` ของการ์ดวางบิล) ต้องเปิดแท็บนั้นก่อน ไม่งั้นเลื่อนหาไม่เจอ */
export default function CustomerHub({
  customerId, hub, products = [], scents = [], formulas = [], registrations = [], service = null,
  profile = null, docs = null, activity = null, hashTabs = {},
}) {
  const [query, setQuery] = useState("");
  const today = useMemo(() => todayKey(), []);
  const ready = Boolean(hub);
  /* ตัวเลขบนแท็บ = จำนวนที่ตรงคำค้น (มติ 7) — คำค้นว่าง = จำนวนทั้งหมด · ตัวนับใช้ข้อความค้นชุดเดียวกับตาราง */
  const counts = useMemo(() => {
    if (!hub) return {};
    const hit = (rows, text) => rows.filter((r) => matchesQuery(text(r), query)).length;
    const dealCode = new Map(hub.sales.deals.map((d) => [d.id, d.code]));
    const orderNo = new Map(hub.sales.orders.map((o) => [o.id, o.orderNumber]));
    const dealRows = buildDealRows({ ...hub.sales, installments: hub.finance.installments, requests: hub.requests.rows }, today);
    return {
      sales: hit(dealRows, dealRowText),
      requests: hit(hub.requests.rows, (r) => requestText(r, dealCode.get(r.dealId))),
      finance: hit(hub.finance.installments, (i) => installmentText(i, orderNo.get(i.salesOrderId))),
      excise: hit(registrations, registrationText) + hit(hub.excise.orders, (o) => orderText(o)),
    };
  }, [hub, query, today, registrations]);
  const productCount = products.filter((p) => matchesQuery(hubText(p.fgCode, productNameBoth(p), p.brandName, p.brandNameEn), query)).length;
  const label = (text, n) => <>{text}{n !== undefined && <>{" "}<span className="tab-count">{n}</span></>}</>;
  const tabs = [
    { key: "overview", label: "ภาพรวม" },
    profile && { key: "profile", label: "ข้อมูลลูกค้า" },
    ready && hub.sales.visible && { key: "sales", label: label("การขาย", counts.sales) },
    { key: "products", label: label("สินค้า", productCount) },
    ready && hub.requests.visible && { key: "requests", label: label("คำร้อง", counts.requests) },
    ready && hub.finance.visible && { key: "finance", label: label("การเงิน", counts.finance) },
    ready && (registrations.length > 0 || hub.excise.orders.length > 0) && { key: "excise", label: label("สรรพสามิต", counts.excise) },
    service && { key: "service", label: service.label },
    docs && { key: "docs", label: "เอกสาร" },
    activity && { key: "activity", label: "ความเคลื่อนไหว" },
  ].filter(Boolean);
  /* ลิงก์ที่ชี้ส่วนในแท็บ (`hashTabs` = { idของส่วน: แท็บ } เช่น #billing-rule → ข้อมูลลูกค้า) ต้องเปิดแท็บนั้นก่อน
     ทั้งตอนเข้าหน้าพร้อม hash (อ่านตอนเริ่ม — แท็บวาดฝั่ง client หลังโหลดลูกค้าเสร็จเสมอ) และตอน hash เปลี่ยนบนหน้าเดิม
     (ลิงก์ในหน้าเดียวกัน = ไม่ mount ใหม่) · เลื่อนไปหาส่วนนั้นหลังแท็บวาดแล้ว */
  const hashTab = () => (typeof window === "undefined" ? null : hashTabs[window.location.hash.slice(1)] || null);
  const [active, setActive] = useState(() => hashTab() || "overview");
  const [scrollTo, setScrollTo] = useState(null);
  useEffect(() => {
    const onHash = () => {
      const target = window.location.hash.slice(1);
      if (!hashTabs[target]) return;
      setActive(hashTabs[target]);
      setScrollTo(target);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [hashTabs]);
  useEffect(() => {
    if (!scrollTo) return;
    window.requestAnimationFrame(() => document.getElementById(scrollTo)?.scrollIntoView({ block: "start" }));
    setScrollTo(null);
  }, [scrollTo, active]);
  const current = tabs.some((t) => t.key === active) ? active : tabs[0]?.key;
  const needsHub = ["overview", "sales", "requests", "finance", "excise"].includes(current);

  return (
    <div>
      <Tabs ariaLabel="ข้อมูลของลูกค้ารายนี้" value={current} onChange={setActive} tabs={tabs} />
      {needsHub && !ready ? (
        <p className={styles.loading}>กำลังโหลดข้อมูลของลูกค้ารายนี้…</p>
      ) : (
        <>
          {current === "overview" && <OverviewTab hub={hub} today={today} onGo={setActive} />}
          {current === "profile" && <div className={styles.tabBody}>{profile()}</div>}
          {current === "sales" && <SalesTab hub={hub} query={query} onQuery={setQuery} today={today} />}
          {current === "products" && (
            <ProductsTab
              products={products}
              scents={scents}
              formulas={formulas}
              hub={hub || { orderLines: [], sales: { orders: [] } }}
              query={query}
              onQuery={setQuery}
            />
          )}
          {current === "requests" && <RequestsTab hub={hub} query={query} onQuery={setQuery} />}
          {current === "finance" && <FinanceTab hub={hub} query={query} onQuery={setQuery} today={today} />}
          {current === "excise" && <ExciseTab registrations={registrations} hub={hub} query={query} onQuery={setQuery} />}
          {current === "service" && service.render()}
          {current === "docs" && <div className={styles.tabBody}>{docs()}</div>}
          {current === "activity" && <ActivityTab customerId={customerId} customerThread={activity} />}
        </>
      )}
    </div>
  );
}
