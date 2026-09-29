// ── แท็บ "รอตั้งรอบ" ของหน้างานเข้าใหม่ (PR-C · C7) — ยามสายไฟ route → หน้า → คอมโพเนนต์ ─────────────
//
// ⭐ ข้อเท็จจริงของแถวคำนวณที่ `intakePlanFacts.js` (มีเทสต์หน่วยของตัวเอง) — ไฟล์นี้กัน "สายไฟ":
//   route ต้องพกคอลัมน์ที่ตัวคำนวณอ่าน + เรียกตัวคำนวณ · หน้าต้องวาดทุกข้อเท็จจริง ตั้งรอบได้จากแถว
//   (โมดัลตัวเดียวกับหน้าไซต์ · ค่าเติมจากแถว · ไม่มีทางเลือก "ไม่ผูกใบ") · ปุ่มโชว์ตามสิทธิ์
// 🔴 ยาม slice ของ historicalServiceSide.test.mjs:189 ตัดก้อนแท็บใบเดิมถึง `{tab === "plan" && (` ตัวแรกของไฟล์
//    ⇒ โน้ต/แถบของแท็บตั้งรอบที่อยู่เหนือก้อนนั้นต้องขึ้นต้นด้วย `showCounts && tab === "plan"` เสมอ (L1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const count = (src, re) => (src.match(re) || []).length;
const selectOf = (src, table) => {
  const hit = src.match(new RegExp(`from\\(\\s*'${table}'\\s*\\)\\s*\\.select\\('([^']*)'`));
  assert.ok(hit, `หา select ของ ${table} ไม่เจอ`);
  return hit[1];
};

const PAGE = 'app/service/intake/page.js';
const ROUTE = 'app/api/service/intake/route.js';
const DETAIL = 'components/service/intakePlan/PlanZoneDetail.js';
const ORPHAN = 'components/service/intakePlan/OrphanPlanStrip.js';
const CELLS = 'components/service/intakePlan/PlanFactCells.js';

/* ก้อนแท็บตั้งรอบ = จาก `{tab === "plan" && (` ตัวแรก ถึงก้อนแท็บ visit */
const planBlock = (src) => {
  const start = src.indexOf('{tab === "plan" && (');
  const end = src.indexOf('{tab === "visit" && (', start);
  assert.ok(start >= 0 && end > start, 'หาก้อนแท็บตั้งรอบไม่เจอ');
  return src.slice(start, end);
};

/* ── route ─────────────────────────────────────────────────────────────────────────────────── */

test('route: ใบพกวันจบช่วงบริการ · สัญญาพกวันเริ่ม/สิ้นสุด (ช่วงของใบย้อนหลัง) — ตัวคำนวณอ่านสองช่องนี้', () => {
  const route = code(ROUTE);
  const orders = selectOf(route, 'sales_orders');
  assert.ok(orders.includes('"servicePeriodFrom"') && orders.includes('"servicePeriodTo"'), 'ช่วงบริการของใบ (หัวใบ) ต้องครบสองปลาย');
  const contracts = selectOf(route, 'sales_contracts');
  for (const col of ['"contractNo"', 'status', '"effectiveDate"', '"expiryDate"']) {
    assert.ok(contracts.includes(col), `select ของสัญญาต้องมี ${col}`);
  }
});

test('route: แถวรอตั้งรอบผ่านตัวคำนวณ (decoratePlanRows ครอบ planQueue ตัวเดิม) · จำนวนแถว/ตัวนับไม่เปลี่ยน', () => {
  const route = code(ROUTE);
  assert.match(route, /import \{[^}]*decoratePlanRows[^}]*\} from '@\/lib\/service\/intakePlanFacts';/);
  /* review 29/09: รอบกำพร้าเข้าตัวคำนวณด้วย (รอบ stale → "ย้ายรอบเดิมมาใบนี้") ⇒ คำนวณรอบกำพร้าก่อนแถว */
  assert.match(route, /const plan = decoratePlanRows\(planQueue\(\{ zones, terms, plans, sites, ordersById, linesById, installmentsByOrderId, todayIso \}\), \{ ordersById, contractsById, linesById, todayIso, orphans \}\);/);
  assert.ok(route.indexOf('const orphans = orphanPlanRows(') < route.indexOf('const plan = decoratePlanRows('), 'รอบกำพร้าต้องคำนวณก่อนแถว');
  // ตัวนับบนแท็บ/เมนูอ่านจำนวนแถวเท่าเดิม
  assert.match(route, /counts: intakeCounts\(\{ legacy, plan, visit \}\),/);
});

test('route: รอบกำพร้า — เดินโซ่ใบที่ไม่มีผลแบบมีเพดาน · โหลดด้วย id ล้วน (ซอยก้อน · ไม่กรองสถานะที่ query) · ส่งออก orphans', () => {
  const route = code(ROUTE);
  assert.match(route, /orphanOrderIdsToLoad\(/);
  assert.match(route, /const orphans = orphanPlanRows\(\{ plans, ordersById: allOrdersById, terms, zones, sites, todayIso \}\);/);
  // วนมีเพดาน (ไม่ใช่ while(true)) และหยุดเมื่อไม่มีใบใหม่ให้โหลด
  assert.match(route, /for \(let hop = 0; hop < ORPHAN_CHAIN_ROUNDS; hop \+= 1\) \{/);
  assert.match(route, /const ORPHAN_CHAIN_ROUNDS = MAX_ORPHAN_HOPS \+ 1;/);
  assert.match(route, /if \(!missing\.length\) break;/);
  assert.doesNotMatch(route, /while\s*\(\s*true\s*\)/);
  // ใบในโซ่: คอลัมน์ที่ตั้งชื่อ · by id · ซอยก้อน (กฎ 18 · PostgREST 16 KB) — ห้ามกรองสถานะ/ยอดที่ query
  const chain = route.slice(route.indexOf('fetchAllInChunks(missing'), route.indexOf(';', route.indexOf('fetchAllInChunks(missing')));
  assert.ok(chain.length > 0, 'หาคำสั่งโหลดใบในโซ่ไม่เจอ');
  assert.match(chain, /\.from\('sales_orders'\)\s*\.select\('id, "orderNumber", status, "supersededById"'\)\s*\.in\('id', chunk\)/);
  assert.doesNotMatch(chain, /'approved'|totalAmount|\.eq\(\s*'status'|\.in\(\s*'status'|select\('\*/);
  // ใบที่โหลดเพิ่มใช้เดินโซ่อย่างเดียว — ไม่ปนเข้า ordersById ของคิว (คิวยังเห็นเฉพาะใบที่มีผล)
  assert.match(route, /const allOrdersById = new Map\(\[\.\.\.ordersById, \.\.\.chainById\]\);/);
  const reply = route.slice(route.indexOf('return ok({'), route.indexOf('});', route.indexOf('return ok({')));
  assert.match(reply, /\borphans,/);
  assert.doesNotMatch(reply, /\borders\b|ordersById|chainById/, '🔒 ใบดิบไม่ออกไปกับ response');
});

/* ── หน้า: ตัวนับ · โน้ต · แถบรอบกำพร้า ─────────────────────────────────────────────────────── */

test('หน้า: ป้ายจำนวนแท็บตั้งรอบ = "{n} แถว" (หน่วย = ไซต์ × ใบ) · Pager ใช้หน่วยเดียวกัน · แท็บอื่นคงหน่วยเดิม', () => {
  const src = code(PAGE);
  assert.match(src, /count=\{showCounts \? \(tab === "plan" \? planCountLabel\(planSum\) : `\$\{tabRows\.length\} \$\{tab === "visit" \? "รอบ" : "ใบ"\}`\) : null\}/);
  assert.match(src, /itemLabel=\{tab === "plan" \? "แถว" : tab === "visit" \? "รอบ" : "ใบ"\}/);
  assert.match(src, /const planSum = useMemo\(\(\) => planTotals\(data\?\.plan \|\| \[\]\), \[data\]\);/);
  // บรรทัดรวมเหนือ Pager (เฉพาะแท็บตั้งรอบ)
  const totals = src.indexOf('planTotalsLine(planSum)');
  assert.ok(totals > 0 && totals < src.indexOf('<Pager'), 'บรรทัดรวมต้องอยู่เหนือ Pager');
});

test('หน้า (L1): โน้ต/แถบของแท็บตั้งรอบเหนือก้อนใบเดิมขึ้นต้นด้วย showCounts — ก้อน slice ของยามใบเดิมไม่ว่าง', () => {
  const src = code(PAGE);
  const bindStart = src.indexOf('{tab === "bind" && (\n              legacyRows.length === 0');
  const firstPlan = src.indexOf('{tab === "plan" && (');
  assert.ok(bindStart > 0 && firstPlan > bindStart, '`{tab === "plan" && (` ตัวแรกต้องมาหลังก้อนใบเดิม');
  assert.ok(src.slice(bindStart, firstPlan).length > 200);
  assert.match(src, /\{showCounts && tab === "plan" && planSum\.anyStamped && \(\s*<StatusNotice tone="info"[^>]*>\s*\{PLAN_TAB_STAMPED_NOTE\}/);
  assert.match(src, /\{showCounts && tab === "plan" && <OrphanPlanStrip orphans=\{data\?\.orphans\} \/>\}/);
  assert.match(src, /import OrphanPlanStrip from "@\/components\/service\/intakePlan\/OrphanPlanStrip";/);
});

/* ── หน้า: ตาราง + การ์ด ───────────────────────────────────────────────────────────────────── */

test('หน้า: ตารางแท็บตั้งรอบ — หัวคอลัมน์ตามม็อก TsIntakePlan · ว่าง = PLAN_EMPTY_TEXT', () => {
  const block = planBlock(code(PAGE));
  const heads = [...block.matchAll(/<th scope="col"(?: className=\{[^}]*\})?(?: aria-label="([^"]*)")?\s*(?:\/>|>([^<]*)<\/th>)/g)]
    .map((m) => m[2] ?? `[${m[1]}]`);
  assert.deepEqual(heads, ['ไซต์', 'ใบสั่งขาย', 'โซน · แพ็ค/รอบ', '{ROUNDS_SOLD_LABEL}', 'ช่วงบริการ', 'รอบที่แนะนำ', 'สัญญา', 'เงินครอบถึง', '[การกระทำ]']);
  assert.match(block, /<TableScroll family="list" minWidth=\{1240\} cells="stacked">/);
  assert.match(block, /<EmptyState plain icon=\{CalendarPlus\}>\s*\{PLAN_EMPTY_TEXT\}\s*<\/EmptyState>/);
  assert.doesNotMatch(block, /ทุกไซต์ที่ขายแล้วมีรอบครบ|ตั้งรอบที่หน้าไซต์/, 'ลิงก์ "ตั้งรอบที่หน้าไซต์" ถูกแทนด้วยปุ่มตั้งรอบ + รหัสไซต์เป็นลิงก์');
});

test('หน้า: ข้อเท็จจริงของแถวครบทั้งตารางและการ์ด (ป้ายตั้งโซน · ช่วงบริการ · รอบที่แนะนำ · สัญญา · รหัสไซต์เป็นลิงก์)', () => {
  const block = planBlock(code(PAGE));
  assert.equal(count(block, /label=\{STAMPED_BADGE_LABEL\}/g), 2, 'ป้าย "ฝ่ายขายตั้งโซนแล้ว" ทั้งตาราง + การ์ด');
  assert.equal(count(block, /row\.stamped && /g) >= 2, true);
  for (const cell of ['<PeriodCell row={row} />', '<CadenceCell row={row} />', '<ContractChip row={row} />']) {
    assert.equal(count(block, new RegExp(cell.replace(/[{}()/]/g, '\\$&'), 'g')), 2, `${cell} ทั้งตาราง + การ์ด`);
  }
  assert.equal(count(block, /<Link href=\{`\/database\/sites\/\$\{row\.siteId\}`\} className=/g), 2, 'รหัสไซต์ลิงก์ไปหน้าไซต์ทั้งสองมุมมอง');
  assert.equal(count(block, /row\.zonePacksText \?\? zoneNames\(row\)/g), 2);
  // ช่อง "จำนวนรอบบริการ" (เดิม "ขายไว้") ยังอ่าน planRoundsSoldText (ยาม F18 · intakePlanRoundsUi.test.mjs)
  assert.equal(count(block, /planRoundsSoldText\(row\)\?\.value/g), 2);
});

test('หน้า: ตั้งรอบจากแถว — ปุ่มเฉพาะคนแก้งานบริการ · ลิงก์ใบเฉพาะคนเห็นสายขาย · hook อยู่บนสุดของหน้า', () => {
  const src = code(PAGE);
  assert.match(src, /const canEdit = useMemo\(\s*\(\) => canEditService\(\{ role, team, teams, department \}\),/);
  assert.match(src, /const canOpenSo = useCan\("salesplan:view"\);/);
  const block = planBlock(src);
  /* review 29/09: accent = "หน้าละ 1 ปุ่ม" (Button.js · UI_DESIGN_SYSTEM ข้อ 8) — ปุ่มซ้ำทุกแถวเป็น navy ตามม็อก (.btn.primary)
     · แถวที่มีรอบเดิมให้ย้าย (stale) ⇒ ตั้งรอบถอยเป็นปุ่มรอง ทางหลักคือ "ย้ายรอบเดิมมาใบนี้" */
  assert.equal(count(block, /\{canEdit && \(\s*<Button tone=\{row\.stalePlanToMove \? "neutral" : "primary"\} size="sm" onClick=\{\(\) => openPlan\(row\)\}>\s*ตั้งรอบ\s*<\/Button>/g), 2, 'ปุ่มตั้งรอบ ตาราง + การ์ด');
  assert.doesNotMatch(block, /tone="accent"/, 'ปุ่มซ้ำรายแถวห้ามเป็น accent');
  assert.equal(count(block, /\{canOpenSo && row\.salesOrderId && \(\s*<Link href=\{`\/sa\/sales-orders\/\$\{row\.salesOrderId\}`\}/g), 2, 'ลิงก์เปิดใบสั่งขาย ตาราง + การ์ด');
  // hook ห้ามอยู่ใน .map (กฎ 19)
  assert.doesNotMatch(block, /useCan\(|useMemo\(|useState\(/);
});

test('หน้า: โมดัลตั้งรอบ — ตัวเดียวกับหน้าไซต์ · ค่าเติม/บริบทจากแถวที่ถ่ายไว้ · ไม่มีช่องเลือกใบ · บันทึกผ่าน apiJson', () => {
  const src = code(PAGE);
  const modal = src.slice(src.indexOf('<ServicePlanModal'), src.indexOf('/>', src.indexOf('<ServicePlanModal')));
  assert.ok(modal.length > 0, 'หาโมดัลไม่เจอ');
  for (const prop of ['open={!!planRow}', 'siteId={planRow?.siteId}', 'technicians={technicians}', 'roundsSold={planRow?.roundsSold ?? null}',
    'salesOrderId={planRow?.salesOrderId}', 'salesOrders={null}', 'context={planRow?.context}', 'prefill={planRow?.prefill}',
    'onClose={closePlan}', 'onSave={savePlan}']) {
    assert.ok(modal.includes(prop), `โมดัลต้องได้ ${prop}`);
  }
  // planRow = ภาพถ่ายตอนกด — ตั้งที่ openPlan/closePlan เท่านั้น (โหลดใหม่ตอนกลับมามองแท็บห้ามเปลี่ยน props ระหว่างพิมพ์)
  assert.equal(count(src, /setPlanRow\(/g), 2);
  assert.match(src, /const openPlan = useCallback\(\(row\) => \{\s*setPlanRow\(row\);/);
  assert.match(src, /const closePlan = useCallback\(\(\) => setPlanRow\(null\), \[\]\);/);
  const load = src.slice(src.indexOf('const load = useCallback('), src.indexOf('useRevalidateOnFocus(load);'));
  assert.doesNotMatch(load, /setPlanRow|planRow/);
  assert.match(src, /await apiJson\("\/api\/service\/plans", \{ method: "POST", json: form, fallbackError: "ตั้งรอบไม่สำเร็จ" \}\)/);
  assert.match(src, /`ตั้งรอบแล้ว · สร้างนัดให้ \$\{fmtNumber\(generated\)\} ครั้ง`/);
  assert.match(src, /"ตั้งรอบแล้ว · ยังไม่มีนัดที่ต้องสร้าง"/);
  // รายชื่อเจ้าหน้าที่โหลดตอนเปิดครั้งแรก · กรองด้วยตัวตัดสินกลาง
  assert.match(src, /apiJson\("\/api\/pm\/assignable-users"/);
  assert.match(src, /\.filter\(canBeServiceAssignee\)/);
});

test('หน้า: รายละเอียดโซน — ปุ่มกาง/ซ่อนบอกสถานะ (aria-expanded) · แผงเป็นคอมโพเนนต์แยก · บันทึก มล. แล้วแก้แถวในจอ', () => {
  const src = code(PAGE);
  const block = planBlock(src);
  assert.equal(count(block, /aria-expanded=\{zonesOpen\}/g), 2, 'ปุ่มกางทั้งตาราง + การ์ด');
  assert.match(block, /\{zonesOpen \? "ซ่อนรายละเอียดโซน" : "รายละเอียดโซน"\}/);
  assert.equal(count(block, /<PlanZoneDetail\b/g), 2);
  assert.match(block, /<td colSpan=\{PLAN_COLUMNS\} className="ui-cell-wide">/, 'แถวรายละเอียดเต็มแถว · ไม่โดนเพดาน 220px ของเซลล์ลิสต์');
  assert.match(src, /const PLAN_COLUMNS = 9;/);
  assert.match(src, /onSaved=\{patchTerm\}/);
  assert.match(src, /const patchTerm = useCallback\(/);
  // ตารางลิสต์ของหน้านี้มีใบเดียว (listPanelShape) — แผงรายละเอียดไม่ใช่ ListPanel
  assert.doesNotMatch(code(DETAIL), /ListPanel/);
});

/* ── คอมโพเนนต์ ─────────────────────────────────────────────────────────────────────────────── */

test('PlanZoneDetail: หัว "รายละเอียดโซน · รหัสไซต์" · หัวตาราง 4 ช่อง · ช่อง มล. รับรายการ term ตรง ๆ (ไม่แปลงทรง)', () => {
  const src = code(DETAIL);
  assert.match(src, /`รายละเอียดโซน · \$\{/);
  assert.match(src, /STANDARD_ML_MESSAGES\.hint/);
  for (const head of ['โซน', 'แพ็คเกจ', 'แพ็ค/รอบ', 'มาตรฐาน มล./เดือน']) {
    assert.match(src, new RegExp(`<th scope="col"[^>]*>${head.replace('/', '\\/').replace('.', '\\.')}</th>`), head);
  }
  assert.equal(count(src, /<TermStandardMlCell\s+term=\{item\}\s+canEdit=\{canEdit\}\s+stamped=\{stamped\}/g), 2, 'ตาราง + รายการ (การ์ด)');
  assert.match(src, /const stamped = !!row\?\.stamped;/);
  assert.doesNotMatch(src, /apiJson|apiFetch|fetch\(/, 'แผงไม่ยิง API เอง — ช่อง มล. ยิงผ่าน TermStandardMlCell');
  assert.doesNotMatch(src, /style=\{\{/);
});

test('OrphanPlanStrip: หนึ่งกล่องเตือนต่อชนิดที่มีของ · หัวข้อ/บรรทัดจาก ORPHAN_TITLES/ORPHAN_ITEM_TEXT · ลิงก์หน้าไซต์', () => {
  const src = code(ORPHAN);
  assert.match(src, /ORPHAN_TITLES\[kind\]\(rows\.length\)/);
  assert.match(src, /ORPHAN_ITEM_TEXT\(item\)/);
  assert.match(src, /<StatusNotice\b[^>]*tone="warning"/);
  assert.match(src, /href=\{`\/database\/sites\/\$\{item\.siteId\}`\}/);
  assert.match(src, />\s*หน้าไซต์\s*</);
  assert.match(src, /if \(!groups\.length\) return null;/, 'ไม่มีรอบกำพร้า = ไม่วาดอะไร');
  assert.doesNotMatch(src, /style=\{\{|apiJson|apiFetch/);
});

test('PlanFactCells: ขาดข้อมูล = ขีด · ชิปสัญญาใช้โทน/ข้อความจากแถว · ไม่มี hook', () => {
  const src = code(CELLS);
  for (const name of ['PeriodCell', 'CadenceCell', 'ContractChip']) assert.match(src, new RegExp(`export function ${name}\\(`));
  assert.match(src, /naText\(null\)/);
  assert.match(src, /tone=\{chip\.tone\}/);
  assert.match(src, /label=\{chip\.label\}/);
  assert.doesNotMatch(src, /\buse[A-Z]\w*\(/);
  assert.doesNotMatch(src, /style=\{\{/);
});

test('หน้า: ไม่มี style inline ใหม่ · ไม่มี fetch ดิบ · ปุ่ม/ลิงก์ใช้ primitive กลาง', () => {
  const src = code(PAGE);
  assert.doesNotMatch(src, /style=\{\{/);
  assert.doesNotMatch(src, /[^.\w]fetch\(/);
});

/* ── review 29/09 ─────────────────────────────────────────────────────────────────────────────── */

test('🔴 หน้า: รหัสไซต์ในหัวแถวตาราง = .table-row-link (คอลัมน์ระบุตัวตน · ห้ามเพิ่ม .linklike จุดใหม่)', () => {
  const block = planBlock(code(PAGE));
  const table = block.slice(block.indexOf('<TableScroll'));
  const head = table.slice(table.indexOf('<th scope="row">'), table.indexOf('</th>', table.indexOf('<th scope="row">')));
  assert.match(head, /<Link href=\{`\/database\/sites\/\$\{row\.siteId\}`\} className="table-row-link mono">/);
  assert.doesNotMatch(head, /linklike/);
});

test('🔴 หน้า: รอบอื่นที่ไซต์ — โน้ตบนแถวทั้งสองมุมมอง · รอบเดิมที่ย้ายได้ = ลิงก์หลัก "ย้ายรอบเดิมมาใบนี้" (สิทธิ์แก้งานบริการ)', () => {
  const src = code(PAGE);
  const block = planBlock(src);
  assert.match(src, /import \{[^}]*\bOTHER_PLAN_TEXT\b[^}]*\} from "@\/lib\/service\/intakePlanFacts";/);
  assert.equal(count(block, /\{row\.otherPlanNote && \(/g), 2, 'โน้ตรอบของใบอื่น ตาราง + การ์ด');
  assert.equal(count(block, /OTHER_PLAN_TEXT\.unbound\(row\.unboundPlans\)/g), 2, 'ข้อความรอบไม่ผูกใบมาจากแคตตาล็อกเดียว');
  assert.equal(count(block, /\{canEdit && row\.stalePlanToMove && \(\s*<Button as=\{Link\} href=\{`\/database\/sites\/\$\{row\.siteId\}`\} tone="primary" size="sm">\s*\{OTHER_PLAN_TEXT\.moveAction\}\s*<\/Button>/g), 2);
});

test('🔴 ServicePlanModal: คำเตือนรอบซ้อนจาก context (existingPlanWarning) — StatusNotice เหลืองในแถบบริบท นอกกริด', () => {
  const modal = code('components/service/ServicePlanModal.js');
  const ctx = modal.slice(modal.indexOf('{context && ('), modal.indexOf('<div className={styles.grid}>'));
  assert.match(ctx, /\{context\.existingPlanWarning && \(\s*<StatusNotice tone="warning">\{context\.existingPlanWarning\}<\/StatusNotice>\s*\)\}/);
});

test('🔴 PlanZoneDetail: รอบขายหลายรายการบนโซนเดียว = บรรทัด "รายการ n · FG" (termLabels) ทั้งตาราง/รายการ + ชื่อช่องไม่ซ้ำ', () => {
  const src = code(DETAIL);
  assert.match(src, /const labels = row\?\.termLabels \|\| \{\};/);
  assert.equal(count(src, /labels\[item\.id\]\?\.detail/g) >= 2, true);
  assert.match(src, /const mlLabel = \(item, detail\) =>/);
  assert.equal(count(src, /ariaLabel=\{mlLabel\(item, labels\[item\.id\]\?\.detail\)\}/g), 2);
});
