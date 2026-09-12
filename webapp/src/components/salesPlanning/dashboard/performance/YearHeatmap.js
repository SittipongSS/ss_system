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
  };
}

/* ± ของเดือนหนึ่ง — ใช้ตัวเดียวกันทั้งแถวรายคนและแถวรวม ไม่งั้นสองแถวคิดคนละสูตร */
function monthDiffCell(row, i, closedCount) {
  const diff = Number(row.actual[i] || 0) - Number(row.target[i] || 0);
  const hasTarget = Number(row.target[i] || 0) > 0;
  const isClosed = i < closedCount;
  return { diff, hasTarget, isClosed, text: !isClosed ? "–" : hasTarget || Number(row.actual[i] || 0) > 0 ? `${diff >= 0 ? "+" : ""}${money(diff)}` : NA };
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
      <TableScroll surface="embedded" family="matrix" className="premium-glass-table fz-box" style={{ "--fz-c1w": "150px" }}><table className="fz-table fz-heatmap w-full" style={{ minWidth: 1560, fontSize: "var(--fs-6)" }}>
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
              <td className="fz-c1">
                <button type="button" className="text-action" onClick={() => onDrill({ scope: "person", person: p.id })} title="คลิกเพื่อเจาะรายคน">
                  <strong>{p.name}</strong>
                </button>
                {p.team && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-3)", fontWeight: "var(--fw-normal)" }}>{p.team}</span>}
              </td>
              {MONTH_LABELS.map((_, i) => {
                const c = monthDiffCell(p, i, closedCount);
                return (
                  <td key={i} className="num mono">
                    <span className="heat-chip" style={cellStyle(c.diff, c.hasTarget, c.isClosed)}>
                      {c.text}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {/* แถวรวมทั้งบริษัท ตรึงล่าง (มติผู้ใช้ 2026-09-12) — ไล่ดูรายคนไปจนสุดตารางแล้ว
            ยังต้องเห็นว่าเดือนนั้นทั้งบริษัทเกินหรือขาด · `fz-foot` = ตรึงล่าง ·
            เซลล์แรกเป็น `fz-c1 fz-foot` = มุมซ้ายล่าง ตรึงสองแกนพร้อมกันทั้งแถว
            ⚠️ ไม่มีปุ่มเจาะ — ระดับบริษัทไม่ใช่ "คน" (กติกาเดียวกับแถวรวมของบอร์ดเช้า) */}
        <tfoot>
          <tr className="premium-row">
            <td className="fz-c1 fz-foot"><strong>รวมทั้งบริษัท</strong></td>
            {MONTH_LABELS.map((_, i) => {
              const c = monthDiffCell(matrix.company, i, closedCount);
              return (
                <td key={i} className="num mono fz-foot">
                  <span className="heat-chip" style={cellStyle(c.diff, c.hasTarget, c.isClosed)}>
                    {c.text}
                  </span>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table></TableScroll>
    </section>
  );
}
