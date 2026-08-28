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
import { TableShell } from "@/components/ui/Table";
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
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import ApproveDialog from "@/components/excise/ApproveDialog";
import RejectDialog from "@/components/excise/RejectDialog";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { customerDocTypes } from "@/lib/master/attachmentTypes";
import { brandLabel } from "@/lib/master/brands";
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

export default function RegistrationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("products:edit");
  const canApprove = useCan("legal:approve");

  /* ⭐ อ่าน **ใบเดียว** พร้อมของประกอบ (สินค้า/ลูกค้า/โครงการ/ใบยื่นที่อ้างถึง)
     🐞 ของเดิมโหลดทะเบียนทั้งตารางแล้ว find(id) + โหลด /api/products (342 แถว) และ
     /api/customers (508 แถว) เต็มทั้งคู่ เพื่อใช้แถวเดียว */
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const load = useCallback(async (opts) => {
    if (!opts?.background) setLoading(true);
    try {
      const res = await fetch(`/api/excise-registrations/${id}?full=1`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "โหลดทะเบียนไม่สำเร็จ");
      setS(await res.json());
      setLoadError(null);
    } catch (e) {
      if (!opts?.background) setLoadError(e?.message || "โหลดทะเบียนไม่สำเร็จ");
    } finally {
      if (!opts?.background) setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // ใบที่เปิดค้างไว้ต้องรู้เองว่าอีกฝั่งอนุมัติ/ตีกลับไปแล้ว — ไม่ต้องรอให้ผู้ใช้ F5
  useRevalidateOnFocus(load);
  const reload = useCallback(() => load(), [load]);

  const taxProduct = s?.product || null;
  const customer = s?.customer || null;

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
  const { data: products } = useApiList(pickerReady ? "/api/products" : null);
  const { data: customers } = useApiList(pickerReady ? "/api/customers" : null);
  const { data: allRegs } = useApiList(pickerReady ? "/api/excise-registrations" : null);
  const openForm = () => { setPickerReady(true); setFormOpen(true); };

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
    fetch(`/api/excise-registrations/${s.id}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setReq(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [s?.id, attachItems, custItems]);
  const missingDocs = (req?.missing || []).map((m) => m.label);
  const warnings = req?.warnings || [];

  const patch = async (body, failMessage) => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || failMessage);
    await reload();
  };
  const submitDraft = () => patch({ status: "pending_legal" }, "ยื่นไม่สำเร็จ");
  const resubmit = () => patch({ status: "pending_legal" }, "ส่งกลับไม่สำเร็จ");
  // ปลดอนุมัติ = สิทธิ์ฝ่ายกฎหมาย + ต้องมีเหตุผล (มติ B2 2026-07-27) — ทะเบียนคือหลักฐาน
  // ที่ใบยื่นชำระภาษีอ้างถึง การปลดจึงต้องหนักเท่ากับด่านอื่นในระบบ ไม่ใช่กดผ่านเงียบ ๆ
  const revokeApproval = (reason) => patch({ status: "draft", reason }, "ไม่สามารถปลดอนุมัติได้");
  const rejectReg = (reason) => patch({ status: "rejected", rejectionReason: reason }, "ไม่สามารถทำรายการได้");
  const doDelete = async () => {
    const res = await fetch(`/api/excise-registrations/${s.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถลบได้");
    router.push("/tax/registrations");
  };

  const back = { href: "/tax/registrations", label: "กลับไปหน้าทะเบียน" };

  if (!loading && !s) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ไม่พบรายการ" subtitle="ทะเบียนนี้อาจถูกลบไปแล้ว" back={back}>
        <div className="cell-quiet">{loadError || "ไม่พบทะเบียนที่ต้องการ"}</div>
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
    { id: "review", label: "ฝ่ายกฎหมายตรวจ", hint: "ตรวจข้อมูลและเอกสารประกอบ" },
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
                  { id: "customer", label: "ลูกค้า", value: naText(s.customerName) },
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
            <StatusNotice tone="error" title="ฝ่ายกฎหมายตีกลับ">{s.rejectionReason}</StatusNotice>
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
              <Field label="ลูกค้า" full>{s.customerName}</Field>
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
              ⭐ ฝ่ายกฎหมายกดอนุมัติโดยเห็นแค่ "ภาษี/ชิ้น" ตัวเดียวมาตลอด — ไม่เห็นว่า
              คิดจากราคาไหน อัตราเท่าไร ⇒ ตรวจไม่ได้จริงว่าเลขถูกหรือเปล่า
              ⚠️ อัตรามาจาก **สินค้า** เสมอ ทะเบียนไม่เก็บสำเนา (mig 0180) ราคาขายปลีก
              ขยับเมื่อไร ตัวเลขตรงนี้ขยับตามทันที */}
          <DetailCard icon={Calculator} eyebrow="TAX BASE" title="ฐานคิดภาษีสรรพสามิต"
            meta={exempt ? "ทะเบียนนี้ได้รับยกเว้นภาษี" : `อัตรารวม ${pct(EXCISE_TOTAL_RATE)} ของราคาขายปลีกถอด VAT`}>
            {exempt ? (
              <div className={styles.exemptNote}>
                ฝ่ายกฎหมายกำหนดให้ทะเบียนนี้ <b className={styles.exemptWord}>ยกเว้นภาษี</b> — ภาษีต่อชิ้นเป็น 0 เพราะได้รับยกเว้นจริง ไม่ใช่เพราะข้อมูลขาด
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
                ฝ่ายกฎหมายกำหนดเอง: {s.taxableOverride ? "ต้องเสียภาษี" : "ยกเว้นภาษี"} (ไม่ได้ใช้ค่าตามพิกัดอัตโนมัติ)
              </div>
            )}
          </DetailCard>

          {s.status === "draft" && req && (
            <div className="flex flex-col gap-2">
              <StatusNotice tone={missingDocs.length ? "warning" : "success"}>
                {missingDocs.length
                  ? `ยังขาดเอกสารที่จำเป็น: ${missingDocs.join(", ")} — แนบให้ครบก่อนกด “ยื่นขึ้นทะเบียน”`
                  : "เอกสารที่จำเป็นครบแล้ว — กด “ยื่นขึ้นทะเบียน” เพื่อส่งให้ฝ่ายกฎหมายตรวจ"}
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
                title={`เอกสารลูกค้า${customer?.name ? ` — ${customer.name}` : ""} (ฐานข้อมูลเดียวกับหน้าลูกค้า)`}
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
              <TableShell>
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
                      <tr key={f.id} className="clickable-row" onClick={() => router.push(`/tax/filings/${f.id}`)}>
                        <td className="font-semibold">{naText(f.quotationRef)}</td>
                        <td className={styles.numeric}>{fmtNumber(f.quantity)}</td>
                        <td className={styles.numeric}>{fmtMoney(f.totalTax)}</td>
                        <td><StatusBadge status={f.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            ) : null}
          </DetailCard>

          {/* เธรดกลาง (mig 0163) — เธรดสองฝ่าย SA ↔ LG · `rejectionReason` ถูกล้าง
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        registration={s}
        products={products}
        customers={customers}
        registrations={allRegs}
      />
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
