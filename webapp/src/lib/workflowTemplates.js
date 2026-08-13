// ⚠️ ต้องตรงกับ CHECK ของ `workflow_templates."templateKey"` เป๊ะ (mig 0121 + 0249)
// และตรงกับ DEAL_TYPES ของ lib/salesPlanning.js — ระบบเลือกแม่แบบด้วยประเภทดีล
// ประเภทดีลที่ไม่มีคีย์ตรงนี้ = สร้างโครงการ/ไทม์ไลน์ไม่ได้
export const WORKFLOW_TEMPLATE_KEYS = Object.freeze(['SCENT', 'NPD', 'RE-ORDER', 'OTHER']);

// ── แม่แบบถูกค้นด้วย **คู่** (line, templateKey) — mig 0193/0194 ─────────
//
// ⭐ มติ 2026-08-02: แกนสายธุรกิจอยู่ที่โครงการ ส่วนชนิดงานอยู่ที่ดีล
// ⇒ แม่แบบไทม์ไลน์ = คู่ `(project.line, deal.type)` = **บริบท × ส่วน**
// วันนี้ `templateKey` เป็น PK ค่าเดียว จึงมี 'NPD' ได้ใบเดียวทั้งระบบ —
// 0194 จะย้าย PK เป็นคู่ ส่วนตัวช่วยข้างล่างใช้ได้ตั้งแต่ตอนนี้
//
// ⚠️ คู่ที่ "มีได้" ไม่เท่ากับคู่ที่ "มีจริง" — ระบบยอมให้ครบทั้ง 8 คู่ แต่บน prod
// วันนี้มีแค่ 4 ใบสายสินค้า · ผู้เรียกต้องทนกรณีหาไม่เจอเสมอ (คืน null ไม่ใช่เดา
// ให้เป็นสายสินค้า — เดาแล้วจะได้ไทม์ไลน์สายผิดโดยไม่มีอะไรเตือน)
export const WORKFLOW_TEMPLATE_LINES = Object.freeze(['PRODUCT', 'SERVICE']);

// คีย์อ่านง่ายสำหรับใช้เป็น index ฝั่ง JS (Map/object) — **ไม่ใช่ค่าที่เก็บลง DB**
// DB เก็บสองคอลัมน์แยกกัน ห้ามเอาสตริงนี้ไปเขียนลง `templateKey`
export const workflowTemplateRef = (line, templateKey) => `${line}:${templateKey}`;

// หาแม่แบบจากคู่ — คืน null เมื่อไม่มี ไม่ตกไปหาสายอื่นให้เอง
export function findWorkflowTemplate(templates = [], line, templateKey) {
  if (!line || !templateKey) return null;
  return templates.find((row) => row?.line === line && row?.templateKey === templateKey) || null;
}

// คู่ที่ยังไม่มีแม่แบบ — หน้าตั้งค่าใช้บอกว่าต้องสร้างอะไรอีกบ้าง
// (แบบเดียวกับตัวนับ "โครงการที่ยังไม่ระบุสาย" ของ 0191: บอกช่องว่าง ไม่เดาแทน)
export function missingWorkflowTemplatePairs(templates = []) {
  const have = new Set((templates || []).map((row) => workflowTemplateRef(row?.line, row?.templateKey)));
  const missing = [];
  for (const line of WORKFLOW_TEMPLATE_LINES) {
    for (const templateKey of WORKFLOW_TEMPLATE_KEYS) {
      if (!have.has(workflowTemplateRef(line, templateKey))) missing.push({ line, templateKey });
    }
  }
  return missing;
}

// มติ 2026-07-20 (mig 0131): token พิเศษใน categoryOnly/categoryExclude —
// 'flag:excise' = "หมวดสินค้าที่ติ๊กเสียภาษีสรรพสามิต" (product_types.isExcise)
// แทนการอ้างรหัสหมวดตรง ๆ. รหัสหมวดปกติ (เช่น '01-002') ยังเทียบแบบ literal ได้
// เพื่อรองรับ version เก่าที่ pin ไว้กับโครงการเดิม.
export const EXCISE_CATEGORY_TOKEN = 'flag:excise';
// ⚠️ ชุดนี้ต้องตรงกับ **สองที่ใน DB** เป๊ะ (mig 0192):
//   · CHECK ของ `workflow_template_steps.role`
//   · validation ใน RPC `save_workflow_template_draft`
// แก้ที่นี่ที่เดียวแล้วลืม DB = ผู้ใช้เลือกได้ในหน้าตั้งค่า แต่กดบันทึกแล้วเด้ง
// `workflow_template_steps_invalid` ซึ่งอ่านไม่ออกว่าเป็นเพราะอะไร
//
// `TS` = ฝ่ายเทคนิคบริการ (mig 0192) — เปิดให้แม่แบบสายบริการมอบขั้น
// "ประเมินพื้นที่หน้างาน" / "ติดตั้งหน้างาน" ให้ช่างได้
export const WORKFLOW_TEMPLATE_ROLES = Object.freeze(['SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'TS', 'ALL']);
export const WORKFLOW_DEPENDENCY_MODES = Object.freeze(['sequential', 'root', 'custom']);

export const WORKFLOW_TEMPLATE_LIMITS = Object.freeze({
  nameTh: 120,
  description: 500,
  changeNote: 500,
  stepKey: 64,
  stepName: 200,
  phase: 120,
  categoryCode: 20,
  maxSteps: 100,
  maxDurationDays: 365,
});

// ⚠️ ต้องมีบรรทัดของทุกคีย์ใน WORKFLOW_TEMPLATE_KEYS — ค่าท้ายสุดเป็น fallback ของ
// 'NPD' เท่านั้น ไม่ใช่ "ค่าเริ่มต้นของอะไรก็ได้" · เพิ่ม 'OTHER' (mig 0249) แล้วลืม
// ตรงนี้ ผลคือการ์ด OTHER ที่หน้าตั้งค่าขึ้นป้าย "งานพัฒนาสินค้า" เงียบ ๆ
export function workflowTemplateKeyLabel(key) {
  if (key === 'SCENT') return 'งานพัฒนากลิ่น';
  if (key === 'RE-ORDER') return 'งานสั่งผลิตซ้ำ';
  if (key === 'OTHER') return 'งานอื่นๆ';
  return 'งานพัฒนาสินค้า';
}

export function workflowTemplateStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'ซ่อนแล้ว';
  return 'ฉบับร่าง';
}

const text = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(values)];

function normalizeDependencies(value) {
  const rows = Array.isArray(value) ? value : [];
  return unique(rows.map((item) => text(item)).filter(Boolean));
}

export function normalizeWorkflowTemplateStep(input = {}, index = 0) {
  const duration = Number(input.durationDays);
  const dependencies = normalizeDependencies(input.dependsOnStepKeys);
  const requestedMode = text(input.dependencyMode).toLowerCase();
  const dependencyMode = WORKFLOW_DEPENDENCY_MODES.includes(requestedMode)
    ? requestedMode
    : (Array.isArray(input.dependsOnStepKeys) ? (dependencies.length ? 'custom' : 'root') : 'sequential');
  return {
    stepKey: text(input.stepKey).toLowerCase(),
    stepOrder: index,
    name: text(input.name),
    role: text(input.role).toUpperCase() || 'SA',
    durationDays: Number.isFinite(duration) ? duration : 1,
    phase: text(input.phase) || null,
    isMilestone: !!input.isMilestone,
    dependencyMode,
    dependsOnStepKeys: dependencyMode === 'custom' ? dependencies : [],
    categoryOnly: text(input.categoryOnly) || null,
    categoryExclude: text(input.categoryExclude) || null,
  };
}

export function workflowTemplateCycle(stepRows = []) {
  const graph = new Map(stepRows.map((step, index) => [
    step.stepKey,
    step.dependencyMode === 'sequential' && index > 0
      ? [stepRows[index - 1].stepKey]
      : step.dependencyMode === 'custom' ? (step.dependsOnStepKeys || []) : [],
  ]));
  const visited = new Set();
  const visiting = new Set();
  const path = [];

  const walk = (key) => {
    if (visiting.has(key)) {
      const start = path.indexOf(key);
      return [...path.slice(start), key];
    }
    if (visited.has(key)) return null;
    visiting.add(key);
    path.push(key);
    for (const dependency of graph.get(key) || []) {
      if (!graph.has(dependency)) continue;
      const cycle = walk(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(key);
    visited.add(key);
    return null;
  };

  for (const key of graph.keys()) {
    const cycle = walk(key);
    if (cycle) return cycle;
  }
  return null;
}

export function validateWorkflowTemplateSteps(stepRows = []) {
  const errors = [];
  if (!stepRows.length) errors.push('Template ต้องมีอย่างน้อย 1 ขั้นตอน');
  if (stepRows.length > WORKFLOW_TEMPLATE_LIMITS.maxSteps) {
    errors.push(`Template มีได้ไม่เกิน ${WORKFLOW_TEMPLATE_LIMITS.maxSteps} ขั้นตอน`);
  }

  const keys = new Set();
  for (const [index, step] of stepRows.entries()) {
    const label = `ขั้นตอนที่ ${index + 1}`;
    if (!step.stepKey) errors.push(`${label}: กรุณาระบุ Step key`);
    if (step.stepKey && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(step.stepKey)) {
      errors.push(`${label}: Step key ใช้ได้เฉพาะ a-z, 0-9, _ และ -`);
    }
    if (keys.has(step.stepKey)) errors.push(`${label}: Step key “${step.stepKey}” ซ้ำ`);
    keys.add(step.stepKey);
    if (!step.name) errors.push(`${label}: กรุณาระบุชื่อขั้นตอน`);
    if (step.name.length > WORKFLOW_TEMPLATE_LIMITS.stepName) errors.push(`${label}: ชื่อขั้นตอนยาวเกินกำหนด`);
    if (!WORKFLOW_TEMPLATE_ROLES.includes(step.role)) errors.push(`${label}: แผนกไม่ถูกต้อง`);
    if (!WORKFLOW_DEPENDENCY_MODES.includes(step.dependencyMode)) errors.push(`${label}: รูปแบบ dependency ไม่ถูกต้อง`);
    if (!Number.isInteger(step.durationDays) || step.durationDays < 0 || step.durationDays > WORKFLOW_TEMPLATE_LIMITS.maxDurationDays) {
      errors.push(`${label}: ระยะเวลาต้องเป็นจำนวนเต็ม 0–${WORKFLOW_TEMPLATE_LIMITS.maxDurationDays} วัน`);
    }
    if ((step.phase || '').length > WORKFLOW_TEMPLATE_LIMITS.phase) errors.push(`${label}: ชื่อ Phase ยาวเกินกำหนด`);
    if ((step.categoryOnly || '').length > WORKFLOW_TEMPLATE_LIMITS.categoryCode) errors.push(`${label}: รหัสหมวดที่ใช้เฉพาะยาวเกินกำหนด`);
    if ((step.categoryExclude || '').length > WORKFLOW_TEMPLATE_LIMITS.categoryCode) errors.push(`${label}: รหัสหมวดที่ยกเว้นยาวเกินกำหนด`);
    if (step.categoryOnly && step.categoryOnly === step.categoryExclude) errors.push(`${label}: หมวดที่ใช้เฉพาะและหมวดที่ยกเว้นห้ามเป็นค่าเดียวกัน`);
    if (step.dependencyMode === 'custom' && !(step.dependsOnStepKeys || []).length) errors.push(`${label}: กรุณาเลือก dependency อย่างน้อย 1 ขั้นตอน`);
    if ((step.dependsOnStepKeys || []).includes(step.stepKey)) errors.push(`${label}: ขั้นตอนห้ามอ้างตัวเองเป็น dependency`);
  }

  for (const [index, step] of stepRows.entries()) {
    for (const dependency of step.dependencyMode === 'custom' ? (step.dependsOnStepKeys || []) : []) {
      if (!keys.has(dependency)) errors.push(`ขั้นตอนที่ ${index + 1}: ไม่พบ dependency “${dependency}”`);
    }
  }

  const categoryVariants = unique([
    '',
    '__other__',
    ...stepRows.flatMap((step) => [step.categoryOnly, step.categoryExclude]).filter(Boolean),
  ]);
  for (const category of categoryVariants) {
    const visibleSteps = stepRows.filter((step) => templateMatchesCategory(step, category));
    const visibleKeys = new Set(visibleSteps.map((step) => step.stepKey));
    for (const step of visibleSteps) {
      if (step.dependencyMode !== 'custom') continue;
      const deps = step.dependsOnStepKeys || [];
      const hiddenDependencies = deps.filter((key) => !visibleKeys.has(key));
      // either-or ตามหมวด: step อาจพึ่ง dependency ที่เป็นคู่ exclusive กัน (เช่น
      // "วางบิลมีสรรพสามิต" categoryOnly=01-002 กับ "วางบิลไม่มีสรรพสามิต"
      // categoryExclude=01-002 → "รับชำระเงิน" พึ่งทั้งคู่) — หมวดหนึ่ง ๆ เหลือ anchor
      // 1 ตัวเสมอ. ยอมให้บาง dependency หายตามหมวดได้ error เฉพาะเมื่อหายหมด (step
      // จะกลายเป็น root ที่ไม่ได้ตั้งใจ). generation เดิม (buildProjectTasks) drop dep
      // ที่หายอยู่แล้ว — validator เข้มกว่านี้จึงบล็อก template ที่ใช้ได้จริง (regression 4B)
      if (deps.length && hiddenDependencies.length === deps.length) {
        const categoryLabel = category === '__other__' || !category ? 'หมวดทั่วไป' : `หมวด ${category}`;
        errors.push(`${step.name || step.stepKey}: dependency ${hiddenDependencies.join(', ')} ไม่อยู่ใน ${categoryLabel}`);
      }
    }
  }

  const cycle = workflowTemplateCycle(stepRows);
  if (cycle) errors.push(`Dependency เป็นวง: ${cycle.join(' → ')}`);
  return unique(errors);
}

export function normalizeWorkflowTemplateDraft(input = {}) {
  const steps = (Array.isArray(input.steps) ? input.steps : []).map(normalizeWorkflowTemplateStep);
  const value = {
    nameTh: text(input.nameTh),
    description: text(input.description) || null,
    changeNote: text(input.changeNote) || null,
    steps,
  };
  const errors = validateWorkflowTemplateSteps(steps);
  if (!value.nameTh) errors.unshift('กรุณาระบุชื่อ Template');
  if (value.nameTh.length > WORKFLOW_TEMPLATE_LIMITS.nameTh) errors.push('ชื่อ Template ยาวเกินกำหนด');
  if ((value.description || '').length > WORKFLOW_TEMPLATE_LIMITS.description) errors.push('คำอธิบายยาวเกินกำหนด');
  if ((value.changeNote || '').length > WORKFLOW_TEMPLATE_LIMITS.changeNote) errors.push('หมายเหตุการเปลี่ยนแปลงยาวเกินกำหนด');
  return { value, errors: unique(errors) };
}

// categoryFlags = ธงของ "หมวดที่กำลังเทียบ" ({ isExcise }) — จำเป็นเมื่อ template ใช้
// token flag:excise; ไม่ส่ง = token ไม่ match (หมวดถือว่าไม่เสียสรรพสามิต).
// การเทียบ literal (rule === category) ต้องมาก่อนเสมอ เพื่อให้ validator ที่ iterate
// รายการ rule เป็น pseudo-category ยังทำงานได้ และ version เก่า ('01-002') ไม่พัง.
export function templateMatchesCategory(step, categoryCode, categoryFlags = null) {
  const category = text(categoryCode);
  const ruleHits = (rule) =>
    rule === category || (rule === EXCISE_CATEGORY_TOKEN && !!categoryFlags?.isExcise);
  if (step.categoryOnly && !ruleHits(step.categoryOnly)) return false;
  if (step.categoryExclude && ruleHits(step.categoryExclude)) return false;
  return true;
}

export function workflowTemplateSummary(version) {
  const steps = version?.steps || [];
  return {
    steps: steps.length,
    phases: new Set(steps.map((step) => step.phase).filter(Boolean)).size,
    milestones: steps.filter((step) => step.isMilestone).length,
    durationDays: steps.reduce((sum, step) => sum + (Number(step.durationDays) || 0), 0),
  };
}
