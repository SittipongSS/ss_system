// ── เพิ่มไซต์ย้อนหลัง (มติผู้ใช้ 2026-09-11) — ตัววางแผน + ยามของทางเข้า ─────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEGACY_ZONE_MAX, legacyPlanCounts, legacyPlanMessage, planLegacySiteRow, planLegacyZones,
} from './legacySite.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');

/* ลูกค้า AR-0231 · กรุงเทพฯ (รหัสจังหวัด 10) — ชุดเดียวกับม็อก */
const CUSTOMER = { id: 'C1', arCode: 'AR-0231', name: 'บริษัท สยามพลาซ่า จำกัด' };
const SITE = { customerId: 'C1', name: 'สาขาพระราม 9 ชั้น G', provinceCode: '10', province: 'กรุงเทพมหานคร' };
const SITES = [
  { id: 'S3', code: 'ST-0231-01-BKK-1003', name: 'สาขาสีลม', isActive: true },
  { id: 'S4', code: 'ST-0231-01-BKK-1004', name: 'สำนักงานใหญ่ ชั้น 12', isActive: false },
];

/* ── ไซต์ ─────────────────────────────────────────────────────────────── */

test('ไซต์ครบ = ผ่าน · รหัสตรึงลูกค้า+ภาค+จังหวัด เลขรันออกตอนบันทึก', () => {
  const plan = planLegacySiteRow(SITE, { customer: CUSTOMER, customerSites: SITES });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.prefix, 'ST-0231-01-BKK-');
  assert.equal(plan.duplicate, null);
  assert.equal(plan.arMissing, false);
});

test('🔑 ค่าที่โมดัลไม่ให้เลือกถูกตรึง — ส่งอะไรมาก็ไม่เชื่อ', () => {
  const plan = planLegacySiteRow(
    { ...SITE, kind: 'warehouse', isActive: false, projectId: 'PJ-1' },
    { customer: CUSTOMER },
  );
  assert.equal(plan.value.kind, 'customer', 'คลังไม่เกิดจากทางนี้');
  assert.equal(plan.value.isActive, true, 'ของใหม่เริ่มที่เปิดใช้งานเสมอ (กฎ AGENTS.md)');
  assert.equal(plan.value.projectId, null, 'ของเก่าไม่เคยมีโครงการ');
});

test('🔴 ชื่อซ้ำในลูกค้าเดียวกัน — nameKey ของตัวนำเข้า + ตัดช่องว่าง ("สาขา สีลม" = "สาขาสีลม")', () => {
  const plan = planLegacySiteRow({ ...SITE, name: 'สาขา สีลม' }, { customer: CUSTOMER, customerSites: SITES });
  assert.equal(plan.duplicate?.id, 'S3');
  assert.match(plan.errors.join(' '), /มีไซต์ “สาขาสีลม” อยู่แล้ว/);
  assert.match(plan.errors.join(' '), /ST-0231-01-BKK-1003/, 'ต้องบอกรหัสไซต์เดิม — คนต้องไปเปิดใบนั้นได้');
});

test('ชื่อซ้ำกับไซต์ที่ปิดใช้งานก็นับ — เปิดใบเดิมกลับดีกว่ามีสองใบประวัติแยกร่าง', () => {
  const plan = planLegacySiteRow({ ...SITE, name: 'สำนักงานใหญ่ (ชั้น 12)' }, { customer: CUSTOMER, customerSites: SITES });
  assert.equal(plan.duplicate?.id, 'S4');
});

test('ชื่อที่ต่างกันจริงไม่ถูกนับซ้ำ — "สาขาสีลม 2" ไม่ใช่ "สาขาสีลม"', () => {
  const plan = planLegacySiteRow({ ...SITE, name: 'สาขาสีลม 2' }, { customer: CUSTOMER, customerSites: SITES });
  assert.equal(plan.duplicate, null);
  assert.deepEqual(plan.errors, []);
});

test('ลูกค้าไม่มีรหัส AR — บอกว่าไปแก้ที่ทะเบียนลูกค้า + ธงให้จอขึ้นป้ายเตือน', () => {
  const plan = planLegacySiteRow(SITE, { customer: { ...CUSTOMER, arCode: null } });
  assert.equal(plan.arMissing, true);
  assert.equal(plan.prefix, null);
  assert.match(plan.errors.join(' '), /ยังไม่มีรหัสลูกค้า \(AR\)/);
});

test('⭐ ไม่หยุดที่เหตุแรก — ชื่อว่าง + ไม่มี AR บอกครบในครั้งเดียว', () => {
  const plan = planLegacySiteRow({ ...SITE, name: '' }, { customer: { ...CUSTOMER, arCode: '' } });
  assert.equal(plan.errors.length, 2, plan.errors.join(' | '));
  assert.match(plan.errors[0], /ต้องระบุชื่อไซต์/);
  assert.match(plan.errors[1], /รหัสลูกค้า \(AR\)/);
  assert.equal(plan.value, null);
});

test('ยังไม่เลือกจังหวัด — ข้อความของตัวออกรหัส (บอกว่ารหัสประกอบจากจังหวัด)', () => {
  const plan = planLegacySiteRow({ ...SITE, provinceCode: '' }, { customer: CUSTOMER });
  assert.match(plan.errors.join(' '), /ต้องเลือกจังหวัด/);
});

test('ลูกค้าที่หาในทะเบียนไม่เจอ ≠ ยังไม่เลือกลูกค้า', () => {
  assert.match(planLegacySiteRow(SITE, { customer: null }).errors.join(' '), /ไม่พบลูกค้าในทะเบียน/);
  assert.match(planLegacySiteRow({ ...SITE, customerId: '' }, { customer: null }).errors.join(' '), /ต้องเลือกลูกค้า/);
});

/* ── โซน ─────────────────────────────────────────────────────────────── */

const zone = (over = {}) => ({ key: 'z1', name: 'ล็อบบี้', floor: 'G', building: '', note: '', spots: [], ...over });

test('โซนครบ = ผ่าน · ชั้นเป็นค่ามาตรฐาน · เริ่มที่ใช้งานเสมอ · key ของจอติดมาด้วย', () => {
  const { zones, errors } = planLegacyZones([zone({ isActive: false })]);
  assert.deepEqual(errors, []);
  assert.equal(zones[0].key, 'z1');
  assert.equal(zones[0].value.floor, 'GF');
  assert.equal(zones[0].value.isActive, true);
  assert.deepEqual(zones[0].value.spots, []);
});

test('จุดติดตั้ง: id ชั่วคราวของจอได้ id จริงจาก server · ชื่อว่างถูกตีกลับพร้อมชื่อโซน', () => {
  let n = 0;
  const makeSpotId = () => `SPT-${++n}`;
  const ok = planLegacyZones([zone({ spots: [{ id: 'new-1', label: 'ข้างประตู' }, { id: 'new-2', label: 'หลังเคาน์เตอร์', note: 'ผนังซ้าย' }] })], { makeSpotId });
  assert.deepEqual(ok.zones[0].value.spots.map((s) => s.id), ['SPT-1', 'SPT-2']);
  assert.equal(ok.zones[0].value.spots[1].note, 'ผนังซ้าย');

  const bad = planLegacyZones([zone({ spots: [{ id: 'new-1', label: '  ' }] })]);
  assert.match(bad.errors[0], /^โซนที่ 1 “ล็อบบี้”: จุดติดตั้งแถวที่ 1 ยังไม่มีชื่อ/);
});

test('🔴 ชื่อโซนซ้ำ — กับโซนที่ไซต์มีอยู่แล้ว และกันเองในฟอร์ม (บอกแถว ไม่ใช่ 23505 กลางทาง)', () => {
  const existing = [{ id: 'Z0', code: 'ZN-1005-GF-10001', name: 'ห้องน้ำ' }];
  const { errors, zones } = planLegacyZones(
    [zone({ key: 'a', name: 'ห้อง น้ำ' }), zone({ key: 'b', name: 'ล็อบบี้' }), zone({ key: 'c', name: 'ล็อบบี้ ' })],
    { existingZones: existing, siteCode: 'ST-0231-01-BKK-1005' },
  );
  assert.equal(errors.length, 2, errors.join(' | '));
  assert.match(errors[0], /มีอยู่แล้วในไซต์ \(ZN-1005-GF-10001\)/);
  assert.match(errors[1], /อยู่ในฟอร์มนี้แล้ว \(แถวที่ 2\)/);
  assert.deepEqual(zones.map((z) => z.key), ['b']);
});

test('ชื่อซ้ำถูกจับแม้แถวแรกมีเหตุอื่น — บอกครบในครั้งเดียว ไม่ใช่แก้ชั้นแล้วค่อยเจอว่าซ้ำ', () => {
  const { errors } = planLegacyZones([zone({ floor: '' }), zone({ key: 'z2', floor: '3' })]);
  assert.equal(errors.length, 2, errors.join(' | '));
  assert.match(errors[0], /^โซนที่ 1 “ล็อบบี้”: ต้องระบุชั้น/);
  assert.match(errors[1], /^โซนที่ 2 “ล็อบบี้”: ชื่อซ้ำกับโซนที่อยู่ในฟอร์มนี้แล้ว \(แถวที่ 1\)/);
});

test('โซนยังไม่มีชื่อ — ข้อความบอกลำดับแถวแทน', () => {
  const { errors } = planLegacyZones([zone(), zone({ key: 'z2', name: '', floor: '3' })]);
  assert.match(errors[0], /^โซนที่ 2: ต้องระบุชื่อโซน/);
});

test('โหมดเติมต่อ: ไซต์รหัสรูปเดิมออกรหัสโซนไม่ได้ — ตีกลับก่อนเขียน ไม่ใช่ล้มกลางทาง', () => {
  const { errors } = planLegacyZones([zone()], { siteCode: 'SS-26080001' });
  assert.match(errors[0], /ยังไม่มีรหัสรูปแบบใหม่/);
});

test(`กันฟอร์มวนสร้างผิด — เกิน ${LEGACY_ZONE_MAX} โซนต่อครั้งไม่รับ`, () => {
  const many = Array.from({ length: LEGACY_ZONE_MAX + 1 }, (_, i) => zone({ key: `k${i}`, name: `โซน ${i}` }));
  const { zones, errors } = planLegacyZones(many);
  assert.equal(zones.length, 0);
  assert.match(errors[0], /เกิน 60 โซน/);
});

test('ข้อความรวม + จำนวนสำหรับปุ่มบันทึก', () => {
  assert.equal(legacyPlanMessage([]), null);
  assert.equal(legacyPlanMessage(['ก']), 'ก');
  assert.equal(legacyPlanMessage(['ก', 'ข']), 'ยังบันทึกไม่ได้ 2 ข้อ — ก · ข');
  const { zones } = planLegacyZones([
    zone({ spots: [{ label: 'ก' }, { label: 'ข' }] }),
    zone({ key: 'z2', name: 'ห้องน้ำ', floor: 'B1', spots: [{ label: 'ค' }] }),
  ]);
  assert.deepEqual(legacyPlanCounts(zones), { zones: 2, spots: 3 });
});

/* ── ยามของทางเข้า ─────────────────────────────────────────────────────── */

const ROUTE = read('app/api/service/legacy-sites/route.js');
const MODAL = read('components/service/LegacySiteModal.js');

test('🔑 API ใช้สิทธิ์แก้งานบริการ (canEditService) — ตรงกับปุ่มบนจอ (มติข้อ B)', () => {
  assert.match(ROUTE, /requireService\(\{ user, edit: true \}\)/);
  const page = read('app/service/sites/page.js');
  assert.match(page, /\{canEdit && \(\s*<Button[^>]*onClick=\{\(\) => setLegacyOpen\(true\)\}/,
    'ปุ่มต้องอยู่หลัง canEdit — ไม่มีสิทธิ์ = ไม่เห็นปุ่ม (ด่านเขียน ⊆ ด่านอ่านของปุ่ม)');
});

test('🔑 ตัวตัดสินชุดเดียว: จอ · พรีวิว · ตอนบันทึก เรียก planLegacySiteRow/planLegacyZones ตัวเดียวกัน', () => {
  for (const src of [ROUTE, MODAL]) {
    assert.match(src, /planLegacySiteRow\(/);
    assert.match(src, /planLegacyZones\(/);
  }
});

test('🔴 พรีวิวคืนก่อนเขียนแถวแรก — บทเรียน #1685 (พรีวิวที่เขียนของไปแล้ว = ไม่ใช่พรีวิว)', () => {
  const previewAt = ROUTE.indexOf('if (preview)');
  const firstInsert = ROUTE.indexOf('insertRowWithComposedCode(\n');
  assert.ok(previewAt > 0 && firstInsert > 0);
  assert.ok(previewAt < firstInsert, 'if (preview) ต้องมาก่อน insert แรก');
});

test('🔴 ขอบเขตที่ผู้ใช้เคาะ: อ่านแค่ ไซต์ · โซน · จุด — ไม่แตะเครื่อง / ใบสั่งขาย / สัญญา / การจ่าย', () => {
  const fields = new Set([...ROUTE.matchAll(/\bbody\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...fields].sort(), ['preview', 'site', 'targetSiteId', 'zones']);
  for (const table of ['service_assets', 'service_zone_terms', 'sales_orders', 'contracts', 'service_plans']) {
    assert.ok(!ROUTE.includes(table), `route แตะ ${table} — อยู่นอกขอบเขตรอบนี้`);
  }
});

test('โหมดเติมต่อไม่สร้างไซต์ · ไซต์ใหม่ใช้ตัวออกรหัส SS · โซนใช้ ZN (ตัวนับไม่ถอย)', () => {
  assert.match(ROUTE, /scope: 'SS', bucket: SITE_RUN_BUCKET/);
  assert.match(ROUTE, /scope: 'ZN', bucket: ZONE_RUN_BUCKET/);
  assert.match(ROUTE, /if \(!target\) \{[\s\S]{0,900}insertRowWithComposedCode/);
});

test('บันทึกไม่ลองซ้ำอัตโนมัติ — POST ซ้ำ = ไซต์ซ้อน (กฎ apiFetch ของเส้นเขียน)', () => {
  const posts = [...MODAL.matchAll(/apiJson\("\/api\/service\/legacy-sites",\s*\{([\s\S]*?)\}\);/g)].map((m) => m[1]);
  assert.equal(posts.length, 2, 'พรีวิว + บันทึก');
  for (const body of posts) assert.doesNotMatch(body, /retry:\s*true/);
});

test('⭐ ฟอร์มสร้าง = ฟอร์มแก้: โมดัลย้อนหลังใช้ช่องชุดเดียวกับโมดัลไซต์/โซน', () => {
  assert.match(MODAL, /<ServiceSiteFields/);
  assert.match(MODAL, /<ServiceZoneFields/);
  assert.match(read('components/service/ServiceSiteModal.js'), /<ServiceSiteFields/);
  assert.match(read('components/service/ServiceZoneModal.js'), /<ServiceZoneFields/);
});

/* ── จากรอบ review (2026-09-11) ───────────────────────────────────────────── */

test('🔴 นับจุดเฉพาะที่ฐานคืนมา — ห้ามถอยไปนับที่ขอ (กรณีเดียวที่ไม่คืนคือจุดถูกทิ้ง)', () => {
  assert.doesNotMatch(ROUTE, /Array\.isArray\(data\.spots\) \? data\.spots\.length : zone\.value\.spots\.length/);
  assert.match(ROUTE, /const savedSpots = Array\.isArray\(data\.spots\) \? data\.spots\.length : 0;/);
});

test('🔴 ตรวจคอลัมน์ spots ก่อนเขียนแถวแรก — ตัวออกรหัสทิ้งคอลัมน์ที่ไม่มีเงียบ ๆ', () => {
  const check = ROUTE.indexOf('zoneSpotsColumnError(supabase)');
  const firstInsert = ROUTE.indexOf('insertRowWithComposedCode(\n');
  assert.ok(check > 0 && check < firstInsert, 'ต้องตรวจก่อน insert แรก');
  const zonePost = read('app/api/service/sites/[id]/zones/route.js');
  assert.ok(zonePost.indexOf('zoneSpotsColumnError(supabase)') < zonePost.indexOf('insertRowWithComposedCode('),
    'POST โซนทางปกติก็ต้องตรวจก่อนเขียน');
});

test('🔴 ไซต์ซ้ำจาก server ผูกกับลูกค้า+ชื่อที่ส่งไป — แก้สองช่องนี้แล้วต้องทิ้ง', () => {
  assert.match(MODAL, /useEffect\(\(\) => \{ setDuplicate\(null\); \}, \[form\.customerId, form\.name\]\);/);
});

test('โหมดเติมต่อตัดโซนที่ไซต์มีอยู่แล้วออกให้ — ทางกู้ของ "บันทึกแล้วเน็ตหลุด" ต้องไม่ตัน', () => {
  assert.match(MODAL, /const already = drafts\.filter\(\(z\) => z\.name\.trim\(\) && have\.has\(legacyNameKey\(z\.name\)\)\)/);
  assert.match(MODAL, /setZones\(pending\)/);
});

test('🐞 บันทึกแล้วหน้าทะเบียนรีโหลดแบบเงียบ + โมดัลอยู่นอก Workspace — จอผลต้องไม่หาย', () => {
  const page = read('app/service/sites/page.js');
  assert.match(page, /onSaved=\{\(\) => \{ load\(\{ silent: true \}\); \}\}/);
  assert.ok(page.indexOf('</Workspace>') < page.indexOf('<LegacySiteModal'),
    'LegacySiteModal ต้องอยู่หลัง </Workspace> — Workspace สลับ children เป็นโครงร่างตอน loading');
});

test('บันทึกก้อนเดียวกับที่ตรวจ — ขั้น ③ โชว์อะไร ลงฐานอย่างนั้น', () => {
  assert.match(MODAL, /setPreviewPayload\(snapshot\)/);
  assert.match(MODAL, /json: previewPayload \|\| payload\(\), fallbackError: "บันทึกไม่สำเร็จ"/);
});

test('ร่างอยู่ข้ามการปิด/เปิด · รายชื่อลูกค้าดึงใหม่ทุกครั้งที่เปิด (ออกรหัส AR แล้วกลับมาทำต่อได้)', () => {
  assert.match(MODAL, /useServiceSiteForm\(\{ open, resetOnOpen: false \}\)/);
  assert.match(MODAL, /\}, \[open, customersReload\]\);/);
  assert.doesNotMatch(MODAL, /if \(!open \|\| customers\.length\) return/);
});

/* ── รอบยืนยัน (review ของ commit ที่แก้) ─────────────────────────────────── */

test('🐞 ถอยออกจากโหมดเติมต่อ = คืนร่างโซนที่ตัดไปตอนเข้า (ไม่งั้นโซน+จุดที่คีย์ไว้หายถาวร)', () => {
  assert.match(MODAL, /setCutZones\(already\)/);
  assert.match(MODAL, /const leaveResume = \(\) => \{[\s\S]{0,200}setZones\(\(prev\) => \[\.\.\.prev, \.\.\.cutZones\]\)/);
});

test('ลิงก์ที่ออกจากหน้าระหว่างมีร่างเปิดแท็บใหม่ — ร่างอยู่ได้แค่ตลอดอายุหน้านี้', () => {
  for (const href of ['/service/sites/${siteDuplicate.id}', '/service/sites/${target.id}']) {
    const at = MODAL.indexOf(`href={\`${href}\`}`);
    assert.ok(at > 0, href);
    assert.match(MODAL.slice(at, at + 80), /target="_blank"/, `${href} ต้อง target="_blank"`);
  }
});

test('ชื่อโซนที่มีแต่เครื่องหมายก็ถูกเทียบซ้ำ — ไม่หลุดไปชน unique ของฐานกลางทาง', () => {
  const { errors } = planLegacyZones([zone({ name: '-', floor: 'G' }), zone({ key: 'z2', name: ' - ', floor: '1' })]);
  assert.equal(errors.length, 1, errors.join(' | '));
  assert.match(errors[0], /ชื่อซ้ำ/);
});

test('ด่านคอลัมน์จุดโทษ migration เฉพาะ 42703 · PATCH ถามเฉพาะเมื่อจอส่งจุดมา', () => {
  const repo = read('lib/service/sitesRepo.js');
  assert.match(repo, /error\.code === '42703'/);
  const patchRoute = read('app/api/service/sites/[id]/zones/[zoneId]/route.js');
  assert.match(patchRoute, /if \(body\.spots !== undefined\) \{\s*const schemaError = await zoneSpotsColumnError\(supabase\);/);
});
