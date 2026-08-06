"use client";
// ── PDR แบบอ่านอย่างเดียว บนหน้ารายละเอียดคำร้อง ────────────────────────
//
// 🔴 **ช่องโหว่ที่ปิด:** ผมสร้างฝั่งกรอกครบแต่ไม่ได้สร้างฝั่งอ่าน ⇒ RD เปิดคำร้องขึ้นมา
// เห็นแค่ชื่อเรื่อง ไม่เห็นบรีฟกลิ่น ไม่เห็น Scentotype ไม่เห็น Target Cost = ทำงานต่อ
// ไม่ได้เลย · คนกรอกกรอกครั้งเดียว แต่คนอ่านอ่านทุกครั้งที่หยิบงาน
//
// ⭐ **หัวข้อ ป้ายชื่อ และลำดับ อ่านจาก `lib/requests/pdrFields.js` ทั้งหมด** — จอนี้
// ไม่มีลิสต์ของตัวเองอีกแล้ว · เดิมมีลิสต์แยก ⇒ ยุบสองหัวข้อเป็นหัวข้อเดียว สลับลำดับ
// ตัดคำในวงเล็บทิ้ง และทำช่อง "ผู้ร้องขอ/ลูกค้า/จำนวนกลิ่น" หายไปเลย เทียบกับฟอร์ม
//
// ⚠️ ช่องที่ไม่ได้กรอก **ไม่แสดงเลย** ไม่ใช่แสดงเป็นขีด — ฟอร์มมี 21 ช่องและส่วนใหญ่
// ไม่บังคับ ⇒ แสดงช่องว่างครบทุกช่องจะกลบของที่กรอกจริงจนหาไม่เจอ
// (เอกสารทำกลับกัน — ที่นั่นช่องว่างต้องพิมพ์เป็นเส้นให้เขียนมือ)
import { scentPerformanceLabel, scentotypeLabel } from "@/lib/requests/kinds/rd/scentBriefTypes";
import { PDR_SECTIONS, pdrSectionRows } from "@/lib/requests/pdrFields";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./requestForm.module.css";

function Facts({ rows }) {
  // ⚠️ กรองที่นี่ด้วย — บล็อกบรีฟส่งคู่ดิบมาตรง ๆ (คนละทางกับ `pdrSectionRows`
  // ที่กรองมาให้แล้ว) · กรองทางเดียวเมื่อไรอีกทางจะขึ้นแถวว่างเปล่า
  const filled = rows.filter(([, v]) => v != null && String(v).trim() !== "");
  if (!filled.length) return <small className={styles.hint}>ยังไม่ได้กรอกส่วนนี้</small>;
  return (
    <dl className={styles.pdrFacts}>
      {filled.map(([label, value]) => (
        <div key={label} className={styles.pdrFact}>
          <dt>{label}</dt>
          <dd><ReadableText text={String(value)} lines={4} /></dd>
        </div>
      ))}
    </dl>
  );
}

// ⭐ ป้ายกำกับแถว chip — เดิมสองแถวขึ้นเปล่า ๆ ติดกัน อ่านไม่ออกว่าแถวไหนคืออะไร
function Chips({ label, values, textOf }) {
  if (!values?.length) return null;
  return (
    <div className={styles.pdrFact}>
      <dt>{label}</dt>
      <dd className={styles.mentionPicker}>
        {values.map((v) => <span key={v} className={`chip ${styles.tierChip}`}>{textOf(v)}</span>)}
      </dd>
    </div>
  );
}

export default function PdrSummary({ request, briefs = [] }) {
  if (!request) return null;
  return (
    <div className={styles.pdr}>
      <div className={styles.pdrHead}>
        <strong>แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)</strong>
        <span className={styles.pdrCode}>FM-RD-01</span>
      </div>

      {/* ⭐ บรีฟขึ้นก่อนและกางไว้ — RD หยิบงานแล้วต้องเห็นอันนี้ทันที ไม่ต้องกดหา */}
      <details className={styles.pdrSection} open>
        <summary className={styles.pdrSummary}>
          บรีฟกลิ่น{briefs.length ? ` — ${briefs.length} ก้อน` : ""}
        </summary>
        <div className={styles.pdrBody}>
          {!briefs.length ? (
            <small className={styles.hint}>ใบนี้ยังไม่มีบรีฟรายกลิ่น</small>
          ) : briefs.map((b, i) => (
            <div key={b.id || i} className={styles.briefCard}>
              <strong>{b.label || `กลิ่นที่ ${i + 1}`}</strong>
              {b.brief && <ReadableText text={b.brief} lines={6} />}
              <Facts rows={[
                ["แรงบันดาลใจ", b.inspiration],
                ["ช่วงกลิ่นที่ชื่นชอบ", b.likedNotes],
                ["กลิ่นที่ End-user ไม่ชอบ", b.dislikedNotes],
                ["ให้ทำวิจัยเรื่อง", b.researchTopic],
              ]} />
              <dl className={styles.pdrFacts}>
                <Chips label="Scentotype" values={b.scentotypes} textOf={scentotypeLabel} />
                <Chips label="Performance ของกลิ่น" values={b.performance} textOf={scentPerformanceLabel} />
              </dl>
            </div>
          ))}
        </div>
      </details>

      {/* หัวข้อทั้งหมดมาจากทะเบียนเดียวกับฟอร์ม — ชื่อ ลำดับ และป้ายช่องตรงกันเสมอ */}
      {PDR_SECTIONS.map((section) => (
        <details key={section.key} className={styles.pdrSection}>
          <summary className={styles.pdrSummary}>{section.title}</summary>
          <div className={styles.pdrBody}>
            <Facts rows={pdrSectionRows(section, request, { context: { briefs } })} />
          </div>
        </details>
      ))}
    </div>
  );
}
