"use client";

/* หน้าสร้างใบสั่งขาย (เต็มหน้า — มติผู้ใช้ 2026-08-24)
 *
 * ⭐ ที่มา: ขั้น "ใส่คอนเฟิร์ม" ย้ายออกจากการปิด Won มาอยู่ตรงนี้ เพราะเอกสารยืนยัน
 * คำสั่งซื้อถูกใช้จริงที่ใบสั่งขาย (เลขที่ → เอกสารอ้างอิง · สลิป → หลักฐานงวดแรก)
 *
 * ⚠️ **ไม่มีใบเกิดจนกว่าจะกดสร้าง** — เลขที่ใบมาจากเคาน์เตอร์ที่ใช้ซ้ำไม่ได้ (0241)
 * ⇒ ฟอร์มถือทุกอย่างไว้ในเครื่องแล้วยิงคำขอเดียว · ไฟล์อัปก่อนได้เพราะพักไว้ใต้
 * ใบเสนอราคาต้นทาง (`sales_order_confirmation` ใน privateEvidence)
 *
 * ⚠️ ปุ่มระดับใบอยู่ใน **การ์ดจัดการเอกสาร** บนรางขวา เหมือนทุกเอกสารในระบบ
 * ไม่ใช่แถบปุ่มท้ายฟอร์ม (ผู้ใช้ 2026-08-24: "เป็นภาษาเดียวกันทั้งระบบ")
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, CalendarClock, CalendarX, ClipboardList, ExternalLink, FileCheck2, FileText, FolderKanban, Handshake, MapPin, Package, Wallet,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import SalesOrderConfirmationFields from "@/components/salesPlanning/SalesOrderConfirmationFields";
import SalesOrderDeliveryDueField from "@/components/salesPlanning/SalesOrderDeliveryDueField";
import BillingRoundPicker from "@/components/salesPlanning/BillingRoundPicker";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { branchLabel } from "@/lib/master/thaiAddress";
import { customerHeadline } from "@/lib/master/customerAr";
import { previewInstallments } from "@/lib/sales/salesOrderPayments";
import { billingRuleMonthly, billingRuleNoCredit, describeBillingRule } from "@/lib/sales/billingRule";
import { EMPTY_PICKER_VALUE, pickerRuleOf } from "@/lib/sales/billingPicker";
import {
  createFormBillingBlocker, createFormDateCheck, createFormInstallmentItems, createFormTermsState, createFormVisibleValues,
} from "@/lib/sales/salesOrderCreateInstallments";
import { validateOrderConfirmation, MAX_CONFIRM_ATTACHMENTS } from "@/lib/sales/orderConfirmationDocs";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { describeResponseError } from "@/lib/fetchError";
import { httpLoadFailure, thrownLoadFailure } from "@/lib/ui/loadFailure";
import { RESPONSE_WARNING_TOAST, responseWarningText } from "@/lib/apiWarnings";
import { notifyToast } from "@/lib/feedback";
import AccessDenied from "@/components/ui/AccessDenied";
import styles from "./page.module.css";
import { apiFetch, apiJson } from "@/lib/apiFetch";

const EMPTY_CONFIRMATION = { docType: "", docNo: "", docDate: "", attachments: [] };

/* ใบเสนอราคาต้นทาง + รอบวางบิลของลูกค้าในคำขอเดียว (`include=billingTerms` · ดู GET ใบเสนอราคา)
   ⚠️ ใช้ทั้งตอนโหลดหน้าและตอนโหลดรอบใหม่ — ทางเดียว สองจังหวะอ่านค่าชุดเดียวกันเสมอ */
const quoteUrl = (quotationId) => `/api/sales-planning/quotations/${encodeURIComponent(quotationId)}?include=billingTerms`;

function NewSalesOrderInner() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useCan("salesplan:edit");
  const quotationId = params.get("quotationId") || "";
  // กลับไปที่เดิมเมื่อยกเลิก (แพตเทิร์นเดียวกับ /sa/quotations/new) — ค่าที่ไม่ใช่
  // เส้นทางภายในถูกทิ้ง เพราะ open redirect จากโดเมนตัวเองเคยหลุดมาแล้ว
  const backRaw = params.get("returnTo");
  const returnTo = backRaw && backRaw.startsWith("/") && !backRaw.startsWith("//")
    ? backRaw
    : (quotationId ? `/sa/quotations/${quotationId}` : "/sa/sales-orders");

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const [referenceDoc, setReferenceDoc] = useState("");
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [notes, setNotes] = useState("");
  // กำหนดส่งสินค้า (0363) — ไม่บังคับ · ว่าง = ยังไม่ตกลงวันส่ง
  const [deliveryDueDate, setDeliveryDueDate] = useState("");
  const [confirmation, setConfirmation] = useState(EMPTY_CONFIRMATION);
  const [confirmFiles, setConfirmFiles] = useState([]);
  /* วันของงวด `{ [seq]: ค่าตัวเลือกรอบวางบิล }` (รูปของ lib/sales/billingPicker.js) — ลูกค้าที่ยังไม่ตั้งรอบ
     ใช้รูปเดียวกัน (mode null + dueDate จากช่องกำหนดชำระเดิม) ⇒ รอบโหลดมาทีหลังวันที่พิมพ์ไว้ก็ไม่หาย
     ⚠️ ไม่มีค่าตั้งต้น — ทุกงวดเริ่มที่ยังไม่เลือก (มติ 26/09: ไม่บังคับ บางที่ไม่มีรอบวาง) */
  const [billing, setBilling] = useState({});
  /* รอบวางบิล + เงื่อนไขเครดิตของลูกค้า (mig 0389) — มากับใบเสนอราคา (createFormTermsState)
     `null` = ใบไม่ผูกลูกค้า · `{ status: 'ready', supported, rule, … }` · `{ status: 'error', detail }` */
  const [terms, setTerms] = useState(null);
  const [termsRefreshing, setTermsRefreshing] = useState(false);
  const [firstPaid, setFirstPaid] = useState(false);
  const [firstPaidOn, setFirstPaidOn] = useState("");
  const [firstFiles, setFirstFiles] = useState([]);

  useEffect(() => {
    if (!quotationId) { setLoading(false); setError("ไม่ได้ระบุใบเสนอราคาต้นทาง"); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(quoteUrl(quotationId), { cache: "no-store" });
        if (!res.ok) throw new Error(await describeResponseError(res, "โหลดใบเสนอราคาไม่สำเร็จ"));
        const data = await res.json();
        if (!alive) return;
        setQuote(data);
        setTerms(createFormTermsState(data?.billingTerms));
        setNotes(data?.notes || "");
      } catch (e) {
        if (alive) setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [quotationId]);

  /* ── รอบวางบิลของลูกค้า (ม็อก billing-cycle จอ B) ─────────────────────────────
     มากับใบเสนอราคาในคำขอแรก ⇒ ตารางงวดขึ้นเป็นรูปสุดท้ายตั้งแต่เฟรมแรก (เดิมอ่านทะเบียนลูกค้าทั้งก้อนแยกอีกคำขอ
     ตารางโชว์ช่องกำหนดชำระก่อนแล้วค่อยสลับเป็นตัวเลือกรอบ · วันที่พิมพ์ไว้ระหว่างนั้นกลายเป็นป้าย "ที่บันทึกอยู่" — review S4 26/09)
     ⚠️ โหลดไม่ขึ้น = **ไม่บล็อกหน้า** — ตารางกลับเป็นช่องกำหนดชำระแบบเดิม + บอกเหตุพร้อมปุ่มลองใหม่
     ⚠️ ฐานที่ยังไม่รัน 0389 = `supported: false` = หน้าเหมือนเดิมทุกอย่าง ไม่ขึ้นแถบชวน "ไปตั้งรอบ" ที่ทะเบียนยังรับไม่ได้
     โหลดรอบใหม่ (ปุ่มลองใหม่ · กลับมาจากแท็บทะเบียนลูกค้า) = ตัวจัดการเหตุการณ์ ไม่ใช่ effect — ไม่มี setState ใน effect
     ⚠️ โหลดใหม่ล้มขณะที่มีรอบอยู่แล้ว = คงรอบเดิม — สลับไปแถบ error จะพับตัวเลือกรอบที่เลือกไว้ทั้งตาราง
        (ยังไม่มีรอบ/ล้มอยู่แล้ว = ขึ้นแถบ error ได้ ตารางหน้าตาเดิม: ช่องกำหนดชำระ) */
  const termsBusy = useRef(false);
  const refreshTerms = useCallback(async () => {
    if (!quotationId || termsBusy.current) return;
    termsBusy.current = true;
    setTermsRefreshing(true);
    try {
      const data = await apiJson(quoteUrl(quotationId), {
        cache: "no-store", fallbackError: "โหลดรอบวางบิลของลูกค้าไม่สำเร็จ",
      });
      setTerms(createFormTermsState(data?.billingTerms));
    } catch (e) {
      const failure = e?.status ? httpLoadFailure(e.status, e.data?.error) : thrownLoadFailure(e);
      setTerms((prev) => (prev?.status === "ready" && prev.supported && prev.rule
        ? prev
        : { status: "error", detail: failure.detail }));
    } finally {
      termsBusy.current = false;
      setTermsRefreshing(false);
    }
  }, [quotationId]);

  /* ปุ่มทะเบียนลูกค้าเปิด **แท็บใหม่** — ฟอร์มนี้ไม่มีร่างและไม่มีตัวกันออกจากหน้า กดแล้วเปลี่ยนหน้าในแท็บเดิม
     = เอกสารยืนยัน · ไฟล์ที่เลือก · วันที่ที่กรอก หายหมด (review S4 26/09)
     ⇒ กลับมาที่แท็บนี้ (focus / visibilitychange) หลังเคยกดปุ่มนั้น = โหลดรอบใหม่ ให้รอบที่เพิ่งตั้งเปิดตัวเลือกได้ทันที
     ไม่ต้องเริ่มฟอร์มใหม่ · สองเหตุการณ์มาพร้อมกันตอนสลับแท็บ — `termsBusy` กันยิงซ้ำ
     ⚠️ โหลดใหม่ = GET ใบเสนอราคาทั้งใบ (ทางเดียวกับตอนเปิดหน้า) — ยิงเฉพาะตอนกดลองใหม่/กลับจากแท็บทะเบียน ไม่ใช่ทุกครั้งที่สลับแท็บ
     คลิกกลาง/Ctrl-คลิก (เปิดแท็บเองโดยไม่ผ่าน onClick) นับด้วย — `onAuxClick` */
  const registryOpened = useRef(false);
  const markRegistryOpened = () => { registryOpened.current = true; };
  useEffect(() => {
    if (creating) return undefined;
    const onReturn = () => {
      if (!registryOpened.current || document.visibilityState !== "visible") return;
      refreshTerms();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [creating, refreshTerms]);
  /* มีรอบ (มีเครดิต) = แต่ละงวดได้ตัวเลือกรอบ · ไม่มี/โหลดไม่ขึ้น = ช่องกำหนดชำระแบบเดิม
     ⭐ ไม่มีเครดิต (มติเจ้าของ 26/09 ข้อ 2) = ทำเหมือนไม่มีรอบทุกอย่าง (`pickerRuleOf` คืน null — ตัวเดียวกับตัวเลือกรอบ/แผงงวด)
       แต่แถบเหนือตารางบอกว่า "ไม่มีเครดิต" ไม่ใช่ "ยังไม่ตั้ง" (ตั้งแล้ว — ไม่ชวนไปตั้งซ้ำ)
     ⚠️ ห้ามอ่าน `rule.billing.day` / `.payment.day` ตรง ๆ (รอบรุ่นสอง mig 0390) — ถามตัวช่วยของ billingRule.js */
  const customerRule = terms?.status === "ready" && terms.supported ? terms.rule : null;
  const rule = pickerRuleOf(customerRule);
  const noCredit = billingRuleNoCredit(customerRule);

  /* เลขที่เอกสารยืนยันเป็นค่าตั้งต้นของ "เอกสารอ้างอิง" (กติกาเดิมของ 0246 ที่เคยไหล
     มาจากตอนปิด Won) — หยุดตามทันทีที่ผู้ใช้พิมพ์ทับ ไม่ใช่ทับของที่เขาแก้ไว้ */
  useEffect(() => {
    if (referenceTouched) return;
    setReferenceDoc(confirmation.docNo || "");
  }, [confirmation.docNo, referenceTouched]);

  const lines = useMemo(
    () => [...(quote?.lines || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [quote],
  );
  const totals = useMemo(() => ({
    subtotal: Number(quote?.subtotal || 0),
    discountAmount: Number(quote?.discountAmount || 0),
    vatAmount: Number(quote?.vatAmount || 0),
    totalAmount: Number(quote?.totalAmount || 0),
  }), [quote]);
  const plannedInstallments = useMemo(
    () => previewInstallments(quote?.paymentPlan, totals.totalAmount),
    [quote?.paymentPlan, totals.totalAmount],
  );

  const confirmationCheck = useMemo(
    () => validateOrderConfirmation({
      ...confirmation,
      // ไฟล์ยังไม่ได้อัป — ใส่ตัวแทนไว้ให้ตัวตรวจนับจำนวนได้ (อัปจริงตอนกดสร้าง)
      attachments: confirmFiles.map((f) => ({ fileUrl: "pending", fileName: f.name })),
    }),
    [confirmation, confirmFiles],
  );
  const paymentError = firstPaid && !firstPaidOn
    ? "ระบุวันที่ลูกค้าจ่ายงวดแรก"
    : firstPaid && !firstFiles.length
      ? "แนบหลักฐานการชำระงวดแรกอย่างน้อย 1 ไฟล์"
      : "";
  /* ค่าที่ส่ง/ที่ด่านตรวจ = ค่าตามที่ตาเห็น — รอบถูกล้าง/โหลดไม่ขึ้น ตารางเหลือแค่กำหนดชำระ
     ⇒ วันวางบิล/เหตุการณ์ที่ค้างใน state ต้องไม่ถูกส่งและไม่ถูกกัน (ไม่งั้นปุ่มติดด่านที่ไม่มีช่องให้แก้) */
  const billingValues = useMemo(() => createFormVisibleValues(billing, { withRule: Boolean(rule) }), [billing, rule]);
  /* ⚠️ ไม่ใช่ด่านบังคับเลือกรอบ (มติ 26/09 ข้อ 2) — กันเฉพาะงวดที่เริ่มเลือกแล้วยังไม่ครบ
     ("วันอื่น…" ที่ยังไม่ใส่วัน · รอเหตุการณ์ที่ยังไม่มีชื่อ) ไม่งั้นงวดนั้นหลุดเป็น "ยังไม่กำหนด" เงียบ ๆ */
  const billingBlocker = createFormBillingBlocker(plannedInstallments, billingValues);
  /* วันที่ผิด (ปีพิมพ์พลาด · วันที่ไม่มีจริง) กันตั้งแต่บนจอด้วยตัวตรวจเดียวกับ POST — เดิมรู้ตัวหลังอัปไฟล์เสร็จแล้วได้ 400 */
  const dateCheck = useMemo(() => createFormDateCheck(plannedInstallments, billingValues), [plannedInstallments, billingValues]);
  const blockedReason = !confirmationCheck.ok
    ? confirmationCheck.error
    : (paymentError || billingBlocker || dateCheck.error);

  const uploadOne = useCallback(async (file) => {
    // ไบต์ขึ้น bucket ส่วนตัวตรงจากเบราว์เซอร์ด้วย signed URL — ไม่ผ่าน function
    // จึงไม่ติดเพดาน request body 4.5 MB ของโฮสติ้ง
    const ref = await uploadFileBytes({
      file, entityType: "sales_order_confirmation", entityId: quotationId,
    });
    return {
      fileUrl: ref.url || null,
      driveFileId: ref.driveFileId || null,
      storageBucket: ref.storageBucket || null,
      storagePath: ref.storagePath || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }, [quotationId]);

  const create = useCallback(async () => {
    if (blockedReason) { setError(blockedReason); return; }
    setCreating(true);
    setError("");
    const uploaded = [];
    try {
      const confirmAttachments = [];
      for (const file of confirmFiles) { const ref = await uploadOne(file); uploaded.push(ref); confirmAttachments.push(ref); }
      const firstEvidence = [];
      for (const file of firstFiles) { const ref = await uploadOne(file); uploaded.push(ref); firstEvidence.push(ref); }

      const res = await apiFetch("/api/sales-planning/sales-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotationId,
          referenceDoc: referenceDoc.trim() || null,
          notes,
          deliveryDueDate,
          confirmation: confirmation.docType
            ? { ...confirmation, attachments: confirmAttachments }
            : null,
          // กำหนดชำระ + วันวางบิล/รอเหตุการณ์ รายงวด — เฉพาะงวดที่มีค่า (ไม่เลือก = ไม่ส่ง)
          installments: createFormInstallmentItems(plannedInstallments, billingValues),
          firstPayment: firstPaid ? { paidOn: firstPaidOn, evidence: firstEvidence } : null,
        }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "สร้างใบสั่งขายไม่สำเร็จ"));
      const data = await res.json();
      /* ใบออกแล้วแต่ตั้งงวดตามที่กรอกไม่สำเร็จ (201 + `warning`) — ทักผ่านถาดกลางซึ่งอยู่ที่ layout
         ⇒ ไม่หายตอน router.push · 🐞 เดิมหน้านี้ไม่อ่านคีย์นี้ = วันที่กรอกหายเงียบ (lib/apiWarnings.js) */
      const warning = responseWarningText(data);
      if (warning) notifyToast.warning(warning, RESPONSE_WARNING_TOAST);
      router.push(`/sa/sales-orders/${data.id}`);
    } catch (e) {
      // ⚠️ ล้มแล้วต้องเก็บกวาดไฟล์ที่อัปไปแล้ว ไม่งั้นไฟล์ลอยค้างใน bucket โดยไม่มีใบไหนอ้าง
      await Promise.allSettled(uploaded.map((att) => apiFetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...att, entityType: "sales_order_confirmation", entityId: quotationId }),
      })));
      setError(e.message || "สร้างใบสั่งขายไม่สำเร็จ");
      setCreating(false);
    }
  }, [blockedReason, confirmFiles, firstFiles, uploadOne, quotationId, referenceDoc, notes, deliveryDueDate, confirmation, plannedInstallments, billingValues, firstPaid, firstPaidOn, router]);

  if (!canEdit) return <AccessDenied title="สร้างใบสั่งขาย" message="ไม่มีสิทธิ์สร้างใบสั่งขาย" />;

  if (loading) {
    return (
      <Workspace icon={<ClipboardList size={22} />} title="สร้างใบสั่งขาย" back={{ href: returnTo, label: "กลับ" }}>
        <SkeletonRows rows={6} />
      </Workspace>
    );
  }

  if (!quote) {
    return (
      <Workspace icon={<ClipboardList size={22} />} title="สร้างใบสั่งขาย" back={{ href: returnTo, label: "กลับ" }}>
        <AlertBanner tone="danger">{error || "ไม่พบใบเสนอราคาต้นทาง"}</AlertBanner>
      </Workspace>
    );
  }

  const deal = quote.deal || null;
  const project = deal?.project || null;
  const todayIso = businessDate();
  const customerHref = quote.customerId ? `/database/customers/${quote.customerId}` : "";

  /* แถบเหนือตารางงวด: รอบของลูกค้า / ไม่มีเครดิต + หมายเหตุการวางบิล + ทางไปทะเบียนลูกค้า
     · ยังไม่ตั้ง = บอกทางไปตั้ง ตารางคงช่องกำหนดชำระแบบเดิม + **ข้อความเครดิตเดิม** (ช่องอิสระที่ถอดจากฟอร์มลูกค้าแล้ว ·
       มติ 26/09: เก็บไว้อ่านอย่างเดียว) — ตั้งแล้ว (รวมไม่มีเครดิต) ไม่โชว์ข้อความเดิม: mig 0390 แปลงไปเป็นรอบแล้ว สองแหล่งขัดกันได้
     · โหลดไม่ขึ้น = บอกเหตุ + ลองใหม่
       (ไทยนำ + ข้อความดิบเป็นบรรทัดเล็ก — มติ 23/09 · StatusNotice `detail`)
     · ฐานยังไม่รัน 0389 / ใบไม่ผูกลูกค้า = ไม่มีแถบ (หน้าเหมือนเดิม)
     ลิงก์ชี้การ์ด `#billing-rule` บนหน้าลูกค้า (CustomerBillingRuleCard) — เปิดแท็บใหม่ ดูเหตุผลที่ `registryOpened` */
  let termsNotice = null;
  if (terms?.status === "error") {
    termsNotice = (
      <StatusNotice
        tone="warning"
        role="note"
        className={styles.termsNotice}
        detail={terms.detail || undefined}
        action={(
          <Button size="sm" tone="neutral" disabled={termsRefreshing} onClick={refreshTerms}>
            {termsRefreshing ? "กำลังโหลด…" : "ลองใหม่"}
          </Button>
        )}
      >
        โหลดรอบวางบิลของลูกค้าไม่สำเร็จ — กรอกกำหนดชำระเองได้ตามเดิม
      </StatusNotice>
    );
  } else if (terms?.status === "ready" && terms.supported) {
    const ruleNote = String(customerRule?.note || "").trim();
    const ruleSet = Boolean(rule) || noCredit;
    termsNotice = (
      <StatusNotice
        tone={rule ? "info" : "neutral"}
        role="note"
        icon={ruleSet ? CalendarClock : CalendarX}
        className={styles.termsNotice}
        action={customerHref ? (
          <Button
            as={Link}
            href={`${customerHref}#billing-rule`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markRegistryOpened}
            onAuxClick={markRegistryOpened}
            size="sm"
            tone="neutral"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            aria-label={`${ruleSet ? "ดูที่ทะเบียนลูกค้า" : "เปิดทะเบียนลูกค้า"} (เปิดแท็บใหม่)`}
          >
            {ruleSet ? "ดูที่ทะเบียนลูกค้า" : "เปิดทะเบียนลูกค้า"}
          </Button>
        ) : null}
      >
        <span className={styles.termsLine}>
          {rule
            ? <>รอบวางบิลของลูกค้า: <b>{describeBillingRule(rule)}</b></>
            : noCredit
              ? <>เครดิตของลูกค้า: <b>{describeBillingRule(customerRule)}</b> — กรอกกำหนดชำระเองรายงวด</>
              : "ลูกค้ายังไม่ตั้งเครดิตและรอบวางบิล — ตั้งได้ที่ทะเบียนลูกค้า"}
        </span>
        {ruleNote ? (
          <span className={styles.termsSub}>
            <span className={styles.termsLabel}>หมายเหตุการวางบิล</span> {ruleNote}
          </span>
        ) : null}
        {!ruleSet && terms.creditTerms ? (
          <span className={styles.termsSub}>
            <span className={styles.termsLabel}>ข้อความเครดิตเดิม</span> {terms.creditTerms}
          </span>
        ) : null}
      </StatusNotice>
    );
  }

  const rightRail = (
    <>
      <DocumentSummaryCard
        title="ยอดสุทธิ ใบสั่งขาย"
        total={fmtMoney(totals.totalAmount)}
        rows={[
          { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(totals.subtotal) },
          { id: "discount", label: "ส่วนลด", value: totals.discountAmount > 0 ? `-${fmtMoney(totals.discountAmount)}` : NA },
          { id: "vat", label: "VAT", value: fmtMoney(totals.vatAmount) },
          { id: "actual", label: "Actual ก่อน VAT", value: "ยังไม่นับ" },
        ]}
      />
      <DocumentControlCard
        eyebrow="SALES ORDER CONTROL"
        title="จัดการเอกสาร"
        status="ยังไม่ออกใบ"
        statusColor="var(--text-3)"
        statusDescription="ตรวจข้อมูลและยืนยันคำสั่งซื้อ ก่อนออกเลขที่ใบ"
        workflowSteps={[
          { id: "create", label: "สร้างใบสั่งขาย", hint: "คุณอยู่ตรงนี้ — เลขที่ใบออกตอนกดสร้าง", state: "current" },
          // ชื่อเจ้าของดีลติดมาตั้งแต่ราง — AC ที่ออกใบแทนจะได้รู้ตั้งแต่ก่อนกดสร้างว่าต้องส่งต่อให้ใคร
          { id: "submit", label: "ยื่นอนุมัติ", hint: `ต้องมีเอกสารยืนยันคำสั่งซื้อ · ยื่นได้เฉพาะ AE เจ้าของดีล${deal?.ownerName ? ` (${deal.ownerName})` : ""}` },
          { id: "approve", label: "อนุมัติใบ", hint: "Actual เข้าเดือนที่อนุมัติ · งวดถูกล็อกยอด" },
          { id: "payment", label: "บัญชีรับรองการชำระ", hint: "ทีละงวดตามหลักฐานที่แนบ" },
          // ⭐ ขั้นสุดท้ายจริง ๆ (มติ 2026-08-30) — บัญชีปิดใบได้เมื่อเก็บครบทุกงวด
          { id: "close", label: "บัญชีปิดใบ", hint: "กดได้เมื่อรับรองครบทุกงวดแล้ว" },
        ]}
        notices={confirmation.docType
          ? null
          : (
            <span className={`ui-badge ${styles.hintBadge}`}>
              ยังไม่กรอกเอกสารยืนยัน — สร้างใบร่างได้ แต่ยื่นอนุมัติไม่ได้จนกว่าจะมี
            </span>
          )}
        primaryAction={{
          id: "create",
          kind: "save",
          label: creating ? "กำลังสร้าง…" : "สร้างใบสั่งขาย",
          disabled: !!blockedReason,
          disabledReason: blockedReason || undefined,
          onClick: create,
        }}
        dangerActions={[{ id: "cancel", kind: "cancel", label: "ยกเลิกการสร้าง", href: returnTo }]}
        busy={creating}
        footer="เลขที่ใบออกตอนกดสร้าง และใช้ซ้ำไม่ได้ — ใบจะยังไม่ถูกบันทึกจนกว่าจะกด"
      />
    </>
  );

  return (
    <Workspace
      icon={<ClipboardList size={22} />}
      title="สร้างใบสั่งขาย"
      subtitle={`จากใบเสนอราคา ${naText(quote.quoteNumber)} ที่ปิด Won แล้ว — ตรวจข้อมูล ยืนยันคำสั่งซื้อ และตั้งงวดชำระ ก่อนออกใบ`}
      back={{ href: returnTo, label: `กลับไปใบเสนอราคา ${naText(quote.quoteNumber)}` }}
    >
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}

      <ContextGrid>
        {/* 🐞 `quote.customer` ไม่เคยมีใครเติม (quoteSelect มีแค่ดีล) ⇒ รหัส AR หายจากหัวการ์ดมาตลอด ·
            แถวลูกค้าที่โหลดมาเพื่อรอบวางบิลมีรหัสอยู่แล้ว ใช้ต่อได้ (ทะเบียนสด เหมือนหน้าใบสั่งขาย) */}
        <ContextCard
          icon={Building2}
          href={customerHref || undefined}
          eyebrow="ลูกค้า"
          title={naText(customerHeadline(quote.customerName, quote.customer?.arCode || terms?.arCode))}
          subtitle="ข้อมูลลูกค้าของเอกสาร"
          facts={[{ label: "ผู้ติดต่อ", value: naText(quote.contactName) }]}
        />
        <ContextCard
          icon={FolderKanban}
          href={deal?.projectId ? `/sa/projects/${deal.projectId}` : undefined}
          eyebrow="โครงการ"
          title={project?.name || naText(project?.code)}
          subtitle={project?.code || "โครงการที่ผูกกับดีล"}
          facts={[{ label: "การเชื่อมโยง", value: deal?.projectId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม" }]}
        />
        <ContextCard
          icon={Handshake}
          href={deal?.id ? `/sa/deals/${deal.id}` : undefined}
          eyebrow="ดีล"
          title={naText(deal?.title)}
          subtitle={`${naText(deal?.team)} · ${naText(deal?.ownerName)}`}
          facts={[{ label: "สถานะ", value: deal?.stage === "won" ? "Won" : naText(deal?.stage) }]}
        />
        <ContextCard
          icon={FileText}
          href={`/sa/quotations/${quote.id}`}
          eyebrow="ใบเสนอราคา Won"
          title={naText(quote.quoteNumber)}
          subtitle={quote.acceptedAt ? `ปิด Won ${fmtDate(quote.acceptedAt)}` : "ปิด Won แล้ว"}
          facts={[{ label: "แผนชำระ", value: `${plannedInstallments.length || 1} งวด` }]}
        />
      </ContextGrid>

      <DetailPageLayout asideLabel="สรุปและจัดการ ใบสั่งขาย" aside={rightRail}>
        <DetailCard
          icon={Package}
          eyebrow="ORDER LINES"
          title="รายการสินค้าและบริการ"
          meta={`${lines.length} รายการ · คัดลอกจาก ${naText(quote.quoteNumber)} ตอนสร้าง แก้ที่นี่ไม่ได้`}
        >
          <QuotationReadOnlyLineItems
            lines={lines}
            summaryRows={[
              { id: "subtotal", label: "ยอดก่อนส่วนลด", value: fmtMoney(totals.subtotal) },
              ...(totals.discountAmount > 0 ? [{ id: "discount", label: "ส่วนลด", value: `-${fmtMoney(totals.discountAmount)}` }] : []),
              { id: "vat", label: "VAT", value: fmtMoney(totals.vatAmount) },
            ]}
            grandTotal={fmtMoney(totals.totalAmount)}
          />
        </DetailCard>

        {/* ⭐ ก้อนที่ย้ายมาจากการปิด Won — อยู่เหนือ "ข้อมูลบนเอกสาร" เพราะชนิดเอกสาร
            เปลี่ยนความหมายของช่องอื่น (เลขที่บังคับ/ไม่บังคับ) และเป็นค่าตั้งต้นของ
            เอกสารอ้างอิง (กฎฟอร์ม §ลำดับคำถาม ข้อ 1) */}
        <DetailCard
          icon={FileCheck2}
          eyebrow="ORDER CONFIRMATION"
          title="ยืนยันคำสั่งซื้อ"
          meta="ลูกค้ายืนยันด้วยเอกสารอะไร — ใบสั่งขายเก็บไว้เป็นหลักฐานของใบนี้"
        >
          <SalesOrderConfirmationFields
            value={confirmation}
            onChange={setConfirmation}
            files={confirmFiles}
            onFilesChange={setConfirmFiles}
            onOversize={setError}
            disabled={creating}
          />
        </DetailCard>

        <DetailCard
          icon={MapPin}
          eyebrow="ON THIS DOCUMENT"
          title="ข้อมูลบนเอกสาร"
          meta={`ที่อยู่และผู้ติดต่อยึดตามใบเสนอราคา ${naText(quote.quoteNumber)}`}
        >
          <div className={styles.docGrid}>
            <div>
              <dl className={styles.addressList}>
                <div>
                  <dt className="toolbar-label">ที่อยู่ออกบิล{quote.branchCode ? ` · ${branchLabel(quote.branchCode)}` : ""}</dt>
                  <dd>{naText(quote.billingAddress)}</dd>
                </div>
                <div>
                  <dt className="toolbar-label">ที่อยู่จัดส่ง</dt>
                  <dd>{quote.shippingAddress || naText(quote.billingAddress)}</dd>
                </div>
                <div>
                  <dt className="toolbar-label">ผู้ติดต่อ</dt>
                  <dd>{naText([quote.contactName, quote.contactPhone].filter(Boolean).join(" · "))}</dd>
                </div>
              </dl>
              <p className="form-note">แก้ที่นี่ไม่ได้ — ต้องแก้ที่ใบเสนอราคา (ใบที่อนุมัติแล้วต้องออก Rev.)</p>
            </div>
            <div className={styles.formStack}>
              <div>
                <span className="toolbar-label">วันที่ใบสั่งขาย</span>
                {/* มติ 2026-08-18: วันที่ SO = วันที่สร้างใบ แก้ไม่ได้ · กำหนดชำระอยู่ที่งวด */}
                <div className="readable-field is-compact">{fmtDate(businessDate())} <span className="readable-field-empty">— วันที่กดสร้าง แก้ไม่ได้</span></div>
              </div>
              <label>
                <span>เอกสารอ้างอิง</span>
                <Input
                  value={referenceDoc} maxLength={200} disabled={creating}
                  placeholder="เช่น PO-2569-00123 · สัญญาเลขที่ ABC/2569"
                  onChange={(event) => { setReferenceTouched(true); setReferenceDoc(event.target.value); }}
                />
                <p className="form-note">เติมให้อัตโนมัติจากเลขที่เอกสารยืนยันด้านบน · แก้ทับได้</p>
              </label>
              <SalesOrderDeliveryDueField
                value={deliveryDueDate}
                onChange={setDeliveryDueDate}
                disabled={creating}
              />
              <label>
                <span>หมายเหตุบนเอกสาร</span>
                <Textarea rows={3} value={notes} disabled={creating} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>
          </div>
        </DetailCard>

        <DetailCard
          icon={Wallet}
          eyebrow="PAYMENT"
          title="การชำระ"
          meta={plannedInstallments.length
            ? `${plannedInstallments.length} งวดตามแผนของ ${naText(quote.quoteNumber)} · รวม ${fmtMoney(totals.totalAmount)}`
            : "ใบเสนอราคาต้นทางไม่ได้ระบุแผนการชำระ"}
        >
          {plannedInstallments.length ? (
            <>
              {termsNotice}
              {/* ลูกค้ามีรอบ = คอลัมน์สุดท้ายเป็นตัวเลือกรอบ (แตะรอบ · วันอื่น… · รอเหตุการณ์) แทนช่องกำหนดชำระ
                  ⇒ ตารางต้องกว้างขึ้นให้ชิปไม่บีบคอลัมน์อื่น
                  ⭐ ที่แคบกว่าพื้นตาราง (คอลัมน์เอกสาร ≤ 760px — มือถือ/แท็บเล็ต/จอ 1200 ที่มีแถบข้าง) แถวกลายเป็นการ์ดต่องวด
                     ตัวเลือกกินเต็มความกว้างการ์ด (ม็อก billing-cycle จอ B §จอแคบ) — 🐞 เดิมเลื่อนข้างในกรอบ ที่ 390px
                     คอลัมน์ตัวเลือกหลุดจอทั้งคอลัมน์โดยไม่มีอะไรบอกว่าเลื่อนได้ (review S4 26/09) · DOM ชุดเดียว วัดด้วย @container
                     ป้าย "งวด" / "% ของยอดรวม" / หัวช่องในการ์ด (`cardOnly` · `cardLabel`) โผล่เฉพาะตอนเป็นการ์ด */}
              <div className={styles.planContainer}>
                <TableScroll family="editable" surface="auto" cells="stacked" minWidth={rule ? 700 : 620}>
                  <table className={styles.planTable}>
                    <thead>
                      <tr>
                        <th className={styles.colSeq}>งวด</th>
                        <th>รายละเอียด</th>
                        <th className={`num ${styles.colPercent}`}>%</th>
                        <th className={`num ${styles.colAmount}`}>ยอด</th>
                        {rule
                          ? <th>เลือกรอบวางบิล</th>
                          : <th className={styles.colDue}>กำหนดชำระ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {plannedInstallments.map((row) => {
                        const rowLabel = row.label ? `งวด ${row.seq} · ${row.label}` : `งวด ${row.seq}`;
                        return (
                          <tr key={row.seq}>
                            <td className={styles.cellSeq}><span className={styles.cardOnly}>งวด </span>{row.seq}</td>
                            <td className={styles.cellLabel}>{row.label}</td>
                            {/* หัวคอลัมน์เป็น "%" อยู่แล้ว ⇒ เซลล์เป็นตัวเลขเปล่า 2 ตำแหน่ง ·
                                ⚠️ จัดรูปแบบเฉพาะใน JSX — `plannedInstallments` ตัวเดียวกันถูกส่งขึ้น API */}
                            <td className={`num ${styles.cellPercent}`}>
                              {fmtNumber(row.percent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className={styles.cardOnly}>% ของยอดรวม</span>
                            </td>
                            <td className={`num ${styles.cellAmount}`}>{fmtMoney(row.amount)}</td>
                            <td className={styles.cellPick}>
                              {/* ช่อง/ชิปมีชื่อสำหรับเสียงอ่านของตัวเองครบแล้ว — ป้ายนี้มีไว้ให้ตาเห็นตอนหัวตารางหายไป */}
                              <span className={styles.cardLabel} aria-hidden="true">{rule ? "เลือกรอบวางบิล" : "กำหนดชำระ"}</span>
                              {rule ? (
                                <BillingRoundPicker
                                  compact
                                  rule={rule}
                                  todayIso={todayIso}
                                  value={billing[row.seq] || EMPTY_PICKER_VALUE}
                                  onChange={(next) => setBilling((prev) => ({ ...prev, [row.seq]: next }))}
                                  disabled={creating}
                                  idPrefix={`so-new-billing-${row.seq}`}
                                  label={rowLabel}
                                />
                              ) : (
                                <DateInput
                                  value={billingValues[row.seq]?.dueDate || ""}
                                  disabled={creating}
                                  ariaLabel={`กำหนดชำระ ${rowLabel}`}
                                  invalid={dateCheck.invalidSeqs.has(row.seq)}
                                  onChange={(next) => setBilling((prev) => ({ ...prev, [row.seq]: { ...EMPTY_PICKER_VALUE, dueDate: next } }))}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
              {rule ? (
                <p className={`form-note ${styles.planNote}`}>
                  {billingRuleMonthly(rule)
                    ? "ชิปคือ 3 รอบถัดไปของลูกค้านับจากวันนี้ · แตะรอบเดียวได้ทั้งวันวางบิลและกำหนดชำระ · แก้กำหนดชำระทับรายงวดได้"
                    : "ลูกค้าวางบิลได้ทุกวัน — ใส่วันวางบิล ระบบคิดกำหนดชำระตามรอบของลูกค้าให้"}
                  {" · "}ไม่เลือกก็สร้างใบได้ — เลือกภายหลังได้ที่การ์ด &ldquo;การชำระ&rdquo; บนใบ
                </p>
              ) : null}

              {/* เงินที่ลูกค้าจ่ายมาก่อนออกใบ — ธง/โหมดพิเศษใช้สวิตช์ ไม่ใช่ช่องติ๊กลอย */}
              <div className={styles.prepaidBox}>
                <label className={styles.prepaidSwitch}>
                  <input
                    type="checkbox" role="switch" checked={firstPaid} disabled={creating}
                    onChange={(event) => {
                      setFirstPaid(event.target.checked);
                      if (event.target.checked && !firstPaidOn) setFirstPaidOn(confirmation.docDate || businessDate());
                    }}
                  />
                  ลูกค้าจ่ายงวดที่ 1 มาแล้ว
                </label>
                {firstPaid && (
                  <div className="form-grid cols-2">
                    <label>
                      <span>วันที่ลูกค้าจ่าย</span>
                      <DateInput value={firstPaidOn} disabled={creating} onChange={setFirstPaidOn} />
                    </label>
                    <div className="form-group">
                      <span className="toolbar-label">หลักฐานการชำระ</span>
                      <PendingFiles
                        files={firstFiles} onChange={setFirstFiles} disabled={creating}
                        max={MAX_CONFIRM_ATTACHMENTS} onOversize={setError}
                      />
                    </div>
                  </div>
                )}
                <p className={`form-note ${styles.prepaidNote}`}>
                  <b>บันทึกไว้ก่อน ยังไม่ส่งให้บัญชี</b> — ยอดต่องวดยังเดินตามใบเสนอราคาจนกว่าใบสั่งขายจะอนุมัติ
                  ระบบจะเปิดให้บัญชีรับรองการชำระเองตอนนั้น
                </p>
              </div>
            </>
          ) : (
            <p className="form-note">ไม่มีงวดให้ตั้ง — เก็บเงินครั้งเดียวเมื่อใบอนุมัติแล้ว</p>
          )}
        </DetailCard>
      </DetailPageLayout>
    </Workspace>
  );
}

export default function NewSalesOrderPage() {
  return (
    <Suspense fallback={<Workspace icon={<ClipboardList size={22} />} title="สร้างใบสั่งขาย"><SkeletonRows rows={6} /></Workspace>}>
      <NewSalesOrderInner />
    </Suspense>
  );
}
