// ── ขั้น ④ "ตรวจและส่งอนุมัติ" ของฟอร์มคีย์ใบสั่งขายย้อนหลัง (มติเจ้าของ 25/09 — "ตรวจแบบผู้อนุมัติ") ─────────────
//
// ⭐ หลักของขั้นนี้: **ผู้คีย์ตรวจข้อเดียวกับที่ผู้จัดการฝ่ายขายจะตรวจ ด้วยประโยคเดียวกัน** (ตัวสร้างประโยคอยู่ใน
//   historicalOrderCopy — ใช้ร่วมกับหน้าต่างอนุมัติ) · ทุกข้อชี้ขั้นที่แก้ได้ · คำเตือนรวมเป็นกลุ่มในแถวของมัน · ด่านเดียวที่
//   บล็อกคือใบที่อาจซ้ำ · ความคืบหน้า/ผลของการบันทึกอยู่ข้างปุ่ม
// 🐞 ของเดิม (UAT 25/09): การ์ดสามใบพูดซ้ำขั้น ①–③ · "อนุมัติ: AE Sup" (CM/CD ก็อนุมัติได้) · คำเตือนงวดเลยกำหนดขึ้นทีละ
//   บรรทัด 10 ข้อ · กล่องเหลือง "ยังเข้าบริการไม่ได้จนกว่า…" ขึ้นทุกใบ (ไม่จริงกับใบ ฿0) · ปุ่ม "บันทึกอีกครั้ง" ตัวที่สองข้ามด่าน
// ⚠️ ไฟล์นี้บริสุทธิ์ — ไม่มี React ไม่ยิง API ⇒ ทดสอบได้โดยไม่เรนเดอร์
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { externalDocKindLabel } from '@/lib/sales/contracts';
import { HISTORICAL_APPROVER_LABEL, OPENING_INSTALLMENT_LABEL } from '@/lib/sales/historicalOrders';
import {
  historicalContractFactText, historicalCoverageVerdictText, historicalOpeningFactText, historicalRemainingFactText,
  historicalZoneSitesText,
} from '@/lib/sales/historicalOrderCopy';
import {
  HISTORICAL_SAVE_BUTTON_LABEL, HISTORICAL_SAVE_STAGES, HISTORICAL_WIZARD_STEPS, contractSpan, historicalOverdueWarningText,
  issuesForStep,
} from '@/lib/sales/historicalIntakeForm';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const STEP_NO = { contract: '①', zones: '②', money: '③', review: '④' };
const stepLabel = (key) => HISTORICAL_WIZARD_STEPS.find((item) => item.key === key)?.label || '';

/** ผู้คีย์คือใคร (ตัดสินคำของขั้น "ผู้จัดการฝ่ายขายอนุมัติ") — ผู้จัดการที่คีย์เองอนุมัติเองไม่ได้ · admin อนุมัติเองได้แบบ Override */
export function historicalKeyerMode(role) {
  if (text(role) === 'admin') return 'admin';
  return isSalesOrderReviewer(role) ? 'manager' : 'keyer';
}

/**
 * คำเตือนของแผน → กลุ่ม (หนึ่งกลุ่มต่อหัวข้อ) — ขั้น ④ วางในแถวที่มันเกี่ยว · นับจำนวนกลุ่มไม่ใช่จำนวนบรรทัด
 * ⭐ อ่าน `warningItems` (หัวข้อที่แผนกำกับ) · แผนรุ่นที่ไม่มีหัวข้อ = ทุกข้อเป็น "คำเตือนอื่น" — ไม่มีข้อไหนหายเงียบ (บทเรียน #1685)
 * ⚠️ "ไม่มีงวดยกมา" ไม่ใช่คำเตือน — มันคือค่าของแถวงวดยกมาอยู่แล้ว
 * @returns `[{ topic, step, text }]` — topic: contractEnded | liveTerm | overdue | other
 */
export function historicalWarningGroups(plan, { todayIso = null } = {}) {
  const items = Array.isArray(plan?.warningItems)
    ? plan.warningItems
    : list(plan?.warnings).map((message) => ({ topic: 'other', text: message }));
  const groups = [];
  const ended = items.find((item) => item.topic === 'contractEnded');
  if (ended) groups.push({ topic: 'contractEnded', step: 'contract', text: text(ended.text) });
  const live = items.filter((item) => item.topic === 'liveTerm');
  if (live.length) {
    const byOrder = new Map();
    for (const item of live) {
      const key = text(item.orderNumber) || 'ใบอื่น';
      const entry = byOrder.get(key) || { endDate: item.endDate || null, rows: [] };
      if (Number.isInteger(item.index)) entry.rows.push(item.index + 1);
      byOrder.set(key, entry);
    }
    const parts = [...byOrder.entries()].map(([orderNumber, entry]) => `${orderNumber} (ถึง ${entry.endDate ? fmtDate(entry.endDate) : 'ไม่ระบุวันสิ้นสุด'})`
      + `${entry.rows.length ? ` รายการ ${entry.rows.join(', ')}` : ''}`);
    /* นับ **โซน** (บรรทัด) ไม่ใช่คู่ (โซน, ใบอื่น) — โซนเดียวมีรอบของสองใบ = 1 โซน (รีวิวขั้น ④ 25/09) */
    const zoneCount = new Set(live.map((item) => (Number.isInteger(item.index) ? item.index : item))).size;
    groups.push({ topic: 'liveTerm', step: 'zones', text: `${fmtNumber(zoneCount)} โซนมีรอบขายของใบอื่นอยู่แล้ว — ${parts.join(' · ')} · ตรวจว่าไม่ซ้ำสัญญา` });
  }
  const overdue = items.filter((item) => item.topic === 'overdue');
  if (overdue.length) groups.push({ topic: 'overdue', step: 'money', text: historicalOverdueWarningText(overdue.length, todayIso) });
  for (const item of items) {
    if (['contractEnded', 'liveTerm', 'overdue', 'noOpening'].includes(item.topic)) continue;
    groups.push({ topic: 'other', step: null, text: text(item.text) });
  }
  return groups;
}

/**
 * แถวของการ์ด "สิ่งที่ผู้อนุมัติจะตรวจ" — ประโยคเดียวกับหน้าต่างอนุมัติ + ขั้น/ช่องที่แก้ได้
 * @param contractFiles `{ count, names, pending }` — count null = ยังอ่านไม่ได้ (ห้ามอ่านเป็น 0) · names = ชื่อตามลำดับที่แนบ
 *   (ไฟล์แรกที่แนบ = ไฟล์ที่ผู้อนุมัติใช้เป็นหลักฐานลงนาม — กติกาเดียวกับ historicalOrderWorkflow) · pending = ชื่อที่ยังอยู่ในตะกร้า
 * @returns `[{ key, label, value, sub, tone, warn, step, field }]` — tone: 'ok' | 'warn' | null
 */
export function historicalReviewChecklist(plan, { contractFiles = {}, evidenceFileCount = 0, todayIso = null } = {}) {
  if (!plan) return [];
  const rows = [];
  const groups = historicalWarningGroups(plan, { todayIso });
  const warnOf = (topic) => groups.find((group) => group.topic === topic)?.text || null;
  const { contract = {}, header = {} } = plan;
  const kind = text(contract.docKind) ? externalDocKindLabel(contract.docKind) : '';
  const docText = [kind === '—' ? '' : kind, text(contract.ref)].filter(Boolean).join(' ');
  const { monthsText, note: spanNote } = contractSpan(contract.startDate, contract.endDate);
  rows.push({
    key: 'contract', label: 'เอกสารแทนสัญญา',
    value: `${historicalContractFactText(docText, contract.startDate, contract.endDate)}${monthsText ? ` · ${monthsText}` : (spanNote ? ` · ${spanNote}` : '')}`,
    sub: 'อนุมัติพร้อมใบนี้ ได้เลข CT ตอนอนุมัติ', warn: warnOf('contractEnded'), step: 'contract', field: 'contract.docKind',
  });

  const count = contractFiles?.count;
  const names = list(contractFiles?.names).map(text).filter(Boolean);
  const pending = new Set(list(contractFiles?.pending).map(text));
  let fileValue;
  let fileTone = null;
  if (count === null || count === undefined) fileValue = 'ยังอ่านรายการไฟล์ไม่ได้ — เปิดขั้น ① เพื่อโหลดรายการ';
  else if (!count) { fileValue = 'ยังไม่แนบ — ต้องแนบก่อนส่ง'; fileTone = 'warn'; }
  else {
    const first = names[0] || 'ไฟล์แรกที่แนบ';
    fileValue = `${first}${count > 1 ? ` (จาก ${fmtNumber(count)} ไฟล์ที่แนบ)` : ''}${pending.has(first) ? ' · อัปตอนกดบันทึก' : ''}`;
  }
  rows.push({
    key: 'signedFile', label: 'ไฟล์หลักฐานลงนาม', value: fileValue, tone: fileTone,
    sub: count ? 'ไฟล์แรกที่แนบ = ไฟล์ที่ผู้อนุมัติใช้เป็นหลักฐานลงนาม' : null, step: 'contract', field: 'contract.file',
  });

  const refs = [header?.refs?.quote, header?.refs?.express, header?.refs?.invoice].map(text).filter(Boolean);
  rows.push({ key: 'refs', label: 'อ้างอิงเดิม', value: refs.join(' · ') || '—', step: 'contract', field: 'refs' });
  if (text(header?.notes) || plan.zeroValue) {
    rows.push({ key: 'notes', label: 'หมายเหตุของใบ', value: text(header?.notes) || '—', step: 'contract', field: 'notes' });
  }

  rows.push({
    key: 'zones', label: 'โซน', value: historicalZoneSitesText(plan.lines) || '—',
    warn: warnOf('liveTerm'), step: 'zones', field: 'zones',
  });

  if (plan.zeroValue) {
    /* ยอดใบเปลี่ยนที่รายการ (ขั้น ②) — ขั้น ③ ของใบ ฿0 ไม่มีช่องให้แก้ (และไม่มีจุดยึด 'opening' · รีวิวขั้น ④ 25/09) */
    rows.push({ key: 'zero', label: 'ยอดใบ', value: '฿0.00 — ไม่มีงวดให้เก็บ · ด่านเงินของนัดบริการผ่านเอง', step: 'zones', field: 'zones' });
  } else {
    const opening = plan.opening || null;
    rows.push({
      key: 'opening', label: OPENING_INSTALLMENT_LABEL,
      value: opening
        ? historicalOpeningFactText(opening, evidenceFileCount)
        : `ไม่มี (ยังไม่เคยเก็บเงิน) — นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก`,
      sub: opening && text(opening.note) ? text(opening.note) : null, step: 'money', field: 'opening',
    });
    const remaining = list(plan.installments).slice()
      .sort((a, b) => text(a.coversFrom).localeCompare(text(b.coversFrom)) || text(a.dueDate).localeCompare(text(b.dueDate)));
    if (remaining.length) {
      rows.push({
        key: 'remaining', label: 'งวดที่ยังต้องเก็บ', value: historicalRemainingFactText(remaining),
        warn: warnOf('overdue'), step: 'money', field: 'installments',
      });
    }
    const passed = plan.check?.sumMatches === true && plan.check?.coverageContinuous === true;
    rows.push({
      key: 'verdict', label: 'ยอดงวด · ช่วงบริการ',
      value: passed ? historicalCoverageVerdictText(contract.startDate, contract.endDate) : 'ยังไม่ผ่านการตรวจยอด/ช่วงบริการ — กลับไปแก้ที่ขั้น ③',
      tone: passed ? 'ok' : 'warn', step: passed ? null : 'money', field: passed ? null : 'installments',
    });
  }
  for (const group of groups.filter((item) => item.topic === 'other')) {
    rows.push({ key: `other-${rows.length}`, label: 'คำเตือนอื่น', value: group.text, tone: 'warn', step: null, field: null });
  }
  return rows;
}

/**
 * บรรทัดใต้ปุ่มของขั้น ④ — **ตัวเดียว** ที่พูดว่าตอนนี้ส่งได้ไหม / ติดอะไร / กำลังทำอะไร
 * @returns `{ text, tone }` — tone: 'warn' (ติดด่าน/พัง) · 'busy' · null
 */
export function historicalReviewFootNote({
  plan = null, gate = null, localIssues = [], warningGroups = [], saving = null, failed = null,
} = {}) {
  if (saving) return { text: `กำลังบันทึก ขั้น ${fmtNumber(saving.index)}/${fmtNumber(saving.count)} — อย่าปิดหน้านี้`, tone: 'busy' };
  if (failed) {
    /* 🐞 รีวิวขั้น ④ 25/09: "กดเพื่อทำต่อ" เฉพาะผลที่กดซ้ำแล้วผ่านได้ (เน็ตหลุด/5xx · ชนดีลภาชนะ) — รหัสที่ server ตั้งกฎไว้
       (ใบถูกแก้จากที่อื่น · ส่งไปแล้ว · ไม่มีสิทธิ์ …) กดซ้ำได้รหัสเดิมวนไม่รู้จบ ⇒ ชี้กล่องแดงที่มีทางออกของมันเอง */
    const retryable = !failed.exit || failed.exit.canRetry === true;
    return text(failed.orderNumber) && retryable
      ? { text: `ใบร่าง ${text(failed.orderNumber)} บันทึกแล้ว ยังไม่ส่งอนุมัติ — กด “${HISTORICAL_SAVE_BUTTON_LABEL}” เพื่อทำต่อ`, tone: 'warn' }
      : { text: 'ส่งไม่สำเร็จ — ดูกล่องแดงเหนือแถบนี้', tone: 'warn' };
  }
  if (!plan) return { text: `ข้อมูลเปลี่ยนหลังตรวจ — กด “${HISTORICAL_SAVE_BUTTON_LABEL}” ครั้งแรกคือการตรวจ ยังไม่บันทึก`, tone: null };
  const issues = list(localIssues);
  if (issues.length) {
    const first = ['contract', 'zones', 'money'].find((key) => issuesForStep(issues, key).length) || 'contract';
    return {
      text: `ยังส่งไม่ได้ — ขั้น ${STEP_NO[first]} ${stepLabel(first)} มี ${fmtNumber(issuesForStep(issues, first).length)} ข้อต้องแก้ · กดปุ่มแล้วพาไปที่ช่องนั้น`,
      tone: 'warn',
    };
  }
  if (gate?.gated) return { text: 'ยังส่งไม่ได้ — เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ” ในการ์ดใบที่อาจซ้ำด้านบน', tone: 'warn' };
  const warnCount = list(warningGroups).length;
  return warnCount
    ? { text: `พร้อมส่ง · คำเตือน ${fmtNumber(warnCount)} ข้อ (ไม่บล็อก) อยู่ในการ์ด “สิ่งที่ผู้อนุมัติจะตรวจ”`, tone: null }
    : { text: 'พร้อมส่ง — ไม่มีคำเตือน', tone: null };
}

/* ── แผงบันทึก (เหนือแถบท้าย) ──────────────────────────────────────────────────────────── */
const STAGE_LABELS = Object.freeze({
  persist: 'บันทึกใบ', contractFiles: 'อัปไฟล์เอกสารแทนสัญญา', evidence: 'อัปหลักฐานงวดยกมา', submit: 'ส่งอนุมัติ',
});

/**
 * จังหวะที่มีงานจริงของการบันทึกรอบนี้ (`persistEvidence` นับรวมกับหลักฐาน — ผู้คีย์ไม่ต้องรู้ว่ามีการแก้ใบรอบสอง)
 * @param stage จังหวะที่กำลังทำ (`HISTORICAL_SAVE_STAGES`) · null = ยังไม่เริ่ม
 * @param counts `{ contract: [done, total], evidence: [done, total] }`
 * @returns `{ stages: [{ key, label, hint, state }], index, count }` — index = ลำดับของจังหวะปัจจุบัน (เริ่ม 1)
 */
export function historicalSaveStages({ stage = null, counts = {}, orderNumber = null } = {}) {
  const [contractDone = 0, contractTotal = 0] = counts.contract || [];
  const [evidenceDone = 0, evidenceTotal = 0] = counts.evidence || [];
  const current = stage === 'persistEvidence' ? 'evidence' : stage;
  /* ⚠️ รอบที่กดซ้ำแล้วเริ่มที่ `persistEvidence` (หลักฐานขึ้นครบแล้ว ไม่มีไฟล์ค้าง) ต้องยังมีจังหวะหลักฐานให้ชี้ — ไม่งั้นรางไม่มีขั้นปัจจุบัน
     และบรรทัดใต้ปุ่มพูด "ขั้น 1/2" ทั้งที่ขั้น 1 ขึ้นเสร็จแล้ว (รีวิวขั้น ④ 25/09) */
  const keys = ['persist', ...(contractTotal ? ['contractFiles'] : []), ...(evidenceTotal || current === 'evidence' ? ['evidence'] : []), 'submit'];
  const order = HISTORICAL_SAVE_STAGES.filter((key) => key !== 'persistEvidence');
  const at = order.indexOf(current);
  const stages = keys.map((key) => {
    const position = order.indexOf(key);
    const state = current && position < at ? 'done' : (key === current ? 'current' : 'pending');
    const hint = key === 'persist' ? (text(orderNumber) || (state === 'done' ? '' : 'สร้างใบร่าง ได้เลข SO'))
      : key === 'contractFiles' ? `${fmtNumber(contractDone)}/${fmtNumber(contractTotal)} ไฟล์`
        : key === 'evidence' ? `${fmtNumber(evidenceDone)}/${fmtNumber(evidenceTotal)} ไฟล์` : '';
    return { key, label: STAGE_LABELS[key], hint, state };
  });
  const index = Math.max(1, stages.findIndex((item) => item.state === 'current') + 1);
  return { stages, index, count: stages.length };
}

const RELOAD_CODES = new Set(['workflow_stale', 'historical_so_edit_state_invalid', 'historical_so_contract_state_invalid']);

/**
 * ผลของการบันทึกที่ไม่ผ่าน → กล่องในแผงบันทึก · **ทางออกไม่เกินหนึ่งปุ่ม** และไม่มีปุ่มหลักตัวที่สอง
 * (ลองใหม่ = ปุ่ม "บันทึกและส่งอนุมัติ" ตัวเดิม ซึ่งผ่านด่านทุกครั้ง — ของเดิมมี "บันทึกอีกครั้ง" ที่ข้ามด่านใบซ้ำได้)
 * @param exit ผลของ `historicalSaveExit`
 * @param stage จังหวะที่ล้ม · orderNumber = ใบร่างที่ลงฐานแล้ว (ถ้ามี) · failedFile = ไฟล์ที่อัปไม่ขึ้น
 * @returns `{ title, body, action }` — action: null | { key: 'removeFile'|'open'|'reload'|'openOrder'|'goToStep', label, step? }
 */
export function historicalSaveResultView(exit, { stage = null, orderNumber = null, failedFile = null, currentStep = 'review' } = {}) {
  if (!exit) return null;
  const message = text(exit.message);
  const draft = text(orderNumber);
  if (exit.kind === 'invalid' && list(exit.errors).length) {
    const step = exit.goToStep || 'contract';
    return {
      title: `ส่งไม่สำเร็จ — ขั้น ${STEP_NO[step] || ''} ${stepLabel(step)} มี ${fmtNumber(issuesForStep(exit.errors, step).length || exit.errors.length)} ข้อต้องแก้ (กล่องแดงด้านบน)`,
      body: draft ? `ลงฐานแล้ว: ใบร่าง ${draft} (ยังไม่ส่งอนุมัติ)` : 'ยังไม่มีอะไรลงฐาน',
      action: null,
    };
  }
  if (exit.kind === 'container_deal_race') {
    return { title: 'ส่งไม่สำเร็จ — มีคนบันทึกดีลของคู่นี้พร้อมกัน', body: `ยังไม่มีอะไรลงฐาน — กด “${HISTORICAL_SAVE_BUTTON_LABEL}” อีกครั้งได้เลย`, action: null };
  }
  if (exit.kind === 'intake_key_conflict') {
    return { title: 'ส่งไม่สำเร็จ — ใบของรอบนี้เกิดไปแล้ว', body: text(exit.hint), action: exit.existingOrderId ? { key: 'open', label: 'เปิดใบที่สร้างไว้ในฟอร์มแก้ไข', orderId: exit.existingOrderId } : null };
  }
  if (exit.kind === 'forbidden') return { title: 'ส่งไม่สำเร็จ', body: `ไม่มีสิทธิ์บันทึกใบนี้ — ${message}`, action: null };
  if (exit.kind === 'schema') return { title: 'ส่งไม่สำเร็จ', body: `ระบบยังไม่พร้อม — ${message} · ลองส่งอีกครั้งในไม่กี่นาที`, action: null };
  if (RELOAD_CODES.has(text(exit.code))) {
    return { title: 'ส่งไม่สำเร็จ — ใบถูกแก้จากที่อื่นหลังคุณเปิด', body: message, action: { key: 'reload', label: 'โหลดใบล่าสุด' } };
  }
  if (text(exit.code) === 'historical_so_submit_state_invalid') {
    return { title: 'ส่งไม่สำเร็จ — ใบนี้ไม่อยู่ในสถานะที่ส่งได้แล้ว', body: message, action: { key: 'openOrder', label: 'เปิดหน้าใบสั่งขาย' } };
  }
  if (exit.kind === 'unknown' && exit.canRetry) {
    const stageText = STAGE_LABELS[stage === 'persistEvidence' ? 'evidence' : stage] || STAGE_LABELS.persist;
    if (!draft) {
      return { title: `ส่งไม่สำเร็จ — การเชื่อมต่อสะดุดที่ขั้น “${stageText}”`, body: text(exit.hint) || message, action: null };
    }
    return {
      title: `ส่งไม่สำเร็จ — ติดที่ “${stageText}”`,
      body: [failedFile ? `ไฟล์ “${text(failedFile.name)}” อัปไม่ขึ้น` : message, `ลงฐานแล้ว: ใบร่าง ${draft} (ยังไม่ส่งอนุมัติ)`, text(exit.hint)]
        .filter(Boolean).join(' · '),
      action: failedFile ? { key: 'removeFile', label: 'เอาไฟล์นี้ออกจากตะกร้า' } : null,
    };
  }
  const step = exit.goToStep && exit.goToStep !== currentStep ? exit.goToStep : null;
  /* รหัสที่ไม่อยู่ในตารางรหัส → ขั้น (`unmapped`) = ไม่มีทางแก้ที่ฟอร์มรู้ ⇒ ข้อความของ server + รหัสให้แจ้งผู้ดูแล
     (ไม่พูด "แก้ข้อมูลแล้วกดส่งใหม่" — ไม่มีช่องไหนให้แก้ · รีวิวขั้น ④ 25/09: สาขานี้เคยไม่มีทางถึง) */
  const unmapped = text(exit.code) && (exit.kind === 'unknown' || exit.unmapped === true);
  return {
    title: 'ส่งไม่สำเร็จ',
    body: [message, unmapped ? '' : text(exit.hint), unmapped ? `แจ้งผู้ดูแลระบบพร้อมรหัส ${text(exit.code)}` : ''].filter(Boolean).join(' · '),
    action: step ? { key: 'goToStep', label: `ไปแก้ที่ขั้น ${STEP_NO[step]} ${stepLabel(step)}`, step } : null,
  };
}

/** ข้อความ toast หลังส่งสำเร็จ (ผู้คีย์อ่านที่หน้าใบ) */
export function historicalSubmitToast(orderNumber = null) {
  return `บันทึกและส่งอนุมัติแล้ว${text(orderNumber) ? ` — ${text(orderNumber)}` : ''} รอ${HISTORICAL_APPROVER_LABEL}อนุมัติ · ใบย้อนหลังไม่นับ Actual`;
}

/**
 * ช่องสรุปบนหัวขั้น ④ (หัวเอกสารแบบขั้น ① — `DetailOverview`) · ของจากแผน ยกเว้นชื่อผู้คีย์และป้ายลูกค้าที่ฟอร์มถืออยู่
 * @returns `[{ key, label, value, sub, tone? }]`
 */
export function historicalReviewFacts(plan, { customerLabel = null, keyerName = null, orderNumber = null, vatLabel = null } = {}) {
  if (!plan) return [];
  const { header = {}, contract = {} } = plan;
  const { monthsText, note } = contractSpan(contract.startDate, contract.endDate);
  return [
    {
      key: 'customer', label: 'ลูกค้า', value: text(customerLabel) || text(header.customerName) || null,
      sub: [text(header.ownerName) ? `AE ${text(header.ownerName)}` : '', text(header.team) ? `ทีม ${text(header.team)}` : ''].filter(Boolean).join(' · ') || null,
    },
    {
      key: 'span', label: 'ช่วงสัญญา',
      value: contract.startDate && contract.endDate ? `${fmtDate(contract.startDate)} – ${fmtDate(contract.endDate)}` : null,
      sub: monthsText || note || null,
    },
    { key: 'total', label: 'ยอดรวมทั้งสิ้น', value: fmtMoney(header.totalAmount), sub: text(vatLabel) || null },
    {
      key: 'number', label: 'เลขใบ', value: text(orderNumber) || 'ออกตอนกดบันทึก', tone: text(orderNumber) ? null : 'muted',
      sub: text(keyerName) ? `คีย์โดย ${text(keyerName)}` : null,
    },
  ];
}
