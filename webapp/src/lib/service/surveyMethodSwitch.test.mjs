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

/* ข้อความที่สเปคกำหนด — พิมพ์ซ้ำในเทสต์โดยตั้งใจ: แก้คำในซอร์สแล้วเทสต์ต้องแดง */
const L1 = (n) => `${n} พื้นที่จะประเมินจากแบบ — ไม่ต้องมีภาพกว้าง จุดติดตั้ง และรูปจุด · ข้อมูลที่กรอกไว้ยังอยู่ครบ`;
const L2 = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว · หัวหน้ารับปากส่งผล 12/10/2026';
const L2_NO_DATE = 'ไม่เหลือพื้นที่ที่ต้องลงหน้างาน — ใบออกจากคิวของผู้วางคิว';
const L3 = 'นัด SV-26100011 วันที่ 13/10/2026 ของ Phuwadol Aoonnankad จะถูกยกเลิก — งานหายจากงานของช่าง และช่างได้รับแจ้ง';
const L4 = 'ช่างกดเริ่มงานของนัด SV-26100011 แล้ว — นัดไม่ถูกยกเลิก · ช่างได้รับแจ้งว่าไม่ต้องวัดพื้นที่นี้ แล้วกด “ส่งงาน” ได้เลย';
// การตัดพื้นที่ไม่มีกระดิ่งช่าง (ไม่มีแถวไหนสลับเป็นจากแบบ) ⇒ บรรทัดเดียวกันโดยไม่มีท่อน "ช่างได้รับแจ้ง…"
const L4_CUT = 'ช่างกดเริ่มงานของนัด SV-26100011 แล้ว — นัดไม่ถูกยกเลิก';
const L5 = (label) => `นัด SV-26100011 (${label}) คงอยู่เป็นประวัติ — ผลของพื้นที่นี้จะระบุว่าประเมินจากแบบ`;
const L6 = 'นัด SV-26100011 วันที่ 13/10/2026 ของ Phuwadol Aoonnankad ยังอยู่ — ยังมีพื้นที่ที่ต้องวัด · ช่างได้รับแจ้งว่าไม่ต้องวัดพื้นที่นี้';
const L8 = (n) => `${n} พื้นที่กลับเป็นลงหน้างาน — ต้องวัดขนาดจริงแล้วบันทึกอีกครั้ง มีภาพกว้าง จุดติดตั้ง และรูปจุดตามปกติ · จุดที่มาร์กจากแบบยังอยู่ แต่ต้องเลือกจุดใหม่หลังเข้าพื้นที่`;
const L9 = 'ใบกลับไปขั้น “รอลงคิว” — วันส่งผลที่รับปากไว้ (15/10/2026) ถูกล้าง · ผู้วางคิวลงวันเข้าพื้นที่และวันส่งผลใหม่';
const L_CANCEL_ONLY = 'นัด SV-26100011 วันที่ 13/10/2026 ของ Phuwadol Aoonnankad จะถูกยกเลิก — ใบนี้ไม่มีพื้นที่ที่ต้องลงหน้างานแล้ว';
const BELL_CANCEL = { kind: 'cancel', title: 'ยกเลิกนัด SV-26100011 — ใบนี้เปลี่ยนเป็นประเมินจากแบบ' };
const BELL_ZONES = (names) => ({ kind: 'zones', title: `หัวหน้าเปลี่ยน “${names}” เป็นประเมินจากแบบ — ไม่ต้องวัดพื้นที่นี้` });
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
  assert.deepEqual(SURVEY_ZONE_TAG, { awaiting: 'ประเมินจากแบบ · รอยืนยันหน้างาน', drawing: 'ประเมินจากแบบ' });
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
    notAcknowledged: 'กด “รับเรื่อง” ก่อน แล้วค่อยเปลี่ยนวิธีประเมิน',
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
      lines: stays ? [L1(1), L6] : [L1(1)],
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
  const table = {
    null: { visitAction: 'none', extra: [], tail: '', bells: {} },
    draft: { visitAction: 'cancel', extra: [L3], tail: ' · ยกเลิกนัด SV-26100011', bells: { crew: BELL_CANCEL }, cancel: 'V1' },
    scheduled: { visitAction: 'cancel', extra: [L3], tail: ' · ยกเลิกนัด SV-26100011', bells: { crew: BELL_CANCEL }, cancel: 'V1' },
    in_progress: { visitAction: 'keep-open', extra: [L4], tail: '', bells: { crew: BELL_ZONES(ALL) } },
    done: { visitAction: 'history', extra: [L5('เข้าแล้ว')], tail: '', bells: {} },
    unable: { visitAction: 'history', extra: [L5('ทำไม่ได้')], tail: '', bells: {} },
    cancelled: { visitAction: 'history', extra: [L5('ยกเลิก')], tail: '', bells: {} },
  };
  for (const status of VISIT_STATES) {
    const row = table[String(status)];
    const got = plan({ changes: toDrawing('Z1', 'Z2', 'Z3'), visit: visitOf(status) });
    expectPlan(got, {
      kind: 'switch',
      flip: 'to-desk',
      visitAction: row.visitAction,
      datesAction: 'set',
      lines: [L1(3), L2, ...row.extra],
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
test('④ ใบจากแบบทั้งใบ พื้นที่แรกกลับเป็นลงหน้างาน: ไม่มีนัดค้าง = ล้างวัน · มีนัดค้าง = เอาวันของนัดกลับขึ้นใบ', () => {
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

  // นัดที่ปิดไปแล้วไม่ใช่นัดค้าง → ล้างเหมือนกัน
  for (const status of ['done', 'unable', 'cancelled']) {
    assert.equal(plan({ ...base, visit: visit(status) }).dates.action, 'clear', status);
  }
  /* ⚠️ จุดค้างของเจ้าของ (เอกสาร §12.6 ข้อ O3) — นัดล่าสุด **ไปถึงหน้างานแล้ว** (เข้าแล้ว / ทำไม่ครบ): แผนยังล้างวันและบอกว่า
     "ใบกลับไปรอลงคิว" ตามสเปค §4.4 แต่หน้าคำร้องอ่านขั้นจากนัดที่ไปถึงแล้ว (ไม่ถอยไปขั้นลงคิว) · ข้อนี้จดพฤติกรรมวันนี้ไว้ —
     เปลี่ยนเมื่อเจ้าของเคาะเท่านั้น (รางและขั้นของหน้าคำร้องอยู่นอกงวด S2a) */
  for (const status of ['done', 'partial']) {
    const reached = plan({ ...base, visit: visit(status) });
    assert.deepEqual(reached.lines, [L8(1), L9], status);
    assert.ok(reached.thread.endsWith(' · ใบกลับไปรอลงคิว · ฝ่ายขายแจ้งวันที่หน้างานเข้าได้ในเธรดนี้'), status);
    assert.deepEqual(reached.writes.dates, { committedDueDate: null, committedDueTime: null, committedResultDate: null }, status);
    assert.equal(reached.visit.action, 'none', status);
  }

  // (ข) นัดกำลังทำ คนละวัน มีเวลา มีช่าง → sync: วัน เวลา ช่าง กลับขึ้นใบ · วันส่งผลไม่ถูกแตะ
  const inProgress = plan({ ...base, visit: visit('in_progress', { scheduledDate: '2026-10-20', startTime: '09:30:00' }) });
  expectPlan(inProgress, {
    kind: 'switch',
    flip: 'to-visit',
    datesAction: 'sync',
    lines: [L8(1)],
    thread: T_ONSITE(1, 'ล็อบบี้'),
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
    lines: [L1(1), L6, L8(1)],
    thread: `${T_DRAWING(1, 'ล็อบบี้')} | ${T_ONSITE(1, 'ห้องประชุม')}`,
    bells: { crew: BELL_ZONES('ล็อบบี้') },
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
    ['ช่างกดเริ่มงานไปก่อน', visit('in_progress'), {
      visitAction: 'keep-open', lines: [L2, L4_CUT], thread: `${T_CUT} · ส่งผล 12/10/2026`, bells: { head: BELL_HEAD },
    }],
    ['นัดปิดไปแล้ว', visit('done'), {
      visitAction: 'history', lines: [L2, L5('เข้าแล้ว')], thread: `${T_CUT} · ส่งผล 12/10/2026`, bells: { head: BELL_HEAD },
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
  // กระดิ่งช่างเอ่ยครบทุกชื่อ (กระดิ่งเดียวต่อการกดหนึ่งครั้ง)
  assert.deepEqual(got.bells.crew, BELL_ZONES(`${ALL} · พื้นที่ไม่มีชื่อ`));
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
test('⑮ 🔴 surveyMethodSwitch.js ดึงได้สี่โมดูลเท่านั้น — ไฟล์นี้จะถูกดึงเข้า bundle ของจอ', () => {
  const src = readFileSync(new URL('./surveyMethodSwitch.js', import.meta.url), 'utf8');
  const from = [...src.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gms)].map((m) => m[1]).sort();
  assert.deepEqual(from, ['@/lib/format', '@/lib/service/survey', '@/lib/service/surveyMethod', '@/lib/service/visitStatus']);
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
