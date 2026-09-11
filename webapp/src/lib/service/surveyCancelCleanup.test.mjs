import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancelCleanupSummary, zoneCleanupDecision } from './surveyCancelCleanup.js';
import { surveyEditLockError } from './survey.js';
import { cancelRequestError, closeUnassessedError } from '@/lib/requests/stages';

/** ตัดคอมเมนต์ก่อนค้นซอร์ส — ยามที่ห้ามพูดถึงคำไหน ทำให้ไฟล์อธิบายตัวเองไม่ได้ */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const request = (over = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', status: 'pending',
  acknowledgedAt: null, createdAt: '2026-09-01T00:00:00Z', ...over,
});
/* ค่าตั้งต้น = โซนที่ **ใบนี้สร้าง** (mig 0355 · materializeSurveyZones เขียนตัวชี้) — เคสที่ลบได้ */
const zone = (over = {}) => ({
  id: 'ZN1', code: 'ZN-A-01', createdAt: '2026-09-02T00:00:00Z', createdBySurveyRequestId: 'REQ1', ...over,
});

/* ══ ยกเลิกได้ก่อน TS รับเรื่องเท่านั้น (มติข้อ 24) ══════════════════════ */

test('🔑 ใบประเมิน: รับเรื่องแล้วยกเลิกไม่ได้ และต้องบอกทางออก', () => {
  const err = cancelRequestError(request({ status: 'acknowledged', acknowledgedAt: '2026-09-05' }));
  assert.match(err, /ยกเลิกไม่ได้/);
  assert.match(err, /ปิดใบโดยไม่ได้ประเมิน/, 'ห้ามห้ามเฉย ๆ — ต้องบอกว่าไปต่อทางไหน');
});

test('ใบประเมินที่ยังไม่ถูกรับเรื่อง ยกเลิกได้ตามปกติ', () => {
  assert.equal(cancelRequestError(request()), null);
});

/* 🔴 **ห้ามรัดด่านกลางให้แคบทั้งระบบ** — หัวข้ออื่นใช้ "ยกเลิก" เป็นทางออกมาตรฐาน
   หลังรับเรื่อง (`closeRequestError` โยนคนมาหาคำนี้ถึงสามจุด) ⇒ รัดแล้วใบ RD/PC
   ที่รับเรื่องแล้วแต่ล้ม จะค้างถาวรไม่มีประตูออก */
test('🔴 หัวข้ออื่นต้องไม่โดนกระทบ — ยกเลิกหลังรับเรื่องได้เหมือนเดิม', () => {
  for (const kind of ['scent_dev', 'formula_dev', 'doc_request', 'material_price']) {
    assert.equal(
      cancelRequestError(request({ kind, status: 'acknowledged', acknowledgedAt: '2026-09-05' })),
      null,
      kind,
    );
  }
});

/* ══ ทางออกหลังรับเรื่อง: ฝ่ายปิดใบโดยไม่ได้ผล ═══════════════════════════ */

test('🔑 ปิดใบโดยไม่ได้ประเมิน — มีเฉพาะหัวข้อที่ปิดประตูยกเลิกไว้', () => {
  const ack = request({ status: 'acknowledged', acknowledgedAt: '2026-09-05' });
  assert.equal(closeUnassessedError(ack, { reason: 'ลูกค้ายกเลิกโครงการทั้งหมด' }), null);

  // เหตุผลบังคับ — ผู้ขอรอผลอยู่ แล้วจู่ ๆ ใบจบโดยไม่มีผล
  assert.match(closeUnassessedError(ack, { reason: 'สั้น' }), /10 ตัวอักษร/);

  /* 🔴 ประตูนี้ต้องไม่กลายเป็นทางที่สองให้ฝ่ายลากปิดใบเองในหัวข้อที่ตั้งใจให้
     ผู้ขอเป็นคนปิด (กติกา "ปิดสองฝั่ง") */
  assert.match(
    closeUnassessedError(request({ kind: 'scent_dev', status: 'acknowledged', acknowledgedAt: 'x' }), { reason: 'ลูกค้ายกเลิกแล้ว' }),
    /ไม่มีขั้น/,
  );

  // ส่งผลไปแล้ว = ของอยู่ในมือผู้ขอ การปิดเป็นเรื่องของเขา
  assert.match(closeUnassessedError({ ...ack, answeredAt: 'x' }, { reason: 'ลูกค้ายกเลิกแล้ว' }), /ให้ผู้ขอกดปิด/);
  // ยังไม่รับเรื่อง = ยกเลิกได้เองอยู่แล้ว ไม่ต้องใช้ประตูนี้
  assert.match(closeUnassessedError(request(), { reason: 'ลูกค้ายกเลิกแล้ว' }), /ยกเลิกใบได้เอง/);
});

/* ══ เก็บกวาดพื้นที่ที่ใบสร้างไว้ ═══════════════════════════════════════ */

test('🔑 ลบเฉพาะพื้นที่ที่ใบนี้สร้าง และยังไม่มีใครใช้', () => {
  const ok = zoneCleanupDecision({ zone: zone(), request: request(), refs: {} });
  assert.equal(ok.action, 'delete');
});

/* ⚠️ พื้นที่ที่มีอยู่ก่อนใบ = ทะเบียนของลูกค้า ไม่ใช่ขยะของใบนี้
   (SA ติ๊กมาจากทะเบียน — โซนพวกนี้เกิดก่อนใบเสมอ) */
test('🔴 พื้นที่ที่มีอยู่ก่อนใบ ห้ามลบ', () => {
  const d = zoneCleanupDecision({
    zone: zone({ createdAt: '2026-08-01T00:00:00Z' }), request: request(), refs: {},
  });
  assert.equal(d.action, 'keep');
  assert.match(d.reason, /ก่อนใบนี้/);
});

test('🔴 ขายไปแล้ว / มีเครื่อง / มีใบอื่นอ้างถึง — เก็บไว้ทั้งหมด', () => {
  const cases = [
    [{ terms: 1 }, /ขายไปแล้ว|มีเครื่อง/],
    [{ assets: 2 }, /ขายไปแล้ว|มีเครื่อง/],
    [{ otherSurveyRows: 1 }, /ใบอื่น/],
  ];
  for (const [refs, re] of cases) {
    const d = zoneCleanupDecision({ zone: zone(), request: request(), refs });
    assert.equal(d.action, 'keep');
    assert.match(d.reason, re);
  }
});

/* 🐞 mig 0354: จุดติดตั้งบนโซนมาจากคนคีย์เสมอ (ใบประเมินไม่เขียนลงโซน) ⇒ โซนที่มีจุด = ทะเบียน
   ต่อให้เกิดหลังใบและไม่มีใครอ้างถึง — เคสจริง: TS คีย์ไซต์ย้อนหลังระหว่างที่ใบของ SA ค้างอยู่ */
test('🔴 โซนที่มีจุดติดตั้งในทะเบียนแล้ว ห้ามลบ — ต่อให้เกิดหลังใบและไม่มีใครใช้', () => {
  const d = zoneCleanupDecision({
    zone: zone({ spots: [{ id: 'SPT-1', label: 'ข้างประตู' }] }), request: request(), refs: {},
  });
  assert.equal(d.action, 'keep');
  assert.match(d.reason, /จุดติดตั้ง/);
  // จุดว่าง = ไม่ใช่เหตุให้เก็บ (ค่าตั้งต้นของทุกโซนคือ [])
  assert.equal(zoneCleanupDecision({ zone: zone({ spots: [] }), request: request(), refs: {} }).action, 'delete');
});

test('ตัวกวาดทั้งสองเส้นอ่านโซนทั้งแถว — ตัวตัดสินต้องเห็น spots', () => {
  const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
  for (const rel of ['lib/service/surveyCancelCleanup.js', 'app/api/service/surveys/[id]/zones/[zoneId]/route.js']) {
    assert.doesNotMatch(read(rel), /from\('service_zones'\)\.select\('id, code, name, "createdAt"'\)/, rel);
  }
});

/* ══ ตัวชี้เจ้าของ (mig 0355) — เลิกเดาจากเวลา ══════════════════════════════
   🐞 เคสที่ปิด: SA เปิดใบขอ "Lobby" → ก่อนกดส่ง TS คีย์โซน "Lobby" เองที่หน้าไซต์ (0 จุด)
      → กดส่งแล้วใบ "ผูก" แถวเข้าโซนนั้นตามชื่อ → ยกเลิกใบ ⇒ เดิม "เกิดหลังใบ + ไม่มีใครใช้" = ลบ */
test('🔴 โซนที่ TS คีย์เองหลังใบถูกเปิด (ไม่มีตัวชี้) — ห้ามลบ ต่อให้ไม่มีจุดและไม่มีใครใช้', () => {
  const d = zoneCleanupDecision({
    zone: zone({ createdBySurveyRequestId: null, spots: [] }), request: request(), refs: {},
  });
  assert.equal(d.action, 'keep');
  assert.match(d.reason, /ไม่ได้เกิดจากใบประเมิน/);
  // ช่องไม่มีอยู่เลย (แถวก่อนมิก 0355 / select ที่ไม่มีคอลัมน์) = ไม่ลบเหมือนกัน
  const { createdBySurveyRequestId, ...legacy } = zone();
  assert.equal(createdBySurveyRequestId, 'REQ1');
  assert.equal(zoneCleanupDecision({ zone: legacy, request: request(), refs: {} }).action, 'keep');
});

test('🔴 โซนที่ใบอื่นสร้าง — ใบนี้แค่ผูกตามชื่อ ห้ามลบ', () => {
  const d = zoneCleanupDecision({ zone: zone({ createdBySurveyRequestId: 'REQ2' }), request: request(), refs: {} });
  assert.equal(d.action, 'keep');
  assert.match(d.reason, /ใบอื่น/);
});

test('✅ โซนที่ใบนี้สร้าง + ยังไม่มีใครใช้ — ลบ (เส้นยกเลิกใบ และเส้นช่างลบพื้นที่ที่เพิ่มหน้างาน)', () => {
  // ช่างเพิ่มพื้นที่หน้างานก็สร้างผ่าน materializeSurveyZones ⇒ ได้ตัวชี้ของใบเดียวกัน
  const added = zoneCleanupDecision({ zone: zone(), request: request({ status: 'acknowledged' }), refs: {} });
  assert.equal(added.action, 'delete');
});

test('🔑 ตัวชี้เจ้าของเขียนที่ materializeSurveyZones ที่เดียว · ทั้งสองทางของใบประเมินผ่านฟังก์ชันนี้', () => {
  const repo = code('./surveyRepo.js');
  assert.match(repo, /createdBySurveyRequestId: requestId,/);
  // ช่างเพิ่มพื้นที่หน้างาน = ออกรหัสผ่านตัวเดียวกัน (ไม่ได้ insert โซนเอง)
  const addZone = code('../../app/api/service/surveys/[id]/zones/route.js');
  assert.match(addZone, /materializeSurveyZones\(supabase, \{\s*requestId: id,/);
  assert.doesNotMatch(addZone, /from\('service_zones'\)\.insert/);
  // ทางอื่นที่สร้างโซนต้องไม่เขียนตัวชี้ (คนเพิ่มเอง/นำเข้า = ของทะเบียน ไม่ใช่ของใบ)
  for (const rel of [
    '../../app/api/service/sites/[id]/zones/route.js',
    '../../app/api/service/legacy-sites/route.js',
    './importRepo.js',
  ]) {
    assert.doesNotMatch(code(rel), /createdBySurveyRequestId/, rel);
  }
});

/* fail-closed: ไม่รู้เวลา = ไม่ลบ · ของในทะเบียนลูกค้าห้ามหายเพราะเดา */
test('⚠️ ไม่รู้เวลาสร้าง = ไม่ลบ', () => {
  assert.equal(zoneCleanupDecision({ zone: zone({ createdAt: null }), request: request(), refs: {} }).action, 'keep');
  assert.equal(zoneCleanupDecision({ zone: zone(), request: request({ createdAt: null }), refs: {} }).action, 'keep');
  assert.equal(zoneCleanupDecision({}).action, 'keep');
});

test('สรุปที่เขียนลง audit บอกทั้งที่ลบและที่เก็บไว้', () => {
  assert.equal(cancelCleanupSummary({}), '');
  const text = cancelCleanupSummary({ deleted: ['ZN-A-01'], kept: ['ZN-A-02 (ขายไปแล้ว)'] });
  assert.match(text, /ZN-A-01/);
  assert.match(text, /เก็บไว้ 1/);
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */
test('🔴 route ยกเลิกต้องเรียกตัวเก็บกวาด และเรียกหลังใบถูกยกเลิกสำเร็จ', () => {
  const route = readFileSync(
    new URL('../../app/api/sa/requests/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /cleanupCancelledSurveyZones\(/);
  assert.match(route, /action === 'close-unassessed'/, 'ต้องมีทางออกหลังรับเรื่อง');

  /* ⚠️ เก็บกวาดต้องอยู่ **หลัง** จุดที่อ่านแถวหลังอัปเดต — เก็บกวาดก่อนแล้วใบยกเลิก
     ไม่สำเร็จ = ลบพื้นที่ของใบที่ยังมีชีวิตอยู่ */
  const afterAt = route.indexOf('const after = await findRequest');
  const cleanupAt = route.indexOf('cleanupCancelledSurveyZones(supabase');
  assert.ok(afterAt > 0 && cleanupAt > afterAt, 'ต้องเก็บกวาดหลังใบถูกยกเลิกสำเร็จแล้ว');
});

/* 🪤 ธงรายหัวข้อพิมพ์ผิดแล้วเงียบ — ทะเบียนไม่เคยมี whitelist ของคีย์ระดับบนสุด */
test('🪤 ธงบูลีนของหัวข้อต้องถูกตรวจชนิด', async () => {
  const { assertKind } = await import('@/lib/requests/kinds/registry');
  assert.throws(
    () => assertKind({ key: 'x', label: 'x', scope: 'XX', cancelBeforeAckOnly: 'yes' }),
    /ต้องเป็น true\/false/,
  );
});

/* ══ ปุ่มบนจอ — ของที่ #1645 สร้าง API ไว้แต่ไม่เคยต่อปลายหน้า ═══════════ */

/* 🐞 ข้อความของปุ่ม "ยกเลิกคำร้อง" โยนคนไปหาปุ่มนี้มาตั้งแต่ #1645 แต่ปุ่มไม่เคยมี
   ⇒ ใบที่ TS รับเรื่องแล้วดีลล่ม ค้างถาวร ไม่มีประตูออก */
test('🔴 ปุ่ม "ปิดใบโดยไม่ได้ประเมิน" ต้องมีอยู่จริงบนหน้ารายละเอียดคำร้อง', () => {
  const page = code('../../app/requests/[id]/page.js');
  assert.match(page, /id: "close-unassessed"/);
  assert.match(page, /label: "ปิดใบโดยไม่ได้ประเมิน"/,
    'ป้ายต้องเป็นคำเดียวกับที่ข้อความของปุ่มยกเลิกเอ่ยถึง ไม่งั้นคนอ่าน toast แล้วยังหาปุ่มไม่เจอ');
  assert.match(page, /action: "close-unassessed", reason: closeUnassessed\.reason/);
  assert.match(page, /closeUnassessedError\(req, \{ reason: "x"\.repeat\(10\) \}\)/,
    'ปุ่มต้องปิดด้วยตัวตัดสินตัวเดียวกับ server ไม่ใช่เขียนเงื่อนไขซ้ำ');
  // กติกา ม-34: หน้าเปลือกห้ามเทียบชื่อหัวข้อเอง — ธงอยู่ในตัวตัดสินแล้ว
  assert.doesNotMatch(page, /kind === "site_survey"/);
});

/* 🔴 สภาพ "ปิดแล้วแต่ไม่เคยตอบ" เพิ่งไปถึงได้จริงตอนปุ่มนี้ถูกสร้าง
   ⇒ ไม่ล็อก = จอผลประเมินยังแก้ได้ทุกช่อง และยังโชว์ปุ่ม "ส่งผล" ที่กดแล้วตาย 409 */
test('🔴 ปิดใบแล้ว จอผลประเมินต้องล็อก และต้องบอกทางที่เหลือจริง', () => {
  const base = { id: 'R1', answeredAt: null, cancelledAt: null };
  assert.equal(surveyEditLockError(base), null);
  const closed = surveyEditLockError({ ...base, closedAt: '2026-09-10T00:00:00Z', status: 'closed' });
  assert.match(closed, /ปิดไปแล้ว/);
  assert.match(closed, /เปิดใบใหม่/, 'ไม่มีทางกลับ — ห้ามชี้ไปปุ่ม "ยังไม่จบ" ที่หายไปแล้ว');
  // ทางปิดปกติล็อกด้วย answeredAt ไปก่อนแล้ว — บรรทัดใหม่ต้องไม่เปลี่ยนข้อความของเส้นเดิม
  assert.match(
    surveyEditLockError({ ...base, answeredAt: 'x', closedAt: 'y', status: 'closed' }),
    /ยังไม่จบ/,
  );
});

/* 🔴 ใบถูกปิดขณะที่นัดยังเปิดค้างบนตารางช่างได้จริง (ระบบไม่ปิดนัดตามใบ)
   ⇒ ช่างแก้สรุปนัดนั้นทีหลัง = วันถูกเขียนกลับลงใบที่ปิดแล้ว ⇒ ใบโผล่กลับเข้าคิวเอง */
test('🔴 ซิงก์วันจากนัด ต้องไม่เขียนลงใบที่จบไปแล้ว', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /const requestClosedOff = !!surveyEditLockError\(reqRow\);/);
  assert.match(route, /holdsRequestSlot\(data\) && reqRow && !requestClosedOff/);
});
