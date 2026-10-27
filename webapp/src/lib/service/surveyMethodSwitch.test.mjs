// ── แผนสลับวิธีประเมิน (งวด S2a §2.2) ───────────────────────────────────────────────
//
// ⭐ **ฟังก์ชันเดียว = ข้อความในโมดัล = ข้อความในกล่องยืนยัน = สิ่งที่ server เขียน**
//   ทุกเคสในตารางจึงเทียบ `lines` · `thread` · `bells` · `writes` · `needs` · `confirmLabel` พร้อมกัน —
//   เทียบทีละอย่างคนละเทสต์ = วันหนึ่งกล่องบอกว่ายกเลิกนัด แต่ `writes` ไม่ได้ยกเลิก โดยไม่มีเทสต์ไหนแดง
//
// fixture: เคส B ของม็อก (สามพื้นที่ลงหน้างาน · นัด SV-26100011 วันที่ 13/10/2026 · ช่าง Phuwadol Aoonnankad)
//          เคส A (สามพื้นที่จากแบบทั้งใบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_CONFIRM_LABEL, SURVEY_CONFIRM_MISSING, SURVEY_METHOD_BUTTON, SURVEY_METHOD_CANCEL_ONLY_REASON,
  SURVEY_METHOD_CHIP, SURVEY_METHOD_ERRORS, SURVEY_METHOD_LABEL, SURVEY_METHOD_MODAL_TITLE,
  SURVEY_METHOD_REASON_CHIPS, SURVEY_METHOD_REASON_LABEL, SURVEY_METHOD_REASON_MAX, SURVEY_METHOD_REASON_MIN,
  SURVEY_METHOD_RESULT_DATE_LABEL, SURVEY_METHOD_SHORTCUTS, SURVEY_ZONE_TAG,
  surveyMethodActionId, surveyMethodChanges, surveyMethodPlanKey, surveyMethodRequestError,
  SURVEY_DESK_RAIL_LABELS, surveyDeskRailSteps, surveyZoneAddedLabel,
  surveyMethodSwitchGate, surveyMethodSwitchPlan, surveyProgressText, surveyZoneNamesText,
} from './surveyMethodSwitch.js';
import { visitReachedSite } from './surveyQueue.js';
import { surveyDeskCommitPatch } from './surveyVisit.js';

const NOW = '2026-10-09T04:00:00.000Z';
const REASON = 'หน้างานยังก่อสร้าง ถึงสิ้นเดือน';
const CUT_REASON = 'ลูกค้ายกเลิกโซนนี้';
const DATE = '2026-10-12';
const actor = { id: 'U-HEAD', name: 'หัวหน้า ก' };
const request = {
  id: 'RQ1', docNo: 'RQ-AS-26100312', committedResultDate: '2026-10-15', committedDueDate: '2026-10-13', answeredAt: null,
};

const zone = (id, zoneName, over = {}) => ({
  id, zoneName, status: 'ok', method: 'onsite', updatedAt: `2026-10-08T0${id.slice(-1)}:00:00+00:00`, ...over,
});
/* เคส B — ลงหน้างานทั้งใบ */
const caseB = (over = {}) => [
  zone('Z1', 'ล็อบบี้', over.Z1),
  zone('Z2', 'ห้องประชุม', over.Z2),
  zone('Z3', 'ห้องน้ำ', over.Z3),
];
/* เคส A — จากแบบทั้งใบ (คนอื่นสลับไว้ก่อน ด้วยเหตุผลอื่น) */
const stamp = { method: 'drawing', methodReason: 'ลูกค้ายังไม่ให้เข้า', methodChangedByName: 'หัวหน้า ข', methodChangedAt: '2026-10-07T02:00:00+00:00' };
const caseA = (over = {}) => [
  zone('Z1', 'ล็อบบี้', { ...stamp, spots: [{ id: 's1', selected: true }, { id: 's2', selected: false }], ...over.Z1 }),
  zone('Z2', 'ห้องประชุม', { ...stamp, ...over.Z2 }),
  zone('Z3', 'ห้องน้ำ', { ...stamp, ...over.Z3 }),
];
const visit = (status, over = {}) => ({
  id: 'V1', code: 'SV-26100011', status, scheduledDate: '2026-10-13', startTime: '10:00:00',
  assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['U-AST'], ...over,
});
const VISIT_STATES = [null, 'draft', 'scheduled', 'in_progress', 'done', 'unable', 'cancelled'];
const visitOf = (status) => (status ? visit(status) : null);
const toDrawing = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'drawing' }));
const toOnsite = (...ids) => ids.map((zoneId) => ({ zoneId, method: 'onsite' }));

const plan = (over = {}) => surveyMethodSwitchPlan({
  rows: caseB(), request, actor, reason: REASON, resultDate: DATE, hasDrawings: true, nowIso: NOW, ...over,
});
const NO_WRITES = { cancelVisitId: null, drawingIds: [], onsiteIds: [], unselectSpotRows: [], cutMarkIds: [], dates: null };
const writes = (over = {}) => ({ ...NO_WRITES, ...over });

/* ข้อความที่สเปคกำหนด — พิมพ์ซ้ำในเทสต์โดยตั้งใจ: แก้คำในซอร์สแล้วเทสต์ต้องแดง
   (S2b แก้หลังตรวจจอ head-r3-21) วันบนจอเป็นรูป "อ. 13 ต.ค." ทุกบรรทัดของกล่อง — เธรดยังเป็น 12/10/2026 (ข้อความเก็บถาวร)
   (S2b แก้หลังตรวจจอ head-r3-10) "พื้นที่นี้" / "พื้นที่เหล่านี้" ตามจำนวนที่สลับ · ท่อน "ใบออกจากคิวของผู้วางคิว" เฉพาะตอนใบอยู่ในคิวจริง */
const L1 = (n) => `${n} พื้นที่จะประเมินจากแบบ — ไม่ต้องมีภาพกว้าง จุดติดตั้ง และรูปจุด · ข้อมูลที่กรอกไว้ยังอยู่ครบ`;
const L2 = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว · หัวหน้ารับปากส่งผล จ. 12 ต.ค.';
const L2_NO_DATE = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว';
// ใบไม่ได้อยู่ในคิวรอลงคิว (ช่างกำลังทำนัด · นัดเข้าพื้นที่จบแล้ว) ⇒ ไม่มีท่อน "ใบออกจากคิว…"
const L2_OFF_QUEUE = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — หัวหน้ารับปากส่งผล จ. 12 ต.ค.';
const L2_OFF_QUEUE_NO_DATE = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน';
const L3 = 'นัด SV-26100011 วันที่ อ. 13 ต.ค. ของ Phuwadol Aoonnankad จะถูกยกเลิก — งานหายจากงานของช่าง และช่างได้รับแจ้ง';
const L4 = (these = 'พื้นที่นี้') => `ช่างกดเริ่มงานของนัด SV-26100011 แล้ว — นัดไม่ถูกยกเลิก · ช่างได้รับแจ้งว่าไม่ต้องวัด${these} แล้วกด “ส่งงาน” ได้เลย`;
// การตัดพื้นที่ไม่มีกระดิ่งช่าง (ไม่มีแถวไหนสลับเป็นจากแบบ) ⇒ บรรทัดเดียวกันโดยไม่มีท่อน "ช่างได้รับแจ้ง…"
const L4_CUT = 'ช่างกดเริ่มงานของนัด SV-26100011 แล้ว — นัดไม่ถูกยกเลิก';
const L5 = (label, these = 'พื้นที่นี้') => `นัด SV-26100011 (${label}) คงอยู่เป็นประวัติ — ผลของ${these}จะระบุว่าประเมินจากแบบ`;
const L6 = (these = 'พื้นที่นี้') => `นัด SV-26100011 วันที่ อ. 13 ต.ค. ของ Phuwadol Aoonnankad ยังอยู่ — ยังมีพื้นที่ที่ต้องวัด · ช่างได้รับแจ้งว่าไม่ต้องวัด${these}`;
// (S2b แก้หลังตรวจจอ head-r3-54) นัดยังอยู่ + มีพื้นที่กลับเป็นลงหน้างาน — ช่างได้กระดิ่งว่าต้องวัดเพิ่ม และกล่องบอกเรื่องเดียวกัน
const L6_BACK = (names) => `นัด SV-26100011 วันที่ อ. 13 ต.ค. ของ Phuwadol Aoonnankad ยังอยู่ — ช่างได้รับแจ้งว่าต้องวัด “${names}” เพิ่ม`;
const L8 = (n) => `${n} พื้นที่กลับเป็นลงหน้างาน — ต้องวัดขนาดจริงแล้วบันทึกอีกครั้ง มีภาพกว้าง จุดติดตั้ง และรูปจุดตามปกติ · จุดที่มาร์กจากแบบยังอยู่ แต่ต้องเลือกจุดใหม่หลังเข้าพื้นที่`;
const L9 = 'ใบกลับไปขั้น “รอลงคิว” — วันส่งผลที่รับปากไว้ (พฤ. 15 ต.ค.) ถูกล้าง · ผู้วางคิวลงวันเข้าพื้นที่และวันส่งผลใหม่';
const L_STAYS = 'ใบอยู่ขั้นเดิม — ใช้ผลจากรอบที่เข้าพื้นที่แล้วได้ · วันส่งผลที่รับปากไว้คงเดิม';
// กรณี `keep`: บรรทัด "กลับเป็นลงหน้างาน" ไม่พูดถึงการเข้าพื้นที่รอบใหม่ (ไม่มีใครนัด)
const L8_KEEP = (n) => `${n} พื้นที่กลับเป็นลงหน้างาน — ตรวจขนาดกับผลจากรอบที่เข้าพื้นที่แล้วบันทึกอีกครั้ง มีภาพกว้าง จุดติดตั้ง และรูปจุดตามปกติ · จุดที่มาร์กจากแบบยังอยู่ แต่ต้องเลือกจุดใหม่`;
// กรณี `keep` ที่นัดที่ไปถึงไซต์เป็นนัดก่อนหน้า — หน้าคำร้องอ่านนัดล่าสุด ⇒ ไม่พูดว่า "ใบอยู่ขั้นเดิม"
const L_STAYS_REQUEUE = (label) => `วันส่งผลที่รับปากไว้คงเดิม — ใช้ผลจากรอบที่เข้าพื้นที่แล้วได้ · นัดล่าสุด SV-26100011 (${label}) ไม่ได้เข้าพื้นที่ ใบจึงขึ้น “ต้องลงคิวใหม่” ให้ผู้วางคิวลงนัดใหม่ได้`;
// คอลัมน์วันเข้าพื้นที่ตามนัดของ fixture — ไม่มี `committedResultDate`
const VISIT_SYNC = { committedDueDate: '2026-10-13', committedDueTime: '10:00', assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad' };
const L_CANCEL_ONLY = 'นัด SV-26100011 วันที่ อ. 13 ต.ค. ของ Phuwadol Aoonnankad จะถูกยกเลิก — ใบนี้ไม่มีพื้นที่ที่ต้องลงหน้างานแล้ว';
const BELL_CANCEL = { kind: 'cancel', title: 'ยกเลิกนัด SV-26100011 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ' };
const BELL_ZONES = (names, these = 'พื้นที่นี้') => ({ kind: 'zones', title: `หัวหน้าเปลี่ยน “${names}” เป็นประเมินจากแบบ — ไม่ต้องวัด${these}` });
const BELL_BACK = (names, these = 'พื้นที่นี้') => ({ kind: 'zones', title: `หัวหน้าเปลี่ยน “${names}” กลับเป็นลงหน้างาน — ต้องวัด${these}เพิ่ม` });
const BELL_HEAD = { title: 'คำร้องประเมินจากแบบ RQ-AS-26100312 — รอหัวหน้าประเมิน' };
const T_DRAWING = (n, names) => `เปลี่ยนวิธีประเมินเป็น “ประเมินจากแบบ” ${n} พื้นที่ (${names}) — ${REASON}`;
const T_ONSITE = (n, names) => `เปลี่ยนวิธีประเมินเป็น “ลงหน้างาน” ${n} พื้นที่ (${names}) — ${REASON}`;
const T_CUT = 'ตัดพื้นที่ ล็อบบี้ ออก — ไม่เหลือพื้นที่ที่ต้องลงหน้างาน';
const ALL = 'ล็อบบี้ · ห้องประชุม · ห้องน้ำ';
const DESK_PATCH = surveyDeskCommitPatch({ date: DATE, user: actor, nowIso: NOW });

/* เทียบทั้งชุดในครั้งเดียว — คีย์ที่ไม่ได้ระบุใช้ค่า "ไม่มีอะไรเกิด" */
function expectPlan(got, want, name) {
  assert.equal(got.stale, want.stale ?? false, `${name}: stale`);
  assert.equal(got.kind, want.kind, `${name}: kind`);
  assert.equal(got.flip, want.flip ?? null, `${name}: flip`);
  assert.equal(got.visit.action, want.visitAction ?? 'none', `${name}: visit.action`);
  assert.equal(got.dates.action, want.datesAction ?? 'none', `${name}: dates.action`);
  assert.deepEqual(got.lines, want.lines, `${name}: lines`);
  assert.equal(got.thread, want.thread, `${name}: thread`);
  assert.deepEqual(got.bells, { crew: null, head: null, ...want.bells }, `${name}: bells`);
  assert.deepEqual(got.writes, writes(want.writes), `${name}: writes`);
  assert.deepEqual(got.needs, want.needs ?? { reason: true, resultDate: false }, `${name}: needs`);
  assert.equal(got.confirmLabel, want.confirmLabel ?? 'บันทึกวิธีประเมิน', `${name}: confirmLabel`);
  assert.deepEqual(got.errors, want.errors ?? [], `${name}: errors`);
}

/* ── ค่าคงที่ — ทุกกลุ่มดึงจากที่นี่ ห้ามพิมพ์ซ้ำ ─────────────────────────────── */
test('ค่าคงที่ของฟีเจอร์ตรงสเปคทุกตัวอักษร', () => {
  assert.deepEqual(SURVEY_METHOD_LABEL, { onsite: 'ลงหน้างาน', drawing: 'ประเมินจากแบบ' });
  assert.deepEqual(SURVEY_METHOD_CHIP, { onsite: 'ลงหน้างาน', drawing: 'จากแบบ' });
  assert.deepEqual(SURVEY_CONFIRM_LABEL, { needed: 'ต้องยืนยันหน้างาน', not_needed: 'ไม่ต้องยืนยันหน้างาน' });
  assert.equal(SURVEY_CONFIRM_MISSING, 'ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม');
  // งวด S5 (R6): + `confirming` — ไม่มีเลขใบในป้าย (เลขของใบยืนยันพิมพ์ข้างชิปแล้ว)
  assert.deepEqual(SURVEY_ZONE_TAG, {
    awaiting: 'ประเมินจากแบบ · รอยืนยันหน้างาน', drawing: 'ประเมินจากแบบ', confirming: 'ประเมินจากแบบ · กำลังยืนยันหน้างาน',
  });
  assert.equal(SURVEY_METHOD_BUTTON, 'เปลี่ยนวิธีประเมิน');
  assert.equal(SURVEY_METHOD_MODAL_TITLE, 'วิธีประเมินรายพื้นที่');
  assert.equal(SURVEY_METHOD_REASON_LABEL, 'เหตุผล (ฝ่ายขายจะเห็น)');
  assert.equal(SURVEY_METHOD_REASON_MIN, 10);
  assert.equal(SURVEY_METHOD_REASON_MAX, 300);
  assert.deepEqual(SURVEY_METHOD_REASON_CHIPS, [
    'หน้างานยังก่อสร้าง', 'เข้าพื้นที่แล้วแต่ยังก่อสร้าง', 'ลูกค้ายังไม่ให้เข้า', 'ฝ่ายขายขอประเมินจากแบบ', 'แบบไม่พอ ต้องดูของจริง',
  ]);
  assert.deepEqual(SURVEY_METHOD_SHORTCUTS, { onsite: 'ทั้งใบ: ลงหน้างาน', drawing: 'ทั้งใบ: ประเมินจากแบบ' });
  assert.equal(SURVEY_METHOD_RESULT_DATE_LABEL, 'วันที่จะส่งผลประเมิน');
  assert.equal(SURVEY_METHOD_CANCEL_ONLY_REASON, 'ใบนี้ประเมินจากแบบทั้งใบ ไม่มีการเข้าพื้นที่');
  assert.deepEqual(SURVEY_METHOD_ERRORS, {
    off: 'ยังไม่เปิดใช้การประเมินจากแบบ',
    role: 'เปลี่ยนวิธีประเมินได้เฉพาะหัวหน้าฝ่ายบริการ',
    notAcknowledged: 'ไปกด “รับเรื่อง” ที่หน้าคำร้องก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
    sentButton: 'ส่งผลไปแล้ว — ดึงผลกลับมาแก้ก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
    sentRoute: 'ส่งผลไปแล้ว — เปลี่ยนวิธีประเมินไม่ได้ โหลดหน้าใหม่',
    reason: 'ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร',
    resultDate: 'ต้องระบุวันที่จะส่งผลประเมิน',
    stale: 'ใบนี้ถูกแก้โดยคนอื่นระหว่างที่เปิดกล่องนี้ — โหลดหน้าใหม่',
    partial: 'บันทึกไม่ครบ — กด “บันทึกวิธีประเมิน” อีกครั้ง',
    nothing: 'ยังไม่ได้เปลี่ยนวิธีประเมินของพื้นที่ไหน',
  });
  // ชิปเหตุผลทุกตัวต้องผ่านด่านความยาวของตัวเอง — ชิปที่กดแล้วถูกตีกลับคือปุ่มตาย
  for (const chip of SURVEY_METHOD_REASON_CHIPS) assert.ok(chip.length >= SURVEY_METHOD_REASON_MIN, chip);
});

/* ── 1) ใบผสมยังผสม ─────────────────────────────────────────────────────── */
test('① พื้นที่เดียวเป็นจากแบบ ใบยังต้องมีนัด × สถานะนัดเจ็ดแบบ: ไม่พลิก ไม่แตะวัน ไม่ยกเลิกนัด', () => {
  for (const status of VISIT_STATES) {
    const stays = status === 'scheduled' || status === 'in_progress';
    const got = plan({ changes: toDrawing('Z3'), visit: visitOf(status) });
    expectPlan(got, {
      kind: 'switch',
      visitAction: stays ? 'stays' : 'none',
      lines: stays ? [L1(1), L6()] : [L1(1)],
      thread: T_DRAWING(1, 'ห้องน้ำ'),
      bells: stays ? { crew: BELL_ZONES('ห้องน้ำ') } : {},
      writes: { drawingIds: ['Z3'] },
    }, `นัด ${status}`);
    assert.deepEqual(got.toDrawing, [{ id: 'Z3', name: 'ห้องน้ำ' }]);
    assert.deepEqual(got.before, { needsVisit: true, mix: { onsite: 3, drawing: 0, mode: 'onsite' } });
    assert.deepEqual(got.after, { needsVisit: true, mix: { onsite: 2, drawing: 1, mode: 'mixed' } });
    assert.equal(got.visitCancelReason, null);
    assert.equal(got.disabledReason, null);
  }
});

/* ── 2) ทั้งใบเป็นจากแบบ ─────────────────────────────────────────────────── */
test('② ทั้งใบเป็นจากแบบ × สถานะนัดเจ็ดแบบ: ออกจากคิว · ยกเลิกนัดเฉพาะร่าง/นัดไว้ · เริ่มงานแล้วนัดอยู่ · ปิดแล้วเป็นประวัติ', () => {
  /* สามพื้นที่ ⇒ "พื้นที่เหล่านี้" (head-r3-10) · ท่อน "ใบออกจากคิวของผู้วางคิว" เฉพาะใบที่อยู่ในคิวจริง:
     ไม่มีนัด · นัดที่การกดนี้ยกเลิก · นัดเป็นประวัติที่ไม่เคยถึงไซต์ (ทำไม่ได้ / ยกเลิก — ใบรอลงคิวใหม่) — ช่างกำลังทำ / เข้าแล้ว = ไม่มีท่อนนี้ */
  const MANY = 'พื้นที่เหล่านี้';
  const table = {
    null: { visitAction: 'none', l2: L2, extra: [], tail: '', bells: {} },
    draft: { visitAction: 'cancel', l2: L2, extra: [L3], tail: ' · ยกเลิกนัด SV-26100011', bells: { crew: BELL_CANCEL }, cancel: 'V1' },
    scheduled: { visitAction: 'cancel', l2: L2, extra: [L3], tail: ' · ยกเลิกนัด SV-26100011', bells: { crew: BELL_CANCEL }, cancel: 'V1' },
    in_progress: { visitAction: 'keep-open', l2: L2_OFF_QUEUE, extra: [L4(MANY)], tail: '', bells: { crew: BELL_ZONES(ALL, MANY) } },
    done: { visitAction: 'history', l2: L2_OFF_QUEUE, extra: [L5('เข้าแล้ว', MANY)], tail: '', bells: {} },
    unable: { visitAction: 'history', l2: L2, extra: [L5('ทำไม่ได้', MANY)], tail: '', bells: {} },
    cancelled: { visitAction: 'history', l2: L2, extra: [L5('ยกเลิก', MANY)], tail: '', bells: {} },
  };
  for (const status of VISIT_STATES) {
    const row = table[String(status)];
    const got = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visitOf(status) });
    expectPlan(got, {
      kind: 'switch',
      flip: 'to-desk',
      visitAction: row.visitAction,
      datesAction: 'set',
      lines: [L1(3), row.l2, ...row.extra],
      thread: `${T_DRAWING(3, ALL)}${row.tail} · ส่งผล 12/10/2026`,
      bells: { ...row.bells, head: BELL_HEAD },
      writes: { cancelVisitId: row.cancel || null, drawingIds: ['Z1', 'Z2', 'Z3'], dates: DESK_PATCH },
      needs: { reason: true, resultDate: true },
    }, `นัด ${status}`);
    assert.equal(got.visitCancelReason, row.cancel ? `เปลี่ยนเป็นประเมินจากแบบ: ${REASON}` : null, `นัด ${status}`);
    assert.deepEqual(got.defaults, { reason: '', resultDate: '2026-10-15' });
  }
});

/* ── 3) แถวที่ตัดไปแล้วต้องตามไปเป็นจากแบบ ──────────────────────────────── */
test('③ พื้นที่ลงหน้างานสุดท้ายเป็นจากแบบ ขณะมีแถวลงหน้างานที่ตัดไปแล้ว → cutMarkIds ถือแถวนั้น', () => {
  const rows = [
    zone('Z0', 'ห้องเก็บของ', { status: 'cut' }),
    zone('Z9', 'ทางเดิน', { status: 'cut', method: 'drawing' }),
    zone('Z1', 'ล็อบบี้'),
    zone('Z2', 'ห้องประชุม', stamp),
  ];
  const got = plan({ rows, changes: toDrawing('Z1'), visit: null });
  assert.equal(got.flip, 'to-desk');
  assert.deepEqual(got.writes.cutMarkIds, ['Z0'], 'แถวตัดที่เป็นจากแบบอยู่แล้วไม่ต้องเขียนซ้ำ');
  assert.deepEqual(got.writes.drawingIds, ['Z1']);
  // ใบยังผสม = แถวที่ตัดไม่ถูกแตะ
  const mixed = plan({ rows: [...rows, zone('Z3', 'ห้องน้ำ')], changes: toDrawing('Z1'), visit: null });
  assert.equal(mixed.flip, null);
  assert.deepEqual(mixed.writes.cutMarkIds, []);
});

/* ── 4) กลับเป็นลงหน้างาน ───────────────────────────────────────────────── */
test('④ ใบจากแบบทั้งใบ พื้นที่แรกกลับเป็นลงหน้างาน: ไม่เคยถึงไซต์ = ล้างวัน · มีนัดค้าง = เอาวันของนัดกลับขึ้นใบ · เคยเข้าพื้นที่แล้ว = ใบอยู่ขั้นเดิม (O3)', () => {
  const unselect = [{ id: 'Z1', updatedAt: '2026-10-08T01:00:00+00:00', spots: [{ id: 's1', selected: false }, { id: 's2', selected: false }] }];
  const base = { rows: caseA(), changes: toOnsite('Z1') };

  // (ก) ไม่มีนัด → ล้างสามคอลัมน์ + บรรทัด 9 + ท้ายเธรด
  expectPlan(plan({ ...base, visit: null }), {
    kind: 'switch',
    flip: 'to-visit',
    datesAction: 'clear',
    lines: [L8(1), L9],
    thread: `${T_ONSITE(1, 'ล็อบบี้')} · ใบกลับไปรอลงคิว · ฝ่ายขายแจ้งวันที่หน้างานเข้าได้ในเธรดนี้`,
    writes: {
      onsiteIds: ['Z1'], unselectSpotRows: unselect,
      dates: { committedDueDate: null, committedDueTime: null, committedResultDate: null },
    },
  }, 'ไม่มีนัด');

  /* ⭐ มติเจ้าของ 12/10 (O3) — ตารางเต็ม: สถานะของนัดล่าสุด × วันบนใบ
     ไม่เคยมีนัดถึงไซต์ (ไม่มีนัด · ยกเลิก · เข้าไม่ได้) = ล้างวัน กลับไปรอลงคิว (พฤติกรรมเดิม)
     นัดค้าง = เอาวันของนัดกลับขึ้นใบ (เดิม) · นัดไปถึงไซต์แล้ว (เข้าแล้ว / ทำไม่ครบ) = **ใบอยู่ขั้นเดิม ไม่แตะวัน** */
  const TABLE = [
    [null, 'clear'], ['cancelled', 'clear'], ['unable', 'clear'],
    ['draft', 'sync'], ['scheduled', 'sync'], ['in_progress', 'sync'],
    ['done', 'keep'], ['partial', 'keep'],
  ];
  for (const [status, want] of TABLE) {
    const got = plan({ ...base, visit: visitOf(status) });
    assert.equal(got.dates.action, want, String(status));
    assert.equal(got.flip, 'to-visit', String(status));
    // (S2b · มติเจ้าของ 26/10 head-r3-54 ข้างเคียง) นัดที่ช่างถืออยู่ (นัดไว้ / กำลังทำ) = `stays` เหมือนใบที่ไม่พลิก — ที่เหลือไม่มีนัดให้แจ้ง
    assert.equal(got.visit.action, status === 'scheduled' || status === 'in_progress' ? 'stays' : 'none', String(status));
    // "รอลงคิว" พูดเฉพาะตอนล้างวันจริง — กล่อง เธรด และสิ่งที่เขียน ไปด้วยกันเสมอ
    const queued = got.lines.some((line) => line.includes('รอลงคิว')) || got.thread.includes('รอลงคิว');
    assert.equal(queued, want === 'clear', `${status}: รอลงคิว`);
    assert.equal(got.lines.includes(L_STAYS), want === 'keep', `${status}: บรรทัดอยู่ขั้นเดิม`);
    // กติกา "ไปถึงไซต์แล้ว" ต้องเท่ากับตัวจริงของหน้าคำร้อง / หน้าจัดคิว (`visitReachedSite`) ทุกสถานะ
    assert.equal(want === 'keep', visitReachedSite(visitOf(status)), `${status}: visitReachedSite`);
  }
  for (const status of ['cancelled', 'unable']) {
    const never = plan({ ...base, visit: visit(status) });
    assert.deepEqual(never.lines, [L8(1), L9], status);
    assert.deepEqual(never.writes.dates, { committedDueDate: null, committedDueTime: null, committedResultDate: null }, status);
  }
  for (const status of ['done', 'partial']) {
    expectPlan(plan({ ...base, visit: visit(status) }), {
      kind: 'switch',
      flip: 'to-visit',
      datesAction: 'keep',
      lines: [L8_KEEP(1), L_STAYS],
      thread: T_ONSITE(1, 'ล็อบบี้'),
      /* 🔴 วันส่งผลที่รับปากไว้ไม่อยู่ใน patch (คงเดิม) · คอลัมน์วันเข้าพื้นที่กลับไปตามนัด — ไม่งั้น `committedDueDate` ค้างเป็น
         วันส่งผลของตอนเป็นงานโต๊ะ แล้วหัวหน้าคำร้องอ่านมันเป็น "วันนัดเข้าพื้นที่" (รีวิว 12/10) */
      writes: { onsiteIds: ['Z1'], unselectSpotRows: unselect, dates: VISIT_SYNC },
    }, `นัด ${status}`);
    assert.equal('committedResultDate' in plan({ ...base, visit: visit(status) }).writes.dates, false, `${status}: ไม่แตะวันส่งผล`);
  }
  // นัดที่ถูกยกเลิกโดยการกดนี้ (route พิสูจน์แล้ว) ไม่ใช่นัดที่ไปถึงไซต์
  assert.equal(plan({ ...base, visit: visit('cancelled', { cancelledByThisAction: true }) }).dates.action, 'clear');

  /* 🔴 **"เคยมีสักนัดที่ไปถึงไซต์"** (`siteReached`) ไม่ใช่ "นัดล่าสุดถึงไหม" (รีวิว 12/10) — นัดเข้าแล้ว / ทำไม่ครบ ตามด้วยนัดซ้ำที่ถูก
     ยกเลิก (รวมนัดที่การสลับเป็นจากแบบยกเลิกเอง) หรือเข้าไม่ได้: ด่านส่งผลให้ส่งจากรอบแรกได้ ⇒ แผนต้องไม่ล้างวันส่งผล ไม่บอกว่ารอลงคิว
     · หน้าคำร้องอ่านนัดล่าสุด (ขึ้น "ต้องลงคิวใหม่") ⇒ กล่องไม่พูดว่า "ใบอยู่ขั้นเดิม" · คอลัมน์วันเข้าพื้นที่ตามนัดล่าสุด (สภาพของ main) */
  const LATER = [
    ['done → cancelled', visit('cancelled'), 'ยกเลิก'],
    ['partial → ยกเลิกโดยการสลับเป็นจากแบบ', visit('cancelled', { cancelledByThisAction: true }), 'ยกเลิก'],
    ['done → unable', visit('unable'), 'ทำไม่ได้'],
  ];
  for (const [name, latest, label] of LATER) {
    const got = plan({ ...base, visit: latest, siteReached: true });
    expectPlan(got, {
      kind: 'switch',
      flip: 'to-visit',
      datesAction: 'keep',
      lines: [L8_KEEP(1), L_STAYS_REQUEUE(label)],
      thread: T_ONSITE(1, 'ล็อบบี้'),
      writes: { onsiteIds: ['Z1'], unselectSpotRows: unselect, dates: VISIT_SYNC },
    }, name);
    assert.equal(got.lines.some((line) => line.includes('รอลงคิว') || line.includes('ใบอยู่ขั้นเดิม')), false, name);
    // ไม่บอก / บอกว่าไม่เคย = กติกาเดิมของนัดล่าสุด
    for (const siteReached of [undefined, null, false]) {
      assert.equal(plan({ ...base, visit: latest, siteReached }).dates.action, 'clear', `${name}: siteReached=${siteReached}`);
    }
  }
  // `siteReached` ไม่เปลี่ยนกิ่งอื่น: นัดค้าง = sync · นัดล่าสุดถึงไซต์เอง = บรรทัด "ใบอยู่ขั้นเดิม" · ทิศเป็นจากแบบ = set
  assert.equal(plan({ ...base, visit: visit('scheduled'), siteReached: true }).dates.action, 'sync');
  assert.deepEqual(plan({ ...base, visit: visit('done'), siteReached: true }).lines, [L8_KEEP(1), L_STAYS]);
  assert.equal(plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('done'), siteReached: true }).dates.action, 'set');
  // ไม่มีแถวนัดให้อ่าน (ไม่ควรเกิดเมื่อ siteReached จริง) = ไม่เขียนคอลัมน์วัน ไม่ล้าง
  const noRow = plan({ ...base, visit: null, siteReached: true });
  assert.equal(noRow.dates.action, 'keep');
  assert.equal(noRow.writes.dates, null);
  assert.deepEqual(noRow.lines, [L8_KEEP(1), L_STAYS]);
  // หลายพื้นที่กลับพร้อมกัน / กลับทั้งใบ บนใบที่เคยเข้าพื้นที่แล้ว = กติกาเดียวกัน
  const allBack = plan({ rows: caseA(), changes: toOnsite('Z1', 'Z2', 'Z3'), visit: visit('done') });
  assert.equal(allBack.dates.action, 'keep');
  assert.deepEqual(allBack.lines, [L8_KEEP(3), L_STAYS]);
  assert.equal(allBack.thread, T_ONSITE(3, ALL));
  assert.deepEqual(allBack.writes.dates, VISIT_SYNC);
  /* ใบผสมที่เคยเข้าพื้นที่แล้ว (ไม่พลิก) — ไม่ใช่กรณีนี้: ไม่มีบรรทัดเรื่องขั้นของใบเลย เหมือนเดิม */
  const mixedBack = plan({ rows: caseA({ Z3: { method: 'onsite' } }), changes: toOnsite('Z1'), visit: visit('done') });
  assert.equal(mixedBack.flip, null);
  assert.equal(mixedBack.dates.action, 'none');
  assert.deepEqual(mixedBack.lines, [L8(1)]);

  // (ข) นัดกำลังทำ คนละวัน มีเวลา มีช่าง → sync: วัน เวลา ช่าง กลับขึ้นใบ · วันส่งผลไม่ถูกแตะ
  //     (มติ 26/10 head-r3-54 ข้างเคียง) ช่างของนัดได้กระดิ่งว่าต้องวัดพื้นที่ที่กลับเพิ่ม — บรรทัดของนัดใช้วันของนัดนั้น (อ. 20 ต.ค.)
  const inProgress = plan({ ...base, visit: visit('in_progress', { scheduledDate: '2026-10-20', startTime: '09:30:00' }) });
  expectPlan(inProgress, {
    kind: 'switch',
    flip: 'to-visit',
    visitAction: 'stays',
    datesAction: 'sync',
    lines: ['นัด SV-26100011 วันที่ อ. 20 ต.ค. ของ Phuwadol Aoonnankad ยังอยู่ — ช่างได้รับแจ้งว่าต้องวัด “ล็อบบี้” เพิ่ม', L8(1)],
    thread: T_ONSITE(1, 'ล็อบบี้'),
    bells: { crew: BELL_BACK('ล็อบบี้') },
    writes: {
      onsiteIds: ['Z1'], unselectSpotRows: unselect,
      dates: { committedDueDate: '2026-10-20', committedDueTime: '09:30', assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad' },
    },
  }, 'นัดกำลังทำ');
  assert.equal('committedResultDate' in inProgress.writes.dates, false, 'คำสัญญาวันส่งผลต้องไม่อยู่ใน patch');

  // (ค) นัดร่าง ไม่มีช่าง ไม่มีเวลา → sync โดยเวลาเป็น null และไม่มีคีย์ผู้รับผิดชอบ
  const draft = plan({ ...base, visit: visit('draft', { assigneeId: null, assigneeName: null, startTime: null }) });
  assert.equal(draft.dates.action, 'sync');
  assert.deepEqual(draft.writes.dates, { committedDueDate: '2026-10-13', committedDueTime: null });
  assert.deepEqual(draft.lines, [L8(1)]);

  // จุดทุกจุดถูกปลดเลือก จำนวนจุดเท่าเดิม
  const spots = inProgress.writes.unselectSpotRows[0].spots;
  assert.equal(spots.length, 2);
  assert.ok(spots.every((s) => s.selected === false));
  // ไม่มีวันส่งผลเก็บไว้ → บรรทัด 9 ไม่มีวงเล็บ
  const noDate = plan({ ...base, visit: null, request: { ...request, committedResultDate: null } });
  assert.equal(noDate.lines[1], 'ใบกลับไปขั้น “รอลงคิว” — วันส่งผลที่รับปากไว้ ถูกล้าง · ผู้วางคิวลงวันเข้าพื้นที่และวันส่งผลใหม่');
});

/* ── 5) สองทิศในครั้งเดียว ───────────────────────────────────────────────── */
test('⑤ สลับสองทิศในการกดครั้งเดียว ไม่พลิก → เธรดบรรทัดเดียว คั่นด้วย " | "', () => {
  const rows = caseB({ Z2: stamp });
  const got = plan({ rows, changes: [...toDrawing('Z1'), ...toOnsite('Z2')], visit: visit('scheduled') });
  expectPlan(got, {
    kind: 'switch',
    visitAction: 'stays',
    // head-r3-54: นัดยังอยู่ ⇒ บรรทัดของนัดต่อท้ายพื้นที่ที่กลับ · กระดิ่งเดียวเอ่ยทั้งสองทิศ
    lines: [L1(1), `${L6()} · ต้องวัด “ห้องประชุม” เพิ่ม`, L8(1)],
    thread: `${T_DRAWING(1, 'ล็อบบี้')} | ${T_ONSITE(1, 'ห้องประชุม')}`,
    bells: { crew: { kind: 'zones', title: `${BELL_ZONES('ล็อบบี้').title} · “ห้องประชุม” กลับเป็นลงหน้างาน — ต้องวัดพื้นที่นี้เพิ่ม` } },
    writes: { drawingIds: ['Z1'], onsiteIds: ['Z2'], unselectSpotRows: [{ id: 'Z2', updatedAt: '2026-10-08T02:00:00+00:00', spots: [] }] },
  }, 'สองทิศ');
});

/* ── 6) ยกเลิกนัดอย่างเดียว ──────────────────────────────────────────────── */
test('⑥ ใบจากแบบทั้งใบที่ยังมีนัดค้าง: ยกเลิกนัดอย่างเดียว · ไม่มีนัดค้าง = ไม่มีอะไรให้ทำ', () => {
  const base = { rows: caseA(), changes: [], reason: SURVEY_METHOD_CANCEL_ONLY_REASON };
  const want = {
    kind: 'cancel-only',
    visitAction: 'cancel',
    lines: [L_CANCEL_ONLY],
    thread: 'ยกเลิกนัด SV-26100011 — ใบนี้ประเมินจากแบบทั้งใบ',
    bells: { crew: BELL_CANCEL },
    confirmLabel: 'ยกเลิกนัด',
  };
  for (const status of ['draft', 'scheduled']) {
    const got = plan({ ...base, visit: visit(status) });
    expectPlan(got, { ...want, writes: { cancelVisitId: 'V1' } }, status);
    assert.deepEqual(got.defaults, { reason: SURVEY_METHOD_CANCEL_ONLY_REASON, resultDate: '2026-10-15' });
    assert.equal(got.visitCancelReason, `เปลี่ยนเป็นประเมินจากแบบ: ${SURVEY_METHOD_CANCEL_ONLY_REASON}`);
  }
  // ยกเลิกไปแล้วโดยการกดครั้งนี้ (พิสูจน์แล้ว) → ข้อความชุดเดิม กระดิ่งเดิม แต่ไม่มีอะไรให้ยกเลิกอีก
  expectPlan(plan({ ...base, visit: visit('cancelled', { cancelledByThisAction: true }) }), want, 'ยกเลิกแล้วโดยการกดนี้');

  // ไม่มีอะไรให้ทำ
  const nothing = [
    ['ไม่มีนัด', null],
    ['นัดกำลังทำ', visit('in_progress')],
    ['นัดปิดแล้ว', visit('done')],
    ['นัดยกเลิกโดยคนอื่น (ไม่มีหลักฐาน)', visit('cancelled')],
  ];
  for (const [name, v] of nothing) {
    const got = plan({ ...base, visit: v });
    expectPlan(got, { kind: 'none', lines: [], thread: null, needs: { reason: false, resultDate: false } }, name);
    assert.equal(got.disabledReason, SURVEY_METHOD_ERRORS.nothing, name);
  }
  // ใบที่ยังต้องมีนัด + ไม่ได้เปลี่ยนอะไร ไม่ใช่การยกเลิกนัด
  assert.equal(plan({ changes: [], visit: visit('scheduled') }).kind, 'none');
});

/* ── 7) หัวหน้าตัดพื้นที่ลงหน้างานสุดท้าย ────────────────────────────────── */
const cutRows = (z1 = {}) => [
  zone('Z0', 'ห้องเก็บของ', { status: 'cut' }),
  zone('Z1', 'ล็อบบี้', z1),
  zone('Z2', 'ห้องประชุม', stamp),
  zone('Z3', 'ห้องน้ำ', stamp),
];
const cutPlan = (over = {}) => plan({ rows: cutRows(), cut: { zoneId: 'Z1', to: 'cut' }, reason: CUT_REASON, visit: visit('scheduled'), ...over });
const CUT_DONE = { status: 'cut', method: 'drawing', cutReason: CUT_REASON };

test('⑦ ตัดพื้นที่ลงหน้างานสุดท้าย + นัดไว้: บรรทัด 2 + 3 · เธรด "ตัดพื้นที่ … ออก" · แถวตัดทุกแถวตามไปเป็นจากแบบ', () => {
  const got = cutPlan();
  expectPlan(got, {
    kind: 'cut',
    flip: 'to-desk',
    visitAction: 'cancel',
    datesAction: 'set',
    lines: [L2, L3],
    thread: `${T_CUT} · ยกเลิกนัด SV-26100011 · ส่งผล 12/10/2026`,
    bells: { crew: BELL_CANCEL, head: BELL_HEAD },
    writes: { cancelVisitId: 'V1', cutMarkIds: ['Z0'], dates: DESK_PATCH },
    needs: { reason: true, resultDate: true },
    confirmLabel: 'ตัดพื้นที่และยกเลิกนัด',
  }, 'ตัดครั้งแรก');
  assert.deepEqual(got.cutZone, { id: 'Z1', name: 'ล็อบบี้' });
  assert.equal(got.visitCancelReason, T_CUT);
  assert.deepEqual(got.before, { needsVisit: true, mix: { onsite: 1, drawing: 2, mode: 'mixed' } });
  assert.deepEqual(got.after, { needsVisit: false, mix: { onsite: 0, drawing: 2, mode: 'drawing' } });
  // เหตุผลของการตัดมีกติกาของ route พื้นที่เอง (≥ 5 ตัวอักษร) — แผนไม่ตรวจความยาว
  assert.deepEqual(cutPlan({ reason: 'ย้าย' }).errors, []);
  // ยังไม่ได้พิมพ์วันส่งผล → บรรทัด 2 ไม่มีวัน · แผนบอกว่าต้องกรอก
  const noDate = cutPlan({ resultDate: '' });
  assert.deepEqual(noDate.lines, [L2_NO_DATE, L3]);
  assert.deepEqual(noDate.errors, [SURVEY_METHOD_ERRORS.resultDate]);
  assert.equal(noDate.writes.dates, null);
});

test('⑦ กดยืนยันการตัดซ้ำ (แถวถูกตัด + เป็นจากแบบแล้ว ด้วยเหตุผลเดิม) = applied ไม่ใช่ stale · วันและเธรดเหมือนรอบแรก', () => {
  const first = cutPlan();
  const table = [
    ['นัดถูกยกเลิกโดยการกดนี้', visit('cancelled', { cancelledByThisAction: true }), {
      visitAction: 'cancel', lines: [L2, L3], thread: `${T_CUT} · ยกเลิกนัด SV-26100011 · ส่งผล 12/10/2026`,
      bells: { crew: BELL_CANCEL, head: BELL_HEAD },
    }],
    // ใบไม่ได้อยู่ในคิวรอลงคิว (ช่างกำลังทำนัด · นัดเข้าพื้นที่จบแล้ว) ⇒ ไม่มีท่อน "ใบออกจากคิว…" (head-r3-10)
    ['ช่างกดเริ่มงานไปก่อน', visit('in_progress'), {
      visitAction: 'keep-open', lines: [L2_OFF_QUEUE, L4_CUT], thread: `${T_CUT} · ส่งผล 12/10/2026`, bells: { head: BELL_HEAD },
    }],
    ['นัดปิดไปแล้ว', visit('done'), {
      visitAction: 'history', lines: [L2_OFF_QUEUE, L5('เข้าแล้ว')], thread: `${T_CUT} · ส่งผล 12/10/2026`, bells: { head: BELL_HEAD },
    }],
  ];
  for (const [name, v, want] of table) {
    const got = cutPlan({ rows: cutRows(CUT_DONE), visit: v });
    expectPlan(got, {
      kind: 'cut',
      flip: 'to-desk',
      datesAction: 'set',
      writes: { cutMarkIds: ['Z0'], dates: first.writes.dates },
      needs: { reason: true, resultDate: true },
      confirmLabel: 'ตัดพื้นที่และยกเลิกนัด',
      ...want,
    }, name);
    assert.equal(got.before.needsVisit, true, `${name}: "ก่อน" ต้องเห็นแถวนี้เป็นลงหน้างาน`);
    assert.doesNotMatch(got.thread, /undefined/, name);
  }
});

test('⑦ การตัดที่ไม่ใช่ของการกดนี้ = stale · การตัดที่ไม่พลิกใบ = ไม่ใช่แผน', () => {
  const stale = [
    ['ถูกตัดด้วยเหตุผลอื่น', cutRows({ status: 'cut', method: 'drawing', cutReason: 'เหตุผลของคนอื่น' })],
    ['แถวเป็นจากแบบที่ยังไม่ถูกตัด', cutRows(stamp)],
    ['แถวที่เพิ่มหน้างาน', cutRows({ status: 'added' })],
    ['ไม่รู้จัก id', cutRows().filter((r) => r.id !== 'Z1')],
  ];
  for (const [name, rows] of stale) {
    const got = cutPlan({ rows });
    assert.equal(got.stale, true, name);
    assert.equal(got.disabledReason, SURVEY_METHOD_ERRORS.stale, name);
    assert.deepEqual(got.writes, NO_WRITES, `${name}: แผนที่ล้าสมัยไม่สั่งเขียนอะไร`);
  }
  // ใบลงหน้างานล้วนที่ถูกตัดจนหมด ยังต้องมีนัด (RQ-AS-26090233) → ไม่พลิก ไม่ใช่แผน
  const onsiteOnly = plan({ rows: [zone('Z1', 'ล็อบบี้')], cut: { zoneId: 'Z1', to: 'cut' }, reason: CUT_REASON, visit: visit('scheduled') });
  assert.equal(onsiteOnly.kind, 'none');
  assert.equal(onsiteOnly.flip, null);
  assert.deepEqual(onsiteOnly.writes, NO_WRITES);
  // ยังเหลือพื้นที่ลงหน้างานอื่น → ไม่พลิก
  assert.equal(plan({ cut: { zoneId: 'Z1', to: 'cut' }, reason: CUT_REASON, visit: visit('scheduled') }).kind, 'none');
});

/* ── 8) เรื่องที่ส่งกลับให้ช่างแก้ ──────────────────────────────────────── */
test('⑧ มีเรื่องส่งกลับค้าง: ใบออกจากคิว = บรรทัด 7 พร้อมจำนวนข้อ · ไม่พลิก = ไม่มีบรรทัดนี้', () => {
  const sendBack = { pending: true, sentBack: { items: ['ภาพกว้างไม่ชัด', 'ขาดขนาดห้อง'] } };
  const flip = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: null, sendBack });
  assert.deepEqual(flip.lines, [L1(3), L2, 'เรื่องที่ส่งกลับให้ช่างแก้ 2 ข้อ ถูกปิดไปด้วย']);
  assert.deepEqual(flip.sendBack, { closes: true, itemCount: 2 });
  const noItems = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: null, sendBack: { pending: true, sentBack: { items: [] } } });
  assert.equal(noItems.lines[2], 'เรื่องที่ส่งกลับให้ช่างแก้ ถูกปิดไปด้วย');
  const stay = plan({ changes: toDrawing('Z3'), visit: null, sendBack });
  assert.deepEqual(stay.lines, [L1(1)]);
  assert.deepEqual(stay.sendBack, { closes: false, itemCount: 2 });
  const notPending = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: null, sendBack: { pending: false, sentBack: { items: ['x'] } } });
  assert.deepEqual(notPending.lines, [L1(3), L2]);
});

/* ── 9) ยังไม่มีแบบ ──────────────────────────────────────────────────────── */
test('⑨ ใบยังไม่มีไฟล์แบบ → ท้ายเธรดชวนแนบ · มีแล้ว → ไม่มีท้าย', () => {
  const tail = ' · ถ้ายังไม่ได้ส่งแบบ แนบในเธรดนี้ได้เลย';
  assert.equal(plan({ changes: toDrawing('Z3'), hasDrawings: false }).thread, T_DRAWING(1, 'ห้องน้ำ') + tail);
  assert.equal(plan({ changes: toDrawing('Z3'), hasDrawings: true }).thread, T_DRAWING(1, 'ห้องน้ำ'));
  assert.equal(plan({ changes: toDrawing('Z3') , hasDrawings: undefined }).thread, T_DRAWING(1, 'ห้องน้ำ'), 'ไม่ส่งมา = มีแบบ');
  // ท้ายนี้เป็นของประโยค "เป็นจากแบบ" เท่านั้น
  assert.doesNotMatch(plan({ rows: caseA(), changes: toOnsite('Z1'), hasDrawings: false, visit: visit('scheduled') }).thread, /แนบในเธรด/);
  // ลำดับท้าย: ยกเลิกนัด → ส่งผล → ชวนแนบแบบ
  assert.equal(
    plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('scheduled'), hasDrawings: false }).thread,
    `${T_DRAWING(3, ALL)} · ยกเลิกนัด SV-26100011 · ส่งผล 12/10/2026${tail}`,
  );
});

/* ── 10) กดซ้ำหลังบันทึกไปครึ่งทาง ──────────────────────────────────────── */
test('⑩ แถวที่ถึงเป้าแล้ว: เหตุผล + ชื่อคนเดียวกัน = ของการกดนี้ (applied) · ไม่ตรง = คนอื่นแก้ (stale)', () => {
  const mine = { method: 'drawing', methodReason: REASON, methodChangedByName: actor.name };
  const first = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('scheduled') });

  // สองในสามแถวเขียนไปแล้ว
  const half = plan({ rows: caseB({ Z1: mine, Z2: mine }), changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('scheduled') });
  assert.equal(half.stale, false);
  assert.equal(half.thread, first.thread, 'เธรดของรอบกดซ้ำต้องเหมือนรอบแรก');
  assert.deepEqual(half.toDrawing, first.toDrawing);
  assert.deepEqual(half.writes.drawingIds, ['Z3'], 'เขียนเฉพาะแถวที่ยังไม่ถึงเป้า');
  assert.deepEqual(half.before, first.before, '"ก่อน" ถูกประกอบกลับจาก body');
  assert.equal(half.flip, 'to-desk');
  assert.deepEqual(half.writes.dates, first.writes.dates);

  // เขียนครบแล้ว + นัดถูกยกเลิกโดยการกดนี้ → ข้อความ เธรด กระดิ่งเดิม แต่ไม่ยกเลิกซ้ำ
  const done = plan({
    rows: caseB({ Z1: mine, Z2: mine, Z3: mine }), changes: toDrawing('Z1', 'Z2', 'Z3'),
    visit: visit('cancelled', { cancelledByThisAction: true }),
  });
  expectPlan(done, {
    kind: 'switch',
    flip: 'to-desk',
    visitAction: 'cancel',
    datesAction: 'set',
    lines: first.lines,
    thread: first.thread,
    bells: first.bells,
    writes: { dates: DESK_PATCH },
    needs: { reason: true, resultDate: true },
  }, 'กดซ้ำหลังยกเลิกนัด');
  // นัดเดียวกันแต่ไม่มีหลักฐานว่าเป็นของการกดนี้ → เป็นประวัติ
  const noProof = plan({ rows: caseB({ Z1: mine, Z2: mine, Z3: mine }), changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('cancelled') });
  assert.equal(noProof.visit.action, 'history');
  assert.equal(noProof.bells.crew, null);
  assert.doesNotMatch(noProof.thread, /ยกเลิกนัด/);

  const stale = [
    ['เหตุผลไม่ตรง', caseB({ Z3: { ...mine, methodReason: 'ลูกค้ายังไม่ให้เข้า' } }), toDrawing('Z3')],
    ['คนละคน', caseB({ Z3: { ...mine, methodChangedByName: 'หัวหน้า ข' } }), toDrawing('Z3')],
    ['แถวถูกตัดไปแล้ว', caseB({ Z3: { status: 'cut' } }), toDrawing('Z3')],
    ['ไม่รู้จัก id', caseB(), toDrawing('Z404')],
    ['ลงหน้างานอยู่แล้วโดยไม่มีใครสลับ', caseB(), toOnsite('Z3')],
    ['หนึ่งในหลายแถวล้าสมัย', caseB({ Z3: { status: 'cut' } }), toDrawing('Z1', 'Z3')],
  ];
  for (const [name, rows, changes] of stale) {
    const got = plan({ rows, changes, visit: visit('scheduled') });
    assert.equal(got.stale, true, name);
    assert.equal(got.disabledReason, SURVEY_METHOD_ERRORS.stale, name);
    assert.deepEqual(got.writes, NO_WRITES, `${name}: แผนที่ล้าสมัยไม่สั่งเขียนอะไร`);
  }
  // เหตุผลมีช่องว่างหัวท้าย — เทียบหลังตัดช่องว่าง
  assert.equal(plan({ rows: caseB({ Z3: mine }), changes: toDrawing('Z3'), reason: `  ${REASON}  ` }).stale, false);
  // id เป็นเลขฝั่งหนึ่ง สตริงอีกฝั่ง
  const numeric = plan({ rows: [{ id: 7, zoneName: 'ห้อง 7', status: 'ok' }, zone('Z2', 'ห้องประชุม')], changes: toDrawing('7') });
  assert.deepEqual(numeric.writes.drawingIds, [7]);
});

/* ── 11) ข้อผิดพลาดของช่องกรอก ──────────────────────────────────────────── */
test('⑪ errors: ความยาวเหตุผล 9 / 10 / 300 / 301 · วันส่งผลขาด / ผิดรูป เฉพาะตอนที่แผนต้องใช้วัน', () => {
  const E = SURVEY_METHOD_ERRORS;
  const len = (n) => 'ก'.repeat(n);
  const mixed = (reason) => plan({ changes: toDrawing('Z3'), reason, resultDate: '' }).errors;
  assert.deepEqual(mixed(len(9)), [E.reason]);
  assert.deepEqual(mixed(`  ${len(9)}  `), [E.reason], 'นับหลังตัดช่องว่าง');
  assert.deepEqual(mixed(''), [E.reason]);
  assert.deepEqual(mixed(len(10)), []);
  assert.deepEqual(mixed(len(300)), []);
  assert.deepEqual(mixed(len(301)), ['เหตุผลยาวเกิน 300 ตัวอักษร']);
  // ใบยังผสม = ไม่ต้องใช้วัน ⇒ วันว่าง/ผิดรูปไม่ใช่ข้อผิดพลาด
  assert.deepEqual(plan({ changes: toDrawing('Z3'), resultDate: 'ไม่ใช่วัน' }).errors, []);

  const desk = (resultDate, reason = REASON) => plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), resultDate, reason });
  assert.deepEqual(desk('').errors, [E.resultDate]);
  assert.deepEqual(desk('  ').errors, [E.resultDate]);
  assert.deepEqual(desk('12/10/2026').errors, ['วันที่จะส่งผลประเมินไม่ถูกต้อง']);
  assert.deepEqual(desk('2026-10-1').errors, ['วันที่จะส่งผลประเมินไม่ถูกต้อง']);
  assert.deepEqual(desk(DATE).errors, []);
  // ลำดับของ route: เหตุผลก่อนวัน
  assert.deepEqual(desk('', len(9)).errors, [E.reason, E.resultDate]);
  // วันใช้ไม่ได้ ⇒ ไม่มี patch ของวัน และบรรทัด 2 / เธรดไม่พิมพ์วัน
  const bad = desk('12/10/2026');
  assert.equal(bad.writes.dates, null);
  assert.equal(bad.lines[1], L2_NO_DATE);
  assert.equal(bad.thread, T_DRAWING(3, ALL));
});

/* ── 12) ชื่อพื้นที่ ─────────────────────────────────────────────────────── */
test('⑫ ชื่อพื้นที่: สามชื่อแรก ที่เหลือนับ · ชื่อว่าง = "พื้นที่ไม่มีชื่อ"', () => {
  assert.equal(surveyZoneNamesText(['A', 'B', 'C', 'D']), 'A · B · C และอีก 1 พื้นที่');
  assert.equal(surveyZoneNamesText(['A', 'B', 'C', 'D', 'E']), 'A · B · C และอีก 2 พื้นที่');
  assert.equal(surveyZoneNamesText(['A', 'B', 'C']), 'A · B · C');
  assert.equal(surveyZoneNamesText(['A']), 'A');
  assert.equal(surveyZoneNamesText(['A', 'B', 'C'], 2), 'A · B และอีก 1 พื้นที่');
  assert.equal(surveyZoneNamesText([]), '');
  assert.equal(surveyZoneNamesText(null), '');
  const rows = [...caseB(), zone('Z4', '   ')];
  const got = plan({ rows, changes: toDrawing('Z1', 'Z2', 'Z3', 'Z4'), visit: visit('in_progress') });
  assert.equal(got.thread, `เปลี่ยนวิธีประเมินเป็น “ประเมินจากแบบ” 4 พื้นที่ (${ALL} และอีก 1 พื้นที่) — ${REASON} · ส่งผล 12/10/2026`);
  // กระดิ่งช่างเอ่ยครบทุกชื่อ (กระดิ่งเดียวต่อการกดหนึ่งครั้ง) · สี่พื้นที่ = "พื้นที่เหล่านี้" (head-r3-10)
  assert.deepEqual(got.bells.crew, BELL_ZONES(`${ALL} · พื้นที่ไม่มีชื่อ`, 'พื้นที่เหล่านี้'));
});

/* ── 13) ปุ่ม "เปลี่ยนวิธีประเมิน" ───────────────────────────────────────── */
test('⑬ surveyMethodSwitchGate: ซ่อนเมื่อสวิตช์ปิด / ไม่ใช่หัวหน้า / ใบจบแล้ว · โชว์แต่กดไม่ได้พร้อมเหตุ', () => {
  const E = SURVEY_METHOD_ERRORS;
  const ack = { id: 'RQ1', status: 'acknowledged', acknowledgedAt: NOW, answeredAt: null };
  const on = { canSwitch: true, enabled: true };
  const HIDDEN = { show: false, allowed: false, reason: null };
  const cases = [
    ['สวิตช์ปิด', ack, { canSwitch: true, enabled: false }, HIDDEN],
    ['ผู้วางคิว / ช่าง', ack, { canSwitch: false, enabled: true }, HIDDEN],
    ['ไม่ส่งตัวเลือก', ack, undefined, HIDDEN],
    ['ไม่มีใบ', null, on, HIDDEN],
    ['รับเรื่องแล้ว', ack, on, { show: true, allowed: true, reason: null }],
    ['กำลังทำ', { ...ack, status: 'in_progress' }, on, { show: true, allowed: true, reason: null }],
    ['ยังไม่รับเรื่อง', { id: 'RQ1', status: 'pending' }, on, { show: true, allowed: false, reason: E.notAcknowledged }],
    ['ร่าง', { id: 'RQ1', status: 'draft' }, on, { show: true, allowed: false, reason: E.notAcknowledged }],
    ['ส่งผลแล้ว', { ...ack, status: 'answered', answeredAt: NOW }, on, { show: true, allowed: false, reason: E.sentButton }],
    ['ยกเลิก', { ...ack, cancelledAt: NOW }, on, HIDDEN],
    ['ปิดโดยไม่ได้ผล', { ...ack, status: 'closed' }, on, HIDDEN],
    ['ปิดหลังส่งผล (ยังเห็นปุ่ม พร้อมเหตุ)', { ...ack, status: 'closed', answeredAt: NOW }, on, { show: true, allowed: false, reason: E.sentButton }],
  ];
  for (const [name, req, opts, want] of cases) assert.deepEqual(surveyMethodSwitchGate(req, opts), want, name);
});

test('surveyMethodRequestError: ลำดับของ route — ส่งผลแล้ว → ใบล็อก → ยังไม่รับเรื่อง', () => {
  const E = SURVEY_METHOD_ERRORS;
  const ack = { id: 'RQ1', status: 'acknowledged', acknowledgedAt: NOW, answeredAt: null };
  assert.equal(surveyMethodRequestError(ack), null);
  assert.equal(surveyMethodRequestError({ ...ack, answeredAt: NOW }), E.sentRoute);
  assert.equal(surveyMethodRequestError({ ...ack, answeredAt: NOW, cancelledAt: NOW }), E.sentRoute, 'ส่งผลแล้วมาก่อน');
  assert.equal(surveyMethodRequestError({ ...ack, cancelledAt: NOW }), 'ใบนี้ถูกยกเลิกไปแล้ว — แก้ผลประเมินไม่ได้');
  assert.match(surveyMethodRequestError({ ...ack, status: 'closed' }), /^ใบนี้ถูกปิดไปแล้ว/);
  assert.equal(surveyMethodRequestError({ id: 'RQ1', status: 'draft', acknowledgedAt: NOW }), E.notAcknowledged);
  assert.equal(surveyMethodRequestError({ id: 'RQ1', status: 'pending', acknowledgedAt: NOW }), E.notAcknowledged);
  assert.equal(surveyMethodRequestError({ id: 'RQ1', status: 'acknowledged', acknowledgedAt: null }), E.notAcknowledged);
  assert.equal(surveyMethodRequestError(null), 'ไม่พบใบคำร้อง');
});

test('surveyMethodChanges: รูปของ body — อาร์เรย์ของ { zoneId, method } ไม่ซ้ำพื้นที่', () => {
  const BAD = { value: null, error: 'วิธีประเมินไม่ถูกต้อง' };
  assert.deepEqual(surveyMethodChanges([]), { value: [], error: null });
  assert.deepEqual(
    surveyMethodChanges([{ zoneId: 'Z1', method: 'drawing', extra: 1 }, { zoneId: 7, method: 'onsite' }]),
    { value: [{ zoneId: 'Z1', method: 'drawing' }, { zoneId: '7', method: 'onsite' }], error: null },
  );
  const bad = [
    undefined, null, 'Z1', {}, [null], ['Z1'], [{ zoneId: 'Z1' }], [{ method: 'drawing' }],
    [{ zoneId: '', method: 'drawing' }], [{ zoneId: 'Z1', method: 'Drawing' }], [{ zoneId: 'Z1', method: 'cut' }],
    [{ zoneId: 'Z1', method: 'drawing' }, { zoneId: 'Z1', method: 'onsite' }],
    [{ zoneId: 7, method: 'drawing' }, { zoneId: '7', method: 'drawing' }],
    [{ zoneId: {}, method: 'drawing' }],
  ];
  for (const input of bad) assert.deepEqual(surveyMethodChanges(input, []), BAD, JSON.stringify(input));
  // ไม่ตรวจกับแถว — id ที่ไม่มีในใบผ่านด่านรูป (แผนเป็นคนตอบว่าล้าสมัย)
  assert.equal(surveyMethodChanges([{ zoneId: 'Z404', method: 'drawing' }], caseB()).error, null);
});

/* ── 14) ตัวนับความคืบหน้า ──────────────────────────────────────────────── */
test('⑭ surveyProgressText: ใบลงหน้างานล้วนได้ข้อความเดิมทุกตัวอักษร · พื้นที่จากแบบไม่ถูกเรียกว่า "วัดแล้ว"', () => {
  assert.equal(surveyProgressText({ total: 5, done: 3, complete: false }), 'วัดแล้ว 3 / 5 พื้นที่');
  assert.equal(surveyProgressText({ total: 5, done: 3, complete: false }, { owner: true }), 'วัดแล้ว 3 / 5 พื้นที่');
  assert.equal(surveyProgressText({ total: 0, done: 0, complete: false }), 'วัดแล้ว 0 / 0 พื้นที่');
  assert.equal(surveyProgressText({ total: 5, done: 3, complete: false, drawing: 0 }), 'วัดแล้ว 3 / 5 พื้นที่');
  assert.equal(surveyProgressText({ total: 2, done: 1, complete: false, drawing: 1 }), 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1');
  assert.equal(surveyProgressText({ total: 2, done: 1, complete: false, drawing: 1 }, { owner: true }), 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)');
  assert.equal(surveyProgressText({ total: 0, done: 0, complete: false, drawing: 3 }), 'จากแบบ 3 พื้นที่');
  assert.equal(surveyProgressText({ total: 0, done: 0, complete: false, drawing: 3 }, { owner: true }), 'จากแบบ 3 พื้นที่');
  assert.equal(surveyProgressText(null), 'วัดแล้ว 0 / 0 พื้นที่');
});

/* ── 15) ยามซอร์ส ────────────────────────────────────────────────────────── */
test('⑮ 🔴 surveyMethodSwitch.js ดึงได้ห้าโมดูลเท่านั้น — ไฟล์นี้จะถูกดึงเข้า bundle ของจอ', () => {
  const src = readFileSync(new URL('./surveyMethodSwitch.js', import.meta.url), 'utf8');
  const from = [...src.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]).sort();
  // `queueWords` (head-r3-21 · ตัวจัดรูปวันบนจอ) เป็นไฟล์ใบ — ไม่ดึงอะไรจากโมดูลประเมินพื้นที่ จึงไม่มีวงกลม
  assert.deepEqual(from, ['@/lib/format', '@/lib/service/queueWords', '@/lib/service/survey', '@/lib/service/surveyMethod', '@/lib/service/visitStatus']);
  assert.doesNotMatch(readFileSync(new URL('./queueWords.js', import.meta.url), 'utf8'), /surveyMethod|\/survey['"]|surveyQueue/, 'queueWords ต้องเป็นไฟล์ใบ');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bimport\s*\(/, 'ห้ามดึงแบบเรียกฟังก์ชัน');
  assert.doesNotMatch(code, /\brequire\s*\(/);
  assert.doesNotMatch(code, /process\.env/, 'ไฟล์ล้วน — ห้ามอ่านสวิตช์เอง');
  assert.doesNotMatch(code, /surveyDrawingFlag/);
  // ไม่มีใครในวงกลม attachmentTypes → survey → surveyMethod ดึงไฟล์นี้กลับ
  for (const file of ['./survey.js', './surveyMethod.js', '../master/attachmentTypes.js']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /surveyMethodSwitch/, file);
  }
});

/* ── 16) กุญแจของการกดหนึ่งครั้ง ─────────────────────────────────────────── */
test('⑯ surveyMethodActionId / surveyMethodPlanKey: กุญแจชี้ "การกดครั้งนั้น" ไม่ใช่เนื้อหาของมัน', () => {
  const uuid = '0b1e6c0e-6a0b-4f0e-9a39-2f0f6f1f7c11';
  assert.equal(surveyMethodActionId(uuid), uuid);
  assert.equal(surveyMethodActionId('a'.repeat(8)), 'a'.repeat(8));
  assert.equal(surveyMethodActionId('A_b-9'.repeat(12) + 'abcd'), 'A_b-9'.repeat(12) + 'abcd');
  const bad = ['', 'a'.repeat(7), 'a'.repeat(65), 'abcd efgh', 12345678, undefined, null, {}, ['abcdefgh'], 'กขคงจฉชซฌ', 'abcdefgh\n'];
  for (const value of bad) assert.equal(surveyMethodActionId(value), null, JSON.stringify(value));

  const other = '7f3d2a10-1111-4222-8333-444455556666';
  assert.equal(surveyMethodPlanKey({ userId: 'U-HEAD', actionId: uuid }), `U-HEAD|${uuid}`);
  assert.equal(surveyMethodPlanKey({ userId: 42, actionId: uuid }), `42|${uuid}`);
  // เนื้อหาเหมือนกันทุกตัว (พื้นที่ · ชิปเหตุผล · วัน) แต่กดคนละครั้ง = คนละกุญแจ
  assert.notEqual(surveyMethodPlanKey({ userId: 'U-HEAD', actionId: uuid }), surveyMethodPlanKey({ userId: 'U-HEAD', actionId: other }));
  assert.equal(surveyMethodPlanKey({ userId: 'U-HEAD', actionId: uuid }), surveyMethodPlanKey({ userId: 'U-HEAD', actionId: uuid }));
  assert.notEqual(surveyMethodPlanKey({ userId: 'U-HEAD', actionId: uuid }), surveyMethodPlanKey({ userId: 'U-OTHER', actionId: uuid }));
});

/* ── รูปของผลลัพธ์ — หกกลุ่มเขียนโค้ดชนคีย์พวกนี้ ─────────────────────────── */
test('แผนคืนคีย์ครบตามสเปค §2.2 ทุกชนิด — รวมแผนที่ไม่มีอะไรให้ทำและอินพุตว่าง', () => {
  const keys = [
    'after', 'before', 'bells', 'confirmLabel', 'cutZone', 'dates', 'defaults', 'disabledReason', 'errors', 'flip', 'kind',
    'lines', 'needs', 'reason', 'resultDate', 'sendBack', 'stale', 'thread', 'toDrawing', 'toOnsite', 'visit',
    'visitCancelReason', 'writes',
  ];
  const plans = [
    surveyMethodSwitchPlan({}),
    surveyMethodSwitchPlan({ rows: null, changes: null, request: null }),
    plan({ changes: toDrawing('Z3') }),
    plan({ rows: caseA(), changes: [], visit: visit('scheduled') }),
    cutPlan(),
  ];
  for (const p of plans) {
    assert.deepEqual(Object.keys(p).sort(), keys);
    assert.deepEqual(Object.keys(p.writes).sort(), Object.keys(NO_WRITES).sort());
    assert.deepEqual(Object.keys(p.bells).sort(), ['crew', 'head']);
  }
  assert.equal(surveyMethodSwitchPlan({}).kind, 'none');
  // นัดบนแผนพกของที่กระดิ่งช่างต้องใช้ — ตัวเขียนไม่อ่านนัดซ้ำ
  const v = plan({ changes: toDrawing('Z3'), visit: visit('scheduled') }).visit;
  assert.deepEqual(v, {
    action: 'stays', id: 'V1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-13',
    assigneeId: 'U-TECH', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['U-AST'], cancelledByThisAction: false,
  });
  assert.equal(plan({ changes: toDrawing('Z3') }).reason, REASON);
  assert.equal(plan({ changes: toDrawing('Z3'), reason: `  ${REASON} ` }).reason, REASON, 'เหตุผลบนแผนตัดช่องว่างแล้ว');
  // ไม่ส่งเวลามา → patch ของวันยังมีครบคีย์ (ตัวเขียนเติมเวลาเอง)
  const noNow = surveyMethodSwitchPlan({ rows: caseB(), changes: toDrawing('Z1', 'Z2', 'Z3'), request, actor, reason: REASON, resultDate: DATE });
  assert.deepEqual(noNow.writes.dates, surveyDeskCommitPatch({ date: DATE, user: actor, nowIso: null }));
});

test('surveyDeskRailSteps: ชื่อขั้นของงานโต๊ะครบหกขั้น · บรรทัดใต้สองขั้นกลางถูกล้าง · รหัสและลำดับไม่เปลี่ยน · ขั้นที่ไม่รู้จักผ่านไปตามเดิม', () => {
  assert.deepEqual(SURVEY_DESK_RAIL_LABELS, {
    draft: 'ส่งคำร้อง', pending: 'รับเรื่อง', commitDue: 'รับปากวันส่งผล', acknowledged: 'ประเมินจากแบบ', answered: 'ส่งผล', closed: 'ปิดเรื่อง',
  });
  const rail = [
    { id: 'draft', label: 'ส่งคำร้อง', hint: 'Lalida' },
    { id: 'pending', label: 'รับเรื่อง', hint: 'Arnon' },
    { id: 'commitDue', label: 'ลงคิว / นัด', hint: 'รอ TS ลงคิว', state: 'pending' },
    { id: 'acknowledged', label: 'เข้าพื้นที่', hint: 'SV-26100011 · ยังไม่ขึ้นตาราง' },
    { id: 'answered', label: 'ส่งผล', hint: 'หัวหน้า TS ส่งผลที่ใบประเมิน' },
    { id: 'closed', label: 'ปิดเรื่อง', hint: null },
    { id: 'extra', label: 'ขั้นอื่น', hint: 'x' },
  ];
  const desk = surveyDeskRailSteps(rail);
  assert.deepEqual(desk.map((s) => s.id), rail.map((s) => s.id));
  assert.deepEqual(desk.map((s) => s.label), ['ส่งคำร้อง', 'รับเรื่อง', 'รับปากวันส่งผล', 'ประเมินจากแบบ', 'ส่งผล', 'ปิดเรื่อง', 'ขั้นอื่น']);
  assert.deepEqual(desk.map((s) => s.hint), ['Lalida', 'Arnon', null, null, 'หัวหน้า TS ส่งผลที่ใบประเมิน', null, 'x']);
  assert.equal(desk[2].state, 'pending', 'คีย์อื่นของขั้นไม่ถูกแตะ');
  assert.equal(rail[2].label, 'ลงคิว / นัด', 'ไม่แก้อาร์เรย์ต้นทาง');
  assert.doesNotMatch(JSON.stringify(desk.slice(0, 6)), /ลงคิว|เข้าพื้นที่|SV-/);
  assert.deepEqual(surveyDeskRailSteps(null), []);
});

test('surveyZoneAddedLabel: ไม่ได้ถูกเพิ่ม = null · ลงหน้างาน = "เพิ่มหน้างาน" · จากแบบ = "เพิ่มโดย {ฝ่าย}" (ไม่รู้ฝ่าย = TS)', () => {
  assert.equal(surveyZoneAddedLabel({ status: 'ok' }, 'TS'), null);
  assert.equal(surveyZoneAddedLabel({ status: 'cut', method: 'drawing' }, 'TS'), null);
  assert.equal(surveyZoneAddedLabel(null, 'TS'), null);
  assert.equal(surveyZoneAddedLabel({ status: 'added' }, 'TS'), 'เพิ่มหน้างาน');
  assert.equal(surveyZoneAddedLabel({ status: 'added', method: 'onsite' }), 'เพิ่มหน้างาน');
  assert.equal(surveyZoneAddedLabel({ status: 'added', method: 'drawing' }, 'TS'), 'เพิ่มโดย TS');
  assert.equal(surveyZoneAddedLabel({ status: 'added', method: 'drawing' }, 'OP'), 'เพิ่มโดย OP');
  assert.equal(surveyZoneAddedLabel({ status: 'added', method: 'drawing' }), 'เพิ่มโดย TS');
  assert.equal(surveyZoneAddedLabel({ status: 'added', method: 'drawing' }, '  '), 'เพิ่มโดย TS');
});

/* ── S2b แก้หลังตรวจจอ (19/10) — กล่องผลลัพธ์และกระดิ่งพูดตรงกับเรื่องที่เกิดจริง ──────────────────────── */
test('head-r3-10: "พื้นที่นี้" / "พื้นที่เหล่านี้" ตามจำนวนที่สลับ · ท่อน "ใบออกจากคิวของผู้วางคิว" เฉพาะใบที่อยู่ในคิวรอลงคิวจริง', () => {
  const MANY = 'พื้นที่เหล่านี้';
  // stays สองพื้นที่ (ใบยังผสม) — บรรทัดของนัดและกระดิ่งช่างเป็นพหูพจน์ทั้งคู่
  const stays = plan({ changes: toDrawing('Z1', 'Z2'), visit: visit('scheduled') });
  assert.deepEqual(stays.lines, [L1(2), L6(MANY)]);
  assert.deepEqual(stays.bells.crew, BELL_ZONES('ล็อบบี้ · ห้องประชุม', MANY));
  // หนึ่งพื้นที่ = คำเดิมทุกตัวอักษร
  assert.deepEqual(plan({ changes: toDrawing('Z3'), visit: visit('in_progress') }).bells.crew, BELL_ZONES('ห้องน้ำ'));

  // พื้นที่สุดท้ายเป็นจากแบบขณะช่างกำลังทำนัด (หนึ่งพื้นที่) — ใบไม่ได้อยู่ในคิวรอลงคิว ⇒ ไม่มีท่อน "ใบออกจากคิว…"
  const lastOne = { rows: caseB({ Z1: stamp, Z2: stamp }), changes: toDrawing('Z3') };
  const keepOpen = plan({ ...lastOne, visit: visit('in_progress') });
  assert.equal(keepOpen.visit.action, 'keep-open');
  assert.deepEqual(keepOpen.lines, [L1(1), L2_OFF_QUEUE, L4()]);
  assert.deepEqual(keepOpen.bells.crew, BELL_ZONES('ห้องน้ำ'));
  assert.deepEqual(plan({ ...lastOne, visit: visit('in_progress'), resultDate: '' }).lines, [L1(1), L2_OFF_QUEUE_NO_DATE, L4()],
    'ยังไม่มีวัน = เหลือแค่ "ไม่เหลือพื้นที่ที่ต้องลงหน้างาน"');
  // นัดที่เป็นประวัติ: ถึงไซต์แล้ว (เข้าแล้ว / ทำไม่ครบ) = ไม่อยู่ในคิว · ไม่เคยถึงไซต์ (ทำไม่ได้ / ยกเลิก) = รอลงคิวใหม่อยู่ ⇒ คงท่อนเดิม
  for (const [status, label, l2] of [
    ['done', 'เข้าแล้ว', L2_OFF_QUEUE], ['partial', 'ทำไม่ครบ', L2_OFF_QUEUE], ['unable', 'ทำไม่ได้', L2], ['cancelled', 'ยกเลิก', L2],
  ]) {
    const got = plan({ ...lastOne, visit: visit(status) });
    assert.equal(got.visit.action, 'history', status);
    assert.deepEqual(got.lines, [L1(1), l2, L5(label)], status);
  }
  assert.deepEqual(plan({ ...lastOne, visit: visit('done'), resultDate: '' }).lines[1], L2_OFF_QUEUE_NO_DATE);
  assert.deepEqual(plan({ ...lastOne, visit: visit('unable'), resultDate: '' }).lines[1], L2_NO_DATE);
  // ไม่มีนัด · นัดที่การกดนี้ยกเลิก = ใบอยู่ในคิวจริง ⇒ คงท่อนเดิม (ทั้งมีวันและไม่มีวัน)
  assert.deepEqual(plan({ ...lastOne, visit: null }).lines, [L1(1), L2]);
  assert.deepEqual(plan({ ...lastOne, visit: visit('scheduled') }).lines, [L1(1), L2, L3]);
  assert.deepEqual(plan({ ...lastOne, visit: visit('draft'), resultDate: '' }).lines, [L1(1), L2_NO_DATE, L3]);
  // เธรดเป็นข้อความเก็บถาวร — ไม่มีท่อนคิว และวันยังมีปี (head-r3-21)
  assert.equal(keepOpen.thread, `${T_DRAWING(1, 'ห้องน้ำ')} · ส่งผล 12/10/2026`);
});

test('head-r3-54: นัดยังอยู่ + พื้นที่กลับเป็นลงหน้างาน = กระดิ่งช่างว่าต้องวัดเพิ่ม และบรรทัดในกล่อง · นัดร่าง / ไม่มีนัด = ไม่มีทั้งคู่', () => {
  const MANY = 'พื้นที่เหล่านี้';
  const mixed = caseB({ Z2: stamp, Z3: stamp }); // ล็อบบี้ลงหน้างาน · ห้องประชุม ห้องน้ำ จากแบบ
  const unselect = (...ids) => ids.map((id) => ({ id, updatedAt: `2026-10-08T0${id.slice(-1)}:00:00+00:00`, spots: [] }));
  for (const status of ['scheduled', 'in_progress']) {
    expectPlan(plan({ rows: mixed, changes: toOnsite('Z2'), visit: visit(status) }), {
      kind: 'switch',
      visitAction: 'stays',
      lines: [L6_BACK('ห้องประชุม'), L8(1)],
      thread: T_ONSITE(1, 'ห้องประชุม'),
      bells: { crew: BELL_BACK('ห้องประชุม') },
      writes: { onsiteIds: ['Z2'], unselectSpotRows: unselect('Z2') },
    }, status);
  }
  // หลายพื้นที่กลับ = "พื้นที่เหล่านี้" (ทรงเดียวกับ head-r3-10) · ชื่อครบทุกชื่อทั้งกระดิ่งและบรรทัด
  const many = plan({ rows: mixed, changes: toOnsite('Z2', 'Z3'), visit: visit('scheduled') });
  assert.deepEqual(many.lines, [L6_BACK('ห้องประชุม · ห้องน้ำ'), L8(2)]);
  assert.deepEqual(many.bells.crew, BELL_BACK('ห้องประชุม · ห้องน้ำ', MANY));
  // สองทิศในการกดเดียว — กระดิ่งเดียว: ประโยคฝั่งจากแบบ + ท่อนทิศกลับ · บรรทัด stays เดิมต่อท้าย "ต้องวัด … เพิ่ม"
  const both = plan({ rows: mixed, changes: [...toDrawing('Z1'), ...toOnsite('Z2', 'Z3')], visit: visit('in_progress') });
  assert.equal(both.visit.action, 'stays');
  assert.deepEqual(both.lines, [L1(1), `${L6()} · ต้องวัด “ห้องประชุม · ห้องน้ำ” เพิ่ม`, L8(2)]);
  assert.deepEqual(both.bells.crew, {
    kind: 'zones',
    title: 'หัวหน้าเปลี่ยน “ล็อบบี้” เป็นประเมินจากแบบ — ไม่ต้องวัดพื้นที่นี้ · “ห้องประชุม · ห้องน้ำ” กลับเป็นลงหน้างาน — ต้องวัดพื้นที่เหล่านี้เพิ่ม',
  });
  // ไม่มีกระดิ่ง = ไม่มีบรรทัด (ไม่สัญญาสิ่งที่ไม่ได้ส่ง): นัดร่าง · ไม่มีนัด · นัดปิดแล้ว · นัดยกเลิก
  for (const status of [null, 'draft', 'done', 'unable', 'cancelled']) {
    const got = plan({ rows: mixed, changes: toOnsite('Z2'), visit: visitOf(status) });
    assert.equal(got.visit.action, 'none', String(status));
    assert.equal(got.bells.crew, null, String(status));
    assert.deepEqual(got.lines, [L8(1)], String(status));
  }
  // กติกาเดียวทุกสถานะ: กระดิ่งเอ่ยทิศกลับ ⇔ กล่องเอ่ยว่าต้องวัดเพิ่ม
  for (const status of VISIT_STATES) {
    const got = plan({ rows: mixed, changes: toOnsite('Z2'), visit: visitOf(status) });
    assert.equal(!!got.bells.crew?.title.includes('กลับเป็นลงหน้างาน'), got.lines.some((line) => line.includes('ต้องวัด “')), String(status));
  }
});

/* (S2b · มติเจ้าของ 26/10 — head-r3-54 กรณีข้างเคียง) นัดที่ค้าง "กำลังทำ" เพราะการกด keep-open รอบก่อน (ทุกพื้นที่เป็นจากแบบขณะช่างทำงานอยู่)
   แล้วหัวหน้าสลับพื้นที่กลับเป็นลงหน้างาน — ใบ **พลิกกลับมาต้องมีนัด** (`to-visit`) ไม่ใช่ใบผสมที่ไม่พลิก ⇒ เดิมได้ `visitAction none`:
   ช่างชุดที่ยืนอยู่หน้างานไม่ได้กระดิ่ง และกล่องของหัวหน้าไม่มีบรรทัดของนัด ทั้งที่ห้องนั้นต้องวัด
   มติ: ทำเหมือน `stays` + ทิศกลับของ head-r3-54 ทุกตัวอักษร (ตัวสร้างประโยคเดิม — ไม่มีคำใหม่) · นัดร่าง / ไม่มีนัด = ไม่มีทั้งคู่ (กติกาเดิม) */
test('head-r3-54 ข้างเคียง (มติ 26/10): นัดค้างจาก keep-open + พื้นที่กลับเป็นลงหน้างาน = กระดิ่งช่าง "ต้องวัดเพิ่ม" + บรรทัดของนัด · นัดร่าง / ไม่มีนัด = ไม่มีทั้งคู่', () => {
  const MANY = 'พื้นที่เหล่านี้';
  /* แถวหลังตัวเขียนลงแผน — เดินตาม `writes` ของแผนก่อนหน้า (ตัวเขียนจริงอ่านแต่ `writes` เหมือนกัน) */
  const apply = (rows, p) => rows.map((r) => {
    if (p.writes.drawingIds.includes(r.id)) return { ...r, method: 'drawing', methodReason: p.reason, methodChangedByName: actor.name };
    if (p.writes.onsiteIds.includes(r.id)) return { ...r, method: 'onsite', methodReason: p.reason, methodChangedByName: actor.name };
    return r;
  });
  const unselect = (...ids) => ids.map((id) => ({ id, updatedAt: `2026-10-08T0${id.slice(-1)}:00:00+00:00`, spots: [] }));

  // รอบก่อน: ทุกพื้นที่เป็นจากแบบขณะช่างกดเริ่มงานแล้ว — นัดไม่ถูกยกเลิก (keep-open) ใบเป็นงานโต๊ะที่ยังมีนัด "กำลังทำ"
  const keepOpen = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('in_progress') });
  assert.equal(keepOpen.visit.action, 'keep-open');
  const desk = apply(caseB(), keepOpen);
  assert.equal(plan({ rows: desk, changes: toOnsite('Z1') }).flip, 'to-visit', 'ฉากนี้คือใบที่พลิกกลับมาต้องมีนัด ไม่ใช่ใบผสม');

  // หนึ่งพื้นที่กลับ — นัดที่ช่างถือ (กำลังทำ · นัดไว้) = กระดิ่งทิศกลับของ head-r3-54 + บรรทัดของนัด · คอลัมน์วันกลับไปตามนัด (sync เดิม)
  for (const status of ['in_progress', 'scheduled']) {
    expectPlan(plan({ rows: desk, changes: toOnsite('Z1'), visit: visit(status) }), {
      kind: 'switch',
      flip: 'to-visit',
      visitAction: 'stays',
      datesAction: 'sync',
      lines: [L6_BACK('ล็อบบี้'), L8(1)],
      thread: T_ONSITE(1, 'ล็อบบี้'),
      bells: { crew: BELL_BACK('ล็อบบี้') },
      writes: { onsiteIds: ['Z1'], unselectSpotRows: unselect('Z1'), dates: VISIT_SYNC },
    }, `หนึ่งพื้นที่ · นัด ${status}`);
  }

  // สองพื้นที่กลับ = "พื้นที่เหล่านี้" · ชื่อครบทั้งกระดิ่งและบรรทัด
  expectPlan(plan({ rows: desk, changes: toOnsite('Z1', 'Z2'), visit: visit('in_progress') }), {
    kind: 'switch',
    flip: 'to-visit',
    visitAction: 'stays',
    datesAction: 'sync',
    lines: [L6_BACK('ล็อบบี้ · ห้องประชุม'), L8(2)],
    thread: T_ONSITE(2, 'ล็อบบี้ · ห้องประชุม'),
    bells: { crew: BELL_BACK('ล็อบบี้ · ห้องประชุม', MANY) },
    writes: { onsiteIds: ['Z1', 'Z2'], unselectSpotRows: unselect('Z1', 'Z2'), dates: VISIT_SYNC },
  }, 'สองพื้นที่');

  /* สองทิศบนนัดเดียวกัน — การกดที่มีทิศเป็นจากแบบพลิกใบกลับมาต้องมีนัดไม่ได้ (แถวที่จะเป็นจากแบบคือลงหน้างานใน "ก่อน" ⇒ ใบต้องมีนัดอยู่แล้ว)
     ⇒ ทางเดียวที่ถึงคือกดถัดจากการกลับรอบแรก (ใบผสม · ไม่พลิก): รูปผสมเดิมของ head-r3-54 — กระดิ่งเดียวเอ่ยสองทิศ · บรรทัด stays ต่อท้าย */
  const back = plan({ rows: desk, changes: toOnsite('Z1'), visit: visit('in_progress') });
  const both = plan({ rows: apply(desk, back), changes: [...toDrawing('Z1'), ...toOnsite('Z2', 'Z3')], visit: visit('in_progress') });
  expectPlan(both, {
    kind: 'switch',
    visitAction: 'stays',
    lines: [L1(1), `${L6()} · ต้องวัด “ห้องประชุม · ห้องน้ำ” เพิ่ม`, L8(2)],
    thread: `${T_DRAWING(1, 'ล็อบบี้')} | ${T_ONSITE(2, 'ห้องประชุม · ห้องน้ำ')}`,
    bells: { crew: { kind: 'zones', title: `${BELL_ZONES('ล็อบบี้').title} · “ห้องประชุม · ห้องน้ำ” กลับเป็นลงหน้างาน — ต้องวัด${MANY}เพิ่ม` } },
    writes: { drawingIds: ['Z1'], onsiteIds: ['Z2', 'Z3'], unselectSpotRows: unselect('Z2', 'Z3') },
  }, 'สองทิศหลังกลับรอบแรก');

  // นัดร่าง = ไม่มีช่างถือ ⇒ ไม่มีกระดิ่ง ไม่มีบรรทัด (sync เดิม) · ไม่มีนัด = ล้างวันกลับไปรอลงคิว (เดิม)
  expectPlan(plan({ rows: desk, changes: toOnsite('Z1'), visit: visit('draft') }), {
    kind: 'switch',
    flip: 'to-visit',
    datesAction: 'sync',
    lines: [L8(1)],
    thread: T_ONSITE(1, 'ล็อบบี้'),
    writes: { onsiteIds: ['Z1'], unselectSpotRows: unselect('Z1'), dates: VISIT_SYNC },
  }, 'นัดร่าง');
  expectPlan(plan({ rows: desk, changes: toOnsite('Z1'), visit: null }), {
    kind: 'switch',
    flip: 'to-visit',
    datesAction: 'clear',
    lines: [L8(1), L9],
    thread: `${T_ONSITE(1, 'ล็อบบี้')} · ใบกลับไปรอลงคิว · ฝ่ายขายแจ้งวันที่หน้างานเข้าได้ในเธรดนี้`,
    writes: {
      onsiteIds: ['Z1'], unselectSpotRows: unselect('Z1'),
      dates: { committedDueDate: null, committedDueTime: null, committedResultDate: null },
    },
  }, 'ไม่มีนัด');

  // กติกาเดียวกับ head-r3-54 ทุกสถานะของนัด: กระดิ่งเอ่ยทิศกลับ ⇔ กล่องเอ่ยว่าต้องวัดเพิ่ม ⇔ นัดที่ช่างถือ · ใบพลิกไม่ยิงกระดิ่งหัวหน้า
  for (const status of VISIT_STATES) {
    const got = plan({ rows: desk, changes: toOnsite('Z1'), visit: visitOf(status) });
    const held = status === 'scheduled' || status === 'in_progress';
    assert.equal(!!got.bells.crew?.title.includes('กลับเป็นลงหน้างาน'), held, String(status));
    assert.equal(got.lines.some((line) => line.includes('ต้องวัด “')), held, String(status));
    assert.equal(got.bells.head, null, String(status));
  }
});

test('head-r3-21: วันในกล่องผลลัพธ์เป็นรูปเดียวกับหัวใบ ("อ. 13 ต.ค.") ทุกบรรทัด · เธรดและเหตุผลบนนัดไม่เปลี่ยนรูป', () => {
  const dmy = /\d{2}\/\d{2}\/\d{4}/;
  const plans = [
    plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visit('scheduled') }),
    plan({ changes: toDrawing('Z3'), visit: visit('scheduled') }),
    plan({ rows: caseA(), changes: toOnsite('Z1'), visit: null }),
    plan({ rows: caseA(), changes: [], reason: SURVEY_METHOD_CANCEL_ONLY_REASON, visit: visit('scheduled') }),
    cutPlan(),
  ];
  for (const p of plans) {
    assert.ok(p.lines.length > 0);
    for (const line of p.lines) assert.doesNotMatch(line, dmy, line);
  }
  assert.ok(plans[0].lines.includes(L3) && plans[0].lines.includes(L2));
  assert.ok(plans[2].lines.includes(L9));
  assert.deepEqual(plans[3].lines, [L_CANCEL_ONLY]);
  // เธรด (ข้อความเก็บถาวร อ่านข้ามปี) คงรูปที่มีปี
  assert.match(plans[0].thread, / · ส่งผล 12\/10\/2026$/);
  assert.match(plans[4].thread, / · ส่งผล 12\/10\/2026$/);
});
