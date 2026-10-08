// ── กระดาษของรายงานการประเมินพื้นที่ (FM-TS-01) — view + แผนหน้า → HTML ไฟล์เดียว ─────────────────
//
// ⭐ ตัวเรนเดอร์ **ไม่คิดอะไรเอง** — ข้อความทุกตัวมาจาก `surveyReportView` (ตัวกรองสองฉบับ) และการขึ้นหน้าทุกหน้า
//   มาจาก `paginateSurveyReport` (แผนหน้า) · ที่นี่ทำอย่างเดียวคือวางของลงแผ่น A4 ตามกระดานที่เจ้าของอนุมัติ
//   (`mockups/survey-report-doc/project/R-*.dc.html` — R-C-1…4 ฉบับลูกค้า · R-I-1, R-I-Z, R-I-2, R-I-3 ฉบับภายใน)
//   ⇒ สิ่งที่ถูกนับความสูงคือสิ่งที่ถูกพิมพ์ · harness (`scripts/render-survey-report.mjs`) วัดของจริงเทียบแผนทุกหน้า
//
// 🔴 **ฉบับลูกค้าไม่มีทางพิมพ์ของภายใน** — สามชั้น:
//   ① view ฉบับลูกค้าเป็นรายการอนุญาต ไม่มีคีย์ของภายในให้อ่าน (`surveyReportView.js`)
//   ② ชิ้นของฉบับภายในทุกชิ้น (แถบ · แผงภายใน · คอลัมน์/ส่วนจุด · ภาคผนวก) อ่านป้ายจาก view ฉบับภายในเอง
//      (`view.band` · `view.table.spotNote.lead` · `view.appendix`) — ไม่มีคีย์ = ไม่มีอะไรให้พิมพ์
//   ③ CSS ของฉบับภายในแยกก้อน (`SURVEY_REPORT_INTERNAL_CSS`) ไม่ถูกฝังลงฉบับลูกค้า — และ **CSS ทั้งสองก้อนไม่มีคอมเมนต์**
//      เพราะเทสต์รั่ว grep ทั้งไฟล์ HTML: คำในคอมเมนต์ก็นับ (คำอธิบายกฎอยู่ในคอมเมนต์ JS ตรงนี้แทน)
//
// 🔑 เปลือก = `renderDocumentHTML` ตัวเดียวกับ QT/SO/FM-SA-04 (ฟอนต์ Sarabun ฝัง base64 · @page A4 · ขั้นบันได zoom)
//   แผ่น = `<article class="sheet su-page">` ⇒ `watermarkSheets`/`stampWatermark` ของเปลือกใช้ได้ตามเดิม
//   กฎของกระดาน (`.frame …`) ย้ายมาแบบคำต่อคำ เปลี่ยนแค่ตัวนำเป็น `.surveyReport .sheet` · ชื่อที่ชนกับเปลือกเปลี่ยนสองตัว:
//     `.sectionLead` → `.su-lead` · `.signed` → `.su-signed` (เปลือกมีสองชื่อนี้อยู่แล้วในความหมายอื่น)
//   ไม่ได้ย้ายมา: `.stats` `.bul` `.scope` `.pin` (มติเจ้าของ: ไม่มีการ์ดสรุป ไม่มีขอบเขตและวิธีการ ไม่มีหมุดบนผัง)
//
// 🔑 รูป: `imageSrc(img)` ตอบ `src` ของแต่ละรูป — ไม่ส่ง = token `su-img:<sha>` (รูปเก็บแยกในถัง ไม่ฝังลง HTML ที่ตรึง)
//   ผู้เสิร์ฟเรียก `resolveImageTokens(html, resolver)` แปลง token เป็น data URI ตอนจะพิมพ์ · harness ส่ง data URI ตรง ๆ
//
// ⚠️ เลขที่เอกสาร (`docNo`) กับวันที่ออก (`issuedAt`) ไม่อยู่ใน view — เป็นคอลัมน์ของแถว (เลขเกิดใน RPC หลังภาพนิ่ง)
//   ไม่ส่ง = ขีด (ฉบับร่างก่อนออกเลข)
//
// 🔑 ของที่แผนหน้าตัดเอง พิมพ์ตามแผนทุกตัวอักษร (ไม่ให้เบราว์เซอร์เลือกจุดตัด — ความสูงต้องเท่าที่แผนนับ):
//   `page.mix` / `block.mix` บรรทัดของช่อง "ขนาดแพ็ค" ในแถวรวม · `block.foot` บรรทัดของเชิงอรรถ ก
//   `block.skip` / `block.stop` (ค) · `part.skip` / `part.stop` (ง) ช่วงตัวอักษรของข้อความยาวที่แบ่งข้ามหน้า
//   `page.table === false` หน้า 1 ที่ไม่มีตาราง · `page.start` หน้าแรกที่ตารางขึ้น (หัวข้อไม่มี "(ต่อ)")
//
// 🔴 อักขระที่พิมพ์ต้องอยู่ในฟอนต์ที่ฝัง (Sarabun ชุด latin + thai) — "≤" "⇒" ไม่มี: ตกไปฟอนต์ของเครื่อง และ chromium บน production
//   (มีแต่ Open Sans) พิมพ์กล่องสี่เหลี่ยม · เทสต์ช่วงอักขระกับด่านฟอนต์ของ harness คุม — เติมข้อความใหม่ให้ดู `unicode-range` ของเปลือก
//
// ⚠️ แก้ CSS/markup ที่นี่ = ความสูงเปลี่ยน ⇒ รัน harness `--assert` แล้วแก้ค่าคงที่ใน `surveyReportLayout.js` พร้อมกัน
//   และขึ้น `SURVEY_REPORT_RENDERER_VERSION` (กระดาษที่ตรึงแล้วพก CSS ของวันที่ออกไปด้วย — แก้ที่นี่ไม่ถึงใบเก่า)
import { SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';
import { documentAudienceAccentKey } from '@/lib/documents/documentAudience';
import { esc, renderDocumentHTML, watermarkBlock } from '@/lib/documents/documentShell';
import { fmtDate } from '@/lib/format';
import { surveyReportFileName } from './surveyReportNumber';

/* 2026-10-08a — สีชื่อเอกสารเดินตามฉบับ (ลูกค้า = terracotta · ภายใน = steel) แทน teal ตายตัว · ความสูงไม่ขยับ
   (สีอย่างเดียว — harness `--assert` ยืนยัน 4 / 6 หน้าเท่าเดิม)
   🔴 **ขึ้นรุ่นไม่ได้เปลี่ยนสีของกระดาษที่ตรึงไปแล้ว** — HTML ที่ตรึงพกสีของวันที่ตรึง: ฉบับที่ตรึงด้วยรุ่นก่อนหน้า
      (คอลัมน์ `rendererVersion` ของแถว = `fm-ts-01@2026-10-01b`) ยังเป็น teal ตลอดไป · ฉบับที่ออกเลขแล้วแต่ยังไม่ตรึงกระดาษ
      จะตรึงด้วยสีใหม่ (ขั้นกระดาษเขียนรุ่นของวันที่ตรึง — `surveyReportPaper.js`)
   ⚠️ **"ยังไม่มีเอกสารที่ออกแล้วสักใบ" เป็นข้อสมมติ ไม่ใช่สิ่งที่โค้ดรับประกัน** — สวิตช์ `SURVEY_REPORT_ISSUE_AT_SEND` ปิดอยู่
      แต่ POST `/api/service/surveys/[id]/document` (ออกเอกสารของใบที่ส่งผลไปแล้ว) อยู่บน production ตั้งแต่ PR-2 และไม่ถามสวิตช์
      ⇒ **ก่อน merge รุ่นนี้ต้องนับแถว `service_survey_reports` (SELECT อย่างเดียว)**: 0 แถว = จบ ·
        มีแถวที่ตรึงแล้ว = เจ้าของตัดสินว่าฉบับเหล่านั้นคง teal หรือออก Rev. ใหม่ */
export const SURVEY_REPORT_RENDERER_VERSION = 'fm-ts-01@2026-10-08a';

/* ── สีชื่อเอกสาร: เดินตามผู้อ่านของฉบับ (มติเจ้าของ 08/10/2026 — แทนมติ "teal ตายตัว" ของกระดาน) ──────────
   ฉบับลูกค้าออกนอกบริษัท ⇒ terracotta (สีตั้งต้นของใบเสนอราคา) · ฉบับภายใน ⇒ steel (สีตั้งต้นของใบสั่งขาย)
   — คีย์ตายตัวของ `lib/documents/documentAudience.js` ไม่ได้อ่านมาตรฐานที่เผยแพร่ของสองชนิดนั้น
   🔑 ถามจาก **ฉบับของ view ที่กำลังพิมพ์** ทางเดียว — `renderSurveyReportHTML` **ไม่มีตัวเลือก `accentKey`**
     ⇒ ไม่มีผู้เรียกคนไหน (แอป · สคริปต์ · เทสต์) พิมพ์ฉบับหนึ่งด้วยสีของอีกฉบับได้ ไม่ว่าจะส่งอะไรมา (โครงสร้างกันไว้ ไม่ใช่ grep)
   ⚠️ ฉบับที่ไม่ใช่ `internal` = กระดาษที่ออกนอกบริษัท — เกณฑ์เดียวกับที่ตัวเรนเดอร์ใช้เลือกว่าจะฝัง CSS ของฉบับภายในหรือไม่
   ⚠️ มาตรฐานเอกสาร `siteSurvey` ไม่ได้คุมสี (แถวที่เผยแพร่ยังถือ `accentKey: 'teal'` — ไม่มีใครอ่านช่องนั้น) */
export const surveyReportAudience = (version) => (version === 'internal' ? 'internal' : 'external');

/** คีย์สี (`DOCUMENT_ACCENT_THEMES`) ของกระดาษฉบับหนึ่ง — `'customer' | 'internal'` */
export const surveyReportAccentKey = (version) => documentAudienceAccentKey(surveyReportAudience(version));

const IMAGE_TOKEN = 'su-img:';
const IMAGE_TOKEN_RE = /su-img:([0-9a-f]{64})/g;

/** `src` ตั้งต้นของรูปในกระดาษที่จะตรึง — token ที่ผู้เสิร์ฟแปลงทีหลัง · รูปที่ยังไม่มี sha = ไม่มี src (กล่อง "ไม่มีภาพ") */
export const surveyReportImageToken = (img) => (img?.sha ? `${IMAGE_TOKEN}${img.sha}` : null);

/**
 * แปลง token `su-img:<sha>` เป็น `src` จริง (data URI ตอนพิมพ์ PDF · ลิงก์ที่เซ็นแล้วตอนดูบนจอ)
 * @param resolver `(sha) => string | null` — คืนค่าว่าง = ปล่อย token ไว้ (ผู้เรียกตรวจ `su-img:` ที่เหลือเองได้)
 */
export function resolveImageTokens(html, resolver) {
  return String(html ?? '').replace(IMAGE_TOKEN_RE, (token, sha) => resolver?.(sha) || token);
}

/** sha ของรูปทุกรูปที่ HTML อ้าง (ไม่ซ้ำ ตามลำดับที่พบ) — ผู้เสิร์ฟใช้ดึงรูปจากถังก่อนแปลง token */
export function surveyReportImageShas(html) {
  return [...new Set([...String(html ?? '').matchAll(IMAGE_TOKEN_RE)].map((m) => m[1]))];
}

/* ── CSS ────────────────────────────────────────────────────────────────────────────────────
   ย้ายจากกระดานแบบคำต่อคำ (`.frame` → `.surveyReport .sheet`) · ที่มาของแต่ละก้อน:
     เปลือกกระดาษ        R-C-1:36-192   (ตัดการ์ดสรุป `.stats` กับรายการ `.bul`)
     หน้ารายพื้นที่       R-C-2:276-325  (ตัดหมุดบนผัง `.pin`)
     การรับรองผล         R-C-4:204-217
     ── ก้อนฉบับภายใน ──
     แถบ + ตาราง kv      R-C-1:53-57,152-156 (อยู่ในเปลือกของกระดาน แต่มีแค่ฉบับภายในที่ใช้)
     แผงภายใน            R-I-1:196-214,230
     การ์ดจุด             R-C-2:313-318
     ภาคผนวก             R-I-2:199-219  (ตัด `.scope`)
   ที่ต่างจากกระดานโดยตั้งใจ:
     · padding ซ้าย/ขวาเป็น `calc((210mm − 702px) / 2)` (≈45.85px) แทน 46px — กระดานวาดบนกรอบ 794px แต่แผ่นจริงกว้าง
       210mm = 793.70px (ขนาดของเปลือก · @page A4) ⇒ ถ้าคง 46px คอลัมน์เนื้อหาเหลือ 701.7px แล้วชื่อพื้นที่ที่กระดานลงพอดี
       บรรทัด ("…และสนามเทนนิส · ชั้น GF" ในช่อง 128px ของตารางหน้า 1 ฉบับภายใน) ตกเป็นสามบรรทัด — วัดเจอจริงใน harness
       ตรึงคอลัมน์ไว้ที่ 702px เท่ากระดาน แล้วให้ขอบกระดาษรับส่วนต่าง 0.15px ต่อข้างแทน
     · `--accent` อ่านจาก `--doc-accent` ของเปลือก — สีชื่อเอกสารเดินตามฉบับ (`surveyReportAccentKey` · มติเจ้าของ 08/10/2026)
       กระดานวาด teal ทั้งสองฉบับ: ฉบับลูกค้าพิมพ์สีใบเสนอราคา ฉบับภายในพิมพ์สีใบสั่งขายแทน · ใช้ที่ชื่อเอกสารหน้า 1 ที่เดียว
     · ขนาดกล่องรูป 226×170 เป็นคลาส `.shot` แทน style ในแท็ก (กระดานเขียน inline ทุกกล่อง)
     · `.no` (คอลัมน์ # ของตาราง) ลด padding ซ้ายขวาเหลือ 2px และห้ามตัดบรรทัด — คอลัมน์กว้าง 26–30px ของกระดานมีที่ให้ตัวเลข
       แค่ 10–14px (กระดานมีแต่เลขหลักเดียว) ⇒ พื้นที่ที่ 10 ขึ้นไปตกเป็นสองบรรทัด "1/0" — วัดเจอจริงในชุดสุดขอบของ harness
       เลขหลักเดียวอยู่ตำแหน่งเดิมทุกพิกเซล (จัดกลางในช่องกว้างเท่าเดิม)
     · `tr.tot` เจาะจงขึ้นหนึ่งขั้น (`tbody tr.tot`) — กฎแถวคู่ของกระดานชนะแถวรวมเมื่อแถวรวมตกแถวคู่ (กระดานมีแต่แถวคี่)
     · `.cont-in` = บรรทัด "ต่อหน้า n · …" ใต้ตารางหน้า 1 (กระดานบรรยายไว้ใน R-C-1:297-299 ไม่ได้วาด)
     · `.content.i1` (ช่องไฟ 12 ของหน้า 1 ฉบับภายใน) กับ `.tnote` เป็นคลาส แทน style ในแท็กของ R-I-1:269,431
     · `.ln` (หนึ่งบรรทัดต่อหนึ่งค่า) ใช้ในตาราง kv ด้วย แทน `<span style="display:block">` ของ R-I-3:273-275
     · `.zs-plan.none` / `.zp-plan.none` = พื้นที่ที่ไม่มีภาพผัง (โหมดร่าง — ด่านตรึงบังคับผัง): กล่อง "ไม่มีผัง" เตี้ย 80 ไม่ยืด
       (กระดานมีผังทุกพื้นที่ · กรอบว่างที่ยืดเต็มหน้า ~600px อ่านเป็นหน้าพัง)
     · รูปในกล่อง 226×170: `cover` เฉพาะรูปที่สัดส่วนใกล้ 4:3 แนวนอน (ตัดขอบไม่เกิน ~12%) นอกนั้น `contain` บนพื้นอ่อน —
       รูปแนวตั้งที่ถูก `cover` เสียบนล่างรวม 43% (จุดติดตั้งหลุดเฟรมได้) · ตัวเรนเดอร์เลือกคลาสจาก w/h ของรูปในภาพนิ่ง */
const BOARD_CSS = `
.frame{
  --navy:#1f3551; --text:#202833; --muted:#647080; --line:#cfd5da;
  --line-strong:#9da8b1; --soft:#f7f8f9; --subtle:#fafafa; --accent:var(--doc-accent);
  position:relative; box-sizing:border-box; display:flex; flex-direction:column;
  overflow:hidden; padding:44px calc((210mm - 702px) / 2) 40px; background:#fff; color:var(--text);
  font-size:12.5px; line-height:1.6; font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;
}
.frame *, .frame *::before, .frame *::after{box-sizing:border-box;}
.frame p, .frame ul, .frame ol, .frame dl, .frame dd, .frame figure,
.frame h1, .frame h2, .frame h3, .frame h4{margin:0; padding:0;}
.frame .content{flex:1; min-height:0; display:flex; flex-direction:column; gap:16px; padding-top:16px;}
.frame .muted{color:var(--muted);}
.frame .nw{white-space:nowrap;}
.frame .ln{display:block;}

.frame .dh{flex:none; display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:30px; padding-bottom:12px; border-bottom:1.3px solid var(--navy);}
.frame .dh-brand{min-width:0;}
.frame .dh-brand img{display:block; width:150px; height:auto;}
.frame .dh-co{margin-top:8px; font-size:12.5px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .dh-line{font-size:12px; line-height:1.5; color:var(--muted);}
.frame .dh-id{text-align:right;}
.frame .dh-form{font-size:12px; font-weight:500; line-height:1.5; color:var(--muted);}
.frame .dh-title{margin-top:8px; font-size:24px; font-weight:700; line-height:1.4; color:var(--accent);}
.frame .dh-en{font-size:12px; font-weight:600; letter-spacing:.08em; line-height:1.5; color:var(--muted);}
.frame .dh-meta{margin-top:6px; display:grid; grid-template-columns:96px 1fr; row-gap:1px; align-items:baseline;}
.frame .dh-meta dt{font-size:12px; line-height:1.6; color:var(--muted); text-align:left;}
.frame .dh-meta dd{font-size:12.5px; font-weight:600; line-height:1.6; text-align:right; white-space:nowrap;}
.frame .dh-meta dd.dh-no{font-size:13px; font-weight:700; color:var(--navy); font-variant-numeric:tabular-nums;}

.frame .rh{flex:none; display:flex; align-items:center; gap:12px; padding-bottom:8px; border-bottom:1px solid var(--line-strong);}
.frame .rh img{display:block; width:84px; height:auto;}
.frame .rh-t{font-size:13px; font-weight:700; line-height:1.5; color:var(--navy); white-space:nowrap;}
.frame .rh-t span{font-size:12px; font-weight:500; color:var(--muted);}
.frame .rh-ref{margin-left:auto; font-size:12px; font-weight:600; line-height:1.5; color:var(--navy); white-space:nowrap;}

.frame .df{flex:none; display:grid; grid-template-columns:1fr auto auto; gap:24px; padding-top:6px; border-top:1px solid var(--line); font-size:12px; line-height:1.5; color:var(--muted);}
.frame .df b{font-weight:600; color:var(--navy);}
.frame .df .df-no{font-weight:600; color:var(--text); font-variant-numeric:tabular-nums;}

.frame .h{margin-bottom:8px; font-size:14px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .h span{font-size:12px; font-weight:500; color:var(--muted);}

.frame .party{display:grid; grid-template-columns:1.15fr .85fr; gap:12px;}
.frame .pbox{min-width:0; padding:10px 13px; background:var(--soft); border-left:2px solid var(--line-strong);}
.frame .pbox h2{margin-bottom:2px; font-size:12.5px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .pbox h2 span{font-size:12px; font-weight:500; color:var(--muted);}
.frame .pname{margin-bottom:4px; font-size:14px; font-weight:700; line-height:1.5;}
.frame .pdl{display:grid; grid-template-columns:104px 1fr; gap:2px 10px; align-items:baseline;}
.frame .pdl dt{font-size:12px; line-height:1.6; color:var(--muted);}
.frame .pdl dd{min-width:0; font-size:12.5px; line-height:1.6;}
.frame .pdl.dt84{grid-template-columns:84px 1fr;}

.frame table.t{width:100%; border-collapse:collapse; table-layout:fixed;}
.frame table.t th{padding:6px 8px; background:var(--navy); color:#fff; font-size:12px; font-weight:600; line-height:1.5; text-align:left; vertical-align:bottom;}
.frame table.t td{padding:7px 8px; border-bottom:1px solid var(--line); font-size:12.5px; line-height:1.55; vertical-align:top; overflow-wrap:break-word;}
.frame table.t tbody tr:nth-child(even) td{background:var(--subtle);}
.frame table.t .num{text-align:right;}
.frame table.t td.num{white-space:nowrap;}
.frame table.t .ctr{text-align:center;}
.frame table.t .no{padding-left:2px; padding-right:2px; white-space:nowrap;}
.frame table.t tbody tr.tot td{background:var(--soft); font-weight:600; border-top:1.3px solid var(--navy);}
.frame table.t tr:has(+ tr.tot) td{border-bottom:1.3px solid var(--navy);}
.frame table.t td.empty{text-align:center; color:var(--muted);}
.frame .ent-code{display:block; font-size:12px; font-weight:600; line-height:1.5; color:var(--muted);}
.frame .ent-name{display:block;}
.frame .dim{display:block; white-space:nowrap;}
.frame .dim-k{color:var(--muted);}
.frame .cont-in{margin-top:6px; text-align:right; font-size:12px; line-height:1.5; color:var(--muted);}

.frame .chip-n{flex:none; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--navy); color:#fff; font-size:12px; font-weight:700; line-height:1.5;}

.frame .note{padding:6px 10px; background:var(--subtle); border-left:2px solid var(--line-strong); font-size:12.5px; line-height:1.6;}
.frame .note b{font-weight:600;}

.frame .ph{min-width:0;}
.frame .ph-box{display:flex; align-items:center; justify-content:center; background:var(--soft); border:1px solid var(--line); border-radius:4px;}
.frame .ph-box.shot{width:226px; height:170px;}
.frame .ph figcaption{margin-top:4px; font-size:12px; line-height:1.5; color:var(--muted);}
.frame .ph-none{font-size:12px; line-height:1.5; color:var(--muted);}

.frame .sig-grid{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px;}
.frame .sig{min-height:124px; padding:8px 10px; border:1px solid var(--line-strong); text-align:center; display:flex; flex-direction:column; gap:2px;}
.frame .sig.su-signed{background:var(--soft);}
.frame .sig h4{font-size:12.5px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .sig-role{font-size:12px; line-height:1.5; color:var(--muted);}
.frame .sig-e{margin:10px 0 4px; font-size:12px; font-style:italic; line-height:1.5; color:var(--muted);}
.frame .sig-name{font-size:12.5px; font-weight:700; line-height:1.5;}
.frame .sig-date{font-size:12px; line-height:1.5; color:var(--muted);}
.frame .sig-ln{display:inline-block; width:150px; height:18px; border-bottom:1px solid var(--line-strong);}
.frame .sig-d{display:inline-block; width:26px; height:18px; border-bottom:1px solid var(--line-strong);}
.frame .sig-d.y{width:44px;}

.frame .zpage{flex:1; min-height:0; display:flex; flex-direction:column;}
.frame .zp{flex:1; min-height:0; display:flex; flex-direction:column; gap:12px;}
.frame .zh{display:flex; align-items:baseline; gap:10px; padding-bottom:6px; border-bottom:1.3px solid var(--navy);}
.frame .zh .chip-n{align-self:center;}
.frame .zh-t{min-width:0; font-size:16px; font-weight:700; line-height:1.5; color:var(--text);}
.frame .zh-c{flex:none; font-size:12px; font-weight:600; line-height:1.5; color:var(--muted);}
.frame .zh-m{flex:none; margin-left:auto; font-size:13px; font-weight:700; line-height:1.5; color:var(--navy); white-space:nowrap;}
.frame .zh-d{font-weight:600; color:var(--text);}
.frame .zs{display:flex; flex-direction:column;}
.frame .zs-h{margin:0 0 8px; padding:0 0 3px; border-bottom:1px solid var(--line); font-size:12.5px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .zs-h span{font-size:12px; font-weight:500; color:var(--muted);}
.frame .zs-grid{display:grid; grid-template-columns:repeat(3,226px); gap:10px 12px;}
.frame .ph-box > img{display:block; width:100%; height:100%; object-fit:contain; border-radius:3px;}
.frame .ph-box.cover > img{object-fit:cover; object-position:center;}
.frame .zs.zs-plan{flex:1; min-height:0;}
.frame .zs-plan > .ph, .frame .zp-plan-row > .ph{flex:1; min-height:0; display:flex; flex-direction:column;}
.frame .zp-plan-row{flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 262px; gap:12px;}
.frame .zp-plan-row > table{align-self:start;}
.frame .ph-box.zp-plan{position:relative; flex:1; min-height:240px; background:#fff; border-color:var(--line-strong);}
.frame .ph-box.zp-plan > img{position:absolute; top:8px; left:8px; width:calc(100% - 16px); height:calc(100% - 16px); object-fit:contain; border-radius:0;}
.frame .zs.zs-plan.none{flex:none;}
.frame .zs-plan.none > .ph, .frame .zs-plan.none .zp-plan-row > .ph{flex:none;}
.frame .zs-plan.none .zp-plan-row{flex:none; align-items:start;}
.frame .ph-box.zp-plan.none{flex:none; min-height:0; height:80px; background:var(--soft); border-color:var(--line);}
.frame table.t.cp th{padding:5px 8px;}
.frame table.t.cp td{padding:4px 8px;}
.frame .cont{margin-top:auto; margin-bottom:10px; text-align:right; font-size:12px; line-height:1.5; color:var(--muted);}

.frame .signoff{margin-top:auto; margin-bottom:10px;}
.frame .signoff .sig{min-height:188px; padding:10px 12px;}
.frame .sig.su-signed .sig-e{margin-top:auto;}
.frame .sig-form{margin-top:auto; padding-top:24px; display:grid; grid-template-columns:max-content 130px max-content; column-gap:4px; row-gap:12px; justify-content:center; align-items:end; font-size:12px; line-height:1.5;}
.frame .sig-form .lb{justify-self:end;}
.frame .sig-form .dt{display:flex; align-items:flex-end; gap:4px;}
.frame .sig-form .sig-ln{width:130px;}
`;

const BOARD_INTERNAL_CSS = `
.frame .band{flex:none; height:30px; display:flex; align-items:center; gap:8px; padding:0 12px; margin-bottom:10px; border-radius:3px; background:var(--navy); color:#fff;}
.frame .band svg{flex:none; display:block;}
.frame .band-t{font-size:12.5px; font-weight:700; line-height:1.5;}
.frame .band-r{margin-left:auto; font-size:12px; font-weight:500; line-height:1.5; color:rgba(255,255,255,.85);}

.frame .su-lead{padding-bottom:4px; border-bottom:1.3px solid var(--navy); font-size:16px; font-weight:700; line-height:1.5; color:var(--navy);}
.frame .su-lead span{font-size:12px; font-weight:500; color:var(--muted);}
.frame .intro{font-size:12.5px; line-height:1.6;}
.frame .intro b{font-weight:600; color:var(--navy);}
.frame .intro.tnote{margin-top:8px;}

.frame table.kv{width:100%; border-collapse:collapse; table-layout:fixed;}
.frame table.kv th, .frame table.kv td{padding:6px 10px; border:1px solid var(--line); line-height:1.55; text-align:left; vertical-align:top;}
.frame table.kv th{width:166px; background:var(--soft); color:var(--navy); font-size:12px; font-weight:600;}
.frame table.kv td{font-size:12.5px; overflow-wrap:break-word;}

.frame .content.i1{gap:12px; padding-top:12px;}
.frame .content.i1 .h{margin-bottom:6px;}
.frame .ipanel{padding:10px 13px; background:#fff; border:1px solid var(--line-strong); border-left:3px solid var(--navy);}
.frame .igrid{display:grid; grid-template-columns:104px minmax(0,1fr) 88px 190px; gap:2px 10px; align-items:baseline;}
.frame .igrid dt{font-size:12px; line-height:1.6; color:var(--muted);}
.frame .igrid dt.r{padding-left:8px;}
.frame .igrid dd{min-width:0; font-size:12.5px; line-height:1.6; overflow-wrap:break-word;}
.frame .istrip{display:flex; flex-wrap:wrap; align-items:center; gap:0 6px; margin-top:6px; padding-top:6px; border-top:1px solid var(--line); font-size:12.5px; line-height:1.6;}
.frame .istrip svg{flex:none; display:block;}
.frame .istrip b{font-weight:600; color:var(--navy);}

.frame .sp .ph-box{position:relative;}
.frame .sp-b{position:absolute; z-index:1; top:8px; left:8px; min-width:32px; height:24px; padding:0 7px; border-radius:12px; background:var(--navy); box-shadow:0 0 0 2px #fff; color:#fff; font-size:12px; font-weight:700; line-height:24px; text-align:center; white-space:nowrap;}
.frame .sp figcaption{margin-top:4px; font-size:12.5px; font-weight:600; line-height:1.5; color:var(--text);}
.frame .sp figcaption b{font-weight:700; color:var(--navy);}
.frame .sp-note{display:block; font-size:12px; font-weight:400; line-height:1.5; color:var(--muted);}

.frame .leadrow{display:flex; align-items:baseline; gap:16px; padding-bottom:4px; border-bottom:1.3px solid var(--navy);}
.frame .leadrow .su-lead{padding-bottom:0; border-bottom:0;}
.frame .lead-ref{margin-left:auto; font-size:12px; line-height:1.5; color:var(--muted); white-space:nowrap;}
.frame .lead-ref b{font-weight:600; color:var(--text);}
.frame .hrow{display:flex; align-items:baseline; gap:16px; margin-bottom:8px;}
.frame .hrow .h{margin-bottom:0;}
.frame .hmeta{margin-left:auto; font-size:12px; line-height:1.5; color:var(--muted); white-space:nowrap;}
.frame .hmeta b{font-weight:600; color:var(--text);}
.frame .count{margin-left:auto; font-size:12.5px; font-weight:600; line-height:1.6; white-space:nowrap;}
.frame .fn{margin-top:4px; font-size:12px; line-height:1.5; color:var(--muted);}
.frame .sig-wait{font-size:12px; line-height:1.5; color:var(--muted);}
.frame .sig-sp{flex:none; height:18px; margin:10px 0 4px;}
.frame .sign-last{margin-top:auto; margin-bottom:10px;}
`;

const scoped = (css) => css.replace(/\.frame/g, '.surveyReport .sheet');

/** CSS ของกระดาษที่สองฉบับใช้ร่วมกัน — ฝังต่อจาก CSS ของเปลือก (`renderDocumentHTML({ extraCss })`) */
export const SURVEY_REPORT_CSS = scoped(BOARD_CSS);
/** CSS ที่มีแค่ฉบับภายในใช้ — ไม่ฝังลงฉบับลูกค้า */
export const SURVEY_REPORT_INTERNAL_CSS = scoped(BOARD_INTERNAL_CSS);

/* ── ชิ้นข้อความ ──────────────────────────────────────────────────────────────────────────── */

const DASH = '—';
const TITLE_TH = 'รายงานการประเมินพื้นที่';
const TITLE_EN = 'SITE SURVEY REPORT';
const CONT_TH = ' (ต่อ)';
const CONT_EN = ' (CONT.)';

const list = (v) => (Array.isArray(v) ? v : []);
const nw = (html) => `<span class="nw">${html}</span>`;
const slice = (rows, r) => (r ? list(rows).slice(r.from, r.to) : []);

/**
 * ข้อความที่ท่อนท้ายต้องไม่ถูกทิ้งไว้ครึ่งเดียวบนบรรทัดใหม่ — กติกาเดียวกับที่กระดานเขียน `<span class="nw">` ด้วยมือ:
 *   · วงเล็บปิดท้าย           "12:00 น. (ตามนัด)" → "(ตามนัด)" ไม่ตัดกลาง
 *   · ท่อนสุดท้ายหลัง " · "   "… · ทีม SV · ส่ง 23/09/2026" → "· ส่ง 23/09/2026" ลงบรรทัดใหม่ทั้งท่อน
 * ท่อนท้ายที่ยาวเกิน `TAIL_MAX` ไม่ห่อ (ห่อแล้วจะล้นกล่องแคบแทนที่จะตัดบรรทัด — กล่องแคบสุดที่ใช้คือ 134px)
 */
const TAIL_MAX = 24;
function soft(value) {
  const text = String(value ?? '');
  const paren = text.match(/^(.*\S)\s+(\([^()]+\))$/);
  if (paren && paren[2].length <= TAIL_MAX) return `${esc(paren[1])} ${nw(esc(paren[2]))}`;
  const cut = text.lastIndexOf(' · ');
  if (cut > 0 && text.length - cut - 3 <= TAIL_MAX) return `${esc(text.slice(0, cut))} ${nw(`· ${esc(text.slice(cut + 3))}`)}`;
  return esc(text);
}

/** "1 พื้นที่ · 0 ตร.ม. · 0 แพ็คเกจ" — ท่อนสุดท้ายไม่ตัดกลาง โดยจุดคั่นค้างอยู่ท้ายบรรทัดบน (ช่องยอดก่อนหน้า · R-I-2:434) */
function tailNw(value) {
  const text = String(value ?? '');
  const cut = text.lastIndexOf(' · ');
  return cut > 0 && text.length - cut - 3 <= TAIL_MAX ? `${esc(text.slice(0, cut))} · ${nw(esc(text.slice(cut + 3)))}` : esc(text);
}

/** ที่อยู่ — คำสุดท้ายกับรหัสไปรษณีย์ไปด้วยกัน ("… กรุงเทพมหานคร 10250" · R-C-1:233) เลขไม่ตกบรรทัดเดียว */
function addressHtml(value) {
  const text = String(value ?? '');
  const zip = text.match(/^(.*\S)\s+(\S+\s+\d{5})$/);
  return zip && zip[2].length <= TAIL_MAX + 8 ? `${esc(zip[1])} ${nw(esc(zip[2]))}` : esc(text);
}

/** "25/09/2026 00:08" — เวลาไม่ตัดกลาง (คอลัมน์วันเวลาแคบ ลงสองบรรทัดเสมอ · R-I-2:430) */
const stampHtml = (value) => esc(value).replace(/ (\d{2}:\d{2})$/, (m, time) => ` ${nw(time)}`);

/** คำสุดท้าย (หลังช่องว่างตัวท้าย) ไม่ตัดกลาง — คำบรรยายใต้ชื่อที่นั่งลูกค้า (R-C-4:280) */
function lastWordNw(value) {
  const text = String(value ?? '');
  const cut = text.lastIndexOf(' ');
  return cut > 0 ? `${esc(text.slice(0, cut))} ${nw(esc(text.slice(cut + 1)))}` : esc(text);
}

/**
 * ช่อง "ขนาดแพ็ค" ของแถวรวม ("SM 1 · ST 1") — **แผนหน้าเป็นคนตัดบรรทัด** (`page.mix` / `block.mix` · `surveyReportMixLines`)
 * ที่นี่พิมพ์ทีละบรรทัดแบบห้ามตัด ⇒ ความสูงของแถวรวมเท่ากับที่แผนนับเสมอ · ตัวคั่น "·" ค้างท้ายบรรทัดบน
 * ไม่มีบรรทัดจากแผน (ผู้เรียกเก่า/แผนที่ไม่มีแถวรวม) = บรรทัดเดียวห้ามตัด
 */
const mixHtml = (mixLines, fallback) => {
  const rows = list(mixLines).length ? list(mixLines) : [String(fallback ?? DASH)];
  return rows.length > 1 ? rows.map((line) => `<span class="ln nw">${esc(line)}</span>`).join('') : nw(esc(rows[0]));
};

/** เชิงอรรถของภาคผนวก ก — บรรทัดจากแผน (`block.foot`) พิมพ์ทีละบรรทัดแบบห้ามตัด · ไม่มีบรรทัดจากแผน = ตัดได้เฉพาะหลังตัวคั่น */
const footHtml = (footLines, values) => {
  if (list(footLines).length) return list(footLines).map((line) => `<span class="ln nw">${esc(line)}</span>`).join('');
  const parts = list(values).flatMap((value) => String(value ?? '').split(' · ')).filter(Boolean);
  return parts.map((part, i) => nw(`${esc(part)}${i + 1 < parts.length ? ' ·' : ''}`)).join(' ');
};

/** ท่อนของข้อความยาวที่แผนหน้าแบ่งข้ามหน้า — `skip` = เริ่มที่ตัวอักษรนี้ · `stop` = จบที่ตัวอักษรนี้ (ไม่มี = ทั้งข้อความ) */
const cutText = (value, skip, stop) => {
  const text = String(value ?? '');
  return skip || stop ? text.slice(skip || 0, stop || undefined).trim() : text;
};

const lines = (values) => {
  const rows = list(values);
  return rows.length > 1 ? rows.map((line) => `<span class="ln">${soft(line)}</span>`).join('') : soft(rows[0] ?? DASH);
};

const heading = (th, en, { cont = false } = {}) => (
  `<h3 class="h">${esc(th)}${cont ? CONT_TH : ''}<span> / ${esc(en)}${cont ? CONT_EN : ''}</span></h3>`
);

/** รหัสบน · ชื่อล่าง — ชั้นเกาะคำสุดท้ายของชื่อ (ชื่อยาวตัดในชื่อ ไม่ทิ้ง "GF" ไว้บรรทัดเดียว · R-C-1:286-288) */
const entity = (row) => (
  `<span class="ent-code">${esc(row.zoneCode)}</span><span class="ent-name">${esc(row.name)}`
  + `${row.floorText ? nw(`&nbsp;${esc(row.floorText)}`) : ''}</span>`
);

const th = (col) => (
  `<th${col.cls ? ` class="${col.cls}"` : ''}${col.w ? ` style="width:${col.w}px;"` : ''}>${col.html ?? esc(col.label)}</th>`
);
const thead = (cols) => `<thead><tr>${cols.map(th).join('')}</tr></thead>`;

/* ── ส่วนของแผ่น ──────────────────────────────────────────────────────────────────────────── */

const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1f3551" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';

function bandHtml(ctx) {
  const band = ctx.view.band;
  if (!band) return '';
  return `<div class="band">${LOCK_ICON}<span class="band-t">${esc(band.title)}</span><span class="band-r">${esc(band.right)}</span></div>`;
}

function firstHeader(ctx) {
  const { view } = ctx;
  const head = view.head || {};
  return `
      <header class="dh">
        <div class="dh-brand">
          <img src="${SYSTEM_DOCUMENT_LOGO_URL}" alt="Scent &amp; Sense">
          <div class="dh-co">${esc(head.company?.name)}</div>
          ${list(head.company?.lines).map((line) => `<div class="dh-line">${esc(line)}</div>`).join('\n          ')}
        </div>
        <div class="dh-id">
          <div class="dh-form">${esc(head.form?.line)}</div>
          <h1 class="dh-title">${TITLE_TH}</h1>
          <div class="dh-en">${TITLE_EN}</div>
          <dl class="dh-meta">
            <dt>เลขที่</dt><dd class="dh-no">${esc(ctx.docNo)}</dd>
            <dt>วันที่ประเมิน</dt><dd>${esc(head.surveyDate)}</dd>
            <dt>วันที่ออก</dt><dd>${esc(ctx.issuedText)}</dd>
          </dl>
        </div>
      </header>`;
}

/* หัววิ่งของหน้า 2 เป็นต้นไป — ขวามือมีแค่เลขที่เอกสาร (มติ 29/09: ไม่มีชื่อลูกค้า ไม่มีเลขคำร้อง) */
function runningHeader(ctx) {
  return `
      <header class="rh">
        <img src="${SYSTEM_DOCUMENT_LOGO_URL}" alt="Scent &amp; Sense">
        <div class="rh-t">${TITLE_TH}<span> · ${TITLE_EN}</span></div>
        <div class="rh-ref">${esc(ctx.docNo)}</div>
      </header>`;
}

function footerHtml(ctx, page) {
  const { view } = ctx;
  const pageText = `หน้า ${page.no} / ${ctx.layout.pageCount}`;
  return `
      <footer class="df">
        <span>${esc(view.head?.company?.name)}</span>
        <span>${esc(view.head?.form?.line)} · เลขที่ <span class="df-no">${esc(ctx.docNo)}</span></span>
        <span>${ctx.footMark ? `<b>${esc(ctx.footMark)}</b> · ` : ''}${pageText}</span>
      </footer>`;
}

/* ── หน้า 1 (และหน้าต่อของตาราง) ─────────────────────────────────────────────────────────── */

function partyHtml(view) {
  const p = view.party || {};
  const s = view.survey || {};
  return `
        <section class="party">
          <div class="pbox">
            <h2>ลูกค้าและสถานที่<span> / CUSTOMER &amp; SITE</span></h2>
            <div class="pname">${esc(p.customerName)}</div>
            <dl class="pdl">
              <dt>สถานที่</dt><dd>${esc(p.siteName)}</dd>
              <dt>รหัสไซต์</dt><dd>${esc(p.siteCode)}</dd>
              <dt>ที่อยู่</dt><dd>${addressHtml(p.address)}</dd>
              <dt>ผู้ติดต่อหน้างาน</dt><dd>${esc(p.contact)}</dd>
            </dl>
          </div>
          <div class="pbox">
            <h2>การประเมิน<span> / SURVEY</span></h2>
            <dl class="pdl dt84">
              <dt>วันที่</dt><dd>${esc(s.dateText)}</dd>
              <dt>เวลา</dt><dd>${soft(s.timeText)}</dd>
              <dt>ผู้ประเมิน</dt><dd>${esc(s.assessorName)}</dd>
            </dl>
          </div>
        </section>`;
}

function panelHtml(view) {
  const panel = view.panel;
  if (!panel) return '';
  const rows = list(panel.rows).map((row) => (
    `<dt>${esc(row.label)}</dt><dd>${lines(row.lines)}</dd>`
    + `<dt class="r">${esc(row.rlabel)}</dt><dd>${lines(row.rlines)}</dd>`
  )).join('\n              ');
  const sent = panel.sentLine
    ? `<div class="istrip">${CHECK_ICON}<b>${esc(panel.sentLine.lead)}</b><span class="muted">· ${esc(panel.sentLine.text)}</span></div>`
    : '';
  return `
        <section>
          ${heading('ข้อมูลภายใน', 'INTERNAL')}
          <div class="ipanel">
            <dl class="igrid">
              ${rows}
            </dl>
            ${sent}
          </div>
        </section>`;
}

/* คอลัมน์ของตารางหน้า 1 — ความกว้างตามกระดาน (R-C-1:279-285 · R-I-1:216-226)
   🔴 คอลัมน์จุดเกิดได้ทางเดียว: view มี `table.spotNote` (ฉบับภายในเท่านั้น) — ป้ายหัวคอลัมน์ก็อ่านจากตรงนั้น */
function summaryColumns(view) {
  const spotLabel = view.table?.spotNote?.lead || null;
  const w = spotLabel ? { dims: 124, sqm: 64, cbm: 64 } : { dims: 132, sqm: 70, cbm: 76 };
  return {
    spots: Boolean(spotLabel),
    cols: [
      { cls: 'ctr no', w: 30, label: '#' },
      { label: 'พื้นที่' },
      { w: w.dims, label: 'ขนาด ก × ย × ส (ม.)' },
      { cls: 'num', w: w.sqm, label: 'ตร.ม.' },
      { cls: 'num', w: w.cbm, label: 'ลบ.ม.' },
      ...(spotLabel ? [{ cls: 'num', w: 80, label: spotLabel }] : []),
      { cls: 'ctr', w: 80, label: 'ขนาดแพ็ค' },
      { cls: 'num', w: 72, label: 'แพ็ค/เดือน' },
      { cls: 'ctr', w: 44, label: 'หน้า' },
    ],
  };
}

const dimsHtml = (dims) => {
  const parts = list(dims);
  if (parts.length <= 1) return esc(parts[0]?.text ?? DASH);
  return parts.map((d) => `<span class="dim"><span class="dim-k">${esc(d.key)}</span> ${esc(d.text)}</span>`).join('');
};

function summarySection(ctx, page, { cont }) {
  const { view, layout } = ctx;
  // หน้า 1 ที่แถวแรกไม่พอ (แผน `table: false`) — ไม่พิมพ์หัวข้อกับหัวตารางเปล่า ตารางเริ่มหน้าถัดไปทั้งตาราง
  if (page.table === false) return '';
  const { cols, spots } = summaryColumns(view);
  const rows = slice(view.table?.rows, page.rows).map((row) => `
              <tr>
                <td class="ctr no">${esc(row.no)}</td>
                <td>${entity(row)}</td>
                <td>${dimsHtml(row.dims)}</td>
                <td class="num">${esc(row.sqm)}</td>
                <td class="num">${esc(row.cbm)}</td>${spots ? `
                <td class="num">${esc(row.spots)}</td>` : ''}
                <td class="ctr">${esc(row.size)}</td>
                <td class="num">${esc(row.qty)}</td>
                <td class="ctr">${esc(layout.zonePage?.[row.no] ?? DASH)}</td>
              </tr>`).join('');
  const t = view.table?.total || {};
  const total = page.total ? `
              <tr class="tot">
                <td colspan="2">${esc(t.label)}</td>
                <td></td>
                <td class="num">${esc(t.sqm)}</td>
                <td class="num">${esc(t.cbm)}</td>${spots ? `
                <td class="num">${esc(t.spots)}</td>` : ''}
                <td class="ctr">${mixHtml(page.mix, t.sizeMix)}</td>
                <td class="num">${esc(t.qty)}</td>
                <td></td>
              </tr>` : '';
  const note = page.spotNote && view.table?.spotNote
    ? `\n          <p class="intro tnote"><b>${esc(view.table.spotNote.lead)}</b> ${esc(view.table.spotNote.text)}</p>`
    : '';
  const contLine = page.cont ? `\n          <p class="cont-in">${esc(page.cont.text)}</p>` : '';
  return `
        <section>
          ${heading('1. พื้นที่ที่ประเมินและข้อเสนอ', 'ZONES & RECOMMENDATION', { cont })}
          <table class="t" data-m="table">
            ${thead(cols)}
            <tbody>${rows}${total}
            </tbody>
          </table>${note}${contLine}
        </section>`;
}

/* ── หน้ารายพื้นที่ ───────────────────────────────────────────────────────────────────────── */

/* กล่องรูป 226×170 (สัดส่วน 1.33) — เติมเต็มกล่อง (`cover`) เฉพาะรูปแนวนอนที่สัดส่วนใกล้ 4:3: ตัดขอบไม่เกิน ~12%
   (1.17–1.51 · 4:3 = 1.33 · 3:2 = 1.5) · รูปแนวตั้ง จัตุรัส 16:9 หรือรูปที่ไม่รู้ขนาด = `contain` (เห็นครบทั้งรูปบนพื้นอ่อน)
   🐞 เดิม `cover` ทุกรูป: รูปจุดที่ถ่ายแนวตั้ง 1051×1400 เหลือแค่ 57% ของความสูง — ตัวจุดติดตั้งหลุดเฟรมได้ */
const COVER_RATIO = Object.freeze({ min: 1.17, max: 1.51 });
function fillsBox(img) {
  const w = Number(img?.w);
  const h = Number(img?.h);
  if (!(w > 0) || !(h > 0)) return false;
  return w / h >= COVER_RATIO.min && w / h <= COVER_RATIO.max;
}

function shotBox(ctx, img, alt, { empty, badge = '' }) {
  const src = img ? ctx.imageSrc(img) : null;
  return src
    ? `<div class="ph-box${fillsBox(img) ? ' cover' : ''} shot"><img src="${esc(src)}" alt="${esc(alt)}">${badge}</div>`
    : `<div class="ph-box shot"><span class="ph-none">${esc(empty)}</span>${badge}</div>`;
}

function wideSection(ctx, zone, range) {
  const photos = slice(zone.wide, range);
  const cells = photos.length
    ? photos.map((photo) => `
              <figure class="ph">
                ${shotBox(ctx, photo.img, photo.caption, { empty: 'ไม่มีภาพ' })}
                <figcaption>${esc(photo.caption)}</figcaption>
              </figure>`).join('')
    : `
              ${shotBox(ctx, null, '', { empty: 'ไม่มีภาพกว้าง' })}`;
  return `
            <section class="zs">
              <h5 class="zs-h">ภาพกว้าง<span> / WIDE PHOTOS</span></h5>
              <div class="zs-grid">${cells}
              </div>
            </section>`;
}

function planSection(ctx, zone) {
  const src = zone.plan ? ctx.imageSrc(zone.plan) : null;
  /* ไม่มีภาพผังในภาพนิ่ง (โหมดร่าง) = กล่องเตี้ยไม่ยืด — แผนหน้าคิดความสูงแบบเดียวกัน (`zone.planNone`)
     ⚠️ ดูที่ `zone.plan` ไม่ใช่ `src`: ผังที่มีในภาพนิ่งแต่ยังไม่มี src (รูปยังไม่เตรียม) ยังจองที่เต็มตามแผน */
  const none = !zone.plan;
  const box = src
    ? `<div class="ph-box zp-plan" data-m="plan"><img src="${esc(src)}" alt="ผังพื้นที่ ${esc(zone.no)}"></div>`
    : `<div class="ph-box zp-plan${none ? ' none' : ''}" data-m="plan"><span class="ph-none">ไม่มีผัง</span></div>`;
  const figure = `<figure class="ph">${box}</figure>`;
  /* พื้นที่สองส่วนขึ้นไป: ตารางส่วนอยู่ขวาของผัง (R-C-2:418-435) — ผังคงความสูงเต็ม */
  const parts = zone.parts ? `
              <div class="zp-plan-row">
                ${figure}
                <table class="t cp">
                  <thead><tr><th style="width:62px;">ส่วน</th><th>ก × ย × ส (ม.)</th><th class="num" style="width:50px;">ตร.ม.</th><th class="num" style="width:54px;">ลบ.ม.</th></tr></thead>
                  <tbody>${list(zone.parts.rows).map((p) => `
                    <tr><td>${esc(p.name)}</td><td>${esc(p.dims)}</td><td class="num">${esc(p.sqm)}</td><td class="num">${esc(p.cbm)}</td></tr>`).join('')}
                    <tr class="tot"><td>รวม</td><td></td><td class="num">${esc(zone.parts.total?.sqm)}</td><td class="num">${esc(zone.parts.total?.cbm)}</td></tr>
                  </tbody>
                </table>
              </div>` : `
              ${figure}`;
  return `
            <section class="zs zs-plan${none ? ' none' : ''}">
              <h5 class="zs-h">ผังพื้นที่<span> / PLAN</span></h5>${parts}
            </section>`;
}

/* 🔴 ส่วนจุด — ฉบับภายในเท่านั้น: เรียกเมื่อแผนหน้ามีคีย์ `spots` (ฉบับลูกค้าไม่มีคีย์นี้) และป้ายหัวข้ออ่านจาก
   `view.table.spotNote.lead` (ฉบับลูกค้าไม่มี) — ขาดอย่างใดอย่างหนึ่ง = ไม่พิมพ์ */
function spotSection(ctx, zone, range) {
  const title = ctx.view.table?.spotNote?.lead;
  const spots = slice(zone.spots, range);
  if (!title || !spots.length) return '';
  const cards = spots.map((spot) => `
              <figure class="ph sp">
                ${shotBox(ctx, spot.img, `จุด ${spot.no} ${spot.label}`, { empty: 'ไม่มีภาพ', badge: `<span class="sp-b">${esc(spot.no)}</span>` })}
                <figcaption><b>${esc(spot.no)}</b> · ${esc(spot.label)}${spot.note ? `<span class="sp-note">${esc(spot.note)}</span>` : ''}</figcaption>
              </figure>`).join('');
  return `
            <section class="zs">
              <h5 class="zs-h">${esc(title)}<span> / POSSIBLE INSTALL SPOTS</span></h5>
              <div class="zs-grid">${cards}
              </div>
            </section>`;
}

function zoneContent(ctx, page) {
  const zone = ctx.view.zones[page.zoneIndex];
  const cont = page.kind === 'zoneCont';
  const size = zone.sizeLine || {};
  const meta = size.dims
    ? `<span class="zh-d">${esc(size.dims)}</span> · ${esc(size.totals)}`
    : esc(size.totals);
  /* ชื่อพื้นที่ + ท่อนท้ายที่ห้ามตัด ("· ชั้น 6" · "(ต่อ)") เกาะคำสุดท้ายของชื่อ — แบบเดียวกับช่องชื่อของตารางหน้า 1
     (เดิมเลขชั้นตกบรรทัดใหม่ตัวเดียว: "… · ชั้น" / "6 (ต่อ)") · แผนหน้านับความสูงหัวพื้นที่ด้วยข้อความรูปเดียวกัน */
  const named = zone.name != null;
  const tail = [named ? zone.floorText : '', cont ? CONT_TH.trim() : ''].filter(Boolean).join(' ');
  const title = `${esc(named ? zone.name : zone.title)}${tail ? nw(`&nbsp;${esc(tail)}`) : ''}`;
  return `
        <section class="zpage">
          ${heading('2. รายละเอียดรายพื้นที่', 'ZONE DETAILS', { cont: cont || !page.first })}
          <div class="zp" data-zone="${esc(zone.no)}">
            <div class="zh">
              <span class="chip-n">${esc(zone.no)}</span>
              <h4 class="zh-t">${title}</h4>
              <span class="zh-c">${esc(zone.zoneCode)}</span>
              <span class="zh-m">${meta}</span>
            </div>${page.wide ? wideSection(ctx, zone, page.wide) : ''}${page.plan ? planSection(ctx, zone) : ''}${page.spots ? spotSection(ctx, zone, page.spots) : ''}${page.note && zone.note ? `
            <p class="note"><b>หมายเหตุพื้นที่ — </b>${esc(zone.note)}</p>` : ''}
          </div>
        </section>`;
}

/* ── การรับรองผล ──────────────────────────────────────────────────────────────────────────── */

const signedSeat = (seat) => `
            <div class="sig su-signed">
              <h4>${esc(seat.title)}</h4>
              <div class="sig-role">${esc(seat.role)}</div>
              <div class="sig-e">${esc(seat.mark || 'ลายเซ็นอิเล็กทรอนิกส์')}</div>
              <div class="sig-name">${esc(seat.name)}</div>
              <div class="sig-date">${esc(seat.date)}</div>
            </div>`;

/* ที่นั่งลูกค้า: ลงชื่อ · (ชื่อตัวบรรจง) · วันที่ — เว้นว่างให้เขียน ไม่มีบรรทัดอื่น (มติ 29/09) */
function signoffContent(ctx) {
  const s = ctx.view.signoff || {};
  return `
        <section class="signoff" data-m="signoff">
          ${heading('การรับรองผลประเมิน', 'SIGN-OFF')}
          <div class="sig-grid">${signedSeat(s.assessor || {})}${signedSeat(s.approver || {})}
            <div class="sig">
              <h4>${esc(s.customer?.title)}</h4>
              <div class="sig-role">${lastWordNw(s.customer?.caption)}</div>
              <div class="sig-form">
                <span class="lb">ลงชื่อ</span><span class="sig-ln"></span><span></span>
                <span class="lb">(</span><span class="sig-ln"></span><span>)</span>
                <span class="lb">วันที่</span><span class="dt"><span class="sig-d"></span>/<span class="sig-d"></span>/<span class="sig-d y"></span></span><span></span>
              </div>
            </div>
          </div>
        </section>`;
}

/* ── ภาคผนวก (ฉบับภายใน) ─────────────────────────────────────────────────────────────────── */

const emptyRow = (colspan, text) => `
              <tr><td class="empty" colspan="${colspan}">${esc(text)}</td></tr>`;

function decisionsBlock(ap, block) {
  const d = ap.decisions;
  const cols = [
    { cls: 'ctr no', w: 26, label: '#' },
    { label: 'พื้นที่' },
    { cls: 'num', w: 58, label: 'ลบ.ม.' },
    { cls: 'num', w: 70, label: 'จุดที่เลือก' },
    { cls: 'ctr', w: 72, html: 'ขนาดที่<br>ระบบเสนอ' },
    { cls: 'ctr', w: 78, html: 'ขนาดแพ็ค<br>ที่เคาะ' },
    { cls: 'num', w: 72, html: 'แพ็ค/เดือน<br>ที่เคาะ' },
    { w: 160, label: 'เหตุผลที่ต่างจากที่ระบบเสนอ' },
  ];
  const rows = block.empty ? emptyRow(cols.length, 'ไม่มีพื้นที่ที่ประเมิน') : slice(d.rows, block.rows).map((row) => `
              <tr>
                <td class="ctr no">${esc(row.no)}</td>
                <td>${entity(row)}</td>
                <td class="num">${esc(row.cbm)}</td>
                <td class="num">${esc(row.spots)}</td>
                <td class="ctr">${esc(row.suggested)}</td>
                <td class="ctr">${esc(row.size)}</td>
                <td class="num">${esc(row.qty)}</td>
                <td>${esc(row.reason)}</td>
              </tr>`).join('');
  const t = d.total || {};
  const total = block.last && !block.empty ? `
              <tr class="tot">
                <td colspan="2">${esc(t.label)}</td>
                <td class="num">${esc(t.cbm)}</td>
                <td class="num">${esc(t.spots)}</td>
                <td class="ctr">${esc(t.suggested)}</td>
                <td class="ctr">${mixHtml(block.mix, t.sizeMix)}</td>
                <td class="num">${esc(t.qty)}</td>
                <td>${esc(t.reason)}</td>
              </tr>` : '';
  const foot = block.last && list(d.footnote).length
    ? `\n          <p class="fn">${footHtml(block.foot, d.footnote)}</p>`
    : '';
  return `
        <section>
          <div class="hrow">
            ${heading('ก. การเคาะผลของหัวหน้า', 'HEAD DECISIONS', { cont: block.continued })}${block.continued ? '' : `
            <p class="hmeta">ผู้เคาะและส่งผล: <b>${esc(d.by)}</b></p>`}
          </div>
          <table class="t">
            ${thead(cols)}
            <tbody>${rows}${total}
            </tbody>
          </table>${foot}
        </section>`;
}

function scopeBlock(ap, block) {
  const cols = [{ label: 'พื้นที่' }, { w: 100, label: 'สถานะ' }, { label: 'เหตุผลที่ตัด' }];
  const rows = block.empty
    ? emptyRow(cols.length, 'ไม่มีพื้นที่ที่ตัดออกหรือเพิ่มในรอบนี้')
    : slice(ap.scope.rows, block.rows).map((row) => `
              <tr><td>${entity(row)}</td><td>${esc(row.status)}</td><td>${esc(row.cutReason)}</td></tr>`).join('');
  return `
        <section>
          <div class="hrow">
            ${heading('ข. ขอบเขตเทียบคำร้อง', 'SCOPE vs REQUEST', { cont: block.continued })}${block.continued ? '' : `
            <p class="count">${esc(ap.scope.countLine)}</p>`}
          </div>
          <table class="t">
            ${thead(cols)}
            <tbody>${rows}
            </tbody>
          </table>
        </section>`;
}

function historyBlock(ap, block) {
  const cols = [
    { w: 110, label: 'วันเวลา' }, { w: 130, label: 'เหตุการณ์' }, { w: 120, label: 'ผู้ทำ' },
    { label: 'เหตุผล' }, { w: 150, label: 'ยอดก่อนหน้า' },
  ];
  const rows = block.empty
    ? emptyRow(cols.length, 'ไม่มีการตีกลับหรือดึงกลับ')
    : slice(ap.history, block.rows).map((row, k, all) => {
      /* เหตุผลที่ยาวเกินหน้าถูกแผนแบ่งข้ามหน้า: แถวแรกของบล็อกเริ่มที่ `skip` (ท่อนที่ต่อมา — เหลือ "เหตุการณ์ (ต่อ)" กับเหตุผล)
         แถวสุดท้ายจบที่ `stop` (ที่เหลือไปหน้าถัดไป) */
      const skip = k === 0 ? block.skip : 0;
      const stop = k === all.length - 1 ? block.stop : 0;
      const reason = esc(cutText(row.reason, skip, stop));
      return skip ? `
              <tr>
                <td></td>
                <td>${esc(row.event)}${CONT_TH}</td>
                <td></td>
                <td>${reason}</td>
                <td></td>
              </tr>` : `
              <tr>
                <td>${stampHtml(row.at)}</td>
                <td>${esc(row.event)}</td>
                <td>${esc(row.by)}</td>
                <td>${reason}</td>
                <td>${tailNw(row.totalsText)}</td>
              </tr>`;
    }).join('');
  return `
        <section>
          ${heading('ค. ประวัติตีกลับและดึงกลับ', 'SEND-BACK & RECALL', { cont: block.continued })}
          <table class="t">
            ${thead(cols)}
            <tbody>${rows}
            </tbody>
          </table>
        </section>`;
}

/* ง — ตาราง kv แบ่งระหว่าง "บรรทัดของแถว" ได้ (แผนหน้าบอกช่วงบรรทัดของแต่ละแถวบนหน้านี้) · แถวที่ต่อมาจากหน้าก่อนบอก "(ต่อ)" */
function notesBlock(ap, block) {
  const rows = list(block.rows).map((part) => {
    const row = ap.notes[part.index] || {};
    // บรรทัดที่ยาวเกินหน้าถูกแผนแบ่งกลางบรรทัด: `skip` ตัดหัวของบรรทัดแรก · `stop` ตัดท้ายของบรรทัดสุดท้าย
    const texts = slice(row.lines, part.lines).map((line, k, all) => (
      cutText(line, k === 0 ? part.skip : 0, k === all.length - 1 ? part.stop : 0)
    ));
    return `
              <tr><th>${soft(row.label)}${part.continued ? CONT_TH : ''}</th><td>${lines(texts)}</td></tr>`;
  }).join('');
  return `
        <section>
          ${heading('ง. หมายเหตุภายใน', 'INTERNAL NOTES', { cont: block.continued })}
          <table class="kv">
            <tbody>${rows}
            </tbody>
          </table>
        </section>`;
}

/* จ — ชิดล่างของหน้าสุดท้ายเสมอ (`.sign-last`) · ที่นั่งที่ยังไม่เกิด (ฝ่ายขายยังไม่ปิดเรื่อง) เว้นช่องเท่าบรรทัดลายเซ็น */
function signsBlock(ap) {
  const seats = list(ap.signs).map((seat) => (seat.signed ? signedSeat(seat) : `
            <div class="sig">
              <h4>${esc(seat.title)}</h4>
              <div class="sig-role">${esc(seat.role)}</div>
              <div class="sig-sp" aria-hidden="true"></div>
              <div class="sig-name">${esc(seat.name)}</div>
              <div class="sig-wait">${esc(seat.date)}</div>
            </div>`)).join('');
  return `
        <section class="sign-last" data-m="signs">
          ${heading('จ. การลงนามภายใน (บันทึกจากระบบ)', 'INTERNAL SIGN-OFF')}
          <div class="sig-grid">${seats}
          </div>
        </section>`;
}

const APPENDIX_BLOCKS = { decisions: decisionsBlock, scope: scopeBlock, history: historyBlock, notes: notesBlock, signs: signsBlock };

function appendixContent(ctx, page) {
  const ap = ctx.view.appendix;
  if (!ap) return '';
  const cont = !page.first;
  return `
        <div class="leadrow">
          <h2 class="su-lead">ภาคผนวก — ข้อมูลภายใน${cont ? CONT_TH : ''}<span> / INTERNAL APPENDIX${cont ? CONT_EN : ''}</span></h2>
          <p class="lead-ref">อ้างอิงคำร้อง <b>${esc(ap.ref)}</b></p>
        </div>${list(page.blocks).map((block) => APPENDIX_BLOCKS[block.type]?.(ap, block) ?? '').join('')}`;
}

/* ── ประกอบแผ่น ───────────────────────────────────────────────────────────────────────────── */

function pageContent(ctx, page) {
  switch (page.kind) {
    case 'summary':
      return `${partyHtml(ctx.view)}${panelHtml(ctx.view)}${summarySection(ctx, page, { cont: false })}`;
    case 'summaryCont':
      // `start` = ตารางเพิ่งเริ่มที่หน้านี้ (หน้า 1 ไม่มีตาราง) ⇒ หัวข้อไม่มี "(ต่อ)"
      return summarySection(ctx, page, { cont: !page.start });
    case 'zone':
    case 'zoneCont':
      return zoneContent(ctx, page);
    case 'signoff':
      return signoffContent(ctx);
    case 'appendix':
      return appendixContent(ctx, page);
    default:
      return '';
  }
}

function sheetHtml(ctx, page) {
  const first = page.kind === 'summary';
  // บรรทัด "ต่อหน้า n · …" ของหน้าตารางอยู่ใต้ตาราง (ในส่วนของตาราง) — ของหน้าอื่น (และหน้า 1 ที่ไม่มีตาราง) ชิดล่างของเนื้อหา
  const inTable = (page.kind === 'summary' || page.kind === 'summaryCont') && page.table !== false;
  const cont = page.cont && !inTable
    ? `\n        <p class="cont">${esc(page.cont.text)}</p>`
    : '';
  /* 🪤 แผ่นเป็น `<article>` ตัวเดียวของกระดาษ — ข้างในห้ามมี `<article>` อีก (กระดานใช้ `<article class="zp">` กับพื้นที่;
     ที่นี่เป็น `<div class="zp">`) ผู้ที่ตัด/นับแผ่นด้วยแท็กปิด `</article>` จะได้ไม่ตัดกลางแผ่น */
  return `
    <article class="sheet su-page" data-page="${page.no}" data-kind="${page.kind}" aria-label="${TITLE_TH} หน้า ${page.no}">
      ${watermarkBlock(ctx.watermark)}${bandHtml(ctx)}${first ? firstHeader(ctx) : runningHeader(ctx)}
      <main class="content${first && ctx.view.panel ? ' i1' : ''}">${pageContent(ctx, page)}${cont}
      </main>${footerHtml(ctx, page)}
    </article>`;
}

/**
 * @param opts.view      ผลของ `surveyReportView(snapshot, { version })` — ฉบับเดียว
 * @param opts.layout    ผลของ `paginateSurveyReport(view)` ของ view **ตัวเดียวกัน** (แผนหน้าคิดต่อฉบับ)
 * @param opts.docNo     เลขที่เอกสาร `SU-YYMMXXXX-R` (คอลัมน์ของแถว) — ไม่ส่ง = ขีด
 * @param opts.issuedAt  วันที่ออก (คอลัมน์ `issuedAt` · วัน `YYYY-MM-DD` หรือจุดเวลา) — ไม่ส่ง = ขีด
 * @param opts.imageSrc  `(img) => src | null` — ไม่ส่ง = token `su-img:<sha>` (ดู `resolveImageTokens`)
 * @param opts.watermark ข้อความลายน้ำทุกแผ่น ("ฉบับร่าง" ฯลฯ) — ไม่ส่ง = ไม่มี
 * @param opts.toolbar   แถบเครื่องมือของเปลือก (`{ label, button }`) — ไม่ส่ง = ไม่มี (กระดาษล้วน)
 * @returns HTML เต็มไฟล์ (ฟอนต์ฝังในตัว) — หนึ่ง `<article class="sheet su-page">` ต่อหนึ่งหน้าของแผน
 *
 * 🔴 **ไม่มีตัวเลือกสี** — สีชื่อเอกสารมาจาก `view.version` ทางเดียว (`surveyReportAccentKey`) · `accentKey` ที่ผู้เรียกส่งมาถูกทิ้ง
 *    (เคยรับไว้เป็นจุดเสียบของเทสต์: ฉบับลูกค้าพิมพ์สีของฉบับภายในได้ และคีย์ที่ไม่รู้จักพาฉบับภายในตกไปสีของฉบับลูกค้า)
 */
export function renderSurveyReportHTML({
  view, layout, docNo = null, issuedAt = null, imageSrc = surveyReportImageToken,
  watermark = null, toolbar = null,
} = {}) {
  if (!view || !layout) throw new Error('renderSurveyReportHTML: view and layout are required');
  const internal = view.version === 'internal';
  const ctx = {
    view,
    layout,
    docNo: docNo || DASH,
    issuedText: issuedAt ? fmtDate(issuedAt) : DASH,
    imageSrc,
    watermark,
    // "ฉบับภายใน" ของท้ายกระดาษ — ตัดจากป้ายแถบของ view ฉบับภายใน ("ฉบับภายใน — ห้ามส่งลูกค้า") ไม่พิมพ์คำนี้เอง
    footMark: internal && view.band ? String(view.band.title).split(' — ')[0] : null,
  };
  return renderDocumentHTML({
    lang: 'th',
    title: surveyReportFileName(docNo || 'SU', view.party?.customerName, view.version),
    accentKey: surveyReportAccentKey(view.version),
    variantClass: 'surveyReport',
    pages: list(layout.pages).map((page) => sheetHtml(ctx, page)).join(''),
    toolbar,
    extraCss: internal ? `${SURVEY_REPORT_CSS}${SURVEY_REPORT_INTERNAL_CSS}` : SURVEY_REPORT_CSS,
  });
}
