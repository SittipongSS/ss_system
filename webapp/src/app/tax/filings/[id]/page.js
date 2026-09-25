"use client";
import { TableScroll } from "@/components/ui/Table";
import { useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useParams, useRouter } from "next/navigation";
import { ReceiptText, Pencil, Wallet, FileCheck, MessagesSquare, Printer, ExternalLink } from "lucide-react";
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
import OrderFormModal from "@/components/excise/OrderFormModal";
import ReceiveDialog from "@/components/excise/ReceiveDialog";
import StartFilingDialog from "@/components/excise/StartFilingDialog";
import FileTaxDialog from "@/components/excise/FileTaxDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { openBillPrintWindow } from "@/lib/tax/billPrint";
import { orderAmountToCollect } from "@/lib/tax/exciseBilling";
import { productDisplayName } from "@/lib/master/productIdentity";
import { statusMeta } from "@/lib/excise/workflow";
import { useCustomerRecord } from "@/lib/master/useCustomerRecord";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";
import { apiFetch } from "@/lib/apiFetch";

const taxText = (o) => ((o.totalTax || 0) === 0 ? "ยกเว้นภาษี" : fmtMoney(o.totalTax));
// ยอดเรียกเก็บ = ค่าภาษี + VAT 7% ตรงกับ "ยอดแจ้งชำระสุทธิ" บนเอกสารที่พิมพ์เสมอ
// (มติผู้ใช้ 2026-07-26) — คิดจาก lib/tax/exciseBilling ที่เดียว
const amountToCollectText = (o) => ((o.totalTax || 0) === 0
  ? "ยกเว้นภาษี"
  : fmtMoney(orderAmountToCollect(o)));
const ORDER = ["draft", "pending", "received", "filing", "complete", "delivered"];
// ประโยคท้ายป้ายของสายที่ป้อนฟอร์มแก้ไขเท่านั้น (ทะเบียน · ลูกค้า · สินค้า) — ดูมติที่ก้อน sources
const EDIT_BLOCKED_NOTE = "ยังแก้ไขใบยื่นนี้ไม่ได้ เพราะฟอร์มแก้ไขต้องใช้ข้อมูลชุดนี้เลือกสินค้าและคิดภาษี";
const EDIT_STALE_NOTE = "ฟอร์มแก้ไขจะใช้รายการรอบก่อน ไม่ใช่ล่าสุด";

export default function FilingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canAct = useCan("sales:act");        // SA: receive / edit
  const canApprove = useCan("ra:approve"); // RA: file / reject / due date
  const canDelete = useCan("sales:delete");  // Senior AE+ / admin: delete

  const { data: orders, loading, error: ordersError, staleError: ordersStale, errorDetail: ordersDetail, reload } = useApiList("/api/orders");
  const { data: registrations, loading: lRegistrations, error: registrationsError, staleError: registrationsStale, errorDetail: registrationsDetail, loaded: registrationsLoaded, reload: reloadRegistrations } = useApiList("/api/excise-registrations");
  const { data: customers, loading: lCustomers, error: customersError, staleError: customersStale, errorDetail: customersDetail, loaded: customersLoaded, reload: reloadCustomers } = useApiList("/api/customers");
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/products");

  const o = useMemo(() => orders.find((x) => x.id === id) || null, [orders, id]);
  const isExempt = (o?.totalTax || 0) === 0;
  const unregisteredItemCount = (o?.items || []).filter((item) => !item.registrationId).length;
  // ลิสต์ customers ข้างบนมีไว้ให้ picker ของ OrderFormModal — ลูกค้าของใบยื่นใบนี้
  // ต้องอ่านรายตัว ไม่ใช่ find จากลิสต์ที่กรองทีม (ดู lib/master/useCustomerRecord.js)
  const customer = useCustomerRecord(o?.customerId, customers.find((c) => c.id === o?.customerId));

  /* ── โหลดพัง ≠ ไม่พบใบยื่น · และสายรองล้มต้องไม่ปล่อยให้เปิดฟอร์มแก้ไขที่ขาดข้อมูล ──────────
     🐞 ใบยื่นใบนี้มาจาก `orders.find(...)` ⇒ `/api/orders` ล้มเมื่อไร `orders` ค้างที่ `[]` แล้ว `o` เป็น null
        จอเดิมจึงขึ้นหัว "ไม่พบรายการ · ใบยื่นนี้อาจถูกลบไปแล้ว" — อ่านว่าใบถูกลบ ทั้งที่ใบยังอยู่ครบ แค่โหลดไม่ขึ้น
        ⇒ ทางแยกของสายนี้ต้องตัดสิน **ก่อน** บรรทัด "ไม่พบรายการ" เสมอ (ท่าเดียวกับหน้าแก้รอบ FC)
     🪤 "มีของในมือ" ของสายใบยื่นคือ **ใบนี้** (`!o`) ไม่ใช่ความยาวลิสต์ — แคชระดับโมดูลที่ถ่ายไว้ก่อนใบนี้เกิด
        (เช่นเพิ่งออกใบจาก SO แล้วกดเข้ามา) มีใบอื่นเต็มลิสต์แต่ไม่มีใบนี้

     ⭐ **มติของจอนี้: สายไหนบล็อกอะไร** (หน้ารายละเอียดเป็นจออ่านเป็นหลัก ไม่ใช่ฟอร์ม)
        · ใบยื่นชำระ (`blocks: "page"`) — ไม่มีใบในมือ = ไม่มีอะไรให้โชว์เลย ⇒ ทั้งหน้าเหลือป้าย
        · ทะเบียนสรรพสามิต · รายชื่อลูกค้า · ทะเบียนสินค้า (`blocks: "edit"`) — เนื้อหน้าไม่ได้อ่านสามลิสต์นี้เลย
          (รายการสินค้า/ภาษีบนใบเป็น snapshot ในตัวใบเอง · ลูกค้าอ่านรายตัวผ่าน useCustomerRecord) ของที่กินมันมี
          ชิ้นเดียวคือ **ฟอร์มแก้ไข** (OrderFormModal): ทะเบียนหาย ⇒ ช่องสินค้าขึ้น "ไม่มีสินค้าที่อนุมัติแล้วของลูกค้านี้"
          · ลูกค้าหาย ⇒ ทะเบียนของใบลูกค้าอื่นในนิติบุคคลเดียวกันหายจากตัวเลือก · สินค้าหาย ⇒ ภาษีในฟอร์มคิดจากราคา 0
          ⇒ **ไม่ซ่อนหน้า** แต่พักปุ่ม "แก้ไขข้อมูล" / "แก้ไขและส่งกลับ" (ยังโชว์ พร้อมบรรทัดเหตุผล — กติกา
          "ติดด่าน = โชว์แล้วบอกเหตุ") และป้ายหัวจอบอกว่าพักเพราะสายไหน
        · หัวจอ (รหัส AR หน้าชื่อลูกค้า) อ่านจาก `customer` รายตัว ไม่ใช่ลิสต์ — ลิสต์ลูกค้าล้มจึงไม่ทำให้หัวจอแหว่ง
     ⚠️ ป้ายกับการบล็อกคนละคำถาม (กติกาเดียวกับ /tax · /sahamit): มี `error` หรือรอบเบื้องหลังล้ม (`staleError`)
        = ขึ้นป้ายเสมอ · บล็อกเฉพาะตอนไม่เคยโหลดสำเร็จ (`loaded` / `!o`) — มีแคชอยู่ก็ทำงานต่อได้ ป้ายบอกว่าเป็น
        ของรอบก่อน (`staleNote`) · ประโยคท้ายป้ายผูกกับ **สายที่ล้มจริง** ทีละสาย ไม่ใช่ประโยคเดียวคลุมทุกกรณี
     🪤 `empty` ของสายใบยื่น = ไม่มีใบในมือ **และรอบหน้าบ้านล่าสุดล้ม** (`ordersError`) ไม่ใช่ `staleError` — รอบเบื้องหลัง
        ล้มได้ก็ต่อเมื่อรอบหน้าบ้านก่อนหน้าสำเร็จแล้ว และรอบนั้นตอบไปแล้วว่าไม่มีใบนี้ ⇒ "ไม่พบรายการ" ที่ยืนยันแล้วต้องไม่พลิก
        เป็น "(ไม่ได้แปลว่าใบยื่นนี้ถูกลบไปแล้ว)" เพราะสลับแท็บแล้วเน็ตสะดุด
     ⭐ **สายรองพูดเฉพาะตอนคนดูมีปุ่มแก้ไขจริง** (`editAvailable` — เงื่อนไขเดียวกับปุ่ม "แก้ไขข้อมูล"/"แก้ไขและส่งกลับ"):
        ฝ่าย RA · ใบที่รับเงินแล้ว/ยื่นแล้ว/ส่งเอกสารแล้ว ไม่มีทางเปิดฟอร์มแก้ไขเลย ⇒ ป้ายแดง "ยังแก้ไขใบยื่นนี้ไม่ได้ เพราะ…"
        คือเหตุผลปลอมของสิ่งที่ไม่มีอยู่ (และผิดกติกา "ไม่มีสิทธิ์ = ไม่โชว์") · ของบนหน้าที่เหลือไม่ได้อ่านสามลิสต์นี้ ⇒ ไม่มีอะไรต้องเตือน
     ⭐ `pending` = สายรองที่ไม่เคยโหลดสำเร็จและยังโหลดอยู่ — ฟอร์มที่เปิดตอนนี้ได้ตัวเลือกว่าง/ภาษีจากราคา 0 เหมือนตอนล้ม
        ⇒ ปุ่มแก้ไขพักรอ พร้อมเหตุผล "กำลังโหลด…" (ไม่ใช่ป้ายแดง — ยังไม่มีอะไรล้ม) */
  const editAvailable = canAct && ["pending", "rejected"].includes(o?.status);
  const sources = [
    {
      label: "ใบยื่นชำระ", error: ordersError || ordersStale, empty: !o && !!ordersError, detail: ordersDetail, reload, blocks: "page",
      blockedNote: "ยังเปิดใบยื่นนี้ไม่ได้ (ไม่ได้แปลว่าใบยื่นนี้ถูกลบไปแล้ว)",
      staleNote: "ข้อมูลใบยื่นที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "ทะเบียนสรรพสามิต", error: editAvailable ? registrationsError || registrationsStale : null, empty: !registrationsLoaded, detail: registrationsDetail, reload: reloadRegistrations, blocks: "edit",
      pending: lRegistrations && !registrationsLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
    {
      label: "รายชื่อลูกค้า", error: editAvailable ? customersError || customersStale : null, empty: !customersLoaded, detail: customersDetail, reload: reloadCustomers, blocks: "edit",
      pending: lCustomers && !customersLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
    {
      label: "ทะเบียนสินค้า", error: editAvailable ? productsError || productsStale : null, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "edit",
      pending: lProducts && !productsLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  const editBlocked = blocked.filter((s) => s.blocks === "edit");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* เปิดใบไม่ได้ = พูดเรื่องนั้นเรื่องเดียว (ปุ่มแก้ไขไม่ได้อยู่บนจอให้พัก) · ไม่งั้นพูดทุกสายที่ล้ม — สายที่บล็อก
     ใช้ blockedNote สายที่ยังมีแคชใช้ staleNote · Set กันประโยคเดียวกันซ้ำเมื่อสายรองล้มพร้อมกันหลายสาย
     🪤 สายรองสายหนึ่งพักฟอร์มแล้ว ⇒ ตัด staleNote ของสายรองที่ยังมีแคชทิ้ง — "ยังแก้ไขไม่ได้" คู่กับ "ฟอร์มแก้ไขจะใช้
        รายการรอบก่อน" ขัดกันเอง (ฟอร์มเปิดไม่ได้อยู่แล้ว) */
  const said = pageBlocked
    ? blocked.filter((s) => s.blocks === "page")
    : failing.filter((s) => !(editBlocked.length && s.blocks === "edit" && !s.empty));
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set(said.map((s) => (s.empty ? s.blockedNote : s.staleNote))),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  /* ปุ่มลองใหม่ต้องบอกเองว่ากำลังลองอยู่ — ลองสายรองไม่ได้พาหน้าเข้า skeleton (ใบยังอยู่ในมือ)
     ⇒ ไม่มีสถานะนี้ = กดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lRegistrations || lCustomers || lProducts;
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
  /* ปุ่มที่เปิดฟอร์มแก้ไข — พักไว้พร้อมเหตุผล (ไม่ซ่อน) เมื่อสายที่ฟอร์มต้องใช้ไม่เคยโหลดสำเร็จ (ล้ม หรือยังโหลดอยู่)
     ⚠️ ชื่อสายอยู่ **หลัง** "ดึงข้อมูลไม่ได้:" สำนวนเดียวกับป้าย — แทรกกลาง "ดึง…ไม่สำเร็จ" แล้วจุดคั่นสองสายตกกลางกริยา */
  const editPending = sources.some((s) => s.blocks === "edit" && s.pending);
  const editPaused = editBlocked.length > 0 || editPending;
  const editPausedReason = editBlocked.length
    ? `ยังแก้ไขไม่ได้ — ดึงข้อมูลไม่ได้: ${editBlocked.map((s) => s.label).join(" · ")} (ดูข้อความด้านบน)`
    : editPending ? "กำลังโหลดข้อมูลของฟอร์มแก้ไข…" : undefined;

  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
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
  if (!loading && !o) {
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
    ? 0
    : Math.max(ORDER.indexOf(o?.status), 0);
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "เตรียมใบยื่น", hint: "ตรวจรายการและยอดที่ดึงจาก ใบสั่งขาย" },
    { id: "pending", label: "รอรับเงิน", hint: o?.status === "rejected" ? "แก้ไขตามเหตุผลที่ตีกลับ" : "ฝ่ายขายตรวจยอดและหลักฐาน" },
    { id: "received", label: "รับเงินแล้ว", hint: "ฝ่าย RA เตรียมแบบยื่น" },
    { id: "filing", label: "กำลังยื่น", hint: "ยื่นกรมสรรพสามิต" },
    { id: "complete", label: "ชำระแล้ว", hint: "บันทึกเลขที่และวันที่ชำระ" },
    { id: "delivered", label: "ส่งเอกสารแล้ว", hint: "ส่งหลักฐานการชำระให้ลูกค้าแล้ว" },
  ], workflowIndex);
  const primaryAction = canAct && o?.status === "draft"
    ? {
      id: "queue", label: "ส่งเข้าคิวเก็บเงิน",
      kind: "submit", icon: Wallet, onClick: () => transition("pending"),
    }
    : canAct && o?.status === "pending"
      ? {
        id: "receive", label: isExempt ? "ยืนยันรับเงิน" : "รับเงินแล้ว",
        kind: "submit", icon: Wallet, onClick: () => setReceiveOpen(true),
      }
      : canAct && o?.status === "rejected"
        ? {
          id: "resubmit", label: "แก้ไขและส่งกลับ",
          kind: "submit", icon: Pencil, onClick: () => setFormOpen(true),
          disabled: editPaused, disabledReason: editPausedReason,
        }
        : canApprove && o?.status === "received"
          ? (isExempt
            ? {
              id: "file-exempt", label: "ยืนยันชำระ",
              kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
            }
            : {
              id: "start", label: "เริ่มยื่น",
              kind: "submit", onClick: () => setStartOpen(true),
            })
          : canApprove && o?.status === "filing"
            ? {
              id: "file", label: "บันทึกชำระภาษี",
              kind: "submit", icon: FileCheck, onClick: () => setFileOpen(true),
            }
            : canAct && o?.status === "complete"
          ? {
            id: "deliver", label: "ยืนยันส่งเอกสารให้ลูกค้า",
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
                secondaryActions={[
                  {
                    id: "edit", label: "แก้ไขข้อมูล", kind: "edit", icon: Pencil,
                    onClick: () => setFormOpen(true),
                    visible: canAct && ["pending", "rejected"].includes(o.status),
                    disabled: editPaused, disabledReason: editPausedReason,
                  },
                  {
                    id: "print-notice", label: "ออกใบแจ้งชำระค่าภาษี",
                    kind: "print", icon: Printer, onClick: () => openBillPrintWindow(o, customer),
                  },
                ]}
                dangerActions={[
                  {
                    id: "reject", label: "ตีกลับให้แก้ไข", kind: "reject",
                    onClick: () => setRejectOpen(true),
                    visible: canApprove && ["received", "filing"].includes(o.status),
                  },
                  {
                    id: "delete", label: "ลบเอกสาร", kind: "delete",
                    onClick: () => setDeleteOpen(true),
                    visible: canDelete,
                  },
                ]}
              />
              <RelatedDocumentCard
                title={o.salesOrderId ? "ใบสั่งขายต้นทาง" : "เอกสารต้นทาง"}
                meta={o.poReference || o.quotationRef || "ข้อมูลลูกค้าและทะเบียนสินค้า"}
                actions={o.salesOrderId ? (
                  <>
                    <Link href={`/sa/sales-orders/${o.salesOrderId}`} className="btn ghost sm">
                      <ExternalLink size={13} /> เปิด ใบสั่งขาย
                    </Link>
                    {/* ใบเสนอราคาที่เกี่ยวข้อง (mig 0349) — ผูกด้วย FK ไม่ใช่สตริง
                        `quotationRef` ที่พิมพ์แก้เองได้ · ใบยุคก่อนที่ยังไม่มี FK
                        ไม่ขึ้นปุ่ม แทนที่จะพาไปหน้าที่หาไม่เจอ
                        ⚠️ ใช้ Button primitive (as=Link) ไม่ใช่คลาส `btn` ดิบ — งบ
                        rawButtonClass ของโมดูลนี้เต็มเพดานพอดี (22/22) */}
                    {o.quotationId && (
                      <Button as={Link} href={`/sa/quotations/${o.quotationId}`} variant="quiet" size="sm">
                        <ExternalLink size={13} /> เปิด ใบเสนอราคา
                      </Button>
                    )}
                  </>
                ) : o.customerId ? (
                  <Link href={`/database/customers/${o.customerId}`} className="btn ghost sm">
                    <ExternalLink size={13} /> เปิดลูกค้า
                  </Link>
                ) : null}
              >
                {o.salesOrderId
                  ? (
                    <>
                      <div>รายการและอัตราภาษีถูก snapshot จากใบสั่งขายตอนสร้างใบยื่น โมดูลภาษีเป็นเจ้าของข้อมูลใบยื่นนี้</div>
                      {unregisteredItemCount > 0 && (
                        <div style={{ marginTop: 8, color: "var(--amber)" }}>
                          มี {unregisteredItemCount} รายการที่ยังไม่มีทะเบียนสรรพสามิตอนุมัติ เป็นคำเตือนและไม่บล็อก workflow
                        </div>
                      )}
                    </>
                  )
                  : "ใบยื่นเดิมที่สร้างในโมดูลภาษีโดยตรง รายการสินค้าผูกกับข้อมูลลูกค้าและทะเบียนสรรพสามิต"}
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

            {canApprove && o.status === "received" && (
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
              canEdit={canAct || canApprove}
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
              placeholder="พิมพ์ข้อความ เช่น ลูกค้าโอนเงินแล้ว รอสลิป..."
              emptyText="ยังไม่มีความเคลื่อนไหว"
            />
          </DetailCard>

          </div>
        </DetailPageLayout>
      )}

      <OrderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        order={o}
        registrations={registrations}
        customers={customers}
        products={products}
      />
      <ReceiveDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} onDone={reload} order={o} />
      <StartFilingDialog open={startOpen} onClose={() => setStartOpen(false)} onDone={reload} order={o} />
      <FileTaxDialog open={fileOpen} onClose={() => setFileOpen(false)} onDone={reload} order={o} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={reject} title="ตีกลับใบยื่นชำระ" entityLabel="ใบยื่นนี้" />
      <ConfirmDialog
        closeOnSuccess
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="ลบใบยื่นชำระ"
        message={`ยืนยันการลบใบยื่นชำระ ${o?.quotationRef || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
      <ConfirmDialog
        closeOnSuccess
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() => transition("delivered")}
        title="ยืนยันส่งเอกสารให้ลูกค้า"
        message={`ยืนยันว่าได้ส่งเอกสารการชำระ ${o?.quotationRef || "รายการนี้"} ให้ลูกค้าเรียบร้อยแล้ว`}
        confirmLabel="ยืนยันส่งเอกสารแล้ว"
      />
    </Workspace>
  );
}
