"use client";
import { TableScroll } from "@/components/ui/Table";

import { CalendarRange } from "lucide-react";
import { MONTH_LABELS } from "@/components/salesPlanning/ui";
import { money } from "./shared";
import { NA } from "@/lib/format";

// ภาพรวมทั้งปี — ± เทียบเป้ารายเดือน ทุกคนพร้อมกัน (heatmap).
// เขียว = เกินเป้าเดือนนั้น · แดง = ขาด · เดือนที่ยังไม่จบ/ไม่มีเป้า = จาง.
// คลิกชื่อ → เจาะรายคนด้านล่าง (เหมือนบอร์ดเช้า).

function cellStyle(diff, hasTarget, isClosed) {
  if (!isClosed || !hasTarget) return { color: "var(--text-3)", opacity: 0.6 };
  const tone = diff >= 0 ? "var(--green)" : "var(--red)";
  // เข้มตามขนาดผลต่าง (เพดาน 28% ให้อ่านตัวเลขออกทั้ง light/dark)
  const mag = Math.min(28, 8 + Math.round(Math.abs(diff) / 50000));
  return {
    color: tone,
    fontWeight: "var(--fw-semibold)",
    background: `color-mix(in srgb, ${tone} ${mag}%, transparent)`,
    borderRadius: 6,
  };
}

export default function YearHeatmap({ matrix, year, closedCount, onDrill }) {
  if (!matrix.people.length) return null;
  return (
    <section className="glass-panel" style={{ padding: 16 }}>
      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
        <CalendarRange size={17} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ภาพรวมทั้งปี {year} — ± เทียบเป้ารายเดือน</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--text-3)", fontSize: "var(--fs-6)" }}>
        เขียว = เกินเป้าเดือนนั้น · แดง = ขาด · คลิกชื่อเพื่อเจาะรายคน
      </p>
      {/* ตัวเลขเต็มหลัก ("+฿1,234,567.89" ≈ 100px ที่ fs-6) × 12 เดือน + คอลัมน์ชื่อ 150px
          ⇒ ต้องกว้างอย่างน้อย ~1,560px · ตารางนี้เลื่อนแนวนอนใน TableScroll อยู่แล้ว
          และคอลัมน์ชื่อตรึงซ้าย (fz-c1) จึงยังอ่านออกว่าแถวไหนของใครตอนเลื่อน
          ⚠️ ถ้าลด minWidth ลง คอลัมน์จะบีบจนเลขตัดบรรทัดกลางเซลล์ (fz-table ไม่ได้ตั้ง nowrap ให้) */}
      <div className="fz-box premium-glass-table" style={{ "--fz-c1w": "150px" }}>
        <TableScroll surface="embedded" family="matrix"><table className="fz-table w-full" style={{ minWidth: 1560, fontSize: "var(--fs-6)" }}>
          <thead>
            <tr>
              <th className="fz-c1">พนักงาน</th>
              {MONTH_LABELS.map((m) => <th key={m} className="num">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.people.map((p) => (
              <tr key={p.id} className="premium-row">
                {/* ⭐ ตัวกดอยู่ **ในเซลล์** ไม่ใช่ onClick บน <td> — คีย์บอร์ดกดไม่ถึง <td>
                    และเติม role/tabIndex ให้มันจะทับ role="cell" ทิ้ง (WCAG 1.3.1 · 2.1.1)
                    🪤 เป็น <button> ไม่ใช่ <Link>: การเจาะรายคน **ไม่มี URL ปลายทาง**
                       (onDrill สลับมุมมองในหน้าเดิม) ⇒ `.text-action` เส้นประ = "เกิดอะไรขึ้นตรงนี้"
                       ส่วนเส้นทึบ + accent ของ `.linklike` สงวนไว้ให้ลิงก์ที่พาไปหน้าอื่น
                    🪤 ครอบเฉพาะ <strong> ชื่อคน ไม่ครอบบรรทัดทีม — `text-decoration` ไหลลงไปยัง
                       block descendant และวาดด้วยสีของบรรพบุรุษ (ลูกยกเลิกเองไม่ได้) ⇒ บรรทัดทีม
                       จะได้เส้นประไปด้วย · โรคเดียวกับที่ `.linklike-block > strong` ต้องแก้
                       และตรงกับคำอธิบายบนหัวตารางที่เขียนว่า "คลิกชื่อเพื่อเจาะรายคน" */}
                <td className="fz-c1" style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="text-action" onClick={() => onDrill({ scope: "person", person: p.id })} title="คลิกเพื่อเจาะรายคน">
                    <strong>{p.name}</strong>
                  </button>
                  {p.team && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-3)", fontWeight: "var(--fw-normal)" }}>{p.team}</span>}
                </td>
                {MONTH_LABELS.map((_, i) => {
                  const diff = Number(p.actual[i] || 0) - Number(p.target[i] || 0);
                  const hasTarget = Number(p.target[i] || 0) > 0;
                  const isClosed = i < closedCount;
                  return (
                    <td key={i} className="num mono" style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", padding: "2px 6px", ...cellStyle(diff, hasTarget, isClosed) }}>
                        {!isClosed ? "–" : hasTarget || Number(p.actual[i] || 0) > 0 ? `${diff >= 0 ? "+" : ""}${money(diff)}` : NA}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table></TableScroll>
      </div>
    </section>
  );
}
