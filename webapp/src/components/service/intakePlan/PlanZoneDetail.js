"use client";
// ── รายละเอียดโซนของแถว "รอตั้งรอบ" (PR-C · C7 · ม็อก TsIntakePlan) ────────────────────────────────
//
// ⭐ หนึ่งแถวต่อรอบขาย (term) ของไซต์ × ใบ: โซน · แพ็คเกจ · แพ็คต่อรอบ · มาตรฐาน มล./เดือน
//   รายการ `row.termDetails` มาจากตัวคำนวณ (`planRowFacts`) — ทรงเดียวทั้งระบบ (IMPL_PLAN_C §4.3) ⇒ ส่งเข้า
//   `TermStandardMlCell` **ตรง ๆ ไม่แปลงทรง** (แท็บงานบริการของใบสั่งขายส่งทรงเดียวกัน · ข้อเสนอตรงกันสองจอ)
// ⭐ ช่องมาตรฐานบันทึกแยกจากการตั้งรอบ (ปุ่มบันทึกของช่องเอง) · แก้ได้เฉพาะ TS (`canEdit`) — คนอื่นเห็นค่า
//   ข้อเสนอ มล. ขึ้นเฉพาะใบที่ฝ่ายขายตั้งแล้ว (`stamped` · C-D9) — ใบเดิม/ย้อนหลังพิมพ์เองได้แต่ไม่มีข้อเสนอ
// ⚠️ แพ็ค/รอบของใบเดิม/ย้อนหลัง = ขีด (term ของใบพวกนั้นคือจำนวนที่ขายทั้งบรรทัด ไม่ใช่ต่อรอบ · C-D3)
// ⚠️ `layout="list"` = การ์ด (จอแคบ) — ตารางสี่ช่องในการ์ด 310px ต้องเลื่อนแนวนอน ⇒ เรียงเป็นรายการแทน
//    ข้อมูล/ช่องแก้ชุดเดียวกัน ต่างกันแค่ทรง (กฎ AGENTS.md: ต่างได้แค่โหมดผ่าน props)
// ⚠️ ไม่ใช่ ListPanel (หน้านี้มีรายการเดียว · listPanelShape) — เป็นกล่องรองใต้แถว
import { TableScroll } from "@/components/ui/Table";
import TermStandardMlCell from "@/components/service/TermStandardMlCell";
import { STANDARD_ML_MESSAGES } from "@/lib/service/termStandardMl";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./PlanZoneDetail.module.css";

const packsText = (qty) => (qty == null ? naText(null) : fmtNumber(qty));
/* ชื่อที่ screen reader อ่านให้ช่องกรอก — แยกได้ว่าเป็นช่องของโซน/แพ็คเกจไหน (หลายแถวมีช่องหน้าตาเหมือนกัน)
   🐞 review 29/09: สองรอบขาย FG เดียวกันบนโซนเดียว (SO-26090247-0) ได้ชื่อซ้ำกันเป๊ะ ⇒ ต่อท้าย "รายการ n · FG" (`termLabels`) */
const mlLabel = (item, detail) => `มาตรฐาน มล./เดือน · ${[item.zoneCode, item.zoneName, detail || item.fgCode].filter(Boolean).join(" ")}`;

export default function PlanZoneDetail({ row, canEdit = false, onSaved, layout = "table", id }) {
  const items = Array.isArray(row?.termDetails) ? row.termDetails : [];
  /* ป้าย "รายการ n · FG" ต่อรอบขาย (`planRowFacts.termLabels` · ตัวช่วยเดียวกับแท็บงานบริการของใบ) — มีเฉพาะโซนที่ถือหลายรอบขาย */
  const labels = row?.termLabels || {};
  const stamped = !!row?.stamped;
  const title = `รายละเอียดโซน · ${row?.site?.code || row?.site?.name || naText(null)}`;

  return (
    <section id={id} className={styles.box} aria-label={title}>
      <div className={styles.head}>
        <strong className={styles.title}>{title}</strong>
        {/* คำใบ้เรื่องปุ่ม "ใช้" มีความหมายกับคนที่แก้ได้เท่านั้น */}
        {canEdit ? <span className={styles.hint}>{STANDARD_ML_MESSAGES.hint}</span> : null}
      </div>

      {layout === "list" ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.itemHead}>
                <span className="mono">{naText(item.zoneCode)}</span>
                <span>{naText(item.zoneName)}</span>
              </span>
              <span className={styles.itemMeta}>
                <span className="mono">{naText(item.fgCode)}</span>
                {item.description ? <span>{item.description}</span> : null}
                {labels[item.id]?.detail ? <span>{labels[item.id]?.detail}</span> : null}
              </span>
              <span className={styles.itemMeta}>แพ็ค/รอบ {packsText(item.packageQty)}</span>
              <span className={styles.itemMl}>
                <span className={styles.mlLabel}>มาตรฐาน มล./เดือน</span>
                <TermStandardMlCell
                  term={item}
                  canEdit={canEdit}
                  stamped={stamped}
                  onSaved={onSaved}
                  ariaLabel={mlLabel(item, labels[item.id]?.detail)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <TableScroll family="list" surface="embedded" minWidth={640} cells="stacked">
          <table>
            <thead>
              <tr>
                <th scope="col">โซน</th>
                <th scope="col">แพ็คเกจ</th>
                <th scope="col" className="num">แพ็ค/รอบ</th>
                <th scope="col">มาตรฐาน มล./เดือน</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {/* รหัสบน · ชื่อล่าง — ทรงเดียวกับทุกตารางในระบบ */}
                  <td>
                    <span className="mono">{naText(item.zoneCode)}</span>
                    <span className="cell-sub">{naText(item.zoneName)}</span>
                  </td>
                  <td>
                    <span className="mono">{naText(item.fgCode)}</span>
                    {item.description ? <span className="cell-sub">{item.description}</span> : null}
                    {labels[item.id]?.detail ? <span className="cell-sub">{labels[item.id]?.detail}</span> : null}
                  </td>
                  <td className="num">{packsText(item.packageQty)}</td>
                  <td>
                    <TermStandardMlCell
                      term={item}
                      canEdit={canEdit}
                      stamped={stamped}
                      onSaved={onSaved}
                      ariaLabel={mlLabel(item, labels[item.id]?.detail)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  );
}
