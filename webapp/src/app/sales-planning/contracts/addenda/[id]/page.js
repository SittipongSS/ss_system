"use client";

// หน้ารายละเอียดบันทึกเพิ่มเติมสัญญา (mig 0282)
//
// โครงเดียวกับหน้าสัญญา — ปุ่มระดับใบอยู่ในการ์ดจัดการที่เดียว (ม-49/ม-57)
// ⚠️ ตารางสูตรแก้ในใบไม่ได้: มันถูกตรึงมาจากคำร้องตอนสร้าง ⇒ ผิดเมื่อไรให้ลบร่างแล้วทำใหม่
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileSignature, FileStack, FileText, Printer, X } from "lucide-react";
import SaWorkspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import StatusNotice from "@/components/ui/StatusNotice";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import RecordControlCard from "@/components/ui/RecordControlCard";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { TableScroll } from "@/components/ui/Table";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDate, naText, NA } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { ADDENDUM_DOC_TITLE, canSignAddendum } from "@/lib/sales/contractAddenda";
import { buildAddendumLifecycle } from "@/lib/sales/addendumLifecycle";
import styles from "./page.module.css";

export default function AddendumDetailPage() {
  const { id } = useParams();
  const canView = useCan("salesplan:view");
  const canEditCap = useCan("salesplan:edit");
  const { user } = useRole();

  const [addendum, setAddendum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signDate, setSignDate] = useState("");
  const [signFileId, setSignFileId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales-planning/addenda/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "โหลดบันทึกไม่สำเร็จ");
      setAddendum(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const canEdit = !!addendum?.canEdit && canEditCap;
  const lifecycle = useMemo(() => buildAddendumLifecycle({ canEdit }), [canEdit]);

  const act = async (path, body, okMessage) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-planning/addenda/${id}${path}`, {
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
    if (transitionId === "issue") return act("/issue", {}, "ออกบันทึกแล้ว");
    if (transitionId === "cancel") return act("/cancel", { reason: values.reason }, "ยกเลิกบันทึกแล้ว");
    return false;
  };

  const submitSign = async () => {
    if (!signDate) { notifyToast.error("ระบุวันที่ลงนาม"); return; }
    if (!signFileId) { notifyToast.error("แนบไฟล์บันทึกที่ลงนามแล้วก่อน"); return; }
    const done = await act("/sign", { signedDate: signDate, signedFileId: signFileId }, "บันทึกการลงนามแล้ว");
    if (done) setSignOpen(false);
  };

  const handleAttachments = useCallback((items) => {
    const signed = (items || []).find((item) => item.docType === "signed_addendum");
    setSignFileId(signed?.id || "");
  }, []);

  if (!canView) {
    return <AccessDenied icon={<FileStack size={22} />} title="บันทึกเพิ่มเติมสัญญา" message="บัญชีนี้ยังไม่มีสิทธิ์อ่านเอกสารของสายขาย" back="/sa/contracts" />;
  }

  if (loading || !addendum) {
    return (
      <SaWorkspace icon={<FileStack size={22} />} title="บันทึกเพิ่มเติมสัญญา">
        {error
          ? <StatusNotice tone="error" title="เปิดบันทึกไม่สำเร็จ">{error}</StatusNotice>
          : <StatusNotice tone="info" title="กำลังโหลด…">กำลังดึงข้อมูลบันทึก</StatusNotice>}
      </SaWorkspace>
    );
  }

  return (
    <SaWorkspace
      icon={<FileStack size={22} />}
      title={`${ADDENDUM_DOC_TITLE} ครั้งที่ ${addendum.addendumNo}`}
      subtitle={naText(addendum.contract?.customerName)}
    >
      <DetailPageLayout
        controlFirst
        asideLabel="สถานะและการจัดการบันทึก"
        aside={(
          <>
            <RecordControlCard
              lifecycle={lifecycle}
              record={addendum}
              user={user}
              busy={busy}
              onTransition={onTransition}
              extraActions={[
                {
                  id: "print",
                  label: addendum.docNo ? "เปิดเอกสารเพื่อพิมพ์" : "ดูตัวอย่างฉบับร่าง",
                  kind: "print",
                  icon: Printer,
                  slot: "secondary",
                  onClick: () => window.open(`/api/sales-planning/addenda/${id}/document`, "_blank", "noopener"),
                },
                {
                  id: "sign",
                  label: "บันทึกการลงนาม",
                  kind: "submit",
                  icon: FileSignature,
                  slot: "primary",
                  visible: canEdit && canSignAddendum(addendum),
                  onClick: () => { setSignDate(""); setSignOpen(true); },
                },
              ]}
              notices={(
                <>
                  {addendum.status === "cancelled" && addendum.cancelReason ? (
                    <span className="ui-badge danger">เหตุผลที่ยกเลิก: {addendum.cancelReason}</span>
                  ) : null}
                </>
              )}
            />
            <ContextGrid>
              <ContextCard
                icon={FileSignature}
                eyebrow="สัญญาแม่"
                title={addendum.contract?.contractNo}
                href={addendum.contractId ? `/sa/contracts/${addendum.contractId}` : undefined}
                facts={[
                  { label: "วันที่สัญญา", value: fmtDate(addendum.contract?.contractDate) },
                  { label: "ลงนามเมื่อ", value: fmtDate(addendum.contract?.signedDate) },
                ]}
              />
              <ContextCard
                icon={FileText}
                eyebrow="คำร้องที่อ้างถึง"
                title={addendum.requestDocNo}
                href={addendum.requestId ? `/requests/${addendum.requestId}` : undefined}
                facts={[{ label: "จำนวนสูตร", value: `${addendum.lines?.length || 0} สูตร` }]}
              />
            </ContextGrid>
          </>
        )}
      >
        <DetailCard
          icon={FileStack}
          title="รายละเอียดบันทึก"
          meta={`เลขที่ ${addendum.docNo || "ยังไม่ออก"} · วันที่ ${fmtDate(addendum.addendumDate)}`}
        >
          <dl className={styles.factList}>
            <div><dt>ครั้งที่</dt><dd>{addendum.addendumNo}</dd></div>
            <div><dt>ทำบันทึกที่</dt><dd>{naText(addendum.fields?.addendumPlace)}</dd></div>
            <div><dt>ผู้ลงนามฝ่ายผู้รับจ้าง</dt><dd>{naText(addendum.fields?.contractorSignerName)}</dd></div>
          </dl>

          {/* ⚠️ ตารางนี้ตรึงมาจากคำร้องตอนสร้าง — แก้ในใบไม่ได้โดยเจตนา
              ผิดเมื่อไรให้ลบร่างแล้วสร้างใหม่จากคำร้องที่ถูกต้อง */}
          <TableScroll surface="embedded"><table className="w-full text-sm">
            <thead><tr><th>ลำดับ</th><th>ชื่อสูตร</th><th>รหัสสูตร</th><th>วันที่สูตร</th></tr></thead>
            <tbody>
              {(addendum.lines || []).map((line) => (
                <tr key={`${line.seq}-${line.code}`} className="premium-row">
                  <td>{line.seq}</td>
                  <td>{naText(line.name)}</td>
                  <td className="mono">{naText(line.code)}</td>
                  <td className="mono">{line.formulaDate ? fmtDate(line.formulaDate) : NA}</td>
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        </DetailCard>

        <DetailCard icon={FileText} title="ไฟล์ของบันทึก" meta="อัปโหลดฉบับที่ลูกค้าเซ็นแล้วที่นี่">
          <AttachmentsPanel
            entityType="contract_addendum"
            entityId={addendum.id}
            canEdit={canEdit}
            title="ไฟล์แนบบันทึก"
            note="ฉบับที่ลงนามแล้วให้เลือกชนิด “บันทึกที่ลงนามแล้ว”"
            onItemsChange={handleAttachments}
          />
        </DetailCard>

        {signOpen && (
          <DetailCard icon={FileSignature} title="บันทึกการลงนาม" meta="กรอกวันที่บนบันทึกที่ลูกค้าเซ็นกลับมา">
            <div className="form-grid">
              <label className="form-field">
                <span className="form-field-label">วันที่ลงนาม <span className="required-mark">*</span></span>
                <DateInput value={signDate} onChange={setSignDate} disabled={busy} />
              </label>
              <div className="form-field">
                <span className="form-field-label">ไฟล์ฉบับลงนาม <span className="required-mark">*</span></span>
                <span className="hint">
                  {signFileId ? "ใช้ไฟล์ชนิด “บันทึกที่ลงนามแล้ว” ที่แนบไว้ด้านบน" : "ยังไม่มีไฟล์ — แนบที่การ์ดด้านบนก่อน"}
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

        <div className={styles.backLink}>
          <Link href={`/sa/contracts/${addendum.contractId}`} className="linklike">← กลับไปที่สัญญา</Link>
        </div>
      </DetailPageLayout>
    </SaWorkspace>
  );
}
