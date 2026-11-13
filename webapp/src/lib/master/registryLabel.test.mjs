// ── ป้ายกลิ่น/สูตร "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11/2026) ────────────────────────────
//
// ล็อกกติกา:
//   1) ครบสามท่อนเสมอ เรียง PF → ชื่อ → วันที่
//   2) วันที่กลิ่น = producedAt (วันผลิต) ไม่ใช่ sentAt · วันที่สูตร = formulaDate
//   3) ท่อนว่างไม่หาย: ไม่มีรหัส = "ไม่มี PF" · ไม่มีวันที่ = ขีด
//   4) ตาราง: บรรทัดล่าง = "ชื่อ · วันที่"
//   5) ข้อความค้นหามีทั้งรหัส ชื่อ วันที่รูปที่โชว์ และวันดิบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_PF, scentLabel, formulaLabel, scentLabelSub, formulaLabelSub,
  scentLabelParts, registryLabel, scentSearchText, formulaSearchText,
} from './registryLabel.js';
import { fmtDate, NA } from '../format.js';

test('กลิ่น: PF · ชื่อ · วันที่ผลิต — ไม่ใช้วันส่งลูกค้า', () => {
  const s = { code: 'PF-0413', name: 'Citrus Dawn', producedAt: '2026-10-12', sentAt: '2026-10-20' };
  assert.equal(scentLabel(s), `PF-0413 · Citrus Dawn · ${fmtDate('2026-10-12')}`);
  assert.equal(scentLabelSub(s), `Citrus Dawn · ${fmtDate('2026-10-12')}`);
});

test('สูตร: PF · ชื่อ · วันที่สูตร', () => {
  const f = { code: 'PF-0413-P1', name: 'Citrus Dawn EDP', formulaDate: '2026-11-01' };
  assert.equal(formulaLabel(f), `PF-0413-P1 · Citrus Dawn EDP · ${fmtDate('2026-11-01')}`);
  assert.equal(formulaLabelSub(f), `Citrus Dawn EDP · ${fmtDate('2026-11-01')}`);
});

test('ท่อนว่างยังอยู่ — ไม่มีรหัส/ไม่มีวันที่ บอกว่าขาด', () => {
  assert.equal(scentLabel({ name: 'Rose', sentAt: '2026-10-20' }), `${NO_PF} · Rose · ${NA}`);
  assert.equal(formulaLabel({ code: '  ', name: 'สูตร A' }), `${NO_PF} · สูตร A · ${NA}`);
  assert.equal(registryLabel({}), `${NO_PF} · ${NA} · ${NA}`);
  const p = scentLabelParts({ name: 'Rose' });
  assert.equal(p.hasCode, false);
  assert.equal(p.hasDate, false);
});

test('ค้นหาเจอทั้งรหัส ชื่อ วันที่รูปที่โชว์และรูปดิบ + คำเสริม', () => {
  const s = { code: 'PF-1', name: 'Rose', producedAt: '2026-10-12' };
  const hay = scentSearchText(s, 'บริษัท เอ');
  for (const needle of ['PF-1', 'Rose', fmtDate('2026-10-12'), '2026-10-12', 'บริษัท เอ']) {
    assert.ok(hay.includes(needle), needle);
  }
  assert.equal(formulaSearchText({ name: 'X' }), 'X');
});
