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
import { PDR_SECTIONS, pdrSectionProgress, pdrSectionRows } from "@/lib/requests/pdrFields";
import { PDR_TARGET_KINDS } from "@/lib/requests/pdrTargets";
import { categoryLabel } from "@/lib/master/categoryOf";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./requestForm.module.css";

/* ── 2.2/2.3 ฝั่งอ่าน — ตารางเดียวเหมือนฝั่งกรอก (mig 0229) ──────────────
   ⚠️ ประกอบ **แถวป้าย/ค่า** ส่งเข้า `Facts` ตัวเดิม ไม่วาดตารางของตัวเอง — จอนี้มี
   รูปแบบเดียวทั้งหน้า และช่องว่างต้องอ่านเป็น N/A เหมือนช่องอื่นทุกช่อง */
function targetFacts(request) {
  const list = Array.isArray(request.targets) ? request.targets : [];
  const categories = request.pdrContext?.categories || [];
  const money = (v) => (v == null || v === "" ? null : Number(v).toLocaleString("th-TH"));
  const nameOf = (code) => categoryLabel(code, categories) || code;

  const cost = list.map((t) => {
    const parts = PDR_TARGET_KINDS.filter((k) => t[k.onField]).map((k) => {
      const note = String(t[k.noteField] || "").trim();
      const price = money(t[k.priceField]);
      return `${k.label}${note ? ` ${note}` : ""}${price ? ` ${price} บาท/Kg` : ""}`;
    });
    return parts.length ? `${nameOf(t.categoryCode)} — ${parts.join(" · ")}` : null;
  }).filter(Boolean);

  const unit = list.map((t) => {
    const price = money(t.pricePerUnit);
    return price ? `${nameOf(t.categoryCode)} — ${price} บาท/ชิ้น` : null;
  }).filter(Boolean);

  return [
    ["Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)", cost.join("\n")],
    ["Target Price / Unit (ราคาขาย)", unit.join("\n")],
  ];
}

function Facts({ rows }) {
  // ⭐ **แสดงทุกช่อง ช่องที่ไม่ได้กรอกขึ้นว่า N/A** (มติผู้ใช้ 2026-08-07)
  //
  // เดิมซ่อนช่องว่างทิ้ง ⇒ RD เปิดอ่านแล้วไม่มีทางรู้ว่า *ไม่ได้ถาม* หรือ *ถามแล้ว
  // ไม่มีคำตอบ* — สองอย่างนี้ทางแก้คนละทาง (อย่างแรกคือบั๊ก อย่างหลังคือไปตามถาม)
  // ⚠️ ต้องตรงกับกระดาษเสมอ — เอกสารพิมพ์ N/A ที่ช่องเดียวกันนี้ (pdrDocument.js)
  if (!rows.length) return <small className={styles.hint}>ยังไม่ได้กรอกส่วนนี้</small>;
  return (
    <dl className={styles.pdrFacts}>
      {rows.map(([label, value]) => {
        const text = value == null ? "" : String(value).trim();
        return (
          <div key={label} className={styles.pdrFact}>
            <dt>{label}</dt>
            <dd>
              {text
                ? <ReadableText text={text} lines={4} />
                : <span className={styles.naValue}>N/A</span>}
            </dd>
          </div>
        );
      })}
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

/**
 * หมวดของ **ฝั่งอ่าน** สำหรับรางเลือกส่วน — ชุดเดียวกับฝั่งกรอก (`pdrRailSections`)
 *
 * ⭐ **บรีฟกลิ่นเป็นหมวดของตัวเอง คั่นระหว่าง "ข้อมูลลูกค้า" กับ "ข้อกำหนดผลิตภัณฑ์"**
 * เหมือนฝั่งกรอกเป๊ะ ๆ (มติผู้ใช้ 2026-08-09) — เดิมฝั่งอ่านยัดบรีฟไว้บนสุด*นอกราง*
 * ⇒ กดเลือกหมวด 4 แล้วยังเห็นบรีฟค้างอยู่ข้างบน อ่านเหมือนหน้าคนละส่วนมาต่อกัน
 *
 * ⚠️ เลขนำหน้าใส่เฉพาะห้าหมวดที่ตรงกับกระดาษ FM-RD-01 หนึ่งต่อหนึ่ง (RD อ้างกันทาง
 * โทรศัพท์ด้วยเลขข้อ) · บรีฟไม่มีเลขเพราะบนกระดาษมันอยู่ในข้อ 2.1 ของหมวดถัดไป
 */
export function pdrReadRailSections(request, briefs = [], context = {}) {
  const of = (key) => PDR_SECTIONS.find((s) => s.key === key);
  const numbered = (key, no) => ({
    key,
    label: `${no} ${of(key).title}`,
    count: pdrSectionProgress(of(key), request, context),
  });
  return [
    numbered("request", 1),
    numbered("customer", 2),
    {
      key: "briefs",
      label: "บรีฟกลิ่น",
      // นับ "ก้อนที่มีเนื้อบรีฟ" ชุดเดียวกับฝั่งกรอก — ตัวเลขสองฝั่งต้องตรงกัน
      // (ชื่อเรียกใช้นับไม่ได้ ระบบเติมให้เองเมื่อเว้นว่าง — ดู scentBriefs.js)
      count: { total: briefs.length, filled: briefs.filter((b) => String(b?.brief || "").trim()).length },
    },
    numbered("spec", 3),
    numbered("regulatory", 4),
    numbered("signers", 5),
  ];
}

export default function PdrSummary({ request, briefs = [], section = null }) {
  // โหมดราง — ผู้เรียกเลือกหมวดให้แล้ว (ท่าเดียวกับ `PdrForm`) · ไม่ส่ง = ลิ้นชักครบทุกหมวด
  const rail = section != null;
  const show = (key) => !rail || section === key;
  const list = rail ? PDR_SECTIONS.filter((s) => s.key === section) : PDR_SECTIONS;
  if (!request) return null;
  const briefBlocks = !briefs.length ? (
    <small className={styles.hint}>ใบนี้ยังไม่มีบรีฟรายกลิ่น</small>
  ) : briefs.map((b, i) => (
    <div key={b.id || i} className={styles.briefCard}>
      {/* ป้ายเลขมุมซ้ายแทนแถบสี (มติผู้ใช้ 2026-08-09) — ทุกก้อนน้ำหนักเท่ากัน */}
      <div className={styles.briefHead}>
        <span className={styles.briefNo}>{i + 1}</span>
        <span className={styles.briefTitle}>{b.label || `กลิ่นที่ ${i + 1}`}</span>
      </div>
      <BriefFacts brief={b} />
    </div>
  ));

  return (
    <div className={rail ? styles.pdrPlain : styles.pdr}>
      {!rail && (
        <div className={styles.pdrHead}>
          <strong>แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)</strong>
          <span className={styles.pdrCode}>FM-RD-01</span>
        </div>
      )}

      {show("briefs") && (rail ? (
        <div className={styles.pdrFlat}>
          <h5 className={styles.pdrFlatTitle}>
            บรีฟกลิ่น{briefs.length ? ` — ${briefs.length} ก้อน` : ""}
          </h5>
          {briefBlocks}
        </div>
      ) : (
        /* ⭐ นอกราง: บรีฟขึ้นก่อนและกางไว้ — RD หยิบงานแล้วต้องเห็นทันที ไม่ต้องกดหา */
        <details className={styles.pdrSection} open>
          <summary className={styles.pdrSummary}>
            บรีฟกลิ่น{briefs.length ? ` — ${briefs.length} ก้อน` : ""}
          </summary>
          <div className={styles.pdrBody}>{briefBlocks}</div>
        </details>
      ))}

      {list.map((section_) => (rail ? (
        <div key={section_.key} className={styles.pdrFlat}>
          <h5 className={styles.pdrFlatTitle}>{section_.title}</h5>
          <Facts rows={[
            ...(section_.key === "spec" ? targetFacts(request) : []),
            ...pdrSectionRows(section_, request, {
              includeEmpty: true,
              context: { ...(request.pdrContext || {}), briefs },
            }),
          ]} />
        </div>
      ) : (
        <details key={section_.key} className={styles.pdrSection}>
          <summary className={styles.pdrSummary}>{section_.title}</summary>
          <div className={styles.pdrBody}>
            {/* ⚠️ `includeEmpty` — จอต้องแสดงช่องว่างเป็น N/A เหมือนกระดาษ
                (มติผู้ใช้ 2026-08-07) ไม่ใช่ซ่อนทิ้งแล้วอ่านไม่ออกว่าถามหรือยัง */}
            <Facts rows={[
              ...(section_.key === "spec" ? targetFacts(request) : []),
              ...pdrSectionRows(section_, request, {
                includeEmpty: true,
                context: { ...(request.pdrContext || {}), briefs },
              }),
            ]} />
          </div>
        </details>
      )))}
    </div>
  );
}

// ช่องของบรีฟหนึ่งก้อน — แยกออกมาเพื่อให้ทั้งโหมดรางและโหมดลิ้นชักใช้ก้อนเดียวกัน
function BriefFacts({ brief: b }) {
  return (
    <>
      {/* บรีฟเป็นช่องหลักของก้อนนี้ — ว่างก็ต้องเห็นว่าว่าง (N/A) ไม่ใช่หายไป */}
      <Facts rows={[
        ["บรีฟกลิ่น", b.brief],
        ["แรงบันดาลใจ", b.inspiration],
        ["ช่วงกลิ่นที่ชื่นชอบ", b.likedNotes],
        ["กลิ่นที่ End-user ไม่ชอบ", b.dislikedNotes],
        ["ให้ทำวิจัยเรื่อง", b.researchTopic],
        // ⭐ ข้อความต่อท้าย Scentotype รายตัว (ข้อ 2.1.4 บนกระดาษ · mig 0222)
        ...(b.scentotypes || []).map((t) => [
          `Scentotype — ${scentotypeLabel(t)}`, (b.scentotypeNotes || {})[t],
        ]),
      ]} />
      <dl className={styles.pdrFacts}>
        <Chips label="Scentotype" values={b.scentotypes} textOf={scentotypeLabel} />
        <Chips label="Performance ของกลิ่น" values={b.performance} textOf={scentPerformanceLabel} />
      </dl>
    </>
  );
}
