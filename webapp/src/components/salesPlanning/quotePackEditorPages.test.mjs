// ── ยามของช่อง "แพ็ค/เดือน" บนสองหน้าของใบเสนอราคา (งวด PR-3 · docs/qt-pack-column.md) ─────────────────────────
//
// ⭐ มติเจ้าของ 08/10 ข้อ A2 "บังคับใส่" · A4 "เมื่อแก้หรือออก Rev." + ข้อวินิจฉัย 2–5:
//   หน้าสร้าง (/sa/quotations/new) และหน้าใบ (/sa/quotations/[id]) ต้องถามด่านฝั่งจอตัวเดียวกัน (`useQuoteLinePackGate`) **ก่อน** ส่งคำขอ
//   · แดงหลังกดเท่านั้น · ข้อความคิดสด ไม่คัดลอกลง error ของหน้า · หน้าไม่เขียนเลขแพ็คเอง · "ออก Rev." ไม่ถูกกั้น (ก๊อปบรรทัดตามที่เป็น)
// 🔴 ยาม source (ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React) — พฤติกรรมของกฎอยู่ที่ lib/sales/linePackEdit.test.mjs ·
//   พฤติกรรมบนจอจริงพิสูจน์ด้วย bundle ของหน้าตัวจริงใน Chrome (~/ss-team/mockups/qt-pack-column/pr3-proof/screen)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LINE_PACK_TEXT } from '../../lib/sales/linePacks.js';
import { LINE_PACK_EDIT_TEXT } from '../../lib/sales/linePackEdit.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const NEW_PAGE = 'app/sales-planning/quotations/new/page.js';
const QUOTE_PAGE = 'app/sales-planning/quotations/[id]/page.js';
const HOOK = 'components/salesPlanning/useQuoteLinePackGate.js';
const INSTALLMENTS = 'components/salesPlanning/QuotationInstallments.js';

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หาตัวปิด "${to}" หลัง "${from}" ไม่เจอ`);
  return text.slice(start, end);
}
const before = (text, first, second) => {
  const a = text.indexOf(first); const b = text.indexOf(second);
  assert.ok(a >= 0, `หา "${first}" ไม่เจอ`); assert.ok(b >= 0, `หา "${second}" ไม่เจอ`);
  return a < b;
};

test('⭐ สองหน้าเรียก hook ตัวเดียว (ฟอร์มแก้ = ฟอร์มสร้าง) ด้วยบรรทัดและลิสต์สินค้าของหน้าเอง · ส่ง errorsShown ลงตาราง · ไม่เขียนเลขแพ็คเอง · ไม่มี fetch ดิบ', () => {
  const created = code(NEW_PAGE);
  const quote = code(QUOTE_PAGE);
  assert.match(created, /import useQuoteLinePackGate, \{ PACK_GATE_NOTICE_PROPS \} from "@\/components\/salesPlanning\/useQuoteLinePackGate";/);
  assert.match(quote, /import useQuoteLinePackGate, \{ PACK_GATE_NOTICE_PROPS \} from "@\/components\/salesPlanning\/useQuoteLinePackGate";/);
  /* หน้าสร้างแก้ได้เสมอ · หน้าใบส่ง "ตารางเปิดแก้อยู่ไหม" ตัวเดียวกับที่ส่งให้ตาราง */
  assert.match(created, /const packGate = useQuoteLinePackGate\(lines, products, \{ editing: true \}\);/);
  /* ⭐ ย้ายโดยเจตนา (รีวิวจอ 09/10 · มติเจ้าของ 08/10 ข้อ A4 + ข้อวินิจฉัย 5): หน้าใบส่งอีกสองอย่าง —
     `storedLines` (บรรทัดที่เก็บไว้: บรรทัดเก่าตัดสินจากแถวที่เก็บ ไม่ใช่จากยอด) และ `scope` (ใบ + สถานะอนุมัติ + สถานะใบ:
     เปลี่ยนเมื่อไรแถบของการกดครั้งก่อนดับ — ข้อความของแถบเอ่ยชื่อปุ่ม จึงอยู่ได้เท่าที่ปุ่มนั้นยังอยู่บนหน้า) */
  assert.match(quote, /const packGate = useQuoteLinePackGate\(lines, products, \{\s*editing: editable,\s*storedLines: quote\?\.lines,\s*scope: `\$\{id\}\|\$\{quote\?\.approvalStatus \|\| ""\}\|\$\{quote\?\.status \|\| ""\}`,\s*\}\);/);
  /* ตารางของหน้าใบได้แถวที่เก็บชุดเดียวกับ hook (ยอดในตารางกับยอดรวมของหน้าต้องตัดสินตรงกัน) · หน้าสร้างไม่มีบรรทัดที่เก็บ */
  assert.match(slice(quote, '<QuotationLineItems', '/>'), /\n\s*storedLines=\{quote\?\.lines\}\n/);
  assert.doesNotMatch(created, /storedLines/);
  for (const [file, src] of [[NEW_PAGE, created], [QUOTE_PAGE, quote]]) {
    assert.equal((src.match(/useQuoteLinePackGate\(/g) || []).length, 1, `${file}: hook ถูกเรียกครั้งเดียว`);
    const table = slice(src, '<QuotationLineItems', '/>');
    assert.match(table, /\n\s*packErrorsShown=\{packGate\.errorsShown\}\n/, `${file}: ตารางต้องได้ packErrorsShown`);
    /* หน้าไม่แตะเลขแพ็ค — บรรทัดเดินทางไปกับ payload เดิมทั้งก้อน (ตัวเขียนเดียวอยู่ในเซลล์กลาง · ยาม GE) */
    assert.doesNotMatch(src, /\bpackQty\b/, `${file}: หน้าไม่เอ่ยคีย์ packQty เลย`);
    assert.doesNotMatch(src, /(?<![\w.$])fetch\(/, `${file}: จอเรียก API ผ่าน apiFetch เท่านั้น`);
    assert.doesNotMatch(src, /retry:\s*true/, `${file}: คำขอเขียนไม่ลองใหม่`);
    /* 🔴 §12 C5: ข้อความของด่านฝั่งจอไม่ถูกคัดลอกลง error ของหน้า (เลขรายการจะค้างเมื่อแก้/ลบแถว) — แถบของมันอ่านจาก hook ทุกครั้งที่วาด */
    assert.doesNotMatch(src, /setError\([^)]*(?:packGate|linePack|notice)/, `${file}: ห้าม setError ด้วยข้อความของช่องแพ็ค/เดือน`);
    assert.doesNotMatch(src, /linePackMessage|linePackGateMessage|linePackIssues|quoteLinesPackView|packGateNotice/, `${file}: หน้าไม่คิดข้อความ/ข้อค้างเอง — ถาม hook`);
    assert.match(src, /\{packGate\.notice\.text\}/, `${file}: แถบแจ้งวาดข้อความสดของ hook`);
    assert.match(src, /\{\.\.\.PACK_GATE_NOTICE_PROPS\}/, `${file}: กล่องของแถบแจ้งมีป้ายให้ hook เลื่อนเข้ามาในจอ`);
  }
});

test('⭐ หน้าสร้าง: ด่านแพ็ค/เดือนเป็นด่านสุดท้ายก่อนส่งคำขอ · หยุดแล้วไม่มีคำขอ · ยอดรวมทุกจุดขึ้นขีดขณะยังมีบรรทัดที่ไม่มียอด', () => {
  const src = code(NEW_PAGE);
  const create = slice(src, 'const create = useCallback(async () => {', '}, [dealId, selectedDeal,');
  assert.match(create, /if \(!markPackGate\(\)\) \{\s*setError\(""\);\s*return;\s*\}/);
  /* ลำดับ: ด่านเดิมของหน้า (ที่อยู่/ผู้ติดต่อ · งวดชำระ) → ด่านแพ็ค/เดือน → คำขอ — ข้อความเดียวต่อการกดหนึ่งครั้ง ตามลำดับเดิมของหน้า */
  assert.ok(before(create, 'if (unpicked.length) {', 'if (!markPackGate()) {'));
  assert.ok(before(create, 'if (!paymentValidation.ok) {', 'if (!markPackGate()) {'));
  assert.ok(before(create, 'if (!markPackGate()) {', 'setCreating(true);'));
  assert.ok(before(create, 'if (!markPackGate()) {', 'apiFetch(`/api/sales-planning/deals/${dealId}/quotations`'));
  assert.equal((create.match(/apiFetch\(/g) || []).length, 1);
  assert.match(src, /const markPackGate = packGate\.mark;/);
  const depsAt = src.indexOf('}, [dealId, selectedDeal,');
  assert.match(src.slice(depsAt, src.indexOf(']);', depsAt)), /\brouter, markPackGate$/, 'create ต้องเห็นด่านรุ่นล่าสุด (deps)');
  /* payload ไม่ถูกแตะ: บรรทัดถูก spread ทั้งก้อน (เลขแพ็คเป็นข้อความที่พิมพ์ เดินทางไปเอง) */
  assert.match(create, /lines: lines\.map\(\(\{ _lineKind, _noteOpen, \.\.\.line \}\) => \{/);
  assert.match(create, /return \{ \.\.\.line, metadata \};/);
  /* ยอด: การ์ดสรุป · แถวสรุป · งวดชำระ อ่าน packPending */
  assert.match(src, /const packPending = packGate\.pending;/);
  assert.match(src, /total=\{packPending \? NA : fmtMoney\(totals\.totalAmount\)\}/);
  assert.match(src, /\{ id: "subtotal", label: "รวมรายการ", value: packPending \? NA : fmtMoney\(totals\.subtotal\) \},/);
  assert.match(src, /<QuotationInstallments value=\{payment\} onChange=\{setPayment\} totalAmount=\{packPending \? null : totals\.totalAmount\} \/>/);
  /* แถบของด่าน: ผิวเดียวกับ error ของหน้านี้ (errorPanel · role="alert") ต่อจากแถบ error เดิม */
  assert.match(src, /\{error && <div className=\{styles\.errorPanel\} role="alert">\{error\}<\/div>\}\s*(?:\{\s*\}\s*)?\{packGate\.notice && <div \{\.\.\.PACK_GATE_NOTICE_PROPS\} className=\{styles\.errorPanel\} role="alert">\{packGate\.notice\.text\}<\/div>\}/);
});

test('⭐ หน้าใบ: บันทึก · ยื่นอนุมัติ · อนุมัติ ถามด่านก่อนเปิดโมดัล/ส่งคำขอ — แต่ละปุ่มใช้ action ของตัวเอง · ออก Rev. ไม่ถูกถาม', () => {
  const src = code(QUOTE_PAGE);
  /* บันทึก: ก่อน setConfirmState (ไม่เปิดโมดัล ไม่ส่งคำขอ) */
  const saveAction = slice(src, 'label: ["save", "revise"].includes(busy) ? "กำลังบันทึก…" : "บันทึก",', ': needsSubmit && canEditDocument');
  assert.match(saveAction, /onClick: \(\) => \{\s*if \(!packGate\.mark\(\)\) \{ setError\(""\); return; \}/);
  assert.ok(before(saveAction, 'if (!packGate.mark()) {', 'setConfirmState({'));
  assert.equal((saveAction.match(/setConfirmState\(/g) || []).length, 1);
  /* ยื่นอนุมัติ: หลังด่าน "ยังไม่บันทึก" เดิม ก่อนโมดัล */
  const submit = slice(src, 'const submitForApproval = () => {', '\n  };');
  assert.ok(before(submit, 'if (dirty) {', 'if (!packGate.mark("submit")) {'));
  assert.match(submit, /if \(!packGate\.mark\("submit"\)\) \{ setError\(""\); return; \}\s*setConfirmState\(\{/);
  /* อนุมัติ: ผู้อนุมัติที่เป็นคนยื่นเองได้ข้อความของปุ่ม "ดึงกลับมาแก้ไข" (ไม่มีปุ่ม "ตีกลับให้แก้ไข" — §12 C3) — ตัวเลือกเดียวกับ route */
  const approve = slice(src, 'const approve = () => {', '\n  };');
  assert.ok(before(approve, 'if (dirty) {', 'if (!packGate.mark('));
  assert.match(approve, /if \(!packGate\.mark\(canWithdrawSubmission \? "approveOwn" : "approve"\)\) \{ setError\(""\); return; \}\s*setConfirmState\(\{/);
  assert.match(src, /const canWithdrawSubmission = canWithdrawQuotationSubmission\(quote, \{ userId: quote\?\.meId \}\);/);
  /* ทั้งหน้า: ด่านถูกถามสามจุดนี้เท่านั้น */
  assert.deepEqual([...src.matchAll(/packGate\.mark\(([^)]*)\)/g)].map((m) => m[1]), ['"submit"', 'canWithdrawSubmission ? "approveOwn" : "approve"', '']);
  /* 🔴 ออก Rev. ไม่ถูกกั้น (มติข้อ 3: ก๊อปบรรทัดตามที่เป็น — ด่านทักตอนบันทึก/ยื่นร่างฉบับใหม่) และ payload ของมันไม่ถูกแตะ */
  const revise = slice(src, 'const saveAsRevision = async () => {', '\n  };');
  assert.doesNotMatch(revise, /packGate|mark\(/);
  assert.match(revise, /body: JSON\.stringify\(quotationPayload\(\{/);
  const payload = slice(src, 'const quotationPayload = (extra = {}) => ({', '\n  });');
  assert.match(payload, /const payloadLine = \{ \.\.\.line \};/);
  /* ทางที่ไม่ถูกกั้นอื่น ๆ (รับใบ · ย้อนการรับ · ดึงกลับ · ตีกลับ · ยกเลิก · ลบ) ไม่ถามด่าน */
  for (const name of ['withdrawSubmission', 'rejectSubmission', 'doUnaccept', 'doCancel', 'doDelete', 'doAccept']) {
    const at = src.indexOf(`const ${name} = `);
    assert.ok(at >= 0, name);
    assert.doesNotMatch(src.slice(at, src.indexOf('\n  };', at)), /packGate/, `${name}: ทางนี้ไม่ถูกกั้นด้วยเลขแพ็ค`);
  }
});

test('⭐ หน้าใบ: แถบแจ้งมีลิงก์ "แก้ไขข้อมูล" เฉพาะตอนกดยื่นจากโหมดอ่าน — ป้ายเดียวกับปุ่มจริงและกับข้อความของเซิร์ฟเวอร์ · ชื่อปุ่มในข้อความมีอยู่บนหน้า', () => {
  const src = code(QUOTE_PAGE);
  const notice = slice(src, '{packGate.notice && (', '\n      )}');
  assert.match(notice, /<div \{\.\.\.PACK_GATE_NOTICE_PROPS\}>\s*<StatusNotice\s+tone="error"/);
  /* ปุ่มกลาง (Button as={Link}) — ไม่เขียนคลาส btn ดิบ (ด่าน audit:ui rawButtonClass อยู่ที่เพดาน) */
  assert.match(notice, /action=\{packGate\.notice\.action === "submit" && canEditDocument\s*\? <Button as=\{Link\} href=\{`\/sa\/quotations\/\$\{id\}\?edit=1`\} variant="quiet" size="sm">แก้ไขข้อมูล<\/Button>\s*: null\}/);
  /* ลิงก์ = ปลายทางและป้ายเดียวกับปุ่ม "แก้ไขข้อมูล" ของการ์ดจัดการเอกสาร */
  assert.match(src, /id: "edit",\s*kind: "edit",\s*label: "แก้ไขข้อมูล",\s*variant: "outline",\s*visible: canEditDocument && !editMode,\s*href: `\/sa\/quotations\/\$\{id\}\?edit=1`,/);
  assert.ok(LINE_PACK_TEXT.beforeSubmit.includes('“แก้ไขข้อมูล”'));
  assert.match(src, /label: "ตีกลับให้แก้ไข",/);
  assert.ok(LINE_PACK_TEXT.beforeApprove.includes('“ตีกลับให้แก้ไข”'));
  assert.match(code('components/ui/ActionButtons.js'), /withdraw: \{[^}]*label: "ดึงกลับมาแก้ไข" \}/);
  assert.ok(LINE_PACK_TEXT.beforeApproveOwn.includes('“ดึงกลับมาแก้ไข”'));
  /* แถบของด่านอยู่ต่อจากแถบ error เดิม ก่อนแถบตีกลับ */
  assert.ok(before(src, '{error && (', '{packGate.notice && ('));
  assert.ok(before(src, '{packGate.notice && (', '{rejectionNotice && ('));
});

test('⭐ §12 C11 หน้าใบ: ยอดรวมของหน้าขึ้นขีดเฉพาะตอนตารางเปิดแก้ — โหมดอ่าน/จออนุมัติคงนิพจน์เดิมทุกตัว', () => {
  const src = code(QUOTE_PAGE);
  assert.match(src, /const packPending = editable && packGate\.pending;/);
  assert.equal((src.match(/packGate\.pending/g) || []).length, 1, 'อ่าน pending จุดเดียว — ผ่าน packPending ที่คูณ editable แล้ว');
  assert.match(src, /total=\{packPending \? NA : money\(totals\.totalAmount\)\}/);
  assert.match(src, /\{ id: "subtotal", label: "รวมรายการ", value: packPending \? NA : money\(totals\.subtotal\) \},/);
  assert.match(src, /\{ id: "discount", label: "ส่วนลด", value: !packPending && totals\.discountAmount > 0 \? `-\$\{money\(totals\.discountAmount\)\}` : NA \},/);
  assert.match(src, /totalAmount=\{packPending \? null : totals\.totalAmount\}/);
  /* งวดชำระ: ยอดใบ null = ขีด ไม่ใช่ ฿0.00 · ค่าที่เป็นตัวเลข (รวม 0) = พฤติกรรมเดิม */
  assert.match(code(INSTALLMENTS), /<td className="num mono">\{totalAmount === null \? NA : fmtMoney\(amounts\[index\]\?\.amount \|\| 0\)\}<\/td>/);
});

test('⭐ §12 C6 คนกรอกเห็นก่อน–หลัง: โมดัลยืนยันบันทึกบอกผลต่อยอดรวมทั้งสิ้นของใบเก่า · โมดัลออก Rev. บอกว่าฉบับใหม่ต้องกรอก', () => {
  const src = code(QUOTE_PAGE);
  assert.match(src, /import \{ LINE_PACK_EDIT_TEXT, resplitTotalNote \} from "@\/lib\/sales\/linePackEdit";/);
  assert.match(src, /import \{ masterPriceUncertain \} from "@\/lib\/sales\/quoteLines";/);
  const save = slice(src, 'const totalNote = resplitTotalNote({', '});');
  /* เทียบกับของที่เก็บไว้ (quote.lines · quote.totalAmount) ไม่ใช่กับ state ที่กำลังแก้
     ⭐ ย้ายโดยเจตนา (รีวิวเงิน 09/10): เดิมธงคือ "ราคาทะเบียนขยับที่จอเห็น" (masterPriceDrift ≠ null) — สินค้าที่เพิ่งถูกแก้ราคาหลุดจากลิสต์ของหน้า
     (รออนุมัติ) ตัวนั้นจึงคืน null แล้วโมดัลพูด "ยอดรวมทั้งสิ้นเท่าเดิม" ทั้งที่เซิร์ฟเวอร์คิดราคาใหม่ตอนบันทึก ⇒ วันนี้ธงคือ "จอสัญญายอดไม่ได้"
     (masterPriceUncertain: ราคาขยับ **หรือ** จอไม่รู้ราคาทะเบียน) — พฤติกรรมยึดที่ linePackEdit.test.mjs ด้วยตัวคิดราคาของเซิร์ฟเวอร์ตัวจริง */
  assert.match(save, /storedLines: quote\.lines,/);
  assert.match(save, /storedTotal: quote\.totalAmount,/);
  assert.match(save, /nextTotal: totals\.totalAmount,/);
  assert.match(save, /priceUncertain: lines\.some\(\(line\) => masterPriceUncertain\(products\.find\(\(item\) => item\.id === line\.productId\) \|\| null, line\)\),/);
  assert.doesNotMatch(src, /priceDrift|masterPriceDrift/, 'หน้าใบไม่ใช้ธงเดิมที่มองไม่เห็นสินค้านอกลิสต์');
  assert.match(src, /detail: \["ระบบจะอัปเดตข้อมูลฉบับร่างปัจจุบัน", totalNote\]\.filter\(Boolean\)\.join\(" · "\),/);
  /* ออก Rev.: ประโยคเพิ่มเฉพาะใบที่มีบรรทัดหมวด 02-001 ยังไม่มีเลขแพ็ค (ปุ่มอยู่นอกโหมดแก้ — lines คือบรรทัดที่เก็บไว้) */
  assert.match(src, /const reviseNeedsPacks = packGate\.issues\.some\(\(issue\) => issue\.code === "required"\);/);
  assert.match(src, /detail=\{\["เอกสารที่อนุมัติแล้วแก้ไขตรงไม่ได้ Revision ใหม่จะต้องตรวจข้อมูลและยื่นอนุมัติอีกครั้ง", reviseNeedsPacks \? LINE_PACK_EDIT_TEXT\.reviseNote : null\]\.filter\(Boolean\)\.join\(" · "\)\}/);
  assert.match(src, /visible: canReviseDocument && !editMode,/, 'ปุ่มออก Rev. อยู่นอกโหมดแก้เท่านั้น');
  assert.equal(LINE_PACK_EDIT_TEXT.reviseNote, 'ฉบับใหม่ต้องกรอก “แพ็ค/เดือน” ของรายการหมวด 02-001 ก่อนยื่นอนุมัติ');
});

test('⭐ hook ของด่านฝั่งจอ: ข้อความคิดสด · โหมดแดงดับเองเมื่อไม่เหลือข้อ · โฟกัส/เลื่อนหลังวาด · ไม่แตะเลขแพ็ค ไม่เรียก API', () => {
  const src = code(HOOK);
  assert.match(read(HOOK), /^"use client";/);
  assert.match(src, /export default function useQuoteLinePackGate\(lines, products, \{ editing = false, storedLines = null, scope = "" \} = \{\}\) \{/);
  /* มุมมองเดียวจากกฎฝั่งจอ — ไม่ส่ง errorsShown (ตารางคิดข้อความแดงของตัวเองจากธงที่หน้าส่งต่อ) · ได้แถวที่เก็บชุดเดียวกับตาราง */
  assert.match(src, /const view = useMemo\(\(\) => quoteLinesPackView\(lines, products, \{ storedLines \}\), \[lines, products, storedLines\]\);/);
  /* 🔴 §12 C5: ไม่มี state ที่เก็บข้อความ — เก็บแค่ "ปุ่มที่กด" · ตัวนับโฟกัส · บริบทของการกด (โหมดแก้ + scope) แล้วคิดข้อความทุกครั้งที่วาด */
  assert.deepEqual([...src.matchAll(/useState\(([^)]*)\)/g)].map((m) => m[1]), ['null', '0', '{ editing, scope }']);
  assert.match(src, /notice: packGateNotice\(view, pressed, \{ editing \}\),/);
  assert.doesNotMatch(src, /setNotice|setMessage|useRef/);
  /* โหมดแดง: เปิดด้วยการกดที่เจอข้อค้างเท่านั้น · ดับเองเมื่อไม่เหลือข้อ (แถวที่เพิ่มทีหลังไม่แดงจนกดอีกครั้ง) */
  assert.match(src, /if \(pressed && !hasIssues\) setPressed\(null\);/);
  assert.match(src, /errorsShown: Boolean\(pressed\) && hasIssues,/);
  /* ⭐ ย้ายโดยเจตนา (รีวิวจอ 09/10 ui-stale-gate-notice): โหมดแดงเปิดได้ทางเดียวเหมือนเดิม (ใน mark()) แต่ **ดับได้สองทาง** —
     ไม่เหลือข้อ (เดิม) และบริบทของการกดจบ (ใหม่): ในโหมดอ่านข้อค้างแก้ไม่ได้ เดิมแถบจึงค้างตลอดกาลในสามทาง
     (กดบันทึกแล้วทิ้งการแก้ไข · ผู้อนุมัติตีกลับแล้ว · ผู้ยื่นดึงกลับแล้ว) และยังชี้ปุ่มที่ไม่อยู่บนหน้าแล้ว */
  assert.deepEqual([...src.matchAll(/setPressed\(([^)]*)\)/g)].map((m) => m[1]), ['null', 'null', 'action'], 'โหมดแดงเปิดได้ทางเดียว: ใน mark()');
  const ended = slice(src, 'if (context.editing !== editing || context.scope !== scope) {', '\n  }');
  /* จบเมื่อ scope เปลี่ยน หรือออกจากโหมดแก้ (true → false) — เข้าโหมดแก้ (false → true) ไม่นับ: ลิงก์ "แก้ไขข้อมูล" ของแถบหลังกดยื่นพาแถวที่ค้างแดงไปด้วย */
  assert.match(ended, /const pressEnded = context\.scope !== scope \|\| \(context\.editing && !editing\);\s*setContext\(\{ editing, scope \}\);\s*if \(pressed && pressEnded\) setPressed\(null\);/);
  assert.doesNotMatch(ended, /!context\.editing && editing/, 'เข้าโหมดแก้ไม่ดับโหมดแดง');
  const mark = slice(src, 'const mark = useCallback((action = "save") => {', '}, [hasIssues]);');
  assert.match(mark, /if \(!hasIssues\) return true;\s*setPressed\(action\);\s*setFocusRequest\(\(count\) => count \+ 1\);\s*return false;/);
  /* โฟกัสช่องแรกที่ต้องแก้หลัง commit (effect ที่ผูกกับตัวนับ) — โหมดอ่านไม่มีช่อง ⇒ เลื่อนแถบแจ้งเข้ามาในจอ */
  assert.match(src, /useEffect\(\(\) => \{\s*if \(!focusRequest\) return;\s*const input = document\.querySelector\(FIRST_OPEN_INPUT\);\s*if \(input\) \{ input\.focus\(\); return; \}\s*document\.querySelector\(`\[\$\{NOTICE_ATTRIBUTE\}\]`\)\?\.scrollIntoView\(\{ block: "center" \}\);\s*\}, \[focusRequest\]\);/);
  assert.match(src, /const FIRST_OPEN_INPUT = \["missing", "invalid", "stray"\]\.map\(\(state\) => `td\[data-pack-state="\$\{state\}"\] input`\)\.join\(", "\);/);
  assert.match(src, /export const PACK_GATE_NOTICE_PROPS = Object\.freeze\(\{ \[NOTICE_ATTRIBUTE\]: "" \}\);/);
  /* hook ไม่แตะเลขแพ็ค ไม่เรียก API ไม่คิดกฎเอง */
  assert.doesNotMatch(src, /packQty|apiFetch|apiJson|(?<![\w.$])fetch\(|linePackIssues|lineTakesPacks/);
  assert.deepEqual([...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ['react', '@/lib/sales/linePackEdit']);
});
