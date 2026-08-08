// ── ทะเบียนเนื้อหน้ารายละเอียดรายหัวข้อ (P3b) ────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUEST_KIND_LIST } from '../../../lib/master/requestTypes.js';

const SRC = readFileSync('src/components/requests/details/index.js', 'utf8');
const PAGE = readFileSync('src/app/requests/[id]/page.js', 'utf8');

test('ทุกหัวข้อในทะเบียนต้องมีเนื้อหน้ารายละเอียด — ถอยได้ ไม่พัง', () => {
  // ⚠️ หัวข้อที่ไม่มีจอของตัวเองต้อง **ถอยไปตัวกลาง** ไม่ใช่จอขาว — ใบเก่าของ
  // หัวข้อที่ถูกถอดไปแล้วก็ยังต้องเปิดอ่านได้
  assert.match(SRC, /BY_KIND\[kind\] \|\| SharedRequestDetail/);
  assert.ok(REQUEST_KIND_LIST.length > 0);
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

test('🔴 ปุ่มหลักอยู่ที่เดียวเสมอ — หัวใบ หรือ ท้ายเธรด ไม่ใช่ทั้งสองที่ (P6)', () => {
  // ⚠️ หัวข้อที่ไม่มีแถว (สอบถามข้อมูล) ทั้งหน้าคือเธรด ⇒ ปุ่มย้ายไปท้ายเธรด
  // แต่ต้อง **ย้าย ไม่ใช่ก๊อป** — โชว์สองที่เมื่อไรก็ได้ทางเข้าสองทางที่ต้องคอยดูแล
  // ให้ตรงกัน (โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้)
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /const headerAction = threadStep \? null : primaryAction/);
  // ปุ่มบนหัวใบมาจาก `headerAction` ตัวเดียว ผ่านตัวรวมกติกา `visible` ของทุกโมดูล
  // (เดิมส่งเป็น prop ให้ DocumentControlCard บนรางขวา — รางขวาถูกยุบไปแล้ว)
  assert.match(code, /primaryAction: headerAction/);
  assert.match(code, /requestStep=\{threadStep\}/);
  // ⚠️ ยังต้องมีที่เดียว — `headerAction` ห้ามโผล่ในสาขาอื่นนอกจากตัวรวมนี้
  assert.equal((code.match(/headerAction/g) || []).length, 2,
    'headerAction ต้องปรากฏแค่ ตอนนิยาม กับ ตอนส่งเข้าตัวรวม action เท่านั้น');
});
