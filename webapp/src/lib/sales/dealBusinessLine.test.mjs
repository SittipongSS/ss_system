// ── สายธุรกิจของดีล (mig 0275/0276) — กุญแจครึ่งที่สองของแม่แบบไทม์ไลน์ ──────
//
// มติผู้ใช้ 2026-08-20: "สาย" (สินค้า/บริการ) มีผลต่อขั้นตอนไทม์ไลน์ ⇒ ดีลต้องถือ
// สายของตัวเอง เพราะไทม์ไลน์ถูก gen พร้อมดีล (DL1) ตั้งแต่ก่อนมีโครงการ
//
// เทสต์ชุดนี้ล็อกสามเรื่องที่พังเงียบได้ง่ายที่สุด:
//   1. ไม่มีใครแอบ "เดาสายเป็น PRODUCT" ให้ตอนหาแม่แบบ
//   2. คอลัมน์ใหม่ไม่มี DEFAULT (บทเรียน projects.type ที่ default 'NPD')
//   3. ดีลกับโครงการต้องสายเดียวกัน — ผูกข้ามสายไม่ได้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const mig0275 = read('supabase/migrations/0275_deal_business_line.sql');
const mig0276 = read('supabase/migrations/0276_workflow_template_service_line.sql');

test('0275: คอลัมน์ line ของดีลไม่มี DEFAULT และมี CHECK สองค่า', () => {
  assert.match(mig0275, /ALTER TABLE public\.sales_deals\s+ADD COLUMN IF NOT EXISTS line text;/);
  assert.doesNotMatch(mig0275, /ADD COLUMN IF NOT EXISTS line text[^;]*DEFAULT/i,
    'ห้ามมี default — ทุกดีลจะกลายเป็นสายเดียวกันหมดโดยไม่มีใครเลือก (ดู mig 0191)');
  assert.match(mig0275, /CHECK \(line IS NULL OR line IN \('PRODUCT', 'SERVICE'\)\)/);
});

test('0275: backfill มาจากโครงการที่ผูกอยู่เท่านั้น ไม่เดาจากทีม', () => {
  assert.match(mig0275, /UPDATE public\.sales_deals AS d[\s\S]*FROM public\.projects AS p[\s\S]*WHERE d\."projectId" = p\.id/);
  assert.match(mig0275, /AND d\.line IS NULL/, 'ต้องเขียนเฉพาะแถวที่ยังว่าง');
  assert.doesNotMatch(mig0275, /d\.team/, 'ทีมขาย ≠ สายธุรกิจ (มติ #868) — ห้ามเดาจากทีม');
});

test('0276: เปิดคีย์สายบริการ 3 ตัว และ SCENT เป็นใบใช้ร่วม', () => {
  for (const key of ['SERVICE-NPD', 'SERVICE-RE-ORDER', 'SERVICE-OTHER']) {
    assert.ok(mig0276.includes(`'${key}'`), `CHECK ยังไม่รับคีย์ ${key}`);
  }
  assert.match(mig0276, /CHECK \(line IN \('PRODUCT', 'SERVICE', 'BOTH'\)\)/);
  assert.match(mig0276, /UPDATE public\.workflow_templates SET line = 'BOTH' WHERE "templateKey" = 'SCENT'/);
});

test('0276: ก๊อปขั้นตอนจากใบสายสินค้า และปิด/เปิด trigger ครบคู่', () => {
  assert.match(mig0276, /INSERT INTO public\.workflow_template_steps[\s\S]*FROM public\.workflow_template_steps s[\s\S]*WHERE s\."versionId" = v_source\.id/);
  const off = (mig0276.match(/DISABLE TRIGGER/g) || []).length;
  const on = (mig0276.match(/ENABLE TRIGGER/g) || []).length;
  assert.equal(off, on, 'ปิด trigger กี่ตัวต้องเปิดคืนครบเท่านั้น');
  // เวอร์ชันแรกต้อง published ไม่ใช่ draft — ร่างล้วนแปลว่า gen ไทม์ไลน์ไม่ได้เลย
  // และ RPC สร้างฉบับร่างก็เด้ง workflow_template_published_missing (ตันสองทาง)
  assert.match(mig0276, /1, 'published'/);
});

test('ตัวหาแม่แบบต้องผ่าน loadWorkflowTemplateForDeal — ห้ามส่งประเภทดีลลอย ๆ', () => {
  const gen = read('src/lib/sales/dealTimelineGen.js');
  assert.match(gen, /loadWorkflowTemplateForDeal\(supabase, \{ line: genLine, dealType: genType \}\)/);
  assert.doesNotMatch(gen, /loadWorkflowTemplateForGeneration/);
});

test('API สร้างดีลบังคับเลือกสาย และเขียนลงคอลัมน์จริง', () => {
  const route = read('src/app/api/sales-planning/deals/route.js');
  assert.match(route, /const line = normalizeBusinessLine\(body\.line\);/);
  assert.match(route, /if \(!line\) return badRequest\(/);
  assert.match(route, /^\s{4}line,$/m, 'ต้องเขียนลงคอลัมน์ line ของแถวดีล');
});

test('PATCH: ค่าว่าง = ไม่แตะ (ดีลเก่ายังแก้ได้) · ดีลเก่าในโครงการสลับสายได้ (มติ ⑫ งวด P3b-2)', () => {
  const route = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(route, /if \('line' in body && \(body\.line \?\? ''\) !== ''\)/);
  assert.doesNotMatch(route, /ดีลนี้ผูกโครงการแล้ว — เปลี่ยนสายธุรกิจที่โครงการแทน/, 'ปลดล็อกสายของดีลเก่าในโครงการ');
  assert.match(route, /if \(typeChanged \|\| categoryChanged \|\| lineChanged\) \{/, 'regen ครอบดีลเก่าในโครงการด้วย');
  assert.doesNotMatch(route, /\.is\('projectId', null\)/, 'ชุดของดีล = ทุกขั้นที่ dealId ตรง (รวมแถวเก่าที่ถือ projectId)');
  assert.match(route, /const lineChanged = 'line' in patch/, 'สายเปลี่ยนต้อง regen ไทม์ไลน์ด้วย');
});

// (ยาม "ผูก/ก่อโครงการ: ข้ามสายไม่ได้" ถอดใน P3a — ยุบโครงการ 16/11 ลบ dealProjectLink + create-project ของดีล)

test('ฟอร์มดีลมีช่องสาย · ไม่มีช่องโครงการ (P2d) · ดีลเก่าในโครงการไม่ล็อกสาย (มติ ⑫ งวด P3b-2)', () => {
  const fields = read('src/components/salesPlanning/DealFormFields.js');
  assert.match(fields, /<BusinessLineSelect/);
  assert.doesNotMatch(fields, /const projectField|entity="project"/, 'ช่องโครงการถูกถอด — ห้ามไหลกลับ');
  assert.doesNotMatch(fields, /lineLockedByProject/);
  assert.match(fields, /disabled=\{alreadyWon\}\s+ariaLabel="สายธุรกิจของดีล"/);
  const modal = read('src/components/salesPlanning/DealCreateModal.js');
  assert.match(modal, /if \(!draft\.line\)/, 'โมดัลต้องบังคับเลือกสายก่อนยิง API');
});
