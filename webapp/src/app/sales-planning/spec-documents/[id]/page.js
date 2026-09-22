"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays, ClipboardCheck, ClipboardList, FileBadge, History, Images, ListChecks, Package,
  Pencil, Printer, Target, Undo2, UserRound,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReasonDialog from "@/components/ui/ReasonDialog";
import ReadableText from "@/components/ui/ReadableText";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import EmptyState from "@/components/ui/EmptyState";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDate, fmtDateTime, naText } from "@/lib/format";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { productBrandName, productDisplayName } from "@/lib/master/productIdentity";
import {
  DOC_REVISION_STATUS_LABELS, DOC_STATUS_LABELS, docReasonError, formatRevLabel,
} from "@/lib/sales/productSpecDocWorkflow";
import {
  DOC_REASON_ACTIONS, docActionDoneMessage, docApiAction, docConfirmPrompt, docContentSource,
  docContentSummary, docControlActions, docHeadline, docRailSteps, docReasonPrompt, docRevisionRows,
  docRevisionTone, productSpecPageHref, salesOrderHref,
} from "@/lib/sales/productSpecDocView";
import styles from "./page.module.css";

/**
 * หน้าเอกสาร FM-SA-04 ใบสเปคสินค้า — หนึ่งใบต่อหนึ่งบรรทัดใบสั่งขาย (mig 0370)
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md)
 *   · เลขที่ออกตอน AC กด "ออกเอกสาร" ที่หน้า SO (หลัง SO อนุมัติแล้ว) · เริ่ม Rev.00
 *   · เส้นอนุมัติ: AC ยื่น → AE เจ้าของดีลของ SO → AE Supervisor (ขั้นสุดท้าย) · admin กดแทนได้ทุกขั้น
 *   · แก้ก่อนอนุมัติครบ = Rev เดิม · อนุมัติครบแล้ว "แก้ไขเอกสาร" = Rev+1 เลขที่เดิม เดินด่านใหม่
 *
 * ⚠️ **ปุ่มทุกตัวมาจาก `actions` ที่ API คิดด้วย `documentActions`** — จอแค่วาด (docControlActions)
 * ⚠️ ทุกการกระทำผ่านโมดัลที่บอกผลลัพธ์ · ตีกลับ/แก้ไข/ยกเลิก ต้องมีเหตุผล (ข้อความอยู่ใน productSpecDocView)
 * ⚠️ action ถูกตีกลับ (4xx) = จอไม่ตรงกับของจริง ⇒ ดึงใบใหม่เงียบ ๆ (ไม่มีร่างบนหน้านี้ให้กลืน)
 */
export default function ProductSpecDocumentPage() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmKey, setConfirmKey] = useState(null);
  const [reasonKey, setReasonKey] = useState(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [liveSpec, setLiveSpec] = useState(null);
  const [liveError, setLiveError] = useState("");
  const [warning, setWarning] = useState("");

  const load = useCallback(async (opts) => {
    if (!opts?.background) setLoading(true);
    try {
      const next = await apiJson(`/api/sales-planning/spec-documents/${id}`, { fallbackError: "โหลดเอกสารไม่สำเร็จ" });
      setData(next);
      setLoadError("");
    } catch (fetchError) {
      // รอบเบื้องหลังที่ล้ม = เงียบ ไม่ทับของที่กำลังอ่าน
      if (!opts?.background) setLoadError(fetchError.message || "โหลดเอกสารไม่สำเร็จ");
    } finally {
      if (!opts?.background) setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // ผู้อนุมัติเปิดแท็บค้างไว้รอ — อีกคนกดไปก่อนแล้วต้องเห็นเมื่อกลับมามอง
  useRevalidateOnFocus(load);

  // ⚠️ ไม่ตั้งชื่อ `document` — ทับ global ของเบราว์เซอร์ในสโคปนี้
  const specDoc = data?.document || null;
  const latest = data?.latest || null;
  const revisions = data?.revisions || [];
  const product = data?.product || null;
  const salesOrder = data?.salesOrder || null;
  const dealOwner = data?.dealOwner || null;
  const source = docContentSource(latest);

  /* ร่าง/ถูกตีกลับ = แสดงสเปคสดจากหน้าสินค้า (ภาพนิ่งถ่ายตอนยื่น) — อ่านเส้นเดียวกับหน้าสเปค
     ⚠️ ผูกกับ `updatedAt` ของ Rev ด้วย: ยื่น/ดึงกลับแล้ว source สลับ ต้องอ่านใหม่ */
  const productId = product?.id || specDoc?.productId || null;
  useEffect(() => {
    if (source !== "live" || !productId) return undefined;
    let alive = true;
    (async () => {
      try {
        const next = await apiJson(`/api/products/${productId}/spec`, { fallbackError: "อ่านสเปคปัจจุบันของสินค้าไม่สำเร็จ" });
        if (alive) { setLiveSpec(next?.spec || null); setLiveError(""); }
      } catch (specError) {
        if (alive) setLiveError(specError.message || "อ่านสเปคปัจจุบันของสินค้าไม่สำเร็จ");
      }
    })();
    return () => { alive = false; };
  }, [source, productId, latest?.updatedAt]);

  const act = async (key, reason) => {
    setBusy(key);
    try {
      const next = await apiJson(`/api/sales-planning/spec-documents/${id}`, {
        method: "PATCH",
        json: { action: docApiAction(key), ...(reason ? { reason } : {}) },
        fallbackError: "ดำเนินการไม่สำเร็จ",
      });
      if (next?.document) setData(next);
      else load({ background: true });
      /* ⚠️ ทำสำเร็จแต่มีเรื่องที่ต้องรู้ (ตรึงกระดาษไม่สำเร็จ · อ่านกลับไม่ขึ้น) — API ส่ง `warning` มา
         ต้องขึ้นบนจอ ไม่ใช่กลืนไปกับ toast ว่าสำเร็จ */
      setWarning(next?.warning || "");
      notifyToast.success(docActionDoneMessage(key, { dealOwner: next?.dealOwner || dealOwner }));
    } catch (actionError) {
      // ⭐ ตีกลับ = มีคนกดไปก่อน/สถานะเปลี่ยน ⇒ ดึงใบใหม่ ปุ่มจะได้ตรงกับของจริง
      load({ background: true });
      throw actionError;
    } finally {
      setBusy("");
    }
  };

  const onAction = (key) => {
    if (DOC_REASON_ACTIONS.includes(key)) {
      setReasonKey(key);
      setReasonText("");
      setReasonError("");
    } else {
      setConfirmKey(key);
    }
  };

  // ⚠️ ส่ง `orphan` ด้วย — โมดัลยกเลิกของใบที่บรรทัดถูกถอดต้องไม่บอกว่า "บรรทัดนี้ออกใบใหม่ได้"
  //    (บรรทัดไม่มีแล้ว · ขัดกับแถบเตือนบนหน้าเดียวกัน) · เงื่อนไขเดียวกับแถบ `orphan` ข้างล่าง
  const reasonPrompt = reasonKey ? docReasonPrompt(reasonKey, {
    document: specDoc, latest, orphan: Boolean(specDoc) && specDoc.status !== "void" && !specDoc.salesOrderLineId,
  }) : null;
  const confirmPrompt = confirmKey ? docConfirmPrompt(confirmKey, {
    document: specDoc, latest, revisions, dealOwner,
  }) : null;

  const submitReason = async () => {
    const invalid = docReasonError(reasonText, { label: reasonPrompt?.label || "เหตุผล" });
    if (invalid) { setReasonError(invalid); return; }
    setReasonError("");
    try {
      await act(reasonKey, reasonText.trim());
      setReasonKey(null);
    } catch (actionError) {
      // ข้อความอยู่ในโมดัล — แถบของหน้าอยู่ใต้โมดัล (บทเรียน ReasonDialog 2026-08-19)
      setReasonError(actionError.message || "ดำเนินการไม่สำเร็จ");
    }
  };

  const back = salesOrder?.id
    ? { href: salesOrderHref(salesOrder.id), label: "กลับไปใบสั่งขาย" }
    : { href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" };

  if (loading && !data) {
    return <Workspace hideHeader back={back} loading>{null}</Workspace>;
  }
  if (!specDoc) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="เอกสาร FM-SA-04" back={back}>
        <StatusNotice tone="error">{loadError || "ไม่พบเอกสารนี้"}</StatusNotice>
      </Workspace>
    );
  }

  const isVoid = specDoc.status === "void";
  const headline = docHeadline({ document: specDoc, latest, dealOwner });
  const steps = docRailSteps({ document: specDoc, latest, dealOwner });
  const buttons = docControlActions({
    actions: data?.actions, document: specDoc, latest, onAction,
  });
  const summary = docContentSummary({ source, snapshot: latest?.snapshot, spec: liveSpec });
  const history = docRevisionRows(revisions, { documentId: specDoc.id });
  // Rev ที่ยังไม่ยื่น (ร่าง/ถูกตีกลับ) = เนื้อบนจอคือสเปคสด · ยื่นแล้วแก้สเปคไม่มีผลกับเอกสาร
  const liveDraft = !isVoid && ["draft", "rejected"].includes(latest?.status);
  /* "แก้สเปคที่หน้าสินค้า" — เฉพาะคนที่แก้สเปคได้ (API ส่ง `canEditSpec` มา) · หน้านี้เปิดได้ทุกคนที่เห็น SO
     (RD · FN · TS ...) ⇒ ไม่มีสิทธิ์ = ไม่แสดงปุ่ม (ui-visibility-rule) ไม่ใช่ปุ่มที่พาไปหน้าอ่านอย่างเดียว */
  const editSpecHref = liveDraft && data?.canEditSpec ? productSpecPageHref(productId) : null;
  const orphan = !isVoid && !specDoc.salesOrderLineId;
  const statusLabel = isVoid ? DOC_STATUS_LABELS.void : DOC_REVISION_STATUS_LABELS[latest?.status] || latest?.status;

  return (
    <Workspace hideHeader back={back}>
      <div className={styles.page}>
        <DetailOverview
          eyebrow="FM-SA-04 · PRODUCT SPECIFICATION"
          title={specDoc.docNo}
          description={[product?.fgCode, productDisplayName(product), productBrandName(product)].filter(Boolean).join(" · ") || "ใบสเปคสินค้า"}
          badges={<>
            <StatusBadge tone="neutral" label={formatRevLabel(latest?.revNo)} />
            <StatusBadge tone={isVoid ? "neutral" : docRevisionTone(latest?.status)} label={naText(statusLabel)} />
          </>}
          facts={[
            {
              icon: ClipboardList,
              label: "ใบสั่งขาย",
              value: salesOrder?.orderNumber || null,
              sub: salesOrder ? SALES_ORDER_STATUS_LABELS[salesOrder.status] || salesOrder.status : "ไม่ผูกใบสั่งขายแล้ว",
            },
            { icon: UserRound, label: "AE เจ้าของดีล", value: dealOwner?.name || null },
            {
              icon: History,
              label: "ฉบับที่ใช้",
              value: specDoc.currentRevNo === null || specDoc.currentRevNo === undefined
                ? "ยังไม่อนุมัติครบ"
                : formatRevLabel(specDoc.currentRevNo),
              tone: specDoc.currentRevNo === null || specDoc.currentRevNo === undefined ? "muted" : undefined,
            },
            {
              icon: CalendarDays,
              label: "ออกเอกสาร",
              value: specDoc.createdAt ? fmtDate(specDoc.createdAt) : null,
              sub: specDoc.createdByName ? `โดย ${specDoc.createdByName}` : null,
            },
          ]}
        />

        {warning ? (
          <StatusNotice tone="warning" onDismiss={() => setWarning("")}>{warning}</StatusNotice>
        ) : null}
        {isVoid ? (
          <StatusNotice tone="neutral" title="เอกสารนี้ถูกยกเลิกแล้ว — เลขที่ไม่นำกลับมาใช้">
            {specDoc.voidReason || "ไม่ได้ระบุเหตุผล"}
          </StatusNotice>
        ) : null}
        {orphan ? (
          <StatusNotice tone="warning" title="บรรทัดของใบสั่งขายที่เอกสารนี้อ้างถูกถอดแล้ว">
            ไม่มีสินค้าให้รับรองต่อ — ยกเลิกเอกสารใบนี้แทนการเดินด่าน
          </StatusNotice>
        ) : null}
        {latest?.status === "rejected" ? (
          <div className={styles.rejection}>
            <Undo2 size={17} aria-hidden="true" />
            <div>
              <strong>
                ตีกลับโดย {latest.rejectedByName || "ผู้อนุมัติ"}
                {latest.rejectedStage === "ae_supervisor" ? " (ขั้น AE Supervisor)" : latest.rejectedStage === "ae" ? " (ขั้น AE)" : ""}
                {latest.rejectedAt ? ` · ${fmtDate(latest.rejectedAt)}` : ""}
              </strong>
              <ReadableText text={latest.rejectionReason} lines={4} />
            </div>
          </div>
        ) : null}
        {liveDraft ? (
          <StatusNotice
            tone="info"
            action={editSpecHref
              ? <Button as={Link} href={editSpecHref} size="sm" variant="outline" icon={<Pencil size={13} />}>แก้สเปคที่หน้าสินค้า</Button>
              : null}
          >
            {liveDraftNotice(latest, Boolean(editSpecHref))}
          </StatusNotice>
        ) : null}

        <ContextGrid>
          <ContextCard
            icon={ClipboardList}
            href={salesOrderHref(salesOrder?.id) || undefined}
            eyebrow="ใบสั่งขาย"
            title={salesOrder?.orderNumber || null}
            subtitle={salesOrder ? "เอกสารนี้ออกจากบรรทัดของใบนี้" : "ใบสั่งขายถูกถอดออกจากเอกสารแล้ว"}
            facts={[{ label: "สถานะใบสั่งขาย", value: salesOrder ? SALES_ORDER_STATUS_LABELS[salesOrder.status] || salesOrder.status : null }]}
          />
          <ContextCard
            icon={Package}
            href={productSpecPageHref(productId) || undefined}
            eyebrow="สเปคสินค้า"
            title={product?.fgCode || null}
            subtitle={productDisplayName(product) || "สเปคของสินค้าที่เอกสารนี้อ้าง"}
            facts={[{ label: "แบรนด์", value: productBrandName(product) || null }]}
          />
        </ContextGrid>

        <DetailPageLayout
          controlFirst
          asideLabel="สถานะและการจัดการเอกสาร"
          aside={
            <DocumentControlCard
              icon={ClipboardCheck}
              eyebrow="DOCUMENT CONTROL"
              title="จัดการเอกสาร"
              headerNarrow="hide"
              tabletSplit
              status={headline.status}
              statusSub={headline.sub}
              statusColor={headline.color}
              statusDescription="AC ยื่น → AE เจ้าของดีลอนุมัติ → AE Supervisor อนุมัติขั้นสุดท้าย"
              workflowSteps={steps}
              busy={Boolean(busy)}
              primaryAction={buttons.primaryAction}
              secondaryActions={buttons.secondaryActions}
              dangerActions={buttons.dangerActions}
            />
          }
        >
          <DocumentContent summary={summary} source={source} latest={latest} liveError={liveError} />

          <DetailCard icon={History} eyebrow="REVISION HISTORY" title={`ประวัติ Rev. (${history.length})`}
            meta="ทุก Rev. พิมพ์ได้ — ฉบับที่อนุมัติครบแล้วพิมพ์จากกระดาษที่ตรึงไว้ตอนอนุมัติ">
            {history.length ? (
              <TableScroll family="list" surface="embedded">
                <table>
                  <thead>
                    <tr>
                      <th className={styles.colRev}>Rev.</th>
                      <th className={styles.colStatus}>สถานะ</th>
                      <th>เหตุผลที่แก้</th>
                      <th className={styles.colStamp}>AC ยื่น</th>
                      <th className={styles.colStamp}>AE อนุมัติ</th>
                      <th className={styles.colStamp}>AE Sup อนุมัติ</th>
                      <th className={styles.colPrint} aria-label="พิมพ์" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className="mono">{row.revLabel}</td>
                        <td>
                          <StatusBadge size="sm" tone={row.tone} label={row.statusLabel} />
                          {row.rejected ? <div className={styles.sub}>ตีกลับ: {row.rejected}</div> : null}
                        </td>
                        <td>{naText(row.reason)}</td>
                        <td>{naText(row.submitted)}</td>
                        <td>{naText(row.aeApproved)}</td>
                        <td>{naText(row.supApproved)}</td>
                        <td>
                          {row.printHref ? (
                            /* กระดาษเป็น HTML ทั้งหน้า — ลิงก์แท็บใหม่ ไม่ผ่าน apiFetch (ข้อยกเว้นเอกสารเดี่ยว) */
                            <Button as="a" href={row.printHref} target="_blank" rel="noopener noreferrer"
                              variant="ghost" size="sm" icon={<Printer size={13} />}>
                              พิมพ์
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <EmptyState plain><strong>ยังไม่มี Rev.</strong></EmptyState>
            )}
          </DetailCard>
        </DetailPageLayout>
      </div>

      <ConfirmDialog
        open={Boolean(confirmPrompt)}
        title={confirmPrompt?.title}
        description={confirmPrompt?.description}
        detail={confirmPrompt?.detail}
        confirmLabel={confirmPrompt?.confirmLabel}
        busy={Boolean(busy)}
        onConfirm={async () => { await act(confirmKey); setConfirmKey(null); }}
        onClose={() => setConfirmKey(null)}
      />

      <ReasonDialog
        open={Boolean(reasonPrompt)}
        title={reasonPrompt?.title}
        description={reasonPrompt?.description}
        detail={reasonPrompt?.detail}
        label={reasonPrompt?.label}
        placeholder={reasonPrompt?.placeholder}
        confirmLabel={reasonPrompt?.confirmLabel}
        tone={reasonPrompt?.tone}
        minLength={reasonPrompt?.minLength}
        maxLength={reasonPrompt?.maxLength}
        value={reasonText}
        onChange={(value) => { setReasonText(value); setReasonError(""); }}
        submitError={reasonError}
        busy={Boolean(busy)}
        onConfirm={submitReason}
        onClose={() => { if (!busy) setReasonKey(null); }}
      />
    </Workspace>
  );
}

/* เนื้อเอกสารแบบอ่านอย่างเดียว — ภาพนิ่งตอนยื่น หรือสเปคสด (ร่าง/ถูกตีกลับ)
   ⚠️ ไม่ใช่กระดาษ — กระดาษจริงอยู่ที่ปุ่มพิมพ์ · ที่นี่ให้ผู้อนุมัติอ่านสิ่งที่กำลังเซ็นได้โดยไม่ต้องเปิดแท็บใหม่ */
/* 🐞 Rev ที่ถูกตีกลับเคยขึ้นว่า "ยังไม่ได้ยื่น" ข้างใต้กล่อง "ตีกลับโดย …" — มันยื่นแล้ว ถูกประทับแล้ว
   แล้วค่อยถูกส่งคืน ⇒ ข้อความของสองสถานะต้องแยกกัน ("ยังไม่ได้ยื่น" ใช้กับร่างเท่านั้น) */
function liveRevLead(latest) {
  const rev = formatRevLabel(latest?.revNo);
  return latest?.status === "rejected" ? `${rev} ถูกตีกลับ` : `${rev} ยังไม่ได้ยื่น`;
}

function liveDraftNotice(latest, canEdit) {
  const lead = liveRevLead(latest);
  const body = latest?.status === "rejected"
    ? "เนื้อบนจอคือสเปคปัจจุบันของสินค้า ซึ่งจะถูกถ่ายลงเอกสารเมื่อยื่นใหม่"
    : "เนื้อเอกสารคือสเปคปัจจุบันของสินค้า ระบบถ่ายภาพนิ่งตอนยื่น";
  return `${lead} — ${body}${canEdit ? " · แก้ที่หน้าสินค้าแล้วกลับมายื่น" : ""}`;
}

function DocumentContent({ summary, source, latest, liveError }) {
  const captured = summary?.capturedAt ? ` ${fmtDateTime(summary.capturedAt)}` : "";
  const meta = source === "snapshot"
    ? `ภาพนิ่งตอนยื่น${captured} — แก้สเปคที่หน้าสินค้าหลังจากนี้ไม่เปลี่ยนเนื้อนี้`
    : `${liveRevLead(latest)} — แสดงสเปคปัจจุบันของสินค้า`;
  if (!summary) {
    return (
      <DetailCard icon={Target} eyebrow="CONTENT" title="เนื้อเอกสาร" meta={meta}>
        {liveError
          ? <StatusNotice tone="error">{liveError}</StatusNotice>
          : <EmptyState plain><strong>กำลังอ่านสเปคของสินค้า…</strong></EmptyState>}
      </DetailCard>
    );
  }
  const order = summary.order;
  return (
    <>
      <DetailCard icon={Target} eyebrow="CONTENT" title="เนื้อเอกสาร" meta={meta}>
        {order ? (
          <dl className={styles.facts}>
            <div><dt>ใบสั่งขาย</dt><dd>{naText(order.orderNumber)}</dd></div>
            <div><dt>ลูกค้า</dt><dd>{naText(order.customerName)}</dd></div>
            <div><dt>จำนวน</dt><dd>{order.qty === null ? naText(null) : `${order.qty}${order.unit ? ` ${order.unit}` : ""}`}</dd></div>
            <div><dt>กำหนดส่ง</dt><dd>{order.deliveryDueDate ? fmtDate(order.deliveryDueDate) : naText(null)}</dd></div>
            <div><dt>Contact for Sales</dt><dd>{naText(order.dealOwnerName)}</dd></div>
          </dl>
        ) : null}
        <dl className={styles.facts}>
          {summary.fields.map((field) => (
            <div key={field.key}><dt>{field.label}</dt><dd>{naText(field.value)}</dd></div>
          ))}
        </dl>
      </DetailCard>

      <DetailCard icon={ListChecks} eyebrow="CHECKLIST PROJECT" title={`Checklist บรรจุภัณฑ์ (${summary.items.length})`}>
        {summary.items.length ? (
          <TableScroll family="list" surface="embedded">
            <table>
              <thead>
                <tr>
                  <th className={`num ${styles.colNo}`}>ลำดับ</th>
                  <th className={styles.colItem}>สิ่งที่ต้องเตรียม</th>
                  <th>รายละเอียด</th>
                  <th className={styles.colBy}>ผู้จัดเตรียม</th>
                  <th className={styles.colNote}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((row) => (
                  <tr key={`${row.no}-${row.label}`}>
                    <td className="num">{row.no}</td>
                    <td>{naText(row.label)}</td>
                    <td>{naText(row.detail)}</td>
                    <td>{naText(row.preparedBy)}</td>
                    <td>{naText(row.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : <EmptyState plain><strong>ไม่มีแถว checklist</strong></EmptyState>}
      </DetailCard>

      <DetailCard icon={FileBadge} eyebrow="CERTIFICATION & DOCUMENTS" title="เอกสารที่ขอได้">
        {summary.certifications.length ? (
          <TableScroll family="list" surface="embedded">
            <table>
              <thead>
                <tr>
                  <th className={styles.colCert}>เอกสาร</th>
                  <th className={styles.colCertStatus}>สถานะ</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {summary.certifications.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td>{naText(row.label)}</td>
                    <td>{row.statusLabel}</td>
                    <td>{naText(row.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : <EmptyState plain><strong>ไม่มีรายการเอกสาร</strong></EmptyState>}
      </DetailCard>

      <DetailCard icon={Images} eyebrow="ILLUSTRATIONS" title="ภาพประกอบ"
        meta={summary.illustrations ? `${summary.illustrations.length} ภาพในภาพนิ่ง` : "ภาพชุดปัจจุบันอยู่ที่หน้าสเปคของสินค้า — ถ่ายลงเอกสารตอนยื่น"}>
        {summary.illustrations?.length ? (
          <ol className={styles.captionList}>
            {summary.illustrations.map((row) => (
              <li key={row.no}>{row.caption || <span className={styles.sub}>ไม่มีคำบรรยาย ({naText(row.fileName)})</span>}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.sub}>
            {summary.illustrations ? "ภาพนิ่งนี้ไม่มีภาพประกอบ" : "ดูและจัดลำดับภาพได้ที่หน้าสเปคของสินค้า"}
          </p>
        )}
      </DetailCard>
    </>
  );
}
