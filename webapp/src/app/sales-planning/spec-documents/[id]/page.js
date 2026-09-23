"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays, ClipboardCheck, ClipboardList, History, Package, Pencil, Printer, Undo2, UserRound,
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
import SpecDocumentContent from "@/components/salesPlanning/SpecDocumentContent";
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
  DOC_DELETE_KEY, DOC_REASON_ACTIONS, docActionDoneMessage, docApiAction, docConfirmPrompt,
  docContentSource, docContentSummary, docControlActions, docHeadline, docRailSteps, docReasonPrompt,
  docRevisionRows, docRevisionTone, lineRemovedNotice, productSpecPageHref, salesOrderHref,
} from "@/lib/sales/productSpecDocView";
import { formatSpecDocNo } from "@/lib/sales/productSpecDocNo";
import styles from "./page.module.css";

/**
 * หน้าเอกสาร FM-SA-04 ใบสเปคสินค้า — หนึ่งใบต่อหนึ่งบรรทัดใบสั่งขาย (mig 0370)
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md)
 *   · เลขที่ออกตอน AC กด "บันทึก" ที่หน้าออกเอกสาร (`spec-documents/new` · เปิดจากการ์ดหน้า SO หลัง SO อนุมัติแล้ว
 *     · มติ 23/09 "ยังไม่ต้องรันอะไร จนกว่าจะบันทึก") · เริ่ม Rev.00
 *   · เส้นอนุมัติ: AC ยื่น → AE เจ้าของดีลของ SO → AE Supervisor (ขั้นสุดท้าย) · admin กดแทนได้ทุกขั้น
 *   · แก้ก่อนอนุมัติครบ = Rev เดิม · อนุมัติครบแล้ว "แก้ไขเอกสาร" = Rev+1 เลขที่เดิม เดินด่านใหม่
 *
 * ⚠️ **ปุ่มทุกตัวมาจาก `actions` ที่ API คิดด้วย `documentActions`** — จอแค่วาด (docControlActions)
 * ⚠️ ทุกการกระทำผ่านโมดัลที่บอกผลลัพธ์ · ตีกลับ/แก้ไข/ยกเลิก ต้องมีเหตุผล (ข้อความอยู่ใน productSpecDocView)
 * ⚠️ action ถูกตีกลับ (4xx) = จอไม่ตรงกับของจริง ⇒ ดึงใบใหม่เงียบ ๆ (ไม่มีร่างบนหน้านี้ให้กลืน)
 */
export default function ProductSpecDocumentPage() {
  const { id } = useParams();
  const router = useRouter();

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

  /* ⚠️ คืนใบที่โหลดได้กลับไปด้วย (`null` = โหลดไม่ขึ้น) — ผู้เรียกบางรายต้องตัดสินใจต่อจาก
     **ปุ่มของข้อมูลชุดใหม่** ไม่ใช่จากชุดที่ค้างอยู่บนจอ (ดู `removeDraft`) · setState เป็น
     async ⇒ อ่าน `data` ทันทีหลัง `await load()` จะได้ค่าเก่า */
  const load = useCallback(async (opts) => {
    if (!opts?.background) setLoading(true);
    try {
      const next = await apiJson(`/api/sales-planning/spec-documents/${id}`, { fallbackError: "โหลดเอกสารไม่สำเร็จ" });
      setData(next);
      setLoadError("");
      return next;
    } catch (fetchError) {
      // รอบเบื้องหลังที่ล้ม = เงียบ ไม่ทับของที่กำลังอ่าน
      if (!opts?.background) setLoadError(fetchError.message || "โหลดเอกสารไม่สำเร็จ");
      return null;
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

  /* ลบร่าง = `DELETE` ไม่ใช่ `PATCH { action }` (แถวหายทั้งใบ ไม่ใช่การเปลี่ยนสถานะ) ⇒ ทางของตัวเอง
     ⚠️ ห้ามเปิด `retry` — คำขอที่ไม่ได้คำตอบอาจลบไปแล้ว รอบสองจะได้ 404 แล้วจอจะบอกว่า
        "ไม่พบเอกสาร" ทั้งที่ลบสำเร็จ (กฎ apiFetch: DELETE ไม่ลองใหม่เอง)
     ⚠️ ลบแล้วเอกสารนี้ไม่มีอยู่อีก — ห้าม `load()` ซ้ำ (จะได้ 404 แล้วจอขึ้น "ไม่พบเอกสารนี้"
        แทน toast) ⇒ เด้งกลับหน้าใบสั่งขายทันที · การ์ดเอกสารบนหน้านั้นโหลดใหม่เองตอน mount */
  const removeDraft = async () => {
    setBusy(DOC_DELETE_KEY);
    try {
      const result = await apiJson(`/api/sales-planning/spec-documents/${id}`, {
        method: "DELETE",
        fallbackError: "ลบร่างไม่สำเร็จ",
      });
      // บรรทัดถูกถอด = ไม่มีบรรทัดให้ออกใบใหม่ ⇒ toast ต้องพูดเรื่องเดียวกับโมดัลที่เพิ่งกดผ่านมา
      notifyToast.success(docActionDoneMessage(DOC_DELETE_KEY, { orphan: lineRemoved }));
      const orderId = result?.salesOrderId || salesOrder?.id || null;
      /* ⚠️ **ไม่คืน `busy` ตรงนี้โดยตั้งใจ** — แถวถูกลบไปแล้ว หน้านี้กำลังถูกถอดทิ้ง
         การปลดปุ่ม/ปิดโมดัลคือ setState บนหน้าที่ไม่มีอะไรให้ทำต่อ (และเปิดช่องให้กดซ้ำ
         จนได้ 404 ระหว่างรอ router) ⇒ ปล่อยค้างเป็นสถานะ "กำลังพาไปหน้าใบสั่งขาย" */
      router.replace(orderId ? salesOrderHref(orderId) : "/sa/sales-orders");
    } catch (deleteError) {
      /* ⭐ ลบไม่ผ่าน = มีคนยื่นไปก่อน/ใบเปลี่ยนสภาพ ⇒ ดึงใบใหม่ ปุ่มจะได้ตรงกับของจริง
         🔴 **ใบชุดใหม่ลบไม่ได้แล้ว = ต้องปิดโมดัลด้วย** — ปล่อยไว้คือจอที่ยังพิมพ์ผลลัพธ์
            ของการลบ ("บรรทัดใบสั่งขายนี้ว่างอีกครั้ง…") คร่อมข้อความที่บอกว่าลบไม่ได้ และ
            ปุ่ม "ลบร่างนี้" ยังกดซ้ำได้ ทั้งที่การ์ดข้างหลังไม่มีปุ่มนั้นแล้ว — สวนกฎ
            ui-visibility-rule ที่ productSpecDocWorkflow.js ประกาศไว้เอง (ปุ่มที่ซ่อนแล้ว
            ต้องกดไม่ได้) · เหตุผลจริงของเซิร์ฟเวอร์ย้ายไปอยู่บนแถบของหน้าแทน */
      const next = await load({ background: true });
      setBusy("");
      if (next && next.actions?.remove?.visible === false) {
        setConfirmKey(null);
        setWarning(deleteError.message || "ลบร่างไม่สำเร็จ");
        return;
      }
      throw deleteError;
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

  // ⚠️ ส่ง `orphan` ด้วย — โมดัลยกเลิก/ลบของใบที่บรรทัดถูกถอดต้องไม่บอกว่า "บรรทัดนี้ออกใบใหม่ได้"
  //    (บรรทัดไม่มีแล้ว · ขัดกับแถบเตือนบนหน้าเดียวกัน) · เงื่อนไขเดียวกับแถบ `orphan` ข้างล่าง
  const lineRemoved = Boolean(specDoc) && specDoc.status !== "void" && !specDoc.salesOrderLineId;
  const reasonPrompt = reasonKey ? docReasonPrompt(reasonKey, {
    document: specDoc, latest, orphan: lineRemoved,
  }) : null;
  const confirmPrompt = confirmKey ? docConfirmPrompt(confirmKey, {
    document: specDoc, latest, revisions, dealOwner, orphan: lineRemoved,
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
  const history = docRevisionRows(revisions, { documentId: specDoc.id, docNo: specDoc.docNo });
  /* ⭐ เลขที่รูปเดียวกับกระดาษ DDMMYY-XXX-RR ของ Rev ล่าสุด (มติ 22/09) · eyebrow = **เลขที่เต็มในฐาน**
     (FM-SA-04-DDMMYY-XXX) — บอกแบบฟอร์ม และเป็นรูปเดียวที่ลิงก์อัตโนมัติ (docRefs `FM`) / `/go/` รู้จัก
     🐞 ผลตรวจรอบสอง: หลังเปลี่ยนเป็นรูปใหม่ ไม่มีจอไหนโชว์เลขเต็มให้ก๊อปไปวางในเธรดเลย */
  const docNoText = formatSpecDocNo(specDoc.docNo, latest?.revNo);
  // Rev ที่ยังไม่ยื่น (ร่าง/ถูกตีกลับ) = เนื้อบนจอคือสเปคสด · ยื่นแล้วแก้สเปคไม่มีผลกับเอกสาร
  const liveDraft = !isVoid && ["draft", "rejected"].includes(latest?.status);
  /* "แก้สเปคที่หน้าสินค้า" — เฉพาะคนที่แก้สเปคได้ (API ส่ง `canEditSpec` มา) · หน้านี้เปิดได้ทุกคนที่เห็น SO
     (RD · FN · TS ...) ⇒ ไม่มีสิทธิ์ = ไม่แสดงปุ่ม (ui-visibility-rule) ไม่ใช่ปุ่มที่พาไปหน้าอ่านอย่างเดียว */
  const editSpecHref = liveDraft && data?.canEditSpec ? productSpecPageHref(productId) : null;
  /* แถบเตือนกับโมดัล (ยกเลิก/ลบ) ต้องใช้เงื่อนไขเดียวกันเสมอ · เนื้อแถบชี้ปุ่มปลายทางที่ใบนี้มีจริง
     (มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" — ร่างที่ไม่เคยยื่นมีแต่ "ลบร่าง" ⇒ ห้ามบอกให้ไปกดยกเลิก)
     · ส่ง `actions` ของคนดูด้วย — คนที่ไม่มีปุ่มปลายทาง (AE/RD/FN …) ได้ "รอ AC …" ไม่ใช่คำสั่งให้กดปุ่มที่ตัวเองไม่มี */
  const orphan = lineRemoved ? lineRemovedNotice({ document: specDoc, latest, actions: data?.actions }) : null;
  const statusLabel = isVoid ? DOC_STATUS_LABELS.void : DOC_REVISION_STATUS_LABELS[latest?.status] || latest?.status;

  return (
    <Workspace hideHeader back={back}>
      <div className={styles.page}>
        <DetailOverview
          eyebrow={`${specDoc.docNo || "FM-SA-04"} · รายละเอียดผลิตภัณฑ์ (Product Spec)`}
          title={docNoText}
          description={[product?.fgCode, productDisplayName(product), productBrandName(product)].filter(Boolean).join(" · ") || "รายละเอียดผลิตภัณฑ์"}
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
          <StatusNotice tone="warning" title={orphan.title}>{orphan.body}</StatusNotice>
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
        {/* ⚠️ บรรทัดถูกถอด = ยื่นไม่ได้ตลอดกาล ⇒ ไม่ขึ้นแถบ "แก้ที่หน้าสินค้าแล้วกลับมายื่น" คู่กับแถบที่บอกให้ลบ/ยกเลิก
            (สองแถบสั่งคนละทาง · ลิงก์ไปหน้าสเปคยังอยู่ที่การ์ด "สเปคสินค้า" ข้างล่าง) */}
        {liveDraft && !lineRemoved ? (
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
          <SpecDocumentContent summary={summary} meta={contentMeta(summary, source, latest)} liveError={liveError} />

          <DetailCard icon={History} eyebrow="REVISION HISTORY" title={`ประวัติ Rev. (${history.length})`}
            meta="ทุก Rev. พิมพ์ได้ — ฉบับที่อนุมัติครบแล้วพิมพ์จากกระดาษที่ตรึงไว้ตอนอนุมัติ">
            {history.length ? (
              <TableScroll family="list" surface="embedded">
                <table>
                  <thead>
                    <tr>
                      <th className={styles.colRev}>เลขที่</th>
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
                        <td>
                          <div className="mono">{row.docNoText || row.revLabel}</div>
                          <div className={styles.sub}>{row.revLabel}</div>
                        </td>
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
        tone={confirmPrompt?.tone || "default"}
        busy={Boolean(busy)}
        /* ลบร่างเดินคนละเส้นกับการกระทำอื่น (DELETE ไม่ใช่ PATCH) และไม่ปิดโมดัลเองเมื่อสำเร็จ
           เพราะหน้าถูกเปลี่ยนไปที่ใบสั่งขายแล้ว — ปิดหลังจากนั้นคือ setState บนหน้าที่กำลังถูกถอด
           ⚠️ ทางล้มปิดโมดัลเองได้ (อยู่ใน `removeDraft`) เมื่อใบชุดใหม่ลบไม่ได้แล้ว — ที่เหลือ
              ยังโยน error ให้ ConfirmDialog พิมพ์ในกล่อง เพราะกดใหม่ยังมีความหมาย */
        onConfirm={async () => {
          if (confirmKey === DOC_DELETE_KEY) { await removeDraft(); return; }
          await act(confirmKey);
          setConfirmKey(null);
        }}
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

/* บรรทัดใต้หัวการ์ด "เนื้อเอกสาร" — เนื้อบนจอมาจากไหน (ภาพนิ่งตอนยื่น หรือสเปคสดของร่าง/ถูกตีกลับ)
   ⚠️ ตัวการ์ดอยู่ที่ `SpecDocumentContent` ตัวเดียวกับหน้า "ออกเอกสาร" — ที่นี่บอกแค่ที่มาของเนื้อ */
function contentMeta(summary, source, latest) {
  const captured = summary?.capturedAt ? ` ${fmtDateTime(summary.capturedAt)}` : "";
  return source === "snapshot"
    ? `ภาพนิ่งตอนยื่น${captured} — แก้สเปคที่หน้าสินค้าหลังจากนี้ไม่เปลี่ยนเนื้อนี้`
    : `${liveRevLead(latest)} — แสดงสเปคปัจจุบันของสินค้า`;
}
