"use client";
import Select from "@/components/ui/Select";

// Editor ใบเสนอราคา FM-SA-01 (/sa/quotations/[id] — เฟส D):
// แก้รายการ+ส่วนลดรายบรรทัด · ส่วนลดท้ายใบ · VAT · เงื่อนไขชำระ · หมายเหตุ (เลือกจาก
// template ต่อบริการ) · ส่ง/รับ/Revise/พิมพ์. ยอดเงินคิดจริงที่ server —
// หน้านี้พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, ExternalLink, FileClock, FileText, MapPin, Pencil, Plus, Printer, Save, Send, Trash2, UserRound } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import FormActions from "@/components/ui/FormActions";
import DateInput from "@/components/ui/DateInput";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/Modal";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationPeopleFields, { quotationPeopleFromMetadata } from "@/components/salesPlanning/QuotationPeopleFields";
import QuotationLineItems, { newManualLine, newProductLine } from "@/components/salesPlanning/QuotationLineItems";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { canReviewSalesForecast, DEAL_TYPE_LABELS, dealTypeOf, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openQuotePrintWindow, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";

const money = (v) => fmtMoney(v);
const EDITABLE = new Set(["draft", "sent", "rejected"]);

export default function QuotationEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";
  const canEditCap = useCan("salesplan:edit");
  const role = useRole();
  const isReviewer = canReviewSalesForecast({ role });

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState({ quoteDate: "", validUntil: "", validityDays: "", notes: "", discountType: "", discountValue: "", vatRate: 0 });
  const [templates, setTemplates] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [tplForm, setTplForm] = useState({ serviceType: "general", title: "", body: "" });
  const [products, setProducts] = useState([]);
  const [payment, setPayment] = useState({ type: "full", paymentMethod: "", paymentTerms: "", installments: [] });
  // ผู้รับผิดชอบเอกสาร (เหมือนไทม์ไลน์ — มติผู้ใช้ 2026-07-15) เก็บใน metadata
  const [people, setPeople] = useState({ aeOwner: "", preparedBy: "", aeSupervisor: "" });

  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดใบเสนอราคาไม่สำเร็จ");
      const q = await res.json();
      setQuote(q);
      setLines((q.lines || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((line) => ({
        ...line,
        _lineKind: line.productId || line.fgCode ? "product" : "manual",
      })));
      setForm({
        quoteDate: q.quoteDate || "",
        validUntil: q.validUntil || "",
        validityDays: validityDaysBetween(q.quoteDate, q.validUntil),
        notes: q.notes || "",
        discountType: q.discountType || "",
        discountValue: q.discountValue ?? "",
        vatRate: Number(q.vatRate || 0),
      });
      const pp = q.paymentPlan;
      setPayment({
        type: pp?.type === "installment" ? "installment" : "full",
        paymentMethod: pp?.paymentMethod || "",
        paymentTerms: q.paymentTerms || "",
        installments: pp?.type === "installment" && Array.isArray(pp.installments)
          ? pp.installments.map((r) => ({ label: r.label || "", percent: r.percent ?? 0, note: r.note || "" }))
          : [],
      });
      setPeople(quotationPeopleFromMetadata(q.metadata));
      setDirty(false);
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sales-planning/quote-note-templates").then((r) => (r.ok ? r.json() : [])).then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
    cachedFetchJson("/api/products").then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const canEditDocument = !!quote && canEditCap && EDITABLE.has(quote.status);
  // ใบที่ยังต้องอนุมัติ (มติ 2026-07-18) — บล็อกปุ่มส่ง/Won จนกว่าเจ้าของดีลอนุมัติ.
  // ใบ grandfather (not_required) และใบที่อนุมัติแล้ว (approved) ไม่บล็อก.
  const needsApproval = !!quote && quote.approvalStatus === "pending";
  // ลบ: draft ทุกคนที่แก้ได้ / แอดมิน (superuser) ลบได้ทุกสถานะ (มติผู้ใช้ 2026-07-15)
  const canDeleteDocument = !!quote && (role === "admin" || (canEditCap && quote.status !== "accepted"
    && (quote.status === "draft" || isSuperuser(role))));
  const editable = canEditDocument && editMode;

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate || 0,
  }), [lines, form.discountType, form.discountValue, form.vatRate]);

  const updateLines = (nextLines) => { setLines(nextLines); setDirty(true); };
  const addLine = () => updateLines([...lines, newManualLine()]);
  const addProductLine = () => updateLines([...lines, newProductLine()]);
  const setF = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const paymentPlanPayload = () => (payment.type === "installment"
    ? { type: "installment", paymentMethod: payment.paymentMethod.trim() || null, installments: payment.installments.map((row) => ({ label: row.label, percent: Number(row.percent) || 0, note: row.note })) }
    : { type: "full", paymentMethod: payment.paymentMethod.trim() || null });
  const updatePayment = (nextPayment) => { setPayment(nextPayment); setDirty(true); };

  const quotationPayload = (extra = {}) => ({
    lines: lines.map((line) => {
      const payloadLine = { ...line };
      delete payloadLine._lineKind;
      delete payloadLine._noteOpen;
      // หมายเหตุรายบรรทัดเก็บใน metadata.note — ตัดช่องว่าง/คีย์เปล่าก่อนส่ง
      const note = (payloadLine.metadata?.note || "").trim();
      payloadLine.metadata = { ...(payloadLine.metadata || {}) };
      if (note) payloadLine.metadata.note = note; else delete payloadLine.metadata.note;
      return payloadLine;
    }),
    quoteDate: form.quoteDate,
    validUntil: form.validUntil || null,
    paymentTerms: payment.paymentTerms,
    notes: form.notes,
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate,
    paymentPlan: paymentPlanPayload(),
    metadata: { ...people },
    ...extra,
  });

  const save = async (extra = {}) => {
    const paymentValidation = validatePaymentPlan(paymentPlanPayload());
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return false;
    }
    setBusy("save");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload(extra)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  // อนุมัติใบ (เจ้าของดีล/superuser) — pending → approved. ต้องบันทึกก่อน (ไม่ค้าง dirty)
  // เพราะ fingerprint อนุมัติจะ snapshot เนื้อหาที่บันทึกแล้ว.
  const approve = async () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อนอนุมัติ"); return; }
    const data = await act("approve", `/api/sales-planning/quotations/${id}/approval`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    if (data) await load();
  };

  const act = async (label, url, opts = { method: "POST" }) => {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
      return data;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setBusy("");
    }
  };

  const runConfirmed = async () => {
    const action = confirmState?.action;
    if (!action) return;
    setConfirmBusy(true);
    try {
      const completed = await action();
      if (completed !== false) setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // เปิดฟอร์มหลักฐาน Won (บังคับแนบไฟล์ + วันที่เอกสาร — validate ใน dialog/route/RPC)
  const doAccept = () => setWonOpen(true);
  const createSalesOrder = async () => {
    setBusy("sales-order");
    setError("");
    try {
      const res = await fetch("/api/sales-planning/sales-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotationId: quote.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้าง Sale Order ไม่สำเร็จ");
      router.push(`/sa/sales-orders/${data.id}`);
    } catch (err) {
      setError(err.message || "สร้าง Sale Order ไม่สำเร็จ");
      setBusy("");
    }
  };
  const doDelete = () => {
    const elevatedDelete = quote.status !== "draft";
    setConfirmState({
      title: elevatedDelete ? "ลบใบเสนอราคา (สิทธิ์ผู้ดูแลระบบ)" : "ลบใบเสนอราคาฉบับร่าง",
      description: `ต้องการลบ ${quote.quoteNumber} ใช่หรือไม่`,
      detail: elevatedDelete ? "ใบนี้ไม่ใช่ฉบับร่าง การลบด้วยสิทธิ์ผู้ดูแลระบบจะลบหลักฐานการค้าและไม่สามารถเรียกคืนจากหน้าจอนี้ได้" : "ใบเสนอราคาฉบับนี้จะถูกลบและไม่สามารถเรียกคืนจากหน้าจอนี้ได้",
      confirmLabel: elevatedDelete ? "ยืนยันลบใบเสนอราคา" : "ลบฉบับร่าง",
      tone: "danger",
      action: async () => {
        // admin: ใบ accepted โดนบล็อก → deleteWithForce จะพรีวิว Sale Order + ถามยืนยันบังคับลบ
        setBusy("delete");
        setError("");
        try {
          const result = await deleteWithForce(`/api/sales-planning/quotations/${id}`, { isAdmin: role === "admin" });
          if (!result.ok) return false;
          router.push("/sa/quotations");
          return true;
        } catch (e) {
          setError(e.message || "ลบใบเสนอราคาไม่สำเร็จ");
          return false;
        } finally {
          setBusy("");
        }
      },
    });
  };

  const saveAsRevision = async () => {
    const paymentValidation = validatePaymentPlan(paymentPlanPayload());
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return false;
    }
    setBusy("revise");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotationPayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ออก Revision ไม่สำเร็จ");
      setDirty(false);
      setSaveChoiceOpen(false);
      router.push(`/sa/quotations/${data.id}`);
      return true;
    } catch (e) {
      setError(e.message || "ออก Revision ไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };
  const doPrint = async () => {
    const printWindow = prepareQuotePrintWindow();
    if (!printWindow) return;
    try {
      if (dirty && editable) {
        printWindow.close();
        setError("กรุณาเลือกบันทึกฉบับเดิมหรือออก Revision ใหม่ก่อนพิมพ์");
        setSaveChoiceOpen(true);
        return;
      }
      const res = await fetch(`/api/sales-planning/quotations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ไม่สามารถโหลดข้อมูลใบเสนอราคาได้");
      openQuotePrintWindow(data, printWindow);
    } catch (error) {
      showQuotePrintError(printWindow, error.message);
    }
  };
  const leaveEditMode = () => {
    if (dirty && !window.confirm("ยกเลิกการแก้ไขและทิ้งข้อมูลที่ยังไม่ได้บันทึก?")) return;
    if (dirty) load();
    router.replace(`/sa/quotations/${id}`);
  };

  // template หมายเหตุ: กรองตามประเภทดีล + general
  const dealType = quote?.deal ? dealTypeOf(quote.deal) : null;
  const visibleTemplates = templates.filter((t) => t.active && (t.serviceType === "general" || !dealType || t.serviceType === dealType));
  const applyTemplate = (tpl) => setF({ notes: form.notes ? `${form.notes}\n${tpl.body}` : tpl.body });

  const statusMeta = {
    draft: { label: "ฉบับร่าง", color: "var(--text-3)" },
    sent: { label: "ส่งลูกค้าแล้ว", color: "var(--blue)" },
    accepted: { label: "Won", color: "var(--green)" },
    rejected: { label: "ถูกปฏิเสธ", color: "var(--red)" },
    cancelled: { label: "ยกเลิก", color: "var(--red)" },
    revised: { label: "มีฉบับแก้ไขใหม่", color: "var(--amber)" },
    closed: { label: "ปิด (ดีลจบด้วยใบอื่น)", color: "var(--text-3)" },
  }[quote?.status] || { label: quote?.status || "-", color: "var(--text-3)" };
  const saveTemplate = async () => {
    if (!tplForm.title.trim() || !tplForm.body.trim()) return;
    const res = await fetch("/api/sales-planning/quote-note-templates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tplForm),
    });
    if (res.ok) {
      setTplForm({ serviceType: "general", title: "", body: "" });
      const d = await fetch("/api/sales-planning/quote-note-templates").then((r) => r.json()).catch(() => []);
      setTemplates(Array.isArray(d) ? d : []);
    } else setError((await res.json().catch(() => ({}))).error || "บันทึก template ไม่สำเร็จ");
  };
  const deleteTemplate = (tpl) => {
    setConfirmState({
      title: "ลบ Template หมายเหตุ",
      description: `ต้องการลบ “${tpl.title}” ใช่หรือไม่`,
      detail: "Template จะหายจากตัวเลือกของใบเสนอราคาทุกฉบับ แต่ข้อความที่นำไปใช้แล้วจะไม่ถูกลบ",
      confirmLabel: "ลบ Template",
      tone: "danger",
      action: async () => {
        const res = await fetch(`/api/sales-planning/quote-note-templates/${tpl.id}`, { method: "DELETE" });
        if (!res.ok) {
          setError((await res.json().catch(() => ({}))).error || "ลบ template ไม่สำเร็จ");
          return false;
        }
        setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
        return true;
      },
    });
  };

  return (
    <Workspace
      back={{ href: "/sa/quotations", label: "กลับหน้าใบเสนอราคา" }}
      backActions={quote && (
        <div className={styles.headerActions}>
          {editable && <SaveStatus status={error ? "error" : ["save", "revise"].includes(busy) ? "saving" : dirty ? "dirty" : "saved"} />}
          {canEditDocument && !editMode && (
            <Link href={`/sa/quotations/${id}?edit=1`} className="btn-icon" aria-label="แก้ไขใบเสนอราคา" title="แก้ไข">
              <Pencil size={16} aria-hidden="true" />
            </Link>
          )}
          {canDeleteDocument && !editMode && (
            <button type="button" className="btn-icon danger" onClick={doDelete} disabled={!!busy} aria-label="ลบใบเสนอราคา" title="ลบ">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
          {editable && <button type="button" className="btn ghost" onClick={leaveEditMode} disabled={!!busy}>ยกเลิกแก้ไข</button>}
          {editable && <button type="button" className="btn btn-primary" onClick={() => setSaveChoiceOpen(true)} disabled={!!busy || !dirty}><Save size={14} aria-hidden="true" /> {["save", "revise"].includes(busy) ? "กำลังบันทึก…" : "บันทึก"}</button>}
        </div>
      )}
      hideHeader
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>
      )}

      {quote && (
        <div className={styles.detailLayout}>
          <div className={styles.documentColumn}>
          {/* สถานะ + อนุมัติ */}
          <section className={`${styles.card} ${styles.overviewCard}`}>
            <div className={styles.overviewHeading}>
              <div>
                <div className={styles.overviewEyebrowRow}>
                  <span className={styles.eyebrow}>FM-SA-01 · QUOTATION</span>
                  <span className={styles.cardQuoteNumber}>เลขที่ใบเสนอราคา <strong>{quote.quoteNumber}</strong></span>
                </div>
                <h2>{quote.customerName || "ไม่ระบุลูกค้า"}</h2>
                <p>
                  <span>โครงการ: {quote.deal?.project?.name || quote.deal?.project?.code || "ไม่ระบุ"}</span>
                  <span>ดีล: {quote.deal?.title || "ไม่ระบุ"}</span>
                  <span>ประเภทดีล: {dealType} · {DEAL_TYPE_LABELS[dealType]}</span>
                  {quote.revisionNo > 0 && <span>Revision {quote.revisionNo}</span>}
                </p>
              </div>
              <div className={styles.badgeRow}>
                <span className={styles.stateBadge} style={{ "--state-color": statusMeta.color }}>{statusMeta.label}</span>
              </div>
            </div>
            <div className={styles.quickFacts}>
              <div><CalendarDays size={16} /><span><small>วันที่ออกใบ</small>{form.quoteDate ? fmtDate(form.quoteDate) : "-"}</span></div>
              <div><CalendarDays size={16} /><span><small>ยืนราคาถึง</small>{form.validUntil ? fmtDate(form.validUntil) : "ไม่ระบุ"}</span></div>
              <div><CircleDollarSign size={16} /><span><small>ภาษี</small>{form.vatRate > 0 ? `+ VAT ${form.vatRate}%` : "รวม VAT แล้ว"}</span></div>
              <div><ClipboardList size={16} /><span><small>รายการ</small>{lines.length} รายการ</span></div>
            </div>
          </section>

          {/* ข้อมูลลูกค้าที่แช่แข็งบนใบ (Q3) — อ่านอย่างเดียว แก้ที่ฐานข้อมูลลูกค้า */}
          {(quote.billingAddress || quote.contactName || quote.shippingAddress) && (
            <section className={`${styles.card} ${styles.customerCard}`}>
              <div className={styles.sectionHeading}>
                <UserRound size={17} aria-hidden="true" />
                <h2>ข้อมูลลูกค้าในเอกสาร</h2>
                <span className="ui-badge" style={{ color: "var(--text-3)" }}>อ่านอย่างเดียว</span>
                <div className="spacer" />
                {quote.customerId && (
                  <Link href={`/database/customers/${quote.customerId}`} className="btn ghost sm" target="_blank">
                    <ExternalLink size={13} aria-hidden="true" /> แก้ที่ฐานข้อมูลลูกค้า
                  </Link>
                )}
              </div>
              <div className={styles.customerGrid}>
                <div className={styles.infoBlock}><Building2 size={16} /><span><small>ลูกค้า</small>{quote.customerName || "-"}{quote.branchCode ? ` · สาขา ${quote.branchCode}` : ""}</span></div>
                <div className={styles.infoBlock}><UserRound size={16} /><span><small>ผู้ติดต่อ</small>{[quote.contactName, quote.contactPhone].filter(Boolean).join(" · ") || "-"}</span></div>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่ออกบิล</small>{quote.billingAddress || "-"}</span></div>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่จัดส่ง</small>{quote.shippingAddress || quote.billingAddress || "-"}</span></div>
              </div>
            </section>
          )}

          {/* หัวใบ */}
          <section className={`${styles.card} ${styles.documentMeta}`}>
            <label>วันที่ออกใบ
              <DateInput className={styles.documentDateInput} value={form.quoteDate} disabled={!editable} onChange={(value) => setF({ quoteDate: value, validUntil: addValidityDays(value, form.validityDays) })} />
            </label>
            <label>ยืนราคาถึง
              <DateInput className={styles.documentDateInput} value={form.validUntil || ""} min={form.quoteDate || undefined} disabled={!editable} onChange={(value) => setF({ validUntil: value, validityDays: validityDaysBetween(form.quoteDate, value) })} />
            </label>
            <label>กำหนดยืนราคา (จำนวนวัน)
              <input type="number" min="1" step="1" className={`premium-input ${styles.documentDateInput}`} value={form.validityDays} disabled={!editable} onChange={(event) => {
                const validityDays = event.target.value;
                setF({ validityDays, validUntil: addValidityDays(form.quoteDate, validityDays) });
              }} />
            </label>
          </section>

          {/* ผู้รับผิดชอบเอกสาร — ชุดเดียวกับไทม์ไลน์ (ผู้ดูแล/ผู้ประสานงาน/ผู้ตรวจสอบ) */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}><UserRound size={17} aria-hidden="true" /><h2>ผู้รับผิดชอบเอกสาร</h2></div>
            <div className={styles.documentMeta}>
              <QuotationPeopleFields value={people} disabled={!editable} onChange={(next) => { setPeople(next); setDirty(true); }} />
            </div>
          </section>

          {/* รายการ */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <ClipboardList size={17} aria-hidden="true" />
              <h2>รายการสินค้า/บริการ</h2>
              {editable && (
                <div className={styles.lineActions}>
                  <button type="button" className="btn btn-primary sm" onClick={addProductLine}><Plus size={13} aria-hidden="true" /> เพิ่มสินค้า</button>
                  <button type="button" className="btn ghost sm" onClick={addLine}><Plus size={13} aria-hidden="true" /> เพิ่มรายการเอง</button>
                </div>
              )}
            </div>
            <QuotationLineItems
              lines={lines}
              onChange={updateLines}
              editable={editable}
              products={products}
              discountType={form.discountType}
              discountValue={form.discountValue}
              vatRate={form.vatRate}
              onDiscountChange={({ type, value }) => setF({ discountType: type, discountValue: value })}
              onVatRateChange={(rate) => setF({ vatRate: rate })}
            />
          </section>

          {/* เงื่อนไขการชำระเงิน — รูปแบบเดียวกับหน้าสร้าง + เปิด/ปิดแบ่งชำระ */}
          <section className={styles.card}>
            <QuotationPaymentTerms value={payment} onChange={updatePayment} totalAmount={totals.totalAmount} disabled={!editable} />
          </section>

          {/* หมายเหตุ + template */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <FileText size={17} aria-hidden="true" />
              <h2>หมายเหตุ</h2>
              <div className="spacer" />
              {editable && visibleTemplates.map((t) => (
                <button key={t.id} type="button" className="btn ghost sm" onClick={() => applyTemplate(t)} title={t.body}>+ {t.title}</button>
              ))}
              {isReviewer && <button type="button" className="btn ghost sm" onClick={() => setTplOpen(true)}>จัดการ template</button>}
            </div>
            <textarea className="premium-input" rows={4} value={form.notes} disabled={!editable} placeholder="หมายเหตุที่ต้องการแสดงในใบเสนอราคา" onChange={(e) => setF({ notes: e.target.value })} style={{ width: "100%" }} />
          </section>

          {editable && (
            <FormActions
              dirty={dirty}
              saving={["save", "revise"].includes(busy)}
              error={!!error}
              onSave={() => setSaveChoiceOpen(true)}
            />
          )}
          </div>

          <aside className={styles.sidebar} aria-label="สรุปและคำสั่งใบเสนอราคา">
            <section className={`${styles.card} ${styles.summaryCard}`}>
              <div className={styles.summaryLabel}>ยอดสุทธิใบเสนอราคา</div>
              <div className={styles.totalAmount}>{money(totals.totalAmount)}</div>
              <div className={styles.totalRows}>
                <div><span>รวมรายการ</span><strong>{money(totals.subtotal)}</strong></div>
                <div><span>ส่วนลด</span><strong>{totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : "-"}</strong></div>
                {form.vatRate > 0 && <div><span>VAT {form.vatRate}%</span><strong>{money(totals.vatAmount)}</strong></div>}
              </div>

              <div className={styles.workflowStatus}>
                <span className={styles.statusDot} style={{ "--state-color": statusMeta.color }} />
                <div><small>สถานะเอกสาร</small><strong>{statusMeta.label}</strong></div>
              </div>
              {/* สถานะการอนุมัติ (มติ 2026-07-18): ใบต้องให้เจ้าของดีลอนุมัติก่อนส่ง */}
              {needsApproval && (
                <div className="glass-panel" style={{ padding: "10px 12px", margin: "0 0 10px", borderColor: "var(--amber)", color: "var(--amber)", fontSize: 13 }}>
                  รออนุมัติจากเจ้าของดีล — ยังส่งลูกค้า/ปิด Won ไม่ได้จนกว่าจะอนุมัติ
                </div>
              )}
              {quote.approvalStatus === "approved" && quote.approvedByName && (
                <div style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--green)" }}>
                  อนุมัติแล้วโดย {quote.approvedByName}
                </div>
              )}
              <div className={styles.workflowActions}>
                {needsApproval && quote.canApprove && ["draft", "sent", "rejected"].includes(quote.status) && (
                  <button type="button" className="btn btn-primary" onClick={approve} disabled={!!busy || dirty} title={dirty ? "บันทึกก่อนอนุมัติ" : "อนุมัติใบเสนอราคานี้ (เจ้าของดีล)"}><CheckCircle2 size={15} aria-hidden="true" /> อนุมัติ</button>
                )}
                {editable && quote.status === "draft" && !needsApproval && <button type="button" className="btn btn-primary" onClick={async () => { if (await save({ status: "sent" })) {} }} disabled={!!busy}><Send size={15} aria-hidden="true" /> ส่งให้ลูกค้า</button>}
                {["sent", "draft"].includes(quote.status) && canEditCap && !needsApproval && <button type="button" className="btn btn-primary" onClick={doAccept} disabled={!!busy} title="ปิด Won ผ่านใบเสนอราคานี้"><CheckCircle2 size={15} aria-hidden="true" /> Won</button>}
                <button type="button" className="btn ghost" onClick={doPrint} disabled={!!busy}><Printer size={15} aria-hidden="true" /> พิมพ์ / PDF</button>
              </div>

              {quote.deal && <Link href={`/sa/deals/${quote.deal.id}`} className={styles.relatedLink}>เปิดดีลที่เกี่ยวข้อง <span>→</span></Link>}
              {!editable && quote.status !== "closed" && <p className={styles.lockedNote}>ใบนี้แก้ไขไม่ได้ หากต้องเปลี่ยนข้อมูลให้สร้างฉบับแก้ไขใหม่</p>}
              {quote.status === "closed" && <p className={styles.lockedNote}>ใบนี้ถูกปิดเพราะดีลจบด้วยใบเสนอราคาฉบับอื่น — แก้ไข/ลบไม่ได้</p>}
            </section>

            {/* หลักฐานการปิด Won (mig 0102) — โชว์บนใบที่ accept แล้ว */}
            {quote.status === "accepted" && Array.isArray(quote.wonAttachments) && quote.wonAttachments.length > 0 && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <h2>หลักฐานการปิด Won</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>ประเภทเอกสาร</small>{WON_DOC_TYPE_LABELS[quote.wonDocType] || quote.wonDocType || "-"}</div>
                  <div><small style={{ color: "var(--text-3)", display: "block" }}>วันที่เอกสาร</small>{quote.wonDocDate ? fmtDate(quote.wonDocDate) : "-"}</div>
                  {quote.wonPaymentDueDate && <div><small style={{ color: "var(--text-3)", display: "block" }}>กำหนดชำระ</small>{fmtDate(quote.wonPaymentDueDate)}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <small style={{ color: "var(--text-3)" }}>ไฟล์แนบ</small>
                    {quote.wonAttachments.map((att, i) => (
                      <a key={`${att.fileUrl}-${i}`} href={`/api/sales-planning/quotations/${quote.id}/file?i=${i}`} target="_blank" rel="noreferrer" className={styles.relatedLink}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.fileName || `ไฟล์ ${i + 1}`}</span>
                        <span>→</span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {quote.salesOrder && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <ClipboardList size={17} aria-hidden="true" />
                  <h2>Sale Order</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="linklike mono" style={{ fontWeight: 700 }}>{quote.salesOrder.orderNumber}</Link>
                  <span className="ui-badge" style={{ color: quote.salesOrder.status === "approved" ? "var(--green)" : quote.salesOrder.status === "pending_approval" ? "var(--amber)" : "var(--text-3)" }}>{({ draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" })[quote.salesOrder.status] || quote.salesOrder.status}</span>
                  <span style={{ color: "var(--text-2)" }}>Actual ก่อน VAT {fmtMoney(quote.salesOrder.status === "approved" ? quote.salesOrder.actualAmount : 0)}</span>
                  <Link href={`/sa/sales-orders/${quote.salesOrder.id}`} className="btn ghost sm"><ExternalLink size={13} /> เปิด SO</Link>
                </div>
              </section>
            )}

            {quote.status === "accepted" && !quote.salesOrder && canEditCap && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}><ClipboardList size={17} aria-hidden="true" /><h2>Sale Order</h2></div>
                <p style={{ color: "var(--text-2)", marginTop: 0 }}>สร้างร่าง SO จาก QT ใบนี้เพื่อตรวจสอบข้อมูลและยื่นให้ AE Supervisor อนุมัติ</p>
                <button type="button" className="btn btn-primary" onClick={createSalesOrder} disabled={!!busy}><Plus size={14} /> {busy === "sales-order" ? "กำลังสร้าง…" : "สร้างร่าง Sale Order"}</button>
              </section>
            )}
            {quote.revisionHistory?.length > 1 && (
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <FileClock size={17} aria-hidden="true" />
                  <h2>ประวัติ Revision</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {quote.revisionHistory.map((revision) => (
                    <Link
                      key={revision.id}
                      href={`/sa/quotations/${revision.id}`}
                      className={styles.relatedLink}
                      aria-current={revision.id === quote.id ? "page" : undefined}
                      style={revision.id === quote.id ? { color: "var(--blue)", fontWeight: 700 } : undefined}
                    >
                      <span>
                        {revision.quoteNumber}
                        {revision.id === quote.id ? " · ฉบับนี้" : ""}
                        <small style={{ display: "block", color: "var(--text-3)", fontWeight: 400 }}>
                          {fmtDate(revision.quoteDate)} · {revision.status === "revised" ? "ฉบับเก่า" : "ฉบับล่าสุด"}
                        </small>
                      </span>
                      <span>→</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      <QuotationWonDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        quote={quote}
        customerId={quote?.customerId || quote?.deal?.customerId}
        customerName={quote?.customerName || quote?.deal?.customerName}
        onDone={async () => { setWonOpen(false); await load(); }}
      />

      <Modal open={saveChoiceOpen} onClose={() => !busy && setSaveChoiceOpen(false)} title="เลือกวิธีบันทึกใบเสนอราคา" size="sm">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
            บันทึกฉบับเดิมเพื่อแก้ข้อมูลในเลขที่ปัจจุบัน หรือออก Revision ใหม่เพื่อเก็บฉบับเดิมไว้เป็นประวัติ
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost" onClick={() => setSaveChoiceOpen(false)} disabled={!!busy}>ยกเลิก</button>
            <button type="button" className="btn" onClick={async () => { if (await save()) setSaveChoiceOpen(false); }} disabled={!!busy}>
              บันทึกฉบับเดิม
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAsRevision} disabled={!!busy}>
              ออก Revision ใหม่
            </button>
          </div>
        </div>
      </Modal>

      {/* จัดการ template หมายเหตุ (supervisor) */}
      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Template หมายเหตุ (ต่อประเภทบริการ)" size="lg">
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="premium-glass-table table-responsive">
            <table className="w-full text-sm">
              <thead><tr><th>ประเภท</th><th>ชื่อ</th><th>เนื้อหา</th><th></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="premium-row">
                    <td><span className="ui-badge">{t.serviceType}</span></td>
                    <td>{t.title}</td>
                    <td style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{t.body}</td>
                    <td><button type="button" className="btn-icon danger" onClick={() => deleteTemplate(t)} aria-label={`ลบ ${t.title}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                  </tr>
                ))}
                {!templates.length && <tr><td colSpan={4} style={{ padding: 18, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มี template</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="form-grid" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <label>ประเภทบริการ
              <Select className="premium-select" value={tplForm.serviceType} onChange={(e) => setTplForm({ ...tplForm, serviceType: e.target.value })}>
                {["general", "SCENT", "NPD", "RE-ORDER", "diffuser", "workshop"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </label>
            <label>ชื่อ template
              <input className="premium-input" value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>เนื้อหา
              <textarea className="premium-input" rows={3} value={tplForm.body} onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" onClick={saveTemplate} disabled={!tplForm.title.trim() || !tplForm.body.trim()}><Plus size={14} aria-hidden="true" /> เพิ่ม template</button>
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirmState(null)}
        onConfirm={runConfirmed}
      />
    </Workspace>
  );
}
