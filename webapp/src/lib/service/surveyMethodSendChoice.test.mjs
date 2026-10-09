// ── ส่งผลของใบที่มีพื้นที่จากแบบ: "ต้องยืนยันหน้างานไหม" (งวด S2a · สเปก §3 กลุ่ม B ข้อ 1–6 · แผน survey-desk-assessment §3.2) ──
//
// ⭐ ล็อกสี่เรื่อง:
//   ① `surveySendMethodError` — จอเห็นสัดส่วนวิธีประเมินชุดเดียวกับฐานไหม · หัวหน้าเลือกแล้วหรือยัง (ตัดสินจากแถว ไม่ถามสวิตช์)
//   ② `surveySendMethodText` — ท่อนที่ต่อท้ายบรรทัดส่งผล (เธรด · กระดิ่ง · audit)
//   ③ `surveySendConfirm({ method })` — หัวโมดัล · ตัวเลือก · รายการผล ของใบที่มีพื้นที่จากแบบ
//   ④ route ส่งผล — ตีกลับก่อนเขียน · คำตอบลงคอลัมน์ `surveyConfirm` · ท่อนต่อท้ายเธรด/audit · `meta.totals`
//
// 🔴 กติกาที่ทุกเคส **ลงหน้างานล้วน** ต้องยืนยัน: ผลเท่าเดิมทุกคีย์ ทุกตัวอักษร — ไม่มีคีย์ `surveyConfirm` ในคำสั่งตอบใบ ·
//    บรรทัดเธรดและ audit เขียนตรงตัวไว้ที่นี่ (route แก้คำเมื่อไร เทสต์ต้องแดง)
// 🔴 เทสต์ของ route **เรียก handler POST ตัวจริง** กับของปลอมทั้งหมด (ท่าเดียวกับ `surveyMethodSend.test.mjs`) —
//    ตัวอ่านผู้ใช้ · client · `lib/drive` ถูกแทนด้วย hook และ env ของ Supabase ถูกลบก่อน import (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { surveyMethodMix } from './surveyMethod.js';
import { SURVEY_CONFIRM_LABEL, SURVEY_CONFIRM_MISSING } from './surveyMethodSwitch.js';
import {
  SEND_METHOD_MOVED, surveySendConfirm, surveySendMethodError, surveySendMethodText,
} from './surveySendClose.js';
import { surveyPackagesText, surveyTotals, surveyTotalsDiff } from './survey.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND', 'SURVEY_DRAWING_METHOD',
]) delete process.env[key];

const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const STUBS = {
  '@/lib/authUser': dataUrl('export async function getCurrentUser() { return globalThis.__sendChoiceTest?.user ?? null; }'),
  '@/lib/supabaseAdmin': dataUrl(`export function getSupabaseAdmin() {
    const s = globalThis.__sendChoiceTest?.supabase;
    if (!s) throw new Error('fake supabase missing');
    return s;
  }`),
  '@/lib/drive': dataUrl('export async function getFileStream() { throw new Error("fake drive: not expected in this suite"); }'),
};
register(dataUrl(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(STUBS, s)) return { url: STUBS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { POST } = await import('../../app/api/service/surveys/[id]/send/route.js');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (แผน §3.2) */
const MOVED = 'วิธีประเมินของใบเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วตรวจอีกครั้ง';
const MISSING = 'ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม';
const HOLD = 'เอกสารประเมิน (เลข SU) ของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร · ผลถึงฝ่ายขายตามปกติ';
const NO_VISIT = 'ไม่มีการปิดนัด — ใบนี้ไม่มีนัดที่เปิดอยู่';
const TAG_AWAITING = 'ทะเบียนพื้นที่ของลูกค้าขึ้นป้าย “ประเมินจากแบบ · รอยืนยันหน้างาน” จนกว่า TS จะส่งผลของใบยืนยันหน้างาน';
const TAG_FINAL = 'ทะเบียนพื้นที่ของลูกค้าขึ้นป้าย “ประเมินจากแบบ” (ไม่ต้องยืนยันหน้างาน)';
const zonesLine = (n) => `${n} พื้นที่ประเมินจากแบบ — หน้าคำร้องและเอกสารจะระบุว่า “ประเมินจากแบบ”`;
const BASE = [
  'ใบ RQ-AS-26100312 เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที',
  'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
];
const END = 'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”';
const CHOICE = (value) => ({
  question: 'ต้องเข้ายืนยันหน้างานภายหลังไหม',
  value,
  missing: MISSING,
  options: [
    {
      value: 'needed',
      label: 'ต้องยืนยันหน้างาน',
      hint: 'ฝ่ายขายใช้ตัวเลขเสนอราคาได้เลย · พื้นที่ติดป้าย “รอยืนยันหน้างาน” จนกว่า TS จะส่งผลของใบยืนยันหน้างาน · ฝ่ายขายเป็นคนกดขอเมื่อพื้นที่พร้อม',
    },
    {
      value: 'not_needed',
      label: 'ไม่ต้องยืนยันหน้างาน',
      hint: 'ใช้ผลจากแบบเป็นผลสุดท้าย เช่น บูธงานอีเวนต์ · ฝ่ายขายจะไม่มีปุ่มขอยืนยันหน้างาน',
    },
  ],
});

test('ค่าคงที่ที่เทสต์นี้พิมพ์ตรงตัว = ตัวที่โมดูลส่งออก', () => {
  assert.equal(SEND_METHOD_MOVED, MOVED);
  assert.equal(SURVEY_CONFIRM_MISSING, MISSING);
  assert.deepEqual(SURVEY_CONFIRM_LABEL, { needed: 'ต้องยืนยันหน้างาน', not_needed: 'ไม่ต้องยืนยันหน้างาน' });
});

/* ══ ① ด่านของ route ═══════════════════════════════════════════════════════════════════ */

const row = (id, zoneName, over = {}) => ({ id, zoneName, status: 'ok', ...over });
const SHEETS = {
  // แถวเก่าไม่มีคีย์ method · แถวหลัง 0408 = 'onsite' · แถวที่ถูกตัดไม่นับ
  onsite: [row('A', 'ล็อบบี้'), row('B', 'ห้องประชุม', { method: 'onsite' }), row('C', 'ห้องเก็บของ', { status: 'cut' })],
  mixed: [
    row('A', 'ล็อบบี้'), row('B', 'ห้องประชุม', { method: 'drawing' }), row('C', 'ห้องน้ำ', { method: 'drawing' }),
    row('D', 'ลานจอด', { method: 'drawing', status: 'cut' }),
  ],
  drawing: [row('A', 'ล็อบบี้', { method: 'drawing' }), row('B', 'ห้องประชุม', { method: 'drawing' })],
  empty: [],
};
const mixOf = (rows) => (({ onsite, drawing }) => ({ onsite, drawing }))(surveyMethodMix(rows));
const moved = { status: 409, error: MOVED };
const missing = { status: 400, error: MISSING };

test('fixture: สัดส่วนของสี่ใบตรงกับที่ตัวนับกลางอ่าน', () => {
  assert.deepEqual(mixOf(SHEETS.onsite), { onsite: 2, drawing: 0 });
  assert.deepEqual(mixOf(SHEETS.mixed), { onsite: 1, drawing: 2 });
  assert.deepEqual(mixOf(SHEETS.drawing), { onsite: 0, drawing: 2 });
  assert.deepEqual(mixOf(SHEETS.empty), { onsite: 0, drawing: 0 });
});

test('🔴 surveySendMethodError · ใบลงหน้างานล้วน: ไม่ส่งอะไรมา = ผ่าน (ทุกจอของวันนี้) · คำตอบที่ส่งมาไม่ถูกอ่าน', () => {
  for (const rows of [SHEETS.onsite, SHEETS.empty]) {
    assert.equal(surveySendMethodError(rows), null);
    assert.equal(surveySendMethodError(rows, {}), null);
    assert.equal(surveySendMethodError(rows, { methodMix: null, surveyConfirm: null }), null);
    assert.equal(surveySendMethodError(rows, { methodMix: undefined, surveyConfirm: undefined }), null);
    // จอรุ่นใหม่ส่งสัดส่วนที่ตรงมา — ไม่ต้องมีคำตอบ และคำตอบขยะก็ไม่ทำให้ตีกลับ
    for (const surveyConfirm of [undefined, null, '', 'needed', 'not_needed', 'yes', true]) {
      assert.equal(surveySendMethodError(rows, { methodMix: mixOf(rows), surveyConfirm }), null, String(surveyConfirm));
    }
  }
});

test('🔴 surveySendMethodError ① สัดส่วนที่จอส่งมาไม่ตรงกับแถว = 409 — ทุกใบ รวมใบลงหน้างานล้วน · มาก่อนเรื่องคำตอบ', () => {
  const wrong = [
    ['นับลงหน้างานผิด', (m) => ({ ...m, onsite: m.onsite + 1 })],
    ['นับจากแบบผิด', (m) => ({ ...m, drawing: m.drawing + 1 })],
    ['สลับสองช่อง', (m) => ({ onsite: m.drawing + 5, drawing: m.onsite + 5 })],
    ['ขาดคีย์ drawing', (m) => ({ onsite: m.onsite })],
    ['ขาดคีย์ onsite', (m) => ({ drawing: m.drawing })],
    ['ออบเจ็กต์ว่าง', () => ({})],
    ['อาร์เรย์', () => []],
    ['สตริง', () => 'onsite'],
    ['ตัวเลข', () => 3],
    ['true', () => true],
    ['ไม่ใช่ตัวเลข', (m) => ({ onsite: 'x', drawing: m.drawing })],
  ];
  for (const [sheet, rows] of Object.entries(SHEETS)) {
    for (const [name, bend] of wrong) {
      for (const surveyConfirm of ['needed', 'not_needed', null]) {
        assert.deepEqual(
          surveySendMethodError(rows, { methodMix: bend(mixOf(rows)), surveyConfirm }), moved,
          `${sheet} · ${name} · ${surveyConfirm}`,
        );
      }
    }
  }
  // ตัวเลขที่มาเป็นสตริง (ฟอร์ม) ยังนับว่าตรง
  const asText = { onsite: '1', drawing: '2' };
  assert.equal(surveySendMethodError(SHEETS.mixed, { methodMix: asText, surveyConfirm: 'needed' }), null);
});

test('🔴 surveySendMethodError ② ใบมีพื้นที่จากแบบ แต่จอไม่ได้ส่งสัดส่วนมา = 409 เดียวกัน (จอที่ไม่รู้ว่าใบมีพื้นที่จากแบบ)', () => {
  for (const sheet of ['mixed', 'drawing']) {
    for (const surveyConfirm of [undefined, null, 'needed', 'not_needed']) {
      assert.deepEqual(surveySendMethodError(SHEETS[sheet], { surveyConfirm }), moved, `${sheet} · ${surveyConfirm}`);
      assert.deepEqual(surveySendMethodError(SHEETS[sheet], { methodMix: null, surveyConfirm }), moved);
    }
    assert.deepEqual(surveySendMethodError(SHEETS[sheet]), moved, sheet);
  }
});

test('🔴 surveySendMethodError ③ ใบมีพื้นที่จากแบบ สัดส่วนตรง แต่ยังไม่ได้เลือก / ค่าที่ไม่รู้จัก = 400 · ④ เลือกแล้ว = ผ่าน', () => {
  const garbage = [
    undefined, null, '', ' ', 'yes', 'no', 'NEEDED', 'needed ', 'not-needed', 'confirming', true, false, 0, 1,
    {}, [], ['needed'], 'toString', 'constructor', '__proto__',
  ];
  for (const sheet of ['mixed', 'drawing']) {
    const methodMix = mixOf(SHEETS[sheet]);
    for (const surveyConfirm of garbage) {
      assert.deepEqual(
        surveySendMethodError(SHEETS[sheet], { methodMix, surveyConfirm }), missing, `${sheet} · ${JSON.stringify(surveyConfirm)}`,
      );
    }
    for (const surveyConfirm of ['needed', 'not_needed']) {
      assert.equal(surveySendMethodError(SHEETS[sheet], { methodMix, surveyConfirm }), null, `${sheet} · ${surveyConfirm}`);
    }
  }
});

/* ══ ② ท่อนต่อท้ายบรรทัดส่งผล ═══════════════════════════════════════════════════════════ */

test('surveySendMethodText: ใบลงหน้างานล้วน = สตริงว่าง · จากแบบทั้งใบ · ผสม (ชื่อเฉพาะพื้นที่จากแบบที่ยังใช้อยู่ · เกินสามชื่อย่อ)', () => {
  for (const confirm of ['needed', 'not_needed', null, undefined, 'yes']) {
    assert.equal(surveySendMethodText(SHEETS.onsite, confirm), '', String(confirm));
    assert.equal(surveySendMethodText(SHEETS.empty, confirm), '');
  }
  assert.equal(surveySendMethodText(undefined, 'needed'), '');
  assert.equal(surveySendMethodText(null, 'needed'), '');

  assert.equal(surveySendMethodText(SHEETS.drawing, 'needed'), ' · ประเมินจากแบบทั้งใบ · ต้องยืนยันหน้างาน');
  assert.equal(surveySendMethodText(SHEETS.drawing, 'not_needed'), ' · ประเมินจากแบบทั้งใบ · ไม่ต้องยืนยันหน้างาน');
  // แถวที่ถูกตัด (D) ไม่ถูกนับและไม่ถูกเอ่ยชื่อ · พื้นที่ลงหน้างาน (A) ไม่ถูกเอ่ยชื่อ
  assert.equal(surveySendMethodText(SHEETS.mixed, 'needed'), ' · จากแบบ 2 พื้นที่ (ห้องประชุม · ห้องน้ำ) · ต้องยืนยันหน้างาน');
  assert.equal(surveySendMethodText(SHEETS.mixed, 'not_needed'), ' · จากแบบ 2 พื้นที่ (ห้องประชุม · ห้องน้ำ) · ไม่ต้องยืนยันหน้างาน');

  const many = [
    row('A', 'ล็อบบี้'), ...['โซน 1', 'โซน 2', 'โซน 3', 'โซน 4'].map((name, i) => row(`Z${i}`, name, { method: 'drawing' })),
    row('N', '', { method: 'drawing' }),
  ];
  assert.equal(
    surveySendMethodText(many, 'needed'),
    ' · จากแบบ 5 พื้นที่ (โซน 1 · โซน 2 · โซน 3 และอีก 2 พื้นที่) · ต้องยืนยันหน้างาน',
  );
  // คำตอบที่ไม่ใช่สองค่า = ไม่ต่อท่อนคำตอบ (route ตีกลับไปก่อนแล้ว — ไม่มีคำว่า undefined หลุดเข้าเธรด)
  for (const confirm of [null, undefined, '', 'yes', true, 'toString']) {
    assert.equal(surveySendMethodText(SHEETS.drawing, confirm), ' · ประเมินจากแบบทั้งใบ', String(confirm));
    assert.equal(surveySendMethodText(SHEETS.mixed, confirm), ' · จากแบบ 2 พื้นที่ (ห้องประชุม · ห้องน้ำ)', String(confirm));
  }
});

test('🔑 surveyTotalsDiff อ่านเฉพาะคีย์ที่ระบุชื่อ — สองคีย์ที่แถวคำตอบของใบจากแบบพกเพิ่ม ไม่ทำให้เกิดบรรทัดส่วนต่าง', () => {
  const totals = { zones: 3, areaSqm: 120, packageQty: 4, packagesBySize: { SM: 1, ST: 3 } };
  const carried = { ...totals, drawingZones: 2, surveyConfirm: 'needed' };
  assert.deepEqual(surveyTotalsDiff(carried, totals), []);
  assert.deepEqual(surveyTotalsDiff(totals, carried), []);
  assert.deepEqual(surveyTotalsDiff(carried, { ...totals, drawingZones: 3, surveyConfirm: 'not_needed' }), []);
  // ตัวเลขที่ฝ่ายขายใช้ตั้งราคาเปลี่ยน = ยังบอกเหมือนเดิม
  assert.deepEqual(surveyTotalsDiff(carried, { ...carried, packageQty: 5, packagesBySize: { SM: 2, ST: 3 } }),
    ['แพ็คเกจ 4 → 5', 'ขนาด SM 1 · ST 3 → SM 2 · ST 3']);
});

/* ══ ③ โมดัลยืนยัน ═════════════════════════════════════════════════════════════════════ */

const DOC = 'RQ-AS-26100312';
const mix = (onsite, drawing) => surveyMethodMix([
  ...Array.from({ length: onsite }, (_, i) => row(`O${i}`, `ลงหน้างาน ${i}`)),
  ...Array.from({ length: drawing }, (_, i) => row(`D${i}`, `จากแบบ ${i}`, { method: 'drawing' })),
]);
const STARTED = { id: 'SVV-1', code: 'SV-26100011', status: 'in_progress', actualDate: '2026-10-13', startTime: '14:05' };
const BOOKED = { id: 'SVV-1', code: 'SV-26100011', status: 'scheduled', actualDate: '2026-10-13', startTime: null };

/* ทุกรูปของอาร์กิวเมนต์ที่โมดัลของวันนี้ส่ง — ผลของแต่ละรูปต้องเท่าเดิมไม่ว่าจะส่ง `method` ที่ไม่มีพื้นที่จากแบบมาหรือไม่ */
const TODAY_FIXTURES = {
  'ไม่ส่งอะไรเลย': {},
  'มีเลขใบ': { docNo: DOC },
  'ปิดนัดที่ช่างกดเริ่มไว้': { docNo: DOC, closesVisit: STARTED },
  'ปิดนัดที่ยังไม่เคยเริ่ม': { docNo: DOC, closesVisit: BOOKED },
  'ส่งกลับค้าง + ขนาดที่ยังไม่ได้เทียบ': {
    docNo: DOC, sendBackPending: { itemCount: 2 }, sizeReview: { text: 'ล็อบบี้ ใช้ขนาด ST ตั้งแต่ก่อนมีข้อเสนอของระบบ' },
  },
  'ออกเอกสารด้วย': { docNo: DOC, closesVisit: BOOKED, issuesDocument: true, warnings: ['หมายเหตุยาวเกินกรอบ', 'หมายเหตุยาวเกินกรอบ'] },
  'ออก Rev ถัดไป': { docNo: DOC, issuesDocument: true, replacesDocNo: 'SU-26100007-1' },
  'ไม่รู้สถานะเอกสาร': { docNo: DOC, documentUnknown: true },
};

test('🔴 surveySendConfirm: ไม่ส่ง method / method ว่าง / ใบไม่มีพื้นที่จากแบบ = ผลเท่าเดิมทุกคีย์ทุกตัวอักษร (ทุกรูปของวันนี้)', () => {
  const noDrawing = [
    undefined, null, {}, { mix: null }, { mix: mix(3, 0), confirm: null, openVisit: null },
    { mix: mix(3, 0), confirm: 'needed', openVisit: { code: 'SV-26100011', status: 'scheduled' } },
    { mix: mix(0, 0), confirm: 'not_needed' }, { mix: { onsite: 2, drawing: 0, mode: 'drawing' } },
  ];
  for (const [name, args] of Object.entries(TODAY_FIXTURES)) {
    const base = surveySendConfirm(args);
    assert.deepEqual(Object.keys(base), ['effects', 'confirmLabel'], name);
    for (const method of noDrawing) {
      assert.deepEqual(surveySendConfirm({ ...args, method }), base, `${name} · ${JSON.stringify(method)}`);
    }
  }
  // ตัวอย่างหนึ่งรูปเขียนตรงตัว — กันทั้งชุดบนเขียวเพราะฐานเพี้ยนไปพร้อมกัน
  assert.deepEqual(surveySendConfirm({ docNo: DOC, closesVisit: STARTED, issuesDocument: true }), {
    effects: [
      ...BASE,
      'ปิดนัด SV-26100011 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่ได้กดส่งงาน · เก็บเวลาเริ่ม 14:05 น. ที่ช่างกดไว้ ไม่ใส่เวลาจบให้',
      'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)',
      END,
    ],
    confirmLabel: 'ส่งผลและปิดนัด',
  });
});

test('⭐ surveySendConfirm · จากแบบทั้งใบ × คำตอบ (ยังไม่เลือก · ต้อง · ไม่ต้อง) × นัด (ไม่มี · กำลังทำ)', () => {
  const tagOf = { needed: [TAG_AWAITING], not_needed: [TAG_FINAL] };
  for (const confirm of [null, 'needed', 'not_needed']) {
    const tag = tagOf[confirm] || [];
    const none = surveySendConfirm({ docNo: DOC, method: { mix: mix(0, 3), confirm, openVisit: null } });
    assert.deepEqual(none, {
      effects: [...BASE, zonesLine(3), ...tag, NO_VISIT, HOLD, END],
      confirmLabel: 'ส่งผล',
      title: 'ส่งผลประเมินจากแบบให้ฝ่ายขาย',
      choice: CHOICE(confirm),
    }, String(confirm));

    const started = surveySendConfirm({
      docNo: DOC, closesVisit: STARTED,
      method: { mix: mix(0, 3), confirm, openVisit: { code: 'SV-26100011', status: 'in_progress' } },
    });
    assert.deepEqual(started, {
      effects: [...BASE, zonesLine(3), ...tag, 'นัด SV-26100011 ที่ช่างกดเริ่มงานไว้จะถูกปิดเป็น “เข้าแล้ว”', HOLD, END],
      confirmLabel: 'ส่งผลและปิดนัด',
      title: 'ส่งผลประเมินจากแบบให้ฝ่ายขาย',
      choice: CHOICE(confirm),
    }, String(confirm));
    // หนึ่งนัดหนึ่งข้อ — ไม่มีข้อ "ปิดนัด … ไปพร้อมกัน" ของใบลงหน้างานซ้อนอีกบรรทัด
    assert.equal(started.effects.filter((line) => line.includes('SV-26100011')).length, 1);
  }
});

test('surveySendConfirm · จากแบบทั้งใบที่ยังมีนัดร่าง / นัดไว้ค้าง: ไม่พูดว่า "ไม่มีนัดที่เปิดอยู่" (ด่านส่งผลตีกลับด้วยประโยคของมันเอง)', () => {
  for (const status of ['draft', 'scheduled']) {
    const view = surveySendConfirm({
      docNo: DOC, method: { mix: mix(0, 2), confirm: 'not_needed', openVisit: { code: 'SV-26100011', status } },
    });
    assert.deepEqual(view.effects, [...BASE, zonesLine(2), TAG_FINAL, HOLD, END], status);
    assert.equal(view.confirmLabel, 'ส่งผล');
  }
});

test('⭐ surveySendConfirm · ใบผสม: หัวเดิมของการส่งผล · ข้อปิดนัดของวันนี้ทุกตัวอักษร · ไม่มีข้อ "ไม่มีการปิดนัด"', () => {
  const visitLine = surveySendConfirm({ docNo: DOC, closesVisit: BOOKED }).effects[2];
  assert.equal(visitLine, 'ปิดนัด SV-26100011 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่เคยกดเริ่มงาน · บันทึกวันเข้าเป็น 13/10/2026 ไม่มีเวลาเข้าจริง');

  const closing = surveySendConfirm({
    docNo: DOC, closesVisit: BOOKED,
    method: { mix: mix(2, 1), confirm: 'needed', openVisit: { code: 'SV-26100011', status: 'scheduled' } },
  });
  assert.deepEqual(closing, {
    effects: [...BASE, zonesLine(1), TAG_AWAITING, visitLine, HOLD, END],
    confirmLabel: 'ส่งผลและปิดนัด',
    title: 'ส่งผลให้ฝ่ายขาย',
    choice: CHOICE('needed'),
  });

  // ใบผสมที่นัดปิดไปแล้ว (ช่างส่งงานเอง) — ไม่มีข้อเรื่องนัดเลย
  const closed = surveySendConfirm({ docNo: DOC, method: { mix: mix(2, 1), confirm: null, openVisit: null } });
  assert.deepEqual(closed.effects, [...BASE, zonesLine(1), HOLD, END]);
  assert.equal(closed.title, 'ส่งผลให้ฝ่ายขาย');
  assert.deepEqual(closed.choice, CHOICE(null));
});

test('🔴 surveySendConfirm · ใบที่มีพื้นที่จากแบบ: ข้อ "เอกสารยังออกไม่ได้" แทนข้อออกเอกสารเสมอ — สวิตช์ออกเอกสารเปิดหรือปิดก็ตาม', () => {
  for (const sheet of [mix(0, 2), mix(1, 1)]) {
    for (const doc of [
      {}, { issuesDocument: true }, { issuesDocument: true, replacesDocNo: 'SU-26100007-1' }, { documentUnknown: true },
      { issuesDocument: true, documentUnknown: true },
    ]) {
      const view = surveySendConfirm({ docNo: DOC, ...doc, method: { mix: sheet, confirm: 'needed', openVisit: null } });
      const at = `${sheet.mode} · ${JSON.stringify(doc)}`;
      assert.equal(view.effects.filter((line) => line === HOLD).length, 1, at);
      assert.equal(view.effects.some((line) => line.startsWith('ออกเอกสารประเมิน')), false, at);
      // "อาจออกเลข SU ด้วย" จะขัดกับข้อบน — ไม่ขึ้นบนใบที่มีพื้นที่จากแบบ
      assert.equal(view.effects.some((line) => line.includes('จะออกเลข SU ด้วย')), false, at);
      assert.equal(view.effects.at(-1), END, at);
    }
  }
});

test('surveySendConfirm · ใบที่มีพื้นที่จากแบบ: ข้อขนาด / ส่งกลับ มาก่อน · คำเตือนของฉบับลูกค้าตามหลังข้อเอกสาร · ป้ายปุ่มกติกาเดิม', () => {
  const view = surveySendConfirm({
    docNo: DOC,
    sizeReview: { text: 'ล็อบบี้ ใช้ขนาด ST ตั้งแต่ก่อนมีข้อเสนอของระบบ' },
    sendBackPending: { itemCount: 2 },
    warnings: ['หมายเหตุยาวเกินกรอบ', 'หมายเหตุยาวเกินกรอบ'],
    method: { mix: mix(1, 2), confirm: 'not_needed', openVisit: null },
  });
  assert.deepEqual(view.effects, [
    ...BASE,
    'ล็อบบี้ ใช้ขนาด ST ตั้งแต่ก่อนมีข้อเสนอของระบบ — ฝ่ายขายจะได้ขนาดตามนี้ · ถ้ายังไม่ได้ตรวจ ปิดกล่องนี้แล้วตรวจที่แท็บสรุปส่งผลก่อน',
    'เรื่องที่ส่งกลับให้ช่างแก้ 2 ข้อ ยังรอช่างแจ้งว่าแก้แล้ว — ส่งผลแล้วช่างแก้ต่อไม่ได้ (ดึงผลกลับมาแก้ = เรื่องนี้กลับมารอช่างอีกครั้ง)',
    zonesLine(2),
    TAG_FINAL,
    HOLD,
    'ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — หมายเหตุยาวเกินกรอบ',
    END,
  ]);
  assert.equal(view.confirmLabel, 'ส่งผล');
});

test('surveySendConfirm · คำตอบที่ไม่ใช่สองค่า = ยังไม่เลือก (value ว่าง · ไม่มีข้อป้ายทะเบียน) — โมดัลไม่เดาแทนหัวหน้า', () => {
  for (const confirm of [undefined, '', 'yes', true, 'NEEDED', 'toString', {}]) {
    const view = surveySendConfirm({ docNo: DOC, method: { mix: mix(0, 1), confirm, openVisit: null } });
    assert.deepEqual(view.choice, CHOICE(null), JSON.stringify(confirm));
    assert.deepEqual(view.effects, [...BASE, zonesLine(1), NO_VISIT, HOLD, END], JSON.stringify(confirm));
  }
});

/* ══ ④ route ส่งผล ═════════════════════════════════════════════════════════════════════ */

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete', 'rpc'];
/* ฐานข้อมูลปลอมของ route (ตัวเดียวกับ `surveyMethodSend.test.mjs`) — กรอง/เรียง/ตัดจริง · เขียนจริงลงตารางในหน่วยความจำ ·
   จดทุกคำสั่งตามลำดับ (`events`) */
function fakeDb(tables) {
  const events = [];
  const db = {
    events,
    tables,
    async rpc(name, args) {
      events.push({ op: 'rpc', name, args });
      return { data: null, error: { code: 'PGRST202', message: `function ${name} does not exist` } };
    },
    auth: { admin: { async getUserById() { return { data: { user: null }, error: { status: 404, message: 'User not found' } }; } } },
    from(table) {
      const q = { op: 'select', table, select: null, filters: [], orders: [], limit: null, values: null };
      const matches = (r) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return r[col] === val;
        if (op === 'neq') return r[col] !== val;
        if (op === 'in') return val.includes(r[col]);
        if (op === 'is') return (r[col] ?? null) === val;
        return true;
      });
      let done = null;
      const run = () => {
        if (done) return done;
        events.push(q);
        if (q.op === 'insert' || q.op === 'upsert') {
          const rows = (Array.isArray(q.values) ? q.values : [q.values]).map((r) => structuredClone(r));
          tables[table] = [...(tables[table] || []), ...rows];
          done = { data: rows.map((r) => structuredClone(r)), error: null };
          return done;
        }
        let rows = (tables[table] || []).filter(matches);
        if (q.op === 'update') {
          rows.forEach((r) => Object.assign(r, structuredClone(q.values)));
          done = { data: rows.map((r) => structuredClone(r)), error: null };
          return done;
        }
        if (q.op === 'delete') {
          tables[table] = (tables[table] || []).filter((r) => !rows.includes(r));
          done = { data: rows, error: null };
          return done;
        }
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col]; const y = b[col];
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        done = { data: rows.map((r) => structuredClone(r)), error: null };
        return done;
      };
      const one = () => Promise.resolve().then(run).then(({ data, error }) => (
        error ? { data: null, error } : { data: data[0] || null, error: null }
      ));
      const known = {
        select(cols) { if (q.op === 'select') q.select = cols; return chain; },
        insert(values) { q.op = 'insert'; q.values = values; return chain; },
        upsert(values) { q.op = 'upsert'; q.values = values; return chain; },
        update(values) { q.op = 'update'; q.values = values; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        maybeSingle() { return one(); },
        single() { return one(); },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      // ตัวกรองที่ของปลอมไม่รู้จัก = ปล่อยผ่าน — เส้นของกระดิ่งใช้ตัวกรองที่เทสต์ชุดนี้ไม่ได้ตัดสิน
      const chain = new Proxy(known, { get: (target, prop) => (prop in target ? target[prop] : () => chain) });
      return chain;
    },
  };
  return db;
}

const HEAD = { id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] };
const REQUEST_ID = 'DR-synthetic-0001';
const VISIT_ID = 'SVV-1';
const VISIT_SHAPES = {
  scheduled: { status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null },
  done: {},
};

/* โลกปลอมจากแฝดสังเคราะห์ของเอกสารประเมิน — ใบสองพื้นที่ที่ผ่านทุกด่าน (ไฟล์ครบทั้งชุดลงหน้างานและชุดจากแบบ) · ยังไม่ส่งผล
   `drawing` = id ของแถวที่เป็นจากแบบ (`'all'` = ทั้งใบ) · `thread` = แถวเธรดที่มีอยู่ก่อน */
function makeWorld({ visit: visitShape = 'none', drawing = [], thread = [] } = {}) {
  const source = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const request = {
    ...source.request,
    dept: 'TS', status: 'acknowledged', requestedById: 'U-sale',
    answeredAt: null, answeredById: null, answeredByName: null,
    siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1',
  };
  const visitRow = {
    id: VISIT_ID, requestId: request.id, kind: 'survey', createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
    ...source.visit, assistantIds: [], ...(VISIT_SHAPES[visitShape] || {}),
  };
  const isDrawing = (z) => drawing === 'all' || drawing.includes(z.id);
  const tables = {
    dept_requests: [request],
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...z }) => ({
      ...z, requestId: request.id, ...(isDrawing(z) ? { method: 'drawing' } : {}),
    })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_visits: visitShape === 'none' ? [] : [visitRow],
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    entity_updates: thread.map((r) => ({ entityType: 'dept_request', entityId: request.id, ...r })),
    audit_logs: [],
    notifications: [],
  };
  const db = fakeDb(tables);
  return {
    db, tables,
    request: () => tables.dept_requests[0],
    zones: () => tables.service_survey_zones,
    writes: () => db.events.filter((e) => WRITE_OPS.includes(e.op)),
    answerWrite: () => db.events.find((e) => e.table === 'dept_requests' && e.op === 'update' && 'answeredAt' in e.values),
    answerRow: () => tables.entity_updates.find((r) => r.entityType === 'dept_request' && r.kind === 'answer' && r.meta?.totals),
    audit: () => tables.audit_logs.find((r) => r.entityType === 'dept_request'),
  };
}

async function send(world, { user = HEAD, body = {} } = {}) {
  globalThis.__sendChoiceTest = { user, supabase: world.db };
  const req = new Request(`http://localhost/api/service/surveys/${REQUEST_ID}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: REQUEST_ID }) });
  return { status: res.status, json: await res.json() };
}
const drawingOn = () => { process.env.SURVEY_DRAWING_METHOD = 'on'; };
const drawingOff = () => { delete process.env.SURVEY_DRAWING_METHOD; };
const FLAGS = [['สวิตช์ปิด', drawingOff], ['สวิตช์เปิด', drawingOn]];
const ZONE_1 = 'SVZ-syn-1';
const ZONE_2 = 'SVZ-syn-2';
const ZONE_2_NAME = 'ห้องที่2';
const PATCH_KEYS_TODAY = ['answeredAt', 'answeredById', 'answeredByName', 'status', 'updatedAt'];
/* บรรทัดส่งผลของใบลงหน้างานจากแฝดสังเคราะห์ — พิมพ์ตรงตัว: ท่อนของวิธีประเมินต้องไม่โผล่ และคำอื่นต้องไม่ขยับ
   ใบที่มีพื้นที่จากแบบ = บรรทัดเดียวกันนี้ที่มีท่อนต่อท้าย **หลังยอดแพ็คเกจ** (`withTail`) */
const PACKAGES = '2 แพ็คเกจ (SM 1 · ST 1)';
const ONSITE_THREAD_BODY = `TS ตอบเรื่องนี้แล้ว — 2 พื้นที่ · 173.31 ตร.ม. · ${PACKAGES} — ขอไป 1 พื้นที่ · TS เพิ่ม 1 ⇒ ประเมินจริง 2 พื้นที่ — รอผู้ขอปิดเรื่อง`;
const ONSITE_AUDIT_SUMMARY = `ส่งผลประเมิน RQ-AS-26090186 — 2 พื้นที่ · 173.31 ตร.ม. · ${PACKAGES} · ขอไป 1 พื้นที่ · TS เพิ่ม 1 ⇒ ประเมินจริง 2 พื้นที่`;
const withTail = (line, tail) => line.replace(PACKAGES, `${PACKAGES}${tail}`);

test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
});
test.afterEach(() => { drawingOff(); delete globalThis.__sendChoiceTest; });

test('fixture ของ route: สองพื้นที่ · ทั้งใบ / หนึ่งแถว เป็นจากแบบได้โดยยังผ่านด่านรายหัวข้อ', () => {
  const world = makeWorld({ drawing: [ZONE_2] });
  assert.deepEqual(world.zones().map((z) => z.id), [ZONE_1, ZONE_2]);
  assert.deepEqual(mixOf(world.zones()), { onsite: 1, drawing: 1 });
  assert.equal(world.zones()[1].zoneName, ZONE_2_NAME);
  assert.deepEqual(mixOf(makeWorld({ drawing: 'all' }).zones()), { onsite: 0, drawing: 2 });
});

test('🔴 route · ใบจากแบบทั้งใบที่ยังไม่ได้เลือก = 400 ข้อความตรงตัว · ไม่เขียนอะไรเลย (สวิตช์เปิดหรือปิดก็ตาม)', async () => {
  for (const [flag, set] of FLAGS) {
    for (const surveyConfirm of [undefined, null, '', 'yes', true]) {
      const world = makeWorld({ drawing: 'all' });
      set();
      const { status, json } = await send(world, { body: { methodMix: { onsite: 0, drawing: 2 }, surveyConfirm } });
      const at = `${flag} · ${JSON.stringify(surveyConfirm)}`;
      assert.equal(status, 400, at);
      assert.equal(json.error, MISSING, at);
      assert.deepEqual(world.writes(), [], at);
      assert.equal(world.request().answeredAt, null, at);
      // ตีกลับก่อนด่านหกข้อ — ยังไม่อ่านไฟล์ของพื้นที่ ยังไม่ถามนัด
      assert.equal(world.db.events.some((e) => e.table === 'attachments' || e.table === 'service_visits'), false, at);
    }
  }
});

test('🔴 route · สัดส่วนวิธีประเมินที่จอส่งมาไม่ตรงกับแถว / ไม่ส่งมาบนใบที่มีพื้นที่จากแบบ = 409 · ไม่เขียนอะไรเลย', async () => {
  const cases = [
    ['ใบผสม · จอยังเห็นเป็นลงหน้างานล้วน', [ZONE_2], { methodMix: { onsite: 2, drawing: 0 }, surveyConfirm: 'needed' }],
    ['ใบผสม · จอรุ่นเก่าไม่ส่งสัดส่วน', [ZONE_2], { closeVisitId: null }],
    ['ใบผสม · ส่งแต่คำตอบ', [ZONE_2], { surveyConfirm: 'needed' }],
    ['จากแบบทั้งใบ · จอเห็นเป็นผสม', 'all', { methodMix: { onsite: 1, drawing: 1 }, surveyConfirm: 'not_needed' }],
    ['จากแบบทั้งใบ · ไม่ส่งอะไรเลย', 'all', {}],
    ['ลงหน้างานล้วน · จอเห็นว่ามีพื้นที่จากแบบ (สลับกลับไปแล้ว)', [], { methodMix: { onsite: 1, drawing: 1 }, surveyConfirm: 'needed' }],
  ];
  for (const [flag, set] of FLAGS) {
    for (const [name, drawing, body] of cases) {
      const world = makeWorld({ visit: 'done', drawing });
      set();
      const { status, json } = await send(world, { body });
      const at = `${flag} · ${name}`;
      assert.equal(status, 409, at);
      assert.equal(json.error, MOVED, at);
      assert.deepEqual(world.writes(), [], at);
      assert.equal(world.request().answeredAt, null, at);
    }
  }
});

test('⭐ route · จากแบบทั้งใบ + เลือกแล้ว: คำตอบลงคอลัมน์ surveyConfirm · ท่อนต่อท้ายเธรดและ audit · meta.totals พกสองคีย์ · คำตอบของ route เท่าเดิม', async () => {
  for (const [flag, set] of FLAGS) {
    for (const surveyConfirm of ['needed', 'not_needed']) {
      const world = makeWorld({ drawing: 'all' });
      set();
      const { status, json } = await send(world, { body: { methodMix: { onsite: 0, drawing: 2 }, surveyConfirm } });
      const at = `${flag} · ${surveyConfirm}`;
      assert.equal(status, 200, `${at}: ${json.error}`);

      const answer = world.answerWrite();
      assert.deepEqual(Object.keys(answer.values), [...PATCH_KEYS_TODAY, 'surveyConfirm'], at);
      assert.equal(answer.values.surveyConfirm, surveyConfirm, at);
      assert.equal(world.request().surveyConfirm, surveyConfirm, at);
      assert.equal(world.request().status, 'answered', at);

      const totals = surveyTotals(world.zones());
      assert.equal(surveyPackagesText(totals), PACKAGES);
      const tail = ` · ประเมินจากแบบทั้งใบ · ${surveyConfirm === 'needed' ? 'ต้องยืนยันหน้างาน' : 'ไม่ต้องยืนยันหน้างาน'}`;
      const row = world.answerRow();
      assert.equal(row.body, withTail(ONSITE_THREAD_BODY, tail), at);
      assert.equal(world.audit().summary, withTail(ONSITE_AUDIT_SUMMARY, tail), at);
      assert.deepEqual(row.meta.totals, { ...totals, drawingZones: 2, surveyConfirm }, at);
      // คำตอบของ route ไม่ได้คีย์ใหม่ — `totals` คือยอดของใบตัวเดิม
      assert.deepEqual(json.totals, JSON.parse(JSON.stringify(totals)), at);
      assert.deepEqual(Object.keys(json), ['request', 'totals', 'closedVisit', 'report'], at);
    }
  }
});

test('⭐ route · ใบผสม + เลือกแล้ว: ท่อนต่อท้ายเอ่ยชื่อพื้นที่จากแบบ · สัดส่วนที่มาเป็นสตริงก็ผ่าน', async () => {
  drawingOn();
  const world = makeWorld({ visit: 'done', drawing: [ZONE_2] });
  const { status, json } = await send(world, { body: { methodMix: { onsite: '1', drawing: '1' }, surveyConfirm: 'needed' } });
  assert.equal(status, 200, json.error);
  assert.equal(world.answerWrite().values.surveyConfirm, 'needed');
  const tail = ` · จากแบบ 1 พื้นที่ (${ZONE_2_NAME}) · ต้องยืนยันหน้างาน`;
  assert.equal(surveySendMethodText(world.zones(), 'needed'), tail);
  assert.equal(world.answerRow().body, withTail(ONSITE_THREAD_BODY, tail));
  assert.equal(world.audit().summary, withTail(ONSITE_AUDIT_SUMMARY, tail));
  assert.deepEqual(world.answerRow().meta.totals, { ...surveyTotals(world.zones()), drawingZones: 1, surveyConfirm: 'needed' });
});

test('🔴 route · ใบลงหน้างานล้วน: คำสั่งตอบใบไม่มีคีย์ surveyConfirm · บรรทัดเธรดและ audit ตัวเดิมทุกตัวอักษร · meta.totals = ยอดของใบ', async () => {
  const bodies = [
    ['จอของวันนี้ (ไม่ส่งสองคีย์)', {}],
    ['จอรุ่นใหม่ส่งสัดส่วนที่ตรงมา', { methodMix: { onsite: 2, drawing: 0 } }],
    ['ส่งคำตอบมาด้วยทั้งที่ไม่มีพื้นที่จากแบบ', { methodMix: { onsite: 2, drawing: 0 }, surveyConfirm: 'needed' }],
  ];
  for (const [flag, set] of FLAGS) {
    for (const [name, body] of bodies) {
      const world = makeWorld({ visit: 'done' });
      set();
      const { status, json } = await send(world, { body });
      const at = `${flag} · ${name}`;
      assert.equal(status, 200, `${at}: ${json.error}`);
      assert.deepEqual(Object.keys(world.answerWrite().values), PATCH_KEYS_TODAY, at);
      assert.equal('surveyConfirm' in world.request(), false, at);

      const row = world.answerRow();
      assert.equal(row.body, ONSITE_THREAD_BODY, at);
      assert.equal(world.audit().summary, ONSITE_AUDIT_SUMMARY, at);
      assert.deepEqual(row.meta.totals, JSON.parse(JSON.stringify(surveyTotals(world.zones()))), at);
      assert.equal('drawingZones' in row.meta.totals, false, at);
      assert.equal('surveyConfirm' in row.meta.totals, false, at);
    }
  }
});

test('route · ยอดของรอบก่อนที่พกสองคีย์ของใบจากแบบ ไม่ทำให้บรรทัดส่งผลรอบใหม่ขึ้น "แก้จากรอบก่อน"', async () => {
  const seed = makeWorld({ drawing: 'all' });
  const totals = surveyTotals(seed.zones());
  const world = makeWorld({
    drawing: 'all',
    thread: [{
      id: 'EUP-OLD', kind: 'answer', body: 'รอบก่อน', createdAt: '2026-09-20T02:00:00.000+00:00',
      meta: { totals: { ...totals, drawingZones: 1, surveyConfirm: 'needed' } },
    }],
  });
  const { status, json } = await send(world, { body: { methodMix: { onsite: 0, drawing: 2 }, surveyConfirm: 'not_needed' } });
  assert.equal(status, 200, json.error);
  const row = world.tables.entity_updates.find((r) => r.kind === 'answer' && r.id !== 'EUP-OLD');
  assert.equal(row.body, withTail(ONSITE_THREAD_BODY, ' · ประเมินจากแบบทั้งใบ · ไม่ต้องยืนยันหน้างาน'));

  // เทียบ: ยอดของรอบก่อนต่างจริง (แพ็คเกจ) = ยังบอกส่วนต่างเหมือนเดิม — ตัวอ่านฐานยังทำงาน ไม่ใช่เงียบเพราะอ่านไม่เจอ
  const changed = makeWorld({
    drawing: 'all',
    thread: [{
      id: 'EUP-OLD', kind: 'answer', body: 'รอบก่อน', createdAt: '2026-09-20T02:00:00.000+00:00',
      meta: { totals: { ...totals, packageQty: 5, drawingZones: 1, surveyConfirm: 'needed' } },
    }],
  });
  assert.equal((await send(changed, { body: { methodMix: { onsite: 0, drawing: 2 }, surveyConfirm: 'not_needed' } })).status, 200);
  const next = changed.tables.entity_updates.find((r) => r.kind === 'answer' && r.id !== 'EUP-OLD');
  assert.ok(next.body.includes('⚠️ แก้จากรอบก่อน: แพ็คเกจ 5 → 2'), next.body);
});

test('🔴 route · สวิตช์เปิด: ใบจากแบบที่เลือกครบแล้ว แต่แถวคำร้องถูกแตะหลังอ่าน (มีคนสลับวิธี) = 409 ของงวด S1 · ใบไม่ถูกตอบ', async () => {
  drawingOn();
  const world = makeWorld({ drawing: 'all' });
  world.request().updatedAt = '2026-09-24T07:30:00.000000+00:00';
  const from = world.db.from.bind(world.db);
  let touched = false;
  world.db.from = (table) => {
    if (table === 'service_package_sizes' && !touched) {
      touched = true;
      world.request().updatedAt = '2026-09-24T08:00:01.000000+00:00';
    }
    return from(table);
  };
  const { status, json } = await send(world, { body: { methodMix: { onsite: 0, drawing: 2 }, surveyConfirm: 'needed' } });
  assert.equal(touched, true);
  assert.equal(status, 409);
  assert.equal(json.error, MOVED);
  assert.equal(world.request().answeredAt, null);
  assert.equal('surveyConfirm' in world.request(), false, 'คำตอบไม่ถูกเขียนลงใบที่ส่งไม่สำเร็จ');
  assert.deepEqual(world.writes().filter((e) => e.op === 'insert'), [], 'ไม่มีบรรทัดเธรด ไม่มี audit ไม่มีกระดิ่ง');
});
