// ── ทะเบียนหัวข้อที่ประกอบจากบ้านของแต่ละฝ่าย (P7a) ─────────────────────
//
// ⭐ เทสต์ชุดนี้มีหน้าที่เดียว: **กันไม่ให้การแยกโฟลเดอร์กลายเป็นการแยกกฎ**
// หัวข้อย้ายบ้านได้ แต่ชุดหัวข้อ ฝ่ายเจ้าของ และธงของแต่ละตัวต้องเท่าเดิมเป๊ะ
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { KINDS_BY_OWNER, REQUEST_KINDS, VALID_ANSWER_VIA, assertKind } from './registry.js';
import {
  REQUEST_DEPTS, REQUEST_KIND_LIST, kindsForDept, requestKindFamily,
} from '../../master/requestTypes.js';

// ชุดหัวข้อ ณ วันที่แยกโฟลเดอร์ — เพิ่ม/ลบหัวข้อต้องมาแก้ลิสต์นี้ด้วยความตั้งใจ
// ไม่ใช่หลุดไปเพราะ import พลาดแล้วไม่มีใครรู้ว่าหัวข้อหายไปหนึ่งตัว
const EXPECTED = [
  'info', 'document',                                  // ไม่เป็นของฝ่ายไหน
  'scent_dev', 'formula_dev',                          // RD
  'material_eta',                                      // PC
  'billing_doc',                                       // FN
  'site_survey',                                       // TS
];

test('ทะเบียนได้หัวข้อครบเท่าเดิม — แยกโฟลเดอร์แล้วต้องไม่มีตัวไหนหล่นหาย', () => {
  assert.deepEqual([...REQUEST_KIND_LIST].sort(), [...EXPECTED].sort());
});

test('ธง dept ต้องตรงกับโฟลเดอร์ที่หัวข้อนั้นอยู่', () => {
  // ⚠️ ผิดข้อนี้ = หัวข้อไปโผล่ในลิสต์ของฝ่ายที่ไม่ได้เป็นเจ้าของมัน ซึ่งคนที่แก้
  // โฟลเดอร์ตัวเองจะมองไม่เห็นเลยว่าทำอะไรพัง
  for (const dept of REQUEST_DEPTS) {
    for (const kind of KINDS_BY_OWNER[dept]) {
      assert.equal(REQUEST_KINDS[kind].dept, dept, `${kind} อยู่โฟลเดอร์ ${dept}`);
    }
  }
  // ของกลางต้องไม่ล็อกฝ่าย — ล็อกเมื่อไรก็หายจากลิสต์ของอีกฝ่ายทันที
  for (const kind of KINDS_BY_OWNER.shared) {
    assert.equal(REQUEST_KINDS[kind].dept, null, `${kind} เป็นของกลาง ห้ามล็อกฝ่าย`);
  }
  // ทุกหัวข้อต้องมีบ้าน — ไม่มีตัวไหนลอยอยู่นอกทั้งสามกอง
  const owned = Object.values(KINDS_BY_OWNER).flat();
  assert.deepEqual([...owned].sort(), [...REQUEST_KIND_LIST].sort());
});

test('ทะเบียนแช่แข็ง — เขียนทับตอนรันไทม์ไม่ได้', () => {
  assert.ok(Object.isFrozen(REQUEST_KINDS));
});

test('หัวข้อของกลางอยู่ในลิสต์ของทุกฝ่ายที่เปิดใช้ · หัวข้อที่ล็อกฝ่ายอยู่ฝ่ายเดียว', () => {
  for (const dept of REQUEST_DEPTS) {
    const list = kindsForDept(dept);
    for (const kind of KINDS_BY_OWNER.shared) assert.ok(list.includes(kind), `${dept} ต้องมี ${kind}`);
  }
  assert.ok(kindsForDept('RD').includes('scent_dev'));
  // ⚠️ **ขอเอกสารล็อกที่ RD แล้ว** (มติผู้ใช้ 2026-08-08) — เดิมเป็นของกลาง
  assert.ok(kindsForDept('RD').includes('document'));
  assert.ok(!kindsForDept('RD').includes('material_eta'));
  // ⭐ **FN เปิดแล้ว** (มติผู้ใช้ 2026-08-15 · ม-ก) — ต้องมีหัวข้อของตัวเองอย่างน้อยหนึ่ง
  // ไม่งั้นเลือกฝ่ายแล้วเจอลิสต์ว่าง ซึ่งเป็นทางตันที่ไม่มีข้อความอธิบาย
  assert.ok(kindsForDept('FN').includes('billing_doc'));
  assert.ok(!kindsForDept('FN').includes('document'), 'ขอเอกสารของ RD ต้องไม่ปนมาที่บัญชี');
  // ฝ่ายที่ปิดเก็บไว้ก่อนต้องไม่มีหัวข้อให้เปิดใบใหม่เลย — ไม่ใช่มีแต่กดแล้วตกที่ server
  for (const parked of ['PC']) {
    assert.deepEqual(kindsForDept(parked), [], `${parked} ปิดอยู่ ต้องไม่มีหัวข้อ`);
  }
});

test('🐞 หัวกลุ่มห้ามโผล่ซ้ำ — ตระกูลต้องติดกันในลิสต์ที่คืนให้ดรอปดาวน์', () => {
  // ของจริงบนจอตอน PR #1003: ฝ่าย RD ได้ "ทั่วไป → งานพัฒนา → ขอราคา → ทั่วไป"
  // เพราะ `สอบถามข้อมูล` อยู่ต้นทะเบียนแต่ `ขอเอกสาร` อยู่ท้าย
  for (const dept of REQUEST_DEPTS) {
    const families = kindsForDept(dept).map(requestKindFamily);
    const seen = new Set();
    let previous = null;
    for (const family of families) {
      if (family === previous) continue;
      assert.ok(!seen.has(family), `${dept}: หัวกลุ่ม "${family}" โผล่ซ้ำ`);
      seen.add(family);
      previous = family;
    }
  }
});

test('หัวข้อที่ถูกถอดต้องหายจากทะเบียนทั้งตัว', () => {
  // ⭐ `scent_brief` · `mockup` เคยติดธง `legacy` (อ่านได้ เปิดใบใหม่ไม่ได้) เพราะ
  // ใบเก่าต้องมีป้ายชื่อ · เหตุผลนั้นหมดอายุเมื่อทั้งคู่เหลือ 0 แถวบน prod ⇒ ลบใน 0220
  for (const kind of ['scent_brief', 'mockup']) {
    assert.equal(REQUEST_KINDS[kind], undefined, `${kind} ต้องไม่อยู่ในทะเบียนแล้ว`);
  }
  // ⚠️ ขอราคา F/FB/PM **ถูกถอดทั้งหัวข้อ** ใน mig 0219 (ม-28) — ไม่ใช่ติดธง legacy
  // แต่หายจากทะเบียนไปเลย เพราะราคากลายเป็นขั้นสุดท้ายของสองหัวข้อพัฒนา
  for (const kind of ['price_f', 'price_fb', 'price_pm']) {
    assert.equal(REQUEST_KINDS[kind], undefined, `${kind} ต้องไม่อยู่ในทะเบียนแล้ว`);
  }
});

// ── ด่านตอนโหลดต้องยิงจริง ─────────────────────────────────────────────
// ⚠️ หัวข้อที่ประกาศผิดต้องทำให้ **build พัง** ไม่ใช่รอให้มีคนเปิดคำร้องหัวข้อนั้น
// จริงบน prod แล้วค่อยเจอ — บั๊ก #973 (เปิดคำร้องไม่ได้เลยทุกหัวข้อ) เป็นแบบนั้นเป๊ะ
const OK = { key: 'x', label: 'ทดสอบ', scope: 'RQ', dept: null };

test('ด่านทะเบียนรับหัวข้อที่ถูกต้อง', () => {
  assert.doesNotThrow(() => assertKind(OK));
});

test('ด่านทะเบียนตีกลับหัวข้อที่ประกาศผิดทุกแบบ', () => {
  const bad = [
    ['ไม่มี key', { ...OK, key: undefined }],
    ['ไม่มี label', { ...OK, label: undefined }],
    ['ไม่มี scope', { ...OK, scope: undefined }],
    ['ฝ่ายที่ CHECK ไม่รับ', { ...OK, dept: 'PD' }],
    ['needs ที่ไม่มีจริง', { ...OK, needs: ['ลูกค้า'] }],
    ['lineShape ที่ไม่รู้จัก', { ...OK, hasItems: true, lineShape: 'อะไรสักอย่าง' }],
    ['hasTiers โดยไม่มีบรรทัด', { ...OK, hasTiers: true }],
    ['lineShape โดยไม่มีบรรทัด', { ...OK, lineShape: 'document' }],
  ];
  for (const [why, kind] of bad) assert.throws(() => assertKind(kind), undefined, why);
});

test('ด่านทะเบียนจับ key ซ้ำ — สองฝ่ายตั้งชื่อชนกันได้จริงเมื่อแยกโฟลเดอร์แล้ว', () => {
  assert.throws(() => assertKind(OK, new Set(['x'])));
});

// ── ข้อความบนฟอร์มเป็นของหัวข้อ ไม่ใช่ของตัวฟอร์ม ────────────────────────
test('ทุกหัวข้อมีข้อความครบทุกช่อง — ไม่มีตัวไหนตกไปใช้ค่ากลางโดยไม่ตั้งใจ', () => {
  const KEYS = ['titleLabel', 'titlePlaceholder', 'bodyLabel', 'bodyPlaceholder'];
  for (const [kind, meta] of Object.entries(REQUEST_KINDS)) {
    for (const key of KEYS) assert.ok(meta.form?.[key], `${kind}: ขาด form.${key}`);
  }
  // หัวข้อที่ยังเปิดใบใหม่ได้ต้องมี placeholder **ของตัวเอง** ไม่ใช่ค่ากลาง
  // (บั๊กเดิม: ข้อความผูกกับ scent_brief/mockup ซึ่งเปิดใบใหม่ไม่ได้แล้ว ⇒ หัวข้อที่
  //  ใช้จริงทุกตัวขึ้น "อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ" เหมือนกันหมด)
  // ข้อความกลางจริง ๆ ใน FORM_DEFAULTS — ไม่ใช่ของหัวข้อไหน
  const GENERIC_BODY = 'อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ';
  for (const dept of REQUEST_DEPTS) {
    for (const kind of kindsForDept(dept)) {
      assert.notEqual(
        REQUEST_KINDS[kind].form.titlePlaceholder, 'สรุปสั้น ๆ ว่าขออะไร',
        `${kind}: ยังใช้ placeholder กลางของชื่อเรื่อง`,
      );
      assert.notEqual(
        REQUEST_KINDS[kind].form.bodyPlaceholder, GENERIC_BODY,
        `${kind}: ยังใช้ placeholder กลางของรายละเอียด`,
      );
    }
  }
});

test('ฟอร์มไม่ตัดสินอะไรจากชื่อหัวข้อเองอีกแล้ว', () => {
  // ⚠️ ratchet: `kind === '...'` ในฟอร์มคือทางที่บั๊กเดิมเข้ามา — หัวข้อใหม่ที่ไม่มีชื่อ
  // อยู่ในเงื่อนไขจะตกไปใช้ค่ากลางโดยไม่มีอะไรเตือน · ทุกอย่างต้องอ่านจากทะเบียน
  const src = readFileSync('src/components/requests/RequestForm.js', 'utf8');
  const hits = src.split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .filter((line) => /\bkind === ["']/.test(line) && !/item\.kind/.test(line));
  assert.deepEqual(hits, []);
});


test('ตัวอ่านรูปทรงต้องได้ "ทั้งใบ" ไม่ใช่ `.kind`', () => {
  /* 🔴 ratchet ของงานรูปแบบงาน (2026-09-09) — `requestUsesPdr(req.kind)` เขียนถูก
     ไวยากรณ์และ **ไม่พังตอน build** แต่ทำให้ใบ NPD ถูกตัดสินด้วยรูปแบบตั้งต้นเงียบ ๆ
     ⇒ จอโชว์แบบฟอร์ม PDR แต่เซิร์ฟเวอร์ตอบ "หัวข้อนี้ไม่มีแบบฟอร์ม PDR"
     ⚠️ สแกนทั้ง src ไม่ใช่แค่ไฟล์เดียว — ด่านพวกนี้กระจายอยู่ทั้งจอ ลิบ และ API */
  const READERS = ['requestUsesPdr', 'requestUsesItems', 'requestUsesDeliveredRows', 'requestLineShape',
    'requestPdrScentSource', 'requestUsesScentBriefs', 'requestPdrRowsPickScent'];
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(js|mjs)$/.test(f))
    // ไฟล์นี้เองเขียนแพตเทิร์นไว้ในสตริงของ regex — ไม่งั้นเทสต์จับตัวเอง
    .filter((f) => !f.endsWith('kinds/registry.test.mjs'))
    /* 🪤 `git ls-files` คือ **ทะเบียน** ไม่ใช่สิ่งที่อยู่บนดิสก์ — ไฟล์ที่เพิ่งลบแต่ยังไม่ stage
       ยังอยู่ในลิสต์ ⇒ `readFileSync` โยน ENOENT แล้วเทสต์ทั้งชุดแดงเพราะการลบไฟล์ ไม่ใช่เพราะบั๊ก
       (เจอตอนถอดเส้น "ไม่พบจุดนี้หน้างาน" ทิ้ง) · ไฟล์ที่ยังอยู่ถูกสแกนครบเหมือนเดิม */
    .filter((f) => existsSync(f));
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
      for (const fn of READERS) {
        // ⚠️ จับเฉพาะ **อาร์กิวเมนต์ตัวแรกที่เป็น `x.kind` ตรง ๆ** — object literal
        // `{ kind: req.kind, variant }` คือการส่งทั้งรูปทรงอย่างถูกต้อง ไม่ใช่บั๊ก
        if (new RegExp(`\\b${fn}\\(\\s*[\\w.?]+\\.kind\\s*[,)]`).test(line)) hits.push(`${file}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

/* ⭐ ทางตอบเฉพาะของหัวข้อ + ปิดเรื่องหลังได้ผล (มติเจ้าของ 24/09 ข้อ 1 · 3) — ธงของหัวข้อ ไม่ใช่เทียบชื่อหัวข้อ */
test('ด่านทะเบียนตรวจ answerVia / closeNeedsAnswer — ค่าที่ไม่รู้จักหรือผิดชนิด = build พัง', () => {
  assert.doesNotThrow(() => assertKind({ ...OK, answerVia: 'survey_send', closeNeedsAnswer: true }));
  assert.throws(() => assertKind({ ...OK, answerVia: 'survey_sent' }), /answerVia/,
    'คีย์ที่ไม่มีทางพาไป = ปุ่มกลางหายแต่ไม่มีลิงก์ขึ้นแทน ⇒ ใบตอบไม่ได้เลย');
  assert.throws(() => assertKind({ ...OK, closeNeedsAnswer: 'yes' }), /closeNeedsAnswer/);
  assert.deepEqual(VALID_ANSWER_VIA, ['survey_send']);
});

test('ใบประเมินพื้นที่ประกาศทั้งสองธง · หัวข้ออื่นไม่มีสักตัว', () => {
  assert.equal(REQUEST_KINDS.site_survey.answerVia, 'survey_send');
  assert.equal(REQUEST_KINDS.site_survey.closeNeedsAnswer, true);
  for (const [key, kind] of Object.entries(REQUEST_KINDS)) {
    if (key === 'site_survey') continue;
    assert.equal(kind.answerVia, undefined, key);
    assert.equal(kind.closeNeedsAnswer, undefined, key);
  }
});

/* ── ประเมินจากแบบ งวด 4 (S4 §2.1) — คีย์ใหม่ของ "วิธี" ที่ฝ่ายขายเลือกตอนยื่น ─────────────────
   ⭐ ด่านใหม่ทุกตัวต้องยิงจริงบนตัวอย่างที่ผิด — ด่านที่ไม่เคยเห็นมันทำงานคือด่านที่อาจพังเงียบมานานแล้ว */
const WITH_VARIANTS = {
  ...OK,
  defaultVariant: 'a',
  form: { resultDueLabel: 'วันรับผล' },
  variants: { a: { label: 'A' }, b: { label: 'B' } },
};

test('S4 · ทะเบียนรับคีย์ใหม่ระดับหัวข้อและระดับรูปแบบที่ประกาศถูก', () => {
  assert.doesNotThrow(() => assertKind({
    ...WITH_VARIANTS,
    variantLabel: 'วิธี',
    variantRequired: true,
    variantRequiredError: 'ต้องเลือกวิธี',
    variantLockAfterSubmit: true,
    variantLockText: 'ส่งแล้ว',
    variantAskedLabel: 'วิธีที่ขอ',
    variants: {
      a: { label: 'A', description: 'คำอธิบาย', switchConfirm: { title: 'ท', description: 'ด' } },
      b: {
        label: 'B',
        notice: 'ประกาศ',
        resultDateOnly: true,
        form: { bodyPlaceholder: 'ช่องรายละเอียด' },
        requiredFiles: { docType: 'spec', label: 'แบบ', hint: 'ไฟล์', accept: '.pdf', rejectText: 'ไม่รับ' },
      },
    },
  }));
});

test('S4 · ด่านทะเบียนตีกลับคีย์ใหม่ที่ประกาศผิดทุกแบบ', () => {
  const v = (b) => ({ ...WITH_VARIANTS, variants: { a: { label: 'A' }, b: { label: 'B', ...b } } });
  const RF = { docType: 'spec', label: 'แบบ', hint: 'ไฟล์', accept: '.pdf', rejectText: 'ไม่รับ' };
  const bad = [
    ['variantRequired ไม่ใช่บูลีน', { ...WITH_VARIANTS, variantRequired: 'yes', variantRequiredError: 'x' }],
    ['variantRequired โดยไม่มีข้อความ', { ...WITH_VARIANTS, variantRequired: true }],
    ['variantRequiredError ว่าง', { ...WITH_VARIANTS, variantRequired: true, variantRequiredError: '  ' }],
    ['variantLockAfterSubmit ไม่ใช่บูลีน', { ...WITH_VARIANTS, variantLockAfterSubmit: 1, variantLockText: 'x', variantAskedLabel: 'y' }],
    ['variantLockAfterSubmit โดยไม่มีข้อความล็อก', { ...WITH_VARIANTS, variantLockAfterSubmit: true, variantAskedLabel: 'y' }],
    ['variantLockAfterSubmit โดยไม่มีป้ายวิธีที่ขอ', { ...WITH_VARIANTS, variantLockAfterSubmit: true, variantLockText: 'x' }],
    ['variantLabel ว่าง', { ...WITH_VARIANTS, variantLabel: '' }],
    ['variantAskedLabel ไม่ใช่สตริง', { ...WITH_VARIANTS, variantAskedLabel: 3 }],
    ['variantLabel บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantLabel: 'วิธี' }],
    ['variantRequired บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantRequired: false }],
    ['variantRequiredError บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantRequiredError: 'x' }],
    ['variantLockAfterSubmit บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantLockAfterSubmit: false }],
    ['variantLockText บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantLockText: 'x' }],
    ['variantAskedLabel บนหัวข้อที่ไม่มีรูปแบบ', { ...OK, variantAskedLabel: 'x' }],
    ['resultDateOnly ไม่ใช่บูลีน', v({ resultDateOnly: 'yes' })],
    ['resultDateOnly บนหัวข้อที่ไม่มีวันรับผล', { ...WITH_VARIANTS, form: {}, variants: { a: { label: 'A' }, b: { label: 'B', resultDateOnly: true } } }],
    ['variant.form คีย์ที่ไม่รู้จัก', v({ form: { bodyPlaceholdr: 'x' } })],
    ['variant.form ไม่ใช่ object', v({ form: 'x' })],
    ['requiredFiles ขาด rejectText', v({ requiredFiles: { ...RF, rejectText: '' } })],
    ['requiredFiles ขาด accept', v({ requiredFiles: { ...RF, accept: undefined } })],
    ['requiredFiles docType ที่ไม่มีในคำร้อง', v({ requiredFiles: { ...RF, docType: 'plan' } })],
    ['requiredFiles ไม่ใช่ object', v({ requiredFiles: 'spec' })],
    ['switchConfirm ขาด description', v({ switchConfirm: { title: 'ท' } })],
    ['description ว่าง', v({ description: '' })],
    ['notice ไม่ใช่สตริง', v({ notice: true })],
  ];
  for (const [why, kind] of bad) assert.throws(() => assertKind(kind), undefined, why);
});

test('S4 · requiredFiles.docType ตรงกับคีย์เอกสารแนบของคำร้องจริง (ลิสต์ในทะเบียนไม่เพี้ยนจาก attachmentTypes)', async () => {
  const { ATTACHMENT_TYPES } = await import('../../master/attachmentTypes.js');
  const keys = ATTACHMENT_TYPES.dept_request.map((t) => t.key);
  for (const key of keys) {
    assert.doesNotThrow(() => assertKind({
      ...WITH_VARIANTS,
      variants: { a: { label: 'A' }, b: { label: 'B', requiredFiles: { docType: key, label: 'ก', hint: 'ข', accept: '.pdf', rejectText: 'ค' } } },
    }), key);
  }
});

test('S4 · ใบประเมินพื้นที่มีสองวิธี ไม่มีค่าที่เลือกไว้ให้ · พัฒนาสูตรไม่ได้คีย์ใหม่สักตัว', () => {
  const s = REQUEST_KINDS.site_survey;
  assert.deepEqual(Object.keys(s.variants), ['standard', 'drawing']);
  assert.equal(s.variantLabel, 'วิธีประเมิน');
  assert.equal(s.variantRequired, true);
  assert.equal(s.variantLockAfterSubmit, true);
  assert.equal(s.variantAskedLabel, 'วิธีที่ฝ่ายขายขอ');
  assert.equal('hasItems' in s, false, 'hasItems ย้ายเข้าไปในรูปแบบแล้ว (ทะเบียนห้ามประกาศที่หัวข้อเมื่อมี variants)');
  assert.equal(s.variants.standard.hasItems, false);
  assert.equal(s.variants.drawing.hasItems, false);
  assert.equal(s.variants.drawing.requiredFiles.docType, 'spec');
  assert.ok(Object.isFrozen(s.variants.drawing.form), 'variant.form แช่แข็งตอนโหลด');
  const f = REQUEST_KINDS.formula_dev;
  for (const key of ['variantLabel', 'variantRequired', 'variantRequiredError', 'variantLockAfterSubmit', 'variantLockText', 'variantAskedLabel']) {
    assert.equal(f[key], undefined, `formula_dev.${key}`);
  }
  for (const v of Object.values(f.variants)) {
    for (const key of ['description', 'notice', 'form', 'resultDateOnly', 'requiredFiles', 'switchConfirm']) {
      assert.equal(v[key], undefined, `formula_dev variant.${key}`);
    }
  }
});

/* ratchet ของงวด S4 (สเปก §3 Integrate ข้อ 3): ใบประเมินพื้นที่ประกาศสองวิธีพอดี · ใบ `standard` (ทุกใบที่มีอยู่) ไม่พิมพ์
   บรรทัด "ฝ่ายขายขอ" ที่ view-model ไหนเลย — หน้าใบ (`surveyJobView`) · การ์ดหน้าจัดคิว (`surveyRequestRow`) · หัวใบประเมิน
   (`surveyJobHeaderView`) · ตารางเต็มทุกสถานะอยู่ที่ `lib/service/surveyIntakeFlagOff.test.mjs` */
test('S4 · ประเมินพื้นที่ = standard + drawing พอดี · ใบ standard ไม่มีบรรทัด "ฝ่ายขายขอ" บนสาม view-model', async () => {
  assert.deepEqual(Object.keys(REQUEST_KINDS.site_survey.variants), ['standard', 'drawing']);
  const { surveyJobView } = await import('../../service/surveyJob.js');
  const { surveyRequestRow } = await import('../../service/scheduleQueueView.js');
  const { surveyJobHeaderView } = await import('../../service/surveyFieldView.js');
  const base = {
    id: 'R1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100101', title: 'ประเมินล็อบบี้', siteId: 'S1',
    status: 'acknowledged', submittedAt: '2026-10-13T02:00:00Z', acknowledgedAt: '2026-10-13T04:00:00Z',
    requestedDueDate: '2026-10-20', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-22',
    surveyZones: [{ id: 'z1', zoneName: 'Lobby', status: 'ok', parts: [], spots: [] }], surveyNeedsVisit: true, surveyVisit: null,
  };
  const site = { id: 'S1', code: 'ST-1', name: 'ไซต์', routeZone: 'BKK-C' };
  const views = (r) => JSON.stringify([
    surveyJobView({ request: r, today: '2026-10-15', viewer: { isOpener: true, isRequesterSide: true } }),
    surveyRequestRow(r, { todayIso: '2026-10-15', sitesById: new Map([['S1', site]]), live: [], peopleInView: [] }),
    surveyJobHeaderView({ request: r, customer: { arCode: 'AR-1', name: 'ลูกค้า' }, site, visit: null, crew: [], unknown: {} }),
  ]);
  for (const r of [base, { ...base, variant: 'standard' }]) assert.doesNotMatch(views(r), /ฝ่ายขายขอ/);
  // ตัวควบคุม: ใบเดียวกันที่ยื่นเป็นจากแบบพิมพ์บรรทัดนั้นจริง (ไม่งั้นข้อบนผ่านเพราะ view-model ไม่เคยพิมพ์อะไรเลย)
  assert.match(views({ ...base, variant: 'drawing' }), /ฝ่ายขายขอ/);
});
