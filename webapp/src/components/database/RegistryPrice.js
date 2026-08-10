"use client";

import { fmtDate, fmtNumber } from "@/lib/format";
import styles from "./registryForm.module.css";

/* ── ราคาล่าสุดของกลิ่น/สูตรบนหน้าทะเบียน ────────────────────────────────
 *
 * ⭐ **ราคาอยู่ที่ทะเบียนวัสดุ ไม่ใช่ทะเบียนกลิ่น/สูตร** — ที่นี่แสดงอย่างเดียว
 * (ดูเหตุผลเต็มที่ `lib/master/scentFormulaAdmin.attachRegistryPrice`)
 *
 * ⚠️ **สามสถานะที่ต้องอ่านออกคนละแบบ** — ยุบเป็น "—" เหมือนกันหมดเมื่อไร คนจะ
 * แยกไม่ออกว่าต้องไปทำอะไรต่อ:
 *   · ยังไม่ผูกวัสดุ  → ยังไม่เคยมีใครถามราคาของตัวนี้เลย
 *   · ผูกแล้วไม่มีราคา → ถามไปแล้วแต่ฝ่ายยังไม่ตอบ
 *   · หมดอายุ         → เคยมีราคา แต่เกินอายุ ใช้ในใบขอราคาผลิตไม่ได้จนกว่าจะต่ออายุ
 */
export default function RegistryPrice({ price }) {
  if (!price) return <span className={styles.priceNone}>ยังไม่ผูกราคา</span>;
  if (price.state === "no_price") return <span className={styles.priceNone}>รอราคา</span>;

  const value = price.unitPrice;
  if (value == null) return <span className={styles.priceNone}>รอราคา</span>;

  // หลายชั้นจำนวน = ราคาไม่ได้มีค่าเดียว — บอกจำนวนชั้นไว้ ไม่งั้นเลขที่เห็นจะถูก
  // อ่านเป็น "ราคาเดียวของตัวนี้" ทั้งที่เป็นแค่ชั้นตั้งต้น
  const tiers = price.range?.count > 1 ? price.range.count : 0;

  return (
    <span className={price.state === "expired" ? styles.priceExpired : undefined}>
      <span className="mono">{fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      {tiers ? <small className={styles.priceTiers}> · {tiers} ชั้น</small> : null}
      {price.state === "expired" && (
        <small className={styles.priceTiers}>
          {" "}· หมดอายุ {price.validUntil ? fmtDate(price.validUntil) : ""}
        </small>
      )}
    </span>
  );
}
