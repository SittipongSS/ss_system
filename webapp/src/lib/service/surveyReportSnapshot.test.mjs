// ── ภาพนิ่งของรายงานการประเมินพื้นที่ (snapshot v1 · mig 0401) ─────────────────────────────
//
// ⭐ ล็อกสี่เรื่อง: ① ภาพนิ่งชุดเดียวเป็นต้นทางของทั้งสองฉบับ — ตัวเลขมาจากตัวคิดตัวเดียวกับจอ (`surveyTotals` ฯลฯ)
//   ② รูปของจุดผูกด้วย `metadata.spotId` เท่านั้น ไม่เดาจากลำดับอัป ③ โหมดตรึง (`freeze`) ล้มแบบปิดเมื่อของขาด
//   — กระดาษที่ตรึงแล้วแก้ไม่ได้ ช่องโหว่บนกระดาษจึงซ่อมทีหลังไม่ได้ ④ ตัวสร้างไม่อ่านนาฬิกาและไม่แตะฐาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { surveyReportSignatureIssues } from './surveyReportSigners.js';
import { SURVEY_CONFIRM_MISSING } from './surveyMethodSwitch.js';
import {
  SURVEY_REPORT_CONFIRM_MISSING,
  SURVEY_REPORT_INPUT_LABELS,
  SURVEY_REPORT_NO_VISIT_TAIL,
  SURVEY_REPORT_NO_VISIT,
  SURVEY_REPORT_SNAPSHOT_VERSION,
  buildSurveyReportSnapshot,
  surveyReportConfirmsDocNo,
  surveyReportFreezeBlockers,
  surveyReportFreezeIssues,
  surveyReportImageFiles,
} from './surveyReportSnapshot.js';
import { surveyReportView } from './surveyReportView.js';
import { SURVEY_CONFIRM_OF_LABEL } from './surveyConfirmLink.js';
import { loadSurveyReportInputs, surveyReportPrecheck } from './surveyReportInputs.js';
import {
  CONFIRM_ORIGINAL,
  PACKAGE_SIZE_SEED,
  confirmSurveyFixture,
  fakeSha,
  markedSurveyInputs,
  signedSurveyInputs,
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
    'assessment', 'change', 'company', 'customer', 'deal', 'form', 'history', 'otherVisits', 'request', 'site', 'sizes',
    'takenAt', 'totals', 'v', 'visit', 'zones',
  ]);
  assert.equal(snapshot.v, 1);
  assert.equal(snapshot.takenAt, '2026-09-26T03:01:26.314+00:00');
  assert.deepEqual(Object.keys(snapshot.request).sort(), [
    'answeredAt', 'answeredById', 'answeredByName', 'assignedByName', 'body', 'closedAt', 'closedByName',
    'committedDueDate', 'committedDueTime', 'committedResultDate', 'docNo', 'id', 'requestedById',
    'requestedByName', 'requestedDueDate', 'requestedDueTime', 'requestedResultDate', 'submittedAt', 'surveyConfirm', 'team', 'title',
  ]);
  assert.deepEqual(Object.keys(snapshot.zones[0]).sort(), [
    'areaSqm', 'building', 'cutReason', 'drawingAt', 'drawingBy', 'floor', 'id', 'method', 'methodChangedAt',
    'methodChangedByName', 'methodReason', 'name', 'no', 'note', 'packageNote', 'packageQty',
    'packageSize', 'packageSizeManual', 'packageSizeSuggested', 'parts', 'plan', 'spots', 'status',
    'surveyedAt', 'surveyedByName', 'volumeCbm', 'wide', 'zoneCode',
  ]);
  assert.deepEqual(Object.keys(snapshot.assessment).sort(), [
    'drawingAt', 'drawingBy', 'drawingById', 'drawingZones', 'mode', 'onsiteZones', 'totalZones',
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
  // กติกาลายเซ็นจริงเปิด + อ่านลายเซ็นไม่สำเร็จ: ต้องไม่กลายเป็น "ยังไม่มีลายเซ็น" (ชนิด content ที่ตีกลับการส่งผล)
  ['signatures', (i) => { i.signatureRule = 'required'; i.signatures = null; }],
  // งวด S5 — อ่านใบต้นทางของใบยืนยันไม่สำเร็จ: ไม่มีคีย์ `confirmsDocNo` (เหมือนใบไม่ผูก) แต่ต้องไม่ออกเอกสารที่ขาดแถว "ยืนยันผลจากแบบของ"
  ['confirms', (i) => { delete i.confirmsDocNo; }],
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

/* ══ ลายเซ็นจริงของผู้ลงนาม (PR-SIG §2.2 · §3.4 · มติเจ้าของ 09/10/2026) ═══════════════════════════ */

const SIGN_SHA = { lead: fakeSha('sign-lead'), head: fakeSha('sign-head') };
const signVersion = (id) => ({
  versionId: id, versionNumber: 3, storagePath: `users/${id}/secret-path.png`, sha256: `sha256:${fakeSha(id)}`, width: 640, height: 240,
});
/** แฝดสังเคราะห์ที่กติกาเปิด — ผู้ประเมิน U-lead · ผู้ส่งผล U-head · `have` = คนที่มีลายเซ็น · `prepared` = เตรียมรูปแล้วไหม */
function signedTwin({ have = ['U-lead', 'U-head'], prepared = true, ...over } = {}) {
  const inputs = twin();
  return {
    ...inputs,
    signatureRule: 'required',
    signatures: {
      'U-lead': have.includes('U-lead') ? signVersion('V-lead') : null,
      'U-head': have.includes('U-head') ? signVersion('V-head') : null,
    },
    ...(prepared ? {
      signatureImageByVersionId: {
        'V-lead': { sha: SIGN_SHA.lead, w: 533, h: 200, bytes: 4100 },
        'V-head': { sha: SIGN_SHA.head, w: 533, h: 200, bytes: 4200 },
      },
    } : {}),
    assigneeAccount: 'active',
    signerEligible: { assessor: true, approver: true },
    ...over,
  };
}

test('🔴 กติกาปิด: ภาพนิ่งไม่มีคีย์ `signatures` และเท่าเดิมทุกไบต์ แม้อินพุตจะพกลายเซ็นมา', () => {
  const base = buildSurveyReportSnapshot(twin(), { mode: 'freeze' });
  for (const rule of [undefined, 'off', 'on', true]) {
    const off = signedTwin();
    if (rule === undefined) delete off.signatureRule;
    else off.signatureRule = rule;
    const got = buildSurveyReportSnapshot(off, { mode: 'freeze' });
    assert.deepEqual(got, base, String(rule));
    assert.equal('signatures' in got.snapshot, false);
    assert.deepEqual(surveyReportFreezeIssues({ ...off, signatures: null }), [], 'กติกาปิด = ไม่ถามเรื่องลายเซ็น');
  }
});

test('⭐ กติกาเปิด · โหมดตรึง: ภาพนิ่งตรึงฉบับกับรูปของทั้งสองที่นั่ง · คอลัมน์ images ได้แถวชนิด sign · ไม่มีที่อยู่ไฟล์ของคลัง', () => {
  const inputs = signedTwin();
  const before = clone(inputs);
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  assert.deepEqual(inputs, before, 'ไม่แก้อินพุต');
  assert.equal(built.snapshot.v, 1, 'ยังเป็น v1 — เพิ่มคีย์อย่างเดียว');
  assert.deepEqual(built.snapshot.signatures, {
    assessor: {
      userId: 'U-lead', name: 'Lead Assessor', versionId: 'V-lead', versionNumber: 3,
      sourceSha256: `sha256:${fakeSha('V-lead')}`, img: { sha: SIGN_SHA.lead, w: 533, h: 200 },
    },
    approver: {
      userId: 'U-head', name: 'Head Approver', versionId: 'V-head', versionNumber: 3,
      sourceSha256: `sha256:${fakeSha('V-head')}`, img: { sha: SIGN_SHA.head, w: 533, h: 200 },
    },
  });
  // คีย์อื่นของภาพนิ่งไม่ขยับ
  const { signatures: _signatures, ...rest } = built.snapshot;
  assert.deepEqual(rest, buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).snapshot);
  assert.deepEqual(built.images.filter((row) => row.kind === 'sign'), [
    { sha: SIGN_SHA.lead, attId: null, kind: 'sign', w: 533, h: 200, bytes: 4100 },
    { sha: SIGN_SHA.head, attId: null, kind: 'sign', w: 533, h: 200, bytes: 4200 },
  ]);
  assert.deepEqual(built.images.filter((row) => row.kind !== 'sign'), buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).images);
  // 🔴 ที่อยู่ไฟล์ของคลังลายเซ็นไม่เข้าภาพนิ่งและไม่เข้าคอลัมน์ images
  const text = JSON.stringify(built);
  assert.ok(!text.includes('secret-path') && !text.includes('storagePath') && !text.includes('users/'));
  // เรียกซ้ำได้ของเท่ากัน
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), built);
});

test('คนเดียวสองที่นั่ง: สองที่นั่งชี้ฉบับเดียวกัน · images มีแถว sign แถวเดียว (หนึ่งแถวต่อ sha) · รับแผนที่รูปเป็น Map ได้', () => {
  const inputs = signedTwin();
  inputs.request = { ...inputs.request, answeredById: 'U-lead', answeredByName: 'Lead Assessor' };
  inputs.signatureImageByVersionId = new Map(Object.entries(inputs.signatureImageByVersionId));
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined);
  assert.equal(built.snapshot.signatures.assessor.versionId, 'V-lead');
  assert.equal(built.snapshot.signatures.approver.versionId, 'V-lead');
  assert.deepEqual(built.snapshot.signatures.approver.img, { sha: SIGN_SHA.lead, w: 533, h: 200 });
  assert.equal(built.images.filter((row) => row.kind === 'sign').length, 1);
});

test('🔴 โหมดตรึงไม่มีวันถอยไปพิมพ์คำ: ที่นั่งที่พิมพ์ชื่อแต่ยังไม่มีรูปที่เตรียมแล้ว = errors บอกชื่อ (คนละบรรทัด ไม่ซ้ำ)', () => {
  assert.deepEqual(buildSurveyReportSnapshot(signedTwin({ prepared: false }), { mode: 'freeze' }), {
    errors: [
      'ลายเซ็นของ Lead Assessor ยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร',
      'ลายเซ็นของ Head Approver ยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร',
    ],
  });
  const half = signedTwin();
  delete half.signatureImageByVersionId['V-head'];
  assert.deepEqual(buildSurveyReportSnapshot(half, { mode: 'freeze' }).errors, ['ลายเซ็นของ Head Approver ยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร']);
  // รูปที่ไม่มี sha = ยังไม่เตรียม
  const noSha = signedTwin();
  noSha.signatureImageByVersionId['V-lead'] = { w: 1, h: 1 };
  assert.match(buildSurveyReportSnapshot(noSha, { mode: 'freeze' }).errors[0], /^ลายเซ็นของ Lead Assessor ยังเตรียมไม่เสร็จ/);
  // คนเดียวสองที่นั่ง = บรรทัดเดียว
  const same = signedTwin({ prepared: false });
  same.request = { ...same.request, answeredById: 'U-lead', answeredByName: 'Lead Assessor' };
  assert.equal(buildSurveyReportSnapshot(same, { mode: 'freeze' }).errors.length, 1);
  // รูปของพื้นที่ยังไม่ครบมาก่อน — บรรทัดเดิมของรูป
  const noPhotos = signedTwin({ prepared: false });
  delete noPhotos.imageByAttId;
  assert.match(buildSurveyReportSnapshot(noPhotos, { mode: 'freeze' }).errors[0], /^รูป \d+ รูปยังเตรียมไม่เสร็จ/);
});

test('โหมดตรวจ (`check`): ยังไม่ต้องมีรูปลายเซ็น — ภาพนิ่งพกฉบับ รูปเป็น null · จัดหน้าได้เหมือนเดิม', () => {
  const built = buildSurveyReportSnapshot(signedTwin({ prepared: false }), { mode: 'check' });
  assert.equal(built.errors, undefined);
  assert.equal(built.snapshot.signatures.assessor.versionId, 'V-lead');
  assert.equal(built.snapshot.signatures.assessor.img, null);
  assert.equal(built.snapshot.signatures.approver.img, null);
  assert.equal(built.images.some((row) => row.kind === 'sign'), false);
});

test('🔴 ผู้ลงนามยังไม่มีลายเซ็น: โหมดตรึง/ตรวจปฏิเสธด้วยบรรทัดของ `surveyReportSignatureIssues` · โหมดร่างออกได้ ที่นั่งนั้นเป็น null', () => {
  const inputs = signedTwin({ have: ['U-head'] });
  const line = 'ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน';
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'], text: line }]);
  assert.deepEqual(surveyReportFreezeIssues(inputs), surveyReportSignatureIssues(inputs));
  assert.deepEqual(surveyReportFreezeBlockers(inputs), [line]);
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), { errors: [line] });
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'check' }), { errors: [line] });
  const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  assert.deepEqual(draft.warnings, [line]);
  assert.equal(draft.snapshot.signatures.assessor, null);
  assert.equal(draft.snapshot.signatures.approver.versionId, 'V-head');
  // ไม่มีใครมีลายเซ็น = สองบรรทัด · ผู้ประเมินก่อน
  assert.deepEqual(surveyReportFreezeIssues(signedTwin({ have: [] })).map((i) => i.seats), [['assessor'], ['approver']]);
});

test('ลำดับ: บรรทัดลายเซ็นต่อจากก้อนนัดทันที — ก่อนเหตุของระบบและของพื้นที่ · ข้ออื่นไม่ขยับลำดับ', () => {
  const inputs = signedTwin({ have: [] });
  inputs.customer = null;                     // system · ก่อนก้อนนัด
  inputs.form = null;                         // system · หลังก้อนนัด
  inputs.zones[0].packageQty = null;          // content · ท้าย ๆ
  const withRule = surveyReportFreezeIssues(inputs).map((i) => i.text);
  const without = surveyReportFreezeIssues({ ...inputs, signatureRule: undefined }).map((i) => i.text);
  assert.equal(without.length, 3);
  assert.deepEqual(withRule.filter((line) => !line.includes('ยังไม่มีลายเซ็น')), without, 'ข้อเดิมอยู่ครบ ลำดับเดิม');
  assert.deepEqual(withRule.map((line) => (line.includes('ยังไม่มีลายเซ็น') ? 'sign' : 'x')), ['x', 'sign', 'sign', 'x', 'x']);
});

/* ── งวด S3 §2.6: ใบที่มีพื้นที่ประเมินจากแบบถูกถามเรื่องลายเซ็น (แทนเทสต์ "ข้อกัน ⇔ ไม่ถามลายเซ็น" ของ PR-SIG) ── */
/** ใบจากแบบล้วนของแฝด — ไม่มีนัด · `seat1` = ผู้ส่งผลเป็นผู้ประเมินจากแบบคนเดียว (ชื่อคนสลับ = ชื่อผู้ส่งผล) */
function deskTwin({ seat1 = true, ...opts } = {}) {
  const inputs = signedTwin(opts);
  for (const zone of inputs.zones) {
    Object.assign(zone, {
      method: 'drawing', methodChangedAt: '2026-09-26T02:50:00.000+00:00',   // หลังช่างบันทึก (02:40) = ทาง ② ทุกพื้นที่
      methodChangedByName: seat1 ? inputs.request.answeredByName : 'หัวหน้า อีกคน',
    });
  }
  inputs.visit = null;
  inputs.request = { ...inputs.request, surveyConfirm: 'needed' };
  return inputs;
}

test('⭐ ใบผสมถามสองที่นั่งเหมือนใบลงหน้างาน · ใบจากแบบล้วนถามที่นั่งผู้อนุมัติที่เดียว — ไม่มีข้อไหนพก hold', () => {
  const seatsAsked = (issues) => issues.filter((i) => i.sign === true).flatMap((i) => i.seats);
  const onsite = signedTwin({ have: [] });
  const mixed = signedTwin({ have: [] });
  mixed.zones[1].method = 'drawing';
  mixed.request = { ...mixed.request, surveyConfirm: 'not_needed' };
  const desk = deskTwin({ have: [] });
  assert.deepEqual(seatsAsked(surveyReportFreezeIssues(onsite)), ['assessor', 'approver']);
  assert.deepEqual(seatsAsked(surveyReportFreezeIssues(mixed)), ['assessor', 'approver']);
  assert.deepEqual(seatsAsked(surveyReportFreezeIssues(desk)), ['approver']);
  for (const inputs of [onsite, mixed, desk]) {
    for (const issue of surveyReportFreezeIssues(inputs)) assert.equal('hold' in issue, false, issue.text);
  }
});

test('⭐ ลายเซ็นของใบจากแบบล้วน: ที่นั่งที่ 1 = สำเนาของผู้อนุมัติเฉพาะเมื่อ drawingById มีค่า · ไม่งั้น null · ไม่เคยค้างรอรูป', () => {
  const copied = buildSurveyReportSnapshot(deskTwin(), { mode: 'freeze' });
  assert.equal(copied.errors, undefined, (copied.errors || []).join(' | '));
  assert.equal(copied.snapshot.assessment.drawingById, 'U-head');
  assert.deepEqual(copied.snapshot.signatures.assessor, copied.snapshot.signatures.approver);
  assert.notEqual(copied.snapshot.signatures.assessor, copied.snapshot.signatures.approver, 'สำเนา ไม่ใช่ตัวเดียวกัน');
  assert.equal(copied.snapshot.signatures.approver.img.sha, SIGN_SHA.head);
  assert.deepEqual(copied.images.filter((r) => r.kind === 'sign').map((r) => r.sha), [SIGN_SHA.head], 'รูปเดียว แถวเดียว');

  const words = buildSurveyReportSnapshot(deskTwin({ seat1: false }), { mode: 'freeze' });
  assert.equal(words.errors, undefined, (words.errors || []).join(' | '));
  assert.equal(words.snapshot.assessment.drawingById, null);
  assert.equal(words.snapshot.signatures.assessor, null);
  assert.equal(words.snapshot.signatures.approver.img.sha, SIGN_SHA.head);

  // ผู้อนุมัติไม่มีลายเซ็น (ฉบับร่าง): ทั้งสองที่นั่ง null · ไม่มีชื่อผู้ประเมินในข้อความรอรูป
  const none = buildSurveyReportSnapshot(deskTwin({ have: [], prepared: false }), { mode: 'draft' });
  assert.deepEqual(none.snapshot.signatures, { assessor: null, approver: null });
  // ยังไม่เตรียมรูป: โหมดตรึงล้มด้วยชื่อผู้ส่งผลคนเดียว
  assert.deepEqual(buildSurveyReportSnapshot(deskTwin({ prepared: false }), { mode: 'freeze' }).errors,
    ['ลายเซ็นของ Head Approver ยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร']);
});

test('ใบผสม: ภาพนิ่งมีคีย์ `signatures` สองที่นั่งเหมือนใบลงหน้างาน', () => {
  const inputs = signedTwin();
  inputs.zones[1].method = 'drawing';
  inputs.request = { ...inputs.request, surveyConfirm: 'needed' };
  const { snapshot, errors } = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  assert.equal(errors, undefined);
  assert.equal(snapshot.signatures.assessor.img.sha, SIGN_SHA.lead);
  assert.equal(snapshot.signatures.approver.img.sha, SIGN_SHA.head);
});

test('🔴 บัญชีที่นั่งที่นั่งนั้นไม่ได้ (หรือยังไม่รู้) ไม่มีวันถูกตรึงลายเซ็น — แม้มีลายเซ็นและรูปถูกเตรียมมาแล้ว', () => {
  const lines = {
    assessor: 'ผู้ประเมิน Lead Assessor ไม่ใช่บัญชีฝ่ายบริการ — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด',
    approver: 'ผู้ตรวจสอบและอนุมัติ Head Approver (ผู้ส่งผล) ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน (หัวหน้าฝ่ายบริการ) — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่',
  };
  const sha = { assessor: SIGN_SHA.lead, approver: SIGN_SHA.head };
  for (const seat of ['assessor', 'approver']) {
    const other = seat === 'assessor' ? 'approver' : 'assessor';
    // ทั้งสองคนมีลายเซ็นครบ และรูปของทั้งคู่ "เตรียมแล้ว" (เหมือนผู้เรียกส่งของที่เตรียมไว้มาทั้งชุด)
    const barred = signedTwin({ signerEligible: { [seat]: false, [other]: true } });
    assert.deepEqual(surveyReportFreezeIssues(barred), [{ kind: 'content', text: lines[seat] }], seat);
    for (const mode of ['freeze', 'check']) {
      const got = buildSurveyReportSnapshot(barred, { mode });
      assert.equal(got.snapshot, undefined, `${seat} · ${mode}`);
      assert.deepEqual(got.errors, [lines[seat]], `${seat} · ${mode}`);
    }
    // ฉบับร่าง (ด่านไม่หยุด): ที่นั่งนั้นว่าง รูปของเขาไม่เข้าคอลัมน์ images · อีกที่นั่งยังปกติ
    const draft = buildSurveyReportSnapshot(barred, { mode: 'draft' });
    assert.equal(draft.snapshot.signatures[seat], null, seat);
    assert.equal(draft.snapshot.signatures[other].img.sha, sha[other], seat);
    assert.deepEqual(draft.images.filter((row) => row.kind === 'sign').map((row) => row.sha), [sha[other]], seat);
    assert.ok(!JSON.stringify(draft.snapshot).includes(sha[seat]), `${seat}: sha ของลายเซ็นที่ไม่ถูกพิมพ์ต้องไม่อยู่ในภาพนิ่ง`);

    // ไม่รู้ (ไม่มีธง — ผู้เรียกลืมตั้ง · ตัวโหลดอ่านบัญชีไม่ได้): โหมดตรึงล้ม · ฉบับร่างว่าง
    const unsure = signedTwin({ signerEligible: { [other]: true } });
    assert.equal(buildSurveyReportSnapshot(unsure, { mode: 'freeze' }).snapshot, undefined, seat);
    assert.equal(buildSurveyReportSnapshot(unsure, { mode: 'draft' }).snapshot.signatures[seat], null, seat);
  }
  // ไม่มีธงเลย = ไม่มีที่นั่งไหนถูกตรึง
  const blank = signedTwin({ signerEligible: undefined });
  assert.equal(buildSurveyReportSnapshot(blank, { mode: 'freeze' }).snapshot, undefined);
  assert.deepEqual(buildSurveyReportSnapshot(blank, { mode: 'draft' }).snapshot.signatures, { assessor: null, approver: null });
});

test('🔴 อ่านลายเซ็นไม่สำเร็จ ≠ ยังไม่มีลายเซ็น: ข้อเดียวชนิด system ตรงตำแหน่งเดิมของบรรทัดลายเซ็น — ไม่มีบรรทัด "ยังไม่มีลายเซ็น"', () => {
  const inputs = signedTwin({ have: [], signatures: null, unknown: ['signatures'] });
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'อ่านลายเซ็นของผู้ลงนามไม่สำเร็จ' }]);
  assert.equal(SURVEY_REPORT_INPUT_LABELS.signatures, 'ลายเซ็นของผู้ลงนาม');
  // ใบผสมที่อ่านลายเซ็นพลาด: บรรทัดเดียวกัน (งวด S3 ถอดข้อกันของใบจากแบบแล้ว)
  inputs.zones[0].method = 'drawing';
  inputs.request = { ...inputs.request, surveyConfirm: 'needed' };
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'อ่านลายเซ็นของผู้ลงนามไม่สำเร็จ' }]);
});

test('ที่นั่งที่พิมพ์ชื่อแต่ไม่ได้ผูกบัญชี: โหมดตรึงปฏิเสธ (content ไม่มี sign) · โหมดร่างออกได้ ที่นั่งเป็น null', () => {
  const inputs = signedTwin();
  inputs.visit = { ...inputs.visit, assigneeId: null };
  const issues = surveyReportFreezeIssues(inputs);
  assert.deepEqual(issues, [{ kind: 'content', text: 'ผู้ประเมิน Lead Assessor ไม่ได้ผูกกับบัญชีผู้ใช้ — ออกเอกสารไม่ได้ แจ้งผู้จัดคิวหรือผู้ดูแลระบบ' }]);
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }).errors, [issues[0].text]);
  assert.equal(buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot.signatures.assessor, null);
});

test('🔴 ยามของโหมดตรึงเดินตามที่นั่ง: ด่านถูกข้าม (ลิสต์ผู้ลงนามว่างด้วยเหตุใดก็ตาม) ก็ยังไม่ตรึงกระดาษที่ไม่มีรูปลายเซ็น', () => {
  // จำลอง "ด่านไม่ได้ทัก": ที่นั่งมีชื่อและมีบัญชี แต่แผนที่ลายเซ็นของผู้เรียกไม่มีคนนั้น และรูปก็ไม่ได้เตรียม — ตัวสร้างเองต้องปฏิเสธ
  const inputs = signedTwin();
  inputs.signatures = { 'U-lead': signVersion('V-lead'), 'U-head': signVersion('V-head') };
  inputs.signatureImageByVersionId = {};
  const got = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(got.snapshot, undefined);
  assert.equal(got.errors.length, 2);
});


/* ══ งวด S3 — ข้อของด่าน (§2.3) · ชุดไฟล์ของพื้นที่จากแบบ (§2.4) · คีย์ใหม่ของภาพนิ่ง (§2.5) ═══════════════════════════ */

const S3_SWITCH = '2026-09-26T02:50:00.000+00:00';   // หลังช่างบันทึกทั้งสองพื้นที่ของแฝด (02:00 · 02:40)
/** แฝดที่พื้นที่ `which` เป็นจากแบบ (ทาง ② — หัวหน้าสลับหลังช่างบันทึก) · `confirm` = คำตอบบนใบ */
function s3Twin({ which = [1], switcher = 'Head Approver', ...over } = {}) {
  const confirm = Object.hasOwn(over, 'confirm') ? over.confirm : 'needed';
  delete over.confirm;
  const inputs = twin();
  for (const i of which) {
    Object.assign(inputs.zones[i], {
      method: 'drawing', methodChangedAt: S3_SWITCH, methodChangedByName: switcher, methodReason: 'ลูกค้าส่งแบบมาแล้ว',
    });
  }
  if (which.length === inputs.zones.length) inputs.visit = null;
  inputs.request = { ...inputs.request, surveyConfirm: confirm };
  return { ...inputs, ...over };
}
const planFile = (id, mimeType, createdAt, fileName = `${id}`) => ({
  id, docType: 'survey_plan', mimeType, fileName, createdAt,
});

test('S3 §2.3: ค่าคงที่ใหม่ — ข้อความเดียวกับที่ route ส่งผลใช้ · หางของบรรทัดไม่พบนัด', () => {
  assert.equal(SURVEY_REPORT_CONFIRM_MISSING, SURVEY_CONFIRM_MISSING);
  assert.equal(SURVEY_REPORT_NO_VISIT_TAIL, ' — พื้นที่ที่ไม่ได้ลงหน้างานให้เปลี่ยนเป็น “ประเมินจากแบบ”');
});

test('S3 §2.3 ข้อ 2: ใบที่ส่งแล้วมีพื้นที่จากแบบแต่ไม่มีคำตอบ = content · รอบตรวจก่อนส่ง (answerPending) ไม่ถาม · ใบลงหน้างานไม่ถาม', () => {
  const missing = { kind: 'content', text: SURVEY_REPORT_CONFIRM_MISSING };
  const has = (inputs) => surveyReportFreezeIssues(inputs).some((i) => i.text === SURVEY_REPORT_CONFIRM_MISSING);
  for (const confirm of [null, undefined, '', 'maybe', 'Needed']) {
    assert.deepEqual(surveyReportFreezeIssues(s3Twin({ confirm })), [missing], `ผสม · ${confirm}`);
    assert.equal(has(s3Twin({ which: [0, 1], confirm })), true, `จากแบบล้วน · ${confirm}`);
    assert.equal(has(s3Twin({ confirm, answerPending: true })), false, `รอบตรวจ · ${confirm}`);
    assert.equal(has(s3Twin({ which: [], confirm })), false, `ลงหน้างาน · ${confirm}`);
  }
  for (const confirm of ['needed', 'not_needed']) assert.deepEqual(surveyReportFreezeIssues(s3Twin({ confirm })), [], confirm);
  // ยังไม่ส่งผล: บรรทัด "ยังไม่ได้ส่งผล" พูดแทน ไม่มีข้อนี้
  const unsent = s3Twin({ confirm: null });
  unsent.request = { ...unsent.request, answeredAt: null };
  assert.equal(has(unsent), false);
  // ตำแหน่ง: ต่อจากข้อชื่อผู้ส่งผลทันที
  const nameless = s3Twin({ confirm: null });
  nameless.request = { ...nameless.request, answeredByName: null };
  assert.deepEqual(surveyReportFreezeIssues(nameless).map((i) => i.text).slice(0, 2),
    ['ไม่มีชื่อผู้ตรวจสอบและอนุมัติ (ผู้ส่งผล)', SURVEY_REPORT_CONFIRM_MISSING]);
  // พื้นที่จากแบบที่ถูกตัดไม่นับ
  const cut = s3Twin({ confirm: null });
  Object.assign(cut.zones[1], { status: 'cut', cutReason: 'ลูกค้าไม่ติดตั้ง' });
  assert.equal(has(cut), false);
});

test('S3 §2.3 ข้อ 3: บรรทัดไม่พบนัดมีหางเฉพาะเมื่อ drawingMethodEnabled === true · ใบลงหน้างานไม่มีนัดยังตีกลับ', () => {
  for (const [label, which] of [['ลงหน้างาน', []], ['ผสม', [1]]]) {
    const base = { ...s3Twin({ which }), visit: null };
    const line = (opt) => surveyReportFreezeIssues({ ...base, ...opt }).filter((i) => i.text.startsWith(SURVEY_REPORT_NO_VISIT));
    assert.deepEqual(line({}), [{ kind: 'content', text: SURVEY_REPORT_NO_VISIT }], label);
    assert.deepEqual(line({ drawingMethodEnabled: false }), [{ kind: 'content', text: SURVEY_REPORT_NO_VISIT }], label);
    assert.deepEqual(line({ drawingMethodEnabled: 'true' }), [{ kind: 'content', text: SURVEY_REPORT_NO_VISIT }], label);
    assert.deepEqual(line({ drawingMethodEnabled: true }),
      [{ kind: 'content', text: `${SURVEY_REPORT_NO_VISIT}${SURVEY_REPORT_NO_VISIT_TAIL}` }], label);
  }
  // จากแบบล้วนไม่ถูกถามหานัด
  assert.deepEqual(surveyReportFreezeIssues({ ...s3Twin({ which: [0, 1] }), drawingMethodEnabled: true }), []);
});

test('S3 §2.4: ภาพแบบของพื้นที่จากแบบ = JPG/PNG ล่าสุด (ชุดเดียวกับด่านส่งผล) · ไฟล์อื่นไม่ใช่ HEIC ที่ต้องแปลง', () => {
  const PLAN_LINE = 'ยังไม่มีภาพแบบของพื้นที่ (ต้องเป็นรูป JPG/PNG — ไฟล์ PDF/TIFF ลงเอกสารไม่ได้)';
  const withPlans = (files, which = [1]) => {
    const inputs = s3Twin({ which });
    const zone = inputs.zones[1];
    inputs.filesByZone = { ...inputs.filesByZone, [zone.id]: files };
    inputs.imageByAttId = { ...inputs.imageByAttId };
    for (const f of files) inputs.imageByAttId[f.id] = { sha: fakeSha(f.id), w: 800, h: 600, bytes: 10 };
    return { inputs, name: inputs.zones[1].name || zone.id };
  };
  const OLD = '2026-09-20T00:00:00.000+00:00';
  const NEW = '2026-09-25T00:00:00.000+00:00';
  const cases = [
    ['JPG เก่า + TIFF ใหม่', [planFile('P-jpg', 'image/jpeg', OLD), planFile('P-tif', 'image/tiff', NEW, 'scan.tif')],
      { plan: 'P-jpg', line: false, warn: ['ไฟล์ scan.tif ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร'] }],
    ['TIFF อย่างเดียว', [planFile('P-tif', 'image/tiff', NEW, 'scan.tif')], { plan: null, line: true }],
    ['HEIC อย่างเดียว', [planFile('P-heic', 'image/heic', NEW, 'a.heic')], { plan: null, line: true }],
    ['PDF อย่างเดียว', [planFile('P-pdf', 'application/pdf', NEW, 'a.pdf')], { plan: null, line: true }],
    ['ไม่มีไฟล์', [], { plan: null, line: true }],
    ['JPG สองรูป', [planFile('P-1', 'image/jpeg', OLD), planFile('P-2', 'image/png', NEW)],
      { plan: 'P-2', line: false, warn: ['มีภาพแบบ 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว'] }],
  ];
  for (const [label, files, want] of cases) {
    const { inputs } = withPlans(files);
    const zoneName = buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot.zones[1].name;
    const issues = surveyReportFreezeIssues(inputs).map((i) => i.text);
    assert.equal(issues.includes(`${zoneName}: ${PLAN_LINE}`), want.line, `${label}: บรรทัดภาพแบบ`);
    assert.equal(issues.some((t) => t.includes('HEIC/BMP')), false, `${label}: ไม่มีบรรทัด HEIC`);
    assert.equal(issues.some((t) => t.includes('ภาพผัง')), false, `${label}: ไม่ใช้ประโยคของภาพผัง`);
    assert.deepEqual(surveyReportImageFiles(inputs).filter((r) => r.zoneId === inputs.zones[1].id).map((r) => r.attId),
      want.plan ? [want.plan] : [], `${label}: ไฟล์ที่ดึง`);
    if (!want.line) {
      const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
      assert.equal(built.errors, undefined, `${label}: ${(built.errors || []).join(' | ')}`);
      assert.deepEqual(built.snapshot.zones[1].plan.map((p) => p.attId), [want.plan], label);
      assert.deepEqual(built.snapshot.zones[1].wide, [], label);
      const warns = buildSurveyReportSnapshot(inputs, { mode: 'draft' }).warnings.filter((w) => w.startsWith(`${zoneName}:`));
      assert.deepEqual(warns, (want.warn || []).map((w) => `${zoneName}: ${w}`), `${label}: คำเตือน`);
    }
  }
  // ไฟล์ชุดเดียวกันบนพื้นที่ลงหน้างาน = ของวันนี้ (TIFF ใหม่สุดเป็นรูปที่เปิดดูได้ ⇒ รูปล่าสุดคือ TIFF)
  const onsite = withPlans([planFile('P-jpg', 'image/jpeg', OLD), planFile('P-tif', 'image/tiff', NEW, 'scan.tif')], []);
  assert.deepEqual(surveyReportImageFiles(onsite.inputs).filter((r) => r.kind === 'plan' && r.zoneId === onsite.inputs.zones[1].id)
    .map((r) => r.attId), ['P-tif']);
  const heic = withPlans([planFile('P-heic', 'image/heic', NEW, 'a.heic')], []);
  assert.ok(surveyReportFreezeIssues(heic.inputs).some((i) => i.text.includes('HEIC/BMP')), 'ลงหน้างาน: HEIC ยังขวางด้วยบรรทัดเดิม');
});

test('S3 §2.5: คีย์ใหม่ต่อโหมด — ลงหน้างาน · ผสม · จากแบบล้วน · พื้นที่จากแบบที่ถูกตัด', () => {
  const on = buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).snapshot;
  assert.deepEqual(on.assessment, {
    mode: 'onsite', onsiteZones: 2, drawingZones: 0, totalZones: 2, drawingBy: [], drawingAt: '2026-09-26', drawingById: null,
  });
  assert.deepEqual(on.zones.map((z) => [z.method, z.drawingBy, z.drawingAt, z.methodReason]), [['onsite', null, null, null], ['onsite', null, null, null]]);
  assert.equal(on.request.surveyConfirm, null);
  assert.deepEqual(on.otherVisits, []);

  const mixed = buildSurveyReportSnapshot(s3Twin(), { mode: 'draft' }).snapshot;
  assert.equal(mixed.assessment.mode, 'mixed');
  assert.deepEqual([mixed.assessment.onsiteZones, mixed.assessment.drawingZones, mixed.assessment.totalZones], [1, 1, 2]);
  assert.deepEqual(mixed.assessment.drawingBy, ['Head Approver']);
  assert.equal(mixed.assessment.drawingById, null, 'ใบผสมไม่มีที่นั่งที่ 1 แบบใบจากแบบ');
  assert.equal(mixed.request.surveyConfirm, 'needed');
  assert.deepEqual(
    [mixed.zones[1].method, mixed.zones[1].methodReason, mixed.zones[1].methodChangedByName, mixed.zones[1].methodChangedAt,
      mixed.zones[1].drawingBy, mixed.zones[1].drawingAt],
    ['drawing', 'ลูกค้าส่งแบบมาแล้ว', 'Head Approver', S3_SWITCH, 'Head Approver', S3_SWITCH],
  );

  const desk = buildSurveyReportSnapshot(s3Twin({ which: [0, 1] }), { mode: 'draft' }).snapshot;
  assert.equal(desk.assessment.mode, 'drawing');
  assert.deepEqual(desk.assessment.drawingBy, ['Head Approver'], 'ชื่อไม่ซ้ำ');
  assert.equal(desk.assessment.drawingById, 'U-head', 'ชื่อคนสลับ = ชื่อผู้ส่งผล');
  assert.equal(buildSurveyReportSnapshot(s3Twin({ which: [0, 1], switcher: 'หัวหน้า อีกคน' }), { mode: 'draft' }).snapshot
    .assessment.drawingById, null);

  // พื้นที่จากแบบที่ถูกตัด: มี method แต่ไม่มีผู้ประเมิน · ไม่นับในก้อน assessment
  const cutIn = s3Twin({ which: [0, 1] });
  Object.assign(cutIn.zones[1], { status: 'cut', cutReason: 'ลูกค้าไม่ติดตั้ง', methodChangedByName: 'หัวหน้า อีกคน' });
  const cut = buildSurveyReportSnapshot(cutIn, { mode: 'draft' }).snapshot;
  assert.deepEqual([cut.zones[1].method, cut.zones[1].drawingBy, cut.zones[1].drawingAt], ['drawing', null, null]);
  assert.deepEqual([cut.assessment.drawingZones, cut.assessment.totalZones, cut.assessment.drawingBy], [1, 1, ['Head Approver']]);

  // drawingBy เรียงตามลำดับพื้นที่ ไม่ซ้ำ ทิ้ง null
  const order = s3Twin({ which: [0, 1] });
  order.zones[0].methodChangedByName = 'ข หัวหน้า';
  order.zones[1].methodChangedByName = 'ก หัวหน้า';
  assert.deepEqual(buildSurveyReportSnapshot(order, { mode: 'draft' }).snapshot.assessment.drawingBy, ['ข หัวหน้า', 'ก หัวหน้า']);
});

test('S3 §2.5: assessment.drawingAt = วันไทยของ answeredAt · ค่าว่าง/อ่านไม่ออก = null ไม่ throw ไม่อ่านนาฬิกา', () => {
  const at = (answeredAt) => {
    const inputs = s3Twin({ which: [0, 1] });
    inputs.request = { ...inputs.request, answeredAt };
    return buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot.assessment.drawingAt;
  };
  assert.equal(at('2026-10-09T17:30:00Z'), '2026-10-10');
  assert.equal(at('2026-10-09T16:59:59Z'), '2026-10-09');
  for (const empty of [null, undefined, '', 'not a date']) assert.equal(at(empty), null, String(empty));
  // ไม่อ่านนาฬิกา — ภาพนิ่งของอินพุตเดิมเท่ากันทุกครั้ง
  const inputs = s3Twin({ which: [0, 1] });
  inputs.request = { ...inputs.request, answeredAt: undefined };
  assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'draft' }), buildSurveyReportSnapshot(clone(inputs), { mode: 'draft' }));
});

test('S3 §2.5: otherVisits จาก inputs.otherVisits (ป้ายสถานะไทย · วันล้วน) · ไม่มี/null = [] · answerPending ไม่เข้าภาพนิ่ง', () => {
  const inputs = s3Twin({ which: [0, 1], answerPending: true });
  inputs.otherVisits = [
    { code: 'SV-1', status: 'done', date: '2026-09-20', planned: false },
    { code: 'SV-2', status: 'cancelled', date: '2026-09-28T00:00:00Z', planned: true },
    { code: null, status: 'weird', date: null, planned: 'yes' },
    null,
  ];
  const snap = buildSurveyReportSnapshot(inputs, { mode: 'draft' }).snapshot;
  assert.deepEqual(snap.otherVisits, [
    { code: 'SV-1', statusLabel: 'เข้าแล้ว', date: '2026-09-20', planned: false },
    { code: 'SV-2', statusLabel: 'ยกเลิก', date: '2026-09-28', planned: true },
    { code: null, statusLabel: null, date: null, planned: false },
  ]);
  assert.equal(JSON.stringify(snap).includes('answerPending'), false);
  for (const none of [null, undefined, []]) {
    assert.deepEqual(buildSurveyReportSnapshot({ ...inputs, otherVisits: none }, { mode: 'draft' }).snapshot.otherVisits, []);
  }
});

/* ══ งวด S3 §2.9: ใบลงหน้างานล้วน — คีย์เดิมของภาพนิ่งเท่ากับของ main ทุกค่า (ลบคีย์ใหม่ออกแล้วเทียบ) ═══════════════════
   🔑 ค่าทองคำ = sha256 ของ JSON (เรียงคีย์) ของภาพนิ่งที่ `buildSurveyReportSnapshot` ของ **main `954861d8`** (ก่อนงวด S3) สร้างจาก
      อินพุตชุดเดียวกัน — วัดเมื่อ 15/10/2026 ด้วย `git archive 954861d8` ลงโฟลเดอร์นอกรีโปแล้วรันตัวสร้างทั้งสองรุ่นกับชุดทดสอบเดียวกัน
      (ทุกเคสของ `surveyStressCases` · ฉบับลงนาม · แฝดสังเคราะห์ เท่ากันทุกตัวรวมคำเตือนและแถวรูป)
   ⚠️ ชุดทดสอบ (แฝดสังเคราะห์) เปลี่ยนเมื่อไร ค่าทองคำต้องวัดใหม่จาก main รุ่นก่อนงวด S3 ด้วยวิธีเดียวกัน — ห้ามคัดลอกจากผลของโค้ดปัจจุบัน */
const S3_NEW_TOP_KEYS = ['assessment', 'otherVisits'];
const S3_NEW_ZONE_KEYS = ['method', 'methodReason', 'methodChangedByName', 'methodChangedAt', 'drawingBy', 'drawingAt'];
function withoutS3Keys(snapshot) {
  const out = structuredClone(snapshot);
  for (const key of S3_NEW_TOP_KEYS) delete out[key];
  delete out.request.surveyConfirm;
  for (const zone of out.zones) for (const key of S3_NEW_ZONE_KEYS) delete zone[key];
  return out;
}
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v));
const shaOf = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

test('🔴 งวด S3 §2.9: ใบลงหน้างานล้วน — ลบคีย์ใหม่ออกแล้ว ภาพนิ่งเท่ากับของ main ก่อนงวด S3 ทุกค่า (ค่าทองคำ) · คีย์ใหม่มีค่าของใบลงหน้างาน', () => {
  const cases = [
    { name: 'แฝดสังเคราะห์ · ตรึง', inputs: () => twin(), mode: 'freeze', sha: '7daf8116520103e00be3968da4e79a82c8d827769aeef24f4b97e60465c5a970' },
    { name: 'แฝดสังเคราะห์ · ร่าง', inputs: () => twin(), mode: 'draft', sha: '7daf8116520103e00be3968da4e79a82c8d827769aeef24f4b97e60465c5a970' },
    { name: 'รูปจุดไม่ผูก · ร่าง', inputs: () => twin({ spotLinks: null }), mode: 'draft', sha: '9b3d160f774b5e967a08bd60e18014557fe713cd8bfd375408294be789b3b53d' },
    { name: 'ชุดมาร์ก · ร่าง', inputs: () => markedSurveyInputs().inputs, mode: 'draft', sha: 'f9677dbae02ef5db62213aa8618d08c70cff9cc636f0dd9426ccb0218d42e1dc' },
    { name: 'ลงนามสองคน · ตรึง', inputs: () => signedSurveyInputs(twin()), mode: 'freeze', sha: 'e5dcd68f5f50c550e8b7303ffd4fd2e58bc207e5c3f7304e503f71b56020234b' },
  ];
  for (const row of cases) {
    const built = buildSurveyReportSnapshot(row.inputs(), { mode: row.mode });
    assert.equal(built.errors, undefined, `${row.name}: ${(built.errors || []).join(' | ')}`);
    const { snapshot } = built;
    assert.equal(shaOf(withoutS3Keys(snapshot)), row.sha, row.name);
    // คีย์ใหม่ของใบลงหน้างาน: ไม่มีอะไรของวิธีจากแบบ
    assert.equal(snapshot.assessment.drawingZones, 0, row.name);
    assert.deepEqual(snapshot.assessment.drawingBy, [], row.name);
    assert.equal(snapshot.assessment.drawingById, null, row.name);
    assert.deepEqual(snapshot.otherVisits, [], row.name);
    assert.equal(snapshot.request.surveyConfirm, null, row.name);
    for (const zone of snapshot.zones) {
      assert.deepEqual(S3_NEW_ZONE_KEYS.map((key) => zone[key]), ['onsite', null, null, null, null, null], `${row.name} · ${zone.name}`);
    }
    // รันซ้ำด้วยอินพุตเดิม = ภาพนิ่งเดิม (ไม่อ่านนาฬิกา)
    assert.deepEqual(buildSurveyReportSnapshot(row.inputs(), { mode: row.mode }).snapshot, snapshot, `${row.name}: รันซ้ำ`);
  }
});

/* ══ งวด S5 กลุ่ม F — ใบยืนยันหน้างาน: `request.confirmsDocNo` (เพิ่มคีย์ · ยัง v1) ═══════════════════════════════
 * ตัวโหลดถาม `loadSurveyReportConfirms` (ไม่ยิงคำสั่งเมื่อใบไม่ผูก) แล้วประกอบข้อความด้วย `surveyReportConfirmsDocNo`
 * 🔴 คีย์มีเฉพาะเมื่อเป็นสตริง (R-KEYS) — ใบที่ไม่ผูก/ใบต้นทางหาย ได้ภาพนิ่งเท่าของงวด S3 ทุกไบต์
 * 🔴 อ่านไม่สำเร็จ ≠ ไม่ผูก — ชื่อ `confirms` เข้า `unknown` ⇒ ขั้นออกเลขไม่ออก (กระดาษที่ตรึงแล้วเติมแถวทีหลังไม่ได้) */

const CONFIRM_TEXT_FULL = `${CONFIRM_ORIGINAL.requestDocNo} (${CONFIRM_ORIGINAL.reportDocNo})`;
const ORIGINAL_ID = 'DR-drawing-0345';
const ORIGINAL_SENT = '2026-10-09T07:20:00.000+00:00';
const originalRow = (over = {}) => ({
  id: ORIGINAL_ID, docNo: CONFIRM_ORIGINAL.requestDocNo, kind: 'site_survey', status: 'answered', answeredAt: ORIGINAL_SENT, ...over,
});
const reportRow = (over = {}) => ({
  id: 'SSR-1', requestId: ORIGINAL_ID, baseNo: 'SU-26100003', rev: 0, docNo: CONFIRM_ORIGINAL.reportDocNo, status: 'current',
  approvedAt: ORIGINAL_SENT, ...over,
});

/* ฐานปลอมของตัวโหลดอินพุต — กรองตาม eq/in · `fail[ตาราง]` = 'error' | 'throw' (ทุกครั้งที่อ่านตารางนั้น) · `read` = ตารางที่ถูกอ่านตามลำดับ */
function confirmsDb(tables = {}, { fail = {} } = {}) {
  const read = [];
  const from = (table) => {
    const filters = [];
    read.push(table);
    const run = () => {
      if (fail[table] === 'throw') throw new Error(`${table} ล่ม`);
      if (fail[table] === 'error') return { data: null, error: { message: `${table} ล่ม` } };
      const rows = (tables[table] || [])
        .filter((row) => filters.every(([op, col, val]) => (op === 'in' ? val.includes(row[col]) : row[col] === val)));
      return { data: rows.map((row) => ({ ...row })), error: null };
    };
    const chain = {
      select: () => chain, order: () => chain, limit: () => chain,
      eq: (col, val) => { filters.push(['eq', col, val]); return chain; },
      in: (col, val) => { filters.push(['in', col, val]); return chain; },
      maybeSingle: () => Promise.resolve().then(run).then(({ data, error }) => ({ data: error ? null : (data[0] || null), error })),
      then: (ok, ko) => Promise.resolve().then(run).then(ok, ko),
    };
    return chain;
  };
  const auth = { admin: { getUserById: async () => ({ data: { user: null }, error: { status: 404, message: 'User not found' } }) } };
  return { read, from, auth };
}

/* ใบยืนยัน = แฝด ② + ลิงก์ไปใบต้นทาง (คอลัมน์ของ mig 0408) · ผลวัด/ไฟล์/ทะเบียนขนาดส่งให้ตัวโหลด — คำสั่งที่เหลือเป็นของงวดนี้ */
const linkedRequest = (linkTo = ORIGINAL_ID) => ({ ...twin().request, surveyConfirmOfId: linkTo });
const loadConfirms = (db, request) => {
  const source = twin();
  return loadSurveyReportInputs(db, {
    request, zones: source.zones, filesByZone: source.filesByZone, sizes: source.sizes, takenAt: source.takenAt,
  });
};
/* อินพุตของแฝดที่รับคีย์ `confirmsDocNo` และ `unknown` จากตัวโหลด — ภาพนิ่ง/กระดาษเทียบกับแฝดได้ทั้งก้อน */
const withLoaded = (loaded) => ({
  ...twin(),
  ...(Object.hasOwn(loaded.inputs, 'confirmsDocNo') ? { confirmsDocNo: loaded.inputs.confirmsDocNo } : {}),
  unknown: loaded.unknown,
});
const unreadConfirms = `อ่าน${SURVEY_REPORT_INPUT_LABELS.confirms}ไม่สำเร็จ`;

test('S5 F: surveyReportConfirmsDocNo — "RQ (SU)" · RQ อย่างเดียวเมื่อใบต้นทางไม่มีฉบับปัจจุบัน · ไม่ผูก/ไม่มีเลข = null', () => {
  assert.equal(surveyReportConfirmsDocNo(CONFIRM_ORIGINAL), CONFIRM_TEXT_FULL);
  assert.equal(surveyReportConfirmsDocNo({ requestDocNo: 'RQ-AS-26100345', reportDocNo: null }), 'RQ-AS-26100345');
  assert.equal(surveyReportConfirmsDocNo({ requestDocNo: ' RQ-AS-26100345 ', reportDocNo: '  ' }), 'RQ-AS-26100345');
  for (const none of [null, undefined, {}, { requestDocNo: '' }, { requestDocNo: null, reportDocNo: 'SU-26100003-0' }, 'RQ-AS-1', []]) {
    assert.equal(surveyReportConfirmsDocNo(none), null, JSON.stringify(none));
  }
  // ป้ายของแถวมาจากโมดูลของงวด (ไม่ก๊อปเป็นลิเทอรัลในไฟล์กระดาษ) · ป้ายของชิ้นที่อ่านไม่สำเร็จมีจริง
  assert.equal(SURVEY_CONFIRM_OF_LABEL, 'ยืนยันผลจากแบบของ');
  assert.equal(unreadConfirms, 'อ่านใบต้นทางของใบยืนยันหน้างานไม่สำเร็จ');
});

test('🔴 S5 F: ภาพนิ่งได้ request.confirmsDocNo เฉพาะเมื่อเป็นสตริง — นอกนั้นไม่มีคีย์ และภาพนิ่งเท่ากับแฝดทุกค่า', () => {
  assert.equal(SURVEY_REPORT_SNAPSHOT_VERSION, 1, 'เพิ่มคีย์อย่างเดียว — ไม่ขึ้นรุ่น');
  const plain = buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).snapshot;
  assert.equal('confirmsDocNo' in plain.request, false, 'แฝด (ไม่ผูก) ไม่มีคีย์');

  const full = buildSurveyReportSnapshot(surveyReportInputsFromFixture(confirmSurveyFixture()), { mode: 'freeze' });
  assert.equal(full.errors, undefined);
  assert.equal(full.snapshot.request.confirmsDocNo, CONFIRM_TEXT_FULL);
  const rqOnly = buildSurveyReportSnapshot(surveyReportInputsFromFixture(confirmSurveyFixture({ reportDocNo: null })), { mode: 'freeze' });
  assert.equal(rqOnly.snapshot.request.confirmsDocNo, CONFIRM_ORIGINAL.requestDocNo);

  // ต่างจากแฝดแค่คีย์เดียว — ไม่มีคีย์ที่ชั้นอื่น ไม่มีรูปเพิ่ม
  const stripped = clone(full.snapshot);
  delete stripped.request.confirmsDocNo;
  assert.deepEqual(stripped, plain);
  assert.deepEqual(full.images, buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).images);

  // ค่าที่ไม่ใช่สตริงที่มีเนื้อ = ไม่มีคีย์ (ไม่ใช่ null)
  for (const bad of [null, '', '   ', 7, {}, ['RQ-AS-1'], true]) {
    const built = buildSurveyReportSnapshot({ ...twin(), confirmsDocNo: bad }, { mode: 'freeze' });
    assert.equal('confirmsDocNo' in built.snapshot.request, false, JSON.stringify(bad));
    assert.deepEqual(built.snapshot, plain, JSON.stringify(bad));
  }
  // สตริงถูกตัดช่องว่างหัวท้าย · โหมดร่างก็ได้คีย์ (ฉบับร่างของหัวหน้าเห็นแถวเดียวกับที่จะตรึง)
  assert.equal(buildSurveyReportSnapshot({ ...twin(), confirmsDocNo: '  RQ-AS-26100345  ' }).snapshot.request.confirmsDocNo, 'RQ-AS-26100345');
  assert.equal(buildSurveyReportSnapshot({ ...twin(), confirmsDocNo: CONFIRM_TEXT_FULL }, { mode: 'draft' }).snapshot.request.confirmsDocNo, CONFIRM_TEXT_FULL);
});

test('S5 F: ตัวโหลด — ไม่ผูก = ไม่มีคำสั่งเพิ่ม · ผูก = "RQ (SU)" ของฉบับปัจจุบัน · ไม่มีฉบับปัจจุบัน/ฉบับค้าง = RQ อย่างเดียว · ใบต้นทางหาย = ไม่มีคีย์', async () => {
  const tables = { dept_requests: [originalRow()], service_survey_reports: [reportRow()] };

  // ใบไม่ผูก: ไม่อ่านสองตารางของงวดนี้เลย · ไม่มีคีย์ · ไม่มีชิ้นที่ไม่ทราบ
  const unlinkedDb = confirmsDb(tables);
  const unlinked = await loadConfirms(unlinkedDb, twin().request);
  assert.deepEqual(unlinked.unknown, []);
  assert.equal(Object.hasOwn(unlinked.inputs, 'confirmsDocNo'), false);
  assert.equal(unlinkedDb.read.includes('dept_requests'), false);
  assert.equal(unlinkedDb.read.includes('service_survey_reports'), false);

  const cases = [
    ['ฉบับปัจจุบันของผลรอบนี้', tables, CONFIRM_TEXT_FULL],
    ['ฉบับถูกแทนที่หมด (ดึงผลกลับแล้ว)', { ...tables, service_survey_reports: [reportRow({ status: 'superseded' })] }, CONFIRM_ORIGINAL.requestDocNo],
    ['ยังไม่มีเอกสาร', { ...tables, service_survey_reports: [] }, CONFIRM_ORIGINAL.requestDocNo],
    ['ฉบับปัจจุบันค้าง (ไม่ใช่ของผลรอบนี้)', { ...tables, service_survey_reports: [reportRow({ approvedAt: '2026-10-01T00:00:00.000+00:00' })] }, CONFIRM_ORIGINAL.requestDocNo],
    ['Rev ล่าสุดที่เป็นปัจจุบัน', {
      ...tables,
      dept_requests: [originalRow({ answeredAt: '2026-10-12T03:00:00.000+00:00' })],
      service_survey_reports: [reportRow({ status: 'superseded' }), reportRow({ id: 'SSR-2', rev: 1, docNo: 'SU-26100003-1', approvedAt: '2026-10-12T03:00:00.000+00:00' })],
    }, 'RQ-AS-26100345 (SU-26100003-1)'],
  ];
  for (const [label, world, want] of cases) {
    const loaded = await loadConfirms(confirmsDb(world), linkedRequest());
    assert.deepEqual(loaded.unknown, [], label);
    assert.equal(loaded.inputs.confirmsDocNo, want, label);
    const built = buildSurveyReportSnapshot(withLoaded(loaded), { mode: 'freeze' });
    assert.equal(built.errors, undefined, label);
    assert.equal(built.snapshot.request.confirmsDocNo, want, label);
  }

  // ใบต้นทางถูกลบ (ลิงก์ค้าง): อ่านได้ แต่ไม่มีแถว ⇒ ไม่มีคีย์ ไม่มีแถวบนกระดาษ — ไม่ใช่ "อ่านไม่สำเร็จ"
  const dangling = await loadConfirms(confirmsDb(tables), linkedRequest('DR-gone'));
  assert.deepEqual(dangling.unknown, []);
  assert.equal(Object.hasOwn(dangling.inputs, 'confirmsDocNo'), false);
  const plain = buildSurveyReportSnapshot(twin(), { mode: 'freeze' }).snapshot;
  for (const loaded of [unlinked, dangling]) {
    const built = buildSurveyReportSnapshot(withLoaded(loaded), { mode: 'freeze' });
    assert.deepEqual(built.snapshot, plain, 'ภาพนิ่งเท่าแฝดทุกค่า (ไม่มีคีย์)');
    for (const version of ['customer', 'internal']) {
      assert.equal(JSON.stringify(surveyReportView(built.snapshot, { version })).includes(SURVEY_CONFIRM_OF_LABEL), false, version);
    }
  }
});

for (const [table, how] of [
  ['dept_requests', 'error'], ['dept_requests', 'throw'], ['service_survey_reports', 'error'], ['service_survey_reports', 'throw'],
]) {
  test(`🔴 S5 F: อ่าน ${table} ไม่สำเร็จ (${how}) = unknown 'confirms' — ไม่มีคีย์ · ตรึง/ตรวจไม่ออก · รอบตรวจก่อนส่งบอกว่าอ่านไม่สำเร็จ`, async () => {
    const world = { dept_requests: [originalRow()], service_survey_reports: [reportRow()] };
    const loaded = await loadConfirms(confirmsDb(world, { fail: { [table]: how } }), linkedRequest());
    assert.deepEqual(loaded.unknown, ['confirms']);
    assert.deepEqual(loaded.inputs.unknown, ['confirms']);
    assert.equal(Object.hasOwn(loaded.inputs, 'confirmsDocNo'), false, 'อ่านพลาด ≠ ได้ค่า');

    // ขั้นออกเลข: เหตุชนิด system บรรทัดเดียว · โหมดตรึง/ตรวจไม่ออกภาพนิ่ง (กระดาษที่ขาดแถวไม่มีวันถูกตรึง)
    const inputs = withLoaded(loaded);
    assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: unreadConfirms }]);
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), { errors: [unreadConfirms] });
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'check' }), { errors: [unreadConfirms] });
    const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
    assert.ok(draft.warnings.includes(unreadConfirms));
    assert.equal('confirmsDocNo' in draft.snapshot.request, false);

    // รอบตรวจก่อนส่งผล: ชิ้นไม่ทราบถูกส่งออก (ผู้เรียกข้ามการตีกลับ) และแถวด่านบอกว่าอ่านไม่สำเร็จ (ชนิด system — ไม่ตีกลับการส่งผล)
    const source = twin();
    const check = await surveyReportPrecheck(confirmsDb(world, { fail: { [table]: how } }), {
      request: linkedRequest(), user: { id: 'U-head', name: 'Head Approver' }, zones: source.zones, filesByZone: source.filesByZone,
      sizes: source.sizes, open: null, today: '2026-09-26', nowIso: '2026-09-26T03:00:00.000+00:00',
    });
    assert.ok(check.unknown.includes('confirms'), check.unknown.join(','));
    assert.ok(check.blockers.some((b) => b.kind === 'system' && b.text === unreadConfirms), JSON.stringify(check.blockers));
    assert.equal(check.blockers.some((b) => b.kind === 'content' && b.text === unreadConfirms), false);

    // รอบถัดไปอ่านได้ = ได้ค่ากลับมา
    const again = await loadConfirms(confirmsDb(world), linkedRequest());
    assert.deepEqual(again.unknown, []);
    assert.equal(again.inputs.confirmsDocNo, CONFIRM_TEXT_FULL);
  });
}
