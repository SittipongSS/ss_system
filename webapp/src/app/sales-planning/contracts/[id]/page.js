"use client";

// หน้ารายละเอียดสัญญา (mig 0278)
//
// โครงหน้าตามหน้าเอกสารอื่นของสายขาย: เนื้อซ้าย · การ์ดจัดการที่รางขวา
// (`controlFirst` เพื่อให้จอแคบเห็นสถานะ+ปุ่มก่อนเนื้อ — เหตุผลอยู่ที่ DetailPage.js)
//
// ⚠️ ปุ่มระดับใบอยู่ที่ **การ์ดจัดการที่เดียว** (ม-49/ม-57) — ห้ามวาดปุ่มซ้ำในเนื้อ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileSignature, FileText, Handshake, Pencil, Printer, X } from "lucide-react";
import SaWorkspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import RecordControlCard from "@/components/ui/RecordControlCard";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ContractFormFields from "@/components/salesPlanning/ContractFormFields";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDate, naText, NA } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import {
  canSignContract, contractKindLabel, daysAwaitingSignature, isContractEditable,
} from "@/lib/sales/contracts";
import { buildContractLifecycle } from "@/lib/sales/contractLifecycle";
import { contractTemplateFields, missingContractFields } from "@/lib/sales/contractTemplates";
import styles from "./page.module.css";

export default function ContractDetailPage() {
  const { id } = useParams();
  const canView = useCan("salesplan:view");
  const canEditCap = useCan("salesplan:edit");
  const { user } = useRole();

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fields: {}, contractDate: "" });
  const [signOpen, setSignOpen] = useState(false);
  const [signDate, setSignDate] = useState("");
  const [signFileId, setSignFileId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-planning/contracts/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "โหลดสัญญาไม่สำเร็จ");
      setContract(data);
      setForm({ fields: { ...(data.fields || {}) }, contractDate: data.contractDate || "" });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const canEdit = !!contract?.canEdit && canEditCap;
  const templateFields = useMemo(() => contractTemplateFields(contract?.kind), [contract?.kind]);
  const lifecycle = useMemo(() => buildContractLifecycle({ canEdit }), [canEdit]);

  // ช่องบังคับที่ยังว่าง — บอกตั้งแต่ก่อนกดออกสัญญา ไม่ใช่ให้ API ตอบ 400 ทีหลัง
  const missing = useMemo(
    () => (contract ? missingContractFields(contract.kind, contract.fields) : []),
    [contract],
  );

  const act = async (path, body, okMessage) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-planning/contracts/${id}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ดำเนินการไม่สำเร็จ");
      notifyToast.success(okMessage);
      await load();
      return true;
    } catch (err) {
      notifyToast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onTransition = async (transitionId, values = {}) => {
    if (transitionId === "issue") return act("/issue", {}, "ออกสัญญาแล้ว");
    if (transitionId === "cancel") return act("/cancel", { reason: values.reason }, "ยกเลิกสัญญาแล้ว");
    return false;
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-planning/contracts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: form.fields, contractDate: form.contractDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      notifyToast.success("บันทึกร่างสัญญาแล้ว");
      setEditing(false);
      await load();
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitSign = async () => {
    if (!signDate) { notifyToast.error("ระบุวันที่ลงนาม"); return; }
    if (!signFileId) { notifyToast.error("แนบไฟล์สัญญาที่ลงนามแล้วก่อน"); return; }
    const done = await act("/sign", { signedDate: signDate, signedFileId: signFileId }, "บันทึกการลงนามแล้ว");
    if (done) setSignOpen(false);
  };

  /* ⚠️ ต้องเป็น callback ที่ identity คงที่ — `AttachmentsPanel` เรียก `onItemsChange`
     ใน effect ที่มี dependency เป็นตัวฟังก์ชัน ถ้าสร้างใหม่ทุกเรนเดอร์ effect จะยิงซ้ำ
     ทุกรอบ (รอดมาได้เพราะ setState ค่าเดิมไม่ทำให้เรนเดอร์ใหม่ — พึ่งความบังเอิญนั้นไม่ได้) */
  const handleAttachments = useCallback((items) => {
    const signed = (items || []).find((item) => item.docType === "signed_contract");
    setSignFileId(signed?.id || "");
  }, []);

  const openDocument = () => {
    window.open(`/api/sales-planning/contracts/${id}/document`, "_blank", "noopener");
  };

  if (!canView) {
    return <AccessDenied icon={<FileSignature size={22} />} title="สัญญา" message="บัญชีนี้ยังไม่มีสิทธิ์อ่านเอกสารของสายขาย" back="/sa/contracts" />;
  }

  if (loading || !contract) {
    return (
      <SaWorkspace icon={<FileSignature size={22} />} title="สัญญา">
        {error
          ? <StatusNotice tone="error" title="เปิดสัญญาไม่สำเร็จ">{error}</StatusNotice>
          : <StatusNotice tone="info" title="กำลังโหลด…">กำลังดึงข้อมูลสัญญา</StatusNotice>}
      </SaWorkspace>
    );
  }

  const waitingDays = daysAwaitingSignature(contract);

  return (
    <SaWorkspace
      icon={<FileSignature size={22} />}
      title={`${contractKindLabel(contract.kind)} ${contract.contractNo || "(ฉบับร่าง)"}`}
      subtitle={naText(contract.customerName)}
    >
      <DetailPageLayout
        controlFirst
        asideLabel="สถานะและการจัดการสัญญา"
        aside={(
          <>
            <RecordControlCard
              lifecycle={lifecycle}
              record={contract}
              user={user}
              busy={busy}
              onTransition={onTransition}
              extraActions={[
                {
                  id: "print",
                  label: contract.contractNo ? "เปิดเอกสารเพื่อพิมพ์" : "ดูตัวอย่างฉบับร่าง",
                  kind: "print",
                  icon: Printer,
                  slot: "secondary",
                  onClick: openDocument,
                },
                {
                  id: "sign",
                  label: "บันทึกการลงนาม",
                  kind: "submit",
                  icon: FileSignature,
                  slot: "primary",
                  visible: canEdit && canSignContract(contract),
                  onClick: () => { setSignDate(""); setSignOpen(true); },
                },
                {
                  id: "edit",
                  label: editing ? "ปิดโหมดแก้ไข" : "แก้ไขร่าง",
                  kind: "edit",
                  icon: editing ? X : Pencil,
                  slot: "secondary",
                  visible: canEdit && isContractEditable(contract),
                  onClick: () => setEditing((on) => !on),
                },
              ]}
              notices={(
                <>
                  {/* ⚠️ บอกก่อนกด ไม่ใช่ให้ API ตอบ 400 ทีหลัง */}
                  {missing.length && isContractEditable(contract) ? (
                    <span className="ui-badge ui-badge-warn">ยังกรอกไม่ครบ: {missing.join(" · ")}</span>
                  ) : null}
                  {contract.status === "awaiting_signature" ? (
                    <span className={`ui-badge${waitingDays > 14 ? ` ${styles.late}` : ""}`}>
                      รอฉบับลงนามมา {waitingDays ?? 0} วัน
                    </span>
                  ) : null}
                  {contract.status === "cancelled" && contract.cancelReason ? (
                    <span className="ui-badge danger">เหตุผลที่ยกเลิก: {contract.cancelReason}</span>
                  ) : null}
                </>
              )}
            />
            <ContextGrid>
              <ContextCard
                icon={Handshake}
                eyebrow="ดีล"
                title={contract.deal?.title}
                href={contract.deal?.id ? `/sa/deals/${contract.deal.id}` : undefined}
                facts={[
                  { label: "ลูกค้า", value: contract.customerName },
                  { label: "ผู้ดูแล", value: contract.ownerName },
                ]}
              />
              <ContextCard
                icon={FileText}
                eyebrow="ใบเสนอราคาที่อ้างถึง"
                title={contract.quotation?.quoteNumber || contract.metadata?.quoteNumber}
                href={contract.quotationId ? `/sa/quotations/${contract.quotationId}` : undefined}
                facts={[{
                  label: "สถานะอนุมัติ",
                  value: contract.quotation?.approvalStatus === "approved" ? "อนุมัติแล้ว" : NA,
                }]}
              />
            </ContextGrid>
          </>
        )}
      >
        <DetailCard
          icon={FileSignature}
          title="ข้อมูลบนสัญญา"
          meta={`${contractKindLabel(contract.kind)} · ${contract.contractNo || "ยังไม่ออกเลขที่"}`}
          actions={(
            <div className={styles.badgeRow}>
              {contractKindBadge(contract.kind)}
              {contractStatusBadge(contract.status)}
            </div>
          )}
        >
          {editing ? (
            <>
              <ContractFormFields
                fields={templateFields}
                values={form.fields}
                contractDate={form.contractDate}
                disabled={busy}
                onPatch={(patch) => setForm((current) => ({ ...current, fields: { ...current.fields, ...patch } }))}
                onContractDate={(value) => setForm((current) => ({ ...current, contractDate: value }))}
              />
              <div className="form-actions">
                <div className="form-actions-buttons">
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setForm({ fields: { ...(contract.fields || {}) }, contractDate: contract.contractDate || "" });
                    }}
                    disabled={busy}
                  >
                    ยกเลิก
                  </Button>
                  <Button variant="accent" onClick={save} disabled={busy}>บันทึกร่าง</Button>
                </div>
              </div>
            </>
          ) : (
            <dl className={styles.factList}>
              <div><dt>วันที่สัญญา</dt><dd>{fmtDate(contract.contractDate)}</dd></div>
              {templateFields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{naText(contract.fields?.[field.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </DetailCard>

        {/* ⭐ ไฟล์ฉบับลงนามอยู่ในการ์ดไฟล์แนบตัวเดียวกับที่ทั้งระบบใช้ — ไม่ทำท่ออัปโหลด
            ของตัวเอง เพราะจะได้ทางอัปไฟล์ที่สองที่ไม่ผ่านด่านเดียวกับของเดิม */}
        <DetailCard icon={FileText} title="ไฟล์ของสัญญา" meta="อัปโหลดฉบับที่ลูกค้าเซ็นแล้วที่นี่">
          <AttachmentsPanel
            entityType="contract"
            entityId={contract.id}
            canEdit={canEdit}
            title="ไฟล์แนบสัญญา"
            note="ฉบับที่ลงนามแล้วให้เลือกชนิด “สัญญาที่ลงนามแล้ว”"
            onItemsChange={handleAttachments}
          />
        </DetailCard>

        {signOpen && (
          <DetailCard icon={FileSignature} title="บันทึกการลงนาม" meta="กรอกวันที่บนสัญญาที่ลูกค้าเซ็นกลับมา">
            <div className="form-grid">
              <label className="form-field">
                <span className="form-field-label">วันที่ลงนาม <span className="required-mark">*</span></span>
                <DateInput value={signDate} onChange={setSignDate} disabled={busy} />
              </label>
              <div className="form-field">
                <span className="form-field-label">ไฟล์ฉบับลงนาม <span className="required-mark">*</span></span>
                <span className="hint">
                  {signFileId
                    ? "ใช้ไฟล์ชนิด “สัญญาที่ลงนามแล้ว” ที่แนบไว้ในการ์ดด้านบน"
                    : "ยังไม่มีไฟล์ — แนบที่การ์ด “ไฟล์ของสัญญา” ด้านบนก่อน"}
                </span>
              </div>
            </div>
            <div className="form-actions">
              <div className="form-actions-buttons">
                <Button onClick={() => setSignOpen(false)} disabled={busy}>ปิด</Button>
                <Button variant="accent" onClick={submitSign} disabled={busy || !signFileId}>บันทึกการลงนาม</Button>
              </div>
            </div>
          </DetailCard>
        )}

        {contract.status === "signed" && (
          <DetailCard icon={FileSignature} title="การลงนาม">
            <dl className={styles.factList}>
              <div><dt>วันที่ลงนาม</dt><dd>{fmtDate(contract.signedDate)}</dd></div>
              <div><dt>เริ่มมีผล</dt><dd>{fmtDate(contract.effectiveDate)}</dd></div>
              <div><dt>สิ้นสุด</dt><dd>{contract.expiryDate ? fmtDate(contract.expiryDate) : NA}</dd></div>
              <div><dt>ไฟล์ฉบับลงนาม</dt><dd>{naText(contract.signedFile?.fileName)}</dd></div>
            </dl>
          </DetailCard>
        )}

        <div className={styles.backLink}>
          <Link href="/sa/contracts" className="linklike">← กลับไปทะเบียนสัญญา</Link>
        </div>
      </DetailPageLayout>
    </SaWorkspace>
  );
}
