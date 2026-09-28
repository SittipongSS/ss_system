// ── โหมดตั้งวันงวด (useInstallmentDateMode) — รันฮุกจริงด้วย react-dom/server ──
//
// ไม่มี DOM ในเทสต์ ⇒ แต่ละก้าวของสคริปต์รัน **ระหว่าง render** ของคอมโพเนนต์ที่เรียกฮุก (render-phase update ของคอมโพเนนต์เดียวกัน
// เป็นสิ่งที่ SSR ของ React รองรับ) · ก้าวว่าง `SETTLE` = ให้ render รอบถัดไปรับ state ที่ฮุกปรับระหว่าง render (รีเซ็ตเมื่อกติกาเปลี่ยน)
// สิ่งที่ชุดนี้ล็อกไว้ (review 28/09):
//   · 🔴 MAJOR กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด (ตั้งในแท็บทะเบียนแล้วกลับมา · ล้างแล้วหน้าโหลดใหม่) — วิธีที่จำไว้ของชนิดเก่า
//     ไม่ถูกวาด · แผงเติมตั้งต้นใหม่ · **ร่างอยู่ครบ** · ตัวแก้ของงวดที่เปิดอยู่ยังเปิดอยู่
//   · ลูกค้ายังไม่ตั้ง: แตะอีกช่องของงวดที่เปิดอยู่ = สลับช่อง · แตะช่องเดิม = ปิด
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
const SETTLE = () => {};

/* รันสคริปต์ทีละก้าว — ก้าวละหนึ่ง render · คืนสิ่งที่ก้าวต่าง ๆ จดไว้ */
function run(steps, { rule = null } = {}) {
  const seen = {};
  function Harness() {
    const [step, setStep] = useState(0);
    const [ruleValue, setRule] = useState(rule);
    const mode = useInstallmentDateMode({
      rows: ROWS, ruleValue, todayIso: '2026-09-28', available: true, lockOf: () => null, onSave: async () => true,
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

test('🔴 ยังไม่ตั้ง → ตั้ง "ไม่มีเครดิต" ระหว่างตัวแก้เปิดช่องวันวางบิล: ชนิดเปลี่ยน · วิธีเก่าถูกข้าม · ร่างอยู่ · วันวางบิลที่ร่างไว้ขาดกำหนดชำระ = "missing"', () => {
  const seen = run([
    ({ mode }) => mode.open('i1', { field: 'bill' }),
    ({ mode, seen: s }) => {
      s.before = { kind: mode.kind, view: mode.view(R1, 'bill', 'bill') };
      mode.setValue(R1, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' });
    },
    ({ setRule }) => setRule(NO_CREDIT),
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
  assert.deepEqual(seen.before, { kind: 'none', view: 'bill' });
  assert.equal(seen.after.kind, 'anyday');
  assert.equal(seen.after.fillKind, 'credit');
  assert.equal(seen.after.openId, 'i1', 'ตัวแก้ของงวดที่เปิดอยู่ยังเปิดอยู่ (เปิดใหม่ตามชนิดใหม่ด้วย key)');
  assert.equal(seen.after.viewFresh, 'other');
  assert.equal(seen.after.viewStale, 'other', 'เดิมได้ "bill" ⇒ วาดสาขายังไม่ตั้ง — เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม');
  assert.deepEqual(seen.after.current, { billingDate: '2026-10-05', billingEvent: '', dueDate: '' }, 'ร่างของผู้ใช้อยู่ครบ');
  assert.deepEqual(seen.after.source, { key: 'missing', label: '', computed: '2026-10-05' },
    'ร่างที่ผิดกติกาใหม่ = คำเตือนเดิม + ปุ่ม "ใช้วันวางบิล" แตะเดียว');
});

test('🔴 ขากลับ: ล้างกติการะหว่างตัวแก้เปิด "วันอื่น" — ไม่ค้างปฏิทินที่ pickBillingDate(null) ล้างกำหนดชำระ · จำช่องกำหนดชำระให้งวดที่เปิดอยู่', () => {
  const seen = run([
    ({ mode }) => { mode.open('i1'); mode.setView(R1, 'other'); },
    ({ mode, seen: s }) => { s.before = mode.view(R1, 'follow', 'follow'); },
    ({ setRule }) => setRule(null),
    SETTLE,
    ({ mode, seen: s }) => { s.after = { kind: mode.kind, openId: mode.openId, view: mode.view(R1, 'other', 'due') }; },
  ], { rule: NO_CREDIT });
  assert.equal(seen.before, 'other');
  assert.deepEqual(seen.after, { kind: 'none', openId: 'i1', view: 'due' });
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
  assert.deepEqual(seen.before, { fillKind: 'none', day: 15 });
  assert.equal(seen.after.fillKind, 'credit');
  assert.equal(seen.after.fill.day, null, 'วันที่ของกำหนดชำระที่แตะไว้ภายใต้กติกาเก่าไม่ค้าง');
  assert.equal(seen.after.fill.choice, null);
  assert.equal(seen.after.fill.includeDated, false);
  assert.deepEqual(seen.after.fill.excluded, []);
  assert.deepEqual(Object.keys(seen.after.fill.base).sort(), ['i1', 'i2'], 'ฐานใหม่ = ร่างตอนนี้ (รวมงวดที่แก้เองระหว่างแผงเปิด)');
  assert.deepEqual(seen.after.drafts, ['i1', 'i2']);
});

test('กติกาเปลี่ยนแต่คิดวันเหมือนเดิม (ไม่มีเครดิต ↔ เครดิต 0 · แก้หมายเหตุ) = ไม่ตั้งต้นใหม่', () => {
  const seen = run([
    ({ mode }) => { mode.open('i1'); mode.setView(R1, 'other'); mode.openFill(); mode.patchFill({ day: 20 }); },
    ({ setRule }) => setRule({ credit: false, note: 'แนบสำเนา PO' }),
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
  ], { rule: NO_CREDIT });
  assert.equal(ruled.openId, null, 'ตั้งแล้ว — ตัวแก้ตัวเดียวแก้ทั้งสองช่อง แตะช่องไหนของงวดนั้นก็ปิด');
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
