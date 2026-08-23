// ── ความสมบูรณ์ของ "สถานะดีล" ตลอดสาย LD → DL → PJ → QT → SO ──────────────
//
// ผลตรวจ flow 2026-08-04 เจอสองรอยรั่วที่คนละอาการแต่รากเดียวกัน: มีเส้นทางที่
// **ขยับ stage เอง** โดยไม่ผ่านกติกากลาง
//
//   1. `POST /deals/[id]/timeline` สะกดลิสต์สถานะเองว่า ['lead','qualified','quotation']
//      → ดีลที่ออกใบเสนอราคาไปแล้ว (stage=quotation) แล้วโครงการถูกลบ (FK SET NULL,
//      mig 0064) กลับมาสร้างไทม์ไลน์ใหม่ จะถูก **ดึงถอย** เป็น timeline_proposed
//      ทั้งที่ใบยังอยู่ — ตรงข้ามกับมติ B4 (2026-07-28) ที่ dealStageOrder.test.mjs
//      ตรึงไว้แล้วในระดับฟังก์ชัน แต่ route นี้เลี่ยงฟังก์ชันไปเลย
//
//   2. `createQuotationDraft` ดัน stage → 'quotation' แต่ **ไม่เขียน
//      sales_deal_stage_history** เส้นเดียวในระบบที่ลืม (create-project /
//      link-project / timeline / PATCH ดีล / accept RPC เขียนกันครบ) ผลคือขั้น
//      "เสนอราคา" หายจากเส้นเรื่องของดีล และ `daysInStage` บนหน้าดีล (นับจาก
//      stageHistory[0].changedAt) ไปนับจากการเปลี่ยนสถานะครั้งก่อน = ยาวเกินจริง
//
// ทั้งคู่เป็น ratchet อ่าน source เพราะของจริงอยู่ใน route handler ที่เรียก supabase —
// เรียกตรงในเทสต์ไม่ได้ถ้าไม่ stub ทั้งไคลเอนต์
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const TIMELINE_ROUTE = 'app/api/sales-planning/deals/[id]/timeline/route.js';
const QUOTE_DRAFT = 'lib/sales/createQuotationDraft.js';

// เส้นทางทั้งหมดที่ขยับ stage ของดีล — ทุกเส้นต้องผ่าน advanceStage ตัวเดียวกัน
const ADVANCING_ROUTES = [
  'app/api/sales-planning/deals/[id]/create-project/route.js',
  'lib/sales/dealProjectLink.js',   // เนื้อในของ link-project (โมดัลปิด Won เรียกตัวเดียวกัน)
  TIMELINE_ROUTE,
  QUOTE_DRAFT,
];

test('ทุกเส้นทางที่ดัน stage ต้องเรียก advanceStage — ห้ามสะกดลิสต์สถานะเอง', () => {
  for (const rel of ADVANCING_ROUTES) {
    const src = read(rel);
    assert.match(src, /advanceStage\(/, `${rel} ต้องใช้ advanceStage`);
  }
});

test('timeline route ต้องไม่ดึงดีลที่ออกใบเสนอราคาแล้วถอยกลับ', () => {
  const src = read(TIMELINE_ROUTE);
  // ลิสต์ที่สะกดเองเป็นต้นเหตุ — ห้ามกลับมา (ตัวไหนก็ตามที่มี 'quotation' อยู่ในลิสต์
  // แล้วเซ็ต stage เป็น timeline_proposed คือการถอย)
  assert.doesNotMatch(
    src,
    /\[\s*'lead',\s*'qualified',\s*'quotation'\s*\]/,
    'ห้ามสะกดลิสต์สถานะเองใน timeline route — ใช้ advanceStage',
  );
  assert.match(
    src,
    /advanceStage\(deal\.stage,\s*'timeline_proposed'\)/,
    'ต้องขยับผ่าน advanceStage ไปที่ timeline_proposed',
  );
});

test('ออกใบเสนอราคาแล้วดัน stage ต้องบันทึก sales_deal_stage_history ด้วย', () => {
  const src = read(QUOTE_DRAFT);
  assert.match(
    src,
    /sales_deal_stage_history/,
    'createQuotationDraft ต้องเขียนประวัติสถานะเมื่อดันดีลไปขั้น "เสนอราคา"',
  );
  // ต้องอยู่ใน block เดียวกับการขยับ stage (ไม่ใช่เขียนทุกครั้งแม้ stage ไม่เปลี่ยน)
  const block = src.slice(src.indexOf('const nextStage = advanceStage'));
  const guardEnd = block.indexOf('await recordAudit');
  assert.ok(
    block.slice(0, guardEnd).includes('sales_deal_stage_history'),
    'ประวัติต้องเขียนภายใน guard nextStage !== deal.stage',
  );
});

test('ทุกเส้นทางที่ขยับ stage เขียนประวัติครบ — ไม่มีเส้นไหนเงียบ', () => {
  for (const rel of ADVANCING_ROUTES) {
    assert.match(
      read(rel),
      /sales_deal_stage_history/,
      `${rel} ขยับ stage แล้วต้องลงประวัติ ไม่งั้นเส้นเรื่องของดีลเป็นรู`,
    );
  }
});

// ── metadata ของโครงการ: merge ไม่ใช่ replace ────────────────────────────
// เหตุผลเดียวกับ PATCH ดีล (ซึ่งแก้ไปแล้ว): กุญแจที่ route อื่นเขียนไว้ —
// `dealOrder` (PUT /deal-order) และ `salesDealId`/`source` (create-project) —
// จะหลุดหายเงียบ ๆ ถ้า PATCH เขียนทับทั้งก้อนจากสิ่งที่ client ส่งมา
test('PATCH โครงการต้อง merge metadata ทับของเดิม ไม่ใช่เขียนทับทั้งก้อน', () => {
  const src = read('app/api/pm/projects/[id]/route.js');
  assert.match(
    src,
    /updates\.metadata\s*=\s*\{\s*\.\.\.\(project\.metadata \|\| \{\}\),\s*\.\.\.updates\.metadata\s*\}/,
    'metadata ต้อง merge จาก project.metadata เดิมก่อนเขียน',
  );
});
