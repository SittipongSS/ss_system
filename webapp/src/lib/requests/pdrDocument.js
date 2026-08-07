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
import { PDR_SECTIONS, pdrSectionRows } from '@/lib/requests/pdrFields';

// สถานะในระบบ → คำบนกระดาษ (มติผู้ใช้: ใช้สถานะของเราเป็นตัวจริง แล้วแปลตอนพิมพ์
// ⇒ คนอ่านกระดาษเห็นคำที่คุ้น คนใช้ระบบเห็นขั้นที่ละเอียดกว่า ไม่มีใครต้องติ๊กเอง)
const PAPER_STATUS = [
  ['Open', ['pending']],
  ['In Progress', ['acknowledged']],
  ['Sample Sent', ['answered']],
  ['Closed', ['closed']],
];

const LINE = '<span class="fill"></span>';

// ⭐ **ช่องที่ไม่ได้กรอก พิมพ์ว่า N/A** (มติผู้ใช้ 2026-08-07) — เดิมพิมพ์เป็นเส้นให้
// เขียนมือ ซึ่งอ่านกำกวม: เส้นว่างแปลว่า "ยังไม่กรอก" หรือ "ไม่เกี่ยวกับใบนี้" ก็ได้
// · N/A บอกชัดว่า **ระบบถามแล้วแต่ไม่มีคำตอบ** ⇒ RD อ่านแล้วรู้ทันทีว่าต้องไปถามต่อ
// ⚠️ **ยกเว้นช่องลายเซ็นกับวันที่** — สองช่องนั้นเว้นไว้ให้เซ็นมือบนกระดาษเสมอ
// พิมพ์ N/A ทับเมื่อไรก็เซ็นไม่ได้ (ยังใช้ `LINE` อยู่ ดูตารางลายเซ็นข้างล่าง)
const NA = '<span class="na">N/A</span>';
const cell = (v) => (v == null || String(v).trim() === '' ? NA : esc(v));

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
    // ⭐ กระดาษมีเส้นให้เขียนต่อหลังทุกตัว (ข้อ 2.1.4) — พิมพ์ข้อความที่กรอกไว้
    // ต่อท้ายชื่อ Scentotype ตัวนั้น ไม่ใช่ทิ้งไว้แค่ชื่อเปล่า (mig 0222)
    ['Scentotype', (brief.scentotypes || [])
      .map((t) => {
        const note = (brief.scentotypeNotes || {})[t];
        return note ? `${scentotypeLabel(t)} — ${note}` : scentotypeLabel(t);
      })
      .join(' · ')],
    ['Performance ของกลิ่น', chips(brief.performance, scentPerformanceLabel)],
  ])}</table>
  </section>`;
}

// ตารางลายเซ็น 7 แถว — ชื่อเติมจากที่ระบบรู้ ที่เหลือกรอกในฟอร์ม PDR (mig 0221)
//
// ⚠️ ผูกกับ **ตำแหน่ง ไม่ใช่ชื่อคนที่พิมพ์ไว้ในกระดาษ** — ชื่อที่ฝังในแม่แบบจะค้าง
// ทันทีที่คนเปลี่ยนงาน · สองแถวแรกมาจากแถวคำร้อง (ระบบรู้ว่าใครเปิด ใครยืนยัน)
// อีกห้าแถวเป็น **ชื่อบนกระดาษ** ที่กรอกเองต่อใบ ไม่ใช่ role ในระบบ (ม-45)
//
// ⚠️ ป้ายตำแหน่งของห้าแถวหลัง **อ่านจากทะเบียน `pdrFields.js`** ไม่สะกดซ้ำที่นี่ —
// เปลี่ยนชื่อตำแหน่งแล้วต้องเปลี่ยนพร้อมกันทั้งฟอร์ม จอ และกระดาษ
const SIGNER_SECTION = PDR_SECTIONS.find((s) => s.key === 'signers');
const SIGN_ROWS = [
  ['Account Executive', 'requestedByName'],
  ['Account Executive Supervisor', 'approvedByName'],
  ...(SIGNER_SECTION?.fields || []).map((f) => [f.label, f.column]),
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
    // ⚠️ **"วันที่ร้องขอ" ย้ายลงไปอยู่ในก้อน "ข้อมูลคำขอ" แล้ว** (มติผู้ใช้ 2026-08-08)
    // — เดิม hardcode ที่นี่ด้วย `createdAt` ⇒ สองปัญหา: ฟอร์มกับหน้ารายละเอียดไม่มี
    // ช่องนี้เลย และร่างที่ค้างไว้หลายวันจะพิมพ์วันที่สร้างร่างแทนวันที่ยื่นจริง
    // ⇒ อยู่ในทะเบียน `pdrFields.js` ที่เดียว ทั้งสามจอจึงตอบวันเดียวกันเสมอ
    rows: [
      ['เลขที่เอกสาร', val(request.docNo)],
      ['ลูกค้า', val(request.customerName)],
    ],
  });

  const status = PAPER_STATUS
    .map(([label, list]) => `<span class="st${list.includes(request.status) ? ' on' : ''}">☐ ${esc(label)}</span>`)
    .join('');

  // ⭐ หัวข้อ · ป้ายชื่อ · ลำดับ · การแปลง enum มาจาก `lib/requests/pdrFields.js`
  // ที่เดียวกับฟอร์มและจอแสดง
  //
  // 🐞 เดิมที่นี่มีลิสต์ของตัวเอง ⇒ เพี้ยนจากอีกสองจอทั้งชื่อหัวข้อ ป้ายช่อง และลำดับ
  // และที่หนักที่สุดคือ **ไม่แปลง enum** ⇒ กระดาษที่ส่งให้ลูกค้าพิมพ์ว่า
  // `new_product` · `premium` · `existing` ตรง ๆ
  //
  // ⚠️ `includeEmpty` — ช่องว่างพิมพ์เป็นเส้นให้เขียนมือ ต่างจากบนจอที่ซ่อนทิ้ง
  const section = (key, heading) => {
    const found = PDR_SECTIONS.find((x) => x.key === key);
    const pairs = pdrSectionRows(found, request, {
      includeEmpty: true,
      // ⚠️ ค่าที่ระบบเติมให้มาจาก server (`findRequest`) — เอกสารเป็นฟังก์ชัน
      // บริสุทธิ์ โหลดเองไม่ได้ · ไม่มี context = ช่องพวกนั้นพิมพ์เป็นเส้นเปล่า
      context: { ...(request.pdrContext || {}), briefs, scentCount: briefs.length || null },
    });
    return `<section class="blk"><h3>${esc(heading)}</h3><table class="kv">${rows(pairs)}</table></section>`;
  };

  const body = `
    ${section('request', 'ข้อมูลคำขอ')}
    ${section('customer', '1. ข้อมูลลูกค้า')}

    <h2 class="sec">2. Product Specifications</h2>
    ${briefs.length ? briefs.map((b, i) => briefBlock(b, i, briefs.length)).join('') : briefBlock({}, 0, 1)}

    ${section('spec', 'ข้อกำหนดผลิตภัณฑ์')}
    ${section('regulatory', 'Regulatory & Compliance Requirements')}

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
      .na { color: #999; font-style: italic; }
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
