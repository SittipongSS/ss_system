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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as intakeForm from './historicalIntakeForm.js';
import * as historicalOrders from './historicalOrders.js';
import * as orderCopy from './historicalOrderCopy.js';
import { HISTORICAL_NEW_PATH } from './historicalOrders.js';

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
  for (const file of [WIZARD, STEP_ZONES]) {
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
  assert.match(src, /const stage = nextSaveStage\(progress\);/);
  assert.match(src, /progress = saveProgressAfter\(progress, stage/);
  assert.match(src, /window\.history\.replaceState\(null, "", historicalEditPath\(orderRowId\)\)/);
  assert.match(src, /uploadedContract\.current\.set\(fileKey\(file\), ref\)/);
  assert.match(src, /uploadedEvidence\.current\.set\(fileKey\(file\), ref\)/);
  assert.match(src, /ref: uploadedContract\.current\.get\(fileKey\(file\)\) \|\| null/);
  assert.match(src, /ref: uploadedEvidence\.current\.get\(fileKey\(file\)\) \|\| null/);
  assert.match(src, /notifyToast\.success\(/, 'ผลสำเร็จต้องเป็น toast ระดับแอป (อยู่รอดข้ามการเปลี่ยนหน้า)');
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
  assert.match(src, /const rail = historicalWizardRail\(state, \{ step, localIssues, serverIssues: issues, plan, customerLabel \}\);/);
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
  const goTo = slice(src, 'const goToStep = useCallback', '}, [step, runPreview, localIssues]);');
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
  for (const field of fields) {
    assert.ok(drawn.has(intakeForm.historicalFieldAnchorId(field)),
      `ช่อง "${field}" ไม่มีจุดยึดบนจอ — ปุ่มที่ติดด่านจะพาไปไม่ถึง`);
  }
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
  assert.match(wizard, /zeroValue: Boolean\(plan\?\.zeroValue\)/, 'คำถามงวดยกมาต้องดับตามธงของแผน');
  assert.match(code(STEP_MONEY), /const zeroValue = Boolean\(plan\?\.zeroValue\);/, 'ช่องบนจออ่านธงตัวเดียวกัน');
  assert.match(wizard, /historicalTeamField\(\{ ownerTeams, sharedTeams, locked: Boolean\(state\.orderId\) \}\)/);
  assert.match(wizard, /teamOptions=\{teamField\.options\}/);
  assert.match(wizard, /lockedTeam=\{teamField\.lockedTeam\}/);
  const contract = code(STEP_CONTRACT);
  assert.match(contract, /\{lockedTeam \? \(/, 'เหลือทีมเดียว = ช่องล็อกที่เห็นได้ ไม่ใช่เงียบ');
  assert.match(contract, /teams=\{teamOptions\}/, 'ชิปทีมต้องมาจากชุดตัวเลือกชุดเดียวกับคำถาม');
});

/* 🪤 ทะเบียนไซต์เป็นของฝ่าย TS — ขอเฉพาะไซต์ที่ยังใช้งาน แต่โซนที่ปิดใช้งานต้องเห็นแบบกดไม่ได้
   🐞 **รีวิว R10 (23/09)**: ของเดิม `disabled={busy || inactive}` ปิด **การถอนติ๊ก** ของแถวที่ใบ
      ผูกไว้อยู่แล้วด้วย ⇒ TS ปิดโซนระหว่างที่ใบถูกตีกลับ = ถอดโซนออกจากใบไม่ได้ · พรีวิวตีกลับ
      ทุกครั้ง · `บันทึก` ไปไม่ถึง ⇒ ใบนั้นแก้ไม่ได้อีกเลยจนกว่าอีกฝ่ายจะเปิดโซนคืน
      (และข้อความของ server ที่บอกว่า "หรือเลือกโซนอื่น" ทำตามไม่ได้ เพราะสลับต้องถอนติ๊กก่อน)
   ⇒ **ถอนติ๊กได้เสมอ ติ๊กใหม่ไม่ได้** · ห้ามถอยกลับไปเป็น `disabled={busy || inactive}` */
test('⭐ ขั้นโซนขอ includeInactive=0 · โซนที่ปิดใช้งานติ๊กใหม่ไม่ได้ แต่ถอนติ๊กออกได้เสมอ', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /includeInactive=0/);
  assert.match(src, /const inactive = zone\.isActive === false;/);
  assert.match(src, /disabled=\{busy \|\| \(inactive && !row\)\}/,
    'แถวที่ใบผูกไว้แล้ว (row) ต้องถอนติ๊กออกได้ ไม่งั้นทางตัน R10 กลับมา');
  assert.doesNotMatch(src, /disabled=\{busy \|\| inactive\}/);
  assert.match(src, /ถอนติ๊กออกได้/, 'ป้ายของแถวที่เลือกไว้ต้องบอกว่าถอดออกได้ ไม่ใช่ "เลือกไม่ได้"');
  assert.ok(!/จุด</.test(src), 'payload ของโซนไม่มีจำนวนจุด — ห้ามเดาเลขมาโชว์');
});

/* 🔴 รีวิว R10 อีกครึ่ง: `includeInactive=0` (และไซต์ที่ถูกโอนไปลูกค้ารายอื่น · โซนที่ถูกลบ)
   ทำให้แถวของโซนที่ใบผูกไว้ **ไม่ถูกเรนเดอร์เลยสักแถว** ⇒ ตัวติ๊กซึ่งเป็นทางเดียวที่ถอดแถวออก
   จาก `state.zones` ได้ ไม่มีอยู่บนจอ ⇒ `state.zones` ลดลงไม่ได้ไม่ว่าด้วยเหตุใด
   ⇒ ต้องมีก้อน "โซนกำพร้า" พร้อมปุ่มถอดของตัวเอง (ตัวตัดสินอยู่ที่ historicalZoneBrowser.orphans) */
test('⭐ โซนที่ใบผูกไว้แต่ทะเบียนไม่มีให้เห็น ต้องมีปุ่มถอดออกจากใบของตัวเอง', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /browser\.orphans/, 'จอต้องอ่านโซนกำพร้าจากตัวตัดสิน ไม่ใช่คิดเอง');
  assert.match(src, /ถอดโซนนี้ออกจากใบ/, 'ต้องมีปุ่มถอดจริง ไม่ใช่แค่ข้อความบอกว่ามีปัญหา');
  assert.match(src, /setRows\(rows\.filter\(\(row\) => row\.zoneId !== zoneId\)\)/);
  assert.match(src, /ready: !loading && !loadError/,
    'ระหว่างโหลด/โหลดพัง ยังตัดสินไม่ได้ว่าโซนไหนกำพร้า — ไม่งั้นทุกโซนขึ้นแดงชั่วครู่');
  assert.ok(typeof intakeForm.historicalZoneBrowser({}).orphans !== 'undefined',
    'historicalZoneBrowser ต้องคืน orphans จริง ๆ');
});

/* 🐞 UAT 23/09 บนของจริง (AR-374 · 26 ไซต์ 43 โซน) — ของเดิมพังสามทางที่ยามแบบนี้เฝ้าได้:
     ① `Promise.all(siteRows.map((site) => apiJson(...)))` = ไซต์เดียวพัง **ลิสต์ว่างทั้งจอ**
     ② ไม่มีช่องค้น ③ กางการ์ดทุกใบรวด
   ตรรกะของ ②③ ถูกตรึงที่ historicalIntakeForm.test.mjs (historicalZoneBrowser) — ที่นี่เฝ้า
   ว่า **จอยังต่อสายไปหามันอยู่** และขาโหลดยังเป็นแบบพังทีละไซต์ */
test('⭐ ขั้นโซนโหลดทีละไซต์แบบพังทีละใบ — ไซต์ที่พังมีปุ่มลองอีกครั้งของตัวเอง', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /const loadSiteZones = useCallback\(async \(site\) => \{/);
  assert.match(src, /return \{ id: site\.id, zones: \[\], error: /,
    'ขาโหลดรายไซต์ต้องคืน error เป็นข้อมูล ไม่ใช่ throw (throw = ล้มทั้งก้อน)');
  assert.match(src, /Promise\.all\(siteRows\.map\(loadSiteZones\)\)/);
  assert.doesNotMatch(src, /Promise\.all\(siteRows\.map\(\(site\) => apiJson/,
    'ยิงดิบใน Promise.all = ไซต์เดียวพังแล้วทั้งลิสต์ว่าง (บั๊กเดิม)');
  assert.match(src, /const retrySite = useCallback\(async \(site\) => \{/);
  assert.match(src, /onClick=\{\(\) => retrySite\(site\)\}/);
  assert.match(src, /setSiteErrors\(\(current\) => \(\{ \.\.\.current, \[site\.id\]: result\.error \|\| undefined \}\)\)/);
});

test('⭐ ขั้นโซนมีช่องค้น (ปิด autoComplete) และการ์ดไซต์พับได้ด้วย primitive กลาง', () => {
  const src = code(STEP_ZONES);
  const searchField = slice(src, 'ค้นหาไซต์หรือโซน</span>', '</div>');
  assert.match(searchField, /autoComplete="off"/, 'กฎบ้าน: ช่องค้นทุกช่องปิด autoComplete');
  assert.match(searchField, /value=\{query\}/);
  assert.match(searchField, /aria-label="ค้นหาไซต์หรือโซนของลูกค้ารายนี้"/);
  assert.match(src, /historicalZoneBrowser\(\{\s*sites, zonesBySite, siteErrors, query, pickedZoneIds: rows\.map\(\(row\) => row\.zoneId\)/,
    'ค้น/ซ่อน/กาง ต้องมาจากตัวตัดสินที่ตรึงไว้ ไม่ใช่ filter ใน JSX');
  assert.match(src, /import CollapsibleCard from "@\/components\/ui\/CollapsibleCard"/);
  assert.match(src, /<CollapsibleCard/);
  assert.match(src, /open=\{open\}/);
  assert.match(src, /const open = openSites\[site\.id\] \?\? defaultOpen;/,
    'ค่าตั้งต้นของการพับมาจากตัวตัดสิน · ที่ผู้ใช้กดเองทับได้');
});

/* 🐞 UAT 23/09: ปุ่มลัดยอดโซนกดได้ตลอดแล้วเงียบเมื่อคิดยอดไม่ได้ (กฎบ้าน: ติดด่าน = โชว์แล้วบอกเหตุ) */
test('⭐ ปุ่มลัดยอดโซนติดด่านแล้วบอกเหตุจากตัวตัดสินตัวเดียวกับที่คิดยอด', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /zoneAmountSuggestionNote\(\{ \.\.\.suggestInput\(row\), monthsPartial: Boolean\(spanNote\) \}\)/);
  /* 🐞 รีวิว R9: ทะเบียนสินค้าโหลดไม่ขึ้น ⇒ ไม่มีราคาต่อหน่วย ⇒ เหตุที่ขึ้นคือ "แพ็คเกจนี้ไม่มี
     ราคาต่อหน่วยในทะเบียน" ซึ่งเป็นคำตอบที่ผิด · เหตุจริงต้องชนะก่อน */
  assert.match(src, /productsError && row\.productId && !productsById\.has\(row\.productId\)/,
    'โหลดทะเบียนไม่ขึ้น ต้องพูดคนละคำกับ "แพ็คเกจนี้ไม่มีราคา"');
  assert.match(src, /disabled=\{busy \|\| Boolean\(blocked\)\}/);
  assert.match(src, /title=\{blocked \|\| "ราคาแพ็คเกจ × แพ็ค × เดือน"\}/);
  assert.match(src, /\{blocked \? <span className=\{styles\.cellSub\}>\{blocked\}<\/span> : null\}/);
});

/* 🐞 UAT 23/09 (ข้อมูลหาย): สลับลูกค้าล้างแค่โซน แล้วทิ้งงวดที่คิดจากโซนชุดนั้นไว้ — เงียบด้วย
   ⇒ ทั้งคำถามและของที่ล้างต้องมาจาก `historicalDownstreamReset` ตัวเดียว */
test('⭐ เปลี่ยนลูกค้า/โหมด VAT ถามก่อนด้วย ConfirmDialog แล้วล้างปลายน้ำเป็นก้อนเดียว', () => {
  const src = code(STEP_CONTRACT);
  assert.match(src, /import \{ confirmAction \} from "@\/components\/ui\/ConfirmDialog"/);
  assert.match(src, /const reset = historicalDownstreamReset\(state, field\);/);
  assert.match(src, /if \(reset\.ask\) \{/);
  assert.match(src, /confirmAction\(\{/);
  assert.match(src, /patch\(\{ \.\.\.next, \.\.\.reset\.patch \}\);/,
    'ล้างด้วย patch ก้อนที่ตัวตัดสินคืนมา ไม่ใช่รายการที่เขียนมือใน JSX');
  assert.match(src, /changeUpstream\("customer", \{ customerId: value \}\)/);
  assert.match(src, /changeUpstream\("vat", next\)/);
  assert.doesNotMatch(src, /zones: \[\], packageProductId: ""/,
    'ล้างมือใน JSX = ลืมงวดอีกครั้ง (บั๊กเดิม)');
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
  assert.match(code(WIZARD), /zeroValue: Boolean\(plan\?\.zeroValue\), todayIso,/,
    'กฎ "ไม่เกินวันนี้" ต้องได้นาฬิกาไทยของหน้า ไม่งั้นเงียบทั้งชุด');
});

/* ป้าย "N เดือน" เคยปัดเศษลง ⇒ ปุ่มลัดเสนอยอดขาดไปทั้งเดือน (ดู contractMonths)
   🐞 ยามตัวนี้เคยไล่แค่ขั้น ①–② ⇒ **ขั้น ④ หลุดออกมา** แล้วเรียก `contractMonths` ตรง ๆ อยู่
      ⇒ ช่วงที่ไม่ลงตัวเป็นเดือน: ขั้น ①–③ บอกว่ายังไม่รู้ แต่แผ่นตรวจพิมพ์ "N เดือน" ให้เลย
      ⇒ ทุกขั้นที่ถามระยะสัญญาต้องอยู่ในลิสต์นี้ ไม่ใช่เฉพาะขั้นที่นึกออกตอนเขียนยาม */
test('⭐ ป้ายระยะสัญญาอ่านจาก contractSpan — ช่วงที่ไม่ลงตัวเป็นเดือนต้องบอกเหตุ', () => {
  for (const file of [STEP_CONTRACT, STEP_ZONES, STEP_MONEY, STEP_REVIEW]) {
    const src = code(file);
    assert.match(src, /contractSpan\(/, file);
    assert.doesNotMatch(src, /contractMonths\(/, `${file} ต้องไม่เรียกตัวเดือนดิบ (ไม่มีช่องบอกเหตุ)`);
  }
  assert.match(code(STEP_CONTRACT), /\|\| spanNote/);
  assert.match(code(STEP_ZONES), /\(spanNote \|\| "กรอกวันสัญญาในขั้น ① ก่อน"\)/);
  assert.match(code(STEP_MONEY), /\{spanPartial/);
  assert.match(code(STEP_REVIEW), /months \? ` · \$\{fmtNumber\(months\)\} เดือน` : \(spanNote \? ` · \$\{spanNote\}` : ""\)/,
    'ขั้น ④ ต้องพูดเหตุเดียวกัน ไม่ใช่เว้นว่างเมื่อช่วงไม่ลงตัวเป็นเดือน');
});

// ── 6. ด่านใบซ้ำ — ส่วนที่ยามแบบนี้เฝ้าได้ (ที่เหลืออยู่ใน historicalIntakeForm.test.mjs) ──

test('⭐ ฟอร์มตัดสินด่านใบซ้ำและทางออกด้วยตัวตัดสินที่ตรึงไว้ ไม่ใช่เงื่อนไขในวงเล็บของ JSX', () => {
  const src = code(WIZARD);
  assert.match(src, /const gate = historicalDuplicateGate\(\{ duplicates, acknowledged, warnings: plan\?\.warnings, localIssues \}\);/);
  assert.match(src, /historicalSaveFailureState\(historicalSaveExit\(saveError\)\)/);
  assert.match(src, /historicalExitActions\(exit\)\.map\(/,
    'ปุ่มทางออกต้องมาจากตัวตัดสิน ไม่ใช่ {exit.canX && (…)} ที่ถอดทีละอันได้เงียบ ๆ');
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
  assert.match(src, /\{historicalFootNote\(\{ step, gate \}\)\}/);
  assert.doesNotMatch(src, /ส่งให้ AE Sup อนุมัติทันทีที่บันทึก/,
    'ประโยคของขั้นที่บันทึกจริง ห้ามยืนอยู่บนขั้นที่ยังไม่บันทึกอะไร');
  assert.match(src, /label=\{busy \? "กำลังบันทึก…" : HISTORICAL_SAVE_BUTTON_LABEL\}/);

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
  'components/salesPlanning/historicalWizard/CoverageTimeline.js',
  NEW_PAGE,
  EDIT_PAGE,
];

test('⭐ ทุกชื่อที่ขั้นต่าง ๆ import จาก lib ของสายนี้ ต้องมี export อยู่จริง', () => {
  const modules = {
    '@/lib/sales/historicalIntakeForm': intakeForm,
    '@/lib/sales/historicalOrders': historicalOrders,
    '@/lib/sales/historicalOrderCopy': orderCopy,
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
  assert.match(wizard, /total=\{money\.ok \? fmtMoney\(money\.totalAmount\) : NA\}/,
    'การ์ด "สรุปใบ" เคยขึ้นขีดตลอดรอบคีย์');
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
  assert.match(money, /historicalInstallmentSum\(state, total\)/,
    'ยังไม่มีแผน = ยังต้องมีผลรวมงวด/ส่วนต่างให้ผู้คีย์เล็ง');
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
   ⇒ ตรรกะตรึงที่ historicalIntakeForm.test.mjs · ที่นี่เฝ้าว่า **กองที่ยังตัดสินไม่ได้ไม่มีปุ่มถอด** */
test('⭐ N1: ก้อน "ยังอ่านทะเบียนไม่ได้" มีแต่ปุ่มลองอ่านใหม่ — ปุ่มถอดอยู่กับโซนกำพร้าเท่านั้น', () => {
  const src = code(STEP_ZONES);
  assert.match(src, /browser\.unresolved/, 'จอต้องอ่านกองที่ยังตัดสินไม่ได้จากตัวตัดสิน ไม่ใช่คิดเอง');
  const unresolvedBlock = slice(src, 'browser.unresolved.length > 0', 'browser.orphans.length > 0');
  assert.doesNotMatch(unresolvedBlock, /ถอดโซนนี้ออกจากใบ/,
    'ยังอ่านทะเบียนไม่ได้ = ยังไม่รู้ว่าหายจริง ⇒ ห้ามมีปุ่มถอด (ปุ่มนั้นลบบรรทัดจริง)');
  assert.doesNotMatch(unresolvedBlock, /setRows\(/, 'ก้อนนี้ห้ามแตะ state.zones เลย');
  assert.match(unresolvedBlock, /ยังอ่านทะเบียนไม่ได้/, 'ต้องบอกเหตุจริง ไม่ใช่เงียบ');
  assert.match(unresolvedBlock, /onClick=\{retryFailedSites\}/, 'ทางออกเดียวคือลองอ่านไซต์ที่พังใหม่');
  assert.match(src, /const retryFailedSites = \(\) => \{/);
  assert.match(src, /for \(const row of browser\.rows\) if \(row\.error\) retrySite\(row\.site\);/,
    'ปุ่มนี้ต้องยิงขาโหลดรายไซต์ตัวเดิม ไม่ใช่รีโหลดหน้า');
  /* ปุ่มถอดยังต้องอยู่กับกองกำพร้าจริง (ทางตัน R10 ห้ามกลับมา) */
  const orphanBlock = slice(src, 'browser.orphans.length > 0', 'styles.sumBar');
  assert.match(orphanBlock, /ถอดโซนนี้ออกจากใบ/);
  assert.notEqual(typeof intakeForm.historicalZoneBrowser({}).unresolved, 'undefined',
    'historicalZoneBrowser ต้องคืน unresolved จริง ๆ');
});

/* 🐞 **N4** — ก้อน "โหลดทะเบียนไม่สำเร็จ" เคยมีปุ่ม `window.location.reload()` ทั้งที่ฟอร์มนี้
   ติด `useUnsavedChanges` อยู่ ⇒ ผู้คีย์ที่พิมพ์อะไรไว้แล้วกดปุ่มนั้นเจอโมดัลของเบราว์เซอร์
   "ออกจากหน้านี้ไหม" และถ้ากดออก **ของที่คีย์ไว้หายทั้งใบ** เพื่อแก้เรื่องที่แค่ยิงสองเส้นใหม่ก็จบ */
test('⭐ N4: ทางออกของ "โหลดทะเบียนไม่สำเร็จ" คือยิงใหม่ที่เดิม ไม่ใช่รีโหลดหน้า', () => {
  const wizard = code(WIZARD);
  assert.match(wizard, /useUnsavedChanges\(dirty && !busy\)/,
    'ยามงานที่ยังไม่บันทึกถูกติดไว้จริง — นี่คือเหตุที่การรีโหลดหน้าเป็นทางตัน');
  assert.doesNotMatch(wizard, /window\.location\.reload/,
    'รีโหลดหน้าชนยามของฟอร์มเอง ⇒ ผู้คีย์เสี่ยงเสียของที่พิมพ์ไว้ทั้งใบ');
  assert.match(wizard, /const reloadRegistries = useCallback\(/);
  assert.match(wizard, /onClick=\{reloadRegistries\}/);
  assert.match(wizard, /\}, \[registryRound\]\);/, 'เส้นทะเบียนลูกค้าต้องยิงใหม่ตามรอบ');
  assert.match(wizard, /\}, \[customerId, registryRound\]\);/, 'เส้นทะเบียนสินค้าต้องยิงใหม่ตามรอบ');

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
  const review = code(STEP_REVIEW);
  const filesCell = slice(review, '<dt>ไฟล์</dt>', '<dt>อ้างอิงเดิม</dt>');
  assert.match(filesCell, /contractFileCount === null/, 'null ต้องเป็นสาขาของตัวเอง');
  assert.ok(filesCell.includes('ยังไม่แนบ'), 'สาขา 0 (รู้แล้วว่าไม่มี) ต้องยังพูดว่ายังไม่แนบ');
  assert.ok(
    filesCell.indexOf('contractFileCount === null') < filesCell.indexOf('ยังไม่แนบ'),
    'สาขา "ยังไม่รู้" ต้องมาก่อน ⇒ null ไม่ตกไปที่ "ยังไม่แนบ"',
  );
  assert.match(filesCell, /contractFileCount \? `แนบแล้ว/, '0 กับ null ต้องแยกกันจริง');
  assert.match(code(WIZARD), /contractFileCount=\{contractFileCount\}/,
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

  /* สามช่องเลือกที่ `emptyText` อ่านเป็น "คำตอบ" — ต้องพูดคนละคำเมื่อเหตุคนละเหตุ */
  assert.match(code(STEP_CONTRACT), /emptyText=\{customersError \? REGISTRY_LOAD_FAILED : undefined\}/);
  const zones = code(STEP_ZONES);
  assert.match(zones, /emptyText=\{productsError\s*\n?\s*\? REGISTRY_LOAD_FAILED/);
  assert.match(zones, /emptyText=\{productsError \? REGISTRY_LOAD_FAILED : undefined\}/,
    'ช่องแพ็คเกจรายแถวเคยไม่มี emptyText เลย ⇒ ตกไปที่ "ไม่พบรายการ" ของตัวห่อ');
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
  for (const file of [STEP_CONTRACT, STEP_ZONES, STEP_MONEY, STEP_REVIEW]) {
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
  assert.match(money, /noteOf\("opening\.coversTo"\)\s*\n?\s*\|\| `ต้องอยู่ในช่วงสัญญา/,
    'ช่อง "ครอบบริการ ถึง" ของงวดยกมา: เหตุจากพรีวิวก่อน แล้วตกไปที่กฎช่วงสัญญา');
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
