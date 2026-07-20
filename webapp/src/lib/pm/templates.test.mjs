// Tests การแยก template ตามประเภทดีล 3 ค่า (เฟส A Sales Revamp) — กันแตก 2 เรื่อง:
// (1) ชุด step ของแต่ละ template ครบ/ไม่ปนกัน + dependsOnSteps ไม่อ้างข้าม template
// (2) templateForMerge กันข้อมูลหาย: โครงการ NPD เก่าที่มี task ช่วงกลิ่นต้องได้ชุด legacy
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  SCENT_TEMPLATE,
  NPD_TEMPLATE,
  REORDER_TEMPLATE,
  NPD_LEGACY_FULL_TEMPLATE,
  templateFor,
  templateForMerge,
} from './templates';
import { setHolidays } from './dateHelpers';
import { buildProjectTasks } from './schedule';
import { EXCISE_CATEGORY_TOKEN } from '../workflowTemplates';

const names = (tpl) => tpl.map((t) => t.name);

test('SCENT = ขั้นขาย+ออกแบบกลิ่น 8 ขั้น จบที่ Confirm กลิ่น', () => {
  assert.equal(SCENT_TEMPLATE.length, 8);
  assert.equal(SCENT_TEMPLATE[0].name, 'ประชุมลูกค้า');
  const last = SCENT_TEMPLATE[SCENT_TEMPLATE.length - 1];
  assert.equal(last.name, 'Feedback/Confirm กลิ่น ครั้งที่ 1');
  assert.ok(last.isMilestone);
  // ไม่มีขั้นฝั่งผลิต/ส่งมอบปนมา
  assert.ok(!names(SCENT_TEMPLATE).includes('ผลิตสินค้า'));
  assert.ok(!names(SCENT_TEMPLATE).includes('ขึ้น Mock-up สินค้า'));
});

test('NPD ใหม่เริ่มที่ Mock-up ไม่มีขั้นกลิ่น และยังมีขั้นสรรพสามิต', () => {
  assert.equal(NPD_TEMPLATE[0].name, 'ขึ้น Mock-up สินค้า');
  const scentNames = new Set(names(SCENT_TEMPLATE));
  for (const n of names(NPD_TEMPLATE)) {
    assert.ok(!scentNames.has(n), `ขั้นกลิ่นหลุดมาใน NPD: ${n}`);
  }
  const excise = NPD_TEMPLATE.find((t) => t.name.startsWith('ขึ้นทะเบียนสรรพสามิต'));
  assert.ok(excise, 'NPD ต้องคงขั้นขึ้นทะเบียนสรรพสามิต');
  // mig 0131: ขั้นสรรพสามิตผูกกับ token ธงหมวด ไม่ hardcode รหัส 01-002
  assert.equal(excise.categoryOnly, EXCISE_CATEGORY_TOKEN);
  assert.equal(NPD_TEMPLATE[NPD_TEMPLATE.length - 1].name, 'จัดส่งสินค้า');
});

test('dependsOnSteps ของทุก template อ้างเฉพาะ step ที่อยู่ในชุดตัวเอง', () => {
  for (const [label, tpl] of [['SCENT', SCENT_TEMPLATE], ['NPD', NPD_TEMPLATE], ['RE-ORDER', REORDER_TEMPLATE], ['NPD_LEGACY', NPD_LEGACY_FULL_TEMPLATE]]) {
    const steps = new Set(tpl.map((t) => t.step));
    for (const t of tpl) {
      for (const dep of t.dependsOnSteps || []) {
        assert.ok(steps.has(dep), `${label}: step ${t.step} อ้าง dep ${dep} ที่ไม่มีในชุด`);
      }
    }
  }
});

test('templateFor แม็ป 3 ประเภท + ค่าแปลกตกเป็น NPD', () => {
  assert.equal(templateFor('SCENT'), SCENT_TEMPLATE);
  assert.equal(templateFor('NPD'), NPD_TEMPLATE);
  assert.equal(templateFor('RE-ORDER'), REORDER_TEMPLATE);
  assert.equal(templateFor(undefined), NPD_TEMPLATE);
  assert.equal(templateFor('อะไรก็ไม่รู้'), NPD_TEMPLATE);
});

test('legacy full = SCENT+NPD ครบเส้น และ step 25 คืน dep [3] เฉพาะชุด legacy', () => {
  assert.equal(NPD_LEGACY_FULL_TEMPLATE.length, SCENT_TEMPLATE.length + NPD_TEMPLATE.length);
  const legacy25 = NPD_LEGACY_FULL_TEMPLATE.find((t) => t.step === 25);
  assert.deepEqual(legacy25.dependsOnSteps, [3]);
  const new25 = NPD_TEMPLATE.find((t) => t.step === 25);
  assert.deepEqual(new25.dependsOnSteps, []); // long-lead ขนานจากต้นโครงการ
});

test('templateForMerge: โครงการ NPD เก่าที่มี task กลิ่น (origin=template) ได้ชุด legacy — กันงานถูกลบ', () => {
  const legacyTasks = [
    { name: 'ออกแบบกลิ่น', origin: 'template' },
    { name: 'ผลิตสินค้า', origin: 'template' },
  ];
  assert.equal(templateForMerge('NPD', legacyTasks), NPD_LEGACY_FULL_TEMPLATE);
  // โครงการ NPD ใหม่ (ไม่มี task กลิ่น) → ชุดใหม่
  assert.equal(templateForMerge('NPD', [{ name: 'ผลิตสินค้า', origin: 'template' }]), NPD_TEMPLATE);
  // task กลิ่นที่ผู้ใช้เพิ่มเอง (custom) ไม่นับเป็น legacy
  assert.equal(templateForMerge('NPD', [{ name: 'ออกแบบกลิ่น', origin: 'custom' }]), NPD_TEMPLATE);
  // ประเภทอื่นไม่แตะ logic legacy
  assert.equal(templateForMerge('SCENT', legacyTasks), SCENT_TEMPLATE);
  assert.equal(templateForMerge('RE-ORDER', legacyTasks), REORDER_TEMPLATE);
});

test('buildProjectTasks gen ได้ทั้ง 3 ประเภท (smoke — ไม่มี dangling predecessor)', () => {
  setHolidays([]);
  for (const type of ['SCENT', 'NPD', 'RE-ORDER']) {
    // หมวดสรรพสามิต — ตั้งแต่ mig 0131 ต้องส่งธงของหมวดเข้า templateOptions
    const rows = buildProjectTasks(
      { type, productMainCategory: '01-002', startDate: '2026-07-13', aeOwner: 'AE' },
      'PRJ-test', null, { categoryFlags: { isExcise: true } },
    );
    assert.ok(rows.length > 0, `${type}: มี task`);
    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows) {
      for (const p of r.predecessors || []) assert.ok(ids.has(p), `${type}: dangling predecessor ${p}`);
    }
    assert.equal(rows.length, templateFor(type).filter((t) => t.categoryExclude !== EXCISE_CATEGORY_TOKEN).length, `${type}: จำนวนตรง template (หมวดสรรพสามิต)`);
  }
});

test('buildProjectTasks: ไม่ส่ง categoryFlags → ขั้นสรรพสามิต (token) ไม่ถูก gen', () => {
  setHolidays([]);
  const rows = buildProjectTasks(
    { type: 'NPD', productMainCategory: '01-002', startDate: '2026-07-13', aeOwner: 'AE' }, 'PRJ-test',
  );
  assert.ok(!rows.some((r) => r.name.startsWith('ขึ้นทะเบียนสรรพสามิต')));
  // คู่ either-or ต้องเหลือฝั่ง "ไม่มีสรรพสามิต"
  assert.ok(rows.some((r) => r.name === 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)'));
});
