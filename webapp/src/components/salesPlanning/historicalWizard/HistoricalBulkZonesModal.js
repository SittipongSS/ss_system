"use client";
// ── หน้าต่าง "เพิ่มหลายโซน" ของขั้น ② (มติเจ้าของ 25/09 · PR-D = ตัวห่อของ ZonesBulkModal — D27) ────────────────────
//
// ⭐ แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ที่ถอดแล้ว — ช่องนั้นไม่บันทึกอะไร เททับแพ็คเกจของ **ทุกบรรทัดที่มีอยู่**
//   เงียบ ๆ และตอนเปิดแก้ใบอ่านค่าจากบรรทัดแรก · หน้าต่างนี้ทำงานเดียวที่ช่องนั้นตั้งใจทำ (ลูกค้าโซนเยอะ ไม่ต้องเลือก
//   แพ็คเกจ 43 ครั้ง) โดย **เพิ่มบรรทัดใหม่เท่านั้น** ไม่แตะบรรทัดที่คีย์ไว้แล้ว
// ⭐ PR-D (mig 0394 · DD4): ห่อหน้าต่างกลางของงานบริการ (`components/service/ZonesBulkModal`) — หน้าต่างเดียวสองงาน
//   · ตัวกลางถือ: ค้น → ติ๊ก (ทีละโซน / ทั้งไซต์ / ทุกโซนที่เห็น) · รอบละกี่แพ็ค [ตามผลประเมินของแต่ละโซน | เท่ากันทุกโซน] ·
//     ท้ายหน้าต่างบอกผลก่อนกด · `pressed`
//   · ตัวห่อถือ: แพ็คเกจ * · แพ็ค/เดือน (ทุกบรรทัด · ว่างได้ — งวด PR-5) · จำนวน (ต่อบรรทัด · ว่างได้) · ราคา/หน่วย (อ่านอย่างเดียว) ·
//     จำนวนรอบบริการ (ทุกบรรทัด) *
//   · ⭐ งวด PR-5 (D8 · มติเจ้าของ 08/10 ข้อ A2 + ข้อ 5 "ไม่มีค่าตั้งต้นเงียบ" · mig 0409): ช่อง "แพ็ค/เดือน (ทุกบรรทัด)" ระหว่างแพ็คเกจกับจำนวน —
//     เลขเดียวลงทุกบรรทัดที่จะเพิ่ม · **ไม่บังคับ ไม่มีค่าตั้งต้น** (ว่าง = แต่ละบรรทัดได้ช่องว่างให้ใส่ในตาราง ยอดของบรรทัดนั้นยังเป็นขีด)
//     · ช่องข้อความ (`type="text" inputMode="numeric"`) เก็บทุกตัวอักษรเหมือนช่องในตาราง — ห้าม MoneyInput / type="number" / maxLength
//     · ใส่แล้วใช้ได้ = คำใบ้ใต้ช่องจำนวนพูดหน่วย "เดือน" (`historicalBulkQtyUnit`) และท้ายหน้าต่างพูดยอด เลข × จำนวน × ราคา
//       ว่างอยู่ = ท้ายหน้าต่าง **ไม่พูดยอดเงิน** (จำนวน × ราคา ตอนเลขยังว่าง = ค่าคูณ 1 ที่ไม่มีใครใส่ — R6)
//     · ผัง (รีวิว 12/10 — CSS `.bulkFields`): ช่องเลือกแพ็คเกจต้องเป็น **ลูกตัวแรก** ของกริด — ได้แถวของตัวเองเต็มกว้าง (รหัส FG ทั้งตัว + ชื่อ)
//       แล้วสามช่องตัวเลข แพ็ค/เดือน · จำนวน · ราคา/หน่วย อยู่แถวถัดไป (ลำดับเดียวกับคอลัมน์ของตาราง) · เดิมสี่ช่องแถวเดียว รหัส FG ถูกตัดห้าหลักท้าย
//     🔴 ช่องนี้เป็น "ช่องตั้งต้นของแถวใหม่" ที่ขึ้นทะเบียนไว้ (ยาม linePackReaders GE): ไฟล์นี้ไม่เขียนคีย์ของเลขนั้นเอง และส่งค่าให้ได้เฉพาะ
//        ตัวตั้งค่าของช่องเอง + ห้าตัวของ lib (historicalBulkPackIssue · historicalBulkFieldsIssue · historicalBulkQtyUnit ·
//        historicalBulkConsequence · historicalBulkAddRows) — ส่งให้ตัวที่หก = แดง · ไฟล์นี้คุยกับ historicalIntakeForm เท่านั้น (R8)
//   · ⭐ มติเจ้าของ 08/10 รอบสอง (จอฝ่ายขายที่เหลือ — แพ็คก่อนจำนวนรอบบริการ เหมือนตารางงานบริการของใบใหม่ #1878):
//     แพ็คเกจ · จำนวน · ราคา/หน่วย วาดเหนือแถว "รอบละกี่แพ็ค (ทุกบรรทัด)" ของตัวกลาง (`renderFields`) ·
//     **จำนวนรอบบริการ (ทุกบรรทัด) * ย้ายลงมาอยู่ใต้แถวนั้น** (`renderAfterPacks` — ช่องเสริมของตัวกลาง) · หน่วยท้ายช่อง = "เดือน"
//     (`T.roundsUnit` ← `SERVICE_ROUNDS_UNIT`) · ย้ายแค่ผัง — ค่า `rounds` · ด่าน · ลำดับเหตุ (M1 ข้างล่าง) เท่าเดิม
//   · หนึ่งโซนที่ติ๊ก = หนึ่งบรรทัดใหม่ (`historicalBulkAddRows` — แพ็คต่อรอบรายโซนมาจากแถวของตัวกลาง)
//   · ทะเบียน = ทะเบียนรายไซต์ชุดเดียวกับขั้น ② (`historicalBulkRegistrySites` — ไซต์ที่อ่านโซนไม่ได้พกประโยคทางออก)
// ⭐ โซนที่อยู่ในใบแล้ว / ปิดใช้งาน **เห็นแต่ติ๊กไม่ได้ พร้อมเหตุ** (`historicalBulkTaken` → `taken` ของตัวกลาง)
//   ⚠️ โซนที่อยู่ในใบแล้ววาดแบบไม่ติ๊ก (ตัวกลางติ๊กให้เฉพาะโซนของรายการเดียวกัน) — ยอมรับใน DD4
// 🔴 กฎบ้าน 3 (แดงหลังกด): ข้อความติดด่านขึ้นหลังกด "เพิ่ม n บรรทัด" เท่านั้น · ⚠️ ถอยจาก 25/09 ที่ปุ่มปิดและบอกเหตุทันที
//    **โดยตั้งใจ** (IMPL_PLAN_D §0.2 ข้อ 3) · ลำดับเหตุ (M1): ช่องของตัวห่อ (แพ็คเกจ → แพ็ค/เดือน [งวด PR-5] → จำนวน → จำนวนรอบบริการ · `historicalBulkFieldsIssue`)
//    ก่อน แล้วค่อยของตัวกลาง (ยังไม่เลือกโซน / รอบละกี่แพ็คผิด) — ⚠️ หลังมติ 08/10 รอบสอง ช่องจำนวนรอบบริการอยู่ใต้แถวแพ็ค แต่ลำดับเหตุ
//    ยังเป็นของเดิม (สัญญาของตรรกะ ไม่ใช่ของผัง) ⇒ ผิดทั้งสองช่อง ท้ายหน้าต่างพูดเรื่องจำนวนรอบบริการก่อน · กรอบแดงขึ้นทั้งสองช่องอยู่แล้ว
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
  historicalBulkPackIssue, historicalBulkQtyIssue, historicalBulkQtyUnit, historicalBulkRegistrySites, historicalBulkRoundsIssue,
  historicalBulkTaken,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

const T = HISTORICAL_SERVICE_TEXT.bulk;

export default function HistoricalBulkZonesModal({
  open, onClose, sites = [], zonesBySite = {}, siteErrors = {}, loading = false, loadError = "",
  rows = [], packageOptions = [], productsById = new Map(), productsError = "",
  assessedByZone = null, assessState = "idle", onAdd,
}) {
  const [productId, setProductId] = useState("");
  /* งวด PR-5: เลขของช่อง "แพ็ค/เดือน (ทุกบรรทัด)" — ข้อความตามที่พิมพ์ (ว่าง = ยังไม่ใส่ · ไม่มีค่าตั้งต้น) */
  const [packQty, setPackQty] = useState("");
  const [qty, setQty] = useState("");
  const [rounds, setRounds] = useState("");

  /* เปิดใหม่ = เริ่มใหม่ทั้งหน้าต่าง — ช่องของตัวห่อ (ตัวกลางล้าง ค้น/ติ๊ก/แพ็คต่อรอบ ของมันเอง) */
  useEffect(() => {
    if (!open) return;
    setProductId("");
    setPackQty("");
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
  const packIssue = historicalBulkPackIssue(packQty);
  const qtyIssue = historicalBulkQtyIssue(qty);
  const roundsIssue = historicalBulkRoundsIssue(rounds);
  const extraError = historicalBulkFieldsIssue({ productId, packQty, qty, rounds });
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
            {/* ⭐ งวด PR-5 (D8): เลขเดียวของทุกบรรทัดที่จะเพิ่ม — ว่างได้ · ช่องข้อความที่เก็บทุกตัวอักษร (ค่าที่ใช้ไม่ได้อยู่ในช่องให้เห็น) ·
                แดงหลังกดเหมือนช่องอื่นของตัวห่อ · ป้าย/คำใบ้/aria จากแคตตาล็อก (ไฟล์นี้ไม่สะกดชื่อคอลัมน์เอง) */}
            <div className={styles.field}>
              <span>{T.packQtyLabel}</span>
              <Input
                type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" className="numeric-input"
                value={packQty}
                invalid={pressed && Boolean(packIssue)}
                onChange={(event) => setPackQty(event.target.value)}
                aria-label={T.packQtyAria}
              />
              <small data-bad={pressed && packIssue ? "yes" : undefined}>
                {(pressed && packIssue) || T.packQtyHint}
              </small>
            </div>
            <div className={styles.field}>
              <span>{T.qtyLabel}</span>
              {/* กรอบแดง = คลาส is-invalid (MoneyInput ไม่แปลง aria-invalid เป็นกรอบ — review 29/09) · แดงหลังกดเหมือนช่องรอบ */}
              <MoneyInput min="0" autoComplete="off" className={pressed && qtyIssue ? "is-invalid" : ""} value={qty} onChange={(value) => setQty(value ?? "")} aria-label="จำนวนต่อบรรทัด" aria-invalid={pressed && qtyIssue ? "true" : undefined} />
              <small data-bad={pressed && qtyIssue ? "yes" : undefined}>
                {/* งวด PR-5 (R8): เลขข้างบนใช้ได้แล้ว = จำนวนคือจำนวนเดือน ⇒ คำใบ้พูดหน่วย "เดือน" — ตัวตัดสินอยู่ที่ lib */}
                {(pressed && qtyIssue) || T.qtyHint(historicalBulkQtyUnit(packQty, product?.saleUnit))}
              </small>
            </div>
            <div className={styles.field}>
              <span>{T.priceLabel}</span>
              <div className={styles.derived} data-empty={product ? undefined : "yes"}>
                {product ? fmtMoney(unitPrice) : T.noPackage}
              </div>
              <small>{T.priceHint}</small>
            </div>
          </div>
          {assessNote ? <p className={styles.assessNote}>{assessNote}</p> : null}
        </>
      )}
      /* ⭐ มติเจ้าของ 08/10 รอบสอง: จำนวนรอบบริการ (ทุกบรรทัด) อยู่ **ใต้** แถวรอบละกี่แพ็คของตัวกลาง (แพ็คก่อนจำนวนรอบบริการ) ·
         ช่องเดิมทุกตัวอักษร (ค่า · ด่าน · `pressed`) ย้ายแค่ที่วาด */
      renderAfterPacks={({ pressed }) => (
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
      )}
      consequence={(plan, { mode }) => historicalBulkConsequence({
        count: plan.count, packQty, qty, unitPrice, mode, packs: plan.packs, assessed: plan.assessed, blank: plan.blank, rounds,
      })}
      confirmLabel={T.confirm}
      onAdd={(planRows) => onAdd?.(historicalBulkAddRows({
        zoneIds: planRows.map((row) => row.zoneId), sites, zonesBySite, rows, packQty, qty, rounds,
        packsByZone: new Map(planRows.map((row) => [row.zoneId, row.packsPerRound])),
      }), productId)}
    />
  );
}
