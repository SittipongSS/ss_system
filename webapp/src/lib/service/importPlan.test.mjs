// ── วางแผนนำเข้า (F-8) ────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_ERROR, ROW_OK, ROW_SKIP, planImport, reportRows } from './importPlan.js';
import { buildDrafts, matchHeaders } from './importSheet.js';

/* ⚠️ **fixture ต้องเป็นไฟล์ที่นำเข้าได้จริง** — ชุดเดิมไม่มีคอลัมน์จังหวัด/ชั้นเลย
   ซึ่งแปลว่าทุกเทสต์ในไฟล์นี้ทดสอบบนไฟล์ที่ **สร้างไซต์ไม่ได้สักแถว** โดยไม่มีใครรู้
   (ด่านสองตัวนั้นอยู่ฝั่งลงมือ ไม่เคยถูกตรวจตอนวางแผน — คือรูที่ใบนี้ปิด) */
const headers = ['ลูกค้า', 'ชื่อไซต์', 'จังหวัด', 'โซน', 'ชั้น', 'จำนวนเครื่อง', 'ชนิดอุปกรณ์'];
const { map } = matchHeaders(headers);
/* ค่าตั้งต้นให้ครบพอสร้างได้ — เทสต์ที่จะทดสอบ *ด่าน* ค่อยเขียนทับเป็นค่าว่าง/ค่าผิด */
const FILLED = { 'จังหวัด': 'กรุงเทพมหานคร', 'ชั้น': '2' };
const sheet = (rows) => buildDrafts(
  rows.map((values) => headers.map((h) => ({ ...FILLED, ...values })[h] ?? '')), map,
);

const snapshot = {
  customers: [
    // ⚠️ ต้องมี `arCode` — รหัสไซต์ประกอบจากรหัสลูกค้า + จังหวัด
    { id: 'C1', name: 'Jim Thompson', arCode: 'AR-101' },
    { id: 'C2', name: 'CP LAND', arCode: 'AR-102' },
    { id: 'C3', name: 'ซ้ำ จำกัด', arCode: 'AR-103' },
    { id: 'C4', name: 'ซ้ำ จำกัด', arCode: 'AR-104' },
    // ลูกค้าที่มีแต่ชื่ออังกฤษ (ไทยว่าง) — เคยไม่เข้าดัชนีเลย
    { id: 'C5', name: null, nameEn: 'Aroma Global', arCode: 'AR-105' },
    // สองภาษาย่อยเป็นคีย์เดียวกัน — ต้องไม่ถูกนับสองรอบ
    { id: 'C6', name: 'DUFRY', nameEn: 'Dufry', arCode: 'AR-106' },
  ],
  sites: [{ id: 'S1', customerId: 'C1', code: 'SS-26080001', name: 'Outlet 93' }],
  zones: [{ id: 'Z1', siteId: 'S1', code: 'ZN-26080001', name: 'ชั้น 2' }],
  assets: [{ id: 'A1', siteId: 'S1', zoneId: 'Z1', kind: 'diffuser', status: 'active' }],
};

// ── ลูกค้า ───────────────────────────────────────────────────────────────
test('🔴 ลูกค้าที่ไม่มีในทะเบียนตกรายงาน — ไฟล์ Excel ห้ามงอกลูกค้าใหม่', () => {
  const { rows } = planImport(sheet([{ 'ลูกค้า': 'ลูกค้าใหม่ไม่เคยมี', 'ชื่อไซต์': 'สาขา 1' }]), snapshot);
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /ไม่พบลูกค้า/);
});

test('⭐ ชื่อลูกค้าตรงหลายรายต้องหยุด ไม่ใช่หยิบตัวแรก', () => {
  const { rows } = planImport(sheet([{ 'ลูกค้า': 'ซ้ำ จำกัด', 'ชื่อไซต์': 'สาขา 1' }]), snapshot);
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /2 ราย/);
});

test('ชื่อลูกค้าเทียบข้ามวงเล็บ/ช่องว่างได้', () => {
  const { rows } = planImport(sheet([{ 'ลูกค้า': ' jim  thompson ', 'ชื่อไซต์': 'สาขาใหม่' }]), snapshot);
  assert.equal(rows[0].status, ROW_OK);
  assert.equal(rows[0].site.customerId, 'C1');
});

test('🔴 ลูกค้าที่มีแต่ชื่ออังกฤษต้องค้นเจอ — ไม่ใช่ตก “ไม่พบลูกค้า”', () => {
  const { rows } = planImport(sheet([{ 'ลูกค้า': 'Aroma Global', 'ชื่อไซต์': 'สาขาใหม่' }]), snapshot);
  assert.equal(rows[0].status, ROW_OK);
  assert.equal(rows[0].site.customerId, 'C5');
});

test('🪤 ชื่อสองภาษาย่อยเป็นคีย์เดียวกัน ต้องไม่ขึ้น “ตรงกับทะเบียน 2 ราย” หลอก', () => {
  const { rows } = planImport(sheet([{ 'ลูกค้า': 'Dufry', 'ชื่อไซต์': 'สาขาใหม่' }]), snapshot);
  assert.equal(rows[0].status, ROW_OK);
  assert.equal(rows[0].site.customerId, 'C6');
});

// ── ไม่สร้างซ้ำ (รันซ้ำได้) ───────────────────────────────────────────────
test('⭐ ไซต์/โซน/เครื่องที่มีอยู่แล้ว = skip ไม่ใช่สร้างซ้อน', () => {
  const { rows, summary } = planImport(
    sheet([{ 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'โซน': 'ชั้น 2', 'จำนวนเครื่อง': '2' }]),
    snapshot,
  );
  assert.equal(rows[0].status, ROW_SKIP);
  assert.equal(rows[0].site.action, 'use');
  assert.equal(rows[0].zone.action, 'use');
  assert.equal(rows[0].assets.length, 0);
  assert.deepEqual(rows[0].skippedAssets, [{ kind: 'diffuser', wanted: 2, already: 1 }]);
  assert.deepEqual(
    { newSites: summary.newSites, newZones: summary.newZones, newAssets: summary.newAssets },
    { newSites: 0, newZones: 0, newAssets: 0 },
  );
});

test('⭐ รันไฟล์เดิมซ้ำหลังนำเข้าแล้ว ต้องไม่มีอะไรให้สร้างอีก', () => {
  const rowsIn = sheet([{ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'ทัสคานี', 'โซน': 'Lobby', 'จำนวนเครื่อง': '2' }]);
  const first = planImport(rowsIn, snapshot);
  assert.equal(first.summary.newSites, 1);
  assert.equal(first.summary.newAssets, 2);

  // จำลองว่านำเข้าไปแล้ว
  const after = {
    ...snapshot,
    sites: [...snapshot.sites, { id: 'S2', customerId: 'C2', name: 'ทัสคานี' }],
    zones: [...snapshot.zones, { id: 'Z2', siteId: 'S2', name: 'Lobby' }],
    assets: [
      ...snapshot.assets,
      { id: 'A2', siteId: 'S2', zoneId: 'Z2', kind: 'diffuser', status: 'active' },
      { id: 'A3', siteId: 'S2', zoneId: 'Z2', kind: 'diffuser', status: 'active' },
    ],
  };
  const second = planImport(rowsIn, after);
  assert.equal(second.rows[0].status, ROW_SKIP);
  assert.deepEqual(
    { s: second.summary.newSites, z: second.summary.newZones, a: second.summary.newAssets },
    { s: 0, z: 0, a: 0 },
  );
});

test('⭐ สองแถวของไซต์เดียวกันในไฟล์เดียว สร้างไซต์ใบเดียว', () => {
  const { rows, summary } = planImport(sheet([
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'ทัสคานี', 'โซน': 'ชั้น 1', 'จำนวนเครื่อง': '1' },
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'ทัสคานี', 'โซน': 'ชั้น 2', 'จำนวนเครื่อง': '1' },
  ]), snapshot);
  assert.equal(summary.newSites, 1);
  assert.equal(summary.newZones, 2);
  assert.equal(summary.newAssets, 2);
  assert.equal(rows[1].site.action, 'reuse-new');
  assert.equal(rows[1].site.ref, rows[0].site.ref);
});

test('เครื่องที่ถอดออกแล้วไม่นับเป็น "มีอยู่แล้ว"', () => {
  const removed = { ...snapshot, assets: [{ id: 'A1', siteId: 'S1', zoneId: 'Z1', kind: 'diffuser', status: 'removed' }] };
  const { rows } = planImport(
    sheet([{ 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'โซน': 'ชั้น 2', 'จำนวนเครื่อง': '2' }]),
    removed,
  );
  assert.equal(rows[0].assets.length, 2);
});

test('⭐ ชนิดต่างกันในโซนเดียวกันไม่บังกันเอง', () => {
  const { rows } = planImport(
    sheet([{ 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'โซน': 'ชั้น 2', 'ชนิดอุปกรณ์': 'เครื่องกดสบู่', 'จำนวนเครื่อง': '10' }]),
    snapshot,
  );
  assert.equal(rows[0].status, ROW_OK, 'มี diffuser อยู่แล้วไม่ควรบัง soap');
  assert.equal(rows[0].assets[0].kind, 'soap');
});

// ── รายงาน ───────────────────────────────────────────────────────────────
test('⭐ รายงานครอบทั้งแถวที่นำเข้าไม่ได้ และแถวที่เข้าได้แต่มีของตกหล่น', () => {
  const { rows } = planImport(sheet([
    { 'ลูกค้า': 'ไม่มีในทะเบียน', 'ชื่อไซต์': 'X' },
    { 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'โซน': 'ชั้น 2', 'จำนวนเครื่อง': '2' },
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาใหม่', 'จำนวนเครื่อง': '1' },
  ]), snapshot);
  const report = reportRows(rows);
  assert.deepEqual(report.map((r) => r.rowNumber), [2, 3]);
  assert.match(report[0].problems[0], /ไม่พบลูกค้า/);
  assert.match(report[1].problems[0], /อยู่แล้ว/);
});

test('เลขแถวในผลตรงกับเลขแถวในไฟล์เสมอ', () => {
  const { rows } = planImport(sheet([
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'A' },
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'B' },
  ]), snapshot);
  assert.deepEqual(rows.map((r) => r.rowNumber), [2, 3]);
});

// ── จังหวัด/ชั้น เดินทางถึงแผน (mig 0315) ────────────────────────────────
//
// ⭐ ค่าต้อง **ไม่หาย** ระหว่างทาง — และตั้งแต่ 08/09/2026 ตัววางแผนก็ **ตัดสินด้วย**
//    ว่าค่าใช้ได้ไหม (ดูบล็อก "ของที่ต้องมีถึงจะสร้างได้" ข้างล่าง)
//    🐞 เดิมด่านอยู่ฝั่งลงมืออย่างเดียว ⇒ พรีวิวบอก "จะสร้างไซต์ 145" แล้วสร้างได้ 0
//    ⚠️ ด่านฝั่งลงมือยังอยู่ต่อในฐานะตาข่ายชั้นสอง — `normalizeFloor` ที่นั่นไม่ได้เป็น
//       แค่ด่าน มันคือค่าที่เขียนลงคอลัมน์ `floor` จริง ('G' → 'GF')
const geoHeaders = ['ลูกค้า', 'ชื่อไซต์', 'โซน', 'จังหวัด', 'ชั้น'];
const geoMap = matchHeaders(geoHeaders).map;
const geoSheet = (rows) => buildDrafts(rows.map((v) => geoHeaders.map((h) => v[h] ?? '')), geoMap);

test('⭐ จังหวัดและชั้นเดินทางเข้าแผนของไซต์/โซนที่จะสร้าง', () => {
  const { rows } = planImport(geoSheet([
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาเชียงใหม่', 'โซน': 'ล็อบบี้', 'จังหวัด': 'เชียงใหม่', 'ชั้น': 'G' },
  ]), snapshot);
  assert.equal(rows[0].site.action, 'create');
  assert.equal(rows[0].site.province, 'เชียงใหม่');
  assert.equal(rows[0].zone.action, 'create');
  assert.equal(rows[0].zone.floor, 'G');
});

test('ไซต์ที่มีอยู่แล้วไม่ต้องมีจังหวัด — ไม่ได้สร้างใหม่จึงไม่ต้องออกรหัส', () => {
  const { rows } = planImport(geoSheet([
    { 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'โซน': 'โซนใหม่', 'ชั้น': '4' },
  ]), snapshot);
  assert.equal(rows[0].site.action, 'use');
  assert.equal(rows[0].zone.action, 'create');
  assert.equal(rows[0].zone.floor, '4');
});

/* ══ ด่านของแถวที่ "จะสร้าง" — ปิดรูที่พรีวิวเคยตาบอด ═══════════════════ */

/* 🐞 เคสที่เจ็บที่สุด: จังหวัดถูก แต่ชีตไม่มีคอลัมน์ชั้น ⇒ ของเดิมได้ **ไซต์เปล่าค้าง
   ในทะเบียนทั้งกอง · โซน 0 · เครื่อง 0** ไม่ใช่ล้มทั้งยวงให้รู้ตัว */
test('🔴 ไม่มีจังหวัด = แถวออกเป็นรายงานตั้งแต่พรีวิว ไม่ใช่ไปตายตอนกดยืนยัน', () => {
  const { rows, summary } = planImport(
    sheet([{ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาใหม่', 'จังหวัด': '', 'โซน': 'ล็อบบี้' }]),
    snapshot,
  );
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /ชีตไม่มีจังหวัด/);
  assert.equal(summary.newSites, 0, 'ตัวนับต้องไม่สัญญาของที่สร้างไม่ได้');
  assert.equal(summary.newZones, 0);
});

test('🔴 จังหวัดสะกดไม่ตรงทะเบียน ต้องบอกว่าเป็นคนละเรื่องกับ "ไม่มีจังหวัด"', () => {
  const { rows } = planImport(
    sheet([{ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาใหม่', 'จังหวัด': 'กทม.' }]),
    snapshot,
  );
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /ไม่ตรงกับทะเบียนจังหวัด/);
});

test('🔴 ลูกค้าไม่มีรหัส AR ที่ใช้ได้ ต้องตกตั้งแต่พรีวิว', () => {
  const noAr = { ...snapshot, customers: [{ id: 'CX', name: 'ไม่มีรหัส', arCode: null }] };
  const { rows } = planImport(sheet([{ 'ลูกค้า': 'ไม่มีรหัส', 'ชื่อไซต์': 'สาขาใหม่' }]), noAr);
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /รหัสลูกค้า \(AR\)/);
});

/* ⚠️ 'G' truthy แต่ตกด่าน — เช็ก truthiness แทนตัวตัดสินจริงเมื่อไร พรีวิวจะบอกว่าผ่าน
   แล้วไปตายตอนสร้างอยู่ดี (เป็นรูเดิมคนละหน้า) */
test('🔴 ชั้นที่รูปไม่ถูกต้องตกด่าน — และต้องใช้ตัวตัดสินตัวเดียวกับตอนสร้าง', () => {
  const { rows } = planImport(
    sheet([{ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาใหม่', 'โซน': 'ล็อบบี้', 'ชั้น': 'ชั้นบนสุด' }]),
    snapshot,
  );
  assert.equal(rows[0].status, ROW_ERROR);
  assert.match(rows[0].blocking[0], /โซน “ล็อบบี้”/);
  // 'G' เป็นรูปที่ normalizeFloor รับได้ (→ GF) ⇒ ต้องผ่าน
  const ok = planImport(
    sheet([{ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาใหม่ 2', 'โซน': 'ล็อบบี้', 'ชั้น': 'G' }]),
    snapshot,
  );
  assert.equal(ok.rows[0].status, ROW_OK);
});

/* ⭐ ด่านผูกกับ `action === 'create'` เท่านั้น — แถวที่ใช้ของเดิมไม่ต้องมีค่าพวกนี้เลย */
test('ไซต์/โซนที่มีอยู่แล้ว ไม่ต้องผ่านด่านจังหวัด/ชั้น', () => {
  const { rows } = planImport(
    sheet([{ 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'จังหวัด': '', 'โซน': 'ชั้น 2', 'ชั้น': '', 'จำนวนเครื่อง': '5' }]),
    snapshot,
  );
  assert.notEqual(rows[0].status, ROW_ERROR);
  assert.equal(rows[0].site.action, 'use');
  assert.equal(rows[0].zone.action, 'use');
});

/* 🐞 บั๊กที่ด่านนี้ปิดไปด้วย: จังหวัดที่อยู่ **แถวที่สอง** ของไซต์เดียวกันเคยถูกทิ้งเงียบ
   เพราะแถวแรกจองสิทธิ์ไซต์ไปแล้วทั้งที่ตัวเองไม่มีจังหวัด ⇒ ทั้งไซต์สร้างไม่ได้ */
test('🐞 แถวแรกที่ไม่มีจังหวัด ต้องไม่กินสิทธิ์ไซต์ของแถวที่กรอกครบ', () => {
  const { rows, summary } = planImport(sheet([
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาร่วม', 'จังหวัด': '', 'โซน': 'ล็อบบี้' },
    { 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'สาขาร่วม', 'จังหวัด': 'เชียงใหม่', 'โซน': 'ชั้น 3' },
  ]), snapshot);
  assert.equal(rows[0].status, ROW_ERROR);
  assert.equal(rows[1].status, ROW_OK);
  assert.equal(rows[1].site.action, 'create');
  assert.equal(rows[1].site.province, 'เชียงใหม่');
  assert.equal(summary.newSites, 1, 'ไซต์ต้องยังถูกสร้างจากแถวที่กรอกครบ');
});
