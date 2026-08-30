// ── อ่านชีตเก่าเป็นร่าง (F-8) ──────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_FIELDS, MAX_ASSETS_PER_ROW, buildDraft, buildDrafts, matchHeaders } from './importSheet.js';
import { nameKey } from './importValues.js';

const headers = ['ลูกค้า', 'ชื่อไซต์', 'โซน', 'จำนวนเครื่อง', 'กลิ่น', 'พ่น/พัก', 'เกรด', 'วันติดตั้ง', 'ลิตร/เดือน', 'Pkg STD', 'Pkg SM'];
const { map } = matchHeaders(headers);
const row = (values) => {
  const cells = new Array(headers.length).fill('');
  Object.entries(values).forEach(([header, value]) => { cells[headers.indexOf(header)] = value; });
  return cells;
};

// ── จับหัวตาราง ──────────────────────────────────────────────────────────
test('หัวตารางจับด้วยชื่อ ไม่ใช่ตำแหน่ง — สลับคอลัมน์แล้วยังถูก', () => {
  const swapped = matchHeaders(['ชื่อไซต์', 'ลูกค้า']);
  assert.equal(swapped.map.customerName, 1);
  assert.equal(swapped.map.siteName, 0);
  assert.deepEqual(swapped.missingRequired, []);
});

test('⭐ หัวที่ไม่รู้จักต้องรายงาน ไม่เงียบ', () => {
  const result = matchHeaders(['ลูกค้า', 'ชื่อไซต์', 'คอลัมน์ประหลาด']);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].header, 'คอลัมน์ประหลาด');
});

test('⭐ หัวซ้ำสองคอลัมน์ยึดตัวแรก แล้วรายงานตัวที่สอง — ห้ามเดาว่าตัวไหนจริง', () => {
  const result = matchHeaders(['ลูกค้า', 'ชื่อไซต์', 'สาขา']);
  assert.equal(result.map.siteName, 1);
  assert.equal(result.unmatched[0].duplicateOf, 'siteName');
});

test('ขาดคอลัมน์บังคับต้องบอกชื่อคอลัมน์ที่ขาด', () => {
  assert.deepEqual(matchHeaders(['ชื่อไซต์']).missingRequired, ['ลูกค้า']);
});

test('🔴 คอลัมน์ที่ตั้งใจไม่นำเข้าแยกจาก “ไม่รู้จัก” และบอกเหตุผล', () => {
  const result = matchHeaders(['ลูกค้า', 'ชื่อไซต์', 'ระยะเวลา (ปี)']);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.ignored.length, 1);
  assert.match(result.ignored[0].reason, /คำนวณจากวันที่/);
});

test('ไม่มีช่องไหนใน IMPORT_FIELDS ที่ alias ชนกันข้ามช่อง', () => {
  const seen = new Map();
  for (const field of IMPORT_FIELDS) {
    for (const alias of [field.label, ...field.aliases]) {
      const key = nameKey(alias);
      const owner = seen.get(key);
      assert.equal(owner === undefined || owner === field.key, true,
        `alias “${alias}” ชนกันระหว่าง ${owner} กับ ${field.key}`);
      seen.set(key, field.key);
    }
  }
});

// ── แตกแถวเครื่อง ────────────────────────────────────────────────────────
test('⭐ diffuser 8 เครื่อง = 8 แถว (มติสี่หน่วย §2A.1)', () => {
  const draft = buildDraft(row({ 'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'จำนวนเครื่อง': '8' }), map);
  assert.equal(draft.assets.length, 8);
  assert.equal(draft.assets[0].label, 'เครื่องที่ 1');
  assert.equal(draft.assets[7].kind, 'diffuser');
});

test('⭐ ชนิดที่ไม่ใช่เครื่อง = 1 แถว + จำนวนจุด (242 แถวคือขยะ)', () => {
  const headers2 = [...headers, 'ชนิดอุปกรณ์'];
  const { map: map2 } = matchHeaders(headers2);
  const cells = new Array(headers2.length).fill('');
  cells[headers2.indexOf('ลูกค้า')] = 'AWC';
  cells[headers2.indexOf('ชื่อไซต์')] = 'Empire Tower';
  cells[headers2.indexOf('ชนิดอุปกรณ์')] = 'เครื่องกดสบู่';
  cells[headers2.indexOf('จำนวนเครื่อง')] = '242';
  const draft = buildDraft(cells, map2);
  assert.equal(draft.assets.length, 1);
  assert.equal(draft.assets[0].kind, 'soap');
  assert.equal(draft.assets[0].qty, 242);
});

test('⭐ diffuser เกินเพดานต่อบรรทัดตกรายงาน ไม่แตกเป็นขยะ', () => {
  const draft = buildDraft(row({ 'ลูกค้า': 'AWC', 'ชื่อไซต์': 'Empire', 'จำนวนเครื่อง': '242' }), map);
  assert.equal(draft.assets.length, 0);
  assert.match(draft.issues[0].message, new RegExp(String(MAX_ASSETS_PER_ROW)));
});

test('⭐ “รอติดตั้ง” สร้างไซต์/โซนแต่ไม่สร้างเครื่อง', () => {
  const draft = buildDraft(row({ 'ลูกค้า': 'CP LAND', 'ชื่อไซต์': 'ทัสคานี', 'จำนวนเครื่อง': 'รอติดตั้ง' }), map);
  assert.equal(draft.assets.length, 0);
  assert.equal(draft.site.name, 'ทัสคานี');
  assert.match(draft.issues[0].message, /รอติดตั้ง/);
});

test('ค่าตั้งเครื่องเข้า settings เฉพาะ diffuser', () => {
  const draft = buildDraft(row({
    'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'จำนวนเครื่อง': '1',
    'พ่น/พัก': '30/225', 'เกรด': 'Grade 5', 'กลิ่น': 'A Breath of Dream',
  }), map);
  assert.deepEqual(draft.assets[0].settings, { workSec: 30, pauseSec: 225, grade: 'Grade 5' });
  assert.equal(draft.assets[0].productName, 'A Breath of Dream');
});

test('⭐ ซีเรียลเดียวกับหลายเครื่องตกรายงาน — ห้ามก๊อปซีเรียลลง 8 แถว', () => {
  const headers2 = [...headers, 'ซีเรียล'];
  const { map: map2 } = matchHeaders(headers2);
  const cells = new Array(headers2.length).fill('');
  cells[headers2.indexOf('ลูกค้า')] = 'X';
  cells[headers2.indexOf('ชื่อไซต์')] = 'Y';
  cells[headers2.indexOf('จำนวนเครื่อง')] = '3';
  cells[headers2.indexOf('ซีเรียล')] = 'SN-001';
  const draft = buildDraft(cells, map2);
  assert.equal(draft.assets.every((asset) => asset.serial === null), true);
  assert.match(draft.issues.map((i) => i.message).join(' '), /ซีเรียล/);
});

// ── ค่าที่ติดมากับรายงาน ─────────────────────────────────────────────────
test('⭐ แพ็ค/ลิตร ไม่ลงฐาน แต่ต้องติดมากับผล (term ต้องมีใบสั่งขาย)', () => {
  const draft = buildDraft(row({
    'ลูกค้า': 'Jim Thompson', 'ชื่อไซต์': 'Outlet 93', 'จำนวนเครื่อง': '6',
    'ลิตร/เดือน': '3', 'Pkg STD': '3', 'Pkg SM': '0',
  }), map);
  assert.equal(draft.carried.packs, 3);
  assert.equal(draft.carried.mlPerMonth, 3000);
  assert.equal(Object.hasOwn(draft.assets[0], 'packageQty'), false, 'แพ็คห้ามหลุดไปอยู่บนเครื่อง');
});

test('ลิตร/เดือนที่แปลงไม่ได้ติดค่าดิบมาด้วย', () => {
  const draft = buildDraft(row({ 'ลูกค้า': 'CASTLE BLACK', 'ชื่อไซต์': 'สาขา 1', 'ลิตร/เดือน': '2 KG' }), map);
  assert.equal(draft.carried.mlPerMonth, null);
  assert.equal(draft.carried.mlPerMonthRaw, '2 KG');
});

// ── ทั้งชีต ──────────────────────────────────────────────────────────────
test('แถวว่างล้วนถูกข้าม และเลขแถวยังตรงกับไฟล์จริง', () => {
  const drafts = buildDrafts([
    row({ 'ลูกค้า': 'A', 'ชื่อไซต์': 'S1' }),
    new Array(headers.length).fill(''),
    row({ 'ลูกค้า': 'B', 'ชื่อไซต์': 'S2' }),
  ], map);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map((d) => d.rowNumber), [2, 4]);
});

// ── จังหวัด + ชั้น (mig 0315) ─────────────────────────────────────────────
//
// ⭐ สองช่องนี้กลายเป็น **ส่วนหนึ่งของรหัส** — ไซต์ใหม่ต้องมีจังหวัด · โซนใหม่ต้องมีชั้น
// ⚠️ ชีตเก่ามีคอลัมน์ "ชั้น" อยู่แล้วแต่เดิมลงที่ *เครื่อง* อย่างเดียว ⇒ ตั้งแต่ 0315
//    เซลล์เดียวกันเดินไปสองที่ (ชั้นของโซน กับ ชั้นที่เจ้าหน้าที่จดไว้ที่เครื่อง)
const geoHeaders = [...headers, 'จังหวัด', 'ชั้น'];
const geoMap = matchHeaders(geoHeaders).map;
const geoRow = (values) => {
  const cells = new Array(geoHeaders.length).fill('');
  Object.entries(values).forEach(([header, value]) => { cells[geoHeaders.indexOf(header)] = value; });
  return cells;
};

test('⭐ คอลัมน์จังหวัดถูกจับและเดินทางไปถึงร่างของไซต์', () => {
  const draft = buildDraft(geoRow({
    ลูกค้า: 'บริษัท ก', ชื่อไซต์: 'สาขาเชียงใหม่', จังหวัด: 'เชียงใหม่',
  }), geoMap, 2);
  assert.equal(draft.site.province, 'เชียงใหม่');
});

test('⭐ ชั้นเดินไปทั้งโซนและเครื่อง — เซลล์เดียว สองปลายทาง', () => {
  const draft = buildDraft(geoRow({
    ลูกค้า: 'บริษัท ก', ชื่อไซต์: 'สาขาสีลม', โซน: 'ล็อบบี้', ชั้น: 'G', จำนวนเครื่อง: '1',
  }), geoMap, 2);
  assert.equal(draft.zone.floor, 'G');
  // ⚠️ ที่เครื่องยังเก็บ **ข้อความดิบ** ตามที่ชีตเขียน (ของเก่า 380 จุดเก็บแบบนี้)
  //    ส่วนโซนจะถูก normalize เป็น 'GF' ตอนสร้างจริงใน importRepo
  assert.equal(draft.assets[0].floor, 'G');
});

test('ชีตที่ไม่มีคอลัมน์จังหวัด/ชั้น ยังอ่านได้ตามเดิม — ตกด่านตอนสร้าง ไม่ใช่ตอนอ่าน', () => {
  const draft = buildDraft(row({ ลูกค้า: 'บริษัท ก', ชื่อไซต์: 'สาขาเก่า', โซน: 'ล็อบบี้' }), map, 2);
  assert.equal(draft.site.province, null);
  assert.equal(draft.zone.floor, null);
  assert.deepEqual(draft.issues, []);
});
