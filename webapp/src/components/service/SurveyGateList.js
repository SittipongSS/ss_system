"use client";
// ── เช็คลิสต์ด่านหกข้อบนจอสรุปส่งผล (ม็อกจอ 07 · แผน §5.4) ────────────────
//
// ⭐ **แยกสองกลุ่มตาม "ใครแก้ได้" ไม่ใช่เรียงหกข้อรวดเดียว** — หัวหน้าที่เปิดจอนี้แล้วเจอ
//   ปุ่มส่งผลกดไม่ได้ ต้องตอบคำถามเดียวให้ได้ทันที: **ของที่ติด เป็นของฉันหรือของช่าง**
//   ⇒ ของฉัน = ก้มลงไปแก้ในตารางข้างบน · ของช่าง = กดแจ้งให้เขากลับไป
//
// 🐞 **ก่อนหน้านี้จอกลืนสองกลุ่มรวมกัน** — `SurveyResultTable` เอา `field` กับ `result`
//   มา `join(' · ')` ลงคอลัมน์เดียว ⇒ ได้ประโยคยาวประโยคเดียวที่ไม่บอกว่าใครแก้
//   ทั้งที่ตัวแยกอยู่ใน `surveyResultMissing` มาตั้งแต่วันแรก (แค่ไม่มีใครใช้)
import { Check, Send, X } from "lucide-react";
import Button from "@/components/ui/Button";
import styles from "./SurveyGateList.module.css";

const GROUPS = [
  { owner: "crew", title: "ดักที่จอหน้างาน — ช่างเท่านั้นที่แก้ได้", who: "ช่าง" },
  { owner: "head", title: "ดักที่จอนี้ — หัวหน้าแก้ได้เอง", who: "หัวหน้า" },
];

export default function SurveyGateList({ gates = [], canSendBack = false, onSendBack }) {
  if (!gates.length) return null;
  const blocked = gates.filter((g) => !g.ok).length;

  return (
    <section className={styles.wrap} aria-label="ด่านก่อนส่งผลให้ฝ่ายขาย">
      <header className={styles.head}>
        <h3 className={styles.title}>ด่านก่อนกด &quot;ส่งผลให้ฝ่ายขาย&quot;</h3>
        <span className={blocked ? styles.badgeBad : styles.badgeOk}>
          {blocked ? `ติด ${blocked} ข้อ` : `ผ่านครบ ${gates.length} ข้อ`}
        </span>
      </header>

      {GROUPS.map((group) => {
        const rows = gates.filter((g) => g.owner === group.owner);
        if (!rows.length) return null;
        return (
          <div key={group.owner} className={styles.group}>
            <h4 className={styles.groupTitle}>{group.title}</h4>
            <ul className={styles.list}>
              {rows.map((gate) => (
                <li key={gate.key} className={styles.item} data-ok={gate.ok ? "1" : undefined}>
                  <span className={styles.mark} aria-hidden="true">
                    {gate.ok ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <span className={styles.text}>
                    <b>{gate.label}</b>
                    {/* ⚠️ บอก **ชื่อพื้นที่ที่ขาด** ไม่ใช่แค่ "ยังไม่ครบ" — ใบหนึ่งมีได้สิบพื้นที่
                        ข้อความที่ไม่บอกว่าพื้นที่ไหน แปลว่าต้องไล่เปิดทีละอันเอง */}
                    <span className={styles.sub}>
                      {gate.done} / {gate.total}
                      {gate.ok ? "" : ` — ขาด ${gate.zones.join(" · ")}`}
                    </span>
                  </span>
                  <span className={styles.who}>
                    <span className={styles.owner}>{group.who}</span>
                    {/* ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · ข้อที่ผ่านแล้วไม่มีอะไรให้แจ้ง */}
                    {group.owner === "crew" && !gate.ok && canSendBack && (
                      <Button size="sm" variant="outline" icon={<Send size={13} aria-hidden="true" />}
                        onClick={() => onSendBack?.(gate)}>
                        แจ้งช่างให้กลับไป
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
