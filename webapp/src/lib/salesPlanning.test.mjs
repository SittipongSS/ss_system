import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  requiredConfirmDateForNeedMonth,
  buildSahamitReverseRiskRows,
} from './salesPlanningReverse';
import {
  QUOTE_DISCOUNT_TYPES, QUOTE_VAT_OPTIONS, canApproveQuotation, inSalesEditScope, inSalesViewScope, quoteLineMoney, quoteLineNet,
  salesPlanningEditScope, salesPlanningViewScope,
} from './salesPlanning';

test('requiredConfirmDateForNeedMonth subtracts working days from first day of need month', () => {
  assert.equal(requiredConfirmDateForNeedMonth('2026-08', 1, new Set()), '2026-07-31');
  assert.equal(requiredConfirmDateForNeedMonth('2026-08', 2, new Set()), '2026-07-30');
});

test('buildSahamitReverseRiskRows uses latest covering FC round and flags late FC', () => {
  const rows = buildSahamitReverseRiskRows([
    {
      roundNo: 1,
      receivedDate: '2026-01-01',
      coverMonths: ['2026-08'],
      lines: [{ fgCode: 'A', productName: 'Alpha', month: '2026-08', qty: 100 }],
    },
    {
      roundNo: 2,
      receivedDate: '2026-07-15',
      coverMonths: ['2026-08'],
      lines: [{ fgCode: 'A', productName: 'Alpha', month: '2026-08', qty: 80 }],
    },
  ], new Set(), 30);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].qty, 80);
  assert.equal(rows[0].latestRoundNo, 2);
  assert.equal(rows[0].warehouseNeedMonth, '2026-08');
  assert.equal(rows[0].risk, true);
});

/* 🔒 ตัวตน = `ownerId` เท่านั้น — เดิมมีทางลัดให้ดีล pm-backfill ผ่านด่านเมื่อ
   **ชื่อ**ผู้ใช้ตรงกับ `ownerName` ในแถว ซึ่งพังทั้งสองทิศ: เปลี่ยนชื่อตัวเอง =
   หลุดสิทธิ์ดีลตัวเอง · เปลี่ยนชื่อไปชนคนอื่น = ได้สิทธิ์แก้ดีลคนอื่น */
test('ชื่อไม่ใช่ตัวตน: ชื่อตรงแต่ ownerId ไม่ใช่ = ไม่มีสิทธิ์ (ทุกกรณี รวม pm-backfill)', () => {
  const ae = { id: 'u-ae-1', role: 'ae', name: 'Sittipong SS', team: 'SA' };

  for (const source of ['pm-backfill', 'manual']) {
    assert.equal(inSalesEditScope(ae, {
      ownerId: null, ownerName: '  sittipong   ss ', team: null, metadata: { source },
    }), false, `ชื่อตรงแต่ไม่มี ownerId ต้องไม่ผ่าน (${source})`);

    assert.equal(inSalesEditScope(ae, {
      ownerId: 'other-user', ownerName: 'Sittipong SS', team: 'SA', metadata: { source },
    }), false, `ชื่อตรงแต่ ownerId เป็นคนอื่น ต้องไม่ผ่าน (${source})`);
  }

  // เจ้าของตัวจริงยังผ่านแม้ชื่อในแถวจะเป็นชื่อเก่า (เคสคนเปลี่ยนนามสกุล)
  assert.equal(inSalesEditScope(ae, {
    ownerId: 'u-ae-1', ownerName: 'ชื่อเก่าที่ยังไม่ได้อัปเดต', team: 'SA',
  }), true);
});

test('sales plan project auth scopes by sales role', () => {
  assert.equal(salesPlanningViewScope('ae'), 'own');
  assert.equal(salesPlanningEditScope('ae'), 'own');
  assert.equal(salesPlanningViewScope('senior_ae'), 'team');
  assert.equal(salesPlanningEditScope('senior_ae'), 'team');
  assert.equal(salesPlanningViewScope('ac'), 'team');
  assert.equal(salesPlanningEditScope('ac'), 'team');
  assert.equal(salesPlanningViewScope('ae_supervisor'), 'all');
  assert.equal(salesPlanningEditScope('ae_supervisor'), 'all');
  assert.equal(salesPlanningViewScope('admin'), 'all');
  assert.equal(salesPlanningEditScope('admin'), 'all');
  // viewer = read-only observer: sees every team's deals ('all') but edits none.
  assert.equal(salesPlanningViewScope('viewer'), 'all');
  assert.equal(salesPlanningEditScope('viewer'), 'none');
  // rd = ฝ่ายวิจัยและพัฒนา: sees every team's deals for inquiry context, edits none.
  assert.equal(salesPlanningViewScope('rd'), 'all');
  assert.equal(salesPlanningEditScope('rd'), 'none');
});

test('AE เห็นเฉพาะดีลของตัวเอง — ตัดสินด้วย ownerId ไม่ใช่ชื่อ', () => {
  const ae = { id: 'u-ae-1', role: 'ae', name: 'Sittipong SS', team: 'KA' };

  assert.equal(inSalesViewScope(ae, { ownerId: 'u-ae-1', ownerName: 'Someone', team: 'ODM' }), true);
  assert.equal(inSalesViewScope(ae, { ownerId: 'other-user', ownerName: 'Sittipong SS', team: 'KA', metadata: { source: 'manual' } }), false);
  assert.equal(inSalesViewScope(ae, { ownerId: null, ownerName: 'sittipong ss', team: null, metadata: { source: 'pm-backfill' } }), false);
});

test('canApproveQuotation: only deal owner and superuser may approve (owner sign-off)', () => {
  const deal = { id: 'DL-1', ownerId: 'u-ae-owner' };
  // เจ้าของดีลอนุมัติได้ (รวมเคสเจ้าของสร้างเอง = เซ็นเอง)
  assert.equal(canApproveQuotation({ id: 'u-ae-owner', role: 'ae' }, deal), true);
  // AE คนอื่น (แม้ทีมเดียวกัน) อนุมัติไม่ได้
  assert.equal(canApproveQuotation({ id: 'u-ae-other', role: 'ae' }, deal), false);
  // AC (ผู้ประสานงาน สร้างใบได้) อนุมัติไม่ได้ถ้าไม่ใช่เจ้าของ
  assert.equal(canApproveQuotation({ id: 'u-ac', role: 'ac' }, deal), false);
  // superuser อนุมัติได้ (กำกับดูแล)
  assert.equal(canApproveQuotation({ id: 'u-admin', role: 'admin' }, deal), true);
  assert.equal(canApproveQuotation({ id: 'u-sup', role: 'ae_supervisor' }, deal), true);
  // เจ้าของเป็น senior_ae ก็อนุมัติได้ (ยึด ownerId ไม่ยึด role)
  assert.equal(canApproveQuotation({ id: 'u-snr', role: 'senior_ae' }, { ownerId: 'u-snr' }), true);
  // กัน null
  assert.equal(canApproveQuotation(null, deal), false);
  assert.equal(canApproveQuotation({ id: 'x', role: 'ae' }, null), false);
});

/* ── เงินของหนึ่งบรรทัดตามที่ใบเสนอราคาบันทึก (มติเจ้าของ 23/09 — ใบสั่งขายย้อนหลังใช้ตัวเดียวกัน) ── */

test('quoteLineMoney: ชนิดส่วนลดที่ไม่รู้จัก = ไม่ลด · % ตัดเหลือ 100 · บาทไม่เกินยอด · คิดด้วย quoteLineNet ตัวเดียวกับจอ', () => {
  assert.deepEqual([...QUOTE_DISCOUNT_TYPES], ['percent', 'amount']);
  assert.deepEqual(QUOTE_VAT_OPTIONS.map((o) => [o.value, o.label]), [[0, 'รวม VAT แล้ว'], [7, '+ VAT 7% ท้ายใบ']]);
  // ตัวอย่างเจ้าของ 23/09: 1 ชุด × 12 เดือน = จำนวน 12 × 3,500
  assert.deepEqual(quoteLineMoney({ qty: 12, unitPrice: 3500 }), {
    discountType: null, discountValue: 0, gross: 42000, discountAmount: 0, lineTotal: 42000,
  });
  assert.deepEqual(quoteLineMoney({ qty: 12, unitPrice: 3500, discountType: 'percent', discountValue: 5 }), {
    discountType: 'percent', discountValue: 5, gross: 42000, discountAmount: 2100, lineTotal: 39900,
  });
  assert.deepEqual(quoteLineMoney({ qty: 12, unitPrice: 3500, discountType: 'percent', discountValue: 150 }), {
    discountType: 'percent', discountValue: 100, gross: 42000, discountAmount: 42000, lineTotal: 0,
  });
  assert.deepEqual(quoteLineMoney({ qty: 1, unitPrice: 100, discountType: 'amount', discountValue: 250 }), {
    discountType: 'amount', discountValue: 250, gross: 100, discountAmount: 100, lineTotal: 0,
  });
  assert.deepEqual(quoteLineMoney({ qty: 2, unitPrice: 100, discountType: 'foo', discountValue: 9 }), {
    discountType: null, discountValue: 0, gross: 200, discountAmount: 0, lineTotal: 200,
  });
  // ค่าเดียวกับ quoteLineNet เมื่อป้อนค่าที่บันทึกได้แล้ว
  const m = quoteLineMoney({ qty: 7, unitPrice: 33.33, discountType: 'percent', discountValue: '12.5' });
  assert.deepEqual({ gross: m.gross, discountAmount: m.discountAmount, lineTotal: m.lineTotal },
    quoteLineNet({ qty: 7, unitPrice: 33.33, discountType: 'percent', discountValue: 12.5 }));
});
