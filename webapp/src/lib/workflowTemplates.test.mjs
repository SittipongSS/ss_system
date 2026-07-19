import { test } from 'node:test';
import assert from 'node:assert';
import {
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

test('category matching preserves only/exclude behavior', () => {
  assert.equal(templateMatchesCategory({ categoryOnly: '01-002' }, '01-002'), true);
  assert.equal(templateMatchesCategory({ categoryOnly: '01-002' }, '01-001'), false);
  assert.equal(templateMatchesCategory({ categoryExclude: '01-002' }, '01-002'), false);
  assert.equal(templateMatchesCategory({ categoryExclude: '01-002' }, '01-001'), true);
});

test('category validation rejects a visible step that depends on a filtered-out step', () => {
  const rows = [
    { stepKey: 'excise', name: 'Excise', role: 'LG', durationDays: 1, dependencyMode: 'root', dependsOnStepKeys: [], categoryOnly: '01-002' },
    { stepKey: 'finish', name: 'Finish', role: 'SA', durationDays: 1, dependencyMode: 'custom', dependsOnStepKeys: ['excise'] },
  ];
  assert.match(validateWorkflowTemplateSteps(rows).join(' '), /dependency excise ไม่อยู่ใน หมวดทั่วไป/);
});

test('workflow summary reports counts without pretending summed days are critical path', () => {
  const summary = workflowTemplateSummary({ steps: [
    { phase: 'A', durationDays: 2, isMilestone: false },
    { phase: 'A', durationDays: 3, isMilestone: true },
    { phase: 'B', durationDays: 1, isMilestone: false },
  ] });
  assert.deepEqual(summary, { steps: 3, phases: 2, milestones: 1, durationDays: 6 });
});
