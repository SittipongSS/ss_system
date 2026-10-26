// ── ประเมินจากแบบ งวด 4 (S4 §2.6) — ตั้งวิธีของแถวพื้นที่ตอนเปิดใบ / ตอนร่างเปลี่ยนวิธี ─────────────
//
// ⭐ ไม่แตะฐานจริง — ตัวจำลอง supabase ด้านล่างจดทุกคำสั่งไว้ให้เทสต์ตรวจ
// 🔴 แถวที่มีผลประเมินแล้ว (`surveyedAt`) ห้ามถูกเปลี่ยนวิธีเงียบ ๆ — ไม่งั้นตัวเลขที่หัวหน้าประเมินจากแบบกลายเป็น
//    "ช่างวัดหน้างาน" (หรือกลับกัน) โดยไม่มีด่านไหนจับได้ (`surveyZoneNeedsResave` ตอบ false เพราะ `methodChangedAt` ว่าง)
//    แล้ว FM-TS-01 ออกตอนส่งผลด้วยข้อความที่ไม่จริง
//    · ทิศเป็นลงหน้างาน (มติเจ้าของ 19/10 · S4 O8 = ข): **รับ** แล้วประทับการสลับในนามฝ่ายขาย ⇒ ด่านขนาดบังคับวัดใหม่
//    · ทิศเป็นจากแบบ: ยังตีกลับ (`'assessed'`) — ตราในนามฝ่ายขายจะขึ้นชื่อฝ่ายขายเป็นผู้ประเมินจากแบบของตัวเลขที่ช่างวัด
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURVEY_METHOD_DRAWING, SURVEY_METHOD_ONSITE, surveyDrawingAssessor, surveyZoneNeedsResave } from './surveyMethod.js';
import { reseedSurveyZoneMethods, surveyZoneSeedPatch } from './surveyIntakeSeed.js';
import { SURVEY_INTAKE_SWITCH_REASON } from './surveyIntake.js';
import { surveyZoneResaveText } from './surveyFieldView.js';
import { surveyQueueMethodBack } from './surveyQueueRepo.js';

/* ตัวจำลอง: อ่าน = แถวที่ให้ไว้ (หรือ error) · เขียน = จด payload + ตัวกรอง แล้วคืน error ที่ตั้งไว้
   `failRead` / `failUpdate` = จำนวนครั้งแรกที่ต้องพัง (ทดสอบ "พังแล้วกดซ้ำ") · `failIf(q)` = พังเฉพาะคำสั่งที่ตรง
   · `beforeWrite` = เขียนแทรกก่อนคำสั่งเขียน */
function fakeDb(rows, { failRead = 0, failUpdate = 0, failIf = null, beforeWrite = null } = {}) {
  const log = { reads: [], updates: [] };
  let reads = 0;
  let updates = 0;
  const db = {
    log,
    from(table) {
      return {
        select(cols) {
          const q = { table, cols, filters: [] };
          const chain = {
            eq(col, val) { q.filters.push([col, val]); return chain; },
            then(resolve, reject) {
              reads += 1;
              log.reads.push(q);
              const out = reads <= failRead
                ? { data: null, error: { message: 'read boom' } }
                : { data: rows.map((r) => ({ ...r })), error: null };
              return Promise.resolve(out).then(resolve, reject);
            },
          };
          return chain;
        },
        /* เขียน: กรองจริงตาม eq / in / is แล้วคืนแถวที่โดนเขียนเมื่อขอ `.select(...)` (PostgREST return=representation)
           `beforeWrite(rows)` = จำลองคนอื่นเขียนแทรกระหว่างอ่านกับเขียน */
        update(payload) {
          const q = { table, payload, filters: [], select: undefined };
          const hit = (r) => q.filters.every(([op, col, val]) => {
            if (op === 'eq') return String(r[col] ?? '') === String(val ?? '');
            if (op === 'in') return (val || []).some((v) => String(r[col] ?? '') === String(v ?? ''));
            if (op === 'is') return (r[col] ?? null) === val;
            return true;
          });
          const chain = {
            eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
            in(col, val) { q.filters.push(['in', col, val]); return chain; },
            is(col, val) { q.filters.push(['is', col, val]); return chain; },
            select(cols) { q.select = cols; return chain; },
            then(resolve, reject) {
              updates += 1;
              log.updates.push(q);
              beforeWrite?.(rows);
              const failed = updates <= failUpdate || !!failIf?.(q);
              const touched = failed ? [] : rows.filter(hit);
              for (const r of touched) Object.assign(r, payload);
              const data = q.select === undefined ? null : touched.map((r) => ({ id: r.id }));
              return Promise.resolve({ data: failed ? null : data, error: failed ? { message: 'update boom' } : null }).then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  };
  return db;
}

const zone = (id, method, extra = {}) => ({ id, requestId: 'R1', method, methodChangedAt: null, surveyedAt: null, ...extra });

test('surveyZoneSeedPatch — ลงหน้างานไม่มีคีย์ method เลย (payload เท่าวันนี้) · จากแบบ = drawing', () => {
  assert.deepEqual(surveyZoneSeedPatch('drawing'), { method: SURVEY_METHOD_DRAWING });
  for (const v of ['standard', '', null, undefined, 'npd']) {
    assert.deepEqual(surveyZoneSeedPatch(v), {}, String(v));
    assert.equal('method' in surveyZoneSeedPatch(v), false);
  }
});

test('re-seed · ทุกแถวตรงวิธีอยู่แล้ว = ไม่เขียน', async () => {
  const db = fakeDb([zone('Z1', 'drawing'), zone('Z2', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' }), { changed: 0, skipped: null, error: null });
  assert.equal(db.log.updates.length, 0);
  // แถวเก่าไม่มีคีย์ method / null = ลงหน้างาน
  const legacy = fakeDb([zone('Z1', null), { id: 'Z2' }]);
  assert.deepEqual(await reseedSurveyZoneMethods(legacy, { requestId: 'R1', variant: 'standard' }), { changed: 0, skipped: null, error: null });
  assert.equal(legacy.log.updates.length, 0);
});

test('re-seed · อ่านแถวของใบนี้เท่านั้น ด้วยคอลัมน์ที่ต้องใช้', async () => {
  const db = fakeDb([zone('Z1', 'onsite')]);
  await reseedSurveyZoneMethods(db, { requestId: 'R9', variant: 'standard' });
  assert.equal(db.log.reads.length, 1);
  assert.equal(db.log.reads[0].table, 'service_survey_zones');
  assert.equal(db.log.reads[0].cols, 'id, method, spots, "methodChangedAt", "methodReason", "surveyedAt", "updatedAt"');
  assert.deepEqual(db.log.reads[0].filters, [['requestId', 'R9']]);
});

test('re-seed · ผสม → คำสั่งเดียว เขียนแค่ method + updatedAt (ไม่แตะ methodReason / methodChangedAt / ชื่อผู้สลับ)', async () => {
  const db = fakeDb([zone('Z1', 'onsite'), zone('Z2', 'drawing'), zone('Z3', null)]);
  const out = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.deepEqual(out, { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 1);
  const [u] = db.log.updates;
  assert.equal(u.table, 'service_survey_zones');
  // 🔴 คำสั่งเขียนกรองเอง: ของใบนี้ · เฉพาะแถวงาน · เฉพาะแถวที่ยังไม่มีผล · ขอแถวที่โดนเขียนกลับมานับ
  assert.deepEqual(u.filters, [['eq', 'requestId', 'R1'], ['in', 'id', ['Z1', 'Z3']], ['is', 'surveyedAt', null]]);
  assert.equal(u.select, 'id');
  assert.deepEqual(Object.keys(u.payload).sort(), ['method', 'updatedAt']);
  assert.equal(u.payload.method, SURVEY_METHOD_DRAWING);
  assert.ok(!Number.isNaN(Date.parse(u.payload.updatedAt)), 'updatedAt เป็นเวลา ISO');

  const back = fakeDb([zone('Z1', 'drawing'), zone('Z2', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(back, { requestId: 'R1', variant: 'standard' }), { changed: 2, skipped: null, error: null });
  assert.deepEqual(Object.keys(back.log.updates[0].payload).sort(), ['method', 'updatedAt']);
  assert.equal(back.log.updates[0].payload.method, SURVEY_METHOD_ONSITE);
});

test('re-seed · แถวที่หัวหน้าสลับวิธีแล้ว (methodChangedAt) = skipped switched ไม่เขียน', async () => {
  const db = fakeDb([zone('Z1', 'drawing', { methodChangedAt: '2026-10-10T03:00:00Z' }), zone('Z2', 'onsite')]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' }), { changed: 0, skipped: 'switched', error: null });
  assert.equal(db.log.updates.length, 0);
});

test('🔴 re-seed · ทิศเป็นจากแบบ: งานที่มีผลประเมินลงหน้างานแล้ว = skipped assessed ไม่เขียน (dryRun ก็เช่นกัน)', async () => {
  // ตัวเลขที่วัดหน้างานต้องไม่ถูกติดป้ายเป็นการประเมินจากโต๊ะ — และไม่มีตราในนามฝ่ายขายทางนี้
  const toDrawing = fakeDb([zone('Z1', 'onsite', { surveyedAt: '2026-10-11T04:00:00Z' }), zone('Z2', 'onsite')]);
  assert.deepEqual(await reseedSurveyZoneMethods(toDrawing, { requestId: 'R1', variant: 'drawing', actorName: 'เซลเอ' }), { changed: 0, skipped: 'assessed', error: null });
  assert.equal(toDrawing.log.updates.length, 0);
  const dry = fakeDb([zone('Z1', 'onsite', { surveyedAt: '2026-10-11T04:00:00Z' })]);
  assert.deepEqual(await reseedSurveyZoneMethods(dry, { requestId: 'R1', variant: 'drawing', dryRun: true }), { changed: 0, skipped: 'assessed', error: null });
  assert.equal(dry.log.updates.length, 0);
});

test('re-seed · แถวที่มีผลแต่ตรงวิธีอยู่แล้วไม่ใช่งาน — แถวอื่นที่ต่างและไม่มีผลยังเขียนได้ · แถวที่มีผลไม่ถูกเขียนเลย', async () => {
  const before = '2026-10-11T04:00:00Z';
  const rows = [zone('Z1', 'drawing', { surveyedAt: before, updatedAt: before }), zone('Z2', 'onsite')];
  const db = fakeDb(rows);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' }), { changed: 1, skipped: null, error: null });
  assert.equal(db.log.updates.length, 1);
  assert.equal(db.log.updates[0].payload.method, SURVEY_METHOD_DRAWING);
  // 🔴 Z1 (มีผล · ตรงวิธีอยู่แล้ว) ไม่โดนเขียน — `updatedAt` เดิม ⇒ หัวหน้าที่เปิดแถวค้างไว้ไม่โดน 409 ปลอม
  assert.equal(rows[0].updatedAt, before);
  assert.notEqual(rows[1].updatedAt, undefined);
});

test('🔴 re-seed · หัวหน้าบันทึกผลแทรกระหว่างอ่านกับเขียน = ไม่เปลี่ยนวิธีของแถวนั้น · ตอบ assessed', async () => {
  const rows = [zone('Z1', 'onsite'), zone('Z2', 'onsite')];
  const db = fakeDb(rows, {
    beforeWrite: (list) => { Object.assign(list[1], { surveyedAt: '2026-10-12T02:00:00Z' }); },
  });
  const out = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.deepEqual(out, { changed: 1, skipped: 'assessed', error: null });
  assert.equal(rows[0].method, SURVEY_METHOD_DRAWING);
  assert.equal(rows[1].method, SURVEY_METHOD_ONSITE, 'ตัวเลขหน้างานต้องไม่ถูกติดป้ายจากแบบ');
});

test('re-seed · dryRun นับงานแต่ไม่เขียนเลย', async () => {
  const db = fakeDb([zone('Z1', 'onsite'), zone('Z2', 'onsite'), zone('Z3', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing', dryRun: true }), { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 0);
});

test('re-seed · อ่านพัง = { error } ไม่เขียน (ห้ามนับเป็น "ไม่มีแถว") · กดซ้ำแล้วผ่าน', async () => {
  const rows = [zone('Z1', 'onsite')];
  const db = fakeDb(rows, { failRead: 1 });
  const first = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.equal(first.changed, 0);
  assert.equal(first.skipped, null);
  assert.ok(first.error, 'ต้องมี error');
  assert.equal(db.log.updates.length, 0);
  const second = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.deepEqual(second, { changed: 1, skipped: null, error: null });
  assert.equal(db.log.updates.length, 1);
});

test('re-seed · เขียนพัง = { error } · กดซ้ำเขียนคำสั่งเดียวกันครั้งเดียว · ครั้งที่สามไม่มีงาน (idempotent)', async () => {
  const rows = [zone('Z1', 'onsite'), zone('Z2', 'onsite')];
  const db = fakeDb(rows, { failUpdate: 1 });
  const first = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.equal(first.changed, 0);
  assert.ok(first.error);
  assert.equal(db.log.updates.length, 1);
  const second = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.deepEqual(second, { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 2);
  assert.deepEqual(db.log.updates[1].payload.method, db.log.updates[0].payload.method);
  const third = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' });
  assert.deepEqual(third, { changed: 0, skipped: null, error: null });
  assert.equal(db.log.updates.length, 2);
});

test('re-seed · ใบไม่มีพื้นที่เลย = ไม่มีงาน', async () => {
  const db = fakeDb([]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' }), { changed: 0, skipped: null, error: null });
  assert.equal(db.log.updates.length, 0);
});

/* ═══ O8 = ข (มติเจ้าของ 19/10): ร่างที่ถูกตีกลับหลังหัวหน้าบันทึกผลจากแบบ แล้วฝ่ายขายสลับเป็นลงหน้างาน ═══════════ */

const ASSESSED_AT = '2026-10-11T04:00:00.000Z';
const READ_AT = '2026-10-11T04:00:05.000Z';
/* แถวจากแบบที่หัวหน้าบันทึกผลแล้ว — ขนาดครบ + จุดที่หัวหน้าเลือกไว้จากโต๊ะ */
const assessedDrawing = (id, extra = {}) => zone(id, 'drawing', {
  surveyedAt: ASSESSED_AT, surveyedByName: 'อานนท์', updatedAt: READ_AT, status: 'ok',
  parts: [{ label: 'ห้องโถง', widthM: 4, lengthM: 5, heightM: 3 }],
  spots: [{ id: 's1', label: 'มุมเคาน์เตอร์', selected: true }, { id: 's2', label: 'เสาหน้า', selected: true }],
  ...extra,
});
const STAMP_KEYS = ['method', 'methodChangedAt', 'methodChangedByName', 'methodReason', 'spots', 'updatedAt'];
const RESAVE = 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดและภาพกว้างแล้วกดบันทึกอีกครั้ง';

test('⭐ O8 ข · แถวจากแบบที่มีผล + สลับเป็นลงหน้างาน = รับ · ประทับรายแถวในนามฝ่ายขาย (ผูกรุ่นที่อ่าน) · ปลดเลือกจุด', async () => {
  const rows = [assessedDrawing('Z1'), assessedDrawing('Z2', { updatedAt: null })];
  const db = fakeDb(rows);
  const out = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.deepEqual(out, { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 2, 'ทีละแถว — คำสั่งเขียนทับ spots ซึ่งเส้นบันทึกพื้นที่ก็เขียน');

  const [u1, u2] = db.log.updates;
  for (const u of [u1, u2]) {
    assert.equal(u.table, 'service_survey_zones');
    assert.deepEqual(Object.keys(u.payload).sort(), STAMP_KEYS);
    assert.equal(u.payload.method, SURVEY_METHOD_ONSITE);
    assert.equal(u.payload.methodReason, SURVEY_INTAKE_SWITCH_REASON);
    assert.equal(u.payload.methodReason, 'ฝ่ายขายเปลี่ยนวิธีประเมินเป็นลงหน้างานก่อนส่งคำร้อง');
    assert.equal(u.payload.methodChangedByName, 'เซลเอ');
    assert.equal(u.payload.methodChangedAt, u.payload.updatedAt);
    assert.ok(Date.parse(u.payload.methodChangedAt) > Date.parse(ASSESSED_AT), 'ตราใหม่กว่าผลเดิม');
    assert.deepEqual(u.payload.spots, [
      { id: 's1', label: 'มุมเคาน์เตอร์', selected: false }, { id: 's2', label: 'เสาหน้า', selected: false },
    ]);
    assert.equal(u.select, 'id');
    assert.equal('surveyedAt' in u.payload, false, 'ผลเดิมไม่ถูกลบ — ช่างตรวจกับของจริงแล้วบันทึกทับ');
  }
  assert.deepEqual(u1.filters, [['eq', 'requestId', 'R1'], ['eq', 'id', 'Z1'], ['eq', 'updatedAt', READ_AT]]);
  assert.deepEqual(u2.filters, [['eq', 'requestId', 'R1'], ['eq', 'id', 'Z2'], ['is', 'updatedAt', null]]);
  // ชื่อหัวหน้าในฐานะผู้วัดยังอยู่จนช่างบันทึกใหม่ — ด่านขนาดเป็นตัวกัน (เทสต์ถัดไป)
  assert.equal(rows[0].surveyedByName, 'อานนท์');
});

test('⭐ O8 ข · หลังประทับ ด่านขนาดของหน้าพื้นที่ช่าง (S2a/S2b) บังคับบันทึกใหม่ · ช่างบันทึกหลังสลับ = ผ่าน', async () => {
  const rows = [assessedDrawing('Z1')];
  await reseedSurveyZoneMethods(fakeDb(rows), { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  const [row] = rows;
  assert.equal(row.method, SURVEY_METHOD_ONSITE);
  assert.equal(surveyZoneNeedsResave(row), true);
  assert.equal(surveyZoneResaveText(row, []), RESAVE, 'ตัวเดียวกับที่หน้าพื้นที่ของช่างใช้ (ปุ่มบันทึก + ประโยคของด่าน)');
  assert.equal(surveyDrawingAssessor(row), null, 'แถวลงหน้างานไม่มีผู้ประเมินจากแบบ');

  // ช่างวัดจริงแล้วกดบันทึก (surveyedAt ใหม่กว่าตรา) ⇒ ด่านผ่าน
  const saved = { ...row, surveyedAt: new Date(Date.parse(row.methodChangedAt) + 60_000).toISOString(), surveyedByName: 'ช่างเอ' };
  assert.equal(surveyZoneNeedsResave(saved), false);
  assert.equal(surveyZoneResaveText(saved, []), null);
});

test('⭐ O8 ข · ผสม: แถวที่ยังไม่มีผลได้ payload เดิมทุกตัวอักษร { method, updatedAt } · แถวที่มีผลได้ตรา', async () => {
  const rows = [zone('Z1', 'drawing'), assessedDrawing('Z2'), zone('Z3', 'onsite')];
  const db = fakeDb(rows);
  const out = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.deepEqual(out, { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 2);
  const [plain, stamp] = db.log.updates;
  assert.deepEqual(Object.keys(plain.payload).sort(), ['method', 'updatedAt']);
  assert.equal(plain.payload.method, SURVEY_METHOD_ONSITE);
  assert.deepEqual(plain.filters, [['eq', 'requestId', 'R1'], ['in', 'id', ['Z1']], ['is', 'surveyedAt', null]]);
  assert.deepEqual(Object.keys(stamp.payload).sort(), STAMP_KEYS);
  assert.deepEqual(stamp.filters, [['eq', 'requestId', 'R1'], ['eq', 'id', 'Z2'], ['eq', 'updatedAt', READ_AT]]);
  // แถวที่ไม่มีผล "เกิดมาแบบนั้น": ไม่มีตรา ⇒ ไม่ใช่การสลับ ไม่มีด่านบันทึกซ้ำ
  assert.equal(rows[0].methodChangedAt, null);
  assert.equal(surveyZoneNeedsResave(rows[0]), false);
  assert.equal(rows[2].updatedAt, undefined, 'แถวที่ตรงวิธีอยู่แล้วไม่ถูกแตะ');
});

test('⭐ O8 ข · ใบที่ไม่มีแถวไหนมีผล = payload เท่าก่อนมติทุกตัวอักษร (คำสั่งเดียว ไม่มีตรา)', async () => {
  const db = fakeDb([zone('Z1', 'drawing'), zone('Z2', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' }), { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 1);
  assert.deepEqual(Object.keys(db.log.updates[0].payload).sort(), ['method', 'updatedAt']);
  assert.deepEqual(db.log.updates[0].filters, [['eq', 'requestId', 'R1'], ['in', 'id', ['Z1', 'Z2']], ['is', 'surveyedAt', null]]);
});

test('O8 ข · dryRun (ด่านก่อนเขียนหัวใบ) ทิศลงหน้างาน = นับงานรวมแถวที่มีผล ไม่ตีกลับ ไม่เขียน', async () => {
  const db = fakeDb([assessedDrawing('Z1'), zone('Z2', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', dryRun: true }), { changed: 2, skipped: null, error: null });
  assert.equal(db.log.updates.length, 0);
});

test('O8 ข · ไม่ส่งชื่อผู้กด = methodChangedByName null (ไม่ใช่สตริงว่าง)', async () => {
  const db = fakeDb([assessedDrawing('Z1')]);
  await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard' });
  assert.equal(db.log.updates[0].payload.methodChangedByName, null);
});

test('🔴 O8 ข · ตราของฝ่ายขายไม่ใช่ "หัวหน้าสลับแล้ว": บันทึกซ้ำไม่มีงาน · สลับกลับเป็นจากแบบ = assessed (ไม่เงียบเป็น switched)', async () => {
  const rows = [assessedDrawing('Z1'), zone('Z2', 'drawing')];
  const db = fakeDb(rows);
  await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.equal(db.log.updates.length, 2);
  // บันทึกร่างซ้ำด้วยวิธีเดิม = ไม่มีงาน (idempotent) · ไม่ประทับซ้ำ
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' }), { changed: 0, skipped: null, error: null });
  assert.equal(db.log.updates.length, 2);
  // สลับกลับ: แถวที่ประทับถือผล (ของหัวหน้า) บนแถวลงหน้างาน ⇒ ทิศจากแบบตีกลับ ไม่ใช่ 'switched' ที่ route ปล่อยเงียบ
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing', dryRun: true }), { changed: 0, skipped: 'assessed', error: null });
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'drawing' }), { changed: 0, skipped: 'assessed', error: null });
  assert.equal(db.log.updates.length, 2);
  // แถวที่หัวหน้าสลับจริง (เหตุผลอื่น) ยังเป็น 'switched' ตามเดิม
  const head = fakeDb([zone('Z1', 'onsite', { methodChangedAt: '2026-10-10T03:00:00Z', methodReason: 'แบบไม่พอ ต้องดูของจริง' }), zone('Z2', 'drawing')]);
  assert.deepEqual(await reseedSurveyZoneMethods(head, { requestId: 'R1', variant: 'standard' }), { changed: 0, skipped: 'switched', error: null });
});

test('🔴 O8 ข · แถวได้ผลแทรกระหว่างอ่านกับเขียน (ทิศลงหน้างาน) = อ่านใหม่แล้วประทับแถวนั้น ไม่ปล่อยเป็นลงหน้างานที่ไม่มีตรา', async () => {
  const rows = [zone('Z1', 'drawing'), zone('Z2', 'drawing')];
  let once = false;
  const db = fakeDb(rows, {
    beforeWrite: (list) => {
      if (once) return;
      once = true;
      Object.assign(list[1], { surveyedAt: '2026-10-12T02:00:00Z', updatedAt: '2026-10-12T02:00:00Z' });
    },
  });
  const out = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.deepEqual(out, { changed: 2, skipped: null, error: null });
  assert.equal(db.log.reads.length, 2, 'อ่านใหม่หนึ่งครั้ง');
  assert.equal(rows[0].method, SURVEY_METHOD_ONSITE);
  assert.equal(rows[0].methodReason ?? null, null);
  assert.equal(rows[1].method, SURVEY_METHOD_ONSITE);
  assert.equal(rows[1].methodReason, SURVEY_INTAKE_SWITCH_REASON);
  assert.equal(surveyZoneNeedsResave(rows[1]), true);
});

test('O8 ข · แถวถูกบันทึกแทรก (updatedAt ไม่ตรง) = อ่านใหม่แล้วประทับด้วยรุ่นใหม่ · ชนซ้ำทุกรอบ = { error } (route เตือน/กดซ้ำได้)', async () => {
  const rows = [assessedDrawing('Z1')];
  let bumps = 0;
  const db = fakeDb(rows, {
    beforeWrite: (list) => {
      if (bumps >= 1) return;
      bumps += 1;
      list[0].updatedAt = '2026-10-12T05:00:00Z';
    },
  });
  assert.deepEqual(await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' }), { changed: 1, skipped: null, error: null });
  assert.deepEqual(db.log.updates.map((u) => u.filters[2]), [['eq', 'updatedAt', READ_AT], ['eq', 'updatedAt', '2026-10-12T05:00:00Z']]);
  assert.equal(rows[0].methodReason, SURVEY_INTAKE_SWITCH_REASON);

  const busy = [assessedDrawing('Z1')];
  let n = 0;
  const noisy = fakeDb(busy, { beforeWrite: (list) => { n += 1; list[0].updatedAt = `2026-10-12T05:0${n}:00Z`; } });
  const out = await reseedSurveyZoneMethods(noisy, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.equal(out.changed, 0);
  assert.equal(out.skipped, null);
  assert.equal(out.error, 'พื้นที่ของใบนี้ถูกแก้ระหว่างตั้งวิธีประเมิน');
  assert.equal(busy[0].method, 'drawing', 'ไม่มีอะไรถูกเขียน');
});

test('O8 ข · เขียนตราพัง = { error } · กดซ้ำทำเฉพาะแถวที่เหลือ', async () => {
  const rows = [zone('Z1', 'drawing'), assessedDrawing('Z2')];
  let failOnce = true;
  const db = fakeDb(rows, {
    failIf: (q) => {
      if (!failOnce || !('methodReason' in q.payload)) return false;
      failOnce = false;
      return true;
    },
  });
  const first = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.equal(first.error, 'update boom');
  assert.equal(rows[0].method, SURVEY_METHOD_ONSITE, 'แถวไม่มีผลเขียนไปแล้ว');
  assert.equal(rows[1].method, 'drawing');
  const again = await reseedSurveyZoneMethods(db, { requestId: 'R1', variant: 'standard', actorName: 'เซลเอ' });
  assert.deepEqual(again, { changed: 1, skipped: null, error: null });
  assert.equal(db.log.updates.length, 3, 'รอบสองเขียนแค่ตราของแถวที่เหลือ');
  assert.equal(rows[1].methodReason, SURVEY_INTAKE_SWITCH_REASON);
});

test('O8 ข · การ์ดผู้วางคิวไม่พูดว่า "หัวหน้าเปลี่ยน" กับแถวที่ฝ่ายขายสลับ · การสลับของหัวหน้ายังขึ้นเหตุผลตามเดิม', () => {
  const salesStamp = { id: 'a', requestId: 'R1', status: 'ok', method: 'onsite', methodReason: SURVEY_INTAKE_SWITCH_REASON, methodChangedAt: '2026-10-19T03:00:00Z' };
  assert.equal(surveyQueueMethodBack([salesStamp]), null);
  const headBack = { id: 'b', requestId: 'R1', status: 'ok', method: 'onsite', methodReason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่', methodChangedAt: '2026-10-18T03:00:00Z' };
  // ของหัวหน้าเก่ากว่าก็ยังถูกเลือก — แถวของฝ่ายขายไม่นับเลย
  assert.deepEqual(surveyQueueMethodBack([salesStamp, headBack]), { reason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่' });
});
