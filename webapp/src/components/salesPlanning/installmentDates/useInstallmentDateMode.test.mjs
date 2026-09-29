// ── โหมดตั้งวันงวด (useInstallmentDateMode) — รันฮุกจริงด้วย react-dom/server ──
//
// ไม่มี DOM ในเทสต์ ⇒ แต่ละก้าวของสคริปต์รัน **ระหว่าง render** ของคอมโพเนนต์ที่เรียกฮุก (render-phase update ของคอมโพเนนต์เดียวกัน
// เป็นสิ่งที่ SSR ของ React รองรับ) · ก้าวว่าง `SETTLE` = ให้ render รอบถัดไปรับ state ที่ฮุกปรับระหว่าง render (รีเซ็ตเมื่อกติกาเปลี่ยน)
// สิ่งที่ชุดนี้ล็อกไว้ (review 28/09):
//   · 🔴 MAJOR กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด (ตั้งในแท็บทะเบียนแล้วกลับมา · ล้างแล้วหน้าโหลดใหม่) — วิธีที่จำไว้ของชนิดเก่า
//     ไม่ถูกวาด · แผงเติมตั้งต้นใหม่ · **ร่างอยู่ครบ** · ตัวแก้ของงวดที่เปิดอยู่ยังเปิดอยู่
//   · ลูกค้ายังไม่ตั้ง: แตะอีกช่องของงวดที่เปิดอยู่ = สลับช่อง · แตะช่องเดิม = ปิด
//   · ⭐ รุ่นสี่ (29/09): ข้อยกเว้นรายงวดสองทางเป็นร่างของโหมด — "งวดนี้ต้องวางบิล…" (ธง exceptionIds → billingException) ·
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
function run(steps, { rule = null, skipReady = false, onSave = async () => true, create = false } = {}) {
  const seen = {};
  function Harness() {
    const [step, setStep] = useState(0);
    const [ruleValue, setRule] = useState(rule);
    const mode = useInstallmentDateMode({
      rows: ROWS, ruleValue, todayIso: '2026-09-28', available: true, lockOf: () => null, onSave, skipReady, create,
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

test('🔴 ยังไม่ระบุ → ตั้ง "เครดิต 30" ระหว่างตัวแก้เปิดช่องวันวางบิล: ชนิดเปลี่ยน · วิธีเก่าถูกข้าม · ร่างอยู่ · วันวางบิลที่ร่างไว้ขาดกำหนดชำระ = "missing"', () => {
  const seen = run([
    ({ mode }) => mode.open('i1', { field: 'bill' }),
    ({ mode, seen: s }) => {
      s.before = { kind: mode.kind, view: mode.view(R1, 'bill', 'bill') };
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' });
    },
    ({ setRule }) => setRule(CREDIT30),
    SETTLE,
    ({ mode, seen: s }) => {
      s.after = {
        kind: mode.kind, fillKind: mode.fillKind, openId: mode.openId,
        /* ตัวแก้ remount ด้วย key ใหม่ — วิธีที่ตัดสินตอนเปิดคิดใหม่ตามชนิดใหม่ ('follow'/'other') · 'bill' ที่จำไว้ต้องไม่ชนะ */
        viewFresh: mode.view(R1, 'other', 'other'),
        viewStale: mode.view(R1, 'bill', 'other'),
        current: mode.current(R1),
        source: dueSourceOf(mode.ruleValue, mode.current(R1)),
      };
    },
  ]);
  assert.deepEqual(seen.before, { kind: 'free', view: 'bill' });
  assert.equal(seen.after.kind, 'cadence');
  assert.equal(seen.after.fillKind, 'cadence');
  assert.equal(seen.after.openId, 'i1', 'ตัวแก้ของงวดที่เปิดอยู่ยังเปิดอยู่ (เปิดใหม่ตามชนิดใหม่ด้วย key)');
  assert.equal(seen.after.viewFresh, 'other');
  assert.equal(seen.after.viewStale, 'other', 'เดิมได้ "bill" ⇒ วาดสาขายังไม่ตั้ง — เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม');
  assert.deepEqual(seen.after.current, { billingDate: '2026-10-05', billingEvent: '', dueDate: '', billingSkip: false }, 'ร่างของผู้ใช้อยู่ครบ');
  assert.deepEqual([seen.after.source.key, seen.after.source.computed], ['missing', '2026-11-04'],
    'ร่างที่ผิดกติกาใหม่ = คำเตือนเดิม + ปุ่ม "ใช้วันตามรอบ" แตะเดียว');
});

test('🔴 ขากลับ: ล้างกติการะหว่างตัวแก้เปิด "วันอื่น" — ไม่ค้างปฏิทินที่ pickBillingDate(null) ล้างกำหนดชำระ · จำช่องกำหนดชำระให้งวดที่เปิดอยู่', () => {
  const seen = run([
    ({ mode }) => { mode.open('i1'); mode.setView(R1, 'other'); },
    ({ mode, seen: s }) => { s.before = mode.view(R1, 'follow', 'follow'); },
    ({ setRule }) => setRule(null),
    SETTLE,
    ({ mode, seen: s }) => { s.after = { kind: mode.kind, openId: mode.openId, view: mode.view(R1, 'other', 'due') }; },
  ], { rule: CREDIT30 });
  assert.equal(seen.before, 'other');
  assert.deepEqual(seen.after, { kind: 'free', openId: 'i1', view: 'due' });
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

test('กติกาเปลี่ยนแต่คิดวันเหมือนเดิม (รุ่นสองเครดิต 0 ↔ รุ่นสี่ชำระวันวางบิล · แก้หมายเหตุ) = ไม่ตั้งต้นใหม่', () => {
  const seen = run([
    ({ mode }) => { mode.open('i1'); mode.setView(R1, 'other'); mode.openFill(); mode.patchFill({ day: 20 }); },
    ({ setRule }) => setRule({ v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null, note: 'แนบสำเนา PO' }),
    SETTLE,
    ({ mode, seen: s }) => { s.view = mode.view(R1, 'follow', 'follow'); s.day = mode.fill?.day; },
  ], { rule: { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 0 } } });
  assert.equal(seen.view, 'other');
  assert.equal(seen.day, 20);
});

test('🔴 ยังไม่ตั้ง: แตะอีกช่องของงวดที่เปิดอยู่ = สลับไปช่องนั้น · แตะช่องเดิม = ปิด · ตั้งแล้ว = แตะช่องไหนก็ปิด', () => {
  const none = run([
    ({ mode }) => mode.enter('i1', { field: 'bill' }),
    ({ mode, seen: s }) => { s.entered = [mode.openId, mode.view(R1, 'bill', 'bill')]; mode.tap('i1', 'due'); },
    ({ mode, seen: s }) => { s.switched = [mode.openId, mode.view(R1, 'bill', 'bill')]; mode.tap('i1', 'bill'); },
    ({ mode, seen: s }) => { s.back = [mode.openId, mode.view(R1, 'due', 'due')]; mode.tap('i1', 'bill'); },
    ({ mode, seen: s }) => { s.closed = mode.openId; mode.tap('i2', 'due'); },
    ({ mode, seen: s }) => { s.other = [mode.openId, mode.view(R2, 'bill', 'bill')]; },
  ]);
  assert.deepEqual(none.entered, ['i1', 'bill']);
  assert.deepEqual(none.switched, ['i1', 'due'], 'เดิมตัวแก้ปิดไปเฉย ๆ');
  assert.deepEqual(none.back, ['i1', 'bill']);
  assert.equal(none.closed, null, 'แตะช่องที่เปิดอยู่ = ปิด');
  assert.deepEqual(none.other, ['i2', 'due'], 'งวดอื่น = เปิดที่ช่องที่แตะ');

  const ruled = run([
    ({ mode }) => mode.open('i1', { field: 'bill' }),
    ({ mode }) => mode.tap('i1', 'due'),
    ({ mode, seen: s }) => { s.openId = mode.openId; },
  ], { rule: CREDIT30 });
  assert.equal(ruled.openId, null, 'ทุกวัน/มีรอบ — ตัวแก้ตัวเดียวแก้ทั้งสองช่อง แตะช่องไหนของงวดนั้นก็ปิด');

  /* ⭐ รอบกรรมการ 29/09: รูปเดิม { credit:false } เปิดทีละช่องเหมือนยังไม่ระบุ (กำหนดชำระนำ) */
  const legacy = run([
    ({ mode }) => mode.open('i1', { field: 'bill' }),
    ({ mode }) => mode.tap('i1', 'due'),
    ({ mode, seen: s }) => { s.state = [mode.openId, mode.view(R1, 'bill', 'bill')]; },
  ], { rule: NO_CREDIT });
  assert.deepEqual(legacy.state, ['i1', 'due']);
});

test('ยังไม่ตั้ง: ไปงวดถัดไปที่ว่างเอง/ปุ่มการ์ด = จำช่องตั้งต้น (รอเหตุการณ์ถ้างวดรออยู่ ไม่งั้นกำหนดชำระ) — เซลล์รู้ว่าตัวแก้อยู่ช่องไหน', () => {
  const seen = run([
    ({ mode }) => mode.open('i1', { field: 'bill' }),
    ({ mode }) => mode.choose(R1, { billingDate: '', billingEvent: '', dueDate: '2026-10-30' }),
    ({ mode, seen: s }) => { s.next = [mode.openId, mode.view(ROWS[1], undefined, undefined)]; mode.tap('i2', 'due'); },
    ({ mode, seen: s }) => { s.afterTap = mode.openId; },
  ]);
  assert.deepEqual(seen.next, ['i2', 'due']);
  assert.equal(seen.afterTap, null, 'ช่องที่จำไว้คือกำหนดชำระ — แตะช่องเดียวกัน = ปิด');
});

test('⭐ รุ่นสี่: "งวดนี้ต้องวางบิล…" (ลูกค้าไม่ต้องวางบิล) — ตัวแก้เปิดปฏิทินวันวางบิลของงวด · บันทึกส่ง billingException · ขอบเขต "ทั้งใบ"', () => {
  const sent = [];
  const seen = run([
    ({ mode, seen: s }) => { s.before = [mode.kind, mode.rowMode(R1).views]; mode.requireBilling('i1', 'one'); },
    ({ mode, seen: s }) => {
      s.opened = [mode.openId, mode.rowMode(R1).kind, mode.view(R1, undefined, 'due'), [...mode.exceptionIds]];
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-10-20' });
    },
    ({ mode }) => mode.save(),
  ], { rule: NONE, onSave: async (rows) => { sent.push(...rows); return true; } });
  assert.deepEqual(seen.before, ['dueOnly', ['due', 'event']]);
  assert.deepEqual(seen.opened, ['i1', 'exception', 'bill', ['i1']]);
  assert.deepEqual(sent, [{ id: 'i1', billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-10-20', billingException: true, updatedAt: 'u1' }]);

  const all = run([
    ({ mode }) => mode.requireBilling('i2', 'so'),
    ({ mode, seen: s }) => { s.ids = [...mode.exceptionIds].sort(); s.openId = mode.openId; },
  ], { rule: NONE });
  assert.deepEqual(all.ids, ['i1', 'i2', 'i3'], 'ทุกงวดที่ยังเปิดของใบ (ทางลัด — ไม่มีธงระดับใบ)');
  assert.equal(all.openId, 'i2');
});

test('⭐ รุ่นสี่: "งวดนี้ไม่ต้องวางบิล" — ติ๊กเป็นร่าง (ตัวแก้ของงวดเป็นกำหนดชำระอย่างเดียว) · ฐานยังไม่รัน 0393 = ไม่มีทางนี้', () => {
  const sent = [];
  const seen = run([
    ({ mode }) => mode.toggleSkip('i1'),
    ({ mode, seen: s }) => {
      s.ticked = [mode.current(R1).billingSkip, mode.rowMode(R1).kind, mode.rowMode(R1).override, mode.openId];
      mode.setValue(R1, { ...mode.current(R1), dueDate: '2026-10-09' });
    },
    ({ mode }) => mode.save(),
  ], { rule: CREDIT30, skipReady: true, onSave: async (rows) => { sent.push(...rows); return true; } });
  assert.deepEqual(seen.ticked, [true, 'dueOnly', 'skip', 'i1']);
  assert.deepEqual(sent, [{ id: 'i1', billingDate: null, billingEvent: null, dueDate: '2026-10-09', billingSkip: true, updatedAt: 'u1' }]);

  const off = run([
    ({ mode }) => mode.toggleSkip('i1'),
    ({ mode, seen: s }) => { s.state = [mode.current(R1).billingSkip, mode.active, mode.skipReady]; },
  ], { rule: CREDIT30, skipReady: false });
  assert.deepEqual(off.state, [false, false, false], 'ติ๊กลงฐานไม่ได้ก่อน 0393 — ไม่มีร่าง ไม่เข้าโหมด');
});

test('🔴 review 29/09: หน้าสร้าง SO — ตอบ "ไม่ต้องวางบิล" หลังร่างวันวางบิลไว้ = ร่างอยู่ครบ (ไม่ล้างเงียบ) · งวดเปิดตัวแก้ที่มีปุ่มล้างวันวางบิล', () => {
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
    ({ mode, seen: s }) => { s.preset = { active: mode.active, fill: mode.fill, openId: mode.openId }; mode.closeFill(); },
    ({ mode }) => mode.openFill(),
    ({ mode, seen: s }) => { s.plain = mode.fill; mode.closeFill(); },
    /* ปุ่มการ์ด/ตัวเรียกที่ส่งอีเวนต์หรือค่าอื่นมา ไม่เปิดสวิตช์เอง — ต้องเป็น true จริงเท่านั้น */
    ({ mode }) => mode.openFill({ includeDated: 'yes' }),
    ({ mode, seen: s }) => { s.junk = mode.fill.includeDated; },
  ]);
  assert.equal(seen.preset.active, true, 'เข้าโหมดตั้งวันงวดด้วย (ทางเข้าเดียวกับปุ่มการ์ด)');
  assert.equal(seen.preset.openId, null);
  const { base, ...panel } = seen.preset.fill;
  assert.deepEqual(panel, { includeDated: true, choice: null, day: null, excluded: [] },
    'สวิตช์เปิดไว้ · ยังไม่มีตัวเลือกไหนถูกเลือก (คนเลือกเองแล้วตรวจในตารางก่อนบันทึก)');
  assert.deepEqual(Object.keys(base), ['i1'], 'ฐานของแผง = ร่าง ณ ตอนเปิด (เหมือน openFill() เดิม)');
  assert.equal(seen.plain.includeDated, false, 'openFill() เดิม = สวิตช์ปิด');
  assert.equal(seen.junk, false);
});
