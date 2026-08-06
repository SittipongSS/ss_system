"use client";
// ── PDR แบบอ่านอย่างเดียว บนหน้ารายละเอียดคำร้อง ────────────────────────
//
// 🔴 **ช่องโหว่ที่ปิด:** ผมสร้างฝั่งกรอกครบแต่ไม่ได้สร้างฝั่งอ่าน ⇒ RD เปิดคำร้องขึ้นมา
// เห็นแค่ชื่อเรื่อง ไม่เห็นบรีฟกลิ่น ไม่เห็น Scentotype ไม่เห็น Target Cost = ทำงานต่อ
// ไม่ได้เลย · คนกรอกกรอกครั้งเดียว แต่คนอ่านอ่านทุกครั้งที่หยิบงาน
//
// ⭐ **บรีฟรายกลิ่นขึ้นก่อนและกางไว้** — เป็นสิ่งที่ RD ใช้มากที่สุด · ส่วนหัว PDR
// (ข้อมูลลูกค้า/ราคาเป้าหมาย) พับไว้เพราะอ่านครั้งเดียวตอนเริ่ม
//
// ⚠️ ช่องที่ไม่ได้กรอก **ไม่แสดงเลย** ไม่ใช่แสดงเป็นขีด — ฟอร์มมี 21 ช่องและส่วนใหญ่
// ไม่บังคับ ⇒ แสดงช่องว่างครบทุกช่องจะกลบของที่กรอกจริงจนหาไม่เจอ
import { scentPerformanceLabel, scentotypeLabel } from "@/lib/requests/kinds/rd/scentBriefTypes";
import { PDR_REQUEST_TYPES } from "@/components/requests/PdrForm";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./requestForm.module.css";

const TEXTURE = { standard: "STANDARD", premium: "PREMIUM" };
const CUSTOMER_KIND = { new: "ลูกค้าใหม่", existing: "ลูกค้าเก่า" };
const REQUEST_TYPE = Object.fromEntries(PDR_REQUEST_TYPES.map((t) => [t.value, t.label]));

const money = (v) => (v == null || v === "" ? null : Number(v).toLocaleString("th-TH"));

// [ป้าย, ค่า] — ค่าที่เป็น null/'' ถูกตัดทิ้งตอนเรนเดอร์
const HEADER_FIELDS = (r) => [
  ["ประเภทของคำขอ", REQUEST_TYPE[r.pdrRequestType] || r.pdrRequestType],
  ["ชื่อแบรนด์", r.pdrCustomerBrand],
  ["Mood & Tone", r.pdrMoodTone],
  ["ทิศทางการเติบโตของแบรนด์", r.pdrBrandDirection],
  ["ที่อยู่จัดส่งตัวอย่าง", r.pdrShipTo],
  ["ประเภทลูกค้า", CUSTOMER_KIND[r.pdrCustomerKind] || r.pdrCustomerKind],
  ["มูลค่าโปรเจกต์ทั้งหมด", money(r.pdrProjectValue)],
  ["DemoGraphic", r.pdrTargetDemographic],
  ["PsychoGraphic", r.pdrTargetPsychographic],
  ["Painpoint", r.pdrTargetPainpoint],
  ["ประเภทสินค้า", r.pdrProductKind],
  ["วันที่ต้องการสินค้า", r.pdrWantedAt],
  ["วันที่ต้องการจำหน่าย", r.pdrSellFrom],
];

const SPEC_FIELDS = (r) => [
  ["Target Cost / KG", money(r.pdrTargetCost)],
  ["Target Price / Unit", money(r.pdrTargetPrice)],
  ["MOQ ที่คาดหวัง", r.pdrMoq],
  ["ลักษณะเนื้อผลิตภัณฑ์", TEXTURE[r.pdrTexture] || r.pdrTexture],
  ["สีเนื้อผลิตภัณฑ์", r.pdrColor],
  ["ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น", r.pdrPackSize],
  ["ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)", r.pdrBrandSample],
  ["ข้อกำหนดเฉพาะอื่น ๆ", r.pdrSpecialRequirements],
];

function Facts({ rows }) {
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

export default function PdrSummary({ request, briefs = [] }) {
  if (!request) return null;
  const header = HEADER_FIELDS(request);
  const specs = SPEC_FIELDS(request);

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
              {!!(b.scentotypes || []).length && (
                <div className={styles.mentionPicker}>
                  {b.scentotypes.map((v) => (
                    <span key={v} className={`chip ${styles.tierChip}`}>{scentotypeLabel(v)}</span>
                  ))}
                </div>
              )}
              {!!(b.performance || []).length && (
                <div className={styles.mentionPicker}>
                  {b.performance.map((v) => (
                    <span key={v} className={`chip ${styles.tierChip}`}>
                      {scentPerformanceLabel(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      <details className={styles.pdrSection}>
        <summary className={styles.pdrSummary}>ข้อมูลลูกค้าและคำขอ</summary>
        <div className={styles.pdrBody}><Facts rows={header} /></div>
      </details>

      <details className={styles.pdrSection}>
        <summary className={styles.pdrSummary}>ข้อกำหนดผลิตภัณฑ์</summary>
        <div className={styles.pdrBody}><Facts rows={specs} /></div>
      </details>
    </div>
  );
}
