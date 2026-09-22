"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardCheck, ExternalLink, Files, RefreshCw } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import ConfirmDialog, { confirmAction } from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import {
  DocumentControlCard, DocumentReadinessList, DocumentSummaryCard,
} from "@/components/ui/DocumentControlPanel";
import ProductSpecForm from "@/components/database/ProductSpecForm";
import ProductSpecIllustrations from "@/components/database/ProductSpecIllustrations";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDate, naText } from "@/lib/format";
import { productDisplayName } from "@/lib/master/productIdentity";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  specControlActions, specControlDescription, specDeletePrompt, specDocumentRows, specDraftFrom,
  specHeadline, specReadiness, specSaveBody,
} from "@/lib/sales/productSpecView";
import styles from "./page.module.css";

/**
 * หน้าสเปคของสินค้า FM-SA-04 — ที่แก้สเปค (เนื้อหา · เอกสารที่ขอได้ · checklist · รูป) ที่เดียว
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): สเปคเป็นข้อมูลของสินค้า
 *    ไม่มีเลขรัน ไม่มี Rev ไม่มีราง ไม่มียื่น/อนุมัติ — ฝ่ายขายแก้แล้วกด "บันทึก" ได้เลย
 *    เลขที่ · Rev · การอนุมัติ อยู่ที่ **เอกสารที่ AC ออกจากบรรทัด SO** (`/sales-planning/spec-documents/[id]`)
 *    ⇒ หน้านี้แค่บอกว่ามีเอกสารใบไหนออกจากสเปคนี้แล้วบ้าง
 * ⚠️ แก้สเปคที่นี่ไม่แตะเอกสารที่ยื่น/อนุมัติแล้ว (เอกสารถือภาพนิ่งของตัวเอง)
 *
 * 🐞 **ของที่พิมพ์ค้างเคยหายเงียบ** — ⇒ `useUnsavedChanges` ดักทั้งปิดแท็บและกดลิงก์ในแอป
 *    (รวมคำบรรยายภาพที่พิมพ์ค้าง) · และ **ห้ามโหลดใหม่ทับร่าง** ยกเว้นหลังบันทึก/ลบสำเร็จ
 *    หรือผู้ใช้สั่งเองหลังรู้ว่าจะทิ้งของที่แก้
 */
export default function ProductSpecPage() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(() => specDraftFrom(null));
  const [dirty, setDirty] = useState(false);
  const [captionDirty, setCaptionDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useUnsavedChanges(dirty || captionDirty);

  const spec = data?.spec || null;
  const product = data?.product || null;
  const permissions = data?.permissions || { canEdit: false, delete: { visible: false, reason: null } };
  const canEdit = Boolean(permissions.canEdit);
  const scopeReason = data?.scopeReason || null;

  /* คำตอบของ API (GET/POST/PATCH ได้รูปเดียวกัน) → จอ · ⚠️ ทับร่างทั้งชุด ⇒ เรียกเฉพาะตอนโหลด
     ครั้งแรก · หลังบันทึก/ลบสำเร็จ · หรือผู้ใช้สั่งโหลดใหม่เอง */
  const apply = useCallback((next) => {
    setData(next);
    setDraft(specDraftFrom(next?.spec || null));
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(await apiJson(`/api/products/${id}/spec`, { fallbackError: "โหลดสเปคสินค้าไม่สำเร็จ" }));
      setLoadError("");
      setConflict(false);
    } catch (fetchError) {
      setLoadError(fetchError.message || "โหลดสเปคสินค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => { load(); }, [load]);

  /* ดึง "ตัวสเปค" กลับมาอย่างเดียว ไม่แตะร่าง — ใช้หลังบันทึกไม่สำเร็จ
     🪤 บันทึกล้มกลางทาง (เนื้อสเปคเข้าแล้วแต่ checklist ล้ม) = `updatedAt` บนฐานขยับไปแล้ว ⇒ ถ้าไม่ดึง
        ค่าใหม่มา กดบันทึกซ้ำจะชน "ถูกแก้โดยคนอื่น" ทั้งที่คนแก้คือเราเอง */
  const refreshBaseline = useCallback(async () => {
    try {
      const next = await apiJson(`/api/products/${id}/spec`);
      setData(next);
    } catch { /* เงียบ — ข้อความที่ผู้ใช้ต้องอ่านคือ error ของการบันทึก */ }
  }, [id]);

  const mark = () => { setDirty(true); setWarning(""); };
  const setField = (key, value) => { setDraft((prev) => ({ ...prev, form: { ...prev.form, [key]: value } })); mark(); };
  const setItems = (items) => { setDraft((prev) => ({ ...prev, items })); mark(); };
  const setCerts = (certs) => { setDraft((prev) => ({ ...prev, certs })); mark(); };

  const write = async (kind) => {
    setBusy(kind);
    setError("");
    setWarning("");
    setConflict(false);
    try {
      const next = await apiJson(`/api/products/${id}/spec`, {
        method: kind === "create" ? "POST" : "PATCH",
        json: specSaveBody({ ...draft, expectedUpdatedAt: kind === "create" ? null : spec?.updatedAt }),
        fallbackError: kind === "create" ? "สร้างสเปคไม่สำเร็จ" : "บันทึกสเปคไม่สำเร็จ",
      });
      /* 🪤 บันทึกสำเร็จแต่ API อ่านกลับไม่ขึ้น ⇒ ได้แค่ `{ spec, warning }` (ไม่มี product/permissions)
         ⇒ ห้ามทับ `data` ทั้งก้อน ไม่งั้นสิทธิ์หายแล้วฟอร์มกลายเป็นอ่านอย่างเดียว · ใช้ของเดิม + สเปคใหม่
         แล้วดึงทั้งก้อนกลับเงียบ ๆ */
      if (next?.permissions) apply(next);
      else {
        apply({ ...data, spec: next?.spec ?? data?.spec ?? null });
        refreshBaseline();
      }
      // ⚠️ บันทึกสำเร็จแต่ซิงก์ลงทะเบียนสินค้าไม่ผ่าน — ต้องบอก ไม่ใช่ขึ้นแค่ "บันทึกแล้ว"
      if (next?.warning) setWarning(next.warning);
      notifyToast.success(kind === "create" ? "สร้างสเปคแล้ว" : "บันทึกสเปคแล้ว");
    } catch (writeError) {
      // ร่างยังอยู่ครบ — ไม่โหลดทับ · 409 = มีคนบันทึกไปก่อน ให้ผู้ใช้เลือกเองว่าจะทิ้งของที่แก้ไหม
      setError(writeError.message || "บันทึกสเปคไม่สำเร็จ");
      if (writeError.status === 409) setConflict(true);
      else refreshBaseline();
    } finally {
      setBusy("");
    }
  };

  const reloadDiscarding = async () => {
    if (dirty && !(await confirmAction({
      title: "โหลดสเปคล่าสุด",
      description: "ทิ้งสิ่งที่แก้ไว้บนจอนี้แล้วโหลดสเปคล่าสุดหรือไม่",
      detail: "ของที่พิมพ์ค้างไว้จะหาย — ก๊อปเก็บไว้ก่อนถ้ายังต้องใช้",
      confirmLabel: "ทิ้งแล้วโหลดใหม่",
      danger: true,
    }))) return;
    setError("");
    await load();
  };

  const remove = async () => {
    setBusy("delete");
    try {
      const res = await apiJson(`/api/products/${id}/spec`, { method: "DELETE", fallbackError: "ลบสเปคไม่สำเร็จ" });
      setDeleteOpen(false);
      /* 🐞 ลบสำเร็จแต่โหลดกลับไม่ขึ้น เคยค้างสเปคที่ลบไปแล้วไว้บนจอพร้อมฟอร์มที่แก้ได้ ⇒ ถอดสเปคออกจาก
         ข้อมูลบนจอทันที (ความจริงคือไม่มีแล้ว) ก่อนโหลดทั้งก้อนใหม่ — โหลดล้มก็ยังเห็นสภาพที่ถูกต้อง */
      apply({ ...data, spec: null, documents: [] });
      // ⚠️ ลบแล้วแต่ล้างกระจกบนทะเบียนสินค้าไม่ผ่าน — ต้องขึ้นบนจอ ไม่ใช่กลืนไปกับ toast
      if (res?.warning) setWarning(res.warning);
      notifyToast.success("ลบสเปคแล้ว");
      await load();
    } finally {
      setBusy("");
    }
  };

  const headline = specHeadline({ spec, dirty });
  const actions = specControlActions({
    spec,
    productId: id,
    permissions,
    scopeReason,
    dirty,
    onCreate: () => write("create"),
    onSave: () => write("save"),
    onDelete: () => setDeleteOpen(true),
  });
  const documents = specDocumentRows(data?.documents);
  // ฟอร์มขึ้นเมื่อมีสเปค หรือคนที่สร้างได้กำลังจะสร้าง (ฟอร์มเดียวกันทั้งสองทาง)
  const showForm = Boolean(spec) || (canEdit && !scopeReason);
  const back = { href: `/database/products/${id}`, label: "กลับไปหน้าสินค้า" };

  if (!loading && !data && loadError) {
    return (
      <Workspace icon={<ClipboardCheck size={22} />} title="สเปคสินค้า" back={back}>
        <StatusNotice tone="error">{loadError}</StatusNotice>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title={`สเปคสินค้า · ${naText(product?.fgCode)}`}
      subtitle={product ? `${productDisplayName(product)} — FM-SA-04` : "FM-SA-04"}
      back={back}
      loading={loading && !data}
    >
      {/* 🐞 โหลดใหม่ที่ล้มหลังมีข้อมูลบนจอแล้ว (กด "โหลดสเปคล่าสุด" · โหลดกลับหลังลบ) เคยเงียบ —
          แถบ error ของการโหลดเดิมขึ้นเฉพาะตอนยังไม่มีข้อมูลเลย ⇒ ของเก่าค้างบนจอโดยไม่มีใครรู้ */}
      {loadError && data ? (
        <div className={styles.notice}>
          <StatusNotice
            tone="error"
            title="โหลดสเปคล่าสุดไม่สำเร็จ — ข้อมูลบนจออาจไม่ใช่ของล่าสุด"
            action={(
              <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={reloadDiscarding} disabled={loading}>
                ลองโหลดอีกครั้ง
              </Button>
            )}
          >
            {loadError}
          </StatusNotice>
        </div>
      ) : null}
      {error ? (
        <div className={styles.notice}>
          <StatusNotice
            tone="error"
            action={conflict ? (
              <Button size="sm" variant="outline" icon={<RefreshCw size={13} />} onClick={reloadDiscarding}>
                โหลดสเปคล่าสุด
              </Button>
            ) : null}
          >
            {error}
          </StatusNotice>
        </div>
      ) : null}
      {warning ? (
        <div className={styles.notice}>
          <StatusNotice tone="warning" onDismiss={() => setWarning("")}>{warning}</StatusNotice>
        </div>
      ) : null}
      {scopeReason ? (
        <div className={styles.notice}>
          <StatusNotice tone="info" title="สินค้าชิ้นนี้อยู่นอกขอบเขตของใบสเปค">{scopeReason}</StatusNotice>
        </div>
      ) : null}

      <DetailPageLayout
        controlFirst
        asideLabel="จัดการสเปคสินค้า"
        aside={<>
          <DocumentControlCard
            icon={ClipboardCheck}
            eyebrow="SPEC CONTROL"
            title="จัดการสเปค"
            headerNarrow="hide"
            tabletSplit
            status={headline.status}
            statusSub={headline.sub}
            statusColor={headline.color}
            statusDescription={specControlDescription({ spec, documents: data?.documents })}
            busy={Boolean(busy)}
            primaryAction={actions.primaryAction}
            secondaryActions={actions.secondaryActions}
            dangerActions={actions.dangerActions}
          />

          {showForm ? (
            <DocumentSummaryCard title="ความพร้อมของสเปค">
              <DocumentReadinessList items={specReadiness({ form: draft.form, items: draft.items })} />
            </DocumentSummaryCard>
          ) : null}
        </>}
      >
        {showForm ? (
          <ProductSpecForm
            product={product}
            form={draft.form}
            onField={setField}
            items={draft.items}
            onItems={setItems}
            certs={draft.certs}
            onCerts={setCerts}
            readOnly={!canEdit}
          />
        ) : (
          <DetailCard icon={ClipboardCheck} eyebrow="FM-SA-04" title="สินค้าชิ้นนี้ยังไม่มีสเปค">
            <p className={styles.intro}>
              สเปคเป็นข้อมูลของสินค้า หนึ่งสินค้าหนึ่งสเปค — ฝ่ายขายเป็นผู้กรอก แล้ว AC ออกเอกสาร
              FM-SA-04 จากบรรทัดใบสั่งขายที่อนุมัติแล้วได้ทุกใบโดยไม่ต้องกรอกซ้ำ
            </p>
          </DetailCard>
        )}

        {/* ⭐ ภาพประกอบ (แผ่นท้ายของกระดาษ) — ไฟล์แนบกับ **ตัวสินค้า** ตามมติ 17/09
            ⚠️ ขึ้นเมื่อมีสเปคแล้ว — ภาพเป็นของประกอบสเปค ไม่ใช่ของที่ต้องมีก่อนสร้าง */}
        {spec ? (
          <ProductSpecIllustrations productId={id} canEdit={canEdit} onDirtyChange={setCaptionDirty} />
        ) : null}

        {spec ? (
          <DetailCard
            icon={Files}
            eyebrow="ISSUED DOCUMENTS"
            title={`เอกสารที่ออกจากสเปคนี้ (${documents.length})`}
            meta="เลขที่ · Rev · การอนุมัติ อยู่ที่เอกสาร — แก้สเปคที่นี่มีผลเฉพาะเอกสารที่ยังเป็นร่าง"
          >
            {documents.length ? (
              <TableScroll family="list" surface="embedded">
                <table>
                  <thead>
                    <tr>
                      <th className={styles.colDoc}>เลขที่เอกสาร</th>
                      <th className={styles.colRev}>Rev.</th>
                      <th className={styles.colStatus}>สถานะ</th>
                      <th className={styles.colOrder}>ใบสั่งขาย</th>
                      <th className={`num ${styles.colDate}`}>วันที่ออก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((row) => (
                      <tr key={row.id}>
                        <td className="mono"><Link href={row.href}>{naText(row.docNoText || row.docNo)}</Link></td>
                        <td>
                          <div>{naText(row.revLabel)}</div>
                          {row.inUseRevLabel ? <div className={styles.sub}>ใช้อยู่ {row.inUseRevLabel}</div> : null}
                        </td>
                        <td><StatusBadge size="sm" tone={row.tone} label={naText(row.statusLabel)} /></td>
                        <td className="mono">
                          {row.orderHref ? <Link href={row.orderHref}>{naText(row.orderNumber)}</Link> : naText(row.orderNumber)}
                        </td>
                        <td className="num">{row.createdAt ? fmtDate(row.createdAt) : naText(null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : (
              <EmptyState plain>
                <strong>ยังไม่เคยออกเอกสารจากสเปคนี้</strong>
                <small>AC ออกเอกสารได้ที่หน้าใบสั่งขายหลังใบอนุมัติแล้ว — หนึ่งบรรทัดสินค้าหนึ่งใบ</small>
              </EmptyState>
            )}
          </DetailCard>
        ) : null}

        <DetailCard icon={ExternalLink} eyebrow="RELATED" title="ที่มาของข้อมูลบนกระดาษ">
          <ul className={styles.sourceList}>
            {/* ป้ายชุดเดียวกับกระดาษ (มติผู้ใช้ 22/09 "ปริมาตรบรรจุ และ จำนวนผลิต ดึงมาจาก ข้อมูล FG และ QT SO") —
                🐞 ตรวจรอบสาม: จอยังเรียก "ขนาดบรรจุ"/"จำนวน" และไม่บอกว่าจำนวนผลิตถอยไปใบเสนอราคาได้ */}
            <li>ชื่อลูกค้า · แบรนด์ · รหัสสินค้า · ปริมาตรบรรจุ · กลิ่น ←{" "}
              <Link href={`/database/products/${id}`}>ทะเบียนสินค้า</Link></li>
            <li>เลขที่ใบสั่งขาย · จำนวนผลิต · กำหนดส่ง · AE เจ้าของดีล ← บรรทัดใบสั่งขาย (จำนวนผลิตไม่มี = บรรทัดใบเสนอราคาของสินค้าเดียวกัน) ถ่ายลงเอกสารตอนยื่น</li>
            <li>สเปค · checklist · เอกสารที่ขอได้ · ภาพประกอบ ← กรอกที่หน้านี้ ถ่ายลงเอกสารตอนยื่น</li>
          </ul>
        </DetailCard>
      </DetailPageLayout>

      <ConfirmDialog
        open={deleteOpen}
        {...specDeletePrompt({ productName: productDisplayName(product) })}
        busy={busy === "delete"}
        onConfirm={remove}
        onClose={() => setDeleteOpen(false)}
      />
    </Workspace>
  );
}
