// ── กติกา FC% ของดีล ───────────────────────────────────────────────────────
//
// มติผู้ใช้ 2026-08-05:
//   SCENT ตั้งต้น 20% · ออกใบเสนอราคาแล้ว → 50%
//   NPD   ออกใบเสนอราคาแล้ว → 50% · + โครงการมี SCENT ที่ปิด Won → 80%
//
// 🐞 ต้นเรื่อง: ทุกเส้นทางที่ขยับ stage **ไม่เคยแตะ probability** เลย ดีลที่ออกใบเสนอ
// ราคาไปแล้วจึงค้าง FC เดิม ทั้งที่หลักฐานอยู่ในระบบแล้ว ⇒ ยอดถ่วงน้ำหนักต่ำกว่าจริง
//
// เทสต์ชุดนี้ยิงกติกาตัวจริง + ผูกไว้กับทุกเส้นทางที่เขียนคอลัมน์นี้ (ไฟล์ route)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEAL_STAGES, DEFAULT_PROBABILITY_BY_STAGE } from '../salesPlanning.js';
import { NPD_AFTER_WON_SCENT, autoProbability } from './dealProbability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const withScent = { wonScentInProject: true };

test('SCENT ตั้งต้น 20% — ยังไม่ออกใบเสนอราคาไม่ว่าอยู่ขั้นไหน', () => {
  for (const stage of ['lead', 'qualified', 'timeline_proposed']) {
    assert.equal(autoProbability({ stage, dealType: 'SCENT' }), 20, stage);
  }
});

test('ออกใบเสนอราคาแล้ว → 50% ทั้ง SCENT และ NPD', () => {
  assert.equal(autoProbability({ stage: 'quotation', dealType: 'SCENT' }), 50);
  assert.equal(autoProbability({ stage: 'quotation', dealType: 'NPD' }), 50);
});

// ⭐ กติกาข้อเดียวที่ "ขั้นอย่างเดียวตอบไม่ได้" — ต้องรู้บริบทของโครงการ
test('NPD ที่โครงการมี SCENT ปิด Won แล้ว → 80%', () => {
  assert.equal(autoProbability({ stage: 'quotation', dealType: 'NPD' }, withScent), NPD_AFTER_WON_SCENT);
  assert.equal(NPD_AFTER_WON_SCENT, 80);
});

test('SCENT ไม่ได้ 80 จากพี่น้องตัวเอง — กติกานี้ของ NPD เท่านั้น', () => {
  assert.equal(autoProbability({ stage: 'quotation', dealType: 'SCENT' }, withScent), 50);
  assert.equal(autoProbability({ stage: 'quotation', dealType: 'RE-ORDER' }, withScent), 50);
});

/* "และถ้าโครงการที่เชื่อมมีดีล SCENT ที่ won แล้ว**อีกด้วย**" — 80 ต่อยอดจาก 50
   ไม่ใช่ทางลัดข้ามขั้น: NPD ที่ยังไม่ออกใบเสนอราคายังเป็น 20 อยู่ */
test('NPD ที่ยังไม่ออกใบเสนอราคา ไม่ได้ 80 แม้โครงการจะมี SCENT ที่ Won', () => {
  for (const stage of ['lead', 'qualified', 'timeline_proposed']) {
    assert.equal(autoProbability({ stage, dealType: 'NPD' }, withScent), 20, stage);
  }
});

test('ขั้นที่ฐานสูงกว่า 80 อยู่แล้ว ต้องไม่ถูกกติกานี้กดลง', () => {
  for (const stage of ['awaiting_confirm', 'deposit_pending']) {
    assert.equal(autoProbability({ stage, dealType: 'NPD' }, withScent), 80, stage);
  }
});

test('ดีลที่ปิดแล้ว ระบบเป็นคนตั้ง — กติกาไหนก็ห้ามแตะ', () => {
  assert.equal(autoProbability({ stage: 'won', dealType: 'NPD' }, withScent), 100);
  assert.equal(autoProbability({ stage: 'in_project', dealType: 'NPD' }, withScent), 100);
  assert.equal(autoProbability({ stage: 'lost', dealType: 'NPD' }, withScent), 0);
});

test('ประเภทดีลอ่านจาก metadata ได้ด้วย (ข้อมูลก่อน backfill คอลัมน์ dealType)', () => {
  assert.equal(autoProbability({ stage: 'quotation', metadata: { projectType: 'NPD' } }, withScent), 80);
});

// ทุกขั้นต้องมีคำตอบ — stage ใหม่ที่ลืมใส่ในตารางจะได้ค่าของ 'lead' ไม่ใช่ undefined
test('ทุกขั้นใน DEAL_STAGES ได้ตัวเลขที่อยู่ในตารางกลาง', () => {
  for (const stage of DEAL_STAGES) {
    assert.equal(autoProbability({ stage, dealType: 'SCENT' }), DEFAULT_PROBABILITY_BY_STAGE[stage], stage);
  }
});

/* ── ผูกกติกาเข้ากับทุกเส้นทางที่เขียนคอลัมน์ probability ───────────────────
   ⚠️ ถ้ามีเส้นทางใหม่ที่ขยับ stage แล้วไม่เรียกกติกานี้ คอลัมน์จะค้างอีกแบบเดิม */
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('ออกใบเสนอราคาแล้ว FC ขยับตามในธุรกรรมเดียวกับที่ขยับขั้น', () => {
  const src = read('src/lib/sales/createQuotationDraft.js');
  assert.match(src, /resolveProbability\(supabase, \{ \.\.\.deal, stage: nextStage \}\)/);
  assert.match(src, /update\(\{ stage: nextStage, probability: nextProbability/,
    'ต้องเขียนพร้อมกัน — คนละ update = มีช่วงที่ขั้นกับ FC ไม่ตรงกัน');
});

test('PATCH ดีล: ขั้นเปลี่ยน = FC มาจากกติกา ไม่ใช่ค่าที่ client ส่งมา', () => {
  const src = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(src, /const stageChanged = 'stage' in body && nextStage !== before\.stage;/);
  assert.match(src, /if \(stageChanged && !alreadyWon\) \{\s*patch\.probability = await resolveProbability/);
  // เลือกเองยังได้ตอนบันทึกที่ไม่ได้ขยับขั้น
  assert.match(src, /\} else if \('probability' in body && !alreadyWon\) \{/);
});

test('สร้างดีล: FC มาจากขั้น ไม่ใช่จากฟอร์ม', () => {
  const src = read('src/app/api/sales-planning/deals/route.js');
  assert.match(src, /probability: autoProbability\(\{ stage,/);
  assert.doesNotMatch(src, /probability: toProbability\(body\.probability/,
    'ฟอร์มเคยส่ง "50" มาตลอดทั้งที่ขั้นตั้งต้นคือ lead');
  // ค่าตั้งต้นของฟอร์มก็ต้องผูกกับขั้น ไม่ใช่เลขลอย
  assert.match(read('src/components/salesPlanning/ui.js'),
    /probability: String\(DEFAULT_PROBABILITY_BY_STAGE\.lead\)/);
});

test('ผูกโครงการแล้วคิด FC ใหม่ — เพิ่งรู้ว่ามีพี่น้องใบไหน', () => {
  const src = read('src/app/api/sales-planning/deals/[id]/link-project/route.js');
  assert.match(src, /resolveProbability\(supabase, \{/);
  assert.match(src, /probability: nextProbability,/);
});

test('SCENT ปิด Won → cascade ไป NPD พี่น้อง แล้วลงประวัติไว้', () => {
  const src = read('src/app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.match(src, /cascadeNpdProbability\(supabase, updatedDeal\?\.projectId \|\| deal\.projectId/);
  // พลาดตรงนี้ต้องไม่ล้ม accept — ดีลปิดไปแล้วจริง
  assert.match(src, /catch \(cascadeError\)/);
  assert.match(src, /for \(const row of cascaded\)/, 'FC ที่ขยับเองต้องมีร่องรอยให้ตามได้');
});
