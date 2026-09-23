"use client";

/* หน้า "ออกเอกสาร" FM-SA-04 รายละเอียดผลิตภัณฑ์ — เอกสารที่ **ยังไม่บันทึก** ของบรรทัดใบสั่งขายหนึ่งบรรทัด
 *
 * ⭐ **มติเจ้าของ 23/09/2569** "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก เอาแบบ คำร้อง แบบใบเสนอราคา"
 *    เดิมปุ่ม "ออกเอกสาร" บนการ์ดหน้า SO ขึ้นโมดัลแล้ว POST ทันที ⇒ เลขที่ FM-SA-04 ถูกใช้ตั้งแต่ยังไม่ได้เห็นเนื้อเอกสาร
 *    ตอนนี้การ์ดพามาที่นี่ (`?order=<SO>&line=<บรรทัด>`) · หน้าแสดงสิ่งที่เอกสารจะมี (ใบสั่งขาย · ใบเสนอราคา · ลูกค้า ·
 *    สินค้า · จำนวนผลิต · กำหนดส่ง · เนื้อสเปค) + กระดาษร่างสด · **เลขที่ถูกใช้ตอนกด "บันทึก" เท่านั้น**
 *    กด "ยกเลิก" = กลับใบสั่งขาย ไม่มีอะไรเหลือในฐาน
 *
 * ⚠️ **ทรงเดียวกับหน้าสร้างใบสั่งขาย** (`sales-orders/new`) — ปุ่มระดับใบอยู่ในการ์ดจัดการเอกสารบนรางขวา
 *    (บันทึก · ดูตัวอย่างกระดาษ · ยกเลิก) ไม่ใช่แถบปุ่มท้ายฟอร์ม (ผู้ใช้ 2026-08-24 "เป็นภาษาเดียวกันทั้งระบบ")
 * ⚠️ **จอไม่คิดด่านเอง** — สิทธิ์/ติดด่าน/มีเอกสารแล้ว มาจาก `GET .../spec-documents/new` (`documentCreateGate`
 *    ตัวเดียวกับ POST) แล้ว `specDocNewView` แปลงเป็นหน้า (มีเทสต์) · ไม่มีสิทธิ์ = คำบอกแทนฟอร์ม (ui-visibility-rule)
 * ⚠️ **บันทึกยิง POST ครั้งเดียว ไม่ลองซ้ำ** — POST กินเลขจากตัวนับ (apiFetch ไม่ retry POST อยู่แล้ว + `retry: false`
 *    กำกับไว้) · ปุ่มดับตั้งแต่กดจนหน้าเปลี่ยน (`savingRef` กันคลิกสองทีก่อน re-render) · ล้ม = แถบแจ้งบนหน้า
 *    ฟอร์มยังอยู่ แล้วดึงด่านใหม่เงียบ ๆ (เช่นอีกแท็บออกไปก่อน ⇒ หน้าเปลี่ยนเป็น "ออกไปแล้ว" พร้อมลิงก์)
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardCheck, ClipboardList, ExternalLink, FileText, Package, Pencil, Target,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import SpecDocumentContent from "@/components/salesPlanning/SpecDocumentContent";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { naText } from "@/lib/format";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { productBrandName, productDisplayName } from "@/lib/master/productIdentity";
import {
  docContentSummary, productSpecPageHref, salesOrderHref, specDocCreateApiPath, specDocNewApiPath,
  specDocNewLoadProblem, specDocNewView, specDocSavedMessage, specDocumentHref,
} from "@/lib/sales/productSpecDocView";

const TITLE = "ออกเอกสารรายละเอียดผลิตภัณฑ์";

function NewSpecDocumentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("order") || "";
  const lineId = params.get("line") || "";
  const apiPath = specDocNewApiPath(orderId, lineId);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadProblem, setLoadProblem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // ⚠️ state ไม่ทันคลิกที่สอง (re-render ยังไม่มา) — ref คือตัวกันยิง POST ซ้ำจริง ๆ
  const savingRef = useRef(false);

  const load = useCallback(async (opts) => {
    if (!apiPath) { setLoading(false); return; }
    if (!opts?.background) setLoading(true);
    try {
      const next = await apiJson(apiPath, { fallbackError: "อ่านข้อมูลเอกสารไม่สำเร็จ" });
      setData(next);
      setLoadProblem(null);
    } catch (loadError) {
      // รอบเบื้องหลังที่ล้ม = เงียบ ไม่ทับของที่กำลังอ่าน
      if (!opts?.background) setLoadProblem(specDocNewLoadProblem(loadError));
    } finally {
      if (!opts?.background) setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => { load(); }, [load]);
  // ไปแก้สเปคที่หน้าสินค้า/อีกแท็บออกเอกสารไปก่อน แล้วกลับมามอง — เนื้อและด่านต้องเป็นของใหม่
  useRevalidateOnFocus(load);

  const save = useCallback(async () => {
    const path = specDocCreateApiPath(orderId);
    if (savingRef.current || !path) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const result = await apiJson(path, {
        method: "POST",
        json: { salesOrderLineId: lineId },
        retry: false,
        fallbackError: "บันทึกเอกสารไม่สำเร็จ",
      });
      notifyToast.success(specDocSavedMessage(result));
      /* ⚠️ ไม่ปล่อย `saving` — ปุ่มดับค้างจนหน้าเปลี่ยน (กดซ้ำระหว่างรอนำทาง = POST รอบสองที่ได้ 409)
         เอกสารไม่คืน id (ไม่ควรเกิด) = กลับใบสั่งขาย ซึ่งการ์ดโชว์เอกสารที่เพิ่งออกอยู่แล้ว */
      router.push(specDocumentHref(result?.document?.id) || salesOrderHref(orderId));
    } catch (saveFailure) {
      savingRef.current = false;
      setSaving(false);
      setSaveError(saveFailure.message || "บันทึกเอกสารไม่สำเร็จ");
      // 4xx = จอไม่ตรงกับของจริง (SO ถูกย้อนการอนุมัติ · อีกแท็บออกไปก่อน) ⇒ ดึงด่านใหม่ให้ปุ่มบอกเหตุที่ถูก
      load({ background: true });
    }
  }, [orderId, lineId, router, load]);

  const orderNumber = data?.order?.orderNumber || null;
  const back = {
    href: salesOrderHref(orderId) || "/sa/sales-orders",
    label: orderNumber ? `กลับไปใบสั่งขาย ${orderNumber}` : "กลับไปใบสั่งขาย",
  };
  /* ⚠️ **แถบ error ของการบันทึกอยู่ในเปลือก ไม่ใช่ในกิ่ง "ฟอร์ม"** — บันทึกล้มแล้วเราดึงด่านใหม่เงียบ ๆ
     ถ้าคำตอบใหม่พลิกหน้าเป็น "ออกไปแล้ว"/"ไม่มีสิทธิ์" (อีกแท็บออกเอกสารไปก่อน = 409) หน้าจะกลายเป็นคำบอกล้วน
     ⇒ เหตุจริงที่ POST ตอบกลับมาต้องไม่หายไปพร้อมการสลับกิ่ง (กติกาเดียวกับ ReasonDialog: ข้อความอยู่กับสิ่งที่คนกด) */
  const shell = (children, subtitle) => (
    <Workspace icon={<ClipboardCheck size={22} />} title={TITLE} subtitle={subtitle} back={back}>
      {saveError ? <StatusNotice tone="error" onDismiss={() => setSaveError("")}>{saveError}</StatusNotice> : null}
      {children}
    </Workspace>
  );

  if (!apiPath) {
    return shell(
      <StatusNotice tone="error">
        ไม่ได้ระบุใบสั่งขายหรือบรรทัดสินค้า — เปิดหน้านี้จากการ์ด &quot;เอกสารต่อเนื่อง&quot; บนหน้าใบสั่งขาย
      </StatusNotice>,
    );
  }
  if (loading && !data) return shell(<SkeletonRows rows={6} />);
  if (!data) {
    return shell(
      <StatusNotice tone={loadProblem?.tone || "error"}>{loadProblem?.message || "อ่านข้อมูลเอกสารไม่สำเร็จ"}</StatusNotice>,
    );
  }

  const view = specDocNewView(data, { saving, onSave: save });
  if (view.kind !== "form") {
    const { notice } = view;
    return shell(
      <StatusNotice
        tone={notice.tone}
        title={notice.title}
        action={notice.href
          ? <Button as={Link} href={notice.href} size="sm" variant="outline" icon={<ExternalLink size={13} />}>{notice.hrefLabel}</Button>
          : null}
      >
        {notice.message}
      </StatusNotice>,
    );
  }

  const order = data.order || {};
  const line = data.line || {};
  const product = data.product || null;
  const summary = data.spec ? docContentSummary({ source: "live", spec: data.spec, order: view.orderFacts }) : null;
  const { control, contentNotice } = view;

  return shell(
    <>
      <ContextGrid>
        <ContextCard
          icon={ClipboardList}
          href={salesOrderHref(order.id) || undefined}
          eyebrow="ใบสั่งขาย"
          title={order.orderNumber}
          subtitle="เอกสารออกจากบรรทัดของใบนี้"
          facts={[
            { label: "สถานะใบสั่งขาย", value: SALES_ORDER_STATUS_LABELS[order.status] || order.status || null },
            { label: "ลูกค้า", value: order.customerName || null },
          ]}
        />
        <ContextCard
          icon={FileText}
          href={order.quotationId ? `/sa/quotations/${order.quotationId}` : undefined}
          eyebrow="ใบเสนอราคา"
          title={order.quotationNumber}
          subtitle="ใบที่ใบสั่งขายผูก — กล่องผู้ซื้อบนกระดาษมาจากใบนี้"
          // ภาษาของกระดาษ = ภาษาของใบสั่งขาย (มติ 22/09) — บอกก่อนบันทึกว่าจะได้ใบภาษาไหน
          facts={[{ label: "ภาษาเอกสาร", value: order.docLanguage === "en" ? "อังกฤษ (ตามใบสั่งขาย)" : "ไทย (ตามใบสั่งขาย)" }]}
        />
        <ContextCard
          icon={Package}
          href={productSpecPageHref(line.productId) || undefined}
          eyebrow="สินค้า"
          title={product?.fgCode || line.fgCode}
          subtitle={productDisplayName(product) || line.description || null}
          facts={[{ label: "แบรนด์", value: productBrandName(product) || null }]}
        />
      </ContextGrid>

      {/* ⭐ `controlFirst` เหมือนหน้าเอกสารพี่น้อง (`spec-documents/[id]`) — จอ ≤1050px รางขวาไหลลงต่อท้ายเนื้อ
          ถ้าไม่เปิดโหมดนี้ ปุ่ม "บันทึก" ของทั้งใบจะไปอยู่ก้นหน้า ใต้ checklist + ตารางเอกสาร + ภาพประกอบ
          (ผลตรวจ 2026-08-17 ที่ DetailPage.js บันทึกไว้) · หน้านี้เนื้ออ่านอย่างเดียว คำถามแรกของคนเปิดคือ
          "กดบันทึกแล้วได้อะไร" ไม่ใช่การไล่อ่าน checklist ⇒ เข้าเงื่อนไขของโหมดนี้เต็ม ๆ */}
      <DetailPageLayout
        controlFirst
        asideLabel="สรุปและจัดการเอกสาร"
        aside={
          <DocumentControlCard
            icon={ClipboardCheck}
            eyebrow="DOCUMENT CONTROL"
            title="จัดการเอกสาร"
            status={control.status}
            statusColor="var(--text-3)"
            statusDescription={control.statusDescription}
            workflowSteps={control.workflowSteps}
            primaryAction={control.primaryAction}
            secondaryActions={control.secondaryActions}
            dangerActions={control.dangerActions}
            busy={saving}
            footer={control.footer}
          />
        }
      >
        {contentNotice ? (
          <DetailCard icon={Target} eyebrow="CONTENT" title="เนื้อเอกสาร"
            meta={`บรรทัด ${naText(line.fgCode)} ${naText(line.description)}`}>
            <StatusNotice
              tone="warning"
              title={contentNotice.title}
              action={contentNotice.action
                ? <Button as={Link} href={contentNotice.action.href} size="sm" variant="outline" icon={<Pencil size={13} />}>{contentNotice.action.label}</Button>
                : null}
            >
              {contentNotice.message}
            </StatusNotice>
          </DetailCard>
        ) : (
          <>
            <StatusNotice
              tone="info"
              action={view.editSpecHref
                ? <Button as={Link} href={view.editSpecHref} size="sm" variant="outline" icon={<Pencil size={13} />}>แก้สเปคที่หน้าสินค้า</Button>
                : null}
            >
              {view.liveNotice}
            </StatusNotice>
            {/* ⚠️ ส่งจำนวนภาพมาด้วย — การ์ด "ภาพประกอบ" ของเนื้อแบบสดไม่มีคำบรรยายรายภาพ (ถ่ายตอนยื่น)
                ถ้าไม่บอก "กี่ภาพ" คนที่อ่านแต่จอแล้วกดบันทึก ไม่เคยรู้ว่ามีภาพอะไรจะไปอยู่บนเอกสาร */}
            <SpecDocumentContent summary={summary} meta={view.contentMeta} liveIllustrationCount={view.illustrationCount} />
          </>
        )}
      </DetailPageLayout>
    </>,
    `FM-SA-04 จากบรรทัด ${naText(line.fgCode)} ของใบสั่งขาย ${naText(order.orderNumber)} — ตรวจเนื้อเอกสารก่อนบันทึก`,
  );
}

export default function NewSpecDocumentPage() {
  return (
    <Suspense fallback={<Workspace icon={<ClipboardCheck size={22} />} title={TITLE}><SkeletonRows rows={6} /></Workspace>}>
      <NewSpecDocumentInner />
    </Suspense>
  );
}
