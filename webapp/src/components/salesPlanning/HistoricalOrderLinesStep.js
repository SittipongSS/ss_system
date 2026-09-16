"use client";
// ── ขั้น ② จุดติดตั้ง — หนึ่งแถวในชีต = หนึ่งบรรทัด = หนึ่งจุดติดตั้ง (มติข้อ 8) ─────────
//
// ⭐ **ไม่มีตัวเลือกโซนในโมดัล** (มติข้อ 17) — ฝ่ายขายพิมพ์ชื่อจุดตามชีตเป็นข้อความ
//    TS หาไซต์/โซนจริงแล้วผูกเองในคิว "งานเข้าใหม่" · ชีตตรงกับงานจริงแค่ 25%
// 🪤 ห้ามส่งคีย์ `zoneId` ขึ้นไปแม้ค่าเป็น null — plan/RPC ตีกลับทั้งใบ (ดู historicalIntakeForm)
//
// ⚠️ **ราคาต่อหน่วยไม่ใช่ช่องกรอก** — server คิดให้จาก `lineTotal / qty` · "ก่อน VAT"
//    ต่อบรรทัดและยอดท้ายโมดัลมาจากพรีวิวที่ผ่านทั้งใบ ไม่ใช่การคำนวณฝั่งจอ
//    (บทเรียน #1685: พรีวิวกับตัวเขียนตัดสินคนละที่ = พรีวิวบอก 145 แล้วสร้างได้ 0)
import { Plus, Trash2 } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtMoney, NA } from "@/lib/format";
import { INSTALLATION_POINT_MAX, emptyHistoricalLine } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalSalesOrderModal.module.css";

export default function HistoricalOrderLinesStep({
  state, onChange, productOptions = [], issues = [], plan = null, busy = false,
}) {
  const lines = state.lines || [];
  const planLines = plan?.lines || [];
  const amountHeader = state.amountsIncludeVat === false ? "(ไม่รวม VAT)" : "(รวม VAT)";

  const patchLine = (key, next) => onChange({
    lines: lines.map((line) => (line.key === key ? { ...line, ...next } : line)),
  });
  const removeLine = (key) => onChange({ lines: lines.filter((line) => line.key !== key) });

  return (
    <>
      {issues.length > 0 && (
        <StatusNotice tone="error" title={`จุดติดตั้งยังไม่ผ่าน ${issues.length} ข้อ`} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        </StatusNotice>
      )}

      <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={860}>
        <table className="w-full text-sm">
          <thead><tr>
            <th>จุดติดตั้ง <b className={styles.req}>*</b> <span className={styles.muted}>(ตามชีต)</span></th>
            <th>สินค้า</th>
            <th className="num">จำนวน <b className={styles.req}>*</b></th>
            <th className="num">รอบบริการ</th>
            <th className="num">ยอดบรรทัด <b className={styles.req}>*</b> <span className={styles.muted}>{amountHeader}</span></th>
            <th />
          </tr></thead>
          <tbody>
            {lines.map((line, index) => {
              const planLine = planLines[index] || null;
              return (
                <tr key={line.key}>
                  <td>
                    <Input
                      value={line.installationPoint}
                      maxLength={INSTALLATION_POINT_MAX}
                      autoComplete="off"
                      disabled={busy}
                      onChange={(e) => patchLine(line.key, { installationPoint: e.target.value })}
                      aria-label={`ชื่อจุดติดตั้งของบรรทัดที่ ${index + 1}`}
                    />
                    <span className={styles.cellSub}>โซน: TS ผูกในคิวงานเข้าใหม่</span>
                  </td>
                  <td>
                    <SearchableSelect
                      entity="product"
                      ariaLabel={`สินค้าของบรรทัดที่ ${index + 1}`}
                      options={productOptions}
                      value={line.productId}
                      onChange={(value) => patchLine(line.key, { productId: value })}
                      disabled={busy}
                      placeholder="ไม่เลือกสินค้า"
                      searchPlaceholder="ค้นหารหัส FG หรือชื่อสินค้า"
                    />
                    {planLine?.fgCode ? <span className={styles.cellSub}>{planLine.fgCode}</span> : null}
                  </td>
                  <td className="num">
                    <Input
                      mono
                      type="number"
                      min="0"
                      step="any"
                      autoComplete="off"
                      value={line.qty}
                      disabled={busy}
                      onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                      aria-label={`จำนวนของบรรทัดที่ ${index + 1}`}
                    />
                    {planLine?.unit ? <span className={styles.cellSub}>{planLine.unit}</span> : null}
                  </td>
                  <td className="num">
                    <Input
                      mono
                      type="number"
                      min="1"
                      step="1"
                      autoComplete="off"
                      value={line.serviceRounds}
                      disabled={busy}
                      onChange={(e) => patchLine(line.key, { serviceRounds: e.target.value })}
                      aria-label={`จำนวนรอบบริการของบรรทัดที่ ${index + 1}`}
                    />
                  </td>
                  <td className="num">
                    <MoneyInput
                      value={line.lineAmount}
                      disabled={busy}
                      onChange={(value) => patchLine(line.key, { lineAmount: value })}
                      aria-label={`ยอดบรรทัดของบรรทัดที่ ${index + 1}`}
                    />
                    <span className={styles.cellSub}>
                      ก่อน VAT {planLine ? fmtMoney(planLine.lineTotal) : NA}
                    </span>
                  </td>
                  <td>
                    {/* ⚠️ ปุ่มลบโชว์เสมอ — บรรทัดสุดท้ายลบได้ แล้วด่าน "ต้องมีอย่างน้อย 1 จุดติดตั้ง"
                        ของ server จะบอกเองตอนกดต่อไป (ไม่มีกฎซ้ำฝั่งจอ) */}
                    <Button
                      iconOnly
                      size="sm"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => removeLine(line.key)}
                      aria-label={`ลบจุดติดตั้งบรรทัดที่ ${index + 1}`}
                      title="ลบจุดติดตั้ง"
                      icon={<Trash2 size={15} aria-hidden="true" />}
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={6}>
                <div className={styles.addRow}>
                  <Button size="sm" variant="quiet" disabled={busy} onClick={() => onChange({ lines: [...lines, emptyHistoricalLine()] })}
                    icon={<Plus size={14} aria-hidden="true" />}>
                    เพิ่มจุดติดตั้ง
                  </Button>
                  <span>หนึ่งแถวในชีต = หนึ่งจุดติดตั้ง</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>

      <p className={styles.hint}>
        จุดติดตั้ง 1–{INSTALLATION_POINT_MAX} ตัวอักษร · สินค้าไม่บังคับ — ไม่เลือก = เตือน
        “จุดนี้จะไม่มีรหัส FG ให้ TS เห็น” · นอกหมวด 02-001 = เตือน “ไม่นับเป็นรอบบริการ” ·
        จำนวนมากกว่า 0 (หน่วยตามสินค้า) · รอบบริการเป็นจำนวนเต็มมากกว่า 0 เว้นว่างได้ ·
        ยอดบรรทัดรวม/ไม่รวม VAT ตามที่เลือกในขั้น ① — ราคาต่อหน่วยระบบคิดให้ ·
        “ก่อน VAT” ต่อบรรทัดและยอดท้ายโมดัลมาจากพรีวิว — ขึ้นเมื่อข้อมูลใบ + จุดติดตั้งผ่านครบ ไม่งั้นเป็นขีด
      </p>

      <StatusNotice tone="info" title="ยังไม่ผูกโซน — ปกติของใบย้อนหลัง" className={styles.notice}>
        {`บันทึกแล้วทั้ง ${lines.length} จุดเข้าคิว “งานเข้าใหม่” ของ TS · TS หาไซต์/โซนจริงแล้วผูกเอง · `}
        {/* 🪤 คิวของ TS ต่อชื่อจุดด้วย " · " ⇒ ชื่อจุดที่มี "·" อยู่ในตัวจะอ่านเป็นหลายจุด */}
        พิมพ์ชื่อจุดให้ตรงกับที่หน้างานเรียก
      </StatusNotice>
    </>
  );
}
