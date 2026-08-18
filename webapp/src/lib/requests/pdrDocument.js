// ── เอกสาร PDR (FM-RD-01) — ใช้เปลือกเอกสารกลางเหมือน QT/SO ─────────────
//
// ⭐ **หน้าตาตรงกับฟอร์มกระดาษเดิม** — คนที่เคยใช้กระดาษเปิดมาแล้วต้องอ่านได้ทันที
// ไม่ใช่เอกสารหน้าใหม่ที่ต้องเรียนรู้ซ้ำ ⇒ เลขข้อ (1.1, 2.8) · หัวข้อภาษาอังกฤษ ·
// ช่องติ๊กที่พิมพ์ **ทุกตัวเลือก** ไม่ใช่เฉพาะที่เลือก ล้วนมาจากกระดาษจริงทั้งหมด
//
// ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** เหมือน QT/SO ⇒ ปุ่มต้องเขียนว่า
// "ดูฉบับที่ออกจริง" ไม่ใช่ "ดาวน์โหลด"
import {
  documentFooter, documentHeader, esc, renderDocumentHTML,
} from '@/lib/documents/documentShell';
import {
  resolveDocumentAccentKey, resolveDocumentForm, resolveDocumentTitleTh,
} from '@/lib/documentStandards';
import { SCENTOTYPES, SCENT_PERFORMANCE } from '@/lib/requests/kinds/rd/scentBriefTypes';
import { PDR_SECTIONS, pdrFieldText, pdrSectionGroups } from '@/lib/requests/pdrFields';
import { PDR_TARGET_KINDS } from '@/lib/requests/pdrTargets';
import { categoryLabel } from '@/lib/master/categoryOf';
import { fmtNumber } from '@/lib/format';

const PDR_KEY = 'pdr';

// สถานะในระบบ → คำบนกระดาษ (มติผู้ใช้: ใช้สถานะของเราเป็นตัวจริง แล้วแปลตอนพิมพ์
// ⇒ คนอ่านกระดาษเห็นคำที่คุ้น คนใช้ระบบเห็นขั้นที่ละเอียดกว่า ไม่มีใครต้องติ๊กเอง)
const PAPER_STATUS = [
  ['Open', ['pending']],
  ['In Progress', ['acknowledged']],
  ['Sample Sent', ['answered']],
  ['Closed', ['closed']],
];

// หัวข้อบนกระดาษ — ภาษาอังกฤษล้วนตามต้นฉบับ FM-RD-01 · หัวข้อที่ไม่มีบนกระดาษ
// (ผู้เซ็น) ใช้คำอังกฤษของตารางลายเซ็นแทน
const PAPER_HEADINGS = {
  request: 'Request Information',
  customer: '1. Customer Information',
  spec: '2. Product Specifications',
  regulatory: 'Regulatory & Compliance Requirements',
};

const TICK_ON = '☑';
const TICK_OFF = '☐';
const LINE = '<span class="fill"></span>';

// ⭐ **ช่องที่ไม่ได้กรอก พิมพ์ว่า N/A** (มติผู้ใช้ 2026-08-07) — เดิมพิมพ์เป็นเส้นให้
// เขียนมือ ซึ่งอ่านกำกวม: เส้นว่างแปลว่า "ยังไม่กรอก" หรือ "ไม่เกี่ยวกับใบนี้" ก็ได้
// · N/A บอกชัดว่า **ระบบถามแล้วแต่ไม่มีคำตอบ** ⇒ RD อ่านแล้วรู้ทันทีว่าต้องไปถามต่อ
// ⚠️ **ยกเว้นช่องลายเซ็นกับวันที่** — สองช่องนั้นเว้นไว้ให้เซ็นมือบนกระดาษเสมอ
// พิมพ์ N/A ทับเมื่อไรก็เซ็นไม่ได้ (ยังใช้ `LINE` อยู่ ดูตารางลายเซ็นข้างล่าง)
const NA = '<span class="na">N/A</span>';
const cell = (v) => (v == null || String(v).trim() === '' ? NA : esc(v));

// ── ต้นทุนความสูงต่อบล็อก (หน่วยเป็นมิลลิเมตรบนกระดาษ A4) ─────────────────
//
// ⚠️ **วัดจากหน้าที่เรนเดอร์จริงในเบราว์เซอร์ ไม่ใช่คำนวณจากสูตร** (แนวเดียวกับ
// BILL_LINES_* ของใบแจ้งชำระภาษี) — แก้ CSS ของ `.pdr` เมื่อไรต้องวัดใหม่ทั้งชุด
//
// วิธีวัด: เปิดพรีวิว แล้วอ่าน **`offsetHeight`** ของแถว/บล็อกแต่ละชนิด หารด้วย 96/25.4
// 🐞 **ห้ามใช้ `getBoundingClientRect()`** — เปลือกย่อเอกสารด้วย `zoom` ตามความกว้างจอ
// (ZOOM_LADDER) rect จึงคืนค่าที่ย่อแล้ว · วัดครั้งแรกด้วย rect ตอน zoom .74 ได้เลขเล็ก
// กว่าจริง 1.35 เท่า ตั้งต้นทุนตามนั้นแล้วหน้าแรกล้น 254mm โดยไม่มีใครเห็น
//
// ⚠️ ล้นหน้าแล้ว **เนื้อหาหายเงียบ** เพราะ `.sheet` ของเปลือกเป็น `overflow: hidden`
// ⇒ ต้นทุนที่ตั้งต่ำเกินจริงไม่ได้แค่ทำให้หน้าดูแน่น แต่กินข้อมูลทิ้ง
//
// ── รอบวัด 2026-08-14 · หัวใบ 2 แถว (ถอด "ลูกค้า" ออก) · line-height 1.65 ──
// พื้นที่จริงต่อแผ่น: กล่อง `.sheetContent` 222.25mm หัก padding ของมันเอง
// (บน 5mm + ล่าง 4mm) เหลือ **213.25mm** ⇒ ตั้งงบไว้ 206mm เผื่อความคลาดเคลื่อน
// ของการตัดบรรทัดภาษาไทยที่เดาความกว้างไม่ได้แน่นอน (ระยะเผื่อ 7.25mm เท่ารอบก่อน)
//
// (รอบก่อน · หัวใบ 3 แถว · line-height 1.45-1.5: กล่อง 232.8 เหลือ 223.8 ⇒ งบ 216)
//
// ⚠️ **จำนวนแถวบนหัวใบเปลี่ยน = พื้นที่ต่อแผ่นเปลี่ยน** ต้องวัดใหม่ทุกครั้ง ·
// เคยเพิ่มแถวจนพื้นที่จริงเหลือ 215.4mm ทั้งที่งบยังตั้ง 217 — รอดมาได้เพราะโมเดล
// ต้นทุนประเมินสูงกว่าจริง ซึ่งเป็นความบังเอิญ ไม่ใช่ความปลอดภัย · และตอนถอดแถวออก
// ถ้าไม่ปรับกลับ งบที่ต่ำเกินจะกินหน้าเปล่าเพิ่มมาทั้งแผ่น
// ⚠️ แก้ padding ของ `.sheetContent` ก็ต้องหักเหมือนกัน — ระยะที่ไม่ได้หักคือระยะที่
// โมเดลไม่รู้ว่ามีอยู่ แล้วแผ่นจะล้นเงียบ ๆ (`.sheet` เป็น overflow: hidden)
//
// ── ⭐ **หัวเอกสารพิมพ์เฉพาะแผ่นแรก** (IS-26080030 · RD แจ้งเอง 2026-08-18) ──
// "ไม่ต้องแสดงผลหัวเอกสารในทุกหน้ากระดาษ ให้แสดงเฉพาะหน้าแรก เพื่อลดจำนวนหน้ากระดาษลง"
// ⇒ **งบต่อแผ่นมีสองค่า** แผ่นแรกเสียที่ให้หัวเอกสาร แผ่นถัดไปไม่เสีย
// 🪤 ถ้าตัดหัวออกแต่ยังใช้งบก้อนเดียว แผ่นหลังจะเว้นที่ว่างไว้เท่าความสูงหัวเอกสารทุกแผ่น
// = ตัดหัวไปแล้วแต่ไม่ได้หน้าคืนสักแผ่น ซึ่งเป็นเป้าหมายทั้งหมดของเรื่องที่แจ้งมา
//
// ── รอบวัด 2026-08-19 (headless Chrome · zoom 1 · ใบตัวอย่าง 6 แผ่น) ──
//   หัวเอกสาร (`.documentHeader` รวม padding-bottom + เส้นคั่น)  53.71mm
//   `.sheetContent` แผ่นที่มีหัว   222.25mm  ⇒ หัก padding เอง (5+4) = 213.25 ⇒ งบ 206
//   `.sheetContent` แผ่นที่ไม่มีหัว 275.96mm  ⇒ หัก padding เอง (5+4) = 266.96 ⇒ งบ 259
// ระยะเผื่อ 7.25mm เท่ากันทั้งสองค่า (กันการตัดบรรทัดภาษาไทยที่เดาความกว้างไม่ได้แน่)
const PAGE_MM = 206;
const PAGE_REST_MM = 259;

// ความสูงหัวเอกสารที่วัดได้ (53.71mm) = ส่วนต่างของงบสองค่า — เปิดให้เทสต์ยึดไว้
// เพื่อไม่ให้มีใครตัดหัวออกแล้วลืมคืนพื้นที่ให้แผ่นหลัง (แล้วจำนวนหน้าไม่ลดสักแผ่น)
export const PDR_PAGE_BUDGET_MM = { first: PAGE_MM, rest: PAGE_REST_MM };
const COST = {
  // หัวข้อ 6.09mm + margin บนล่าง 6.6mm
  heading: 12.7,
  row: 7.95,
  // ตัวเลือกแบบติ๊ก — วัดจาก 2 ตัว 12.7mm · 4 ตัว 22.49mm · 6 ตัว 37.04mm
  // (บรรทัดละ 4.76mm · ตัวเลือกที่ป้ายยาวตกบรรทัดจึงเผื่อไว้เกินความสูงหนึ่งบรรทัด)
  optionBase: 2.7,
  option: 5,
  // ช่อง "ติ๊กแล้วเขียนต่อ" (สามช่องรวมเป็นข้อเดียว วัดได้ 29.63mm)
  tick: 9.9,
  // คำขยายใต้ค่า (โน้ตข้อ 1.11 · hint ของ Target Cost) ดันแถวเป็นสองบรรทัด
  note: 4.8,
  // กล่องบรีฟกลิ่น — วัดได้ 90mm พอดีที่ข้อความสั้น (บรีฟยาววัดได้ 99.7 แต่ `wrapCost`
  // บวกให้เกินพออยู่แล้ว) · เผื่ออีก 3mm เพราะคอลัมน์ขวา (2.1.1-2.1.5) สูงขึ้นได้เอง
  // จากโน้ตของ scentotype ซึ่ง `wrapCost` ฝั่งซ้ายมองไม่เห็น
  brief: 93,
  // ตาราง 60.85mm + หัวข้อของตัวเอง 12.7mm
  signatures: 73.6,
  status: 7.9,
};

// ข้อความยาวตกบรรทัด — ช่องค่ากว้าง ~118mm ที่ 8.4pt ≈ 75 ตัวอักษรไทยต่อบรรทัด
const wrapCost = (text) => Math.max(0, Math.ceil(String(text || '').length / 75) - 1) * COST.note;

// ── ชิ้นส่วนที่พิมพ์ในช่องค่า ─────────────────────────────────────────────
//
// ⭐ **พิมพ์ทุกตัวเลือกเสมอ ไม่ใช่เฉพาะที่เลือก** — กระดาษมีช่องติ๊กครบทุกตัว คนอ่าน
// จึงเห็นด้วยว่า "ตัวเลือกอะไรบ้างที่ไม่ได้เลือก" ซึ่งเป็นข้อมูลคนละอย่างกับค่าที่กรอก
// (เดิมพิมพ์เป็นข้อความคั่นจุด "ขวด · ฝา" ⇒ อ่านไม่ออกว่ามีตัวเลือกอะไรอีก)
function optionList(options = [], raw) {
  const picked = new Set(
    Array.isArray(raw) ? raw : [raw].filter((v) => v != null && String(v).trim() !== ''),
  );
  return `<ul class="opts">${options
    .map((o) => `<li${picked.has(o.value) ? ' class="on"' : ''}>${picked.has(o.value) ? TICK_ON : TICK_OFF} ${esc(o.label)}</li>`)
    .join('')}</ul>`;
}

// ช่อง "ติ๊กแล้วเขียนต่อ" (1.10 · 2.9) — ติ๊กเองตามว่ามีข้อความหรือยัง ไม่มีคอลัมน์
// เก็บสถานะติ๊กแยก · ว่าง = เส้นให้เขียนมือ ไม่ใช่ N/A เพราะบรรทัดนี้ตั้งใจให้เขียนต่อได้
function tickLine(field, text) {
  const on = text != null && String(text).trim() !== '';
  return `<div class="tick">
    <span class="tickHead">${on ? TICK_ON : TICK_OFF} ${esc(field.label)}${field.hint ? ` <em>(${esc(field.hint)})</em>` : ''}</span>
    <span class="tickText">${on ? esc(text) : LINE}</span>
  </div>`;
}

function fieldValueHtml(field, request, context) {
  if (field.type === 'select' || field.type === 'multi') {
    return optionList(field.options || [], request[field.column]);
  }
  const text = pdrFieldText(field, request, context);
  if (field.type === 'tick') return tickLine(field, text);
  return cell(text);
}

function fieldValueCost(field, request, context) {
  if (field.type === 'select' || field.type === 'multi') {
    return COST.option * (field.options || []).length;
  }
  if (field.type === 'tick') return COST.tick + wrapCost(pdrFieldText(field, request, context));
  return COST.row + (field.hint ? COST.note : 0) + wrapCost(pdrFieldText(field, request, context));
}

// แถวหนึ่งของตาราง = หนึ่ง "ข้อ" บนกระดาษ (บางข้อมีหลายช่องอยู่ในกล่องเดียว)
//
// ⚠️ ช่องที่ประกาศ `inHeader` ในทะเบียนถูกพิมพ์ไว้บนหัวใบแล้ว ⇒ คืน `tr: null` ให้
// ผู้เรียกข้ามไป · พิมพ์ซ้ำในตารางด้วยอ่านแล้วเหมือนเป็นคนละค่ากัน
function groupRow(group, request, context) {
  if (group.fields.every((f) => f.inHeader)) return { tr: null, cost: 0 };
  // ⭐ `docLabel` = ป้ายเฉพาะบนกระดาษ (เช่น "ดีล" บนจอ → "โครงการ" บนเอกสาร)
  const title = (group.fields.length === 1 && group.fields[0].docLabel) || group.title;
  const head = `${group.no ? `<span class="no">${esc(group.no)}</span>` : ''}${esc(title)}`;
  // ช่องเดี่ยวที่มี hint (เช่นโน้ตสีแดงข้อ 1.11) — กระดาษเขียนโน้ตไว้ในช่องค่า
  const single = group.fields.length === 1 ? group.fields[0] : null;
  const note = single && single.type !== 'tick' && single.hint
    ? `<span class="note">${esc(single.hint)}</span>` : '';
  const body = group.fields.map((f) => fieldValueHtml(f, request, context)).join('');
  // ⚠️ ขอบบนล่างของช่องคิด **ครั้งเดียวต่อแถว** ไม่ใช่ต่อช่องที่อยู่ในแถวเดียวกัน ·
  // ต้นทุนของแถวข้อความธรรมดา (COST.row) รวมขอบไว้แล้วจึงไม่บวกซ้ำ
  const stacked = group.fields.some((f) => ['select', 'multi', 'tick'].includes(f.type));
  const cost = (stacked ? COST.optionBase : 0)
    + group.fields.reduce((sum, f) => sum + fieldValueCost(f, request, context), 0);
  return { tr: `<tr><th>${head}</th><td>${body}${note}</td></tr>`, cost };
}

// ── 2.2 / 2.3 · ต้นทุนและราคาขายเป้าหมาย รายสินค้า (mig 0229) ────────────
//
// ⭐ **บนจอกรอกเป็นตารางเดียว แต่บนกระดาษแยกสองข้อ** (มติผู้ใช้ 2026-08-10) —
// ฟอร์ม FM-RD-01 นับข้อ 2.2 กับ 2.3 แยกกัน · รวมเป็นข้อเดียวบนกระดาษเมื่อไร เลขข้อ
// ของทั้งแผ่นจะเลื่อนไม่ตรงกับต้นฉบับที่ทุกคนถืออยู่
//
// ⚠️ ใบที่ยังไม่มีรายการต้องได้กล่อง N/A เหมือนช่องอื่น ไม่ใช่หายไปทั้งข้อ — กระดาษที่
// พิมพ์ออกไปต้องบอกได้ว่า "ถามแล้วแต่ยังไม่มีคำตอบ"
function targetRows(request, categoryName) {
  const list = Array.isArray(request.targets) ? request.targets : [];
  const money = (v) => (v == null || v === '' ? null : fmtNumber(v));

  const costLines = list.map((t) => {
    const parts = [];
    for (const kind of PDR_TARGET_KINDS) {
      if (!t[kind.onField]) continue;
      const price = money(t[kind.priceField]);
      const note = String(t[kind.noteField] || '').trim();
      parts.push(`${kind.label}${note ? ` ${note}` : ''}${price ? ` ${price} บาท/Kg` : ''}`);
    }
    return parts.length ? `${categoryName(t.categoryCode)} — ${parts.join(' · ')}` : null;
  }).filter(Boolean);

  const unitLines = list.map((t) => {
    const price = money(t.pricePerUnit);
    return price ? `${categoryName(t.categoryCode)} — ${price} บาท/ชิ้น` : null;
  }).filter(Boolean);

  const row = (no, label, lines) => ({
    tr: `<tr><th><span class="no">${esc(no)}</span>${esc(label)}</th><td>${
      lines.length ? `<ul class="opts">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : cell(null)
    }</td></tr>`,
    cost: COST.row + COST.note * Math.max(0, lines.length - 1),
  });

  return [
    row('2.2', 'Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)', costLines),
    row('2.3', 'Target Price / Unit (ราคาขาย)', unitLines),
  ];
}

// ── 2.1 บรีฟกลิ่น — สองคอลัมน์เหมือนกระดาษ ───────────────────────────────
//
// ⭐ กระดาษวาง "กลิ่นที่ต้องการ / บรีฟกลิ่น" ไว้คอลัมน์ซ้าย แล้ว 2.1.1–2.1.5 เรียงลง
// คอลัมน์ขวาในกล่องเดียวกัน — เรียงเป็นแถวเดี่ยวเหมือนหัวข้ออื่นจะอ่านคนละจังหวะกับกระดาษ
//
// ⚠️ Scentotype (2.1.4) และ Performance (2.1.5) พิมพ์ครบทุกตัวเลือกพร้อมช่องติ๊ก ·
// 2.1.4 มีเส้นให้เขียนต่อหลังทุกตัวบนกระดาษ ⇒ ตัวที่ติ๊กแล้วพิมพ์ข้อความต่อท้าย (mig 0222)
function briefBlock(brief = {}, index = 0, total = 1) {
  const title = total > 1 ? `2.1 บรีฟกลิ่นที่ ${index + 1}` : '2.1 กลิ่นที่ต้องการ / บรีฟกลิ่น';
  const picked = new Set(brief.scentotypes || []);
  const notes = brief.scentotypeNotes || {};
  const scentotypes = `<ul class="opts">${SCENTOTYPES.map((t) => {
    const on = picked.has(t.value);
    const note = on ? String(notes[t.value] || '').trim() : '';
    return `<li${on ? ' class="on"' : ''}>${on ? TICK_ON : TICK_OFF} ${esc(t.label)} ${note ? esc(note) : LINE}</li>`;
  }).join('')}</ul>`;

  const sub = (no, label, value) => `<div class="sub">
    <span class="subHead"><span class="no">${esc(no)}</span>${esc(label)}</span>
    <span class="subBody">${cell(value)}</span>
  </div>`;

  return `<section class="briefBlock">
    <div class="briefLeft">
      <h4>${esc(title)}${brief.label ? ` — ${esc(brief.label)}` : ''}</h4>
      <p class="briefText">${cell(brief.brief)}</p>
      <div class="sub">
        <span class="subHead">หากต้องการให้ทำวิจัย ระบุ</span>
        <span class="subBody">${cell(brief.researchTopic)}</span>
      </div>
    </div>
    <div class="briefRight">
      ${sub('2.1.1', 'แรงบันดาลใจ (Why แก่นของแบรนด์)', brief.inspiration)}
      ${sub('2.1.2', 'ช่วงกลิ่นที่ชื่นชอบ', brief.likedNotes)}
      ${sub('2.1.3', 'กลิ่นที่ End-user ไม่ชอบ', brief.dislikedNotes)}
      <div class="sub">
        <span class="subHead"><span class="no">2.1.4</span>Scentotype</span>
        ${scentotypes}
      </div>
      <div class="sub">
        <span class="subHead"><span class="no">2.1.5</span>Performance ของกลิ่น</span>
        ${optionList(SCENT_PERFORMANCE, brief.performance)}
      </div>
    </div>
  </section>`;
}

const briefCost = (brief = {}) => COST.brief
  + wrapCost(brief.brief) + wrapCost(brief.inspiration) + wrapCost(brief.likedNotes);

// ตารางลายเซ็น 7 แถว — ชื่อเติมจากที่ระบบรู้ ที่เหลือกรอกในฟอร์ม PDR (mig 0221)
//
// ⚠️ ผูกกับ **ตำแหน่ง ไม่ใช่ชื่อคนที่พิมพ์ไว้ในกระดาษ** — ชื่อที่ฝังในแม่แบบจะค้าง
// ทันทีที่คนเปลี่ยนงาน · **แถวแรกแถวเดียว**ที่มาจากแถวคำร้อง (ระบบรู้ว่าใครเปิดใบ)
// ที่เหลือเป็น **ชื่อบนกระดาษ** ที่กรอกเองต่อใบ ไม่ใช่ role ในระบบ (ม-45)
//
// 🐞 **แถว AE Supervisor เคยเป็นแถวที่สองที่ระบบเติมให้** จาก `approvedByName` ของ
// ประตูหัวหน้า (mig 0216) · ถอดขั้นนั้นทั้งขั้นใน ม-121 แล้วไม่มีใครเขียนคอลัมน์นั้น
// อีก ⇒ `cell()` พิมพ์ `N/A` ค้างทุกใบ และไม่มีช่องไหนบนฟอร์มกรอกมันได้
// ⇒ ย้ายเข้าชุด `signers` (ม-124 · mig 0261) กรอกได้เหมือนอีก 5 แถว
//
// ⚠️ ป้ายตำแหน่งของแถวที่กรอกเองทั้งหมด **อ่านจากทะเบียน `pdrFields.js`** ไม่สะกด
// ซ้ำที่นี่ — เปลี่ยนชื่อตำแหน่งแล้วต้องเปลี่ยนพร้อมกันทั้งฟอร์ม จอ และกระดาษ
// ⚠️ **ลำดับแถวบนกระดาษ = ลำดับในทะเบียน** ไม่ได้เรียงที่นี่
const SIGNER_SECTION = PDR_SECTIONS.find((s) => s.key === 'signers');
const SIGN_ROWS = [
  ['Account Executive', 'requestedByName'],
  ...(SIGNER_SECTION?.fields || []).map((f) => [f.label, f.column]),
];

const signatureBlock = (request) => `<section class="blk">
  <h3>Final Review &amp; Approval</h3>
  <table class="sign">
    <thead><tr><th>Role / Department</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
    <tbody>${SIGN_ROWS.map(([role, field]) => `<tr>
      <td>${esc(role)}</td><td>${cell(field ? request[field] : '')}</td>
      <td>${LINE}</td><td>${LINE}</td>
    </tr>`).join('')}</tbody>
  </table>
</section>`;

const statusBlock = (request) => `<p class="status">Status: ${PAPER_STATUS
  .map(([label, list]) => `<span class="st${list.includes(request.status) ? ' on' : ''}">${list.includes(request.status) ? TICK_ON : TICK_OFF} ${esc(label)}</span>`)
  .join('')}</p>`;

// ── จัดแบ่งหน้า ──────────────────────────────────────────────────────────
//
// เดินตามลำดับเนื้อหาแล้วขึ้นหน้าใหม่เมื่อต้นทุนสะสมเกินหนึ่งแผ่น · หัวข้อที่ยาวข้าม
// หน้าได้ แต่ต้องพิมพ์หัวข้อซ้ำพร้อมคำว่า "(ต่อ)" ⇒ หน้าที่สองอ่านออกเองโดยไม่ต้อง
// ย้อนกลับไปดูหน้าก่อน
//
// ⚠️ หัวข้อ **ห้ามค้างท้ายหน้าโดยไม่มีแถวตามมา** — ขึ้นหน้าใหม่พร้อมกับแถวแรกเสมอ
//
// ⚠️ **งบของแผ่นที่กำลังเติมอยู่ ไม่ใช่งบก้อนเดียว** — แผ่นแรกเสียที่ให้หัวเอกสาร
// แผ่นถัดไปไม่มีหัว จึงรับได้มากกว่า (ดูรอบวัดที่ `PAGE_REST_MM`)
function paginate(items) {
  const pages = [];
  let page = [];
  let used = 0;
  const budget = () => (pages.length === 0 ? PAGE_MM : PAGE_REST_MM);
  for (const item of items) {
    // หัวข้อกินที่ของตัวเองบวกแถวแรกที่ต้องตามไปด้วย จึงคิดคู่กันตอนตัดสินใจ
    const cost = item.cost + (item.type === 'heading' ? COST.row : 0);
    if (page.length && used + cost > budget()) {
      pages.push(page);
      page = [];
      used = 0;
      // ตัดกลางหัวข้อ = เปิดหน้าใหม่ด้วยหัวข้อเดิม + "(ต่อ)"
      // ⚠️ ต้องครอบ **บล็อกบรีฟด้วย ไม่ใช่เฉพาะแถวตาราง** — ใบที่มีหลายกลิ่นจะมีหน้าที่
      // ขึ้นต้นด้วยกล่อง 2.1 ล้วน ๆ ถ้าไม่พิมพ์หัวข้อซ้ำ หน้านั้นจะไม่บอกว่าตัวเองคือหัวข้อไหน
      if (item.heading) {
        page.push({ type: 'heading', section: item.section, html: `<h3>${esc(item.heading)} (ต่อ)</h3>`, cost: COST.heading });
        used += COST.heading;
      }
    }
    page.push(item);
    used += item.cost;
  }
  if (page.length) pages.push(page);
  return pages;
}

// รวมแถวที่ติดกันของหัวข้อเดียวกันให้อยู่ในตารางเดียว — แถวลอยนอก <table> ไม่แสดงผล
function renderPage(items) {
  const out = [];
  let open = null;
  const close = () => { if (open) { out.push(`${open}</table>`); open = null; } };
  for (const item of items) {
    if (item.type === 'row') {
      if (!open) open = '<table class="kv">';
      open += item.tr;
      continue;
    }
    close();
    out.push(item.html);
  }
  close();
  return out.join('');
}

export function renderPdrDocument({
  request = {}, briefs = [], company = {}, form = null, standard = null, toolbar = true,
} = {}) {
  // ผู้เรียกส่ง `form` มาตรง ๆ ได้ (ค่าที่ resolve แล้ว) ไม่งั้นอ่านจากมาตรฐานที่ส่งมา
  const resolved = form || resolveDocumentForm(standard, PDR_KEY);
  const formLine = resolved.code
    ? `${resolved.code}: Rev. No.${resolved.revision}. ${resolved.effectiveDate}`
    : '';
  const titleTh = resolveDocumentTitleTh(standard, PDR_KEY);

  // ⭐ หัวข้อ · ป้ายชื่อ · ลำดับ · เลขข้อ · การแปลง enum มาจาก `lib/requests/pdrFields.js`
  // ที่เดียวกับฟอร์มและจอแสดง
  //
  // ⚠️ ค่าที่ระบบเติมให้มาจาก server (`findRequest`) — เอกสารเป็นฟังก์ชันบริสุทธิ์
  // โหลดเองไม่ได้ · ไม่มี context = ช่องพวกนั้นพิมพ์ N/A
  //
  // 🐞 เดิมบรรทัดนี้ต่อ `scentCount: briefs.length` ไว้ **หลัง spread** ⇒ ทับค่าที่
  // `pdrContext` คำนวณมาจากใบสั่งขายทิ้งทุกครั้ง · ใบที่ AE รวบ 3 กลิ่นเป็นบรีฟเดียว
  // (โหมดที่ฟอร์มเปิดให้ทำ) จะพิมพ์ลงกระดาษว่า "1 กลิ่น" ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3
  const context = { briefs, ...(request.pdrContext || {}) };

  const header = documentHeader({
    // ⚠️ resolveCompanyBlock คืนคีย์ legalNameTh/legalNameEn ส่วนเปลือกรับ nameTh/nameEn
    // (แม็ปแบบเดียวกับ billPrint/ganttPrint/reportPrint) — ลืมแม็ปแล้วหัวเอกสารขึ้น "-"
    company: {
      nameTh: company.legalNameTh,
      nameEn: company.legalNameEn,
      address: company.address,
      taxId: company.taxId,
      phone: company.phone,
      line: company.line,
      website: company.website,
    },
    formLine,
    titleTh,
    titleEn: standard?.titleEn || resolved.title || 'PRODUCT DEVELOPMENT REQUEST (PDR)',
    // ⚠️ **"วันที่ร้องขอ" ย้ายลงไปอยู่ในก้อน Request Information แล้ว** (มติผู้ใช้
    // 2026-08-08) — เดิม hardcode ที่นี่ด้วย `createdAt` ⇒ สองปัญหา: ฟอร์มกับหน้า
    // รายละเอียดไม่มีช่องนี้เลย และร่างที่ค้างไว้หลายวันจะพิมพ์วันที่สร้างร่างแทนวันที่ยื่นจริง
    //
    // ⚠️ เปลือกรับ `{ label, value }` **ไม่ใช่คู่ [label, value]** — ส่งเป็น array
    // เมื่อไรได้ `<dt></dt><dd>-</dd>` คือหัวใบไม่มีทั้งเลขที่เอกสารและชื่อลูกค้า
    //
    // ⚠️ **"โครงการ" อยู่ในเนื้อหา ไม่ใช่หัวใบ** (มติผู้ใช้ 2026-08-09) — หัวใบเก็บไว้
    // เฉพาะสิ่งที่ใช้ระบุตัวใบ ส่วนโครงการเป็นข้อมูลของงาน จึงอยู่ในก้อน
    // "1. Customer Information" ต่อจากชื่อบริษัท (ธง `docLabel` ในทะเบียน)
    //
    // ⚠️ **"ลูกค้า" ถอดออกจากหัวใบแล้ว** (มติผู้ใช้ 2026-08-14) — ด้วยเหตุผลเดียวกับ
    // โครงการ: ชื่อลูกค้าเป็นข้อมูลของงาน ไม่ใช่ตัวระบุใบ และมันพิมพ์อยู่แล้วที่ข้อ 1.3
    // "ชื่อบริษัท" ในก้อน Customer Information ⇒ หัวใบเหลือ เลขที่ · วันที่
    // 🪤 **ถอดแถวหัวใบ = พื้นที่ต่อแผ่นเปลี่ยน** ต้องปรับ `PAGE_MM` ตามทุกครั้ง
    // (ดูหมายเหตุที่ `PAGE_MM` — ไม่ปรับกลับ งบที่ต่ำเกินจะกินหน้าเปล่าเพิ่มมาทั้งแผ่น)
    //
    // ⚠️ "วันที่" ถูกถอดออกจากตารางข้างล่างแล้ว (ธง `inHeader`) — พิมพ์สองที่บนแผ่น
    // เดียวกันอ่านแล้วเหมือนคนละค่า
    rows: [
      { label: 'เลขที่เอกสาร', value: request.docNo },
      { label: 'วันที่', value: context.requestedAt },
    ],
  });

  const items = [];
  const pushSection = (key) => {
    const section = PDR_SECTIONS.find((s) => s.key === key);
    if (!section) return;
    const heading = PAPER_HEADINGS[key] || section.title;
    items.push({ type: 'heading', section: key, html: `<h3>${esc(heading)}</h3>`, cost: COST.heading });
    for (const group of pdrSectionGroups(section, request, context)) {
      const { tr, cost } = groupRow(group, request, context);
      if (tr) items.push({ type: 'row', section: key, heading, tr, cost });
    }
  };

  pushSection('request');
  pushSection('customer');

  items.push({ type: 'heading', section: 'spec', html: `<h3>${esc(PAPER_HEADINGS.spec)}</h3>`, cost: COST.heading });
  // ⚠️ ใบที่ยังไม่มีบรีฟก็ต้องได้กล่อง 2.1 เปล่า — กระดาษที่พิมพ์ไปเขียนมือต่อได้
  const list = briefs.length ? briefs : [{}];
  for (const [index, brief] of list.entries()) {
    items.push({
      type: 'atom',
      section: 'spec',
      heading: PAPER_HEADINGS.spec,
      html: briefBlock(brief, index, list.length),
      cost: briefCost(brief),
    });
  }
  // ⚠️ 2.2/2.3 ต้องมาก่อนข้ออื่นของหมวดสเปก — เรียงตามเลขข้อบนกระดาษ
  for (const { tr, cost } of targetRows(request, (code) => categoryLabel(code, context.categories || []))) {
    items.push({ type: 'row', section: 'spec', heading: PAPER_HEADINGS.spec, tr, cost });
  }
  const specSection = PDR_SECTIONS.find((s) => s.key === 'spec');
  for (const group of pdrSectionGroups(specSection, request, context)) {
    const { tr, cost } = groupRow(group, request, context);
    if (tr) items.push({ type: 'row', section: 'spec', heading: PAPER_HEADINGS.spec, tr, cost });
  }

  pushSection('regulatory');
  // ⚠️ ตารางลายเซ็นกับบรรทัด Status เป็น **ก้อนเดียว** — แยกกันเมื่อไรมีโอกาสที่ Status
  // หลุดไปลอยอยู่หน้าใหม่ตัวเดียว ซึ่งอ่านแล้วไม่รู้ว่าเป็นสถานะของอะไร
  items.push({
    type: 'atom',
    section: 'signers',
    html: `${signatureBlock(request)}${statusBlock(request)}`,
    cost: COST.signatures + COST.status,
  });

  const pages = paginate(items);
  // ⭐ **หัวเอกสารอยู่แผ่นแรกแผ่นเดียว** (IS-26080030) — ดูเหตุผลและรอบวัดที่ `PAGE_MM`
  //
  // ⚠️ แผ่นที่ไม่มีหัวยังต้อง **บอกได้เองว่าเป็นใบไหน** ถ้าหลุดจากปึก ⇒ ท้ายกระดาษ
  // แบกหน้าที่นั้นแทน: ชื่อบริษัท · รหัสแบบฟอร์ม + เลขที่คำร้อง · เลขหน้า
  // (เดิมท้ายกระดาษมีแค่รหัสแบบฟอร์ม ซึ่งเหมือนกันทุกใบ = ระบุใบไม่ได้)
  const footerCenter = [formLine, request.docNo].filter(Boolean).join(' · ');
  const sheets = pages.map((pageItems, index) => `
    <article class="sheet explicit-page" aria-label="${esc(titleTh)} หน้า ${index + 1}">
      ${index === 0 ? header : ''}
      <div class="sheetContent">${renderPage(pageItems)}</div>
      ${documentFooter({
    left: company.legalNameTh,
    center: footerCenter,
    right: `หน้า ${index + 1} / ${pages.length}`,
  })}
    </article>`).join('');

  return renderDocumentHTML({
    title: `PDR ${request.docNo || ''}`.trim(),
    accentKey: resolveDocumentAccentKey(standard, PDR_KEY),
    variantClass: 'pdr',
    pages: sheets,
    // ⚠️ พรีวิวในหน้าตั้งค่าฝังเป็น iframe — ปุ่มพิมพ์ในนั้นพิมพ์แค่ใบตัวอย่าง
    // ผู้เรียกจึงปิดแถบเครื่องมือได้ (แบบเดียวกับ billPrint/ganttPrint)
    toolbar: toolbar === false ? null : { label: `${titleTh} (PDR)`, button: 'พิมพ์เอกสาร' },
    extraCss: `
      /* ⚠️ หัวเอกสารมีแค่เส้นคั่น ไม่มีระยะใต้เส้น — หัวข้อแรกจึงไปแปะติดเส้นเลย
         (ผู้ใช้ทักเอง 2026-08-09) · ระยะนี้ถูกหักออกจากงบต่อหน้าแล้วที่ PAGE_MM */
      .pdr .sheetContent { gap: 0; padding-top: 5mm; }
      /* ⚠️ 3.4mm อ่านแล้วยังชิด (ผู้ใช้ทักสองรอบ) — 5mm เท่าระยะใต้เส้นคั่นหัวเอกสาร
         ระยะนี้อยู่ในต้นทุน COST.heading แล้ว แก้ที่นี่ต้องแก้ที่นั่นด้วย */
      .pdr h3 { margin: 5mm 0 1.6mm; color: var(--doc-navy); font-size: 10.5pt; }
      /* 🐞 ต้องเจาะจงลูกตรงของ .sheetContent — h3:first-child เฉย ๆ ไปโดนหัวข้อใน .blk
         ด้วย (มันเป็นลูกคนแรกของกล่องตัวเอง) ⇒ "Final Review & Approval" แปะติดตาราง
         ข้างบนสนิท ระยะเหลือ -0.26mm · กฎนี้มีไว้ตัดระยะของหัวข้อ **แรกสุดของแผ่น** เท่านั้น
         ⚠️ ห้ามใช้ backtick ในคอมเมนต์นี้ — ทั้งก้อน CSS อยู่ใน template literal */
      .pdr .sheetContent > h3:first-child { margin-top: 0; }
      .pdr .na { color: var(--doc-muted); font-style: italic; }
      .pdr .no { display: inline-block; min-width: 9mm; color: var(--doc-accent); font-weight: 600; }

      .pdr table.kv { width: 100%; table-layout: fixed; border-collapse: collapse; }
      .pdr table.kv th, .pdr table.kv td {
        padding: 1.3mm 1.8mm; vertical-align: top; border: .35mm solid var(--doc-line-strong);
        font-size: 8.4pt; line-height: 1.65; overflow-wrap: anywhere; }
      .pdr table.kv th { width: 56mm; color: var(--doc-text); text-align: left; font-weight: 500;
        background: var(--doc-neutral-soft); }
      .pdr .note { display: block; margin-top: .6mm; color: var(--doc-accent); font-size: 7.4pt; }

      /* ตัวเลือกแบบติ๊ก — พิมพ์ครบทุกตัวเหมือนกระดาษ ตัวที่เลือกเน้นเข้ม */
      .pdr .opts { margin: 0; padding: 0; list-style: none; }
      .pdr .opts li { display: flex; gap: 1.2mm; color: var(--doc-muted); line-height: 1.65; }
      .pdr .opts li.on { color: var(--doc-text); font-weight: 600; }

      /* ช่อง "ติ๊กแล้วเขียนต่อ" (1.10 · 2.9) */
      .pdr .tick { display: block; margin-bottom: .8mm; }
      .pdr .tick:last-child { margin-bottom: 0; }
      .pdr .tickHead { display: block; font-weight: 600; }
      .pdr .tickHead em { color: var(--doc-muted); font-size: 7.4pt; font-style: normal; font-weight: 400; }
      .pdr .tickText { display: block; padding-left: 4.5mm; }

      /* 2.1 — ซ้าย: บรีฟกลิ่น · ขวา: 2.1.1–2.1.5 (วางตามกระดาษ) */
      .pdr .briefBlock { display: grid; grid-template-columns: 1fr 1fr;
        border: .35mm solid var(--doc-line-strong); break-inside: avoid; }
      .pdr .briefLeft { padding: 1.6mm 1.8mm; border-right: .35mm solid var(--doc-line-strong);
        background: var(--doc-neutral-soft); }
      .pdr .briefRight { padding: 1.6mm 1.8mm; }
      .pdr .briefBlock h4 { margin: 0 0 1.2mm; color: var(--doc-navy); font-size: 8.6pt; }
      .pdr .briefText { margin: 0 0 1.6mm; font-size: 8.4pt; line-height: 1.65;
        white-space: pre-wrap; overflow-wrap: anywhere; }
      .pdr .sub { margin-bottom: 1.2mm; font-size: 8.4pt; line-height: 1.65; }
      .pdr .sub:last-child { margin-bottom: 0; }
      .pdr .subHead { display: block; color: var(--doc-navy); font-size: 7.8pt; font-weight: 600; }
      .pdr .subBody { display: block; overflow-wrap: anywhere; }

      .pdr .blk { break-inside: avoid; }
      .pdr table.sign { width: 100%; border-collapse: collapse; }
      .pdr table.sign th, .pdr table.sign td {
        padding: 1.6mm 1.8mm; border: .35mm solid var(--doc-line-strong); font-size: 8.4pt; }
      .pdr table.sign th { color: var(--doc-text); text-align: left; background: var(--doc-neutral-soft); }
      .pdr table.sign td:nth-child(3), .pdr table.sign td:nth-child(4) { width: 34mm; }
      .pdr .fill { display: block; min-height: 3.4mm; border-bottom: .3mm dotted var(--doc-line-strong); }

      .pdr .status { margin: 3.4mm 0 0; font-size: 9pt; }
      .pdr .status .st { margin-right: 10mm; color: var(--doc-muted); }
      .pdr .status .st.on { color: var(--doc-text); font-weight: 700; }
    `,
  });
}
