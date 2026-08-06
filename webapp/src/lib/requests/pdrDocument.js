// ── เอกสาร PDR (FM-RD-01) — ใช้เปลือกเอกสารกลางเหมือน QT/SO ─────────────
//
// ⭐ **หน้าตาตรงกับฟอร์มกระดาษเดิม** — คนที่เคยใช้กระดาษเปิดมาแล้วต้องอ่านได้ทันที
// ไม่ใช่เอกสารหน้าใหม่ที่ต้องเรียนรู้ซ้ำ
//
// ⚠️ **ช่องที่เว้นว่างพิมพ์เป็นเส้น** ไม่ใช่ซ่อนเหมือนบนจอ — ใบที่กรอกไม่ครบยังต้องใช้
// เป็นกระดาษให้คนเขียนมือต่อได้ · นี่คือจุดที่เอกสารกับหน้าจอตั้งใจต่างกัน
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มต้องเขียนว่า
// "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด"
import {
  documentHeader, esc, renderDocumentHTML, val,
} from '@/lib/documents/documentShell';
import { scentPerformanceLabel, scentotypeLabel } from '@/lib/requests/kinds/rd/scentBriefTypes';

// สถานะในระบบ → คำบนกระดาษ (มติผู้ใช้: ใช้สถานะของเราเป็นตัวจริง แล้วแปลตอนพิมพ์
// ⇒ คนอ่านกระดาษเห็นคำที่คุ้น คนใช้ระบบเห็นขั้นที่ละเอียดกว่า ไม่มีใครต้องติ๊กเอง)
const PAPER_STATUS = [
  ['Open', ['pending']],
  ['In Progress', ['acknowledged']],
  ['Sample Sent', ['answered']],
  ['Closed', ['closed']],
];

const LINE = '<span class="fill"></span>';
const cell = (v) => (v == null || String(v).trim() === '' ? LINE : esc(v));

const rows = (pairs) => pairs
  .map(([label, value]) => `<tr><th>${esc(label)}</th><td>${cell(value)}</td></tr>`)
  .join('');

const chips = (list, label) => (list || []).map((v) => esc(label(v))).join(' · ');

function briefBlock(brief, index, total) {
  const title = total > 1 ? `กลิ่นที่ ${index + 1}` : 'บรีฟกลิ่น';
  return `<section class="blk">
    <h3>${esc(title)}${brief.label ? ` — ${esc(brief.label)}` : ''}</h3>
    <table class="kv">${rows([
    ['บรีฟกลิ่น', brief.brief],
    ['ให้ทำวิจัยเรื่อง', brief.researchTopic],
    ['แรงบันดาลใจ', brief.inspiration],
    ['ช่วงกลิ่นที่ชื่นชอบ', brief.likedNotes],
    ['กลิ่นที่ End-user ไม่ชอบ', brief.dislikedNotes],
    ['Scentotype', chips(brief.scentotypes, scentotypeLabel)],
    ['Performance ของกลิ่น', chips(brief.performance, scentPerformanceLabel)],
  ])}</table>
  </section>`;
}

// ตารางลายเซ็น 7 แถว — ชื่อ/วันที่เติมจากคนที่เซ็นในระบบแล้ว ที่เหลือเว้นให้เซ็นมือ
//
// ⚠️ ผูกกับ **ตำแหน่ง ไม่ใช่ชื่อคน** — สามชื่อที่พิมพ์ไว้ในกระดาษเดิมจะค้างทันทีที่
// คนเปลี่ยนงาน · ระบบยังไม่มีตำแหน่ง Perfumer/PD Chemist/Project Coordinator
// ⇒ รอบนี้เว้นให้เซ็นมือทั้งหมด ยกเว้นแถวที่ระบบรู้จริง
const SIGN_ROWS = [
  ['Account Executive', 'requestedByName'],
  ['Account Executive Supervisor', 'approvedByName'],
  ['Sale & Marketing Manager', null],
  ['Perfumer', null],
  ['Product Development Chemist', null],
  ['Project Coordinator', null],
  ['Final Approval (RD Supervisor)', null],
];

export function renderPdrDocument({ request = {}, briefs = [], company = {}, form = {} } = {}) {
  const formLine = form.code
    ? `${form.code}: Rev. No.${form.revision}. ${form.effectiveDate}`
    : '';

  const header = documentHeader({
    company,
    formLine,
    titleTh: 'แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์',
    titleEn: 'Product Development Request (PDR) Form',
    rows: [
      ['เลขที่เอกสาร', val(request.docNo)],
      ['วันที่ร้องขอ', val((request.createdAt || '').slice(0, 10))],
      ['ลูกค้า', val(request.customerName)],
    ],
  });

  const status = PAPER_STATUS
    .map(([label, list]) => `<span class="st${list.includes(request.status) ? ' on' : ''}">☐ ${esc(label)}</span>`)
    .join('');

  const body = `
    <section class="blk"><h3>ข้อมูลคำขอ</h3><table class="kv">${rows([
    ['ผู้ร้องขอ AE', request.requestedByName],
    ['ประเภทของคำขอ', request.pdrRequestType],
    ['แผนก', 'การขายและบริการ'],
  ])}</table></section>

    <section class="blk"><h3>1. ข้อมูลลูกค้า</h3><table class="kv">${rows([
    ['ชื่อบริษัท', request.customerName],
    ['ชื่อแบรนด์', request.pdrCustomerBrand],
    ['Mood & Tone', request.pdrMoodTone],
    ['ทิศทางการเติบโตของแบรนด์', request.pdrBrandDirection],
    ['ที่อยู่จัดส่ง (ตัวอย่าง)', request.pdrShipTo],
    ['ประเภทลูกค้า', request.pdrCustomerKind],
    ['มูลค่าโปรเจกต์ทั้งหมด', request.pdrProjectValue],
    ['DemoGraphic', request.pdrTargetDemographic],
    ['PsychoGraphic', request.pdrTargetPsychographic],
    ['Painpoint', request.pdrTargetPainpoint],
    ['ประเภทสินค้า', request.pdrProductKind],
    ['จำนวนกลิ่นที่ต้องการพัฒนา', briefs.length ? `${briefs.length} บรีฟ` : ''],
    ['วันที่ต้องการสินค้า', request.pdrWantedAt],
    ['วันที่ต้องการจำหน่ายสินค้า', request.pdrSellFrom],
  ])}</table></section>

    <h2 class="sec">2. Product Specifications</h2>
    ${briefs.length ? briefs.map((b, i) => briefBlock(b, i, briefs.length)).join('') : briefBlock({}, 0, 1)}

    <section class="blk"><table class="kv">${rows([
    ['Target Cost / Unit (ราคาต้นทุน/KG)', request.pdrTargetCost],
    ['Target Price / Unit (ราคาขาย)', request.pdrTargetPrice],
    ['MOQ ที่คาดหวัง', request.pdrMoq],
    ['ลักษณะเนื้อผลิตภัณฑ์', request.pdrTexture],
    ['สีเนื้อผลิตภัณฑ์', request.pdrColor],
    ['ขนาดบรรจุภัณฑ์และจำนวนต่อกลิ่น', request.pdrPackSize],
    ['ตัวอย่างแบรนด์ (กลิ่นที่ชอบ)', request.pdrBrandSample],
  ])}</table></section>

    <section class="blk"><h3>Regulatory &amp; Compliance Requirements</h3><table class="kv">${rows([
    ['ข้อกำหนดเฉพาะอื่น ๆ', request.pdrSpecialRequirements],
  ])}</table></section>

    <section class="blk"><h3>Final Review &amp; Approval</h3>
      <table class="sign">
        <thead><tr><th>Role / Department</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
        <tbody>${SIGN_ROWS.map(([role, field]) => `<tr>
          <td>${esc(role)}</td><td>${cell(field ? request[field] : '')}</td>
          <td>${LINE}</td><td>${LINE}</td>
        </tr>`).join('')}</tbody>
      </table>
    </section>

    <p class="status">Status: ${status}</p>`;

  return renderDocumentHTML({
    title: `PDR ${request.docNo || ''}`.trim(),
    accentKey: 'terracotta',
    pages: [`${header}${body}`],
    toolbar: { label: 'แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)', button: 'พิมพ์เอกสาร' },
    extraCss: `
      .sec { font-size: 12pt; margin: 10pt 0 4pt; }
      .blk { margin-bottom: 8pt; break-inside: avoid; }
      .blk h3 { font-size: 10.5pt; margin: 0 0 3pt; }
      table.kv { width: 100%; border-collapse: collapse; }
      table.kv th, table.kv td { border: 0.5pt solid #999; padding: 3pt 5pt; font-size: 9pt; vertical-align: top; }
      table.kv th { width: 34%; text-align: left; font-weight: 500; background: #f6f4f0; }
      table.sign { width: 100%; border-collapse: collapse; }
      table.sign th, table.sign td { border: 0.5pt solid #999; padding: 4pt 5pt; font-size: 9pt; }
      .fill { display: block; min-height: 11pt; border-bottom: 0.4pt dotted #aaa; }
      .status { margin-top: 10pt; font-size: 9.5pt; }
      .status .st { margin-right: 14pt; }
      .status .st.on { font-weight: 700; }
    `,
  });
}
