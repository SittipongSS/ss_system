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
import {
  checkSelectText, columnNamesOf, createSelectResolver, firstArg, parseSelect, schemaFromDefinitions,
} from '../../scripts/selectExpression.mjs';

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
  // JSON path: คีย์หลัง `->` ไม่มีสคีมาให้เทียบ แต่ **ตัวหน้าเป็นคอลัมน์จริง** — ของเดิมทิ้งทั้งชิ้น
  // ⇒ `metdata->>x` ผ่านเขียวทั้งที่ฐานตอบ 42703 ทั้ง query (ยิงจริง 24/09)
  assert.deepEqual(columnNamesOf('projectType:metadata->>projectType, id'), ['metadata', 'id']);
  assert.deepEqual(columnNamesOf('metadata->items->0, metadata->>x::int'), ['metadata', 'metadata']);
});

test('คอลัมน์ใน embed ไม่ปนเข้าชั้นบนสุด — มันเป็นของตารางอื่น', () => {
  const text = 'id, deal:sales_deals(a, b), items:order_items(count)';
  assert.deepEqual(columnNamesOf(text), ['id'], 'คอลัมน์ของตารางอื่นไม่เอามาเทียบกับตารางแม่');
  const { embeds } = parseSelect(text);
  assert.deepEqual(embeds.map((e) => [e.alias, e.target, e.inner]), [
    ['deal', 'sales_deals', 'a, b'],
    ['items', 'order_items', 'count'],
  ]);
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

// ── embed: ตรวจคอลัมน์ข้างในกับ **ตารางปลายทาง** (2026-09-24) ─────────────────
//
// 🐞 จุดบอดที่เหลือของ #1795: ด่านตัด embed ทิ้งแล้วแค่นับ (148 ชื่อ จาก 22 จุด) ⇒ ชื่อผิดใน
// `deal:sales_deals(${DEAL_COLUMNS})` = 42703 ทั้ง query (จอว่าง) แต่ด่านเขียว — รูปเดียวกับ
// ที่ซ่อน /tax ไว้ 26 วัน · เทสต์ชุดนี้รันใน CI โดยไม่มีฐาน ⇒ สคีมาปลอมแบบเดียวกับ OpenAPI จริง
// (คำอธิบาย FK `<fk table=… column=…/>` เป็นข้อความที่ PostgREST เขียนเอง)

// · ทุกกฎเรื่องเส้นเชื่อม/`count`/aggregate ด้านล่าง ยิงยืนยันกับฐานจริงแล้ว (24/09 · GET limit=0)
//   รหัสที่อ้างในชื่อเทสต์คือคำตอบจริงของฐาน ไม่ใช่การเดา

const fk = (table) => ({ description: `Note:\nThis is a Foreign Key to \`${table}.id\`.<fk table='${table}' column='id'/>` });
const SCHEMA = schemaFromDefinitions({
  quotations: {
    properties: {
      id: {}, quoteNumber: {}, metadata: {}, dealId: fk('sales_deals'), customerId: fk('customers'),
      revisedFromId: fk('quotations'),
      // รูปเดียวกับฐานจริง: quotations ↔ document_signature_evidence มี FK 3 เส้น (สองเส้นขาไป หนึ่งเส้นขากลับ)
      signatureEvidenceId: fk('evidence'), proposerSignatureEvidenceId: fk('evidence'),
    },
  },
  evidence: { properties: { id: {}, quotationId: fk('quotations') } },
  sales_deals: { properties: { id: {}, title: {}, metadata: {}, projectValue: {}, customerId: fk('customers'), projectId: fk('projects') } },
  // self-reference สองเส้น — รูปเดียวกับ sales_orders จริง (revisedFromId + supersededById)
  sales_orders: { properties: { id: {}, revisedFromId: fk('sales_orders'), supersededById: fk('sales_orders') } },
  projects: { properties: { id: {}, code: {}, name: {} } },
  customers: { properties: { id: {}, name: {} } },
  formulas: { properties: { id: {} } },
  orders: { properties: { id: {}, amount: {} } },
  order_items: { properties: { id: {}, orderId: fk('orders'), quotationId: fk('quotations'), productId: fk('products') } },
  products: { properties: { id: {}, fgCode: {} } },
});
const missingOf = (r) => r.missing.map((m) => `${m.table}.${m.name}${m.via ? ` @ ${m.via}` : ''}`);

test('embed: ตรวจกับตารางปลายทาง ไม่ใช่ตารางแม่ และ alias ไม่ใช่ตาราง', () => {
  // `title` มีใน sales_deals แต่ไม่มีใน quotations · `quoteNumber` กลับกัน
  // ⇒ ถ้าเผลอเทียบกับตารางแม่ ผลจะกลับหัวทั้งคู่
  const r = checkSelectText('id, deal:sales_deals(id, title, quoteNumber)', 'quotations', SCHEMA);
  assert.deepEqual(missingOf(r), ['sales_deals.quoteNumber @ deal:sales_deals']);
  assert.equal(r.embeds, 1);
  assert.equal(r.names, 3, 'นับเฉพาะชื่อใน embed — ชั้นบนสุดนับอยู่แล้วที่อื่น');
  assert.deepEqual(r.unresolved, []);
});

test('embed ซ้อนหลายชั้น — ชื่อผิดชั้นในต้องถูกจับ และบอกเส้นทางถูกตาราง', () => {
  const r = checkSelectText(
    'id, deal:sales_deals(id, project:projects(id, cdoe)), items:order_items(*, product:products(id, fgCod))',
    'quotations', SCHEMA,
  );
  assert.deepEqual(missingOf(r), [
    'projects.cdoe @ deal:sales_deals › project:projects',
    'products.fgCod @ items:order_items › product:products',
  ]);
  assert.deepEqual(r.unresolved, [], 'ทุกคู่ในเทสต์นี้มี FK เส้นเดียว — ต้องไม่ติดเรื่องเส้นเชื่อม');
  assert.equal(r.embeds, 4);
});

test('!hint กับ !inner/!left — ไม่ใช่คอลัมน์ของตารางปลายทาง · hint ต้องตรงกับ FK จริง', () => {
  const r = checkSelectText(
    'id, c:customers!quotations_customerId_fkey!inner(id, name), d:sales_deals!dealId(title), customers!left(name)',
    'quotations', SCHEMA,
  );
  assert.deepEqual(missingOf(r), []);
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.embeds, 3);
  // ชื่อ constraint ตั้งต้น + ชื่อคอลัมน์ FK = ตรวจกับเส้นจริงได้ · `!inner`/`!left` เป็นชนิด join ไม่ใช่ hint
  assert.equal(r.hintsChecked, 2);
  assert.equal(r.hintsUnverifiable, 0);
  const [first] = parseSelect('c:customers!fk_x!inner(id)').embeds;
  assert.deepEqual([first.alias, first.target, first.hints, first.join], ['c', 'customers', ['fk_x'], 'inner']);
});

test('เส้นเชื่อม: ไม่มี FK = PGRST200 · หลายเส้น = PGRST201 — ต้องดัง และไม่ถูกนับว่า "ตรวจแล้ว"', () => {
  // (a) quotations กับ formulas ไม่มี FK ต่อกันเลย — ชื่อตารางถูกแต่ฐานตอบ PGRST200 ทั้ง query
  const none = checkSelectText('id, deal:formulas(id)', 'quotations', SCHEMA);
  assert.equal(none.embeds, 0);
  assert.deepEqual(none.unresolved.map((u) => u.via), ['deal:formulas']);
  assert.match(none.unresolved[0].why, /PGRST200/);

  // (b) FK สามเส้นระหว่างคู่เดียวกัน ⇒ PGRST201 · ต้องบอกเส้นที่มีให้เลือก
  const many = checkSelectText('id, ev:evidence(id)', 'quotations', SCHEMA);
  assert.equal(many.embeds, 0);
  assert.equal(many.unresolved.length, 1);
  assert.match(many.unresolved[0].why, /PGRST201/);
  assert.match(many.unresolved[0].why, /quotations\.signatureEvidenceId/);
  assert.match(many.unresolved[0].why, /evidence\.quotationId/);

  // hint เป็นคอลัมน์ FK ฝั่งไหนก็ได้ (ขาไป/ขากลับ) = เลือกเส้นสำเร็จ (ฐานจริง 200 ทั้งสามเส้น)
  for (const h of ['quotationId', 'signatureEvidenceId', 'proposerSignatureEvidenceId']) {
    const ok = checkSelectText(`id, ev:evidence!${h}(id)`, 'quotations', SCHEMA);
    assert.deepEqual(ok.unresolved, [], h);
    assert.equal(ok.hintsChecked, 1, h);
  }
  // `!id` ตรงกับ "คอลัมน์ที่ถูกอ้าง" ของทั้งสามเส้น ⇒ ยังกำกวม (ฐานจริง PGRST201)
  assert.match(checkSelectText('id, ev:evidence!id(id)', 'quotations', SCHEMA).unresolved[0].why, /PGRST201/);
  // คอลัมน์ที่ไม่ใช่เส้นเชื่อม (`title` · `customerId` ที่ชี้ไป customers) ⇒ ฐานจริง PGRST200
  for (const h of ['title', 'customerId']) {
    const bad = checkSelectText(`id, d:sales_deals!${h}(title)`, 'quotations', SCHEMA);
    assert.equal(bad.unresolved.length, 1, h);
    assert.match(bad.unresolved[0].why, /PGRST200/, h);
  }
  // PostgREST ใช้ hint ตัวแรกตัวเดียว: `!dealId!title` 200 · `!title!dealId` PGRST200 (ยิงจริง)
  assert.deepEqual(checkSelectText('id, d:sales_deals!dealId!title(title)', 'quotations', SCHEMA).unresolved, []);
  assert.equal(checkSelectText('id, d:sales_deals!title!dealId(title)', 'quotations', SCHEMA).unresolved.length, 1);
});

test('self-reference: FK เดียว = ผ่าน · สองเส้น = PGRST201 จนกว่าจะใส่ hint', () => {
  assert.deepEqual(checkSelectText('id, rev:quotations(id)', 'quotations', SCHEMA).unresolved, []);
  assert.match(checkSelectText('id, x:sales_orders(id)', 'sales_orders', SCHEMA).unresolved[0].why, /PGRST201/);
  assert.deepEqual(checkSelectText('id, x:sales_orders!revisedFromId(id)', 'sales_orders', SCHEMA).unresolved, []);
});

test('ชื่อ constraint ตั้งเอง — พิสูจน์ไม่ได้ทั้งถูกและผิด ⇒ ไม่แดง แต่ต้องถูกนับ', () => {
  // OpenAPI ไม่มีชื่อ constraint · ชื่อที่ตั้งเอง/ชื่อเก่าหลัง rename คอลัมน์ ฐานรับได้จริง
  // ⚠️ รวมถึงชื่อที่พิมพ์ผิดตัวพิมพ์ (`quotations_dealid_fkey` = PGRST200 บนฐานจริง) — ด่านแยกไม่ออก
  //    จาก constraint ที่ตั้งชื่อแบบไม่ใส่ `"…"` (Postgres พับเป็นตัวเล็กจริง) จึงได้แค่ตัวเลขนี้
  const r = checkSelectText('id, d:sales_deals!quotations_dealid_fkey(title)', 'quotations', SCHEMA);
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.hintsUnverifiable, 1);
  assert.equal(r.hintsChecked, 0);
  assert.equal(r.embeds, 1);
  // แต่ถ้าคู่นั้นไม่มี FK เลย hint อะไรก็ช่วยไม่ได้ ⇒ ยังแดง
  assert.equal(checkSelectText('id, f:formulas!whatever_fkey(id)', 'quotations', SCHEMA).unresolved.length, 1);
});

test('`count` เปล่า ๆ ผ่านเฉพาะตอนอยู่คนเดียว · aggregate ถูกปิดบนโปรเจกต์นี้ = แดง', () => {
  // `items:order_items(count)` = จำนวนแถวแบบเก่า (ใช้จริงใน ORDER_SELECT_SLIM · ฐานจริง 200)
  const ok = checkSelectText('id, items:order_items(count), line:order_items(*), n:order_items(c:count)', 'orders', SCHEMA);
  assert.deepEqual(missingOf(ok), []);
  assert.deepEqual(ok.unresolved, []);
  assert.equal(ok.embeds, 3);
  // ชั้นบนสุดก็ได้ถ้าอยู่คนเดียว (`quotations?select=count` ฐานจริง 200)
  assert.deepEqual(checkSelectText('count', 'orders', SCHEMA).unresolved, []);
  assert.deepEqual(missingOf(checkSelectText('count', 'orders', SCHEMA)), []);

  // ปนกับชิ้นอื่น ⇒ 42803 ทั้ง query (ฐานจริง: `id,count` · `order_items(id,count)` · `count,deal:…(id)`)
  for (const [text, via] of [['id, count', ''], ['id, items:order_items(id, count)', 'items:order_items'], ['count, i:order_items(id)', '']]) {
    const r = checkSelectText(text, 'orders', SCHEMA);
    assert.deepEqual(r.unresolved.map((u) => u.via), [via], text);
    assert.match(r.unresolved[0].why, /42803/, text);
  }

  // aggregate `count()` · `n:count()` · `col.sum()` · ใน embed ⇒ PGRST123 ทั้ง query (ฐานจริงทุกตัว)
  for (const text of ['count()', 'n:count()', 'amount.sum()', 'id, items:order_items(count())']) {
    const r = checkSelectText(text, 'orders', SCHEMA);
    assert.equal(r.unresolved.length, 1, text);
    assert.match(r.unresolved[0].why, /PGRST123/, text);
  }
  // คอลัมน์หน้า `.sum()` ยังเป็นคอลัมน์ของตารางนี้ — ผิดก็ต้องแดงอีกบรรทัด
  assert.deepEqual(missingOf(checkSelectText('amout.sum()', 'orders', SCHEMA)), ['orders.amout']);
});

test('กฎชั้นบนสุดใช้ซ้ำใน embed: alias:col · cast · JSON path', () => {
  const r = checkSelectText(
    'id, deal:sales_deals(t:title, projectValue::text, projectType:metadata->>projectType, v:projectVlaue::text)',
    'quotations', SCHEMA,
  );
  // alias ไม่ใช่คอลัมน์ (ชื่อจริงอยู่หลังโคลอน) · cast ตัดทิ้ง · JSON path ตรวจตัวหน้า `->`
  assert.deepEqual(missingOf(r), ['sales_deals.projectVlaue @ deal:sales_deals']);
});

test('ตัวหน้า JSON path พิมพ์ผิด = 42703 ทั้ง query — ต้องแดงทั้งชั้นบนสุดและใน embed', () => {
  // ยิงจริง 24/09: `quotations?select=id,metdata->>x` และ `deal:sales_deals(metdata->>projectType)` ได้ 42703
  const r = checkSelectText('id, metdata->>x, deal:sales_deals(metdata->>projectType)', 'quotations', SCHEMA);
  assert.deepEqual(missingOf(r), ['quotations.metdata', 'sales_deals.metdata @ deal:sales_deals']);
  // ชิ้นที่อ่านเป็นชื่อไม่ออก ต้องดัง ไม่ใช่ถูกกลืน (`id name` = 42703 · `->>x` = PGRST100 บนฐานจริง)
  assert.equal(checkSelectText('id name', 'quotations', SCHEMA).unresolved.length, 1);
  assert.equal(checkSelectText('id, ->>x', 'quotations', SCHEMA).unresolved.length, 1);
});

test('spread `...table(cols)` — คอลัมน์ข้างในก็เป็นของตารางปลายทาง', () => {
  const r = checkSelectText('id, ...customers(name, nmae)', 'quotations', SCHEMA);
  assert.deepEqual(missingOf(r), ['customers.nmae @ ...customers']);
  assert.deepEqual(r.unresolved, []);
});

test('คอลัมน์ FK เป็นปลายทาง `customer:customerId(...)` — ตาม FK ไปหาตาราง', () => {
  // PostgREST รับรูปนี้จริง (ทดสอบกับฐานจริง 24/09: 200) — ถ้าไม่ตาม FK จะรายงานว่า
  // "customerId ไม่ใช่ตาราง" ทั้งที่ query ถูก · เส้นเชื่อมคือคอลัมน์นั้นเอง ไม่ต้องพิสูจน์ซ้ำ
  const r = checkSelectText('id, customer:customerId(id, nmae)', 'sales_deals', SCHEMA);
  assert.deepEqual(missingOf(r), ['customers.nmae @ customer:customerId']);
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.embeds, 1);
});

test('embed ที่สร้างจากค่าคงที่ `deal:sales_deals(${DEAL_COLUMNS})` — ตรวจได้ทั้งชุด', () => {
  // รูปเดียวกับ api/sales-planning/quotations/route.js · ตัวแกะต่อ fragment ด้วย ", "
  // ⇒ ข้างในวงเล็บมีชิ้นว่างปน (`(, id,…, )`) ซึ่งต้องตกไปเองโดยไม่แดง
  const files = {
    '/src/a.js': [
      "const LIST_COLUMNS = ['id', 'quoteNumber'].join(',');",
      "const DEAL_COLUMNS = 'id,titel,projectType:metadata->>projectType';",
      '/*USE*/',
    ].join('\n'),
  };
  const r = resolveIn(files, '/src/a.js', '`${LIST_COLUMNS},deal:sales_deals(${DEAL_COLUMNS})`');
  assert.deepEqual(r.blocked, []);
  const c = checkSelectText(r.text, 'quotations', SCHEMA);
  assert.deepEqual(missingOf(c), ['sales_deals.titel @ deal:sales_deals']);
  assert.deepEqual(c.unresolved, []);
  assert.equal(c.names, 3, '`id` + `titel` + ตัวหน้า JSON path `metadata`');
});

test('ตารางปลายทางที่ไม่อยู่ในสคีมา ต้องถูกรายงาน ไม่ใช่ข้ามเงียบ', () => {
  // ฐานจริงตอบ PGRST200 ทั้ง query · ข้ามเงียบ = คอลัมน์ข้างในไม่มีใครตรวจ = รูปเดียวกับบั๊ก #1795
  const r = checkSelectText('id, deal:sales_dealz(id, anything)', 'quotations', SCHEMA);
  assert.equal(r.embeds, 0, 'แกะไม่ได้ต้องไม่ถูกนับว่า "ตรวจแล้ว"');
  assert.equal(r.unresolved.length, 1);
  assert.equal(r.unresolved[0].via, 'deal:sales_dealz');
  assert.match(r.unresolved[0].why, /sales_dealz/);
  assert.match(r.unresolved[0].why, /quotations/, 'บอกด้วยว่าหาคอลัมน์ FK ในตารางแม่ตัวไหนแล้วไม่เจอ');
  // ชั้นซ้อนก็ต้องดังเท่ากัน
  const nested = checkSelectText('id, deal:sales_deals(id, p:projectz(id))', 'quotations', SCHEMA);
  assert.deepEqual(nested.unresolved.map((u) => u.via), ['deal:sales_deals › p:projectz']);
});

test('วงเล็บไม่ครบคู่ / ชิ้นที่มีวงเล็บแต่อ่านไม่ออก ต้องดัง', () => {
  // ของเดิมกลืน `)` ที่หลุดมาด้วยกฎ "อักขระแปลก = ข้าม" — ห้ามกลับไปเงียบแบบนั้น
  assert.equal(checkSelectText('id, deal:sales_deals(id, title', 'quotations', SCHEMA).unresolved.length >= 1, true);
  assert.equal(checkSelectText('id, title)', 'sales_deals', SCHEMA).unresolved.length, 1);
  assert.equal(checkSelectText('id, (id)', 'sales_deals', SCHEMA).unresolved.length, 1);
});

test('ternary สองขาได้ embed ชิ้นเดิมซ้ำ — ตรวจและรายงานครั้งเดียว', () => {
  const text = 'id, deal:sales_deals(titel) , id, deal:sales_deals(titel), items:order_items(count)';
  const r = checkSelectText(text, 'quotations', SCHEMA);
  assert.deepEqual(missingOf(r), ['sales_deals.titel @ deal:sales_deals']);
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.embeds, 2);
});
