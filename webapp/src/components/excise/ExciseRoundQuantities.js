"use client";

// ── จำนวนของรอบนี้ — ใบค่าสรรพสามิตแบ่งรอบ (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V10–V12) ──
// ตารางเดียวของ "ออกใบ" (หน้า new-excise) กับ "แก้จำนวน" (โมดัลบนหน้าใบ [id]) — AGENTS.md: แก้ไข = ฟอร์มตัวเดียวกับตอนสร้าง
// ต่างกันแค่โหมด `editable` · แถวมาจาก server (exciseRoundRows: คงเหลือไม่นับใบที่กำลังแก้) · ยอดบนจอคิดด้วยตัวคิดเดียวกับ server
//
// คอลัมน์: สั่งใน SO · ออกรอบอื่นแล้ว · รอบนี้ · คงเหลือหลังรอบนี้ — "ส่วนที่ค้างโชว์ส่วนที่เหลือ" (คำเจ้าของ)
import { TableScroll } from "@/components/ui/Table";
import Input from "@/components/ui/Input";
import { fmtMoney, fmtNumber, NA } from "@/lib/format";
import styles from "./ExciseRoundQuantities.module.css";

const toNumber = (value) => {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
};

/**
 * @param rows      แถวคงเหลือ `[{ sourceSalesOrderLineId, fgCode, description, unit, unitPrice, ordered, issued, remaining }]`
 * @param values    จำนวนรอบนี้ `{ [บรรทัด SO]: ข้อความ/ตัวเลข }` (ค่าที่พิมพ์ · ว่าง = 0)
 * @param editable  true = ช่องกรอก · false = อ่านอย่างเดียว
 * @param onChange  `(บรรทัด SO, ข้อความ)` — เฉพาะโหมดแก้
 */
export default function ExciseRoundQuantities({ rows = [], values = {}, editable = false, onChange }) {
  if (!rows.length) return null;
  const totalTax = rows.reduce((sum, row) => sum + toNumber(values[row.sourceSalesOrderLineId]) * (Number(row.unitPrice) || 0), 0);
  return (
    <TableScroll family="list" surface="embedded" minWidth={640}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>รหัส / รายการ</th>
            <th className="num">สั่งใน SO</th>
            <th className="num">ออกรอบอื่นแล้ว</th>
            <th className="num">รอบนี้</th>
            <th className="num">คงเหลือหลังรอบนี้</th>
            <th className="num">ภาษี/ชิ้น</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.sourceSalesOrderLineId;
            const raw = values[key] ?? "";
            const qty = toNumber(raw);
            const after = Math.round((row.remaining - qty) * 10000) / 10000;
            const over = after < -0.000001;
            return (
              <tr key={key} className={over ? styles.overRow : undefined}>
                <td>
                  <span className={styles.code}>{row.fgCode}</span>
                  <span className={styles.name}>{row.description}</span>
                </td>
                <td className="num mono">{fmtNumber(row.ordered)} {row.unit}</td>
                <td className="num mono">{row.issued ? fmtNumber(row.issued) : NA}</td>
                <td className="num">
                  {editable ? (
                    <Input
                      type="number"
                      min="0"
                      max={row.remaining}
                      step="any"
                      inputMode="decimal"
                      className={styles.qtyInput}
                      value={raw}
                      disabled={row.remaining <= 0}
                      aria-label={`จำนวนรอบนี้ ${row.fgCode}`}
                      aria-invalid={over || undefined}
                      onChange={(event) => onChange?.(key, event.target.value)}
                    />
                  ) : (
                    <span className="mono">{fmtNumber(qty)}</span>
                  )}
                </td>
                <td className={`num mono ${over ? styles.over : after > 0 ? styles.left : ""}`}>
                  {over ? `เกิน ${fmtNumber(-after)}` : fmtNumber(after)}
                </td>
                <td className="num mono">{fmtMoney(row.unitPrice)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className={styles.footLabel}>ภาษีของรอบนี้ (ก่อน VAT)</td>
            <td className="num mono">{fmtMoney(totalTax)}</td>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

/** จำนวนเริ่มต้นของช่องกรอก — ใบใหม่ = คงเหลือทั้งหมด · ใบที่มีอยู่ = จำนวนเดิมของใบ (`current` Map) */
export function roundInputsFrom(rows = [], current = null) {
  return Object.fromEntries((rows || []).map((row) => [
    row.sourceSalesOrderLineId,
    String(current ? current.get(row.sourceSalesOrderLineId) || 0 : row.remaining),
  ]));
}

/** ค่าที่ส่ง server — ตัวเลขล้วน (ว่าง = 0 · server ตรวจซ้ำกับคงเหลือ) */
export function roundInputsPayload(values = {}) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, raw]) => [key, toNumber(raw)]));
}

/** มีช่องที่เกินคงเหลือไหม — ปุ่มบันทึกบอกเหตุแทนการยิงแล้วโดนตีกลับ */
export function roundInputsOver(rows = [], values = {}) {
  return (rows || []).filter((row) => toNumber(values[row.sourceSalesOrderLineId]) > row.remaining + 0.000001).map((row) => row.fgCode);
}
