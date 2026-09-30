"use client";
// ── หน้าต่าง "เพิ่มหลายโซน" ของขั้น ② (มติเจ้าของ 25/09 · PR-D = ตัวห่อของ ZonesBulkModal — D27) ────────────────────
//
// ⭐ แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ที่ถอดแล้ว — ช่องนั้นไม่บันทึกอะไร เททับแพ็คเกจของ **ทุกบรรทัดที่มีอยู่**
//   เงียบ ๆ และตอนเปิดแก้ใบอ่านค่าจากบรรทัดแรก · หน้าต่างนี้ทำงานเดียวที่ช่องนั้นตั้งใจทำ (ลูกค้าโซนเยอะ ไม่ต้องเลือก
//   แพ็คเกจ 43 ครั้ง) โดย **เพิ่มบรรทัดใหม่เท่านั้น** ไม่แตะบรรทัดที่คีย์ไว้แล้ว
// ⭐ PR-D (mig 0394 · DD4): ห่อหน้าต่างกลางของงานบริการ (`components/service/ZonesBulkModal`) — หน้าต่างเดียวสองงาน
//   · ตัวกลางถือ: ค้น → ติ๊ก (ทีละโซน / ทั้งไซต์ / ทุกโซนที่เห็น) · รอบละกี่แพ็ค [ตามผลประเมินของแต่ละโซน | เท่ากันทุกโซน] ·
//     ท้ายหน้าต่างบอกผลก่อนกด · `pressed`
//   · ตัวห่อถือ: แพ็คเกจ * · จำนวน (ต่อบรรทัด · ว่างได้) · ราคา/หน่วย (อ่านอย่างเดียว) · จำนวนรอบบริการ (ทุกบรรทัด) *
//   · ⭐ มติ 29/09: ช่องของตัวห่อวาดเหนือแถว "แต่ละครั้งกี่แพ็ค (ทุกบรรทัด)" ของตัวกลาง ⇒ จำนวนรอบบริการมาก่อนแพ็คเหมือนใบใหม่
//   · หนึ่งโซนที่ติ๊ก = หนึ่งบรรทัดใหม่ (`historicalBulkAddRows` — แพ็คต่อรอบรายโซนมาจากแถวของตัวกลาง)
//   · ทะเบียน = ทะเบียนรายไซต์ชุดเดียวกับขั้น ② (`historicalBulkRegistrySites` — ไซต์ที่อ่านโซนไม่ได้พกประโยคทางออก)
// ⭐ โซนที่อยู่ในใบแล้ว / ปิดใช้งาน **เห็นแต่ติ๊กไม่ได้ พร้อมเหตุ** (`historicalBulkTaken` → `taken` ของตัวกลาง)
//   ⚠️ โซนที่อยู่ในใบแล้ววาดแบบไม่ติ๊ก (ตัวกลางติ๊กให้เฉพาะโซนของรายการเดียวกัน) — ยอมรับใน DD4
// 🔴 กฎบ้าน 3 (แดงหลังกด): ข้อความติดด่านขึ้นหลังกด "เพิ่ม n บรรทัด" เท่านั้น · ⚠️ ถอยจาก 25/09 ที่ปุ่มปิดและบอกเหตุทันที
//    **โดยตั้งใจ** (IMPL_PLAN_D §0.2 ข้อ 3) · ลำดับเหตุ (M1): ช่องของตัวห่อ (แพ็คเกจ → จำนวน → จำนวนรอบบริการ · `historicalBulkFieldsIssue`)
//    ก่อน แล้วค่อยของตัวกลาง (ยังไม่เลือกโซน / รอบละกี่แพ็คผิด)
// ⚠️ จำนวนเว้นว่างได้ (ใส่ทีละบรรทัดทีหลัง) แต่ใส่แล้วต้องเป็นจำนวนเต็ม > 0 — ด่านเดียวกับแผน (ไม่เดาจำนวนแทนผู้คีย์)
// ⚠️ แพ็คเกจเติมที่ขั้น ② ด้วย `quoteLineFromProduct` ตัวเดียวกับช่องเลือกในบรรทัด (ผู้เรียกทำใน `onAdd`)
// ⚠️ ผลประเมินยังโหลด/อ่านไม่ได้ (M6) = บอกหนึ่งบรรทัดเหนือแถวรอบละกี่แพ็คว่าโหมด "ตามผลประเมิน" จะได้ช่องว่าง ·
//    **ไม่สลับโหมดให้เอง** (ผลมาถึงตอนหน้าต่างเปิดอยู่แล้วโหมดเปลี่ยน = ตัวกลางล้างที่ติ๊กไว้)
import { useEffect, useMemo, useState } from "react";
import ZonesBulkModal from "@/components/service/ZonesBulkModal";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtMoney } from "@/lib/format";
import { QUOTE_PRICE_FIELD } from "@/lib/sales/quoteLines";
import {
  HISTORICAL_SERVICE_TEXT, REGISTRY_LOAD_FAILED, historicalBulkAddRows, historicalBulkConsequence, historicalBulkFieldsIssue,
  historicalBulkQtyIssue, historicalBulkRegistrySites, historicalBulkRoundsIssue, historicalBulkTaken,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

const T = HISTORICAL_SERVICE_TEXT.bulk;

export default function HistoricalBulkZonesModal({
  open, onClose, sites = [], zonesBySite = {}, siteErrors = {}, loading = false, loadError = "",
  rows = [], packageOptions = [], productsById = new Map(), productsError = "",
  assessedByZone = null, assessState = "idle", onAdd,
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [rounds, setRounds] = useState("");

  /* เปิดใหม่ = เริ่มใหม่ทั้งหน้าต่าง — ช่องของตัวห่อ (ตัวกลางล้าง ค้น/ติ๊ก/แพ็คต่อรอบ ของมันเอง) */
  useEffect(() => {
    if (!open) return;
    setProductId("");
    setQty("");
    setRounds("");
  }, [open]);

  /* ผลประเมินที่ยังไม่ ok (กำลังอ่าน/อ่านไม่ได้) = ไม่ส่งตัวเลข — โหมด "ตามผลประเมิน" ได้ช่องว่าง พร้อมบรรทัดบอก (M6) */
  const assessed = assessState === "ok" ? assessedByZone : null;
  const registrySites = useMemo(() => historicalBulkRegistrySites({
    sites, zonesBySite, siteErrors, assessedByZone: assessed,
  }), [sites, zonesBySite, siteErrors, assessed]);
  /* โซนที่ใบผูกไว้แล้ว → "อยู่ในใบแล้ว (รายการ n)" (เลขคอลัมน์ "#" ของตาราง) */
  const taken = useMemo(() => historicalBulkTaken(rows), [rows]);

  const product = productId ? productsById.get(productId) || null : null;
  const unitPrice = product ? Number(product[QUOTE_PRICE_FIELD]) : null;
  const qtyIssue = historicalBulkQtyIssue(qty);
  const roundsIssue = historicalBulkRoundsIssue(rounds);
  const extraError = historicalBulkFieldsIssue({ productId, qty, rounds });
  const assessNote = assessState === "loading" ? T.assessLoading : (assessState === "error" ? T.assessFailed : null);

  return (
    <ZonesBulkModal
      open={open}
      onClose={onClose}
      title={T.title}
      subtitle={T.subtitle}
      lead={null}
      packsLabel={T.packsLabel}
      registrySites={registrySites}
      loading={loading}
      loadError={loadError}
      taken={taken}
      existingCount={0}
      cap={Number.POSITIVE_INFINITY}
      emptyRegistryText={T.emptyRegistry}
      /* ผลประเมินยังไม่ ok = ซ่อนประโยค "โซนที่ยังไม่เคยประเมินเว้นว่างไว้" ของตัวกลาง — บรรทัด M6 (ทุกโซนจะว่าง) พูดคนเดียว */
      assessedHint={assessState === "ok" ? T.assessedHint : null}
      extraError={extraError}
      renderFields={({ pressed }) => (
        <>
          <div className={styles.bulkFields}>
            <div className={styles.field}>
              <span>{T.packageLabel} <b className={styles.req}>*</b></span>
              <SearchableSelect
                entity="product"
                value={productId}
                onChange={setProductId}
                options={packageOptions}
                ariaLabel="แพ็คเกจของทุกบรรทัดที่จะเพิ่ม"
                placeholder="เลือก FG / สินค้า..."
                searchPlaceholder="ค้นหารหัส FG หรือชื่อแพ็คเกจ"
                emptyText={productsError ? REGISTRY_LOAD_FAILED : "ลูกค้ารายนี้ยังไม่มีแพ็คเกจบริการ (หมวด 02-001) ในทะเบียนสินค้า"}
              />
              {pressed && !productId ? <small data-bad="yes">{T.noPackage}</small> : null}
            </div>
            <div className={styles.field}>
              <span>{T.qtyLabel}</span>
              {/* กรอบแดง = คลาส is-invalid (MoneyInput ไม่แปลง aria-invalid เป็นกรอบ — review 29/09) · แดงหลังกดเหมือนช่องรอบ */}
              <MoneyInput min="0" autoComplete="off" className={pressed && qtyIssue ? "is-invalid" : ""} value={qty} onChange={(value) => setQty(value ?? "")} aria-label="จำนวนต่อบรรทัด" aria-invalid={pressed && qtyIssue ? "true" : undefined} />
              <small data-bad={pressed && qtyIssue ? "yes" : undefined}>
                {(pressed && qtyIssue) || T.qtyHint(product?.saleUnit)}
              </small>
            </div>
            <div className={styles.field}>
              <span>{T.priceLabel}</span>
              <div className={styles.derived} data-empty={product ? undefined : "yes"}>
                {product ? fmtMoney(unitPrice) : T.noPackage}
              </div>
              <small>{T.priceHint}</small>
            </div>
            <div className={styles.field}>
              <span>{T.roundsLabel} <b className={styles.req}>*</b></span>
              <div className={styles.packsField}>
                <Input
                  type="number" min="1" step="1" inputMode="numeric" placeholder="—" autoComplete="off"
                  value={rounds}
                  invalid={pressed && Boolean(roundsIssue)}
                  aria-required="true"
                  onChange={(event) => setRounds(event.target.value)}
                  aria-label={T.roundsAria}
                />
                <span className={styles.packsUnit}>{T.roundsUnit}</span>
              </div>
              <small data-bad={pressed && roundsIssue ? "yes" : undefined}>
                {(pressed && roundsIssue) || HISTORICAL_SERVICE_TEXT.roundsNote}
              </small>
            </div>
          </div>
          {assessNote ? <p className={styles.assessNote}>{assessNote}</p> : null}
        </>
      )}
      consequence={(plan, { mode }) => historicalBulkConsequence({
        count: plan.count, qty, unitPrice, mode, packs: plan.packs, assessed: plan.assessed, blank: plan.blank, rounds,
      })}
      confirmLabel={T.confirm}
      onAdd={(planRows) => onAdd?.(historicalBulkAddRows({
        zoneIds: planRows.map((row) => row.zoneId), sites, zonesBySite, rows, qty, rounds,
        packsByZone: new Map(planRows.map((row) => [row.zoneId, row.packsPerRound])),
      }), productId)}
    />
  );
}
