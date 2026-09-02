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
  /* เจ้าของใบ — ไม่มีจอไหนอ่าน `sales_orders.ownerId` เลย (เจ้าของงานอ่านจากดีล:
     `order.deal?.ownerId`) ⇒ ก๊อปไปก็เป็นค่าที่ไม่มีใครใช้ */
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
