import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUOTATION_RETIRED_PEOPLE_KEYS,
  RETIRED_PEOPLE_CLEARED,
  stripRetiredPeople,
} from './quotationMetadata.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('ปอกคีย์ผู้รับผิดชอบที่ปลดระวางออก เก็บคีย์อื่นไว้ครบ', () => {
  const out = stripRetiredPeople({
    aeOwner: 'AE เอ',
    preparedBy: 'AC ซี',
    aeSupervisor: 'หัวหน้า เอส',
    salesOwnerPhone: '081-234-5678',
    revisedFrom: 'QT-26080001-0',
  });
  assert.deepEqual(out, { salesOwnerPhone: '081-234-5678', revisedFrom: 'QT-26080001-0' });
});

test('ไม่แก้ก้อนเดิม (ผู้เรียกยัง merge ของเดิมต่อได้)', () => {
  const src = { preparedBy: 'AC ซี', notes: 'x' };
  stripRetiredPeople(src);
  assert.equal(src.preparedBy, 'AC ซี');
});

test('รับ null/undefined ได้ — ใบที่ไม่มี metadata เลย', () => {
  assert.deepEqual(stripRetiredPeople(), {});
  assert.deepEqual(stripRetiredPeople(null), {});
});

test('ชุดค่าล้างของฉบับ Rev. ครอบคีย์ที่ปลดระวางครบทุกตัว', () => {
  assert.deepEqual(Object.keys(RETIRED_PEOPLE_CLEARED).sort(), [...QUOTATION_RETIRED_PEOPLE_KEYS].sort());
  assert.ok(Object.values(RETIRED_PEOPLE_CLEARED).every((v) => v === null));
});

// ⭐ กันของกลับมาเงียบ ๆ — บล็อก "ผู้รับผิดชอบเอกสาร" ถูกถอดทั้งบล็อก (มติผู้ใช้
// 2026-08-18) เพราะทุกบทบาทมีคำตอบอยู่ที่อื่นแล้ว. เคยเป็นช่องที่บังคับ role + สแกน
// auth directory ทุกครั้งที่บันทึก แต่ไม่มีค่าไหนขึ้นเอกสารเลย
test('ใบเสนอราคาต้องไม่มีบล็อกผู้รับผิดชอบ / ตัว validate ผู้รับผิดชอบกลับมาอีก', () => {
  const files = [
    'app/sales-planning/quotations/new/page.js',
    'app/sales-planning/quotations/[id]/page.js',
    'app/api/sales-planning/quotations/[id]/route.js',
    'app/api/sales-planning/quotations/[id]/revise/route.js',
    'app/api/sales-planning/quotations/[id]/submit/route.js',
    'lib/sales/createQuotationDraft.js',
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /validateQuotationPeople/, file);
    assert.doesNotMatch(src, /QuotationPeopleFields/, file);
    assert.doesNotMatch(src, /quotationPeopleFromMetadata/, file);
  }
});

// ตารางกลาง role ย้ายไปอยู่กับเจ้าของจริง (เอกสารโครงการ) — ฝั่งนั้นยังมีช่องลงนามครบสาม
test('เอกสารโครงการยังอ่าน role จากตารางกลางของตัวเอง', () => {
  const view = read('components/pm/ProjectDocumentView.js');
  assert.match(view, /PROJECT_PEOPLE_ROLES/);
  assert.doesNotMatch(view, /quotationPeople/);
});
