// ── ตัวแกะ `.select(<expr>)` ของด่าน check:columns ──────────────────────────
//
// 🐞 บั๊กจริง (2026-09-23): ด่านจับเฉพาะ `.select('สตริง')` ⇒ `.select(REVISION_COLUMNS)`
// และเพื่อนอีก ~40 ชื่อหลุดเงียบสนิท — ไม่ถูกนับว่าข้ามด้วยซ้ำ · ของที่หลุดออกไปจริงคือ
// `orders.updatedAt` ใน `ORDER_SELECT_SLIM` ⇒ `/api/orders?slim=1` ตอบ 42703 ทั้งเส้น
// และคิวงานบนหน้า /tax ว่างเปล่าอยู่ 26 วันโดยไม่มีอะไรแดง
//
// เทสต์นี้ล็อกสองอย่างที่พังแล้วจะเงียบเหมือนเดิม:
//   1. ค่าคงที่ต้องถูกแกะออกมาเป็นชื่อคอลัมน์จริง (ไม่งั้นด่านกลับไปไม่ตรวจอะไรเลย)
//   2. ชื่อที่แกะไม่ได้ต้อง **ดัง** (blocked ไม่ว่าง) ไม่ใช่เงียบ — ความเงียบคือทั้งหมด
//      ของบั๊กครั้งนี้
// และสองกับดักที่ทำให้ด่าน "แดงผิด" จนคนปิดทิ้ง: เงื่อนไขของ ternary กับ object
// ตัวเลือกของ `.select('…', { count: 'exact' })` ต้องไม่กลายเป็นชื่อคอลัมน์
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnNamesOf, createSelectResolver, embeddedNames, firstArg } from '../../scripts/selectExpression.mjs';

/** แกะ expr ในบริบทของไฟล์ปลอม — `/*USE*​/` คือจุดที่ `.select()` อยู่ (ถ้าไม่ใส่ = ท้ายไฟล์) */
function resolveIn(files, entry, expr) {
  const src = files[entry];
  const marker = src.indexOf('/*USE*/');
  const resolveSelect = createSelectResolver({
    srcRoot: '/src',
    readSource: (f) => (f in files ? files[f] : null),
    label: (f) => f,
  });
  const r = resolveSelect(expr, { file: entry, src, at: marker < 0 ? src.length : marker });
  return { ...r, names: columnNamesOf(r.text) };
}

test('ค่าคงที่แบบ [...].join(", ") — เคสที่ทำให้บั๊ก 2026-09-23 หลุด', () => {
  const files = {
    '/src/lib/store.js': [
      "const REVISION_COLUMNS = [",
      "  'id', 'documentId', 'firstSubmittedAt',",
      "].join(', ');",
      "/*USE*/",
    ].join('\n'),
  };
  const r = resolveIn(files, '/src/lib/store.js', 'REVISION_COLUMNS');
  assert.deepEqual(r.names, ['id', 'documentId', 'firstSubmittedAt']);
  assert.equal(r.viaName, true, 'ต้องนับว่าเป็น select ที่เขียนด้วยชื่อตัวแปร');
  assert.deepEqual(r.blocked, []);
});

test('ตัวคั่นของ .join(", ") ต้องไม่กลายเป็นชื่อคอลัมน์', () => {
  const files = { '/src/a.js': "const C = ['id', 'name'].join(', ');\n/*USE*/" };
  assert.deepEqual(resolveIn(files, '/src/a.js', 'C').names, ['id', 'name']);
});

test('ตาม import { X } from … ข้ามไฟล์ได้ทั้ง @/ และ path สัมพัทธ์', () => {
  const files = {
    '/src/lib/a.js': "import { CUSTOMER_NAME_SELECT } from '@/lib/master/customerName';\n/*USE*/",
    '/src/lib/master/customerName.js': 'export const CUSTOMER_NAME_SELECT = \'id, name, "nameEn"\';',
  };
  assert.deepEqual(resolveIn(files, '/src/lib/a.js', 'CUSTOMER_NAME_SELECT').names, ['id', 'name', 'nameEn']);
});

test('เทมเพลตที่มี ${…} — แกะชื่อในนั้นแล้วตรวจรวมกับข้อความรอบ ๆ', () => {
  const files = { '/src/a.js': "const NAMES = 'id, name';\n/*USE*/" };
  const r = resolveIn(files, '/src/a.js', '`${NAMES}, "arCode"`');
  assert.deepEqual(r.names, ['id', 'name', 'arCode']);
});

test('เงื่อนไขของ ternary ต้องไม่กลายเป็นชื่อคอลัมน์ (แต่ต้องตรวจทั้งสองขา)', () => {
  const files = {
    '/src/a.js': [
      "const manage = new URL(request.url).searchParams.get('manage') === '1';",
      "const COLS = 'id, name';",
      '/*USE*/',
    ].join('\n'),
  };
  const r = resolveIn(files, '/src/a.js', "manage ? '*' : COLS");
  // `manage` กับ `1` มาจากเงื่อนไข ไม่ใช่รายชื่อคอลัมน์ — เคยทำให้ด่านแดงผิด 4 จุด
  assert.deepEqual(r.names, ['id', 'name']);
});

test('object ตัวเลือกท้าย .select() ต้องไม่ถูกลากมาเป็นคอลัมน์', () => {
  const call = "supabase.from('t').select('id, name', { count: 'exact', head: true })";
  const open = call.indexOf('.select(') + '.select('.length - 1;
  assert.equal(firstArg(call, open), "'id, name'");
  assert.deepEqual(columnNamesOf(firstArg(call, open)), ['id', 'name']);
});

test('แกะไม่ได้ต้องดัง ไม่ใช่เงียบ — ความเงียบคือตัวบั๊กเอง', () => {
  const files = { '/src/a.js': 'export function f() {}\n/*USE*/' };

  const missing = resolveIn(files, '/src/a.js', 'SOME_COLUMNS');
  assert.equal(missing.viaName, true);
  assert.equal(missing.blocked.length, 1, 'ชื่อที่หาค่าไม่เจอต้องถูกรายงาน');
  assert.match(missing.blocked[0], /SOME_COLUMNS/);

  const built = resolveIn(files, '/src/a.js', 'buildColumns(user)');
  assert.equal(built.blocked.length >= 1, true, 'ค่าที่ประกอบตอนรันก็ต้องถูกรายงาน');
  assert.match(built.blocked.join(' '), /buildColumns/);
});

test('ชื่อซ้ำในฟังก์ชันอื่น ต้องไม่ถูกหยิบมาใช้แทนค่าคงที่ของโมดูล', () => {
  // ค่าคงที่ของโมดูลวางท้ายไฟล์ได้ (ฟังก์ชันที่เรียกมันรันทีหลัง) — ตัวนั้นใช้ได้
  const afterUse = {
    '/src/a.js': [
      '/*USE*/',
      "const COLS = 'id, name';",
    ].join('\n'),
  };
  assert.deepEqual(resolveIn(afterUse, '/src/a.js', 'COLS').names, ['id', 'name']);

  // แต่ `const` ที่ซ่อนอยู่ในฟังก์ชันอื่นหลังจุดใช้งาน ห้ามหยิบ — จะได้คอลัมน์ของตารางอื่นมาปน
  const shadowed = {
    '/src/b.js': [
      '/*USE*/',
      'function other() {',
      "  const COLS = 'wrongTableColumn';",
      '  return COLS;',
      '}',
    ].join('\n'),
  };
  const r = resolveIn(shadowed, '/src/b.js', 'COLS');
  assert.deepEqual(r.names, []);
  assert.equal(r.blocked.length, 1, 'หาไม่เจอก็ต้องบอก ไม่ใช่เดาเอาตัวที่อยู่ในฟังก์ชันอื่น');
});

test('alias:column ชั้นบนสุด — ชื่อจริงอยู่หลังโคลอน ไม่ใช่หน้า', () => {
  // 🐞 ของเดิมหยิบ alias ไปเทียบสคีมา ⇒ query ที่ถูกต้องกลับแดง · ด่านที่แดงทั้งที่
  //    โค้ดถูก คือด่านที่กำลังจะโดนปิดทิ้ง (บทเรียนเดียวกับ ui-gate-design-rules)
  assert.deepEqual(columnNamesOf('id, alias:realColumn, name'), ['id', 'realColumn', 'name']);
  assert.deepEqual(columnNamesOf('amount::text'), ['amount'], 'cast ไม่ใช่ alias');
  // JSON path เดาไม่ได้ ก็ไม่เดา — ข้ามไปเฉย ๆ ดีกว่าแดงผิด
  assert.deepEqual(columnNamesOf('projectType:metadata->>projectType, id'), ['id']);
});

test('คอลัมน์ใน embed ถูกตัดทิ้ง แต่ต้องนับได้ว่าตัดไปกี่ชื่อ', () => {
  const text = 'id, deal:sales_deals(a, b), items:order_items(count)';
  assert.deepEqual(columnNamesOf(text), ['id'], 'คอลัมน์ของตารางอื่นไม่เอามาเทียบ');
  // ไม่นับก็เท่ากับบอกคนอ่านสรุปว่า "ตรวจครบแล้ว" ทั้งที่ชุดนั้นไม่มีใครตรวจสักชื่อ
  assert.deepEqual(embeddedNames(text), ['a', 'b'], 'count เป็น aggregate ไม่ใช่คอลัมน์');
});

test('ชื่อที่มี $ ต้องหาประกาศเจอ — $ เป็นตัวยึดท้ายสตริงในเรกซ์เอ็กซ์', () => {
  const files = { '/src/a.js': "const $COLS = 'id, name';\n/*USE*/" };
  const r = resolveIn(files, '/src/a.js', '$COLS');
  assert.deepEqual(r.names, ['id', 'name']);
  assert.deepEqual(r.blocked, []);
});

test('เมธอดยังตามไปแกะได้ แต่พร็อพเพอร์ตี้ของอ็อบเจกต์ต้องยอมแพ้แบบดัง ๆ', () => {
  // `FIELDS.join(', ')` — ตัวที่ต้องไปแกะคือ FIELDS ไม่ใช่ join
  const viaMethod = { '/src/a.js': "const FIELDS = ['id', 'name'];\nconst C = FIELDS.join(', ');\n/*USE*/" };
  assert.deepEqual(resolveIn(viaMethod, '/src/a.js', 'C').names, ['id', 'name']);

  // `entry.select` — ถ้าเผลอแกะ `entry` ทั้งก้อน จะได้สตริงของพร็อพเพอร์ตี้พี่น้อง
  // (`other`) มาปนเป็นชื่อคอลัมน์ ⇒ แดงด้วยเหตุผลที่อ่านแล้วงง
  const viaProp = { '/src/b.js': "const entry = { select: 'id, name', other: 'zzWrong' };\n/*USE*/" };
  const r = resolveIn(viaProp, '/src/b.js', 'entry.select');
  assert.deepEqual(r.names, []);
  assert.equal(r.blocked.length, 1);
  assert.match(r.blocked[0], /entry/);
});

test('อาร์กิวเมนต์ของฟังก์ชันที่เดาไม่ได้ ต้องไม่กลายเป็นบรรทัดรายงานเพิ่ม', () => {
  // `buildCols(u)` ต้องรายงานแค่ `buildCols()` — ไม่ใช่ `u` ด้วย
  const files = { '/src/a.js': '/*USE*/' };
  const r = resolveIn(files, '/src/a.js', 'buildCols(u)');
  assert.equal(r.blocked.length, 1, 'รายงานซ้ำทำให้คนเลิกอ่านรายการ ⚠');
  assert.match(r.blocked[0], /buildCols/);
});

test('Object.freeze([...]) — global ของ JS ต้องไม่ถูกรายงานว่า "หาประกาศไม่เจอ"', () => {
  // รีโปนี้เขียนชุดคอลัมน์แบบนี้อยู่แล้ว (SITE_FLAG_COLUMNS) · ถ้า `Object` กลายเป็น
  // ชื่อที่แกะไม่ได้ ด่านจะแดงทั้งที่คอลัมน์ทั้งชุดแกะออกมาครบ = ด่านที่รอวันโดนปิดทิ้ง
  const files = { '/src/a.js': "export const COLS = Object.freeze(['id', 'name']);\n/*USE*/" };
  const r = resolveIn(files, '/src/a.js', '`id, ${COLS.join(", ")}`');
  assert.deepEqual(r.names, ['id', 'id', 'name']);
  assert.deepEqual(r.blocked, []);
});
