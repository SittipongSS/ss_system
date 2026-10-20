import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { missingRequiredByTab, requestFormTabs, requiredChecks } from './formTabs.js';
import { requestFormBlocker } from '../master/requestCreate.js';

/* ⭐ เทสต์ที่สำคัญที่สุดของไฟล์นี้ — **เกจกับด่านส่งต้องเป็นความจริงเดียวกัน**
   เกจที่บอกว่าครบแล้วแต่ปุ่มยังกดไม่ได้ (หรือกลับกัน) แย่กว่าไม่มีเกจเลย
   เพราะผู้ใช้จะเลิกเชื่อทั้งสองอย่าง */
const base = {
  dept: 'RD', kind: 'info', dealId: 'DEAL-1', projectId: 'PRJ-1',
  title: 'ถามเรื่องขวด', requestedDueDate: '2026-08-20',
};

test('ไม่มีแท็บไหนขาด ⟺ ด่านส่งผ่าน (ทุกหัวข้อ ทุกช่องที่ถอดออกทีละตัว)', () => {
  const forms = [
    base,
    { ...base, kind: 'document', items: [{ docType: 'spec_sheet' }] },
    // ⚠️ แถวต้องผ่านตัวตรวจจริง (หมวดตรงรูปแบบ + มีกลิ่น) — แถวเปล่าไม่นับแล้ว
    { ...base, kind: 'formula_dev', items: [{ categoryCode: '01-001', scentId: 'SC-1' }] },
    { ...base, kind: 'scent_dev', salesOrderId: 'SO-1' },
  ];
  for (const form of forms) {
    // ครบ → ทั้งสองฝั่งต้องบอกว่าผ่าน
    assert.equal(missingRequiredByTab(form).length, 0, `${form.kind}: เกจบอกว่าขาดทั้งที่ครบ`);
    assert.equal(requestFormBlocker(form), null, `${form.kind}: ด่านบอกว่าขาดทั้งที่ครบ`);

    // ถอดทีละช่อง → ทั้งสองฝั่งต้องบอกว่าขาดพร้อมกัน
    for (const key of ['title', 'requestedDueDate', 'dealId', 'salesOrderId', 'items']) {
      if (form[key] === undefined) continue;
      const broken = { ...form, [key]: Array.isArray(form[key]) ? [] : '' };
      const missing = missingRequiredByTab(broken).length > 0;
      const blocked = requestFormBlocker(broken) != null;
      assert.equal(missing, blocked, `${form.kind}/${key}: เกจกับด่านไม่ตรงกัน`);
    }
  }
});

test('งานด่วนที่ยังไม่บอกเหตุผล นับเป็นของขาดของแท็บกำหนด', () => {
  const urgent = { ...base, urgent: true };
  const missing = missingRequiredByTab(urgent);
  assert.deepEqual(missing, [{ tab: 'due', label: 'เหตุผลที่เป็นงานด่วน' }]);
  assert.notEqual(requestFormBlocker(urgent), null);
  assert.equal(missingRequiredByTab({ ...urgent, urgentReason: 'ลูกค้าออกบูธวันที่ 20' }).length, 0);
});

test('ตัวหารนับเฉพาะช่องบังคับที่ใช้จริงกับหัวข้อนั้น', () => {
  const info = requestFormTabs(base);
  const work = info.find((t) => t.key === 'work');
  // สอบถามข้อมูลต้องมี **ดีล** อย่างเดียว — โครงการถูกถอดออกจาก `needs` (2026-08-24)
  // และไม่มีใบสั่งขาย ⇒ แท็บงานเหลือช่องบังคับตัวเดียว
  assert.equal(work.required.total, 1);
  assert.equal(work.required.filled, 1);
  // ⭐ สามแท็บเท่ากันทุกหัวข้อ (มติ 2026-08-09) — PDR ไปรวมอยู่ใน "รายละเอียด"
  assert.deepEqual(info.map((t) => t.key), ['work', 'subject', 'due']);

  const scent = requestFormTabs({ ...base, kind: 'scent_dev', salesOrderId: 'SO-1' });
  assert.deepEqual(scent.map((t) => t.key), ['work', 'subject', 'due']);
  // พัฒนากลิ่นยึดใบสั่งขาย ไม่ได้ยึดดีล ⇒ แท็บงานมีช่องบังคับตัวเดียว
  assert.equal(scent.find((t) => t.key === 'work').required.total, 1);
});

test('ยังไม่เลือกดีล = ขาด "ดีล" ไม่ใช่ขาด "โครงการ"', () => {
  const missing = missingRequiredByTab({ ...base, dealId: '', projectId: '' });
  assert.deepEqual(missing.map((m) => m.label), ['ดีล']);
});

test('เกจช่องไม่บังคับของ PDR นับรวมอยู่ในแท็บรายละเอียด', () => {
  const form = {
    ...base, kind: 'scent_dev', salesOrderId: 'SO-1',
    pdr: { customerBrand: 'Vanique', moodTone: 'อบอุ่น' },
    // ⚠️ ก้อนที่มี **เนื้อบรีฟ** เท่านั้นที่นับ — ชื่อเรียกใช้นับไม่ได้เพราะระบบเติม
    // "กลิ่นที่ N" ให้เองตอนบันทึก (scentBriefs.js) ⇒ นับชื่อแล้วเกจจะเต็มเองทั้งใบ
    briefs: [{ label: 'กลิ่นที่ 1', brief: 'โทนอุ่น' }, { label: 'กลิ่นที่ 2' }],
  };
  const subject = requestFormTabs(form).find((t) => t.key === 'subject');
  assert.ok(subject.optional.total > 20, 'ต้องนับช่องทั้งแบบฟอร์ม PDR');
  // 2 ช่องที่กรอก + 1 บรีฟที่เขียนเนื้อแล้ว
  assert.equal(subject.optional.filled, 3);
  // ⚠️ ช่องบังคับของแท็บนี้คือ "ชื่อเรื่อง" ของคำร้อง — แบบฟอร์ม PDR ไม่มีช่องบังคับเลย
  assert.equal(subject.required.total, 1);
});

/* ⭐ กด "เพิ่มรายการ" เฉย ๆ แล้วไม่เลือกอะไร **ต้องยังส่งไม่ได้** (มติผู้ใช้
   2026-08-09) — ก่อนหน้านี้ `items.length > 0` ผ่าน แล้วไปตายที่ server */
test('แถวเปล่าไม่นับว่ามีรายการ — ทั้งเกจและด่านส่งต้องยังตีกลับ', () => {
  for (const [kind, emptyRow] of [['document', { docType: '', spec: '' }], ['formula_dev', { categoryCode: '', scentId: '' }]]) {
    const form = { ...base, kind, items: [emptyRow] };
    assert.equal(missingRequiredByTab(form).length, 1, `${kind}: เกจต้องบอกว่ายังขาดรายการ`);
    assert.notEqual(requestFormBlocker(form), null, `${kind}: ด่านส่งต้องตีกลับ`);
  }
});

/* ⭐ ติ๊ก "มีภาพประกอบ" แล้วต้องแนบไฟล์ตั้งแต่ตอนบันทึกร่าง (มติผู้ใช้ 2026-08-09) —
   เดิมด่านนี้ยิงเฉพาะตอนกดส่งซึ่งเป็นคนละหน้า */
test('มีภาพประกอบแต่ยังไม่แนบไฟล์ = ยังบันทึกไม่ได้', () => {
  const scent = { ...base, kind: 'scent_dev', salesOrderId: 'SO-1' };
  const ticked = { ...scent, pdr: { packagingArtwork: 'has' } };
  assert.deepEqual(missingRequiredByTab(ticked).map((m) => m.label), ['ไฟล์ภาพประกอบบรรจุภัณฑ์']);
  assert.notEqual(requestFormBlocker(ticked), null);

  // แนบแล้วผ่าน · ไม่ได้ติ๊กก็ไม่ถาม
  assert.equal(missingRequiredByTab({ ...ticked, files: [{ name: 'art.png' }] }).length, 0);
  assert.equal(missingRequiredByTab({ ...scent, pdr: { packagingArtwork: 'none' } }).length, 0);
});

/* 🪤 **เกจต้องชี้แท็บที่ช่องอยู่จริง** — ปุ่ม "ยังขาด: …" พาไปเปิดแท็บตามค่า `tab`
   ตรงนี้ · ชี้ผิดแท็บ = คนกดแล้วเจอหน้าที่ไม่มีช่องนั้น แล้วไม่รู้จะกรอกที่ไหน
   (กับดักเดิมของ "ยอดที่ขอวางบิล" ตอนย้ายช่องเข้าเนื้อบรรทัด)
   ⭐ ไซต์/พื้นที่ของ "ประเมินพื้นที่" อยู่แท็บ "รายละเอียด" (มติผู้ใช้ 2026-09-02) —
   มันคือ "ขออะไร" (ไปวัดที่นี่ พื้นที่เหล่านี้) ไม่ใช่ "งานไหน" · ผูกกับซอร์สของฟอร์ม
   ด้วย เพราะสองที่นี้ต้องย้ายพร้อมกันเสมอ */
test('🪤 ประเมินพื้นที่: ไซต์กับพื้นที่ต้องอยู่แท็บ "รายละเอียด" ทั้งเกจและฟอร์ม', () => {
  const survey = {
    // ⭐ ต้องเลือกวิธีประเมินก่อน (ประเมินจากแบบ งวด 4 · S4) — เทสต์นี้คุมไซต์/พื้นที่ของใบลงหน้างาน
    dept: 'TS', kind: 'site_survey', variant: 'standard', dealId: 'DEAL-1',
    title: 'ประเมินพื้นที่สาขา A', requestedDueDate: '2026-09-20',
    // รายละเอียดบังคับของหัวข้อนี้ (มติผู้ใช้ 2026-09-21) — ดูเทสต์ของตัวเองข้างล่าง
    body: 'ลูกค้าจะเปิดโซนใหม่ต้นเดือนหน้า · ติดต่อคุณเอ 081-000-0000',
  };
  const missing = missingRequiredByTab(survey);
  const site = missing.find((m) => m.label.includes('สถานที่'));
  assert.ok(site, 'ยังไม่เลือกสถานที่ = ต้องขึ้นว่าขาด');
  assert.equal(site.tab, 'subject');

  const withSite = { ...survey, siteId: 'SVS-1' };
  const zones = missingRequiredByTab(withSite).find((m) => m.label.includes('พื้นที่'));
  assert.ok(zones, 'เลือกสถานที่แล้วแต่ยังไม่มีพื้นที่ = ต้องขึ้นว่าขาด');
  assert.equal(zones.tab, 'subject');

  /* ⭐ **วันส่งผลเป็นช่องบังคับของหัวข้อนี้ด้วย** (มติผู้ใช้ 2026-09-21 · mig 0368) —
     วันเข้าพื้นที่กับวันส่งผลเป็นคนละวันเสมอ ⇒ ใบที่บอกวันเดียวตอบไม่ได้ว่าฝ่ายขาย
     จะได้ตัวเลขเมื่อไร ซึ่งเป็นคำถามเดียวที่คนเปิดใบนี้ถาม */
  const noResult = { ...withSite, zones: [{ name: 'โซน 1' }] };
  const resultDue = missingRequiredByTab(noResult).find((m) => m.label.includes('รับผล'));
  assert.ok(resultDue, 'ยังไม่ระบุวันที่ต้องการรับผล = ต้องขึ้นว่าขาด');
  assert.equal(resultDue.tab, 'due');

  // ครบแล้วต้องไม่เหลือของขาด และด่านส่งต้องเห็นตรงกัน
  const full = { ...noResult, requestedResultDate: '2026-09-22' };
  assert.equal(missingRequiredByTab(full).length, 0);
  assert.equal(requestFormBlocker(full), null);

  /* ⭐ **รายละเอียดเป็นช่องบังคับของหัวข้อนี้** (มติผู้ใช้ 2026-09-21) — ใบนี้ไม่มีตาราง
     รายการและไม่มีแบบฟอร์ม PDR ⇒ ช่องนี้คือที่เดียวที่บริบทของงานอยู่ · ฝ่าย TS
     ต้องอ่านก่อนจัดคน · หัวข้ออื่นยังไม่บังคับ (ดูเทสต์ถัดไป) */
  const { body: _body, ...noBody } = full;
  const bodyMissing = missingRequiredByTab(noBody).find((m) => m.label.includes('รายละเอียดเพิ่มเติม'));
  assert.ok(bodyMissing, 'ไม่กรอกรายละเอียด = ต้องขึ้นว่าขาด');
  assert.equal(bodyMissing.tab, 'subject');
  assert.ok(requestFormBlocker(noBody), 'ด่านส่งต้องเห็นตรงกับเกจ');

  // แท็บ "งาน" ยังต้องมีของ (ดีล) — ไม่ใช่ย้ายจนแท็บว่าง
  const tabs = requestFormTabs(survey);
  assert.ok(tabs.find((t) => t.key === 'work').required.total > 0,
    'ย้ายไซต์ออกแล้วแท็บงานต้องยังมีช่องบังคับเหลืออยู่ ไม่งั้นได้แท็บว่าง');
});

test('🪤 บล็อกไซต์ในฟอร์มต้องอยู่ใต้แท็บ subject จริง ไม่ใช่แค่เกจชี้', () => {
  const form = readFileSync(
    new URL('../../components/requests/RequestForm.js', import.meta.url), 'utf8',
  );
  const subjectAt = form.indexOf('activeTab === "subject"');
  const siteAt = form.indexOf('<SurveySiteFields');
  const workAt = form.indexOf('activeTab === "work"');
  assert.ok(workAt > -1 && subjectAt > -1 && siteAt > -1);
  assert.ok(siteAt > subjectAt, 'SurveySiteFields ต้องอยู่หลังหัวแท็บ subject');
  assert.ok(subjectAt > workAt, 'ลำดับแท็บในไฟล์: work มาก่อน subject');
  /* ⭐ ช่องไฟล์บังคับของประเมินจากแบบ (S4 B-3) อยู่แท็บ subject ใต้บล็อกไซต์ — เกจชี้ `subject`
     (`requiredChecks`) ⇒ ย้ายช่องโดยไม่ย้ายเกจ = ปุ่ม "ยังขาด" พาไปแท็บที่ไม่มีช่องนั้น */
  const filesAt = form.indexOf('<RequiredFilesBlock');
  const dueAt = form.indexOf('activeTab === "due"');
  assert.ok(filesAt > siteAt, 'RequiredFilesBlock ต้องอยู่หลัง SurveySiteFields (แท็บ subject)');
  assert.ok(dueAt > filesAt, 'RequiredFilesBlock ต้องอยู่ก่อนหัวแท็บ due');
});

/* ══ ประเมินจากแบบ งวด 4 (S4 B-5) — วิธีประเมิน · ช่องไฟล์บังคับ · ฟอร์มวันเดียว ══════════════════════
   ⭐ ตารางเดียวของ "ไม่มีแท็บไหนขาด ⟺ ด่านผ่าน" ขยายให้ครบทุกสถานะของวิธีประเมิน รวมแถวของโหมดแก้
   (ฟอร์มแก้ไม่ถือไฟล์ใน `form.requiredFiles` — นับจากรายการไฟล์ที่บันทึกแล้ว `requiredFileCount`)
   🔴 `requiredFileCount` มีสามสถานะ: ไม่ส่ง = โหมดสร้าง (นับตะกร้า) · `null` = ยังไม่รู้ ⇒ ไม่ถือว่าขาด · ตัวเลข = เทียบ */
const SURVEY_FULL = {
  dept: 'TS', kind: 'site_survey', dealId: 'DEAL-1', siteId: 'SVS-1', zones: [{ name: 'โซน 1' }],
  title: 'ประเมินพื้นที่สาขา A', body: 'ลูกค้าจะเปิดโซนใหม่ต้นเดือนหน้า',
  requestedDueDate: '2026-09-20', requestedResultDate: '2026-09-22',
};
const PLAN_FILE = { name: 'plan.pdf', type: 'application/pdf', size: 1024 };
const DRAWING_FULL = { ...SURVEY_FULL, variant: 'drawing', requestedDueDate: '', requiredFiles: [PLAN_FILE] };

test('⭐ S4: ไม่มีแท็บไหนขาด ⟺ ด่านส่งผ่าน — ทุกสถานะของวิธีประเมิน รวมแถวโหมดแก้', () => {
  const rows = [
    // [ชื่อแถว, ฟอร์ม, ตัวเลือก, ผ่านไหม]
    ['ยังไม่เลือกวิธี', SURVEY_FULL, {}, false],
    // รอบ 4 ข้อ 12: ยังไม่เลือกวิธี + ไม่มีวันเข้าพื้นที่ — ยังไม่ผ่าน (ขาดวิธี) · วันเข้ายังไม่นับจนกว่าเลือกลงหน้างาน
    ['ยังไม่เลือกวิธี ไม่มีวันเข้าพื้นที่', { ...SURVEY_FULL, requestedDueDate: '' }, {}, false],
    ['ลงหน้างาน', { ...SURVEY_FULL, variant: 'standard' }, {}, true],
    ['ลงหน้างาน ไม่มีวันเข้าพื้นที่', { ...SURVEY_FULL, variant: 'standard', requestedDueDate: '' }, {}, false],
    ['จากแบบ 0 ไฟล์', { ...DRAWING_FULL, requiredFiles: [] }, {}, false],
    ['จากแบบ 1 ไฟล์', DRAWING_FULL, {}, true],
    ['จากแบบ ไฟล์ที่อัปแล้ว (ref)', { ...DRAWING_FULL, requiredFiles: [{ file: PLAN_FILE, ref: { id: 'ATT-1' } }] }, {}, true],
    ['จากแบบ ไม่มีวันรับผล', { ...DRAWING_FULL, requestedResultDate: '' }, {}, false],
    // โหมดแก้ — ตะกร้าว่างเสมอ ตัวนับมาจากรายการไฟล์ที่บันทึกแล้ว
    ['แก้: บันทึกไว้ 3 ไฟล์', { ...DRAWING_FULL, requiredFiles: [] }, { requiredFileCount: 3 }, true],
    ['แก้: บันทึกไว้ 0 ไฟล์', { ...DRAWING_FULL, requiredFiles: [] }, { requiredFileCount: 0 }, false],
    ['แก้: รายการไฟล์ยังโหลดไม่เสร็จ/โหลดพัง', { ...DRAWING_FULL, requiredFiles: [] }, { requiredFileCount: null }, true],
  ];
  for (const [name, form, opts, passes] of rows) {
    const missing = missingRequiredByTab(form, opts);
    const blocker = requestFormBlocker(form, opts);
    const tabsMissing = requestFormTabs(form, { optionalRefs: [], ...opts })
      .flatMap((t) => t.required.missing);
    assert.equal(missing.length === 0, passes, `${name}: เกจ ${JSON.stringify(missing)}`);
    assert.equal(blocker == null, passes, `${name}: ด่าน ${blocker}`);
    assert.deepEqual(tabsMissing, missing, `${name}: แท็บกับรายการขาดต้องเป็นชุดเดียวกัน`);
  }
});

test('S4: ใบที่ยังไม่เลือกวิธี — ของขาดตัวแรกคือ "วิธีประเมิน" ที่แท็บงาน และด่านบอกประโยคเดียวกับ server', () => {
  const missing = missingRequiredByTab(SURVEY_FULL);
  assert.deepEqual(missing, [{ tab: 'work', label: 'วิธีประเมิน' }]);
  assert.equal(requestFormBlocker(SURVEY_FULL), 'ต้องเลือกวิธีประเมิน — ลงหน้างาน หรือ ประเมินจากแบบ');
});

/* ⭐ UAT S4 รอบ 4 ข้อ 12: ก่อนเลือกวิธี เกจเคยขึ้น 0/7 พร้อม "วันที่ต้องการให้เข้าพื้นที่ (บังคับ)" — แต่วิธีคือตัวตัดสินว่าช่องนั้นมีไหม
   (จากแบบไม่มี) ⇒ ของขาดจริงข้อเดียวคือวิธี · วันเข้าเริ่มนับเมื่อเลือกวิธีที่ต้องใช้มัน (ลงหน้างาน) · ช่องยังกรอกได้ตามเดิม */
test('S4 รอบ 4: ยังไม่เลือกวิธี = วันเข้าพื้นที่ยังไม่นับเป็นช่องบังคับ · เลือกลงหน้างานแล้วนับ · ด่าน server ไม่เปลี่ยน', () => {
  const blank = { dept: 'TS', kind: 'site_survey', dealId: 'DEAL-1', siteId: 'SVS-1' };
  const labels = (form) => requiredChecks(form).map((c) => c.label);
  assert.ok(!labels(blank).includes('วันที่ต้องการให้เข้าพื้นที่'));
  assert.ok(labels(blank).includes('วันที่ต้องการรับผลประเมิน'), 'วันรับผลบังคับทั้งสองวิธี — ยังนับ');
  assert.equal(labels(blank)[0], 'วิธีประเมิน');
  assert.ok(labels({ ...blank, variant: 'standard' }).includes('วันที่ต้องการให้เข้าพื้นที่'));
  assert.ok(!labels({ ...blank, variant: 'drawing' }).includes('วันที่ต้องการให้เข้าพื้นที่'));
  // วันที่พิมพ์ก่อนเลือกไม่ทำให้นับ (และไม่ทำให้เกจ "ครบ" ข้อนั้นทั้งที่ยังไม่มีข้อ)
  assert.ok(!labels({ ...blank, requestedDueDate: '2026-10-20' }).includes('วันที่ต้องการให้เข้าพื้นที่'));
  // ด่าน server/ปุ่ม: ยังไม่เลือก = ประโยคบังคับเลือกเหมือนเดิม (ถามก่อนข้อวันอยู่แล้ว)
  assert.equal(requestFormBlocker({ ...SURVEY_FULL, requestedDueDate: '' }), 'ต้องเลือกวิธีประเมิน — ลงหน้างาน หรือ ประเมินจากแบบ');
  // สวิตช์ปิด (หน้าเลือก "ลงหน้างาน" ไว้ให้) = นับวันเข้าเหมือนวันนี้
  assert.ok(labels({ ...blank, variant: 'standard' }).includes('วันที่ต้องการให้เข้าพื้นที่'));
  // หัวข้อที่ไม่บังคับเลือกวิธี (พัฒนาสูตร) ไม่เข้าข้อนี้ — ว่าง = รูปแบบตั้งต้น วันยังนับ
  assert.ok(labels({ dept: 'RD', kind: 'formula_dev', dealId: 'D', projectId: 'P' }).includes('วันที่ต้องการรับงาน'));
});

test('S4: ใบจากแบบไม่มีไฟล์ — ด่านบอกชื่อช่องตามที่จอเขียน', () => {
  const form = { ...DRAWING_FULL, requiredFiles: [] };
  assert.equal(
    requestFormBlocker(form),
    'ยังไม่ได้แนบไฟล์ในช่อง “แบบ / ผังพื้นที่ที่ให้ประเมิน” — ประเมินจากแบบต้องมีอย่างน้อย 1 ไฟล์',
  );
  assert.deepEqual(missingRequiredByTab(form), [{ tab: 'subject', label: 'แบบ / ผังพื้นที่ที่ให้ประเมิน' }]);
});

test('S4: รายการความพร้อมของใบจากแบบ — ลำดับตามที่ฟอร์มถาม · ไม่มีวันเข้าพื้นที่', () => {
  const form = { dept: 'TS', kind: 'site_survey', variant: 'drawing', dealId: 'DEAL-1', siteId: 'SVS-1' };
  assert.deepEqual(requiredChecks(form).map((c) => c.label), [
    'วิธีประเมิน', 'ดีล', 'สถานที่ที่จะให้ประเมิน', 'พื้นที่ที่ต้องประเมินอย่างน้อย 1 รายการ',
    'แบบ / ผังพื้นที่ที่ให้ประเมิน', 'ชื่อเรื่อง', 'รายละเอียดเพิ่มเติม', 'วันที่ต้องการรับผลประเมิน',
  ]);
  // ช่องไฟล์อยู่แท็บรายละเอียด (ใต้บล็อกไซต์) · วันรับผลอยู่แท็บกำหนด
  const tabOf = Object.fromEntries(requiredChecks(form).map((c) => [c.label, c.tab]));
  assert.equal(tabOf['แบบ / ผังพื้นที่ที่ให้ประเมิน'], 'subject');
  assert.equal(tabOf['วันที่ต้องการรับผลประเมิน'], 'due');
});

test('S4: รายการความพร้อมของใบลงหน้างาน — เหมือนเดิม ยกเว้นป้ายสถานที่กับบรรทัดแรก', () => {
  const form = { dept: 'TS', kind: 'site_survey', variant: 'standard', dealId: 'DEAL-1', siteId: 'SVS-1' };
  assert.deepEqual(requiredChecks(form).map(({ tab, label }) => [tab, label]), [
    ['work', 'วิธีประเมิน'],
    ['work', 'ดีล'],
    ['subject', 'สถานที่ที่จะให้ประเมิน'],
    ['subject', 'พื้นที่ที่ต้องประเมินอย่างน้อย 1 รายการ'],
    ['subject', 'ชื่อเรื่อง'],
    ['subject', 'รายละเอียดเพิ่มเติม'],
    ['due', 'วันที่ต้องการให้เข้าพื้นที่'],
    ['due', 'วันที่ต้องการรับผลประเมิน'],
  ]);
  // ⚠️ ไฟล์ในตะกร้าของใบลงหน้างานไม่ได้เป็นช่องบังคับ — ไม่มีบรรทัดไฟล์แบบ
  assert.equal(requiredChecks({ ...form, requiredFiles: [] }).some((c) => c.label.includes('แบบ / ผัง')), false);
});

test('S4: พัฒนาสูตร — รายการความพร้อมเท่าเดิมทุกตัวอักษร (ทั้ง Standard และ NPD)', () => {
  const fd = { dept: 'RD', kind: 'formula_dev', dealId: 'D', projectId: 'P', title: '', requestedDueDate: '', items: [] };
  const show = (form) => requiredChecks(form).map(({ tab, label, ok }) => [tab, label, ok]);
  // ค่าที่ตรึงไว้ = ผลของโค้ดก่อน S4 (รันจริงก่อนแก้)
  assert.deepEqual(show(fd), [
    ['work', 'ดีล', true], ['subject', 'ชื่อเรื่อง', false],
    ['subject', 'รายการที่กรอกครบอย่างน้อย 1 รายการ', false], ['due', 'วันที่ต้องการรับงาน', false],
  ]);
  assert.deepEqual(show({ ...fd, urgent: true }), [
    ['work', 'ดีล', true], ['subject', 'ชื่อเรื่อง', false],
    ['subject', 'รายการที่กรอกครบอย่างน้อย 1 รายการ', false], ['due', 'วันที่ต้องการรับงาน', false],
    ['due', 'เหตุผลที่เป็นงานด่วน', false],
  ]);
  assert.deepEqual(show({ ...fd, variant: 'npd', pdr: { packagingArtwork: 'has' } }), [
    ['work', 'ดีล', true], ['subject', 'ชื่อเรื่อง', false],
    ['due', 'วันที่ต้องการรับงาน', false], ['due', 'ไฟล์ภาพประกอบบรรจุภัณฑ์', false],
  ]);
  // ตัวนับไฟล์ของโหมดแก้ไม่มีผลกับหัวข้อที่ไม่มีช่องไฟล์บังคับ
  assert.deepEqual(show({ ...fd, variant: 'npd' }), requiredChecks({ ...fd, variant: 'npd' }, { requiredFileCount: 0 })
    .map(({ tab, label, ok }) => [tab, label, ok]));
});
