"use client";
import { TableScroll } from "@/components/ui/Table";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useParams, useRouter } from "next/navigation";
import { ReceiptText, RefreshCw, Send, FileCheck, MessagesSquare, ExternalLink } from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import Workspace from "@/components/ui/Workspace";
import StatusNotice from "@/components/ui/StatusNotice";
import DateInput from "@/components/ui/DateInput";
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
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import StartFilingDialog from "@/components/excise/StartFilingDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { isExemptFiling, orderAmountToCollect, untaxedFilingItems } from "@/lib/tax/exciseBilling";
import { filingRecalcBlock } from "@/lib/excise/raFilingRules";
import { FINANCE_STATUS_LABELS } from "@/lib/sales/salesOrderFinanceApproval";
import { productDisplayName } from "@/lib/master/productIdentity";
import { FILING_EDITABLE_STATUSES, canTransitionFiling, statusMeta } from "@/lib/excise/workflow";
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
// เส้นของ RA (PR5) — ตีกลับยืนที่จุด "กำลังยื่น" (RA ตีกลับเองระหว่างยื่น แล้วยื่นใหม่)
const ORDER = ["draft", "filing", "complete", "delivered"];

export default function FilingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  /* ⭐ แผนรื้อสรรพสามิต PR5: ใบยื่นเป็นงานของฝ่าย RA ทั้งเส้น (เริ่มยื่น · ใบเสร็จ · ส่งใบเสร็จ · ตีกลับ · คิดใหม่ · ลบร่าง)
     ฝ่ายขายเปิดอ่านได้ (และเปิด SO ต้นทางได้) แต่ไม่มีปุ่มบนใบนี้แล้ว — เงินค่าภาษีเก็บด้วย SO ค่าสรรพสามิต */
  const canApprove = useCan("ra:approve");
  const canOpenSales = useCan("salesplan:view"); // RA ไม่มี ⇒ แผงสรุป SO ไม่มีลิงก์ไปหน้าขาย
  const canDelete = canApprove;

  /* ⭐ ลิสต์สินค้า/ลูกค้า/ทะเบียนทั้งตารางเลิกโหลดแล้ว (ตรวจระบบ 26/10 ข้อย่อย) — ของที่กินมันคือฟอร์มแก้ไขแบบเลือกทะเบียน
     (OrderFormModal) ซึ่งเป็นทางของฝ่ายขาย · ใบยื่นจาก SO แก้รายการได้ทางเดียวคือคิดใหม่จาก SO (ปุ่มบนการ์ดจัดการ) */
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
  const editAvailable = canApprove && FILING_EDITABLE_STATUSES.includes(o?.status);
  const recalcBlock = o ? filingRecalcBlock(o) : null;
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

  const [recalcOpen, setRecalcOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  const transition = async (status) => {
    const res = await apiFetch(`/api/orders/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถเปลี่ยนสถานะได้");
    await reload();
  };
  const recalc = async () => {
    const res = await apiFetch(`/api/orders/${o.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recalcFromSalesOrder: true }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "คิดภาษีใหม่ไม่สำเร็จ");
    await reload();
  };
  const setDue = async (value) => {
    await apiFetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxDueDate: value }) });
    await reload();
  };
  const reject = async (reason) => {
    const res = await apiFetch(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected", rejectionReason: reason }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
    await reload();
  };
  const doDelete = async () => {
    const res = await apiFetch(`/api/orders/${o.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    router.push("/tax/filings");
  };

  const back = { href: "/tax/filings", label: "กลับไปหน้าการยื่นชำระ" };

  // ⚠️ ต้องอยู่เหนือ "ไม่พบรายการ" — ดูเหตุผลที่ก้อน sources · `loading` ⇒ กดลองใหม่แล้วเนื้อเป็น skeleton ระหว่างรอ
  if (pageBlocked) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="ใบยื่นชำระภาษีสรรพสามิต" back={back} loading={loading}>
        {notice}
      </Workspace>
    );
  }
  // "ไม่พบ" ได้เฉพาะหลังลิสต์เคยโหลดสำเร็จ — ยังไม่เคยได้คำตอบ = ยังไม่รู้ (ทางนั้นคือ skeleton / ป้ายข้างบน)
  if (!loading && ordersLoaded && !o) {
    return (
      <Workspace icon={<ReceiptText size={22} />} title="ไม่พบรายการ" subtitle="ใบยื่นนี้อาจถูกลบไปแล้ว" back={back}>
        <div style={{ color: "var(--text-3)" }}>ไม่พบใบยื่นที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {o && <StatusBadge status={o.status} />}
    </div>
  );
  const status = o ? statusMeta(o.status) : statusMeta();
  const workflowIndex = o?.status === "rejected"
    ? ORDER.indexOf("filing")
    : Math.max(ORDER.indexOf(o?.status), 0);
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "เตรียมใบยื่น", hint: "ฝ่าย RA ตรวจรายการ ทะเบียน และเงินค่าภาษี" },
    { id: "filing", label: "กำลังยื่น", hint: o?.status === "rejected" ? "ตีกลับ — แก้แล้วยื่นใหม่" : "ยื่นกรมสรรพสามิต" },
    { id: "complete", label: "ชำระแล้ว", hint: "บันทึกเลขที่และวันที่ชำระ" },
    { id: "delivered", label: "ส่งเอกสารแล้ว", hint: "ส่งใบเสร็จกรมให้ลูกค้าแล้ว" },
  ], workflowIndex);
  const primaryAction = canApprove && (o?.status === "draft" || o?.status === "rejected")
    ? (isExempt
      ? {
        id: "file-exempt", label: "ยืนยันชำระ (ยกเว้นภาษี)",
        kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
      }
      : {
        id: "start", label: o?.status === "rejected" ? "ยื่นใหม่" : "เริ่มยื่น",
        kind: "submit", icon: Send, onClick: () => setStartOpen(true),
      })
    : canApprove && o?.status === "filing"
      ? {
        id: "file", label: "บันทึกใบเสร็จกรม",
        kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
      }
      : canApprove && o?.status === "complete"
        ? {
          id: "deliver", label: "ยืนยันส่งใบเสร็จให้ลูกค้า",
          kind: "submit", icon: FileCheck, onClick: () => setDeliverOpen(true),
        }
        : null;

  return (
    <Workspace
      icon={<ReceiptText size={22} />}
      title={o?.taxNoticeNumber || o?.id || "..."}
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
          asideLabel="สรุปและจัดการใบยื่นชำระสรรพสามิต"
          aside={(
            <>
              <DocumentSummaryCard
                title="ยอดที่ต้องเรียกเก็บ (รวม VAT 7%)"
                total={amountToCollectText(o)}
                rows={[
                  { id: "tax-before-vat", label: "ค่าภาษี (ก่อน VAT)", value: taxText(o) },
                  { id: "items", label: "รายการสินค้า", value: `${o.items?.length || 0} รายการ` },
                  { id: "due", label: "กำหนดยื่น", value: o.taxDueDate ? fmtDate(o.taxDueDate) : NA },
                  { id: "invoice", label: "ใบกำกับภาษี", value: naText(o.taxInvoiceNumber) },
                  { id: "receipt", label: "ใบเสร็จสรรพสามิต", value: naText(o.exciseReceiptNumber) },
                ]}
                status={status.label}
                statusColor={toneColor(status.tone)}
              />
              <DocumentControlCard
                status={status.label}
                statusColor={toneColor(status.tone)}
                statusDescription="การดำเนินการระดับใบยื่นชำระ"
                workflowSteps={workflowSteps}
                primaryAction={primaryAction}
                /* ⚠️ "ออกใบแจ้งชำระค่าภาษี" ถึงลูกค้าถอดแล้ว (PR5 · ขัดมติ Q1 — เอกสารถึงลูกค้าคือใบเสนอราคาค่าสรรพสามิต)
                   เลข ET บนหัวใบยังเป็นเลขอ้างอิงภายในของใบยื่น */
                secondaryActions={[
                  {
                    id: "recalc", label: "คิดภาษีใหม่จากใบสั่งขาย", kind: "edit", icon: RefreshCw,
                    onClick: () => setRecalcOpen(true),
                    visible: editAvailable && !!o.salesOrderId,
                    disabled: !!recalcBlock, disabledReason: recalcBlock || undefined,
                  },
                ]}
                dangerActions={[
                  {
                    id: "reject", label: "ตีกลับให้แก้ไข", kind: "reject",
                    onClick: () => setRejectOpen(true),
                    // ต้นทางที่ตีกลับได้มาจากตาราง FILING_TRANSITIONS ตัวเดียวกับด่านใน route
                    visible: canApprove && canTransitionFiling(o.status, "rejected"),
                  },
                  {
                    // ลบได้เฉพาะร่าง (ยังไม่เริ่มยื่น) — งานกลับเข้าคิวรอยื่นกรม · ด่านเดียวกับ DELETE /api/orders/[id]
                    id: "delete", label: "ลบใบยื่น (กลับเข้าคิว)", kind: "delete",
                    onClick: () => setDeleteOpen(true),
                    visible: canDelete && o.status === "draft",
                  },
                ]}
              />
              {/* แผงสรุป SO (PR5) — RA ไม่เข้าหน้าขาย ⇒ ต้นทาง · เงินค่าภาษี · ทะเบียน มาจาก `source` ของ GET ใบรายตัว */}
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
                {!o.salesOrderId && "ใบยื่นเดิมที่สร้างในโมดูลภาษีโดยตรง รายการสินค้าผูกกับข้อมูลลูกค้าและทะเบียนสรรพสามิต"}
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
                        <dt>บัญชี</dt>
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
                    <dt>ด่านเริ่มยื่น</dt>
                    <dd>
                      <span className={source.gates?.money?.ok ? styles.gateOk : styles.gateWarn}>{source.gates?.money?.label}</span>
                      <br />
                      <span className={source.gates?.registration?.ok ? styles.gateOk : styles.gateWarn}>{source.gates?.registration?.label}</span>
                    </dd>
                    {o.filingSkipMoneyReason && (<><dt>เหตุผลที่ข้ามด่านเงิน</dt><dd>{o.filingSkipMoneyReason}</dd></>)}
                    {o.filingSkipRegistrationReason && (<><dt>เหตุผลที่ข้ามด่านทะเบียน</dt><dd>{o.filingSkipRegistrationReason}</dd></>)}
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
              <Field label="PO Reference">{naText(o.poReference)}</Field>
              <Field label="วันที่คาดว่าจะส่ง">{o.deliveryDate && o.deliveryDate !== "-" ? o.deliveryDate : NA}</Field>
              <Field label="ยอดภาษีรวม">{taxText(o)}</Field>
              <Field label="เลขที่ใบกำกับภาษี">{naText(o.taxInvoiceNumber)}</Field>
              <Field label="ใบเสร็จสรรพสามิต">{naText(o.exciseReceiptNumber)}</Field>
              {o.taxPaidDate && <Field label="วันที่ชำระจริง">{fmtDate(o.taxPaidDate)}</Field>}
              {o.taxFormRef && <Field label="แบบ ภส.">{o.taxFormRef}</Field>}
            </div>

            {editAvailable && (
              <div className="form-group" style={{ margin: "12px 0 0" }}>
                <label>กำหนดยื่น (Due date)</label>
                <DateInput style={{ maxWidth: 180 }}
                  value={o.taxDueDate && /^\d{4}-\d{2}-\d{2}/.test(o.taxDueDate) ? o.taxDueDate.slice(0, 10) : ""}
                  onChange={setDue} />
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: 16 }}>
            <div className="drawer-section-title" style={{ marginBottom: 10 }}>รายการสินค้า ({o.items?.length || 0})</div>
            {untaxedIds.size > 0 && (
              <StatusNotice tone="warning">
                มี {untaxedIds.size} รายการที่ภาษีเป็น ฿0 เพราะตอนสร้างใบ สินค้ายังไม่มีราคาขายปลีก — ยอดในใบนี้ขาดจากที่ต้องยื่นจริง
                {o.salesOrderId && editAvailable && !recalcBlock && " · เติมราคาขายปลีกแล้วกด \"คิดภาษีใหม่จากใบสั่งขาย\""}
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

          {/* เธรดกลาง (mig 0163) — ใบยื่นเดินข้ามเลน ขาย ↔ RA/บัญชี หลายรอบ
              และ `rejectionReason` ถูกล้างทุกครั้งที่ยื่นใหม่หลังถูกตีกลับ */}
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

      <StartFilingDialog open={startOpen} onClose={() => setStartOpen(false)} onDone={reload} order={o} gates={source?.gates || null} />
      <FileTaxDialog open={fileOpen} onClose={() => setFileOpen(false)} onDone={reload} order={o} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={reject} title="ตีกลับใบยื่นชำระ" entityLabel="ใบยื่นนี้" />
      <ConfirmDialog
        closeOnSuccess
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="ลบใบยื่นชำระ"
        message={`ยืนยันการลบใบยื่น ${o?.quotationRef || "รายการนี้"}? งานจะกลับเข้าคิวรอยื่นกรม · การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
      <ConfirmDialog
        closeOnSuccess
        open={recalcOpen}
        onClose={() => setRecalcOpen(false)}
        onConfirm={recalc}
        title="คิดภาษีใหม่จากใบสั่งขาย"
        message="ระบบจะคิดรายการและยอดภาษีใหม่จากใบสั่งขายลูกค้า ด้วยราคาขายปลีกและทะเบียน ณ ตอนนี้ แทนรายการเดิมทั้งชุด"
        confirmLabel="คิดภาษีใหม่"
      />
      <ConfirmDialog
        closeOnSuccess
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() => transition("delivered")}
        title="ยืนยันส่งใบเสร็จให้ลูกค้า"
        message={`ยืนยันว่าได้ส่งใบเสร็จกรมสรรพสามิตของ ${o?.quotationRef || "รายการนี้"} ให้ลูกค้าเรียบร้อยแล้ว · ใบยื่นจะปิดงาน`}
        confirmLabel="ยืนยันส่งเอกสารแล้ว"
      />
    </Workspace>
  );
}
