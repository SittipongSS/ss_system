// ── ตัวจัดหน้าของรายงานการประเมินพื้นที่ — ตรรกะล้วน (สเปก PR-1 §4) ──────────────────────────
//
// ⭐ `paginateSurveyReport(view)` รับ view ของ **ฉบับเดียว** แล้วตอบว่าแต่ละหน้ามีอะไร — สองฉบับจัดหน้าแยกกัน
//   (มติ 30/09: ฉบับลูกค้าไม่มีจุด ⇒ ใช้แผนหน้าของฉบับภายในไม่ได้ จะเหลือหน้า "(ต่อ)" เปล่า)
//   เลขหน้า · คอลัมน์ "หน้า" ของตารางหน้า 1 · "หน้า x / N" · บรรทัด "ต่อหน้า n · …" ออกจากที่นี่ทั้งหมด ไม่มีใครพิมพ์เอง
//
// 🔑 **จัดด้วยความสูง ไม่ใช่นับแถว** — กระดานที่อนุมัติเขียนเพดานเป็นจำนวน ("10 พื้นที่" · "2 แถวรูป") แต่บอกเองว่า
//   "Rows taller than 2 lines count by height" ⇒ ที่นี่บวกพิกเซลของแต่ละบล็อกแล้วเทียบกับงบของหน้า
//   ทุกค่าปัดขึ้น (บล็อกที่ประเมินสูงเกินจริง = หน้าโปร่งขึ้นนิดหน่อย · ประเมินต่ำ = ล้นขอบล่างซึ่งกระดาษที่ตรึงแล้วแก้ไม่ได้)
//
// หน้าในเอกสาร ตามลำดับ:
//   summary       หน้า 1 — หัว · กล่องลูกค้า/การประเมิน · (ภายใน: แผงภายใน) · ตารางพื้นที่
//   summaryCont   ตารางหน้า 1 ที่ล้น — หัวข้อ "(ต่อ)" + หัวตารางซ้ำ
//   zone          หนึ่งพื้นที่ต่อหน้า — หัวพื้นที่ · ภาพกว้าง · ผัง (ยืดเต็มที่เหลือ ≥ 240) · (ภายใน: จุด) · หมายเหตุ
//   zoneCont      แถวรูปที่ล้นของพื้นที่เดิม แล้วหมายเหตุ — ไม่มีผัง (กระดาน R-C-2 "PAGE RULE": ผังอยู่หน้าหลักเสมอ ไม่พิมพ์ซ้ำ)
//   signoff       การรับรองผล — หน้าของตัวเอง ชิดล่าง (ทั้งสองฉบับ)
//   appendix      ฉบับภายในเท่านั้น — ก ข ค (ตารางแบ่งระหว่างแถว) แล้ว ง + จ (จ ชิดล่างของหน้าสุดท้ายเสมอ)
//
// พิกเซลทั้งหมดอ่านจากกระดานที่อนุมัติ (`mockups/survey-report-doc/project/R-*.dc.html` · 96 dpi · A4 = 794×1123)
// ✅ **สอบเทียบกับ Chrome แล้ว** (01/10/2026) — harness (`scripts/render-survey-report.mjs --assert`) เรนเดอร์กระดาษจริง
//   (`surveyReportDocument.js`) แล้ววัดทุกแผ่น: ขอบล่างตามแผนกับที่วัดได้ต่างกันไม่เกิน ~1px บนหน้าพื้นที่/หน้าต่อ/ภาคผนวก
//   ของ fixture จริง และแผนไม่เคยประเมินต่ำกว่าจริงเกิน 0.5px ในชุดสุดขอบทุกกรณี (`--stress` · `surveyStressCases()`)
//   จุดอ้างอิง (ตารางบน · ความสูงผัง · การรับรอง · ลงนาม) ต่างจากแผนไม่เกิน 1.1px — harness ล้มเมื่อต่างเกิน 8px
//   ส่วนที่แผนเผื่อเกินได้คือจำนวนบรรทัดของข้อความที่ตัดบรรทัดเอง (ชื่อพื้นที่ในช่องแคบ · เหตุผล · หมายเหตุ) — ดู `nameLinesOf`
//   ⚠️ แก้ CSS ของเอกสารเมื่อไร รัน harness ใหม่แล้วแก้ค่าคงที่กับเทสต์พร้อมกัน
//
// 🔑 **ของที่สูงเกินหน้าต้องแบ่งได้ หรือถูกฟ้อง** (review 01/10): ข้อความยาวในภาคผนวก ค (เหตุผลตีกลับ 10 ข้อ × 300 ตัว) กับ ง
//   (รายละเอียดคำร้อง 4,000 ตัวย่อหน้าเดียว) แบ่งกลางข้อความได้ — แผนบอกช่วงตัวอักษร (`skip` / `stop`) แล้วตัวเรนเดอร์ตัดตาม
//   ที่เหลือทุกกรณี (แถวตารางแถวเดียวสูงกว่าหน้า · หัวหน้า 1 สูงผิดปกติ) ถูกรายงานใน `overflow` — PR-2 ต้องไม่ตรึงเมื่อไม่ว่าง
import {
  COMPANY_ADDRESS, COMPANY_LINE, COMPANY_OFFICE_TEL, COMPANY_TAX_ID, COMPANY_WEBSITE,
} from '@/lib/documentBrand';
import { estimateTextLines, textWidthMm } from '@/lib/sales/productSpecLayout';
import { surveyReportCompanyLines } from './surveyReportView';

const PX_MM = 25.4 / 96;
const PX_PT = 0.75;

/** จำนวนบรรทัดของข้อความในกล่องกว้าง `widthPx` ที่ตัวอักษร `fontPx` — ตัวประเมินเดียวกับ FM-SA-04 (สอบเทียบกับ Chrome แล้ว) */
const linesOf = (text, widthPx, fontPx) => Math.max(1, estimateTextLines(text, widthPx * PX_MM, fontPx * PX_PT));

/**
 * จำนวนบรรทัดของ **ชื่อพื้นที่ในช่องตาราง** (ตัวธรรมดา 12.5px · ช่อง 128–285px) — ตัวประเมินตัวเดียวกัน แต่เผื่อน้อยลง
 *
 * ทำไม: ตัวประเมินกลางเผื่อสามชั้น (ตารางความกว้าง = ค่าที่มากกว่าระหว่างน้ำหนัก 400/600 · บวก 3% · เว้นท้ายบรรทัดที่ขอบคำไทย
 *   5% + 1.5mm) ซึ่งตั้งไว้สำหรับกล่องกว้าง 186mm ของ FM-SA-04 — ในช่อง 128px การเว้นท้าย 12px = 9% ของช่อง ⇒ ชื่อ 17% ถูกนับ
 *   เกินหนึ่งบรรทัด (หน้า 1 ของฉบับภายในเสียที่ ~20px ต่อแถวที่นับเกิน)
 * สอบเทียบกับ Chrome (01/10/2026 · ชื่อพื้นที่ 1,501 ชื่อ × ช่อง 128/150/182/285 = 6,004 กรณี):
 *     ค่าเดิม (×1 · เว้นท้ายเต็ม)        นับเกิน 174/1,604 ของชุดแรก (ช่อง 128: 17%) · นับต่ำ 0
 *     **×1.035 · เว้นท้ายครึ่งเดียว**     นับเกิน 7% (ช่อง 128) · นับต่ำ 0   ← ใช้ค่านี้
 *     ×1.05 · ไม่เว้นท้าย                 นับเกิน 0.4% · นับต่ำ 0 — แต่ ×1.06 เริ่มนับต่ำ (6 กรณี) ⇒ ชิดขอบเกินไป ไม่ใช้
 * ⚠️ ของจริง RQ-AS-26090186 ในช่อง 128px ("…และสนามเทนนิส · ชั้น GF" ลงบรรทัดสองโดยเหลือ 0.3px) ยังถูกนับ 3 บรรทัด (จริง 2)
 *   — จะนับให้ตรงต้องเผื่อไม่ถึง 0.3px ซึ่งไม่มีตัวประเมินไหนรับประกันได้ ⇒ หน้า 1 ฉบับภายในของของจริงแผนสูงกว่าที่วัด ~21px
 *   โดยตั้งใจ (ฝั่งปลอดภัย · หน้าโปร่งขึ้น ไม่ล้น)
 */
const NAME_WIDTH_FACTOR = 1.035;
const NAME_THAI_SLACK = 0.5;
const nameLinesOf = (text, widthPx, fontPx) => Math.max(1, estimateTextLines(
  text, widthPx * NAME_WIDTH_FACTOR * PX_MM, fontPx * PX_PT, { thaiSlackScale: NAME_THAI_SLACK },
));

/**
 * ความกว้างจริง (px) ของข้อความ **ตัวหนาบรรทัดเดียว** — ใช้ตอบคำถาม "ลงบรรทัดเดียวพอดีไหม" ของหัวพื้นที่
 *
 * 🪤 ตัวประเมิน (`textWidthMm`) บวกเผื่อ 3% ไว้สำหรับนับบรรทัดของข้อความยาว (เผื่อเกินดีกว่าขาด) — แต่หัวพื้นที่ของ
 *   กระดานที่อนุมัติ **ลงบรรทัดเดียวแบบเหลือ 9px** (ของจริง RQ-AS-26090186 · R-C-2) ⇒ เผื่อ 3% ทำให้ตอบว่า "สองบรรทัด"
 *   แล้วฉบับภายในซึ่งเหลือที่ให้ผังแค่ 16px จะดันส่วนจุดไปหน้า (ต่อ) ทั้งที่ของจริงลงหน้าเดียว (6 หน้ากลายเป็น 7)
 *   ⇒ ถอดเผื่อ 3% ออก แล้วบวก 1.2% ของน้ำหนัก 700 (ตารางความกว้างวัดที่ 400/600)
 *   สอบเทียบกับภาพกระดาน R-C-2: ชื่อ 315 (คิดได้ 316) · รหัส 84 (85) · บรรทัดขนาด 242 (243)
 * 🪤 "×" (U+00D7) ไม่อยู่ในตารางความกว้าง ⇒ ถูกคิดเป็น 1.1em (จริง ~0.58em) — วัดด้วย "=" (0.614em) แทน
 */
const BOLD_LINE_FACTOR = 1.012 / 1.03;
const widthOf = (text, fontPx) => (
  textWidthMm(String(text ?? '').replace(/×/g, '='), fontPx * PX_PT) / PX_MM * BOLD_LINE_FACTOR
);

const NBSP = String.fromCharCode(0xa0); // ช่องว่างไม่ตัดบรรทัด (U+00A0)
const glue = (text) => String(text ?? '').split(' ').join(NBSP);

/**
 * ข้อความที่คั่นด้วย " · " → บรรทัดพร้อมพิมพ์ — ตัดได้เฉพาะหลังตัวคั่น (ท่อนไม่ถูกผ่ากลาง · "·" ค้างท้ายบรรทัดบน)
 * แผนเป็นคนตัดบรรทัดเอง แล้วตัวเรนเดอร์พิมพ์ทีละบรรทัดแบบห้ามตัด ⇒ จำนวนบรรทัดบนกระดาษ = ที่แผนนับ เสมอ (ทุกเบราว์เซอร์)
 * @param hang ตัวคั่นท้ายบรรทัดยื่นเลยความกว้างข้อความได้กี่ px (ช่องตารางมี padding ให้ยื่น) — 0 = ไม่ยื่น
 */
function dottedLines(text, widthPx, fontPx, hang = 0) {
  const parts = String(text ?? '').split(' · ').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return ['—'];
  const lines = [];
  let current = [];
  parts.forEach((part, i) => {
    const more = i + 1 < parts.length;
    const joined = [...current, part].join(' · ');
    const fits = widthOf(joined, fontPx) <= widthPx && (!more || widthOf(`${joined} ·`, fontPx) <= widthPx + hang);
    if (current.length && !fits) {
      lines.push(`${current.join(' · ')} ·`);
      current = [part];
    } else current.push(part);
  });
  lines.push(current.join(' · '));
  return lines;
}

/**
 * 🔑 **บรรทัดของช่อง "ขนาดแพ็ค" ในแถวรวม** ("XS 1 · SM 8 · XL 1") — แผนเป็นคนตัดบรรทัดเอง ตัวเรนเดอร์พิมพ์ทีละบรรทัดแบบห้ามตัด
 *
 * 🐞 เดิมแถวรวมถูกนับ 34px ตายตัว แต่ช่องกว้างแค่ 80px (ข้อความ 64) — สามขนาด หรือสองขนาดที่จำนวนสองหลัก ("ST 12 · XL 24")
 *   ตกเป็นสองสามบรรทัดใน Chrome โดยแผนไม่รู้ ⇒ 10 พื้นที่ + สามขนาดบนหน้า 1 ของฉบับลูกค้าเลยขอบ (วัดได้ 1053.9 / 1073.2
 *   เทียบเพดาน 1050 · "XL 1" ถูกท้ายกระดาษทับ) · กระดาษที่ตรึงแล้วแก้ไม่ได้
 * ⇒ ไม่ปล่อยให้เบราว์เซอร์เลือกจุดตัด: ความสูงของแถว = จำนวนบรรทัดที่นี่ × ความสูงบรรทัด เสมอ
 *   ตัวคั่น "·" ค้างท้ายบรรทัดบน (เดิมตกไปขึ้นต้นบรรทัดล่างได้) และยื่นเข้า padding ของช่องได้ 6px (padding 8)
 *   — "XS 1 · SM 8 ·" (67px) จึงอยู่บรรทัดเดียวในช่องข้อความ 64px แทนที่จะแตกเป็นสามบรรทัด
 * ความกว้างวัดด้วย `widthOf` (สอบเทียบกับ Chrome ที่น้ำหนัก 600: "SM 1 · ST 1" จริง 60.3 คิดได้ 61.3 · "ST 12 · XL 24" จริง 72.4
 *   คิดได้ 73.5) — คิดเกินจริง ~1.6% ⇒ บรรทัดที่ถูกตัดสินว่าพอดีไม่ล้นช่อง
 * @returns บรรทัดพร้อมพิมพ์ เช่น `['XS 1 · SM 8 ·', 'XL 1']` · ขีด/ว่าง = `['—']`
 */
const MIX_HANG = 6;
export function surveyReportMixLines(mix, widthPx, fontPx) {
  return dottedLines(mix, widthPx, fontPx, MIX_HANG);
}

/* ── แบ่งข้อความยาวเป็นท่อน (ภาคผนวก ค · ง) ─────────────────────────────── */

const THAI_ABOVE_BELOW = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/; // สระบน/ล่าง วรรณยุกต์ — ซ้อนบนพยัญชนะตัวหน้า
const THAI_LEADING = /[\u0E40-\u0E44]/;                           // เ แ โ ใ ไ — ต้องมีพยัญชนะตาม
const THAI_WORDS = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('th', { granularity: 'word' })
  : null;
const CUT_LOOKBACK = 24;

/* ถอยจุดตัด `at` ไปขอบที่อ่านได้: หลังเว้นวรรค → ขอบคำไทย → ขอบอักขระ (ไม่แยกสระ/วรรณยุกต์จากพยัญชนะ ไม่ผ่าคู่ surrogate) */
function cutBoundary(text, from, at) {
  const floor = Math.max(from + 1, at - CUT_LOOKBACK);
  for (let i = at; i >= floor; i -= 1) if (text[i - 1] === ' ') return i;
  if (THAI_WORDS) {
    let best = 0;
    for (const { index } of THAI_WORDS.segment(text.slice(floor, at + 1))) if (index > 0 && floor + index <= at) best = floor + index;
    if (best > from) return best;
  }
  let i = at;
  const low = (k) => { const c = text.charCodeAt(k); return c >= 0xdc00 && c <= 0xdfff; };
  while (i > from + 1 && (THAI_ABOVE_BELOW.test(text[i] || '') || THAI_LEADING.test(text[i - 1]) || low(i))) i -= 1;
  return i;
}

/**
 * แบ่งข้อความเป็นท่อน ท่อนละไม่เกิน `maxLines` บรรทัด (ตามตัวประเมิน) — ข้อความที่สั้นกว่า `maxLines + slack` ไม่ถูกแบ่ง
 * (ไม่ทิ้งหางสั้น ๆ ไว้ท่อนเดียว) · ท่อนที่อยู่หน้าเดียวกันถูกพิมพ์ต่อกันเป็นย่อหน้าเดียว ⇒ การแบ่งเห็นเฉพาะตรงขึ้นหน้าใหม่
 * @returns `[{ from, to }]` ตำแหน่งตัวอักษร (code unit) ต่อเนื่องกัน ครอบทั้งข้อความ
 */
function splitText(text, widthPx, fontPx, maxLines, slack) {
  const source = String(text ?? '');
  const out = [];
  let from = 0;
  while (from < source.length) {
    if (linesOf(source.slice(from), widthPx, fontPx) <= maxLines + slack) {
      out.push({ from, to: source.length });
      break;
    }
    let lo = from + 1;
    let hi = source.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (linesOf(source.slice(from, mid), widthPx, fontPx) <= maxLines) lo = mid;
      else hi = mid - 1;
    }
    const to = cutBoundary(source, from, lo);
    out.push({ from, to });
    from = to;
  }
  return out.length ? out : [{ from: 0, to: source.length }];
}

export const SURVEY_REPORT_PX = Object.freeze({
  /* แผ่น: 794×1123 · padding 44 / 46 / 40 · คอลัมน์เนื้อหา 702 (RC1:41,197) */
  column: 702,
  /* ขอบล่างสุดที่บล็อกสุดท้ายของหน้าไปถึงได้ — เส้นท้ายกระดาษ (.df) อยู่ที่ 1058 ต้องเหลือ ≥ 8 (RC1:25-27) */
  limit: 1050,
  /* แถบ "ฉบับภายใน" สูง 30 + เว้น 10 — ดันทุกอย่างของฉบับภายในลง 40 */
  band: 40,
  /* หน้า 2+: หัววิ่ง 44–85 แล้ว padding-top 16 ⇒ บล็อกแรกเริ่มที่ 101 */
  contentTop: 101,
  /* หัวข้อ h3 (.h): 21 + เว้นล่าง 8 */
  heading: 29,
  /* บรรทัด "ต่อหน้า n · …" (.cont): สูง 18 ชิดล่าง (เว้นล่าง 10 ⇒ 1030–1048) · บล็อกก่อนหน้าต้องจบก่อน 1014 (เว้น 16) */
  contLimit: 1014,

  summary: Object.freeze({
    /* ตำแหน่งบนสุดของหัวตารางหน้า 1 ของ fixture จริง
       ลูกค้า: กล่องลูกค้า 6 บรรทัด · หัวกระดาษ = บล็อกบริษัทตั้งต้นของระบบ (`REFERENCE_COMPANY_LINES`)
       ภายใน: + แถบ + แผงภายใน 7 บรรทัด + บรรทัดสถานะ 1 บรรทัด (ช่องไฟ 12 แทน 16)
       ✅ สอบเทียบกับ Chrome แล้ว (harness · 01/10/2026 · `fm-ts-01@2026-10-01a`): วัดได้ 446.4 / 718.9 ⇒ ปัดขึ้นเผื่อ ~1px
          (สเปกเขียน ≈445 / ≈721 · ค่าที่อ่านจากภาพกระดานก่อนสอบเทียบคือ 447 / 721)
       ⚠️ harness `--assert` ล้มเมื่อค่าที่วัดได้สูงกว่าค่านี้ หรือค่านี้เผื่อเกิน 4px — แก้ CSS ของกระดาษแล้วต้องวัดใหม่
       (ทุกหน้าตารางของแผนพก `tableTop` ที่คิดได้ ⇒ harness เทียบได้ทุกชุดอินพุต ไม่ใช่แค่ fixture จริง) */
    tableTop: Object.freeze({ customer: 447, internal: 720 }),
    companyLine: 18, companyWidth: 372, companyFont: 12,
    basePartyLines: 6, partyLine: 20, partyNameWidth: 368, partyNameFont: 14, partyValueWidth: 254, partyFont: 12.5,
    basePanelLines: 7, panelLine: 20, panelLeftWidth: 260, panelRightWidth: 190, panelFont: 12.5,
    panelStripWidth: 652,
    /* ระยะจากขอบล่างของกล่องลูกค้า/แผงภายใน ถึงขอบบนของหัวตาราง = ช่องไฟของเนื้อหา + หัวข้อ "1. …"
       ลูกค้า 16 + 29 · ภายใน 12 + 27 (`.content.i1`) — ใช้เมื่อหน้า 1 ไม่มีตาราง (แถวแรกไม่พอ ⇒ ตารางเริ่มหน้า 2) */
    headAbove: Object.freeze({ customer: 45, internal: 39 }),
    /* ตาราง: หัว 30 · แถว = 15 (padding 14 + เส้น 1) + รหัส 18 + ชื่อ 19.375/บรรทัด · แถวรวม 34 (+ 19.375 ต่อบรรทัดที่สองขึ้นไป
       ของช่อง "ขนาดแพ็ค" — ช่องกว้าง 80 ข้อความ 64 · ดู `surveyReportMixLines`) */
    thead: 30, rowPad: 15, codeLine: 18, textLine: 19.375, total: 34, mixWidth: 64,
    /* ความกว้างข้อความของคอลัมน์ "พื้นที่" (1fr − padding 16): ลูกค้า 198 · ภายใน 144 (RC1:279-285 · RI1:216-226) */
    nameWidth: Object.freeze({ customer: 182, internal: 128 }),
    font: 12.5,
    /* บรรทัด "ต่อหน้า 2 · …" ใต้ตารางหน้า 1 (เว้นบน 6 + 18) · บรรทัดอธิบายจุดของฉบับภายใน (เว้นบน 8 + 20) */
    contLine: 24, spotNote: 28,
  }),

  zone: Object.freeze({
    /* ช่องของหน้าพื้นที่ = ใต้หัวข้อ "2. รายละเอียดรายพื้นที่" (101 + 29 = 130) ถึง 1014 ⇒ 884 · ภายใน 844 (RC2:248-253) */
    gap: 12,
    head: 31, headLine: 24, headFont: 16, codeFont: 12, metaFont: 13, chip: 22, headGap: 10,
    sectionHead: 31,
    /* แถวรูป: กล่อง 226×170 + คำกำกับ · 3 รูปต่อแถว · แถวถัดไปเว้น 10
       ไม่มีรูปกว้างเลย = กล่อง "ไม่มีภาพกว้าง" 170 ไม่มีคำกำกับ (วัดได้: ผังสูงกว่าที่แผนคิด 22px เมื่อคิดเป็นแถวรูปเต็ม) */
    perRow: 3, photoBox: 174, rowGap: 10, wideCaption: 18, cardWidth: 226, emptyBox: 170,
    spotCaptionLine: 18.75, spotCaptionFont: 12.5, spotNoteLine: 18, spotNoteFont: 12,
    /* ผังยืดเต็มที่เหลือ — ต่ำกว่านี้ไม่วาด ย้ายของอื่นไปหน้า (ต่อ) แทน
       ไม่มีภาพผัง (โหมดร่างเท่านั้น — ด่านตรึงบังคับผัง) = กล่อง "ไม่มีผัง" เตี้ย 80 ไม่ยืด (กรอบว่างสูง 600 อ่านเป็นหน้าพัง) */
    planMin: 240, planNone: 80,
    /* ตารางส่วน (พื้นที่ ≥ 2 ส่วน) อยู่ขวาของผัง: หัว 28 + แถวละ 29 (+ แถวรวม) */
    partsHead: 28, partsRow: 29,
    /* กล่องหมายเหตุ: padding 12 + 20/บรรทัด · ข้อความกว้าง 680 */
    notePad: 12, noteLine: 20, noteWidth: 680, noteFont: 12.5,
    /* หน้า (ต่อ): แต่ละส่วนซ้อนได้ไม่เกิน 3 แถวต่อหน้า (RC2:264-267) */
    contRowsPerSection: 3,
  }),

  /* การรับรองผล: หัวข้อ 29 + ที่นั่ง 188 ชิดล่าง (RC4:204-217) — วัดใน Chrome ได้ 217 เท่าภาพกระดาน R-C-4 (830–1048)
     ⚠️ คอมเมนต์ของกระดาน (RC4:244) เขียน "seats 213" ซึ่งเป็นของรุ่นก่อนที่มีบรรทัดตำแหน่งในที่นั่งลูกค้า (ถอดแล้ว · มติ 29/09) */
  signoff: Object.freeze({ height: 217 }),

  appendix: Object.freeze({
    gap: 16,
    lead: 29,
    textLine: 19.375, codeLine: 18, rowPad: 15, font: 12.5, emptyRow: 35,
    /* ก: หัวตารางสองบรรทัด 48 · แถวรวม 34 (+ บรรทัดของช่องขนาด — ช่อง 78 ข้อความ 62) · เชิงอรรถ เว้นบน 4 + 18/บรรทัด */
    decisionsHead: 48, total: 34, footPad: 4, footLine: 18, footFont: 12,
    decisionsNameWidth: 150, decisionsReasonWidth: 144, decisionsMixWidth: 62,
    /* ข้อความยาวของ ค (เหตุผล) กับ ง (ค่าของแถว) แบ่งเป็นท่อนละ 6 บรรทัด — สั้นกว่า 6 + 2 ไม่แบ่ง (ดู `splitText`) */
    splitLines: 6, splitSlack: 2,
    /* ข ค: หัวตารางบรรทัดเดียว 30 */
    thead: 30,
    scopeNameWidth: 285, scopeReasonWidth: 285,
    historyDateLines: 2, historyEventWidth: 114, historyByWidth: 104, historyReasonWidth: 176, historyTotalsWidth: 134,
    /* ง: ตาราง kv — แถว = 13 + 19.375/บรรทัด · หัวแถวกว้าง 166 (ข้อความ 146 ที่ 12px) · ค่า 514 */
    kvPad: 13, kvLabelWidth: 146, kvLabelFont: 12, kvValueWidth: 514, kvBorder: 1,
    /* จ: หัวข้อ 29 + ที่นั่ง 132 ชิดล่าง (เว้นล่าง 10 ⇒ จบที่ 1048) */
    signs: 161, signsBottom: 1048,
  }),
});

const range = (from, to) => ({ from, to });

/* ── หน้า 1 ─────────────────────────────────────────────────────────── */

/* หัวกระดาษของกระดานที่วัด `tableTop` ไว้ใช้บล็อกบริษัทตั้งต้นของระบบ ⇒ เทียบ "บรรทัดที่เกิน" กับบล็อกนั้น
   ด้วยตัวประเมินตัวเดียวกัน (ไม่ใช่กับเลข 4 ที่ตานับ) — ตัวประเมินเผื่อเกินจริงได้หนึ่งบรรทัด ซึ่งถ้าเทียบกับเลขที่ตานับ
   จะกลายเป็นหน้า 1 ลงได้ 9 พื้นที่ ทั้งที่กระดานที่อนุมัติลงได้ 10 */
const REFERENCE_COMPANY_LINES = surveyReportCompanyLines({
  address: COMPANY_ADDRESS, taxId: COMPANY_TAX_ID, tel: COMPANY_OFFICE_TEL, line: COMPANY_LINE, website: COMPANY_WEBSITE,
});

/* ตำแหน่งบนสุดของตาราง = ค่าที่วัดจาก fixture จริง ± บรรทัดที่ต่างจาก fixture นั้น
   (ชื่อลูกค้า/ที่อยู่ยาวขึ้น · ที่อยู่บริษัทยาวขึ้น · แผงภายในมีผู้ช่วยหลายคนหรือชื่องานยาว) */
function summaryTableTop(view, px) {
  const s = px.summary;
  const internal = view.version === 'internal';
  let top = s.tableTop[internal ? 'internal' : 'customer'];

  const companyLines = (lines) => (lines || []).reduce((sum, line) => sum + linesOf(line, s.companyWidth, s.companyFont), 0);
  top += Math.max(0, companyLines(view.head?.company?.lines) - companyLines(REFERENCE_COMPANY_LINES)) * s.companyLine;

  const party = view.party || {};
  const partyLines = linesOf(party.customerName, s.partyNameWidth, s.partyNameFont)
    + [party.siteName, party.siteCode, party.address, party.contact]
      .reduce((sum, value) => sum + linesOf(value, s.partyValueWidth, s.partyFont), 0);
  top += Math.max(0, partyLines - s.basePartyLines) * s.partyLine;

  if (internal) {
    const rows = view.panel?.rows || [];
    const stack = (lines, width) => (lines || []).reduce((sum, line) => sum + linesOf(line, width, s.panelFont), 0);
    const panelLines = rows.reduce((sum, row) => sum + Math.max(
      stack(row.lines, s.panelLeftWidth), stack(row.rlines, s.panelRightWidth), 1,
    ), 0);
    const strip = view.panel?.sentLine ? `${view.panel.sentLine.lead} · ${view.panel.sentLine.text}` : '';
    const stripLines = linesOf(strip, s.panelStripWidth, s.panelFont);
    // บรรทัดน้อยกว่า fixture จริง = ตารางขึ้นสูงกว่าได้ (ตัวประเมินไม่ประเมินต่ำ) แต่ไม่ต่ำกว่าแถวละบรรทัด
    top += (Math.max(rows.length, panelLines) - s.basePanelLines) * s.panelLine;
    top += Math.max(0, stripLines - 1) * s.panelLine;
  }
  return Math.ceil(top);
}

/* ความสูงของแถวตารางหน้า 1 — ชื่อพื้นที่ตัดบรรทัดในชื่อ โดยชั้นเกาะคำสุดท้าย (nowrap) · ช่องขนาดพิมพ์ทีละส่วน */
function summaryRowHeight(row, version, px) {
  const s = px.summary;
  const name = row.floorText ? `${row.name}${NBSP}${glue(row.floorText)}` : row.name;
  const nameLines = nameLinesOf(name, s.nameWidth[version], s.font);
  const dimLines = Math.max(1, (row.dims || []).length);
  return Math.ceil(s.rowPad + Math.max(s.codeLine + nameLines * s.textLine, dimLines * s.textLine));
}

function layoutSummary(view, px) {
  const s = px.summary;
  const internal = view.version === 'internal';
  const version = internal ? 'internal' : 'customer';
  const rows = view.table?.rows || [];
  const heights = rows.map((row) => summaryRowHeight(row, version, px));
  const mix = surveyReportMixLines(view.table?.total?.sizeMix, s.mixWidth, s.font);
  const tail = s.total + (mix.length - 1) * s.textLine + (internal ? s.spotNote : 0);
  const firstTop = summaryTableTop(view, px);
  const contTop = px.contentTop + (internal ? px.band : 0) + px.heading;

  const pages = [];
  let from = 0;
  let first = true;
  let start = true; // หน้านี้เป็นหน้าแรกที่ตารางขึ้น (หัวข้อไม่มี "(ต่อ)")
  // อย่างน้อยหนึ่งหน้าเสมอ (หน้า 1 มีหัวเอกสาร แม้ไม่มีพื้นที่เลย)
  do {
    const tableTop = first ? firstTop : contTop;
    let y = tableTop + s.thead;
    let to = from;
    /* แถวสุดท้ายต้องพาแถวรวมไปด้วย (แถวรวมไม่เดินทางตัวเดียว) · แถวอื่นต้องเหลือที่ให้บรรทัด "ต่อหน้า n" */
    while (to < rows.length && y + heights[to] + (to + 1 === rows.length ? tail : s.contLine) <= px.limit) {
      y += heights[to];
      to += 1;
    }
    if (first && rows.length && to === from) {
      /* แถวแรกไม่พอใต้หัวหน้า 1 (ฉบับภายในที่พื้นที่ 1 มี 14 ส่วนขึ้นไป · กล่องลูกค้ายาวมาก) ⇒ หน้า 1 ไม่พิมพ์หัวข้อกับหัวตาราง
         เปล่า ๆ — ตารางเริ่มหน้า 2 ทั้งตาราง · บรรทัด "ต่อหน้า 2" ชิดล่างแบบหน้าอื่น */
      pages.push({
        kind: 'summary', table: false, rows: range(0, 0), total: false, spotNote: false,
        bottom: Math.ceil(firstTop - s.headAbove[version]), limit: px.contLimit, cont: { type: 'summary' },
      });
      first = false;
      continue;
    }
    /* หน้า (ต่อ) ที่ใส่ไม่ได้สักแถว (แถวเดียวสูงกว่าทั้งหน้า) — ใส่หนึ่งแถวไปก่อน ดีกว่าวนไม่จบ · `overflow` ฟ้อง */
    if (!first && to === from && from < rows.length) {
      y += heights[to];
      to += 1;
    }
    const last = to === rows.length;
    pages.push({
      kind: first ? 'summary' : 'summaryCont',
      table: true, start, tableTop,
      rows: range(from, to),
      total: last,
      ...(last ? { mix } : {}),
      spotNote: last && internal,
      bottom: Math.ceil(y + (last ? tail : s.contLine)),
      limit: px.limit,
      cont: last ? null : { type: 'summary' },
    });
    from = to;
    first = false;
    start = false;
  } while (from < rows.length);
  return pages;
}

/* ── หน้าพื้นที่ ─────────────────────────────────────────────────────── */

const chunk = (count, size) => Math.ceil(count / size);

/* หัวพื้นที่: ชื่อ + ท่อนท้ายที่ห้ามตัด ("· ชั้น 6" · "(ต่อ)") — ตัวเรนเดอร์ห่อท่อนท้ายด้วย nowrap แล้วเกาะคำสุดท้ายของชื่อ
   (เดิมเลขชั้นตกบรรทัดใหม่ตัวเดียว: "… · ชั้น" / "6 (ต่อ)") ⇒ ที่นี่นับด้วยข้อความรูปเดียวกัน (NBSP) */
function zoneHeadHeight(zone, cont, px) {
  const z = px.zone;
  const meta = [zone.sizeLine?.dims, zone.sizeLine?.totals].filter(Boolean).join(' · ');
  // ความกว้างที่เหลือให้ชื่อ = คอลัมน์ − ชิปเลข − รหัส − บรรทัดขนาด − ช่องไฟสามช่อง (รหัสกับขนาดไม่หด ไม่ตัดบรรทัด)
  const room = px.column - z.chip - z.headGap * 3 - widthOf(zone.zoneCode, z.codeFont) - widthOf(meta, z.metaFont);
  const name = zone.name ?? zone.title;
  const tail = [zone.name == null ? '' : zone.floorText, cont ? '(ต่อ)' : ''].filter(Boolean).join(' ');
  const title = tail ? `${name}${NBSP}${glue(tail)}` : name;
  if (widthOf(title, z.headFont) <= room) return z.head;
  const lines = Math.max(2, linesOf(title, Math.max(120, room), z.headFont));
  return z.head + (lines - 1) * z.headLine;
}

function spotRowHeights(spots, px) {
  const z = px.zone;
  const out = [];
  for (let i = 0; i < spots.length; i += z.perRow) {
    const cards = spots.slice(i, i + z.perRow).map((spot) => {
      const caption = linesOf(`${spot.no} · ${spot.label}`, z.cardWidth, z.spotCaptionFont) * z.spotCaptionLine;
      const note = spot.note ? linesOf(spot.note, z.cardWidth, z.spotNoteFont) * z.spotNoteLine : 0;
      return caption + note;
    });
    out.push(Math.ceil(z.photoBox + Math.max(...cards)));
  }
  return out;
}

function layoutZone(zone, zoneIndex, view, px) {
  const z = px.zone;
  const internal = view.version === 'internal';
  const lane = px.contLimit - (px.contentTop + (internal ? px.band : 0) + px.heading);
  const top = px.contLimit - lane;

  const wideCount = (zone.wide || []).length;
  const wideRows = Math.max(1, chunk(wideCount, z.perRow)); // ไม่มีรูปกว้าง = กล่อง "ไม่มีภาพกว้าง" หนึ่งแถว
  const wideRowH = z.photoBox + z.wideCaption;
  const spots = internal ? (zone.spots || []) : [];
  const spotH = spotRowHeights(spots, px);
  const noteH = zone.note
    ? z.notePad + linesOf(`หมายเหตุพื้นที่ — ${zone.note}`, z.noteWidth, z.noteFont) * z.noteLine
    : 0;
  const partRows = zone.parts?.rows?.length || 0;
  const partsH = partRows ? z.partsHead + (partRows + 1) * z.partsRow : 0;
  /* ไม่มีภาพผัง = กล่องเตี้ยที่ไม่ยืด (ตารางส่วนข้าง ๆ ยังสูงเท่าที่มันสูง) */
  const hasPlan = Boolean(zone.plan);
  const planMin = Math.max(hasPlan ? z.planMin : z.planNone, partsH);
  const headH = zoneHeadHeight(zone, false, px);

  const spotsBlock = (rows) => (rows ? z.gap + z.sectionHead + spotH.slice(0, rows).reduce((a, b) => a + b, 0) + (rows - 1) * z.rowGap : 0);
  const wideBlock = (rows) => {
    if (!rows) return 0;
    return z.gap + z.sectionHead + (wideCount ? rows * wideRowH + (rows - 1) * z.rowGap : z.emptyBox);
  };
  const planRoom = (on) => lane - headH - wideBlock(on.wide) - (z.gap + z.sectionHead)
    - spotsBlock(on.spots) - (on.note ? z.gap + noteH : 0);

  const on = { wide: 1, spots: spotH.length ? 1 : 0, note: noteH > 0 };
  /* ผังเหลือไม่ถึงขั้นต่ำ ⇒ ย้ายของออกไปหน้า (ต่อ) ตามลำดับ:
     ① ฉบับภายใน: ส่วนจุดทั้งส่วนพร้อมหมายเหตุ (หมายเหตุปิดท้ายพื้นที่ จึงตามส่วนจุดไป) ② หมายเหตุ ③ ส่วนภาพกว้าง */
  if (planRoom(on) < planMin && on.spots) { on.spots = 0; on.note = false; }
  if (planRoom(on) < planMin && on.note) on.note = false;
  if (planRoom(on) < planMin) on.wide = 0;
  // ที่เหลือพอ ⇒ เติมแถวรูปกว้าง แล้วแถวจุด ทีละแถว ตราบที่ผังยังไม่ต่ำกว่าขั้นต่ำ
  while (on.wide > 0 && on.wide < wideRows && planRoom({ ...on, wide: on.wide + 1 }) >= planMin) on.wide += 1;
  while (on.spots > 0 && on.spots < spotH.length && planRoom({ ...on, spots: on.spots + 1 }) >= planMin) on.spots += 1;

  /* 🔑 **หมายเหตุปิดท้ายพื้นที่เสมอ** (กระดาน R-C-2 "PAGE RULE": หน้า (ต่อ) = ส่วนที่ยังมีรูปเหลือ ตามลำดับเดิม "then the note")
     มีแถวรูปล้นไปหน้า (ต่อ) ⇒ หมายเหตุไปอยู่ท้ายหน้า (ต่อ) ด้วย — เดิมหมายเหตุค้างหน้าหลัก แล้วหน้า (ต่อ) เหลือรูปเดียวโดด ๆ
     ที่ถูกอ่านหลังหมายเหตุ (ลำดับอ่าน: ภาพกว้าง 1–6 · ผัง · หมายเหตุ · "ภาพกว้าง 7/7") · ที่ที่หมายเหตุคืนให้เป็นของผัง
     (ไม่เติมแถวรูปเพิ่ม — เติมจนไม่เหลือแถวล้นจะกลายเป็นหน้า (ต่อ) ที่มีหมายเหตุอย่างเดียว)
     ⚠️ ผังไม่ย้ายตามไป: กระดานกำหนดว่าผังอยู่หน้าหลักเสมอและไม่พิมพ์ซ้ำ */
  const rowsLeft = () => on.wide < wideRows || on.spots < spotH.length;
  if (on.note && rowsLeft()) on.note = false;
  /* หมายเหตุหลุดไปหน้า (ต่อ) ตัวเดียว (ยาวจนผังต่ำกว่าขั้นต่ำ แต่ไม่มีแถวรูปล้น) ⇒ พาแถวรูปกว้างแถวสุดท้ายไปเป็นเพื่อน
     เมื่อหน้าหลักยังเหลือแถวรูปกว้างอย่างน้อยหนึ่งแถว — ไม่มีหน้าที่มีแต่หมายเหตุ */
  if (noteH > 0 && !on.note && !rowsLeft() && wideCount && on.wide >= 2) on.wide -= 1;

  const room = planRoom(on);
  // `planHeight` = ความสูงของกล่องผัง (จุดอ้างอิง `data-m="plan"` ของ harness) · `planBlock` = ที่ที่ส่วนผังกินจริง (รวมตารางส่วน)
  const planHeight = hasPlan ? Math.max(planMin, Math.floor(room)) : z.planNone;
  const planBlock = hasPlan ? planHeight : planMin;
  const wideTo = Math.min(wideCount, on.wide * z.perRow);
  const spotTo = Math.min(spots.length, on.spots * z.perRow);
  const pages = [{
    kind: 'zone', zoneIndex, zoneNo: zone.no,
    wide: on.wide ? range(0, wideTo) : null,
    plan: true, planHeight,
    // 🔴 ฉบับลูกค้าไม่มีคีย์ `spots` เลย (ไม่ใช่ null) — ตัวเรนเดอร์ที่วนตามคีย์จะไม่มีทางวาดส่วนจุด
    ...(internal ? { spots: on.spots ? range(0, spotTo) : null } : {}),
    note: on.note,
    bottom: Math.ceil(top + lane - room + planBlock),
    limit: px.contLimit,
  }];

  /* ของที่เหลือ → หน้า (ต่อ): แถวรูปกว้าง แล้วแถวจุด แล้วหมายเหตุ — ผังไม่พิมพ์ซ้ำ */
  const queue = [];
  for (let r = on.wide; r < wideRows; r += 1) {
    queue.push({ section: 'wide', from: r * z.perRow, to: Math.min(wideCount, (r + 1) * z.perRow), height: wideCount ? wideRowH : z.emptyBox });
  }
  for (let r = on.spots; r < spotH.length; r += 1) {
    queue.push({ section: 'spots', from: r * z.perRow, to: Math.min(spots.length, (r + 1) * z.perRow), height: spotH[r] });
  }
  if (noteH > 0 && !on.note) queue.push({ section: 'note', height: noteH });

  const contHead = zoneHeadHeight(zone, true, px);
  let page = null;
  let y = 0;
  let rowsInSection = { wide: 0, spots: 0 };
  const open = () => {
    page = { kind: 'zoneCont', zoneIndex, zoneNo: zone.no, wide: null, note: false, limit: px.contLimit };
    if (internal) page.spots = null;
    y = contHead;
    rowsInSection = { wide: 0, spots: 0 };
    pages.push(page);
  };
  queue.forEach((item, k) => {
    const cost = () => {
      if (item.section === 'note') return z.gap + item.height;
      return rowsInSection[item.section] ? z.rowGap + item.height : z.gap + z.sectionHead + item.height;
    };
    const full = () => item.section !== 'note' && rowsInSection[item.section] >= z.contRowsPerSection;
    /* แถวรูปแถวสุดท้ายกับหมายเหตุไปด้วยกัน — หมายเหตุไม่ขึ้นหน้าใหม่ตัวเดียว (เดิมฉบับภายในได้หน้าที่มีแต่หมายเหตุ) */
    const next = queue[k + 1];
    const company = item.section !== 'note' && next?.section === 'note' ? z.gap + next.height : 0;
    // หน้า (ต่อ) ว่าง ๆ รับของชิ้นแรกเสมอ (กันวนไม่จบ) — ชิ้นที่สูงเกินหน้าเอง `overflow` ฟ้อง
    if (!page || full() || (y + cost() + company > lane && y > contHead)) open();
    y += cost();
    if (item.section === 'note') page.note = true;
    else {
      rowsInSection[item.section] += 1;
      const prev = page[item.section];
      page[item.section] = range(prev ? prev.from : item.from, item.to);
    }
    page.bottom = Math.ceil(top + y);
  });
  return pages;
}

/* ── ภาคผนวก (ฉบับภายใน) ─────────────────────────────────────────────── */

const SECTION_TITLES = {
  decisions: 'ก. การเคาะผลของหัวหน้า',
  scope: 'ข. ขอบเขตเทียบคำร้อง',
  history: 'ค. ประวัติตีกลับและดึงกลับ',
  notes: 'ง. หมายเหตุภายใน',
  signs: 'จ. การลงนามภายใน',
};

function entityRowHeight(row, nameWidth, others, a) {
  const name = row.floorText ? `${row.name}${NBSP}${glue(row.floorText)}` : row.name;
  const nameLines = nameLinesOf(name, nameWidth, a.font);
  const otherLines = Math.max(1, ...others.map(([text, width]) => linesOf(text, width, a.font)));
  return Math.ceil(a.rowPad + Math.max(a.codeLine + nameLines * a.textLine, otherLines * a.textLine));
}

function layoutAppendix(view, px) {
  const a = px.appendix;
  const ap = view.appendix;
  const startY = px.contentTop + px.band + a.lead; // แถว "ภาคผนวก — ข้อมูลภายใน" จบที่นี่
  const lastLimit = a.signsBottom - a.signs - a.gap; // บล็อกเหนือ จ ต้องจบก่อนนี้

  const pages = [];
  let page = null;
  let y = 0;
  const open = () => {
    page = { kind: 'appendix', first: pages.length === 0, blocks: [], limit: px.contLimit, bottom: startY, cont: null };
    y = startY;
    pages.push(page);
  };
  open();

  /* ตารางที่แบ่งระหว่างแถว — ต้องมีหัวข้อ + หัวตาราง + แถวแรก (+ ท้ายตารางถ้าเป็นแถวสุดท้าย) ถึงจะเริ่มบนหน้านี้
     ท่อนที่ต่อหน้าถัดไปพิมพ์หัวข้อ "(ต่อ)" กับหัวตารางซ้ำ */
  const flowTable = (type, heights, { thead, tail = 0, emptyRow = 0, extra = {} }) => {
    const headCost = a.gap + px.heading + thead;
    if (!heights.length) {
      if (y + headCost + emptyRow + tail > px.contLimit) open();
      y += headCost + emptyRow + tail;
      page.blocks.push({ type, continued: false, rows: range(0, 0), empty: true, last: true });
      page.bottom = Math.ceil(y);
      return;
    }
    let from = 0;
    let continued = false;
    while (from < heights.length) {
      const need = (i) => heights[i] + (i + 1 === heights.length ? tail : 0);
      if (y + headCost + need(from) > px.contLimit && page.blocks.length) open();
      y += headCost;
      let to = from;
      while (to < heights.length && y + need(to) <= px.contLimit) {
        y += heights[to];
        to += 1;
      }
      if (to === from) { y += heights[to]; to += 1; } // แถวเดียวสูงกว่าหน้า — ใส่ไปก่อน กันวนไม่จบ · `overflow` ฟ้อง
      /* ท้ายตาราง (แถวรวม + เชิงอรรถ) ต้องเดินทางกับแถวสุดท้าย */
      const last = to === heights.length;
      if (last) y += tail;
      page.blocks.push({ type, continued, rows: range(from, to), empty: false, last, ...(last ? extra : {}) });
      page.bottom = Math.ceil(y);
      from = to;
      continued = true;
      if (!last) open();
    }
  };

  /* ตารางที่ **แถวเดียวแบ่งข้ามหน้าได้** (ค) — หน่วยคือท่อนของแถว (`splitText`) · `heightOf(i, j)` = ความสูงของหน่วย [i, j)
     บนหน้าเดียว (ท่อนของแถวเดียวกันพิมพ์ต่อกันเป็นช่องเดียว) · `blockOf(i, j, continued)` = บล็อกของแผน */
  const flowUnits = (type, count, heightOf, blockOf, { thead, emptyRow = 0 }) => {
    const headCost = a.gap + px.heading + thead;
    if (!count) {
      if (y + headCost + emptyRow > px.contLimit) open();
      y += headCost + emptyRow;
      page.blocks.push({ type, continued: false, rows: range(0, 0), empty: true, last: true });
      page.bottom = Math.ceil(y);
      return;
    }
    let i = 0;
    let continued = false;
    while (i < count) {
      if (y + headCost + heightOf(i, i + 1) > px.contLimit && page.blocks.length) open();
      y += headCost;
      const base = y;
      let j = i + 1; // หน่วยแรกลงเสมอ (กันวนไม่จบ) — หน่วยหนึ่งสูงไม่เกิน `splitLines + splitSlack` บรรทัด
      while (j < count && base + heightOf(i, j + 1) <= px.contLimit) j += 1;
      y = base + heightOf(i, j);
      page.blocks.push(blockOf(i, j, continued));
      page.bottom = Math.ceil(y);
      i = j;
      continued = true;
      if (i < count) open();
    }
  };

  const d = ap.decisions;
  /* เชิงอรรถ ("ขนาดที่ระบบเสนอ: … · XS หัวหน้าเลือกเอง · …") ตัดบรรทัดที่ตัวคั่นเท่านั้น — แผนตัดเองแบบเดียวกับช่องขนาด
     (ของจริงกว้าง 666px ในคอลัมน์ 702: ตัวประเมินบรรทัดทั่วไปซึ่งเผื่อ 3% + เว้นท้าย ตอบว่าสองบรรทัด ทั้งที่ลงบรรทัดเดียว) */
  const foot = (d.footnote || []).length ? dottedLines(d.footnote.join(' · '), px.column, a.footFont) : [];
  const mix = surveyReportMixLines(d.total?.sizeMix, a.decisionsMixWidth, a.font);
  flowTable('decisions',
    d.rows.map((row) => entityRowHeight(row, a.decisionsNameWidth, [[row.reason, a.decisionsReasonWidth]], a)),
    {
      thead: a.decisionsHead, emptyRow: a.emptyRow, extra: { mix, foot },
      tail: a.total + (mix.length - 1) * a.textLine + (foot.length ? a.footPad + foot.length * a.footLine : 0),
    });

  flowTable('scope',
    ap.scope.rows.map((row) => entityRowHeight(row, a.scopeNameWidth, [[row.cutReason, a.scopeReasonWidth]], a)),
    { thead: a.thead, emptyRow: a.emptyRow });

  /* ── ค: เหตุผลยาว (ตีกลับ 10 ข้อ × 300 ตัวในช่อง 176px ≈ 100+ บรรทัด) แบ่งกลางเหตุผลได้ ──
     ท่อนแรกของแถวพิมพ์ครบทุกช่อง · ท่อนที่ต่อหน้าถัดไปเหลือ "เหตุการณ์ (ต่อ)" กับเหตุผลที่เหลือ
     บล็อก: `rows` = ช่วงแถวที่มีของบนหน้านี้ (แถวที่ถูกแบ่งอยู่ในบล็อกของทั้งสองหน้า) · `skip` = แถวแรกเริ่มที่ตัวอักษรนี้ของเหตุผล
     · `stop` = แถวสุดท้ายจบที่ตัวอักษรนี้ (ไม่มีคีย์ = ทั้งเหตุผล) */
  const history = ap.history || [];
  const hUnits = [];
  history.forEach((row, index) => {
    const text = String(row.reason ?? '');
    for (const part of splitText(text, a.historyReasonWidth, a.font, a.splitLines, a.splitSlack)) hUnits.push({ index, text, ...part });
  });
  const historyHeight = (i, j) => {
    let h = 0;
    let k = i;
    while (k < j) {
      const unit = hUnits[k];
      let m = k;
      while (m + 1 < j && hUnits[m + 1].index === unit.index) m += 1;
      const row = history[unit.index];
      const reasonLines = linesOf(unit.text.slice(unit.from, hUnits[m].to), a.historyReasonWidth, a.font);
      const otherLines = unit.from === 0
        ? Math.max(
          a.historyDateLines, linesOf(row.event, a.historyEventWidth, a.font),
          linesOf(row.by, a.historyByWidth, a.font), linesOf(row.totalsText, a.historyTotalsWidth, a.font),
        )
        : linesOf(`${row.event} (ต่อ)`, a.historyEventWidth, a.font);
      h += Math.ceil(a.rowPad + a.textLine * Math.max(otherLines, reasonLines));
      k = m + 1;
    }
    return h;
  };
  flowUnits('history', hUnits.length, historyHeight, (i, j, continued) => {
    const head = hUnits[i];
    const end = hUnits[j - 1];
    return {
      type: 'history', continued, rows: range(head.index, end.index + 1), empty: false, last: j === hUnits.length,
      ...(head.from > 0 ? { skip: head.from } : {}),
      ...(end.to < end.text.length ? { stop: end.to } : {}),
    };
  }, { thead: a.thead, emptyRow: a.emptyRow });

  /* ── ง + จ: กลุ่มที่อยู่ด้วยกันบนหน้าสุดท้าย · จ ชิดล่างเสมอ ──
     ง เป็นตาราง kv — แต่ละแถวคือชุดบรรทัด (รายละเอียดคำร้องทีละบรรทัด · ผู้บันทึกผลวัดทีละพื้นที่ ซึ่งยาวได้ถึง 60 บรรทัด)
     ⇒ หน่วยที่แบ่งได้คือ "บรรทัดของแถว" — และบรรทัดที่ยาวเกิน (รายละเอียดคำร้อง 4,000 ตัวย่อหน้าเดียว ≈ 55 บรรทัด สูงกว่าหน้า)
     ถูกแบ่งเป็นท่อนด้วย `splitText` ⇒ ไม่มีหน่วยไหนสูงเกิน `splitLines + splitSlack` บรรทัด */
  const units = [];
  ap.notes.forEach((row, index) => {
    const labelLines = linesOf(row.label, a.kvLabelWidth, a.kvLabelFont);
    const contLabelLines = linesOf(`${row.label} (ต่อ)`, a.kvLabelWidth, a.kvLabelFont);
    row.lines.forEach((line, lineIndex) => {
      const text = String(line ?? '');
      for (const part of splitText(text, a.kvValueWidth, a.font, a.splitLines, a.splitSlack)) {
        units.push({ index, lineIndex, text, ...part, labelLines, contLabelLines, firstOfRow: lineIndex === 0 && part.from === 0 });
      }
    });
  });
  /* ความสูงของท่อน [i, j) บนหน้าหนึ่ง: ทุกแถว (หรือท่อนของแถว) ที่ขึ้นบนหน้านี้เสีย padding + ป้ายอย่างน้อยตามบรรทัดของป้าย
     ท่อนของบรรทัดเดียวกันที่อยู่หน้าเดียวกันพิมพ์ต่อกัน ⇒ นับบรรทัดจากข้อความที่ต่อแล้ว */
  const spanCache = new Map();
  const spanLines = (unit, to) => {
    const key = `${unit.index}:${unit.lineIndex}:${unit.from}:${to}`;
    if (!spanCache.has(key)) spanCache.set(key, linesOf(unit.text.slice(unit.from, to), a.kvValueWidth, a.font));
    return spanCache.get(key);
  };
  const notesHeight = (i, j) => {
    let h = a.kvBorder;
    let k = i;
    while (k < j) {
      const row = units[k].index;
      let lines = 0;
      let m = k;
      while (m < j && units[m].index === row) {
        let n = m;
        while (n + 1 < j && units[n + 1].index === row && units[n + 1].lineIndex === units[m].lineIndex) n += 1;
        lines += spanLines(units[m], units[n].to);
        m = n + 1;
      }
      h += a.kvPad + Math.max(lines, units[k].firstOfRow ? units[k].labelLines : units[k].contLabelLines) * a.textLine;
      k = m;
    }
    return Math.ceil(h);
  };
  /* แถวของบล็อก: `lines` = ช่วงบรรทัดของแถวบนหน้านี้ · `skip` = บรรทัดแรกเริ่มที่ตัวอักษรนี้ · `stop` = บรรทัดสุดท้ายจบที่ตัวอักษรนี้
     (ไม่มีคีย์ = ทั้งบรรทัด) — บรรทัดที่ถูกแบ่งอยู่ในช่วงของทั้งสองหน้า */
  const notesBlock = (i, j, continued) => {
    const rows = [];
    for (let k = i; k < j; k += 1) {
      const u = units[k];
      let hit = rows[rows.length - 1];
      if (hit && hit.index === u.index) hit.lines.to = u.lineIndex + 1;
      else {
        hit = { index: u.index, lines: range(u.lineIndex, u.lineIndex + 1), continued: !u.firstOfRow };
        if (u.from > 0) hit.skip = u.from;
        rows.push(hit);
      }
      if (u.to < u.text.length) hit.stop = u.to;
      else delete hit.stop;
    }
    return { type: 'notes', continued, rows, last: j === units.length };
  };
  const noteHead = a.gap + px.heading;
  const all = notesHeight(0, units.length);

  if (y + noteHead + all > lastLimit && startY + noteHead + all <= lastLimit) {
    // ทั้งกลุ่มไม่พอใต้ของที่มีอยู่ แต่ลงหน้าใหม่ได้ทั้งกลุ่ม ⇒ ขึ้นหน้าใหม่ (ไม่แบ่ง ง)
    if (page.blocks.length) open();
  }
  if (y + noteHead + all <= lastLimit) {
    y += noteHead + all;
    page.blocks.push(notesBlock(0, units.length, false));
  } else {
    // ง ยาวกว่าหน้า — ไหลต่อจากตรงนี้ แบ่งระหว่างบรรทัด/ท่อน · ท่อนสุดท้ายต้องเหลือที่ให้ จ
    let i = 0;
    let continued = false;
    while (i < units.length) {
      if (y + noteHead + notesHeight(i, i + 1) > px.contLimit && page.blocks.length) open();
      y += noteHead;
      const base = y;
      let j = i + 1;
      while (j < units.length && base + notesHeight(i, j + 1) <= px.contLimit) j += 1;
      y = base + notesHeight(i, j);
      page.blocks.push(notesBlock(i, j, continued));
      page.bottom = Math.ceil(y);
      i = j;
      continued = true;
      if (i < units.length) open();
    }
    if (y > lastLimit) open(); // ท่อนสุดท้ายกินที่ของ จ ⇒ จ ขึ้นหน้าของตัวเอง (ยังชิดล่าง ยังเป็นหน้าสุดท้าย)
  }
  page.blocks.push({ type: 'signs' });
  page.bottom = a.signsBottom;
  page.limit = a.signsBottom;

  // บรรทัด "ต่อหน้า n · …" ของทุกหน้าที่ไม่ใช่หน้าสุดท้าย — บอกสิ่งแรกที่หน้าถัดไปเริ่มด้วย
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    if (!next) return;
    const firstBlock = next.blocks[0];
    const names = firstBlock.type === 'notes' && !firstBlock.continued
      ? [SECTION_TITLES.notes, SECTION_TITLES.signs]
      : [`${SECTION_TITLES[firstBlock.type]}${firstBlock.continued ? ' (ต่อ)' : ''}`];
    p.cont = { type: 'appendix', sections: names };
  });
  return pages;
}

/* ── ประกอบทั้งเล่ม ──────────────────────────────────────────────────── */

const zoneRangeText = (from, to) => (from >= to ? `พื้นที่ ${from}` : `พื้นที่ ${from}–${to}`);

/**
 * @param view ผลของ `surveyReportView` ฉบับเดียว (ลูกค้าหรือภายใน)
 * @param opts.px แทนค่าคงที่พิกเซล (เทสต์ · สอบเทียบ) — ไม่ส่ง = `SURVEY_REPORT_PX`
 * @returns `{ pages, zonePage, pageCount, overflow }`
 *   · `pages[i]` = `{ no, kind, …, bottom, limit, cont }` — `no` เริ่มที่ 1
 *       summary / summaryCont  `table` (หน้านี้พิมพ์ตารางไหม — `false` = หน้า 1 ที่แถวแรกไม่พอ ตารางเริ่มหน้าถัดไป)
 *                              · `start` (หน้าแรกที่ตารางขึ้น — หัวข้อไม่มี "(ต่อ)") · `tableTop` (ขอบบนของหัวตาราง)
 *                              · `rows {from,to}` (ดัชนีของ `view.table.rows`) · `total` · `mix` (บรรทัดของช่องขนาดในแถวรวม
 *                              — มีเมื่อ `total`) · `spotNote`
 *       zone                   `zoneIndex` (ดัชนีของ `view.zones`) · `zoneNo` · `first` (หน้าพื้นที่หน้าแรกของเล่ม —
 *                              หัวข้อไม่มี "(ต่อ)") · `wide {from,to}|null` (ดัชนีรูป) · `plan: true` · `planHeight`
 *                              · `spots {from,to}|null` (ฉบับภายในเท่านั้น — ฉบับลูกค้าไม่มีคีย์นี้) · `note`
 *       zoneCont               เหมือน zone แต่ไม่มีผัง
 *       signoff                —
 *       appendix               `first` · `blocks[]`:
 *                              `{ type: 'decisions'|'scope', continued, rows, empty, last }` (+ `mix` · `foot` บนท่อนสุดท้ายของ ก
 *                                — บรรทัดของช่องขนาดในแถวรวม และบรรทัดของเชิงอรรถ)
 *                              · `{ type: 'history', continued, rows, empty, last, skip?, stop? }` — แถวแรกเริ่มที่ตัวอักษร `skip`
 *                                ของเหตุผล (ท่อนที่ต่อจากหน้าก่อน) · แถวสุดท้ายจบที่ตัวอักษร `stop` (ต่อหน้าถัดไป)
 *                              · `{ type: 'notes', continued, rows: [{ index, lines {from,to}, continued, skip?, stop? }], last }`
 *                              · `{ type: 'signs' }`
 *       `bottom` = ขอบล่างของบล็อกสุดท้ายตามที่ประเมิน (harness เทียบกับที่วัดจริง) · `limit` = งบของหน้า
 *       `cont` = `{ page, text }` บรรทัด "ต่อหน้า n · …" หรือ `null`
 *   · `zonePage` = `{ [zoneNo]: เลขหน้า }` หน้าแรกของแต่ละพื้นที่ — คอลัมน์ "หน้า" ของตารางหน้า 1
 *   · 🔴 `overflow` = `[{ page, kind, bottom, limit }]` หน้าที่ `bottom > limit` — **ปกติว่าง** · ไม่ว่าง = มีของชิ้นเดียวที่สูงกว่าหน้า
 *       และแบ่งไม่ได้ (แถวตารางที่ชื่อ/เหตุผลยาวผิดปกติ · หัวหน้า 1 ที่กล่องลูกค้ายาวมาก · หมายเหตุพื้นที่กับตารางส่วนที่รวมกันเกินหน้า)
 *       แผ่นเป็น `overflow: hidden` ⇒ ส่วนที่เกินถูกตัดเงียบ — **PR-2 ต้องไม่ตรึงเมื่อลิสต์นี้ไม่ว่าง** แล้วบอกหน้าที่ล้นให้หัวหน้าแก้ต้นทาง
 */
export function paginateSurveyReport(view, { px = SURVEY_REPORT_PX } = {}) {
  const internal = view?.version === 'internal';
  const zones = view?.zones || [];
  const pages = [...layoutSummary(view || {}, px)];
  const zonePage = {};

  zones.forEach((zone, index) => {
    const zonePages = layoutZone(zone, index, view, px);
    zonePage[zone.no] = pages.length + 1;
    pages.push(...zonePages);
  });
  const firstZone = pages.find((p) => p.kind === 'zone');
  for (const p of pages) if (p.kind === 'zone') p.first = p === firstZone;

  pages.push({ kind: 'signoff', bottom: px.limit - 2, limit: px.limit, cont: null });
  if (internal && view.appendix) pages.push(...layoutAppendix(view, px));

  pages.forEach((p, i) => { p.no = i + 1; });

  // บรรทัด "ต่อหน้า n · …" — เขียนหลังรู้เลขหน้าครบแล้วเท่านั้น
  const tableRows = view?.table?.rows || [];
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    if (p.kind === 'summary' || p.kind === 'summaryCont') {
      /* บอกสิ่งที่หน้าถัดไปมี **จริง** — ช่วงพื้นที่ของหน้าถัดไป และ "ยอดรวม" เฉพาะเมื่อแถวรวมอยู่หน้านั้น
         (เดิมบอกพื้นที่ที่เหลือทั้งหมดกับยอดรวมเสมอ: "ต่อหน้า 2 · พื้นที่ 5–12 และยอดรวม" ทั้งที่หน้า 2 มีแค่ 5–10) */
      if (!p.cont) p.cont = null;
      else {
        const fromNo = tableRows[next.rows.from]?.no ?? next.rows.from + 1;
        const toNo = tableRows[next.rows.to - 1]?.no ?? next.rows.to;
        p.cont = { page: next.no, text: `ต่อหน้า ${next.no} · ${zoneRangeText(fromNo, toNo)}${next.total ? ' และยอดรวม' : ''}` };
      }
    } else if (p.kind === 'zone' || p.kind === 'zoneCont') {
      if (next.kind === 'signoff') p.cont = { page: next.no, text: `ต่อหน้า ${next.no} · การรับรองผลประเมิน` };
      else {
        // ชื่อพื้นที่แบบไม่มีชั้น — แถวของตารางหน้า 1 เรียงเดียวกับ `view.zones` (พื้นที่ที่ไม่ถูกตัด)
        const z = zones[next.zoneIndex];
        const name = view.table?.rows?.[next.zoneIndex]?.name || z.title;
        p.cont = { page: next.no, text: `ต่อหน้า ${next.no} · พื้นที่ ${z.no} ${name}${next.kind === 'zoneCont' ? ' (ต่อ)' : ''}` };
      }
    } else if (p.kind === 'appendix') {
      p.cont = p.cont ? { page: next.no, text: `ต่อหน้า ${next.no} · ${p.cont.sections.join(' · ')}` } : null;
    }
  });

  const overflow = pages.filter((p) => p.bottom > p.limit)
    .map((p) => ({ page: p.no, kind: p.kind, bottom: p.bottom, limit: p.limit }));
  return { pages, zonePage, pageCount: pages.length, overflow };
}

/**
 * ข้อความไทยของหน้าที่ล้น (`[]` = ไม่มี) — ด่านของ PR-2 ก่อนตรึง และของ harness
 * @param layout ผลของ `paginateSurveyReport`
 */
export function surveyReportOverflowErrors(layout) {
  const KIND = {
    summary: 'หน้า 1', summaryCont: 'ตารางพื้นที่ (ต่อ)', zone: 'หน้าพื้นที่', zoneCont: 'หน้าพื้นที่ (ต่อ)',
    signoff: 'การรับรองผล', appendix: 'ภาคผนวก',
  };
  return (layout?.overflow || []).map((o) => (
    `หน้า ${o.page} (${KIND[o.kind] || o.kind}) เนื้อหาสูงเกินหน้ากระดาษ ${o.bottom - o.limit}px — มีข้อความหรือแถวที่ยาวเกินหนึ่งหน้า ย่อข้อความต้นทางแล้วลองใหม่`
  ));
}
