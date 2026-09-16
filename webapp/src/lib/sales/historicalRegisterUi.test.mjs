// ── ยามของทะเบียนใบสั่งขาย + โมดัลคีย์ใบย้อนหลัง (เฟส 2a) ────────────────────────────
//
// 🔴 **นี่คือยาม source ไม่ใช่เทสต์พฤติกรรม** — ทุกข้อในไฟล์นี้อ่าน source เป็นสตริงแล้ว
//    จับด้วย regex ⇒ มันพิสูจน์ได้แค่ว่า "ข้อความนี้ยังอยู่ในไฟล์" ไม่ใช่ว่า "โค้ดทำสิ่งนี้"
//    รีโปนี้ไม่มีตัวเรนเดอร์ React ในชุดเทสต์เลย ⇒ ตรรกะของโมดัลจึงต้องถูกยกไปอยู่ที่
//    `historicalIntakeForm.js` แล้วตรึงด้วย `historicalIntakeForm.test.mjs` (ของจริง เรียก
//    ฟังก์ชันตรง ๆ) · ที่เหลือใน JSX ให้เหลือน้อยที่สุดเท่าที่ยามแบบนี้ยังพอเฝ้าไหว
//
// ⭐ สี่ข้อนี้พังเงียบได้ทั้งหมด — ไม่มี error ไม่มีจอแดง มีแต่คนใช้ที่หาของไม่เจอ:
//   1. **ชิป/เลขเดิม** หายไป ⇒ ใบย้อนหลังอ่านเหมือนใบปกติที่ไม่มีเลข QT
//   2. **ชุดค้น** ไม่มีชื่อ AE ทั้งที่แถวโชว์ "AE {ชื่อ}" ⇒ ตาเห็นแต่ค้นไม่เจอ (กฎ search haystack)
//   3. **ตัวกรองที่มาของใบ** ไม่ถูกนับใน filterCount/onClear/resetKey ⇒ ชิปค้างแต่แถวไม่กรอง
//   4. **ปุ่มคีย์** โผล่ให้คนที่กดแล้วเจอ 403 หรือหายไปจากคนที่มีสิทธิ์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as intakeForm from './historicalIntakeForm.js';
import * as historicalOrders from './historicalOrders.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const REGISTER = 'app/sales-planning/sales-orders/page.js';
const MODAL = 'components/salesPlanning/HistoricalSalesOrderModal.js';

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

// ── 1. ชิปและเลขเอกสารเดิมบนแถว ──────────────────────────────────────────────────

/* โทน info ตัวเดียวกับคิวงานเข้าใหม่ของ TS (service/intake · IntakeWizard) —
   หนึ่งป้ายหนึ่งโทนทุกจอ · amber สงวนไว้สำหรับ "มีปัญหา" */
test('แถวใบย้อนหลังใช้ชิป info "ย้อนหลัง" ตัวเดียวกับคิวงานเข้าใหม่ของ TS', () => {
  const chip = /<StatusBadge tone="info" size="sm" label="ย้อนหลัง" \/>/;
  assert.match(code(REGISTER), chip, 'ทะเบียน SO');
  assert.match(code('app/service/intake/page.js'), chip, 'คิวงานเข้าใหม่ (ของเดิม P1)');
});

test('บรรทัดรองของเลขที่ใบ: ใบย้อนหลังใช้เลขเอกสารเดิมแทนเลข QT (ซึ่งเป็นขีดเสมอ)', () => {
  const page = code(REGISTER);
  assert.match(page, /const historical = isHistoricalOrder\(row\);/);
  assert.match(page, /const oldRefs = historical \? historicalRefsOf\(row\)\.join\(" · "\) : "";/);
  assert.match(page, /\{historical \? \(oldRefs \|\| NA\) : naText\(row\.quotation\?\.quoteNumber\)\}/);
});

/* ชื่อดีล "งานบริการย้อนหลัง · {ลูกค้า}" พูดซ้ำชื่อลูกค้าบรรทัดบน และลูกค้ารายเดียวมี
   ดีลภาชนะได้สองใบที่ต่างกันแค่ AE (มติข้อ 22) */
test('บรรทัดรองใต้ลูกค้าของใบย้อนหลัง = "AE {ชื่อ}" แทนชื่อดีล', () => {
  assert.match(code(REGISTER), /historical \? `AE \$\{naText\(row\.deal\?\.ownerName\)\}` : naText\(row\.deal\?\.title\)/);
});

// ── 2. ชุดค้น ────────────────────────────────────────────────────────────────────

test('🪤 ตาเห็นบนแถว = ต้องค้นเจอ — ชื่อ AE และเลขเอกสารเดิมอยู่ในชุดค้น', () => {
  const haystack = slice(code(REGISTER), 'return !q || [row.orderNumber', '.some((value)');
  for (const field of ['row.deal?.ownerName', '...historicalRefsOf(row)', 'row.customerArCode']) {
    assert.ok(haystack.includes(field), `ชุดค้นขาด ${field}`);
  }
});

// ── 3. ตัวกรอง "ที่มาของใบ" ────────────────────────────────────────────────────────

/* 🪤 ตัวกรองใหม่ต้องถูกร้อยครบสี่จุด ไม่งั้นพังเงียบคนละแบบ:
   filtered (ไม่กรองเลย) · filterCount (ป้ายบนปุ่มไม่ขึ้น) · onClear (ล้างแล้วไม่หาย) ·
   resetKey ของ usePagination (กรองแล้วค้างหน้าเดิมที่ว่างเปล่า) */
test('🪤 ตัวกรองที่มาของใบถูกร้อยครบทั้งสี่จุดของหน้า', () => {
  const page = code(REGISTER);
  assert.match(page, /const \[originFilter, setOriginFilter\] = useStickyState\("originFilter", EMPTY\);/,
    'ค่าตั้งต้นต้องเป็น EMPTY ตัวเดิม ไม่ใช่ [] เขียนสด');
  assert.match(page, /if \(originFilter\.length && !originFilter\.some\(\(key\) => ORIGIN_FILTERS\[key\]\?\.match\(row\)\)\) return false;/);
  assert.match(page, /filterCount = statusFilter\.length \+ paymentFilter\.length \+ invoiceFilter\.length \+ originFilter\.length/);
  assert.match(slice(page, 'onClear={() => {', '}}'), /setOriginFilter\(\[\]\)/);
  assert.match(slice(page, 'usePagination(sorted', ';'), /\$\{originFilter\.join\(\)\}/);
  assert.match(page, /key: "origin", label: "ที่มาของใบ", icon: History,/);
});

/* 🔴 literal 'historical' มีบ้านเดียวคือ lib/sales/historicalOrders.js (ยาม historicalMoneyGuards)
   ⇒ ค่าของตัวเลือกต้องมาจากค่าคงที่ และตัวตัดสินต้องเป็น isHistoricalOrder ตัวเดียวกับที่
   รายงานเงินใช้กรองออก — ไม่งั้นชิปบนจอกับตัวเลขในรายงานพูดคนละเรื่อง */
test('ตัวเลือกที่มาของใบใช้ค่าคงที่กลางและ isHistoricalOrder ตัวเดียวกับตัวกรองเงิน', () => {
  const group = slice(code(REGISTER), 'const ORIGIN_FILTERS', '};');
  assert.match(group, /\[ORIGIN_PIPELINE\]: \{ label: "ใบจากใบเสนอราคา", match: \(row\) => !isHistoricalOrder\(row\) \}/);
  assert.match(group, /\[ORIGIN_HISTORICAL\]: \{ label: "ใบย้อนหลัง", match: \(row\) => isHistoricalOrder\(row\) \}/);
});

// ── 4. ด่านสิทธิ์ของปุ่มคีย์ ─────────────────────────────────────────────────────────

/* มติข้อ 15: เทียบ role ตรง ๆ ไม่ใช่ isSuperuser — ตรงกับ literal ใน RPC ของ 0360
   กฎบ้าน: ไม่มีสิทธิ์ = **ไม่โชว์** (ไม่ใช่โชว์แล้วจาง) */
test('⭐ ปุ่ม "SO ย้อนหลัง" และโมดัล ขึ้นเฉพาะ AE Supervisor/แอดมิน', () => {
  const page = code(REGISTER);
  assert.match(page, /const canKeyHistorical = canKeyHistoricalSalesOrder\(\{ role: useRole\(\) \}\);/);
  assert.doesNotMatch(page, /isSuperuser/, 'ต้องเทียบ role ตรง ๆ (มติข้อ 15)');
  assert.match(page, /headerRight=\{canKeyHistorical \? \(/, 'ปุ่มอยู่ใน headerRight ของ Workspace');
  assert.match(page, /\{canKeyHistorical && \(\s*<HistoricalSalesOrderModal/,
    'โมดัลต้องไม่ถูกเรนเดอร์ให้คนที่ไม่มีสิทธิ์เลย');
  assert.match(page, /<Button tone="neutral" onClick=\{\(\) => setKeyingOpen\(true\)\}/,
    'สีกลาง ไม่ใช่สีแบรนด์ — งานย้ายข้อมูลเก่า ไม่ใช่ที่ที่งานใหม่เกิด');
});

/* โมดัลต้องอยู่ **นอก** Workspace — Workspace เคยสลับ children เป็น skeleton ตอนโหลดใหม่
   แล้วถอดโมดัลทิ้งทั้งฟอร์ม (บทเรียนเดียวกับ /service/sites) */
test('โมดัลถูก mount นอก Workspace ไม่ใช่ใน children ของแผง', () => {
  const page = code(REGISTER);
  const afterWorkspace = slice(page, '</SaWorkspace>');
  assert.ok(afterWorkspace.includes('<HistoricalSalesOrderModal'), 'โมดัลต้องอยู่หลัง </SaWorkspace>');
  const panelBody = slice(page, '<ListPanel', '</ListPanel>');
  assert.ok(!panelBody.includes('HistoricalSalesOrderModal'), 'ห้ามอยู่ใน children ของ ListPanel');
});

// ── 5. สัญญาของโมดัลที่ตรวจด้วยตาไม่ได้ ──────────────────────────────────────────────

/* 🔴 route เขียนห้ามไว้: `retry: true` บน POST เส้นนี้ = ใบซ้ำ · ส่งซ้ำด้วยรหัสเดิม
   ได้ใบเดิมอยู่แล้ว (RPC เทียบลายนิ้วมือคำขอ) */
test('🪤 โมดัลไม่เปิด retry บนเส้นคีย์ใบ และเรียกผ่าน apiJson เท่านั้น', () => {
  const modal = code(MODAL);
  assert.doesNotMatch(modal, /retry:\s*true/);
  assert.match(modal, /apiJson\(HISTORICAL_ENDPOINT/);
  assert.equal(modal.includes('fetch('), false, 'ห้าม fetch ดิบในโค้ดฝั่งเบราว์เซอร์');
});

/* ⭐ รหัสการคีย์ออกใหม่ **ที่เดียว** คือตอนเริ่มใบใหม่ (เปิดโมดัล / คีย์ใบถัดไป)
   ออกใหม่ระหว่างกดบันทึกซ้ำเมื่อไร ใบที่ลงฐานไปแล้วจะกลายเป็นใบที่สอง */
test('⭐ รหัสการคีย์ออกใหม่เฉพาะตอนเริ่มใบใหม่ — ไม่ใช่ตอนกดบันทึกซ้ำ', () => {
  const modal = code(MODAL);
  const mints = [...modal.matchAll(/newHistoricalIntakeKey\(\)/g)];
  assert.equal(mints.length, 2, 'มีได้สองจุด: ค่าตั้งต้นของ state และใน startOver');
  assert.match(slice(modal, 'const startOver = useCallback', '}, []);'), /setIntakeKey\(newHistoricalIntakeKey\(\)\)/);
  assert.match(slice(modal, 'const commit = useCallback', '}, ['), /intakeKey,\s*acknowledgeDuplicates: acknowledged/);
  assert.doesNotMatch(slice(modal, 'const commit = useCallback', '}, ['), /newHistoricalIntakeKey/);
});

/* ⭐ "ของที่ตรวจแล้ว = ของที่บันทึก" — บันทึกต้องส่ง body ของพรีวิวที่ผ่าน ไม่ใช่ประกอบใหม่
   จาก state ที่อาจขยับไปแล้ว (ลายนิ้วมือต่างแม้ช่องเดียว = 409 intake_key_conflict) */
test('⭐ บันทึกส่ง body ก้อนเดิมของพรีวิวที่ผ่าน ไม่ประกอบใหม่จาก state', () => {
  const commit = slice(code(MODAL), 'const commit = useCallback', '}, [');
  assert.match(commit, /json: \{ \.\.\.previewPayload, intakeKey, acknowledgeDuplicates: acknowledged \}/);
  assert.doesNotMatch(commit, /historicalIntakeBody\(/);
  /* 🪤 ด่านข้างบนเฝ้าแค่ **ที่ใช้** `previewPayload` — ตัวที่ใส่ค่าเข้าไปอยู่ใน `runPreview`
     คนละก้อน · เปลี่ยนบรรทัดนั้นเป็น `setPreviewPayload({})` แล้วชุดเทสต์เคยเขียวครบ ทั้งที่
     บันทึกจะส่งขึ้น API แค่ `{ intakeKey, acknowledgeDuplicates }` ⇒ 400 "ต้องเลือกลูกค้า"
     ทุกครั้งหลังกรอกครบสี่ขั้น ⇒ ต้องตรึงค่าที่ไหลเข้าไปด้วย ไม่ใช่แค่ที่ใช้ */
  const preview = slice(code(MODAL), 'const runPreview = useCallback', '}, [');
  assert.match(preview, /setPreviewPayload\(historicalIntakeBody\(state, \{ preview: false, intakeKey \}\)\)/,
    'ก้อนที่เก็บไว้ต้องเป็น body โหมดบันทึกของ state ชุดที่เพิ่งผ่านพรีวิว');
});

/* 🪤 `useDealOwners` กรองรายชื่อด้วยทีมของ **คนดู** ซึ่งแคบกว่าที่ server ยอมให้คู่นี้
   (ae_supervisor/admin มี editScope 'all' ⇒ validateDealOwner ไม่มีด่านทีม)
   ⇒ ใช้มันที่นี่ = ชีตย้อนหลังที่มี AE ข้ามทีมคีย์ไม่ได้เลยทั้งที่ API ยอม */
test('⭐ รายชื่อ AE ในโมดัลไม่ถูกกรองด้วยทีมของผู้คีย์', () => {
  const modal = code(MODAL);
  assert.match(modal, /assignableOwners\(directory, null\)/);
  assert.doesNotMatch(modal, /useDealOwners/);
});

// ── 6. ด่านใบซ้ำ — ส่วนที่ยามแบบนี้เฝ้าได้ (ที่เหลืออยู่ใน historicalIntakeForm.test.mjs) ──

/* 🔴 ทั้งก้อนนี้เคยลบทิ้งได้โดยชุดเทสต์ยังเขียว: ด่าน (`gated`) · เส้นทางกลับขั้น ④ ของ 409
   ใบซ้ำ · ตารางใบที่อาจซ้ำพร้อมสวิตช์ · ตัวตัดสินสองตัวถูกยกไปตรึงเป็นฟังก์ชันบริสุทธิ์แล้ว
   เหลือ "โมดัลเรียกใช้มันจริงไหม" กับ "ReviewStep ยังวาดตาราง+สวิตช์ไหม" ที่เฝ้าได้แค่ตรงนี้ */
test('⭐ โมดัลตัดสินด่านใบซ้ำและทางออกด้วยตัวตัดสินที่ตรึงไว้ ไม่ใช่เงื่อนไขในวงเล็บของ JSX', () => {
  const modal = code(MODAL);
  assert.match(modal, /const gate = historicalDuplicateGate\(\{ duplicates, acknowledged, warnings: plan\?\.warnings \}\);/);
  assert.match(modal, /historicalSaveFailureState\(historicalSaveExit\(err\)\)/,
    '409 ใบซ้ำต้องไม่ไปจอ "บันทึกไม่สำเร็จ" ซึ่งเหลือปุ่ม "ปิด" ปุ่มเดียว = เสียใบทั้งใบ');
  assert.match(modal, /historicalExitActions\(exit\)\.map\(/,
    'ปุ่มของจอ failed ต้องมาจากตัวตัดสิน ไม่ใช่ {exit.canX && (…)} สี่ก้อนที่ถอดทีละอันได้เงียบ ๆ');
});

/* กฎบ้าน "ติดด่าน = โชว์แล้วบอกเหตุ" จะจริงก็ต่อเมื่อ **เหตุอยู่ในสายตา** — สวิตช์อยู่เหนือ
   ตาราง "ยอดนี้ไปไหน" 10 แถว ⇒ คนที่ยืนที่ปุ่มบันทึกกดแล้วไม่เห็นอะไรเปลี่ยนเลย */
test('⭐ กดปุ่มบันทึกที่ติดด่าน = เลื่อนไปที่สวิตช์ + โฟกัส ไม่ใช่แค่ตั้งข้อความไว้นอกจอ', () => {
  const modal = code(MODAL);
  assert.match(modal, /dupSwitchRef\.current\?\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(modal, /dupSwitchRef\.current\?\.focus\(\)/);
  assert.match(modal, /switchRef=\{dupSwitchRef\}/, 'ต้องส่ง ref ลงไปถึงปุ่มสวิตช์จริง');
  assert.match(code('components/salesPlanning/HistoricalOrderReviewStep.js'), /ref=\{switchRef\}/);
});

test('ขั้น ④ ยังวาดตารางใบที่อาจซ้ำ + สวิตช์ยืนยัน เมื่อพรีวิวพบใบซ้ำ', () => {
  const review = code('components/salesPlanning/HistoricalOrderReviewStep.js');
  assert.match(review, /\{dupes\.length > 0 && \(/, 'ตารางขึ้นเฉพาะตอนพบ — ไม่ใช่หมวดที่มีทุกใบ');
  assert.match(review, /aria-label="ตรวจแล้ว ไม่ใช่ใบซ้ำ"/);
  assert.match(review, /onClick=\{\(\) => onAcknowledge\(!acknowledged\)\}/);
});

// ── 7. ชื่อที่ import จาก lib มีอยู่จริงไหม ─────────────────────────────────────────────

/* 🐞 ขั้น ③ เคย `import { DOC_DATE_MAX, DOC_DATE_MIN } from "@/lib/sales/historicalIntakeForm"`
   ทั้งที่โมดูลนั้นไม่ได้ export สองตัวนี้ (มันอยู่ที่ `historicalOrders.js`) · package.json เป็น
   `"type": "module"` ⇒ ชื่อที่ไม่มีจริงคือ **module error ตอน instantiate** = ขั้น ③ ไม่ขึ้นเลย
   (ในทางที่ผ่อนที่สุดคือได้ `undefined` แล้ว min/max ของ DateInput หายเงียบ)
   🔴 ไม่มีเทสต์ไหนจับได้เพราะ **ไม่มีอะไรในชุดเทสต์ import ตัว component เลย** (JSX รันใต้ Node
   ตรง ๆ ไม่ได้) ⇒ ยามตัวนี้เทียบรายชื่อที่ไฟล์ขอ กับ export จริงของโมดูลที่ import มาได้ */
const HISTORICAL_COMPONENTS = [
  MODAL,
  'components/salesPlanning/HistoricalOrderDocStep.js',
  'components/salesPlanning/HistoricalOrderLinesStep.js',
  'components/salesPlanning/HistoricalOrderMoneyStep.js',
  'components/salesPlanning/HistoricalOrderReviewStep.js',
  'components/salesPlanning/HistoricalOrderDoneStep.js',
];

test('⭐ ทุกชื่อที่ขั้นต่าง ๆ import จาก lib ของสายนี้ ต้องมี export อยู่จริง', () => {
  const modules = {
    '@/lib/sales/historicalIntakeForm': intakeForm,
    '@/lib/sales/historicalOrders': historicalOrders,
  };
  const missing = [];
  let checked = 0;
  for (const file of HISTORICAL_COMPONENTS) {
    for (const hit of code(file).matchAll(/import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/g)) {
      const mod = modules[hit[2]];
      if (!mod) continue;
      for (const raw of hit[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        checked += 1;
        if (!(name in mod)) missing.push(`${file} → ${name} (ไม่มีใน ${hit[2]})`);
      }
    }
  }
  assert.ok(checked >= 10, `ยามต้องเจอชื่อที่ import จริง ๆ ไม่ใช่ผ่านเพราะ regex ไม่แมตช์ (เจอ ${checked})`);
  assert.deepEqual(missing, [],
    'ชื่อที่ไม่มีจริง = โมดูลพังตอน instantiate ⇒ ขั้นนั้นไม่ขึ้นเลย และไม่มีเทสต์ไหนเห็น');
});

/* ── ชิป/ตัวกรอง "TS ไม่พบจุด" + การ์ดตัดสินบนหน้าใบ (มติข้อ 23 · mig 0362) ──────── */
const DETAIL = 'app/sales-planning/sales-orders/[id]/page.js';

test('0362: ตัวกรอง "จุดติดตั้ง" ร้อยครบสี่จุด และชิปบนแถวนับจากบรรทัด', () => {
  const page = code(REGISTER);
  assert.ok(page.includes('SITE_DECISION_FILTERS'), 'ต้องมีทะเบียนตัวเลือกของกลุ่มนี้');
  assert.ok(page.includes('awaitingSiteDecisionCount(row.lines'), 'นับจากบรรทัด ไม่ใช่หัวใบ');
  // ①กรองแถว ②filterCount ③onClear ④resetKey ของ Pager — ขาดข้อไหนชิปกับแถวจะไม่ตรงกัน
  assert.ok(page.includes('siteFilter.some((key) => SITE_DECISION_FILTERS[key]?.match(row))'));
  assert.ok(page.includes('+ siteFilter.length'));
  assert.ok(page.includes('setSiteFilter([]);'));
  assert.ok(page.includes('${siteFilter.join()}'));
  assert.ok(page.includes('key: "siteDecision"'), 'ต้องเป็นกลุ่มของตัวเองใน FilterPopover');
  assert.ok(page.includes('siteDecisionCount(row) > 0'), 'ชิปบนแถวขึ้นเมื่อมีจุดค้าง');
});

test('0362: การ์ดตัดสินบนหน้าใบ — สองทาง ไม่มีทางที่สาม · ไม่แตะเงิน · ด่านสิทธิ์เดียวกับ route', () => {
  const page = code(DETAIL);
  assert.ok(page.includes('canKeyHistoricalSalesOrder({ role })'), 'ด่านเดียวกับ route');
  assert.ok(page.includes('<SiteDecisionCard'), 'การ์ดต้องถูกเรนเดอร์บนหน้าใบ');
  /* 🪤 การตัดสินต้องโยน error กลับให้โมดัลโชว์ — แถบของหน้าอยู่ใต้โมดัล กดแล้วจอเงียบ */
  assert.ok(page.includes('async function decideSitePoint('), 'ต้องมีตัวเรียกของตัวเอง');
  assert.ok(page.includes('throw new Error(data.error'), 'error ต้องถึงโมดัล');
  const call = page.slice(page.indexOf('async function decideSitePoint('), page.indexOf('async function save()'));
  assert.ok(!call.includes('retry: true'), '🪤 ส่งซ้ำ = 409 "ตัดสินไปแล้ว" ทั้งที่ครั้งแรกสำเร็จ');

  const card = code('components/salesPlanning/SiteDecisionCard.js');
  assert.ok(card.includes('rename_installation_point') && card.includes('close_installation_point'));
  // ⛔ ข2 ยังไม่ทำ — ม็อกวาดปุ่ม "ถอดออกจากใบ" ไว้ ห้ามโผล่จนกว่าจะมีตัวคิดเงินหัวใบ
  assert.ok(!card.includes('ถอดออกจากใบ'), '🔴 ปุ่มถอดบรรทัดเป็นงานรอบหน้า (ข2)');
  assert.ok(!card.includes('remove_line'));
  // ปุ่มต้องหายไปเมื่อตัดสินแล้ว (กติกา: ไม่มีอะไรให้กด = ไม่โชว์ปุ่มตาย)
  assert.ok(card.includes('lineAwaitingSiteDecision(line) ?'), 'ปุ่มขึ้นเฉพาะจุดที่ยังรอตัดสิน');
  // โมดัลบอกผลลัพธ์ก่อนกด รวมว่าเงินไม่ขยับ
  assert.ok(card.includes('ยอดบรรทัด') && card.includes('งวดชำระไม่เปลี่ยน'));
});

test('0362: ทะเบียนใบสั่งขายส่งธงมาให้จอด้วย (ไม่งั้นชิปเป็นศูนย์ตลอดกาล)', () => {
  const api = code('app/api/sales-planning/sales-orders/route.js');
  const hit = api.match(/from\('sales_order_lines'\)\s*\.select\('([^']*)'/);
  assert.ok(hit, 'หา select ของบรรทัดไม่เจอ');
  for (const col of ['"siteNotFoundAt"', '"siteClosedAt"']) {
    assert.ok(hit[1].includes(col), `select ของทะเบียนต้องมี ${col}`);
  }
});
