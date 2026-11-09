"use client";
/* ── แท็บเอกสารของสินค้า: เอกสารสรรพสามิตของสินค้านี้ (ศูนย์กลางเอกสารของสินค้า P1 · มติเจ้าของ 09/11/2026) ─────────────
   ⭐ มติ: "ฐานข้อมูลคือศูนย์กลาง — เก็บข้อมูลของระบบอื่นที่เกี่ยวกับสินค้ากลับเข้ามา" ⇒ เอกสารที่ระบบสรรพสามิตสร้างเกี่ยวกับ FG
      ต้องเห็นได้จากแท็บเอกสารของสินค้า ไม่ใช่ต้องรู้ว่าไปเปิดแท็บไหน
   · ฉลากที่ยื่น = Artwork ของสินค้า (ไฟล์ชุดเดียวกับการ์ด Artwork ด้านบน) — ทะเบียนที่ยื่นแล้วโชว์ชุดที่ตรึงไว้ตอนยื่น
   · เอกสารของกระบวนการ (ใบอนุมัติขึ้นทะเบียน · อื่น ๆ) อยู่กับทะเบียน (มติเดียวกัน) — ที่นี่ **อ่านอย่างเดียว** · ทางลงมือคือปุ่ม
     "เปิดในแท็บสรรพสามิต" (กติกา "หน้ารวมข้ามใบ = อ่านอย่างเดียว ทางลงมือชี้กลับต้นทาง" ของ docs/module-ownership-rule.md)
   ⚠️ ข้อมูลสรรพสามิตเป็นของคนที่เห็นภาษีเท่านั้น — ผู้เรียกวางการ์ดนี้หลังด่าน `canViewTax` ของหน้า */
import { useEffect, useState } from "react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import StatusBadge from "@/components/excise/StatusBadge";
import { SubmittedArtwork } from "@/components/excise/RegistrationWorkModal";
import { apiJson } from "@/lib/apiFetch";
import { ATTACHMENT_TYPES } from "@/lib/master/attachmentTypes";
import { LEGACY_LABEL_DOC_TYPE, usesLiveArtwork } from "@/lib/excise/registrationArtwork";
import { naText } from "@/lib/format";
import styles from "./ProductRegistrationDocs.module.css";

/* การ์ดเอกสารของกระบวนการ — การ์ดฉลากแบบเดิมโผล่เฉพาะทะเบียนที่ยังมีไฟล์ชนิดนั้นค้าง (ก่อนรัน mig 0427) ไม่งั้นไฟล์ตกกอง "อื่นๆ"
   ⚠️ ชุดคงตัวสองชุด (ไม่สร้างใหม่ทุก render — แผงผูก handler กับ `types`) */
const PROCESS_DOC_TYPES = ATTACHMENT_TYPES.registration.filter((type) => type.key !== LEGACY_LABEL_DOC_TYPE);
const PROCESS_DOC_TYPES_WITH_LEGACY = ATTACHMENT_TYPES.registration;

/**
 * @param registrations ทะเบียนของสินค้านี้ (`relations.registrations` ของหน้าสินค้า)
 * @param onOpen        เปิดทะเบียนใบนั้นในแท็บสรรพสามิต `(registrationId) => void`
 */
export default function ProductRegistrationDocs({ registrations = [], onOpen }) {
  if (!registrations.length) return null;
  return (
    <div className={styles.list}>
      {registrations.map((registration) => (
        <RegistrationDocs key={registration.id} registration={registration} onOpen={onOpen} />
      ))}
    </div>
  );
}

function RegistrationDocs({ registration, onOpen }) {
  const [full, setFull] = useState(null);
  const [error, setError] = useState("");

  /* ฉลากที่ทะเบียนใช้ตัดสินที่ server (GET ?full=1 · `labelArtwork`) — ตัวเดียวกับด่านยื่นและหน้า RA ไม่เดาเองที่จอ */
  useEffect(() => {
    let alive = true;
    apiJson(`/api/excise-registrations/${encodeURIComponent(registration.id)}?full=1`, { fallbackError: "โหลดทะเบียนไม่สำเร็จ" })
      .then((data) => { if (alive) { setFull(data); setError(""); } })
      .catch((failure) => { if (alive) setError(failure.message || "โหลดทะเบียนไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [registration.id]);

  const status = full?.status || registration.status;
  const hasLegacyLabel = (full?.labelArtwork || []).some((file) => file.docType === LEGACY_LABEL_DOC_TYPE);
  return (
    <section className={styles.item} aria-label={`ทะเบียนสรรพสามิต ${naText(registration.customerName)}`}>
      <header className={styles.head}>
        <div className={styles.who}>
          <span className={styles.customer}>{naText(registration.customerName)}</span>
          {registration.approvalNumber ? <span className={styles.number}>เลขที่ {registration.approvalNumber}</span> : null}
        </div>
        <div className={styles.actions}>
          <StatusBadge status={status} />
          {onOpen ? <Button size="sm" variant="outline" onClick={() => onOpen(registration.id)}>เปิดในแท็บสรรพสามิต</Button> : null}
        </div>
      </header>
      {error ? <StatusNotice tone="error">{error}</StatusNotice>
        : full ? <SubmittedArtwork files={full.labelArtwork} live={usesLiveArtwork(status)} />
          : <p className={styles.muted}>กำลังโหลดฉลากที่ยื่น…</p>}
      <AttachmentsPanel
        entityType="registration"
        entityId={registration.id}
        canEdit={false}
        docTypes={hasLegacyLabel ? PROCESS_DOC_TYPES_WITH_LEGACY : PROCESS_DOC_TYPES}
        title="เอกสารของทะเบียน"
        note="ใบอนุมัติขึ้นทะเบียนแนบโดยฝ่าย RA · แก้ไขได้ที่แท็บสรรพสามิต"
        cardColumns={1}
      />
    </section>
  );
}
