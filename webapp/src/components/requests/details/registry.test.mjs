// ── ทะเบียนเนื้อหน้ารายละเอียดรายหัวข้อ (P3b) ────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUEST_KIND_LIST, REQUEST_KINDS } from '../../../lib/master/requestTypes.js';

const SRC = readFileSync('src/components/requests/details/index.js', 'utf8');
const PAGE = readFileSync('src/app/requests/[id]/page.js', 'utf8');

test('ทุกหัวข้อในทะเบียนต้องมีเนื้อหน้ารายละเอียด — ถอยได้ ไม่พัง', () => {
  // ⚠️ หัวข้อที่ไม่มีจอของตัวเองต้อง **ถอยไปตัวกลาง** ไม่ใช่จอขาว — ใบเก่าของ
  // หัวข้อที่ถูกถอดไปแล้วก็ยังต้องเปิดอ่านได้
  assert.match(SRC, /BY_KIND\[kind\] \|\| SharedRequestDetail/);
  assert.ok(REQUEST_KIND_LIST.length > 0);
});

test('🔴 หัวข้อที่มีแถวได้ ต้องมีจอของตัวเอง — ตัวกลางไม่มีปุ่มก้าวรายแถว', () => {
  // 🐞 **กับดักที่ปิดด้วยด่านนี้** — `SharedRequestDetail` เรนเดอร์ `<RequestRows>`
  // โดย **ไม่ส่ง `rowStep`** ⇒ แถวขึ้นครบแต่ไม่มีปุ่มก้าวสักปุ่ม · เดิมมีตาข่ายรอง
  // คือ `<NextStepBar rows={...}>` ระดับเปลือก ซึ่งถูกถอดไปตอนยุบเหลือโครงเดียว
  // (ม-123) ⇒ ตอนนี้หัวข้อที่มีแถวแต่ลืมลงทะเบียนจอ จะได้แถวที่ขยับไม่ได้เลย
  // **โดยไม่มีอะไรพัง** — ไม่มี error ไม่มีจอขาว แค่กดอะไรไม่ได้
  //
  // ⚠️ `deliversRows` นับด้วย — พัฒนากลิ่นไม่มีแถวตอนเปิดใบ แต่ฝ่ายสร้างแถวเองตอนส่ง
  const mapped = new Set([...SRC.matchAll(/^\s{2}(\w+):\s*(\w+),/gm)].map((m) => m[1]));
  const missing = Object.entries(REQUEST_KINDS)
    .filter(([, k]) => k.hasItems || k.deliversRows)
    .map(([key]) => key)
    .filter((key) => !mapped.has(key));
  assert.deepEqual(missing, [],
    `หัวข้อที่มีแถวได้แต่ไม่มีจอของตัวเอง: ${missing.join(' · ')} — ลงทะเบียนใน BY_KIND `
    + 'ไม่งั้นแถวของมันจะไม่มีปุ่มก้าว (ตัวกลางไม่ส่ง rowStep)');
});

test('🔴 หน้า /requests/[id] ต้องไม่ตัดสินเนื้อจากชื่อหัวข้อเอง', () => {
  // ⚠️ ratchet ของ ม-34: `kind === '...'` กลางหน้าที่ทุกหัวข้อใช้ร่วมกัน คือทางที่
  // ทำให้ไฟล์นี้โตกลับไปเป็นก้อนเดียวอีกรอบ · เงื่อนไขรายหัวข้ออยู่ในไฟล์ของหัวข้อนั้น
  // ⚠️ เทียบเฉพาะ `req.kind` — `confirm.kind` เป็นชนิด*โมดัล* คนละเรื่องกัน
  assert.ok(!/req\.kind === ["']/.test(PAGE), 'หน้าเปลือกต้องไม่เทียบชื่อหัวข้อตรง ๆ');
  assert.match(PAGE, /detailForKind\(req\.kind\)/, 'ต้องเลือกเนื้อจากทะเบียน');
});

test('ทะเบียนแยกจาก lib/requests/kinds โดยตั้งใจ — server bundle ต้องไม่ลาก React', () => {
  // ⚠️ `lib/requests/kinds/registry.js` ถูก import จาก route กับ permissions ซึ่งแตะ
  // React ไม่ได้ · ผูก component เข้าไปเมื่อไรจะลาก React เข้า server ทั้งสาย
  const kinds = readFileSync('src/lib/requests/kinds/registry.js', 'utf8');
  assert.ok(!/from ['"]react['"]/.test(kinds));
  assert.ok(!/components\//.test(kinds), 'ทะเบียนหัวข้อต้องไม่ import component');
});

test('พัฒนาสูตรมีจอของตัวเอง ไม่ตกไปใช้ตัวกลาง (P4 · ม-34)', () => {
  // ⚠️ ตกไปใช้ `SharedRequestDetail` เมื่อไร = ได้แค่การ์ดรายแถว **ไม่มีตารางสรุป
  // และไม่มีแถบตัวเลข** ⇒ "รอใส่ราคา" กับ "รอลูกค้าตอบ" หายไปจากจอ ซึ่งเป็นสองขั้น
  // ที่ค้างโดยไม่มีใครเห็นได้ง่ายที่สุด
  assert.match(SRC, /formula_dev: FormulaDevDetail/);
  assert.match(SRC, /scent_dev: ScentDevDetail/);
});

test('ขอเอกสารมีจอของตัวเอง และใช้ร่วมกับใบวางบิลของบัญชี (P5)', () => {
  // ⭐ คำศัพท์ต่างกัน (IFRA/COA/MSDS vs ใบวางบิล/ใบกำกับ) แต่กฎของบรรทัดเหมือนกัน
  // ทุกข้อ ⇒ จอเดียวกัน · แยกจอเมื่อไรก็ได้สองก้อนที่เพี้ยนกันภายในสามเดือน
  assert.match(SRC, /document: DocumentDetail/);
  assert.match(SRC, /billing_doc: DocumentDetail/);
});

test('🔴 เปลือกส่งก้อนของทุกหัวข้อไปให้ครบ — ห้ามเดาจากข้อมูลว่าใบนี้เป็นหัวข้อไหน', () => {
  // 🐞 เคยเขียนเป็น `docBoard.length ? docBoard : formulaBoard` ⇒ **ใบร่างที่ยังไม่มี
  // แถว** จะตกไปใช้ก้อนของหัวข้ออื่นเงียบ ๆ · เลือกให้ที่เปลือกต้องรู้ว่าหัวข้อไหน
  // ใช้ก้อนไหน ซึ่งเป็นความรู้ของหัวข้อ ไม่ใช่ของเปลือก (ม-34)
  // ⚠️ เทียบเฉพาะโค้ด — ข้อความในคอมเมนต์ที่เล่าว่าเคยผิดยังไงต้องไม่ทำเทสต์แดง
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/docBoard\.length \?/.test(code), 'ห้ามเลือกก้อนจากความยาว array');
  for (const prop of ['formulaBoard=', 'formulaTotals=', 'docBoard=', 'docTotals=']) {
    assert.ok(PAGE.includes(prop), `เปลือกต้องส่ง ${prop}`);
  }
});

test('🔴 สายเอกสารแนบไฟล์ทางเดียว — การ์ดแถวดูอย่างเดียว (ม-90)', () => {
  // ⚠️ มติผู้ใช้: "flow การส่งเอกสาร ต้องเป็นแบบเดียว กันการสับสน" — จุดแนบของสาย
  // เอกสารคือโมดัล "ส่งเอกสาร" ที่เดียว · การ์ดแถวเปิดแนบเมื่อไรก็กลับไปสองทางอีก
  const doc = readFileSync('src/components/requests/details/DocumentDetail.js', 'utf8');
  assert.match(doc, /canEditAttachments=\{false\}/, 'การ์ดแถวสายเอกสารต้องอ่านอย่างเดียว');
  const code = doc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/canEditAttachments[,}]/.test(code),
    'DocumentDetail ต้องไม่รับสิทธิ์แนบจากเปลือก — สิทธิ์อยู่ที่โมดัลส่งเอกสารคนเดียว');
});

test('🔴 ปุ่มระดับใบอยู่ที่เดียวเสมอ — การ์ดจัดการ ทุกหัวข้อ (ม-122 · ม-123)', () => {
  // ⚠️ เดิมที่วางเปลี่ยนตามโครงของหัวข้อ (การ์ดขวา · หัวใบ · ท้ายเธรด) — สามที่ที่
  // คนสลับหัวข้อต้องเรียนรู้ · งวด 1 ยุบเหลือบาร์บนสุดของเนื้อ · ม-122 ย้ายกลับขึ้น
  // การ์ดจัดการให้ทรงเดียวกับ QT/SO/บัญชี · ม-123 ทำให้ทุกหัวข้อใช้โครงนี้ ⇒ **ไม่มี
  // สาขาที่สองเหลือให้พลาดอีก**
  //
  // ⚠️ **ข้อที่เทสต์นี้คุมจริงคือ "ที่เดียว" ไม่ใช่ "ที่ไหน"** — ย้ายได้ ก๊อปไม่ได้
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  // การ์ดจัดการถือปุ่มทั้งสามกลุ่ม ผ่านตัวรวมกติกา visible ตัวเดิม
  const panelStart = code.indexOf('<DocumentControlCard');
  const panelCall = code.slice(panelStart, code.indexOf('/>', panelStart));
  for (const prop of ['primaryAction', 'secondaryActions', 'dangerActions']) {
    assert.match(panelCall, new RegExp(`${prop}=\\{requestActions\\.${prop}\\}`),
      `การ์ดจัดการต้องรับ ${prop} จาก requestActions ตัวเดียว`);
  }

  // ทางเก่าต้องตายจริง ไม่ใช่ซ่อนตอน render — รวมบาร์และธงโครงที่สอง
  for (const gone of ['threadStep', 'headerAction', 'hasHeaderActions', 'requestStep',
    'RequestActionBar', 'usePanel']) {
    assert.ok(!code.includes(gone), `${gone} ต้องไม่เหลือในเปลือก — ปุ่มระดับใบมีที่เดียว`);
  }

  // หัวใบก็ต้องไม่มีแผงปุ่ม
  const headCall = code.slice(code.indexOf('<SalesDetailOverview'), code.indexOf('facts={headerFacts}'));
  assert.ok(!/\bactions=/.test(headCall), 'หัวใบต้องไม่มีปุ่มระดับใบ');

  // แถบท้ายเธรดเหลือหน้าที่เดียว: ก้าวรายแถว
  const nextBar = readFileSync('src/components/requests/NextStepBar.js', 'utf8');
  assert.ok(!nextBar.includes('requestStep'),
    'NextStepBar ต้องไม่รับก้าวระดับใบอีก — ปุ่มระดับใบอยู่การ์ดจัดการ');
});

test('🔴 การ์ดจัดการต้องขึ้นทุกหัวข้อ — ไม่มีเงื่อนไขให้หัวข้อไหนตกขบวน (ม-123)', () => {
  // 🐞 กับดักที่ปิดด้วยเทสต์นี้: ตอนย้ายทีละหัวข้อ หัวข้อที่ยังไม่เปิดธงจะไม่มีการ์ด
  // ⇒ **ไม่มีปุ่มระดับใบเลยสักตัว โดยไม่มีอะไรพัง** — ใบแค่กดอะไรไม่ได้เงียบ ๆ
  // ตอนนี้ทุกหัวข้อใช้โครงเดียว ด่านนี้กันไม่ให้มีใครใส่เงื่อนไขกลับเข้าไป
  assert.ok(Object.keys(REQUEST_KINDS).length > 0);
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(code, /aside=\{\(/, 'คอลัมน์ขวาต้องไม่มีเงื่อนไข — ทุกหัวข้อได้การ์ดเท่ากัน');
  assert.ok(!/aside=\{\w+ \?/.test(code), 'คอลัมน์ขวาต้องไม่ผูกกับธงของหัวข้อ');
});
