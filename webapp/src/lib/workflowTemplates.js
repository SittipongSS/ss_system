export const WORKFLOW_TEMPLATE_KEYS = Object.freeze(['SCENT', 'NPD', 'RE-ORDER']);
export const WORKFLOW_TEMPLATE_ROLES = Object.freeze(['SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'ALL']);
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

export function workflowTemplateKeyLabel(key) {
  if (key === 'SCENT') return 'งานพัฒนากลิ่น';
  if (key === 'RE-ORDER') return 'งานสั่งผลิตซ้ำ';
  return 'งานพัฒนาสินค้า';
}

export function workflowTemplateStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'เก็บถาวร';
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
      const hiddenDependencies = (step.dependsOnStepKeys || []).filter((key) => !visibleKeys.has(key));
      if (hiddenDependencies.length) {
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

export function templateMatchesCategory(step, categoryCode) {
  const category = text(categoryCode);
  if (step.categoryOnly && step.categoryOnly !== category) return false;
  if (step.categoryExclude && step.categoryExclude === category) return false;
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
