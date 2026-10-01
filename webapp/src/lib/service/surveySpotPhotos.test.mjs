// ── รูปจุดติดตั้ง ↔ จุด (PR-S · มติเจ้าของ 28–30/09) — ตรรกะล้วน ────────────────
//
// ⭐ จุดหนึ่งจุด = หนึ่งแถว (รูป + ชื่อ + รายละเอียด) · ตัวเชื่อมคือ `attachments.metadata.spotId`
//   ไม่มี migration · ไม่เคยผูกด้วย "ลำดับการอัป" (ม็อกกระดานทำแบบนั้น — ของจริงห้าม)
// ⭐ รูปที่ไม่มี spotId หรือชี้จุดที่ไม่มีแล้ว = ถาด "ยังไม่ได้ผูกจุด" · ลบจุด = รูปย้ายลงถาด ไม่มีไฟล์หาย
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPOT_TRAY_LABEL, isSpotLinkPatch, isSpotPhoto, normalizeSpotId, photoSpotId, spotAssignTargets, spotDraftPhotos,
  spotIdError, spotLinkChoices, spotLinkError, spotPhotoGroups, spotRemovalNotice, spotRowLabel, spotTrayView,
  surveySpotLinkDecision, surveySpotUploadMetadata, withSpotLink,
} from './surveySpotPhotos.js';
import { surveyZoneSavePayload } from './survey.js';
import { surveyDraftSync, surveyZoneDraftSignature } from './surveyControl.js';
import {
  surveyDiscardConfirm, surveyDraftSummary, surveyLeaveConfirm, surveyZoneSections,
} from './surveyFieldView.js';

const SPOTS = [
  { id: 'SPT-a', label: 'หน้าลิฟต์', note: null, selected: true },
  { id: 'SPT-b', label: 'ข้างเคาน์เตอร์', note: 'ปลั๊กอยู่ใต้โต๊ะ', selected: false },
];
const photo = (id, spotId, createdAt, docType = 'survey_spot') => ({
  id, docType, createdAt, fileName: `${id}.jpg`, metadata: spotId === undefined ? {} : { spotId },
});

/* ══ จัดกลุ่มรูปตามจุด ══════════════════════════════════════════════════ */

test('🔑 รูปขึ้นใต้จุดของมันตาม spotId · ลำดับแถว = ลำดับจุด', () => {
  const files = [
    photo('F3', 'SPT-b', '2026-09-28T03:00:00.000000+00:00'),
    photo('F1', 'SPT-a', '2026-09-28T01:00:00.000000+00:00'),
  ];
  const { rows, unlinked } = spotPhotoGroups({ spots: SPOTS, files });
  assert.deepEqual(rows.map((r) => r.spot.id), ['SPT-a', 'SPT-b']);
  assert.deepEqual(rows.map((r) => r.photos.map((p) => p.id)), [['F1'], ['F3']]);
  assert.deepEqual(unlinked, []);
});

test('รูปในจุดเดียวกันเรียงเก่าก่อน (ไม่ใช่ลำดับที่ฐานคืน — listAttachments คืนใหม่ก่อน)', () => {
  const files = [
    photo('NEW', 'SPT-a', '2026-09-28T05:00:00.000002+00:00'),
    photo('MID', 'SPT-a', '2026-09-28T05:00:00.000001+00:00'), // ห่างกันไม่ถึงมิลลิวินาที — เทียบเป็นสตริง
    photo('OLD', 'SPT-a', '2026-09-28T01:00:00+00:00'),
  ];
  const [row] = spotPhotoGroups({ spots: SPOTS, files }).rows;
  assert.deepEqual(row.photos.map((p) => p.id), ['OLD', 'MID', 'NEW']);
});

test('⭐ ไม่มี spotId (รูปเก่าก่อน PR-S) → ถาด "ยังไม่ได้ผูกจุด" · ห้ามเดาจากลำดับการอัป', () => {
  const files = [photo('F1', undefined, '2026-09-28T01:00:00Z'), photo('F2', undefined, '2026-09-28T02:00:00Z')];
  const { rows, unlinked } = spotPhotoGroups({ spots: SPOTS, files });
  assert.ok(rows.every((r) => r.photos.length === 0), 'รูปเก่าต้องไม่ถูกแจกให้จุดตามลำดับ');
  assert.deepEqual(unlinked.map((p) => p.id), ['F1', 'F2']);
  assert.equal(SPOT_TRAY_LABEL, 'ยังไม่ได้ผูกจุด');
});

test('🔴 ลบจุดแล้ว รูปของจุดนั้นย้ายลงถาด — ไม่หาย ไม่ไปเกาะจุดอื่น', () => {
  const files = [photo('F1', 'SPT-a', '2026-09-28T01:00:00Z'), photo('F2', 'SPT-b', '2026-09-28T02:00:00Z')];
  const afterRemove = spotPhotoGroups({ spots: [SPOTS[1]], files });
  assert.deepEqual(afterRemove.rows.map((r) => r.photos.map((p) => p.id)), [['F2']]);
  assert.deepEqual(afterRemove.unlinked.map((p) => p.id), ['F1']);
  // รวมแล้วเท่าเดิมเสมอ — ไม่มีรูปไหนตกหล่นจากทั้งสองกอง
  const total = afterRemove.rows.reduce((n, r) => n + r.photos.length, 0) + afterRemove.unlinked.length;
  assert.equal(total, files.length);
});

test('ขนาดกองอื่น (ภาพกว้าง/ภาพผัง) ไม่เข้ากลุ่มจุดเลย แม้จะมี spotId ติดมา', () => {
  const files = [
    photo('W1', 'SPT-a', '2026-09-28T01:00:00Z', 'survey_wide'),
    photo('P1', undefined, '2026-09-28T01:00:00Z', 'survey_plan'),
    photo('S1', 'SPT-a', '2026-09-28T01:00:00Z'),
  ];
  const { rows, unlinked } = spotPhotoGroups({ spots: SPOTS, files });
  assert.deepEqual(rows[0].photos.map((p) => p.id), ['S1']);
  assert.deepEqual(unlinked, []);
});

test('จุดร่างบนจอ (id `new-…` ยังไม่บันทึก) ก็รับรูปของมันได้ทันที', () => {
  const draft = [...SPOTS, { id: 'new-k3j9x0a', label: '', note: '' }];
  const files = [photo('F9', 'new-k3j9x0a', '2026-09-28T01:00:00Z')];
  const { rows, unlinked } = spotPhotoGroups({ spots: draft, files });
  assert.deepEqual(rows[2].photos.map((p) => p.id), ['F9']);
  assert.deepEqual(unlinked, []);
});

test('ค่าแปลกปลอมไม่ทำให้พัง · id จุดซ้ำ = รูปไปจุดแรกเท่านั้น (ไม่นับซ้ำ)', () => {
  assert.deepEqual(spotPhotoGroups(), { rows: [], unlinked: [] });
  assert.deepEqual(spotPhotoGroups({ spots: 'x', files: null }), { rows: [], unlinked: [] });
  const dup = [{ id: 'SPT-a', label: 'หนึ่ง' }, { id: 'SPT-a', label: 'สอง' }, null];
  const { rows } = spotPhotoGroups({ spots: dup, files: [photo('F1', 'SPT-a', 'x')] });
  assert.deepEqual(rows.map((r) => r.photos.length), [1, 0]);
});

/* 🐞 review 30/09 — ไฟล์ `survey_spot` ที่ไม่ใช่รูป (PDF ลาก/วางลงหัวข้อจุด) เคยนับเป็น "ยังไม่ได้ผูกจุด" บนแท็บผล
   ทั้งที่ถาดบนจอหน้างานไม่มีมัน (แผงส่งเฉพาะรูป) ⇒ กติกาเดียว: รูปของจุด = `survey_spot` ที่เปิดเป็นรูปได้ */
test('🔴 PDF ในกองภาพจุดไม่ใช่รูปของจุด — ไม่อยู่ใต้จุด ไม่อยู่ในถาด ไม่นับในกล่องลบจุด (ตรงกับถาดบนจอ)', () => {
  const pdf = (id, spotId) => ({
    id, docType: 'survey_spot', fileName: `${id}.pdf`, mimeType: 'application/pdf', createdAt: '2026-09-28T01:00:00Z',
    metadata: spotId ? { spotId } : {},
  });
  const heic = { ...photo('H1', undefined, '2026-09-28T02:00:00Z'), fileName: 'IMG_1.HEIC', mimeType: 'image/heic' };
  const files = [pdf('P-loose'), pdf('P-linked', 'SPT-a'), photo('F1', 'SPT-a', '2026-09-28T03:00:00Z'), heic];
  const { rows, unlinked } = spotPhotoGroups({ spots: SPOTS, files });
  assert.deepEqual(rows[0].photos.map((p) => p.id), ['F1'], 'PDF ที่มี spotId ก็ไม่ขึ้นใต้จุด');
  assert.deepEqual(unlinked.map((p) => p.id), ['H1'], 'ถาด = รูปที่ไม่ผูกเท่านั้น (HEIC เป็นรูป — แผงเปิดดูได้)');
  assert.equal(spotRemovalNotice({ spot: SPOTS[0], files }), 'จุดนี้มี 1 รูป — รูปจะย้ายไปกลุ่ม “ยังไม่ได้ผูกจุด” ไม่มีรูปไหนถูกลบ');
  assert.equal(isSpotPhoto(pdf('x')), false);
  assert.equal(isSpotPhoto(photo('W', undefined, 'x', 'survey_wide')), false);
  assert.equal(isSpotPhoto(photo('S', undefined, 'x')), true);
});

/* ══ แถวจุดบนร่างที่มีรูปแล้ว = แถวจริง (review 30/09) ═══════════════════════════════════════ */

test('spotDraftPhotos: id ของแถวร่างที่มีรูป · รูปบนแถวที่ยังไม่ลงฐาน (ทิ้งร่างแล้วย้ายไปถาด)', () => {
  const draft = [...SPOTS, { id: 'new-blank', label: '', note: '' }, { id: 'new-named', label: 'ข้างประตู', note: '' }];
  const files = [
    photo('F1', 'SPT-a', '1'), photo('F2', 'new-blank', '2'), photo('F3', 'new-blank', '3'), photo('F4', 'new-named', '4'),
    photo('F5', undefined, '5'),
  ];
  assert.deepEqual(spotDraftPhotos({ draftSpots: draft, savedSpots: SPOTS, files }),
    { ownerIds: ['SPT-a', 'new-blank', 'new-named'], unsavedPhotos: 3 }, 'SPT-b ไม่มีรูป · F5 อยู่ถาดอยู่แล้ว ไม่นับ');
  assert.deepEqual(spotDraftPhotos(), { ownerIds: [], unsavedPhotos: 0 });
});

test('🔴 แถวใหม่ที่ยังว่างแต่ถ่ายรูปแล้ว: ค้าง (ออกจากพื้นที่ต้องถาม) · บันทึกถูกบล็อกด้วยชื่อแถว · ไม่ถูกแถวที่โหลดมาทับ', () => {
  const zone = { id: 'z1', zoneName: 'ห้อง Treatment', parts: [], spots: SPOTS, note: '' };
  const spots = [...SPOTS, { id: 'new-k3j9x0a', label: '', note: '' }];
  const files = [photo('F9', 'new-k3j9x0a', '2026-09-28T01:00:00Z')];
  const { ownerIds, unsavedPhotos } = spotDraftPhotos({ draftSpots: spots, savedSpots: zone.spots, files });
  const draft = { parts: [], spots, note: '', photoSpotIds: ownerIds };

  const savedSig = surveyZoneDraftSignature(zone);
  const draftSig = surveyZoneDraftSignature(draft);
  assert.notEqual(draftSig, savedSig, 'dirty — แถวว่างที่มีรูปนับในลายเซ็น');
  assert.equal(surveyZoneDraftSignature({ ...draft, photoSpotIds: [] }), savedSig, 'ไม่มีรูป = แถวว่างล้วน ไม่นับเหมือนเดิม');

  const plan = surveyZoneSavePayload(draft);
  assert.equal(plan.payload, null, 'ไม่ข้ามแถวเงียบ');
  assert.equal(plan.blocker, 'จุดที่ 3 มีรูปแล้วแต่ยังไม่มีชื่อ');
  assert.deepEqual(plan.issues, [{ section: 'spots', index: 2, field: 'label', text: 'จุดที่ 3 มีรูปแล้วแต่ยังไม่มีชื่อ' }]);
  assert.ok(surveyZoneSavePayload({ ...draft, photoSpotIds: [] }).payload, 'แถวว่างไม่มีรูป = ข้ามได้เหมือนเดิม');
  const named = surveyZoneSavePayload({ ...draft, spots: [...SPOTS, { id: 'new-k3j9x0a', label: 'ข้างประตู', note: '' }] });
  assert.deepEqual(named.payload.spots.map((s) => s.id), ['SPT-a', 'SPT-b', 'new-k3j9x0a'], 'ใส่ชื่อแล้ว = ส่งพร้อม id ร่าง (รูปยังผูกอยู่)');

  /* อีกคนบันทึกพื้นที่นี้ (แถวใหม่ไหลเข้ามา) — ร่างมีแถวที่มีรูปค้าง ⇒ ต้องไม่ "adopt" ทับ (แถวหาย รูปตกถาด) */
  const other = surveyZoneDraftSignature({ ...zone, note: 'ฝ้าสูง' });
  assert.equal(surveyDraftSync({ prevSavedSig: savedSig, savedSig: other, draftSig }), 'conflict');

  assert.equal(surveyZoneSections({ zone, files, draft, dirty: true }).spots.mark, 'dirty', 'หัวข้อจุดขึ้น "ยังไม่บันทึก"');
  assert.equal(surveyDraftSummary(draft, zone), 'จุด 3 จุด');

  assert.equal(unsavedPhotos, 1);
  const ask = surveyDiscardConfirm({ zone, summary: 'จุด 3 จุด', unlinkPhotos: unsavedPhotos });
  assert.match(ask.message, /ไม่หาย แต่รูป 1 รูปของจุดที่ยังไม่บันทึกจะย้ายไปกลุ่ม “ยังไม่ได้ผูกจุด”$/);
  assert.doesNotMatch(surveyDiscardConfirm({ zone, summary: 'หมายเหตุ' }).message, /ยังไม่ได้ผูกจุด/, 'ไม่มีรูปค้าง = คำเดิม');
  const leave = surveyLeaveConfirm({ uploads: 1, zoneDirty: true, zone, summary: 'จุด 3 จุด', unlinkPhotos: unsavedPhotos });
  assert.match(leave.description, /จะหายด้วย แต่รูป 1 รูปของจุดที่ยังไม่บันทึกจะย้ายไปกลุ่ม “ยังไม่ได้ผูกจุด”$/);
});

test('photoSpotId อ่านเฉพาะสตริงที่ไม่ว่าง', () => {
  assert.equal(photoSpotId(photo('F', 'SPT-a')), 'SPT-a');
  for (const bad of [undefined, null, '', 42, { x: 1 }]) {
    assert.equal(photoSpotId({ metadata: { spotId: bad } }), null, String(bad));
  }
  assert.equal(photoSpotId(null), null);
  assert.equal(photoSpotId({ metadata: null }), null);
});

/* ══ รูปร่าง spotId ═══════════════════════════════════════════════════ */

test('spotId: รูปเดียวกับ id ที่ระบบออก (genId SPT-… · new-… ของจอ) · ว่าง = ถอดการผูก', () => {
  for (const ok of ['SPT-mg8x1k2a3b', 'new-k3j9x0a', 'a', 'A'.repeat(40)]) assert.equal(spotIdError(ok), null, ok);
  for (const clear of [null, undefined, '']) assert.equal(spotIdError(clear), null);
  for (const bad of ['A'.repeat(41), 'มีไทย', 'a b', 'a/b', 42, {}, ['SPT-a']]) {
    assert.match(String(spotIdError(bad)), /จุด/, String(bad));
  }
  assert.equal(normalizeSpotId('  SPT-a '), 'SPT-a');
  assert.equal(normalizeSpotId(''), null);
  assert.equal(normalizeSpotId(null), null);
});

/* ══ ผูก / ย้าย / ถอด ═════════════════════════════════════════════════ */

test('🔑 ผูกได้เฉพาะภาพจุด กับจุดที่มีอยู่ในพื้นที่ (บันทึกแล้ว)', () => {
  const file = photo('F1', undefined);
  assert.equal(spotLinkError({ file, spotId: 'SPT-b', spots: SPOTS }), null);
  assert.equal(spotLinkError({ file, spotId: null, spots: SPOTS }), null, 'ถอดการผูกได้เสมอ');
  assert.match(spotLinkError({ file, spotId: 'SPT-gone', spots: SPOTS }), /ไม่พบจุดนี้/);
  assert.match(spotLinkError({ file: photo('W', undefined, 'x', 'survey_wide'), spotId: 'SPT-a', spots: SPOTS }),
    /เฉพาะภาพจุดติดตั้ง/);
  assert.match(spotLinkError({ file, spotId: 'a b', spots: SPOTS }), /จุด/);
});

test('ตัวเลือก "ผูกกับจุด…" = จุดที่บันทึกแล้ว มีชื่อ · ไม่มีจุดเดิมของรูป · เลขตามลำดับบนจอ', () => {
  const spots = [...SPOTS, { id: 'new-x', label: '', note: '' }, { id: null, label: 'ไม่มี id' }];
  assert.deepEqual(spotAssignTargets({ spots, file: photo('F', 'SPT-a') }),
    [{ id: 'SPT-b', number: 2, label: '2. ข้างเคาน์เตอร์' }]);
  assert.deepEqual(spotAssignTargets({ spots, file: photo('F', undefined) }).map((t) => t.id), ['SPT-a', 'SPT-b']);
  assert.deepEqual(spotAssignTargets(), []);
});

/* ══ จอหน้างาน: ตัวเลือกของถาด (PR-S part 2) ═══════════════════════════════════ */

test('🔑 ตัวเลือกบนจอ: เลขตามแถวของร่าง · ผูกได้เฉพาะจุดที่บันทึกแล้ว (PATCH ตอบ 409 กับจุดร่าง) · บอกจำนวนจุดร่างที่ยังผูกไม่ได้', () => {
  const draft = [
    { id: 'SPT-a', label: 'หน้าลิฟต์' },
    { id: 'new-k3j9x0a', label: 'มุมที่เพิ่งเพิ่ม' },
    { id: 'SPT-b', label: 'ข้างเคาน์เตอร์ (แก้ชื่อแล้ว)' },
    { id: 'new-blank', label: '  ' },
  ];
  const tray = photo('F9', undefined, '2026-09-28T01:00:00Z');
  const { targets, unsaved } = spotLinkChoices({ draftSpots: draft, savedSpots: SPOTS, file: tray });
  assert.deepEqual(targets.map((t) => [t.id, t.label]), [
    ['SPT-a', '1. หน้าลิฟต์'],
    ['SPT-b', '3. ข้างเคาน์เตอร์ (แก้ชื่อแล้ว)'],
  ], 'เลขเดียวกับแถวที่ตาเห็น (ร่าง) · ชื่อตามที่พิมพ์บนจอ');
  assert.equal(unsaved, 1, 'แถวว่างไม่นับ — มันไม่ใช่จุดที่คนรอผูก');

  const linked = photo('F1', 'SPT-a', '2026-09-28T01:00:00Z');
  assert.deepEqual(spotLinkChoices({ draftSpots: draft, savedSpots: SPOTS, file: linked }).targets.map((t) => t.id), ['SPT-b'],
    'ย้ายไปจุดอื่น = ไม่มีจุดเดิมของรูป');
  // ลบจุดในร่าง (ยังไม่บันทึก) — ไม่มีแถวบนจอ ⇒ ไม่อยู่ในตัวเลือก แม้ฐานยังมี
  assert.deepEqual(spotLinkChoices({ draftSpots: [draft[0]], savedSpots: SPOTS, file: tray }).targets.map((t) => t.id), ['SPT-a']);
  assert.deepEqual(spotLinkChoices(), { targets: [], unsaved: 0, linked: false });
});

/* 🐞 UAT 01/10 — รูปที่ผูกผิดจุดต้องถอดกลับถาดได้ (server รับ spotId=null อยู่แล้ว · จอไม่มีตัวเลือก) */
test('🐞 ถอดรูปกลับถาด: รูปใต้แถวบนจอ = ถอดได้ · รูปในถาด/ชี้จุดที่ไม่อยู่บนจอ = ไม่มีตัวเลือกถอด', () => {
  const draft = [{ id: 'SPT-a', label: 'หน้าลิฟต์' }, { id: 'new-k3j9x0a', label: 'มุมใหม่' }];
  const at = (spotId) => spotLinkChoices({ draftSpots: draft, savedSpots: SPOTS, file: photo('F1', spotId, '2026-09-28T01:00:00Z') });
  assert.equal(at('SPT-a').linked, true);
  assert.equal(at('new-k3j9x0a').linked, true, 'รูปของแถวที่ยังไม่บันทึกก็ถอดได้ (null ไม่ต้องตรวจว่าจุดลงฐานแล้ว)');
  assert.equal(at(undefined).linked, false, 'อยู่ในถาดอยู่แล้ว');
  assert.equal(at('SPT-b').linked, false, 'จุดถูกลบในร่าง = รูปขึ้นที่ถาดแล้ว');
  assert.equal(at('   ').linked, false, 'ค่าแปลกปลอม = ไม่ผูก');
  // จุดเดียวในพื้นที่: ย้ายไปไหนไม่ได้ แต่ยังถอดได้
  const only = spotLinkChoices({ draftSpots: [draft[0]], savedSpots: SPOTS, file: photo('F2', 'SPT-a', '2026-09-28T01:00:00Z') });
  assert.deepEqual(only.targets, []);
  assert.equal(only.linked, true);
  // ด่านข้อมูลของ server รับการถอด · metadata หลังถอดไม่มีคีย์ spotId
  assert.equal(spotLinkError({ file: photo('F1', 'SPT-a'), spotId: null, spots: SPOTS }), null);
  assert.equal(isSpotLinkPatch({ spotId: null }), true, 'คำขอถอดยังเป็นคำขอผูกจุดคีย์เดียว (ข้อยกเว้นใบล็อกของหัวหน้า)');
  assert.deepEqual(withSpotLink({ spotId: 'SPT-a', x: 1 }, null), { x: 1 });
});

test('ถาด: หัว "ยังไม่ได้ผูกจุด · n รูป" · ผูกได้ = บอกวิธี (+ เหตุที่จุดร่างไม่อยู่ในตัวเลือก) · ผูกไม่ได้ = บอกว่ายังไม่รู้', () => {
  assert.deepEqual(spotTrayView({ count: 2, canLink: true }), {
    title: `${SPOT_TRAY_LABEL} · 2 รูป`, note: 'แตะชื่อจุดที่ตรงกับรูป',
  });
  assert.equal(spotTrayView({ count: 1, canLink: true, unsaved: 1 }).note,
    'แตะชื่อจุดที่ตรงกับรูป · จุดที่ยังไม่บันทึกผูกไม่ได้ — กดบันทึกพื้นที่ก่อน');
  assert.deepEqual(spotTrayView({ count: 3, canLink: false }), {
    title: `${SPOT_TRAY_LABEL} · 3 รูป`, note: 'ยังไม่รู้ว่าเป็นรูปของจุดไหน',
  });
  assert.equal(spotTrayView({ count: 0, canLink: true }).title, SPOT_TRAY_LABEL, 'กำลังส่งอยู่ ยังไม่มีรูป = ไม่มีเลข');
  assert.equal(spotRowLabel(1, { label: ' มุมเตียง ' }), 'จุดที่ 2 มุมเตียง');
  assert.equal(spotRowLabel(0, { label: '' }), 'จุดที่ 1', 'แถวที่ยังไม่มีชื่อยังบอกได้ว่าแถวไหน');
});

test('metadata ใหม่: เติม/แทน spotId · ถอด = ลบคีย์ทิ้ง · ไม่แตะคีย์อื่น ไม่แก้ของเดิมในที่', () => {
  const before = { caption: 'x', spotId: 'SPT-a' };
  assert.deepEqual(withSpotLink(before, 'SPT-b'), { caption: 'x', spotId: 'SPT-b' });
  assert.deepEqual(withSpotLink(before, null), { caption: 'x' });
  assert.deepEqual(withSpotLink(before, ''), { caption: 'x' });
  assert.deepEqual(withSpotLink(null, 'SPT-a'), { spotId: 'SPT-a' });
  assert.equal(before.spotId, 'SPT-a', 'ห้ามแก้ object ที่รับมา');
});

test('เส้นแก้การผูกจุดรับ metadata ที่มี spotId **อย่างเดียว**', () => {
  assert.equal(isSpotLinkPatch({ spotId: 'SPT-a' }), true);
  assert.equal(isSpotLinkPatch({ spotId: null }), true);
  assert.equal(isSpotLinkPatch({ spotId: 'SPT-a', caption: 'x' }), false);
  assert.equal(isSpotLinkPatch({ issuedDate: '2026-01-01' }), false);
  for (const bad of [null, undefined, [], 'x', {}]) assert.equal(isSpotLinkPatch(bad), false);
});

test('ลบจุดที่มีรูป = ถามก่อนด้วยจำนวนรูป · จุดไม่มีรูป = ไม่ถาม', () => {
  const files = [photo('F1', 'SPT-a', '1'), photo('F2', 'SPT-a', '2'), photo('F3', 'SPT-b', '3')];
  assert.equal(spotRemovalNotice({ spot: SPOTS[0], files }), 'จุดนี้มี 2 รูป — รูปจะย้ายไปกลุ่ม “ยังไม่ได้ผูกจุด” ไม่มีรูปไหนถูกลบ');
  assert.equal(spotRemovalNotice({ spot: { id: 'SPT-z' }, files }), null);
  assert.equal(spotRemovalNotice({ spot: null, files }), null);
});

/* ══ ใครผูกได้ตอนไหน (Q1a) ═══════════════════════════════════════════════ */

const OPEN = { id: 'DR-1', answeredAt: null, cancelledAt: null, status: 'acknowledged' };
const SENT = { ...OPEN, answeredAt: '2026-09-20T00:00:00Z', status: 'answered' };

test('🔑 ใบยังเปิด: คนที่เขียนไฟล์ของพื้นที่ได้วันนี้ ผูกได้ (ช่างบนนัด · หัวหน้า)', () => {
  assert.deepEqual(surveySpotLinkDecision(OPEN, { canWrite: true }), { ok: true, locked: false, error: null });
  const no = surveySpotLinkDecision(OPEN, { canWrite: false, canDecide: true });
  assert.equal(no.ok, false, 'สิทธิ์เคาะผลอย่างเดียวไม่พอตอนใบเปิด — ต้องเขียนไฟล์ได้ด้วย');
});

test('🔑 Q1(a) ใบส่งผลแล้ว: หัวหน้า (canSendSurveyResult) ยังผูกได้ — metadata อย่างเดียว · ช่างไม่ได้', () => {
  assert.deepEqual(surveySpotLinkDecision(SENT, { canWrite: false, canDecide: true }), { ok: true, locked: true, error: null });
  const crew = surveySpotLinkDecision(SENT, { canWrite: true, canDecide: false });
  assert.equal(crew.ok, false);
  assert.equal(crew.locked, true);
  assert.match(crew.error, /หัวหน้า/);
  // ใบส่งผลแล้วถูกฝ่ายขายปิดเรื่องต่อ (status closed + answeredAt) = ยังเป็นใบที่ส่งผลแล้ว
  assert.equal(surveySpotLinkDecision({ ...SENT, status: 'closed', closedAt: 'x' }, { canDecide: true }).ok, true);
});

test('🔴 ข้อยกเว้นแคบ: ใบยกเลิก · ปิดโดยไม่ได้ประเมิน · ฝ่ายขายปิดก่อนได้ผล = หัวหน้าก็ผูกไม่ได้', () => {
  for (const req of [
    { ...OPEN, cancelledAt: 'x', status: 'cancelled' },
    { ...SENT, cancelledAt: 'x' },
    { ...OPEN, status: 'closed' },
    { ...OPEN, closedAt: 'x' },
  ]) {
    const d = surveySpotLinkDecision(req, { canWrite: true, canDecide: true });
    assert.equal(d.ok, false, JSON.stringify(req));
    assert.ok(d.error);
  }
  // แอดมินเก็บกวาดได้ทุกสภาพ (กติกาเดิมของด่านไฟล์ — ผ่านด่านเวลา)
  assert.equal(surveySpotLinkDecision({ ...OPEN, cancelledAt: 'x' }, { canWrite: true, isAdmin: true }).ok, true);
  assert.equal(surveySpotLinkDecision(null, { canWrite: true, canDecide: true }).ok, false);
});

/* ══ ตอนอัป (POST) ═══════════════════════════════════════════════════ */

test('อัปภาพจุดพร้อม spotId: ตรวจแค่รูปร่าง (จุดร่างยังไม่บันทึกได้ — id คงเดิมตอนบันทึก)', () => {
  assert.deepEqual(surveySpotUploadMetadata('service_survey_zone', 'survey_spot', { spotId: 'new-k3j9x0a' }),
    { metadata: { spotId: 'new-k3j9x0a' }, error: null });
  assert.deepEqual(surveySpotUploadMetadata('service_survey_zone', 'survey_spot', { spotId: '' }),
    { metadata: {}, error: null }, 'ว่าง = ไม่ผูก ไม่เก็บคีย์ว่าง');
  assert.match(surveySpotUploadMetadata('service_survey_zone', 'survey_spot', { spotId: 'a b' }).error, /จุด/);
  assert.match(surveySpotUploadMetadata('service_survey_zone', 'survey_wide', { spotId: 'SPT-a' }).error,
    /เฉพาะภาพจุดติดตั้ง/);
  assert.deepEqual(surveySpotUploadMetadata('service_survey_zone', 'survey_wide', {}), { metadata: {}, error: null });
});

test('entity อื่นไม่ถูกแตะเลย — คีย์ spotId ผ่านไปเหมือนเดิม ไม่ตรวจ', () => {
  const meta = { spotId: 'a b', issuedDate: '2026-01-01' };
  assert.deepEqual(surveySpotUploadMetadata('customer', 'other', meta), { metadata: meta, error: null });
  assert.deepEqual(surveySpotUploadMetadata('service_survey_zone', 'survey_spot', null), { metadata: null, error: null });
});
