import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCISE_VAT_RATE } from '../tax/exciseBilling.js';
import { VAT_RATE, VAT_RATE_LABEL, costPriceVat } from './costVat.js';

// ไม่ปัดเศษในตัวช่วย (จอปัดเองด้วย fmtMoney) — เทียบแบบปัดสองตำแหน่ง
const r2 = (v) => Math.round(v * 100) / 100;

test('costPriceVat: costPrice ที่เก็บคือ "ก่อน VAT" — บวกขึ้นเป็นรวม VAT', () => {
  const { exVat, vat, incVat } = costPriceVat(100);
  assert.equal(exVat, 100);
  assert.equal(r2(vat), 7);
  assert.equal(r2(incVat), 107);
});

test('costPriceVat: ยังไม่ตั้งราคา → null ทั้งชุด (จอโชว์ขีด ไม่ใช่ ฿0.00)', () => {
  for (const v of [null, undefined, '', 'abc']) {
    assert.deepEqual(costPriceVat(v), { exVat: null, vat: null, incVat: null }, String(v));
  }
});

test('costPriceVat: 0 คือ "ตั้งราคาไว้ที่ศูนย์" ไม่ใช่ค่าว่าง', () => {
  assert.deepEqual(costPriceVat(0), { exVat: 0, vat: 0, incVat: 0 });
});

// อัตรา VAT ต้องมีที่มาที่เดียว — ห้ามพิมพ์ 0.07 ซ้ำในโมดูลนี้
test('VAT_RATE ผูกกับอัตราเดียวของระบบ', () => {
  assert.equal(VAT_RATE, EXCISE_VAT_RATE);
  assert.equal(VAT_RATE_LABEL, '7%');
});
