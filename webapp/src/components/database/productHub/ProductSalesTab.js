"use client";
import { useMemo } from "react";
import { ClipboardList, FileText, Flag, Wallet } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import HubListPanel from "@/components/database/customerHub/HubListPanel";
import useStickyState from "@/lib/ui/useStickyState";
import { QUOTE_STATUS_LABELS } from "@/components/salesPlanning/ui";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { FINANCE_STATUS_LABELS, FINANCE_STATUS_TONES } from "@/lib/sales/salesOrderFinanceApproval";
import { matchesQuery } from "@/lib/master/customerHub";
import { productOrderRows, productOrderText, productQuoteRows, productQuoteText } from "@/lib/master/productHub";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";

/* ── หน้าสินค้าศูนย์รวม · แท็บการขาย (งวด S1 · มติเจ้าของ 18/11/2026 ข้อ 5 · docs/product-hub-plan.md) ─────────
 *
 * สองมุมมอง: ใบสั่งขาย (ตั้งต้น) · ใบเสนอราคา — แถวละใบ ตัวเลขเป็นของ **บรรทัดสินค้านี้บนใบ** ไม่ใช่ยอดทั้งใบ
 * ⭐ ทรงเดียวกับแท็บการขายของหน้าลูกค้า (HubListPanel ตัวเดียวกัน · ค้นหา/กรอง/เรียง/ตัดหน้า)
 * ⭐ ใบสั่งขายที่ไม่นับเข้ายอดบนหัว (รออนุมัติ · ถูก Rev. แทน · ยกเลิก) ยังโชว์ แต่จาง — ยอดบนหัว = ผลรวมของแถวไม่จาง
 * ⚠️ แท็บนี้โผล่เฉพาะผู้เห็นโมดูลขาย (server ส่ง visible:false) — จอไม่ตัดสินสิทธิ์เอง (มติ 5)
 * ⚠️ ใบค่าสรรพสามิตไม่ขึ้นที่นี่ (บรรทัดคือภาษีของสินค้า ไม่ใช่การขาย · ตัดใน productOrderRows/productQuoteRows)
 */
const time = (v) => { const ms = Date.parse(v || ""); return Number.isFinite(ms) ? ms : 0; };
const byTime = (key) => (a, b) => time(key(a)) - time(key(b));
const byNum = (key) => (a, b) => (Number(key(a)) || 0) - (Number(key(b)) || 0);
const optionsOf = (rows, keyOf, labelOf) => {
  const seen = new Map();
  for (const row of rows) { const k = keyOf(row); if (k && !seen.has(k)) seen.set(k, labelOf(k)); }
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
};
const inValues = (keyOf) => (row, values) => values.includes(keyOf(row));
const QUOTE_TONES = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", cancelled: "danger", revised: "neutral", closed: "neutral" };
const ORDER_TONES = { draft: "neutral", pending_approval: "warning", approved: "success", rejected: "danger", revised: "neutral", approval_revoked: "warning", cancelled: "danger" };
const Code = ({ children }) => <span className="font-mono text-xs">{children}</span>;
const Sub = ({ children }) => (children ? <span className="block text-xs text-[var(--text-3)] truncate">{children}</span> : null);
const Money = ({ value }) => <span className="font-mono">{fmtMoney(value)}</span>;
const MUTED = "opacity-[var(--op-muted)]";

/** จำนวน + หน่วยของบรรทัด (บรรทัดแพ็ค/เดือนนับแพ็ค × เดือน) */
const qtyText = (row, unit) => `${fmtNumber(row.qty)} ${row.packed ? "แพ็ค·เดือน" : (row.unit || unit || "")}`.trim();
const priceCell = (row) => (row.unitPrice === null ? <span className="text-xs text-[var(--text-3)]">หลายราคา</span> : <Money value={row.unitPrice} />);

export default function ProductSalesTab({ sales, unit }) {
  // มุมมอง · คำค้น · Rev. เก่า จำไว้ตอนเปิดใบแล้วย้อนกลับ (คีย์ขึ้นต้น "psales." — เนมสเปซหน้าสินค้า)
  const [view, setView] = useStickyState("psales.view", "order");
  const [query, setQuery] = useStickyState("psales.query", "");
  const [showOldQuotes, setShowOldQuotes] = useStickyState("psales.oldQuotes", false);

  const dealCode = useMemo(() => new Map((sales?.deals || []).map((d) => [d.id, d.code || d.title])), [sales]);
  const orderRows = useMemo(() => productOrderRows(sales), [sales]);
  const allQuoteRows = useMemo(() => productQuoteRows(sales), [sales]);
  const quoteRows = showOldQuotes ? allQuoteRows : allQuoteRows.filter((r) => r.latest);
  const olderCount = allQuoteRows.length - allQuoteRows.filter((r) => r.latest).length;
  // คอลัมน์ลูกค้าโผล่เมื่อสินค้านี้ถูกขายในชื่อลูกค้ามากกว่าหนึ่งราย (นิติบุคคลเดียวกัน) — ปกติมีรายเดียว
  const multiCustomer = new Set([...orderRows.map((r) => r.order.customerId), ...allQuoteRows.map((r) => r.quote.customerId)].filter(Boolean)).size > 1;

  const orderText = (r) => productOrderText(r, dealCode.get(r.order.dealId));
  const quoteText = (r) => productQuoteText(r, dealCode.get(r.quote.dealId));
  const count = (rows, text) => rows.filter((r) => matchesQuery(text(r), query)).length;
  const switcher = (
    <Segmented
      ariaLabel="มุมมองการขาย"
      value={view}
      onChange={setView}
      options={[
        { value: "order", label: "ใบสั่งขาย", count: count(orderRows, orderText) },
        { value: "quote", label: "ใบเสนอราคา", count: count(quoteRows, quoteText) },
      ]}
    />
  );
  const common = { query, onQuery: setQuery };
  const customerColumn = (doc) => ({ key: "customer", label: "ลูกค้า", render: (r) => <span className="text-xs">{naText(doc(r).customerName)}</span> });

  if (view === "quote") {
    return (
      <HubListPanel
        {...common}
        stateKey="product-hub-quote"
        icon={<FileText size={17} aria-hidden="true" />}
        title="ใบเสนอราคา"
        subtitle="ฉบับล่าสุดของแต่ละสาย · ตัวเลขเป็นของบรรทัดสินค้านี้บนใบ · กดเลขที่เพื่อเปิดใบ"
        unit="ใบ"
        rows={quoteRows}
        searchPlaceholder="ค้นหาเลข QT / เลขอ้างอิง / ดีล"
        textOf={quoteText}
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
          options: optionsOf(quoteRows, (r) => r.quote.status, (k) => QUOTE_STATUS_LABELS[k] || k),
          test: inValues((r) => r.quote.status),
        }]}
        sorts={[
          { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((r) => r.quote.quoteDate || r.quote.createdAt) },
          { value: "amount", label: "ยอดบรรทัด", dir: "desc", compare: byNum((r) => r.amount) },
          { value: "qty", label: "จำนวน", dir: "desc", compare: byNum((r) => r.qty) },
        ]}
        rowHref={(r) => `/sa/quotations/${r.quote.id}`}
        rowClassName={(r) => (r.latest ? "" : MUTED)}
        columns={[
          { key: "no", label: "เลขที่", render: (r) => <Code>{r.quote.quoteNumber}</Code> },
          { key: "deal", label: "ดีล", render: (r) => <Code>{naText(dealCode.get(r.quote.dealId))}</Code> },
          ...(multiCustomer ? [customerColumn((r) => r.quote)] : []),
          { key: "date", label: "วันที่", render: (r) => fmtDate(r.date) },
          { key: "qty", label: "จำนวน", className: "num", render: (r) => qtyText(r, unit) },
          { key: "price", label: "ราคา/หน่วย", className: "num", render: priceCell },
          { key: "amount", label: "ยอดบรรทัด", className: "num", render: (r) => <Money value={r.amount} /> },
          { key: "status", label: "สถานะ", render: (r) => <StatusBadge tone={QUOTE_TONES[r.quote.status] || "neutral"} label={QUOTE_STATUS_LABELS[r.quote.status] || r.quote.status} /> },
        ]}
        emptyText="ยังไม่มีใบเสนอราคาที่มีสินค้านี้"
      />
    );
  }

  return (
    <HubListPanel
      {...common}
      stateKey="product-hub-order"
      icon={<ClipboardList size={17} aria-hidden="true" />}
      title="ใบสั่งขาย"
      subtitle="ยอดบนหัว = ใบที่อนุมัติแล้วและยังมีผล (รวมใบย้อนหลัง) · ใบอื่นแสดงจาง · ตัวเลขเป็นของบรรทัดสินค้านี้ ก่อน VAT"
      unit="ใบ"
      rows={orderRows}
      searchPlaceholder="ค้นหาเลข SO / เลข PO ลูกค้า / ดีล"
      textOf={orderText}
      extraToolbar={switcher}
      filters={[
        { key: "status", label: "สถานะ", icon: Flag, options: optionsOf(orderRows, (r) => r.order.status, (k) => SALES_ORDER_STATUS_LABELS[k] || k), test: inValues((r) => r.order.status) },
        { key: "finance", label: "สถานะบัญชี", icon: Wallet, options: optionsOf(orderRows, (r) => r.order.financeStatus, (k) => FINANCE_STATUS_LABELS[k] || k), test: inValues((r) => r.order.financeStatus) },
      ]}
      sorts={[
        { value: "recent", label: "ล่าสุด", dir: "desc", compare: byTime((r) => r.order.orderDate || r.order.createdAt) },
        { value: "amount", label: "ยอดบรรทัด", dir: "desc", compare: byNum((r) => r.amount) },
        { value: "qty", label: "จำนวน", dir: "desc", compare: byNum((r) => r.qty) },
      ]}
      rowHref={(r) => `/sa/sales-orders/${r.order.id}`}
      rowClassName={(r) => (r.counted ? "" : MUTED)}
      columns={[
        { key: "no", label: "เลขที่", render: (r) => <><Code>{r.order.orderNumber}</Code><Sub>{r.order.referenceDoc ? `PO ${r.order.referenceDoc}` : null}</Sub></> },
        { key: "deal", label: "ดีล", render: (r) => <Code>{naText(dealCode.get(r.order.dealId))}</Code> },
        ...(multiCustomer ? [customerColumn((r) => r.order)] : []),
        { key: "date", label: "วันที่", render: (r) => fmtDate(r.date) },
        { key: "qty", label: "จำนวน", className: "num", render: (r) => qtyText(r, unit) },
        { key: "price", label: "ราคา/หน่วย", className: "num", render: priceCell },
        { key: "amount", label: "ยอดบรรทัด", className: "num", render: (r) => <Money value={r.amount} /> },
        { key: "status", label: "สถานะ", render: (r) => <StatusBadge tone={ORDER_TONES[r.order.status] || "neutral"} label={SALES_ORDER_STATUS_LABELS[r.order.status] || r.order.status} /> },
        { key: "finance", label: "บัญชี", render: (r) => (r.order.financeStatus ? <StatusBadge tone={FINANCE_STATUS_TONES[r.order.financeStatus] || "neutral"} label={FINANCE_STATUS_LABELS[r.order.financeStatus] || r.order.financeStatus} /> : NA) },
      ]}
      emptyText="ยังไม่มีใบสั่งขายที่มีสินค้านี้"
    />
  );
}
