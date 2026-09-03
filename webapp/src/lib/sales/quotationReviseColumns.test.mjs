// ── ยามกันคอลัมน์หายเงียบตอน "ออก Rev." ใบเสนอราคา ────────────────────────
//
// 🪤 โรคเดียวกับฝั่งใบสั่งขาย (serviceRoundsCopyPaths.test.mjs) แต่ไม่มีใครเฝ้าเลย:
// ฉบับ Rev. ของใบสั่งขายก๊อปด้วย RPC ⇒ อย่างน้อยยังมี SQL ให้เทียบ · ส่วนใบเสนอราคา
// เป็น **INSERT ที่เขียนมือใน route** ⇒ ตาราง `quotations` โตขึ้นทุกรอบ แต่ลิสต์คีย์ใน
// route ไม่ได้โตตาม แล้วไม่มีอะไรฟ้องสักตัว — ค่าที่ลืมไม่ error มันแค่ **หายทุกครั้ง
// ที่ออก Rev.** ซึ่งเป็นจังหวะที่จับได้ยากที่สุด (ของอยู่ครบตอนสร้าง หายตอนแก้ฉบับ)
//
// เทสต์นี้ไล่ **ทุกคอลัมน์ที่ migration เคยเพิ่มให้ `quotations`** แล้วบังคับว่าแต่ละตัว
// ต้องอยู่ในสองกอง: ก๊อปไปในฉบับ Rev. หรือประกาศไว้ว่าตั้งใจให้ฉบับใหม่เริ่มเอง
// ⇒ เพิ่มคอลัมน์ใหม่วันหน้าแล้วไม่ตัดสินใจ = แดงทันที ไม่ใช่รู้ตัวตอนข้อมูลหาย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { quoteTotals } from '@/lib/salesPlanning';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const ROUTE = new URL('../../app/api/sales-planning/quotations/[id]/revise/route.js', import.meta.url);

/* คอลัมน์ของ `quotations` ตามที่ migration ประกาศไว้
   ⚠️ ต้องไม่แคร์ตัวพิมพ์ใหญ่เล็กของคำสั่ง SQL — ไฟล์ในโฟลเดอร์นี้เขียนกันทั้ง
   `ALTER TABLE` และ `alter table` (คอลัมน์ที่อยู่/เลขภาษี/เอกสารอ้างอิงอยู่ฝั่งตัวเล็ก
   ทั้งกอง ⇒ regex ที่ล็อกตัวใหญ่จะมองไม่เห็น 5 คอลัมน์แล้วเทสต์ผ่านแบบหลอก ๆ) */
function quotationColumns() {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const columns = new Set();
  for (const name of files) {
    const sql = readFileSync(new URL(name, MIGRATIONS), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.quotations\s*\(([\s\S]*?)\n\);/gi)) {
      for (const line of m[1].split('\n')) {
        const col = /^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+[a-zA-Z]/.exec(line);
        if (col && !['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'].includes(col[1].toUpperCase())) {
          columns.add(col[1]);
        }
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?public\.quotations([\s\S]*?);/gi)) {
      for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
        columns.add(c[1]);
      }
    }
  }
  return columns;
}

/* ตัดคอมเมนต์ทิ้งก่อนอ่านโครงสร้าง — คอมเมนต์ไทยในไฟล์นี้มีทั้งวงเล็บ อัญประกาศ และ
   คอมมา ⇒ ตัวนับวงเล็บ/ตัวแยกคอมมาจะเพี้ยนทันทีถ้าไม่ตัดออกก่อน
   (ต้องรู้จักสตริงด้วย ไม่งั้น '//' ที่อยู่ใน URL ในสตริงจะถูกนับเป็นคอมเมนต์) */
function stripComments(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (two === '/*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch; i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') { out += src[i]; i += 1; }
        out += src[i]; i += 1;
      }
      out += src[i] ?? ''; i += 1; continue;
    }
    out += ch; i += 1;
  }
  return out;
}

/* แยกรายการที่คั่นด้วยคอมมา **ชั้นนอกสุด** — ค่าในใบมีทั้งอ็อบเจกต์ซ้อน (metadata),
   เทมเพลตสตริง และวงเล็บ ⇒ split(',') ตรง ๆ นับผิดทันที */
function topLevelItems(inner) {
  const out = [];
  let depth = 0; let cur = ''; let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch; cur += ch; i += 1;
      while (i < inner.length && inner[i] !== quote) {
        if (inner[i] === '\\') { cur += inner[i]; i += 1; }
        cur += inner[i]; i += 1;
      }
      cur += inner[i] ?? ''; i += 1; continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; i += 1; continue; }
    cur += ch; i += 1;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/* คีย์ที่มาจาก spread — ชุดคีย์ต้องดึงจาก **ตัวที่ผลิตมันเอง** ไม่ใช่พิมพ์ค้างไว้
   (กติกาเดียวกับ saveQuotationContentColumns.test.mjs) */
const SPREADS = { totals: () => Object.keys(quoteTotals([])) };

function insertKeys() {
  const src = stripComments(readFileSync(ROUTE, 'utf8'));
  const at = src.indexOf('.insert({');
  assert.ok(at > 0, 'หา INSERT ของ revise ไม่เจอ — ไฟล์ย้ายหรือเปลี่ยนท่าเขียน');
  const open = src.indexOf('{', at);
  const items = topLevelItems(src.slice(open + 1, matchingBrace(src, open)));
  const keys = new Set();
  for (const item of items) {
    const spread = /^\.\.\.([A-Za-z_$][\w$]*)/.exec(item);
    if (spread) {
      const resolve = SPREADS[spread[1]];
      assert.ok(resolve, `INSERT กระจาย \`...${spread[1]}\` ที่เทสต์ไม่รู้จัก — ลงทะเบียนใน SPREADS ก่อน`);
      for (const key of resolve()) keys.add(key);
      continue;
    }
    /* ⚠️ INSERT ก้อนนี้ผสมสองรูป: `customerName: quote.customerName` กับ **ชอร์ตแฮนด์**
       (`validUntil,` `paymentPlan,` …) ที่ destructure มาจาก buildQuotationRevisionContent
       ⇒ ตัวอ่านที่รู้จักแค่รูปมีโคลอนจะมองไม่เห็น 8 คอลัมน์แล้วฟ้องผิดจุด */
    const named = /^"?([A-Za-z_$][\w$]*)"?\s*(?::|$)/.exec(item);
    if (named) keys.add(named[1]);
  }
  assert.ok(keys.size >= 30, `อ่านคีย์จาก INSERT ได้แค่ ${keys.size} ตัว — ตัวอ่านน่าจะพัง`);
  return keys;
}

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/* ร่องรอยของใบเดิมที่ฉบับ Rev. ต้องเริ่มใหม่ — ตั้งใจไม่ก๊อป */
const REVISION_RESETS = new Set([
  // ค่าที่ DB เติมเอง
  'createdAt', 'updatedAt',
  /* หลักฐานการรับใบ + เอกสารยืนยันคำสั่งซื้อของลูกค้า (accept_quotation RPC เป็นคนเขียน)
     ฉบับ Rev. เกิดมาเป็น 'draft' ที่ยังไม่มีใครรับ ⇒ ก๊อปมาคือใบร่างที่พกหลักฐานว่า
     ลูกค้ายืนยันแล้ว ทั้งที่ยังไม่เคยส่งให้ใครดูด้วยซ้ำ */
  'acceptedAt', 'acceptedBy',
  'wonDocType', 'wonDocNo', 'wonDocDate', 'wonPaymentDueDate', 'wonAttachments',
  // ตีกลับของรอบก่อน — ฉบับใหม่ยังไม่เคยถูกยื่นเลย
  'rejectedAt', 'rejectedBy', 'rejectedByName', 'rejectionReason',
  // หมายเหตุตอนอนุมัติของใบเดิม (คู่กับ approvedAt/By ที่ route ล้างเป็น null อยู่แล้ว)
  'approvalNotes',
  // ลายเซ็นเป็นของ "ฉบับที่เซ็น" — ฉบับ Rev. ต้องยื่นและเซ็นใหม่เอง
  'signatureEvidenceId', 'proposerSignatureEvidenceId',
]);

/* 🪤 ทะเบียนนี้ต้องไม่มีชื่อที่ไม่ใช่คอลัมน์จริง — ของที่ประกาศเกินไม่ทำให้เทสต์แดง
   (ตัวกรองแค่ข้ามมันไป) ⇒ มันอยู่ต่อได้เงียบ ๆ พร้อมเหตุผลที่อาจผิด แล้วคนอ่านรอบหน้า
   ก็เชื่อ (เหตุผลเต็มอยู่ที่ serviceRoundsCopyPaths.test.mjs) */
test('REVISION_RESETS ต้องเป็นคอลัมน์จริงของ quotations ทุกตัว', () => {
  const columns = quotationColumns();
  assert.ok(columns.size > 40, `อ่านคอลัมน์ของ quotations ได้แค่ ${columns.size} ตัว — ตัวอ่านน่าจะพัง`);
  assert.deepEqual([...REVISION_RESETS].filter((c) => !columns.has(c)).sort(), []);
});

test('🪤 Rev. ของใบเสนอราคาต้องพาทุกคอลัมน์ที่ยังมีความหมายไปด้วย', () => {
  const keys = insertKeys();
  const missing = [...quotationColumns()]
    .filter((col) => !REVISION_RESETS.has(col) && !keys.has(col))
    .sort();
  assert.deepEqual(missing, [],
    'INSERT ของ revise/route.js ไม่ได้ก๊อปคอลัมน์เหล่านี้ และไม่ได้ประกาศว่าตั้งใจรีเซ็ต\n'
    + '  → ถ้าตั้งใจไม่ก๊อป ให้เติมชื่อเข้า REVISION_RESETS พร้อมเหตุผล\n'
    + '  → ถ้าต้องก๊อป ให้เติมเข้า INSERT (ลืมแล้วค่าหายเงียบทุกครั้งที่ออก Rev.)');
});

/* ⭐ คีย์อังกฤษของเอกสาร (มติผู้ใช้ 2026-09-03) — ยามข้างบนเห็นเฉพาะคอลัมน์ที่
   migration ประกาศแล้ว ⇒ ระหว่างที่ ALTER TABLE ยังไม่ลง มันมองไม่เห็นสามช่องนี้เลย
   ตัวนี้จึงผูกกับ **ตัวที่ผลิต snapshot** แทน: เพิ่มคีย์ที่ pickDocumentAddresses
   เมื่อไร ฉบับ Rev. ต้องพาไปด้วยทันที ไม่ต้องรอ migration */
test('⭐ Rev. พาที่อยู่อังกฤษไปครบทุกช่องที่ pickDocumentAddresses ผลิต', () => {
  const keys = insertKeys();
  for (const key of Object.keys(pickDocumentAddresses(null, {}).snapshot)) {
    assert.ok(keys.has(key), `INSERT ของ revise ไม่มี "${key}" ⇒ ออก Rev. แล้วช่องนี้หายทุกครั้ง`);
  }
});

test('⭐ Rev. พาชื่อกิจการอังกฤษไปด้วย — ไม่งั้นใบอังกฤษตกกลับไปพิมพ์ชื่อไทย', () => {
  assert.ok(insertKeys().has('customerNameEn'),
    'ฉบับ Rev. ต้องเขียน customerNameEn ด้วย (อ่านสดจากทะเบียน ไม่มีค่อยสืบของใบเดิม)');
});
