"use client";
/* ── แผงทะเบียนสรรพสามิตฝั่งขาย (แผนรื้อสรรพสามิต หมวด 12.6 · มติเจ้าของ 02/11 V8 · V14) ──────────────────────────────
   SA ไม่เข้า /tax แล้ว (V7 · V13) ⇒ งานเอกสารทะเบียนของ SA ย้ายมาที่นี่: สร้างคำขอ · เช็กลิสต์เอกสารบังคับ · แนบไฟล์ ·
   ยื่นให้ RA · ดูเหตุที่ตีกลับ · แก้แล้วยื่นใหม่ — **ตัวเดียว** ของหน้าสินค้า FG และหน้า SO ลูกค้า (V8 ฟอร์มเดียว)
   ⭐ ข้อมูล/ด่านเป็นชุดเดียวกับหน้า /tax/registrations/[id] ของ RA: GET `?full=1` · GET `/requirements` (ตัวตรวจตัวเดียวกับด่าน
      ยื่นของ server) · PATCH `{ status: 'pending_legal' }` · AttachmentsPanel ของทะเบียน + ของลูกค้า (เอกสารลูกค้าเก็บที่ลูกค้าที่เดียว)
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
import { customerNameIn } from "@/lib/master/customerName";
import { fmtDate, naText } from "@/lib/format";
import { REUSE_TARGET_DOC_TYPE, reusableProductArtwork, reuseProductArtwork } from "@/lib/excise/registrationArtworkReuse";
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
const registrationDocTypes = (status, hasApprovalLetter) => ATTACHMENT_TYPES.registration.filter((type) => type.key !== APPROVAL_LETTER_DOC
  || status === "approved" || hasApprovalLetter);

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
  return <RegistrationWork items={items} initialKey={initialKey} canEdit={canEdit} onChanged={onChanged} onClose={onClose} />;
}

function RegistrationWork({ items, initialKey, canEdit, onChanged, onClose }) {
  const [activeKey, setActiveKey] = useState(initialKey && items.some((item) => item.key === initialKey) ? initialKey : items[0].key);
  // ทะเบียนที่เพิ่งสร้างในแผงนี้ (รายการจากหน้าที่เปิดยังไม่รู้ id จนกว่าจะโหลดใหม่)
  const [createdIds, setCreatedIds] = useState({});
  const active = items.find((item) => item.key === activeKey) || items[0];
  const registrationId = active.registrationId || createdIds[active.key] || null;

  return (
    <Modal open onClose={onClose} title="ทะเบียนสรรพสามิต" size="lg">
      <div className={styles.body}>
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
        <div className="action-bar">
          <Button variant="quiet" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </Modal>
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
  /* ไฟล์ของทะเบียน (จากแผงไฟล์แนบ) + Artwork ของสินค้า — ใช้หาไฟล์ที่ "ใช้ไฟล์นี้ยื่น" ได้ · `regFilesKey` = บังคับแผงโหลดใหม่หลังคัดลอก */
  const [regFiles, setRegFiles] = useState([]);
  const [productFiles, setProductFiles] = useState([]);
  const [regFilesKey, setRegFilesKey] = useState(0);
  const [reuseNote, setReuseNote] = useState("");

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
  /* ชุดการ์ดของสองแผง — คงตัวด้วย useMemo (แผงผูก callback บางตัวกับ `types` · ชุดใหม่ทุก render = สร้าง handler ใหม่ทุกรอบ) */
  const regStatus = reg?.status || null;
  const hasApprovalLetter = regFiles.some((file) => file.docType === APPROVAL_LETTER_DOC);
  const regDocTypes = useMemo(() => registrationDocTypes(regStatus, hasApprovalLetter), [regStatus, hasApprovalLetter]);
  const customerType = reg?.customer?.customerType;
  const custDocTypes = useMemo(() => registrationCustomerDocTypes(customerType), [customerType]);

  /* Artwork ของสินค้า — อ่านอย่างเดียว ไม่มีผลกับด่าน · อ่านไม่ได้ = ไม่มีปุ่มให้กด (ยังแนบเองได้ตามเดิม) */
  const productId = reg?.productId || item.productId || null;
  useEffect(() => {
    if (!productId || !canEdit) return undefined;
    let alive = true;
    apiJson(`/api/attachments?entityType=product&entityId=${encodeURIComponent(productId)}`, { fallbackError: "โหลด Artwork ของสินค้าไม่สำเร็จ" })
      .then((rows) => { if (alive) setProductFiles(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setProductFiles([]); });
    return () => { alive = false; };
  }, [productId, canEdit]);

  /* ⭐ "ใช้ไฟล์นี้ยื่น" (มติเจ้าของ 04/11/2026) — คัดลอก Artwork ของสินค้าเป็น "ฉลาก / Artwork ที่ยื่น" ของทะเบียนทีละไฟล์
     (server คัดลอกไบต์ + ออกใบรับ แล้วแนบผ่านเส้นไฟล์แนบเส้นเดียว — ดู `lib/excise/registrationArtworkReuse.js`)
     ⚠️ ไม่ลองซ้ำเอง — ไฟล์ที่ไม่ผ่านบอกเหตุ ไฟล์ที่ผ่านแล้วถูกนับว่าใช้แล้ว (server กันสำเนาที่สองด้วย `sourceAttachmentId`) */
  const reuseArtwork = async (files) => {
    setBusy("reuse");
    setError("");
    setReuseNote("");
    let copied = 0;
    const failures = [];
    for (const file of files) {
      // ทีละไฟล์โดยตั้งใจ — ข้อความบอกผลรายไฟล์ และไม่ยิงคัดลอกพร้อมกันหลายใบใส่ Drive
      const result = await reuseProductArtwork({ registrationId: reg.id, attachmentId: file.id });
      if (result.ok) copied += 1;
      else failures.push(`${file.fileName || "ไฟล์"}: ${result.error}`);
    }
    if (copied) setReuseNote(`ใช้ Artwork ของสินค้ายื่นแล้ว ${copied} ไฟล์`);
    if (failures.length) setError(failures.join(" · "));
    setRegFilesKey((n) => n + 1);
    await checkRequirements();
    setBusy("");
  };

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
  /* Artwork ของสินค้าที่ยังไม่ได้ใช้กับทะเบียนนี้ — ปุ่มโผล่ที่แถว "ขาด ฉลาก / Artwork ที่ยื่น" เท่านั้น */
  const reusable = canEdit && submittable ? reusableProductArtwork(productFiles, regFiles) : [];
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
                      const reuseHere = m.entity === "registration" && m.docType === REUSE_TARGET_DOC_TYPE && reusable.length > 0;
                      return (
                        <li key={`${m.entity}:${m.docType}`}>
                          {m.label}
                          {hint ? <> · <Link href={hint.href} className="linklike">{hint.label}</Link></>
                            : <span className={styles.muted}>{reuseHere ? " · ใช้ไฟล์ของสินค้า หรือแนบด้านล่าง" : " · แนบด้านล่าง"}</span>}
                          {reuseHere ? (
                            /* ⭐ ไฟล์ที่ฝ่ายขายแนบไว้ที่ "เอกสารของสินค้า" แล้ว — ไม่ต้องดาวน์โหลดมาแนบซ้ำ (มติเจ้าของ 04/11/2026) */
                            <div className={styles.reuse}>
                              <span className={styles.reuseText}>
                                สินค้านี้มี Artwork {reusable.length} ไฟล์: {reusable.map((file) => file.fileName || "ไม่มีชื่อไฟล์").join(", ")}
                              </span>
                              <Button size="sm" variant="outline" onClick={() => reuseArtwork(reusable)} disabled={!!busy}>
                                {busy === "reuse" ? "กำลังคัดลอก…" : reusable.length > 1 ? `ใช้ทั้ง ${reusable.length} ไฟล์ยื่น` : "ใช้ไฟล์นี้ยื่น"}
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
        </div>
      )}

      {reuseNote ? <StatusNotice tone="success">{reuseNote}</StatusNotice> : null}
      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
      {submittable && (
        <div className={styles.actions}>
          <Button onClick={submit} disabled={!!busy || !!submitBlocker}>
            {busy === "submit" ? "กำลังยื่น…" : status === "rejected" ? "ยื่นใหม่ให้ RA" : "ยื่นให้ RA"}
          </Button>
          {submitBlocker ? <small className={styles.reason}>{submitBlocker}</small> : null}
        </div>
      )}

      <AttachmentsPanel
        key={`reg-files:${regFilesKey}`}
        entityType="registration"
        entityId={reg.id}
        canEdit={editableDocs}
        docTypes={regDocTypes}
        title="เอกสารการขึ้นทะเบียน (เช่น artwork ฉลาก)"
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
