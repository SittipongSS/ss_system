"use client";

import Workspace from "@/components/ui/Workspace";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import RegistryPrice from "@/components/database/RegistryPrice";
import styles from "./registryForm.module.css";
import { NA } from "@/lib/format";

/* ── เปลือกหน้ารายละเอียดของทะเบียนกลิ่น/สูตร ──────────────────────────────
 *
 * ⭐ **ของกลางล้วน** — `Workspace` + `SalesDetailOverview` + `DetailPageLayout` +
 * `DocumentControlCard` ชุดเดียวกับหน้ารายละเอียดคำร้อง/ใบเสนอราคา
 * (กติกาถาวรข้อ 1: หน้าใหม่หยิบจาก design-preview เท่านั้น ห้ามคิดค่า/คลาสเอง)
 *
 * ⭐ **เปลือกเดียวสองทะเบียน** — กลิ่นกับสูตรต่างกันแค่ *ข้อเท็จจริง* กับ *ปุ่ม*
 * ซึ่งรับเป็น props · เขียนสองเปลือกเมื่อไรมันจะเพี้ยนหากันเหมือนที่ AGENTS.md
 * บันทึกไว้เรื่องฟอร์มสร้าง/แก้
 *
 * ⚠️ ปุ่มระดับใบอยู่ที่ **การ์ดขวาที่เดียว** — หัวใบไม่มีปุ่ม (มติเดียวกับหน้าคำร้อง
 * โครง panel) · วางสองที่เมื่อไรคนจะไม่รู้ว่าอันไหนคือของจริง
 */
export default function RegistryDetailShell({
  back,
  loading = false,
  error = "",
  eyebrow,
  title,
  description,
  statusLabel,
  statusTone,
  statusDescription,
  facts = [],
  price = undefined,
  priceLabel = "ราคา",
  primaryAction = null,
  secondaryActions = [],
  dangerActions = [],
  busy = false,
  children,
}) {
  if (loading) return <Workspace hideHeader back={back}><SkeletonRows rows={5} /></Workspace>;
  if (error) {
    return (
      <Workspace hideHeader back={back}>
        {/* ⚠️ ใช้ `StatusNotice` ของกลาง — กล่อง glass-panel + inline style ที่เขียนเอง
            คือชั้นเก่าที่ ratchet นับเป็นหนี้ (และ audit จับได้จริงตอนเขียนหน้านี้) */}
        <StatusNotice tone="error" title="เปิดรายการนี้ไม่ได้">{error}</StatusNotice>
      </Workspace>
    );
  }

  return (
    <Workspace hideHeader back={back}>
      <SalesDetailOverview
        eyebrow={eyebrow}
        title={title}
        description={description}
        badges={statusLabel ? <DetailStateBadge label={statusLabel} color={statusTone} /> : null}
        facts={facts}
      />

      <DetailPageLayout
        className={styles.detailLayout}
        asideLabel="จัดการรายการในทะเบียน"
        aside={(
          <DocumentControlCard
            title="จัดการทะเบียน"
            status={statusLabel}
            statusColor={statusTone}
            statusDescription={statusDescription}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            dangerActions={dangerActions}
            busy={busy}
            /* ⚠️ ราคาอยู่ในการ์ดจัดการ ไม่ใช่หัวใบ — มันคือของที่ "ต้องไปทำอะไรต่อ"
               (รอราคา / หมดอายุ) ไม่ใช่ข้อเท็จจริงประจำตัวเหมือนรหัสหรือลูกค้า */
            notices={price !== undefined ? (
              <div className={styles.priceBlock}>
                <span className="toolbar-label">{priceLabel}</span>
                <div className={styles.priceValue}><RegistryPrice price={price} /></div>
              </div>
            ) : null}
          />
        )}
      >
        {children}
      </DetailPageLayout>
    </Workspace>
  );
}

/** การ์ดข้อเท็จจริงในคอลัมน์ซ้าย — คู่ป้าย/ค่า เรียงสองคอลัมน์ */
export function RegistryFactCard({ icon, eyebrow, title, rows = [], children }) {
  return (
    <DetailCard icon={icon} eyebrow={eyebrow} title={title}>
      <dl className={styles.factGrid}>
        {rows.filter(Boolean).map((row) => (
          <div key={row.label} className={row.wide ? styles.factWide : undefined}>
            <dt>{row.label}</dt>
            {/* ⚠️ ค่าว่างต้องอ่านเป็น "ยังไม่มี" ไม่ใช่ช่องหาย — ขีดกลางบอกว่าตรวจแล้ว */}
            <dd>{row.value ?? <span className={styles.muted}>{NA}</span>}</dd>
          </div>
        ))}
      </dl>
      {children}
    </DetailCard>
  );
}
