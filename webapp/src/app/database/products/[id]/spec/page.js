"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardCheck, ExternalLink, History } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import {
  DocumentControlCard, DocumentReadinessList, DocumentSummaryCard,
} from "@/components/ui/DocumentControlPanel";
import ProductSpecForm from "@/components/database/ProductSpecForm";
import { useRole } from "@/lib/roleContext";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { fmtDate, naText } from "@/lib/format";
import { approvalPrompt } from "@/lib/approvalPrompt";
import { productDisplayName } from "@/lib/master/productIdentity";
import { SPEC_CONTENT_FIELDS } from "@/lib/sales/productSpecStore";
import { SPEC_ISSUE_STATUS_LABELS, SPEC_REVISION_STATUS_LABELS } from "@/lib/sales/productSpecWorkflow";
import styles from "./page.module.css";
import {
  revLabel, specControlActions, specFormBlocker, specReadiness,
  specStatusColor, specStatusHeadline, specWorkflowSteps,
} from "@/lib/sales/productSpecView";

const emptyForm = () => Object.fromEntries(SPEC_CONTENT_FIELDS.map((key) => [key, ""]));

export default function ProductSpecPage() {
  const { id } = useParams();
  const role = useRole();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [items, setItems] = useState([]);
  const [certs, setCerts] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const spec = data?.spec || null;
  const revisions = data?.revisions || [];
  const latest = revisions[0] || null;
  const issues = data?.issues || [];
  const product = data?.product || null;
  const readOnly = Boolean(specFormBlocker(latest, role));

  /* ⚠️ โหลดใหม่ = ทิ้งร่างที่ยังไม่บันทึกทิ้งทั้งชุด ⇒ เรียกเฉพาะหลังบันทึก/หลังก้าว
     ไม่ใช่ทุกครั้งที่ render (ของที่พิมพ์ค้างอยู่ต้องไม่หายใต้มือคนกรอก) */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiJson(`/api/products/${id}/spec`, { fallbackError: "โหลดใบสเปคไม่สำเร็จ" });
      setData(next);
      const rev = next?.revisions?.[0] || null;
      setForm(rev
        ? Object.fromEntries(SPEC_CONTENT_FIELDS.map((key) => [key, rev[key] || ""]))
        : emptyForm());
      setItems(rev?.items || []);
      setCerts(Array.isArray(rev?.certifications) ? rev.certifications : []);
      setDirty(false);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "โหลดใบสเปคไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setField = (key, value) => { setForm((prev) => ({ ...prev, [key]: value })); setDirty(true); };
  const updateItems = (next) => { setItems(next); setDirty(true); };
  const updateCerts = (next) => { setCerts(next); setDirty(true); };

  const act = async (action, extra = {}) => {
    setBusy(action);
    setError("");
    try {
      const res = await apiFetch(`/api/products/${id}/spec`, {
        method: "PATCH",
        json: { action, ...extra },
        fallbackError: "ดำเนินการไม่สำเร็จ",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "ดำเนินการไม่สำเร็จ");
      await load();
      return payload;
    } catch (actionError) {
      setError(actionError.message || "ดำเนินการไม่สำเร็จ");
      throw actionError;
    } finally {
      setBusy("");
    }
  };

  const save = () => act("save", { ...form, items, certifications: certs });

  const create = async () => {
    setBusy("create");
    setError("");
    try {
      const res = await apiFetch(`/api/products/${id}/spec`, {
        method: "POST", json: {}, fallbackError: "สร้างใบสเปคไม่สำเร็จ",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "สร้างใบสเปคไม่สำเร็จ");
      await load();
    } catch (createError) {
      setError(createError.message || "สร้างใบสเปคไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  /* ⚠️ ทุกก้าวที่เป็นการรับรองต้องมีโมดัลบอกผลลัพธ์ (กฎ approval-confirm-modals) —
     ไม่ใช่ปุ่มที่กดแล้วเกิดขึ้นเลย · `approvalPrompt` บังคับให้บอกอย่างน้อยหนึ่งผล */
  const askSubmit = () => setConfirmState({
    ...approvalPrompt({
      title: "ส่งใบสเปคให้ AE ตรวจ",
      verb: "ส่ง",
      subject: `${revLabel(latest?.revNo)} ของ ${productDisplayName(product)}`,
      effects: [
        "ใบย้ายไปรออยู่ที่ AE เจ้าของดีล — คุณยังดึงกลับมาแก้ได้",
        "ร่างที่บันทึกไว้คือสิ่งที่ AE จะเห็น",
      ],
      confirmLabel: "ส่งให้ AE ตรวจ",
    }),
    onConfirm: () => act("submit"),
  });

  const askReview = () => setConfirmState({
    ...approvalPrompt({
      title: "ตรวจผ่าน · ส่งต่อ AE Supervisor",
      verb: "ยืนยัน",
      subject: `${revLabel(latest?.revNo)} ของ ${productDisplayName(product)}`,
      effects: [
        "ชื่อคุณขึ้นเป็นผู้ตรวจบนเอกสาร",
        "ใบย้ายไปรออนุมัติที่หัวหน้าฝ่ายขาย",
      ],
      confirmLabel: "ตรวจผ่าน",
    }),
    onConfirm: () => act("review"),
  });

  const askApprove = () => setConfirmState({
    ...approvalPrompt({
      title: "อนุมัติใบสเปคสินค้า",
      subject: `${revLabel(latest?.revNo)} ของ ${productDisplayName(product)}`,
      effects: [
        `สเปกของสินค้าชิ้นนี้กลายเป็น ${revLabel(latest?.revNo)} ทุกที่ที่อ่านค่านี้`,
        "ลักษณะเนื้อสารและบรรจุภัณฑ์มาตรฐานถูกเขียนลงทะเบียนสินค้า",
        "ฉบับก่อนกลายเป็นอ่านอย่างเดียว (ยังเปิดย้อนได้)",
        "เอกสารที่ออกไว้ตอนฉบับยังเป็นร่างกลายเป็นฉบับจริงพร้อมกัน",
      ],
      checklist: [
        "checklist บรรจุภัณฑ์ตรงกับที่ตกลงกับลูกค้าแล้ว",
        "ลักษณะเนื้อสารและบรรจุภัณฑ์มาตรฐานถูกต้อง (สองช่องนี้ลงทะเบียนสินค้า)",
      ],
      confirmLabel: "อนุมัติใบสเปค",
    }),
    onConfirm: () => act("approve"),
  });

  const askWithdraw = () => setConfirmState({
    ...approvalPrompt({
      title: "ดึงกลับมาแก้ไข",
      verb: "ดึงกลับ",
      subject: `${revLabel(latest?.revNo)} ของ ${productDisplayName(product)}`,
      effects: [
        "ใบกลับเป็นร่าง — คนที่รอตรวจ/รออนุมัติจะไม่เห็นในคิวอีก",
        "รอยการส่งและการตรวจถูกล้าง ต้องส่งใหม่ทั้งเส้น",
      ],
      confirmLabel: "ดึงกลับมาแก้ไข",
    }),
    onConfirm: () => act("withdraw"),
  });

  const askNewRevision = () => setConfirmState({
    ...approvalPrompt({
      title: "ออกฉบับใหม่",
      verb: "ออกฉบับใหม่",
      subject: `${productDisplayName(product)} — ${revLabel((latest?.revNo || 0) + 1)}`,
      effects: [
        `เกิดฉบับร่าง ${revLabel((latest?.revNo || 0) + 1)} โดยยกค่าจากฉบับปัจจุบันมาทั้งหมด`,
        `${revLabel(latest?.revNo)} ยังเป็นสเปกที่ใช้อยู่จนกว่าฉบับใหม่จะผ่านการอนุมัติ`,
        "ต้องเดินด่าน AC → AE → AE Sup ใหม่ทั้งสามขั้น",
      ],
      confirmLabel: "ออกฉบับใหม่",
    }),
    onConfirm: () => act("new-revision"),
  });

  const actions = useMemo(() => specControlActions({
    spec,
    revision: latest,
    role,
    dirty,
    onCreate: create,
    onSubmit: askSubmit,
    onReview: askReview,
    onApprove: askApprove,
    onReject: () => { setRejectReason(""); setRejectOpen(true); },
    onWithdraw: askWithdraw,
    onNewRevision: askNewRevision,
    onPrint: () => {},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [spec, latest, role, dirty, product]);

  const headline = specStatusHeadline(spec, latest);
  const back = { href: `/database/products/${id}`, label: "กลับไปหน้าสินค้า" };

  if (!loading && !product && error) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="ใบสเปคสินค้า" back={back}>
        <StatusNotice tone="error">{error}</StatusNotice>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={`ใบสเปคสินค้า · ${naText(product?.fgCode)}`}
      subtitle={product ? `${productDisplayName(product)} — FM-SA-04` : "FM-SA-04"}
      back={back}
      loading={loading && !data}
    >
      {error ? <div className={styles.notice}><StatusNotice tone="error">{error}</StatusNotice></div> : null}
      {data?.scopeReason ? (
        <div className={styles.notice}><StatusNotice tone="info" title="สินค้าชิ้นนี้อยู่นอกขอบเขตของใบสเปค">{data.scopeReason}</StatusNotice></div>
      ) : null}

      <DetailPageLayout
        controlFirst
        asideLabel="จัดการใบสเปคสินค้า"
        aside={<>
          <DocumentControlCard
            icon={ClipboardCheck}
            eyebrow="SPEC CONTROL"
            title="จัดการใบสเปค"
            headerNarrow="hide"
            tabletSplit
            status={headline.status}
            statusSub={headline.sub}
            statusColor={headline.color}
            statusDescription={spec ? `ออกเอกสารมาแล้ว ${issues.length} ครั้ง` : "หนึ่งสินค้าหนึ่งใบตลอดอายุ"}
            workflowSteps={specWorkflowSteps(latest)}
            busy={Boolean(busy)}
            notices={<p className={`form-note ${styles.railNote}`}>
              ภาพประกอบและเอกสารที่พิมพ์ออกจะมาในรอบถัดไป
            </p>}
            primaryAction={actions.primaryAction}
            secondaryActions={actions.secondaryActions}
            dangerActions={actions.dangerActions}
          >
            {latest && !readOnly ? (
              <Button tone="primary" onClick={save} disabled={!dirty || Boolean(busy)} className={styles.saveButton}>
                {busy === "save" ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
              </Button>
            ) : null}
            {readOnly && latest ? (
              <p className={`form-note ${styles.railNote}`}>{specFormBlocker(latest, role)}</p>
            ) : null}
          </DocumentControlCard>

          {latest ? (
            <DocumentSummaryCard
              title="ความพร้อมของใบ"
              status={SPEC_REVISION_STATUS_LABELS[latest.status]}
              statusLabel="สถานะฉบับ"
              statusColor={specStatusColor(latest.status)}
            >
              <DocumentReadinessList items={specReadiness({ ...latest, items })} />
            </DocumentSummaryCard>
          ) : null}
        </>}
      >
        {spec && latest ? (
          <ProductSpecForm
            product={product}
            revision={latest}
            form={form}
            onField={setField}
            items={items}
            onItems={updateItems}
            certs={certs}
            onCerts={updateCerts}
            readOnly={readOnly}
          />
        ) : (
          <DetailCard icon={ClipboardCheck} eyebrow="FM-SA-04" title="สินค้าชิ้นนี้ยังไม่มีใบสเปค">
            <p className={styles.intro}>
              ใบสเปคเป็นใบของสินค้า หนึ่งสินค้าหนึ่งใบตลอดอายุ — กดสร้างใบที่แผงจัดการ
              แล้วกรอกสเปกกับ checklist บรรจุภัณฑ์ · เวลาขายรอบใหม่จะออกเอกสารจากใบนี้
              ได้เลยโดยไม่ต้องกรอกซ้ำ
            </p>
          </DetailCard>
        )}

        {issues.length ? (
          <DetailCard
            icon={History}
            eyebrow="ISSUE HISTORY"
            title={`ประวัติการออกเอกสาร (${issues.length})`}
            meta="แถวคือครั้งที่ออกเอกสาร ไม่ใช่ใบคนละใบ — คอลัมน์สเปกบอก Rev. ณ ตอนออก"
          >
            <TableScroll family="list" surface="embedded">
              <table>
                <thead>
                  <tr>
                    <th className={styles.colDoc}>เลขที่เอกสาร</th>
                    <th className={styles.colRev}>สเปก</th>
                    <th className={styles.colOrder}>ออกตาม</th>
                    <th className={styles.colStatus}>สถานะ</th>
                    <th className={`num ${styles.colQty}`}>จำนวน</th>
                    <th className={`num ${styles.colDue}`}>กำหนดส่ง</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id}>
                      <td className="mono">{issue.docNo}</td>
                      <td>{revLabel(issue.revNo)}</td>
                      <td className="mono">{naText(issue.orderNumber)}</td>
                      <td>{SPEC_ISSUE_STATUS_LABELS[issue.status] || issue.status}</td>
                      <td className="num">{naText(issue.qty)}</td>
                      <td className="num">{issue.deliveryDueDate ? fmtDate(issue.deliveryDueDate) : naText(null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </DetailCard>
        ) : null}

        {revisions.length > 1 ? (
          <DetailCard icon={History} eyebrow="REVISION HISTORY" title={`ประวัติสเปก (${revisions.length} ฉบับ)`}>
            <TableScroll family="list" surface="embedded">
              <table>
                <thead>
                  <tr>
                    <th className={styles.colRevNo}>ฉบับ</th>
                    <th className={styles.colRevStatus}>สถานะ</th>
                    <th className={styles.colApprover}>ผู้อนุมัติ</th>
                    <th className={`num ${styles.colApprovedAt}`}>วันที่อนุมัติ</th>
                    <th>เหตุผลที่ตีกลับ</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((row) => (
                    <tr key={row.id}>
                      <td>{revLabel(row.revNo)}</td>
                      <td>{SPEC_REVISION_STATUS_LABELS[row.status] || row.status}</td>
                      <td>{naText(row.approvedByName)}</td>
                      <td className="num">{row.approvedAt ? fmtDate(row.approvedAt) : naText(null)}</td>
                      <td>{naText(row.rejectionReason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </DetailCard>
        ) : null}

        <DetailCard icon={ExternalLink} eyebrow="RELATED" title="ที่มาของข้อมูลบนใบ">
          <ul className={styles.sourceList}>
            <li>ชื่อลูกค้า · แบรนด์ · รหัสสินค้า · ขนาดบรรจุ · กลิ่น ←{" "}
              <Link href={`/database/products/${id}`}>ทะเบียนสินค้า</Link></li>
            <li>เลขที่ใบสั่งขาย · จำนวน · กำหนดส่ง ← ตรึงลงเอกสารตอนออกแต่ละครั้ง</li>
            <li>สเปก · checklist · เอกสารที่ขอได้ ← กรอกที่ใบนี้</li>
          </ul>
        </DetailCard>
      </DetailPageLayout>

      {confirmState ? (
        <ConfirmDialog
          open
          title={confirmState.title}
          message={confirmState.message}
          detail={confirmState.detail}
          confirmLabel={confirmState.confirmLabel}
          busy={Boolean(busy)}
          onConfirm={async () => { await confirmState.onConfirm(); setConfirmState(null); }}
          onClose={() => setConfirmState(null)}
        />
      ) : null}

      <ConfirmDialog
        open={rejectOpen}
        title="ตีกลับให้แก้ไข"
        message={`${revLabel(latest?.revNo)} ของ ${productDisplayName(product)}`}
        detail="ใบกลับไปเป็นร่างให้ผู้จัดทำแก้ แล้วส่งเข้ามาใหม่ได้ — เหตุผลจะขึ้นบนใบให้คนแก้เห็น"
        confirmLabel="ตีกลับ"
        danger
        busy={Boolean(busy)}
        onConfirm={async () => { await act("reject", { reason: rejectReason.trim() }); setRejectOpen(false); }}
        onClose={() => setRejectOpen(false)}
      >
        <label>
          <span>เหตุผลที่ตีกลับ (อย่างน้อย 10 ตัวอักษร)</span>
          <Textarea rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}
            placeholder="เช่น ขวดในรายการที่ 2 ยังไม่ตรงกับตัวอย่างที่ลูกค้าอนุมัติ" />
        </label>
      </ConfirmDialog>
    </Workspace>
  );
}
