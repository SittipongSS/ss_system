"use client";
import { TableScroll } from "@/components/ui/Table";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useParams, useRouter } from "next/navigation";
import { ReceiptText, FileCheck, MessagesSquare, ExternalLink, Printer, PencilLine } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { customerHeadline } from "@/lib/master/customerAr";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import RejectDialog from "@/components/excise/RejectDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { isExemptFiling, orderAmountToCollect, untaxedFilingItems } from "@/lib/tax/exciseBilling";
import { FILING_REASON_MAX, FILING_REASON_MIN } from "@/lib/excise/raFilingRules";
import { printFilingSummary } from "@/lib/excise/printFilingSummary";
import { FINANCE_STATUS_LABELS } from "@/lib/sales/salesOrderFinanceApproval";
import { productDisplayName } from "@/lib/master/productIdentity";
import { canTransitionFiling, statusMeta } from "@/lib/excise/workflow";
import { useCustomerRecord } from "@/lib/master/useCustomerRecord";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";
import { apiFetch } from "@/lib/apiFetch";
import styles from "./page.module.css";

/* "ยกเว้นภาษี" ตัดสินที่ isExemptFiling (ทุกรายการผูกทะเบียนที่ RA ยกเว้น) — ยอด 0 เพราะสินค้าไม่มีราคาขายปลีก
   ต้องโชว์ ฿0.00 ตามจริง ไม่ใช่ป้ายยกเว้น (ตรวจระบบ 2026-10-26) */
const taxText = (o) => (isExemptFiling(o) ? "ยกเว้นภาษี" : fmtMoney(o.totalTax || 0));
// ยอดเรียกเก็บ = ค่าภาษี + VAT 7% ตรงกับ "ยอดแจ้งชำระสุทธิ" บนเอกสารที่พิมพ์เสมอ
// (มติผู้ใช้ 2026-07-26) — คิดจาก lib/tax/exciseBilling ที่เดียว
const amountToCollectText = (o) => (isExemptFiling(o)
  ? "ยกเว้นภาษี"
  : fmtMoney(orderAmountToCollect(o)));
/* เส้นของ RA (v3 · มติเจ้าของ 02/11): รอ RA → กำลังยื่น → ชำระแล้ว — บันทึกเกิดตอนเริ่มยื่น ⇒ ขั้นแรกผ่านแล้วเสมอ
   ของเก่าก่อน v3 (prod 02/11 ไม่มีแล้ว): ร่าง = รอ RA · ตีกลับ = กำลังยื่น · ส่งเอกสารแล้ว = ชำระแล้ว */
const STEP_OF = { draft: 0, filing: 1, rejected: 1, complete: 2, delivered: 2 };

export default function FilingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  /* ⭐ v3 (มติเจ้าของ 02/11): บันทึกการยื่นเป็นงานของฝ่าย RA ทั้งเส้น — บันทึกผลชำระ · แก้ข้อมูลการชำระ · ยกเลิกการเริ่มยื่น · พิมพ์ใบสรุป
     ไม่มีร่าง/คิดใหม่/ตีกลับ/ส่งเอกสาร · ฝ่ายขายเปิดอ่านได้แต่ไม่มีปุ่ม (เห็นขั้นของ RA บนใบสั่งขายของตัวเอง) */
  const canApprove = useCan("ra:approve");
  const canOpenSales = useCan("salesplan:view"); // RA ไม่มี ⇒ แผงสรุป SO ไม่มีลิงก์ไปหน้าขาย

  /* ⭐ ลิสต์สินค้า/ลูกค้า/ทะเบียนทั้งตารางเลิกโหลดแล้ว (ตรวจระบบ 26/10 ข้อย่อย) · บันทึกการยื่นตรึงรายการไว้ตอนเริ่มยื่น (v3) */
  const { data: orders, loading, error: ordersError, staleError: ordersStale, errorDetail: ordersDetail, loaded: ordersLoaded, reload: reloadOrders } = useApiList("/api/orders");
  // แผงสรุป SO + ด่านเริ่มยื่น มากับใบรายตัว (GET /api/orders/[id] · `source`) — RA ไม่มีสิทธิ์อ่านหน้าขาย
  const [source, setSource] = useState(null);
  const [sourceTick, setSourceTick] = useState(0);
  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    apiFetch(`/api/orders/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        setSource(res.ok ? data.source || null : { error: data.error || "อ่านใบสั่งขายต้นทางไม่สำเร็จ" });
      })
      .catch((e) => { if (active) setSource({ error: e?.message || "อ่านใบสั่งขายต้นทางไม่สำเร็จ" }); });
    return () => { active = false; };
  }, [id, sourceTick]);
  const reload = async () => {
    setSourceTick((n) => n + 1);
    await reloadOrders();
  };

  const o = useMemo(() => orders.find((x) => x.id === id) || null, [orders, id]);
  const isExempt = isExemptFiling(o);
  // รายการภาษี ฿0 ที่ไม่ได้รับยกเว้น = ตอนสร้างใบสินค้ายังไม่มีราคาขายปลีก — ยอดใบนี้ขาด
  const untaxedIds = new Set(untaxedFilingItems(o).map((item) => item.id));
  const unregisteredItemCount = (o?.items || []).filter((item) => !item.registrationId).length;
  // ลูกค้าของใบยื่นใบนี้อ่านรายตัว ไม่ใช่ find จากลิสต์ที่กรองทีม (ดู lib/master/useCustomerRecord.js)
  const customer = useCustomerRecord(o?.customerId);

  /* ── โหลดพัง ≠ ไม่พบใบยื่น ──────────────────────────────────────────────────────────────
     🐞 ใบยื่นใบนี้มาจาก `orders.find(...)` ⇒ `/api/orders` ล้มเมื่อไร `orders` ค้างที่ `[]` แล้ว `o` เป็น null
        จอเดิมจึงขึ้นหัว "ไม่พบรายการ · ใบยื่นนี้อาจถูกลบไปแล้ว" — อ่านว่าใบถูกลบ ทั้งที่ใบยังอยู่ครบ แค่โหลดไม่ขึ้น
        ⇒ ทางแยกของสายนี้ต้องตัดสิน **ก่อน** บรรทัด "ไม่พบรายการ" เสมอ (ท่าเดียวกับหน้าแก้รอบ FC)
     🪤 "มีของในมือ" ของสายใบยื่นคือ **ใบนี้** (`!o`) ไม่ใช่ความยาวลิสต์ — แคชระดับโมดูลที่ถ่ายไว้ก่อนใบนี้เกิด
        (เช่นเพิ่งสร้างใบจากคิวแล้วกดเข้ามา) มีใบอื่นเต็มลิสต์แต่ไม่มีใบนี้
     🪤 `empty` ของสายใบยื่น = ไม่มีใบในมือ **และรอบหน้าบ้านล่าสุดล้ม** (`ordersError`) ไม่ใช่ `staleError` — "ไม่พบรายการ"
        ที่ยืนยันแล้วต้องไม่พลิกเป็น "(ไม่ได้แปลว่าใบยื่นนี้ถูกลบไปแล้ว)" เพราะสลับแท็บแล้วเน็ตสะดุด */
  // สายเดียวของจอ (บล็อกทั้งหน้า) — สามสายรอง (ทะเบียน · ลูกค้า · สินค้า) ไปพร้อมฟอร์มแก้ไขของฝ่ายขายแล้ว
  const sources = [
    {
      label: "ใบยื่นชำระ", error: ordersError || ordersStale, empty: !o && !!ordersError, detail: ordersDetail, reload: reloadOrders, blocks: "page",
      blockedNote: "ยังเปิดใบยื่นนี้ไม่ได้ (ไม่ได้แปลว่าใบยื่นนี้ถูกลบไปแล้ว)",
      staleNote: "ข้อมูลใบยื่นที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set(failing.map((s) => (s.empty ? s.blockedNote : s.staleNote))),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  // ปุ่มลองใหม่ต้องบอกเองว่ากำลังลองอยู่ — กดแล้วจอนิ่ง = คนกดซ้ำรัว ๆ
  const retrying = loading;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;

  const [fileOpen, setFileOpen] = useState(false);
  const [editPaidOpen, setEditPaidOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  /* D10: ยกเลิกการเริ่มยื่น = ลบบันทึก (เหตุผล 10–500 ตัว · server ตรวจซ้ำ) ⇒ งานกลับไปรอ RA บนหน้ารายการ */
  const withdraw = async (reason) => {
    const res = await apiFetch(`/api/orders/${o.id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ยกเลิกการเริ่มยื่นไม่สำเร็จ");
    router.push("/tax/filings");
  };
  const print = async () => {
    setPrinting(true);
    try {
      await printFilingSummary([`order:${o.id}`]);
    } finally {
      setPrinting(false);
    }
  };

  const back = { href: "/tax/filings", label: "กลับไปหน้างานยื่นชำระ" };

  // ⚠️ ต้องอยู่เหนือ "ไม่พบรายการ" — ดูเหตุผลที่ก้อน sources · `loading` ⇒ กดลองใหม่แล้วเนื้อเป็น skeleton ระหว่างรอ
  if (pageBlocked) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="งานยื่นชำระภาษีสรรพสามิต" back={back} loading={loading}>
        {notice}
      </Workspace>
    );
  }
  // "ไม่พบ" ได้เฉพาะหลังลิสต์เคยโหลดสำเร็จ — ยังไม่เคยได้คำตอบ = ยังไม่รู้ (ทางนั้นคือ skeleton / ป้ายข้างบน)
  if (!loading && ordersLoaded && !o) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="ไม่พบรายการ" subtitle="บันทึกการยื่นนี้อาจถูกยกเลิกไปแล้ว — งานจะกลับไปรอ RA ที่หน้ารายการ" back={back}>
        <div style={{ color: "var(--text-3)" }}>ไม่พบบันทึกการยื่นที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {o && <StatusBadge status={o.status} />}
    </div>
  );
  const status = o ? statusMeta(o.status) : statusMeta();
  const startedText = o?.filingStartedAt
    ? `${fmtDate(o.filingStartedAt)}${o.filingStartedByName ? ` · ${o.filingStartedByName}` : ""}`
    : NA;
  const paidText = o?.status === "complete" || o?.status === "delivered"
    ? `${o.taxPaidDate ? fmtDate(o.taxPaidDate) : fmtDate(o.filedAt)}${o.filedByName ? ` · บันทึกโดย ${o.filedByName}` : ""}`
    : NA;
  const workflowSteps = workflowStepsFromIndex([
    { id: "queued", label: "รอ RA", hint: "งานถึง RA เมื่อใบสั่งขายค่าสรรพสามิตอนุมัติ" },
    { id: "filing", label: "กำลังยื่น", hint: o?.filingStartedAt ? `เริ่ม ${startedText}` : "ฝ่าย RA ยื่นแบบต่อกรมสรรพสามิต" },
    { id: "complete", label: "ชำระแล้ว", hint: "บันทึกเลขที่ใบเสร็จและวันที่ชำระ" },
  ], STEP_OF[o?.status] ?? 1);
  const primaryAction = canApprove && canTransitionFiling(o?.status, "complete")
    ? {
      id: "file", label: isExempt ? "ยืนยันชำระแล้ว (ยกเว้นภาษี)" : "บันทึกผลชำระ",
      kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
    }
    : null;

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title={o ? `งานยื่น ${o.poReference || o.quotationRef || o.id}` : "..."}
      /* รหัส AR นำหน้าชื่อลูกค้า (มติผู้ใช้ 2026-08-21) — อ่านจาก `customer` รายตัว (useCustomerRecord:
         GET /api/customers/[id] โดยมีแถวในลิสต์เป็นค่าระหว่างรอ) ไม่ใช่ find จากลิสต์ตรง ๆ ⇒ ลิสต์ลูกค้าล้ม
         หรือกรองทีมจนไม่เห็นลูกค้ารายนี้ หัวจอก็ยังมีรหัส AR */
      subtitle={customerHeadline(o?.customerName, customer.arCode)}
      headerRight={headerRight}
      back={back}
      loading={loading && !o}
    >
      {notice}
      {o && (
        <DetailPageLayout
          asideLabel="สรุปและจัดการงานยื่นชำระสรรพสามิต"
          aside={(
            <>
              <DocumentSummaryCard
                title="ยอดที่ต้องเรียกเก็บ (รวม VAT 7%)"
                total={amountToCollectText(o)}
                rows={[
                  { id: "tax-before-vat", label: "ค่าภาษี (ก่อน VAT)", value: taxText(o) },
                  { id: "items", label: "รายการสินค้า", value: `${o.items?.length || 0} รายการ` },
                  { id: "started", label: "เริ่มยื่น", value: startedText },
                  { id: "receipt", label: "ใบเสร็จสรรพสามิต", value: naText(o.exciseReceiptNumber) },
                  { id: "paid", label: "วันที่ชำระ", value: paidText },
                  // เลข ET = เลขอ้างอิงภายในของบันทึก (trigger 0162) — ไม่ส่งลูกค้า
                  { id: "ref", label: "เลขอ้างอิงภายใน", value: naText(o.taxNoticeNumber) },
                ]}
                status={status.label}
                statusColor={toneColor(status.tone)}
              />
              <DocumentControlCard
                status={status.label}
                statusColor={toneColor(status.tone)}
                statusDescription="การดำเนินการของฝ่าย RA"
                workflowSteps={workflowSteps}
                primaryAction={primaryAction}
                /* ⚠️ "ออกใบแจ้งชำระค่าภาษี" ถึงลูกค้าถอดแล้ว (PR5 · ขัดมติ Q1 — เอกสารถึงลูกค้าคือใบเสนอราคาค่าสรรพสามิต)
                   ใบที่ RA พิมพ์ได้คือใบสรุปรายการยื่น (V9) */
                secondaryActions={[
                  {
                    id: "print", label: printing ? "กำลังเตรียม…" : "พิมพ์ใบสรุปรายการยื่น", kind: "print", icon: Printer,
                    onClick: print, disabled: printing,
                  },
                  {
                    // D11: แก้เลขที่ใบเสร็จ/วันที่/ยอดหลังชำระแล้ว — ฟอร์มเดียวกับตอนบันทึกผลชำระ (เติมค่าเดิม)
                    id: "edit-paid", label: "แก้ข้อมูลการชำระ", kind: "edit", icon: PencilLine,
                    onClick: () => setEditPaidOpen(true),
                    visible: canApprove && o.status === "complete" && !isExempt,
                  },
                ]}
                dangerActions={[
                  {
                    // D10: กดเริ่มยื่นผิดใบ — ยกเลิกการเริ่มยื่นได้จนกว่าจะบันทึกผลชำระ · ด่านเดียวกับ DELETE /api/orders/[id]
                    id: "withdraw", label: "ยกเลิกการเริ่มยื่น (กลับไปรอ RA)", kind: "delete",
                    onClick: () => setWithdrawOpen(true),
                    visible: canApprove && ["filing", "draft"].includes(o.status),
                  },
                ]}
              />
              {/* แผงสรุป SO (PR5) — RA ไม่เข้าหน้าขาย ⇒ ต้นทาง · เงินค่าภาษี · ทะเบียน มาจาก `source` ของ GET บันทึกรายตัว */}
              <RelatedDocumentCard
                title={o.salesOrderId ? "ใบสั่งขายต้นทาง" : "เอกสารต้นทาง"}
                meta={source?.salesOrder?.orderNumber || o.poReference || o.quotationRef || "ข้อมูลลูกค้าและทะเบียนสินค้า"}
                actions={o.salesOrderId && canOpenSales ? (
                  <>
                    <Link href={`/sa/sales-orders/${o.salesOrderId}`} className="btn ghost sm">
                      <ExternalLink size={13} /> เปิด ใบสั่งขาย
                    </Link>
                    {/* ⚠️ ใช้ Button primitive (as=Link) ไม่ใช่คลาส `btn` ดิบ — งบ rawButtonClass ของโมดูลนี้เต็มเพดาน */}
                    {o.exciseSalesOrderId && (
                      <Button as={Link} href={`/sa/sales-orders/${o.exciseSalesOrderId}`} variant="quiet" size="sm">
                        <ExternalLink size={13} /> เปิด ใบสั่งขายค่าสรรพสามิต
                      </Button>
                    )}
                  </>
                ) : !o.salesOrderId && o.customerId ? (
                  <Link href={`/database/customers/${o.customerId}`} className="btn ghost sm">
                    <ExternalLink size={13} /> เปิดลูกค้า
                  </Link>
                ) : null}
              >
                {!o.salesOrderId && "บันทึกเดิมที่สร้างในโมดูลภาษีโดยตรง รายการสินค้าผูกกับข้อมูลลูกค้าและทะเบียนสรรพสามิต"}
                {o.salesOrderId && source?.error && <div className={styles.sourceError}>{source.error}</div>}
                {o.salesOrderId && !source && <div className={styles.sourceMuted}>กำลังอ่านใบสั่งขายต้นทาง…</div>}
                {o.salesOrderId && source && !source.error && (
                  <dl className={styles.sourceList}>
                    <dt>ใบสั่งขายลูกค้า</dt>
                    <dd>{naText(source.salesOrder?.orderNumber)} · อนุมัติ {fmtDate(source.salesOrder?.approvedAt)}</dd>
                    {source.exciseOrder ? (
                      <>
                        <dt>ใบสั่งขายค่าสรรพสามิต</dt>
                        <dd>{source.exciseOrder.orderNumber} · ลูกค้าจ่าย {fmtMoney(source.exciseOrder.totalAmount)}</dd>
                        <dt>ใบเสนอราคาค่าสรรพสามิต</dt>
                        <dd>{naText(source.exciseOrder.quoteNumber)}</dd>
                        {/* V3: เงินไม่ใช่ด่านของ RA — แสดงให้รู้เท่านั้น */}
                        <dt>บัญชี (แสดงเท่านั้น)</dt>
                        <dd>{FINANCE_STATUS_LABELS[source.exciseOrder.financeStatus] || "ยังไม่เข้าคิวบัญชี"}</dd>
                      </>
                    ) : source.notBilled ? (
                      <>
                        <dt>ไม่เรียกเก็บในระบบ</dt>
                        <dd>{source.notBilled.label}{source.notBilled.ref ? ` · อ้างอิง ${source.notBilled.ref}` : ""}</dd>
                        <dt>เหตุผลของฝ่ายขาย</dt>
                        <dd>{naText(source.notBilled.reason)}</dd>
                      </>
                    ) : null}
                    <dt>ทะเบียน</dt>
                    <dd>
                      <span className={source.gates?.registration?.ok ? styles.gateOk : styles.gateWarn}>{source.gates?.registration?.label}</span>
                    </dd>
                    {/* เหตุผลข้ามด่านของ PR5 (เลิกใช้ใน v3) — โชว์เฉพาะบันทึกเก่าที่มีค่า */}
                    {o.filingSkipMoneyReason && (<><dt>เหตุผลที่ข้ามด่านเงิน (เดิม)</dt><dd>{o.filingSkipMoneyReason}</dd></>)}
                    {o.filingSkipRegistrationReason && (<><dt>เหตุผลที่ข้ามด่านทะเบียน (เดิม)</dt><dd>{o.filingSkipRegistrationReason}</dd></>)}
                  </dl>
                )}
                {o.salesOrderId && unregisteredItemCount > 0 && !source && (
                  <div className={styles.sourceMuted}>มี {unregisteredItemCount} รายการที่ยังไม่มีทะเบียนสรรพสามิตอนุมัติ</div>
                )}
              </RelatedDocumentCard>
            </>
          )}
        >
          <div className="flex flex-col gap-5">
          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ใบสั่งขายลูกค้า">{naText(o.poReference)}</Field>
              <Field label="เริ่มยื่น">{startedText}</Field>
              <Field label="ยอดภาษีรวม">{taxText(o)}</Field>
              <Field label="ใบเสร็จสรรพสามิต">{naText(o.exciseReceiptNumber)}</Field>
              {o.taxPaidDate && <Field label="วันที่ชำระจริง">{fmtDate(o.taxPaidDate)}</Field>}
              {o.exciseTaxPaidAmount != null && <Field label="ยอดชำระจริง">{fmtMoney(o.exciseTaxPaidAmount)}</Field>}
              {o.taxFormRef && <Field label="แบบ ภส.">{o.taxFormRef}</Field>}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>รายการสินค้า ({o.items?.length || 0})</div>
            {untaxedIds.size > 0 && (
              <StatusNotice tone="warning">
                มี {untaxedIds.size} รายการที่ภาษีเป็น ฿0 เพราะตอนเริ่มยื่น สินค้ายังไม่มีราคาขายปลีก — ยอดในบันทึกนี้ขาดจากที่ต้องยื่นจริง
                {canApprove && o.status === "filing" && " · เติมราคาขายปลีกแล้วยกเลิกการเริ่มยื่น จากนั้นกดเริ่มยื่นใหม่"}
              </StatusNotice>
            )}
            <TableScroll surface="embedded"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-7)" }}>
              <thead>
                <tr style={{ color: "var(--text-3)", fontSize: "var(--fs-5)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0 0 6px", fontWeight: "var(--fw-semibold)", textAlign: "left" }}>รายการสินค้า</th>
                  <th style={{ padding: "0 8px 6px", fontWeight: "var(--fw-semibold)", textAlign: "right", whiteSpace: "nowrap" }}>จำนวน</th>
                  <th style={{ padding: "0 0 6px", fontWeight: "var(--fw-semibold)", textAlign: "right", whiteSpace: "nowrap" }}>รวมภาษี</th>
                </tr>
              </thead>
              <tbody>
                {(o.items || []).map((it) => {
                  const p = it.product || it.registration || {};
                  return (
                    <tr key={it.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                        <div className="font-mono" style={{ fontSize: "var(--fs-4)", color: "var(--text-3)" }}>{naText(p.fgCode)}</div>
                        <div>{productDisplayName(p)}</div>
                        {untaxedIds.has(it.id) && (
                          <div className={styles.untaxed}>ไม่มีราคาขายปลีก · ภาษี ฿0</div>
                        )}
                      </td>
                      <td className="font-mono" style={{ padding: "8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{fmtNumber((it.quantity || 0))}</td>
                      <td className="font-mono" style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{fmtMoney(it.totalTax || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: "var(--fw-bold)" }}>
                  <td colSpan={2} style={{ padding: "8px 8px 0 0", textAlign: "right" }}>รวมภาษี</td>
                  <td className="font-mono" style={{ padding: "8px 0 0", textAlign: "right", color: "var(--red)" }}>{taxText(o)}</td>
                </tr>
              </tfoot>
            </table></TableScroll>
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <AttachmentsPanel
              entityType="order"
              entityId={o.id}
              canEdit={canApprove}
              title="เอกสารการชำระสรรพสามิต"
              cardColumns={1}
            />
          </div>

          {/* เธรดกลาง (mig 0163) — บันทึกเหตุการณ์ระหว่างยื่น (เช่น ยื่นแบบ ภส. แล้ว รอใบเสร็จ) */}
          <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
            <UpdateThread
              entityType="excise_order"
              entityId={o.id}
              order="desc"
              placeholder="พิมพ์ข้อความ เช่น ยื่นแบบ ภส. แล้ว รอใบเสร็จ..."
              emptyText="ยังไม่มีความเคลื่อนไหว"
            />
          </DetailCard>

          </div>
        </DetailPageLayout>
      )}

      <FileTaxDialog open={fileOpen} onClose={() => setFileOpen(false)} onDone={reload} order={o} />
      <FileTaxDialog open={editPaidOpen} onClose={() => setEditPaidOpen(false)} onDone={reload} order={o} mode="edit" />
      <RejectDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onConfirm={withdraw}
        title="ยกเลิกการเริ่มยื่น"
        reasonLabel={`เหตุผลที่ยกเลิกการเริ่มยื่น (${FILING_REASON_MIN}–${FILING_REASON_MAX} ตัวอักษร)`}
        placeholder="เช่น กดเริ่มยื่นผิดใบ · ต้องรอเติมราคาขายปลีกก่อน"
        confirmLabel="ยกเลิกการเริ่มยื่น — กลับไปรอ RA"
        busyLabel="กำลังถอน…"
      />
    </Workspace>
  );
}
