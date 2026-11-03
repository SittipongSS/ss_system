// ── วันงวดในตาราง (useInstallmentDateMode) — รันฮุกจริงด้วย react-dom/server ──
//
// ไม่มี DOM ในเทสต์ ⇒ แต่ละก้าวของสคริปต์รัน **ระหว่าง render** ของคอมโพเนนต์ที่เรียกฮุก (render-phase update ของคอมโพเนนต์เดียวกัน
// เป็นสิ่งที่ SSR ของ React รองรับ) · ก้าวว่าง `SETTLE` = ให้ render รอบถัดไปรับ state ที่ฮุกปรับระหว่าง render (รีเซ็ตเมื่อกติกาเปลี่ยน)
// สิ่งที่ชุดนี้ล็อกไว้:
//   · 🔴 MAJOR (review 28/09) กติกาของลูกค้าเปลี่ยนระหว่างมีร่าง (ตั้งในแท็บทะเบียนแล้วกลับมา · ล้างแล้วหน้าโหลดใหม่) —
//     ชนิดของช่องเดินตามกติกาใหม่ · แผงเติมตั้งต้นใหม่ · **ร่างอยู่ครบ**
//   · ⭐ รุ่นสองช่องแยก (มติ 02/11): ไม่มีโหมด/ตัวแก้รายงวด/ไปงวดถัดไปเอง — แก้ช่อง = ร่าง · แถบขึ้นเมื่อมีร่าง (`active`) ·
//     แก้วันวางบิลไม่แตะกำหนดชำระ (แบบ ข — ตัวช่องส่งค่าทั้งก้อนเอง ฮุกไม่คิดอะไรเพิ่ม) · ร่างช่วงครอบค้าง (`blocker`) = แก้ไม่ได้
//   · ⭐ รุ่นสี่ (29/09): ข้อยกเว้นรายงวดสองทางเป็นร่าง — "งวดนี้ต้องวางบิล…" (ธง exceptionIds → billingException) ·
//     "งวดนี้ไม่ต้องวางบิล" (ร่าง billingSkip · เฉพาะ skipReady)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import useInstallmentDateMode from './useInstallmentDateMode.js';
import { dueSourceOf } from '../../../lib/sales/installmentDateDrafts.js';

const ROWS = [1, 2, 3].map((seq) => ({
  id: `i${seq}`, seq, status: 'pending', kind: 'regular', amount: 1000, updatedAt: `u${seq}`, label: `งวดที่ ${seq}`,
}));
const [R1, R2] = ROWS;
const NO_CREDIT = { credit: false };
const CREDIT30 = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
const NONE = { v: 4, need: 'none' };
const SETTLE = () => {};

/* รันสคริปต์ทีละก้าว — ก้าวละหนึ่ง render · คืนสิ่งที่ก้าวต่าง ๆ จดไว้ */
function run(steps, { rule = null, skipReady = false, onSave = async () => true, create = false, blocker = '' } = {}) {
  const seen = {};
  function Harness() {
    const [step, setStep] = useState(0);
    const [ruleValue, setRule] = useState(rule);
    const mode = useInstallmentDateMode({
      rows: ROWS, ruleValue, todayIso: '2026-09-28', available: true, lockOf: () => null, onSave, skipReady, create, blocker,
    });
    if (step < steps.length) {
      steps[step]({ mode, setRule, seen });
      setStep(step + 1);
    }
    return null;
  }
  renderToString(createElement(Harness));
  return seen;
}

test('🔴 ยังไม่ระบุ → ตั้ง "เครดิต 30" ระหว่างมีร่างวันวางบิล: ชนิดเปลี่ยน · ร่างอยู่ · วันวางบิลที่ร่างไว้ขาดกำหนดชำระ = "missing"', () => {
  const seen = run([
    ({ mode, seen: s }) => {
      s.before = { kind: mode.kind, row: mode.rowMode(R1).kind };
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' });
    },
    ({ setRule }) => setRule(CREDIT30),
    SETTLE,
    ({ mode, seen: s }) => {
      s.after = {
        kind: mode.kind, fillKind: mode.fillKind, row: mode.rowMode(R1).kind, active: mode.active,
        current: mode.current(R1),
        source: dueSourceOf(mode.ruleValue, mode.current(R1)),
      };
    },
  ]);
  assert.deepEqual(seen.before, { kind: 'free', row: 'free' });
  assert.equal(seen.after.kind, 'cadence');
  assert.equal(seen.after.fillKind, 'cadence');
  assert.equal(seen.after.row, 'cadence', 'ช่องของงวดเดินตามกติกาใหม่ทันที (ไม่มีวิธีที่จำไว้ให้ค้าง)');
  assert.equal(seen.after.active, true, 'มีร่าง = แถบบันทึกขึ้น');
  assert.deepEqual(seen.after.current, { billingDate: '2026-10-05', billingEvent: '', dueDate: '', billingSkip: false }, 'ร่างของผู้ใช้อยู่ครบ');
  assert.deepEqual([seen.after.source.key, seen.after.source.computed], ['missing', '2026-11-04'],
    'ร่างที่ผิดกติกาใหม่ = ชิป "ตามเครดิต: ใช้ …" ใต้ช่องกำหนดชำระ แตะเดียว');
});

test('🔴 ขากลับ: ล้างกติการะหว่างมีร่าง — ชนิดกลับเป็นยังไม่ระบุ · ร่างกำหนดชำระไม่ถูกล้าง', () => {
  const seen = run([
    ({ mode }) => mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-11-04' }),
    ({ setRule }) => setRule(null),
    SETTLE,
    ({ mode, seen: s }) => { s.after = { kind: mode.kind, current: mode.current(R1) }; },
  ], { rule: CREDIT30 });
  assert.deepEqual(seen.after, { kind: 'free', current: { billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-11-04', billingSkip: false } });
});

test('🔴 แผงเติมเปิดอยู่ตอนกติกาเปลี่ยน = ตั้งต้นใหม่เหมือนเพิ่งเปิด (ฐาน = ร่างตอนนี้) · ร่างที่ลงไปแล้วอยู่ต่อ', () => {
  const seen = run([
    ({ mode }) => mode.setValue(R2, { billingDate: '', billingEvent: '', dueDate: '2026-11-15' }),
    ({ mode }) => { mode.openFill(); mode.patchFill({ day: 15 }); },
    ({ mode, seen: s }) => { s.before = { fillKind: mode.fillKind, day: mode.fill?.day }; },
    ({ mode }) => mode.setValue(R1, { billingDate: '', billingEvent: '', dueDate: '2026-10-15' }),
    ({ setRule }) => setRule({ billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } }),
    SETTLE,
    ({ mode, seen: s }) => { s.after = { fillKind: mode.fillKind, fill: mode.fill, drafts: Object.keys(mode.drafts).sort() }; },
  ]);
  assert.deepEqual(seen.before, { fillKind: 'cadence', day: 15 });
  assert.equal(seen.after.fillKind, 'cadence');
  assert.equal(seen.after.fill.day, null, 'วันที่ของกำหนดชำระที่แตะไว้ภายใต้กติกาเก่าไม่ค้าง');
  assert.equal(seen.after.fill.choice, null);
  assert.equal(seen.after.fill.includeDated, false);
  assert.deepEqual(seen.after.fill.excluded, []);
  assert.deepEqual(Object.keys(seen.after.fill.base).sort(), ['i1', 'i2'], 'ฐานใหม่ = ร่างตอนนี้ (รวมงวดที่แก้เองระหว่างแผงเปิด)');
  assert.deepEqual(seen.after.drafts, ['i1', 'i2']);
});

test('กติกาเปลี่ยนแต่คิดวันเหมือนเดิม (รุ่นสองเครดิต 0 ↔ รุ่นสี่ชำระวันวางบิล · แก้หมายเหตุ) = แผงเติมไม่ตั้งต้นใหม่', () => {
  const seen = run([
    ({ mode }) => { mode.openFill(); mode.patchFill({ day: 20 }); },
    ({ setRule }) => setRule({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null, note: 'แนบสำเนา PO' }),
    SETTLE,
    ({ mode, seen: s }) => { s.day = mode.fill?.day; },
  ], { rule: { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } } });
  assert.equal(seen.day, 20);
});

test('⭐ มติ 02/11: ไม่มีโหมด — ยังไม่แก้ = ไม่มีแถบ · แก้ช่อง = ร่าง + แถบขึ้น · ร่างเท่าค่าเดิม = หายเอง · ไม่มีทางไปงวดถัดไปเอง', () => {
  const seen = run([
    ({ mode, seen: s }) => {
      s.idle = { active: mode.active, dirty: mode.dirty, canEdit: mode.canEdit(R1) };
      s.api = ['enter', 'open', 'close', 'tap', 'choose', 'view', 'setView', 'openId', 'placement'].filter((key) => key in mode);
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' });
    },
    ({ mode, seen: s }) => {
      s.edited = { active: mode.active, dirty: mode.dirty, changed: [...mode.changedIds] };
      mode.setValue(R1, { billingDate: '', billingEvent: '', dueDate: '' });
    },
    ({ mode, seen: s }) => { s.back = { active: mode.active, dirty: mode.dirty }; },
  ]);
  assert.deepEqual(seen.idle, { active: false, dirty: false, canEdit: true });
  assert.deepEqual(seen.api, [], 'ทางเข้า/ตัวแก้รายงวด/ไปงวดถัดไปเอง ถูกถอดหมด');
  assert.deepEqual(seen.edited, { active: true, dirty: true, changed: ['i1'] });
  assert.deepEqual(seen.back, { active: false, dirty: false });
});

test('ร่างช่วงครอบค้าง (`blocker`) = ช่องวันแก้ไม่ได้ · setValue ไม่ลงร่าง', () => {
  const seen = run([
    ({ mode, seen: s }) => { s.canEdit = mode.canEdit(R1); mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' }); },
    ({ mode, seen: s }) => { s.dirty = mode.dirty; },
  ], { blocker: 'แก้ช่วงครอบบริการค้างไว้ 1 งวด' });
  assert.deepEqual(seen, { canEdit: false, dirty: false });
});

test('⭐ รุ่นสี่: "งวดนี้ต้องวางบิล…" (ลูกค้าไม่ต้องวางบิล) — ช่องวันวางบิลของงวดโผล่ (exception) · บันทึกส่ง billingException · ขอบเขต "ทั้งใบ"', () => {
  const sent = [];
  const seen = run([
    ({ mode, seen: s }) => { s.before = [mode.kind, mode.rowMode(R1).views]; mode.requireBilling('i1', 'one'); },
    ({ mode, seen: s }) => {
      s.opened = [mode.rowMode(R1).kind, mode.rowMode(R1).views.includes('bill'), [...mode.exceptionIds]];
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-10-20' });
    },
    ({ mode }) => mode.save(),
  ], { rule: NONE, onSave: async (rows) => { sent.push(...rows); return true; } });
  assert.deepEqual(seen.before, ['dueOnly', ['due', 'event']]);
  assert.deepEqual(seen.opened, ['exception', true, ['i1']]);
  assert.deepEqual(sent, [{ id: 'i1', billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-10-20', billingException: true, updatedAt: 'u1' }]);

  const all = run([
    ({ mode }) => mode.requireBilling('i2', 'so'),
    ({ mode, seen: s }) => { s.ids = [...mode.exceptionIds].sort(); },
  ], { rule: NONE });
  assert.deepEqual(all.ids, ['i1', 'i2', 'i3'], 'ทุกงวดที่ยังเปิดของใบ (ทางลัด — ไม่มีธงระดับใบ)');
});

test('⭐ รุ่นสี่: "งวดนี้ไม่ต้องวางบิล" — ติ๊กเป็นร่าง (ช่องของงวดเหลือกำหนดชำระอย่างเดียว) · ฐานยังไม่รัน 0393 = ไม่มีทางนี้', () => {
  const sent = [];
  const seen = run([
    ({ mode }) => mode.toggleSkip('i1'),
    ({ mode, seen: s }) => {
      s.ticked = [mode.current(R1).billingSkip, mode.rowMode(R1).kind, mode.rowMode(R1).override, mode.active];
      mode.setValue(R1, { ...mode.current(R1), dueDate: '2026-10-09' });
    },
    ({ mode }) => mode.save(),
  ], { rule: CREDIT30, skipReady: true, onSave: async (rows) => { sent.push(...rows); return true; } });
  assert.deepEqual(seen.ticked, [true, 'dueOnly', 'skip', true]);
  assert.deepEqual(sent, [{ id: 'i1', billingDate: null, billingEvent: null, dueDate: '2026-10-09', billingSkip: true, updatedAt: 'u1' }]);

  const off = run([
    ({ mode }) => mode.toggleSkip('i1'),
    ({ mode, seen: s }) => { s.state = [mode.current(R1).billingSkip, mode.active, mode.skipReady]; },
  ], { rule: CREDIT30, skipReady: false });
  assert.deepEqual(off.state, [false, false, false], 'ติ๊กลงฐานไม่ได้ก่อน 0393 — ไม่มีร่าง ไม่มีแถบ');
});

test('🔴 review 29/09: หน้าสร้าง SO — ตอบ "ไม่ต้องวางบิล" หลังร่างวันวางบิลไว้ = ร่างอยู่ครบ (ไม่ล้างเงียบ) · ช่องวันวางบิลของงวดยังอยู่ให้ล้างเอง', () => {
  const seen = run([
    ({ mode }) => mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-10-20' }),
    ({ setRule }) => setRule(NONE),
    SETTLE,
    ({ mode, seen: s }) => {
      const rm = mode.rowMode(R1);
      s.after = [mode.kind, mode.current(R1).billingDate, rm.kind, rm.views.includes('bill')];
    },
  ], { create: true });
  /* ด่านสร้าง (createFormDateCheck) บอกทาง "ล้างวันวางบิล" — เทสต์ใน salesOrderCreateInstallments */
  assert.deepEqual(seen.after, ['dueOnly', '2026-10-05', 'exception', true]);
});

test('แผงเติมเปิดพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย" ได้ (`openFill({ includeDated: true })` — "ไปแก้" ของแผงแดงงานบริการ) · ค่าตั้งต้นไม่เปลี่ยน', () => {
  const seen = run([
    ({ mode }) => mode.setValue(R1, { billingDate: '', billingEvent: '', dueDate: '2026-10-25' }),
    ({ mode }) => mode.openFill({ includeDated: true }),
    ({ mode, seen: s }) => { s.preset = { active: mode.active, fill: mode.fill }; mode.closeFill(); },
    ({ mode }) => mode.openFill(),
    ({ mode, seen: s }) => { s.plain = mode.fill; mode.closeFill(); },
    /* ปุ่มการ์ด/ตัวเรียกที่ส่งอีเวนต์หรือค่าอื่นมา ไม่เปิดสวิตช์เอง — ต้องเป็น true จริงเท่านั้น */
    ({ mode }) => mode.openFill({ includeDated: 'yes' }),
    ({ mode, seen: s }) => { s.junk = mode.fill.includeDated; },
  ]);
  assert.equal(seen.preset.active, true, 'แผงเติมเปิด = แถบบันทึกขึ้น (ทางเข้าเดียวกับปุ่มการ์ด)');
  const { base, ...panel } = seen.preset.fill;
  assert.deepEqual(panel, { includeDated: true, choice: null, day: null, excluded: [] },
    'สวิตช์เปิดไว้ · ยังไม่มีตัวเลือกไหนถูกเลือก (คนเลือกเองแล้วตรวจในตารางก่อนบันทึก)');
  assert.deepEqual(Object.keys(base), ['i1'], 'ฐานของแผง = ร่าง ณ ตอนเปิด (เหมือน openFill() เดิม)');
  assert.equal(seen.plain.includeDated, false, 'openFill() เดิม = สวิตช์ปิด');
  assert.equal(seen.junk, false);
});
