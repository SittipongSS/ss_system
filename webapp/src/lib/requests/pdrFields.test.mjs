// ── PDR: สามจอต้องพูดคำเดียวกัน ──────────────────────────────────────────
//
// 🐞 ผู้ใช้ทักมาเอง: "ฟอร์มกรอก · ตอนโชว์รายละเอียด · ตอนแก้ มันไม่เหมือนกันเลย"
// ทั้งสามที่ต่างคนต่างเขียนลิสต์ของตัวเอง แล้วเพี้ยนกันทั้งหัวข้อ ลำดับ และป้ายช่อง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PDR_COLUMNS, PDR_FIELDS, PDR_FRAGRANCE_OIL_CODE, PDR_SECTIONS,
  pdrArtworkError, pdrContext, pdrFieldText, pdrFieldVisible, pdrIsArrayField,
  pdrSectionGroups, pdrSectionRows, pdrValuesFrom,
} from './pdrFields.js';
import { normalizePdr } from './pdr.js';
import { renderPdrDocument } from './pdrDocument.js';

test('ทะเบียนครอบคลุมคอลัมน์ pdr* ครบทุกตัว — ไม่มีช่องไหนกรอกได้แต่ไม่มีที่แสดง', () => {
  // `normalizePdr` คือฝั่งเขียน · ทะเบียนคือฝั่งอ่าน ⇒ ต้องเป็นชุดเดียวกันเป๊ะ
  const { columns } = normalizePdr({});
  assert.deepEqual([...PDR_COLUMNS].sort(), Object.keys(columns).sort());
  // 29 ช่องของ 0214/0218 + 5 ชื่อผู้เซ็นของ 0221 (ม-45)
  // + 3 ของ 0227: หมวดสินค้าหลายรายการ · "อื่น ๆ" ของบรรจุภัณฑ์และเอกสาร
  // + 1 ของ 0228: หัวน้ำหอมนำไปใช้กับอะไร
  assert.equal(PDR_COLUMNS.length, 38);
});

test('ชื่อผู้เซ็นเป็นช่องบนกระดาษ ไม่ใช่ role — ป้ายตรงกับตารางลายเซ็นของ FM-RD-01', () => {
  // ⚠️ ตารางลายเซ็นในเอกสารอ่านป้ายจากทะเบียนนี้ ⇒ เปลี่ยนชื่อตำแหน่งที่นี่ที่เดียว
  // แล้วฟอร์ม จอ และกระดาษเปลี่ยนพร้อมกัน (สะกดซ้ำเมื่อไรก็เพี้ยนกันเมื่อนั้น)
  const signers = PDR_SECTIONS.find((s) => s.key === 'signers');
  assert.ok(signers, 'ต้องมีหมวดผู้เซ็น');
  assert.deepEqual(signers.fields.map((f) => f.label), [
    'Sale & Marketing Manager',
    'Perfumer',
    'Product Development Chemist',
    'Project Coordinator',
    'Final Approval (RD Supervisor)',
  ]);
  // ⚠️ ทุกช่องต้องเว้นว่างได้ — ไม่มีใครถูกบังคับให้เซ็นในระบบ (ม-45)
  for (const f of signers.fields) assert.equal(f.type, 'text');
});

test('ทุกช่องมีป้ายชื่อ และ key ห้ามซ้ำ', () => {
  const keys = PDR_FIELDS.map((f) => f.key);
  assert.deepEqual(keys, [...new Set(keys)], 'key ซ้ำ = ช่องหลังทับช่องหน้าเงียบ ๆ');
  for (const f of PDR_FIELDS) assert.ok(f.label, `${f.key}: ไม่มีป้ายชื่อ`);
  for (const s of PDR_SECTIONS) assert.ok(s.title && s.fields.length, `${s.key}: หัวข้อไม่ครบ`);
});

// ── ค่าที่พร้อมแสดง ──────────────────────────────────────────────────────
test('🐞 enum ต้องถูกแปลเป็นป้าย — เอกสารเคยพิมพ์ค่าดิบลงกระดาษที่ส่งลูกค้า', () => {
  const req = { pdrRequestType: 'new_product', pdrCustomerKind: 'existing', pdrTexture: 'premium' };
  const text = (key) => pdrFieldText(PDR_FIELDS.find((f) => f.key === key), req);
  assert.equal(text('requestType'), 'New Product');
  assert.equal(text('customerKind'), 'ลูกค้าเก่า');
  assert.equal(text('texture'), 'PREMIUM');

  // ⚠️ ค่าที่ไม่รู้จักต้องคืนค่าดิบ ไม่ใช่ null — ข้อมูลเก่าที่ enum เปลี่ยนไปแล้ว
  // ต้องยังเห็นบนจอ ไม่ใช่หายเงียบจนดูเหมือนไม่เคยกรอก
  assert.equal(pdrFieldText(PDR_FIELDS.find((f) => f.key === 'texture'), { pdrTexture: 'ของเก่า' }), 'ของเก่า');
});

test('ตัวเลขจัดรูปแบบไทย · ช่องว่างคืน null', () => {
  const cost = PDR_FIELDS.find((f) => f.key === 'targetCost');
  assert.equal(pdrFieldText(cost, { pdrTargetCost: 1200 }), '1,200');
  assert.equal(pdrFieldText(cost, { pdrTargetCost: null }), null);
  assert.equal(pdrFieldText(cost, { pdrTargetCost: '   ' }), null);
});

test('ช่องที่ระบบเติมให้อ่านจากแถวคำร้อง ไม่ใช่จากคอลัมน์ pdr*', () => {
  const req = { requestedByName: 'สมชาย', customerName: 'ลูกค้า ก' };
  const ctx = { briefs: [{ id: 'B1' }, { id: 'B2' }], scentCount: 3 };
  const text = (key) => pdrFieldText(PDR_FIELDS.find((f) => f.key === key), req, ctx);
  assert.equal(text('requester'), 'สมชาย');
  assert.equal(text('customer'), 'ลูกค้า ก');
  assert.equal(text('scentCount'), '3 กลิ่น');
});

// ⭐ 🐞 ใบที่ AE รวบเป็นบรีฟเดียว (ลูกค้าบอกแนวเดียว "ทำแนวสดชื่นมา 3 ทาง") เคยพิมพ์
// ลงกระดาษว่า "1 กลิ่น" ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3 — เพราะ scentCount ถอยไปใช้
// `briefs.length` เมื่อผู้เรียกไม่ส่งมา · จำนวนที่ลูกค้าจ่ายต้องมาจากใบสั่งขายเสมอ
test('⭐ จำนวนกลิ่น (1.12) มาจากใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ', () => {
  const field = PDR_FIELDS.find((f) => f.key === 'scentCount');
  const soLines = [{ fgCode: 'FG-321-03-002', qty: 3 }];
  // บรีฟรวม: ก้อนเดียว แต่ใบสั่งขายขาย 3 กลิ่น
  const merged = pdrContext({ briefs: [{ id: 'B1' }], salesOrderLines: soLines });
  assert.equal(merged.scentCount, 3);
  assert.equal(pdrFieldText(field, {}, merged), '3 กลิ่น');
  // ไม่ส่งบรรทัด SO มา = ไม่รู้ ⇒ N/A · **ห้ามเดาจากจำนวนก้อน**
  const blind = pdrContext({ briefs: [{ id: 'B1' }, { id: 'B2' }] });
  assert.equal(blind.scentCount, null);
  assert.equal(pdrFieldText(field, {}, blind), null);
});

// ⭐ วันที่ร้องขอ = วันที่ยื่น ไม่ใช่วันที่สร้างร่าง (มติผู้ใช้ 2026-08-08)
test('⭐ วันที่ร้องขออ่านจาก submittedAt — ร่างที่ยังไม่ส่งขึ้น N/A', () => {
  const field = PDR_FIELDS.find((f) => f.key === 'requestedAt');
  assert.ok(field, 'ทะเบียนต้องมีช่อง "วันที่ร้องขอ" — เป็นข้อแรกของ Request Information');
  // ร่างค้างไว้สามวันแล้วค่อยกดส่ง — ต้องได้วันที่ยื่น ไม่ใช่วันที่เริ่มพิมพ์
  const sent = { createdAt: '2026-08-05T09:00:00Z', submittedAt: '2026-08-08T14:20:00Z' };
  // ⚠️ DD/MM/YYYY ไม่ใช่ ISO (มติผู้ใช้ 2026-08-10) — กระดาษต้องอ่านเป็นรูปที่คนอ่าน
  // วันที่ ไม่ใช่รูปของฐานข้อมูล · ค.ศ. เหมือนทั้งระบบ
  assert.equal(pdrFieldText(field, sent, pdrContext({ request: sent })), '08/08/2026');
  const draft = { createdAt: '2026-08-05T09:00:00Z' };
  assert.equal(pdrFieldText(field, draft, pdrContext({ request: draft })), null);
});

test('บนจอซ่อนช่องว่าง · บนเอกสารพิมพ์ครบทุกช่อง', () => {
  const spec = PDR_SECTIONS.find((s) => s.key === 'spec');
  const req = { pdrMoq: '50' };
  assert.deepEqual(pdrSectionRows(spec, req), [['MOQ ที่คาดหวัง', '50']]);
  // ⚠️ ตัวหารไม่ใช่ `spec.fields.length` ดิบ ๆ — ข้อ 2.2/2.3 เป็นตารางรายสินค้า
  // (mig 0229) ไม่ใช่คู่ป้าย/ค่า และช่อง `legacy` โผล่เฉพาะใบที่มีค่าจริง
  const printable = spec.fields.filter((f) => f.type !== 'targets' && !f.legacy);
  assert.equal(pdrSectionRows(spec, req, { includeEmpty: true }).length, printable.length);
  // ใบเก่าที่มีค่าในช่องเดิมยังต้องพิมพ์ออกกระดาษ ไม่ใช่หายไปพร้อมการย้ายโครง
  const legacy = pdrSectionRows(spec, { ...req, pdrTargetCost: 1200 });
  assert.deepEqual(legacy, [['Target Cost / KG (บันทึกไว้เดิม)', '1,200'], ['MOQ ที่คาดหวัง', '50']]);
});

// ── สามจออ่านจากทะเบียนเดียวกันจริงไหม ────────────────────────────────────
//
// ⚠️ ratchet อ่านซอร์ส — ทั้งสามไฟล์เป็น JSX/HTML ที่เรียกในเทสต์ตรง ๆ ไม่ได้
// แต่ "มีลิสต์ของตัวเองหรือเปล่า" ตรวจจากซอร์สได้ และนั่นคือต้นเหตุของบั๊กพอดี
test('⭐ ฟอร์ม · จอแสดง · เอกสาร อ่านป้ายจากทะเบียนเดียวกัน', () => {
  for (const file of [
    'src/components/requests/PdrForm.js',
    'src/components/requests/PdrSummary.js',
    'src/lib/requests/pdrDocument.js',
  ]) {
    assert.match(readFileSync(file, 'utf8'), /from ['"]@\/lib\/requests\/pdrFields['"]/, file);
  }
});

// 🐞 ปุ่มสลับโหมดบรีฟเคยล้างทุกก้อนทุกครั้ง (`Array.from(... () => ({label:''}))`)
// แม้แต่ตอนแยก 1 → N ซึ่งไม่มีเหตุผลให้ทิ้งอะไรเลย · กติกาย้ายไป `switchBriefMode`
// แล้ว — ถ้าวันไหนมีคนเขียนกลับเป็นสร้างอาเรย์ใหม่ตรง ๆ เทสต์นี้จะดับ
test('⭐ ปุ่มสลับโหมดบรีฟเรียกกติกากลาง ไม่ใช่สร้างอาเรย์ใหม่ทับของเดิม', () => {
  const src = readFileSync('src/components/requests/PdrForm.js', 'utf8');
  assert.match(src, /switchBriefMode/, 'ต้องเรียก switchBriefMode จาก lib/requests/scentBriefs');
  assert.match(src, /briefsDroppedByMerge/, 'ต้องถามก่อนรวบเมื่อมีก้อนที่กรอกไว้จะหาย');
  assert.ok(!/onBriefsChange\(Array\.from/.test(src),
    'ห้ามสร้างอาเรย์ใหม่ทับของเดิม — ของที่คนพิมพ์ไว้จะหายเงียบ');
  // ⚠️ ถามด้วยโมดัลของบ้าน — ตัวห้าม native feedback อยู่ที่ `npm run audit:ui`
  // ซึ่งกวาดทั้งรีโปอยู่แล้ว ไม่ต้องเช็คซ้ำที่นี่ (และเช็คซ้ำแบบอ่านซอร์สจะไป
  // จับคำในคอมเมนต์ของตัวเองด้วย)
  assert.match(src, /confirmAction/);
});

// 🐞 ผู้ใช้เจอเอง 2026-08-10: กดบันทึกร่างแล้วโดนตีกลับ "ราคาและมูลค่าต้องเป็น
// ตัวเลขไม่ติดลบ" เพราะช่องเงินเป็น `Input` ข้อความอิสระ ⇒ พิมพ์ "1,200.-" ได้
// หัวไฟล์ `ui/Input.js` เขียนกฎไว้แล้วว่าช่องเงินต้องใช้ `MoneyInput` แต่ไม่มีอะไรบังคับ
test('⭐ ช่องเงินของ PDR ต้องเป็น MoneyInput ทุกช่อง ไม่ใช่ช่องข้อความอิสระ', () => {
  const src = readFileSync('src/components/requests/PdrForm.js', 'utf8');
  const moneyFields = PDR_FIELDS.filter((f) => f.type === 'money');
  assert.equal(moneyFields.length > 0, true);
  assert.equal(
    (src.match(/<MoneyInput\b/g) || []).length, moneyFields.length,
    `ทะเบียนมีช่องเงิน ${moneyFields.length} ช่อง — ฟอร์มต้องมี <MoneyInput> ครบเท่ากัน`,
  );
});

// 🐞 บทเรียนซ้ำสองรอบในไฟล์นี้: ของที่ต้อง "เดินสายไปด้วย" แล้วลืม จะหายเงียบ —
// `form.pdr` เคยไม่ถูกส่งไป API ทั้ง 21 ช่อง และ `context` เคยไม่ถูกส่งจากหน้าแก้
// แถวข้อ 2.2/2.3 (mig 0229) เดินสายแยกเหมือนบรีฟ จึงพังแบบเดียวกันได้อีก
test('⭐ แถว 2.2/2.3 ต้องถูกเดินสายครบทุกทาง — กรอก · ส่ง · แก้ · อ่าน · กระดาษ', () => {
  const wired = {
    // ฟอร์มรับแถวและส่งกลับ
    'src/components/requests/PdrForm.js': [/targets/, /onTargetsChange/],
    // สองที่ที่เรียก PdrForm ต้องส่งทั้งคู่ (หน้าเปิดใบ · หน้าแก้)
    'src/components/requests/RequestForm.js': [/targets=\{/, /onTargetsChange=\{/],
    'src/components/requests/details/ScentDevDetail.js': [/targets=\{/, /onTargetsChange=\{/],
    // payload ตอนสร้าง และตอนกดบันทึกในหน้ารายละเอียด
    'src/lib/master/requestCreate.js': [/pdrTargets/],
    'src/app/requests/[id]/page.js': [/pdrTargets/, /pdrTargetValuesFrom/],
    // ด่านฝั่ง server ทั้งสองทาง
    'src/app/api/sa/requests/route.js': [/normalizePdrTargets/],
    'src/app/api/sa/requests/[id]/route.js': [/normalizePdrTargets/],
    // โหลดแถวมากับใบ · จอสรุป · เอกสาร
    'src/lib/materialPricesAdmin.js': [/dept_request_pdr_targets/],
    'src/components/requests/PdrSummary.js': [/PDR_TARGET_KINDS/],
    'src/lib/requests/pdrDocument.js': [/PDR_TARGET_KINDS/],
  };
  for (const [file, patterns] of Object.entries(wired)) {
    const src = readFileSync(file, 'utf8');
    for (const re of patterns) assert.match(src, re, `${file}: ขาด ${re}`);
  }
});

test('⭐ ไม่มีจอไหนเขียนป้ายของตัวเองซ้ำอีก', () => {
  // ป้ายที่เคยเพี้ยนกันจริงในสามจอ — ต้องไม่มีตัวไหนถูกพิมพ์ตายไว้ในไฟล์อื่น
  const DRIFTED = ['Target Cost / Unit', 'ข้อมูลลูกค้าและคำขอ', 'วันที่ต้องการจำหน่ายสินค้า'];
  for (const file of [
    'src/components/requests/PdrForm.js',
    'src/components/requests/PdrSummary.js',
    'src/lib/requests/pdrDocument.js',
  ]) {
    const src = readFileSync(file, 'utf8');
    for (const text of DRIFTED) assert.ok(!src.includes(text), `${file}: ยังมี "${text}"`);
  }
});

test('เอกสารพิมพ์ป้ายไทยของ enum ไม่ใช่รหัสในระบบ', () => {
  const html = renderPdrDocument({
    request: {
      docNo: 'SB-26080001', status: 'acknowledged', customerName: 'ลูกค้า ก',
      pdrRequestType: 'new_product', pdrCustomerKind: 'existing', pdrTexture: 'premium',
    },
    briefs: [],
    company: {},
    form: {},
  });
  for (const raw of ['new_product', 'existing', 'premium']) {
    assert.ok(!html.includes(`>${raw}<`), `เอกสารยังพิมพ์ค่าดิบ "${raw}"`);
  }
  for (const label of ['New Product', 'ลูกค้าเก่า', 'PREMIUM']) {
    assert.ok(html.includes(label), `เอกสารต้องมี "${label}"`);
  }
});

// ── ช่องที่ขาดจากฟอร์มกระดาษ (mig 0218) ──────────────────────────────────
//
// ⚠️ ทั้งหมดนี้มาจากการไล่เทียบทะเบียนกับ PDF ของ FM-RD-01 Rev.02 ทีละข้อ
test('ครบทุกข้อที่เคยขาดจากฟอร์มกระดาษ', () => {
  const keys = PDR_FIELDS.map((f) => f.key);
  for (const key of [
    'coordinator',        // ผู้ร้องขอ AC
    'department',         // แผนก — เคยมีบนเอกสารแล้วหล่นตอนรวมทะเบียน (#1055)
    'prevProductCode',    // รหัสสินค้า/ลูกค้าก่อนหน้า
    'sampleDue',          // วันที่คาดหวังกำหนดส่งตัวอย่างกลิ่น
    'contactName', 'contactPhone',            // 1.1 · 1.2
    'packagingForms', 'packagingArtwork',     // 2.8
    'vpAttribute', 'vpBenefit', 'vpValue',    // 2.9
    'documents', 'exportDocNote',             // Regulatory
  ]) assert.ok(keys.includes(key), `ขาดช่อง ${key}`);
});

test('ช่องติ๊กหลายตัวแสดงเป็นป้ายไทยคั่นด้วย · · ว่างคืน null', () => {
  const docs = PDR_FIELDS.find((f) => f.key === 'documents');
  assert.equal(pdrFieldText(docs, { pdrDocuments: ['coa', 'halal'] }), 'COA · ฮาลาล (Halal)');
  assert.equal(pdrFieldText(docs, { pdrDocuments: [] }), null);
  assert.equal(pdrFieldText(docs, {}), null);
});

// ── ทุกวันที่บนกระดาษ PDR เป็น DD/MM/YYYY ค.ศ. ─────────────────────────
// มติผู้ใช้ 2026-08-10 · เดิมหลุด ISO ดิบออกกระดาษ 4 จุด เพราะทางเดินต่างกัน:
// หัวใบผ่าน `requestedAtText` · วันคาดหวังผ่าน `sampleDueText` · ส่วนข้อ 1.13/1.14
// เป็น `type: 'date'` ที่ไม่มี case ของตัวเอง เลยตกไปที่ `String(raw)` ท้ายฟังก์ชัน
// ⚠️ ค.ศ. ไม่ใช่ พ.ศ. — พ.ศ. ใช้เฉพาะ "วันที่มีผล" ของเอกสารควบคุมเท่านั้น
test('⭐ วันที่บนกระดาษ PDR เป็น DD/MM/YYYY ค.ศ. ทุกจุด ไม่มี ISO ดิบหลุด', () => {
  const req = {
    submittedAt: '2026-08-08T14:20:00Z',
    requestedDueDate: '2026-08-20',
    pdrWantedAt: '2026-09-01',
    pdrSellFrom: '2026-12-25',
  };
  const ctx = pdrContext({ request: req });
  const textOf = (key) => pdrFieldText(PDR_FIELDS.find((f) => f.key === key), req, ctx);

  assert.equal(textOf('requestedAt'), '08/08/2026');   // หัวใบ
  assert.equal(textOf('sampleDue'), '20/08/2026');
  assert.equal(textOf('wantedAt'), '01/09/2026');      // ข้อ 1.13
  assert.equal(textOf('sellFrom'), '25/12/2026');      // ข้อ 1.14

  for (const key of ['requestedAt', 'sampleDue', 'wantedAt', 'sellFrom']) {
    assert.doesNotMatch(String(textOf(key)), /\d{4}-\d{2}-\d{2}/, `${key} ยังพิมพ์ ISO ดิบ`);
  }
});

test('ช่องวันที่ที่ยังไม่มีค่า ต้องคืน null (N/A) ไม่ใช่ "-"', () => {
  // `fmtDate(null)` คืน "-" ซึ่งบนกระดาษอ่านเหมือน "ไม่มีวัน" ทั้งที่ความหมายคือ
  // "ยังไม่ถึงขั้นที่มีวัน" (ร่างที่ยังไม่กดส่ง) ⇒ ต้องกันไว้ก่อนเรียก fmtDate
  const draft = { createdAt: '2026-08-05T09:00:00Z' };
  const ctx = pdrContext({ request: draft });
  assert.equal(pdrFieldText(PDR_FIELDS.find((f) => f.key === 'requestedAt'), draft, ctx), null);
  assert.equal(pdrFieldText(PDR_FIELDS.find((f) => f.key === 'wantedAt'), draft, ctx), null);
  assert.equal(pdrFieldText(PDR_FIELDS.find((f) => f.key === 'sampleDue'), draft, ctx), null);
});

test('วันคาดหวังตัวอย่างอ่านจาก requestedDueDate เดิม ไม่ใช่คอลัมน์ใหม่', () => {
  // ⚠️ เก็บซ้ำอีกช่องเมื่อไรก็ได้สองวันที่ขัดกันโดยไม่มีใครรู้ว่าอันไหนจริง
  const f = PDR_FIELDS.find((x) => x.key === 'sampleDue');
  assert.equal(f.column, undefined);
  assert.equal(pdrFieldText(f, { requestedDueDate: '2026-08-20' }), '20/08/2026');
  assert.equal(pdrFieldText(f, { requestedDueDate: '2026-08-20', urgent: true }), '20/08/2026 · ด่วน');
  assert.equal(pdrFieldText(f, {}), null);
});

test('ช่องที่ขึ้นตามเงื่อนไข — ซ่อนบนฟอร์มเท่านั้น ไม่ลบค่า', () => {
  const prev = PDR_FIELDS.find((f) => f.key === 'prevProductCode');
  assert.equal(pdrFieldVisible(prev, { requestType: 'modification' }), true);
  assert.equal(pdrFieldVisible(prev, { requestType: 'cost_reduction' }), true);
  assert.equal(pdrFieldVisible(prev, { requestType: 'new_product' }), false);

  const exp = PDR_FIELDS.find((f) => f.key === 'exportDocNote');
  assert.equal(pdrFieldVisible(exp, { documents: ['export'] }), true);
  assert.equal(pdrFieldVisible(exp, { documents: ['coa'] }), false);
  assert.equal(pdrFieldVisible(exp, {}), false);

  // ⚠️ จอแสดง/เอกสารไม่ผ่านด่านนี้ — ค่าที่ยังอยู่ต้องเห็นเสมอ ไม่งั้นข้อมูลหายจาก
  // สายตาทั้งที่ยังอยู่ในฐานข้อมูล (เช่นเปลี่ยนประเภทคำขอทีหลัง)
  const spec = PDR_SECTIONS.find((s) => s.key === 'request');
  const rows = pdrSectionRows(spec, { pdrRequestType: 'new_product', pdrPrevProductCode: 'FG-001' });
  assert.ok(rows.some(([, v]) => v === 'FG-001'));
});

test('⭐ ติ๊กว่ามีภาพประกอบแล้วต้องแนบจริง — บังคับตอนกดส่ง ไม่ใช่ตอนเปิดใบ', () => {
  const has = { packagingArtwork: 'has' };
  // ตอนเปิดใบยังแนบไม่ได้ (ไฟล์ต้องมี id ของคำร้องก่อน) ⇒ ต้องไม่บล็อก
  assert.equal(pdrArtworkError(has, { attachmentCount: 0 }), null);
  assert.match(pdrArtworkError(has, { attachmentCount: 0, stage: 'submit' }), /ต้องแนบไฟล์ภาพ/);
  assert.equal(pdrArtworkError(has, { attachmentCount: 1, stage: 'submit' }), null);
  assert.equal(pdrArtworkError({ packagingArtwork: 'none' }, { stage: 'submit' }), null);
  assert.equal(pdrArtworkError({}, { stage: 'submit' }), null);
});

test('ค่าที่ระบบเติมให้มาจากโครงการและทะเบียนลูกค้า', () => {
  const ctx = pdrContext({
    request: { requestedByName: 'คนกดปุ่ม', customerName: 'ลูกค้า ก' },
    project: { aeOwner: 'ผู้ดูแล AE', acOwner: 'ผู้ประสานงาน AC' },
    customer: { contacts: [{ name: 'คุณเอ', phone: '0812345678', line: '@aei' }] },
    deal: { code: 'D-26080001' },
    briefs: [{ id: 'B1' }],
  });
  assert.equal(ctx.requester, 'ผู้ดูแล AE');
  assert.equal(ctx.coordinator, 'ผู้ประสานงาน AC');
  assert.equal(ctx.contactName, 'คุณเอ');
  assert.equal(ctx.contactPhone, '0812345678 · @aei');
  assert.equal(ctx.deal, 'D-26080001');

  // ⚠️ โครงการยังไม่ระบุ AE → ถอยไปใช้คนเปิดใบ (ช่องว่างบนเอกสารที่ต้องมีคน
  // รับผิดชอบเสมอ แย่กว่าชื่อที่ใกล้ความจริงที่สุด) · AC ไม่มีทางถอย ปล่อยว่าง
  const bare = pdrContext({ request: { requestedByName: 'คนกดปุ่ม' } });
  assert.equal(bare.requester, 'คนกดปุ่ม');
  assert.equal(bare.coordinator, null);

  // ผู้ติดต่อรุ่นเก่าที่ยังไม่ย้ายไป contacts[] (0033) ต้องยังอ่านได้
  const legacy = pdrContext({ customer: { contactPerson: 'คุณบี', contactPhone: '021234567' } });
  assert.equal(legacy.contactName, 'คุณบี');
  assert.equal(legacy.contactPhone, '021234567');
});

test('🐞 หน้าเปิดคำร้องกับหน้ารายละเอียดต้องได้ค่าเติมเองชุดเดียวกัน', () => {
  // ก่อนหน้านี้หน้าเปิดคำร้องส่งแค่ customer/deal ⇒ AC · ผู้ติดต่อ · วันคาดหวัง
  // ค้างเป็นเส้นประ "เติมจาก…" ทั้งที่เลือกใบสั่งขายแล้ว ส่วนอีกสองจอเติมครบ
  const args = {
    request: { requestedDueDate: '2026-08-20', urgent: true, customerName: 'ลูกค้า ก' },
    project: { aeOwner: 'ผู้ดูแล AE', acOwner: 'ผู้ประสานงาน AC' },
    customer: { contacts: [{ name: 'คุณเอ', phone: '0812345678' }] },
    deal: { code: 'D-1' },
    briefs: [{ id: 'B1' }],
  };
  const ctx = pdrContext(args);
  assert.equal(ctx.sampleDue, '20/08/2026 · ด่วน');

  // ค่าที่ context ให้มา ต้องเป็นค่าเดียวกับที่จอแสดง/เอกสารอ่านผ่าน pdrFieldText
  for (const key of ['requester', 'coordinator', 'contactName', 'contactPhone', 'sampleDue']) {
    const field = PDR_FIELDS.find((f) => f.key === key);
    assert.equal(pdrFieldText(field, args.request, ctx), ctx[key], key);
  }
});

test('ด่วนแต่ยังไม่ระบุวัน ต้องยังขึ้นให้เห็นว่าด่วน', () => {
  assert.equal(pdrContext({ request: { urgent: true } }).sampleDue, 'ยังไม่ระบุวัน · ด่วน');
  assert.equal(pdrContext({ request: {} }).sampleDue, null);
});

// ── ครบตามฟอร์มกระดาษ FM-RD-01 Rev.02 (ผู้ใช้ส่งไฟล์มาเทียบ 2026-08-07) ────
//
// ⚠️ **ratchet ของ "ต้องมีคำถามทั้งหมด"** — ฟอร์มกระดาษเป็นสัญญากับคนที่กรอกอยู่
// ทุกวัน · ช่องที่หายไปเงียบ ๆ แปลว่าเขากรอกลงกระดาษได้แต่พิมพ์จากระบบแล้วหาย
test('ทุกข้อของฟอร์มกระดาษมีที่เก็บในทะเบียน', () => {
  const keys = new Set(PDR_FIELDS.map((f) => f.key));
  const required = [
    // Request Information
    'requester', 'coordinator', 'department', 'requestType', 'prevProductCode',
    'sampleDue', 'urgentReason',
    // 1. Customer Information (1.1–1.14)
    'contactName', 'contactPhone', 'customer', 'customerBrand', 'moodTone',
    'brandDirection', 'shipTo', 'customerKind', 'projectValue',
    'targetDemographic', 'targetPsychographic', 'targetPainpoint',
    'productKind', 'scentCount', 'wantedAt', 'sellFrom',
    // 2. Product Specifications (2.2–2.10 · 2.1.x อยู่ที่บรีฟรายกลิ่น)
    'targetCost', 'targetPrice', 'moq', 'texture', 'color', 'packSize',
    'packagingForms', 'packagingArtwork', 'vpAttribute', 'vpBenefit', 'vpValue',
    'brandSample',
    // Regulatory & Compliance
    'documents', 'exportDocNote', 'specialRequirements',
    // Final Review & Approval
    'signSalesManager', 'signPerfumer', 'signChemist', 'signCoordinator', 'signFinalApprover',
  ];
  const missing = required.filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `ขาดคำถามจากฟอร์มกระดาษ: ${missing.join(', ')}`);
});

test('2.9 Value Proposition เป็น "ติ๊กแล้วเขียนต่อ" ตามกระดาษ ไม่ใช่ช่องเปล่า', () => {
  // กระดาษมีช่องติ๊กหน้าทั้งสามคำ เหมือนข้อ 1.10 ⇒ ทำเป็นช่องข้อความเปล่าจะเสีย
  // ข้อมูลว่า "ข้อไหนลูกค้าสนใจ" ตอนที่ยังไม่ได้เขียนรายละเอียด
  for (const key of ['vpAttribute', 'vpBenefit', 'vpValue']) {
    const f = PDR_FIELDS.find((x) => x.key === key);
    assert.equal(f.type, 'tick', key);
    assert.equal(f.group, 'Value Proposition', key);
  }
});

// ── หมวดสินค้า: รหัสในฐานข้อมูล ชื่อบนจอ ─────────────────────────────────
//
// 🐞 ผู้ใช้ทักมาเอง (2026-08-09): เพิ่มหมวดในฟอร์มแล้วป้ายขึ้น "01-005 อโรม่าออยล์"
// แต่จอสรุปกับเอกสารพิมพ์ "01-005 · 01-003" เปล่า ๆ เพราะทะเบียนหมวดไม่ได้เดินทาง
// ไปถึงสองที่นั้น ⇒ ทะเบียนต้องอยู่ใน `pdrContext` ตัวกลาง ไม่ใช่ต่างจอต่างเดินสาย
const CATEGORY_REGISTRY = [
  { mainCategoryCode: '01', typeCode: '005', nameTh: 'อโรม่าออยล์' },
  { mainCategoryCode: '01', typeCode: '003', nameTh: 'เทียนหอม' },
];

test('⭐ ป้ายหมวดสินค้ามาจากทะเบียนใน context — ไม่ใช่รหัสเปล่า', () => {
  const field = PDR_FIELDS.find((f) => f.key === 'productKinds');
  const request = { pdrProductKinds: ['01-005', '01-003'] };
  assert.equal(
    pdrFieldText(field, request, pdrContext({ categories: CATEGORY_REGISTRY })),
    '01-005 อโรม่าออยล์ · 01-003 เทียนหอม',
  );
  // ⚠️ ไม่มีทะเบียน = พิมพ์รหัสดิบ ไม่ใช่ค่าว่าง — ใบที่มีข้อมูลต้องอ่านออกเสมอ
  assert.equal(pdrFieldText(field, request, {}), '01-005 · 01-003');
});

test('⭐ ช่อง legacy ที่ว่างต้องไม่ติดไปบนกระดาษ — ทั้งแบบรายแถวและแบบจัดกลุ่ม', () => {
  const section = PDR_SECTIONS.find((s) => s.key === 'customer');
  const legacyField = PDR_FIELDS.find((f) => f.key === 'productKind');
  assert.equal(legacyField.legacy, true, 'productKind ต้องยังเป็นช่อง legacy');

  const empty = { pdrProductKinds: ['01-005'] };
  const groupTitles = (request) => pdrSectionGroups(section, request, {})
    .flatMap((g) => g.fields.map((f) => f.key));
  assert.ok(!groupTitles(empty).includes('productKind'), 'ใบใหม่ต้องไม่มีบรรทัด legacy');
  assert.ok(
    !pdrSectionRows(section, empty, { includeEmpty: true })
      .some(([label]) => label === legacyField.label),
  );

  // ใบเก่าที่มีค่าจริงต้องยังอ่านได้ทั้งสองทาง
  const old = { pdrProductKind: 'ครีมบำรุงผิว' };
  assert.ok(groupTitles(old).includes('productKind'));
  assert.ok(
    pdrSectionRows(section, old, { includeEmpty: true })
      .some(([label, value]) => label === legacyField.label && value === 'ครีมบำรุงผิว'),
  );
});

test('🐞 ช่องที่เก็บเป็นอาเรย์ต้องกลับมาเป็นอาเรย์ตอนเปิดโหมดแก้ — ไม่ใช่สตริง', () => {
  // ของจริง: `pdrValuesFrom` รู้จักแต่ `multi` ⇒ ช่องชนิด `categories` ถูก String()
  // ⇒ ฟอร์มเรียก `.map()` บนสตริง ⇒ **กดแก้แล้วเข้าหมวดข้อมูลลูกค้า จอพังทั้งหมวด**
  const row = { pdrProductKinds: ['01-005', '01-003'], pdrDocuments: ['coa'] };
  const values = pdrValuesFrom(row);
  for (const field of PDR_FIELDS.filter((f) => f.column && pdrIsArrayField(f))) {
    assert.ok(Array.isArray(values[field.key]), `${field.key} ต้องเป็นอาเรย์`);
  }
  assert.deepEqual(values.productKinds, ['01-005', '01-003']);
  // ใบเก่าที่คอลัมน์ยังว่าง (ก่อน mig 0227) ต้องได้อาเรย์ว่าง ไม่ใช่ ""
  assert.deepEqual(pdrValuesFrom({}).productKinds, []);
});

test('⭐ เลือกหมวดหัวน้ำหอมแล้วช่อง "นำไปใช้กับอะไร" ต้องโผล่ — หมวดอื่นต้องไม่โผล่', () => {
  // โน้ตสีแดงข้อ 1.11 บนกระดาษเคยเป็นแค่คำขยายป้าย ไม่มีที่ให้ตอบ (มติผู้ใช้ 2026-08-09)
  const field = PDR_FIELDS.find((f) => f.key === 'fragranceUse');
  assert.equal(pdrFieldVisible(field, { productKinds: [PDR_FRAGRANCE_OIL_CODE] }), true);
  assert.equal(pdrFieldVisible(field, { productKinds: ['01-003'] }), false);
  // เลือกหลายหมวดโดยมีหัวน้ำหอมอยู่ด้วย ก็ต้องโผล่
  assert.equal(pdrFieldVisible(field, { productKinds: ['01-003', PDR_FRAGRANCE_OIL_CODE] }), true);
  assert.equal(pdrFieldVisible(field, {}), false);
});
