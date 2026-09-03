// ── ยามกัน "จำนวนรอบบริการ" หายเงียบตอนออก Rev. (mig 0326) ──────────────────
//
// ⭐ ตัวเลขนี้ถูกกรอกที่ **ใบสั่งขาย** (มติผู้ใช้ 2026-08-31 รอบสอง) ⇒ ทอดที่ต้องพาไปด้วย
// เหลือทอดเดียวคือ SO → SO Rev. ซึ่งก๊อปบรรทัดด้วย RPC · ลืมคอลัมน์ = ตัวเลขหายเงียบ
// เฉพาะตอนออก Rev. ซึ่งเป็นจังหวะที่จับได้ยากที่สุด (ไม่มี error ให้เห็น)
//
// 🪤 โรคเดียวกับคอลัมน์ที่อยู่ที่หายไปสองรอบใน mig 0124/0244 — ดู saveQuotationContentColumns.test.mjs
//
// เทสต์นี้อ่าน **นิยามล่าสุดในโฟลเดอร์ migrations** ไม่ตรึงชื่อไฟล์ ⇒ วันหน้ามีคนคัดลอก
// นิยามไปแก้ที่ไฟล์ใหม่แล้วลืมบรรทัดนี้ เทสต์แดงทันที
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

function latestDefinitionOf(fnName) {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const marker = `FUNCTION public.${fnName}`;
  const owning = files.filter((name) => readFileSync(new URL(name, MIGRATIONS), 'utf8').includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
  const from = sql.lastIndexOf(`CREATE OR REPLACE ${marker}`);
  assert.ok(from >= 0, `อ่านนิยาม ${fnName} จาก ${file} ไม่ได้`);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}

test('revise_approved_sales_order_atomic ก๊อป serviceRounds ไปใบ Rev.', () => {
  const { file, body } = latestDefinitionOf('revise_approved_sales_order_atomic');
  // ต้องมีทั้งฝั่งชื่อคอลัมน์ (INSERT) และฝั่งค่า (SELECT) — ใส่ข้างเดียว SQL ก็พัง
  const hits = body.split('"serviceRounds"').length - 1;
  assert.ok(hits >= 2, `${file}: มี "serviceRounds" ${hits} ที่ — ต้องมีทั้งในลิสต์คอลัมน์และในค่าที่ SELECT`);
});

test('จำนวนรอบไม่เข้า fingerprint การอนุมัติใบเสนอราคา', () => {
  // ⛔ เหตุผลเดียวกับ docLanguage: fingerprint ของใบที่อนุมัติแล้วถูกตรึงไว้บน production
  // เพิ่มคีย์ใหม่วันนี้ = ใบที่อนุมัติแล้วทุกใบกลายเป็น "แก้หลังอนุมัติ" พร้อมกันทั้งระบบ
  const src = readFileSync(new URL('./quotationApprovalFingerprint.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /serviceRounds/);
});

test('สายใบเสนอราคาไม่มีช่องกรอกรอบแล้ว — บ้านเดียวคือใบสั่งขาย', () => {
  /* ⚠️ มติผู้ใช้ย้ายทางเข้ามาที่ใบสั่งขาย ⇒ ถ้าวันหนึ่งมีคนเติมกลับเข้า normalize ของ
     บรรทัดใบเสนอราคา จะกลายเป็นสองที่กรอกค่าเดียวกัน แล้วคนเดาไม่ออกว่าเลขที่เห็น
     มาจากไหน (โรคเดียวกับกระจกชื่อลูกค้า) */
  const quoteLines = readFileSync(new URL('./quoteLines.js', import.meta.url), 'utf8');
  assert.doesNotMatch(quoteLines, /serviceRounds/);
});

/* ═══════════════════════════════════════════════════════════════════════
   🪤 **รายการคอลัมน์ของ Rev. ต้องไม่ถูกลืมอีก** (mig 0340)

   `revise_approved_sales_order_atomic` ก๊อปหัวใบด้วยรายการคอลัมน์ที่เขียนไว้ตายตัว
   ตั้งแต่ 0166 ส่วนตาราง `sales_orders` โตขึ้นเรื่อย ๆ หลังจากนั้น ⇒ **ทุกคอลัมน์
   ที่เพิ่มหลัง 0166 หายเงียบทุกครั้งที่ออก Rev.** และไม่มี error ให้เห็นสักตัว
   (0326 เคยแตะฟังก์ชันนี้แล้ว แต่เติมเฉพาะ `serviceRounds` ที่กำลังทำอยู่)

   เทสต์นี้จึงไม่ได้เช็คแค่คอลัมน์ที่รู้จัก — มัน **ไล่ทุกคอลัมน์ที่ migration เคยเพิ่ม
   ให้ `sales_orders`** แล้วบังคับว่าแต่ละตัวต้องอยู่ในสองกองนี้กองใดกองหนึ่ง
   ⇒ เพิ่มคอลัมน์ใหม่วันหน้าแล้วไม่ตัดสินใจ = เทสต์แดงทันที ไม่ใช่รู้ตัวตอนข้อมูลหาย
   ═══════════════════════════════════════════════════════════════════════ */

/* ร่องรอยของ *ใบเดิม* ที่ฉบับใหม่ต้องเริ่มใหม่ — ตั้งใจไม่ก๊อป */
const REVISION_RESETS = new Set([
  // ตัวฟังก์ชันเซ็ตเอง / เป็นของฉบับใหม่โดยนิยาม
  'id', 'orderNumber', 'revisionNo', 'revisedFromId', 'status', 'orderDate',
  'createdBy', 'createdByName', 'createdAt', 'updatedAt', 'approvalMode',
  // สายฉบับของใบเดิม
  'supersededById', 'revisedAt', 'revisedBy', 'revisedByName', 'revisionReason',
  // ยื่น / อนุมัติ / ตีกลับ
  'submittedAt', 'submittedBy', 'submittedByName',
  'approvedAt', 'approvedBy', 'approvedByName', 'approvalNote',
  'approvalFingerprint', 'approvalOverrideReason',
  'rejectedAt', 'rejectedBy', 'rejectedByName', 'rejectionReason',
  // ขั้นบัญชี
  'financeStatus', 'financeNote', 'financeApprovedAt', 'financeApprovedBy',
  'financeApprovedByName', 'financeRejectedAt', 'financeRejectedBy',
  'financeRejectedByName', 'financeRejectReason', 'financeSignatureEvidenceId',
  // ยกเลิก
  'cancelledAt', 'cancelledBy', 'cancelReason', 'cancelReasonCode',
  // ลายเซ็นของใบเดิม
  'signatureEvidenceId', 'proposerSignatureEvidenceId',
  /* 🔴 **เจ้าของยอด — มีคนอ่านจริง แต่ห้ามก๊อป** (แก้เหตุผลที่เขียนผิดไว้รอบแรก)
     รายงานยอดขายจัดกลุ่มด้วย `sales_orders."ownerId"` ตรง ๆ (`api/sales-planning/report`)
     แต่ค่านั้นถูก **trigger `snapshot_sales_order_owner` แช่ให้ตอนหัวหน้าฝ่ายขายอนุมัติ**
     (mig 0294) ไม่ใช่ตอนสร้าง — เพราะยอดของใบต้องเป็นของคนที่ถือดีล *ณ วินาทีที่ใบ
     กลายเป็นยอดขาย* ไม่ใช่ของเจ้าของดีลวันนี้
     ⇒ ก๊อปมาตั้งแต่ร่างจะได้เจ้าของของ **รอบก่อน** ติดมากับใบที่ยังไม่นับเป็นยอด
       แล้ว trigger ก็ไม่ได้ทับให้ (มันเซ็ตตอนสถานะเปลี่ยนเป็น approved) */
  'ownerId', 'ownerName',
]);

test('🪤 Rev. ของใบสั่งขายต้องพาทุกคอลัมน์ที่ยังมีความหมายไปด้วย', () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const columns = new Set();
  for (const name of files) {
    const sql = readFileSync(new URL(name, MIGRATIONS), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.sales_orders\s*\(([\s\S]*?)\n\);/g)) {
      for (const line of m[1].split('\n')) {
        const col = /^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+[a-zA-Z]/.exec(line);
        if (col && !['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'].includes(col[1].toUpperCase())) {
          columns.add(col[1]);
        }
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?public\.sales_orders([\s\S]*?);/g)) {
      for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) {
        columns.add(c[1]);
      }
    }
  }
  assert.ok(columns.size > 50, `อ่านคอลัมน์ของ sales_orders ได้แค่ ${columns.size} ตัว — ตัวอ่านน่าจะพัง`);
  assertNoGhosts(REVISION_RESETS, columns, 'REVISION_RESETS');

  const { file, body } = latestDefinitionOf('revise_approved_sales_order_atomic');
  /* ตัดคอมเมนต์ออกก่อนเทียบ — คอมเมนต์คั่นกลางลิสต์คอลัมน์ทำให้ตัวเทียบพลาด
     คอลัมน์ที่อยู่ต้นบรรทัดถัดจากคอมเมนต์ (เจอจริงตอนเขียนเทสต์นี้) */
  const insert = body
    .slice(body.indexOf('INSERT INTO public.sales_orders'), body.indexOf('RETURNING * INTO v_revision'))
    .replace(/--[^\n]*/g, '');

  const missing = [...columns].filter((col) => {
    if (REVISION_RESETS.has(col)) return false;
    /* ต้องมีทั้งฝั่งชื่อคอลัมน์และฝั่งค่า — ใส่ข้างเดียว SQL พังตอนรัน ไม่ใช่ตอนเทสต์ */
    const named = new RegExp(`[(,]\\s*"?${col}"?[\\s,)]`).test(insert);
    const valued = new RegExp(`v_source\\."?${col}"?`).test(insert) || col === 'orderNumber';
    return !(named && valued);
  }).sort();

  assert.deepEqual(missing, [],
    `${file}: คอลัมน์เหล่านี้ไม่ถูกก๊อปไปใบ Rev. และไม่ได้ประกาศว่าตั้งใจรีเซ็ต\n`
    + `  → ถ้าตั้งใจไม่ก๊อป ให้เติมชื่อเข้า REVISION_RESETS พร้อมเหตุผล\n`
    + `  → ถ้าต้องก๊อป ให้เติมเข้า INSERT ของฟังก์ชันใน migration ใบใหม่`);
});

/* ═══════════════════════════════════════════════════════════════════════
   🪤 **ทอด QT → SO ป่วยโรคเดียวกัน** (mig 0341)

   `create_sales_order_draft` ก๊อปหัวใบด้วยรายการคอลัมน์ตายตัวเหมือนกัน ⇒ 0295 เพิ่ม
   `docLanguage` แล้วไม่ได้มาแตะฟังก์ชันนี้ · 0328 คัดลอกนิยามเดิมไปแก้เรื่องเลขรัน
   จึงพารายการที่ขาดอยู่แล้วต่อไปอีกทอด
   ⇒ ใบสั่งขาย **134 ใบบน production เป็นภาษาไทยทั้งหมด** ทั้งที่มีใบเสนอราคาอังกฤษ
     15 ใบ — ซึ่งคือ *อาการที่ 0295 สร้างขึ้นมาเพื่อแก้* งอกกลับมาทางเส้นสร้างใบ
   ═══════════════════════════════════════════════════════════════════════ */

/* ของที่ใบใหม่ต้องเริ่มเอง — ตั้งใจไม่ก๊อปจากใบเสนอราคา */
const DRAFT_OWNED = new Set([
  // ฟังก์ชันเซ็ตเอง / เป็นของใบใหม่โดยนิยาม
  'id', 'orderNumber', 'status', 'orderDate', 'createdBy', 'createdByName',
  'createdAt', 'updatedAt', 'approvalMode',
  // ยังไม่มีสายฉบับ — ใบแรกของสายเสมอ
  'baseNumber', 'revisionNo', 'revisionSeparator', 'revisedFromId', 'supersededById',
  'revisedAt', 'revisedBy', 'revisedByName', 'revisionReason',
  // workflow ยังไม่เริ่ม
  'submittedAt', 'submittedBy', 'submittedByName',
  'approvedAt', 'approvedBy', 'approvedByName', 'approvalNote',
  'approvalFingerprint', 'approvalOverrideReason',
  'rejectedAt', 'rejectedBy', 'rejectedByName', 'rejectionReason',
  'financeStatus', 'financeNote', 'financeApprovedAt', 'financeApprovedBy',
  'financeApprovedByName', 'financeRejectedAt', 'financeRejectedBy',
  'financeRejectedByName', 'financeRejectReason', 'financeSignatureEvidenceId',
  'cancelledAt', 'cancelledBy', 'cancelReason', 'cancelReasonCode',
  'signatureEvidenceId', 'proposerSignatureEvidenceId',
  // เจ้าของยอด — trigger แช่ให้ตอนอนุมัติ (mig 0294) เหตุผลเดียวกับ REVISION_RESETS
  'ownerId', 'ownerName',
  // ใบใหม่ยังไม่ผูกสัญญาบริการโดยนิยาม
  'serviceContractId',
]);

/* 🪤 **ทะเบียนนี้ต้องไม่มีชื่อที่ไม่ใช่คอลัมน์จริง** — ของที่ประกาศเกินไม่ทำให้เทสต์แดง
   (ตัวกรองแค่ข้ามมันไป) ⇒ มันอยู่ต่อได้เงียบ ๆ พร้อมเหตุผลที่อาจผิด แล้วคนอ่านรอบหน้า
   ก็เชื่อ · เคยเกิดจริงกับ `team` ซึ่งถูกใส่ไว้พร้อมคำอธิบายว่า "ไม่มีใครเซ็ต" ทั้งที่
   `sales_orders` **ไม่มีคอลัมน์นี้เลย** (รายงานยอดขายประกอบ `order.team` จากทีมปัจจุบัน
   ของเจ้าของยอดที่ชั้น API — ไม่ได้อ่านจากตาราง) */
function assertNoGhosts(list, columns, label) {
  const ghosts = [...list].filter((col) => !columns.has(col)).sort();
  assert.deepEqual(ghosts, [], `${label}: ประกาศชื่อที่ไม่ใช่คอลัมน์จริงของ sales_orders`);
}

test('🪤 ใบสั่งขายที่ออกจากใบเสนอราคาต้องพาทุกคอลัมน์ที่ยังมีความหมายไปด้วย', () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const columns = new Set();
  for (const name of files) {
    const sql = readFileSync(new URL(name, MIGRATIONS), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?public\.sales_orders\s*\(([\s\S]*?)\n\);/g)) {
      for (const line of m[1].split('\n')) {
        const col = /^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+[a-zA-Z]/.exec(line);
        if (col && !['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'].includes(col[1].toUpperCase())) {
          columns.add(col[1]);
        }
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?public\.sales_orders([\s\S]*?);/g)) {
      for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) {
        columns.add(c[1]);
      }
    }
  }

  assertNoGhosts(DRAFT_OWNED, columns, 'DRAFT_OWNED');

  const { file, body } = latestDefinitionOf('create_sales_order_draft');
  const insert = body
    .slice(body.indexOf('INSERT INTO public.sales_orders'), body.indexOf('RETURNING * INTO v_order'))
    .replace(/--[^\n]*/g, '');

  /* ⚠️ ฝั่งค่าของเส้นนี้ไม่ได้อ่านจาก `v_source.` ตัวเดียวเหมือนเส้น Rev. — มันผสม
     `v_quote.` · ตัวแปร `v_*` ของฟังก์ชัน · และค่าที่คำนวณสด ⇒ ตรวจได้แค่ว่า
     **ชื่อคอลัมน์อยู่ในลิสต์** ส่วนค่าที่ใส่ถูกไหมเป็นเรื่องของคนอ่าน SQL */
  const missing = [...columns]
    .filter((col) => !DRAFT_OWNED.has(col))
    .filter((col) => !new RegExp(`[(,]\\s*"?${col}"?[\\s,)]`).test(insert))
    .sort();

  assert.deepEqual(missing, [],
    `${file}: คอลัมน์เหล่านี้ไม่ถูกก๊อปจากใบเสนอราคา และไม่ได้ประกาศว่าใบใหม่เริ่มเอง\n`
    + `  → ถ้าใบใหม่ต้องเริ่มเอง ให้เติมชื่อเข้า DRAFT_OWNED พร้อมเหตุผล\n`
    + `  → ถ้าต้องก๊อป ให้เติมเข้า INSERT ของฟังก์ชันใน migration ใบใหม่`);

  /* 🪤 **ยามข้างบนนับแค่ว่าชื่อคอลัมน์ "โผล่ที่ไหนสักแห่ง" ในก้อน INSERT**
     ⇒ เติมชื่อเข้าลิสต์แล้วลืมเติมค่า มันก็ยังผ่าน · SQL จะพังตอนรัน migration
       ซึ่งคือตอนที่แพงที่สุด (ต้องรอผู้ใช้รันมือแล้วเจอ error กลางทาง)
     ⇒ นับจำนวน "ชื่อ" เทียบจำนวน "ค่า" ที่ระดับคอมมาชั้นนอกสุด ให้เท่ากันเสมอ */
  const cols = topLevelItems(insert.slice(insert.indexOf('('), insert.indexOf(')') + 1));
  const valuesStart = insert.search(/\)\s*(VALUES\s*\(|SELECT\b)/);
  assert.ok(valuesStart > 0, `${file}: หาฝั่งค่าของ INSERT ไม่เจอ`);
  const rest = insert.slice(valuesStart + 1).replace(/^\s*VALUES\s*/i, '');
  const vals = topLevelItems(
    rest.trim().startsWith('(') ? rest.slice(rest.indexOf('('), matchingParen(rest, rest.indexOf('(')) + 1)
      : `(${rest.replace(/\bFROM\b[\s\S]*$/i, '')})`,
  );
  assert.equal(vals.length, cols.length,
    `${file}: INSERT มีชื่อคอลัมน์ ${cols.length} ตัว แต่ฝั่งค่ามี ${vals.length} ตัว\n`
    + '  → เติมชื่อแล้วต้องเติมค่าคู่กันเสมอ ไม่งั้น migration พังตอนผู้ใช้รันมือ');
});

/* แยกรายการที่คั่นด้วยคอมมา **ชั้นนอกสุด** — วงเล็บซ้อน (CAST · COALESCE · jsonb_build_object)
   มีคอมมาข้างในเต็มไปหมด ⇒ split(',') ตรง ๆ นับผิดทันที */
function topLevelItems(block) {
  const inner = block.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let depth = 0; let quote = null; let cur = '';
  for (const ch of inner) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

/* ⭐ ภาษาเอกสารต้องสืบจากใบเสนอราคา ไม่ใช่ตกเป็น DEFAULT 'th'
   (ตัวคอลัมน์ผ่านยามข้างบนแล้ว — ตัวนี้ล็อก **ค่า** ที่ใส่ ซึ่งยามข้างบนตรวจไม่ได้)
   🪤 **จับเจตนา ไม่ใช่รูปประโยค** — ของเดิมจับสตริงตรง ๆ ว่า
      `v_quote."docLanguage" IN ('th', 'en')` ⇒ จัดบรรทัดใหม่ · เปลี่ยนเป็น `= ANY`
      · แทรกช่องว่างเพิ่ม แล้วเทสต์แดงทั้งที่พฤติกรรมไม่ขยับเลย
      ⇒ ยืนยันสองอย่างที่เป็นเจตนาจริง แทนการล็อกตัวอักษร */
test('⭐ ใบสั่งขายสืบภาษาเอกสารจากใบเสนอราคาต้นทาง', () => {
  const { file, body } = latestDefinitionOf('create_sales_order_draft');
  const langExpr = body.slice(Math.max(0, body.indexOf('docLanguage') - 400));
  // ① ค่าที่ใส่ต้องอ้างใบเสนอราคา ไม่ใช่ค่าคงที่
  assert.match(langExpr, /v_quote\s*\.\s*"?docLanguage"?/,
    `${file}: ค่าภาษาต้องอ่านจากใบเสนอราคา ไม่ใช่ค่าคงที่/ค่า DEFAULT`);
  // ② ต้องกันค่าที่ CHECK ของตารางไม่ยอมรับไว้เอง — พูดถึงทั้ง th และ en ในนิพจน์เดียวกัน
  assert.ok(/'th'/.test(langExpr) && /'en'/.test(langExpr),
    `${file}: ต้องจำกัดค่าไว้ที่ th/en ก่อนใส่ ไม่งั้น CHECK ของตารางเตะตอนสร้างใบ`);
});
