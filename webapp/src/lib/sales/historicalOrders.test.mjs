// ── ตัวตัดสินกลางของใบสั่งขายย้อนหลัง (mig 0360 → 0374) ──────────────────────────────
// ⭐ ตัวเลข/สูตรฝั่ง JS ต้องตรงกับ SQL ของ 0360/0374 — อ่านไฟล์ migration เทียบตรง ๆ (ตัวหนึ่งขยับ อีกตัวต้องขยับตาม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_CORRECTION_PATH, HISTORICAL_DEAL_TITLE,
  HISTORICAL_EDITABLE_STATUSES, HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE, HISTORICAL_KEYER_ROLES, HISTORICAL_NEW_PATH,
  HISTORICAL_REF_MAX, HISTORICAL_SCHEMA_MISSING_MESSAGE, HISTORICAL_UNAPPROVED_STATUSES, INSTALLATION_POINT_MAX,
  INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_KIND, OPENING_INSTALLMENT_LABEL, ORIGIN_HISTORICAL,
  ORIGIN_PIPELINE,
  HISTORICAL_CANCEL_NOTE_MIN, HISTORICAL_CANCEL_SETTLE_STUCK,
  canKeyHistoricalSalesOrder, canMoveHistoricalDealOwner, charLength, historicalCancelBlock, historicalCancelNoteError,
  historicalCancelOpening, historicalCancelSettleBlock, historicalOpeningSettled, historicalDealPatchError, historicalDeleteBlock, historicalEditPath, historicalInstallmentLock,
  historicalOrderEditable, historicalOrderIdOf, historicalOwnerTakenMessage, historicalRefsOf, historicalRowsOnly,
  historicalSchemaMissing, isHistoricalDeal, isHistoricalOrder, isKpiDeal, isOpeningInstallment, pipelineRowsOnly,
} from './historicalOrders.js';
import { customerSnapshotName } from '../master/customerName.js';

const SQL = readFileSync(
  new URL('../../../supabase/migrations/0360_sales_order_historical_origin.sql', import.meta.url), 'utf8',
).replace(/--[^\n]*/g, '');
/* 0374 (มติ 22/09) — ผู้คีย์ · สถานะ · งวดยกมา · ตัวตรวจงวด */
const SQL_0374 = readFileSync(
  new URL('../../../supabase/migrations/0374_historical_so_approval_flow.sql', import.meta.url), 'utf8',
).replace(/--[^\n]*/g, '');
/* นิยามฟังก์ชันใน 0374 — ตัดถึงปลาย $$ ของตัวมันเอง */
function fn0374(name) {
  const from = SQL_0374.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(from >= 0, `0374 ไม่มีนิยาม ${name}`);
  return SQL_0374.slice(from, SQL_0374.indexOf('\n$$;', from));
}

test('origin: เฉพาะ "historical" เท่านั้นที่เป็นใบ/ดีลย้อนหลัง — legacy/ว่าง/pipeline ไม่ใช่', () => {
  assert.equal(ORIGIN_PIPELINE, 'pipeline');
  assert.equal(ORIGIN_HISTORICAL, 'historical');
  for (const origin of ['legacy', undefined, null, 'pipeline', 'HISTORICAL', '']) {
    assert.equal(isHistoricalOrder({ origin }), false, String(origin));
    assert.equal(isHistoricalDeal({ origin }), false, String(origin));
    assert.equal(isKpiDeal({ origin }), true, String(origin));
  }
  assert.equal(isHistoricalOrder(null), false);
  assert.equal(isHistoricalOrder({ origin: 'historical' }), true);
  assert.equal(isHistoricalDeal({ origin: 'historical' }), true);
  assert.equal(isKpiDeal({ origin: 'historical' }), false);
});

test('ตัวกรอง query ต่อ .eq("origin", …) ตัวเดียว', () => {
  const seen = [];
  const q = { eq: (col, val) => { seen.push([col, val]); return q; } };
  assert.equal(pipelineRowsOnly(q), q);
  assert.equal(historicalRowsOnly(q), q);
  assert.deepEqual(seen, [['origin', 'pipeline'], ['origin', 'historical']]);
});

test('HISTORICAL_KEYER_ROLES = ฝ่ายขายทุกตำแหน่ง + Admin (มติ 22/09 · ผังตำแหน่ง 2026-09-24)', () => {
  assert.deepEqual([...HISTORICAL_KEYER_ROLES], [
    'commercial_director', 'commercial_manager', 'ae_supervisor', 'ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac', 'admin',
  ]);
  assert.ok(Object.isFrozen(HISTORICAL_KEYER_ROLES), 'ชุด role ต้องแก้ทับตอนรันไม่ได้');
  for (const role of HISTORICAL_KEYER_ROLES) assert.equal(canKeyHistoricalSalesOrder({ role }), true, role);
  for (const role of ['finance', 'ts', 'ts_manager', 'rd', 'executive', 'viewer', 'marketing', 'AE', '', undefined]) {
    assert.equal(canKeyHistoricalSalesOrder({ role }), false, String(role));
  }
  assert.equal(canKeyHistoricalSalesOrder(null), false);
  /* ฝั่งฐาน: RPC สร้าง/แก้/ส่งของ 0374 เรียก `public.is_sales_keyer_role()` หลัง 0382 ปะ — ชุดในฟังก์ชันกลาง
     เทียบกับค่าคงที่นี้ที่ salesRoleSqlParity.test.mjs (เพิ่ม/ถอดตำแหน่งต้องแก้สองฝั่งพร้อมกัน) */
  for (const name of ['create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order']) {
    assert.ok(fn0374(name).includes("NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin')"),
      `${name}: ข้อความของ 0374 ต้องคงเดิม — 0382 ปะด้วยการเทียบตัวอักษร`);
  }
});

test('ย้ายเจ้าของดีลภาชนะ = ผู้มีอำนาจตัดสิน (CD · CM · AE Sup) / Admin เท่านั้น — แคบกว่าผู้คีย์โดยเจตนา', () => {
  for (const role of ['commercial_director', 'commercial_manager', 'ae_supervisor', 'admin']) assert.equal(canMoveHistoricalDealOwner({ role }), true, role);
  // AC Supervisor เห็นทุกทีมแต่ไม่ตัดสิน (ผังตำแหน่ง 2026-09-24 มติข้อ 1)
  for (const role of ['ac_supervisor', 'senior_ac', 'ae', 'ac', 'senior_ae', 'finance', 'ts', undefined]) {
    assert.equal(canMoveHistoricalDealOwner({ role }), false, String(role));
  }
  assert.equal(canMoveHistoricalDealOwner(null), false);
});

test('สถานะของใบย้อนหลัง: แก้ในฟอร์มได้ = ร่าง/ตีกลับ · ยังไม่อนุมัติ = ร่าง/รออนุมัติ/ตีกลับ (= ด่านของ RPC 0374)', () => {
  assert.deepEqual([...HISTORICAL_EDITABLE_STATUSES], ['draft', 'rejected']);
  assert.deepEqual([...HISTORICAL_UNAPPROVED_STATUSES], ['draft', 'pending_approval', 'rejected']);
  for (const status of ['draft', 'rejected']) {
    assert.equal(historicalOrderEditable({ origin: 'historical', status }), true, status);
  }
  for (const status of ['pending_approval', 'approved', 'cancelled', undefined]) {
    assert.equal(historicalOrderEditable({ origin: 'historical', status }), false, String(status));
  }
  assert.equal(historicalOrderEditable({ origin: 'pipeline', status: 'draft' }), false, 'ใบ pipeline ไม่ใช่ฟอร์มนี้');
  assert.equal(historicalOrderEditable(null), false);
  // RPC แก้ใบ + ตัวเขียนบรรทัด/งวด ยอมเฉพาะชุดเดียวกัน
  const editable = `status NOT IN (${HISTORICAL_EDITABLE_STATUSES.map((s) => `'${s}'`).join(', ')})`;
  assert.ok(fn0374('update_historical_sales_order').includes(editable));
  assert.ok(fn0374('historical_so_write_children').includes(editable));
});

test('งวดยกมา: kind "opening" ตัวเดียวกับ CHECK/ตัวเขียนของ 0374 · ป้าย "งวดยกมา"', () => {
  assert.equal(OPENING_INSTALLMENT_KIND, 'opening');
  assert.equal(OPENING_INSTALLMENT_LABEL, 'งวดยกมา');
  assert.equal(isOpeningInstallment({ kind: 'opening' }), true);
  for (const row of [{ kind: 'regular' }, { kind: 'OPENING' }, {}, null, undefined]) {
    assert.equal(isOpeningInstallment(row), false, JSON.stringify(row));
  }
  assert.ok(SQL_0374.includes(`kind IN ('regular', '${OPENING_INSTALLMENT_KIND}')`), 'CHECK ชนิดงวด');
  assert.ok(fn0374('historical_so_write_children').includes(`THEN '${OPENING_INSTALLMENT_LABEL}'`), 'ตัวเขียนตั้งป้ายเดียวกัน');
  // หมายเหตุงวด ≤ 1000 ทั้งงวดยกมาและงวดปกติ (CHECK ของ 0245)
  const check = fn0374('historical_so_check_installments');
  assert.equal(check.split(`length(btrim(COALESCE(v_item->>'note', ''))) > ${INSTALLMENT_NOTE_MAX}`).length - 1, 2);
});

test('ล็อกงวดของใบย้อนหลัง: ขยับได้เฉพาะใบที่อนุมัติแล้ว · ทุกสถานะอื่นมีเหตุบอก · ใบ pipeline ไม่ผ่านตัวนี้', () => {
  const lock = (status) => historicalInstallmentLock({ origin: 'historical', status });
  assert.equal(lock('approved'), null);
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    assert.match(lock(status), /ขยับได้หลังผู้จัดการฝ่ายขายอนุมัติ/, status);
  }
  assert.match(lock('cancelled'), /ยกเลิกแล้ว/);
  // สถานะที่ CHECK ห้ามอยู่แล้ว (หรือข้อมูลเพี้ยน) ต้องไม่ถูกปล่อยผ่าน
  for (const status of ['revised', 'approval_revoked', undefined, '']) {
    assert.ok(lock(status), `ต้องล็อก: ${String(status)}`);
  }
  for (const status of ['draft', 'pending_approval', 'approved', 'cancelled']) {
    assert.equal(historicalInstallmentLock({ origin: 'pipeline', status }), null, status);
  }
  assert.equal(historicalInstallmentLock(null), null);
});

/* ⭐ มติเจ้าของ 24/09 ("ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" · mig 0387): ผู้จัดการฝ่ายขายยกเลิกใบย้อนหลังที่อนุมัติแล้วได้
   แม้งวดยกมารอบัญชีรับรอง/รับรองแล้ว — งวดยกมาเป็นโมฆะตามใบ (ฐานตีกลับงวดที่รอตรวจให้ในทรานแซกชันเดียวกัน)
   ⛔ งวดปกติที่รับเงินในระบบแล้ว (confirmed) หรือรอบัญชีตรวจ (reported) ยังบล็อก — บัญชีตีกลับก่อน (ที่รับรองแล้ว: ถอนคำรับรองแล้วตีกลับ)
   ⚠️ **เทสต์นี้พิสูจน์แค่ตัวฟังก์ชัน** — "ปุ่มยกเลิกกับ API ถามตัวเดียวกัน" มียามของมันเองที่ `historicalDetailUi.test.mjs` §6A
      และ trigger ของฐาน (historical_so_cancel_money_held) มียามที่ historicalCancelSettleMigration.test.mjs + PGlite */
test('ด่านยกเลิกใบย้อนหลัง (มติ 24/09): งวดยกมาไม่บล็อกแล้ว · งวดปกติที่มีเงิน/รอตรวจยังบล็อก · บอกขั้นของบัญชีครบ (ถอนคำรับรองแล้วตีกลับ)', () => {
  const order = { origin: 'historical', status: 'approved' };
  const opening = { id: 'SOI-1', kind: 'opening', status: 'reported' };
  const regular = { id: 'SOI-2', kind: 'regular', status: 'reported' };
  // งวดยกมาทุกสถานะ = ไม่ใช่ด่านอีกแล้ว (โมฆะตามใบ)
  for (const status of ['pending', 'reported', 'confirmed', 'rejected', undefined]) {
    assert.equal(historicalCancelBlock(order, [{ ...opening, status }]), null, `opening ${String(status)}`);
  }
  assert.equal(historicalCancelBlock(order, [regular]),
    'มีงวดที่รับเงินในระบบหลังอนุมัติ (รอบัญชีตรวจ 1 งวด) — ให้บัญชีตีกลับก่อน แล้วค่อยยกเลิกใบ');
  /* 🐞 review 25/09: คำเดิม "ให้บัญชีถอนคำรับรองก่อน แล้วค่อยยกเลิกใบ" ขาดขั้นที่สอง — ถอนคำรับรองพาแถวกลับไป "รอตรวจ"
     (installments route · unconfirm → reported) ซึ่งยังบล็อก ⇒ ผู้จัดการติดด่านรอบสองแล้วต้องวนกลับไปหาบัญชีอีกรอบ
     ⇒ งวดที่รับรองแล้วต้องบอกครบสองขั้น "ถอนคำรับรองแล้วตีกลับ" (ตีกลับรับเฉพาะแถวที่รอตรวจ · salesOrderPayments reject) */
  assert.equal(historicalCancelBlock(order, [{ ...regular, status: 'confirmed' }]),
    'มีงวดที่รับเงินในระบบหลังอนุมัติ (บัญชีรับรองแล้ว 1 งวด) — ให้บัญชีถอนคำรับรองแล้วตีกลับก่อน แล้วค่อยยกเลิกใบ');
  assert.equal(
    historicalCancelBlock(order, [{ ...opening, status: 'confirmed' }, { ...regular, status: 'confirmed' }, regular,
      { ...regular, id: 'SOI-3' }]),
    'มีงวดที่รับเงินในระบบหลังอนุมัติ (บัญชีรับรองแล้ว 1 งวด · รอบัญชีตรวจ 2 งวด)'
      + ' — ให้บัญชีถอนคำรับรองแล้วตีกลับงวดที่รับรองแล้ว และตีกลับงวดที่รอตรวจก่อน แล้วค่อยยกเลิกใบ',
  );
  // ทุกกรณีที่มีงวดรับรองแล้ว ต้องมีทั้งสองขั้น — ไม่มีคำไหนบอกแค่ "ถอนคำรับรอง" แล้วจบ
  for (const rows of [[{ ...regular, status: 'confirmed' }], [{ ...regular, status: 'confirmed' }, regular]]) {
    assert.match(historicalCancelBlock(order, rows), /ถอนคำรับรองแล้วตีกลับ/);
  }
  // แถวเก่าที่ไม่มี kind (ก่อน 0374) = งวดปกติ — ไม่ใช่ช่องหลบด่าน
  assert.match(historicalCancelBlock(order, [{ id: 'x', status: 'confirmed' }]), /บัญชีรับรองแล้ว 1 งวด/);
  for (const status of ['pending', 'rejected', undefined]) {
    assert.equal(historicalCancelBlock(order, [{ ...regular, status }]), null, `regular ${String(status)}`);
  }
  assert.equal(historicalCancelBlock(order, []), null);
  assert.equal(historicalCancelBlock(order, null), null);
  assert.equal(historicalCancelBlock(order), null);
  // ใบ pipeline: เงินรับแล้วค้างอยู่กับใบ (PR3) ⇒ ไม่ผ่านตัวนี้
  assert.equal(historicalCancelBlock({ origin: 'pipeline', status: 'approved' }, [regular]), null);
  assert.equal(historicalCancelBlock(null, [regular]), null);
});

/* งวดยกมาที่จะเป็นโมฆะเมื่อยกเลิก — route ใช้ตัดสินหมายเหตุบังคับ + สรุป audit · จอใช้บอกผลก่อนกด (ตัวเดียวกัน) */
test('งวดยกมาที่จะเป็นโมฆะเมื่อยกเลิก: รับรองแล้ว/รอรับรองเท่านั้น · ใบ pipeline/ไม่มีงวดยกมา = null', () => {
  const order = { origin: 'historical', status: 'approved' };
  const confirmed = { id: 'SOI-1', kind: 'opening', status: 'confirmed', amount: 196452, confirmedByName: 'บัญชี ก', confirmedAt: '2026-09-23T03:00:00Z' };
  assert.deepEqual(historicalCancelOpening(order, [{ id: 'r', kind: 'regular', status: 'pending' }, confirmed]),
    { row: confirmed, status: 'confirmed', amount: 196452 });
  assert.equal(historicalCancelOpening(order, [{ ...confirmed, status: 'reported' }]).status, 'reported');
  for (const status of ['pending', 'rejected']) {
    assert.equal(historicalCancelOpening(order, [{ ...confirmed, status }]), null, status);
  }
  assert.equal(historicalCancelOpening(order, [{ ...confirmed, kind: 'regular' }]), null);
  assert.equal(historicalCancelOpening({ origin: 'pipeline', status: 'approved' }, [confirmed]), null);
  assert.equal(historicalCancelOpening(order, null), null);
});

/* 🔴 เงินที่บัญชีรับรองแล้วออกจากทะเบียนบัญชีเมื่อยกเลิก — ต้องมีร่องรอยว่าทำไม (บัญชีเห็นในประวัติ) */
test('หมายเหตุบังคับ ≥ 10 ตัวอักษรเมื่อยกเลิกใบที่งวดยกมารับรองแล้ว · รอรับรอง/ไม่มีงวดยกมา = ไม่บังคับ', () => {
  const order = { origin: 'historical', status: 'approved' };
  const confirmed = [{ id: 'SOI-1', kind: 'opening', status: 'confirmed', amount: 1000 }];
  assert.equal(HISTORICAL_CANCEL_NOTE_MIN, 10);
  const message = 'ยกเลิกใบที่งวดยกมารับรองแล้วต้องระบุหมายเหตุอย่างน้อย 10 ตัวอักษร (บัญชีเห็นในประวัติ)';
  assert.equal(historicalCancelNoteError(order, confirmed, ''), message);
  assert.equal(historicalCancelNoteError(order, confirmed, '   สั้นไป   '), message, 'ตัดช่องว่างก่อนนับ');
  assert.equal(historicalCancelNoteError(order, confirmed, 'ยอดยกมาคีย์ผิด'), null, 'นับตัวอักษรแบบ Postgres length()');
  assert.equal(historicalCancelNoteError(order, [{ ...confirmed[0], status: 'reported' }], ''), null);
  assert.equal(historicalCancelNoteError(order, [], ''), null);
  assert.equal(historicalCancelNoteError({ origin: 'pipeline', status: 'approved' }, confirmed, ''), null);
});

/* 🐞 review 25/09 (fail closed): route ปล่อยงวดยกมาที่มีเงินให้ trigger ของ 0387 จัดการ — ถ้าโค้ดขึ้นก่อนรันมิก (deploy อัตโนมัติ
   วันละ 3 รอบไม่ถามมิก) UPDATE ผ่านโดยไม่มีใครตีกลับ ⇒ งวดยกมาค้าง "รอตรวจ" บนใบที่ยกเลิกถาวร (ล็อกทั้งใบปิดปุ่มบัญชี · ทะเบียนบัญชี
   ตัดทิ้ง · ป้ายเมนูบัญชี +1) และรันมิกทีหลังก็ไม่ซ่อม ⇒ ฐานยังไม่ยืนยันว่าพร้อม = บล็อกแบบเดิม (ก่อนมติ 24/09) พร้อมบอกทางออก */
test('ด่านความพร้อมของฐาน (0387): งวดยกมามีเงิน + ฐานไม่ยืนยัน = บล็อกพร้อมทางออก · ฐานพร้อม/ไม่มีงวดยกมาที่มีเงิน = ผ่าน', () => {
  const reported = { row: { id: 'SOI-1', kind: 'opening', status: 'reported' }, status: 'reported', amount: 600 };
  const confirmed = { row: { id: 'SOI-1', kind: 'opening', status: 'confirmed' }, status: 'confirmed', amount: 600 };
  assert.equal(historicalCancelSettleBlock(reported, true), null);
  assert.equal(historicalCancelSettleBlock(confirmed, true), null);
  assert.equal(historicalCancelSettleBlock(null, false), null, 'ไม่มีงวดยกมาที่มีเงิน = สิทธิ์เดิมก่อนมติ ห้ามถอด');
  assert.equal(historicalCancelSettleBlock(undefined, false), null);
  assert.equal(
    historicalCancelSettleBlock(reported, false),
    'ฐานข้อมูลยังไม่ได้รัน migration 0387 — ยกเลิกใบที่งวดยกมารอบัญชีรับรองยังไม่ได้ (งวดจะค้างคิวบัญชีบนใบที่ยกเลิก)'
      + ' · แจ้งผู้ดูแลระบบ หรือให้บัญชีตีกลับงวดยกมาก่อน แล้วค่อยยกเลิกใบ',
  );
  assert.equal(
    historicalCancelSettleBlock(confirmed, false),
    'ฐานข้อมูลยังไม่ได้รัน migration 0387 — ยกเลิกใบที่งวดยกมารับรองแล้วยังไม่ได้'
      + ' · แจ้งผู้ดูแลระบบ หรือให้บัญชีถอนคำรับรองแล้วตีกลับงวดยกมาก่อน แล้วค่อยยกเลิกใบ',
  );
  // ค่าที่ไม่ใช่ true ตรง ๆ (undefined · 'true' · 1) = ไม่ยืนยัน ⇒ บล็อก
  for (const ready of [undefined, null, 'true', 1, {}]) {
    assert.ok(historicalCancelSettleBlock(reported, ready), `ready=${JSON.stringify(ready)} ต้องบล็อก`);
  }
});

/* 🐞 review 25/09: สรุป audit ของงวดยกมาเคยใช้สถานะที่อ่าน**ก่อน** UPDATE — บัญชีรับรองแทรกระหว่างอ่านกับเขียน = audit เขียนว่า
   "รอรับรอง — ออกจากคิวบัญชี" ทั้งที่เงินรับรองแล้วโมฆะ ⇒ ตัดสินจากแถวที่อ่าน**หลัง**ยกเลิก (ค่าที่ trigger ทิ้งไว้จริง) */
test('งวดยกมาหลังยกเลิก: ตัดสินจากแถวหลังยกเลิก · ค้าง "รอตรวจ" = trigger ไม่ทำงาน (stuck) · อ่านไม่ขึ้น = ใช้ค่าก่อนเขียน', () => {
  const before = { id: 'SOI-1', kind: 'opening', status: 'reported', amount: 600 };
  const opening = { row: before, status: 'reported', amount: 600 };
  // ปกติ: trigger ตีกลับงวดที่รอตรวจ
  const rejected = { ...before, status: 'rejected', rejectedReason: 'ยกเลิกตามใบสั่งขายย้อนหลัง SO-1 — งวดยกมาเป็นโมฆะ ไม่ใช่การตีกลับของบัญชี' };
  assert.deepEqual(historicalOpeningSettled(opening, [{ id: 'SOI-2', kind: 'regular', status: 'pending' }, rejected]),
    { row: rejected, status: 'reported', amount: 600, stuck: false });
  // race: บัญชีรับรองแทรก → trigger ปล่อยผ่าน (หมายเหตุครบ) · audit ต้องบอกว่ารับรองแล้ว โดยใคร
  const certified = { ...before, status: 'confirmed', confirmedByName: 'บัญชี ข', amount: '600.00' };
  assert.deepEqual(historicalOpeningSettled(opening, [certified]),
    { row: certified, status: 'confirmed', amount: 600, stuck: false });
  // ค้าง "รอตรวจ" หลังยกเลิก = trigger ของ 0387 ไม่ได้ทำงาน — ต้องดัง
  assert.deepEqual(historicalOpeningSettled(opening, [before]), { row: before, status: 'reported', amount: 600, stuck: true });
  assert.match(HISTORICAL_CANCEL_SETTLE_STUCK, /0387/);
  // อ่านหลังยกเลิกไม่ขึ้น/หาแถวไม่เจอ = ใช้ค่าก่อนเขียน ไม่เดาว่าค้าง
  for (const after of [null, undefined, [], [{ id: 'other', kind: 'opening', status: 'reported' }]]) {
    assert.deepEqual(historicalOpeningSettled(opening, after), { row: before, status: 'reported', amount: 600, stuck: false });
  }
  const confirmedBefore = { row: { ...before, status: 'confirmed' }, status: 'confirmed', amount: 600 };
  assert.equal(historicalOpeningSettled(confirmedBefore, [{ ...before, status: 'confirmed' }]).status, 'confirmed');
  assert.equal(historicalOpeningSettled(null, [before]), null);
});

test('ทางฟอร์มคีย์ใบ: หน้าใหม่ · หน้าแก้ต่อใบ (เข้ารหัส id) · ข้อความ schema ของ 0374 แยกจาก 0360', () => {
  assert.equal(HISTORICAL_NEW_PATH, '/sa/sales-orders/historical/new');
  assert.equal(historicalEditPath('SOR-Habc123'), '/sa/sales-orders/historical/SOR-Habc123/edit');
  assert.equal(historicalEditPath('a/b c'), '/sa/sales-orders/historical/a%2Fb%20c/edit');
  assert.match(HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE, /0374/);
  assert.notEqual(HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE, HISTORICAL_SCHEMA_MISSING_MESSAGE);
});

/* มติ 24/09: ผู้ยกเลิกได้คือผู้จัดการฝ่ายขายทุกตำแหน่งที่อนุมัติได้ (CD · CM · AE Sup · Admin) ไม่ใช่ AE Sup คนเดียว
   · งวดยกมาไม่ต้องให้บัญชีตีกลับก่อนแล้ว — เป็นโมฆะตามใบ บัญชีรับรองใหม่ที่ใบที่คีย์ใหม่ */
test('ทางแก้หลังอนุมัติ: ผู้จัดการฝ่ายขายยกเลิกใบแล้วคีย์ใหม่ · เอกสารแทนสัญญาถูกยกเลิกตาม · งวดยกมาเป็นโมฆะ', () => {
  assert.equal(HISTORICAL_CORRECTION_PATH,
    'ข้อมูลที่อนุมัติแล้วผิด → ผู้จัดการฝ่ายขายยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่'
      + ' (เอกสารแทนสัญญาถูกยกเลิกตาม · งวดยกมาเป็นโมฆะ บัญชีรับรองใหม่ที่ใบใหม่)');
  assert.doesNotMatch(HISTORICAL_CORRECTION_PATH, /AE Sup/);
});

/* 🚫 สวิตช์ยกเว้นด่านเงินถูกถอดครบแล้ว (มติ 22/09) — ถ้าชื่อพวกนี้กลับมา แปลว่ามีทางเก่าโผล่กลับมาด้วย */
test('ไฟล์นี้ไม่มีสวิตช์ยกเว้นด่านเงินของ 0360 เหลืออยู่อีก (มติ 22/09)', () => {
  const src = readFileSync(new URL('./historicalOrders.js', import.meta.url), 'utf8');
  for (const name of ['historicalGateExempt', 'exemptReasonError', 'EXEMPT_REASON_MIN', 'ZERO_VALUE_EXEMPT_REASON']) {
    assert.ok(!new RegExp(`export (const|function) ${name}\\b`).test(src), `ยังมี export ${name}`);
  }
  // CHECK ของ 0374 บังคับให้ใบย้อนหลังทุกใบมีคอลัมน์ยกเว้นเป็นค่าว่าง ⇒ ธงนั้นไม่มีทางเป็นจริงได้อีก
  assert.ok(SQL_0374.includes('"paymentGateExemptAt" IS NULL'));
});

test('เลขเอกสารเดิม: ตัดช่องว่าง ทิ้งค่าว่าง เรียง ใบเสนอราคา → Express → ใบกำกับ', () => {
  assert.deepEqual(
    historicalRefsOf({ historicalQuoteRef: ' Q#1 ', historicalExpressRef: '', historicalInvoiceRef: 'IV6801041' }),
    ['Q#1', 'IV6801041'],
  );
  assert.deepEqual(historicalRefsOf(null), []);
});

test('id ของใบย้อนหลังตรงกับสูตรใน RPC: SOR-H + md5(รหัสการคีย์) 16 ตัวแรก', () => {
  assert.match(SQL, /v_order_id := 'SOR-H' \|\| substr\(md5\(p_intake_key\), 1, 16\);/);
  const key = '4f0c9d2e-1b7a-4c1e-9f3d-8a6b5c4d3e2f';
  const md5 = createHash('md5').update(key).digest('hex');
  assert.equal(historicalOrderIdOf(md5), `SOR-H${md5.slice(0, 16)}`);
  assert.equal(historicalOrderIdOf(md5).length, 21);
});

test('ค่าคงที่ JS = ตัวเลขใน CHECK/RPC ของ 0360', () => {
  for (const col of ['historicalQuoteRef', 'historicalExpressRef', 'historicalInvoiceRef']) {
    assert.ok(SQL.includes(`length(btrim("${col}")) BETWEEN 1 AND ${HISTORICAL_REF_MAX}`), col);
  }
  assert.ok(SQL.includes(`length(btrim("installationPoint")) BETWEEN 1 AND ${INSTALLATION_POINT_MAX}`));
  // เหตุผลยกเว้นด่านเงิน 10–500: CHECK ของ 0360 ยังอยู่ในฐาน แต่ค่าคงที่ฝั่ง JS ถูกถอดพร้อมสวิตช์ (มติ 22/09)
  assert.ok(SQL.includes('BETWEEN 10 AND 500'));
  assert.ok(SQL.includes(`NOT BETWEEN 1 AND ${INSTALLMENT_LABEL_MAX}`));
  assert.ok(SQL.includes(`BETWEEN DATE '${DOC_DATE_MIN}' AND DATE '${DOC_DATE_MAX}'`));
  assert.ok(SQL.includes(`v_order_date < DATE '${DOC_DATE_MIN}'`));
});

test('ความยาวแบบ Postgres length() = นับตัวอักษร ไม่ใช่หน่วย UTF-16', () => {
  assert.equal(charLength('😀😀'), 2);
  assert.equal(charLength('  ก  '), 5);
});

test('รู้จัก error ที่แปลว่ายังไม่ได้รัน 0360', () => {
  assert.equal(historicalSchemaMissing({ code: '42703', message: 'column sales_orders.origin does not exist' }), true);
  assert.equal(historicalSchemaMissing({ code: 'PGRST202', message: 'Could not find the function' }), true);
  assert.equal(historicalSchemaMissing({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(historicalSchemaMissing(null), false);
});

test('ลบใบย้อนหลังแบบปกติ: ติดเมื่อเปิดโซนให้ TS แล้ว · มีรอบบริการ · งวดคอนเฟิร์ม · มีเลขใบกำกับ', () => {
  const order = { origin: 'historical', installments: [{ status: 'pending' }] };
  assert.equal(historicalDeleteBlock({ order }), null);
  // 0374: รอบขายของโซนเกิดตอน AE Sup อนุมัติ — ไม่ใช่ TS ผูกทีหลัง
  assert.match(historicalDeleteBlock({ order, terms: [{}, {}] }), /เปิดโซนให้ TS แล้ว 2 โซน — ลบแบบปกติไม่ได้/);
  assert.doesNotMatch(historicalDeleteBlock({ order, terms: [{}] }), /TS ผูกโซน/);
  assert.match(historicalDeleteBlock({ order, plans: [{}] }), /รอบบริการ/);
  assert.match(
    historicalDeleteBlock({ order: { ...order, installments: [{ status: 'confirmed' }] } }),
    /คอนเฟิร์มแล้ว 1 งวด/,
  );
  assert.match(
    historicalDeleteBlock({ order: { ...order, installments: [{ status: 'reported', taxInvoiceNo: 'IV-1' }] } }),
    /ใบกำกับภาษี/,
  );
  // ใบ pipeline ไม่ผ่านตัวนี้เลย
  assert.equal(historicalDeleteBlock({ order: { origin: 'pipeline' }, terms: [{}] }), null);
});

test('PATCH ดีลภาชนะ: ห้ามเปลี่ยนลูกค้า/สาย/ประเภท/ทีมว่าง · ย้ายเจ้าของ + ทีมที่มีจริงผ่าน', () => {
  const deal = { origin: 'historical', customerId: 'CUS-1', line: 'SERVICE', dealType: 'RE-ORDER', team: 'SV' };
  assert.match(historicalDealPatchError(deal, { customerId: 'CUS-2' }), /ลูกค้า/);
  assert.match(historicalDealPatchError(deal, { customerId: '' }), /ลูกค้า/);
  assert.match(historicalDealPatchError(deal, { line: 'PRODUCT' }), /สาย/);
  assert.match(historicalDealPatchError(deal, { dealType: 'NPD' }), /ประเภท/);
  assert.match(historicalDealPatchError(deal, { projectType: 'SCENT' }), /ประเภท/);
  assert.match(historicalDealPatchError(deal, { team: '  ' }), /ทีม/);
  assert.equal(historicalDealPatchError(deal, { ownerId: 'U-2', team: 'ODM' }), null);
  assert.equal(historicalDealPatchError(deal, { customerId: 'CUS-1', line: 'SERVICE', dealType: 'RE-ORDER' }), null);
  assert.equal(historicalDealPatchError(deal, { line: '' }), null); // ฟอร์มส่งค่าว่าง = ไม่แตะ
  assert.equal(historicalDealPatchError({ ...deal, origin: 'pipeline' }, { customerId: 'CUS-2', line: 'PRODUCT' }), null);
});

test('409 ย้ายเจ้าของชนดีลภาชนะเดิม: บอกชื่อ AE + รหัสดีล + ว่ายังรวมดีลไม่ได้', () => {
  const message = historicalOwnerTakenMessage('สมหญิง', 'DL-260900042');
  assert.match(message, /สมหญิง/);
  assert.match(message, /DL-260900042/);
  assert.match(message, /ยังไม่รวมดีล/);
  assert.match(historicalOwnerTakenMessage('', ''), /AE คนนั้น/);
});

test('ชื่อลูกค้าบนใบ: ไทยก่อน ไม่มีค่อยอังกฤษ — กติกาเดียวกับที่ RPC คำนวณเอง', () => {
  assert.equal(customerSnapshotName({ name: '', nameEn: 'X' }), 'X');
  assert.match(SQL, /COALESCE\(NULLIF\(btrim\(v_customer\.name\), ''\), NULLIF\(btrim\(v_customer\."nameEn"\), ''\)\)/);
});

test('ชื่อดีลภาชนะห้ามใช้คำว่า "ดีลเก่า" (ข้อ 19)', () => {
  assert.doesNotMatch(HISTORICAL_DEAL_TITLE('บจก. เอ'), /ดีลเก่า/);
  assert.match(HISTORICAL_DEAL_TITLE(null), /ไม่ระบุลูกค้า/);
});
