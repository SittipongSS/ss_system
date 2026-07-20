import { test } from 'node:test';
import assert from 'node:assert';
import {
  EXCISE_CATEGORY_TOKEN,
  normalizeWorkflowTemplateDraft,
  templateMatchesCategory,
  validateWorkflowTemplateSteps,
  workflowTemplateCycle,
  workflowTemplateSummary,
} from './workflowTemplates.js';

const validSteps = () => ([
  { stepKey: 'brief', name: 'รับ Brief', role: 'SA', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [] },
  { stepKey: 'develop', name: 'พัฒนา', role: 'RD', durationDays: 5, dependencyMode: 'custom', dependsOnStepKeys: ['brief'], isMilestone: true },
]);

test('workflow template normalization trims metadata and assigns stable order', () => {
  const result = normalizeWorkflowTemplateDraft({ nameTh: '  งานทดสอบ  ', steps: validSteps() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.nameTh, 'งานทดสอบ');
  assert.deepEqual(result.value.steps.map((row) => row.stepOrder), [0, 1]);
});

test('workflow template rejects duplicate, missing and cyclic dependencies', () => {
  const duplicate = validSteps();
  duplicate[1].stepKey = 'brief';
  assert.match(validateWorkflowTemplateSteps(duplicate).join(' '), /ซ้ำ/);

  const missing = validSteps();
  missing[1].dependsOnStepKeys = ['ghost'];
  assert.match(validateWorkflowTemplateSteps(missing).join(' '), /ไม่พบ dependency/);

  const cyclic = validSteps();
  cyclic[0].dependencyMode = 'custom';
  cyclic[0].dependsOnStepKeys = ['develop'];
  assert.deepEqual(workflowTemplateCycle(cyclic), ['brief', 'develop', 'brief']);
  assert.match(validateWorkflowTemplateSteps(cyclic).join(' '), /Dependency เป็นวง/);
});

test('sequential dependency follows the previous visible row without storing a brittle key', () => {
  const result = normalizeWorkflowTemplateDraft({
    nameTh: 'Sequential',
    steps: [
      { stepKey: 'a', name: 'A', role: 'SA', durationDays: 1, dependencyMode: 'root' },
      { stepKey: 'b', name: 'B', role: 'SA', durationDays: 1, dependencyMode: 'sequential' },
    ],
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.steps[1].dependencyMode, 'sequential');
  assert.deepEqual(result.value.steps[1].dependsOnStepKeys, []);
});

test('category matching preserves only/exclude behavior (literal rules ของ version เก่า)', () => {
  assert.equal(templateMatchesCategory({ categoryOnly: '01-002' }, '01-002'), true);
  assert.equal(templateMatchesCategory({ categoryOnly: '01-002' }, '01-001'), false);
  assert.equal(templateMatchesCategory({ categoryExclude: '01-002' }, '01-002'), false);
  assert.equal(templateMatchesCategory({ categoryExclude: '01-002' }, '01-001'), true);
});

test('token flag:excise ตัดสินจากธง isExcise ของหมวด ไม่ใช่รหัสหมวด', () => {
  const excise = { isExcise: true };
  const plain = { isExcise: false };
  // categoryOnly = token: match เฉพาะหมวดที่ติ๊ก isExcise — รหัสหมวดใดก็ได้
  assert.equal(templateMatchesCategory({ categoryOnly: EXCISE_CATEGORY_TOKEN }, '01-002', excise), true);
  assert.equal(templateMatchesCategory({ categoryOnly: EXCISE_CATEGORY_TOKEN }, '03-005', excise), true);
  assert.equal(templateMatchesCategory({ categoryOnly: EXCISE_CATEGORY_TOKEN }, '01-002', plain), false);
  // ไม่ส่ง flags → token ไม่ match (หมวดถือว่าไม่เสียสรรพสามิต)
  assert.equal(templateMatchesCategory({ categoryOnly: EXCISE_CATEGORY_TOKEN }, '01-002'), false);
  // categoryExclude = token: ตัดขั้นออกเมื่อหมวดติ๊ก isExcise
  assert.equal(templateMatchesCategory({ categoryExclude: EXCISE_CATEGORY_TOKEN }, '03-005', excise), false);
  assert.equal(templateMatchesCategory({ categoryExclude: EXCISE_CATEGORY_TOKEN }, '03-005', plain), true);
  // literal เทียบก่อนเสมอ — validator ที่ iterate token เป็น pseudo-category ยังทำงานได้
  assert.equal(templateMatchesCategory({ categoryOnly: EXCISE_CATEGORY_TOKEN }, EXCISE_CATEGORY_TOKEN), true);
});

test('validator ยอมรับคู่ either-or ที่ใช้ token flag:excise (แพตเทิร์น NPD v2)', () => {
  const rows = [
    { stepKey: 'bill-excise', name: 'วางบิล + สรรพสามิต', role: 'SA', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryOnly: EXCISE_CATEGORY_TOKEN },
    { stepKey: 'bill-plain', name: 'วางบิล (ไม่มีสรรพสามิต)', role: 'SA', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryExclude: EXCISE_CATEGORY_TOKEN },
    { stepKey: 'pay', name: 'รับชำระเงิน', role: 'SA', durationDays: 1, dependencyMode: 'custom', dependsOnStepKeys: ['bill-excise', 'bill-plain'] },
  ];
  const errors = validateWorkflowTemplateSteps(rows).join(' ');
  assert.doesNotMatch(errors, /รับชำระเงิน/);
});

test('category validation rejects a visible step whose ONLY dependency is filtered out', () => {
  const rows = [
    { stepKey: 'excise', name: 'Excise', role: 'LG', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryOnly: '01-002' },
    { stepKey: 'finish', name: 'Finish', role: 'SA', durationDays: 1, dependencyMode: 'custom', dependsOnStepKeys: ['excise'] },
  ];
  assert.match(validateWorkflowTemplateSteps(rows).join(' '), /dependency excise ไม่อยู่ใน หมวดทั่วไป/);
});

test('category validation allows either-or dependency (คู่ exclusive ตามหมวด เหลือ anchor 1 ตัวเสมอ)', () => {
  // แพตเทิร์นจริงของ NPD: วางบิลมี/ไม่มีสรรพสามิต (exclusive กันตามหมวด) → รับชำระเงินพึ่งทั้งคู่
  const rows = [
    { stepKey: 'bill-excise', name: 'วางบิล + สรรพสามิต', role: 'SA', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryOnly: '01-002' },
    { stepKey: 'bill-plain', name: 'วางบิล (ไม่มีสรรพสามิต)', role: 'SA', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryExclude: '01-002' },
    { stepKey: 'pay', name: 'รับชำระเงิน / ยืนยันการโอน', role: 'SA', durationDays: 1, dependencyMode: 'custom', dependsOnStepKeys: ['bill-excise', 'bill-plain'] },
  ];
  const errors = validateWorkflowTemplateSteps(rows).join(' ');
  assert.doesNotMatch(errors, /รับชำระเงิน/);
});

test('workflow summary reports counts without pretending summed days are critical path', () => {
  const summary = workflowTemplateSummary({ steps: [
    { phase: 'A', durationDays: 2, isMilestone: false },
    { phase: 'A', durationDays: 3, isMilestone: true },
    { phase: 'B', durationDays: 1, isMilestone: false },
  ] });
  assert.deepEqual(summary, { steps: 3, phases: 2, milestones: 1, durationDays: 6 });
});
