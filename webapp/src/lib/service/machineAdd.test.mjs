// ── ด่าน "เพิ่มเครื่อง" + รหัสเครื่อง (mig 0344 · ม็อก machine-add) ────────
//
// ⭐ เทสต์ชุดนี้ตรึง **มติผู้ใช้ 10 ข้อ** ไว้กับโค้ด — แก้แล้วแดง = ตั้งใจให้แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MACHINE_ADD_STATUSES, SITE_RULE_BY_STATUS,
  machineAddCarryOver, machineAddDefaults, machineAddError, machineRow,
} from './machineAdd.js';
import { MACHINE_CODE_RE, machineCodePrefix, normalizeModelCode, parseMachineCode } from './machineCode.js';
import { ASSET_STATUS_LABELS } from './sites.js';

const TODAY = '2026-09-05';
const MODEL = { id: 'M1', kind: 'diffuser', name: 'OV-08', modelCode: 'OV08', colours: ['ขาว', 'ดำ'], isActive: true };
const SITE = { id: 'S1', name: 'ดิ เอ็มควอเทียร์', kind: 'customer', isActive: true };
const ok = (over = {}) => ({ ...machineAddDefaults(TODAY), modelId: 'M1', colour: 'ขาว', ...over });
const ctx = (over = {}) => ({ canEdit: true, model: MODEL, site: null, today: TODAY, ...over });

// ── รหัสเครื่อง ───────────────────────────────────────────────────────────

test('⭐ รหัสประกอบตามมติ: MC คงที่ · AAAA จากทะเบียนรุ่น · YYMM จากวันรับเข้า', () => {
  const { prefix, error } = machineCodePrefix({ modelCode: 'OV08', receivedAt: '2026-09-03' });
  assert.equal(error, null);
  assert.equal(prefix, 'MC-OV08-2609');
  // เลขรัน 5 หลักต่อท้าย prefix ตรง ๆ (ตัวออกเลขกลางทำแค่นี้)
  assert.match(`${prefix}00013`, MACHINE_CODE_RE);
  assert.equal(`${prefix}00013`, 'MC-OV08-260900013');
});

/* 🔴 YYMM มาจาก **วันที่รับเข้า** ไม่ใช่นาฬิกา — ขึ้นทะเบียนย้อนหลังของเก่าเป็นเรื่องปกติ
   (ชีตเก่ามีเครื่องที่รับเข้าตั้งแต่ปี 2567) ⇒ อ่านนาฬิกาจะได้รหัสที่โกหก */
test('🔴 YYMM มาจากวันที่รับเข้า ไม่ใช่เดือนที่กดบันทึก', () => {
  assert.equal(machineCodePrefix({ modelCode: 'OV08', receivedAt: '2024-02-29' }).prefix, 'MC-OV08-2402');
});

test('รหัสรุ่นต้อง 4 ตัวพอดี — แปลงเป็นตัวใหญ่ให้ แต่ไม่เติมความยาวให้เอง', () => {
  assert.equal(normalizeModelCode('ov08').value, 'OV08');
  assert.equal(normalizeModelCode(' soap ').value, 'SOAP');
  assert.equal(normalizeModelCode('7KG0').value, '7KG0');
  assert.ok(normalizeModelCode('7KG').error, 'สั้นไป 1 ตัวต้องตีกลับ ไม่ใช่เติม 0 ให้เอง');
  assert.ok(normalizeModelCode('OV-08').error, 'ขีดไม่ใช่ตัวอักษรที่รับได้');
  assert.ok(normalizeModelCode('ลำโพง').error, 'ต้องตั้งรหัสอังกฤษให้รุ่นภาษาไทย (SPKR)');
});

/* ⚠️ ท่อนท้ายเป็น YYMM+BBBBB ติดกัน ไม่มีขีดคั่น (ต่างจาก ST/ZN)
   ⇒ ใครแกะด้วย split('-') จะได้ค่าผิดเงียบ ๆ */
test('แกะรหัสได้ครบทุกท่อน แม้ไม่มีขีดคั่นก่อนเลขรัน', () => {
  assert.deepEqual(parseMachineCode('MC-OV08-260900013'),
    { modelCode: 'OV08', yy: '26', mm: '09', run: '00013' });
  assert.equal(parseMachineCode('MC-OV08-2609013'), null, 'เลขรันไม่ครบ 5 หลักต้องไม่ผ่าน');
  assert.equal('MC-OV08-260900013'.split('-')[2], '260900013',
    'ยามเตือนความจำ: split ให้ท่อนท้ายติดกัน ⇒ ต้องใช้ regex เท่านั้น');
});

// ── ด่านเพิ่มเครื่อง ──────────────────────────────────────────────────────

test('เส้นปกติผ่าน — รุ่นในทะเบียน สีที่รุ่นนั้นมี วันที่ไม่อนาคต', () => {
  assert.equal(machineAddError(ok(), ctx()), null);
});

test('fail-closed — ไม่ส่งบริบทมา = ปฏิเสธ', () => {
  assert.match(machineAddError(ok(), {}), /ไม่มีสิทธิ์/);
});

/* ⭐ สีผูกกับรุ่น (มติผู้ใช้) — เครื่องกดสบู่มีขาวอย่างเดียว จึงเลือกดำไม่ได้ */
test('⭐ สีต้องเป็นสีที่รุ่นนั้นมีจริง', () => {
  assert.match(machineAddError(ok({ colour: 'เงิน' }), ctx()), /ไม่มีสี "เงิน"/);
  assert.match(machineAddError(ok({ colour: '' }), ctx()), /ต้องเลือกสี/);
});

test('รุ่นที่ไม่แยกสี = ห้ามมีสี ไม่ใช่ใส่อะไรก็ได้', () => {
  const plain = { ...MODEL, colours: [] };
  assert.equal(machineAddError(ok({ colour: '' }), ctx({ model: plain })), null);
  assert.match(machineAddError(ok({ colour: 'ขาว' }), ctx({ model: plain })), /ไม่ได้แยกสี/);
});

test('รุ่นที่ปิดใช้งานเลือกไม่ได้ — แต่บอกทางไปเปิด', () => {
  const off = { ...MODEL, isActive: false };
  assert.match(machineAddError(ok(), ctx({ model: off })), /ปิดใช้งาน.*หน้าตั้งค่า/);
});

test('ชนิดต้องตรงกับรุ่น — เส้นที่ยิง API ตรงไม่ได้เดินผ่านฟอร์มที่กรองให้', () => {
  assert.match(machineAddError(ok({ kind: 'soap' }), ctx()), /ชนิดกับรุ่นไม่ตรงกัน/);
});

/* 🔴 วันที่ในอนาคตทำให้ได้รหัสของเดือนที่ยังมาไม่ถึง ซึ่งแก้ทีหลังไม่ได้ */
test('🔴 รับเข้าในอนาคตไม่ได้ — รหัสแก้ทีหลังไม่ได้', () => {
  assert.match(machineAddError(ok({ receivedAt: '2026-09-06' }), ctx()), /อนาคต/);
  assert.equal(machineAddError(ok({ receivedAt: TODAY }), ctx()), null, 'วันนี้ต้องผ่าน');
});

// ── ที่อยู่ตามสถานะ (มติผู้ใช้ 2026-09-03 · CHECK ของ mig 0344) ────────────

test('⭐ ว่าง = ต้องไม่มีไซต์ · ใช้งานอยู่ = ต้องมี · ซ่อม = มีหรือไม่มีก็ได้', () => {
  assert.deepEqual(SITE_RULE_BY_STATUS, { in_stock: 'none', active: 'required', repair: 'optional' });

  assert.equal(machineAddError(ok({ status: 'in_stock' }), ctx()), null);
  assert.match(machineAddError(ok({ status: 'in_stock', siteId: 'S1' }), ctx({ site: SITE })),
    /ไม่ต้องระบุไซต์/);

  assert.match(machineAddError(ok({ status: 'active' }), ctx()), /ต้องระบุไซต์/);
  assert.equal(machineAddError(ok({ status: 'active', siteId: 'S1' }), ctx({ site: SITE })), null);

  assert.equal(machineAddError(ok({ status: 'repair' }), ctx()), null);
  assert.equal(machineAddError(ok({ status: 'repair', siteId: 'S1' }), ctx({ site: SITE })), null);
});

/* ⚠️ ตอบเป็นภาษาคน ไม่ใช่ปล่อยให้ trigger ของ mig 0332 โยน error ฐานข้อมูลออกไปที่จอ
   (เคยเป็นบั๊ก UAT 2026-09-02 มาแล้ว) */
test('⚠️ ใช้งานอยู่ในไซต์ประเภทคลังไม่ได้ — ตอบก่อนถึง trigger', () => {
  const wh = { ...SITE, kind: 'warehouse', name: 'คลังเครื่อง' };
  assert.match(machineAddError(ok({ status: 'active', siteId: 'S1' }), ctx({ site: wh })),
    /คลัง ไม่ใช่หน้างานลูกค้า/);
});

test('ปลดระวางไม่อยู่ในตัวเลือกตอนเพิ่ม — มันเป็น action ที่หน้ารายละเอียด', () => {
  assert.deepEqual(MACHINE_ADD_STATUSES, ['in_stock', 'active', 'repair']);
  assert.match(machineAddError(ok({ status: 'removed' }), ctx()), /สถานะการใช้งานไม่ถูกต้อง/);
});

/* ⭐ "เสีย" เป็นสวิตช์แยก ติ๊กได้ทุกสถานะ — ตรงกับสองแกนที่ mig 0332 สร้างไว้
   ⇒ เครื่องที่เสียแต่ยังตั้งอยู่ที่ลูกค้าอ่านได้ว่า "ใช้งานอยู่ · เสีย" */
test('⭐ สวิตช์ "เครื่องเสีย" ติ๊กได้ทุกสถานะ และไม่เกี่ยวกับที่อยู่', () => {
  for (const status of MACHINE_ADD_STATUSES) {
    const site = status === 'active' ? SITE : null;
    const input = ok({ status, broken: true, siteId: site ? 'S1' : '' });
    assert.equal(machineAddError(input, ctx({ site })), null, `${status} + เสีย ต้องผ่าน`);
    assert.equal(machineRow(input, { model: MODEL, site }).condition, 'broken');
  }
});

// ── แถวที่จะ insert ───────────────────────────────────────────────────────

test('แถว: ว่าง = ไม่มีไซต์/โซน · ใช้งานอยู่ = มีไซต์ และวันติดตั้ง = วันรับเข้า', () => {
  const free = machineRow(ok({ status: 'in_stock', zoneId: 'Z9' }), { model: MODEL, site: null });
  assert.equal(free.siteId, null);
  assert.equal(free.zoneId, null, 'ไม่มีไซต์แล้วต้องไม่มีโซนติดมาด้วย');
  assert.equal(free.installedAt, null);

  const live = machineRow(ok({ status: 'active', siteId: 'S1', zoneId: 'Z1' }), { model: MODEL, site: SITE });
  assert.equal(live.siteId, 'S1');
  assert.equal(live.zoneId, 'Z1');
  assert.equal(live.installedAt, TODAY);
});

/* ⚠️ `serial` = เบอร์จากโรงงาน · `code` = รหัสที่ระบบออกให้ — คนละช่อง (มติ 2026-09-05)
   และ `code` ต้องไม่อยู่ในแถวที่ส่งเข้า RPC เพราะ RPC เขียนทับเสมอ */
test('⚠️ แถวไม่มี serial และไม่มี code — code มาจากตัวออกเลขกลาง', () => {
  const row = machineRow(ok(), { model: MODEL, site: null });
  assert.equal(row.serial, undefined);
  assert.equal(row.code, undefined);
  assert.equal(row.modelId, 'M1');
  assert.equal(row.model, 'OV-08', 'สำเนาชื่อรุ่นบนแถว — จอ/ตัวค้นอ่านช่องนี้อยู่แล้ว');
});

// ── "เพิ่มอีกตัว" ─────────────────────────────────────────────────────────

/* ⭐ หนึ่งครั้ง = หนึ่งเครื่อง · รับของล็อตเดียวกันใช้ปุ่มนี้ (มติผู้ใช้: เอาจำนวนออก) */
test('⭐ "เพิ่มอีกตัว" คงชนิด/รุ่น/สี/วันที่ — แต่ล้างสถานะและที่อยู่', () => {
  const prev = ok({ status: 'active', siteId: 'S1', zoneId: 'Z1', note: 'ล็อตแรก', broken: true });
  const next = machineAddCarryOver(prev, TODAY);
  assert.equal(next.modelId, 'M1');
  assert.equal(next.colour, 'ขาว');
  assert.equal(next.receivedAt, TODAY);
  assert.equal(next.kind, 'diffuser');
  // ⚠️ ที่อยู่ไม่คงไว้ — ล็อตเดียวกันไม่จำเป็นต้องไปติดตั้งที่เดียวกัน
  assert.equal(next.status, 'in_stock');
  assert.equal(next.siteId, '');
  assert.equal(next.zoneId, '');
  assert.equal(next.note, '');
  assert.equal(next.broken, false);
});

test('ไม่มีช่องจำนวน — ฟอร์มตั้งต้นไม่มีคีย์ qty/count', () => {
  const form = machineAddDefaults(TODAY);
  assert.equal(form.qty, undefined);
  assert.equal(form.count, undefined);
});

// ── ป้ายสามคำ ─────────────────────────────────────────────────────────────

test('⭐ ป้ายเปลี่ยนคำตามที่ผู้ใช้เรียก — ค่าในฐานเหมือนเดิม', () => {
  assert.equal(ASSET_STATUS_LABELS.in_stock, 'ว่าง');
  assert.equal(ASSET_STATUS_LABELS.active, 'ใช้งานอยู่');
  assert.equal(ASSET_STATUS_LABELS.repair, 'ซ่อม');
  assert.equal(ASSET_STATUS_LABELS.removed, 'ปลดระวาง');
});

// ── ยามที่ผูกกับ migration และ route (รูที่เทสต์ฟังก์ชันมองไม่เห็น) ────────

/* 🐞 **บทเรียนจากงานสัญญา (2026-09-03)**: ฟังก์ชันถูกหมด แต่ route ไม่ได้ส่งของที่
   ต้องใช้เข้าไป ⇒ ของจริงพัง ทั้งที่เทสต์เขียว · ยามพวกนี้จึงผูกกับ **ซอร์สจริง** */
test('🐞 migration ต้องเพิ่ม scope MC และคอลัมน์ code พร้อมกันในใบเดียว', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0344_service_machine_registry.sql', import.meta.url), 'utf8');
  assert.match(sql, /WHEN 'MC' THEN 'service_assets'/,
    'ไม่มี scope = RPC โยน entity_scope_unknown');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS code text/,
    'มี scope แต่ไม่มีคอลัมน์ code = รหัสหายเงียบ แต่ตัวนับเดินไปแล้ว (เลขหายถาวร)');
  assert.match(sql, /INSERT INTO public\.entity_number_counters[\s\S]*'MC', '-'/,
    'ต้อง seed ถังนับ — fallback ของ RPC นับเฉพาะภายใน prefix เดียว จะชนเลขที่ออกไปแล้ว');
  assert.match(sql, /GREATEST/, 'seed ต้องใช้ GREATEST — trigger 0241 ห้ามตัวนับถอยหลัง');
  assert.match(sql, /ALTER COLUMN "siteId" DROP NOT NULL/,
    'เครื่องสถานะ "ว่าง" ต้องไม่มีไซต์');
});

test('🐞 route เพิ่มเครื่องต้องเรียกด่านตัวเดียวกับจอ และออกรหัสพร้อม insert', () => {
  const route = readFileSync(new URL('../../app/api/service/assets/route.js', import.meta.url), 'utf8');
  assert.match(route, /machineAddError\(/, 'ต้องใช้ด่านตัวเดียวกับจอ ไม่ใช่เขียนเงื่อนไขซ้ำ');
  assert.match(route, /insertRowWithComposedCode\(/,
    'รหัสต้องออกพร้อม insert ในทรานแซกชันเดียว — จองเลขแยกแล้ว insert ล้ม = เลขข้าม');
  assert.match(route, /findAssetModel\(/, 'ด่านต้องตัดสินจากแถวรุ่นจริง ไม่ใช่ id ที่ client ส่งมา');
});
