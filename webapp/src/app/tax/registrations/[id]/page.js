"use client";
import { notifyToast } from "@/components/ui/Toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ClipboardCheck, Calculator, ExternalLink, MessagesSquare, ReceiptText, Send, Undo2,
} from "lucide-react";
import UpdateThread from "@/components/updates/UpdateThread";
import { ActionButton } from "@/components/ui/ActionButtons";
import Workspace from "@/components/ui/Workspace";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import {
  DocumentControlCard, DocumentReadinessList, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { TableScroll } from "@/components/ui/Table";
import DetailRow from "@/components/ui/DetailRow";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, naText } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { useApiList } from "@/lib/excise/useApiList";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import StatusBadge from "@/components/excise/StatusBadge";
import { Field } from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/Modal";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import ApproveDialog from "@/components/excise/ApproveDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import { brandLabel } from "@/lib/master/brands";
import { customerNameIn } from "@/lib/master/customerName";
import { productDisplayName } from "@/lib/master/productIdentity";
import { statusMeta } from "@/lib/excise/workflow";
import {
  EXCISE_RATE, LOCAL_TAX_RATE_OF_EXCISE, EXCISE_TOTAL_RATE, EXCISE_VAT_RATE,
  exciseTaxLineForRegistration, productTaxRates,
} from "@/lib/tax/exciseBilling";
import { ageLabel, ageTone, registrationAge } from "@/lib/tax/registrationQueue";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import { toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";
import { httpLoadFailure, sourcesFailureDetail, thrownLoadFailure } from "@/lib/ui/loadFailure";

// ภาษี/ชิ้น อ่านจากทะเบียนสินค้าเสมอ (ดูเหตุผลเต็มที่หน้ารายการทะเบียน) — ทะเบียน
// สรรพสามิตตัดสินแค่ว่า "เสียภาษีไหม" ส่วนตัวเลขอัตรามาจากราคาขายปลีกของ FG
const taxPerUnit = (r, product) =>
  exciseTaxLineForRegistration({ registration: r, product, quantity: 1 }).totalTax;

/* 0.07 * 100 = 7.000000000000001 ในเลขทศนิยมฐานสอง ⇒ เช็ค "ลงตัวไหม" ตรง ๆ จะได้
   "7.0%" แทน "7%" · ปัดก่อนแล้วค่อยเทียบ */
const pct = (rate) => {
  const value = Math.round(rate * 1000) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
};

// ประโยคท้ายป้ายของสายที่ป้อนฟอร์มแก้ไขเท่านั้น (สินค้า · ลูกค้า · รายการขึ้นทะเบียน) — ดูมติที่ก้อน sources
const EDIT_BLOCKED_NOTE = "ยังแก้ไขทะเบียนนี้ไม่ได้ เพราะฟอร์มแก้ไขต้องใช้ข้อมูลชุดนี้เลือกลูกค้าและ FG ที่ยังไม่ขึ้นทะเบียน";
const EDIT_STALE_NOTE = "ฟอร์มแก้ไขจะใช้รายการรอบก่อน ไม่ใช่ล่าสุด";

export default function RegistrationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("products:edit");
  const canApprove = useCan("ra:approve");

  /* ⭐ อ่าน **ใบเดียว** พร้อมของประกอบ (สินค้า/ลูกค้า/โครงการ/ใบยื่นที่อ้างถึง)
     🐞 ของเดิมโหลดทะเบียนทั้งตารางแล้ว find(id) + โหลด /api/products (342 แถว) และ
     /api/customers (508 แถว) เต็มทั้งคู่ เพื่อใช้แถวเดียว */
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  /* ความล้มของใบนี้ = `{ message, detail }` จาก lib/ui/loadFailure ตัวเดียวกับที่ useApiList ใช้ (ไทยนำ + ดิบเป็นบรรทัดรอง)
     แยกสองช่องแบบเดียวกับฮุก: รอบหน้าบ้านที่ล้ม (`recordFault`) · รอบเบื้องหลังที่ล้ม (`recordStaleFault` = ของบนจอเป็นรอบก่อน)
     🐞 ทรงเดิม: รอบเบื้องหลังล้มเงียบสนิท (แท็บที่เปิดค้างยืนยันสถานะเมื่อวานต่อไป) · รอบหน้าบ้านล้ม (500/เน็ตหลุด) ได้หัว
        "ไม่พบรายการ · ทะเบียนนี้อาจถูกลบไปแล้ว" + ข้อความดิบของเซิร์ฟเวอร์เป็นตัวเนื้อ = อ่านว่าทะเบียนถูกลบ ทั้งที่ใบยังอยู่ครบ
     ⭐ 404 = ไม่มีใบนี้จริง (ไม่มีแถว หรือมองไม่เห็นตามสิทธิ์ — server ตอบเหมือนกันโดยเจตนา) ⇒ ไม่ใช่ความล้ม ไปทาง "ไม่พบรายการ"
        · แต่ 404 ของรอบเบื้องหลัง (มีคนลบใบที่เปิดค้างอยู่) ไม่พลิกจอทิ้ง — ของบนจอยังอยู่ ป้ายบอก "ไม่พบทะเบียนนี้" ว่าเป็นรอบก่อน */
  const [recordFault, setRecordFault] = useState(null);
  const [recordStaleFault, setRecordStaleFault] = useState(null);
  const load = useCallback(async (opts) => {
    if (!opts?.background) setLoading(true);
    let fault = null;
    try {
      const res = await apiFetch(`/api/excise-registrations/${id}?full=1`);
      if (res.ok) {
        setS(await res.json());
        setRecordFault(null);
        setRecordStaleFault(null);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 404 && !opts?.background) {
        setS(null);
        setRecordFault(null);
        setRecordStaleFault(null);
        return;
      }
      // มี response แต่ไม่ ok — ประโยคไทยตาม status · ข้อความดิบทั้งก้อนไปบรรทัดรอง (ตัวแยกเดียวกับ useApiList)
      fault = httpLoadFailure(res.status, body?.error);
    } catch (e) {
      fault = thrownLoadFailure(e);
    } finally {
      if (!opts?.background) setLoading(false);
    }
    if (opts?.background) setRecordStaleFault(fault); else setRecordFault(fault);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // ใบที่เปิดค้างไว้ต้องรู้เองว่าอีกฝั่งอนุมัติ/ตีกลับไปแล้ว — ไม่ต้องรอให้ผู้ใช้ F5
  useRevalidateOnFocus(load);
  const reload = useCallback(() => load(), [load]);

  const taxProduct = s?.product || null;
  const customer = s?.customer || null;
  // ชื่อบนจอต้องผ่านกติกาสองภาษา — ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้หัวการ์ดเปล่าเหมือนไม่มีชื่อ
  const customerLabel = customerNameIn(customer);

  /* ⚠️ "วันนี้" อ่านครั้งเดียวตอน mount จากนาฬิกาไทย — ห้ามอ่านนาฬิกาตอนเรนเดอร์ */
  const todayIso = useMemo(() => businessDate(), []);
  const ageDays = s ? registrationAge(s, todayIso) : null;

  const [formOpen, setFormOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // ลิสต์ของ picker โหลดตอนเปิดฟอร์มแก้ครั้งแรกเท่านั้น (ไม่ใช่ตอนเปิดหน้า)
  const [pickerReady, setPickerReady] = useState(false);
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList(pickerReady ? "/api/products" : null);
  const { data: customers, loading: lCustomers, error: customersError, staleError: customersStale, errorDetail: customersDetail, loaded: customersLoaded, reload: reloadCustomers } = useApiList(pickerReady ? "/api/customers" : null);
  const { data: allRegs, loading: lRegs, error: regsError, staleError: regsStale, errorDetail: regsDetail, loaded: regsLoaded, reload: reloadRegs } = useApiList(pickerReady ? "/api/excise-registrations" : null);
  const openForm = () => { setPickerReady(true); setFormOpen(true); };

  /* ── โหลดใบพัง ≠ ไม่พบทะเบียน · picker ที่ดึงไม่ได้ ≠ "ไม่มีลูกค้า/สินค้าให้เลือก" ─────────────────────────
     ท่าเดียวกับหน้ารายละเอียดใบยื่นชำระ (tax/filings/[id]) — ป้ายเดียวของจอ ทุกแหล่งข้อมูลอยู่ในก้อน sources

     ⭐ **มติของจอนี้: สายไหนบล็อกอะไร** (หน้ารายละเอียดเป็นจออ่านเป็นหลัก ไม่ใช่ฟอร์ม)
        · ทะเบียนใบนี้ (`blocks: "page"` — อ่านด้วย apiFetch ไม่ใช่ useApiList แต่พูดสำนวนเดียวกัน) — ไม่มีใบในมือ = ไม่มีอะไรให้โชว์
          ⇒ ทั้งหน้าเหลือป้าย และทางแยกนี้ต้องตัดสิน **ก่อน** บรรทัด "ไม่พบรายการ" เสมอ
          🪤 `empty` = ไม่มีใบในมือ **และรอบหน้าบ้านล่าสุดล้ม** (`recordError`) ไม่ใช่รอบเบื้องหลัง — "ไม่พบ" ที่ยืนยันด้วย 404 แล้ว
             ต้องไม่พลิกเป็น "(ไม่ได้แปลว่าทะเบียนนี้ถูกลบไปแล้ว)" เพราะสลับแท็บแล้วเน็ตสะดุด
        · ทะเบียนสินค้า · รายชื่อลูกค้า · รายการขึ้นทะเบียนทั้งหมด (`blocks: "edit"` — picker โหลดตอนกดแก้ไขครั้งแรก)
          เนื้อหน้าไม่ได้อ่านสามลิสต์นี้เลย (สินค้า/ลูกค้าของใบมากับ `?full=1`) ของที่กินมันมีชิ้นเดียวคือ **ฟอร์มแก้ไข**
          (RegistrationFormModal): สินค้าหาย ⇒ ช่อง FG ขึ้น "ลูกค้ารายนี้ยังไม่มี FG — สร้างที่ฐานข้อมูลก่อน" · ลูกค้าหาย ⇒
          "ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน" · รายการขึ้นทะเบียนหาย ⇒ FG ที่ขึ้นทะเบียนกับลูกค้ารายนั้นแล้วโผล่ให้เลือกไปชน 409
          ⇒ **ไม่ซ่อนหน้า** แต่ฟอร์มไม่เปิดบนข้อมูลครึ่งเดียว: เปิดฟอร์มจริงเมื่อทุกสายของมันเคยโหลดสำเร็จ (`editReady`) ·
          ระหว่างนั้นโมดัลหัวเดียวกันวางป้ายตัวเดียวกันพร้อมปุ่มลองใหม่ (ล้ม) หรือบรรทัด "กำลังโหลด…" (ยังมาไม่ครบ)
          แทนช่องเลือกที่ว่าง ⇒ ปุ่มบันทึกไม่มีให้กดบนข้อมูลที่ขาด (ท่าเดียวกับหน้าแก้ PO ที่คืนป้ายแทนฟอร์ม)
          🐞 ทรงเดิมเปิดฟอร์มทันทีตอนกด แม้แต่ตอนโหลดปกติก็เห็น "ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน" อยู่ครู่หนึ่ง
     ⚠️ ป้ายกับการบล็อกคนละคำถาม: มี error หรือรอบเบื้องหลังล้ม = ขึ้นป้ายเสมอ · บล็อกเฉพาะตอนไม่เคยโหลดสำเร็จ
        (`loaded` / `!s`) — มีแคชอยู่ก็ใช้ต่อได้ ป้ายบอกว่าเป็นของรอบก่อน (`staleNote`)
     ⭐ **สายรองพูดเฉพาะตอนคนดูมีปุ่มแก้ไขจริง** (`editAvailable` — เงื่อนไขเดียวกับปุ่ม "แก้ไข" บนหัวจอ): picker ที่ล้มค้างไว้
        แล้วใบถูกอนุมัติไประหว่างนั้น (ปุ่มแก้ไขหาย) ต้องไม่เหลือป้ายแดง "ยังแก้ไขทะเบียนนี้ไม่ได้ เพราะ…" ของปุ่มที่ไม่มีอยู่
     ⚠️ `(s)` ในลูกศรของก้อนนี้คือ **สาย** ไม่ใช่ทะเบียน `s` ของหน้า — ชื่อเดียวกับทุกจอในทะเบียนของด่าน apiListErrorVisible */
  const recordError = recordFault?.message ?? null;
  const recordStale = recordStaleFault?.message ?? null;
  const recordDetail = (recordFault || recordStaleFault)?.detail ?? null;
  const editAvailable = canEdit && !!s && s.status !== "approved";
  const sources = [
    {
      label: "ทะเบียนใบนี้", error: recordError || recordStale, empty: !s && !!recordError, detail: recordDetail, reload, blocks: "page",
      blockedNote: "ยังเปิดทะเบียนนี้ไม่ได้ (ไม่ได้แปลว่าทะเบียนนี้ถูกลบไปแล้ว)",
      staleNote: "ข้อมูลทะเบียนที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "ทะเบียนสินค้า", error: editAvailable ? productsError || productsStale : null, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "edit",
      pending: lProducts && !productsLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
    {
      label: "รายชื่อลูกค้า", error: editAvailable ? customersError || customersStale : null, empty: !customersLoaded, detail: customersDetail, reload: reloadCustomers, blocks: "edit",
      pending: lCustomers && !customersLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
    {
      label: "รายการขึ้นทะเบียนทั้งหมด", error: editAvailable ? regsError || regsStale : null, empty: !regsLoaded, detail: regsDetail, reload: reloadRegs, blocks: "edit",
      pending: lRegs && !regsLoaded, blockedNote: EDIT_BLOCKED_NOTE, staleNote: EDIT_STALE_NOTE,
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const pageBlocked = blocked.some((s) => s.blocks === "page");
  const editBlocked = blocked.filter((s) => s.blocks === "edit");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — ตัวที่ถูกทิ้งมักเป็นตัวที่บอกสาเหตุจริง
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* เปิดใบไม่ได้ = พูดเรื่องนั้นเรื่องเดียว · ไม่งั้นพูดทุกสายที่ล้ม (บล็อก = blockedNote · มีแคช = staleNote) · Set กันประโยคซ้ำ
     🪤 สายรองสายหนึ่งพักฟอร์มแล้ว ⇒ ตัด staleNote ของสายรองที่ยังมีแคชทิ้ง — "ยังแก้ไขไม่ได้" คู่กับ "ฟอร์มแก้ไขจะใช้
        รายการรอบก่อน" ขัดกันเอง (ท่าเดียวกับ tax/filings/[id]) */
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
  /* ปุ่มลองใหม่ต้องบอกเองว่ากำลังลองอยู่ — ลองสายรองไม่ได้พาหน้าเข้า skeleton (ใบยังอยู่ในมือ) และป้ายในโมดัล
     ไม่มี skeleton เลย ⇒ ไม่มีสถานะนี้ = กดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lProducts || lCustomers || lRegs;
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
  // ฟอร์มจริงเปิดเมื่อไม่มีสายของมัน "ไม่เคยโหลดสำเร็จ" (ล้ม หรือยังมาไม่ครบ) · มีแคช = ใช้ได้ ป้ายบอกว่าเป็นรอบก่อน
  const editReady = !sources.some((s) => s.blocks === "edit" && s.empty);

  const [attachItems, setAttachItems] = useState([]);   // registration docs
  const [custItems, setCustItems] = useState([]);        // customer docs (shared)
  useEffect(() => { setAttachItems([]); setCustItems([]); }, [id]);

  // Completeness checklist comes from the server (single source of truth with the
  // submit-gate). Refetch whenever attachments change so it stays live as the user
  // uploads/removes docs. attachItems/custItems update via AttachmentsPanel.
  const [req, setReq] = useState(null);
  useEffect(() => {
    if (!s?.id) { setReq(null); return; }
    let alive = true;
    apiFetch(`/api/excise-registrations/${s.id}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReq(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [s?.id, attachItems, custItems]);
  const missingDocs = (req?.missing || []).map((m) => m.label);
  const warnings = req?.warnings || [];

  const patch = async (body, failMessage) => {
    const res = await apiFetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || failMessage);
    await reload();
  };
  const submitDraft = () => patch({ status: "pending_legal" }, "ยื่นไม่สำเร็จ");
  const resubmit = () => patch({ status: "pending_legal" }, "ส่งกลับไม่สำเร็จ");
  // ปลดอนุมัติ = สิทธิ์ฝ่าย RA + ต้องมีเหตุผล (มติ B2 2026-07-27) — ทะเบียนคือหลักฐาน
  // ที่ใบยื่นชำระภาษีอ้างถึง การปลดจึงต้องหนักเท่ากับด่านอื่นในระบบ ไม่ใช่กดผ่านเงียบ ๆ
  const revokeApproval = (reason) => patch({ status: "draft", reason }, "ไม่สามารถปลดอนุมัติได้");
  const rejectReg = (reason) => patch({ status: "rejected", rejectionReason: reason }, "ไม่สามารถทำรายการได้");
  const doDelete = async () => {
    const res = await apiFetch(`/api/excise-registrations/${s.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    router.push("/tax/registrations");
  };

  const back = { href: "/tax/registrations", label: "กลับไปหน้าทะเบียน" };

  // ⚠️ ต้องอยู่เหนือ "ไม่พบรายการ" — ดูเหตุผลที่ก้อน sources · `loading` ⇒ กดลองใหม่แล้วเนื้อเป็น skeleton ระหว่างรอ
  if (pageBlocked) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ทะเบียนสรรพสามิต" back={back} loading={loading}>
        {notice}
      </Workspace>
    );
  }
  // ถึงตรงนี้ได้ = server ตอบ 404 แล้วจริง (ไม่มีแถว/มองไม่เห็นตามสิทธิ์) — ไม่ใช่โหลดพัง
  if (!loading && !s) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ไม่พบรายการ" subtitle="ทะเบียนนี้อาจถูกลบไปแล้ว" back={back}>
        <div className="cell-quiet">ไม่พบทะเบียนที่ต้องการ</div>
      </Workspace>
    );
  }

  const headerRight = (
    <div className="flex items-center gap-2 flex-wrap">
      {s && <StatusBadge status={s.status} />}
    </div>
  );
  const status = s ? statusMeta(s.status) : statusMeta();
  const workflowIndex = s?.status === "approved" ? 2 : s?.status === "pending_legal" ? 1 : 0;
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "จัดเตรียมทะเบียน", hint: s?.status === "rejected" ? "แก้ไขตามเหตุผลที่ตีกลับ" : "แนบเอกสารให้ครบ" },
    { id: "review", label: "ฝ่าย RA ตรวจ", hint: "ตรวจข้อมูลและเอกสารประกอบ" },
    { id: "approved", label: "ขึ้นทะเบียนแล้ว", hint: "มีเลขที่อนุมัติพร้อมใช้งาน" },
  ], workflowIndex);

  // เหตุผลปลดอนุมัติรอบล่าสุด — เก็บใน metadata (ไม่ใช่ rejectionReason) และเดิม
  // **หน้าจอไม่แสดงเลย** ทั้งที่คนที่ต้องยื่นใหม่คือคนที่ต้องอ่านมันที่สุด
  const revoke = s?.metadata?.revokeApproval || null;
  const exempt = s?.isExciseTaxable === false;
  const rates = productTaxRates(taxProduct?.retailPriceIncVat, { taxable: !exempt });
  const perUnit = s ? taxPerUnit(s, taxProduct) : 0;

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={s?.fgCode || "..."}
      subtitle={s ? `${productDisplayName(s)} (${naText(brandLabel(s.metadata?.brandNameTh, s.metadata?.brandNameEn || s.brandName))})` : ""}
      headerRight={headerRight}
      back={back}
      // แก้ไข/ขอแก้ไข/ลบ = action ระดับ entity — ไอคอนแถวเดียวกับปุ่มย้อนกลับ ตามกติกา Page Header
      backActions={s ? (
        <>
          {canEdit && s.status !== "approved" && <ActionButton kind="edit" iconOnly title="แก้ไข" onClick={openForm} />}
          {/* ลบ: ยึด s.canDelete จาก server (อำนาจราย record — scope 'own' เทียบ
              user.id ที่ client ไม่มี) ไม่ใช่ products:edit ซึ่งกว้างกว่าจริง */}
          {s.canDelete && s.status === "draft" && <ActionButton kind="delete" iconOnly title="ลบ" onClick={() => setDeleteOpen(true)} />}
        </>
      ) : null}
      loading={loading && !s}
    >
      {notice}
      {s && (
        <DetailPageLayout
          asideLabel="สรุปและจัดการทะเบียนสรรพสามิต"
          aside={(
            <>
              <DocumentSummaryCard
                title="สรุปทะเบียน"
                total={exempt ? "ยกเว้นภาษี" : fmtMoney(perUnit)}
                rows={[
                  { id: "fg", label: "รหัสสินค้า", value: naText(s.fgCode) },
                  // ใบยุคก่อนแก้จุดเขียนมีสำเนาเป็น null (ลูกค้าที่มีแต่ชื่ออังกฤษ) — ถอยไปชื่อสด
                  // ไม่งั้นจอเดียวกันขัดกันเอง: หัวการ์ดเอกสารมีชื่อ แต่ช่อง "ลูกค้า" เป็นขีด
                  { id: "customer", label: "ลูกค้า", value: naText(s.customerName || customerLabel) },
                  { id: "approval", label: "เลขที่อนุมัติ", value: naText(s.approvalNumber) },
                  { id: "documents", label: "เอกสารบังคับ", value: req ? (req.ready ? "ครบ" : `ขาด ${missingDocs.length}`) : "กำลังตรวจ" },
                  // อายุงาน: ใบที่ค้างมานานต้องเห็นจากหน้าแรกของใบ ไม่ใช่ต้องไปเทียบวันที่เอง
                  { id: "age", label: "อยู่สถานะนี้มา", value: naText(ageLabel(ageDays)) },
                ]}
                status={status.label}
                statusColor={toneColor(status.tone)}
              />
              <DocumentControlCard
                status={status.label}
                statusColor={toneColor(status.tone)}
                statusDescription="การดำเนินการระดับทะเบียน"
                workflowSteps={workflowSteps}
                notices={req ? (
                  <DocumentReadinessList
                    items={req.ready
                      ? [{ id: "ready", label: "เอกสารที่จำเป็นครบแล้ว", ready: true }]
                      : (req.missing || []).map((item) => ({
                        id: `${item.entity}-${item.docType}`,
                        label: item.label,
                        detail: "ต้องแนบหรือเติมข้อมูลก่อนยื่น",
                        ready: false,
                      }))}
                  />
                ) : null}
                primaryAction={canApprove && s.status === "pending_legal"
                  ? { id: "approve", label: "อนุมัติขึ้นทะเบียน", kind: "approve", onClick: () => setApproveOpen(true) }
                  : canEdit && s.status === "draft"
                    ? {
                      id: "submit", label: "ยื่นขึ้นทะเบียน", kind: "submit", icon: Send,
                      onClick: () => submitDraft().catch((error) => notifyToast.error(error.message)),
                      disabled: !req?.ready,
                      disabledReason: !req?.ready ? `ต้องแนบ: ${missingDocs.join(", ")}` : undefined,
                    }
                    : canEdit && s.status === "rejected"
                      ? {
                        id: "resubmit", label: "ส่งกลับให้ตรวจ", kind: "submit", icon: Send,
                        onClick: () => resubmit().catch((error) => notifyToast.error(error.message)),
                      }
                      : null}
                secondaryActions={[
                  {
                    id: "revise", label: "ปลดอนุมัติ (กลับเป็นร่าง)", kind: "revise", icon: Undo2,
                    onClick: () => setReviseOpen(true),
                    visible: canApprove && s.status === "approved",
                  },
                ]}
                dangerActions={[
                  {
                    id: "reject", label: "ตีกลับให้แก้ไข", kind: "reject",
                    onClick: () => setRejectOpen(true),
                    visible: canApprove && s.status === "pending_legal",
                  },
                ]}
              />
              <RelatedDocumentCard
                title="ข้อมูลต้นทาง"
                meta="สินค้าและลูกค้าที่ใช้ขึ้นทะเบียน"
                actions={(
                  <div className={styles.sourceLinks}>
                    {s.productId ? <Button as={Link} href={`/database/products/${s.productId}`} variant="ghost" size="sm" icon={<ExternalLink size={13} />}>เปิดสินค้า</Button> : null}
                    {s.customerId ? <Button as={Link} href={`/database/customers/${s.customerId}`} variant="ghost" size="sm" icon={<ExternalLink size={13} />}>เปิดลูกค้า</Button> : null}
                    {s.project ? <Button as={Link} href={`/sa/projects/${s.project.id}`} variant="ghost" size="sm" icon={<ExternalLink size={13} />}>เปิดโครงการ</Button> : null}
                  </div>
                )}
              >
                ข้อมูลทะเบียนเชื่อมกับฐานข้อมูลกลางโดยไม่คัดลอกเอกสารลูกค้าซ้ำ
              </RelatedDocumentCard>
            </>
          )}
        >
          <div className="flex flex-col gap-5">

          {/* ── เหตุผลที่ต้องอ่านก่อนลงมือ — แสดงทุกสถานะที่เกี่ยวข้อง ไม่ใช่เฉพาะ draft ── */}
          {s.status === "rejected" && s.rejectionReason && (
            <StatusNotice tone="error" title="ฝ่าย RA ตีกลับ">{s.rejectionReason}</StatusNotice>
          )}
          {/* ⭐ เหตุผลปลดอนุมัติ — เดิมเก็บใน metadata แล้วไม่มีจอไหนแสดงเลย */}
          {revoke?.reason && s.status !== "approved" && (
            <StatusNotice
              tone="warning"
              title={`ปลดอนุมัติเมื่อ ${naText(fmtDateTime(revoke.at))}${revoke.byName ? ` โดย ${revoke.byName}` : ""}`}
            >
              {revoke.reason}
            </StatusNotice>
          )}

          <div className={`glass-panel ${styles.panel}`}>
            <div className={styles.fieldGrid}>
              <Field label="ลูกค้า" full>{s.customerName || customerLabel}</Field>
              <Field label="เลขผู้เสียภาษี">{s.taxId}</Field>
              <Field label="รหัสสาขา">{customer?.branchCode}</Field>
              <Field label="ผู้ยื่น">{s.assignee}</Field>
              <Field label="ทีมเจ้าของทะเบียน">{s.team}</Field>
              <Field label="โครงการ">{s.project ? `${naText(s.project.code)} · ${s.project.name || ""}`.trim() : null}</Field>
              <Field label="เลขที่อนุมัติ">{s.approvalNumber}</Field>
              <Field label="วันที่สร้าง">{fmtDate(s.createdAt)}</Field>
              <Field label={s.status === "approved" ? "วันที่อนุมัติ" : "อัปเดตล่าสุด"}>
                {fmtDate(s.status === "approved" ? s.approvedAt : s.updatedAt)}
              </Field>
              <Field label="ผู้อนุมัติ">{s.approvedByName}</Field>
              <Field label="อยู่สถานะนี้มา">
                {/* โทนมาจากข้อมูล (จำนวนวัน) จึงเป็น inline style โดยเจตนา */}
                <span style={ageTone(ageDays) === "neutral" ? undefined : { color: toneColor(ageTone(ageDays)) }}>
                  {naText(ageLabel(ageDays))}
                </span>
              </Field>
            </div>
          </div>

          {/* ── ฐานของภาษี: ที่มาของตัวเลข ────────────────────────────────────
              ⭐ ฝ่าย RA กดอนุมัติโดยเห็นแค่ "ภาษี/ชิ้น" ตัวเดียวมาตลอด — ไม่เห็นว่า
              คิดจากราคาไหน อัตราเท่าไร ⇒ ตรวจไม่ได้จริงว่าเลขถูกหรือเปล่า
              ⚠️ อัตรามาจาก **สินค้า** เสมอ ทะเบียนไม่เก็บสำเนา (mig 0180) ราคาขายปลีก
              ขยับเมื่อไร ตัวเลขตรงนี้ขยับตามทันที */}
          <DetailCard icon={Calculator} eyebrow="TAX BASE" title="ฐานคิดภาษีสรรพสามิต"
            meta={exempt ? "ทะเบียนนี้ได้รับยกเว้นภาษี" : `อัตรารวม ${pct(EXCISE_TOTAL_RATE)} ของราคาขายปลีกถอด VAT`}>
            {exempt ? (
              <div className={styles.exemptNote}>
                ฝ่าย RA กำหนดให้ทะเบียนนี้ <b className={styles.exemptWord}>ยกเว้นภาษี</b> — ภาษีต่อชิ้นเป็น 0 เพราะได้รับยกเว้นจริง ไม่ใช่เพราะข้อมูลขาด
              </div>
            ) : !taxProduct?.retailPriceIncVat ? (
              <StatusNotice
                tone="warning"
                action={s.productId
                  ? <Button as={Link} href={`/database/products/${s.productId}`} size="sm">เติมราคา</Button>
                  : null}
              >
                สินค้ายังไม่มีราคาขายปลีก — ภาษีจะคิดออกมาเป็น 0 ทั้งที่ต้องเสียภาษี
              </StatusNotice>
            ) : (
              <div className={styles.fieldGrid}>
                <Field label="ราคาขายปลีก (รวม VAT)">{fmtMoney(taxProduct.retailPriceIncVat)}</Field>
                <Field label={`ถอด VAT ${pct(EXCISE_VAT_RATE)}`}>{fmtMoney(rates.retailPriceExVat)}</Field>
                <Field label={`ภาษีสรรพสามิต ${pct(EXCISE_RATE)}`}>{fmtMoney(rates.exciseTax)}</Field>
                <Field label={`ภาษีท้องถิ่น ${pct(LOCAL_TAX_RATE_OF_EXCISE)} ของสรรพสามิต`}>{fmtMoney(rates.localTax)}</Field>
                <Field label="ภาษีต่อชิ้น (ยื่นจริง)" full>
                  <b className={styles.taxTotal}>{fmtMoney(perUnit)}</b>
                </Field>
              </div>
            )}
            {s.taxableOverride !== null && s.taxableOverride !== undefined && (
              <div className={styles.overrideNote}>
                ฝ่าย RA กำหนดเอง: {s.taxableOverride ? "ต้องเสียภาษี" : "ยกเว้นภาษี"} (ไม่ได้ใช้ค่าตามพิกัดอัตโนมัติ)
              </div>
            )}
          </DetailCard>

          {s.status === "draft" && req && (
            <div className="flex flex-col gap-2">
              <StatusNotice tone={missingDocs.length ? "warning" : "success"}>
                {missingDocs.length
                  ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                  : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่าย RA ตรวจ"}
              </StatusNotice>
              {warnings.length > 0 && (
                <StatusNotice tone="info">
                  ข้อมูลที่ควรเติม (ไม่บังคับ): {warnings.map((w) => w.message).join(", ")}
                </StatusNotice>
              )}
            </div>
          )}

          <div className={`glass-panel ${styles.panel}`}>
            <AttachmentsPanel
              entityType="registration"
              entityId={s.id}
              canEdit={(canEdit && s.status !== "approved") || canApprove}
              title="เอกสารการขึ้นทะเบียน"
              onItemsChange={setAttachItems}
              cardColumns={1}
            />
          </div>

          {/* Customer documents (incl. แผนที่บริษัท) — same shared customer record.
              The map is pulled from here; if missing, SA can attach it and it is
              saved to the customer (not duplicated on the registration). */}
          {s.customerId && (
            <div className={`glass-panel ${styles.panel}`}>
              <AttachmentsPanel
                entityType="customer"
                entityId={s.customerId}
                canEdit={canEdit}
                docTypes={customerDocTypes(customer?.customerType)}
                title={`เอกสารลูกค้า${customerLabel ? ` — ${customerLabel}` : ""} (ฐานข้อมูลเดียวกับหน้าลูกค้า)`}
                onItemsChange={setCustItems}
                cardColumns={1}
              />
            </div>
          )}

          {/* ⭐ ใบยื่นที่อ้างทะเบียนนี้ — คำตอบของ "ทะเบียนนี้ถูกใช้ไปแล้วหรือยัง"
              ซึ่งเป็นเหตุผลที่ลบไม่ได้ · เดิมหน้าจอไม่บอกเลย คนกดลบแล้วเจอ 409 เฉย ๆ */}
          <DetailCard icon={ReceiptText} eyebrow="USAGE" title="ใบยื่นชำระภาษีที่อ้างทะเบียนนี้"
            meta={s.filings?.length ? `${s.filings.length} ใบ` : "ยังไม่มีใบยื่นอ้างถึง — ลบทะเบียนได้ถ้ายังเป็นฉบับร่าง"}>
            {s.filings?.length ? (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th>เลขที่ใบเสนอราคา</th>
                      <th className={styles.numeric}>จำนวน</th>
                      <th className={styles.numeric}>ภาษีของทะเบียนนี้</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.filings.map((f) => (
                      /* ⭐ ทั้งแถวกดได้ผ่าน DetailRow ไม่ใช่ <tr onClick> ดิบ — onClick บน <tr> คือ
                         **ทางลัดของเมาส์** ทางเข้าจริงคือ <Link href={ตัวเดียวกัน}> ที่เลขที่ใบในเซลล์แรก
                         (ด่าน ROW_MIRROR บังคับให้ข้อความนิพจน์ href ตรงกันเป๊ะ) · ห้ามเติม
                         role/tabIndex บน <tr>/<td> แทน มันจะทับ role="row" ทิ้ง (WCAG 1.3.1) */
                      <DetailRow key={f.id} className="clickable-row" href={`/tax/filings/${f.id}`}>
                        {/* เลขที่ใบเป็น <Link> จริง = ทางเข้าของคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/เปิดแท็บใหม่
                            ไม่ต้อง stopPropagation: DetailRow ถาม isInteractiveTarget ก่อนเสมอ จึงไม่ยิง
                            router.push ซ้อนจนได้ history สองชั้น (Back ต้องกดสองครั้ง) */}
                        <td className="font-semibold">
                          <Link
                            href={`/tax/filings/${f.id}`}
                            className="linklike"
                            title="เปิดใบยื่นชำระภาษี"
                          >
                            {naText(f.quotationRef)}
                          </Link>
                        </td>
                        <td className={styles.numeric}>{fmtNumber(f.quantity)}</td>
                        <td className={styles.numeric}>{fmtMoney(f.totalTax)}</td>
                        <td><StatusBadge status={f.status} /></td>
                      </DetailRow>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : null}
          </DetailCard>

          {/* เธรดกลาง (mig 0163) — เธรดสองฝ่าย SA ↔ RA · `rejectionReason` ถูกล้าง
              เป็น null ตอนอนุมัติ และเหตุผลปลดอนุมัติไปอยู่ใน metadata ที่หน้าจอ
              ไม่แสดง → รอบก่อน ๆ หายหมด ทั้งที่คนแก้รอบถัดไปคือคนที่ต้องอ่านที่สุด */}
          <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title="ความเคลื่อนไหว">
            <UpdateThread
              entityType="excise_registration"
              entityId={s.id}
              order="desc"
              placeholder="พิมพ์ข้อความ เช่น แนบฉลากฉบับแก้ไขแล้ว..."
              emptyText="ยังไม่มีความเคลื่อนไหว"
            />
          </DetailCard>

          </div>
        </DetailPageLayout>
      )}

      <RegistrationFormModal
        open={formOpen && editReady}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        registration={s}
        products={products}
        customers={customers}
        registrations={allRegs}
      />
      {/* ฟอร์มยังเปิดไม่ได้ (สายที่มันกินยังมาไม่ครบ/ล้ม) — โมดัลหัวเดียวกับฟอร์ม วางป้ายแทนช่องเลือกที่ว่าง
          ⚠️ ป้ายตัวเดียวกับบนจอ (มีปุ่มลองใหม่) — ลองสำเร็จครบเมื่อไร `editReady` พลิก แล้วฟอร์มจริงเปิดแทนที่ตรงนี้เอง
          · `editAvailable` กันโมดัลค้างเมื่อปุ่มแก้ไขหายไประหว่างรอ (ใบถูกอนุมัติ) — สายรองเงียบแล้ว จะเหลือแต่ "กำลังโหลด…" ที่ไม่จริง */}
      <Modal
        open={formOpen && editAvailable && !editReady}
        onClose={() => setFormOpen(false)}
        title="แก้ไขการขึ้นทะเบียน"
        footer={<Button onClick={() => setFormOpen(false)}>ปิด</Button>}
      >
        {editBlocked.length ? notice : <p className="muted">กำลังโหลดข้อมูลที่ฟอร์มแก้ไขต้องใช้ (รายชื่อลูกค้า · รายการสินค้า · ทะเบียนที่มีอยู่)…</p>}
      </Modal>
      <ApproveDialog open={approveOpen} onClose={() => setApproveOpen(false)} onDone={reload} registration={s} product={taxProduct} />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={rejectReg} title="ตีกลับการขึ้นทะเบียน" entityLabel="ทะเบียนนี้" />
      <RejectDialog
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        onConfirm={revokeApproval}
        title="ปลดอนุมัติทะเบียนที่อนุมัติแล้ว"
        reasonLabel={`เหตุผลที่ปลดอนุมัติทะเบียน ${s?.fgCode || "นี้"} (กลับเป็นร่าง ต้องยื่นขออนุมัติใหม่)`}
        placeholder="เช่น ข้อมูลบนฉลากเปลี่ยน / กรมสรรพสามิตให้แก้ไข..."
        confirmLabel="ยืนยันปลดอนุมัติ"
      />
      <ConfirmDialog
        closeOnSuccess
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
        title="ลบรายการขึ้นทะเบียน"
        message={`ยืนยันการลบทะเบียนของ ${s?.fgCode || "รายการนี้"}? การลบนี้ย้อนกลับไม่ได้`}
        confirmLabel="ลบรายการ"
        danger
      />
    </Workspace>
  );
}
