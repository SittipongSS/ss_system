// ── จอของขนาดแพ็คเกจ (PR-P ส่วนจอ · mig 0398 · มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") — ด่านที่อ่านซอร์ส ─────────
//
// ⭐ ตัวตัดสินล้วนมีเทสต์ด้วยข้อมูลแล้ว (`packageSizes` · `packageSizeForm` · `surveyDecision`) — ไฟล์นี้ตรึง **การต่อสาย**
//   ที่เทสต์ข้อมูลมองไม่เห็น: จอถามตัวตัดสินจริงไหม · ฟอร์มเพิ่ม/แก้เป็นใบเดียวไหม · ขนาดเป็นแถบที่เห็นครบไม่ใช่ดรอปดาวน์ ·
//   ปุ่มแก้ทะเบียนมาจากสิทธิ์ที่ server ตอบ · ไม่มีจอไหนพูดถึง "สูตร" ที่ถอดไปแล้ว
// ⚠️ ชุดนี้ห้ามเปิดแอปกับฐานจริง ⇒ ด่านพวกนี้คือสิ่งเดียวที่ยืนยันการต่อสายก่อน UAT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ออกก่อนตรวจ "ต้องไม่มี" — คอมเมนต์เล่าประวัติ ("แทนสูตร N เดิม") ได้ โค้ดที่วาดจริงห้ามมี */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = read('app/database/package-sizes/page.js');
const MODAL = read('components/service/PackageSizeModal.js');
const TABLE = read('components/service/SurveyResultTable.js');
const PAGE_CSS = read('app/database/package-sizes/page.module.css');
const TABLE_CSS = read('components/service/SurveyResultTable.module.css');

// ── /database/package-sizes ─────────────────────────────────────────────
test('หน้าทะเบียน = ListPanel ใบเดียว: หัว → แถบเครื่องมือ (prop) → ตาราง → Pager ในแผง', () => {
  assert.match(PAGE, /<ListPanel[\s\S]*?toolbar=\{toolbar\}/);
  assert.match(PAGE, /count=\{loading \|\| loadError \? null : /, 'ระหว่างโหลด/โหลดพัง = ขีด ไม่ใช่ "0 ขนาด"');
  const panel = PAGE.slice(PAGE.indexOf('<ListPanel'), PAGE.indexOf('</ListPanel>'));
  assert.match(panel, /<TableScroll/);
  assert.match(panel, /<Pager/);
  assert.doesNotMatch(panel, /<PackageSizeModal|<ConfirmDialog|<Toast/, 'โมดัล/กล่องยืนยัน/Toast อยู่นอกเนื้อแผง');
  // หัวตารางตามสเปก §6
  for (const head of ['รหัส', 'ชื่อเต็ม', 'ขนาดพื้นที่', 'หมายเหตุ', 'แก้ไขล่าสุด']) assert.match(panel, new RegExp(`<th>${head}</th>`));
});

test('⭐ ตัวกรองเป็นแถบที่เห็นครบสามตัวพร้อมจำนวน — ไม่ใช่ดรอปดาวน์', () => {
  assert.match(PAGE, /<Segmented className=\{styles\.filterSeg\} ariaLabel="กรองตามวิธีเลือกขนาด" value=\{filter\} onChange=\{setFilter\} options=\{filters\}/);
  // 🐞 UAT 01/10 (จอ 390): ตัวเลือกที่สามถูกตัดที่ขอบ ป้ายจำนวนหาย ⇒ แถบห่อบรรทัดได้ ไม่เลื่อนข้าง
  assert.match(PAGE_CSS, /\.filterSeg:global\(\.segmented\) \{ flex-wrap: wrap; max-inline-size: 100%; \}/);
  assert.match(PAGE, /packageSizeFilterOptions\(loading \|\| loadError \? null : sizes\)/, 'ยังไม่รู้จำนวน = ไม่มีป้าย ไม่ใช่ศูนย์');
  assert.doesNotMatch(code(PAGE), /<select|<Select|SearchableSelect/);
});

test('🔑 สิทธิ์แก้มาจาก server (`canEdit` ของ GET) — จอไม่เดา role เอง · ไม่มีสิทธิ์ = ไม่มีปุ่มเพิ่ม ไม่มีคอลัมน์จัดการ', () => {
  assert.match(PAGE, /setCanEdit\(data\?\.canEdit === true\)/);
  assert.doesNotMatch(code(PAGE), /canManagePackageSizes|canSendSurveyResult|useUser|\.role\b/, 'จอห้ามตัดสินสิทธิ์จาก role เอง');
  assert.match(PAGE, /headerRight=\{canEdit \? \(/);
  assert.match(PAGE, /\{canEdit && <th aria-label="จัดการ" \/>\}/);
  assert.match(PAGE, /\{canEdit && \(\s*<td data-actions="1">/);
});

/* 🐞 UAT PR-P 01/10 — <td> ที่เป็น flex เลิกเป็นเซลล์ตาราง ⇒ เส้นคั่นแถวขาด/เหลื่อมใต้คอลัมน์จัดการทุกแถว */
test('🔴 คอลัมน์จัดการ: flex อยู่ที่กล่องในเซลล์ ไม่ใช่ที่ <td> — เส้นคั่นแถวต้องต่อกันตลอด', () => {
  assert.doesNotMatch(code(PAGE), /<td[^>]*className=\{styles\.actions\}/);
  assert.match(PAGE, /<td data-actions="1">[\s\S]*?<div className=\{styles\.actions\}>/);
});

/* 🐞 UAT PR-P 01/10 — ตาราง 760px ในกล่องที่แคบกว่า: ที่ 768 ปุ่มแก้ไขถูกตัด เมนู "…" หลุดจอ · ที่ 390 เห็นสามคอลัมน์แรก */
test('🔴 กล่องแคบกว่าตาราง = แถวเรียงเป็นป้าย/ค่า (ตัดสินจากความกว้างของกล่อง) — ทุกเซลล์มีป้ายของตัวเอง', () => {
  assert.match(PAGE, /<TableScroll minWidth=\{canEdit \? 760 : 640\} cells="stacked" className=\{styles\.shell\}>/);
  assert.match(PAGE_CSS, /\.shell \{ container-type: inline-size; \}/);
  assert.match(PAGE_CSS, /@container \(max-width: 759px\) \{/);
  assert.match(PAGE_CSS, /content: attr\(data-label\);/);
  for (const label of ['รหัส', 'ชื่อเต็ม', 'ขนาดพื้นที่', 'หมายเหตุ', 'แก้ไขล่าสุด']) assert.match(PAGE, new RegExp(`<td data-label="${label}"`));
  assert.doesNotMatch(code(PAGE), /<table[^>]*role=/, 'ไม่ใส่ role ทับ <table> (ด่าน audit:ui)');
});

test('เป้านิ้ว 44px บนจอสัมผัส: เพิ่มขนาด · แก้ไข · เมนู "…" · ลองใหม่ · ตัวกรอง — ผูกกับชนิดตัวชี้ ไม่ใช่ความกว้างจอ', () => {
  const coarse = PAGE_CSS.slice(PAGE_CSS.indexOf('@media (pointer: coarse)'));
  assert.match(coarse, /\.touch:global\(\.btn\.sm\) \{ min-height: var\(--ctl-h-touch\); \}/);
  assert.match(coarse, /\.touchMenu :global\(\.btn-icon\) \{ width: var\(--ctl-h-touch\); height: var\(--ctl-h-touch\); \}/);
  assert.match(coarse, /\.filterSeg:global\(\.segmented\) > button \{ min-height: var\(--ctl-h-touch\); \}/);
  assert.equal((PAGE.match(/className=\{styles\.touch\}/g) || []).length, 3, 'เพิ่มขนาด · ลองใหม่ · แก้ไข');
  assert.match(PAGE, /<RowActionMenu\s+className=\{styles\.touchMenu\}/);
});

test('⭐ เพิ่มกับแก้เปิดฟอร์มใบเดียว (กฎ AGENTS.md) — หน้านี้วาด PackageSizeModal ครั้งเดียว โหมดมาจากแถวที่ส่ง', () => {
  assert.equal((PAGE.match(/<PackageSizeModal/g) || []).length, 1);
  assert.match(PAGE, /size=\{editing\?\.code \? editing : null\}/);
  assert.match(PAGE, /onClick=\{\(\) => setEditing\(\{\}\)\}/, 'ปุ่มเพิ่ม');
  assert.match(PAGE, /onClick=\{\(\) => setEditing\(size\)\}/, 'ปุ่มแก้ไข');
  assert.match(PAGE, /method: isNew \? "POST" : "PATCH"/);
  assert.match(PAGE, /`\/api\/service\/package-sizes\/\$\{encodeURIComponent\(editing\.code\)\}`/);
});

test('⭐ ลบ = กล่องยืนยันที่บอกผล (กี่ใบกระทบ) จากตัวตัดสิน · ขนาดสุดท้ายโชว์ปุ่มแล้วบอกเหตุ', () => {
  assert.match(PAGE, /packageSizeDeleteConfirm\(removing, \{ usage, sizes, canEdit \}\)/);
  assert.match(PAGE, /<ConfirmDialog[\s\S]*?message=\{removeView\?\.message\}[\s\S]*?detail=\{removeView\?\.detail \|\| undefined\}/);
  // เลขที่ใบที่ต้องเลือกขนาดใหม่ (UAT 01/10: "3 ใบ" อย่างเดียวไม่บอกว่าใบไหน) — ข้อความจากตัวตัดสิน
  assert.match(PAGE, /\{removeView\?\.docsText \? <p className=\{styles\.removeDocs\}>\{removeView\.docsText\}<\/p> : null\}/);
  assert.match(PAGE, /method: "DELETE"/);
  assert.match(PAGE, /packageSizeDeletedText\(code, out\?\.usage\)/, 'ข้อความหลังลบใช้ตัวเลขที่ server นับตอนลบ');
  assert.match(PAGE, /onConfirm=\{removeView && !removeView\.blocked \? remove : undefined\}/, 'ลบไม่ได้ = ปุ่มเดียว "ปิด" ไม่ยิง DELETE');
  // นับใหม่ตอนเปิดกล่อง — ตัวเลขที่ค้างจากตอนโหลดหน้าอาจเก่าไปหลายนาที
  assert.match(PAGE, /const openRemove = \(size\) => \{\s*setRemoving\(size\);[\s\S]*?load\(\{ background: true \}\);/);
  assert.match(PAGE, /disabled: !!lastSize,\s*disabledReason: lastSize \|\| undefined/);
  assert.doesNotMatch(code(PAGE), /window\.confirm|confirm\(/);
});

test('ข้อความบนหน้าทะเบียนมาจากทะเบียนจริง — ช่วง · คำเตือน · บรรทัดอธิบาย ไม่พิมพ์ตัวเลขตายไว้', () => {
  assert.match(PAGE, /packageSizeBandText\(size, sizes\)/);
  assert.match(PAGE, /packageSizeRangeText\(size, sizes\)/);
  assert.match(PAGE, /packageRegistryWarnings\(sizes\)/);
  assert.match(PAGE, /packageSizeLegendText\(sizes\)/);
  assert.doesNotMatch(code(PAGE), /2,?400|\b300\b/, 'ช่วงของขนาดแก้ได้ในทะเบียน — จอห้ามเขียนตัวเลขเอง');
});

test('🔴 โหลดพัง ≠ ยังไม่มีขนาด · กรองแล้วว่าง ≠ ไม่มีขนาด — สามสภาพสามข้อความ', () => {
  assert.match(PAGE, /loadError \? \(\s*<StatusNotice tone="error"/);
  assert.match(PAGE, /sizes\.length === 0 \? \(/);
  assert.match(PAGE, /rows\.length === 0 \? \(/);
  assert.match(PAGE, /ไม่มีขนาดในกลุ่มนี้/);
});

/* 🐞 UAT PR-P 01/10 — จอขึ้น "Could not find the table 'public.service_package_sizes' in the schema cache" ใต้หัวข้อไทย */
test('🔴 ข้อความดิบของฐานข้อมูลไม่ขึ้นจอ — route ตอบประโยคไทย ข้อความดิบลง log', () => {
  const list = read('app/api/service/package-sizes/route.js');
  const item = read('app/api/service/package-sizes/[code]/route.js');
  const repo = read('lib/service/packageSizesRepo.js');
  assert.match(list, /return fail\(packageSizeDbFailure\('read', e\), 500\);/);
  for (const src of [list, item, repo]) assert.doesNotMatch(code(src), /fail\(e\.message|error: error\.message/);
  assert.match(repo, /console\.error\(`\[packageSizes\][^`]*`, error\?\.message \|\| error\);/);
});

// ── โมดัลเพิ่ม/แก้ ──────────────────────────────────────────────────────
test('⭐ โมดัล: ด่านปุ่มบันทึก = ตัวตัดสินเดียวกับ route · คำขอมาจากตัวแปลงเดียวทั้งสองโหมด', () => {
  assert.match(MODAL, /packageSizeFormError\(editing \? "update" : "create", form, \{ canEdit, before: size, sizes \}\)/);
  assert.match(MODAL, /await onSubmit\(packageSizeFormPayload\(form\)\)/);
  assert.match(MODAL, /disabled=\{busy \|\| !!gate\}/);
  assert.match(MODAL, /\{!error && gate \? <p className=\{styles\.gate\} role="status">\{gate\}<\/p> : null\}/, 'เหตุที่กดไม่ได้เป็นตัวหนังสือ ไม่ใช่ tooltip');
  assert.doesNotMatch(code(MODAL), /apiJson|apiFetch|fetch\(/, 'โมดัลไม่ยิง API เอง — หน้าเป็นคนยิง (ทางเดียว)');
});

/* 🐞 UAT PR-P 01/10 (จอ 390) — ฟอร์มสูงกว่าจอ: เหตุที่กดไม่ได้และ error ของการบันทึกอยู่ท้ายเนื้อที่เลื่อน ใต้แถบปุ่มที่ลอยทับ
   ⇒ พิมพ์รหัสซ้ำที่ช่องบนสุดแล้วเห็นแค่ปุ่ม "บันทึก" สีเทาโดยไม่มีเหตุ */
test('🔴 โมดัล: เหตุ · error · ปุ่ม อยู่ในแถบท้ายที่นิ่ง (`footer` ของ Modal) ไม่ใช่ท้ายเนื้อที่เลื่อน · ช่องพิมพ์เป็น `touch`', () => {
  assert.match(MODAL, /<Modal open=\{open\}[^>]*footer=\{footer\}>/);
  const footer = MODAL.slice(MODAL.indexOf('const footer = ('), MODAL.indexOf('return ('));
  assert.match(footer, /\{error \? <AlertBanner tone="danger">\{error\}<\/AlertBanner> : null\}/);
  assert.match(footer, /styles\.gate/);
  assert.match(footer, /<Button tone="primary" onClick=\{save\}/);
  assert.doesNotMatch(code(MODAL), /form-action-bar/, 'แถบปุ่มแบบ sticky ในเนื้อ = ข้อความเหนือปุ่มจมอยู่ใต้แถบ');
  const body = MODAL.slice(MODAL.indexOf('<Modal open={open}'));
  assert.doesNotMatch(code(body), /AlertBanner|styles\.gate/);
  // ช่องพิมพ์ 16px/44px — ต่ำกว่า 16px iOS ซูมทั้งหน้าตอนแตะช่อง
  assert.equal((MODAL.match(/^\s*touch$/gm) || []).length, 4, 'รหัส · ชื่อเต็ม · ช่วง · หมายเหตุ');
});

test('🔴 รหัสแก้ไม่ได้ตอนแก้ และบอกเหตุ + ทางออก — พื้นที่ที่เคาะไปแล้วเก็บรหัสเป็นภาพนิ่ง', () => {
  assert.match(MODAL, /disabled=\{editing\}/);
  assert.match(MODAL, /รหัสแก้ไม่ได้ — พื้นที่ที่เคาะไปแล้วเก็บรหัสนี้ไว้ · ต้องการรหัสใหม่ให้เพิ่มขนาดใหม่แล้วลบขนาดนี้/);
});

test('ตัวเลือกของฟอร์มกางให้เห็น (วิธีเลือก · ช่วง) — ช่องช่วงขึ้นเฉพาะขนาดที่ระบบเสนอ และช่องตัวเลขเฉพาะ "ไม่เกิน"', () => {
  assert.equal((MODAL.match(/<OptionTiles/g) || []).length, 2);
  assert.match(MODAL, /options=\{PACKAGE_SIZE_PICK_OPTIONS\}/);
  assert.match(MODAL, /options=\{PACKAGE_SIZE_BAND_OPTIONS\}/);
  assert.match(MODAL, /\{auto \? \(\s*<div className="form-field">/);
  assert.match(MODAL, /\{form\.band !== "open" \? \(/);
  assert.doesNotMatch(code(MODAL), /<select|<Select|SearchableSelect/);
  // ลำดับช่อง: รหัส → ชื่อเต็ม → วิธีเลือก → ช่วง → หมายเหตุ
  const order = ['form.code', 'form.nameEn', 'form.pick', 'form.band', 'form.note'].map((k) => MODAL.indexOf(`value={${k}}`));
  assert.ok(order.every((at) => at > 0), 'หาช่องไม่ครบ');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

// ── แท็บสรุปส่งผล: ช่องแพ็คเกจ ─────────────────────────────────────────
test('⭐ ขนาด = แถบที่เห็นครบทุกขนาดในทะเบียน (ไม่ใช่ดรอปดาวน์) · ลูกศรแค่ย้ายโฟกัส ไม่เปลี่ยนขนาดให้', () => {
  assert.match(TABLE, /<Segmented\s+className=\{styles\.sizeSeg\}[\s\S]*?activationMode="manual"\s+value=\{pkg\.size\}\s+onChange=\{\(code\) => patchDraft\(zone\.id, \{ packageSize: code \}\)\}/);
  assert.doesNotMatch(code(TABLE), /<select|<Select|SearchableSelect/);
  // ทุกบรรทัดของช่องมาจากตัวตัดสินเดียว — จอไม่ประกอบข้อความเอง
  assert.match(TABLE, /const pkg = surveyPackageCell\(zone, drafts\[zone\.id\], \{ sizes: packageSizes, canDecide \}\);/);
  assert.match(TABLE, /const needNote = pkg\.needNote;/);
});

test('⭐ ระบบเสนอแต่ไม่เลือกให้ — ปุ่มรับข้อเสนอทีเดียวจบ · บรรทัดเสนออยู่หลัง showFormula (ช่างไม่เห็น)', () => {
  assert.match(TABLE, /\{pkg\.accept \? \([\s\S]*?onClick=\{\(\) => patchDraft\(zone\.id, pkg\.accept\.patch\)\}>\s*\{pkg\.accept\.label\}/);
  assert.match(TABLE, /\{showFormula && \(pkg\.hint \|\| pkg\.registryText\) \? \(/);
  assert.match(TABLE, /\{showFormula && pkg\.hint \? \(/, 'ดูอย่างเดียว: บรรทัดเสนอยังอยู่หลัง showFormula');
  assert.match(TABLE, /\{showFormula && pkg\.qtyHint \? /);
  assert.match(TABLE, /\{pkg\.overrideText \? <b>\{pkg\.overrideText\}<\/b> : null\}/);
  // แถวที่ขนาดไม่เคยถูกเทียบกับข้อเสนอ (back-fill ST) — จอวาดบรรทัดทักของตัวตัดสิน ไม่ประกอบข้อความเอง
  assert.match(TABLE, /\{pkg\.reviewText \? <b>\{pkg\.reviewText\}<\/b> : null\}/);
  // ทะเบียนถูกแก้หลังเคาะ — บรรทัดกลาง ๆ ของตัวตัดสิน (ไม่ใช่ "หัวหน้าเลือก … แทน")
  assert.match(TABLE, /\{pkg\.registryText \? <span>\{pkg\.registryText\}<\/span> : null\}/);
  // แต่ละท่อนเป็นบรรทัดของตัวเอง — ไม่ทิ้ง "แพ็ค" ไว้บรรทัดเดียว (UAT 01/10)
  assert.match(TABLE_CSS, /\.suggestText > \* \{ display: block; text-wrap: balance; \}/);
});

/* 🐞 UAT PR-P 01/10 — ช่องเหตุผลตัดช่องว่างทุกครั้งที่กดแป้น คำติดกันหมด · ป้ายแดงค้างเหนือช่องที่กรอกแล้ว */
test('🔴 ช่องเหตุผล: ค่าที่วาด = ข้อความดิบของร่าง · ป้ายแดง "ต้องบอกเหตุผล" เฉพาะตอนยังไม่ได้พิมพ์', () => {
  assert.match(TABLE, /value=\{draft\.packageNote\} disabled=\{busy\} maxLength=\{500\}/);
  assert.match(TABLE, /onChange=\{\(e\) => patchDraft\(zone\.id, \{ packageNote: e\.target\.value \}\)\}/);
  assert.match(TABLE, /\{pkg\.noteMissing\s*\? <span className=\{styles\.req\}>ต้องบอกเหตุผล<\/span>/);
  assert.doesNotMatch(code(TABLE), /\{needNote\s*\? <span className=\{styles\.req\}>/);
});

/* 🐞 UAT PR-P 01/10 — แตะขนาดแล้วจำนวนเป็น 1 · −/+ ไม่ลงต่ำกว่า 1 ⇒ ทางกลับทางเดียวคือ "ยกเลิก" ที่ทิ้งการเคาะของทุกพื้นที่ */
test('⭐ ถอยเฉพาะพื้นที่: ปุ่ม `reset` ของตัวตัดสินคืนสามช่องของแพ็คเกจ — ไม่แตะพื้นที่อื่น ไม่แตะจุดที่เลือก', () => {
  assert.match(TABLE, /\{pkg\.reset \? \([\s\S]*?onClick=\{\(\) => patchDraft\(zone\.id, pkg\.reset\.patch\)\}>\s*\{pkg\.reset\.label\}/);
});

/* 🐞 UAT PR-P 01/10 — ทะเบียนว่าง: ประโยคเดียวกันขึ้นสองครั้ง เป็นตัวหนังสือเฉย ๆ และ −/+ ยังกดได้ */
test('ทะเบียนว่าง: บอกครั้งเดียวพร้อมลิงก์ไปทะเบียน · ตัวเพิ่ม/ลดจำนวนปิด', () => {
  assert.match(TABLE, /\{pkg\.emptyText\} —\{" "\}\s*<Link href="\/database\/package-sizes" className=\{styles\.footLink\}>เพิ่มที่ ฐานข้อมูล › ขนาดแพ็คเกจ<\/Link>/);
  assert.equal((TABLE.match(/disabled=\{busy \|\| !pkg\.canStep\}/g) || []).length, 2);
  assert.doesNotMatch(code(TABLE), /ยังไม่มีขนาดในทะเบียน/, 'ข้อความมาจากตัวตัดสิน (`emptyText`) ที่เดียว');
});

/* 🐞 UAT PR-P 01/10 — คอลัมน์แพ็คเกจ 13rem ทุกความกว้าง ขณะที่ "เลือกจุด" ว่างอยู่ ~430px */
test('คอลัมน์แพ็คเกจกว้างตามกล่องตาราง (≥ 900px = 23rem · ป้ายข้างตัวควบคุม) · แผ่นขนาดเต็มเป้านิ้วเมื่อมีที่', () => {
  assert.match(TABLE_CSS, /@container \(min-width: 900px\) \{\s*\.colPackage \{ width: 23rem; \}/);
  assert.match(TABLE_CSS, /@container \(min-width: 900px\) \{\s*\.pkgField \{\s*grid-template-columns: 2\.75rem minmax\(0, 1fr\);/);
  assert.match(TABLE_CSS, /@container \(min-width: 900px\) \{\s*\.sizeSeg:global\(\.segmented\) > button \{ min-width: var\(--ctl-h-touch\); \}/);
  assert.match(TABLE_CSS, /@media \(max-width: 680px\) \{\s*\.sizeSeg:global\(\.segmented\) > button \{ min-width: var\(--ctl-h-touch\); \}/);
  assert.doesNotMatch(TABLE_CSS, /max-inline-size: 13rem/, 'เพดาน 13rem ของบรรทัดข้อเสนอ/เหตุ ทำให้ห่อทั้งที่ช่องกว้างแล้ว');
});

test('จำนวน: ปุ่ม −/+ ยังอยู่ · ว่างแล้วกดครั้งแรก = 1 (ที่ระบบเสนอ) · เพดานเดียวกับ server', () => {
  assert.match(TABLE, /const next = pkg\.qty === null \? 1 : pkg\.qty \+ by;/);
  assert.match(TABLE, /Math\.min\(PACKAGE_QTY_MAX, Math\.max\(1, next\)\)/);
  assert.match(TABLE, /aria-label="ลดแพ็คเกจ"/);
  assert.match(TABLE, /aria-label="เพิ่มแพ็คเกจ"/);
});

test('🔴 ขนาดถูกลบ / อ่านทะเบียนไม่สำเร็จ — แถวบอกเหตุเป็นตัวหนังสือ + ไอคอน ไม่ใช่แถบว่างเงียบ ๆ', () => {
  assert.match(TABLE, /\{pkg\.goneText \? \(/);
  assert.match(TABLE, /const canPick = canDecide && !pkg\.registryDown;/);
  assert.match(TABLE, /\{canDecide && pkg\.registryDown \? \(/);
  // อ่านทะเบียนไม่สำเร็จ — กล่องแจ้งครั้งเดียวเหนือตาราง พร้อมปุ่มที่ลองใหม่ได้จริง (UAT 01/10: "ลองใหม่" สามที่ ไม่มีปุ่ม)
  assert.match(TABLE, /\{canDecide && !Array\.isArray\(packageSizes\) \? \(\s*<div className=\{styles\.registryNotice\}>\s*<StatusNotice tone="error" title=\{PACKAGE_SIZE_REGISTRY_UNREAD\}/);
  assert.match(TABLE, /onClick=\{onReload\}>โหลดใหม่<\/Button>/);
  assert.doesNotMatch(code(TABLE), /ลองใหม่|โหลดหน้าใหม่/);
  assert.match(read('app/service/surveys/[id]/page.js'), /const reloadSheet = useCallback\(\(\) => load\(\{ background: true \}\), \[load\]\);/);
  assert.equal((read('app/service/surveys/[id]/page.js').match(/onReload=\{reloadSheet\}/g) || []).length, 2, 'การ์ด + ตาราง');
  assert.match(read('components/service/SurveyControlCard.js'), /else if \(target\.kind === "reload"\) onReload\?\.\(\);/);
  // แผ่นแดงของขนาดที่ถูกลบ: แถบกลางส่งโทนเป็น data attribute ให้ CSS ของตารางแต่ง
  assert.match(read('components/ui/Segmented.js'), /data-tone=\{option\.tone\}/);
  assert.match(read('components/service/SurveyResultTable.module.css'), /\.sizeSeg:global\(\.segmented\) > button\[data-tone="danger"\]/);
});

test('ดูอย่างเดียว/ช่าง = "SM · 1 แพ็ค" เป็นตัวหนังสือจากตัวตัดสิน', () => {
  assert.match(TABLE, /<b className=\{styles\.qty\}>\{naText\(pkg\.valueText\)\}<\/b>/);
});

test('ตัวตัดสินร่างได้ทะเบียนทุกจุด — ลืมส่ง = บันทึกการเคาะไม่ได้ (fail-closed)', () => {
  assert.match(TABLE, /surveyDecisionError\(zone, drafts\[zone\.id\], \{ sizes: packageSizes \}\)/);
  assert.match(TABLE, /surveyPendingDecisions\(zones, drafts, \{ sizes: packageSizes \}\)/);
  assert.doesNotMatch(code(TABLE), /surveyDecisionError\(zone, drafts\[zone\.id\]\)|surveyPendingDecisions\(zones, drafts\)/);
});

test('บรรทัดใต้ตารางบอกช่วงของทุกขนาดจากทะเบียน พร้อมลิงก์ไปหน้าทะเบียน', () => {
  assert.match(TABLE, /packageSizeLegendText\(packageSizes\)/);
  assert.match(TABLE, /<Link href="\/database\/package-sizes"/);
});

// ── สูตร ÷ 2,400 ถอดแล้ว — ไม่มีจอไหนพูดถึง ─────────────────────────────
test('🔄 ไม่มีจอไหนวาด "สูตร N" หรืออ่านช่องของสูตรเดิมแล้ว — ทุกจอที่อ่านผลใช้ขนาด + จำนวน', () => {
  const screens = [
    'components/service/SurveyResultTable.js',
    'components/requests/details/SurveyRequestView.js',
    'components/requests/details/SurveyDetail.js',
    'components/service/CustomerZonesPanel.js',
    'components/requests/SurveySiteFields.js',
    'app/service/surveys/[id]/page.js',
  ];
  for (const rel of screens) {
    const src = code(read(rel));
    assert.doesNotMatch(src, /สูตร \{|สูตร \$\{|ที่สูตรบอก|ต่างจากสูตร|suggestedPackages|deltaText/, rel);
  }
  assert.doesNotMatch(code(read('components/requests/details/SurveyRequestView.js')), /row\.suggested\b/);
  // หน้าคำร้องของฝ่ายขาย: ถ้อยคำมาจาก surveyJobView
  const view = read('components/requests/details/SurveyRequestView.js');
  assert.match(view, /\{naText\(row\.packageText\)\}/);
  assert.match(view, /\{row\.suggestedText \? <span className="cell-sub">\{row\.suggestedText\}<\/span> : null\}/);
  assert.match(view, /note=\{zones\.packageMixText \|\| null\}/);
  // ตารางในใบคำร้อง (SurveyDetail) · ทะเบียนโซนของลูกค้า · ตัวเลือกพื้นที่ — ตัวเขียนเดียวกัน
  assert.match(read('components/requests/details/SurveyDetail.js'), /surveyZonePackageText\(s, \{ unit: false \}\)/);
  assert.match(read('components/requests/details/SurveyDetail.js'), /surveyPackageMixText\(totals\.packagesBySize\)/);
  assert.match(read('components/service/CustomerZonesPanel.js'), /packageSize: zone\.assessedPackageSize, packageQty: zone\.assessedPackages/);
  assert.match(read('components/requests/SurveySiteFields.js'), /packageSize: tile\.assessedPackageSize, packageQty: tile\.assessedPackages/);
});

test('กล่องยืนยันส่งผล/ดึงกลับบอกยอดพร้อมสัดส่วนขนาด — ตัวเขียนเดียวกับการ์ดควบคุม', () => {
  const page = read('app/service/surveys/[id]/page.js');
  assert.equal((page.match(/surveyPackagesLabel\(totals, packageSizes\)/g) || []).length, 2);
  assert.doesNotMatch(code(page), /\$\{totals\.packageQty\} แพ็คเกจ/);
});
