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
import { PDR_BRIEF_LABELS, PDR_SECTIONS, pdrSectionRows } from "@/lib/requests/pdrFields";
import { pdrTargetFacts, pdrTargetSizeText } from "@/lib/requests/pdrTargets";
import { requestPdrScentSource, requestUsesScentBriefs } from "@/lib/master/requestTypes";
import { categoryLabel } from "@/lib/master/categoryOf";
import ReadableText from "@/components/ui/ReadableText";
import styles from "./requestForm.module.css";

/* ── ข้อ 2.1–2.7 ฝั่งอ่าน — รายสินค้า (mig 0229 · 0352) ─────────────────────
   ⭐ **หนึ่งแถวป้าย/ค่า ต่อสินค้าหนึ่งตัว** — ป้าย = "สินค้าที่ N · หมวด · ขนาด · จำนวน"
   ค่า = ข้อ 2.1–2.7.3 บรรทัดละข้อ · เดิมแยกเป็นสองแถว (2.2 ทุกสินค้า / 2.3 ทุกสินค้า)
   ⇒ พอสเปกย้ายลงแถว การอ่านแยกตามข้อจะต้องไล่จับคู่เองว่าบรรทัดไหนของสินค้าไหน
   ⚠️ ข้อความทุกบรรทัดมาจาก `pdrTargetFacts` ตัวเดียวกับเอกสาร — ช่องว่างพิมพ์ N/A
   ตามกติกาของ PDR (จอกับกระดาษต้องตรงกัน)
   ⚠️ ประกอบ **แถวป้าย/ค่า** ส่งเข้า `Facts` ตัวเดิม ไม่วาดตารางของตัวเอง */
function targetFacts(request) {
  const list = Array.isArray(request.targets) ? request.targets : [];
  const categories = request.pdrContext?.categories || [];
  const nameOf = (code) => categoryLabel(code, categories) || code;
  const scentSource = requestPdrScentSource(request);
  if (!list.length) return [["สินค้าที่ขอพัฒนา", ""]];
  return list.map((t, i) => {
    const facts = pdrTargetFacts(t, { scentSource });
    return [
      [`สินค้าที่ ${i + 1}`, nameOf(t.categoryCode), pdrTargetSizeText(t)].filter(Boolean).join(" · "),
      facts.map((f) => `${f.no} ${f.label}: ${f.value || "N/A"}`).join("\n"),
      null,
      // ⚠️ กางครบทุกข้อ ไม่พับที่ 4 บรรทัดเหมือนช่องข้อความ — นี่คือสเปกของสินค้า RD ต้อง
      //    เห็นครบทั้งก้อน (หมายเหตุยาวยังตัดบรรทัดตามปกติ)
      { lines: facts.length + 4 },
    ];
  });
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
      {rows.map(([label, value, source, opts]) => {
        const text = value == null ? "" : String(value).trim();
        return (
          <div key={label} className={styles.pdrFact}>
            <dt>{label}</dt>
            <dd>
              {text
                ? <ReadableText text={text} lines={opts?.lines ?? 4} />
                : <span className={styles.naValue}>N/A</span>}
              {/* ⭐ **ที่มาของค่าที่ระบบเติมให้** — ช่องพวกนี้คนกรอกแตะไม่ได้
                  ⇒ ถ้าไม่บอก คนอ่านจะแยกไม่ออกระหว่าง "ระบบเติมให้แล้ว" กับ
                  "คนกรอกลืม" ซึ่งทางแก้คนละทางกันสิ้นเชิง (ไปแก้ที่ต้นทาง vs ไปตามถาม)
                  ⚠️ ข้อความมาจากทะเบียน (`field.from`) ไม่ได้เขียนใหม่ที่จอ */}
              {source ? <small className={styles.pdrSource}>{source}</small> : null}
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

/* ⚠️ **`pdrReadRailSections` ถูกถอดออกแล้ว** — รางฝั่งอ่านกับฝั่งกรอกเป็นตัวเดียวกัน
   ที่ `lib/requests/pdrFields.js` (`pdrRailSections` · `pdrRailSectionsFromRequest`)
   เหตุผลเต็มอยู่ใน doc ของ `pdrFormProgress` ที่นั่น: สองตัวทำให้เกจอันเดียวกันให้เลข
   คนละชุดระหว่างโหมดอ่านกับโหมดแก้ (SB-26080002: 6/8 → 1/1) และป้ายหมวดคนละชุด
   ⇒ ผู้เรียกทั้งสามจอ import จากที่นั่นที่เดียว */

export default function PdrSummary({ request, briefs = [], section = null }) {
  // โหมดราง — ผู้เรียกเลือกหมวดให้แล้ว (ท่าเดียวกับ `PdrForm`) · ไม่ส่ง = ลิ้นชักครบทุกหมวด
  const rail = section != null;
  const show = (key) => !rail || section === key;
  const list = rail ? PDR_SECTIONS.filter((s) => s.key === section) : PDR_SECTIONS;
  if (!request) return null;
  // ⚠️ บรีฟเฉพาะรูปทรงที่มีบรีฟ (พัฒนากลิ่น) — พัฒนาสูตร NPD เลือกกลิ่นรายแถวสินค้าแทน
  const usesBriefs = requestUsesScentBriefs(request);
  // หัวส่วน = เลขหมวดบนกระดาษ + ชื่อ (ชุดเดียวกับรางและฟอร์ม)
  const titleOf = (s) => [s.paperNo, s.title].filter(Boolean).join(" ");
  const briefTitle = `2.1 บรีฟกลิ่น${briefs.length ? ` — ${briefs.length} ก้อน` : ""}`;
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

      {usesBriefs && show("briefs") && (rail ? (
        <div className={styles.pdrFlat}>
          <h5 className={styles.pdrFlatTitle}>{briefTitle}</h5>
          {briefBlocks}
        </div>
      ) : (
        /* ⭐ นอกราง: บรีฟขึ้นก่อนและกางไว้ — RD หยิบงานแล้วต้องเห็นทันที ไม่ต้องกดหา */
        <details className={styles.pdrSection} open>
          <summary className={styles.pdrSummary}>{briefTitle}</summary>
          <div className={styles.pdrBody}>{briefBlocks}</div>
        </details>
      ))}

      {list.map((section_) => (rail ? (
        <div key={section_.key} className={styles.pdrFlat}>
          <h5 className={styles.pdrFlatTitle}>{titleOf(section_)}</h5>
          <Facts rows={[
            ...(section_.key === "spec" ? targetFacts(request) : []),
            ...pdrSectionRows(section_, request, {
              includeEmpty: true, withSource: true, numbered: true,
              context: { ...(request.pdrContext || {}), briefs },
            }),
          ]} />
        </div>
      ) : (
        <details key={section_.key} className={styles.pdrSection}>
          <summary className={styles.pdrSummary}>{titleOf(section_)}</summary>
          <div className={styles.pdrBody}>
            {/* ⚠️ `includeEmpty` — จอต้องแสดงช่องว่างเป็น N/A เหมือนกระดาษ
                (มติผู้ใช้ 2026-08-07) ไม่ใช่ซ่อนทิ้งแล้วอ่านไม่ออกว่าถามหรือยัง */}
            <Facts rows={[
              ...(section_.key === "spec" ? targetFacts(request) : []),
              ...pdrSectionRows(section_, request, {
                includeEmpty: true, withSource: true, numbered: true,
                context: { ...(request.pdrContext || {}), briefs },
              }),
            ]} />
          </div>
        </details>
      )))}
    </div>
  );
}

const L = PDR_BRIEF_LABELS;
const numberedBrief = (key) => [L[key].no, L[key].label].filter(Boolean).join(" ");

// ช่องของบรีฟหนึ่งก้อน — แยกออกมาเพื่อให้ทั้งโหมดรางและโหมดลิ้นชักใช้ก้อนเดียวกัน
function BriefFacts({ brief: b }) {
  return (
    <>
      {/* บรีฟเป็นช่องหลักของก้อนนี้ — ว่างก็ต้องเห็นว่าว่าง (N/A) ไม่ใช่หายไป */}
      {/* ⚠️ ป้าย + เลขข้อจากทะเบียน `PDR_BRIEF_LABELS` — ชุดเดียวกับฟอร์มและเอกสาร
          (2.1.4 Performance · 2.1.5 Scentotype ตามไฟล์ของ AE · มติผู้ใช้ 2026-09-11) */}
      <Facts rows={[
        [L.brief.label, b.brief],
        [numberedBrief("inspiration"), b.inspiration],
        [numberedBrief("likedNotes"), b.likedNotes],
        [numberedBrief("dislikedNotes"), b.dislikedNotes],
        [L.researchTopic.label, b.researchTopic],
        // ⭐ ข้อความต่อท้าย Scentotype รายตัว (mig 0222)
        ...(b.scentotypes || []).map((t) => [
          `${L.scentotypes.label} — ${scentotypeLabel(t)}`, (b.scentotypeNotes || {})[t],
        ]),
      ]} />
      <dl className={styles.pdrFacts}>
        <Chips label={numberedBrief("performance")} values={b.performance} textOf={scentPerformanceLabel} />
        <Chips label={numberedBrief("scentotypes")} values={b.scentotypes} textOf={scentotypeLabel} />
      </dl>
    </>
  );
}
