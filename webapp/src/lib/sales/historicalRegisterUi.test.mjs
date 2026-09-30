// ── ยามของทะเบียนใบสั่งขาย + ฟอร์มคีย์ใบย้อนหลังหน้าเต็ม (มติ 22/09 · mig 0374) ─────────────
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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as intakeForm from './historicalIntakeForm.js';
import * as historicalOrders from './historicalOrders.js';
import * as orderCopy from './historicalOrderCopy.js';
import * as reviewView from './historicalReviewView.js';
import * as duplicatesLib from './historicalDuplicates.js';
import { HISTORICAL_NEW_PATH } from './historicalOrders.js';
import { zoneBrowserRows } from '../service/zonePickerOptions.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const REGISTER = 'app/sales-planning/sales-orders/page.js';
const WIZARD = 'components/salesPlanning/historicalWizard/HistoricalOrderWizard.js';
const NEW_PAGE = 'app/sales-planning/sales-orders/historical/new/page.js';
const EDIT_PAGE = 'app/sales-planning/sales-orders/historical/[id]/edit/page.js';
const STEP_CONTRACT = 'components/salesPlanning/historicalWizard/WizardContractStep.js';
const STEP_ZONES = 'components/salesPlanning/historicalWizard/WizardZonesStep.js';
const STEP_MONEY = 'components/salesPlanning/historicalWizard/WizardMoneyStep.js';
const STEP_REVIEW = 'components/salesPlanning/historicalWizard/WizardReviewStep.js';
const BULK = 'components/salesPlanning/historicalWizard/HistoricalBulkZonesModal.js';
/* ⭐ PR-D (D27 · DD4): หน้าต่างเพิ่มหลายโซนของใบย้อนหลังเป็น **ตัวห่อ** ของหน้าต่างกลางของงานบริการ — ค้น/ติ๊ก/แพ็คต่อรอบ/
   ท้ายหน้าต่างอยู่ที่ตัวกลาง · ตัวห่อถือ แพ็คเกจ · จำนวน · รอบบริการ ⇒ ยามของ "ค้น/ติ๊ก/ท้ายหน้าต่าง" ย้ายไปอ่านตัวกลาง */
const SHARED_BULK = 'components/service/ZonesBulkModal.js';
/* ⭐ PR-D (mig 0394 · r2 S12): ช่อง "แพ็คต่อรอบ *" + ชิปผลประเมิน + "ทั้งรายการ n แพ็ค" ของบรรทัดขั้น ② */
const LINE_SERVICE = 'components/salesPlanning/historicalWizard/HistoricalLineServiceFields.js';
/* ⭐ มติ 25/09 (รื้อขั้น ③): ตารางงวด + หน้าต่างแบ่งงวด + หัวการ์ด เป็นไฟล์ของตัวเอง — ยามที่ไล่ "ทุกขั้น" ต้องไล่ไฟล์พวกนี้ด้วย */
const INST_TABLE = 'components/salesPlanning/historicalWizard/HistoricalInstallmentTable.js';
const SPLIT = 'components/salesPlanning/historicalWizard/HistoricalSplitModal.js';
const CARD_HEADING = 'components/salesPlanning/historicalWizard/CardHeading.js';
const CELLS = 'components/salesPlanning/QuoteLineCells.js';
const SEARCHABLE = 'components/ui/SearchableSelect.js';

/* 🪤 ตัวปิดท้าย (`to`) ที่หาไม่เจอเคย **เงียบ** แล้วตัดไปถึงท้ายไฟล์ ⇒ ยามที่ควรดูแค่ก้อนเดียวกลายเป็นดูทั้งไฟล์
   แล้วผ่านเพราะเจอข้อความจากก้อนอื่น (เจอจริง 25/09: deps ของ goToStep เปลี่ยน แต่ยามยังเขียว)
   ⇒ ส่ง `to` มาแล้วหาไม่เจอ = แดง · อยากได้ถึงท้ายไฟล์ให้ส่ง undefined เอง */
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  if (!to) return text.slice(start);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หาตัวปิด "${to}" หลัง "${from}" ไม่เจอ — ยามจะกลายเป็นดูทั้งไฟล์`);
  return text.slice(start, end);
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

/* เทียบ role ตรง ๆ ไม่ใช่ isSuperuser — ชุด role = HISTORICAL_KEYER_ROLES ตรงกับ literal ใน RPC ของ 0374
   (มติ 22/09: ฝ่ายขายทุกตำแหน่ง + Admin · เดิมข้อ 15 ให้แค่ AE Sup/Admin) · กฎบ้าน: ไม่มีสิทธิ์ = **ไม่โชว์** */
test('⭐ ปุ่ม "SO ย้อนหลัง" ขึ้นเฉพาะผู้คีย์ใบย้อนหลังได้ และเป็น **ลิงก์ไปหน้าฟอร์มเต็ม** ไม่ใช่โมดัล', () => {
  const page = code(REGISTER);
  assert.match(page, /const canKeyHistorical = canKeyHistoricalSalesOrder\(\{ role: useRole\(\) \}\);/);
  assert.doesNotMatch(page, /isSuperuser/, 'ต้องเทียบ role ตรง ๆ');
  assert.match(page, /headerRight=\{canKeyHistorical \? \(/, 'ปุ่มอยู่ใน headerRight ของ Workspace');
  assert.match(page, /<Button as=\{Link\} href=\{HISTORICAL_NEW_PATH\} tone="neutral"/,
    'สีกลาง ไม่ใช่สีแบรนด์ — งานย้ายข้อมูลเก่า ไม่ใช่ที่ที่งานใหม่เกิด · เส้นทางมาจากค่าคงที่กลาง');
  assert.equal(HISTORICAL_NEW_PATH, '/sa/sales-orders/historical/new');
});

/* 🔴 โมดัลคีย์ใบแบบเดิมถูกถอดทั้งชุด — ฟอร์มต้องอยู่รอดการรีโหลดและกลับมาแก้ได้หลังถูกตีกลับ
   ⇒ ต้องมี URL ของตัวเอง · ถ้าโมดัลกลับมา แปลว่าทางแก้ใบหายไปด้วยเงียบ ๆ */
test('ทะเบียนไม่เหลือโมดัลคีย์ใบย้อนหลัง (มติ 22/09 — ฟอร์มหน้าเต็มแทน)', () => {
  const page = code(REGISTER);
  assert.doesNotMatch(page, /HistoricalSalesOrderModal/);
  assert.doesNotMatch(page, /setKeyingOpen/);
});

// ── 5. สัญญาของฟอร์มที่ตรวจด้วยตาไม่ได้ ──────────────────────────────────────────────

/* 🔴 กฎ AGENTS.md: ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง — สองหน้าต้องเรียก component เดียวกัน
   และหน้าแก้ต้องไม่มีช่องของตัวเองสักช่อง (ไม่งั้นสองฝั่งจะขาดคนละอย่างโดยไม่มีใครรู้) */
test('⭐ หน้าสร้างกับหน้าแก้เรียก HistoricalOrderWizard ตัวเดียวกัน', () => {
  for (const file of [NEW_PAGE, EDIT_PAGE]) {
    assert.match(code(file), /import HistoricalOrderWizard from "@\/components\/salesPlanning\/historicalWizard\/HistoricalOrderWizard"/, file);
    assert.match(code(file), /<HistoricalOrderWizard/, file);
  }
  assert.match(code(EDIT_PAGE), /useParams\(\)/, 'หน้าแก้อ่าน id จาก URL');
  assert.match(code(EDIT_PAGE), /orderId=\{id \|\| null\}/);
  assert.doesNotMatch(code(EDIT_PAGE), /useState/, 'หน้าแก้ห้ามถือ state ของฟอร์มเอง');
});

/* 🔴 route เขียนห้ามไว้: `retry: true` บนเส้นคีย์ใบ = ใบซ้ำ · ส่งซ้ำด้วยรหัสเดิมได้ใบเดิมอยู่แล้ว */
test('🪤 ฟอร์มไม่เปิด retry บนเส้นคีย์ใบ และเรียกผ่าน apiJson เท่านั้น', () => {
  for (const file of [WIZARD, STEP_ZONES, BULK]) {
    const src = code(file);
    assert.doesNotMatch(src, /retry:\s*true/, file);
    assert.equal(src.includes('fetch('), false, `ห้าม fetch ดิบในโค้ดฝั่งเบราว์เซอร์ (${file})`);
  }
  assert.match(code(WIZARD), /apiJson\(HISTORICAL_PATH/);
});

/* ⭐ รหัสการคีย์ออกใหม่ **ที่เดียว** คือตอน mount ฟอร์มใบใหม่ — ออกใหม่ระหว่างกดบันทึกซ้ำเมื่อไร
   ใบที่ลงฐานไปแล้วจะกลายเป็นใบที่สอง */
test('⭐ รหัสการคีย์ออกใหม่จุดเดียว (ค่าตั้งต้นของ state) ไม่ใช่ตอนกดบันทึก', () => {
  const src = code(WIZARD);
  const mints = [...src.matchAll(/newHistoricalIntakeKey\(\)/g)];
  assert.equal(mints.length, 1, 'มีได้จุดเดียว: ค่าตั้งต้นของ useState');
  assert.match(src, /const \[intakeKey\] = useState\(\(\) => newHistoricalIntakeKey\(\)\);/);
  assert.doesNotMatch(slice(src, 'const runSave = useCallback', '}, ['), /newHistoricalIntakeKey/);
});

/* ⭐ **ปุ่มเดียวเดินหลายจังหวะ** — ลำดับมาจากตัวตัดสินที่ตรึงไว้ ไม่ใช่ if ซ้อนกันใน JSX
   · หลังสร้างสำเร็จต้องเปลี่ยน URL เป็นเส้นแก้ใบ (replaceState) ไม่งั้นรีโหลด = งานหาย
   · กดใหม่ต้องไม่อัปไฟล์ซ้ำ (retry-must-not-reupload) ⇒ ไฟล์ที่อัปแล้วถูกจำไว้ */
test('⭐ การบันทึกเดินตาม nextSaveStage · เปลี่ยน URL ด้วย replaceState · ไม่อัปไฟล์ซ้ำ', () => {
  const src = code(WIZARD);
  assert.match(src, /stage = nextSaveStage\(progress\);/);
  assert.match(src, /progress = saveProgressAfter\(progress, stage/);
  assert.match(src, /window\.history\.replaceState\(null, "", historicalEditPath\(orderRowId\)\)/);
  assert.match(src, /uploadedContract\.current\.set\(fileKey\(file\), ref\)/);
  assert.match(src, /uploadedEvidence\.current\.set\(fileKey\(file\), ref\)/);
  assert.match(src, /ref: uploadedContract\.current\.get\(fileKey\(file\)\) \|\| null/);
  assert.match(src, /ref: uploadedEvidence\.current\.get\(fileKey\(file\)\) \|\| null/);
  assert.match(src, /notifyToast\.success\(historicalSubmitToast\(orderNumber\)\)/, 'ผลสำเร็จต้องเป็น toast ระดับแอป (อยู่รอดข้ามการเปลี่ยนหน้า) · ถ้อยคำจากตัวตัดสิน');
  assert.match(src, /router\.push\(ORDER_PATH\(orderRowId\)\)/);
});

/* 🔴 แถบท้ายฟอร์ม: **ไม่ใช่ `FormActions`** ซึ่งวาดปุ่ม "บันทึก" + SaveStatus ให้เองเสมอ
   และปุ่มส่งต้องเป็น primary (navy) ไม่ใช่ accent — accent แปลว่า "เริ่มของใหม่" (Button.js) */
test('⭐ แถบท้ายใช้ form-action-bar is-page + ActionButton kind="submit" · ไม่มี FormActions/accent', () => {
  const src = code(WIZARD);
  assert.match(src, /<div className="form-action-bar is-page">/);
  assert.match(src, /<ActionButton\s+kind="submit"/);
  assert.doesNotMatch(src, /FormActions/);
  assert.doesNotMatch(src, /tone="accent"/, 'accent = "เริ่มของใหม่" ห้ามติดปุ่มบันทึก (deviation จากม็อก)');
});

/* ⭐ รางขั้นใช้ primitive กลาง ไม่ใช่รางที่วาดเอง (ฉบับที่สามของทรงเดียวกันคือจุดที่ภาษาแตก)
   🐞 UAT 23/09: ของเดิมส่ง `count: { filled: stepIssues ? 0 : 1, total: 1 }` ⇒ ขั้นที่ error มาจาก
      พรีวิวขึ้น "1/1 (ครบ)" ตั้งแต่ฟอร์มยังเปล่า ⇒ **ห้ามกลับไปใช้เศษส่วน** · ของที่โชว์ตอนนี้
      คือบรรทัดสรุปจาก `historicalWizardRail` ซึ่งถูกตรึงด้วยเทสต์ของจริงอีกไฟล์ */
test('⭐ รางขั้นเป็น ui/SectionRail · สรุปมาจาก historicalWizardRail · ไม่มีเศษส่วนที่เดาเอง', () => {
  const src = code(WIZARD);
  assert.match(src, /import SectionRail from "@\/components\/ui\/SectionRail"/);
  assert.match(src, /<SectionRail/);
  assert.match(src, /const rail = historicalWizardRail\(state, \{\s*step, localIssues, serverIssues: issues, plan, customerLabel, revealedSteps, zeroValue,\s*duplicatesPending: duplicates\.length > 0 && !acknowledged,\s*\}\);/,
    'ขั้น ④ ที่ยังไม่ยืนยันใบซ้ำต้องไม่ขึ้น "พร้อมส่ง" บนราง (รีวิวขั้น ④ 25/09)');
  const sections = slice(src, 'const sections = rail.map', '}));');
  for (const key of ['key:', 'label:', 'title:', 'tone:']) assert.ok(sections.includes(key), key);
  assert.ok(!sections.includes('count:'), 'เศษส่วนบนรางเคยบอกว่าเสร็จทั้งที่ยังไม่เริ่ม');
  assert.ok(!sections.includes('hint:'), 'SectionRail ไม่มีช่อง hint — ห้ามเพิ่มให้ primitive เพื่อจอเดียว');
  assert.doesNotMatch(code('components/ui/SectionRail.js'), /summary/,
    'primitive กลางต้องไม่ถูกแก้เพื่อจอเดียว — บรรทัดสรุปส่งเป็น node ของ label');
});

/* 🔴 **ทางตันของปุ่ม "ถัดไป"** (UAT 23/09) — ของเดิม `{ setIssues([]); return; }` คือไม่เกิดอะไรขึ้น
   บนจอเลย ซ้ำยังล้าง error ของ server ที่อยู่บนจอทิ้ง ⇒ กติกาใหม่: คาข้อความไว้ + พาไปที่ช่องแรกที่ผิด */
test('⭐ ติดด่านแล้วต้องพาไปที่ช่อง ไม่ใช่ return เงียบ ๆ (และห้ามล้าง error ของ server)', () => {
  const src = code(WIZARD);
  const goTo = slice(src, 'const goToStep = useCallback', '}, [step, runPreview, localIssues, reveal, applyPreviewErrors]);');
  assert.match(goTo, /const block = historicalNextBlock\(localIssues, from\);/);
  assert.match(goTo, /if \(block\.blocked\) \{ setFocusField\(block\.field\); return; \}/);
  assert.doesNotMatch(goTo, /issuesForStep\(localIssues, from\)\.length\) \{ setIssues\(\[\]\)/,
    'ล้าง error ของ server ทิ้งตอนติดด่าน = ข้อความที่ผู้คีย์กำลังอ่านหายไปเฉย ๆ');
  /* ตัวพาไปหาต้องมีจริง — เลื่อนเข้าจอ แล้วโฟกัสของที่กดได้ตัวแรกในกล่องช่องนั้น */
  assert.match(src, /document\.getElementById\(historicalFieldAnchorId\(focusField\) \|\| ""\)/);
  assert.match(src, /node\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(src, /focusable\?\.focus\?\.\(\{ preventScroll: true \}\)/);
});

/* 🔴 **จุดยึดต้องมีอยู่จริงบนจอ** — ชี้ไปที่ id ที่ไม่มี = ทางตันแบบเดิมเป๊ะ (ปุ่มกดแล้วไม่ไปไหน)
   ⇒ ไล่ทุกช่องที่ local issues ผลิตได้จริง แล้วเทียบกับ id ที่แต่ละขั้นวาดไว้ */
test('⭐ ทุกช่องที่ local issues ชี้ได้ ต้องมีจุดยึดวาดอยู่บนขั้นจริง', () => {
  const states = [
    intakeForm.emptyHistoricalWizard(),
    { ...intakeForm.emptyHistoricalWizard(), hasOpening: true },
    /* ⭐ ขั้น ③ (มติ 25/09): จ่ายบางส่วน + งวดที่ยังว่างทุกช่อง ⇒ ข้อของงวดยกมาทุกช่อง + ข้อรายงวดทุกช่อง */
    {
      ...intakeForm.emptyHistoricalWizard(),
      contract: { docKind: 'customer_po', ref: '', startDate: '2026-01-01', endDate: '2026-12-31' },
      hasOpening: true,
      opening: { amount: '', coversTo: '', paidOn: '2099-01-01', note: 'ก'.repeat(1001) },
      installments: [
        intakeForm.emptyHistoricalInstallment({ label: 'ก'.repeat(200), note: 'ก'.repeat(1001) }),
        intakeForm.emptyHistoricalInstallment(),
      ],
    },
    { ...intakeForm.emptyHistoricalWizard(), hasOpening: false },
    {
      ...intakeForm.emptyHistoricalWizard(),
      ownerId: 'USR-OTHER',
      contract: { docKind: 'customer_po', ref: '', startDate: '2099-01-01', endDate: '2020-01-01' },
    },
  ];
  const fields = new Set();
  for (const state of states) {
    const issues = intakeForm.historicalWizardLocalIssues(state, {
      role: 'ae', userId: 'USR-ME', ownerTeams: ['KA', 'GT'], sharedTeams: ['KA', 'GT'],
      contractFileCount: 0, evidenceFileCount: 0, todayIso: '2026-09-23',
    });
    for (const issue of issues) fields.add(issue.field);
  }
  assert.ok(fields.size >= 6, `ชุดช่องที่ตรวจต้องครอบคลุมจริง (ได้ ${fields.size})`);

  const drawn = new Set();
  for (const file of [STEP_CONTRACT, STEP_ZONES, STEP_MONEY]) {
    for (const m of code(file).matchAll(/historicalFieldAnchorId\("([^"]+)"\)/g)) {
      drawn.add(intakeForm.historicalFieldAnchorId(m[1]));
    }
  }
  /* ช่องรายงวด (`installments.<i>.<ช่อง>`) — ตารางงวดวาด id ด้วยตัวเดียวกันแบบไดนามิก (`anchor("<ช่อง>")`) */
  const table = code(INST_TABLE);
  assert.match(table, /const anchor = \(slot\) => historicalFieldAnchorId\(`installments\.\$\{row\.index\}\.\$\{slot\}`\);/);
  const rowSlots = new Set([...table.matchAll(/id=\{anchor\("([a-zA-Z]+)"\)\}/g)].map((m) => m[1]));
  for (const field of fields) {
    const row = /^installments\.\d+\.([a-zA-Z]+)$/.exec(field);
    if (row) {
      assert.ok(rowSlots.has(row[1]), `ช่องรายงวด "${row[1]}" ไม่มีจุดยึดในตารางงวด`);
      continue;
    }
    assert.ok(drawn.has(intakeForm.historicalFieldAnchorId(field)),
      `ช่อง "${field}" ไม่มีจุดยึดบนจอ — ปุ่มที่ติดด่านจะพาไปไม่ถึง`);
  }
  for (const needed of ['opening', 'opening.amount', 'opening.coversTo', 'opening.paidOn', 'opening.note', 'opening.evidence', 'installments']) {
    assert.ok(fields.has(needed), `ชุดสถานะของยามต้องผลิตข้อ ${needed} (ไม่งั้นยามเฝ้าไม่ครบ)`);
  }
  for (const slot of ['label', 'amount', 'dueDate', 'coversTo', 'note']) {
    assert.ok([...fields].some((field) => field.endsWith(`.${slot}`) && field.startsWith('installments.')), `ข้อรายงวด ${slot}`);
  }
});

/* ⭐ มติเจ้าของ 25/09: VAT + ส่วนลดท้ายใบย้ายไปกล่องสรุปท้ายตารางของขั้น ② (แบบใบเสนอราคา)
   🔴 ย้ายช่องแล้วต้องย้าย **สามอย่างพร้อมกัน** ไม่งั้นเกิดทางตันแบบ UAT 23/09 อีกรอบ:
     ① ขั้นที่ FIELD_STEP ส่งไป (กดส่ง/พรีวิวตีกลับ → พาไปขั้นนั้น) ② จุดยึดที่วาดอยู่บนขั้นนั้นจริง
     ③ ขั้นเดิมต้องไม่เหลือจุดยึดซ้ำ — id ซ้ำสองขั้น = `getElementById` ได้ตัวที่ไม่ได้อยู่บนจอ */
test('⭐ 25/09: ช่องของกล่องสรุป (vatRate · discount) และรายการ (zones) พาไปขั้น ② และมีจุดยึดที่ขั้น ② เท่านั้น', () => {
  const anchorsOf = (file) => new Set([...code(file).matchAll(/historicalFieldAnchorId\("([^"]+)"\)/g)].map((m) => m[1]));
  const zones = anchorsOf(STEP_ZONES);
  for (const field of ['zones', 'vatRate', 'discount']) {
    assert.equal(intakeForm.stepOfField(field), 'zones', `${field} ต้องพาไปขั้น ②`);
    assert.ok(zones.has(field), `ขั้น ② ต้องวาดจุดยึดของ ${field}`);
    for (const other of [STEP_CONTRACT, STEP_MONEY]) {
      assert.ok(!anchorsOf(other).has(field), `${other} ยังมีจุดยึด ${field} ค้าง — id ซ้ำสองขั้น`);
    }
  }
  /* error รายบรรทัดของแผน (zones.<i>.<ช่อง>) ต้องตกขั้น ② ด้วย ไม่ใช่ตกขั้นแรกเพราะไม่รู้จัก */
  for (const field of ['zones.0.zoneId', 'zones.3.productId', 'zones.1.qty', 'zones.2.rounds', 'zones.4']) {
    assert.equal(intakeForm.stepOfField(field), 'zones', field);
  }
  /* กล่องสรุปวาด id ลงบรรทัดจริง (ไม่ใช่กล่องรอบนอก) — ตัวพาไปหาโฟกัสของที่กดได้ตัวแรกในกล่องนั้น */
  const editor = code(STEP_ZONES);
  assert.match(editor, /vatId=\{historicalFieldAnchorId\("vatRate"\)\}/);
  assert.match(editor, /discountId=\{historicalFieldAnchorId\("discount"\)\}/);
  assert.match(editor, /<div className=\{styles\.linesHead\} id=\{historicalFieldAnchorId\("zones"\)\}>/,
    'ปุ่มเพิ่มบรรทัดอยู่ในกล่องนี้ ⇒ "ต้องมีอย่างน้อย 1 รายการ" พาไปโฟกัสปุ่มที่แก้ได้จริง');
  const cells = code(CELLS);
  assert.match(cells, /<div className=\{styles\.totalLine\} id=\{discountId\}>/);
  assert.match(cells, /<div className=\{styles\.totalLine\} id=\{vatId\}>/);
});

/* ช่องไฟล์ที่บังคับเคยหน้าตาเหมือนช่องไม่บังคับ ⇒ ผู้คีย์มองไม่ออกว่าปุ่มค้างเพราะอะไร */
test('⭐ ตะกร้าไฟล์ที่บังคับมีสถานะ "ผิด" ของตัวเอง ทั้งไฟล์สัญญาและหลักฐานงวดยกมา', () => {
  assert.match(code(STEP_CONTRACT), /invalid=\{has\("contract\.file"\)\}/);
  assert.match(code(STEP_MONEY), /invalid=\{has\("opening\.evidence"\)\}/);
  assert.match(code('components/ui/PendingFiles.js'), /data-invalid=\{invalid \? "1" : undefined\}/);
});

/* 🪤 `useDealOwners` เป็นตัวเดียวกับฟอร์มดีล ⇒ ae/senior_ae ได้ช่องล็อกเป็นตัวเองอัตโนมัติ
   (กฎ form-design-rules §2 "ล็อกดีกว่าซ่อน") — เขียนรายชื่อเองที่นี่ = กติกาแตกเป็นสองชุด */
test('⭐ ช่อง AE มาจาก useDealOwners และล็อกเป็นตัวเองสำหรับ ae/senior_ae', () => {
  assert.match(code(WIZARD), /useDealOwners\(meId\)/);
  assert.match(code(WIZARD), /lockedOwner/);
  assert.match(code(STEP_CONTRACT), /\{lockedOwner \|\| locked \? \(/);
});

/* 🪤 สองทางตันของรอบรีวิว S8 เป็นบั๊กตัวเดียวกัน: **ถามข้อที่ไม่มีช่องให้ตอบ** ⇒ ด่านของปุ่มบันทึก
   ค้างที่ "ยังกรอกไม่ครบ" แล้วเด้งกลับไปขั้นที่ไม่มีอะไรให้กด วนไม่รู้จบโดยไม่มี error สักตัว
     · ใบยอด 0 บาท — ขั้น ③ ซ่อนแผ่นเลือกงวดยกมา/ตารางงวด/ช่องหลักฐานทั้งชุด
     · ทีมของดีล — TeamPickerField คืน null เมื่อเหลือตัวเลือก < 2
   ⇒ ยามนี้ผูกสองฝั่งไว้ด้วยกัน: ธงและชุดตัวเลือกที่ "คำถาม" ใช้ ต้องเป็นตัวเดียวกับที่ "ช่อง" ใช้ */
test('⭐ คำถามกับช่องบนจออ่านของตัวเดียวกัน — ธงใบ ฿0 และชุดตัวเลือกทีม', () => {
  const wizard = code(WIZARD);
  /* ⭐ 25/09: ธงใบ ฿0 = `historicalZeroValue(plan, money)` ทั้งสองฝั่ง — ของเดิมอ่านแผนอย่างเดียว ⇒ ก่อนพรีวิวผ่าน ใบ ฿0 ยังถูกถามงวด */
  assert.match(wizard, /const zeroValue = historicalZeroValue\(plan, money\);/, 'คำถามงวดยกมาต้องดับตามธงตัวเดียวกับช่อง');
  assert.match(wizard, /zeroValue, todayIso, totalAmount: invoiceTotal,/);
  assert.match(code(STEP_MONEY), /const zeroValue = historicalZeroValue\(plan, moneyView\);/, 'ช่องบนจออ่านธงตัวเดียวกัน');
  assert.match(wizard, /historicalTeamField\(\{ ownerTeams, sharedTeams, locked: Boolean\(state\.orderId\) \}\)/);
  assert.match(wizard, /teamOptions=\{teamField\.options\}/);
  assert.match(wizard, /lockedTeam=\{teamField\.lockedTeam\}/);
  const contract = code(STEP_CONTRACT);
  assert.match(contract, /\{lockedTeam \? \(/, 'เหลือทีมเดียว = ช่องล็อกที่เห็นได้ ไม่ใช่เงียบ');
  assert.match(contract, /teams=\{teamOptions\}/, 'ชิปทีมต้องมาจากชุดตัวเลือกชุดเดียวกับคำถาม');
});

/* ทะเบียนจำลองของยามขั้น ② (มติเจ้าของ 25/09) — สองไซต์ · โซนที่ปิดใช้งานหนึ่งโซน (ZN-2) */
const REG = Object.freeze({
  sites: [{ id: 'ST-A', code: 'SA-01', name: 'สาขาอโศก' }, { id: 'ST-B', code: 'SB-02', name: 'สาขาบางนา' }],
  zonesBySite: {
    'ST-A': [{ id: 'ZN-1', code: 'Z-LOBBY', name: 'ล็อบบี้' }, { id: 'ZN-2', code: 'Z-WC', name: 'ห้องน้ำ', isActive: false }],
    'ST-B': [{ id: 'ZN-3', code: 'Z-GATE', name: 'ทางเข้า' }],
  },
});
const pickerOption = (rows, rowKey, zoneId, extra = {}) => intakeForm
  .historicalZonePickerOptions({ ...REG, rows, rowKey, ...extra })
  .find((option) => option.value === zoneId);

/* 🪤 ทะเบียนไซต์เป็นของฝ่าย TS — ขอเฉพาะไซต์ที่ยังใช้งาน แต่โซนที่ปิดใช้งานต้องเห็นแบบกดไม่ได้
   🐞 **รีวิว R10 (23/09)**: ของเดิม `disabled={busy || inactive}` ปิด **การถอนติ๊ก** ของแถวที่ใบ
      ผูกไว้อยู่แล้วด้วย ⇒ TS ปิดโซนระหว่างที่ใบถูกตีกลับ = ถอดโซนออกจากใบไม่ได้ · พรีวิวตีกลับ
      ทุกครั้ง · `บันทึก` ไปไม่ถึง ⇒ ใบนั้นแก้ไม่ได้อีกเลยจนกว่าอีกฝ่ายจะเปิดโซนคืน
      (และข้อความของ server ที่บอกว่า "หรือเลือกโซนอื่น" ทำตามไม่ได้ เพราะสลับต้องถอนติ๊กก่อน)
   ⭐ มติเจ้าของ 25/09: ตัวติ๊กถูกถอด — โซนเลือกในบรรทัดด้วยช่อง "ไซต์ · โซน" ⇒ กติกา R10 ย้ายไปอยู่ที่
      **ช่องนั้น + ปุ่มลบท้ายบรรทัด**: บรรทัดที่ผูกโซนปิดใช้งานไว้แล้ว เปลี่ยนโซน/ลบบรรทัดได้เสมอ ·
      บรรทัดอื่นเลือกโซนนั้นใหม่ไม่ได้ (เห็นพร้อมเหตุ) · ตัวตัดสินอยู่ที่ `historicalZonePickerOptions` */
test('⭐ R10: ขั้น ② ขอ includeInactive=0 · โซนปิดใช้งานเลือกใหม่ไม่ได้ แต่บรรทัดที่ผูกไว้แล้วเปลี่ยนโซน/ลบได้เสมอ', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const SITES_PATH = \(customerId\) => `\/api\/service\/sites\?customerId=\$\{encodeURIComponent\(customerId\)\}&includeInactive=0`;/);
  /* ตัวเลือกต่อแถวมาจากตัวตัดสิน (ไม่ใช่ filter ใน JSX) · แถวถูกระบุด้วย key ไม่ใช่โซน (แถวใหม่ยังไม่มีโซน) */
  assert.match(src, /historicalZonePickerOptions\(\{\s*sites, zonesBySite, rows, rowKey: row\.key, missingNote: noteOf\.get\(row\.key\),\s*\}\)\.map\(zoneSelectOption\)/);
  const picker = slice(src, '<SearchableSelect', '/>');
  assert.match(picker, /value=\{row\.zoneId\}/);
  assert.match(picker, /onChange=\{\(value\) => pickRowZone\(row\.key, value\)\}/);
  assert.match(picker, /options=\{zoneOptionsByRow\.get\(row\.key\) \|\| \[\]\}/);
  assert.match(picker, /\n\s*disabled=\{busy\}\n/,
    'ช่องเปลี่ยนโซนปิดได้เฉพาะตอนกำลังบันทึก — ปิดเพราะโซนเดิมปิดใช้งาน = ทางตัน R10 กลับมา');
  /* ปุ่มลบไม่ผูกกับสถานะโซน · จอไม่ตัดสินเรื่องปิดใช้งานเอง (ตัวตัดสินอยู่ที่ lib) */
  assert.doesNotMatch(slice(src, '<QuoteLineRemoveCell', '/>'), /inactive|isActive/);
  assert.doesNotMatch(src, /disabled=\{busy \|\| inactive\}|\.isActive\b/);
  /* เปลี่ยนโซน = ย้ายการผูก **ไม่แตะแพ็คเกจ/จำนวน/ส่วนลด** (ของเดิมต้องถอนติ๊กแล้วคีย์บรรทัดใหม่ทั้งบรรทัด) */
  assert.match(src, /const pickRowZone = \(key, zoneId\) => patchRow\(key, \{ zoneId: zoneId \|\| "", siteId: siteOfZone\.get\(zoneId\)\?\.id \|\| "" \}\);/);
  assert.ok(!/จุด</.test(src), 'payload ของโซนไม่มีจำนวนจุด — ห้ามเดาเลขมาโชว์');

  /* ของจริงของตัวตัดสิน — แถวที่ผูกโซนปิดใช้งานไว้แล้ว ยังเห็นโซนตัวเองเป็นตัวเลือกที่ใช้ได้ + เหตุที่บอกทางออก */
  const bound = [{ key: 'r1', zoneId: 'ZN-2' }];
  assert.equal(pickerOption(bound, 'r1', 'ZN-2').disabled, false);
  assert.match(pickerOption(bound, 'r1', 'ZN-2').why, /เปลี่ยนเป็นโซนอื่น/);
  assert.equal(pickerOption(bound, 'r1', 'ZN-1').disabled, false, 'ย้ายไปโซนอื่นได้ทันที ไม่ต้องลบบรรทัดก่อน');
  assert.equal(intakeForm.historicalZoneLines({ ...REG, zones: bound, ready: true })[0].removable, true,
    'บรรทัดที่ผูกโซนปิดใช้งานลบได้เสมอ');
  /* บรรทัดอื่น: โซนปิดใช้งานเลือกใหม่ไม่ได้ · โซนที่บรรทัดอื่นผูกไว้ก็ไม่ได้ (หนึ่งโซนหนึ่งบรรทัด) — ทั้งคู่เห็นพร้อมเหตุ */
  const fresh = [{ key: 'r2', zoneId: '' }];
  assert.deepEqual([pickerOption(fresh, 'r2', 'ZN-2').disabled, pickerOption(fresh, 'r2', 'ZN-2').why], [true, 'ปิดใช้งานในทะเบียน']);
  assert.deepEqual([pickerOption([...bound, ...fresh], 'r2', 'ZN-2').disabled, pickerOption([...bound, ...fresh], 'r2', 'ZN-2').why],
    [true, 'อยู่ในรายการ 1 แล้ว']);
  /* ตัวเลือกที่ปิด "เห็นพร้อมเหตุ" — จอวาดเหตุในแถวของดรอปดาวน์ ไม่ใช่ซ่อนทิ้ง */
  assert.match(src, /\{option\.why \? <small className=\{styles\.zoneOptionWhy\}>\{option\.why\}<\/small> : null\}/);
});

/* 🔴 รีวิว R10 อีกครึ่ง: `includeInactive=0` (และไซต์ที่ถูกโอนไปลูกค้ารายอื่น · โซนที่ถูกลบ) ทำให้โซนที่ใบผูกไว้
   **ไม่อยู่ในทะเบียนที่โหลดมา** ⇒ ของเดิมแถวนั้นไม่ถูกเรนเดอร์เลย · ทางถอดทางเดียวไม่มีบนจอ ⇒ `state.zones` ลดไม่ได้
   ⭐ มติ 25/09: ทุกบรรทัดอยู่ในตารางเสมอ (วาดจาก `state.zones` ผ่าน historicalZoneLines ไม่ใช่จากทะเบียน)
      ⇒ ก้อน "โซนกำพร้า" + ปุ่ม "ถอดโซนนี้ออกจากใบ" ถูกถอด · ทางถอดคือปุ่มลบท้ายบรรทัด (ลบได้เมื่ออ่านทะเบียนครบแล้ว)
      และช่อง "ไซต์ · โซน" ต้องบอกเหตุ ไม่ใช่เด้งเป็น "เลือกไซต์ · โซน" ทั้งที่ใบยังผูกโซนนั้นอยู่ */
test('⭐ R10: โซนที่ใบผูกไว้แต่ทะเบียนไม่มีให้เห็น — บรรทัดยังอยู่ในตาราง ลบได้ และช่องโซนบอกเหตุ', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const ready = !loading && !loadError;/,
    'ระหว่างโหลด/โหลดพัง ยังตัดสินไม่ได้ว่าโซนไหนหาย — ไม่งั้นทุกบรรทัดขึ้น "ไม่อยู่ในทะเบียน" ชั่วครู่');
  assert.match(src, /historicalZoneLines\(\{\s*zones: rows, sites, zonesBySite, siteErrors, ready, failed: Boolean\(loadError\),\s*\}\)/,
    'บรรทัดของตารางมาจาก state.zones ทั้งชุด ไม่ใช่จากทะเบียน (ของเดิมวาดจากทะเบียน ⇒ บรรทัดที่หายไม่มีที่ให้ลบ)');
  assert.match(src, /const noteOf = new Map\(lines\.map\(\(line\) => \[line\.row\.key, line\.note\]\)\);/,
    'เหตุบนช่องโซนมาจากตัวตัดสินตัวเดียวกับปุ่มลบ — สองที่พูดคนละเรื่องไม่ได้');
  assert.match(src, /option\.missing \? option\.label : option\.zoneName/, 'ตัวเลือกบอกเหตุวาดเหตุเต็ม ไม่ใช่ชื่อโซนเปล่า');
  assert.match(src, /const removeRow = \(key\) => setRows\(rows\.filter\(\(row\) => row\.key !== key\)\);/);
  assert.doesNotMatch(src, /browser\.orphans|ถอดโซนนี้ออกจากใบ/, 'ก้อนกำพร้าถูกถอด — ปุ่มลบท้ายบรรทัดคือทางเดียว');

  /* ของจริงของตัวตัดสิน */
  const gone = [{ key: 'r1', zoneId: 'ZN-GONE' }];
  const [line] = intakeForm.historicalZoneLines({ ...REG, zones: gone, ready: true });
  assert.equal(line.removable, true, 'อ่านทะเบียนครบแล้วไม่เจอ = กำพร้าจริง ⇒ ลบได้');
  assert.match(line.note, /ไม่อยู่ในทะเบียน/);
  const [first] = intakeForm.historicalZonePickerOptions({ ...REG, rows: gone, rowKey: 'r1', missingNote: line.note });
  assert.deepEqual([first.value, first.label, first.disabled, first.missing], ['ZN-GONE', line.note, true, true],
    'ตัวเลือกบอกเหตุอยู่บนสุด · เลือกซ้ำไม่ได้ · ป้ายบนช่อง = เหตุ');
  /* ระหว่างโหลด: ยังไม่รู้ ⇒ ห้ามบอกว่าหาย และห้ามลบ */
  const [pending] = intakeForm.historicalZoneLines({ zones: gone, sites: [], zonesBySite: {}, ready: false });
  assert.equal(pending.removable, false);
  assert.doesNotMatch(pending.note, /ไม่อยู่ในทะเบียน/);
  /* บรรทัดใหม่ที่ยังไม่เลือกโซน ไม่ใช่ของที่หาย — ไม่มีเหตุ ไม่มีตัวเลือกบอกเหตุ ลบได้ */
  const blank = [{ key: 'r2', zoneId: '' }];
  const [fresh] = intakeForm.historicalZoneLines({ ...REG, zones: blank, ready: true });
  assert.deepEqual([fresh.note, fresh.removable], [null, true]);
  assert.equal(intakeForm.historicalZonePickerOptions({ ...REG, rows: blank, rowKey: 'r2' }).some((option) => option.missing), false);
});

/* 🐞 UAT 23/09 บนของจริง (AR-374 · 26 ไซต์ 43 โซน) — ของเดิมพังสามทางที่ยามแบบนี้เฝ้าได้:
     ① `Promise.all(siteRows.map((site) => apiJson(...)))` = ไซต์เดียวพัง **ลิสต์ว่างทั้งจอ**
     ② ไม่มีช่องค้น ③ กางการ์ดทุกใบรวด
   ⭐ มติ 25/09: การ์ดไซต์ถูกถอด (③ ไม่มีแล้ว) · ช่องค้นย้ายไปหน้าต่าง "เพิ่มหลายโซน" + ช่อง "ไซต์ · โซน" ค้นในตัว (②)
      · ปุ่มลองใหม่รายการ์ดกลายเป็นปุ่มเดียวบนก้อนเตือน "ยังโหลดโซนไม่สำเร็จ" ที่ยิงขาโหลดรายไซต์ตัวเดิมทุกไซต์ที่พัง */
test('⭐ ขั้นโซนโหลดทีละไซต์แบบพังทีละใบ — ไซต์ที่พังลองอ่านใหม่ได้ด้วยขาโหลดรายไซต์ตัวเดิม', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const loadSiteZones = useCallback\(async \(site\) => \{/);
  assert.match(src, /return \{ id: site\.id, zones: \[\], error: /,
    'ขาโหลดรายไซต์ต้องคืน error เป็นข้อมูล ไม่ใช่ throw (throw = ล้มทั้งก้อน)');
  assert.match(src, /Promise\.all\(siteRows\.map\(loadSiteZones\)\)/);
  assert.doesNotMatch(src, /Promise\.all\(siteRows\.map\(\(site\) => apiJson/,
    'ยิงดิบใน Promise.all = ไซต์เดียวพังแล้วทั้งลิสต์ว่าง (บั๊กเดิม)');
  assert.match(src, /const retrySite = useCallback\(async \(site\) => \{/);
  assert.match(src, /const result = await loadSiteZones\(site\);/, 'ลองใหม่ = ขาเดิมที่ไม่ throw ไม่ใช่ยิงดิบอีกเส้น');
  assert.match(src, /setSiteErrors\(\(current\) => \(\{ \.\.\.current, \[site\.id\]: result\.error \|\| undefined \}\)\)/,
    'ตัวอัปเดตแบบฟังก์ชัน ⇒ ยิงหลายไซต์พร้อมกันไม่ทับผลกัน');
  assert.match(src, /const failedSites = sites\.filter\(\(site\) => siteErrors\[site\.id\]\);/);
  assert.match(src, /const retryFailedSites = \(\) => \{ for \(const site of failedSites\) retrySite\(site\); \};/);
  assert.match(src, /onClick=\{retryFailedSites\}/);
  assert.match(src, /failedSites\.map\(\(site\) => <li key=\{site\.id\}>\{\[site\.code, site\.name\]\.filter\(Boolean\)\.join\(" "\)\} — \{siteErrors\[site\.id\]\}<\/li>\)/,
    'ต้องบอกว่าไซต์ไหนพังเพราะอะไร ไม่ใช่แค่จำนวน');
});

/* 🐞 UAT 23/09: ลูกค้าโซนเยอะหาโซนไม่เจอเพราะไม่มีช่องค้น · กฎบ้าน: ช่องค้นทุกช่องปิด autoComplete (#1372) และ
   ตาเห็นบนแถว = ต้องค้นเจอ (search haystack) ⭐ มติ 25/09: ช่องค้นของขั้นย้ายไปอยู่ในหน้าต่าง "เพิ่มหลายโซน"
   (ตัวค้นตัวเดิม historicalZoneBrowser) · ช่อง "ไซต์ · โซน" ในบรรทัดค้นด้วยช่องค้นของ SearchableSelect เอง */
test('⭐ ช่องค้นไซต์/โซนปิด autoComplete และค้นได้ทุกอย่างที่ตาเห็น — ทั้งหน้าต่างเพิ่มหลายโซนและช่องโซนในบรรทัด', () => {
  /* ⭐ PR-D (D27): ช่องค้นของหน้าต่างอยู่ที่ตัวกลาง (ตัวห่อไม่มีช่องค้นของตัวเอง) · ค้น/ซ่อนมาจาก `zoneBrowserRows` ของตัวกลาง
     ส่วนทะเบียนที่ส่งให้มาจากตัวแปลงที่ตรึงไว้ (`historicalBulkRegistrySites` — ทะเบียนรายไซต์ชุดเดียวกับขั้น ②) */
  const bulk = code(BULK);
  const shared = code(SHARED_BULK);
  assert.doesNotMatch(bulk, /type="search"|setQuery|historicalZoneBrowser/, 'ช่องค้นมีที่เดียว (ตัวกลาง) — สองช่องค้น = สองกติกา');
  const searchField = slice(shared, 'type="search"', '/>');
  assert.match(searchField, /autoComplete="off"/, 'กฎบ้าน: ช่องค้นทุกช่องปิด autoComplete');
  assert.match(searchField, /value=\{query\}/);
  assert.match(searchField, /aria-label="ค้นหาไซต์หรือโซนของลูกค้ารายนี้"/);
  assert.match(shared, /zoneBrowserRows\(\{ registrySites, query, taken, picked: pickedSet \}\)/,
    'ค้น/ซ่อน ต้องมาจากตัวตัดสินที่ตรึงไว้ ไม่ใช่ filter ใน JSX');
  assert.match(bulk, /historicalBulkRegistrySites\(\{\s*sites, zonesBySite, siteErrors, assessedByZone: assessed,?\s*\}\)/,
    'ทะเบียนของหน้าต่าง = ทะเบียนรายไซต์ชุดเดียวกับขั้น ② (ไม่โหลดเอง)');
  /* ช่องโซนในบรรทัด: ช่องค้นของ primitive ปิด autoComplete · คำค้นกินรหัส/ชื่อไซต์ + ชื่อ/รหัสโซน */
  assert.match(code(SEARCHABLE), /<input autoComplete="off"/);
  const hint = 'ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน';
  assert.ok(slice(code(STEP_ZONES), '<SearchableSelect', '/>').includes(`searchPlaceholder="${hint}"`));
  assert.ok(shared.includes(`placeholder="${hint}"`), 'สองช่องค้นของขั้นเดียวกันพูดคำเดียวกัน');
  const option = pickerOption([{ key: 'r1', zoneId: '' }], 'r1', 'ZN-3');
  for (const seen of ['SB-02', 'สาขาบางนา', 'ทางเข้า', 'Z-GATE']) {
    assert.ok(option.search.includes(seen.toLowerCase()), `ค้น "${seen}" ต้องเจอโซนนี้ (ตาเห็นบนแถว)`);
  }
});

/* 🚫 มติเจ้าของ 25/09 — ของที่ถูกถอดจากขั้น ② (ยามเดิม "การ์ดไซต์พับได้ด้วย CollapsibleCard" ลบทิ้งเพราะการ์ดไม่มีแล้ว)
   🐞 เหตุที่ถอด: ติ๊กโซนนอกตารางก่อนบรรทัดถึงเกิด = กลับหัวกับใบเสนอราคา · ถอนติ๊ก = บรรทัดหายพร้อมจำนวน/ส่วนลดไม่ถาม
      · ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" เททับแพ็คเกจของทุกบรรทัดเงียบ ๆ และไม่บันทึกอะไร (ตอนเปิดแก้ใบอ่านจากบรรทัดแรก)
   ⇒ ยามนี้กันไม่ให้ของพวกนี้ไหลกลับมาครึ่ง ๆ กลาง ๆ (เช่น ตัวติ๊กกลับมาแต่ไม่มีกติกา R10) */
test('🚫 25/09: ขั้น ② ไม่เหลือการ์ดไซต์ · ตัวติ๊กโซน · ช่องค้นของขั้น · "การแสดงผล" · ช่องแพ็คเกจทุกโซน', () => {
  const src = code(STEP_ZONES);
  assert.doesNotMatch(src, /CollapsibleCard|openSites|defaultOpen|type="checkbox"|setQuery|toggleZone|applyPackage/);
  assert.doesNotMatch(src, /การแสดงผล|ใช้แพ็คเกจเดียวกันทุกโซน|packageProductId/);
  assert.equal('ZONE_SITE_AUTO_OPEN_MAX' in intakeForm, false, 'เพดานกางการ์ดอัตโนมัติไม่มีที่ใช้แล้ว');
  const browser = intakeForm.historicalZoneBrowser({ ...REG });
  assert.equal('defaultOpen' in browser.rows[0], false, 'ตัวกางทะเบียนไม่ตัดสินการพับการ์ดที่ไม่มีอยู่แล้ว');
  assert.doesNotMatch(read('components/salesPlanning/historicalWizard/HistoricalOrderWizard.module.css'),
    /\.zonePicks?\b|\.browseField\b|\.browseRow\b/, 'สไตล์ของการ์ด/แถวการแสดงผลถูกถอดตามไปด้วย');
});

/* 🐞 มติเจ้าของ 23/09: ปุ่มลัด "ใช้ราคาแพ็คเกจ × แพ็ค × เดือน" คูณเดือนซ้ำบนจำนวนที่นับเดือนไปแล้ว
   (1 ชุด × 12 เดือน = จำนวน 12 แล้วปุ่มเสนอ 3,500 × 12 × 12 = 504,000) ⇒ ถอดทั้งปุ่มและตัวคิดยอดของมัน */
test('🚫 ขั้น ② ไม่มีปุ่มลัดยอดโซนจากเดือนอีกแล้ว', () => {
  const src = code(STEP_ZONES);
  assert.doesNotMatch(src, /zoneAmountSuggestion|suggestAmount|suggestInput/);
  assert.doesNotMatch(src, /ราคาแพ็คเกจ × แพ็ค × เดือน/);
});

/* 🐞 UAT 23/09 (ข้อมูลหาย): สลับลูกค้าล้างแค่โซน แล้วทิ้งงวดที่คิดจากโซนชุดนั้นไว้ — เงียบด้วย
   ⇒ ทั้งคำถามและของที่ล้างต้องมาจาก `historicalDownstreamReset` ตัวเดียว
   ⭐ มติเจ้าของ 25/09: ช่อง VAT ย้ายไปกล่องสรุปของขั้น ② ⇒ ทางเปลี่ยน VAT ย้ายตามไป (`changeVat` ของ WizardZonesStep)
      แต่ต้องยัง **ถามก่อน + ล้างด้วยก้อนเดียวกัน** · ลูกค้ายังเปลี่ยนที่ขั้น ① (`changeUpstream`) */
test('⭐ เปลี่ยนลูกค้า (ขั้น ①) / VAT (กล่องสรุปขั้น ②) ถามก่อนด้วย ConfirmDialog แล้วล้างปลายน้ำเป็นก้อนเดียว', () => {
  const contract = code(STEP_CONTRACT);
  assert.match(contract, /import \{ confirmAction \} from "@\/components\/ui\/ConfirmDialog"/);
  assert.match(contract, /const reset = historicalDownstreamReset\(state, field\);/);
  assert.match(contract, /if \(reset\.ask\) \{/);
  assert.match(contract, /confirmAction\(\{/);
  assert.match(contract, /patch\(\{ \.\.\.next, \.\.\.reset\.patch \}\);/,
    'ล้างด้วย patch ก้อนที่ตัวตัดสินคืนมา ไม่ใช่รายการที่เขียนมือใน JSX');
  assert.match(contract, /changeUpstream\("customer", \{ customerId: value \}\)/);
  assert.doesNotMatch(contract, /changeUpstream\("vat"/, 'VAT มีทางเปลี่ยนทางเดียว — ที่กล่องสรุปของขั้น ②');

  const zones = code(STEP_ZONES);
  assert.match(zones, /import \{ confirmAction \} from "@\/components\/ui\/ConfirmDialog"/);
  const changeVat = slice(zones, 'const changeVat = async (value) => {', 'const changeDiscount');
  assert.match(changeVat, /if \(!HISTORICAL_VAT_RATES\.includes\(value\) \|\| value === state\.vatRate\) return;/,
    'เลือกค่าเดิมซ้ำต้องไม่ถาม/ไม่ล้างงวด');
  assert.match(changeVat, /const reset = historicalDownstreamReset\(state, "vat"\);/);
  assert.match(changeVat, /if \(reset\.ask\) \{/);
  assert.match(changeVat, /confirmAction\(\{/);
  assert.match(changeVat, /if \(!go\) return;/, 'กดยกเลิก = VAT เดิมและงวดเดิมอยู่ครบ');
  assert.match(changeVat, /onChange\(\{ vatRate: value, \.\.\.reset\.patch \}\);/);
  assert.match(slice(zones, '<QuoteLineTotalsEditor', '/>'), /onVatRateChange=\{changeVat\}/,
    'กล่องสรุปต้องเปลี่ยน VAT ผ่านทางที่ถามก่อน ไม่ใช่ onChange ตรง');
  for (const [file, src] of [[STEP_CONTRACT, contract], [STEP_ZONES, zones]]) {
    assert.doesNotMatch(src, /zones: \[\], packageProductId|installments: \[\]|hasOpening: null/,
      `${file}: ล้างมือใน JSX = ลืมงวดอีกครั้ง (บั๊กเดิม)`);
  }

  /* ของที่ล้างจริง: VAT ล้างงวดแต่ **ไม่แตะรายการ** · ลูกค้าล้างรายการ + งวด (ไม่มีช่องแพ็คเกจทุกโซนให้ล้างแล้ว) */
  const state = {
    ...intakeForm.emptyHistoricalWizard(),
    zones: [intakeForm.emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-A' })],
    hasOpening: false,
    installments: [intakeForm.emptyHistoricalInstallment({ amount: '100' })],
  };
  const vat = intakeForm.historicalDownstreamReset({ ...state, vatRate: 0 }, 'vat');
  assert.equal(vat.ask, true);
  assert.equal('zones' in vat.patch, false, 'เปลี่ยน VAT ห้ามล้างรายการ');
  assert.deepEqual(vat.patch.installments, []);
  /* 🐞 รีวิว 25/09: VAT อยู่ขั้น ② แล้ว ⇒ ใบใหม่คีย์งวดที่ขั้น ③ ก่อนเลือก VAT ได้ (กดรางข้ามขั้น) · เลือก VAT **ครั้งแรก**
     ต้องไม่ถูกนับเป็น "เปลี่ยน" (เคยถามล้างงวดที่เลี่ยงไม่ได้ — ยกเลิกแล้วไปต่อไม่ได้) · โหมดรุ่นก่อนที่ถูกถอดยังถาม */
  const firstPick = intakeForm.historicalDownstreamReset(state, 'vat');
  assert.equal(firstPick.ask, false, 'ยังไม่เคยเลือก VAT = ไม่มียอดให้คิดใหม่ ไม่ถาม');
  assert.deepEqual(firstPick.patch, {}, 'และไม่ล้างงวดที่คีย์ไว้');
  assert.equal(intakeForm.historicalDownstreamReset({ ...state, amountsIncludeVat: true }, 'vat').ask, true,
    'ใบจากโหมด "ถอด VAT" รุ่นก่อน (vatRate ว่างตอนโหลด) ยังถามก่อนล้าง');
  const customer = intakeForm.historicalDownstreamReset(state, 'customer');
  assert.deepEqual(Object.keys(customer.patch).sort(), ['hasOpening', 'installments', 'opening', 'openingFull', 'zones']);
  assert.deepEqual(customer.patch.zones, []);
});

/* 🐞 UAT 23/09 (ค่าที่พิมพ์หายเงียบ): `DateInput` ไม่เรียก onChange เมื่อค่าหลุด min/max
   แล้วเด้งกลับตอนเบลอ ⇒ ขอบต้องเป็นช่วงเอกสาร และกฎต้องเป็นข้อความใต้ช่อง */
test('⭐ ช่องวันสัญญาไม่กลืนค่าที่พิมพ์ — กฎอยู่ใต้ช่องจาก local issues', () => {
  const src = code(STEP_CONTRACT);
  assert.doesNotMatch(src, /max=\{todayIso/, 'ขอบที่กลืนค่า = ผู้คีย์พิมพ์แล้วหายเงียบ');
  assert.doesNotMatch(src, /min=\{state\.contract\?\.startDate/);
  assert.match(src, /const noteOf = \(field\) => issues\.find\(\(issue\) => issue\.field === field\)\?\.message \|\| null;/);
  assert.match(src, /noteOf\("contract\.startDate"\)/);
  assert.match(src, /noteOf\("contract\.endDate"\)/);
  assert.match(code(WIZARD), /zeroValue, todayIso, totalAmount: invoiceTotal,/,
    'กฎ "ไม่เกินวันนี้" ต้องได้นาฬิกาไทยของหน้า ไม่งั้นเงียบทั้งชุด');
});

/* ป้าย "N เดือน" เคยปัดเศษลง ⇒ ปุ่มลัดเสนอยอดขาดไปทั้งเดือน (ดู contractMonths)
   🐞 ยามตัวนี้เคยไล่แค่ขั้น ①–② ⇒ **ขั้น ④ หลุดออกมา** แล้วเรียก `contractMonths` ตรง ๆ อยู่
      ⇒ ช่วงที่ไม่ลงตัวเป็นเดือน: ขั้น ①–③ บอกว่ายังไม่รู้ แต่แผ่นตรวจพิมพ์ "N เดือน" ให้เลย
      ⇒ ทุกขั้นที่ถามระยะสัญญาต้องอยู่ในลิสต์นี้ ไม่ใช่เฉพาะขั้นที่นึกออกตอนเขียนยาม
   ⭐ มติเจ้าของ 23/09: ขั้น ② **เลิกถามระยะสัญญา** — ยอดของโซนคือ จำนวน × ราคา/หน่วย แบบใบเสนอราคา
      (ช่อง "ระยะสัญญา" มีไว้ให้ปุ่มลัด × เดือน ซึ่งถูกถอด) ⇒ ขั้น ② ต้องไม่มีตัวเดือนสักตัว */
test('⭐ ป้ายระยะสัญญาอ่านจาก contractSpan — ช่วงที่ไม่ลงตัวเป็นเดือนต้องบอกเหตุ', () => {
  /* ⭐ ขั้น ④ (มติ 25/09): ประโยคของแถวตรวจอยู่ที่ lib (`historicalReviewView`) — จอไม่คิดเดือนเองแล้ว */
  const REVIEW_VIEW = 'lib/sales/historicalReviewView.js';
  for (const file of [STEP_CONTRACT, STEP_MONEY, STEP_REVIEW, REVIEW_VIEW, SPLIT]) {
    const src = code(file);
    /* ⭐ 25/09: ขั้น ③ นับเดือนด้วย `serviceMonthSpan` (contractMonths + สัญญาที่จบตรงวันครบรอบ — มติข้อ 3) */
    if (file !== SPLIT && file !== STEP_REVIEW) assert.match(src, file === STEP_MONEY ? /serviceMonthSpan\(/ : /contractSpan\(/, file);
    assert.doesNotMatch(src, /contractMonths\(/, `${file} ต้องไม่เรียกตัวเดือนดิบ (ไม่มีช่องบอกเหตุ)`);
  }
  assert.match(code(STEP_CONTRACT), /\(spanNote \? <small>\{spanNote\}<\/small> : null\)/,
    'ช่วงที่ไม่ลงตัวเป็นเดือนต้องบอกเหตุใต้วันสิ้นสุด (ลงตัว = ป้ายจำนวนเดือน)');
  /* ป้ายเดือนตัวเดียวของทุกจอ (`contractSpan().monthsText` — มีวันครบรอบในตัว · รีวิว 25/09) */
  assert.match(code(STEP_CONTRACT), /<span className=\{styles\.monthsChip\}>\{monthsText\}<\/span>/);
  assert.match(code(STEP_MONEY), /const contractMonthsText = contractSpan\(start, end\)\.monthsText;/);
  assert.doesNotMatch(code(STEP_ZONES), /contractSpan\(|contractMonths\(|ระยะสัญญา<\/span>/,
    'ขั้น ② ไม่คิดอะไรจากเดือนแล้ว — ป้ายเดือนข้างช่องจำนวนชวนให้คูณเดือนซ้ำ (บั๊ก 504,000)');
  /* ช่วงที่เหลือไม่ลงตัวเป็นเดือน = หน้าต่างแบ่งงวดบอกเหตุที่ตัวเลือกกดไม่ได้ (`historicalSplitOptions().note`) */
  assert.match(code(SPLIT), /\{note \? <small>\{note\}<\/small> :/);
  assert.match(code(REVIEW_VIEW), /monthsText \? ` · \$\{monthsText\}` : \(spanNote \? ` · \$\{spanNote\}` : ''\)/,
    'ขั้น ④ ต้องพูดเหตุเดียวกัน ไม่ใช่เว้นว่างเมื่อช่วงไม่ลงตัวเป็นเดือน');
  const odd = reviewView.historicalReviewChecklist({ contract: { startDate: '2026-01-15', endDate: '2026-03-01' }, header: {} })
    .find((row) => row.key === 'contract');
  assert.ok(odd.value.includes(intakeForm.contractSpan('2026-01-15', '2026-03-01').note), 'ช่วงไม่ลงตัวเป็นเดือน = บอกเหตุคำเดียวกับขั้น ①');
});

// ── 6. ด่านใบซ้ำ — ส่วนที่ยามแบบนี้เฝ้าได้ (ที่เหลืออยู่ใน historicalIntakeForm.test.mjs) ──

test('⭐ ฟอร์มตัดสินด่านใบซ้ำและทางออกด้วยตัวตัดสินที่ตรึงไว้ ไม่ใช่เงื่อนไขในวงเล็บของ JSX', () => {
  const src = code(WIZARD);
  assert.match(src, /const gate = historicalDuplicateGate\(\{ duplicates, acknowledged, localIssues \}\);/);
  assert.match(src, /const exitInfo = historicalSaveExit\(saveError\);/);
  assert.match(src, /historicalSaveResultView\(saveFailure\.exit, \{/,
    'ปุ่มทางออกต้องมาจากตัวตัดสิน ไม่ใช่ {exit.canX && (…)} ที่ถอดทีละอันได้เงียบ ๆ');
  /* 🔴 409 ใบซ้ำ = กลับขั้น ④ พร้อมรายการใหม่ + สวิตช์ปิด (ไม่ใช่แผงผิดพลาด) */
  const dup = slice(src, 'if (exit.kind === "duplicate") {', 'return;');
  assert.match(dup, /setDuplicates\(/);
  assert.match(dup, /setAckIds\(\[\]\);/, 'สวิตช์กลับเป็นปิด (ชุด id ที่ยืนยันว่าง)');
  assert.match(dup, /setStep\("review"\);/);
  assert.doesNotMatch(src, /historicalExitActions|historicalSaveFailureState/, 'ตัวตัดสินรุ่นที่มีปุ่ม "บันทึกอีกครั้ง" ข้ามด่าน ถูกถอดแล้ว');
});

/* กฎบ้าน "ติดด่าน = โชว์แล้วบอกเหตุ" จะจริงก็ต่อเมื่อ **เหตุอยู่ในสายตา** */
test('⭐ กดปุ่มที่ติดด่าน = พาไปหาเหตุ (ขั้นที่ยังขาด หรือสวิตช์ยืนยันใบซ้ำ)', () => {
  const src = code(WIZARD);
  assert.match(src, /const first = firstStepWithIssues\(localIssues\) \|\| "contract";/);
  assert.match(src, /setFocusField\(historicalNextBlock\(localIssues, first\)\.field\);/,
    'ไปถึงขั้นแล้วยังต้องชี้ช่องด้วย — ขั้นเดียวมีได้หลายช่อง');
  assert.match(src, /dupSwitchRef\.current\?\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
  assert.match(src, /dupSwitchRef\.current\?\.focus\(\)/);
  assert.match(src, /switchRef=\{dupSwitchRef\}/, 'ต้องส่ง ref ลงไปถึงปุ่มสวิตช์จริง');
  assert.match(code(STEP_REVIEW), /ref=\{switchRef\}/);
});

/* 🔴 **คำบนจอต้องชี้ของที่มีอยู่จริง** (UAT 23/09) — ขั้น ④ เคยสั่งให้กดปุ่ม "ตรวจอีกครั้ง"
   ที่ไม่เคยมี · แถบท้ายของขั้น ①–③ เคยบอกว่ากำลังจะส่งอนุมัติทั้งที่ปุ่มเดียวคือ "ถัดไป" */
test('⭐ ถ้อยคำที่ชี้ปุ่มมาจากตัวตัดสิน ไม่ใช่สตริงที่พิมพ์ทิ้งไว้ใน JSX', () => {
  const src = code(WIZARD);
  assert.match(src, /\{ text: historicalFootNote\(\{ step \}\), tone: null \}/);
  assert.match(src, /historicalReviewFootNote\(\{/, 'บรรทัดใต้ปุ่มของขั้น ④ มาจากตัวตัดสินของขั้น ④');
  assert.match(src, /\{footNote\.text\}/);
  assert.doesNotMatch(src, /ส่งให้ AE Sup อนุมัติทันทีที่บันทึก/,
    'ประโยคของขั้นที่บันทึกจริง ห้ามยืนอยู่บนขั้นที่ยังไม่บันทึกอะไร');
  assert.match(src, /label=\{busy \? \(saveRun \? "กำลังบันทึก…" : "กำลังตรวจ…"\) : HISTORICAL_SAVE_BUTTON_LABEL\}/);

  const review = code(STEP_REVIEW);
  assert.doesNotMatch(review, /ตรวจอีกครั้ง/, 'ไม่มีปุ่มชื่อนี้อยู่บนจอเลย');
  assert.match(review, /const stale = historicalReviewStaleNotice\(\);/);
});

test('ขั้น ④ ยังวาดตารางใบที่อาจซ้ำ + สวิตช์ยืนยัน เมื่อพรีวิวพบใบซ้ำ', () => {
  const review = code(STEP_REVIEW);
  assert.match(review, /\{dupes\.length > 0 && \(/, 'ตารางขึ้นเฉพาะตอนพบ — ไม่ใช่หมวดที่มีทุกใบ');
  assert.match(review, /aria-label="ตรวจแล้ว ไม่ใช่ใบซ้ำ"/);
  assert.match(review, /onClick=\{\(\) => onAcknowledge\?\.\(!acknowledged\)\}/);
});

// ── 7. ชื่อที่ import จาก lib มีอยู่จริงไหม ─────────────────────────────────────────────

/* 🐞 ขั้น ③ เคย `import { DOC_DATE_MAX, DOC_DATE_MIN } from "@/lib/sales/historicalIntakeForm"`
   ทั้งที่โมดูลนั้นไม่ได้ export สองตัวนี้ (มันอยู่ที่ `historicalOrders.js`) · package.json เป็น
   `"type": "module"` ⇒ ชื่อที่ไม่มีจริงคือ **module error ตอน instantiate** = ขั้น ③ ไม่ขึ้นเลย
   (ในทางที่ผ่อนที่สุดคือได้ `undefined` แล้ว min/max ของ DateInput หายเงียบ)
   🔴 ไม่มีเทสต์ไหนจับได้เพราะ **ไม่มีอะไรในชุดเทสต์ import ตัว component เลย** (JSX รันใต้ Node
   ตรง ๆ ไม่ได้) ⇒ ยามตัวนี้เทียบรายชื่อที่ไฟล์ขอ กับ export จริงของโมดูลที่ import มาได้ */
const HISTORICAL_COMPONENTS = [
  WIZARD,
  STEP_CONTRACT,
  STEP_ZONES,
  STEP_MONEY,
  STEP_REVIEW,
  BULK,
  LINE_SERVICE,
  INST_TABLE,
  SPLIT,
  CARD_HEADING,
  'components/salesPlanning/historicalWizard/CoverageTimeline.js',
  'components/salesPlanning/HistoricalDuplicateTable.js',
  'components/salesPlanning/HistoricalDuplicateReviewCard.js',
  NEW_PAGE,
  EDIT_PAGE,
];

test('⭐ ทุกชื่อที่ขั้นต่าง ๆ import จาก lib ของสายนี้ ต้องมี export อยู่จริง', () => {
  const modules = {
    '@/lib/sales/historicalIntakeForm': intakeForm,
    '@/lib/sales/historicalOrders': historicalOrders,
    '@/lib/sales/historicalOrderCopy': orderCopy,
    '@/lib/sales/historicalReviewView': reviewView,
    '@/lib/sales/historicalDuplicates': duplicatesLib,
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

// ── 8. รอบแก้จากรีวิว 23/09 — สี่ข้อที่ยามแบบ regex เฝ้าได้ ─────────────────────────────

/* 🐞 **R6** — ขั้น ① สลับไปเรนเดอร์ `AttachmentsPanel` ทันทีที่มี `contractId` แต่ของเดิม
   **ไม่ได้ต่อ `onItemsChange`** และ **ไม่ได้แคบชนิดเอกสาร** ⇒ สองทางตันในก้อนเดียว:
     ① ตัวนับของฟอร์มค้างที่ภาพนิ่งตอน mount ⇒ แนบแล้วด่านยังค้าง / ลบแล้วด่านยังผ่าน
     ② แผงที่ไม่แคบ `docTypes` อัปเป็น `signed_contract` (ตัวแรกของทะเบียน contract) โดยไม่มี
        ตัวเลือกให้เห็น แต่ RPC ส่งอนุมัติของ 0374 รับเฉพาะ `external_doc`
        ⇒ ไฟล์อยู่ตรงหน้า แต่ historical_so_contract_file_missing ตลอดกาล */
test('⭐ R6: แผงไฟล์สัญญาแคบไว้ที่ external_doc และรายงานจำนวนกลับให้ฟอร์ม', () => {
  const src = code(STEP_CONTRACT);
  assert.match(src, /docTypes=\{\[\{ key: EXTERNAL_DOC_TYPE/,
    'ไม่แคบ docTypes = แผงอัดเป็น signed_contract ซึ่ง RPC ส่งอนุมัติไม่รับ');
  assert.match(src, /onItemsChange=\{onContractPanelItems\}/,
    'ไม่ต่อ onItemsChange = ตัวนับไม่มีทางรู้ว่าไฟล์ถูกแนบหรือถูกลบ');
  assert.match(src, /key=\{`contract-files-\$\{contractFilesVersion\}`\}/,
    'แผงโหลดตอน mount เท่านั้น — อัปเสร็จแล้วต้องสั่งให้อ่านใหม่');

  const wizard = code(WIZARD);
  assert.match(wizard, /historicalContractFileCount\(\{/, 'ตัวนับต้องมาจากตัวตัดสินที่ตรึงด้วยเทสต์');
  assert.doesNotMatch(wizard, /serverContractFiles \+ contractFiles\.length/,
    'ภาพนิ่ง + ตะกร้า = ทางตันของ R6 · ห้ามถอยกลับ');
  assert.match(wizard, /loaded\s*\n?\s*\?[\s\S]{0,200}?docType === EXTERNAL_DOC_TYPE/,
    'นับเฉพาะ external_doc และเฉพาะตอนแผงโหลดเสร็จจริง');
  assert.match(wizard, /: null\)/, '`loaded` เท็จ = ยังไม่รู้ (null) ไม่ใช่ 0');
  assert.match(wizard, /setContractFilesVersion\(\(version\) => version \+ 1\)/);
  assert.match(wizard, /file\?\.docType === EXTERNAL_DOC_TYPE/,
    'จำนวนที่ hydrate มาก็ต้องกรองชนิดเดียวกัน ไม่งั้นด่านผ่านด้วยไฟล์ที่ฐานไม่รับ');
});

/* 🐞 **R7** — พรีวิวตอบ 400 โดยไม่คืน plan ⇒ ทุกตัวเลขเงินบนจอตายทั้งรอบคีย์
   ⇒ ยอดใบต้องมาจาก `historicalMoneyView` (มีแผนใช้แผน · ไม่มีก็คิดจากยอดโซน + โหมด VAT
     ด้วย `splitHistoricalAmounts` ก้อนเดียวกับ server) ไม่ใช่ `plan.header` ตรง ๆ */
test('⭐ R7: ยอดบนจอทุกที่อ่านจาก historicalMoneyView ไม่ใช่ plan.header ตรง ๆ', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /historicalMoneyView\(state, plan, serverMoney\)/);
  /* ⭐ 25/09: แถบสรุปข้างขวาถูกถอดทุกขั้น ⇒ ยอดใบของขั้น ③ อยู่ในกล่องสรุปท้ายตารางงวด (จาก moneyView ตัวเดียวกัน) */
  assert.doesNotMatch(wizard, /DocumentSummaryCard/, 'ไม่มีการ์ดสรุปข้างขวาแล้ว');
  assert.match(wizard, /const invoiceTotal = money\.ok \? money\.totalAmount : null;/);
  assert.match(wizard, /money=\{money\}/, 'ขั้น ② และ ③ ต้องได้ยอดตัวเดียวกับการ์ดสรุป');

  for (const file of [STEP_ZONES, STEP_MONEY]) {
    const src = code(file);
    assert.match(src, /historicalMoneyView/, file);
    assert.doesNotMatch(src, /plan\?\.header\?\.totalAmount/, `${file}: ยอดใบต้องไม่ผูกกับแผนอย่างเดียว`);
    assert.doesNotMatch(src, /plan \? fmtMoney\(plan\.header\./, `${file}: แถบยอดต้องไม่ขึ้นขีดเมื่อยังไม่มีแผน`);
  }
  const money = code(STEP_MONEY);
  assert.doesNotMatch(money, /ตรวจข้อมูลขั้นก่อนหน้าให้ผ่านก่อน/,
    'ประโยคนี้โกหกตอนขั้น ② ผ่านแล้ว — เหตุต้องมาจาก moneyView.reason');
  assert.doesNotMatch(money, /ยอดใบขึ้นเมื่อตรวจขั้น ② ผ่าน/);
  /* ยังไม่มีแผน = ยังต้องเห็นยอดใบ/ยอดที่ต้องเก็บ — ห่วงโซ่คิดจากยอดที่ moneyView คิดได้ */
  assert.match(money, /const chain = historicalInstallmentChain\(state, \{ totalAmount: total, todayIso \}\);/);
  assert.match(money, /const remainingText = chain\.remaining === null \|\| remainingNegative \? NA : fmtMoney\(chain\.remaining\);/,
    'ยอดที่ต้องเก็บติดลบ (งวดยกมาเกินยอดใบ) = ขีด ไม่ใช่เงินติดลบ');
  assert.match(money, /grandTotal=\{remainingText\}/);
});

/* 🐞 **R7 ครึ่งที่ยังค้าง (ฝั่ง server)** — พรีวิวที่ยังไม่ผ่านตอบ 400 **เปล่า** ⇒ จอต้องคิดยอดเอง
   ⇒ เลขคู่ขนานสองชุด · ตอนนี้ server คืน `money` มาด้วย ⇒ จอต้อง **ถือของ server ไว้** และ
   ทิ้งทันทีที่ฟอร์มถูกแก้ (ไม่ทิ้ง = ยอดของ payload เก่าค้างบนจอ) */
test('⭐ R7 (ครึ่ง server): จอถือยอดที่พรีวิวส่งมากับ 400 และทิ้งเมื่อฟอร์มถูกแก้', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /setServerMoney\(previewError\?\.data\?\.money \|\| null\)/,
    'พรีวิวที่ตอบ 400 ต้องเก็บ money ของ server ไว้ ไม่ทิ้งแล้วไปคิดเอง');
  assert.match(wizard, /historicalMoneyView\(state, plan, serverMoney\)/);
  assert.match(wizard, /historicalAsideRows\(state, \{ plan, serverMoney,/,
    'แถบสรุปข้างฟอร์มต้องพูดเลขเดียวกับขั้น ③');
  const patchFn = slice(wizard, 'const patch = useCallback(', '}, []);');
  assert.match(patchFn, /setServerMoney\(null\)/,
    'แก้ฟอร์มแล้วไม่ทิ้ง = ยอดของ payload เก่าค้างบนจอโดยไม่มีอะไรบอก');
  assert.equal(typeof intakeForm.historicalMoneyView({}, null, { subtotal: 1, vatAmount: 0, totalAmount: 1 }).source,
    'string');
  assert.equal(intakeForm.historicalMoneyView({}, null, { subtotal: 100, vatAmount: 7, totalAmount: 107 }).source,
    'server', 'ตัวตัดสินต้องรับยอดของ server เป็นชั้นกลาง (แผน → server → คิดเอง)');
});

/* 🔴 **N1 (สูง · ของเดิมทำลายข้อมูล)** — ก้อน "โซนกำพร้า" มีปุ่ม **ถอดโซนนี้ออกจากใบ** ซึ่งลบ
   บรรทัดจริงของใบ · ตัวตัดสินเคยไม่ดู `siteErrors` ⇒ ไซต์เดียวอ่านไม่สำเร็จ = ทุกโซนของไซต์นั้น
   ขึ้นก้อนนั้นพร้อมปุ่มถอด ⇒ ผู้คีย์ทำตามที่จอสั่งแล้วเสียบรรทัดจริงเพราะเน็ตกระตุก
   ⭐ มติ 25/09: ก้อนกำพร้าถูกถอด — ทางลบเหลือ **ปุ่มลบท้ายบรรทัดทางเดียว** ⇒ กติกา N1 ย้ายไปอยู่ที่
      `historicalZoneLines().removable` (ปุ่มปิด + เหตุใน title) · ก้อนเตือน "ยังโหลดโซนไม่สำเร็จ" มีแต่ปุ่มลองอ่านใหม่
   ⇒ ตรรกะตรึงที่ historicalIntakeForm.test.mjs · ที่นี่เฝ้าว่า **จอยังต่อสายไปหามัน** และก้อนเตือนไม่มีทางลบ */
test('⭐ N1: ก้อน "ยังโหลดโซนไม่สำเร็จ" มีแต่ปุ่มลองอ่านใหม่ — บรรทัดในไซต์ที่อ่านไม่ได้ลบไม่ได้ (removable)', () => {
  const src = code(STEP_ZONES);
  const notice = slice(src, 'failedSites.length > 0 ? (', '</StatusNotice>');
  assert.doesNotMatch(notice, /removeRow|setRows\(|onRemove|QuoteLineRemoveCell|onChange\(/,
    'ยังอ่านทะเบียนไม่ได้ = ยังไม่รู้ว่าหายจริง ⇒ ก้อนนี้ห้ามแตะ state.zones เลย');
  assert.equal((notice.match(/<Button\b/g) || []).length, 1, 'ปุ่มเดียวในก้อน = ลองอ่านใหม่');
  assert.match(notice, /onClick=\{retryFailedSites\}/, 'ทางออกเดียวคือลองอ่านไซต์ที่พังใหม่ ไม่ใช่รีโหลดหน้า (N4)');
  assert.match(notice, /registry\.unresolved\.length/, 'จำนวนบรรทัดที่ค้างมาจากตัวตัดสิน ไม่ใช่คิดเอง');
  assert.match(notice, /ลบไม่ได้จนกว่าจะอ่านทะเบียนครบ/, 'ต้องบอกเหตุที่ปุ่มลบของบรรทัดพวกนั้นปิดอยู่');
  assert.match(src, /historicalZoneBrowser\(\{\s*sites, zonesBySite, siteErrors, pickedZoneIds: rows\.map\(\(row\) => row\.zoneId\), ready,\s*\}\)/);

  /* ปุ่มลบท้ายบรรทัด = ทางถอดทางเดียว ⇒ ต้องเคารพ removable ของตัวตัดสิน และมีจุดเรียก removeRow จุดเดียว */
  assert.match(src, /lines\.map\(\(\{ row, index, zone, name, removable, removeTitle \}\) => \{/);
  assert.match(src, /<QuoteLineRemoveCell\s*name=\{name\}\s*onRemove=\{\(\) => removeRow\(row\.key\)\}\s*disabled=\{busy \|\| !removable\}\s*title=\{removeTitle\}\s*\/>/);
  assert.equal((src.match(/removeRow\(/g) || []).length, 1, 'removeRow ถูกเรียกจากปุ่มลบท้ายบรรทัดที่เดียว');
  /* primitive ต้องส่ง disabled/title ถึงปุ่มจริง — ไม่งั้นทั้งหมดข้างบนเป็นแค่ prop ที่ถูกทิ้ง */
  assert.match(slice(code(CELLS), 'export function QuoteLineRemoveCell', '</td>'),
    /onClick=\{onRemove\} disabled=\{disabled\} title=\{title \|\| undefined\}/);

  /* ของจริงของตัวตัดสิน: มีไซต์ที่อ่านไม่ได้ = ยังตัดสินไม่ได้ ⇒ ลบไม่ได้ + เหตุชี้ปุ่มที่มีอยู่จริงบนขั้น ② */
  const blind = { ...REG, zonesBySite: { 'ST-A': REG.zonesBySite['ST-A'] }, siteErrors: { 'ST-B': 'หมดเวลา' } };
  const [line] = intakeForm.historicalZoneLines({ ...blind, zones: [{ key: 'r1', zoneId: 'ZN-3' }], ready: true });
  assert.equal(line.removable, false);
  const label = line.removeTitle.match(/“([^”]+)”/)?.[1];
  assert.ok(label, 'เหตุบนปุ่มลบต้องบอกว่ากดอะไรต่อ');
  assert.ok(src.includes(`"${label}"`), `ปุ่ม “${label}” ต้องยังอยู่บนขั้น ②`);
  const browser = intakeForm.historicalZoneBrowser({ ...blind, pickedZoneIds: ['ZN-3'], ready: true });
  assert.deepEqual([browser.unresolved, browser.orphans], [['ZN-3'], []]);
});

/* 🐞 **N4** — ก้อน "โหลดทะเบียนไม่สำเร็จ" เคยมีปุ่ม `window.location.reload()` ทั้งที่ฟอร์มนี้
   ติด `useUnsavedChanges` อยู่ ⇒ ผู้คีย์ที่พิมพ์อะไรไว้แล้วกดปุ่มนั้นเจอโมดัลของเบราว์เซอร์
   "ออกจากหน้านี้ไหม" และถ้ากดออก **ของที่คีย์ไว้หายทั้งใบ** เพื่อแก้เรื่องที่แค่ยิงสองเส้นใหม่ก็จบ */
test('⭐ N4: ทางออกของ "โหลดทะเบียนไม่สำเร็จ" คือยิงใหม่ที่เดิม ไม่ใช่รีโหลดหน้า', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /useUnsavedChanges\(dirty \|\| Boolean\(saveRun\),/,
    'ยามงานที่ยังไม่บันทึกถูกติดไว้จริง (รวมตอนกำลังบันทึก) — นี่คือเหตุที่การรีโหลดหน้าเป็นทางตัน');
  assert.doesNotMatch(wizard, /window\.location\.reload/,
    'รีโหลดหน้าชนยามของฟอร์มเอง ⇒ ผู้คีย์เสี่ยงเสียของที่พิมพ์ไว้ทั้งใบ');
  assert.match(wizard, /const reloadRegistries = useCallback\(/);
  assert.match(wizard, /onClick=\{reloadRegistries\}/);
  assert.match(wizard, /\}, \[registryRound\]\);/, 'เส้นทะเบียนลูกค้าต้องยิงใหม่ตามรอบ');
  assert.match(wizard, /\}, \[customerId, registryRound, productsRound\]\);/, 'เส้นทะเบียนสินค้าต้องยิงใหม่ตามรอบ');

  /* 🐞 ธง "กำลังโหลด…" ของปุ่มเคยล้างที่ `.finally()` ของ **เส้นลูกค้าเส้นเดียว** ⇒ เส้นสินค้าที่
     ตอบช้ากว่ายังค้างอยู่แต่ปุ่มกลับมากดได้ ⇒ กดรอบสองซ้อนรอบแรก แล้วอ่านว่า "กดแล้วไม่เกิดอะไร"
     ⇒ ธงรายเส้น (ตั้งทั้งตอนกดปุ่มและที่หัวเอฟเฟกต์) แล้วปุ่มอ่านผลรวม */
  assert.doesNotMatch(wizard, /setRegistryBusy/, 'ธงเดียวกลับมา = เส้นที่ตอบช้ากว่าหายจากสายตาปุ่มอีกครั้ง');
  assert.match(wizard, /const registryBusy = customersBusy \|\| productsBusy;/);
  assert.equal((wizard.match(/setCustomersBusy\(true\)/g) || []).length, 2, 'ตั้งธงตอนกดปุ่ม + ที่หัวเอฟเฟกต์');
  assert.equal((wizard.match(/setProductsBusy\(true\)/g) || []).length, 2);
  assert.match(wizard, /\.finally\(\(\) => \{ if \(alive\) setCustomersBusy\(false\); \}\);/);
  assert.match(wizard, /\.finally\(\(\) => \{ if \(alive\) setProductsBusy\(false\); \}\);/,
    'เส้นสินค้าต้องมี finally ของตัวเอง — ไม่มี = ปุ่มดับค้างหลังกดหนึ่งครั้ง');
  assert.match(wizard, /if \(!customerId\) \{ setProducts\(\[\]\); setProductsError\(""\); setProductsBusy\(false\); return undefined; \}/,
    'สาขาที่ไม่มีคำขอต้องล้างธงเอง ไม่งั้นกดปุ่มตอนยังไม่เลือกลูกค้าแล้วปุ่มดับค้างตลอด');
  assert.match(wizard, /disabled=\{busy \|\| registryBusy\}/);

  /* ข้อความของช่องเลือกอ้างชื่อปุ่มในเครื่องหมายคำพูด — ปุ่มนั้นต้องมีอยู่จริง ไม่ใช่ชื่อที่ตายไปแล้ว */
  const label = intakeForm.REGISTRY_LOAD_FAILED.match(/[\u201c]([^\u201d]+)[\u201d]/)?.[1];
  assert.ok(label, 'REGISTRY_LOAD_FAILED ต้องอ้างชื่อปุ่มที่ผู้คีย์ต้องกด');
  assert.ok(wizard.includes(label), `ข้อความชี้ไปที่ปุ่ม “${label}” ซึ่งต้องยังอยู่บนฟอร์ม`);
});

/* 🐞 **N3 (กฎบ้าน: แก้แล้วต้องมีเทสต์)** — `contractFileCount` เป็น `null` = "ยังอ่านจำนวนไม่ได้"
   ไม่ใช่ 0 · สาขา null ต้องมาก่อน ไม่งั้นขั้น ④ อ่าน null ว่า "ยังไม่แนบ" ซึ่งเป็นคำตอบที่อาจผิด
   แล้วผู้คีย์ไปแนบไฟล์ซ้ำ (ตัวตัดสินตรึงที่ historicalIntakeForm.test.mjs · ที่นี่เฝ้าแผ่นสรุป ④) */
test('⭐ N3/R6: ขั้น ④ อ่าน null ว่า "ยังอ่านจำนวนไฟล์ไม่ได้" ไม่ใช่ "ยังไม่แนบ"', () => {
  /* แถว "ไฟล์หลักฐานลงนาม" ย้ายไปอยู่ที่ตัวตัดสิน (`historicalReviewChecklist` · มติ 25/09) ⇒ ทดสอบพฤติกรรมตรง ๆ */
  const plan = { contract: {}, header: {} };
  const fileRow = (contractFiles) => reviewView.historicalReviewChecklist(plan, { contractFiles })
    .find((row) => row.key === 'signedFile');
  assert.match(fileRow({ count: null }).value, /ยังอ่านรายการไฟล์ไม่ได้/, 'null ต้องเป็นสาขาของตัวเอง');
  assert.doesNotMatch(fileRow({ count: null }).value, /ยังไม่แนบ/);
  assert.match(fileRow({ count: 0 }).value, /ยังไม่แนบ/, 'สาขา 0 (รู้แล้วว่าไม่มี) ต้องยังพูดว่ายังไม่แนบ');
  assert.match(fileRow({ count: 2, names: ['PO.pdf', 'ใบเสนอ.pdf'] }).value, /^PO\.pdf \(จาก 2 ไฟล์ที่แนบ\)$/);
  assert.match(code(WIZARD), /count: contractFileCount,/,
    'ค่าที่ส่งลงไปต้องเป็นค่าของตัวตัดสิน (null ได้) ไม่ใช่เลขที่ปลอบใจ');
  assert.equal(intakeForm.historicalContractFileCount({ contractId: 'CT-1' }), null,
    'ตัวตัดสินต้องตอบ null ได้จริง ไม่งั้นสาขาข้างบนเป็นโค้ดตาย');
});

/* 🐞 **R9** — ทะเบียนที่โหลดไม่ขึ้นถูกกลืนเป็นลิสต์ว่าง ⇒ จอพูดแทนว่า "ทะเบียนไม่มีรายการ"
   ⇒ ผู้คีย์ไปไล่อีกฝ่ายให้สร้างของที่มีอยู่แล้ว · โหมดแก้ใบหนักกว่า (ชื่อลูกค้าของใบกลายเป็นขีด) */
test('⭐ R9: โหลดทะเบียนไม่สำเร็จต้องพูดคนละคำกับ "ทะเบียนว่าง"', () => {
  const wizard = code(WIZARD);
  assert.doesNotMatch(wizard, /\.catch\(\(\) => \{ if \(alive\) setCustomers\(\[\]\); \}\)/,
    'กลืน error = โหลดพังอ่านเหมือนทะเบียนว่าง');
  assert.match(wizard, /setCustomersError\(/);
  assert.match(wizard, /setProductsError\(/);
  assert.match(wizard, /customersError \|\| productsError \?/, 'ต้องมีก้อนบอกเหตุบนจอ ไม่ใช่เงียบ');
  assert.match(wizard, /customersError=\{customersError\}/);
  assert.match(wizard, /productsError=\{productsError\}/);

  /* ช่องเลือกที่ `emptyText` อ่านเป็น "คำตอบ" — ต้องพูดคนละคำเมื่อเหตุคนละเหตุ */
  assert.match(code(STEP_CONTRACT), /emptyText=\{customersError \? REGISTRY_LOAD_FAILED : undefined\}/);
  /* ช่องแพ็คเกจ: ในบรรทัด + ในหน้าต่างเพิ่มหลายโซน (มติ 25/09) — ทะเบียนพัง ≠ ลูกค้าไม่มีแพ็คเกจ · สองช่องพูดคำเดียวกัน
     (ช่องแพ็คเกจรายแถวเคยไม่มี emptyText เลย ⇒ ตกไปที่ "ไม่พบรายการ" ของตัวห่อ) */
  const EMPTY_PACKAGES = 'ลูกค้ารายนี้ยังไม่มีแพ็คเกจบริการ (หมวด 02-001) ในทะเบียนสินค้า';
  const packageEmpty = `emptyText={productsError ? REGISTRY_LOAD_FAILED : "${EMPTY_PACKAGES}"}`;
  const zones = code(STEP_ZONES);
  assert.ok(slice(zones, '<QuoteLineProductPicker', '/>').includes(packageEmpty), 'ช่องแพ็คเกจในบรรทัด');
  assert.ok(slice(code(BULK), '<SearchableSelect', '/>').includes(packageEmpty), 'ช่องแพ็คเกจของหน้าต่างเพิ่มหลายโซน');
  /* ช่อง "ไซต์ · โซน": เส้นทะเบียนไซต์พัง ≠ ลูกค้าไม่มีไซต์ · "ข้อความแดงด้านบน" ต้องมีอยู่จริง */
  const zonePicker = slice(zones, '<SearchableSelect', '/>');
  /* 🔴 R9 (รีวิว 25/09): กำลังโหลด / เส้นทะเบียนพัง / บางไซต์อ่านไม่ได้ ถูกถามก่อน "ไม่มีในทะเบียน" เสมอ */
  const empty = slice(zonePicker, 'emptyText={(query) => {', '}}');
  const order = ['if (loading) return "กำลังโหลดทะเบียนไซต์…";', 'if (loadError) return "โหลดทะเบียนไซต์ไม่สำเร็จ — ดูข้อความแดงด้านบน";',
    'if (failedSites.length) {', 'return query'];
  let cursor = -1;
  for (const piece of order) {
    const at = empty.indexOf(piece);
    assert.ok(at > cursor, `ลำดับเหตุของช่องโซนผิด ที่: ${piece}`);
    cursor = at;
  }
  assert.match(empty, /ลองอ่านไซต์ที่พังอีกครั้ง/, 'บางไซต์อ่านไม่ได้ต้องชี้ปุ่มลองใหม่ที่มีอยู่จริง');
  assert.match(zonePicker, /: "ลูกค้ารายนี้ยังไม่มีไซต์ที่ใช้งานอยู่ในทะเบียน — แจ้งฝ่าย TS เพิ่มไซต์ก่อน"/);
  /* ก้อนแดงของเส้นทะเบียนไซต์พูดเหตุจริงของ server (`loadError`) และมีทางออกของตัวเอง (รีวิว 25/09 — ดูเทสต์ "เส้นทะเบียนไซต์พัง") */
  const loadNotice = slice(zones, '{loadError ? (', ') : null}');
  assert.match(loadNotice, /title="โหลดทะเบียนไซต์ไม่สำเร็จ"/);
  assert.match(loadNotice, /\{loadError\} — บรรทัดที่ผูกโซนไว้ยังลบไม่ได้จนกว่าจะโหลดสำเร็จ/);
  /* หน้าต่างเพิ่มหลายโซน: "ยังไม่มีไซต์" ขึ้นเฉพาะตอนโหลดสำเร็จจริง
     ⭐ PR-D (D27): ประโยคนี้วาดที่ตัวกลาง (`emptyRegistryText`) · ตัวห่อส่งคำของใบย้อนหลัง (ไซต์ที่ใช้งานอยู่ · แจ้ง TS) และ
     ส่งสถานะโหลดของขั้น ② ต่อไปครบ — ไม่งั้นตัวกลางพูด "ยังไม่มีไซต์" ระหว่างที่ทะเบียนยังโหลด/โหลดพัง */
  assert.match(code(SHARED_BULK), /\{!loading && !loadError && !index\.sites\.length \? \(\s*<p className=\{styles\.hint\}>\{emptyRegistryText\}<\/p>/);
  assert.match(code(SHARED_BULK), /emptyRegistryText = "ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้",/, 'ค่าตั้งต้นของตารางงานบริการคงเดิม');
  assert.match(code(BULK), /emptyRegistryText=\{T\.emptyRegistry\}/);
  assert.equal(intakeForm.HISTORICAL_SERVICE_TEXT.bulk.emptyRegistry, 'ลูกค้ารายนี้ยังไม่มีไซต์ที่ใช้งานอยู่ในทะเบียน — แจ้งฝ่าย TS เพิ่มไซต์ก่อน');
  assert.match(code(BULK), /loading=\{loading\}/);
  assert.match(code(BULK), /loadError=\{loadError\}/);
  /* โหมดแก้ใบ: ชื่อลูกค้าโหลดไม่ขึ้น ≠ ใบนี้ไม่มีลูกค้า */
  assert.match(code(STEP_CONTRACT), /customersError \? `โหลดชื่อลูกค้าไม่ขึ้น/);
});

/* 🐞 **ขอบวันที่กลืนค่าที่พิมพ์** (UAT 23/09) — `DateInput` ไม่เรียก onChange เมื่อค่าหลุด min/max
   แล้วเด้งกลับค่าเดิมตอนเบลอ **โดยไม่มีข้อความสักบรรทัด** · ขั้น ① แก้ไปแล้ว แต่ขั้น ③ ยังเหลือ
   สามช่อง (ครอบบริการ ถึง · วันที่รับเงิน · ช่วงครอบของแต่ละงวด) ⇒ ยามตัวนี้เฝ้าทุกช่องในฟอร์ม */
test('⭐ ไม่มีช่องวันไหนในฟอร์มคีย์ใบที่ขอบคิดจากค่าอื่นบนฟอร์ม (ขอบกลืนค่า = ค่าหายเงียบ)', () => {
  const allowed = /^\{DOC_DATE_(MIN|MAX)\}$/;
  let inputs = 0;
  let bounds = 0;
  for (const file of [STEP_CONTRACT, STEP_ZONES, STEP_MONEY, STEP_REVIEW, INST_TABLE, SPLIT]) {
    const src = code(file);
    for (const tag of src.matchAll(/<DateInput\b([\s\S]*?)\/>/g)) {
      inputs += 1;
      for (const bound of tag[1].matchAll(/\b(min|max)=(\{[^}]*\}|"[^"]*")/g)) {
        bounds += 1;
        assert.match(bound[2], allowed,
          `${file}: ขอบ ${bound[1]}=${bound[2]} คิดจากค่าอื่นบนฟอร์ม ⇒ พิมพ์แล้วค่าหายเงียบ `
          + '· กฎแบบนี้ต้องเป็นข้อความใต้ช่อง ไม่ใช่ขอบของช่อง');
      }
    }
  }
  assert.ok(inputs >= 5, `ยามต้องเจอช่องวันจริง ๆ (เจอ ${inputs})`);
  assert.ok(bounds >= 10, `ทุกช่องต้องมีขอบช่วงเอกสารกำกับไว้ (เจอ ${bounds})`);

  /* ⭐ **ครึ่งที่สองของแพตเทิร์นเดียวกัน** — ถอดขอบที่คิดจากค่าอื่นแล้ว กฎนั้นต้องไป **อยู่ใต้ช่อง**
     ไม่ใช่หายไปพร้อมขอบ (ไม่งั้นเพดาน "ต้องอยู่ในช่วงสัญญา / ไม่เกินวันนี้" กลายเป็นความรู้ลับของ
     พรีวิว แล้วผู้คีย์รู้ตัวตอนถูกตีกลับ) · เหตุจากด่านต้องชนะกฎในบรรทัดเดียวกัน = แพตเทิร์น
     `noteOf(field) || กฎ` ตัวเดียวกับขั้น ① · ครึ่งนี้เคยมียามแค่ขั้น ① ⇒ สองช่องของขั้น ③
     ถอด `<small>` ทิ้งได้เงียบ ๆ (แพตเทิร์นแฝดของแผงงวด: historicalPaymentUi.test §5ค ข้อ 2–3) */
  const money = code(STEP_MONEY);
  /* ⭐ 25/09: ช่อง "ครอบบริการ ถึง" — เหตุก่อน · ไม่มีเหตุ = ป้ายเดือน/วันเริ่มงวดที่เหลือ หรือกฎช่วงสัญญา */
  assert.match(money, /\{noteOf\("opening\.coversTo"\) \? <small data-bad="yes">\{noteOf\("opening\.coversTo"\)\}<\/small> : null\}/);
  assert.match(money, /!noteOf\("opening\.coversTo"\) && !openingSpanChip \? \(\s*<small>\{`ต้องอยู่ในช่วงสัญญา/,
    'ช่อง "ครอบบริการ ถึง" ของงวดยกมา: ไม่มีเหตุและยังไม่รู้ช่วง = กฎช่วงสัญญา');
  assert.match(money, /noteOf\("opening\.paidOn"\)\s*\n?\s*\|\| `ต้องไม่เกินวันนี้/,
    'ช่อง "วันที่รับเงิน": เหตุจากพรีวิวก่อน แล้วตกไปที่กฎ "ไม่เกินวันนี้"');
});

/* 🔴 มติข้อ 9 มีสองหน้า — กระจกฝั่งจอต้องรู้จัก `editing` เหมือน `ctx.editing` ของแผน
   (ตรรกะของจริงตรึงไว้ที่ historicalIntakeForm.test.mjs · ที่นี่เฝ้าว่าจอยังต่อสายไปหามัน) */
test('⭐ คำเตือนวันสัญญาของใบที่มีอยู่แล้ว ไหลถึงจอ และไม่ปนกับ error ที่บล็อก', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /historicalContractDateWarnings\(state, \{ todayIso, editing: Boolean\(state\.orderId\) \}\)/);
  assert.match(wizard, /warnings=\{contractWarnings\}/);
  assert.doesNotMatch(wizard, /localIssues.*contractWarnings/,
    'คำเตือนห้ามไหลเข้า localIssues — ทุกข้อในนั้นบล็อกปุ่ม');
  const contract = code(STEP_CONTRACT);
  assert.match(contract, /const warnOf = /);
  assert.match(contract, /warnOf\("contract\.endDate"\)/);
  assert.match(contract, /noteOf\("contract\.endDate"\)\s*\n?\s*\|\| warnOf\("contract\.endDate"\)/,
    'error ต้องชนะคำเตือนในช่องเดียวกัน');
});

// ── 9. มติเจ้าของ 23/09: บรรทัดโซน = บรรทัดใบเสนอราคา ─────────────────────────────────────────
//   "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน"
//   (ความเป็นชุดเดียวของเซลล์ถูกตรึงที่ components/salesPlanning/quoteLineCells.test.mjs · ที่นี่เฝ้าฝั่งฟอร์มคีย์ใบ)

const LINE_ITEMS = 'components/salesPlanning/QuotationLineItems.js';

/* ⭐ มติ 26/09 (A3/O9 · PR-D mig 0394): "แพ็คต่อรอบ" กลับมาเป็น **ช่องของตัวเองต่อโซน** — ไม่ใช่จำนวนของบรรทัด (มติ 23/09 ยังจริง:
   จำนวน = เงิน 1 ชุด × 12 เดือน) ⇒ คำว่า "แพ็ค" บนขั้น ② มาจาก `HISTORICAL_SERVICE_TEXT` ที่เดียว (§0.2 ข้อ 14) · ไฟล์จอ
   ของขั้นไม่สะกดคำนี้เอง (เหลือได้แค่ "แพ็คเกจ") · รูปที่อนุญาตตรึงที่ตัวข้อความ */
test('⭐ 23/09 → 26/09: ขั้น ② ไม่เหลือ "แพ็ค" ที่สะกดเอง · ยอดที่พิมพ์เอง · รอบในสัญญา — ช่องเงินทุกช่องมาจากเซลล์กลาง', () => {
  const src = code(STEP_ZONES);
  assert.doesNotMatch(src, /lineAmount|\bpacks\b|grossAmount|totalPacks/);
  assert.doesNotMatch(src, />แพ็ค<|>ยอด<|รอบในสัญญา|ก่อน VAT/);
  assert.doesNotMatch(src, /import MoneyInput/, 'ช่องเงินทุกช่องมาจากเซลล์กลาง ไม่ใช่ช่องของขั้นนี้เอง');
  for (const file of [STEP_ZONES, LINE_SERVICE, BULK]) {
    assert.doesNotMatch(code(file), /แพ็ค(?!เกจ)/, `${file}: คำว่า "แพ็ค…" ต้องมาจาก HISTORICAL_SERVICE_TEXT`);
  }
  const T = intakeForm.HISTORICAL_SERVICE_TEXT;
  assert.equal(T.packsUnit, 'แพ็ค', 'หน่วยท้ายช่องแพ็คต่อรอบ');
  const said = [T.packsLabel, T.packsAria('รายการ 1'), T.assessed(2), T.useAssessedAria(2, 'รายการ 1'), T.lineTotal(24),
    T.assessFailed, T.bulk.subtitle, T.bulk.packsLabel, T.bulk.assessLoading, T.bulk.assessFailed].join(' | ');
  const allowed = /รอบละกี่แพ็ค|แพ็ค\/รอบ|ประเมินไว้ \d+ แพ็ค|ผลประเมิน \d+ แพ็ค|ทั้งรายการ \d+ แพ็ค/g;
  assert.doesNotMatch(said.replace(allowed, ''), /แพ็ค(?!เกจ)/,
    'รูปที่อนุญาต: รอบละกี่แพ็ค · แพ็ค/รอบ · ประเมินไว้ n แพ็ค · รวมทั้งรายการ n แพ็ค (+ หน่วยท้ายช่อง)');
  assert.doesNotMatch(said, /แพ็คต่อรอบ/, 'มติ 29/09: ป้ายเดียวกับใบใหม่ — "รอบละกี่แพ็ค"');
});

/* ⭐ PR-D (mig 0394 · r2 S12 · IMPL_PLAN_D DD1–DD2): แถบผูกของบรรทัด = ไซต์ · โซน * | จำนวนรอบบริการ * (บังคับ — เลิก "เว้นว่างได้")
   | รอบละกี่แพ็ค * (ชิป "ประเมินไว้ n แพ็ค" [ใช้]) | รวมทั้งรายการ n แพ็ค (อ่านอย่างเดียว เมื่อสองช่องถูก)
   — คำและลำดับตามมติเจ้าของ 29/09 ("ลำดับนี้ใช้กับ SO ใหม่และ SO ย้อนหลัง")
   🔴 แดงหลังกด "ถัดไป" เท่านั้น — ข้อความใต้ช่องมาจาก `bad` (issues ที่เปิดเผยแล้ว) ช่องเดียวกับช่องอื่นของบรรทัด */
test('PR-D ⭐ ขั้น ②: "จำนวนรอบบริการ *" บังคับ → "รอบละกี่แพ็ค *" + ชิปผลประเมิน → "รวมทั้งรายการ n แพ็ค" — แดงหลังกด ถัดไป', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /import HistoricalLineServiceFields, \{ HistoricalLineServiceTotal \} from "\.\/HistoricalLineServiceFields";/);
  const bind = slice(src, '<div className={styles.lineBind}>', '{warn ? (');
  let at = -1;
  /* ⭐ มติเจ้าของ 29/09 (ใบใหม่และใบย้อนหลัง): ไซต์ · โซน → จำนวนรอบบริการ → แต่ละครั้งกี่แพ็ค → รวมทั้งรายการ n แพ็ค */
  for (const piece of ['className={styles.lineBindZone}', '<QuoteLineServiceRounds', '<HistoricalLineServiceFields', '<HistoricalLineServiceTotal view={service} />']) {
    const next = bind.indexOf(piece);
    assert.ok(next > at, `ลำดับในแถบผูกผิดที่ ${piece}`);
    at = next;
  }
  assert.match(src, /const assessedReady = assessState === "ok" \? assessedByZone : null;/, 'ยังโหลด/อ่านไม่ได้ = ไม่มีชิป (ไม่ใช่ตัวเลขค้าง)');
  assert.match(src, /const service = historicalLineServiceView\(row, assessedReady\);/);
  const fields = slice(bind, '<HistoricalLineServiceFields', '/>');
  assert.match(fields, /value=\{row\.packsPerRound\}/);
  assert.match(fields, /view=\{service\}/);
  assert.match(fields, /error=\{bad\.packsPerRound \|\| null\}/);
  assert.match(fields, /disabled=\{busy\}/);
  assert.match(fields, /onChange=\{\(value\) => patchRow\(row\.key, \{ packsPerRound: value \}\)\}/, 'ผูกแถวด้วย key');
  const rounds = slice(bind, '<QuoteLineServiceRounds', '/>');
  assert.match(rounds, /\n\s*required\n/);
  assert.match(rounds, /invalid=\{!!bad\.rounds\}/);
  assert.match(rounds, /note=\{HISTORICAL_SERVICE_TEXT\.roundsNote\}/);
  assert.doesNotMatch(src, /เว้นว่างได้ · TS ตั้งวันนัดเอง/, 'รอบบริการบังคับแล้ว (r2 S12)');
  assert.equal(intakeForm.HISTORICAL_SERVICE_TEXT.roundsNote, 'บังคับ · จำนวนครั้งที่ต้องเข้าโซนนี้ตลอดสัญญา');

  /* ช่องใหม่: ตัวเลข 1–9999 · หน่วย · ชิป + ปุ่ม "ใช้" (เติมค่า ไม่ใช่ด่าน — สีกลาง) · ข้อความผิดใต้ช่อง */
  const line = code(LINE_SERVICE);
  const input = slice(line, '<Input', '/>');
  assert.match(input, /type="number" min="1" max="9999" step="1" inputMode="numeric" placeholder="—" autoComplete="off"/);
  assert.match(input, /invalid=\{!!error\}/, 'แดงเมื่อมีข้อความของแผนเท่านั้น (หลังกด ถัดไป)');
  assert.match(input, /aria-required="true"/);
  assert.match(input, /aria-label=\{T\.packsAria\(name\)\}/);
  assert.match(line, /<span className=\{styles\.lineBindLabel\}>\{T\.packsLabel\} <b className=\{styles\.req\}>\*<\/b><\/span>/);
  assert.match(line, /\{error \? <span className=\{styles\.cellBad\}>\{error\}<\/span> : null\}/);
  assert.match(line, /\{view\?\.assessed \? \(/);
  assert.match(line, /\{view\.canUse \? \(/);
  assert.match(line, /onClick=\{\(\) => onChange\?\.\(String\(view\.assessed\)\)\}/);
  assert.doesNotMatch(slice(line, '{view.canUse ? (', ') : null}'), /tone="danger"|invalid/, 'ปุ่ม "ใช้" เป็นตัวช่วย ไม่ใช่ด่าน');
  assert.match(line, /view\?\.totalText \? <span className=\{styles\.lineBindTotal\}>\{view\.totalText\}<\/span> : null/);
  /* 🔴 review 29/09: แพ็คต่อรอบกับรอบบริการอยู่แถวเดียวกันในแถบผูก ⇒ หัวช่องต้องหน้าตาเดียวกันและช่องกรอกต้องตรงแนว
     (ช่องรอบคือเซลล์กลาง QuoteLineServiceRounds — ปรับเฉพาะในแถบผูกด้วย CSS ไม่แตะตัวกลาง/เทสต์ของมัน) ·
     "ทั้งรายการ n แพ็ค" เป็นบรรทัดสรุปของตัวเอง ไม่ใช่กล่องสูงเท่าช่องกรอกที่ทิ้งช่องว่าง */
  const css = read('components/salesPlanning/historicalWizard/HistoricalOrderWizard.module.css');
  assert.match(css, /\.lineBindRounds > div \{ margin-top: 0; \}/, 'ช่องรอบไม่ต่ำกว่าช่องแพ็ค (margin-top ของ .serviceRounds)');
  const label = slice(css, '.lineBindRounds > div > span:first-child {', '}');
  const own = slice(css, '.lineBindLabel {', '}');
  for (const prop of ['font-size', 'font-weight', 'line-height', 'color']) {
    const pick = (block) => (block.match(new RegExp(`${prop}:\\s*([^;]+);`)) || [])[1];
    assert.ok(pick(label), `หัวช่องรอบต้องตั้ง ${prop}`);
    assert.equal(pick(label), pick(own), `หัวช่องรอบ ${prop} = หัวช่องรอบละกี่แพ็ค`);
  }
  const total = slice(css, '.lineBindTotal {', '}');
  assert.doesNotMatch(total, /min-height|align-self/, 'ไม่มีกล่องสูงเท่าช่องกรอก');
  assert.match(total, /flex-basis: 100%;/);
  assert.doesNotMatch(line, /lineIsServicePackage|hasServicePackageLine|effectiveServiceFgCode|orderHasServiceRounds/,
    'ไม่มีตัวตัดสินเงินในช่องนี้ (§0.2 ข้อ 13)');
  assert.doesNotMatch(line, /style=\{\{/);

  /* ของจริงของตัวตัดสินที่ช่องวาด */
  const view = intakeForm.historicalLineServiceView({ zoneId: 'ZN-1', packsPerRound: '2', rounds: '12' }, new Map([['ZN-1', 3]]));
  assert.deepEqual(view, { assessed: 3, canUse: true, total: 24, totalText: 'รวมทั้งรายการ 24 แพ็ค' });
  assert.equal(intakeForm.historicalLineServiceView({ zoneId: 'ZN-1', packsPerRound: '3' }, new Map([['ZN-1', 3]])).canUse, false,
    'ค่าเท่าผลประเมินแล้ว = ไม่มีปุ่ม');
  assert.equal(intakeForm.historicalLineServiceView({ zoneId: 'ZN-1', packsPerRound: '2', rounds: '' }, null).totalText, null,
    'รอบยังว่าง = ไม่พูดตัวเลขทั้งรายการ');
  assert.equal(intakeForm.historicalLineServiceView({ zoneId: 'ZN-1' }, null).assessed, null, 'ยังโหลด/พัง = ไม่มีชิป');
});

/* ⭐ PR-D (DD3): ผลประเมินรายโซนไม่มากับตัวโหลดรายไซต์ (V9) ⇒ อ่านเส้นทะเบียนของลูกค้า **แยก** ครั้งเดียวต่อการเปลี่ยนลูกค้า
   🔴 อ่านไม่ได้ต้องไม่บล็อกการเลือกโซน (ไม่แตะ state ของตัวโหลดรายไซต์) · บอกหนึ่งบรรทัดเทา + ปุ่มลองอ่านใหม่ (ไม่ใช่รีโหลดหน้า — N4) */
test('PR-D ⭐ DD3: ผลประเมินอ่านจากเส้นทะเบียนลูกค้าแยกจากตัวโหลดรายไซต์ · อ่านไม่ได้ = บรรทัดเทา + ปุ่มลองใหม่ ไม่บล็อก', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const ASSESS_PATH = \(customerId\) => `\/api\/service\/customers\/\$\{encodeURIComponent\(customerId\)\}\/zones`;/);
  const effect = slice(src, 'const data = await apiJson(ASSESS_PATH(customerId)', '}, [customerId, assessRound]);');
  assert.match(effect, /fallbackError: HISTORICAL_SERVICE_TEXT\.assessFailed/);
  assert.match(effect, /setAssessedByZone\(historicalAssessedByZone\(data\)\);/);
  assert.match(effect, /setAssessState\("ok"\);/);
  assert.match(effect, /setAssessState\("error"\);/);
  assert.doesNotMatch(effect, /setSites|setZonesBySite|setSiteErrors|setLoadError|setLoading\(/, 'ผลประเมินพังต้องไม่ลากตัวเลือกโซนลงไปด้วย');
  assert.match(src, /\}, \[customerId, loadSiteZones, sitesRound\]\);/, 'ตัวโหลดรายไซต์คงเดิม (N1/R9/R10)');
  const failed = slice(src, '{assessState === "error" ? (', ') : null}');
  assert.match(failed, /\{HISTORICAL_SERVICE_TEXT\.assessFailed\}/);
  assert.match(failed, /onClick=\{\(\) => setAssessRound\(\(round\) => round \+ 1\)\}/);
  assert.match(failed, /\{HISTORICAL_SERVICE_TEXT\.assessRetry\}/);
  assert.doesNotMatch(failed, /window\.location|StatusNotice/, 'เรื่องเสริมที่ไม่บล็อก = บรรทัดเทา ไม่ใช่ก้อนแดง');
  /* ของจริงของตัวแปลง: อ่านเฉพาะ assessedPackages ที่เป็นจำนวนเต็ม 1–9999 */
  const map = intakeForm.historicalAssessedByZone({ sites: [{ zones: [{ id: 'Z1', assessedPackages: 2 }, { id: 'Z2', assessedPackages: 0 }, { id: 'Z3' }] }] });
  assert.deepEqual([...map], [['Z1', 2]]);
});

/* 🔴 DD17 (critique M4): เส้นใบคืน `lineZones: []` + `serviceContractFiles: []` + `extrasError` เมื่ออ่านของเสริมพัง ⇒ hydrate ต่อ =
   แพ็คต่อรอบที่บันทึกไว้กลายเป็นช่องว่าง (แดงหลังกดถัดไป ชวนคีย์ใหม่จากความจำ) และจำนวนไฟล์สัญญากลายเป็น 0
   ⇒ ฟอร์มหยุดที่ "แก้ในฟอร์มไม่ได้" พร้อมเหตุ ก่อนตั้ง state (โหลดหน้าใหม่ได้ — ยังไม่มีอะไรให้เสีย) */
test('PR-D 🔴 DD17: เปิดแก้ใบที่อ่านของเสริมไม่ขึ้น (extrasError) = หยุดก่อน hydrate พร้อมเหตุ', () => {
  const wizard = code(WIZARD);
  const hydrate = slice(wizard, 'if (!HISTORICAL_EDITABLE_STATUSES.includes(order.status)) {', 'setState(wizardStateFromOrder(order));');
  assert.match(hydrate,
    /if \(order\.extrasError\) \{\s*setReadOnly\(`โหลดข้อมูลประกอบของใบไม่ขึ้น \(รอบละกี่แพ็ค · ไฟล์เอกสาร · งวด\) — โหลดหน้าใหม่ก่อนแก้ · \$\{order\.extrasError\}`\);\s*return;\s*\}/);
  assert.ok(hydrate.indexOf('if (order.extrasError)') > hydrate.indexOf('return;'), 'หลังด่านสถานะ (ใบที่แก้ไม่ได้อยู่แล้วพูดเหตุของตัวเองก่อน)');
});

/* 🐞 รีวิว/UAT 23/09 (วัดด้วย puppeteer): ตารางซ้อนในการ์ดไซต์ + คอลัมน์ "โซน" แทน "#" ⇒ กล่อง 726–766px
   ทุกจอเดสก์ท็อป ⇒ ตารางพับเป็นการ์ดต่อบรรทัดตลอด (ใบเสนอราคาที่จอเดียวกันเป็นตาราง 964px) · พื้น 1040 ของ
   `ZONE_LINES_MIN_WIDTH` ไม่เคยมีผล (container query ตัดสินก่อน) · คอมเมนต์ "ราว 1270 ที่จอ 1920 (ตาราง)" ผิด
   ⭐ มติเจ้าของ 25/09: การ์ดไซต์ถูกถอดทั้งหมด (ยาม "ตารางอยู่นอกการ์ด" เหลือแค่ "ตารางเดียว") · บรรทัดเกิดจากปุ่ม
      "เพิ่มรายการ" แบบใบเสนอราคา · แถวถูกระบุด้วย `key` — **ไม่ใช่ zoneId** (แถวใหม่ยังไม่มีโซน และเปลี่ยนโซนในบรรทัดได้
      ⇒ ผูกด้วย zoneId = บรรทัดใหม่สองบรรทัดที่ยังไม่เลือกโซนชนกัน แก้บรรทัดหนึ่งแล้วอีกบรรทัดเปลี่ยนตาม) */
test('⭐ 25/09: ขั้น ② = ตารางรายการตารางเดียวแบบใบเสนอราคา (# · … · ปุ่มลบ) · แถวผูกกับ key ไม่ใช่ zoneId', () => {
  const src = code(STEP_ZONES);
  assert.equal((src.match(/<QuoteLinesTable\b/g) || []).length, 1, 'บรรทัดทั้งใบอยู่ในตารางเดียว');
  assert.match(src, /<QuoteLinesTable>\s*\n\s*<thead>\s*\n\s*<tr>\s*\n\s*<QuoteLineIndexHead \/>\s*\n\s*<QuoteLineHeadCells \/>\s*\n\s*<QuoteLineActionsHead \/>/);
  assert.doesNotMatch(src, /ZONE_LINES_MIN_WIDTH|zoneCol|ราว 1270/);
  assert.doesNotMatch(read('components/salesPlanning/historicalWizard/HistoricalOrderWizard.module.css'), /\.zoneCol\b/);
  /* บรรทัดของตารางมาจากตัวตัดสินที่ตรึงด้วยเทสต์ (ชื่อบรรทัด · ลบได้ไหม) · ไม่ขึ้นกับทะเบียนหรือคำค้น */
  assert.match(src, /<tr key=\{row\.key\} className="premium-row">/);
  assert.match(src, /<QuoteLineIndexCell index=\{index\} \/>/);
  assert.match(src, /<QuoteLinesEmptyRow colSpan=\{7\}>/);
  /* ทุกทางที่แตะแถวชี้แถวด้วย key */
  assert.match(src, /const patchRow = \(key, patch\) => setRows\(rows\.map\(\(row\) => \(row\.key === key \? \{ \.\.\.row, \.\.\.patch \} : row\)\)\);/);
  assert.match(src, /onPatch=\{\(patch\) => patchRow\(row\.key, patch\)\}/);
  assert.doesNotMatch(src, /key=\{row\.zoneId\}|row\.zoneId !==|row\.zoneId === zoneId|patchRow\(row\.zoneId|pickRowPackage\(row\.zoneId/,
    'ผูกแถวด้วย zoneId = บรรทัดใหม่ที่ยังไม่มีโซนชนกัน');
  const names = intakeForm.historicalZoneLines({ ...REG, zones: [{ key: 'a', zoneId: 'ZN-3' }, { key: 'b', zoneId: '' }], ready: true })
    .map((line) => line.name);
  assert.deepEqual(names, ['รายการ 1', 'รายการ 2'], 'ชื่อบรรทัดคำเดียวกับใบเสนอราคา · เลขเดียวกับคอลัมน์ "#"');

  /* ปุ่ม "เพิ่มรายการ" = บรรทัดว่างทุกช่อง (ไม่มีค่าตั้งต้นให้การตัดสินใจ) · key ใหม่ทุกครั้ง */
  assert.match(src, /const addLine = \(\) => setRows\(\[\.\.\.rows, emptyHistoricalZone\(\)\]\);/);
  const [one, two] = [intakeForm.emptyHistoricalZone(), intakeForm.emptyHistoricalZone()];
  assert.deepEqual([one.zoneId, one.productId, one.qty], ['', '', ''], 'จำนวนเริ่มที่ว่าง — ใส่ 1 ให้ = เดาผิดเกือบทุกใบ');
  assert.ok(one.key && two.key && one.key !== two.key);
  /* 🔴 คำบนจอต้องชี้ของที่มีอยู่จริง (UAT 23/09) — แถวว่างชี้สองปุ่มหัวตาราง */
  const empty = slice(src, '<QuoteLinesEmptyRow colSpan={7}>', '</QuoteLinesEmptyRow>');
  const labels = [...empty.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['เพิ่มรายการ', 'เพิ่มหลายโซน']);
  for (const label of labels) assert.match(src, new RegExp(`>\\s*${label}\\s*</Button>`), `ปุ่ม “${label}” ต้องมีจริง`);
  /* หัวตารางสรุปด้วยคำเดียวกับราง/แถบสรุป */
  assert.match(src, /\{rows\.length \? historicalLinesSummary\(rows\) : "ยังไม่มีรายการ"\}/);
});

test('⭐ 25/09: ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว (ขั้น ① หัวเอกสาร · ขั้น ③ กล่องสรุปท้ายตารางงวด)', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /<DetailPageLayout asideLabel="สรุปใบสั่งขายย้อนหลัง" aside=\{null\}>/);
  assert.equal(intakeForm.historicalStepShowsAside, undefined);
});

/* 🐞 รีวิว 23/09: หลังกด "ถัดไป" เซลล์ "จำนวนเงิน" กับยอดไซต์ยังใช้ราคาที่แถวถือไว้ ขณะที่ยอดใบใช้ราคาของแผน */
test('⭐ 23/09: พรีวิวที่ผ่านเขียนราคา/หน่วยของแผนกลับลงแถว — ไม่ผ่าน patch · ราคาขยับ = อ่านทะเบียนสินค้าใหม่', () => {
  const wizard = code(WIZARD);
  const preview = slice(wizard, 'const runPreview = useCallback(', '}, [state, intakeKey, evidenceRefs, invoiceTotal]);');
  assert.match(preview, /const synced = historicalZonesWithPlanPrices\(state\.zones, data\?\.plan \|\| null\);/);
  assert.match(preview, /setState\(\(current\) => \(current\.zones === state\.zones \? \{ \.\.\.current, zones: synced \} : current\)\);/);
  assert.doesNotMatch(preview, /\bpatch\(/, 'patch ปั๊ม dirty และทิ้งแผนที่เพิ่งตรวจผ่าน');
  assert.match(preview, /dropCache\(PRODUCTS_PATH\(state\.customerId\)\)/,
    'ลิสต์แคชเก่ากว่าทะเบียน ⇒ คำเตือนราคาขยับจะพูดราคาเก่าว่าเป็นราคาปัจจุบัน');
  assert.match(wizard, /cachedFetchJson\(PRODUCTS_PATH\(customerId\)\)/, 'ตัวโหลดกับตัวทิ้งแคชต้องใช้คีย์เดียวกัน');
  assert.match(wizard, /\}, \[customerId, registryRound, productsRound\]\);/);
});

/* ⭐ มติ 25/09: ทางใส่แพ็คเกจเหลือสองทาง — ช่องในบรรทัด (`pickRowPackage`) และหน้าต่างเพิ่มหลายโซน (`addBulk`)
   · ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" (`applyPackage`) และการติ๊กโซนนอกตาราง (`toggleZone`) ถูกถอด ⇒ ยามของสองทางนั้นลบทิ้ง
   🔴 ทั้งสองทางต้องผ่าน `withPackage` → `quoteLineFromProduct` ตัวเดียวกับช่องเลือกสินค้าของใบเสนอราคา ⇒ หน่วย ·
      ราคา/หน่วย (ล็อก) · ข้อมูล FG มาจากทะเบียนแบบเดียวกัน · หน้าต่างไม่เติมแพ็คเกจเอง (ไม่งั้นมีสูตรที่สอง) */
test('⭐ 23/09: ทุกทางที่ใส่แพ็คเกจให้แถว ผ่าน quoteLineFromProduct ตัวเดียวกับช่องเลือกสินค้าของใบเสนอราคา', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /import \{ quoteLineFromProduct \} from "@\/lib\/sales\/quoteLines"/);
  assert.match(src, /return product \? quoteLineFromProduct\(row, product\) : \{ \.\.\.row, productId: productId \|\| "" \};/);
  assert.equal((src.match(/quoteLineFromProduct\(/g) || []).length, 1, 'สูตรเติมแพ็คเกจมีที่เดียว (ใน withPackage)');
  assert.match(src, /const pickRowPackage = \(key, productId\) => setRows\(rows\.map\(\(row\) => \(row\.key === key \? withPackage\(row, productId\) : row\)\)\);/);
  assert.match(src, /const addBulk = \(newRows, productId\) => setRows\(\[\.\.\.rows, \.\.\.newRows\.map\(\(row\) => withPackage\(row, productId\)\)\]\);/);
  assert.equal((src.match(/withPackage\(/g) || []).length, 2, 'ทางใส่แพ็คเกจมีสองทางพอดี — ทางที่สามต้องมาพร้อมยามของมัน');
  const bulk = code(BULK);
  assert.doesNotMatch(bulk, /quoteLineFromProduct/, 'หน้าต่างส่งรหัสแพ็คเกจกลับ ผู้เรียกเติมผ่าน withPackage');
  assert.match(bulk, /onAdd\?\.\(historicalBulkAddRows\(\{[^}]*\}\), productId\)/);
  assert.match(code(LINE_ITEMS), /quoteLineFromProduct\(line, product\)/, 'ใบเสนอราคาเองก็ต้องเรียกตัวเดียวกัน');
  assert.doesNotMatch(code(LINE_ITEMS), /fgLineNoteMeta|fgLineCategoryMeta/, 'ตรรกะเลือกสินค้าแบบก๊อปต้องไม่เหลือในใบเสนอราคา');
});

test('⭐ 23/09: ช่องเลือกแพ็คเกจกรองด้วย lineIsServicePackage (ในบรรทัดและหน้าต่างเพิ่มหลายโซนใช้ชุดเดียวกัน)', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /productSelectOptions\(\(products \|\| \[\]\)\.filter\(lineIsServicePackage\), undefined, \{ withCategory: true \}\)/);
  const picker = slice(src, '<QuoteLineProductPicker', '/>');
  assert.match(picker, /options=\{packageOptions\}/);
  assert.match(picker, /onChange=\{\(value\) => pickRowPackage\(row\.key, value\)\}/);
  /* 🐞 รีวิว 23/09: placeholder "เลือกแพ็คเกจ" ต่างจากใบเสนอราคา ("เลือก FG / สินค้า...") ⇒ ใช้ค่าตั้งต้นของเซลล์กลาง */
  assert.doesNotMatch(picker, /placeholder=|searchPlaceholder=/);
  /* หน้าต่างได้ชุดตัวเลือกชุดเดียวกัน (ไม่กรองเอง) และพูดคำเดียวกับช่องของเซลล์กลาง */
  assert.match(slice(src, '<HistoricalBulkZonesModal', '/>'), /packageOptions=\{packageOptions\}/);
  const bulkPicker = slice(code(BULK), '<SearchableSelect', '/>');
  assert.match(bulkPicker, /options=\{packageOptions\}/);
  assert.doesNotMatch(code(BULK), /lineIsServicePackage|productSelectOptions/, 'กรองสองที่ = สองชุดคำตอบ');
  const defaultPlaceholder = slice(code(CELLS), 'export function QuoteLineProductPicker', ') {').match(/placeholder = "([^"]+)"/)?.[1];
  assert.ok(defaultPlaceholder);
  assert.ok(bulkPicker.includes(`placeholder="${defaultPlaceholder}"`));
  /* ของเพิ่มอย่างที่สองของใบย้อนหลัง — จำนวนรอบบริการ (ช่องของบรรทัดใบสั่งขาย) · ผูกแถวด้วย key */
  assert.match(src, /<QuoteLineServiceRounds\s*\n\s*value=\{row\.rounds\}/);
  assert.match(src, /onChange=\{\(value\) => patchRow\(row\.key, \{ rounds: value \}\)\}/);
});

/* ⭐ มติเจ้าของ 25/09: ท้ายตารางของขั้น ② = **กล่องแบบแก้ได้ของใบเสนอราคา** (QuoteLineTotalsEditor — ส่วนลดท้ายใบ + VAT)
   แทนกล่องอ่านอย่างเดียว (QuoteLineTotals) · ยอดไซต์ของการ์ดไซต์ถูกถอดพร้อมการ์ด (ยาม `.map(historicalZoneLineAmount)` ลบทิ้ง)
   · ป้าย/ยอดในกล่องมาจาก `historicalTotalsView` ตัวเดียวกับขั้น ④ · เซลล์ "จำนวนเงิน" ถามตัวตัดสินเดียวกับยอดใบ */
test('⭐ 25/09: ท้ายตารางของขั้น ② = กล่องสรุปแบบแก้ได้ของใบเสนอราคา · ยอดจากตัวตัดสินเดียวกับขั้น ④ · เหตุที่ยังคิดไม่ได้ขึ้นใต้กล่อง', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const moneyView = useMemo\(\(\) => money \|\| historicalMoneyView\(state, plan\), \[money, state, plan\]\);/);
  assert.match(src, /const totals = historicalTotalsView\(moneyView, state\.vatRate\);/);
  assert.equal((src.match(/<QuoteLineTotalsEditor\b/g) || []).length, 1);
  assert.match(slice(src, '<QuoteLineTotalsEditor', '/>'), /values=\{totals\.values\}/);
  assert.match(src, /\{moneyView\.ok \? null : <p className=\{styles\.totalsReason\}>\{moneyView\.reason\}<\/p>\}/);
  assert.doesNotMatch(src, /styles\.sumBar|ก่อน VAT|<QuoteLineTotals\b/, 'กล่องอ่านอย่างเดียว/แถบยอดบรรทัดเดียวของเดิมถูกแทนแล้ว');
  assert.match(src, /const amount = historicalZoneLineAmount\(row\);/, 'เซลล์ "จำนวนเงิน" ต้องถามตัวตัดสินเดียวกับยอดใบ');
  /* ยังไม่เลือก VAT: ยอดรวมสินค้า/ส่วนลดรู้แล้วต้องพูด (ไม่ใช่ขีดทั้งกล่อง) · ยอดรวมทั้งสิ้นเป็นขีด ไม่ใช่ 0.00 */
  const view = intakeForm.historicalTotalsView({ ok: false, subtotal: 1000, discountAmount: 100 }, null);
  assert.deepEqual(view.rows.map((row) => row.id), ['subtotal', 'discount', 'afterDiscount', 'vat']);
  assert.ok(view.values.subtotal && view.values.afterDiscount);
  assert.equal(view.values.total, null);
  assert.deepEqual(Object.keys(view.values), ['subtotal', 'discount', 'afterDiscount', 'vat', 'total'],
    'ชุดช่องเดียวกับที่ QuotationLineItems ส่งให้ QuoteLineTotalsEditor');
});

/* ⭐ มติเจ้าของ 25/09: ช่อง VAT ย้ายจากขั้น ① (แผ่นตัวเลือก) ไปกล่องสรุปท้ายตารางของขั้น ② — ที่เดียวกับใบเสนอราคา
   🔴 ยามเดิม "VAT ของขั้น ① = สองแผ่นของใบเสนอราคา" ถูกชี้ใหม่: ขั้น ① ต้อง **ไม่เหลือช่อง VAT** (สองที่ = ตอบสองครั้ง
      คนละคำตอบ) · ขั้น ② ต้อง **ไม่มีค่าตั้งต้น** (vatPlaceholder — ใบเก่ามีทั้งแบบรวม VAT และบวก 7% เดาผิด = ยอดไม่ตรงเงิน
      ที่เก็บจริง) · ไม่มีโหมด "ถอด VAT" (มติ 23/09) · ตัวเลือกยังมาจาก QUOTE_VAT_OPTIONS ใน QuoteLineCells ตัวเดียว */
test('⭐ 25/09: VAT อยู่ที่กล่องสรุปของขั้น ② เท่านั้น — สองตัวเลือกของใบเสนอราคา · ไม่มีค่าตั้งต้น · ไม่มีโหมด "ถอด VAT"', () => {
  const contract = code(STEP_CONTRACT);
  assert.doesNotMatch(contract, /vatRate|VAT_TILES|QUOTE_VAT_OPTIONS|HISTORICAL_VAT_RATES|ภาษีมูลค่าเพิ่ม/,
    'ขั้น ① ไม่มีช่อง VAT แล้ว');
  const zones = code(STEP_ZONES);
  const editor = slice(zones, '<QuoteLineTotalsEditor', '/>');
  assert.match(editor, /vatRate=\{HISTORICAL_VAT_RATES\.includes\(state\.vatRate\) \? state\.vatRate : null\}/,
    'ไม่มีค่าตั้งต้น — ใบที่ยังไม่เลือกไม่มีตัวเลือกไหนติด');
  assert.match(editor, /vatPlaceholder="เลือก"/);
  assert.match(editor, /vatInvalid=\{Boolean\(vatIssue\)\}/);
  assert.match(editor, /discountNote=\{discountIssue\}/);
  assert.match(editor, /onDiscountChange=\{changeDiscount\}/);
  assert.match(zones, /const vatIssue = issueOf\("vatRate"\);/);
  assert.match(zones, /const discountIssue = issueOf\("discount"\);/);
  assert.match(zones, /const changeDiscount = \(\{ type, value \}\) => onChange\(\{ discountType: type \|\| null, discountValue: type \? value \?\? "" : "" \}\);/,
    'ไม่ลด = null (ไม่ใช่ "") ตรงกับ state ตั้งต้นและ body ที่ส่ง');
  assert.doesNotMatch(zones, /QUOTE_VAT_OPTIONS/, 'ขั้น ② ต้องไม่วาดตัวเลือก VAT เอง — ตัวเลือกอยู่ในกล่องกลาง');
  assert.match(code(CELLS), /QUOTE_VAT_OPTIONS\.map\(\(option\) => \(/);
  for (const src of [contract, zones]) assert.doesNotMatch(src, /amountsIncludeVat|gross7|net7|ถอด VAT/);
  assert.deepEqual([...intakeForm.HISTORICAL_VAT_RATES], [0, 7]);
  const empty = intakeForm.emptyHistoricalWizard();
  assert.deepEqual([empty.vatRate, empty.discountType, empty.discountValue], [null, null, '']);
});

test('⭐ 23/09: ขั้น ④ โชว์รายการด้วยตารางฝั่งอ่านตัวเดียวกับหน้าใบสั่งขาย (ไซต์ · โซน และรอบใต้คำอธิบาย)', () => {
  const review = code(STEP_REVIEW);
  assert.match(review, /import \{ QuotationReadOnlyLineItems \} from "@\/components\/salesPlanning\/QuotationLineItems"/);
  const table = slice(review, '<QuotationReadOnlyLineItems', '/>');
  assert.match(table, /lines=\{lines\}/);
  assert.match(table, /showServiceRounds/);
  assert.match(table, /showInstallationPoint/);
  /* กล่องสรุปท้ายตารางอ่านตัวเดียวกับขั้น ② ⇒ ป้ายสองขั้นพูดคำเดียวกันเสมอ */
  assert.match(review, /const totals = historicalTotalsView\(\{ ok: true, \.\.\.header \}, header\.vatRate\);/);
  assert.match(table, /summaryRows=\{totals\.rows\}/);
  assert.match(table, /grandTotal=\{totals\.grandTotal\}/);
  assert.doesNotMatch(review, /grossAmount|totalPacks|แพ็ค|ก่อน VAT/);
  const ro = slice(code(LINE_ITEMS), 'export function QuotationReadOnlyLineItems', 'export default function');
  assert.match(ro, /showInstallationPoint = false,/, 'ปิดเป็นค่าตั้งต้น — บรรทัดใบเสนอราคาไม่มีโซน');
  assert.match(ro, /\{showInstallationPoint \? <QuoteLineInstallationPoint point=\{line\.installationPoint\} \/> : null\}/,
    'ตัวเดียวกับบรรทัดโซนของฟอร์มคีย์ใบ (QuoteLineCells)');
});

// ── 10. มติเจ้าของ 25/09: ขั้น ② แบบใบเสนอราคา — error รายช่อง · หน้าต่าง "เพิ่มหลายโซน" · ตัวเลือกที่ติดด่าน ─────
//   ("หน้า SO ย้อนหลัง ใช้แล้ว สับสนยาก มันควรจะหน้าตาเหมือนใบเสนอราคา แต่เพิ่มการเชื่อม ไซท์ โซน รายรายการเข้าไป")
//   ตรรกะของตัวตัดสินตรึงที่ historicalIntakeForm.test.mjs · ที่นี่เฝ้าว่า **จอต่อสายไปหาตัวตัดสินครบทุกทาง**

/* 🐞 "error ขึ้นที่เดียว" (มติ 25/09) — ของเดิมพังสองทาง:
     ① `patch` ไม่แตะ issues ⇒ แก้จำนวนแล้ว "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0" ยังค้างจนกว่าจะกด "ถัดไป" อีกรอบ
     ② จับคู่ข้อความกับแถวด้วย **ลำดับตอนวาด** ⇒ ลบบรรทัดบนหนึ่งบรรทัด ข้อความของบรรทัดล่างเลื่อนไปเกาะบรรทัดผิด
   ⇒ ผูก `rowKey` ตอนได้คำตอบ (ลำดับของ body = ลำดับของ state ที่ส่งไปตรวจ) · แก้ช่องไหนข้อความช่องนั้นหาย */
test('⭐ 25/09: error ของ server ผูกกับ key ของแถวตอนได้คำตอบ · หายเมื่อช่องนั้นถูกแก้ · ขึ้นใต้ช่องที่ผิดช่องเดียว', () => {
  const wizard = code(WIZARD);
  const patchFn = slice(wizard, 'const patch = useCallback(', '}, []);');
  assert.match(patchFn, /const before = stateRef\.current;/,
    'อ่าน state ก่อนแก้จาก ref — side effect ใน updater ของ setState ถูก StrictMode เรียกซ้ำ');
  assert.match(patchFn, /setIssues\(\(current\) => historicalPruneIssues\(current, before, \{ \.\.\.before, \.\.\.next \}\)\);/);
  assert.match(wizard, /useEffect\(\(\) => \{ stateRef\.current = state; \}, \[state\]\);/);
  /* ⭐ รีวิวขั้น ④ 25/09: ตัวพาไปขั้นที่ผิดแยกเป็น `applyPreviewErrors` ตัวเดียว — "ถัดไป" กับปุ่มบันทึกตอนยังไม่มีแผนเรียกตัวเดียวกัน */
  const goToFn = slice(wizard, 'const goToStep = useCallback', '}, [step, runPreview, localIssues, reveal, applyPreviewErrors]);');
  assert.match(goToFn, /applyPreviewErrors\(fieldErrors, from, to\);/);
  assert.match(wizard, /if \(fieldErrors\) applyPreviewErrors\(fieldErrors, "review", "review"\);/,
    'ปุ่มบันทึกตอนไม่มีแผน: error รายช่องต้องพาไปขั้นที่ผิด (เคยทิ้งเงียบ)');
  const goTo = slice(wizard, 'const applyPreviewErrors = useCallback', '}, [state, reveal]);');
  assert.match(goTo, /const keyed = historicalIssuesWithRowKeys\(fieldErrors, state\.zones, state\.installments\);/);
  /* ทุกทางที่พรีวิวไม่ผ่าน (ถอยไปขั้นที่ผิด · ไปขั้น ④ ไม่ได้ · เดินต่อพร้อมข้อความ) เก็บ error ที่ผูก key แล้วเท่านั้น
     (กรองต่อจาก keyed ได้ — เช่นไม่พกข้อ "ยังไม่มีบรรทัด" ไปต้อนรับขั้น ② ที่ยังว่าง) · ผ่าน = ล้าง */
  const sets = [...goTo.matchAll(/setIssues\(([^;]*)\);/g)].map((m) => m[1].trim());
  /* `carried` = keyed ที่กรองข้อ "ยังไม่มีบรรทัด" ออก (ทางเดินต่อ) — ยังเป็นชุดที่ผูก key แล้ว */
  assert.match(goTo, /const carried = keyed\.filter\(\(issue\) => issue\.field !== "zones"\);/);
  assert.ok(sets.filter((arg) => /^(keyed|carried)\b/.test(arg)).length >= 3, `ต้องเจอสามทางที่เก็บ keyed (เจอ ${sets.join(' | ')})`);
  for (const arg of sets) {
    assert.ok(arg === '[]' || /^(keyed|carried)\b/.test(arg), `setIssues(${arg}) — error ที่ยังไม่ผูก key = เกาะแถวด้วยลำดับ (บั๊กเดิม)`);
  }
  /* 🐞 รีวิว 25/09: ข้อที่พกมาถึงขั้นปลายทางต้องเห็นเลย — ไม่ใช่ถูกซ่อนเพราะขั้นนั้น "ยังไม่เปิดเผย" */
  assert.match(goTo,
    /if \(issuesForStep\(carried, to\)\.length && historicalStepHasInput\(state, to\)\) reveal\(to\);\s*setIssues\(carried\);/,
    'ขั้นปลายทางที่ยังว่างไม่ถูกเปิดเผย (UAT 25/09: ก้อนแดงต้อนรับขั้น ③ ของใบใหม่)');
  assert.doesNotMatch(wizard, /setIssues\(fieldErrors\)/, 'error ที่ยังไม่ผูก key = เกาะแถวด้วยลำดับ (บั๊กเดิม)');
  /* ทาง "กลับไปแก้" หลังบันทึกไม่ผ่าน: ผูก key **ตอนบันทึกไม่ผ่าน** ด้วยบรรทัดชุดที่ส่งไปจริง (รีวิว 25/09) —
     ผูกตอนกดปุ่ม = ใช้บรรทัดของตอนนั้น ซึ่งอาจถูกลบ/เพิ่มไปแล้ว */
  assert.match(wizard, /\? historicalIssuesWithRowKeys\(exitInfo\.errors, state\.zones, state\.installments\) : null;/);
  assert.doesNotMatch(wizard, /historicalIssuesWithRowKeys\(action\.errors/);
  /* ⭐ 400 ลงเครื่องหมายผิดทันทีใน catch (ของเดิมรอกด "กลับไปแก้") */
  const fail = slice(wizard, 'if (exit.kind === "invalid") {', 'setSaveFailure({');
  assert.match(fail, /reveal\(landed\);/);
  assert.match(fail, /setIssues\(errors\);/);
  assert.match(fail, /setStep\(landed\);/);

  const zones = code(STEP_ZONES);
  assert.match(zones, /const lineIssues = useMemo\(\(\) => historicalLineIssues\(issues\), \[issues\]\);/);
  assert.match(zones, /const bad = lineIssues\.get\(row\.key\) \|\| \{\};/);
  for (const slot of ['productId', 'zoneId', 'rounds', 'row']) {
    assert.match(zones, new RegExp(`\\{bad\\.${slot} \\? <span className=\\{styles\\.cellBad\\}>\\{bad\\.${slot}\\}</span> : null\\}`),
      `ข้อความของช่อง ${slot} ต้องขึ้นใต้ช่องนั้น`);
  }
  /* จำนวน: เหตุที่จอรู้เอง (1.5 / 0) ก่อน แล้วค่อยข้อที่แผนตีกลับ (เช่นยังว่าง) — ที่เดียวใต้ช่องจำนวน */
  assert.match(zones, /qtyNote=\{amount\.qtyNote \|\| bad\.qty \|\| null\}/);
  /* ก้อนรวมบนสุดพูดเลขบรรทัด **ปัจจุบัน** (ลบบรรทัดบนแล้ว "รายการ 3" ตอนตรวจ = แถวที่ 2 บนจอ) */
  assert.match(zones, /<li key=\{`\$\{issue\.field\}-\$\{issue\.rowKey \|\| ""\}-\$\{issue\.message\}`\}>\{issueText\(issue\)\}<\/li>/);
  /* ตัวประกอบป้ายอยู่ที่ lib (`historicalIssueText` — เทสต์พฤติกรรมอยู่ที่ historicalIntakeForm.test.mjs) · จอแค่ส่ง `lines` ชุดที่วาดอยู่ */
  assert.match(zones, /const issueText = \(issue\) => historicalIssueText\(issue, lines\);/);

  /* สายไฟครบวง: ลบบรรทัดบน → ข้อความของบรรทัดล่างยังเกาะบรรทัดเดิม · แก้จำนวน → ข้อความจำนวนหาย */
  const a = intakeForm.emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-A' });
  const b = intakeForm.emptyHistoricalZone({ zoneId: 'ZN-3', siteId: 'ST-B', qty: '1.5' });
  const before = { ...intakeForm.emptyHistoricalWizard(), zones: [a, b] };
  const keyed = intakeForm.historicalIssuesWithRowKeys([
    { field: 'zones.1.qty', message: 'รายการ 2 (ทางเข้า): x', detail: 'x' },
    { field: 'vatRate', message: 'v' },
  ], before.zones);
  assert.equal(keyed[0].rowKey, b.key);
  const removed = intakeForm.historicalPruneIssues(keyed, before, { ...before, zones: [b] });
  assert.deepEqual([...intakeForm.historicalLineIssues(removed).keys()], [b.key]);
  const fixed = intakeForm.historicalPruneIssues(keyed, before, { ...before, zones: [a, { ...b, qty: '2' }] });
  assert.deepEqual(fixed.map((issue) => issue.field), ['vatRate']);
  assert.equal(intakeForm.historicalPruneIssues(keyed, before, { ...before, notes: 'x' }), keyed,
    'แก้ช่องที่ไม่เกี่ยว = อาร์เรย์เดิม (setIssues ไม่ต้องเรนเดอร์ใหม่)');
});

/* ⭐ มติเจ้าของ 25/09: หน้าต่าง "เพิ่มหลายโซน" แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" — ลูกค้าโซนเยอะ (AWC 247 โซน) ไม่ต้อง
   เลือกแพ็คเกจ 43 ครั้ง · ใช้ Modal กลาง (หัวนิ่ง · เนื้อเลื่อน · ปุ่มนิ่ง) · เปิดใหม่ = เริ่มใหม่ทั้งหน้าต่าง
   (ติ๊กค้างจากรอบก่อนซึ่งเพิ่มไปแล้ว = บรรทัดซ้ำที่รอเกิด) · อ่านทะเบียนชุดเดียวกับขั้น ② ไม่โหลดเอง
   ⭐ PR-D (D27 · DD4 — เขียนยามใหม่โดยตั้งใจ): ตัวห่อของหน้าต่างกลาง `ZonesBulkModal` ⇒ Modal/ค้น/ติ๊ก/การล้างตอนเปิด
      ของส่วนที่ตัวกลางถือ อยู่ที่ตัวกลาง · ตัวห่อล้างช่องของตัวเอง (แพ็คเกจ · จำนวน · รอบ) ตอนเปิดใหม่ */
test('⭐ 25/09 → PR-D: หน้าต่างเพิ่มหลายโซน = ตัวห่อของ ZonesBulkModal · เริ่มใหม่ทุกครั้งที่เปิด · อ่านทะเบียนชุดเดียวกับขั้น ②', () => {
  const bulk = code(BULK);
  assert.match(bulk, /import ZonesBulkModal from "@\/components\/service\/ZonesBulkModal"/);
  assert.doesNotMatch(bulk, /import Modal from/, 'Modal ตัวที่สอง = หน้าต่างสองชุดที่เพี้ยนหากัน (D27)');
  assert.equal((bulk.match(/<ZonesBulkModal\b/g) || []).length, 1);
  const shared = code(SHARED_BULK);
  assert.match(shared, /import Modal from "@\/components\/Modal"/);
  assert.match(shared, /<Modal\s*\n\s*open=\{open\}\s*\n\s*onClose=\{onClose\}/);
  assert.match(shared, /footer=\{\(/, 'ปุ่มอยู่ในแถบท้ายของ Modal — ไม่จมไปกับลิสต์โซนยาว ๆ');
  /* ตัวกลางล้าง ค้น/ติ๊ก/แพ็คต่อรอบ/pressed · ตัวห่อล้างช่องของตัวเอง */
  const sharedReset = slice(shared, 'useEffect(() => {', '}, [open]);');
  for (const call of ['setQuery("")', 'setPicked([])', 'setPressed(false)']) assert.ok(sharedReset.includes(call), `ตัวกลางเปิดใหม่ต้องล้าง ${call}`);
  const reset = slice(bulk, 'useEffect(() => {', '}, [open]);');
  assert.match(reset, /if \(!open\) return;/);
  for (const call of ['setProductId("")', 'setQty("")', 'setRounds("")']) {
    assert.ok(reset.includes(call), `เปิดใหม่ต้องล้าง ${call}`);
  }
  assert.doesNotMatch(bulk, /apiJson|apiFetch|fetch\(/, 'หน้าต่างไม่โหลดทะเบียนเอง — สองชุดข้อมูล = สองคำตอบ');
  assert.doesNotMatch(shared, /apiJson|apiFetch|fetch\(/, 'ตัวกลางก็ไม่โหลดเอง (ผู้เรียกส่งทะเบียนมา)');
  /* ของที่ตัวห่อไม่ส่ง = ค่าตั้งต้นของตารางงานบริการ ซึ่งไม่ใช่ของใบย้อนหลัง */
  const mountModal = slice(bulk, '<ZonesBulkModal', '/>\n  );');
  for (const prop of ['lead={null}', 'existingCount={0}', 'cap={Number.POSITIVE_INFINITY}', 'title={T.title}', 'subtitle={T.subtitle}',
    'packsLabel={T.packsLabel}', 'registrySites={registrySites}', 'taken={taken}', 'extraError={extraError}', 'confirmLabel={T.confirm}']) {
    assert.ok(mountModal.includes(prop), `ตัวห่อต้องส่ง ${prop}`);
  }
  assert.equal(intakeForm.HISTORICAL_SERVICE_TEXT.bulk.confirm(3), 'เพิ่ม 3 บรรทัด', 'ปุ่มนับบรรทัด (หนึ่งโซน = หนึ่งบรรทัด) ไม่ใช่ "โซน"');
  assert.equal(intakeForm.HISTORICAL_SERVICE_TEXT.bulk.confirm(0), 'เพิ่มบรรทัด');

  const zones = code(STEP_ZONES);
  assert.match(zones, /import HistoricalBulkZonesModal from "\.\/HistoricalBulkZonesModal"/);
  assert.match(zones, /onClick=\{\(\) => setBulkOpen\(true\)\}/);
  const mount = slice(zones, '<HistoricalBulkZonesModal', '/>');
  for (const prop of ['open={bulkOpen}', 'onClose={() => setBulkOpen(false)}', 'sites={sites}', 'zonesBySite={zonesBySite}',
    'siteErrors={siteErrors}', 'loading={loading}', 'loadError={loadError}', 'rows={rows}', 'productsById={productsById}',
    'productsError={productsError}', 'assessedByZone={assessedByZone}', 'assessState={assessState}']) {
    assert.ok(mount.includes(prop), `หน้าต่างต้องได้ ${prop}`);
  }
});

/* กฎบ้าน: ติดด่าน = **โชว์แล้วบอกเหตุ** — โซนที่อยู่ในใบแล้ว (หนึ่งโซนหนึ่งบรรทัด) / ปิดใช้งาน เห็นแต่ติ๊กไม่ได้
   🔴 ปุ่ม "ทั้งไซต์" / "เลือกทุกโซนที่เห็น" ต้องข้ามโซนพวกนี้ด้วย — ไม่งั้นติ๊กรวดแล้วได้บรรทัดซ้ำ/โซนปิด
   ⭐ PR-D (D27): เหตุมาจาก `historicalBulkTaken` (สตริง = ติดด่าน) → `zoneBrowserRows` ของตัวกลาง (ปิดใช้งาน = คำเดียวกับเดิม) ·
      โซนที่อยู่ในใบแล้ววาดแบบกดไม่ได้ **ไม่ติ๊ก** (ตัวกลางติ๊กให้เฉพาะโซนของรายการเดียวกัน — DD4 ยอมรับ) */
test('⭐ 25/09 → PR-D: หน้าต่างเพิ่มหลายโซน — โซนที่อยู่ในใบแล้ว/ปิดใช้งานเห็นแต่ติ๊กไม่ได้ พร้อมเหตุบนจอ', () => {
  const bulk = code(BULK);
  assert.match(bulk, /const taken = useMemo\(\(\) => historicalBulkTaken\(rows\), \[rows\]\);/, 'เลขในเหตุ = เลขคอลัมน์ "#" ของตาราง');
  assert.doesNotMatch(bulk, /whyNot|isActive/, 'ตัวห่อไม่ตัดสินการติดด่านเอง — ตัวตัดสินอยู่ที่ lib');
  const shared = code(SHARED_BULK);
  assert.match(shared, /disabled=\{zone\.disabled\}/);
  assert.match(shared, /\{zone\.why \? <span className=\{styles\.zoneNote\}>· \{zone\.why\}<\/span> : null\}/, 'เหตุเป็นตัวหนังสือบนจอ ไม่ใช่แค่ title');
  assert.match(shared, /title=\{zone\.why \|\| undefined\}/);
  assert.match(shared, /const selectable = rows\.flatMap\(\(row\) => row\.selectableIds\);/, '"เลือกทุกโซนที่เห็น" นับเฉพาะโซนที่ติ๊กได้');
  /* ของจริงของตัวตัดสิน: โซนที่อยู่ในใบแล้ว = ติด (สตริง) พร้อมเลขบรรทัด · ปิดใช้งาน = ติด · ที่เหลือติ๊กได้ */
  const reg = intakeForm.historicalBulkRegistrySites({ ...REG });
  const taken = intakeForm.historicalBulkTaken([intakeForm.emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-A' })]);
  assert.equal(taken.get('ZN-1'), 'อยู่ในใบแล้ว (รายการ 1)');
  const shown = zoneBrowserRows({ registrySites: reg, taken });
  const zone = (id) => shown.flatMap((row) => row.zones).find((z) => z.id === id);
  assert.deepEqual([zone('ZN-1').disabled, zone('ZN-1').why], [true, 'อยู่ในใบแล้ว (รายการ 1)']);
  assert.deepEqual([zone('ZN-2').disabled, zone('ZN-2').why], [true, 'ปิดใช้งานในทะเบียน']);
  assert.deepEqual(shown.flatMap((row) => row.selectableIds), ['ZN-3']);
  /* ไซต์ที่อ่านโซนไม่ได้: ตัวกลางวาดประโยคของตัวแปลงแทนชิปโซน · ประโยคบอกทางออกด้วยชื่อปุ่มที่มีอยู่จริงบนขั้น ② */
  assert.match(shared, /\{site\.loadError \? \(\s*<span className=\{styles\.siteError\}>\{site\.loadError\}<\/span>/);
  const blind = intakeForm.historicalBulkRegistrySites({ ...REG, zonesBySite: { 'ST-A': REG.zonesBySite['ST-A'] }, siteErrors: { 'ST-B': 'หมดเวลา' } });
  const failed = blind.find((site) => site.id === 'ST-B');
  assert.deepEqual(failed.zones, [], 'ไซต์ที่พังติ๊กอะไรไม่ได้ (ยังไม่รู้ว่าข้างในมีอะไร)');
  const exit = failed.loadError.match(/ปิดหน้าต่างแล้วกด “([^”]+)”/)?.[1];
  assert.ok(exit, 'ไซต์ที่พังต้องบอกทางออก');
  assert.ok(code(STEP_ZONES).includes(`"${exit}"`), `ปุ่ม “${exit}” ต้องยังอยู่บนขั้น ②`);
  /* 🐞 (D2a ส่งต่อ): `zoneBrowserRows` ซ่อนไซต์ที่คำค้นไม่ตรงชื่อ ⇒ ไซต์ที่พังหายจากสายตาตอนค้นหาโซนที่อาจอยู่ในไซต์นั้น
     ⇒ ตัวกลางดึงไซต์ที่พังกลับมาเสมอ (ตารางงานบริการไม่มีไซต์พัง ⇒ ผลเท่าเดิม) */
  assert.match(shared, /if \(!index\.sites\.some\(\(site\) => site\.loadError\)\) return shown;/);
  /* ชั้นที่สอง (ตัวตัดสิน): กันซ้ำ/ปิดใช้งานอีกชั้น แม้จอจะปล่อยหลุดมา */
  const rows = [intakeForm.emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-A' })];
  const added = intakeForm.historicalBulkAddRows({ ...REG, zoneIds: ['ZN-1', 'ZN-2', 'ZN-3'], rows, qty: '' });
  assert.deepEqual(added.map((row) => row.zoneId), ['ZN-3']);
});

/* กฎบ้าน: บอกผลลัพธ์ก่อนคลิก · ⭐ PR-D (กฎบ้าน 3 — แดงหลังกด): ปุ่มยืนยันกดได้เสมอ ข้อความติดด่านขึ้น **หลังกด** (ตัวกลางถือ
   `pressed`) — ⚠️ ถอยจาก 25/09 ที่ปุ่มปิด + เหตุขึ้นทันที **โดยตั้งใจ** (IMPL_PLAN_D §0.2 ข้อ 3) · ลำดับเหตุ (M1): ช่องของตัวห่อ
   (แพ็คเกจ → จำนวน → รอบ) ก่อน แล้วค่อยของตัวกลาง (ยังไม่เลือกโซน / แพ็คต่อรอบผิด) · ท้ายหน้าต่างไม่เคยพิมพ์ "null" */
test('⭐ 25/09 → PR-D: ปุ่มยืนยันของหน้าต่างเพิ่มหลายโซนบอกผลก่อนกด · ติดด่าน = เหตุท้ายหน้าต่างหลังกด (ช่องของตัวห่อก่อน)', () => {
  const bulk = code(BULK);
  assert.match(bulk, /const extraError = historicalBulkFieldsIssue\(\{ productId, qty, rounds \}\);/);
  assert.match(bulk, /const qtyIssue = historicalBulkQtyIssue\(qty\);/, 'ด่านจำนวนตัวเดียวกับแผน (จำนวนเต็ม > 0 · ว่างได้)');
  assert.match(bulk, /const roundsIssue = historicalBulkRoundsIssue\(rounds\);/);
  const consequence = slice(bulk, 'consequence={(plan, { mode }) => historicalBulkConsequence({', '})}');
  assert.match(consequence, /count: plan\.count, qty, unitPrice, mode, packs: plan\.packs, assessed: plan\.assessed, blank: plan\.blank, rounds,/);
  assert.doesNotMatch(bulk, /disabled=\{Boolean\(blocked\)\}|const blocked =/, 'ปุ่มปิดก่อนกด = เหตุขึ้นก่อนกด (ถอดแล้ว)');

  const shared = code(SHARED_BULK);
  assert.match(shared, /const reason = pressed \? \(extraError \|\| plan\.error\) : null;/);
  assert.match(shared, /const blocked = Boolean\(reason\);/);
  const foot = slice(shared, 'footer={(', '{leadText ?');
  assert.match(foot, /\{blocked \? `ยังเพิ่มไม่ได้ — \$\{reason\}` : consequence\(plan, \{ lineNo, mode \}\)\}/);
  assert.match(foot, /<Button tone="primary" onClick=\{confirm\}>\{confirmLabel\(plan\.count\)\}<\/Button>/);
  assert.doesNotMatch(shared, /\$\{plan\.error\}/, 'plan.error เดี่ยว ๆ ใต้ extraError = ข้อความ "null"/ข้อของตัวกลางทับข้อของตัวห่อ');
  const confirmFn = slice(shared, 'const confirm = () => {', '};');
  assert.match(confirmFn, /setPressed\(true\);\s*if \(extraError \|\| plan\.error\) return;\s*onAdd\?\.\(plan\.rows\);/,
    'กดแล้วติด = ไม่เพิ่มอะไร (ด่านของตัวห่อกันที่ตัวกดด้วย)');

  /* ของจริง: ลำดับเหตุ · ประโยคผลก่อนกด */
  assert.equal(intakeForm.historicalBulkFieldsIssue({ productId: '', qty: '1.5', rounds: '' }), 'เลือกแพ็คเกจก่อน');
  assert.equal(intakeForm.historicalBulkFieldsIssue({ productId: 'P', qty: '1.5', rounds: '' }), intakeForm.HISTORICAL_LINE_MESSAGES.qty);
  assert.equal(intakeForm.historicalBulkFieldsIssue({ productId: 'P', qty: '', rounds: '' }), 'ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(intakeForm.historicalBulkFieldsIssue({ productId: 'P', qty: '', rounds: '12' }), null);
  assert.equal(intakeForm.historicalBulkQtyIssue('1.5'), intakeForm.HISTORICAL_LINE_MESSAGES.qty);
  assert.equal(intakeForm.historicalBulkQtyIssue(''), null);
  assert.equal(intakeForm.historicalBulkConsequence({ count: 3, qty: '12', unitPrice: 3500, mode: 'equal', packs: 2, rounds: '12' }),
    'จะเพิ่ม 3 บรรทัด · บรรทัดละ 12 × ฿3,500.00 = ฿42,000.00 · รวม ฿126,000.00 · จำนวนรอบบริการ 12 รอบ · แต่ละครั้งเท่ากันทุกบรรทัด ครั้งละ 2 แพ็ค');
  assert.match(intakeForm.historicalBulkConsequence({ count: 3, qty: '', unitPrice: 3500, mode: 'assessed', assessed: 2, blank: 1, rounds: '' }),
    /จำนวนใส่ทีละบรรทัดในตาราง · รอบละกี่แพ็ค: ตามผลประเมิน 2 โซน · ยังว่าง 1 โซน$/);
});

/* 🔴 กฎบ้าน 3 ที่ตัวห่อ (L8): ช่องของตัวห่อแดงหลังกดเท่านั้น — ของเดิมช่องจำนวนแดงทันทีที่พิมพ์ 1.5 */
test('PR-D 🔴 หน้าต่างเพิ่มหลายโซน: ทุก invalid/data-bad/aria-invalid ของตัวห่ออ้าง pressed · ช่องรอบบังคับพร้อมหน่วย', () => {
  const bulk = code(BULK);
  const marks = [...bulk.matchAll(/(?:\binvalid|data-bad)=\{([^}]*)\}/g)];
  assert.ok(marks.length >= 4, `ต้องเจอเครื่องหมายผิดของช่อง (เจอ ${marks.length})`);
  for (const match of marks) assert.match(match[1], /\bpressed\b/, `${match[0]} ต้องรอหลังกด`);
  assert.match(bulk, /data-bad=\{pressed && qtyIssue \? "yes" : undefined\}/);
  assert.match(bulk, /aria-invalid=\{pressed && qtyIssue \? "true" : undefined\}/);
  /* review 29/09: MoneyInput ไม่มีกรอบแดงจาก aria-invalid (ไม่มีกฎ CSS [aria-invalid]) — กรอบแดงของทั้งระบบคือคลาส is-invalid
     (แพตเทิร์น HistoricalInstallmentTable) ⇒ ช่องจำนวนแดงพร้อมช่องรอบข้าง ๆ หลังกด */
  assert.match(bulk, /<MoneyInput min="0" autoComplete="off" className=\{pressed && qtyIssue \? "is-invalid" : ""\}/);
  assert.match(bulk, /invalid=\{pressed && Boolean\(roundsIssue\)\}/);
  assert.match(bulk, /renderFields=\{\(\{ pressed \}\) => \(/, 'ตัวห่อรู้ว่ากดแล้วจากตัวกลาง (ไม่ถือ pressed ของตัวเองซ้อน)');
  assert.doesNotMatch(bulk, /useState\(false\)|setPressed/, 'pressed มีเจ้าของคนเดียว (ตัวกลาง)');
  /* ช่องรอบ: จำนวนเต็ม ≥ 1 · หน่วย "รอบ" · ปิด autoComplete (กฎบ้าน) · ช่องจำนวนก็ปิด */
  const roundsField = slice(bulk, '<Input', '/>');
  assert.match(roundsField, /type="number" min="1" step="1" inputMode="numeric" placeholder="—" autoComplete="off"/);
  assert.match(bulk, /<MoneyInput min="0" autoComplete="off"/);
  assert.match(bulk, /\{T\.roundsLabel\} <b className=\{styles\.req\}>\*<\/b>/);
  assert.match(bulk, /\{T\.packageLabel\} <b className=\{styles\.req\}>\*<\/b>/);
});

/* 🔴 review 29/09: ประโยคข้างโหมด "ตามผลประเมินของแต่ละโซน" ของตัวกลาง ("โซนที่ยังไม่เคยประเมินเว้นว่างไว้") ขัดกับบรรทัด M6
   ของตัวห่อตอนผลประเมินยังโหลด/อ่านไม่ได้ (ทุกโซนจะว่าง ไม่ใช่เฉพาะโซนที่ไม่เคยประเมิน) ⇒ prop เสริม `assessedHint`
   (ไม่ส่ง = ประโยคเดิมทุกตัวอักษรของใบ pipeline · null = ซ่อน) · ตัวห่อส่ง null เมื่อยังไม่ ok ⇒ บรรทัด M6 พูดคนเดียว */
test('PR-D 🔴 review 29/09 หน้าต่างเพิ่มหลายโซน: ผลประเมินยังไม่ ok = ไม่มีประโยค "โซนที่ยังไม่เคยประเมินเว้นว่างไว้" มาขัดบรรทัด M6', () => {
  const shared = code(SHARED_BULK);
  const props = slice(shared, 'export default function ZonesBulkModal({', '}) {');
  assert.match(props, /assessedHint = "โซนที่ยังไม่เคยประเมินเว้นว่างไว้ — ใส่ทีละแถวในตาราง",/, 'ค่าตั้งต้น = ประโยคเดิมของใบ pipeline');
  assert.match(shared, /\) : assessedHint \? \(\n\s*<span className=\{styles\.count\}>\{assessedHint\}<\/span>\n\s*\) : null\}/);
  assert.equal((shared.match(/โซนที่ยังไม่เคยประเมินเว้นว่างไว้/g) || []).length, 1, 'ประโยคอยู่ที่ค่าตั้งต้นที่เดียว');
  const mount = slice(code(BULK), '<ZonesBulkModal', '/>\n  );');
  assert.match(mount, /assessedHint=\{assessState === "ok" \? T\.assessedHint : null\}/);
  assert.equal(intakeForm.HISTORICAL_SERVICE_TEXT.bulk.assessedHint, 'โซนที่ยังไม่เคยประเมินเว้นว่างไว้ — ใส่ทีละบรรทัดในตาราง',
    'คำของใบย้อนหลัง = บรรทัด (ไม่ใช่แถว)');
});

/* ⭐ M6: ผลประเมินยังโหลด/อ่านไม่ได้ = "ตามผลประเมิน" จะได้ช่องว่างทุกโซน ⇒ บอกหนึ่งบรรทัดเหนือแถวแพ็คต่อรอบ (ไม่เงียบ)
   ⚠️ ไม่สลับโหมดให้เอง — ผลประเมินมาถึงตอนหน้าต่างเปิดอยู่ แล้วโหมดเปลี่ยน = ตัวกลางล้างที่ติ๊กไว้ (IMPL_PLAN_D M6) */
test('PR-D ⭐ M6: หน้าต่างเพิ่มหลายโซนบอกเมื่อผลประเมินยังโหลด/อ่านไม่ได้ · อ่านได้แล้ว = ไม่มีบรรทัดนี้', () => {
  const bulk = code(BULK);
  assert.match(bulk, /const assessNote = assessState === "loading" \? T\.assessLoading : \(assessState === "error" \? T\.assessFailed : null\);/);
  assert.match(bulk, /\{assessNote \? <p className=\{styles\.assessNote\}>\{assessNote\}<\/p> : null\}/);
  assert.match(bulk, /const assessed = assessState === "ok" \? assessedByZone : null;/, 'ยังไม่ ok = ไม่ส่งตัวเลขประเมินค้างรอบก่อน');
  assert.doesNotMatch(code(SHARED_BULK), /initialMode/, 'ไม่มีทางสลับโหมดตั้งต้นจากผู้เรียก (M6 — ตัวเลือกที่ถูกปัด)');
  assert.match(intakeForm.HISTORICAL_SERVICE_TEXT.bulk.assessFailed, /ใช้ “เท่ากันทุกโซน” หรือใส่ทีละบรรทัด/);
});

/* 🔴 ช่องที่ถูกแทน ("ใช้แพ็คเกจเดียวกันทุกโซน") เททับแพ็คเกจของ **ทุกบรรทัดที่มีอยู่** เงียบ ๆ ⇒ หน้าต่างนี้ต้อง
   **ต่อท้ายเท่านั้น** — ได้ `rows` ไว้อ่าน (กันซ้ำ · บอกเลขบรรทัด) แต่ไม่มีทางเขียน · บรรทัดที่คีย์ไว้แล้วไม่ถูกแตะ
   ⭐ PR-D: แถวของตัวกลาง (`{ zoneId, packsPerRound }`) → บรรทัดใหม่ผ่าน `historicalBulkAddRows` (พกรอบ + แพ็คต่อรอบรายโซน) */
test('🔴 25/09 → PR-D: หน้าต่างเพิ่มหลายโซนต่อท้ายเท่านั้น — ไม่มีทางเขียนทับบรรทัดที่คีย์ไว้แล้ว', () => {
  const bulk = code(BULK);
  const props = slice(bulk, 'export default function HistoricalBulkZonesModal({', '}) {');
  assert.match(props, /\bonAdd\b/);
  assert.doesNotMatch(props, /\bonChange\b|\bsetRows\b|\bonRowsChange\b/, 'หน้าต่างได้ rows ไว้อ่าน ห้ามได้ทางเขียน');
  const add = slice(bulk, 'onAdd={(planRows) => onAdd?.(historicalBulkAddRows({', '}), productId)}');
  assert.match(add, /zoneIds: planRows\.map\(\(row\) => row\.zoneId\), sites, zonesBySite, rows, qty, rounds,/);
  assert.match(add, /packsByZone: new Map\(planRows\.map\(\(row\) => \[row\.zoneId, row\.packsPerRound\]\)\),/);
  const zones = code(STEP_ZONES);
  assert.match(slice(zones, '<HistoricalBulkZonesModal', '/>'),
    /onAdd=\{\(newRows, productId\) => \{ addBulk\(newRows, productId\); setBulkOpen\(false\); \}\}/);
  assert.match(zones, /setRows\(\[\.\.\.rows, \.\.\.newRows\.map\(/, 'บรรทัดเดิมทั้งชุดนำหน้าตามเดิม ไม่ถูก map/แก้');
  /* ของจริง: บรรทัดเดิมไม่ถูกแตะ · บรรทัดใหม่ key ใหม่ · ยังไม่มีแพ็คเกจ (ผู้เรียกเติมผ่าน withPackage) · พกรอบ + แพ็คต่อรอบ */
  const rows = [intakeForm.emptyHistoricalZone({ zoneId: 'ZN-1', siteId: 'ST-A', productId: 'PRD-1', qty: '3' })];
  const snapshot = JSON.stringify(rows);
  const added = intakeForm.historicalBulkAddRows({
    ...REG, zoneIds: ['ZN-3'], rows, qty: '', rounds: '12', packsByZone: new Map([['ZN-3', 2]]),
  });
  assert.equal(JSON.stringify(rows), snapshot, 'บรรทัดที่คีย์ไว้แล้วไม่ถูกแตะ');
  assert.equal(added.length, 1);
  assert.notEqual(added[0].key, rows[0].key);
  assert.deepEqual([added[0].zoneId, added[0].siteId, added[0].productId, added[0].qty], ['ZN-3', 'ST-B', '', '']);
  assert.deepEqual([added[0].rounds, added[0].packsPerRound], ['12', '2']);
  const blank = intakeForm.historicalBulkAddRows({ ...REG, zoneIds: ['ZN-3'], rows, rounds: '12', packsByZone: new Map([['ZN-3', null]]) });
  assert.equal(blank[0].packsPerRound, '', 'โซนที่ยังไม่เคยประเมิน (โหมดตามผลประเมิน) = ช่องว่าง ใส่ทีละบรรทัด');
});
/* ⭐ ช่อง "ไซต์ · โซน" ปิดตัวเลือก (อยู่ในรายการอื่นแล้ว · ปิดใช้งาน · โซนที่หายของแถวนี้) ผ่าน `option.disabled` ของ SearchableSelect
   🔴 primitive ไม่เคารพ = ตัวเลือกที่จอบอกว่า "เลือกไม่ได้" ถูกเลือกได้ด้วยคลิกหรือ Enter ⇒ สองบรรทัดผูกโซนเดียว แล้วแผน
      ตีกลับ historical_so_zone_duplicate ทีหลัง (หรือแถวที่ผูกโซนหายถูกชี้กลับไปหาโซนที่ไม่มีในทะเบียน) */
test('⭐ SearchableSelect เคารพ option.disabled ทั้งคลิก · Enter · โปรแกรมอ่านหน้าจอ', () => {
  const src = code(SEARCHABLE);
  assert.match(src, /const firstSelectable = filtered\.find\(\(option\) => !option\.group && !option\.disabled\);/,
    'Enter เลือกตัวแรกที่เลือกได้จริง — ไม่ใช่ตัวที่ติดด่าน');
  assert.match(src, /if \(event\.key === "Enter" && firstSelectable\) choose\(firstSelectable\);/);
  assert.match(slice(src, 'const choose = (option) => {', '};'), /^const choose = \(option\) => \{\s*\n\s*if \(option\?\.disabled\) return;/,
    'ด่านต้องมาก่อน onChange');
  const button = slice(src, 'role="option"', '</button>');
  assert.match(button, /aria-disabled=\{option\.disabled \? "true" : undefined\}/);
  assert.match(button, /disabled=\{Boolean\(option\.disabled\)\}/);
  assert.match(button, /onClick=\{\(\) => choose\(option\)\}/);
  /* ผู้เรียกส่งช่องชื่อเดียวกันถึง primitive (zoneSelectOption กระจายทุกช่องของตัวตัดสิน) */
  assert.match(code(STEP_ZONES), /const zoneSelectOption = \(option\) => \(option\.group \? option : \{\s*\n\s*\.\.\.option,/);
  assert.equal(pickerOption([{ key: 'r1', zoneId: 'ZN-1' }, { key: 'r2', zoneId: '' }], 'r2', 'ZN-1').disabled, true);
});

/* 🚫 `packageProductId` ตายไปพร้อมช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" (มติ 25/09) — ไม่เคยถูกบันทึก แต่เคยถูกอ่านจากบรรทัดแรก
   ตอนเปิดแก้ใบ แล้วเททับทุกบรรทัด ⇒ เหลือในโค้ดที่ไหน = มีคนเริ่มพึ่งมันอีก (เหลือได้แค่ในคอมเมนต์/เทสต์) */
test('🚫 25/09: packageProductId ไม่เหลือในโค้ดสักบรรทัด และไม่อยู่ใน state/body ของฟอร์ม', () => {
  const hits = [];
  let scanned = 0;
  for (const rel of readdirSync(SRC, { recursive: true })) {
    if (!/\.(m?js|jsx)$/.test(rel) || /\.test\.mjs$/.test(rel)) continue;
    scanned += 1;
    if (code(rel).includes('packageProductId')) hits.push(rel);
  }
  assert.ok(scanned > 100, `ยามต้องสแกนโค้ดจริง (เจอ ${scanned} ไฟล์)`);
  assert.deepEqual(hits, []);
  const empty = intakeForm.emptyHistoricalWizard();
  assert.equal('packageProductId' in empty, false);
  assert.equal('packageProductId' in intakeForm.historicalWizardBody(empty), false);
});

/* 🐞 ต้องสงสัย (ของเดิมก่อน 25/09 — ไม่แก้ในรอบนี้ ยามนี้ตั้งเป็น todo ไว้ให้เห็น):
   เส้นทะเบียนไซต์เอง (`/api/service/sites`) พัง ⇒ `loadError` · `ready` = เท็จตลอดกาล ⇒ ทุกบรรทัดที่ผูกโซนขึ้น
   "กำลังโหลดทะเบียนไซต์…" (ทั้งเหตุใต้ช่องโซนและป้ายบนช่อง) และปุ่มลบปิดด้วยเหตุ "รอทะเบียนไซต์โหลดเสร็จก่อน" ทั้งที่
   ไม่ได้โหลดอยู่ · ก้อนแดงไม่มีปุ่มลองใหม่ และ effect ยิงใหม่เฉพาะตอนเปลี่ยนลูกค้า (ซึ่งล้างรายการทั้งใบ)
   ⇒ ทางออกเหลือรีโหลดหน้า ซึ่งชนยาม useUnsavedChanges (ทางตันแบบ N4) */
test('🐞 รีวิว 25/09: เส้นทะเบียนไซต์พัง — บรรทัดบอกว่าพัง (ไม่ใช่ "กำลังโหลด…") ลบไม่ได้ และก้อนแดงมีปุ่มยิงใหม่', () => {
  const zones = [{ key: 'r1', zoneId: 'ZN-1' }];
  const [failed] = intakeForm.historicalZoneLines({ zones, sites: [], zonesBySite: {}, ready: false, failed: true });
  assert.doesNotMatch(failed.note, /กำลังโหลด/);
  assert.match(failed.note, /โหลดทะเบียนไซต์ไม่สำเร็จ/);
  assert.equal(failed.removable, false, 'ยังไม่รู้ว่าโซนยังอยู่ไหม ⇒ ลบไม่ได้ (เหตุเดียวกับ N1)');
  assert.match(failed.removeTitle, /ลองโหลดทะเบียนไซต์อีกครั้ง/, 'เหตุของปุ่มลบต้องชี้ปุ่มที่มีอยู่จริง');
  const [loading] = intakeForm.historicalZoneLines({ zones, sites: [], zonesBySite: {}, ready: false });
  assert.match(loading.note, /กำลังโหลด/, 'กำลังโหลดจริงยังพูดแบบเดิม');

  const src = code(STEP_ZONES);
  assert.match(src, /failed: Boolean\(loadError\)/, 'จอต้องส่งเหตุ "พัง" แยกจาก "ยังโหลดไม่เสร็จ"');
  const notice = slice(src, 'title="โหลดทะเบียนไซต์ไม่สำเร็จ"', '</StatusNotice>');
  assert.match(notice, /onClick=\{\(\) => setSitesRound\(\(round\) => round \+ 1\)\}/);
  assert.match(notice, /ลองโหลดทะเบียนไซต์อีกครั้ง/);
  assert.match(src, /\}, \[customerId, loadSiteZones, sitesRound\]\);/, 'ปุ่มต้องยิงเอฟเฟกต์โหลดทะเบียนจริง (ไม่ใช่เปลี่ยนลูกค้า)');
});

/* 🔴 R9 (#1817 แบบเดียวกับ /database): หน้าต่างเพิ่มหลายโซนเคยพิมพ์ "0 ไซต์ · 0 โซนในทะเบียน" ระหว่างโหลด/โหลดพัง
   ⇒ ยังไม่รู้จำนวน = บอกว่ายังอ่านไม่ได้ ไม่ใช่เลขศูนย์ที่อ่านเป็นทะเบียนว่าง (รีวิว 25/09) */
test('🐞 รีวิว 25/09: หน้าต่างเพิ่มหลายโซนไม่พิมพ์จำนวนตอนทะเบียนยังโหลด/โหลดพัง', () => {
  /* ⭐ PR-D (D27): ตัวนับอยู่ที่ตัวกลาง (`countText`) · ตัวห่อต้องส่งสถานะโหลดของขั้น ② ต่อไปครบ ไม่งั้นตัวกลางนับทะเบียนว่าง */
  const count = slice(code(SHARED_BULK), 'const countText = ', ';');
  assert.match(count, /loading \|\| loadError\s*\n?\s*\? "ยังอ่านทะเบียนไซต์ไม่ได้"/);
  assert.match(code(SHARED_BULK), /<span className=\{styles\.count\}>\{countText\}<\/span>/);
  const mount = slice(code(BULK), '<ZonesBulkModal', '/>\n  );');
  assert.ok(mount.includes('loading={loading}') && mount.includes('loadError={loadError}'), 'ตัวห่อส่งสถานะโหลดต่อ');
});

/* ⭐ สลับชนิดส่วนลดท้ายใบเป็น % ต้องตัดค่าที่ค้างไว้ที่ 100 (รีวิว 25/09) — ช่องค่าตัดตอนพิมพ์อยู่แล้ว แต่การสลับชนิด
   เคยพกค่าบาทเดิม (เช่น 2,000) ไปเป็น 2,000% ⇒ ใบย้อนหลังตีกลับ / ใบเสนอราคาคิดเป็น 100% เงียบ ๆ */
test('⭐ กล่องสรุปแบบแก้ได้: สลับชนิดส่วนลดท้ายใบ = ตัดค่าที่ค้างด้วย clampQuoteDiscount', () => {
  const cells = code('components/salesPlanning/QuoteLineCells.js');
  assert.match(cells, /value: event\.target\.value \? \(clampQuoteDiscount\(event\.target\.value, discountValue\) \?\? ""\) : ""/);
});

// ── มติเจ้าของ 25/09 (รื้อขั้น ①) ────────────────────────────────────────────────────────────

/* ⭐ ขั้น ① = หน้าสร้างใบเสนอราคา: หัว `DetailOverview` (ช่องสรุปจาก historicalContractFacts แทนแถบขวา) · การ์ดตามเรื่อง ·
   ชนิดเอกสารเป็น `ChoiceChips` · ลูกค้ากับ AE คู่กัน (เจ้าของขอ) · ไม่มีช่อง VAT · ไม่มีกล่องฟ้าท้ายฟอร์ม */
test('⭐ 25/09: ขั้น ① เป็นการ์ดตามเรื่องแบบใบเสนอราคา — หัวเอกสาร · ที่มาของใบ · เอกสารแทนสัญญา · อ้างอิงเดิม · หมายเหตุ', () => {
  const src = code(STEP_CONTRACT);
  assert.match(src, /import DetailOverview, \{ DetailStateBadge \} from "@\/components\/ui\/DetailOverview"/,
    'หัวเอกสารใช้ตัวเดียวกับหน้าสร้างใบเสนอราคา ไม่ใช่วาดเอง');
  assert.match(src, /historicalContractFacts\(facts\)/, 'ช่องสรุปมาจากแถวชุดเดียวกับแถบสรุป');
  const order = ['<DetailOverview', 'ที่มาของใบ', 'เอกสารแทนสัญญา', 'อ้างอิงเดิม', 'หมายเหตุ'];
  let at = -1;
  for (const piece of order) {
    const next = src.indexOf(piece, at + 1);
    assert.ok(next > at, `ลำดับการ์ดผิดที่ ${piece}`);
    at = next;
  }
  const source = slice(src, 'aria-labelledby="hist-card-source"', '</section>');
  const grid = slice(source, '<div className={styles.grid2}>', 'id={historicalFieldAnchorId("team")}');
  assert.ok(grid.includes('historicalFieldAnchorId("customerId")') && grid.includes('historicalFieldAnchorId("ownerId")'),
    'ลูกค้ากับ AE อยู่ในแถวเดียวกัน (มติเจ้าของตอนตรวจม็อก)');
  assert.match(src, /import ChoiceChips from "@\/components\/ui\/ChoiceChips"/);
  assert.match(src, /<ChoiceChips\s+ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"/);
  assert.doesNotMatch(src, /OptionTiles|VAT_TILES|vatRate|QUOTE_VAT_OPTIONS/, 'ขั้น ① ไม่มี VAT แล้ว');
  assert.doesNotMatch(src, /icon=\{FileText\}/, 'กล่องฟ้า "ไม่นับ Actual" ท้ายฟอร์มกลายเป็นป้ายบนหัว');
  assert.match(src, /DetailStateBadge label="ไม่นับ Actual \/ FC \/ เป้า"/);
});

/* 🐞 รีวิว 25/09 ขั้น ① — สามข้อที่เทสต์ตรรกะมองไม่เห็น */
test('🐞 รีวิว 25/09: หัวขั้น ① ไม่ลงแถบหัวลอย · ชนิดเอกสารแก้ได้ตอนแก้ใบ · ป้ายสถานะสองที่มาจากตัวเดียว', () => {
  const src = code(STEP_CONTRACT);
  /* แถบหัวลอยของเปลือกมีปุ่ม "กลับ" = history.back ซึ่งยาม useUnsavedChanges จับไม่ได้ ⇒ ของที่คีย์ทั้งใบหาย */
  assert.match(src, /<DetailOverview\s+pin=\{false\}/);
  const overview = code('components/ui/DetailOverview.js');
  assert.match(overview, /pin: pinEnabled = true,/, 'ค่าตั้งต้นของหน้าอื่นไม่เปลี่ยน');
  assert.match(overview, /const setRecord = pinEnabled \? pin\?\.setRecord : null;/);
  assert.equal((overview.match(/if \(!setRecord\) return undefined;/g) || []).length, 2, 'ทั้งสอง effect ต้องหยุดเมื่อไม่ลงแถบ');
  /* RPC แก้ใบเขียน externalDocKind ใหม่ได้ — ล็อกหลังบันทึกคือลูกค้า × AE เท่านั้น */
  const chips = slice(src, '<ChoiceChips', '/>');
  assert.match(chips, /disabled=\{busy\}/);
  assert.doesNotMatch(chips, /locked/);
  /* ขั้น ① (หัว) กับแถบสรุปขั้น ③ พูดสถานะใบจาก historicalDocStatusLabel ตัวเดียว */
  const wizard = code(WIZARD);
  /* แถบสรุปข้างขวาถูกถอดทุกขั้นแล้ว (25/09) ⇒ ป้ายสถานะเหลือที่หัวขั้น ① ที่เดียว */
  assert.doesNotMatch(wizard, /status=\{/);
  assert.match(wizard, /statusLabel=\{historicalDocStatusLabel\(state\)\}/);
  assert.doesNotMatch(wizard, /"ฉบับร่าง — ยังไม่ส่งอนุมัติ"/);
});

/* ⭐ มติ 25/09: ก้อนแดงขึ้นหลังกดไปต่อเท่านั้น ทุกขั้น — ผู้เรียกตัดสิน (`historicalVisibleIssues`) · ขั้นแค่เคารพ `summary` */
test('⭐ 25/09: ก้อนแดงทุกขั้นขึ้นหลังกดไปต่อ — wizard เปิดเผยขั้นตอนกด ถัดไป/ราง/บันทึก · ทุกขั้นเคารพ summary', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /const \[revealedSteps, setRevealedSteps\] = useState\(\(\) => new Set\(\)\);/);
  const goTo = slice(wizard, 'const goToStep = useCallback', '}, [step, runPreview, localIssues, reveal, applyPreviewErrors]);');
  assert.ok(goTo.indexOf('reveal(from);') >= 0 && goTo.indexOf('reveal(from);') < goTo.indexOf('if (block.blocked)'),
    'กดไปต่อ = เปิดเผยขั้นนี้ก่อนตรวจด่าน (ติดด่านแล้วต้องเห็นข้อความทันที)');
  assert.match(slice(wizard, 'const applyPreviewErrors = useCallback', '}, [state, reveal]);'),
    /reveal\(first\); setIssues\(keyed\); setStep\(first\);/);
  assert.match(wizard, /reveal\(landed\);/, 'บันทึกไม่ผ่าน (400) = เปิดเผยขั้นปลายทาง');
  assert.match(wizard, /reveal\(action\.step\);/, 'กด "ไปแก้ที่ขั้น …" ในแผงบันทึก = เปิดเผยขั้นปลายทาง');
  assert.match(wizard, /const first = firstStepWithIssues\(localIssues\) \|\| "contract";\s*reveal\(first\);/,
    'ปุ่มบันทึกที่ติดด่านพากลับ = เปิดเผยขั้นนั้น');
  assert.match(wizard, /const shownIssues = \(key\) => historicalVisibleIssues\(stepIssues\(key\), \{ revealed: revealedSteps\.has\(key\) \}\);/);
  for (const key of ['contract', 'zones', 'money']) {
    assert.match(wizard, new RegExp(`issues=\\{shownIssues\\("${key}"\\)\\.issues\\}\\s*summary=\\{shownIssues\\("${key}"\\)\\.summary\\}`), key);
  }
  assert.match(code(STEP_CONTRACT), /\{summary && issues\.length > 0 && \(/);
  assert.match(code(STEP_ZONES), /\{summary && issues\.length > 0 && \(/);
  assert.match(code(STEP_MONEY), /\{summary && issues\.length > 0 && \(/);
});

/* ⭐ มติเจ้าของ 25/09 (รื้อขั้น ③ — ม็อก Step3New/Step3Full/Step3Split) — สิ่งที่เทสต์ตรรกะมองไม่เห็นจากจอ */
test('⭐ 25/09 ขั้น ③: คำถามสามทาง · เปลี่ยนคำตอบถามก่อน · งวดสุดท้ายล็อก · หน้าต่างแบ่งงวดไม่มีค่าตั้งต้น', () => {
  const money = code(STEP_MONEY);
  /* การ์ดตามเรื่องแบบขั้น ① (หัวการ์ดตัวเดียวกัน) · ไม่มีกล่องเทา .carry / ไทล์แบ่งงวดใต้ตารางแบบเดิม */
  assert.match(money, /import CardHeading from "\.\/CardHeading";/);
  assert.match(code(STEP_CONTRACT), /import CardHeading from "\.\/CardHeading";/, 'สองขั้นใช้หัวการ์ดตัวเดียวกัน');
  assert.doesNotMatch(money, /styles\.carry|OPENING_TILES|splitOptions|applySplit|splitRemaining/);
  const order = ['hist-card-span', 'hist-card-paid', 'hist-card-installments'];
  let at = -1;
  for (const id of order) {
    const next = money.indexOf(`id="${id}"`);
    assert.ok(next > at, `ลำดับการ์ดผิดที่ ${id}`);
    at = next;
  }
  /* คำถามสามทาง — ไม่มีค่าตั้งต้น · เปลี่ยนคำตอบผ่านตัวตัดสินเดียวที่ถามก่อนล้าง */
  for (const value of ['full', 'part', 'none']) assert.match(money, new RegExp(`value: "${value}"`));
  assert.match(money, /<OptionTiles\s+ariaLabel="ลูกค้าจ่ายเงินมาแล้วหรือยัง"[\s\S]*?invalid=\{has\("opening"\)\}/);
  const change = slice(money, 'const changeMode = async (next) => {', '};');
  assert.match(change, /historicalOpeningModeChange\(state, next, \{ pendingEvidence: evidenceFiles\.length \}\)/);
  assert.match(change, /if \(change\.ask\) \{[\s\S]*confirmAction\(\{[\s\S]*if \(!go\) return;/);
  assert.match(change, /if \(change\.clearsEvidence && evidenceFiles\.length\) onEvidenceFiles\?\.\(\[\]\);/,
    '"ยังไม่เคยจ่าย" ล้างตะกร้าหลักฐานด้วย — ค้างไว้ = อัปขึ้นไปเป็นไฟล์กำพร้า');
  /* ปุ่มหัวตารางงวดติดด่าน = โชว์แล้วบอกเหตุ (GatedAction) */
  assert.match(money, /<GatedAction[\s\S]*?blocker=\{splitBlocker \|\| ""\}[\s\S]*?แบ่งงวดอัตโนมัติ/);
  assert.match(money, /<GatedAction[\s\S]*?blocker=\{addBlocker \|\| ""\}[\s\S]*?เพิ่มงวด/);
  assert.match(money, /setRows\(historicalAddInstallment\(state, \{ totalAmount: total \}\)\)/,
    '"เพิ่มงวด" ต้องแช่ยอดที่งวดสุดท้ายเดิมโชว์อยู่ (ไม่ใช่ต่อแถวเปล่าแล้วยอดเดิมหาย)');

  /* ตารางงวด: งวดสุดท้ายไม่มีช่องยอด/ช่อง "ถึง" ให้พิมพ์ (ล็อกพร้อมเหตุ) · งวดยกมาเป็นแถวอ่านอย่างเดียว */
  const table = code(INST_TABLE);
  assert.match(table, /\{row\.last \? \(\s*<span className=\{styles\.instLocked\}/, 'ช่องยอดของงวดสุดท้าย = ค่าล็อก ไม่ใช่ MoneyInput');
  assert.match(table, /title="งวดสุดท้ายรับยอดที่เหลือ — แก้ยอดงวดก่อนหน้าแทน"/);
  assert.match(table, /title="งวดสุดท้ายครอบถึงวันสิ้นสุดสัญญาเสมอ"/);
  assert.match(table, /<StatusBadge tone="info" label="ยกมา"/);
  assert.doesNotMatch(table, /QuotationInstallments|minWidth=\{900\}/, 'ไม่ยืมตัวแก้งวดของหน้าใบสั่งขาย (เหตุอยู่หัวไฟล์)');

  /* หน้าต่างแบ่งงวด: สองคำถามไม่มีค่าตั้งต้น · เปิดใหม่ = เริ่มใหม่ · บอกผลก่อนกด · แทนที่ = ปุ่มโทนอันตราย */
  const split = code(SPLIT);
  assert.match(split, /const \[period, setPeriod\] = useState\(null\);/);
  assert.match(split, /const \[dueRule, setDueRule\] = useState\(null\);/);
  assert.match(split, /useEffect\(\(\) => \{\s*if \(!open\) return;\s*setPeriod\(null\);\s*setDueRule\(null\);/);
  assert.match(split, /const consequence = historicalSplitConsequence\(preview, \{ replacing \}\);/);
  assert.match(split, /tone=\{replacing \? "danger" : "primary"\} disabled=\{Boolean\(preview\.blocked\)\}/);
  assert.match(split, /disabled: option\.disabled,/, 'ตัวเลือกที่แบ่งไม่ลงตัวโชว์แต่กดไม่ได้ — ไม่ซ่อน');
});

test('⭐ 25/09 แถบช่วงบริการ: ชนิดใหม่ (ยังไม่ถึงกำหนด · เลยกำหนด) ไม่แตะความหมาย "due" ของหน้าใบสั่งขาย', () => {
  const tl = code('components/salesPlanning/historicalWizard/CoverageTimeline.js');
  assert.match(tl, /const LEGEND = \{ paid: "เก็บแล้ว", due: "ยังต้องเก็บ", planned: "ยังไม่ถึงกำหนด", overdue: "เลยกำหนด" \};/);
  assert.match(tl, /Array\.isArray\(legend\) \? legend\.map/);
  const css = code('components/salesPlanning/historicalWizard/HistoricalOrderWizard.module.css');
  assert.match(css, /\.tlSeg\[data-kind="due"\] \{ fill: var\(--amber\); \}/, 'สี "รอชำระ" ของหน้าใบสั่งขายคงเดิม');
  assert.match(css, /\.tlSeg\[data-kind="planned"\] \{ fill: var\(--blue\); \}/);
});

// ── ขั้น ④ รื้อใหม่ (มติเจ้าของ 25/09 — "ตรวจแบบผู้อนุมัติ" · ม็อก Step4New/Step4Dup) ─────────────────────────
//   ตรรกะอยู่ที่ historicalReviewView (ทดสอบที่ historicalReviewView.test.mjs) · ที่นี่เฝ้าว่าจอต่อสายครบ และความเสี่ยงของรีวิวไม่กลับมา

test('⭐ 25/09 ขั้น ④: หัวเอกสารแบบขั้น ① → ใบที่อาจซ้ำ (บนสุด) → สิ่งที่ผู้อนุมัติจะตรวจ → รายการ → หลังกดส่ง', () => {
  const review = code(STEP_REVIEW);
  assert.match(review, /<DetailOverview\s+pin=\{false\}/, 'ฟอร์มที่มียามงานยังไม่บันทึกต้องไม่ลงทะเบียนแถบหัวลอย (ปุ่มกลับของแถบ = history.back)');
  let at = -1;
  for (const marker of ['<DetailOverview', 'id="hist-card-dup"', 'id="hist-card-check"', 'id="hist-card-lines"', 'id="hist-card-after"']) {
    const next = review.indexOf(marker);
    assert.ok(next > at, `ลำดับผิดที่ ${marker}`);
    at = next;
  }
  assert.match(review, /historicalReviewChecklist\(plan, \{ contractFiles, evidenceFileCount, todayIso \}\)/);
  assert.match(review, /historicalReviewFacts\(plan, \{ customerLabel, keyerName, orderNumber, vatLabel \}\)/);
  assert.match(review, /<WorkflowRail steps=\{rail\}/);
  assert.match(review, /historicalAfterSendRail\(plan, \{ keyerMode, orderNumber \}\)/);
  /* ลิงก์ใบที่อาจซ้ำเปิดแท็บใหม่ — ยามงานยังไม่บันทึกข้ามลิงก์ target=_blank ⇒ ฟอร์มไม่หาย */
  /* ⭐ มติ 26/09: ตารางใบที่อาจซ้ำเป็นตัวเดียวกับการ์ดหน้าใบ (HistoricalDuplicateTable) — ลิงก์แท็บใหม่ + "ตรงกันที่" อยู่ในตัวนั้น */
  assert.match(review, /<HistoricalDuplicateTable rows=\{dupes\} mode="keyer" \/>/);
  const table = code('components/salesPlanning/HistoricalDuplicateTable.js');
  assert.match(table, /href=\{orderHref\(id\)\} target="_blank" rel="noopener noreferrer"/);
  assert.match(table, /historicalMatchedOnText\(row\.matchedOn\)/, 'บอกว่าตรงกันที่ไหน (วันเริ่มสัญญา/เลขเอกสารเดิม)');
  /* ทุกแถวที่แก้ได้มีปุ่มพากลับไปขั้น + ช่องนั้น */
  assert.match(review, /onClick=\{\(\) => edit\(row\.step, row\.field\)\}/);
  assert.match(code(WIZARD), /onEditStep=\{\(key, field\) => \{ setStep\(key\); setFocusField\(field \|\| null\); \}\}/);
  /* 🚫 ของที่ถอด: "อนุมัติ: AE Sup" · ลำดับหลังบันทึกแบบรหัสฝ่าย · คำอธิบายจำนวน × เดือน (มติข้อ 4: บางรายการใช้ 2 แพ็คต่อเดือน) */
  assert.doesNotMatch(review, /AE Sup|historicalAfterSaveSteps|keyerIsReviewer|แพ็ค|monthsChip/);
});

test('⭐ 25/09 ขั้น ④: ทุกช่องที่แถวตรวจชี้ ต้องมีจุดยึดวาดอยู่บนขั้นนั้นจริง', () => {
  const plan = {
    header: { refs: {}, notes: 'x' }, contract: {}, lines: [], zeroValue: false, opening: null,
    installments: [{ label: 'ง', amount: 1, dueDate: '2026-10-01', coversFrom: '2026-01-01', coversTo: '2026-12-31' }],
    check: { sumMatches: false }, warningItems: [],
  };
  const rows = [
    ...reviewView.historicalReviewChecklist(plan, { contractFiles: { count: 0 } }),
    ...reviewView.historicalReviewChecklist({ ...plan, zeroValue: true }),
  ].filter((row) => row.field);
  /* ⚠️ จุดยึดต้องอยู่ **ในไฟล์ของขั้นที่แถวชี้** (รีวิวขั้น ④: ของเดิมรวมสามไฟล์ ⇒ แถวใบ ฿0 ชี้ขั้น ③ ที่ไม่วาดจุดยึดนั้นก็ผ่าน) */
  const fileOf = { contract: STEP_CONTRACT, zones: STEP_ZONES, money: STEP_MONEY };
  assert.ok(rows.length >= 8);
  for (const row of rows) {
    assert.ok(code(fileOf[row.step]).includes(`historicalFieldAnchorId("${row.field}")`),
      `${row.key} → ขั้น ${row.step} ช่อง ${row.field} ไม่มีจุดยึดบนขั้นนั้น (ปุ่ม "แก้ในขั้น" จะไม่ไปไหน)`);
  }
  /* ขั้น ③ ของใบ ฿0 วาดแค่กล่องแจ้ง — ไม่มีจุดยึด ⇒ แถวยอดใบ ฿0 ต้องชี้ขั้นอื่น */
  const zeroRow = rows.find((row) => row.key === 'zero');
  assert.notEqual(zeroRow.step, 'money');
});

test('🔴 25/09 ขั้น ④: ปุ่มหลักตัวเดียว — แผงบันทึกไม่มีปุ่มบันทึกตัวที่สอง (ของเดิม "บันทึกอีกครั้ง" ข้ามด่านใบซ้ำ)', () => {
  const wizard = code(WIZARD);
  const panel = slice(wizard, '{saving ? (', '<div className="form-action-bar is-page">');
  /* 🪤 รีวิวขั้น ④: `onClick={runSave}` (ไม่มีวงเล็บ) หลบยามแบบนับ `runSave()` ได้ ⇒ นับทุกการอ้างชื่อ */
  assert.doesNotMatch(panel, /\brunSave\b(?!Action)|tone="primary"|kind="submit"/);
  assert.match(panel, /historicalSaveResultView|saveResult\.action/);
  /* runSave: นิยาม 1 + เรียกจากปุ่ม "บันทึกและส่งอนุมัติ" ที่เดียว (หลังผ่านด่าน) */
  assert.equal((wizard.match(/\brunSave\b(?!Action)/g) || []).length, 2);
  const press = slice(wizard, '<ActionButton\n              kind="submit"', '/>');
  /* 🪤 รีวิวขั้น ④: `indexOf` ที่หาไม่เจอได้ -1 ซึ่ง "น้อยกว่า" ทุกตำแหน่ง ⇒ ถอดด่านทิ้งแล้วยามยังผ่าน — ต้องเจอก้อนด่านที่ return จริง */
  assert.match(press, /if \(gate\.gated\) \{[\s\S]*?dupSwitchRef\.current\?\.focus\(\);\s*return;\s*\}[\s\S]*runSave\(\);/,
    'ด่านใบซ้ำต้องมาก่อนการบันทึก และต้อง return ก่อนถึง runSave');
  assert.doesNotMatch(wizard, /historicalExitActions|setExit\(|styles\.splitRow/);
  /* รางแนวนอนซ่อนบรรทัดรอง (เลข SO · k/n ไฟล์) ที่จอ ≤1100px ⇒ แผงบันทึกใช้รางแนวตั้ง */
  assert.match(panel, /label="จังหวะของการบันทึก" \/>/);
  assert.doesNotMatch(panel, /orientation="row"/);
  /* ใต้สวิตช์ใบซ้ำพูดเรื่องใบซ้ำเท่านั้น — ข้อค้างของขั้นอื่นพาไปที่ช่องแทน */
  const gated = slice(wizard, 'if (gate.gated) {', 'dupSwitchRef.current?.scrollIntoView');
  assert.ok(gated.indexOf('setBlockedNote(gate.blockedNote)') > gated.indexOf('if (localIssues.length) {'));
});

test('🔴 25/09 ขั้น ④: "ออกจากฟอร์ม" — ว่าง = ลิงก์ (ยามถาม) · กำลังบันทึก = ปุ่มดับจริง ไม่ใช่ router.push · ยามคลุมตอนบันทึก', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /\{busy \? \(\s*<Button tone="neutral" variant="quiet" disabled>ออกจากฟอร์ม<\/Button>\s*\) : \(\s*<Button as=\{Link\} href=\{REGISTER_PATH\} tone="neutral" variant="quiet">ออกจากฟอร์ม<\/Button>\s*\)\}/);
  assert.doesNotMatch(wizard, />ยกเลิก<\/Button>/, '"ยกเลิก" อ่านเหมือนยกเลิกใบ');
  assert.equal((wizard.match(/router\.push\(/g) || []).length, 1, 'router.push ที่เดียวคือหลังส่งสำเร็จ (ยามจับ router.push ไม่ได้)');
  /* ผูกกับรอบบันทึก ไม่ใช่ busy — พรีวิวไม่เขียนอะไร ห้ามถามว่า "ใบจะค้างเป็นร่าง" (รีวิวขั้น ④ 25/09) */
  assert.match(wizard, /useUnsavedChanges\(dirty \|\| Boolean\(saveRun\), saveRun \? \{ message: "กำลังบันทึกอยู่ — ออกตอนนี้ใบจะค้างเป็นฉบับร่าง" \} : undefined\);/);
  assert.doesNotMatch(wizard, /useUnsavedChanges\(dirty \|\| busy/);
  /* 🐞 UAT 390px: แถบปุ่มแบบหน้า (sticky) ต้องยืนเหนือแถบเมนูล่างของมือถือ — ไม่งั้นปุ่มบันทึกถูกทับมองไม่เห็น */
  assert.match(code('app/globals.css'),
    /\.form-action-bar\.is-page \{\s*position: sticky;\s*bottom: calc\(12px \+ var\(--mobile-nav-h, 0px\) \+ env\(safe-area-inset-bottom\)\);/);
});

test('⭐ 25/09 ขั้น ④: ผู้คีย์ = ผู้ใช้ที่ล็อกอิน (ไม่ใช่ AE เจ้าของใบ) · ป้ายตีกลับไม่เรียก "AE Sup" · ชื่อไฟล์หลักฐานลงนามส่งลงไปครบ', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /keyerName=\{me\?\.name \|\| null\}/);
  assert.match(wizard, /keyerMode=\{historicalKeyerMode\(role\)\}/);
  assert.match(wizard, /title=\{`ตีกลับให้แก้ไข\$\{state\.rejection\.by \? ` — \$\{state\.rejection\.by\}` : ""\}`\}/);
  assert.doesNotMatch(wizard, /AE Sup/);
  const files = slice(wizard, 'const reviewContractFiles = {', '};');
  assert.match(files, /count: contractFileCount,/);
  assert.match(files, /panelContractItems \? panelContractItems\.map\(\(item\) => item\.fileName\) : \[\.\.\.hydratedContractNames, \.\.\.uploadedContractNames\.current\]/);
  /* 🐞 รีวิวขั้น ④: ไฟล์ที่ 2 ล้มหลังไฟล์แรกขึ้น — นับ/จำชื่อทีละไฟล์ที่ขึ้นจริง ไม่ใช่ตั้งพื้นหลังอัปครบทั้งชุด */
  const uploaded = slice(wizard, 'onUploaded: (file, ref) => {\n              uploadedContract', 'bump("contract");');
  assert.match(uploaded, /uploadedContractNames\.current = \[\.\.\.uploadedContractNames\.current, file\.name\];/);
  assert.match(uploaded, /setHydratedContractFiles\(\(current\) => \(current \|\| 0\) \+ 1\);/);
  assert.match(uploaded, /setPanelContractItems\(\(items\) => \(items/);
  /* ใบร่าง "ของรอบนี้" ลงฐานแล้วเท่านั้นที่ถูกเรียกว่าบันทึกแล้ว */
  assert.match(wizard, /orderNumber: progress\.persisted \? orderNumber : null,/);
  assert.match(wizard, /failed: saveFailure \? \{ orderNumber: saveFailure\.orderNumber, exit: saveFailure\.exit \} : null,/);
  assert.match(files, /pending: pendingContractNames,/);
  /* ไฟล์แรกที่แนบ = กติกาเดียวกับ server (createdAt ก่อน แล้ว id) */
  assert.match(wizard, /localeCompare\(String\(b\.createdAt \|\| ""\)\)\s*\|\| String\(a\.id \|\| ""\)\.localeCompare\(String\(b\.id \|\| ""\)\)/);
});

test('⭐ 25/09 ขั้น ④: ไฟล์ที่อัปไม่ขึ้นเอาออกจากตะกร้าได้ · โหลดใบล่าสุดถามก่อน · แผงล้มเลื่อนมาให้เห็น', () => {
  const wizard = code(WIZARD);
  const action = slice(wizard, 'const runSaveAction = useCallback(', '}, [saveFailure, reveal, state.orderId, orderId]);');
  assert.match(action, /const keep = \(file\) => fileKey\(file\) !== target\?\.key;/);
  assert.match(action, /if \(!\(await confirmAction\(/);
  assert.match(action, /flushSync\(\(\) => \{ setDirty\(false\); \}\);\s*window\.location\.assign\(path\);/);
  assert.match(code('lib/sales/historicalWizardUploads.js'), /key: file \? `\$\{file\.name\}:\$\{file\.size\}:\$\{file\.lastModified\}` : ''/,
    'คีย์ของไฟล์ที่ล้มต้องเป็นสูตรเดียวกับ fileKey ของฟอร์ม');
  assert.match(wizard, /const fileKey = \(file\) => `\$\{file\.name\}:\$\{file\.size\}:\$\{file\.lastModified\}`;/);
  assert.match(wizard, /node\?\.scrollIntoView\?\.\(\{ block: "center", behavior: "smooth" \}\);\s*node\?\.focus\?\.\(\{ preventScroll: true \}\);/);
  assert.match(wizard, /setSaveFailure\(null\);\s*progressRef\.current = null;\s*\}, \[\]\);/, 'แก้ฟอร์ม = แผงผลเก่าหาย');
});

// ── บันทึกใบซ้ำที่ผู้คีย์ยืนยัน (มติเจ้าของ 26/09) ─────────────────────────────────────────────────────────
//   ตรรกะตรึงที่ historicalDuplicates.test.mjs · ที่นี่เฝ้าว่าจอต่อสายครบ

test('⭐ 26/09 ใบซ้ำ: ยืนยันเป็นรายใบ — สวิตช์เปิด = id ที่เห็นตอนนั้น · พรีวิวใหม่ได้ใบเพิ่ม = สวิตช์ปิดเอง · body ส่งรายการ ไม่ใช่ธง', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /const \[ackIds, setAckIds\] = useState\(\[\]\);/);
  assert.match(wizard, /const acknowledged = duplicates\.length > 0 && historicalDuplicatesAcknowledged\(duplicates, \{ ids: ackIds \}\);/,
    '"ยืนยันแล้ว" คิดจากชุด id เทียบรายการตอนนี้ — ไม่ใช่ธงที่ค้างข้ามพรีวิว');
  assert.doesNotMatch(wizard, /setAcknowledged|acknowledgeDuplicates:/, 'ธงรุ่นเก่า (ผ่านกับรายการไหนก็ได้) ต้องไม่กลับมา');
  assert.match(slice(wizard, 'onAcknowledge={(next) => {', '}}'), /setAckIds\(next \? duplicates\.map\(\(row\) => row\.id\) : \[\]\);/);
  assert.match(wizard, /acknowledgedDuplicateIds: acknowledged \? ackIds : \[\],/);
  assert.match(wizard, /duplicateNote: acknowledged \? duplicateNote : "",/);
  /* แก้ฟอร์ม = รายการเดิมหมดอายุ ⇒ ชุดที่ยืนยันล้าง (สวิตช์ปิด) แต่ข้อความเหตุผลไม่หาย (state แยกจาก patch) */
  const patchFn = slice(wizard, 'const patch = useCallback(', '}, []);');
  assert.match(patchFn, /setAckIds\(\[\]\);/);
  assert.doesNotMatch(patchFn, /setDuplicateNote/);
});

test('⭐ 26/09 ใบซ้ำ: เปิดใบที่ถูกตีกลับมาแก้ — โชว์ "รอบก่อน …" + เติมเหตุผลเดิม แต่สวิตช์ไม่เปิดให้ (มติข้อ 3)', () => {
  const wizard = code(WIZARD);
  const hydrate = slice(wizard, 'setState(wizardStateFromOrder(order));', 'setContractId(');
  assert.match(hydrate, /const previous = historicalDuplicateReviewOf\(order\);/);
  assert.match(hydrate, /setPreviousReview\(previous\);/);
  assert.match(hydrate, /if \(previous\?\.note\) setDuplicateNote\(String\(previous\.note\)\);/);
  assert.doesNotMatch(hydrate, /setAckIds/, 'บันทึกรอบก่อนไม่เปิดสวิตช์ให้ — ต้องยืนยันใหม่ทุกครั้งที่บันทึก');
  const review = code(STEP_REVIEW);
  assert.match(review, /รอบก่อน: \$\{historicalDuplicateAckByline\(previousReview\)\} ยืนยัน/);
  /* ช่องเหตุผล: ขึ้นเมื่อเปิดสวิตช์ · ไม่บังคับ · เพดานเดียวกับ server · มีจุดยึดของช่อง duplicateNote (400 พามาที่นี่) */
  const note = slice(review, '{acknowledged ? (\n            <div className={styles.ackNote}', ') : null}');
  assert.match(note, /id=\{historicalFieldAnchorId\("duplicateNote"\)\}/);
  /* ⚠️ ไม่ใช้ maxLength ของเบราว์เซอร์ (นับคนละหน่วยกับ server) — ตัดด้วย code point ที่ handler · ตัวนับผูกกับช่อง */
  assert.doesNotMatch(note, /maxLength=/);
  assert.match(note, /aria-describedby="hist-dup-note-count"/);
  assert.match(note, /<small id="hist-dup-note-count">/);
  assert.match(note, /\{duplicateNoteError \? <small className=\{styles\.cellBad\} role="alert">\{duplicateNoteError\}<\/small> : null\}/,
    '400 ของช่องเหตุผลต้องขึ้นใต้ช่อง (เคยไม่มีที่ไหนแสดง)');
  assert.match(note, /ไม่บังคับ · ผู้อนุมัติเห็นข้อความนี้/);
  assert.match(review, /ผู้จัดการฝ่ายขายจะเห็นรายการนี้พร้อมชื่อคุณและเวลาตอนอนุมัติ/);
});

test('⭐ 26/09 ใบซ้ำ: ผู้อนุมัติเห็น — หน้าต่างอนุมัติได้ผลตรวจใหม่ + ลิงก์แท็บใหม่ · การ์ดหน้าใบต่อจากการ์ดโซน เฉพาะใบย้อนหลัง', () => {
  const page = code('app/sales-planning/sales-orders/[id]/page.js');
  const approve = slice(page, 'const openHistoricalApprove = (override = false) => {', 'overrideReason: override,');
  assert.match(approve, /duplicateCheck: order\.duplicateCheck \|\| null,/);
  /* 🪤 รีวิว 26/09: ลิงก์ไฟล์เอกสารแทนสัญญาข้างบนก็มี target/rel ⇒ ต้องเทียบในก้อนลิงก์ใบซ้ำเท่านั้น */
  const dupLinks = slice(approve, '{duplicateRows.map((row) => (', '))}');
  assert.match(dupLinks, /href=\{`\/sa\/sales-orders\/\$\{encodeURIComponent\(row\.id\)\}`\} target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /\{historical \? <HistoricalDuplicateReviewCard order=\{order\} duplicateCheck=\{order\.duplicateCheck \|\| null\} \/> : null\}/);
  assert.ok(page.indexOf('<HistoricalDuplicateReviewCard') > page.indexOf('<HistoricalZonesCard'), 'การ์ดต่อจากการ์ดโซน (มติข้อ 4)');
  const card = code('components/salesPlanning/HistoricalDuplicateReviewCard.js');
  assert.match(card, /if \(!view\.show\) return null;/, 'ไม่มีใบที่อาจซ้ำ = ไม่มีการ์ด');
  assert.match(card, /<HistoricalDuplicateTable rows=\{view\.rows\} mode="review" newTag=\{copy\.newTag\} \/>/);
  /* ของเสริมที่ล้มยังต้องพกช่องนี้ (null = ยังไม่รู้ ไม่ใช่ "ไม่มีใบซ้ำ") */
  const route = code('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(route, /liveTermWarnings: \[\], duplicateCheck: null,/);
});

test('🐞 26/09 ใบซ้ำ (รีวิว): เปลี่ยนการยืนยัน/เหตุผลหลังบันทึกค้างครึ่งทาง = บันทึกใบซ้ำ · เหตุผลตัดด้วย code point · 400 ของช่องขึ้นใต้ช่อง', () => {
  const wizard = code(WIZARD);
  const ack = slice(wizard, 'onAcknowledge={(next) => {', '}}');
  assert.match(ack, /progressRef\.current = null;/, 'รอบใหม่เริ่มที่ "บันทึกใบ" ⇒ บันทึกการยืนยันถูกเขียนใหม่');
  assert.match(ack, /setSaveFailure\(null\);/);
  const note = slice(wizard, 'onDuplicateNote={(value) => {', '}}');
  assert.match(note, /setDuplicateNote\(historicalDuplicateNoteClamp\(value\)\);/);
  assert.match(note, /setIssues\(\(current\) => current\.filter\(\(issue\) => issue\.field !== "duplicateNote"\)\);/);
  assert.match(note, /progressRef\.current = null;/);
  assert.match(wizard, /duplicateNoteError=\{stepIssues\("review"\)\.find\(\(issue\) => issue\.field === "duplicateNote"\)\?\.message \|\| null\}/);
  /* การ์ดหน้าใบ: ถ้อยคำจากตัวตัดสิน (สถานะบันทึก × สถานะใบ) ไม่ใช่สตริงในการ์ด */
  const card = code('components/salesPlanning/HistoricalDuplicateReviewCard.js');
  assert.match(card, /const copy = historicalDuplicateCardCopy\(view, \{ status: order\?\.status \}\);/);
  assert.doesNotMatch(card, /ก่อนอนุมัติ/, 'คำว่า "ก่อนอนุมัติ" อยู่ในตัวตัดสิน (เฉพาะใบที่รออนุมัติ) เท่านั้น');
});

