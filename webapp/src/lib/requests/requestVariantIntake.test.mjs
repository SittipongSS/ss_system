// ── ประเมินจากแบบ งวด 4 (S4 §2.3 · §2.4) — ฝ่ายขายเลือกวิธีประเมินตอนยื่น ─────────────────
//
// ⭐ ตัวอ่านใหม่ทั้งชุดอยู่ที่ทะเบียน + `requestTypes.js` + `variantSwitch.js` — ฟอร์ม · route · หน้าคำร้อง
// เรียกตัวเดียวกัน ⇒ เทสต์ตรึงคำตอบไว้ที่นี่ที่เดียว
// 🔴 `requestVariantChosen` ≠ `requestVariantKey`: ตัวหลังตกไปที่รูปแบบตั้งต้น (แถวเก่า) · ตัวแรกตอบ
//    "ผู้ใช้เลือกแล้วจริงไหม" — ใช้สลับกันเมื่อไร ฟอร์มใหม่จะขึ้นปุ่ม "ลงหน้างาน" ถูกเลือกไว้ให้เงียบ ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_KINDS,
  SITE_REQUIRED_ERROR,
  requestFormCopy,
  requestKindHint,
  requestNormalizeDates,
  requestRequiredFiles,
  requestRequiredFilesError,
  requestResultDateOnly,
  requestShapeError,
  requestSubmitGapsError,
  requestVariantAskedLabel,
  requestVariantChosen,
  requestVariantFieldLabel,
  requestVariantKey,
  requestVariantLockAfterSubmit,
  requestVariantLockText,
  requestVariantNotice,
  requestVariantRequired,
} from '../master/requestTypes.js';
import {
  requestImpliedVariant,
  requestVariantAskedOnly,
  requestVariantChoices,
  requestVariantLock,
  requestVariantSideLock,
} from './variantSwitch.js';

const REQUIRED = 'ต้องเลือกวิธีประเมิน — ลงหน้างาน หรือ ประเมินจากแบบ';
const LOCK = 'ส่งคำร้องแล้ว — เปลี่ยนวิธีประเมินได้ที่ฝ่ายบริการ (หัวหน้า TS)';
const FILES_ERROR = 'ยังไม่ได้แนบไฟล์ในช่อง “แบบ / ผังพื้นที่ที่ให้ประเมิน” — ประเมินจากแบบต้องมีอย่างน้อย 1 ไฟล์';

// ใบประเมินที่ครบทุกช่องยกเว้น variant และวันที่ — แต่ละเคสเติมเอง
const SURVEY = {
  kind: 'site_survey',
  title: 'ประเมินพื้นที่สาขา A', body: 'ลูกค้าเปิดโซนใหม่ต้นเดือนหน้า',
  dealId: 'D-1', siteId: 'SVS-1', zones: [{ name: 'โซนล็อบบี้', floor: 'G' }],
};
const shape = (body) => requestShapeError('site_survey', body);

test('requestShapeError · ไม่ได้เลือกวิธี = ประโยคบังคับ และถามก่อนดีล/สถานที่ (ปุ่มวิธีคือช่องแรกของแท็บแรก)', () => {
  assert.equal(shape({ ...SURVEY, requestedDueDate: '2026-10-20' }), REQUIRED);
  assert.equal(shape({ ...SURVEY, variant: '', requestedDueDate: '2026-10-20' }), REQUIRED);
  assert.equal(shape({ ...SURVEY, variant: null, requestedDueDate: '2026-10-20' }), REQUIRED);
  // ฟอร์มเปล่าทั้งใบ — ข้อแรกที่ถามคือวิธี ไม่ใช่ "ต้องเลือกดีล"
  assert.equal(shape({}), REQUIRED);
  assert.equal(shape({ variant: undefined, title: 'ก' }), REQUIRED);
  // เลือกวิธีแล้ว ข้อถัดไปคือของที่หัวข้อต้องอ้าง
  assert.equal(shape({ variant: 'drawing' }), 'ต้องเลือกดีลที่เกี่ยวข้อง');
  assert.equal(shape({ variant: 'standard', dealId: 'D-1' }), SITE_REQUIRED_ERROR);
});

test('requestShapeError · ค่าวิธีที่ไม่มีในทะเบียนยังตอบประโยคเดิมของรูปแบบ (ก่อนประโยคบังคับ)', () => {
  assert.match(shape({ ...SURVEY, variant: 'npd', requestedDueDate: '2026-10-20' }), /รูปแบบ "npd" ไม่มีในหัวข้อ "ประเมินพื้นที่"/);
});

test('requestShapeError · ลงหน้างานยังต้องมีวันที่ต้องการให้เข้าพื้นที่ (สองบรรทัดเดิมไม่เปลี่ยน)', () => {
  assert.equal(shape({ ...SURVEY, variant: 'standard' }), 'ต้องระบุวันที่ต้องการรับงาน');
  assert.equal(shape({ ...SURVEY, variant: 'standard', requestedDueDate: '20/10/2026' }), 'วันที่ต้องการรับงานไม่ถูกต้อง');
  assert.equal(shape({ ...SURVEY, variant: 'standard', requestedDueDate: '2026-10-20' }), null);
  // standard ไม่เคยตอบ "ไม่มีรูปแบบให้เลือก" (ย้ายมาจาก variantSwitch.test — หัวข้อนี้มีรูปแบบแล้ว)
  assert.doesNotMatch(String(shape({ ...SURVEY, variant: 'standard' })), /ไม่มีรูปแบบให้เลือก/);
  assert.doesNotMatch(String(shape({ ...SURVEY, variant: 'standard', requestedDueDate: '2026-10-20' })), /ไม่มีรูปแบบให้เลือก/);
});

test('requestShapeError · ประเมินจากแบบถามแค่วันรับผล — ไม่เคยตอบ "ต้องระบุวันที่ต้องการรับงาน"', () => {
  const d = { ...SURVEY, variant: 'drawing' };
  assert.equal(shape(d), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  assert.equal(shape({ ...d, requestedResultDate: '  ' }), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  assert.equal(shape({ ...d, requestedResultDate: '20/10/2026' }), 'วันที่ต้องการรับผลประเมินไม่ถูกต้อง');
  assert.equal(shape({ ...d, requestedResultDate: '2026-10-20' }), null);
  // มีวันเข้าพื้นที่ค้างมาแต่ไม่มีวันรับผล — ยังถามวันรับผล
  assert.equal(shape({ ...d, requestedDueDate: '2026-10-20' }), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  for (const body of [d, { ...d, requestedResultDate: '2026-10-20' }, { ...d, requestedResultDate: 'x' }]) {
    assert.doesNotMatch(String(shape(body)), /ต้องระบุวันที่ต้องการรับงาน|วันที่ต้องการรับงานไม่ถูกต้อง/);
  }
});

test('requestShapeError · หัวข้ออื่นตอบเหมือนเดิมทั้งมีและไม่มี variant: standard ค้างมา (รูปของ mig 0351)', () => {
  const body = {
    title: 'ก', dealId: 'D-1', salesOrderId: 'SO-1', quotationId: 'Q-1', billAmount: 100,
    requestedDueDate: '2026-09-30', items: [{}], scentId: 'SC-1', formulaId: 'F-1',
  };
  for (const kind of ['scent_dev', 'info', 'document', 'billing_doc', 'material_eta']) {
    if (!REQUEST_KINDS[kind]) continue;
    assert.equal(requestShapeError(kind, { ...body, variant: 'standard' }), requestShapeError(kind, body), kind);
    assert.doesNotMatch(String(requestShapeError(kind, { ...body, variant: 'standard' })), /ไม่มีรูปแบบให้เลือก/, kind);
  }
  // พัฒนาสูตรไม่บังคับเลือก — ว่างยังเป็นรูปแบบตั้งต้นเหมือนเดิม
  const fd = { title: 'ก', dealId: 'D-1', requestedDueDate: '2026-09-30', items: [{}] };
  assert.equal(requestShapeError('formula_dev', fd), requestShapeError('formula_dev', { ...fd, variant: 'standard' }));
  assert.notEqual(requestShapeError('formula_dev', fd), REQUIRED);
});

test('SITE_REQUIRED_ERROR · ป้ายเดียวทั้งสองวิธี "สถานที่ที่จะให้ประเมิน" (มติเจ้าของ 12/10)', () => {
  assert.equal(SITE_REQUIRED_ERROR, 'ต้องเลือกสถานที่ที่จะให้ประเมิน — ไม่มีในทะเบียนให้กด “สร้างสถานที่ใหม่” ในฟอร์มนี้');
});

test('requestVariantChosen vs requestVariantKey', () => {
  const rows = [
    ['', null, 'standard'],
    [undefined, null, 'standard'],
    ['standard', 'standard', 'standard'],
    ['drawing', 'drawing', 'drawing'],
    ['npd', null, 'standard'],
  ];
  for (const [variant, chosen, key] of rows) {
    assert.equal(requestVariantChosen({ kind: 'site_survey', variant }), chosen, `chosen ${variant}`);
    assert.equal(requestVariantKey({ kind: 'site_survey', variant }), key, `key ${variant}`);
  }
  assert.equal(requestVariantChosen({ kind: 'formula_dev', variant: 'npd' }), 'npd');
  assert.equal(requestVariantChosen({ kind: 'info', variant: 'standard' }), null, 'หัวข้อที่ไม่มีรูปแบบ');
  assert.equal(requestVariantChosen(null), null);
  assert.equal(requestVariantChosen({ kind: 'nope', variant: 'standard' }), null);
});

test('ป้าย / ธงระดับหัวข้อ — ประเมินพื้นที่ vs พัฒนาสูตร (ค่าตั้งต้นเดิมไม่ขยับ)', () => {
  assert.equal(requestVariantFieldLabel('site_survey'), 'วิธีประเมิน');
  assert.equal(requestVariantFieldLabel('formula_dev'), 'รูปแบบงาน');
  assert.equal(requestVariantFieldLabel(null), 'รูปแบบงาน');
  assert.equal(requestVariantRequired('site_survey'), true);
  assert.equal(requestVariantRequired('formula_dev'), false);
  assert.equal(requestVariantLockAfterSubmit('site_survey'), true);
  assert.equal(requestVariantLockAfterSubmit('formula_dev'), false);
  assert.equal(requestVariantLockText('site_survey'), LOCK);
  assert.equal(requestVariantLockText('formula_dev'), null);
  assert.equal(requestVariantAskedLabel('site_survey'), 'วิธีที่ฝ่ายขายขอ');
  assert.equal(requestVariantAskedLabel('formula_dev'), 'รูปแบบงาน', 'ไม่ประกาศ = ป้ายของช่องเลือก');
});

test('requestVariantNotice — เฉพาะวิธีที่ "เลือกแล้ว" และประกาศ notice', () => {
  assert.equal(requestVariantNotice({ kind: 'site_survey', variant: 'drawing' }),
    'ผลที่ได้จะระบุว่า “ประเมินจากแบบ” ทั้งบนหน้าคำร้องและในเอกสาร · ถ้าแบบไม่พอ TS อาจขอเปลี่ยนเป็นลงหน้างาน');
  assert.equal(requestVariantNotice({ kind: 'site_survey', variant: 'standard' }), null);
  assert.equal(requestVariantNotice({ kind: 'site_survey', variant: '' }), null);
  assert.equal(requestVariantNotice({ kind: 'formula_dev', variant: 'npd' }), null);
});

test('requestFormCopy — ข้อความฟอร์มตามวิธี · ยังไม่เลือก = ของหัวข้อ (ข้อความลงหน้างาน)', () => {
  const kindForm = REQUEST_KINDS.site_survey.form;
  assert.deepEqual({ ...requestFormCopy({ kind: 'site_survey', variant: '' }) }, { ...kindForm });
  assert.deepEqual({ ...requestFormCopy({ kind: 'site_survey', variant: 'standard' }) }, { ...kindForm });
  const d = requestFormCopy({ kind: 'site_survey', variant: 'drawing' });
  assert.equal(d.bodyPlaceholder, 'หน้างานจะเข้าได้ประมาณเมื่อไร · แบบที่แนบเป็นฉบับล่าสุดหรือยัง · ความสูงฝ้าเท่าไร (ถ้าแบบไม่ระบุ)');
  assert.equal(d.resultDueLabel, 'วันที่ต้องการรับผลประเมิน');
  assert.equal(d.bodyLabel, kindForm.bodyLabel);
  assert.deepEqual({ ...requestFormCopy({ kind: 'formula_dev', variant: 'npd' }) }, { ...REQUEST_KINDS.formula_dev.form });
  assert.deepEqual({ ...requestFormCopy({ kind: 'info' }) }, { ...REQUEST_KINDS.info.form });
});

test('requestKindHint — ประโยคระดับหัวข้อทั้งสองวิธีและตอนยังไม่เลือก (วิธีไม่ประกาศ hint · S4 V2)', () => {
  const hint = REQUEST_KINDS.site_survey.hint;
  for (const variant of ['', 'standard', 'drawing']) {
    assert.equal(requestKindHint({ kind: 'site_survey', variant }), hint, variant);
  }
});

test('requestResultDateOnly / requestRequiredFiles — ว่าง = ลงหน้างาน (รูปแบบตั้งต้น)', () => {
  assert.equal(requestResultDateOnly({ kind: 'site_survey', variant: 'drawing' }), true);
  assert.equal(requestResultDateOnly({ kind: 'site_survey', variant: 'standard' }), false);
  assert.equal(requestResultDateOnly({ kind: 'site_survey', variant: '' }), false);
  assert.equal(requestResultDateOnly({ kind: 'formula_dev', variant: 'npd' }), false);
  assert.deepEqual(requestRequiredFiles({ kind: 'site_survey', variant: 'drawing' }), {
    docType: 'spec',
    label: 'แบบ / ผังพื้นที่ที่ให้ประเมิน',
    hint: 'PDF · JPG · PNG ไฟล์ละไม่เกิน 25 MB · ถ้าแบบระบุขนาดห้องและความสูงฝ้า จะได้ผลเร็วและแม่นขึ้น',
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
    rejectText: 'ช่องนี้รับเฉพาะไฟล์ PDF · JPG · PNG',
  });
  assert.equal(requestRequiredFiles({ kind: 'site_survey', variant: 'standard' }), null);
  assert.equal(requestRequiredFiles({ kind: 'site_survey' }), null);
  assert.equal(requestRequiredFiles({ kind: 'info' }), null);
});

test('requestRequiredFilesError — count สามสถานะ: null = ไม่รู้ (ผ่าน) · 0 = ขาด · 1 = ครบ', () => {
  const d = { kind: 'site_survey', variant: 'drawing' };
  assert.equal(requestRequiredFilesError(d, { count: null }), null);
  assert.equal(requestRequiredFilesError(d, { count: undefined }), null);
  assert.equal(requestRequiredFilesError(d), null);
  assert.equal(requestRequiredFilesError(d, { count: 0 }), FILES_ERROR);
  assert.equal(requestRequiredFilesError(d, { count: 1 }), null);
  assert.equal(requestRequiredFilesError(d, { count: 3 }), null);
  assert.equal(requestRequiredFilesError({ kind: 'site_survey', variant: 'standard' }, { count: 0 }), null);
  assert.doesNotMatch(FILES_ERROR, /สเปก|spec/, 'ชื่อ docType ไม่โผล่ในประโยค');
});

test('requestSubmitGapsError — ข้อความเดียวตอนกดส่งร่าง: ไฟล์ · วันรับผล · รวมด้วย " · " · ไม่ขาด = null', () => {
  const d = { kind: 'site_survey', variant: 'drawing', requestedResultDate: '2026-10-20' };
  assert.equal(requestSubmitGapsError(d, { count: 0 }), FILES_ERROR);
  assert.equal(requestSubmitGapsError({ ...d, requestedResultDate: '' }, { count: 2 }), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  assert.equal(requestSubmitGapsError({ ...d, requestedResultDate: null }, { count: 0 }),
    `${FILES_ERROR} · ต้องระบุวันที่ต้องการรับผลประเมิน`);
  assert.equal(requestSubmitGapsError(d, { count: 1 }), null);
  // count ไม่รู้ = ข้ามส่วนไฟล์ ยังถามวันรับผล
  assert.equal(requestSubmitGapsError({ ...d, requestedResultDate: '' }, { count: null }), 'ต้องระบุวันที่ต้องการรับผลประเมิน');
  assert.equal(requestSubmitGapsError(d, { count: null }), null);
  // ลงหน้างาน / หัวข้ออื่น: ด่านนี้ไม่มีอะไรถาม
  assert.equal(requestSubmitGapsError({ kind: 'site_survey', variant: 'standard' }, { count: 0 }), null);
  assert.equal(requestSubmitGapsError({ kind: 'formula_dev', variant: 'npd' }, { count: 0 }), null);
});

test('requestNormalizeDates — ประเมินจากแบบ: วันเข้าพื้นที่ = กระจกของวันรับผล · ไม่มีช่วงเวลา', () => {
  const d = { kind: 'site_survey', variant: 'drawing', requestedResultDate: '2026-10-20', requestedDueDate: '2026-10-01', requestedDueTime: '09:00-12:00', title: 'ก' };
  assert.deepEqual(requestNormalizeDates(d), { ...d, requestedDueDate: '2026-10-20', requestedDueTime: null });
  assert.deepEqual(requestNormalizeDates({ ...d, requestedResultDate: '' }), { ...d, requestedResultDate: '', requestedDueDate: null, requestedDueTime: null });
  const s = { ...d, variant: 'standard' };
  assert.equal(requestNormalizeDates(s), s, 'ลงหน้างานคืน object เดิม');
  const f = { kind: 'formula_dev', requestedDueDate: '2026-10-01' };
  assert.equal(requestNormalizeDates(f), f);
});

/* ── variantSwitch (S4 §2.4) ─────────────────────────────────────────────── */

test('requestVariantChoices — ซ่อนวิธีที่ปิด · ค่าที่ใบถืออยู่ยังอ่านได้แม้ปิดทีหลัง · ลำดับตามทะเบียน', () => {
  assert.deepEqual(requestVariantChoices('site_survey'), ['standard', 'drawing']);
  assert.deepEqual(requestVariantChoices('site_survey', { off: [] }), ['standard', 'drawing']);
  assert.deepEqual(requestVariantChoices('site_survey', { off: ['drawing'] }), ['standard']);
  assert.deepEqual(requestVariantChoices('site_survey', { off: ['drawing'], current: 'drawing' }), ['standard', 'drawing']);
  assert.deepEqual(requestVariantChoices('site_survey', { off: ['drawing'], current: 'standard' }), ['standard']);
  assert.deepEqual(requestVariantChoices('site_survey', { off: ['standard', 'drawing'] }), []);
  assert.deepEqual(requestVariantChoices('formula_dev'), ['standard', 'npd']);
  assert.deepEqual(requestVariantChoices('info'), []);
});

test('requestImpliedVariant — เหลือทางเดียวของหัวข้อที่บังคับเลือก = ค่านั้น · อื่น ๆ = null', () => {
  assert.equal(requestImpliedVariant('site_survey', { off: ['drawing'] }), 'standard');
  assert.equal(requestImpliedVariant('site_survey', { off: [] }), null);
  assert.equal(requestImpliedVariant('site_survey'), null);
  assert.equal(requestImpliedVariant('site_survey', { off: ['standard', 'drawing'] }), null);
  assert.equal(requestImpliedVariant('formula_dev', { off: ['npd'] }), null, 'พัฒนาสูตรไม่บังคับเลือก');
  assert.equal(requestImpliedVariant('info', { off: [] }), null);
});

test('requestVariantAskedOnly — หลังส่ง วิธีคือ "สิ่งที่ฝ่ายขายขอ" ไม่ใช่ตัวเลือก · ร่าง (รวมใบตีกลับ) ยังเลือกได้', () => {
  assert.equal(requestVariantAskedOnly({ kind: 'site_survey', status: 'draft' }), false);
  for (const status of ['pending', 'acknowledged', 'answered', 'closed', 'cancelled']) {
    assert.equal(requestVariantAskedOnly({ kind: 'site_survey', status }), true, status);
  }
  for (const status of ['draft', 'pending', 'acknowledged', 'answered', 'closed']) {
    assert.equal(requestVariantAskedOnly({ kind: 'formula_dev', status }), false, `formula_dev ${status}`);
  }
  assert.equal(requestVariantAskedOnly(null), false);
});

test('requestVariantSideLock — ประโยคตามป้ายของหัวข้อ · ไม่ส่งหัวข้อ / พัฒนาสูตร = ประโยคเดิมเป๊ะ', () => {
  assert.equal(requestVariantSideLock(false, 'site_survey'), 'สลับวิธีประเมินได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  assert.equal(requestVariantSideLock(false, 'formula_dev'), 'สลับรูปแบบงานได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  assert.equal(requestVariantSideLock(false), 'สลับรูปแบบงานได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน');
  assert.equal(requestVariantSideLock(true, 'site_survey'), null);
});

test('requestVariantLock — ประเมินพื้นที่ล็อกทันทีหลังส่ง · ยกเลิกแล้วใช้ประโยคเดิม · ใบตีกลับ (ร่าง) ปลดล็อก', () => {
  const r = (status) => ({ kind: 'site_survey', status });
  assert.equal(requestVariantLock(r('draft')), null);
  for (const status of ['pending', 'acknowledged', 'answered', 'closed']) {
    assert.equal(requestVariantLock(r(status)), LOCK, status);
  }
  assert.equal(requestVariantLock(r('cancelled')), 'คำร้องถูกยกเลิกแล้ว — สลับรูปแบบไม่ได้');
  // ตีกลับ = สถานะกลับเป็นร่าง (ไม่มีสถานะ "ตีกลับ" แยก)
  assert.equal(requestVariantLock({ kind: 'site_survey', status: 'draft', submittedAt: '2026-10-10T00:00:00Z' }), null);
});

test('requestRequiredFileAccepts — PDF · JPG · PNG ตามนามสกุลหรือ MIME · อื่น ๆ ไม่รับ', async () => {
  const { requestRequiredFileAccepts } = await import('../master/requestTypes.js');
  const rf = requestRequiredFiles({ kind: 'site_survey', variant: 'drawing' });
  const ok = [
    { name: 'แปลนชั้น 1.JPG', type: 'image/jpeg' },
    { name: 'แบบ.pdf', type: '' },                  // ลากมาวางแล้วไม่มี type
    { name: 'scan', type: 'application/pdf' },      // ไม่มีนามสกุลแต่ MIME ถูก
    { name: 'plan.jpeg', type: '' },
    { name: 'plan.png', type: 'image/png' },
  ];
  const bad = [
    { name: 'plan.tiff', type: 'image/tiff' },
    { name: 'plan.heic', type: '' },
    { name: 'แบบ.dwg', type: 'application/acad' },
    { name: 'noext', type: '' },
    { name: 'pdf', type: '' },
  ];
  for (const f of ok) assert.equal(requestRequiredFileAccepts(rf, f), true, f.name);
  for (const f of bad) assert.equal(requestRequiredFileAccepts(rf, f), false, f.name);
  assert.equal(requestRequiredFileAccepts(null, ok[0]), false);
  assert.equal(requestRequiredFileAccepts(rf, null), false);
});

test('requestRequiredFileCount — นับเฉพาะ docType ของช่อง · ไม่นับเอกสาร Google · แถวที่ถูกปิดเนื้อหายังนับ', async () => {
  const { requestRequiredFileCount } = await import('../master/requestTypes.js');
  const rf = requestRequiredFiles({ kind: 'site_survey', variant: 'drawing' });
  const rows = [
    { id: 1, docType: 'spec' },
    { id: 2, docType: 'spec', metadata: {} },
    { id: 3, docType: 'spec', metadata: { kind: 'gdoc' } },
    { id: 4, docType: 'other' },
    { id: 5, docType: 'reference_image' },
    { id: 6, docType: 'spec', restricted: true, metadata: {} },
    null,
  ];
  assert.equal(requestRequiredFileCount(rows, rf), 3);
  assert.equal(requestRequiredFileCount([], rf), 0);
  assert.equal(requestRequiredFileCount(null, rf), 0);
  assert.equal(requestRequiredFileCount(rows, null), 0);
});
