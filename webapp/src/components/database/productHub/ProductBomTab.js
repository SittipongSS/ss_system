"use client";
import { Layers, Lock, LockOpen } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import { DocumentReadinessList } from "@/components/ui/DocumentControlPanel";
import ProductBomStatus from "@/components/database/ProductBomStatus";
import { bomLocked, bomReadinessItems, bomStatusOf } from "@/lib/master/productBom";
import { registryLabel } from "@/lib/master/registryLabel";
import { isGiftSetCategory } from "@/lib/master/giftSetFormulas";
import { isFragranceOilCategory } from "@/lib/master/fragranceOilScent";
import { formatVolume } from "@/lib/master/units";
import { fmtDateTime, NA } from "@/lib/format";
import styles from "./productHub.module.css";

/* ── หน้าสินค้าศูนย์รวม · แท็บ BOM (เจ้าของ 18/11/2026 "ต้องเพิ่มแท็บ BOM ด้วย" · docs/product-hub-plan.md) ─────────
 *
 * บ้านเดียวของเรื่อง BOM บนหน้าสินค้า — เดิมการ์ดสถานะอยู่ในแท็บสเปคและสูตร
 *  1 สถานะตอนนี้ (ProductBomStatus ตัวเดิม — ป้าย/โทนจาก BOM_STATUS_META ชุดเดียวกับคิว RD)
 *  2 ความพร้อมก่อนส่ง RD (เฉพาะยังไม่ส่ง/ถูกตีกลับ) — `bomReadinessItems` ข้อเดียวกับด่านปุ่มส่ง
 *  3 ของที่ส่งให้ RD = ช่องที่ล็อกเมื่อส่ง (BOM_LOCKED_FIELDS: สูตร/กลิ่น · ปริมาตร) + บอกว่าล็อกอยู่ไหม
 *  4 รอบล่าสุด — ใครส่ง/รับ/ตีกลับ/ลงเสร็จ เมื่อไร (ประวัติทุกรอบอยู่แท็บความเคลื่อนไหว)
 * ⚠️ **แท็บนี้ไม่มีปุ่ม** — ส่ง RD · ดึงกลับ · เปิดคิว อยู่การ์ดจัดการสินค้า (มติ 8 · ม-49/ม-57) · ปุ่มของ RD อยู่ที่คิว /rd/bom
 * ⚠️ ตัว BOM (รายการวัตถุดิบ/บรรจุภัณฑ์) อยู่ในโปรแกรม Express นอกระบบ — ระบบนี้เก็บสถานะ ผู้รับ และรหัส BOM เท่านั้น (mig 0419)
 */
const by = (name, at) => [name, at ? fmtDateTime(at) : null].filter(Boolean).join(" · ") || NA;

function sentItems(product) {
  const code = product.categoryCode;
  if (isGiftSetCategory(code)) {
    const rows = product.formulaComponents || [];
    return rows.length
      ? rows.map((row, index) => ({
        key: row.id || `${row.formulaId || "row"}-${index}`,
        label: `สูตรในชุด ${index + 1}`,
        value: row.formulaId ? registryLabel({ code: row.formulaCode, name: row.formulaName, date: row.formulaDate }) : "ยังไม่เลือกสูตร",
      }))
      : [{ key: "gift", label: "สูตรในชุด", value: "ยังไม่มีแถว" }];
  }
  if (isFragranceOilCategory(code)) {
    return [{ key: "scent", label: "กลิ่น", value: product.scentId ? registryLabel({ code: product.scentCode, name: product.scentName, date: product.scentProducedAt }) : "ยังไม่ผูก" }];
  }
  return [{ key: "formula", label: "สูตร", value: product.formulaId ? registryLabel({ code: product.formulaCode, name: product.formulaName, date: product.formulaDate }) : "ยังไม่ผูก" }];
}

export default function ProductBomTab({ product }) {
  const status = bomStatusOf(product);
  const locked = bomLocked(product);
  const readiness = status === null || status === "returned"
    ? bomReadinessItems(product, { formulaComponents: product.formulaComponents || [] })
    : [];
  const rows = [
    ...sentItems(product),
    { key: "volume", label: "ปริมาตร/น้ำหนักบรรจุ", value: Number(product.volume) > 0 && product.volumeUnit ? formatVolume(product) : "ยังไม่กรอก" },
  ];
  const formulaMissing = readiness.some((item) => item.id === "formula" && !item.ready);
  const round = Number(product.bomRound) || 0;
  const history = [
    product.bomSentAt && { key: "sent", label: round > 1 ? `ส่ง RD (รอบที่ ${round})` : "ส่ง RD", value: by(product.bomSentByName, product.bomSentAt) },
    product.bomAcceptedAt && { key: "accepted", label: "RD รับเรื่อง", value: by(product.bomAcceptedByName, product.bomAcceptedAt) },
    product.bomReturnedAt && { key: "returned", label: "RD ตีกลับ", value: by(product.bomReturnedByName, product.bomReturnedAt), sub: product.bomReturnReason ? `เหตุผล: ${product.bomReturnReason}` : null },
    product.bomDoneAt && { key: "done", label: "ลง BOM เสร็จ", value: by(product.bomDoneByName, product.bomDoneAt), sub: product.bomCode ? `รหัส BOM ใน Express: ${product.bomCode}` : null },
  ].filter(Boolean);

  return (
    <>
      <DetailCard icon={Layers} eyebrow="BOM" title="สถานะลง BOM" meta="RD ลง BOM ในโปรแกรม Express แล้วอัปเดตสถานะกลับมาที่นี่ · ปุ่มส่ง/ดึงกลับอยู่ที่การ์ดจัดการ">
        <ProductBomStatus product={product} />
      </DetailCard>

      <div className={styles.grid2}>
        {readiness.length ? (
          <DetailCard icon={Layers} eyebrow="READINESS" title="ความพร้อมก่อนส่ง RD">
            <DocumentReadinessList items={readiness} label="ความพร้อมก่อนส่ง RD" />
          </DetailCard>
        ) : null}

        <DetailCard
          icon={Layers}
          eyebrow="SENT TO RD"
          title="ข้อมูลที่ส่งให้ RD"
          meta={locked ? "ล็อกอยู่ — แก้ไม่ได้จนกว่าจะดึงกลับหรือ RD ตีกลับ" : "ยังแก้ได้ — จะล็อกตั้งแต่กดส่ง RD"}
        >
          <dl className={styles.kv}>
            {rows.map((row) => (
              <div key={row.key} className={styles.kvRow}>
                <dt>{row.label}</dt>
                <dd>
                  {locked ? <Lock size={13} aria-label="ล็อก" className={styles.kvIcon} /> : <LockOpen size={13} aria-hidden="true" className={styles.kvIconMuted} />}
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {formulaMissing ? (
            <p className={styles.note}>ผูกสูตร/กลิ่นจากทะเบียนได้ที่ปุ่ม &ldquo;แก้ไขข้อมูลสินค้า&rdquo; บนการ์ดจัดการ</p>
          ) : null}
        </DetailCard>

        <DetailCard icon={Layers} eyebrow="LATEST ROUND" title="รอบล่าสุด" meta="ทุกรอบย้อนดูได้ที่แท็บความเคลื่อนไหว">
          {history.length ? (
            <dl className={styles.kv}>
              {history.map((row) => (
                <div key={row.key} className={styles.kvRow}>
                  <dt>{row.label}</dt>
                  <dd className={styles.kvStack}>
                    <span>{row.value}</span>
                    {row.sub ? <small>{row.sub}</small> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.note}>ยังไม่เคยส่ง RD ลง BOM</p>
          )}
        </DetailCard>
      </div>
    </>
  );
}
