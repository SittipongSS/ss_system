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
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, ClipboardList, FileCheck2, FileText, FolderKanban, Handshake, MapPin, Package, Wallet,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { QuotationReadOnlyLineItems } from "@/components/salesPlanning/QuotationLineItems";
import SalesOrderConfirmationFields from "@/components/salesPlanning/SalesOrderConfirmationFields";
import AlertBanner from "@/components/ui/AlertBanner";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import { useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { branchLabel } from "@/lib/master/thaiAddress";
import { customerHeadline } from "@/lib/master/customerAr";
import { previewInstallments } from "@/lib/sales/salesOrderPayments";
import { validateOrderConfirmation, MAX_CONFIRM_ATTACHMENTS } from "@/lib/sales/orderConfirmationDocs";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { describeResponseError } from "@/lib/fetchError";
import AccessDenied from "@/components/ui/AccessDenied";
import styles from "./page.module.css";

const EMPTY_CONFIRMATION = { docType: "", docNo: "", docDate: "", attachments: [] };

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
  const [confirmation, setConfirmation] = useState(EMPTY_CONFIRMATION);
  const [confirmFiles, setConfirmFiles] = useState([]);
  const [dues, setDues] = useState({});           // { [seq]: 'YYYY-MM-DD' }
  const [firstPaid, setFirstPaid] = useState(false);
  const [firstPaidOn, setFirstPaidOn] = useState("");
  const [firstFiles, setFirstFiles] = useState([]);

  useEffect(() => {
    if (!quotationId) { setLoading(false); setError("ไม่ได้ระบุใบเสนอราคาต้นทาง"); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sales-planning/quotations/${quotationId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await describeResponseError(res, "โหลดใบเสนอราคาไม่สำเร็จ"));
        const data = await res.json();
        if (!alive) return;
        setQuote(data);
        setNotes(data?.notes || "");
      } catch (e) {
        if (alive) setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [quotationId]);

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
  const blockedReason = !confirmationCheck.ok ? confirmationCheck.error : paymentError;

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

      const res = await fetch("/api/sales-planning/sales-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotationId,
          referenceDoc: referenceDoc.trim() || null,
          notes,
          confirmation: confirmation.docType
            ? { ...confirmation, attachments: confirmAttachments }
            : null,
          installments: plannedInstallments
            .filter((row) => dues[row.seq])
            .map((row) => ({ seq: row.seq, dueDate: dues[row.seq] })),
          firstPayment: firstPaid ? { paidOn: firstPaidOn, evidence: firstEvidence } : null,
        }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "สร้างใบสั่งขายไม่สำเร็จ"));
      const data = await res.json();
      router.push(`/sa/sales-orders/${data.id}`);
    } catch (e) {
      // ⚠️ ล้มแล้วต้องเก็บกวาดไฟล์ที่อัปไปแล้ว ไม่งั้นไฟล์ลอยค้างใน bucket โดยไม่มีใบไหนอ้าง
      await Promise.allSettled(uploaded.map((att) => fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...att, entityType: "sales_order_confirmation", entityId: quotationId }),
      })));
      setError(e.message || "สร้างใบสั่งขายไม่สำเร็จ");
      setCreating(false);
    }
  }, [blockedReason, confirmFiles, firstFiles, uploadOne, quotationId, referenceDoc, notes, confirmation, plannedInstallments, dues, firstPaid, firstPaidOn, router]);

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
          { id: "payment", label: "บัญชีตรวจการชำระ", hint: "ทีละงวดตามหลักฐานที่แนบ" },
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
        <ContextCard
          icon={Building2}
          href={quote.customerId ? `/database/customers/${quote.customerId}` : undefined}
          eyebrow="ลูกค้า"
          title={naText(customerHeadline(quote.customerName, quote.customer?.arCode))}
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
              <TableScroll family="editable" surface="auto" cells="stacked" minWidth={620}>
                <table className={styles.planTable}>
                  <thead>
                    <tr>
                      <th className={styles.colSeq}>งวด</th>
                      <th>รายละเอียด</th>
                      <th className={`num ${styles.colPercent}`}>%</th>
                      <th className={`num ${styles.colAmount}`}>ยอด</th>
                      <th className={styles.colDue}>กำหนดชำระ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plannedInstallments.map((row) => (
                      <tr key={row.seq}>
                        <td>{row.seq}</td>
                        <td>{row.label}</td>
                        <td className="num">{row.percent}</td>
                        <td className="num">{fmtMoney(row.amount)}</td>
                        <td>
                          <DateInput
                            value={dues[row.seq] || ""} disabled={creating}
                            onChange={(next) => setDues((prev) => ({ ...prev, [row.seq]: next }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>

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
                  ระบบจะส่งให้บัญชีตรวจเองตอนนั้น
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
