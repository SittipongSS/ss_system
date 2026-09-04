// ── เอกสารสัญญา: แม่แบบ + ค่าที่กรอก → HTML เอกสารเต็มใบ ────────────────────
//
// ประกอบจากเปลือกเอกสารกลาง (`lib/documents/documentShell.js`) เหมือนใบเสนอราคา
// ใบแจ้งชำระภาษี และ PDR — **ห้ามก๊อป CSS ไปอีกชุด** (เหตุผลอยู่หัวไฟล์เปลือก)
//
// ⚠️ **สัญญาตัดหน้าด้วยการ "วัดจริง" ไม่ใช่ประมาณเป็นมิลลิเมตร**
//    PDR/ใบแจ้งชำระคำนวณต้นทุนแต่ละบล็อกเป็นมิลลิเมตรแล้วตัดแผ่นล่วงหน้า ซึ่งใช้กับ
//    สัญญาไม่ได้: เนื้อเป็นย่อหน้ายาวที่ความสูงขึ้นกับการตัดคำภาษาไทย เดาพลาดเมื่อไร
//    `.sheet` ที่เป็น `overflow: hidden` จะ **กินข้อสัญญาหายเงียบจากกระดาษ**
//
//    ⭐ วิธีที่ใช้: เอกสารถูกเขียนออกมาเป็น "สายเนื้อหา" (`.contractFlow`) ที่อ่านครบ
//    อยู่แล้วโดยไม่ต้องพึ่งสคริปต์ แล้วมีสคริปต์เล็ก ๆ ฝังในไฟล์คอยย้ายบล็อกลง `.sheet`
//    ขนาด A4 ทีละใบ **โดยวัดความสูงจริงจากเบราว์เซอร์** (`scrollHeight > clientHeight`)
//    ⇒ ได้เลขหน้าท้ายกระดาษเหมือนเอกสารชนิดอื่น และไม่มีทางตัดเนื้อหาย เพราะบล็อกที่
//    สูงเกินหนึ่งแผ่นจะได้แผ่นที่ยืดได้ (`.sheet.tall`) แทนการถูกครอบตัด
//    🪤 สคริปต์พังหรือไม่ทำงาน = ยังเห็นเนื้อครบทั้งฉบับ (สายเนื้อหาเดิมไม่ถูกซ่อนก่อน
//    สร้างแผ่นเสร็จ) เสียแค่การแบ่งหน้า — ตรงข้ามกับการเดาเป็นมิลลิเมตรที่พังแล้วเงียบ

import { fmtNumber } from '@/lib/format';
import {
  documentFileName,
  documentHeader,
  esc,
  renderDocumentHTML,
  watermarkBlock,
} from '@/lib/documents/documentShell';
import { CONTRACT_KIND_DOC_TITLES } from '@/lib/sales/contracts';
import { contractTemplate } from '@/lib/sales/contractTemplates';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// "20 เดือน สิงหาคม พ.ศ. 2569" — รูปประโยคเดียวกับต้นฉบับที่ใช้จริง (ปี พ.ศ.)
export function thaiContractDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} เดือน ${TH_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}

// "15 ธันวาคม พ.ศ. 2568" — รูปที่ต้นฉบับใช้ตอน *อ้างถึง* วันที่ของเอกสารอื่น (ไม่มีคำว่า "เดือน")
export function thaiPlainDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}

// วันที่แบบสั้นบนหัวใบ: 29/06/2569 (พ.ศ.) — ต่างจากวันที่ในตัวสัญญาที่เขียนเต็มคำ
export function thaiShortDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
}

export const BLANK = '____________________';
// เส้นประในเซลล์ตาราง — สั้นกว่าเส้นประในย่อหน้า เพราะช่องแคบกว่ามาก
export const BLANK_CELL = '__________';

// แทนค่า {{token}} — ค่าที่ยังไม่กรอกกลายเป็น "เส้นให้เขียนมือ" ไม่ใช่ช่องว่างเงียบ ๆ
// (สัญญาที่พิมพ์ออกไปแล้วมีที่ว่างลอย = ไม่มีใครรู้ว่าตั้งใจเว้นหรือลืมกรอก)
export function fillTokens(text, values = {}) {
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') return BLANK;
    return String(value);
  });
}

// ค่าที่แม่แบบเรียกใช้ = ช่องกรอกของใบ + ข้อมูลบริษัทเรา + วันที่แบบไทย
// ⚠️ ตัวเลขเงินถูกจัดรูปแบบที่นี่ที่เดียว — แม่แบบเก็บ token เปล่า ๆ ไม่รู้จักหน่วย
/* ⭐ **เอกสารสัญญาเป็นทศนิยม 2 ตำแหน่งทั้งหมด** (มติผู้ใช้ 2026-09-03)
   ⚠️ **ต่างจากกติกาของจอโดยตั้งใจ** — บนหน้าจอทั้งระบบเงินแสดง "เต็มหลัก"
      (#1540/#1541/#1543) แต่เอกสารที่พิมพ์ออกไปให้ลูกค้าเซ็นเป็นทศนิยมเสมอ
      เพราะยอดที่ต้องโอนจริงมีสตางค์ (งวดละ 7,639.80) ⇒ เอกสารฉบับเดียวมีสองรูปแบบ
      ปนกันไม่ได้ · อย่า "แก้ให้ตรงกับจอ" — คนละบริบทกัน
   🪤 ต้นฉบับ .docx ที่พิมพ์มือไว้เขียนบางที่ไม่มีทศนิยม (35,700 · 38,199)
      **ไม่ใช่มาตรฐานที่ต้องลอก** — เคยแก้ตามแล้วโดนตีกลับ */
export function contractTokenValues(contract, { company = {}, template = null } = {}) {
  const tpl = template || contractTemplate(contract?.kind);
  const raw = { ...(contract?.fields || {}) };
  for (const field of tpl?.fields || []) {
    if (field.type === 'money' && raw[field.key] !== undefined && raw[field.key] !== null && raw[field.key] !== '') {
      raw[field.key] = fmtNumber(Number(raw[field.key]) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  return {
    ...raw,
    contractNo: contract?.contractNo || '',
    contractDateTh: thaiContractDate(contract?.contractDate) || '',
    contractorName: company.legalNameTh || company.nameTh || '',
    contractorRegNo: company.taxId || '',
    contractorAddress: company.address || '',
    contractorSignerName: company.authorizedSignerName || raw.contractorSignerName || '',
    // เลขที่ใบเสนอราคาที่สัญญาอ้างถึง — สัญญาทุกฉบับออกจากใบเสนอราคา (มติ 2026-09-03)
    quotationNo: raw.quotationNo || '',
  };
}

/* ⭐ ค่าที่ต้องเด่นบนกระดาษ (มติผู้ใช้ 2026-08-20) — **ข้อมูลคู่สัญญาและวันที่**
   ต้นฉบับก็ทำตัวหนาไว้ที่ชื่อคู่สัญญาทั้งสองฝ่าย · ที่เพิ่มคือเลขทะเบียน/ที่อยู่/วันที่
   เพราะเป็นค่าที่คนอ่านต้องกวาดตาหาก่อนเซ็น
   ⚠️ ตัวเลขเงื่อนไข (จำนวนวัน/ครั้ง/ค่าแก้ไข) **ไม่หนา** — ต้นฉบับก็ไม่หนา และถ้าหนา
      หมดทั้งฉบับก็เท่ากับไม่มีอะไรเด่น */
const BOLD_TOKENS = new Set([
  'contractDateTh', 'clientName', 'clientRegNo', 'clientAddress',
  'contractorName', 'contractorRegNo', 'contractorAddress',
  // บันทึกเพิ่มเติมใช้ตัวเติมชุดเดียวกัน — วันที่ของบันทึกและวันที่สัญญามีผลก็เป็น
  // "ข้อมูลที่ต้องกวาดตาหา" เหมือนกัน
  'addendumDateTh', 'effectiveDateTh', 'contractDatePlainTh',
]);

// เติมค่าแล้วคืน **HTML** (ต่างจาก fillTokens ที่คืนข้อความล้วน) — ค่าที่กรอกจริงของ
// คู่สัญญาถูกห่อด้วย <strong> ส่วนช่องที่ยังว่างเป็นเส้นประธรรมดา ไม่ต้องเน้น
export function fillTokensHtml(text, values = {}) {
  return String(text ?? '')
    .split(/(\{\{\w+\}\})/)
    .map((part) => {
      const token = /^\{\{(\w+)\}\}$/.exec(part);
      if (!token) return esc(part);
      const raw = values[token[1]];
      const empty = raw === undefined || raw === null || String(raw).trim() === '';
      if (empty) return BLANK;
      const value = esc(String(raw));
      return BOLD_TOKENS.has(token[1]) ? `<strong class="fill">${value}</strong>` : value;
    })
    .join('');
}

export const paragraph = (text, values) => `<p class="clauseText">${fillTokensHtml(text, values)}</p>`;

function definitionsBlock(template, values) {
  const def = template.definitions;
  if (!def) return '';
  return `
        <h2 class="blk" data-keep-next="1">${esc(def.heading)}</h2>
        ${def.lead ? `<div class="blk defs">${paragraph(def.lead, values)}</div>` : ''}
        ${def.terms.map((t) => `<div class="blk defs"><p class="clauseText"><strong>${esc(t.term)}</strong> ${fillTokensHtml(t.text, values)}</p></div>`).join('')}`;
}

/* ── ตารางในข้อสัญญา (สัญญาบริการ ข้อ 2) ────────────────────────────────
   ⚠️ **ไม่มีข้อมูล = พิมพ์แถวเส้นประ ไม่ใช่ซ่อนตาราง** — ต้นฉบับมีตารางเสมอ
      ซ่อนทั้งอันแล้วเอกสารที่พิมพ์ออกไปจะไม่ตรงกับต้นฉบับที่ตกลงกันไว้
   ⚠️ ทุกเซลล์ผ่าน `fillTokensHtml` เหมือนย่อหน้า — แถวที่ผู้เรียกเติมมาอาจมี token ได้ */
function tableBlock(table, rows, values) {
  const cols = table.columns || [];
  const body = (rows && rows.length ? rows : [null]).map((row) => `
          <tr>${cols.map((c) => {
    const raw = row ? row[c.key] : '';
    const cell = raw === undefined || raw === null || String(raw).trim() === ''
      ? BLANK_CELL
      : fillTokensHtml(String(raw), values);
    return `<td${c.align ? ` class="a-${esc(c.align)}"` : ''}>${cell}</td>`;
  }).join('')}</tr>`).join('');
  return `
        <table class="blk clauseTable">
          <thead><tr>${cols.map((c) => `<th${c.align ? ` class="a-${esc(c.align)}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>`;
}

/* ── รายการย่อยในข้อสัญญา (สัญญาบริการ ข้อ 3 — งวดชำระ) ──────────────────
   ⚠️ **ไม่มีงวด = ไม่มีบรรทัดเลย** ต่างจากตารางข้างบนโดยเจตนา — ใบที่ชำระเต็มจำนวน
      (`paymentPlan.type = 'full'`) ไม่มีงวดจริง ๆ การพิมพ์เส้นประจะชวนให้เขียนของที่ไม่มี */
function linesBlock(lines, values) {
  if (!lines || !lines.length) return '';
  return `
        <ul class="blk clauseLines">${lines
    .map((line) => `<li>${fillTokensHtml(String(line ?? ''), values)}</li>`).join('')}</ul>`;
}

function sectionBlock(section, values, blocks = {}) {
  /* ⚠️ **หมวดไม่มีหัวข้อก็มีจริง** — สัญญาบริการเรียงข้อ 1–10 ไปเลยไม่แบ่งหมวด
     ⇒ ไม่มี `no`/`heading` = ไม่พิมพ์บรรทัดหัวหมวด · ของเดิมพิมพ์คำว่า "หมวด" เสมอ
        ซึ่งจะเติมคำที่ต้นฉบับไม่มีลงในเอกสารที่ผูกพันตามกฎหมาย */
  const head = section.no || section.heading
    ? `
        <h2 class="blk sectionHead" data-keep-next="1">หมวด ${esc(section.no)} ${esc(section.heading)}</h2>`
    : '';
  return `${head}
        ${section.clauses.map((clause) => `
        <div class="blk clause">
          <span class="clauseNo">${esc(clause.no)}</span>
          <div>
            ${clause.title ? `<strong class="clauseTitle">${esc(clause.title)}</strong>` : ''}
            ${paragraph(clause.text, values)}
            ${clause.table ? tableBlock(clause.table, blocks[clause.table.source], values) : ''}
            ${clause.lines ? linesBlock(blocks[clause.lines.source], values) : ''}
            ${clause.after ? paragraph(clause.after, values) : ''}
          </div>
        </div>`).join('')}`;
}

/* ⭐ ย่อหน้าปิดท้ายกับช่องลงนามเป็น **บล็อกเดียว** (มติผู้ใช้ 2026-08-21)
   ย่อหน้าปิดท้ายคือประโยคที่บอกว่า "ลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน" ⇒ แยกไป
   คนละแผ่นกับช่องเซ็นแล้วอ่านไม่ต่อกัน และแผ่นที่มีแต่ช่องเซ็นลอย ๆ ดูเหมือนใบแนบ
   ⚠️ บล็อกนี้สูงสุดในฉบับ — ถ้าวันไหนยาวเกินหนึ่งแผ่น ตัวตัดหน้าจะให้แผ่นยืด (.tall)
      แทนการครอบตัด ไม่ใช่ปล่อยเนื้อหาย */
function closingWithSignatures(template, values) {
  return `
        <section class="blk signPage">
          ${template.closing.map((text) => `<div class="closing">${paragraph(text, values)}</div>`).join('')}
          ${signatureGrid(template, values)}
        </section>`;
}

function signatureGrid(template, values) {
  const box = (sig) => {
    const name = fillTokens(sig.name || '', values);
    const org = fillTokens(sig.org || '', values);
    const title = fillTokens(sig.title || '', values);
    return `
          <div class="signBox">
            <div class="signLine">ลงชื่อ ......................................................</div>
            <div class="signName">( ${esc(name === BLANK || !name ? '......................................................' : name)} )</div>
            <div class="signRole">${esc(sig.role)}</div>
            ${title && title !== BLANK ? `<div class="signMeta">${esc(title)}</div>` : ''}
            ${org && org !== BLANK ? `<div class="signMeta">${esc(org)}</div>` : ''}
          </div>`;
  };
  return `
          <section class="signGrid" aria-label="ส่วนลงนาม">${template.signatures.map(box).join('')}</section>`;
}

export const CONTRACT_CSS = `
  /* ── สายเนื้อหาก่อนถูกตัดหน้า ────────────────────────────────────────
     เห็นครบทั้งฉบับแม้สคริปต์ไม่ทำงาน (แผ่นยืดตามเนื้อ ไม่ครอบตัด) */
  /* ระยะขอบกระดาษของสัญญากว้างกว่าเอกสารชนิดอื่น — เอกสารผูกพันที่ต้องเซ็นและเย็บเก็บ
     ต้องมีที่ให้เขียนกำกับข้างกระดาษและไม่ให้ตัวหนังสือชนขอบตอนถ่ายสำเนา
     (เปลือกตั้ง 11/12/10mm ไว้สำหรับเอกสารที่มีตารางกว้าง) */
  .contract .sheet { padding: 20mm 20mm 15mm; }

  .contract .flowSheet { height: auto; min-height: 0; overflow: visible; }
  /* ⚠️ **ต้องเป็น block ไม่ใช่ flex** — .sheetContent ของเปลือกเป็น flex column
     ซึ่งจะ *บีบ* บล็อกลูกให้พอดีแผ่นแทนที่จะล้น ⇒ ตัววัด scrollHeight > clientHeight
     ไม่มีวันเป็นจริง แล้วทุกอย่างไปกองอยู่แผ่นเดียวโดยตัวหนังสือทับกัน */
  /* เว้นใต้เส้นคั่นหัวใบก่อนเข้าเนื้อ — บรรทัดแรกชนเส้นอ่านแล้วอึดอัด */
  .contract .sheetContent { display: block; padding-top: 7mm; }

  /* ⭐ แผ่นต่อไม่ต้องเว้นซ้ำ (มติผู้ใช้ 2026-08-22) — ขอบกระดาษ 20mm เว้นให้อยู่แล้ว
     บวก 7mm ของช่องใต้หัวใบซึ่งแผ่นนี้ไม่มีหัวใบ กลายเป็นแถบว่างหัวหน้าที่ไม่มีเหตุผล */
  .contract .sheet.contPage .sheetContent { padding-top: 0; }

  /* แผ่นที่สคริปต์สร้าง = ขนาดกระดาษจริงตามเปลือก · แผ่นที่บล็อกเดียวสูงเกินหนึ่งหน้า
     ได้ .tall ให้ยืดแทนการครอบตัด (กันเนื้อหายเงียบ ซึ่งเป็นกับดักของ overflow:hidden) */
  .contract .sheet.tall { height: auto; min-height: 297mm; overflow: visible; }

  /* ⭐ หัวเอกสารโชว์ภาษาเดียว (มติผู้ใช้ 2026-08-20) — ตัวสัญญาเป็นภาษาไทยทั้งฉบับ
     ชื่อบริษัทภาษาอังกฤษใต้ชื่อไทยจึงเป็นบรรทัดที่ไม่มีใครอ่านบนกระดาษที่จะเซ็น
     ⚠️ ซ่อนด้วย CSS เพราะเปลือกพิมพ์ช่องนี้เสมอ (ค่าว่างกลายเป็นขีด ไม่ใช่หายไป)
        วันไหนทำสัญญาฉบับภาษาอังกฤษ ให้สลับ *ค่า* ที่ส่งเข้าหัวเอกสาร ไม่ใช่โชว์คู่กัน */
  .contract .brandBlock span { display: none; }
  /* ชื่อเอกสารอยู่กลางหน้าเนื้อหาแทน — ซ่อนของเปลือกทิ้ง (เปลือกพิมพ์ช่องนี้เสมอ) */
  .contract .identityBlock h1, .contract .englishTitle { display: none; }
  /* ป้ายในหัวใบยาวกว่าคอลัมน์ 22mm ของเปลือก ("อ้างอิงใบเสนอราคา") ⇒ ล้นไปดันค่า
     ให้เยื้องกันคนละแถว · กว้างพอให้ป้ายอยู่บรรทัดเดียว แล้วค่าชิดขวาตรงกันทุกแถว
     🐞 **เคยตั้งตายเป็น 36mm แล้วเลขที่สัญญาตกบรรทัด** (ผู้ใช้ส่งภาพมา 2026-09-03:
        "CT-SD-" ค้างบรรทัดบน "26090003-0" ตกลงไปบรรทัดล่าง) — เลขยาวขึ้นตอนแทรก
        อักษรย่อชนิดสัญญา (CT-YYMMXXXX-R → CT-SD-YYMMXXXX-R) แต่คอลัมน์ป้ายยัง
        กินที่ 36mm ทั้งที่ป้ายที่ยาวที่สุดใช้จริงแค่ 19.3mm ⇒ เหลือให้ค่า 21mm
        ซึ่งไม่พอกับเลข 26mm
     ⇒ ป้ายกินเท่าที่ใช้จริง (max-content) แล้วที่เหลือเป็นของค่าเสมอ
     ⚠️ nowrap ทั้งสองฝั่ง — เลขที่เอกสารที่ถูกตัดกลางคืออ่านผิดได้ (คนละใบ) */
  /* ⚠️ กริดต้องอยู่ที่ dl ไม่ใช่รายแถว — รายแถวต่างคนต่างวัด ป้ายจะกว้างไม่เท่ากัน
     แล้วขอบขวาของป้ายเป็นขั้นบันได · display: contents ยกให้ dt/dd เป็นลูกของ dl ตรง ๆ
     ⇒ คอลัมน์ป้ายเป็นตัวเดียวกันทุกแถว กว้างเท่าป้ายที่ยาวที่สุด */
  .contract .identityBlock dl { display: grid; grid-template-columns: max-content minmax(0, 1fr);
    gap: .8mm 2mm; }
  .contract .identityBlock dl div { display: contents; }
  .contract .identityBlock dt { white-space: nowrap; }
  .contract .identityBlock dd { text-align: right; white-space: nowrap; }
  /* เลขที่สัญญา = ตัวชี้ใบนี้ ⇒ ใช้สี accent ให้กวาดตาเจอก่อนอย่างอื่นบนหัวใบ
     (แถวแรกเสมอ — ลำดับแถวประกาศอยู่ที่ rows ของ documentHeader ด้านล่าง) */
  .contract .identityBlock dl div:first-child dd { color: var(--doc-accent); }
  /* ⭐ เอกสารนี้ซ่อนชื่อเอกสารในหัวใบ (ย้ายไปกลางหน้า) ⇒ ฝั่งขวาเหลือแค่สองแถวแล้ว
     ลอยไปกองอยู่บนสุด ไม่สมดุลกับบล็อกบริษัทฝั่งซ้ายที่ยาวลงมาถึงเส้นคั่น
     ⇒ ดันแถวเลขที่/อ้างอิงลงไปอยู่ **ก้นหัวใบ** ให้จบระดับเดียวกับฝั่งซ้าย */
  /* ฝั่งขวาเหลือแค่ 3 แถวสั้น ⇒ คืนความกว้างให้บล็อกบริษัท ที่อยู่จะได้ไม่ตกบรรทัด
     เหลือ "10160" ห้อยอยู่บรรทัดเดียว (เปลือกตั้ง 1.35fr / 72mm ไว้ให้เอกสารที่หัวใบ
     ฝั่งขวามีหลายแถว เช่น ใบเสนอราคา) */
  /* ⚠️ 66mm ไม่ใช่ 62mm — เลขที่สัญญาทรงใหม่ (มีอักษรย่อชนิด) ยาว 26mm และเลขที่
     บันทึกเพิ่มเติมยาวกว่านั้นอีก (ต่อท้าย -A1) · ฝั่งซ้ายยังเหลือที่: ที่อยู่บริษัทใช้ 79.6mm
     จากช่อง 100mm ⇒ ยืมมา 4mm แล้วที่อยู่ยังจบบรรทัดเดียวเหมือนเดิม */
  .contract .documentHeader { grid-template-columns: minmax(0, 1.5fr) minmax(66mm, .85fr); }
  .contract .brandBlock p { line-height: 1.6; }

  .contract .identityBlock { display: flex; flex-direction: column; }
  .contract .identityBlock dl { margin-top: auto; }

  .contract .docTitle { margin: 0 0 6mm; color: var(--doc-accent); font-size: 13.5pt;
    line-height: 1.4; text-align: center; }

  .contract .contractBody { display: block; }
  .contract .blk { break-inside: avoid-page; page-break-inside: avoid; }

  /* ── ย่อหน้า ──────────────────────────────────────────────────────────
     ต้นฉบับย่อหน้าแรกของทุกย่อหน้าเข้า 1 ระยะแท็บ และเว้นบรรทัดระหว่างย่อหน้า
     ⚠️ ข้อสัญญาไม่ย่อหน้าแรก — เลขข้ออยู่คอลัมน์ซ้าย ตัวเนื้อจึงเป็น hanging indent
        อยู่แล้ว ถ้าย่อหน้าซ้ำอีกชั้นจะเยื้องสองระดับในบรรทัดเดียวกัน */
  /* ── ขอบขวาเสมอกันโดยไม่มีรูโหว่กลางบรรทัด ────────────────────────────
     🪤 justify เฉย ๆ ใช้กับภาษาไทยไม่ได้: ไทยไม่เว้นวรรคระหว่างคำ ทั้งบรรทัดจึงมี
     ช่องว่างจริงแค่ 1-2 ที่ · justify ยืดเฉพาะ "ช่องว่าง" ⇒ ช่องเดียวโดนดึงจนเป็นรู
     (อาการที่ผู้ใช้ทักจากข้อ 3.4 · ต้นฉบับ Word ก็เป็นแบบเดียวกัน)
     ⭐ text-justify: inter-character กระจายระยะ **ระหว่างตัวอักษร** แทน ⇒ ขอบขวา
     เสมอกันและไม่มีรูโหว่ · ทดสอบจริงบน Chrome headless แล้วเทียบสี่แบบ
     (justify · inter-character · left · break-all) — inter-character ชนะขาด
     ⚠️ ห้ามใช้ word-break: break-all แทน — ตัดกลางคำไทยเป็น "แล/ะให้" อ่านไม่ออก */
  .contract .clauseText { margin: 0; font-size: 9.5pt; line-height: 1.75;
    text-align: justify; text-justify: inter-character; }
  /* ⚠️ ต้องเขียนถึง **ทั้งสองพ่อ** — ก่อนตัดหน้า บล็อกอยู่ใน .contractBody
     พอสคริปต์ตัดหน้าเสร็จมันย้ายไปอยู่ใน .sheetContent ของแต่ละแผ่น
     เขียนถึงแค่ .contractBody = ไฟล์ที่พิมพ์ออกมาจริงไม่มีระยะห่างย่อหน้าเลย */
  .contract .contractBody > .blk,
  .contract .sheetContent > .blk { margin-top: 3.5mm; }
  .contract .contractBody > .blk:first-child,
  .contract .sheetContent > .blk:first-child { margin-top: 0; }
  /* ย่อหน้าแรกเข้า 12mm ทุกย่อหน้าที่เป็น "ความเรียง" — ความนำ · คำจำกัดความ · ปิดท้าย
     (ข้อสัญญาไม่เข้า เพราะเลขข้ออยู่คอลัมน์ซ้ายเป็น hanging indent อยู่แล้ว) */
  .contract .intro .clauseText,
  .contract .defs .clauseText,
  .contract .closing .clauseText { text-indent: 12mm; }

  /* ── ตารางในข้อสัญญา (สัญญาบริการ ข้อ 2) ────────────────────────────
     ⚠️ ตารางในเอกสารพิมพ์ห้ามเลื่อนแนวนอน — ต้องพอดีหน้ากระดาษเสมอ
        table-layout: fixed + word-break ให้ข้อความยาวตัดบรรทัดแทนที่จะดันตารางล้น */
  .contract .clauseTable {
    width: 100%; margin: 2.5mm 0 1.5mm; border-collapse: collapse;
    table-layout: fixed; font-size: 9.5pt;
  }
  .contract .clauseTable th,
  .contract .clauseTable td {
    border: 0.2mm solid #000; padding: 1.2mm 1.6mm;
    vertical-align: top; text-align: left; line-height: 1.5;
    word-break: break-word; white-space: pre-line;
  }
  .contract .clauseTable th { font-weight: 600; }
  .contract .clauseTable .a-center { text-align: center; }
  .contract .clauseTable .a-right { text-align: right; }

  /* ── รายการงวดชำระ (ข้อ 3) — ต้นฉบับใช้ขีดนำหน้า ไม่ใช่จุด ────────── */
  .contract .clauseLines { margin: 1.5mm 0 1.5mm 12mm; padding: 0; list-style: none; }
  .contract .clauseLines > li { line-height: 1.65; }
  .contract .clauseLines > li::before { content: '- '; }

  .contract h2.blk { margin: 7mm 0 0; color: var(--doc-navy); font-size: 11pt; }
  /* เส้นใต้หัวหมวดต้องมีที่หายใจทั้งบนและล่าง — ตัวหนังสือชนเส้นอ่านแล้วอึดอัด
     (margin-bottom กินผลกับบล็อกถัดไปเพราะ margin ไม่ collapse ข้าม .blk ที่ตั้ง margin-top) */
  .contract h2.sectionHead { padding-bottom: 2.5mm; margin-bottom: 2mm; border-bottom: 1px solid var(--doc-line); }
  .contract h2.blk + .blk { margin-top: 2mm; }
  .contract .clause { display: grid; grid-template-columns: 20mm 1fr; gap: 2mm; }
  .contract .clauseNo { color: var(--doc-navy); font-weight: 600; font-size: 9.5pt; }
  .contract .clauseTitle { display: block; color: var(--doc-text); font-size: 9.5pt; }

  .contract .signPage > .closing + .closing { margin-top: 3.5mm; }
  /* ⭐ ช่องลงนามชิดท้ายกระดาษ (มติผู้ใช้ 2026-08-21) — ดันเฉพาะช่องลงนามลงล่าง
     ย่อหน้าปิดท้ายยังอยู่ต่อจากเนื้อตามปกติ
     ⚠️ เปิด flex ได้เฉพาะ **หลังตัดหน้าเสร็จ** (คลาส signSheet ที่สคริปต์ติดให้) —
     ถ้าเปิดตั้งแต่แรก flex จะบีบบล็อกให้พอดีแผ่น แล้วตัววัด "ล้นไหม" จะไม่มีวันจริง */
  .contract .sheet.signSheet .sheetContent { display: flex; flex-direction: column; }
  .contract .sheet.signSheet .signPage { display: flex; flex: 1; flex-direction: column; }
  .contract .sheet.signSheet .signPage .signGrid { margin-top: auto; }
  /* ระยะแถว 20mm (มติผู้ใช้ 2026-08-21) — ช่องพยานต้องห่างจากช่องคู่สัญญาพอให้
     เซ็นแล้วลายเซ็นไม่ทับกัน · ระยะคอลัมน์ยัง 8mm เพราะสองฝั่งอ่านเป็นคู่กัน */
  .contract .signGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm 8mm; margin-top: 12mm; }
  .contract .signBox { text-align: center; }
  .contract .signLine { font-size: 9.5pt; }
  .contract .signName { margin-top: 1.5mm; font-size: 9.5pt; }
  .contract .signRole { margin-top: 1mm; color: var(--doc-navy); font-size: 9.5pt; font-weight: 600; }
  .contract .signMeta { color: var(--doc-muted); font-size: 8.5pt; }
`;

/* ── สคริปต์ตัดหน้า (ฝังในไฟล์ · self-contained) ──────────────────────────
   ย้ายบล็อกจากสายเนื้อหาลงแผ่น A4 ทีละใบ โดย **วัดความสูงจริง** ไม่ใช่ประมาณ
   · หัวเอกสารพิมพ์เฉพาะแผ่นแรก (กติกาเดียวกับ PDR — ไม่งั้นเปลืองหน้าเปล่า)
   · หัวข้อ (`data-keep-next`) ห้ามค้างท้ายแผ่นโดยไม่มีบล็อกตามมา
   · บล็อกที่สูงเกินหนึ่งแผ่นได้แผ่นยืด (`tall`) แทนการถูกครอบตัด
   ⚠️ สายเนื้อหาเดิมถูกลบ **หลังสร้างแผ่นเสร็จ** เท่านั้น — สคริปต์ตายกลางทาง
      ผู้ใช้ต้องยังเห็นเอกสารครบ ไม่ใช่หน้าขาว */
export const PAGINATE_SCRIPT = `
(function () {
  function paginate() {
    var doc = document.querySelector('.contract');
    if (!doc) return;
    var flow = doc.querySelector('.flowSheet');
    var body = flow && flow.querySelector('.contractBody');
    if (!flow || !body) return;

    var headerHtml = flow.querySelector('.documentHeader').outerHTML;
    var watermarkEl = flow.querySelector('.watermark');
    var watermarkHtml = watermarkEl ? watermarkEl.outerHTML : '';
    var meta = JSON.parse(doc.getAttribute('data-footer') || '{}');
    var blocks = Array.prototype.slice.call(body.children);

    var pages = document.createElement('div');
    pages.className = 'contractPages';
    // ⚠️ ต้องอยู่ใน DOM **ก่อน** เริ่มวัด — กล่องที่ยังไม่ถูกแนบมี clientHeight = 0
    // ทุกใบ แล้วเงื่อนไข "ล้นไหม" จะเป็นเท็จเสมอ ⇒ ได้แผ่นเดียวที่เนื้อถูกครอบตัด
    doc.insertBefore(pages, flow);
    flow.style.display = 'none';

    function newPage(withHeader) {
      var page = document.createElement('article');
      // แผ่นต่อ (ไม่มีหัวใบ) ได้คลาสของตัวเอง — CSS เลือก "แผ่นที่ไม่มีหัวใบ" ตรง ๆ ไม่ได้
      page.className = withHeader ? 'sheet' : 'sheet contPage';
      page.setAttribute('aria-label', meta.title || 'สัญญา');
      page.innerHTML = watermarkHtml + (withHeader ? headerHtml : '')
        + '<div class="sheetContent"></div>'
        + '<footer class="footer"><span></span><span></span><span></span></footer>';
      pages.appendChild(page);
      return page;
    }

    var page = newPage(true);
    var content = page.querySelector('.sheetContent');
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      content.appendChild(block);
      if (content.scrollHeight <= content.clientHeight) continue;

      // ล้นแผ่น: ถอยบล็อกนี้ (พร้อมหัวข้อที่ต้องไปด้วยกัน) ไปเริ่มแผ่นใหม่
      var moving = [block];
      var prev = block.previousElementSibling;
      if (prev && prev.getAttribute('data-keep-next') === '1') moving.unshift(prev);
      for (var m = 0; m < moving.length; m += 1) content.removeChild(moving[m]);

      if (!content.children.length) {
        // บล็อกเดียวสูงเกินหนึ่งแผ่น — ให้แผ่นนี้ยืด ดีกว่าครอบตัดข้อสัญญาทิ้ง
        page.classList.add('tall');
        for (var t = 0; t < moving.length; t += 1) content.appendChild(moving[t]);
        continue;
      }
      page = newPage(false);
      content = page.querySelector('.sheetContent');
      for (var k = 0; k < moving.length; k += 1) content.appendChild(moving[k]);
    }

    var signBlock = pages.querySelector('.signPage');
    if (signBlock) signBlock.closest('.sheet').classList.add('signSheet');

    var list = pages.querySelectorAll('.sheet');
    for (var f = 0; f < list.length; f += 1) {
      var cells = list[f].querySelectorAll('.footer span');
      cells[0].textContent = meta.company || '';
      cells[1].textContent = meta.number || '';
      cells[2].textContent = 'หน้า ' + (f + 1) + ' / ' + list.length;
    }
    flow.parentNode.removeChild(flow);
  }

  function run() {
    try {
      paginate();
    } catch (error) {
      // ตัดหน้าไม่สำเร็จ = คืนสายเนื้อหาให้เห็นครบทั้งฉบับ ไม่ใช่ปล่อยหน้าขาว
      var doc = document.querySelector('.contract');
      var pages = doc && doc.querySelector('.contractPages');
      var flow = doc && doc.querySelector('.flowSheet');
      if (pages) pages.parentNode.removeChild(pages);
      if (flow) flow.style.display = '';
    }
  }

  // ⚠️ ต้องรอฟอนต์โหลดก่อนวัด — ฟอนต์สำรองความสูงคนละค่ากับ Sarabun ที่ฝังไว้
  // วัดก่อนฟอนต์พร้อม = ตัดหน้าตามความสูงที่ไม่ใช่ของจริง
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  else if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
`;


/* ── แถบเครื่องมือของหน้าพรีวิว ────────────────────────────────────────────
   ปุ่มพิมพ์มาจากเปลือกอยู่แล้ว · ที่เพิ่มคือปุ่มสลับภาษาแบบเดียวกับใบเสนอราคา
   ⚠️ **อังกฤษยังเทาไว้** (มติผู้ใช้ 2026-08-21) — ยังไม่มีต้นฉบับสัญญาภาษาอังกฤษ
   ปุ่มที่กดแล้วได้เอกสารครึ่งไทยครึ่งอังกฤษแย่กว่าปุ่มที่กดไม่ได้แล้วบอกเหตุผล
   ⇒ ปุ่มมี `disabled` + `title` อธิบาย ไม่ใช่ซ่อนทิ้ง (ซ่อน = ไม่มีใครรู้ว่าจะมี) */
export function contractToolbarControls() {
  return '<div class="langSwitch" role="group" aria-label="ภาษาเอกสาร">'
    + '<button type="button" data-lang="th" aria-pressed="true">ไทย</button>'
    + '<button type="button" data-lang="en" aria-pressed="false" disabled'
    + ' title="ยังไม่มีต้นฉบับสัญญาภาษาอังกฤษ">English</button>'
    + '</div>';
}

// options.toolbar = false → ไม่ใส่แถบปุ่มพิมพ์ (ตอนฝังเป็นพรีวิวใน iframe/ตรึงเป็น snapshot)
// ⚠️ ตอน "ออกสัญญา" ต้องเรียกด้วย toolbar: false เสมอ — HTML ที่ตรึงไว้คือกระดาษ
//    ไม่ใช่หน้าจอ (แถบปุ่มเป็น no-print ก็จริง แต่มันไม่ควรอยู่ในหลักฐาน)

/* ── บล็อกที่เติมจากใบเสนอราคา ─────────────────────────────────────────────
   ⭐ **สัญญาทุกฉบับออกจากใบเสนอราคา** (มติผู้ใช้ 2026-09-03) ⇒ ตารางและงวดชำระ
     ในสัญญาบริการอ่านจากใบที่ผูกไว้ ไม่ใช่ให้คนพิมพ์มือซ้ำกับที่เสนอราคาไปแล้ว
   🪤 **วันที่ของงวดอยู่ในช่อง `note` เป็นข้อความอิสระ** — `paymentPlan.installments`
      มีแค่ `no · label · percent · amount · note` (ตรวจแล้วทั้ง 312 ใบบน production)
      ⇒ พิมพ์ `note` ตามที่กรอกไว้ ห้ามแปลง/จัดรูปแบบใหม่ · ที่ต้นฉบับเขียนว่า
        "ชำระงวดที่ 1 วันที่ 17 สิงหาคม 2569 จำนวน 7,639.80 บาท (ก่อนการติดตั้ง)"
        คือ label + note ของงวดนั้นประกอบกัน ไม่ใช่ฟิลด์วันที่ที่ไหน
   ⚠️ ใบที่ชำระเต็มจำนวน (`type: 'full'`) ไม่มีงวด ⇒ คืนอาเรย์ว่าง ไม่ใช่แถวเปล่า */
export function contractQuotationBlocks(quotation, contract = null) {
  const plan = quotation?.paymentPlan || null;
  const rows = plan?.type === 'installment' ? (plan.installments || []) : [];
  /* ⚠️ **มูลค่าเป็นทศนิยม 2 ตำแหน่งเสมอ** (มติผู้ใช้ 2026-09-03)
     🪤 ต้นฉบับ .docx เขียนค่าบริการในตารางว่า `35,700` ไม่มีทศนิยม — **อย่าแก้ตาม**
        ผมเคยเปลี่ยนให้ตรงต้นฉบับแล้วผู้ใช้ตีกลับ: ตัวเลขเงินบนเอกสารของระบบเป็น
        ทศนิยม 2 ตำแหน่งทั้งหมด ต้นฉบับที่พิมพ์มือไว้ไม่ใช่มาตรฐานที่ต้องลอก */
  const money = (n) => fmtNumber(Number(n) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const quotationInstallments = rows.map((row) => [
    row?.label || `ชำระงวดที่ ${row?.no ?? ''}`.trim(),
    /* note เป็นได้ทั้งวันที่ ("วันที่ 17 กันยายน 2569") และเงื่อนไข ("ก่อนการติดตั้ง")
       ⇒ วางตามต้นฉบับ: วันที่ต่อท้ายป้าย · เงื่อนไขอยู่ในวงเล็บท้ายบรรทัด */
    /^\s*วันที่/.test(String(row?.note || '')) ? String(row.note).trim() : '',
    `จำนวน ${money(row?.amount)} บาท`,
    /^\s*วันที่/.test(String(row?.note || '')) || !String(row?.note || '').trim()
      ? '' : `(${String(row.note).trim()})`,
  ].filter(Boolean).join(' '));

  /* ตารางข้อ 2 — หนึ่งแถวต่อหนึ่งใบเสนอราคาที่สัญญาอ้างถึง
     ⚠️ ระบบผูกสัญญากับใบเดียว ⇒ แถวเดียวเสมอในวันนี้ · โครงรองรับหลายแถวไว้แล้ว
        เพราะต้นฉบับมีคอลัมน์ "ลำดับ" ซึ่งมีความหมายก็ต่อเมื่อมีได้หลายแถว */
  /* ⭐ **ช่อง "รายละเอียด" ดึงจากบรรทัดใบเสนอราคา** (มติผู้ใช้ 2026-09-04)
     ต้นฉบับ .docx เขียน `ระบบกระจายกลิ่น 1 Package` ซึ่งเป็นคำบรรยายบรรทัดที่ SA
     พิมพ์ไว้บนใบ (`quotation_lines.description` ของจริงมีรูป `... · 1 package`)
     ⇒ ไม่ใช่ช่องกรอก `{{serviceKind}}` ซึ่งเป็นคำกว้าง ๆ ของสัญญาทั้งฉบับ
     ⚠️ **ตกกลับไปที่ `{{serviceKind}}` เมื่อใบไม่มีบรรทัด** — ใบเก่า/ใบที่โหลดบรรทัด
        ไม่ได้ต้องไม่ทำให้ช่องนี้กลายเป็นเส้นว่างบนสัญญาที่ลูกค้าเซ็น
     ⚠️ บรรทัดหลายรายการซ้อนกันในเซลล์เดียว (ตัดบรรทัดด้วย `white-space: pre-line`)
        ไม่ใช่แถวละบรรทัด — คอลัมน์ที่เหลือของตารางเป็นค่าระดับ *ใบ* ทั้งหมด
        (เลขที่ใบ · ระยะเวลา · ค่าบริการรวม) แตกเป็นหลายแถวแล้วต้องซ้ำค่าเดิมทุกแถว */
  const lineDetail = (quotation?.lines || [])
    .map((line) => String(line?.description || '').trim())
    .filter(Boolean)
    .join('\n');
  const quotationLines = quotation ? [{
    no: '1',
    quoteNumber: quotation.quoteNumber || '',
    period: '{{serviceStartTh}} - {{serviceEndTh}}',
    detail: `${lineDetail || '{{serviceKind}}'}\n{{clientBranch}}`,
    term: '{{termMonths}} เดือน',
    amount: quotation.subtotal != null ? money(quotation.subtotal) : '',
    machines: '{{machineCount}}',
  }] : [];

  return { quotationInstallments, quotationLines, quotationNo: quotation?.quoteNumber || contract?.quotationId || '' };
}

export function buildContractHTML(contract, { company = {}, quotation = null, options = {} } = {}) {
  const template = contractTemplate(contract?.kind);
  if (!template) throw new Error(`buildContractHTML: ไม่มีแม่แบบของสัญญาชนิด ${contract?.kind}`);

  const values = contractTokenValues(contract, { company, template });
  const blocks = contractQuotationBlocks(quotation, contract);
  values.quotationNo = blocks.quotationNo || values.quotationNo || '';
  const titleTh = CONTRACT_KIND_DOC_TITLES[contract.kind] || template.titleTh;

  const header = documentHeader({
    company: {
      nameTh: company.legalNameTh,
      nameEn: company.legalNameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    /* ⚠️ ไม่พิมพ์บรรทัดรุ่นแม่แบบบนกระดาษ (มติผู้ใช้ 2026-08-21) — สัญญาไม่ใช่แบบฟอร์ม
       ควบคุมที่ต้องโชว์รหัส/รุ่นให้ลูกค้าเห็น · รุ่นที่ใช้ออกใบยังตามได้จาก
       `sales_contracts.templateVersion` ซึ่งบันทึกตอนกดออกสัญญา */
    formLine: null,
    /* ⭐ ชื่อเอกสารย้ายลงไปอยู่ **กลางหน้าเนื้อหา** ตามต้นฉบับ (มติผู้ใช้ 2026-08-20)
       เปลือกยังต้องได้ค่านี้ไปทำ aria/โครงหัวใบ แต่ถูกซ่อนด้วย CSS ของเอกสารนี้ */
    titleTh,
    titleEn: null,
    rows: [
      { label: 'เลขที่สัญญา', value: contract.contractNo || 'ฉบับร่าง' },
      /* วันที่บนหัวใบเป็นรูปสั้น DD/MM/พ.ศ. (มติผู้ใช้ 2026-08-21) — คนละรูปกับใน
         ตัวสัญญาที่เขียนเต็มคำ ("29 เดือน มิถุนายน พ.ศ. 2569") โดยตั้งใจ:
         หัวใบไว้กวาดตาหา ตัวสัญญาไว้อ่านเป็นประโยค · ค่าเดียวกัน แหล่งเดียวกัน */
      { label: 'วันที่สัญญา', value: thaiShortDate(contract.contractDate) },
      { label: 'อ้างอิงใบเสนอราคา', value: quotation?.quoteNumber || contract.metadata?.quoteNumber },
    ],
  });

  // ร่าง = ลายน้ำ "ฉบับร่าง" · ยกเลิก = ลายน้ำ "ยกเลิก" (กติกาเดียวกับเอกสารอื่น)
  const watermark = watermarkBlock(
    contract.status === 'cancelled' ? 'ยกเลิก' : (!contract.contractNo ? 'ฉบับร่าง' : null),
  );

  /* สายเนื้อหา = แผ่นเดียวที่ยืดตามเนื้อ · สคริปต์จะตัดเป็นแผ่น A4 ให้ทีหลัง
     (บล็อกทุกก้อนมีคลาส `blk` เพื่อให้ย้ายลงแผ่นได้อิสระ) */
  const flow = `
    <article class="sheet flowSheet" aria-label="${esc(titleTh)}">
      ${watermark}
      ${header}
      <div class="sheetContent">
        <div class="contractBody">
          <h1 class="blk docTitle" data-keep-next="1">${esc(titleTh)}</h1>
          ${template.intro.map((text) => `<div class="blk intro">${paragraph(text, values)}</div>`).join('')}
          ${definitionsBlock(template, values)}
          ${template.sections.map((section) => sectionBlock(section, values, blocks)).join('')}
          ${closingWithSignatures(template, values)}
        </div>
      </div>
    </article>`;

  // ท้ายกระดาษทุกแผ่น: ชื่อบริษัท · เลขที่สัญญา · เลขหน้า — สคริปต์เติมให้ตอนตัดหน้า
  const footerMeta = JSON.stringify({
    company: company.legalNameTh || '',
    number: contract.contractNo ? `เลขที่ ${contract.contractNo}` : 'ฉบับร่าง',
    title: titleTh,
  });

  return renderDocumentHTML({
    title: documentFileName(contract.contractNo || 'ร่างสัญญา', contract.customerName, contract.metadata?.dealTitle),
    /* สีเดียวกับใบเสนอราคา (มติผู้ใช้ 2026-08-21) — สัญญากับใบเสนอราคาเป็นเอกสาร
       คู่กันในสายตาลูกค้า (ออกสัญญาจากใบที่อนุมัติ) จึงใช้สีเดียวกันทั้งคู่
       ⚠️ ห้ามกลับไป navy — #1f3551 เกือบเท่าสีตัวหนังสือ (#202833) ใส่แล้วไม่ต่าง */
    accentKey: 'terracotta',
    variantClass: 'contract',
    dataAttrs: ` data-footer='${esc(footerMeta).replace(/'/g, '&#39;')}'`,
    extraCss: CONTRACT_CSS,
    toolbar: options.toolbar === false ? null : {
      label: `${titleTh} ${contract.contractNo || '(ฉบับร่าง)'}`,
      button: 'พิมพ์เอกสาร',
      controlsHtml: contractToolbarControls(),
    },
    pages: flow,
    script: PAGINATE_SCRIPT,
  });
}
