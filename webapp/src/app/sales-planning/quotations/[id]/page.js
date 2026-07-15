"use client";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";

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
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/Modal";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { canReviewSalesForecast, DEAL_TYPE_LABELS, dealTypeOf, quoteLineNet, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openQuotePrintWindow, prepareQuotePrintWindow, showQuotePrintError } from "@/lib/sales/quotePrint";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { fgLineDescription } from "@/lib/sales/quoteLines";
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
      setDirty(false);
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sales-planning/quote-note-templates").then((r) => (r.ok ? r.json() : [])).then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const canEditDocument = !!quote && canEditCap && EDITABLE.has(quote.status);
  // closed = ล็อกถาวร (ดีลจบด้วยใบอื่น) — ห้ามลบแม้ superuser
  const canDeleteDocument = !!quote && canEditCap && quote.status !== "closed" && (quote.status === "draft" || isSuperuser(role));
  const editable = canEditDocument && editMode;

  // ผลค้นหาสินค้า: รหัส · แบรนด์ · ชื่อสินค้า · ปริมาตร (มติผู้ใช้ 2026-07-15) เรียงตามรหัส FG
  const productOptions = useMemo(() => products
    .map((product) => {
      const brand = product.brandName || product.brandNameEn || "";
      const volume = product.volume ? `${product.volume} ${product.volumeUnit || "ml"}` : "";
      const name = product.productDescription || product.productDescriptionEn || "-";
      return {
        value: product.id,
        fgCode: product.fgCode || "",
        label: [product.fgCode, brand, name, volume].filter(Boolean).join(" · "),
        search: `${product.fgCode || ""} ${brand} ${product.brandName || ""} ${product.brandNameEn || ""} ${product.productDescription || ""} ${product.productDescriptionEn || ""} ${volume}`,
      };
    })
    .sort((a, b) => (a.fgCode || "￿").localeCompare(b.fgCode || "￿", "en") || a.label.localeCompare(b.label, "th")), [products]);

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate || 0,
  }), [lines, form.discountType, form.discountValue, form.vatRate]);

  const setLine = (i, patch) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addLine = () => { setLines((prev) => [...prev, { _lineKind: "manual", description: "", qty: 1, unitPrice: 0, discountType: null, discountValue: 0 }]); setDirty(true); };
  const addProductLine = () => {
    setLines((prev) => [...prev, { _lineKind: "product", productId: null, fgCode: null, description: "", qty: 1, unitPrice: 0, discountType: null, discountValue: 0 }]);
    setDirty(true);
  };
  const selectLineProduct = (i, productId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLine(i, {
      productId: p.id,
      fgCode: p.fgCode || null,
      // คำอธิบายมาตรฐาน แบรนด์ · ชื่อสินค้า · ปริมาตร (รหัสแสดงเป็นป้าย FG แยก)
      description: fgLineDescription(p),
      unitPrice: Number(p.retailPriceIncVat || 0),
    });
  };
  const removeLine = (i) => { setLines((prev) => prev.filter((_, idx) => idx !== i)); setDirty(true); };
  const setF = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const paymentPlanPayload = () => (payment.type === "installment"
    ? { type: "installment", paymentMethod: payment.paymentMethod.trim() || null, installments: payment.installments.map((row) => ({ label: row.label, percent: Number(row.percent) || 0, note: row.note })) }
    : { type: "full", paymentMethod: payment.paymentMethod.trim() || null });
  const updatePayment = (nextPayment) => { setPayment(nextPayment); setDirty(true); };

  const quotationPayload = (extra = {}) => ({
    lines: lines.map((line) => {
      const payloadLine = { ...line };
      delete payloadLine._lineKind;
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
  const doDelete = () => {
    const elevatedDelete = quote.status !== "draft";
    setConfirmState({
      title: elevatedDelete ? "ลบใบเสนอราคา (สิทธิ์ผู้ดูแลระบบ)" : "ลบใบเสนอราคาฉบับร่าง",
      description: `ต้องการลบ ${quote.quoteNumber} ใช่หรือไม่`,
      detail: elevatedDelete ? "ใบนี้ไม่ใช่ฉบับร่าง การลบด้วยสิทธิ์ผู้ดูแลระบบจะลบหลักฐานการค้าและไม่สามารถเรียกคืนจากหน้าจอนี้ได้" : "ใบเสนอราคาฉบับนี้จะถูกลบและไม่สามารถเรียกคืนจากหน้าจอนี้ได้",
      confirmLabel: elevatedDelete ? "ยืนยันลบใบเสนอราคา" : "ลบฉบับร่าง",
      tone: "danger",
      action: async () => {
        if (!(await act("delete", `/api/sales-planning/quotations/${id}`, { method: "DELETE" }))) return false;
        router.push("/sa/quotations");
        return true;
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
            <div className="premium-glass-table table-responsive">
              <table className="w-full text-sm">
                <thead>
                  <tr><th style={{ width: 36 }}>#</th><th>รายการ</th><th style={{ width: 90 }}>จำนวน</th><th style={{ width: 120 }}>ราคา/หน่วย</th><th style={{ width: 170 }}>ส่วนลดรายการ</th><th className="num" style={{ width: 120 }}>จำนวนเงิน</th>{editable && <th style={{ width: 40 }}></th>}</tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id || i} className="premium-row">
                      <td className={styles.rowNumber}>{i + 1}</td>
                      <td>
                        <div className={styles.lineDescriptionCell}>
                          {editable && l._lineKind === "product" && (
                            <SearchableSelect
                              entity="product"
                              size="sm"
                              value={l.productId || ""}
                              onChange={(productId) => selectLineProduct(i, productId)}
                              ariaLabel={`เลือกสินค้า รายการ ${i + 1}`}
                              placeholder="เลือก FG / สินค้า..."
                              options={productOptions}
                            />
                          )}
                          {/* รหัสนำหน้า → คำอธิบาย แบรนด์ · ชื่อสินค้า · ปริมาตร (มติผู้ใช้) */}
                          {l.fgCode && <span className={styles.fgCode}>FG: {l.fgCode}</span>}
                          <input className="premium-input" value={l.description || ""} disabled={!editable} placeholder={l._lineKind === "product" ? "รายละเอียดสินค้าจะเติมอัตโนมัติ" : "รายละเอียด"} onChange={(e) => setLine(i, { description: e.target.value })} style={{ width: "100%" }} />
                        </div>
                      </td>
                      <td><MoneyInput min="0" value={l.qty} disabled={!editable} onChange={(value) => setLine(i, { qty: value ?? "" })} aria-label={`จำนวน รายการ ${i + 1}`} /></td>
                      <td>
                        {/* ราคาบรรทัด FG ล็อกตามฐานข้อมูลสินค้า (server enforce ซ้ำตอนบันทึก) */}
                        <MoneyInput min="0" value={l.unitPrice} disabled={!editable || !!(l.productId || l.fgCode)} title={(l.productId || l.fgCode) ? "ราคาจากฐานข้อมูลสินค้า — แก้ราคาต้องแก้ที่ฐานข้อมูล" : undefined} onChange={(value) => setLine(i, { unitPrice: value ?? "" })} aria-label={`ราคาต่อหน่วย รายการ ${i + 1}`} />
                        {editable && !!(l.productId || l.fgCode) && (
                          <Link href={l.productId ? `/database/products/${l.productId}` : "/database/products"} target="_blank" className={styles.fgCode} style={{ color: "var(--blue)" }}>
                            ราคาจากฐานข้อมูล →
                          </Link>
                        )}
                      </td>
                      <td>
                        <div className={styles.discountControls}>
                          <Select className="premium-select" value={l.discountType || ""} disabled={!editable} onChange={(e) => setLine(i, { discountType: e.target.value || null, discountValue: e.target.value ? l.discountValue : 0 })}>
                            <option value="">ไม่ลด</option>
                            <option value="percent">%</option>
                            <option value="amount">บาท</option>
                          </Select>
                          <MoneyInput min="0" value={l.discountValue || ""} disabled={!editable || !l.discountType} onChange={(value) => setLine(i, { discountValue: value ?? "" })} aria-label={`ส่วนลด รายการ ${i + 1}`} />
                        </div>
                      </td>
                      <td className="num mono">{money(quoteLineNet(l).lineTotal)}</td>
                      {editable && (
                        <td><button type="button" className="btn-icon danger" onClick={() => removeLine(i)} aria-label={`ลบรายการ ${i + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                      )}
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={editable ? 7 : 6} className={styles.emptyRows}>ยังไม่มีรายการ — กด “เพิ่มสินค้า” หรือ “เพิ่มรายการเอง”</td></tr>}
                </tbody>
              </table>
            </div>

            {/* ข้อมูลท้ายใบ: ยอด ส่วนลด VAT */}
            <div className={styles.totalsWrap}>
              <div className={styles.totalsPanel}>
                <div className={styles.totalLine}><span>รวมเป็นเงิน</span><strong className="mono">{money(totals.subtotal)}</strong></div>
                <div className={styles.totalLine}>
                  <span className={styles.totalControls}>
                    ส่วนลดท้ายใบ
                    <Select className="premium-select" value={form.discountType} disabled={!editable} onChange={(e) => setF({ discountType: e.target.value, discountValue: e.target.value ? form.discountValue : "" })}>
                      <option value="">ไม่ลด</option>
                      <option value="percent">%</option>
                      <option value="amount">บาท</option>
                    </Select>
                    <MoneyInput min="0" value={form.discountValue || ""} disabled={!editable || !form.discountType} onChange={(value) => setF({ discountValue: value ?? "" })} aria-label="ส่วนลดท้ายใบ" />
                  </span>
                  <strong className="mono" style={{ color: totals.discountAmount > 0 ? "var(--red)" : "inherit" }}>{totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : "-"}</strong>
                </div>
                <div className={styles.totalLine}>
                  <span className={styles.totalControls}>
                    ภาษีมูลค่าเพิ่ม
                    <Select className="premium-select" value={form.vatRate} disabled={!editable} onChange={(e) => setF({ vatRate: Number(e.target.value) })}>
                      <option value={0}>รวม VAT แล้ว</option>
                      <option value={7}>+ VAT 7% ท้ายใบ</option>
                    </Select>
                  </span>
                  <strong className="mono">{form.vatRate > 0 ? money(totals.vatAmount) : "-"}</strong>
                </div>
                <div className={styles.totalGrand}>
                  <strong>ยอดรวมทั้งสิ้น</strong><strong className="mono">{money(totals.totalAmount)}</strong>
                </div>
              </div>
            </div>
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
              <div className={styles.workflowActions}>
                {editable && quote.status === "draft" && <button type="button" className="btn btn-primary" onClick={async () => { if (await save({ status: "sent" })) {} }} disabled={!!busy}><Send size={15} aria-hidden="true" /> ส่งให้ลูกค้า</button>}
                {["sent", "draft"].includes(quote.status) && canEditCap && <button type="button" className="btn btn-success" onClick={doAccept} disabled={!!busy} title="ปิด Won ผ่านใบเสนอราคานี้"><CheckCircle2 size={15} aria-hidden="true" /> Won</button>}
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
