"use client";
import { TableEmpty, TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleDollarSign, ClipboardCheck, ClipboardList } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import DetailRow from "@/components/ui/DetailRow";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import Pager from "@/components/ui/Pager";
import { usePagination } from "@/lib/usePagination";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney } from "@/lib/format";
import { salesOrderPaymentNote } from "@/lib/sales/salesOrderPayments";
import { salesOrderListTrack, salesOrderTrackSummary } from "@/lib/sales/salesOrderListTrack";
import SalesOrderTrack from "@/components/salesPlanning/SalesOrderTrack";
import StatusBadge from "@/components/ui/StatusBadge";
import styles from "./page.module.css";
import SearchInput from "@/components/ui/SearchInput";

const STATUS = { draft: "ฉบับร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" };
function statusBadge(status, className = "") {
  const color = { draft: "var(--text-3)", pending_approval: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--red)" }[status] || "var(--text-3)";
  // ขอบ/พื้นมาจาก .ui-badge ที่ derive จาก currentColor อยู่แล้ว — ตั้ง color พอ
  return <span className={["ui-badge", className].filter(Boolean).join(" ")} style={{ color }}>{STATUS[status] || status}</span>;
}

/* เซลล์ "งวดชำระ" ของตารางรายการ — เก็บแล้ว/ทั้งหมด
   สีบอกเรื่องเดียว: เขียว = ครบ · แดง = เลยกำหนดหรือถูกตีกลับ · จาง = ยังไม่เริ่มติดตาม
   ⚠️ ไม่ใช้ป้าย (badge) เพราะเป็น **ตัวเลขที่คนกวาดตาเทียบข้ามแถว** ⇒ ต้องชิดขวา
   และเป็น tabular (กฎ 3 · UI_DESIGN_SYSTEM §ป้ายในตาราง) */
function paymentCell(payment) {
  if (!payment) return <span className="cell-num-idle">-</span>;
  const { tracked, paid, count, complete, overdue, rejected } = payment;
  const tone = !tracked ? "cell-num-idle"
    : complete ? "cell-num-ok"
      : (overdue || rejected) ? "cell-num-bad"
        : undefined;
  const why = !tracked ? "ยังไม่เริ่มติดตาม — จำนวนงวดมาจากแผนในใบเสนอราคา"
    : complete ? "เก็บเงินครบทุกงวดแล้ว"
      : overdue ? `เลยกำหนดแล้ว ${overdue} งวด`
        : rejected ? `บัญชีตีกลับ ${rejected} งวด`
          : "นับเฉพาะงวดที่บัญชีคอนเฟิร์มแล้ว";
  /* ⭐ **บรรทัดสถานะใต้ตัวเลข** (มติผู้ใช้ 2026-08-13) — `0/2` เหมือนกันเป๊ะอาจเป็นได้
     ทั้ง "ลูกค้ายังไม่จ่าย" และ "จ่ายแล้วรอบัญชีรับรอง" ซึ่งเป็นงานคนละฝ่าย
     ⚠️ ตัวเลขยังเป็นพระเอกของช่อง (ชิดขวา tabular กวาดตาเทียบข้ามแถวได้) บรรทัดสถานะ
     จึงเล็กและจางกว่า ไม่ใช่ป้ายเต็มตัว — ไม่งั้นคอลัมน์นี้จะแย่งสายตาจากคอลัมน์สถานะเอกสาร */
  const note = salesOrderPaymentNote(payment);
  return (
    <>
      <span className={tone} title={why}>{paid}/{count}</span>
      {note ? <span className={`cell-sub ${NOTE_TONE[note.tone] || ""}`.trim()}>{note.label}</span> : null}
    </>
  );
}

// โทนของบรรทัดสถานะการชำระ — ใช้คลาสกลางชุดเดียวกับตัวเลขในตาราง
const NOTE_TONE = { danger: "cell-num-bad", success: "cell-num-ok", warning: "", idle: "" };


export default function SalesOrdersPage() {
  const canView = useCan("salesplan:view");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  /* ⭐ `?count=salesOrders` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-114) · ป้ายนับ "ใบของฉันที่ถูก
     ตีกลับ" ⇒ กรองด้วยธง `_waitingOnMe` จาก server ไม่ใช่ status='rejected' เฉย ๆ
     (ใบที่คนอื่นโดนตีกลับก็ status เดียวกัน แต่ไม่ใช่ของค้างของเรา) */
  const navCountParam = useSearchParams().get("count") || "";
  const [waitingOnMeOnly, setWaitingOnMeOnly] = useState(navCountParam === "salesOrders");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/sales-orders");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โหลดใบสั่งขายไม่สำเร็จ");
      setRows(data);
    } catch (err) {
      setError(err.message || "โหลดใบสั่งขายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // รอยต่อ SO อนุมัติ → ใบยื่นชำระภาษี. ใช้ endpoint เดิมของโมดูลภาษี (?available=1)
  // ซึ่งกรอง "อนุมัติแล้ว + ยังไม่มีใบยื่น + มีสินค้าสรรพสามิตจริง" ให้ครบแล้ว —
  // ห้ามนับเองที่นี่ ไม่งั้น SO ที่ขายของนอกพิกัดจะค้างในตัวเลขตลอดกาล
  // ไม่มีสิทธิ์ sales:act (403) หรือยิงไม่ผ่าน = ไม่ต้องมีแถบเตือน ไม่ใช่เรื่องของคนดูอย่างเดียว
  const [awaitingFiling, setAwaitingFiling] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/tax/orders/from-sales-order?available=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (alive && data?.schemaReady) setAwaitingFiling((data.salesOrders || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (waitingOnMeOnly && !row._waitingOnMe) return false;
      if (status !== "all" && row.status !== status) return false;
      // ⭐ เอกสารอ้างอิงอยู่ในชุดค้นด้วย (IS-26080017) — เหตุผลหลักที่ช่องนี้เกิดคือ
      // "ลูกค้าถามถึง PO เลขนี้ ใบไหน" ซึ่งตอบไม่ได้ตอนที่เลขไปกองอยู่ในหมายเหตุ
      return !q || [row.orderNumber, row.customerName, row.deal?.title, row.quotation?.quoteNumber, row.referenceDoc]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [query, rows, status, waitingOnMeOnly]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, { resetKey: `${query}|${status}|${waitingOnMeOnly}` });

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending_approval").length,
    approved: rows.filter((row) => row.status === "approved").length,
    actual: rows.reduce((sum, row) => sum + (row.status === "approved" ? Number(row.actualAmount) || 0 : 0), 0),
  }), [rows]);

  if (!canView) return <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย"><div className="glass-panel" style={{ padding: 16 }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div></SaWorkspace>;

  return (
    <SaWorkspace icon={<ClipboardList size={22} />} title="ใบสั่งขาย" subtitle="สร้างจาก QT Won ตรวจสอบเอกสาร และนับ Actual หลัง AE Supervisor อนุมัติเท่านั้น">
      <div className="flex flex-col gap-4">
        {error && <div className="glass-panel" role="alert" style={{ padding: 14, color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}

        {awaitingFiling > 0 && (
          <StatusNotice
            tone="warning"
            title={`ใบสั่งขาย ${awaitingFiling} ใบรอออกใบยื่นชำระภาษี`}
            action={<Link href="/tax/filings" className="linklike">เปิดหน้ายื่นชำระ</Link>}
          >
            อนุมัติแล้วและมีสินค้าสรรพสามิตอยู่ในใบ แต่ยังไม่ได้สร้างใบยื่นต่อกรมสรรพสามิต
          </StatusNotice>
        )}

        <SaMetricStrip>
          <SaMetric icon={<ClipboardList />} label="ใบสั่งขายทั้งหมด" value={summary.total} note="เอกสารในขอบเขตที่คุณดูได้" />
          <SaMetric icon={<ClipboardCheck />} label="รอตรวจอนุมัติ" value={summary.pending} note="รอ AE Supervisor ดำเนินการ" tone={summary.pending ? "warning" : "good"} />
          <SaMetric icon={<BadgeCheck />} label="อนุมัติแล้ว" value={summary.approved} note="เอกสารที่ถูกนับเป็น Actual" tone="good" />
          <SaMetric icon={<CircleDollarSign />} label="Actual ก่อน VAT" value={fmtMoney(summary.actual)} note="รวมเฉพาะ SO ที่อนุมัติแล้ว" tone="good" />
        </SaMetricStrip>

        <SaSection icon={<ClipboardList size={17} />} title="รายการใบสั่งขาย" subtitle="ค้นหา ตรวจเอกสาร และติดตามขั้นตอนอนุมัติจากจุดเดียว" actions={<span className="ui-badge">{filtered.length} ใบ</span>}>
          <div className="toolbar">
            <SearchInput width={330} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลข SO / QT / ลูกค้า / ดีล / เอกสารอ้างอิง" />
            {waitingOnMeOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setWaitingOnMeOnly(false)}>กรอง: รอฉันลงมือ ×</Button>
            )}
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="premium-select" style={{ width: 170 }}>
              <option value="all">ทุกสถานะ</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <div className="spacer" />
          </div>
          {/* ── ตารางรายการ: รื้อใหม่แบบ ข (มติผู้ใช้ 2026-08-13) ──────────────
              9 → 5 คอลัมน์ · **ตัดคอลัมน์ที่ไม่มีข้อมูลจริงทิ้ง**:
                · "เอกสารอ้างอิง" เป็น `-` แทบทุกแถว ⇒ ย้ายไปเป็นบรรทัดรองใต้เลข SO
                  โผล่เฉพาะใบที่มีจริง (ของที่มีน้อยแต่กินคอลัมน์เต็มคือของที่ควรเป็นบรรทัดรอง)
                · "วันที่ SO" ตรงกับ "กำหนดชำระ" แทบทุกใบ ⇒ เหลือกำหนดชำระซึ่งเป็นวันที่คนใช้จริง
                · "สถานะ" ป้ายเดียวบอกได้แค่จุดปัจจุบัน ⇒ แทนด้วย **รางสามขั้น**
              ⚠️ รางไม่ใช่การตกแต่ง — สามขั้นคือสามแกนคนละคอลัมน์ใน DB ที่เดินไม่พร้อมกัน
              (`status` · `financeStatus` · งวดชำระ) ตรรกะอยู่ใน `salesOrderListTrack` พร้อมเทสต์ */}
          <TableScroll surface="embedded" cells="stacked" minWidth={920} aria-busy={loading}>
            <table className="w-full text-sm">
              <thead><tr><th>เอกสาร / ความคืบหน้า</th><th>ลูกค้า</th><th className="num">Actual ก่อน VAT</th><th className="num">งวดชำระ</th><th className="num">กำหนดชำระ</th></tr></thead>
              <tbody>
                {pageRows.map((row) => {
                  const track = salesOrderListTrack(row);
                  const summary = salesOrderTrackSummary(row);
                  return (
                  <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                    <td>
                      <Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono"><strong>{row.orderNumber}</strong></Link>
                      {/* อ้างอิง QT อยู่บรรทัดรอง — เป็น "ที่มาของใบ" ไม่ใช่ตัวใบเอง
                          เอกสารฝั่งลูกค้า (PO/สัญญา) ต่อท้ายเมื่อมี · ยาวได้ 200 ตัวอักษร
                          จึงตัดด้วย ellipsis และเก็บเต็มไว้ใน title (บทเรียนจาก IS-26080004) */}
                      <span className="cell-sub" title={row.referenceDoc || undefined}>
                        <span className="cell-ellipsis">
                          {row.quotation?.quoteNumber || "-"}
                          {row.referenceDoc ? ` · ${row.referenceDoc}` : ""}
                        </span>
                      </span>
                      {track.cancelled ? (
                        <span className="cell-sub">{statusBadge(row.status, "ui-badge-cell ui-badge-w-doc")}</span>
                      ) : (
                        <>
                          {/* จอกว้างเห็นรางเต็ม · จอแคบสลับเป็นป้ายสรุปข้างล่าง (page.module.css) */}
                          <span className={styles.trackWrap}><SalesOrderTrack steps={track.steps} /></span>
                          {/* จอแคบยุบรางเป็นป้ายเดียว — ไม่ซ่อนข้อมูลทิ้ง แค่ละเอียดน้อยลง */}
                          <span className={styles.summary}>
                            <StatusBadge tone={summary.tone} size="sm">{summary.label}</StatusBadge>
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {/* AR บน · ชื่อล่าง (มติผู้ใช้ 2026-08-12 — ทรงเดียวกับตาราง QT) */}
                      {row.customerArCode ? <span className="ar-code ar-code-block">{row.customerArCode}</span> : null}
                      {row.customerName || "-"}
                      <span className="cell-sub">{row.deal?.title || "-"}</span>
                    </td>
                    {/* ใบที่ยังไม่อนุมัติเคยโชว์ 0.00 เฉย ๆ ซึ่งอ่านเหมือน "ใบนี้ไม่มีมูลค่า"
                        ⇒ หรี่สีลง + บอกเหตุเป็นบรรทัดรอง ไม่ใช่ปล่อยให้เดาเอง */}
                    <td className={`num mono ${row.status === "approved" ? "" : "cell-num-idle"}`.trim()}>
                      {fmtMoney(row.actualAmount)}
                      {row.status === "approved" ? null : <span className="cell-sub">ยังไม่นับเป็น Actual</span>}
                    </td>
                    {/* ⭐ งวดชำระ — นับเฉพาะงวดที่ **บัญชีคอนเฟิร์ม** (กฎเดียวกับทั้งระบบ)
                        บรรทัดรองบอกเรื่องที่ด่วนที่สุดเรื่องเดียว (ดู salesOrderPaymentNote) */}
                    {/* ⚠️ `paymentCell` วาดบรรทัดสถานะให้ในตัวแล้ว — เติมซ้ำที่นี่จะได้
                        คำเดียวกันสองบรรทัด (เจอตอนกดดูรอบแรก) */}
                    <td className="num mono">{paymentCell(row.payment)}</td>
                    <td className={`num ${row.payment?.overdue ? "cell-num-bad" : ""}`.trim()}>{fmtDate(row.paymentDueDate)}</td>
                  </DetailRow>
                  );
                })}
                {!filtered.length && !loading && (
                  <TableEmpty
                    colSpan={5}
                    title="ยังไม่มีใบสั่งขาย"
                    description="เปิด QT ที่ Won แล้วกดสร้าง SO เพื่อตรวจสอบและยื่นอนุมัติ"
                  />
                )}
              </tbody>
            </table>
          </TableScroll>
          {filtered.length > 0 && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
      </div>
    </SaWorkspace>
  );
}
