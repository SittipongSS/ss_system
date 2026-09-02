import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { missingRequiredByTab, requestFormTabs } from './formTabs.js';
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
    { ...base, kind: 'document', items: [{ docType: 'coa' }] },
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
    dept: 'TS', kind: 'site_survey', dealId: 'DEAL-1',
    title: 'ประเมินพื้นที่สาขา A', requestedDueDate: '2026-09-20',
  };
  const missing = missingRequiredByTab(survey);
  const site = missing.find((m) => m.label.includes('สถานที่'));
  assert.ok(site, 'ยังไม่เลือกสถานที่ = ต้องขึ้นว่าขาด');
  assert.equal(site.tab, 'subject');

  const withSite = { ...survey, siteId: 'SVS-1' };
  const zones = missingRequiredByTab(withSite).find((m) => m.label.includes('พื้นที่'));
  assert.ok(zones, 'เลือกสถานที่แล้วแต่ยังไม่มีพื้นที่ = ต้องขึ้นว่าขาด');
  assert.equal(zones.tab, 'subject');

  // ครบแล้วต้องไม่เหลือของขาด และด่านส่งต้องเห็นตรงกัน
  const full = { ...withSite, zones: [{ name: 'โซน 1' }] };
  assert.equal(missingRequiredByTab(full).length, 0);
  assert.equal(requestFormBlocker(full), null);

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
});
