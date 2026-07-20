import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettledLines, normFg } from './settleLines.js';

const deal = (id, metadata, stage = 'qualified') => ({ id, stage, metadata });
const line = (id, fgCode) => ({ id, fgCode });

test('normFg จับคู่ข้ามรูปแบบการเขียนรหัส FG', () => {
  assert.equal(normFg('ABC-001'), 'abc001');
  assert.equal(normFg('ABC 001'), 'abc001');
  assert.equal(normFg(' abc_0.01 '), 'abc001');
  assert.equal(normFg(null), '');
});

test('ดีลยุคใหม่: เทียบราย poLineId — บรรทัด FG ซ้ำที่ยังไม่เชื่อมต้องไม่โดนบล็อก', () => {
  // PO มีสินค้าเดียวกันสองบรรทัด (คนละเดือนส่ง) รอบแรก settle แค่บรรทัดเดียว
  const settled = resolveSettledLines([
    deal('DEAL-1', { poLineIds: ['L1'], fgCodes: ['ABC-001'] }),
  ]);

  assert.equal(settled.dealFor(line('L1', 'ABC-001')), 'DEAL-1');
  // นี่คือกับดักเดิม: L2 เป็น FG เดียวกันแต่ยังไม่ถูก settle → ต้องยังว่างอยู่
  assert.equal(settled.dealFor(line('L2', 'ABC-001')), null);
});

test('ดีลเก่าที่ไม่มี poLineIds: ถอยไปเทียบด้วย fgCode (normalize แล้ว)', () => {
  const settled = resolveSettledLines([
    deal('DEAL-OLD', { fgCodes: ['ABC-001'] }),
  ]);

  assert.equal(settled.dealFor(line('L1', 'abc 001')), 'DEAL-OLD');
  assert.equal(settled.dealFor(line('L9', 'ZZZ-999')), null);
});

test('ดีลใหม่ไม่ป้อน byFg — ไม่งั้นกับดัก FG ซ้ำจะกลับมาทางอ้อม', () => {
  const settled = resolveSettledLines([
    deal('DEAL-1', { poLineIds: ['L1'], fgCodes: ['ABC-001'] }),
  ]);
  assert.equal(settled.byFg.size, 0);
  assert.equal(settled.byLine.get('L1'), 'DEAL-1');
});

test('ดีลที่ mark lost ไม่บล็อก — PO ยังเก็บเงินได้ต้อง settle ใหม่ได้', () => {
  // ลูกค้าปฏิเสธ QT แล้วทิ้งดีล หรือย้อน Won ผ่าน mig 0116
  const settled = resolveSettledLines([
    deal('DEAL-DEAD', { poLineIds: ['L1'], fgCodes: ['ABC-001'] }, 'lost'),
    deal('DEAL-OLD-DEAD', { fgCodes: ['XYZ-002'] }, 'lost'),
  ]);

  assert.equal(settled.dealFor(line('L1', 'ABC-001')), null);
  assert.equal(settled.dealFor(line('L2', 'XYZ-002')), null);
});

test('settle หลายรอบ: ดีลรวมคนละใบถือคนละบรรทัด', () => {
  const settled = resolveSettledLines([
    deal('DEAL-1', { poLineIds: ['L1'] }),
    deal('DEAL-2', { poLineIds: ['L2', 'L3'] }),
  ]);

  assert.equal(settled.dealFor(line('L1', 'ABC-001')), 'DEAL-1');
  assert.equal(settled.dealFor(line('L2', 'ABC-001')), 'DEAL-2');
  assert.equal(settled.dealFor(line('L3', 'XYZ-002')), 'DEAL-2');
  assert.equal(settled.dealFor(line('L4', 'XYZ-002')), null);
});

test('metadata ว่าง/ไม่มีเลย ไม่ทำให้พัง', () => {
  const settled = resolveSettledLines([deal('D1', null), deal('D2', {}), deal('D3', { poLineIds: [] })]);
  assert.equal(settled.dealFor(line('L1', 'ABC-001')), null);
  assert.equal(resolveSettledLines(null).dealFor(line('L1', 'A')), null);
});
