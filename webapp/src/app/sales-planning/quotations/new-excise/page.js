"use client";

// หน้าออกใบเสนอราคาค่าสรรพสามิต (มติเจ้าของ 29/10 "กดสร้างแล้วยังไม่ต้องบันทึก อยู่ในขั้นแก้ไขก่อน แบบ new ใบเสนอราคา")
// เดิมปุ่มบนเส้นเดินงานของ SO ลูกค้ายิง POST ทันที ⇒ ได้เลข QT + สินค้า 04-003 ก่อนคนได้เห็นใบ
// ตอนนี้: GET …/excise-quotation?preview=1 (ไม่ออกเลข ไม่ลงฐาน) → แก้หัวใบ → "บันทึก" = POST ทางเดิม + หัวใบที่แก้
//
// ⚠️ ไม่ใช่ฟอร์มแยกชุด (AGENTS.md "แก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง") — ทุกช่องเป็น component กลางชุดเดียวกับ
//    หน้าใบ ([id]) และหน้าสร้างใบปกติ (/new) · ต่างกันแค่โหมดที่มีเหตุผลด้านข้อมูล:
//    - ที่มา = SO ลูกค้า (ไม่มีดีล · แผนรื้อสรรพสามิต หมวด 3.1) แทนตัวเลือกลูกค้า/ดีล
//    - รายการอ่านอย่างเดียว (`editable={false}`) — บรรทัดคิดจาก SO ต้นทางเท่านั้น แก้ภายหลังด้วย "คิดใหม่จากใบสั่งขาย"
//    - ลูกค้า/ที่อยู่/ผู้ติดต่อ ลอกจากใบเสนอราคาต้นทางของ SO — เปลี่ยนได้ที่หน้าใบหลังบันทึก (ร่าง) เหมือนใบทั่วไป
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CircleDollarSign, ClipboardList, FileText, Handshake, Package } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { ContextCard, ContextGrid, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentReadinessList, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import QuotationInstallments from "@/components/salesPlanning/QuotationInstallments";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationNotes from "@/components/salesPlanning/QuotationNotes";
import QuotationLineItems from "@/components/salesPlanning/QuotationLineItems";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { apiJson } from "@/lib/apiFetch";
import SkeletonRows from "@/components/ui/Skeleton";
import styles from "./page.module.css";

/** แผนชำระจากแถวพรีวิว → สถานะของฟอร์ม (รูปเดียวกับหน้าใบ [id]) */
const paymentFormOf = (quote) => {
  const plan = quote?.paymentPlan;
  return {
    type: plan?.type === "installment" ? "installment" : "full",
    paymentMethod: plan?.paymentMethod || "",
    paymentTerms: quote?.paymentTerms || "",
    installments: plan?.type === "installment" && Array.isArray(plan.installments)
      ? plan.installments.map((row) => ({ label: row.label || "", percent: row.percent ?? 0, note: row.note || "" }))
      : [],
    presetVersionId: null,
  };
};

function NewExciseQuotationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useCan("salesplan:edit");
  const salesOrderId = params.get("salesOrderId") || "";

  /* กลับไปที่เดิมเมื่อยกเลิก — ด่าน open redirect ตัวเดียวกับ /sa/quotations/new · ค่าตั้งต้น = SO ลูกค้าที่กดมา */
  const backRaw = params.get("returnTo");
  const fallbackBack = salesOrderId ? `/sa/sales-orders/${encodeURIComponent(salesOrderId)}` : "/sa/quotations";
  const returnTo = backRaw && backRaw.startsWith("/") && !backRaw.startsWith("//") ? backRaw : fallbackBack;

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // { message, quotationId? }
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const [quoteDate, setQuoteDate] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [validUntil, setValidUntil] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [payment, setPayment] = useState(() => paymentFormOf(null));
  const [notes, setNotes] = useState("");
  const [notesPresetVersionId, setNotesPresetVersionId] = useState(null);

  useEffect(() => {
    if (!salesOrderId) { setLoading(false); setLoadError({ message: "ไม่ได้ระบุใบสั่งขายต้นทาง — เปิดหน้านี้จากปุ่มบนใบสั่งขาย" }); return undefined; }
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiJson(`/api/sales-planning/sales-orders/${encodeURIComponent(salesOrderId)}/excise-quotation?preview=1`, {
          fallbackError: "โหลดข้อมูลใบเสนอราคาค่าสรรพสามิตไม่สำเร็จ",
        });
        if (!alive) return;
        const quote = data?.quote || {};
        setPreview(data);
        setQuoteDate(quote.quoteDate || "");
        // ยืนราคาตั้งต้น 30 วันแบบหน้าสร้างใบปกติ — ใบที่ออกจากทางเดิม (POST เปล่า) ไม่มีวันยืนราคา คนต้องไปใส่เองที่หน้าใบ
        setValidUntil(quote.validUntil || addValidityDays(quote.quoteDate, 30));
        setValidityDays(quote.validUntil ? validityDaysBetween(quote.quoteDate, quote.validUntil) : 30);
        setReferenceNote(quote.referenceNote || "");
        setPayment(paymentFormOf(quote));
        setNotes(quote.notes || "");
      } catch (loadFailure) {
        if (alive) setLoadError({ message: loadFailure.message, quotationId: loadFailure.data?.quotationId || null });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [salesOrderId]);

  const quote = preview?.quote || null;
  const lines = useMemo(() => quote?.lines || [], [quote]);

  const paymentPlan = useMemo(() => (payment.type === "installment"
    ? { type: "installment", paymentMethod: payment.paymentMethod.trim() || null, installments: payment.installments.map((row) => ({ label: row.label, percent: Number(row.percent) || 0, note: row.note })) }
    : { type: "full", paymentMethod: payment.paymentMethod.trim() || null }), [payment]);

  /* บันทึก = POST ทางเดิม (ด่านทั้งหมดอยู่ฝั่ง server: SO อนุมัติแล้ว · ยังไม่มีใบที่มีผล · ราคาขายปลีกครบ)
     ⚠️ ไม่ลองซ้ำ (apiJson ไม่ retry POST) — ยิงซ้ำหลังบันทึกสำเร็จได้ 409 "มีใบอยู่แล้ว" ที่ทำให้เข้าใจผิดว่าไม่สำเร็จ */
  const create = useCallback(async () => {
    if (!quote) return;
    const paymentValidation = validatePaymentPlan(paymentPlan);
    if (!paymentValidation.ok) { setError(paymentValidation.error); return; }
    setCreating(true);
    setError("");
    try {
      const data = await apiJson(`/api/sales-planning/sales-orders/${encodeURIComponent(salesOrderId)}/excise-quotation`, {
        method: "POST",
        json: {
          quoteDate,
          validUntil: validUntil || null,
          referenceNote,
          paymentPlan,
          paymentTerms: payment.paymentTerms,
          notes,
          metadata: {
            paymentPresetVersionId: payment.presetVersionId || null,
            remarksPresetVersionId: notesPresetVersionId || null,
          },
        },
        fallbackError: "ออกใบเสนอราคาค่าสรรพสามิตไม่สำเร็จ",
      });
      router.push(`/sa/quotations/${encodeURIComponent(data.quote.id)}`);
    } catch (createError) {
      setError(createError.message || "ออกใบเสนอราคาค่าสรรพสามิตไม่สำเร็จ");
      setCreating(false);
    }
  }, [quote, paymentPlan, salesOrderId, quoteDate, validUntil, referenceNote, payment, notes, notesPresetVersionId, router]);

  if (!canEdit) {
    return (
      <Workspace icon={<FileText size={22} />} title="ออกใบเสนอราคาค่าสรรพสามิต" back={{ href: returnTo, label: "กลับ" }}>
        <div className={styles.emptyPanel}>ไม่มีสิทธิ์ออกใบเสนอราคา</div>
      </Workspace>
    );
  }

  const sourceOrder = preview?.sourceOrder || null;
  const sourceQuote = preview?.sourceQuote || null;
  const sourceDeal = preview?.sourceDeal || null;
  const warnings = preview?.warnings || [];
  const vatRate = Number(quote?.vatRate || 0);

  const summaryRows = quote ? [
    { id: "subtotal", label: "รวมรายการ", value: fmtMoney(quote.subtotal) },
    ...(vatRate > 0 ? [{ id: "vat", label: `VAT ${vatRate}%`, value: fmtMoney(quote.vatAmount) }] : []),
  ] : [];
  const readinessItems = [
    {
      id: "lines",
      label: "รายการค่าสรรพสามิต",
      detail: quote ? `${lines.length} รายการ จาก ${naText(sourceOrder?.orderNumber)}` : "กำลังคิดจากใบสั่งขาย",
      ready: lines.length > 0,
    },
  ];

  const rightRail = (
    <>
      <DocumentSummaryCard
        title="ยอดสุทธิใบเสนอราคา"
        total={quote ? fmtMoney(quote.totalAmount) : NA}
        rows={summaryRows}
      />
      <DocumentControlCard
        eyebrow="QUOTATION CONTROL"
        title="จัดการใบเสนอราคา"
        status="ฉบับใหม่"
        statusColor="var(--accent)"
        statusDescription="ตรวจรายการและแก้หัวใบให้เสร็จ แล้วกดบันทึกเป็นฉบับร่าง"
        notices={<DocumentReadinessList items={readinessItems} />}
        primaryAction={{
          id: "save",
          kind: "save",
          label: creating ? "กำลังบันทึก…" : "บันทึก",
          disabled: !quote || !lines.length,
          onClick: create,
        }}
        secondaryActions={[{
          id: "cancel",
          kind: "open",
          icon: null,
          label: "ยกเลิก",
          variant: "ghost",
          href: returnTo,
        }]}
        busy={creating}
        footer="เลขที่ใบเสนอราคาจะสร้างอัตโนมัติเมื่อบันทึก · ยื่นอนุมัติได้ที่หน้าใบ · ผู้อนุมัติ = เจ้าของดีลต้นทาง"
      />
    </>
  );

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="ออกใบเสนอราคาค่าสรรพสามิต"
      subtitle={quote ? `${naText(quote.customerName)} · ค่าสรรพสามิต · ${naText(sourceDeal?.title)}` : "คิดรายการจากใบสั่งขายของลูกค้า"}
      back={{ href: returnTo, label: "กลับ" }}
    >
      {loading && <SkeletonRows rows={7} />}
      {!loading && loadError && (
        <div className={styles.errorPanel} role="alert">
          {loadError.message}
          {loadError.quotationId ? <> · <Link href={`/sa/quotations/${encodeURIComponent(loadError.quotationId)}`} className="linklike">เปิดใบที่มีอยู่</Link></> : null}
        </div>
      )}
      {error && <div className={styles.errorPanel} role="alert">{error}</div>}

      {!loading && quote && (
        <DetailPageLayout aside={rightRail} asideLabel="สรุปและจัดการใบเสนอราคาค่าสรรพสามิตใหม่">
          <SalesDetailOverview
            eyebrow="FM-SA-01 · EXCISE TAX RECHARGE"
            title={naText(quote.customerName)}
            description={<span>ค่าสรรพสามิต · ดีลต้นทาง: {naText(sourceDeal?.title)}</span>}
            badges={<SalesStateBadge label="ฉบับใหม่" color="var(--accent)" />}
            facts={[
              { key: "quote-date", icon: CalendarDays, label: "วันที่ออกใบ", value: fmtDate(quoteDate) },
              { key: "valid-until", icon: CalendarDays, label: "ยืนราคาถึง", value: validUntil ? fmtDate(validUntil) : NA },
              { key: "tax", icon: CircleDollarSign, label: "ภาษี", value: vatRate > 0 ? `+ VAT ${vatRate}%` : "รวม VAT แล้ว" },
              { key: "items", icon: Package, label: "รายการ", value: `${lines.length} รายการ` },
            ]}
          />

          {/* ที่มา = SO ลูกค้า (ใบค่าสรรพสามิตไม่มีดีล) · ลูกค้า/ที่อยู่/ผู้ติดต่อลอกจากใบเสนอราคาต้นทาง — เปลี่ยนได้ที่หน้าใบหลังบันทึก
              การ์ดบริบทชุดเดียวกับหน้า SO ค่าสรรพสามิต ("ใบสั่งขายต้นทาง") */}
          <ContextGrid>
            <ContextCard
              icon={ClipboardList}
              href={sourceOrder?.id ? `/sa/sales-orders/${encodeURIComponent(sourceOrder.id)}` : undefined}
              eyebrow="ใบสั่งขายต้นทาง"
              title={naText(sourceOrder?.orderNumber)}
              subtitle="ใบสั่งขายของลูกค้าที่ใบนี้เก็บค่าสรรพสามิต"
              facts={[{ label: "ใบเสนอราคาต้นทาง", value: sourceQuote?.quoteNumber }]}
            />
            <ContextCard
              icon={Handshake}
              href={sourceDeal?.id ? `/sa/deals/${encodeURIComponent(sourceDeal.id)}` : undefined}
              eyebrow="ดีลต้นทาง"
              title={naText(sourceDeal?.title)}
              subtitle="ผู้เสนอราคาและผู้อนุมัติ = เจ้าของดีลนี้"
              facts={[{ label: "เจ้าของดีล", value: quote.metadata?.salesOwner || sourceDeal?.ownerName }]}
            />
            <ContextCard
              icon={Building2}
              eyebrow="ลูกค้าในเอกสาร"
              title={naText(quote.customerName)}
              subtitle={quote.billingAddress}
              facts={[
                { label: "เลขผู้เสียภาษี", value: quote.customerTaxId },
                { label: "ผู้ติดต่อ", value: [quote.contactName, quote.contactPhone].filter(Boolean).join(" · ") },
              ]}
            />
          </ContextGrid>

          <section className={`${styles.card} ${styles.documentMeta}`}>
            <label>วันที่ออกใบ<DateInput className={styles.documentDateInput} value={quoteDate} onChange={(value) => { setQuoteDate(value); setValidUntil(addValidityDays(value, validityDays)); }} required /></label>
            <label>ยืนราคาถึง<DateInput className={styles.documentDateInput} value={validUntil} onChange={(value) => { setValidUntil(value); setValidityDays(validityDaysBetween(quoteDate, value)); }} min={quoteDate || undefined} /></label>
            <label>กำหนดยืนราคา (จำนวนวัน)<Input type="number" min="1" step="1" className={styles.documentDateInput} value={validityDays} onChange={(event) => { const days = event.target.value; setValidityDays(days); setValidUntil(addValidityDays(quoteDate, days)); }} /></label>
            {/* ค่าตั้งต้น = "SO-… / QT-…" (มติ 29/10) — คนพิมพ์ทับแล้ว "คิดใหม่จากใบสั่งขาย" จะไม่เขียนทับ (exciseReferenceIsAuto) */}
            <label className={styles.referenceField}>เอกสารอ้างอิง
              <Input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} />
            </label>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeading}><Package size={17} /><h2>รายการค่าสรรพสามิต</h2><span>คิดจากใบสั่งขายต้นทาง — แก้ไม่ได้บนหน้านี้</span></div>
            {warnings.length > 0 && (
              <p className={styles.warnHint}>
                ยังไม่มีเลขทะเบียนสรรพสามิต: {warnings.map((warning) => warning.fgCode).filter(Boolean).join(" · ") || `${warnings.length} รายการ`} — ออกใบได้ ฝ่าย RA ขึ้นทะเบียนก่อนยื่นกรม
              </p>
            )}
            <QuotationLineItems lines={lines} editable={false} vatRate={vatRate} discountType={null} discountValue={0} />
          </section>

          <section className={styles.card}>
            <QuotationInstallments value={payment} onChange={setPayment} totalAmount={quote.totalAmount} />
          </section>

          <section className={styles.card}>
            <QuotationPaymentTerms value={payment} onChange={setPayment} />
          </section>

          <section className={styles.card}>
            <QuotationNotes
              value={notes}
              onChange={setNotes}
              presetVersionId={notesPresetVersionId}
              onPresetVersionIdChange={setNotesPresetVersionId}
            />
          </section>
        </DetailPageLayout>
      )}
    </Workspace>
  );
}

export default function NewExciseQuotationPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={7} />}>
      <NewExciseQuotationInner />
    </Suspense>
  );
}
