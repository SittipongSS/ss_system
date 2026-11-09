"use client";
/* ── แผงทะเบียนสรรพสามิตฝั่งขาย (แผนรื้อสรรพสามิต หมวด 12.6 · มติเจ้าของ 02/11 V8 · V14) ──────────────────────────────
   SA ไม่เข้า /tax แล้ว (V7 · V13) ⇒ งานเอกสารทะเบียนของ SA ย้ายมาที่นี่: สร้างคำขอ · เช็กลิสต์เอกสารบังคับ · แนบไฟล์ ·
   ยื่นให้ RA · ดูเหตุที่ตีกลับ · แก้แล้วยื่นใหม่ — **ตัวเดียว** ของหน้าสินค้า FG และหน้า SO ลูกค้า (V8 ฟอร์มเดียว)
   ⭐ ข้อมูล/ด่านเป็นชุดเดียวกับหน้า /tax/registrations/[id] ของ RA: GET `?full=1` · GET `/requirements` (ตัวตรวจตัวเดียวกับด่าน
      ยื่นของ server) · PATCH `{ status: 'pending_legal' }` · AttachmentsPanel ของทะเบียน + ของลูกค้า (เอกสารลูกค้าเก็บที่ลูกค้าที่เดียว)
   ⭐ ฉลาก/Artwork ที่ยื่น = **Artwork ของสินค้า** (ศูนย์กลางเอกสารของสินค้า P1 · มติเจ้าของ 09/11/2026) — แนบที่แผงนี้ = แนบที่สินค้า
      (ไฟล์ชุดเดียวกับแท็บเอกสารของสินค้า) · ทะเบียนที่ยื่นแล้วโชว์ชุดที่ตรึงไว้ตอนยื่น (`reg.labelArtwork` จาก GET ?full=1)
   ⚠️ ปุ่มยื่นติดด่าน = ปุ่มยังอยู่ กดไม่ได้พร้อมเหตุ (กติกา "ติดด่าน = โชว์แล้วบอกเหตุ") · server ตรวจซ้ำทุกครั้ง */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import StatusBadge from "@/components/excise/StatusBadge";
import { apiJson } from "@/lib/apiFetch";
import { ATTACHMENT_TYPES, customerDocTypes } from "@/lib/master/attachmentTypes";
import { attachmentHref } from "@/lib/master/attachmentStorage";
import { customerNameIn } from "@/lib/master/customerName";
import { fmtDate, naText } from "@/lib/format";
import {
  ARTWORK_MISSING_LABEL, LEGACY_LABEL_DOC_TYPE, PRODUCT_ARTWORK_DOC_TYPE, retiredArtworkNote, usesLiveArtwork,
} from "@/lib/excise/registrationArtwork";
import styles from "./RegistrationWorkModal.module.css";

/* ── การ์ดเอกสารในแผงนี้ = ตามด่านยื่นจริง (`lib/tax/requirements.js`) ไม่ใช่ตามทะเบียนลูกค้า (มติเจ้าของ 04/11/2026) ──
   🐞 เดิมแผงเอกสารลูกค้าขึ้น "ยังขาด" ตามเอกสารบังคับของทะเบียนลูกค้า (หนังสือรับรอง · ภ.พ.20) ขณะที่เช็กลิสต์ด้านบนบอกว่า
      ขาดแค่ Artwork ⇒ สองที่บอกคนละเรื่อง · ด่านยื่นทะเบียนใช้เอกสารลูกค้าแค่ "แผนที่ที่อยู่" ใบเดียว
   ⚠️ ไม่ได้ลดเอกสารบังคับของลูกค้าเอง — หน้าลูกค้ายังบอก "ยังขาด" ตามเดิม · ที่นี่แค่พูดเรื่องของทะเบียน */
const REGISTRATION_CUSTOMER_DOC = "address_map";
const registrationCustomerDocTypes = (customerType) => customerDocTypes(customerType)
  .map((type) => ({ ...type, required: type.key === REGISTRATION_CUSTOMER_DOC }));
/* "ใบอนุมัติขึ้นทะเบียน" เป็นของที่ RA แนบตอน/หลังอนุมัติ — ฝ่ายขายไม่ต้องเห็นการ์ดนี้ตอนเตรียมยื่น
   ⚠️ ถอดการ์ดเฉพาะตอนที่ยังไม่มีไฟล์ชนิดนี้ — มีไฟล์แล้ว (ทะเบียนที่ถูกปลดอนุมัติกลับมาแก้) ต้องเห็นในการ์ดของมัน
      ไม่งั้นแผงจัดไฟล์นั้นไปกอง "เอกสารอื่นๆ" (`panelItemsByType`) */
const APPROVAL_LETTER_DOC = "approval_letter";
/* ⚠️ การ์ดฉลากแบบเดิม (`label_artwork`) โผล่เฉพาะทะเบียนที่ยังมีไฟล์ชนิดนั้นค้าง (ก่อนรัน mig 0427) — ฉลากใหม่แนบที่สินค้าเสมอ */
const registrationDocTypes = (status, hasApprovalLetter, hasLegacyLabel) => ATTACHMENT_TYPES.registration.filter((type) => {
  if (type.key === APPROVAL_LETTER_DOC) return status === "approved" || hasApprovalLetter;
  if (type.key === LEGACY_LABEL_DOC_TYPE) return hasLegacyLabel;
  return true;
});
/* การ์ดเดียวของแผง Artwork — ชนิดเดียวกับการ์ด "Artwork สินค้า" ของแท็บเอกสาร (ไฟล์ชุดเดียวกัน) แต่ป้ายบอกว่าใช้ยื่น */
const ARTWORK_CARD = [{ key: PRODUCT_ARTWORK_DOC_TYPE, label: ARTWORK_MISSING_LABEL, required: true }];

/* ของที่ขาดแต่ละชนิดแก้ที่ไหน — เอกสาร/ข้อมูลลูกค้าเก็บที่ลูกค้า · ราคาขายปลีกเก็บที่สินค้า · ไฟล์ของทะเบียนแนบในแผงนี้ */
const fixHint = (item, reg) => {
  if (item.entity === "customer" && (item.docType === "taxId" || item.docType === "branchCode")) {
    return reg?.customerId ? { href: `/database/customers/${encodeURIComponent(reg.customerId)}`, label: "แก้ที่หน้าลูกค้า" } : null;
  }
  if (item.docType === "retailPriceIncVat") {
    return reg?.productId ? { href: `/database/products/${encodeURIComponent(reg.productId)}`, label: "ใส่ราคาที่หน้าสินค้า" } : null;
  }
  return null; // ไฟล์แนบ — แนบในแผงด้านล่าง
};

/**
 * @param items  รายการ FG × ลูกค้าที่เปิดได้ `[{ key, productId, customerId, fgCode, label, registrationId }]`
 *               (หน้าสินค้า = ส่วนใหญ่ตัวเดียว · หน้า SO = ทุก FG สรรพสามิตของใบ) · `registrationId` ว่าง = ยังไม่มีทะเบียน
 * @param initialKey รายการที่เปิดก่อน
 * @param canEdit    สร้าง/แนบ/ยื่นได้ไหม (สิทธิ์แก้สินค้า — ตรงกับ proxy ของ POST/PATCH)
 * @param onChanged  เรียกหลังสร้าง/ยื่นสำเร็จ — หน้าที่เปิดโหลดสถานะของตัวเองใหม่
 */
export default function RegistrationWorkModal({ open, items = [], initialKey = null, canEdit = false, onChanged, onClose }) {
  if (!open || !items.length) return null;
  return (
    <Modal open onClose={onClose} title="ทะเบียนสรรพสามิต" size="lg">
      <div className={styles.body}>
        <RegistrationWork items={items} initialKey={initialKey} canEdit={canEdit} onChanged={onChanged} />
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ⭐ ตัวแผงแบบฝังในหน้า (หน้าสินค้า แท็บ "สรรพสามิต" · มติเจ้าของ 04/11/2026 "แท็บตามม็อก") — **เนื้อชุดเดียวกับโมดัล**
   (หน้า SO ยังเปิดเป็นโมดัล) · ต่างแค่ไม่มีกรอบโมดัลกับปุ่มปิด · ห้ามก๊อปเนื้อแผงไปเขียนอีกชุด (V8 ฟอร์มเดียว) */
export function RegistrationWorkPanel({ items = [], initialKey = null, canEdit = false, onChanged }) {
  if (!items.length) return null;
  return (
    <div className={styles.inline}>
      <RegistrationWork items={items} initialKey={initialKey} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

function RegistrationWork({ items, initialKey, canEdit, onChanged }) {
  const [activeKey, setActiveKey] = useState(initialKey && items.some((item) => item.key === initialKey) ? initialKey : items[0].key);
  // ทะเบียนที่เพิ่งสร้างในแผงนี้ (รายการจากหน้าที่เปิดยังไม่รู้ id จนกว่าจะโหลดใหม่)
  const [createdIds, setCreatedIds] = useState({});
  /* 🐞 สร้างคำขอแล้วหน้าที่เปิดโหลดรายการใหม่ ⇒ รายการ "new" กลายเป็นแถวที่มี id ของตัวเอง (คีย์เปลี่ยน)
     เดิมตกไปรายการแรกเสมอ = อาจเป็นทะเบียนของลูกค้าอีกราย · ตามไปที่แถวของทะเบียนที่เพิ่งสร้างแทน */
  const active = items.find((item) => item.key === activeKey)
    || items.find((item) => item.registrationId && item.registrationId === createdIds[activeKey])
    || items[0];
  const registrationId = active.registrationId || createdIds[active.key] || null;

  return (
    <>
      {items.length > 1 && (
        /* FG ไม่กี่ตัว = ชิปเลือกตรง ๆ ไม่ใช่ดรอปดาวน์ (กติกา direct controls) */
        <div className={styles.chips} role="tablist" aria-label="เลือกสินค้า">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === active.key}
              className={`${styles.chip} ${item.key === active.key ? styles.chipActive : ""}`}
              onClick={() => setActiveKey(item.key)}
            >
              <span className={styles.chipCode}>{item.fgCode}</span>
              <span className={styles.chipState}>{item.stateLabel || (item.registrationId || createdIds[item.key] ? "มีทะเบียน" : "ยังไม่มีทะเบียน")}</span>
            </button>
          ))}
        </div>
      )}
      <RegistrationWorkItem
        key={`${active.key}:${registrationId || "new"}`}
        item={active}
        registrationId={registrationId}
        canEdit={canEdit}
        onCreated={(id) => { setCreatedIds((current) => ({ ...current, [active.key]: id })); onChanged?.(); }}
        onChanged={onChanged}
      />
    </>
  );
}

function RegistrationWorkItem({ item, registrationId, canEdit, onCreated, onChanged }) {
  const [reg, setReg] = useState(null);
  const [loading, setLoading] = useState(!!registrationId);
  const [loadError, setLoadError] = useState("");
  const [req, setReq] = useState(null);
  const [reqError, setReqError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  /* ไฟล์ของทะเบียนเอง (ใบอนุมัติ · อื่น ๆ · ฉลากแบบเดิมที่ยังไม่ย้าย) — ใช้ตัดสินว่าการ์ดไหนต้องโผล่ */
  const [regFiles, setRegFiles] = useState([]);

  const load = useCallback(async () => {
    if (!registrationId) return;
    setLoading(true);
    setLoadError("");
    try {
      setReg(await apiJson(`/api/excise-registrations/${encodeURIComponent(registrationId)}?full=1`, { fallbackError: "โหลดทะเบียนไม่สำเร็จ" }));
    } catch (failure) {
      setLoadError(failure.message || "โหลดทะเบียนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  const checkRequirements = useCallback(async () => {
    if (!registrationId) return;
    setReqError("");
    try {
      setReq(await apiJson(`/api/excise-registrations/${encodeURIComponent(registrationId)}/requirements`, { fallbackError: "ตรวจเอกสารบังคับไม่สำเร็จ" }));
    } catch (failure) {
      setReqError(failure.message || "ตรวจเอกสารบังคับไม่สำเร็จ");
    }
  }, [registrationId]);

  useEffect(() => { load(); checkRequirements(); }, [load, checkRequirements]);

  /* 🐞 **ตัวรับรายการไฟล์ต้องคงตัว (useCallback)** — `AttachmentsPanel` เรียก `onItemsChange` ใน effect ที่มีตัวมันเองเป็น dep
     ⇒ เดิมส่ง arrow ใหม่ทุก render: effect ยิง → ตรวจเอกสารใหม่ → `setReq` → render → arrow ใหม่ → effect ยิงอีก ฯลฯ
     แผงที่เปิดค้างไว้ยิง `/requirements` (4 query ต่อครั้ง) วนไม่หยุด ~1–2 ครั้งต่อวินาที (วัด 04/11/2026) จนกว่าจะปิดแผง
     ⇒ ตัวรับคงตัว = effect ยิงเฉพาะตอนรายการไฟล์เปลี่ยนจริง */
  const onRegistrationFiles = useCallback((items, meta) => {
    if (!meta?.loaded) return;
    setRegFiles(Array.isArray(items) ? items : []);
    checkRequirements();
  }, [checkRequirements]);
  const onCustomerFiles = useCallback((_, meta) => {
    if (meta?.loaded) checkRequirements();
  }, [checkRequirements]);
  /* Artwork ของสินค้าเปลี่ยน (แนบ/ลบในแผงนี้) = ด่านยื่นเปลี่ยน — ตัวรับคงตัวด้วยเหตุผลเดียวกับข้างบน */
  const onArtworkFiles = useCallback((_, meta) => {
    if (meta?.loaded) checkRequirements();
  }, [checkRequirements]);
  /* ชุดการ์ดของสองแผง — คงตัวด้วย useMemo (แผงผูก callback บางตัวกับ `types` · ชุดใหม่ทุก render = สร้าง handler ใหม่ทุกรอบ) */
  const regStatus = reg?.status || null;
  const hasApprovalLetter = regFiles.some((file) => file.docType === APPROVAL_LETTER_DOC);
  const hasLegacyLabel = regFiles.some((file) => file.docType === LEGACY_LABEL_DOC_TYPE);
  const regDocTypes = useMemo(() => registrationDocTypes(regStatus, hasApprovalLetter, hasLegacyLabel),
    [regStatus, hasApprovalLetter, hasLegacyLabel]);
  const customerType = reg?.customer?.customerType;
  const custDocTypes = useMemo(() => registrationCustomerDocTypes(customerType), [customerType]);

  const productId = reg?.productId || item.productId || null;

  /* สร้างคำขอ = POST ทางเดิม (ร่าง) — ลูกค้า/FG มาจากหน้าที่เปิด ไม่มีช่องให้เลือก · ไม่ลองซ้ำ (POST ซ้ำ = 409 ใบซ้ำ) */
  const create = async () => {
    setBusy("create");
    setError("");
    try {
      const created = await apiJson("/api/excise-registrations", {
        method: "POST",
        json: { productId: item.productId, customerId: item.customerId },
        fallbackError: "สร้างคำขอทะเบียนไม่สำเร็จ",
      });
      onCreated?.(created?.id);
    } catch (failure) {
      setError(failure.message || "สร้างคำขอทะเบียนไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
    setBusy("submit");
    setError("");
    try {
      await apiJson(`/api/excise-registrations/${encodeURIComponent(reg.id)}`, {
        method: "PATCH", json: { status: "pending_legal" }, fallbackError: "ยื่นให้ RA ไม่สำเร็จ",
      });
      await load();
      onChanged?.();
    } catch (failure) {
      setError(failure.message || "ยื่นให้ RA ไม่สำเร็จ");
      await checkRequirements();
    } finally {
      setBusy("");
    }
  };

  if (!registrationId) {
    return (
      <section className={styles.section}>
        <Header item={item} reg={null} />
        <StatusNotice tone="info">
          FG นี้ยังไม่มีทะเบียนสรรพสามิตของลูกค้ารายนี้ — สร้างคำขอเป็นฉบับร่าง แล้วแนบเอกสาร ยื่นให้ฝ่าย RA ตรวจจากแผงนี้
        </StatusNotice>
        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
        {canEdit ? (
          <div className={styles.actions}>
            <Button onClick={create} disabled={!!busy}>{busy === "create" ? "กำลังสร้าง…" : "สร้างคำขอทะเบียน"}</Button>
          </div>
        ) : <p className={styles.muted}>ต้องมีสิทธิ์แก้ข้อมูลสินค้าจึงสร้างคำขอทะเบียนได้</p>}
      </section>
    );
  }

  if (loading && !reg) return <p className={styles.muted}>กำลังโหลดทะเบียน…</p>;
  if (loadError && !reg) return <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>{loadError}</StatusNotice>;
  if (!reg) return null;

  const status = reg.status;
  const editableDocs = canEdit && status !== "approved";
  const submittable = status === "draft" || status === "rejected";
  const missing = req?.missing || [];
  /* แนบ Artwork ได้ตรงนี้เมื่อทะเบียนยังใช้ชุดปัจจุบัน (ร่าง/ตีกลับ) — ยื่นแล้ว = โชว์ชุดที่ตรึงไว้แบบอ่านอย่างเดียว */
  const artworkEditable = canEdit && usesLiveArtwork(status) && !!productId;
  const submitBlocker = !canEdit ? "ต้องมีสิทธิ์แก้ข้อมูลสินค้าจึงยื่นได้"
    : reqError ? "ยังตรวจเอกสารบังคับไม่ได้ — กดตรวจใหม่"
      : !req ? "กำลังตรวจเอกสารบังคับ…"
        : req.ready ? null : `ยังขาด: ${missing.map((m) => m.label).join(", ")}`;

  return (
    <section className={styles.section}>
      <Header item={item} reg={reg} />

      {status === "rejected" && reg.rejectionReason ? (
        <StatusNotice tone="error">RA ตีกลับ: {reg.rejectionReason} — แก้ตามนี้แล้วกด “ยื่นใหม่”</StatusNotice>
      ) : null}
      {status === "pending_legal" ? <StatusNotice tone="info">ยื่นแล้ว — รอฝ่าย RA ตรวจและอนุมัติ</StatusNotice> : null}
      {status === "approved" ? (
        <StatusNotice tone="success">
          อนุมัติแล้ว{reg.approvalNumber ? ` · เลขที่ ${reg.approvalNumber}` : ""}{reg.approvedAt ? ` · ${fmtDate(reg.approvedAt)}` : ""}
          {reg.isExciseTaxable === false ? " · RA ยกเว้นภาษี" : ""}
        </StatusNotice>
      ) : null}

      {/* เช็กลิสต์เอกสารบังคับ — ตัวตรวจเดียวกับด่านยื่นของ server */}
      {submittable && (
        <div className={styles.checklist}>
          <div className={styles.checklistHead}>
            <strong>เอกสารบังคับก่อนยื่น</strong>
            <Button size="sm" variant="ghost" onClick={checkRequirements}>ตรวจใหม่</Button>
          </div>
          {reqError ? <StatusNotice tone="error">{reqError}</StatusNotice>
            : !req ? <p className={styles.muted}>กำลังตรวจ…</p>
              : req.ready ? <p className={styles.ok}>เอกสารครบ — ยื่นให้ RA ได้</p>
                : (
                  <ul className={styles.missing}>
                    {missing.map((m) => {
                      const hint = fixHint(m, reg);
                      return (
                        <li key={`${m.entity}:${m.docType}`}>
                          {m.label}
                          {hint ? <> · <Link href={hint.href} className="linklike">{hint.label}</Link></>
                            : <span className={styles.muted}> · แนบด้านล่าง</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
        </div>
      )}

      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
      {submittable && (
        <div className={styles.actions}>
          <Button onClick={submit} disabled={!!busy || !!submitBlocker}>
            {busy === "submit" ? "กำลังยื่น…" : status === "rejected" ? "ยื่นใหม่ให้ RA" : "ยื่นให้ RA"}
          </Button>
          {submitBlocker ? <small className={styles.reason}>{submitBlocker}</small> : null}
        </div>
      )}

      {/* ⭐ Artwork ที่ใช้ยื่น = Artwork ของสินค้า (P1) — แนบที่นี่ = ไฟล์ขึ้นที่แท็บเอกสารของสินค้าด้วย (ชุดเดียวกัน)
          ร่าง/ตีกลับ = แผงไฟล์ของสินค้าตัวจริง · ยื่นแล้ว = ชุดที่ตรึงไว้ตอนยื่น (อ่านอย่างเดียว · RA ตรวจชุดนี้) */}
      {artworkEditable ? (
        <AttachmentsPanel
          entityType="product"
          entityId={productId}
          canEdit
          docTypes={ARTWORK_CARD}
          title="Artwork ที่ใช้ยื่น (เก็บที่สินค้า)"
          note="ไฟล์ชุดเดียวกับการ์ด Artwork ในแท็บเอกสารของสินค้า — ยื่นทุกไฟล์ที่อยู่ในการ์ดนี้ · ตอนยื่นระบบจำชุดนี้ไว้ให้ RA ตรวจ"
          onItemsChange={onArtworkFiles}
          cardColumns={1}
        />
      ) : (
        <SubmittedArtwork files={reg.labelArtwork} live={usesLiveArtwork(status)} />
      )}
      <AttachmentsPanel
        entityType="registration"
        entityId={reg.id}
        canEdit={editableDocs}
        docTypes={regDocTypes}
        title="เอกสารของทะเบียน (ใบอนุมัติ · อื่น ๆ)"
        onItemsChange={onRegistrationFiles}
        cardColumns={1}
      />
      {reg.customerId ? (
        <AttachmentsPanel
          entityType="customer"
          entityId={reg.customerId}
          canEdit={canEdit}
          docTypes={custDocTypes}
          note="ด่านยื่นทะเบียนใช้แผนที่ที่อยู่ใบเดียว · เอกสารอื่นของลูกค้าเก็บที่หน้าลูกค้า"
          title={`เอกสารลูกค้า${customerNameIn(reg.customer) ? ` — ${customerNameIn(reg.customer)}` : ""} (ชุดเดียวกับหน้าลูกค้า)`}
          onItemsChange={onCustomerFiles}
          cardColumns={1}
        />
      ) : null}
    </section>
  );
}

/* ฉลากที่ทะเบียนใช้ แบบอ่านอย่างเดียว — ชุดที่ตรึงตอนยื่น (หรือชุดปัจจุบันเมื่อคนดูแนบไม่ได้) · มาจาก server (`reg.labelArtwork`)
   ⭐ ตัวเดียวกับหน้าทะเบียนของ RA (/tax/registrations/[id]) — export ให้หน้านั้นวาดชุดเดียวกัน ไม่เขียนรายการไฟล์อีกชุด
   ⚠️ ไฟล์ที่สินค้าถอดออกไปแล้ว (ปลดระวาง) ยังเปิดได้ที่นี่ — มันคือไฟล์ที่ยื่นจริง จึงบอกไว้ข้างชื่อ ไม่ซ่อน */
export function SubmittedArtwork({ files, live }) {
  const list = Array.isArray(files) ? files : [];
  return (
    <div className={styles.checklist}>
      <div className={styles.checklistHead}>
        <strong>{live ? "Artwork ที่จะใช้ยื่น (จากสินค้า)" : "Artwork ที่ยื่นแล้ว"}</strong>
        <span className={styles.muted}>{list.length} ไฟล์</span>
      </div>
      {list.length ? (
        <ul className={styles.files}>
          {list.map((file) => {
            const href = attachmentHref(file);
            const name = file.fileName || "ไม่มีชื่อไฟล์";
            const retiredNote = retiredArtworkNote(file);
            return (
              <li key={file.id}>
                {href ? <a href={href} target="_blank" rel="noreferrer" className="linklike">{name}</a> : name}
                {file.docType === LEGACY_LABEL_DOC_TYPE ? <span className={styles.muted}> · แนบที่ทะเบียน (แบบเดิม)</span> : null}
                {retiredNote ? <span className={styles.muted}> · {retiredNote}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.muted}>{live ? "สินค้านี้ยังไม่มี Artwork — แนบที่แท็บเอกสารของสินค้า" : "ไม่พบไฟล์ที่ยื่น"}</p>}
    </div>
  );
}

function Header({ item, reg }) {
  return (
    <header className={styles.head}>
      <div>
        <span className={styles.code}>{reg?.fgCode || item.fgCode}</span>
        <span className={styles.name}>{naText(reg?.productName || item.label)}</span>
        <span className={styles.customer}>{naText(reg?.customerName || item.customerName)}</span>
      </div>
      {reg ? <StatusBadge status={reg.status} /> : <span className={styles.muted}>ยังไม่มีทะเบียน</span>}
    </header>
  );
}
