// ── ภาพนิ่งของรายงานการประเมินพื้นที่ (snapshot v1 · mig 0401) ─────────────────────────────
//
// ⭐ ล็อกสี่เรื่อง: ① ภาพนิ่งชุดเดียวเป็นต้นทางของทั้งสองฉบับ — ตัวเลขมาจากตัวคิดตัวเดียวกับจอ (`surveyTotals` ฯลฯ)
//   ② รูปของจุดผูกด้วย `metadata.spotId` เท่านั้น ไม่เดาจากลำดับอัป ③ โหมดตรึง (`freeze`) ล้มแบบปิดเมื่อของขาด
//   — กระดาษที่ตรึงแล้วแก้ไม่ได้ ช่องโหว่บนกระดาษจึงซ่อมทีหลังไม่ได้ ④ ตัวสร้างไม่อ่านนาฬิกาและไม่แตะฐาน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_REPORT_INPUT_LABELS,
  SURVEY_REPORT_NO_VISIT,
  SURVEY_REPORT_SNAPSHOT_VERSION,
  buildSurveyReportSnapshot,
  surveyReportFreezeBlockers,
  surveyReportFreezeIssues,
  surveyReportImageFiles,
} from './surveyReportSnapshot.js';
import {
  PACKAGE_SIZE_SEED,
  fakeSha,
  markedSurveyInputs,
  surveyReportInputsFromFixture,
  syntheticSurveyFixture,
} from './surveyReportTestKit.mjs';

const twin = (opts) => surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);
const clone = (v) => structuredClone(v);

/* ── ของจริง (แฝดสังเคราะห์ของ RQ-AS-26090186) ─────────────────────── */

test('ภาพนิ่ง v1: หัวข้อครบตามสเปก — ไม่มีคีย์เกิน ไม่มีคีย์ขาด', () => {
  const { snapshot, errors } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.equal(errors, undefined);
  assert.equal(SURVEY_REPORT_SNAPSHOT_VERSION, 1);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'change', 'company', 'customer', 'deal', 'form', 'history', 'request', 'site', 'sizes',
    'takenAt', 'totals', 'v', 'visit', 'zones',
  ]);
  assert.equal(snapshot.v, 1);
  assert.equal(snapshot.takenAt, '2026-09-26T03:01:26.314+00:00');
  assert.deepEqual(Object.keys(snapshot.request).sort(), [
    'answeredAt', 'answeredById', 'answeredByName', 'assignedByName', 'body', 'closedAt', 'closedByName',
    'committedDueDate', 'committedDueTime', 'committedResultDate', 'docNo', 'id', 'requestedById',
    'requestedByName', 'requestedDueDate', 'requestedDueTime', 'requestedResultDate', 'submittedAt', 'team', 'title',
  ]);
  assert.deepEqual(Object.keys(snapshot.zones[0]).sort(), [
    'areaSqm', 'building', 'cutReason', 'floor', 'id', 'name', 'no', 'note', 'packageNote', 'packageQty',
    'packageSize', 'packageSizeManual', 'packageSizeSuggested', 'parts', 'plan', 'spots', 'status',
    'surveyedAt', 'surveyedByName', 'volumeCbm', 'wide', 'zoneCode',
  ]);
  assert.deepEqual(Object.keys(snapshot.visit).sort(), [
    'actualDate', 'actualEndDate', 'actualEndTime', 'actualStartTime', 'assignee', 'closedBySend', 'code',
    'endTime', 'helpers', 'priorUnable', 'scheduledDate', 'startTime', 'statusLabel', 'timeCredible',
  ]);
});

test('🔴 เลขที่เอกสารและวันที่ออกไม่อยู่ในภาพนิ่ง — เลขเกิดหลังภาพนิ่ง (อยู่ที่คอลัมน์ของแถว)', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  const text = JSON.stringify(snapshot);
  assert.ok(!('docNo' in snapshot) && !('issuedAt' in snapshot));
  assert.ok(!text.includes('SU-'));
});

test('ตัวเลขของจริง: 2 พื้นที่ · 173.31 ตร.ม. · 949.75 ลบ.ม. · SM 1 + ST 1 · เลือก 3 จุด', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.deepEqual(snapshot.totals, {
    zones: 2, cutZones: 0, addedZones: 1, areaSqm: 173.31, volumeCbm: 949.75,
    packageQty: 2, packagesBySize: { SM: 1, ST: 1 }, spotsSelected: 3,
  });
  assert.deepEqual(snapshot.change, { requested: 1, cut: 0, added: 1, assessed: 2 });
  const [z1, z2] = snapshot.zones;
  assert.deepEqual(
    [z1.no, z1.zoneCode, z1.name, z1.floor, z1.areaSqm, z1.volumeCbm, z1.packageSize, z1.packageQty],
    [1, 'ZN-1159-10253', 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส', 'GF', 63.2, 278.08, 'SM', 1],
  );
  assert.deepEqual(
    [z2.no, z2.zoneCode, z2.name, z2.status, z2.areaSqm, z2.volumeCbm, z2.packageSize, z2.packageQty],
    [2, 'ZN-1159-10523', 'ห้องที่2', 'added', 110.11, 671.67, 'ST', 1],
  );
  assert.deepEqual(z1.parts, [{
    letter: 'A', label: 'ห้องที่ 1', widthM: 8, lengthM: 7.9, heightM: 4.4, areaSqm: 63.2, volumeCbm: 278.08,
  }]);
});

test('นัด: เวลาที่บันทึกของจริง (17:45–17:45) ไม่เชื่อ ⇒ ตรึง timeCredible = false ลงภาพนิ่ง', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.deepEqual(snapshot.visit, {
    code: 'SV-26090013', statusLabel: 'เข้าแล้ว',
    scheduledDate: '2026-09-25', startTime: '12:00', endTime: null,
    actualDate: '2026-09-25', actualStartTime: '17:45', actualEndTime: '17:45', actualEndDate: null,
    closedBySend: false, timeCredible: false,
    assignee: { id: 'U-lead', name: 'Lead Assessor', roleLabel: 'เจ้าหน้าที่บริการอาวุโส (Senior)' },
    helpers: [], priorUnable: [],
  });
});

test('ไซต์: ช่วงเข้าไซต์เป็นข้อความเดียวกับที่จอใช้ · โน้ตภายในของไซต์ไม่เข้าภาพนิ่ง', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.deepEqual(snapshot.site, {
    code: 'ST-9001-01-BKK-1159', name: 'Sample & Sports Bangkok Tennis Club',
    address: '99 ถนนตัวอย่าง 32 แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร 10250',
    contactName: 'คุณสมมติ', contactPhone: '0800000000',
    accessText: 'ศ. · 09:00–17:00', accessNote: 'โทรแจ้งก่อนเข้าไป',
  });
  assert.ok(!JSON.stringify(snapshot).includes('โน้ตภายในของไซต์'));
});

test('ทะเบียนขนาด: ตรึงทั้งชุดตามลำดับทะเบียน — แก้/ลบขนาดทีหลังไม่เปลี่ยนเอกสารที่ออกแล้ว', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.deepEqual(snapshot.sizes, [
    { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
    { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
    { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
    { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
  ]);
});

test('ประวัติ: เฉพาะตีกลับ/แจ้งแก้แล้ว/ดึงกลับ เรียงเก่าก่อน · เหตุผลดึงกลับแกะจากข้อความ · ยอดก่อนหน้าติดมาด้วย', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  assert.deepEqual(snapshot.history, [{
    at: '2026-09-24T17:08:25.78+00:00', kind: 'recall', byName: 'Admin Tester', reason: 'ยังไม่ได้ส่งผล',
    totals: { zones: 1, areaSqm: 0, volumeCbm: 0, packageQty: 0, packagesBySize: null },
  }]);
  const marked = buildSurveyReportSnapshot(markedSurveyInputs().inputs, { mode: 'freeze' }).snapshot;
  assert.deepEqual(marked.history.map((h) => [h.kind, h.byName, h.reason]), [
    ['recall', 'MK_RECALL_BY', 'MK_RECALL_REASON'],
    ['send_back', 'MK_SENDBACK_BY', 'MK_SENDBACK_REASON'],
    ['send_back_done', 'MK_SENDBACK_DONE_BY', 'MK_SENDBACK_DONE_NOTE'],
  ]);
});

/* ── รูป ──────────────────────────────────────────────────────────── */

test('รูป: กว้าง/ผังเรียงเก่าก่อน · อ้างด้วย { attId, sha, w, h } · ลิสต์ images ไม่ซ้ำ sha', () => {
  const { snapshot, images } = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  const [z1] = snapshot.zones;
  assert.deepEqual(z1.wide.map((i) => i.attId), ['att-z1-w1', 'att-z1-w2']);
  assert.deepEqual(z1.wide[0], { attId: 'att-z1-w1', sha: fakeSha('att-z1-w1'), w: 1400, h: 1051 });
  assert.deepEqual(z1.plan, [{ attId: 'att-z1-p1', sha: fakeSha('att-z1-p1'), w: 1199, h: 919 }]);
  assert.equal(images.length, 8);
  assert.deepEqual(Object.keys(images[0]).sort(), ['attId', 'bytes', 'h', 'kind', 'sha', 'w']);
  assert.deepEqual(images.map((i) => i.kind).sort(), ['plan', 'plan', 'spot', 'spot', 'spot', 'wide', 'wide', 'wide']);
});

test('รูป: ไฟล์เดียวกันสองหมวด (ของจริง — รูปจุดซ้ำกับรูปกว้าง) = sha เดียว เก็บครั้งเดียว แต่พิมพ์ได้ทั้งสองหมวด', () => {
  const inputs = twin();
  const same = inputs.imageByAttId['att-z1-w2'];
  inputs.imageByAttId['att-z1-s1'] = { ...same };
  const { snapshot, images } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(images.length, 7);
  assert.equal(images.filter((i) => i.sha === same.sha).length, 1);
  assert.equal(snapshot.zones[0].wide[1].sha, same.sha);
  assert.equal(snapshot.zones[0].spots[0].photos[0].sha, same.sha);
});

test('🔴 จุด: เลข k.n นับจาก **ทุกจุด** ของพื้นที่ · รูปผูกด้วย spotId · จุดที่ไม่เลือกไม่พกรูป', () => {
  const { inputs } = markedSurveyInputs();
  const { snapshot, images } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  const [z1, cut, z3] = snapshot.zones;
  assert.deepEqual(z1.spots.map((s) => [s.no, s.label, s.selected, s.photos.map((p) => p.attId)]), [
    ['1.1', 'MK_SPOT_SELECTED', true, ['mk-z1-s-sel']],
    ['1.2', 'MK_SPOT_UNSELECTED', false, []],
  ]);
  // พื้นที่ที่ตัดไม่มีเลข ⇒ พื้นที่ถัดไปได้เลข 2 (ตรงกับลำดับบนตารางหน้า 1)
  assert.equal(cut.no, null);
  assert.equal(z3.no, 2);
  assert.deepEqual(z3.spots.map((s) => s.no), ['2.1']);
  // รูปของจุดที่ไม่เลือก กับรูปของพื้นที่ที่ตัด ไม่ถูกเก็บ — ไม่มีฉบับไหนพิมพ์
  const shas = images.map((i) => i.sha);
  assert.ok(!shas.includes(fakeSha('mk-z1-s-unsel')));
  assert.ok(!shas.includes(fakeSha('mk-z2-w1')));
  assert.deepEqual(cut.wide, []);
});

test('ไฟล์ที่ต้องเตรียมรูป = ชุดเดียวกับที่ภาพนิ่งอ้าง (PR-2 ใช้ลิสต์นี้ไปดึงจาก Drive)', () => {
  const { inputs } = markedSurveyInputs();
  const files = surveyReportImageFiles(inputs);
  assert.deepEqual(files.map((f) => [f.attId, f.kind]), [
    ['mk-z1-w1', 'wide'], ['mk-z1-p1', 'plan'], ['mk-z1-s-sel', 'spot'],
    ['mk-z3-w1', 'wide'], ['mk-z3-p1', 'plan'], ['mk-z3-s1', 'spot'],
  ]);
  const { images } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.deepEqual(images.map((i) => i.attId), files.map((f) => f.attId));
});

/* ── โหมดตรึง ล้มแบบปิด ───────────────────────────────────────────── */

test('ของครบ = ไม่มีเหตุขัดข้อง', () => {
  assert.deepEqual(surveyReportFreezeBlockers(twin()), []);
  assert.deepEqual(surveyReportFreezeBlockers(markedSurveyInputs().inputs), []);
});

test('🔴 รูปจุดที่ยังไม่ได้ผูกจุด (ของจริงก่อนหัวหน้าผูก) = ตรึงไม่ได้ บอกจำนวนและทางแก้', () => {
  const inputs = twin({ spotLinks: null });
  const blockers = surveyReportFreezeBlockers(inputs);
  assert.deepEqual(blockers, ['รูปจุดติดตั้ง 3 รูปยังไม่ได้ผูกจุด — ผูกในถาด "ยังไม่ได้ผูกจุด" ก่อน']);
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), { errors: blockers });
});

test('รูปที่ผูกกับจุดที่ถูกลบไปแล้ว = ยังไม่ได้ผูก (ตกถาด)', () => {
  const inputs = twin();
  inputs.filesByZone['SVZ-syn-1'].find((f) => f.id === 'att-z1-s1').metadata.spotId = 'deleted-spot';
  assert.match(surveyReportFreezeBlockers(inputs)[0], /รูปจุดติดตั้ง 1 รูปยังไม่ได้ผูกจุด/);
});

const broken = [
  ['ไม่มีใบคำร้อง', (i) => { i.request = null; }, /ไม่พบใบคำร้อง/],
  ['ไม่ใช่หัวข้อประเมินพื้นที่', (i) => { i.request.kind = 'price_pm'; }, /ไม่ใช่คำร้องประเมินพื้นที่/],
  ['ยังไม่ได้ส่งผล', (i) => { i.request.answeredAt = null; }, /ยังไม่ได้ส่งผล/],
  ['ไม่มีชื่อผู้ส่งผล', (i) => { i.request.answeredByName = ' '; }, /ไม่มีชื่อผู้ตรวจสอบและอนุมัติ/],
  ['ไม่มีลูกค้า', (i) => { i.customer = null; }, /ไม่พบข้อมูลลูกค้า/],
  ['ไม่มีไซต์', (i) => { i.site = null; }, /ไม่พบข้อมูลสถานที่/],
  ['ไม่มีนัด', (i) => { i.visit = null; }, /ไม่พบนัดประเมินพื้นที่/],
  ['นัดไม่มีวันที่', (i) => { i.visit.actualDate = null; i.visit.scheduledDate = null; }, /ไม่มีวันที่ประเมิน/],
  ['นัดไม่มีผู้ประเมิน', (i) => { i.visit.assigneeName = ''; }, /ไม่มีชื่อผู้ประเมิน/],
  ['ไม่มีพื้นที่', (i) => { i.zones = []; }, /ไม่มีพื้นที่ที่ประเมิน/],
  ['พื้นที่ถูกตัดหมด', (i) => { for (const z of i.zones) { z.status = 'cut'; z.cutReason = 'ลูกค้าขอตัดออก'; } }, /ไม่มีพื้นที่ที่ประเมิน/],
  ['พื้นที่ยังไม่วัด', (i) => { i.zones[1].parts = []; }, /ห้องที่2: ยังไม่มีขนาด/],
  ['พื้นที่วัดไม่ครบ', (i) => { i.zones[1].parts[0].heightM = null; }, /ห้องที่2: ยังไม่มีขนาด/],
  ['ยังไม่เคาะจำนวน', (i) => { i.zones[0].packageQty = null; }, /พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: ยังไม่ได้เคาะแพ็คเกจ/],
  ['ยังไม่เคาะขนาด', (i) => { i.zones[0].packageSize = null; }, /ยังไม่ได้เคาะแพ็คเกจ/],
  ['ไม่มีรหัสพื้นที่ในทะเบียน', (i) => { i.zoneRegistry = []; i.zones[0].zoneCode = null; }, /ไม่พบรหัสพื้นที่ในทะเบียน/],
  ['อ่านประวัติไม่สำเร็จ', (i) => { i.history = null; }, /อ่านประวัติตีกลับและดึงกลับไม่สำเร็จ/],
  ['อ่านทะเบียนขนาดไม่สำเร็จ', (i) => { i.sizes = null; }, /อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ/],
  ['ไม่มีข้อมูลบริษัท', (i) => { i.company = { name: '' }; }, /ไม่พบข้อมูลบริษัท/],
  ['ไม่มีมาตรฐานเอกสาร', (i) => { i.form = null; }, /ไม่พบมาตรฐานเอกสาร/],
  ['ไม่มีจุดเวลาของภาพนิ่ง', (i) => { i.takenAt = null; }, /ไม่มีจุดเวลา/],
];

for (const [name, breakIt, expected] of broken) {
  test(`🔴 ตรึงไม่ได้: ${name}`, () => {
    const inputs = clone(twin());
    breakIt(inputs);
    const blockers = surveyReportFreezeBlockers(inputs);
    assert.ok(blockers.some((b) => expected.test(b)), blockers.join(' | ') || '(ไม่มีเหตุขัดข้อง)');
    const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
    assert.ok(Array.isArray(built.errors) && built.errors.length > 0);
    assert.equal(built.snapshot, undefined);
  });
}

test('พื้นที่ที่ตัดออกไม่ต้องผ่านด่านไหน — ไม่วัด ไม่เคาะ ไม่มีรหัส ก็ตรึงได้', () => {
  const inputs = clone(twin());
  inputs.zones.push({
    id: 'SVZ-cut', zoneId: null, zoneCode: null, zoneName: 'ห้องเก็บของ', floor: null, status: 'cut',
    cutReason: 'ลูกค้าไม่ติดตั้งโซนนี้', parts: [], spots: [], packageQty: null, packageSize: null, sortOrder: 9,
  });
  inputs.filesByZone['SVZ-cut'] = [];
  assert.deepEqual(surveyReportFreezeBlockers(inputs), []);
  const { snapshot } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(snapshot.totals.cutZones, 1);
  assert.equal(snapshot.totals.zones, 2);
  assert.deepEqual(snapshot.change, { requested: 2, cut: 1, added: 1, assessed: 2 });
  assert.deepEqual(
    [snapshot.zones[2].no, snapshot.zones[2].status, snapshot.zones[2].cutReason],
    [null, 'cut', 'ลูกค้าไม่ติดตั้งโซนนี้'],
  );
});

test('🔴 รูป HEIC/BMP ถอดรหัสไม่ได้ = ตรึงไม่ได้ บอกชื่อไฟล์ (ช่องว่างบนกระดาษที่ตรึงแล้วซ่อมไม่ได้)', () => {
  const inputs = clone(twin());
  const file = inputs.filesByZone['SVZ-syn-1'][0];
  file.fileName = 'IMG_0001.HEIC';
  file.mimeType = 'image/heic';
  const blockers = surveyReportFreezeBlockers(inputs);
  assert.deepEqual(blockers, ['รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (IMG_0001.HEIC)']);
  // ดูจากนามสกุลด้วย เมื่อไม่มี mimeType
  file.mimeType = '';
  file.fileName = 'plan.bmp';
  assert.match(surveyReportFreezeBlockers(inputs)[0], /plan\.bmp/);
});

test('🔴 โหมดตรึงต้องมีรูปที่เตรียมแล้วครบทุกรูป · โหมดตรวจ (`check`) ยังไม่ต้องมี', () => {
  const noImages = twin({ withImages: false });
  assert.deepEqual(surveyReportFreezeBlockers(noImages), []); // ด่านบนการ์ดไม่รู้เรื่องรูปที่ยังไม่ได้ดึง
  const frozen = buildSurveyReportSnapshot(noImages, { mode: 'freeze' });
  assert.deepEqual(frozen.errors, ['รูป 8 รูปยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร']);
  const checked = buildSurveyReportSnapshot(noImages, { mode: 'check' });
  assert.equal(checked.errors, undefined);
  assert.deepEqual(checked.snapshot.zones[0].wide[0], { attId: 'att-z1-w1', sha: null, w: null, h: null });
  assert.deepEqual(checked.images, []);

  const partial = twin();
  delete partial.imageByAttId['att-z2-p1'];
  assert.deepEqual(
    buildSurveyReportSnapshot(partial, { mode: 'freeze' }).errors,
    ['รูป 1 รูปยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร'],
  );
});

test('รูปที่เตรียมแล้วส่งเป็น Map ก็ได้', () => {
  const inputs = twin();
  inputs.imageByAttId = new Map(Object.entries(inputs.imageByAttId));
  const { snapshot, errors } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(errors, undefined);
  assert.equal(snapshot.zones[1].plan[0].sha, fakeSha('att-z2-p1'));
});

/* ── ด่านรูปนับเฉพาะรูปที่กระดาษพิมพ์ (review 01/10) ─────────────── */

const extraFile = (id, docType, over = {}) => ({
  id, docType, fileName: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 9, createdAt: '2026-09-26T02:50:00+00:00', metadata: {}, ...over,
});

test('🔴 ผังรูปเก่าที่ยังไม่ได้เตรียม ไม่บล็อกการตรึง — กระดาษพิมพ์ผังรูปล่าสุดรูปเดียว', () => {
  const inputs = clone(twin());
  // ผังรูปใหม่ (เตรียมแล้ว) อัปทับผังเดิม · ผังเดิม att-z1-p1 ยังไม่ถูกเตรียม
  inputs.filesByZone['SVZ-syn-1'].push(extraFile('att-z1-p2', 'survey_plan'));
  inputs.imageByAttId['att-z1-p2'] = { sha: fakeSha('att-z1-p2'), w: 800, h: 600, bytes: 9 };
  delete inputs.imageByAttId['att-z1-p1'];
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  assert.deepEqual(built.snapshot.zones[0].plan.map((p) => p.attId), ['att-z1-p2']);
  assert.ok(built.warnings.some((w) => /มีภาพผัง 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว/.test(w)));
  // ลิสต์ที่ PR-2 ไปดึงจาก Drive กับคอลัมน์ `images` = ชุดเดียวกัน ไม่มีผังรูปเก่า
  const ids = surveyReportImageFiles(inputs).map((f) => f.attId);
  assert.ok(ids.includes('att-z1-p2') && !ids.includes('att-z1-p1'));
  assert.deepEqual(built.images.map((i) => i.attId), ids);
  // 🔴 กลับกัน: ผังรูปล่าสุดยังไม่เตรียม = ยังตรึงไม่ได้ (รูปที่จะพิมพ์จริง)
  const newest = clone(inputs);
  newest.imageByAttId['att-z1-p1'] = { sha: fakeSha('att-z1-p1'), w: 800, h: 600, bytes: 9 };
  delete newest.imageByAttId['att-z1-p2'];
  assert.deepEqual(buildSurveyReportSnapshot(newest, { mode: 'freeze' }).errors, ['รูป 1 รูปยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร']);
});

test('🔴 รูปที่สองของจุดที่เลือก ไม่บล็อกและไม่ถูกเก็บ — กระดาษพิมพ์รูปแรกรูปเดียว', () => {
  const inputs = clone(twin());
  inputs.filesByZone['SVZ-syn-1'].push(extraFile('att-z1-s2', 'survey_spot', { metadata: { spotId: 'new-zsgl2m9' } }));
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' }); // att-z1-s2 ไม่มีใน imageByAttId
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  assert.deepEqual(built.snapshot.zones[0].spots[0].photos.map((p) => p.attId), ['att-z1-s1']);
  assert.ok(!surveyReportImageFiles(inputs).some((f) => f.attId === 'att-z1-s2'));
  assert.ok(built.warnings.some((w) => /จุด 1\.1 มีรูป 2 รูป — เอกสารพิมพ์รูปแรกรูปเดียว/.test(w)));
});

test('🔴 HEIC บนจุดที่หัวหน้าไม่เลือก · บนผังรูปเก่า · เป็นรูปที่สองของจุด = ไม่บล็อก (ไม่มีฉบับไหนพิมพ์)', () => {
  const { inputs } = markedSurveyInputs();
  const zone = inputs.zones[0];
  const unselected = zone.spots.find((s) => s.selected !== true);
  const selected = zone.spots.find((s) => s.selected === true);
  const heic = (id, docType, metadata = {}) => extraFile(id, docType, { fileName: `${id}.HEIC`, mimeType: 'image/heic', metadata });
  // ① จุดที่ไม่เลือก ② รูปที่สองของจุดที่เลือก (รูปแรกเป็น JPG) ③ ผังรูปเก่า (เก่ากว่าผัง JPG ที่มีอยู่)
  inputs.filesByZone[zone.id].push(
    heic('heic-unsel', 'survey_spot', { spotId: unselected.id }),
    heic('heic-second', 'survey_spot', { spotId: selected.id }),
    { ...heic('heic-old-plan', 'survey_plan'), createdAt: '2026-09-01T00:00:00+00:00' },
  );
  assert.deepEqual(surveyReportFreezeBlockers(inputs), []);
  for (const mode of ['check', 'freeze']) {
    const built = buildSurveyReportSnapshot(inputs, { mode });
    assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  }
});

test('🔴 HEIC ที่ทำให้กระดาษขาดรูป ยังบล็อก: ภาพกว้าง · ผังรูปล่าสุด (ไม่ถอยไปพิมพ์ผังเก่าเงียบ ๆ) · จุดที่เลือกซึ่งไม่มีรูปอื่น', () => {
  const heic = (file) => { file.fileName = `${file.id}.HEIC`; file.mimeType = 'image/heic'; };
  const of = (inputs, id) => inputs.filesByZone['SVZ-syn-1'].find((f) => f.id === id);

  const wide = clone(twin());
  heic(of(wide, 'att-z1-w2'));
  assert.deepEqual(surveyReportFreezeBlockers(wide), ['รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (att-z1-w2.HEIC)']);

  // ผังที่แก้แล้วอัปเป็น HEIC ทับผัง JPG เดิม — ต้องบล็อก (พิมพ์ผังเดิมแทน = กระดาษผิดโดยไม่มีใครรู้) · ไม่ซ้ำกับข้อ "ไม่มีผัง"
  const plan = clone(twin());
  plan.filesByZone['SVZ-syn-1'].push(extraFile('att-z1-p2', 'survey_plan', { fileName: 'fixed.heic', mimeType: 'image/heic' }));
  assert.deepEqual(surveyReportFreezeBlockers(plan), ['รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (fixed.heic)']);

  const spot = clone(twin());
  heic(of(spot, 'att-z1-s1'));
  assert.deepEqual(surveyReportFreezeBlockers(spot), ['รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (att-z1-s1.HEIC)']);
});

test('🔴 พื้นที่ที่ไม่มีภาพผังที่พิมพ์ได้ = ตรึงไม่ได้ (ไม่มีผังเลย · ผังเป็น PDF) — โหมดร่างยังออกได้พร้อมคำเตือน', () => {
  const none = clone(twin());
  none.filesByZone['SVZ-syn-2'] = none.filesByZone['SVZ-syn-2'].filter((f) => f.docType !== 'survey_plan');
  assert.deepEqual(surveyReportFreezeBlockers(none), ['ห้องที่2: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)']);
  assert.deepEqual(buildSurveyReportSnapshot(none, { mode: 'freeze' }).errors, surveyReportFreezeBlockers(none));

  const pdf = clone(none);
  pdf.filesByZone['SVZ-syn-2'].push(extraFile('att-z2-pdf', 'survey_plan', { fileName: 'plan.pdf', mimeType: 'application/pdf' }));
  assert.match(surveyReportFreezeBlockers(pdf)[0], /ห้องที่2: ยังไม่มีภาพผังที่ลงเอกสารได้/);

  const draft = buildSurveyReportSnapshot(none, { mode: 'draft' });
  assert.equal(draft.errors, undefined);
  assert.deepEqual(draft.snapshot.zones[1].plan, []);
  assert.ok(draft.warnings.some((w) => /ยังไม่มีภาพผังที่ลงเอกสารได้/.test(w)));
});

/* ── โหมดร่าง ─────────────────────────────────────────────────────── */

test('โหมดร่าง: ของขาดไม่ล้ม — คืนภาพนิ่งพร้อมคำเตือนชุดเดียวกับเหตุขัดข้อง', () => {
  const inputs = clone(twin({ spotLinks: null, withImages: false }));
  inputs.customer = null;
  inputs.zones[1].packageSize = null;
  const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  assert.equal(draft.errors, undefined);
  assert.equal(draft.snapshot.customer.name, null);
  assert.equal(draft.snapshot.zones[1].packageSize, null);
  assert.ok(draft.warnings.some((w) => /ไม่พบข้อมูลลูกค้า/.test(w)));
  assert.ok(draft.warnings.some((w) => /ยังไม่ได้ผูกจุด/.test(w)));
  assert.ok(draft.warnings.some((w) => /ยังไม่ได้เคาะแพ็คเกจ/.test(w)));
  // รูปจุดที่ยังไม่ผูก ไม่ถูกเดาให้จุดไหนเลย
  assert.deepEqual(draft.snapshot.zones[0].spots[0].photos, []);
});

test('ไม่ส่ง mode = โหมดตรึง (ค่าตั้งต้นต้องเป็นทางที่เข้มที่สุด)', () => {
  const inputs = clone(twin());
  inputs.customer = null;
  assert.ok(Array.isArray(buildSurveyReportSnapshot(inputs).errors));
});

/* ── คำเตือนที่ไม่บล็อก ───────────────────────────────────────────── */

test('คำเตือน: ผังหลายรูป · จุดที่มีหลายรูป · ไฟล์ที่ไม่ใช่รูป — ตรึงได้ แต่ต้องบอกว่ากระดาษพิมพ์อะไร', () => {
  const inputs = clone(twin());
  const files = inputs.filesByZone['SVZ-syn-1'];
  files.push(
    { id: 'att-z1-p2', docType: 'survey_plan', fileName: '9048.jpg', mimeType: 'image/jpeg', sizeBytes: 9, createdAt: '2026-09-26T02:10:00+00:00', metadata: {} },
    { id: 'att-z1-s2', docType: 'survey_spot', fileName: 's2.jpg', mimeType: 'image/jpeg', sizeBytes: 9, createdAt: '2026-09-26T02:11:00+00:00', metadata: { spotId: 'new-zsgl2m9' } },
    { id: 'att-z1-pdf', docType: 'survey_plan', fileName: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: 9, createdAt: '2026-09-26T02:12:00+00:00', metadata: {} },
  );
  inputs.imageByAttId['att-z1-p2'] = { sha: fakeSha('att-z1-p2'), w: 800, h: 600, bytes: 9 };
  inputs.imageByAttId['att-z1-s2'] = { sha: fakeSha('att-z1-s2'), w: 800, h: 600, bytes: 9 };
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined);
  // ภาพนิ่งพกเฉพาะรูปที่กระดาษพิมพ์: ผังรูปล่าสุด · รูปแรกของจุด — รูปที่ไม่พิมพ์เหลือเป็นคำเตือน
  assert.deepEqual(built.snapshot.zones[0].plan.map((p) => p.attId), ['att-z1-p2']);
  assert.deepEqual(built.snapshot.zones[0].spots[0].photos.map((p) => p.attId), ['att-z1-s1']);
  assert.ok(!built.images.some((i) => i.attId === 'att-z1-p1' || i.attId === 'att-z1-s2'));
  assert.deepEqual(built.warnings, [
    'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: มีภาพผัง 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว',
    'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: จุด 1.1 มีรูป 2 รูป — เอกสารพิมพ์รูปแรกรูปเดียว',
    'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: ไฟล์ plan.pdf ไม่ใช่รูป — ไม่ลงเอกสาร',
  ]);
});

/* ── ความเป็นฟังก์ชันล้วน ─────────────────────────────────────────── */

test('ไม่แก้อินพุต · ผลนิ่ง (เรียกสองครั้งได้ของเท่ากัน) · ไม่อ่านนาฬิกา', () => {
  const inputs = twin();
  const before = JSON.stringify(inputs);
  const a = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  const b = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(JSON.stringify(inputs), before);
  assert.deepEqual(a, b);
  // ภาพนิ่งต้องลง jsonb ได้ตรง ๆ — ไม่มี undefined / Date / Map
  assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot)), a.snapshot);
});

test('ทะเบียนขนาดที่ส่งมาไม่เรียง — ภาพนิ่งเรียงตามทะเบียนเสมอ (เลือกเอง → ช่วงน้อยไปมาก → ไม่มีเพดาน)', () => {
  const inputs = twin({ sizes: [...PACKAGE_SIZE_SEED].reverse() });
  const { snapshot } = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.deepEqual(snapshot.sizes.map((s) => s.code), ['XS', 'SM', 'ST', 'XL']);
});

/* ── เหตุขัดข้องแยกชนิด (PR-2 §9) — `content` ตีกลับการส่งผล · `system` ไม่ตีกลับ ─────────────────── */

/* ชนิดของแต่ละข้อในตาราง `broken` ข้างบน — ข้อใหม่ที่ไม่มีในตารางนี้ทำให้เทสต์แดง (ต้องตัดสินชนิดก่อนเพิ่ม) */
const KIND_OF = {
  'ไม่มีใบคำร้อง': 'system',
  'ไม่ใช่หัวข้อประเมินพื้นที่': 'system',
  'ยังไม่ได้ส่งผล': 'system',
  'ไม่มีชื่อผู้ส่งผล': 'content',
  'ไม่มีลูกค้า': 'system',
  'ไม่มีไซต์': 'system',
  'ไม่มีนัด': 'content',
  'นัดไม่มีวันที่': 'content',
  'นัดไม่มีผู้ประเมิน': 'content',
  'ไม่มีพื้นที่': 'content',
  'พื้นที่ถูกตัดหมด': 'content',
  'พื้นที่ยังไม่วัด': 'content',
  'พื้นที่วัดไม่ครบ': 'content',
  'ยังไม่เคาะจำนวน': 'content',
  'ยังไม่เคาะขนาด': 'content',
  'ไม่มีรหัสพื้นที่ในทะเบียน': 'system',
  'อ่านประวัติไม่สำเร็จ': 'system',
  'อ่านทะเบียนขนาดไม่สำเร็จ': 'system',
  'ไม่มีข้อมูลบริษัท': 'system',
  'ไม่มีมาตรฐานเอกสาร': 'system',
  'ไม่มีจุดเวลาของภาพนิ่ง': 'system',
};

test('ตารางชนิดครอบทุกข้อของตาราง `broken`', () => {
  assert.deepEqual(broken.map(([name]) => name).sort(), Object.keys(KIND_OF).sort());
});

for (const [name, breakIt, expected] of broken) {
  test(`ชนิดของเหตุ: ${name} = ${KIND_OF[name]}`, () => {
    const inputs = clone(twin());
    breakIt(inputs);
    const issues = surveyReportFreezeIssues(inputs);
    const hit = issues.filter((issue) => expected.test(issue.text));
    assert.ok(hit.length > 0);
    for (const issue of hit) assert.equal(issue.kind, KIND_OF[name], issue.text);
    for (const issue of issues) assert.deepEqual(Object.keys(issue), ['kind', 'text']);
    // ตัวเดิมยังคืนข้อความชุดเดียวกัน ลำดับเดียวกัน — ตัวสร้างภาพนิ่งและเทสต์ PR-1 อ่านผ่านตัวนี้
    assert.deepEqual(surveyReportFreezeBlockers(inputs), issues.map((issue) => issue.text));
  });
}

test('ชนิดของเหตุจากไฟล์: ผังพิมพ์ไม่ได้ · HEIC/BMP · รูปจุดยังไม่ผูก = content ทั้งหมด', () => {
  const unlinked = surveyReportFreezeIssues(twin({ spotLinks: null }));
  assert.deepEqual(unlinked.map((i) => i.kind), ['content']);

  const inputs = clone(twin());
  const files = inputs.filesByZone['SVZ-syn-1'];
  const plan = files.find((f) => f.docType === 'survey_plan');
  plan.fileName = 'plan.pdf';
  plan.mimeType = 'application/pdf';
  const wide = files.find((f) => f.docType === 'survey_wide');
  wide.fileName = 'IMG_0001.HEIC';
  wide.mimeType = 'image/heic';
  const issues = surveyReportFreezeIssues(inputs);
  assert.equal(issues.length, 2);
  assert.match(issues[0].text, /ยังไม่มีภาพผังที่ลงเอกสารได้/);
  assert.match(issues[1].text, /เป็น HEIC\/BMP/);
  assert.deepEqual(issues.map((i) => i.kind), ['content', 'content']);
});

test('ของครบ = `[]` · ไม่มีใบคำร้อง = ข้อเดียวชนิด system · ไม่แก้อินพุต', () => {
  const inputs = twin();
  const before = clone(inputs);
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);
  assert.deepEqual(inputs, before);
  assert.deepEqual(surveyReportFreezeIssues(), [{ kind: 'system', text: 'ไม่พบใบคำร้อง' }]);
  assert.deepEqual(surveyReportFreezeIssues({ unknown: ['site'] }), [{ kind: 'system', text: 'ไม่พบใบคำร้อง' }]);
});

/* อินพุตของตัวโหลดเมื่อชิ้นหนึ่งอ่านไม่สำเร็จ — ชิ้นนั้นเป็น null และชื่อเข้า `unknown` */
const unreadCases = [
  ['customer', (i) => { i.customer = null; }],
  ['site', (i) => { i.site = null; }],
  ['visits', (i) => { i.visit = null; i.priorUnable = null; }],
  ['history', (i) => { i.history = null; }],
  ['sizes', (i) => { i.sizes = null; }],
  ['company', (i) => { i.company = null; }],
  ['form', (i) => { i.form = null; }],
  ['zones', (i) => { i.zones = null; i.filesByZone = null; i.zoneRegistry = null; }],
  ['files', (i) => { i.filesByZone = null; }],
  ['zoneRegistry', (i) => { i.zoneRegistry = null; for (const z of i.zones) z.zoneCode = null; }],
  ['deal', (i) => { i.deal = null; }],
  ['helpers', (i) => { i.helpers = null; }],
  ['assigneeRole', (i) => { i.assigneeRoleLabel = null; }],
  ['visitThread', () => {}],
];

test('ตารางชิ้นที่อ่านไม่สำเร็จครอบทุกชื่อที่มีป้าย', () => {
  assert.deepEqual(unreadCases.map(([name]) => name).sort(), Object.keys(SURVEY_REPORT_INPUT_LABELS).sort());
});

for (const [name, lose] of unreadCases) {
  test(`🔴 อ่าน ${name} ไม่สำเร็จ ≠ ไม่มี: ข้อเดียว ชนิด system ว่า "อ่าน…ไม่สำเร็จ" — ไม่มีข้อ "ไม่มี/ไม่พบ" ของชิ้นนั้น`, () => {
    const inputs = clone(twin());
    lose(inputs);
    inputs.unknown = [name];
    const want = [{ kind: 'system', text: `อ่าน${SURVEY_REPORT_INPUT_LABELS[name]}ไม่สำเร็จ` }];
    assert.deepEqual(surveyReportFreezeIssues(inputs), want);
    // โหมดตรึง/ตรวจไม่ออกภาพนิ่งจากอินพุตที่มีชิ้นไม่ทราบ · โหมดร่างออกได้พร้อมคำเตือน
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), { errors: [want[0].text] });
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'check' }), { errors: [want[0].text] });
    const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
    assert.ok(draft.snapshot);
    assert.ok(draft.warnings.includes(want[0].text));
  });
}

test('🔴 ชิ้นเดียวกันที่ "ไม่มีจริง" (ไม่มีใน unknown) ยังเป็นเหตุเดิม — นัดที่ไม่มี = content · ลูกค้าที่ไม่มี = system', () => {
  const noVisit = clone(twin());
  noVisit.visit = null;
  assert.deepEqual(surveyReportFreezeIssues(noVisit), [{ kind: 'content', text: SURVEY_REPORT_NO_VISIT }]);
  const noZones = clone(twin());
  noZones.zones = [];
  assert.deepEqual(surveyReportFreezeIssues(noZones), [{ kind: 'content', text: 'ไม่มีพื้นที่ที่ประเมิน' }]);
  const noCustomer = clone(twin());
  noCustomer.customer = null;
  assert.deepEqual(surveyReportFreezeIssues(noCustomer), [{ kind: 'system', text: 'ไม่พบข้อมูลลูกค้าของใบนี้' }]);
});

test('อ่านนัดไม่สำเร็จแต่มีนัดที่การส่งผลนี้ปิด: ยังตรวจนัดนั้น (content) และยังบอกว่าอ่านนัดไม่สำเร็จ (system)', () => {
  const inputs = clone(twin());
  inputs.visit.assigneeName = null;
  inputs.unknown = ['visits'];
  assert.deepEqual(surveyReportFreezeIssues(inputs), [
    { kind: 'content', text: 'นัดประเมินไม่มีชื่อผู้ประเมิน' },
    { kind: 'system', text: 'อ่านนัดประเมินไม่สำเร็จ' },
  ]);
});

test('อ่านไฟล์ไม่สำเร็จ: ข้อของตัวพื้นที่ (ขนาด · แพ็คเกจ) ยังตรวจ · ข้อที่ต้องใช้ไฟล์ (ผัง · HEIC · รูปจุด) ข้าม', () => {
  const inputs = clone(twin({ spotLinks: null }));
  inputs.filesByZone = null;
  inputs.zones[0].packageQty = null;
  inputs.unknown = ['files'];
  assert.deepEqual(surveyReportFreezeIssues(inputs), [
    { kind: 'content', text: 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส: ยังไม่ได้เคาะแพ็คเกจ (ขนาดและจำนวน)' },
    { kind: 'system', text: 'อ่านรูปของพื้นที่ไม่สำเร็จ' },
  ]);
});

test('หลายชิ้น · ชื่อซ้ำ · ชื่อที่ไม่มีป้าย: บอกชิ้นละครั้ง — ชื่อที่ไม่รู้จักยังเป็นเหตุ (ไม่ถูกกลืน)', () => {
  const inputs = clone(twin());
  inputs.deal = null;
  inputs.helpers = null;
  inputs.unknown = ['helpers', 'deal', 'helpers', '', null, 'somethingNew'];
  assert.deepEqual(surveyReportFreezeIssues(inputs), [
    { kind: 'system', text: 'อ่านชื่อผู้ช่วยบนนัดไม่สำเร็จ' },
    { kind: 'system', text: 'อ่านเลขที่ดีลไม่สำเร็จ' },
    { kind: 'system', text: 'อ่าน somethingNew ไม่สำเร็จ' },
  ]);
  // ไม่ใช่ลิสต์ = ไม่มีชิ้นไม่ทราบ
  assert.deepEqual(surveyReportFreezeIssues({ ...twin(), unknown: 'deal' }), []);
});
