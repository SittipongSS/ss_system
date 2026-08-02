import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  EXCISE_CATEGORY_TOKEN,
  WORKFLOW_TEMPLATE_KEYS,
  WORKFLOW_TEMPLATE_ROLES,
  findWorkflowTemplate,
  missingWorkflowTemplatePairs,
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

// ── กติกา role อยู่ 3 ที่ ต้องตรงกันเป๊ะ (mig 0192) ───────────────────────
//
// ⭐ บทเรียนจากรอบตรวจ Record Control: **เอากติกาสองที่มาเทียบกันแล้วเจอบั๊กเงียบ**
// ที่เทสต์เดิมจับไม่ได้ · ที่นี่มีถึงสามที่ (โค้ด · CHECK ของตาราง · validation ใน RPC)
// ถ้าแก้ไม่ครบ อาการคือ "เลือกได้ในหน้าตั้งค่า แต่กดบันทึกแล้วเด้ง
// workflow_template_steps_invalid" ซึ่งอ่านไม่ออกว่าเป็นเพราะอะไร
{
  const sqlUrl = new URL('../../supabase/migrations/0192_workflow_step_role_ts.sql', import.meta.url);
  const sql = readFileSync(sqlUrl, 'utf8');
  // ดึงรายชื่อ role จากคำสั่ง SQL แบบเดียวกับที่ Postgres อ่าน — ไม่ใช่ regex หลวม ๆ
  const rolesFrom = (pattern) => {
    const match = sql.match(pattern);
    assert.ok(match, `หาไม่เจอใน 0192: ${pattern}`);
    return match[1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
  };

  test('0192: CHECK ของตารางมี TS และครบทุกค่าที่โค้ดยอมรับ', () => {
    const checkRoles = rolesFrom(/ADD CONSTRAINT workflow_template_steps_role_check\s*\n\s*CHECK \(role IN \(([^)]+)\)\)/);
    assert.ok(checkRoles.includes('TS'), 'CHECK ของตารางยังไม่มี TS');
    assert.deepEqual(checkRoles, [...WORKFLOW_TEMPLATE_ROLES], 'CHECK ของตารางกับ WORKFLOW_TEMPLATE_ROLES ไม่ตรงกัน');
  });

  test('0192: validation ใน RPC save_workflow_template_draft ตรงกับ CHECK และโค้ด', () => {
    const rpcRoles = rolesFrom(/\(s->>'role'\) NOT IN \(([^)]+)\)/);
    assert.ok(rpcRoles.includes('TS'), 'RPC ยังไม่รับ TS — เลือกได้แต่บันทึกไม่ผ่าน');
    assert.deepEqual(rpcRoles, [...WORKFLOW_TEMPLATE_ROLES], 'RPC กับ WORKFLOW_TEMPLATE_ROLES ไม่ตรงกัน');
  });

  // ⚠️ RPC ในใบนี้คัดมาทั้งดวงจาก 0121 — ถ้าใครเขียนใหม่จากความจำแล้วกลืนกติกาอื่นหาย
  // เทสต์นี้จะฟ้อง (ด่านที่ต้องมีครบตามนิยามเดิม)
  test('0192: RPC ยังมีด่านอื่นครบตามนิยามเดิมของ 0121', () => {
    for (const guard of [
      'workflow_template_version_not_found',
      'workflow_template_version_not_draft',
      'workflow_template_draft_stale',
      'workflow_template_step_key_duplicate',
      'workflow_template_dependency_invalid',
    ]) {
      assert.ok(sql.includes(guard), `RPC ใน 0192 ทำด่าน ${guard} หาย`);
    }
  });
}

// ── คู่ (line, templateKey) — mig 0193 ────────────────────────────────────
test('0193: ทุกแถวเดิมถูก backfill เป็น PRODUCT และปิด NULL', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0193_workflow_template_line.sql', import.meta.url), 'utf8');
  // เทียบด้วยสตริงตรง ๆ ไม่ใช้ regex — ช่องว่างในไฟล์จัดคอลัมน์ไว้ให้อ่านง่าย
  // การยืดหยุ่นด้วย \s+ เคยทำให้เทสต์นี้พังจากการ escape ตอนเขียนไฟล์มาแล้ว
  const squeeze = (text) => text.replace(/\s+/g, ' ');
  const flat = squeeze(sql);
  for (const table of ['workflow_templates', 'workflow_template_versions']) {
    assert.ok(
      flat.includes(squeeze(`UPDATE public.${table} SET line = 'PRODUCT' WHERE line IS NULL`)),
      `${table} ไม่มี backfill`,
    );
    assert.ok(
      flat.includes(squeeze(`ALTER TABLE public.${table} ALTER COLUMN line SET NOT NULL`)),
      `${table} ไม่ได้ปิด NULL — แม่แบบที่ line ว่างจะไม่มีทางถูกค้นเจอด้วย (line, type)`,
    );
  }
  // ⚠️ ต่างจาก projects.line (0191) ที่ตั้งใจให้ NULL ได้ — ที่นี่ห้ามมี default
  // (แม่แบบต้องระบุสายเสมอ ไม่งั้นค้นด้วยคู่ (line, type) ไม่เจอ)
  assert.ok(!/ADD COLUMN IF NOT EXISTS line text DEFAULT/i.test(flat), 'ห้ามมี DEFAULT บนคอลัมน์ line');
});

// 🔴 บทเรียนจากรอบแรกที่ใบนี้ล้มบน prod: guard_workflow_template_version บล็อก
// UPDATE **ทุกชนิด** บนแถวที่ไม่ใช่ draft (published_immutable / archived_immutable)
// โดยไม่ดูว่าแก้คอลัมน์ไหน ⇒ backfill ต้องปิด trigger ชั่วคราว
test('0193: backfill ฝั่ง versions ต้องปิด trigger แล้วเปิดคืนครบคู่', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0193_workflow_template_line.sql', import.meta.url), 'utf8');
  const flat = sql.replace(/\s+/g, ' ');
  const disable = 'ALTER TABLE public.workflow_template_versions DISABLE TRIGGER workflow_template_versions_guard';
  const enable = 'ALTER TABLE public.workflow_template_versions ENABLE TRIGGER workflow_template_versions_guard';
  assert.ok(flat.includes(disable), 'ไม่ได้ปิด trigger — backfill จะล้มด้วย published_immutable บน prod');
  assert.ok(flat.includes(enable), 'ปิด trigger แล้วไม่ได้เปิดคืน — ด่านของตารางจะหายถาวร');
  assert.ok(flat.indexOf(disable) < flat.indexOf(enable), 'ลำดับผิด: ต้องปิดก่อน backfill แล้วเปิดหลัง');
  // ต้องอยู่ในทรานแซกชันเดียวกัน — ล้มกลางคันแล้ว trigger ต้องกลับมาเอง
  assert.ok(flat.indexOf('BEGIN;') < flat.indexOf(disable) && flat.indexOf(enable) < flat.indexOf('COMMIT;'),
    'disable/enable ต้องอยู่ระหว่าง BEGIN…COMMIT');
});

// ⚠️ guard ในใบนี้คัดมาทั้งดวงจาก 0136 — เทสต์นี้ฟ้องถ้าใครเขียนใหม่จากความจำ
// แล้วกลืนด่านอื่นหาย (แพตเทิร์นเดียวกับที่ทำกับ RPC ใน 0192)
test('0193: guard ที่เขียนทับยังมีด่านเดิมครบ + เพิ่ม line เข้าชุดตัวตน', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0193_workflow_template_line.sql', import.meta.url), 'utf8');
  for (const guard of [
    'workflow_template_version_delete_forbidden',
    'workflow_template_version_identity_immutable',
    'workflow_template_version_archived_immutable',
    'workflow_template_version_published_immutable',
    'workflow_template_version_hide_active_forbidden',
    'workflow_template_version_transition_payload_changed',
  ]) {
    assert.ok(sql.includes(guard), `guard ใน 0193 ทำด่าน ${guard} หาย`);
  }
  assert.ok(sql.replace(/\s+/g, ' ').includes('OR NEW.line IS DISTINCT FROM OLD.line'),
    'ยังไม่ได้กัน line ของเวอร์ชันไม่ให้เปลี่ยน — เวอร์ชันจะหลุดสายจากแม่แบบได้');
});

test('findWorkflowTemplate: หาไม่เจอคืน null ไม่ตกไปหาสายอื่น', () => {
  const rows = [
    { line: 'PRODUCT', templateKey: 'NPD', publishedVersionId: 'workflow-npd-v2' },
    { line: 'PRODUCT', templateKey: 'SCENT', publishedVersionId: 'workflow-scent-v1' },
  ];
  assert.equal(findWorkflowTemplate(rows, 'PRODUCT', 'NPD').publishedVersionId, 'workflow-npd-v2');
  // ⭐ ข้อสำคัญ: SERVICE/NPD ยังไม่มี ต้องคืน null ไม่ใช่ยืม PRODUCT/NPD มาให้
  assert.equal(findWorkflowTemplate(rows, 'SERVICE', 'NPD'), null);
  assert.equal(findWorkflowTemplate(rows, '', 'NPD'), null);
  assert.equal(findWorkflowTemplate(rows, 'PRODUCT', ''), null);
  assert.equal(findWorkflowTemplate([], 'PRODUCT', 'NPD'), null);
});

test('missingWorkflowTemplatePairs: บอกช่องว่างครบ 6 คู่', () => {
  assert.equal(missingWorkflowTemplatePairs([]).length, 6);
  const prodOnly = WORKFLOW_TEMPLATE_KEYS.map((templateKey) => ({ line: 'PRODUCT', templateKey }));
  assert.deepEqual(missingWorkflowTemplatePairs(prodOnly), [
    { line: 'SERVICE', templateKey: 'SCENT' },
    { line: 'SERVICE', templateKey: 'NPD' },
    { line: 'SERVICE', templateKey: 'RE-ORDER' },
  ]);
});
