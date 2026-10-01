// ── D15 ชิปใบสั่งขายบนร่างที่ติดด่าน (PR-C · C9 · C-D19) — ยามซอร์สของจอ ─────────────────────────────
//
// ⭐ ร่างที่ติดด่าน "โซนนี้ยังไม่มีใบสั่งขายที่ตั้งงานบริการ" บอกได้แล้วว่า **ใบไหน · อยู่ขั้นไหน · AE คนไหน**
//    (การ์ดรายการงาน + แผงด่านในโมดัลจัดคิว) · ตรรกะเทสต์ด้วยค่าจริงที่ visitGate/scheduleQueueView/scheduleModal/
//    gateContext/visitBundle.test.mjs — ไฟล์นี้ล็อก "รูป" ที่ตรรกะเทสต์ไม่ได้ (คอมโพเนนต์เป็น JSX)
// 🔴 สามกับดักที่รีวิวแผนจับได้:
//   H1  hook ในลูป — ทั้งสองจุดวาดข้อด่านใน `.map()` ⇒ `useCan` ต้องอยู่ในคอมโพเนนต์ชิปเอง (เรียกครั้งเดียวที่หัว)
//   rule 20  ทั้งสองจุดอยู่ใน `<p>` ⇒ ชิปเป็น inline ล้วน (span · Link) ห้าม div/p/ul/StatusNotice
//   L9  น้ำหนัก bundle — หน้าจัดคิวต้องได้แค่ตัวสร้างข้อความ (`zoneSetupOrderText.js` ไม่มี import)
//       ไม่ใช่ตัวติดป้าย (`zoneSetupOrders.js` → `serviceSetup.js` ทั้งกราฟบิล/งวด/สิทธิ์)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์เล่าประวัติได้ */
const live = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const chips = live(read('components/service/GateOrderChips.js'));
const chipsCss = live(read('components/service/GateOrderChips.module.css'));
const card = live(read('components/service/ScheduleQueueCard.js'));
const panel = live(read('components/service/GatePanel.js'));

test('⭐ GateOrderChips: client component · useCan("salesplan:view") ครั้งเดียวที่หัว (ก่อน return ใด ๆ) · ว่าง = null', () => {
  assert.match(chips, /^"use client";/);
  assert.match(chips, /import \{ useCan \} from "@\/lib\/roleContext";/);
  assert.equal((chips.match(/useCan\(/g) || []).length, 1, 'เรียก hook ครั้งเดียว');
  assert.match(chips, /const canOpen = useCan\("salesplan:view"\);/);
  const hook = chips.indexOf('useCan("salesplan:view")');
  const firstReturn = chips.indexOf('return ');
  assert.ok(hook > 0 && hook < firstReturn, 'hook ต้องมาก่อน return แรก (ลำดับ hook คงที่ทุกการวาด)');
  assert.match(chips, /if \(!list\.length\) return null;/);
});

test('⭐ GateOrderChips: inline ล้วน (อยู่ใน <p> ทั้งสองจุด) · ไม่มี style={{}}', () => {
  for (const tag of ['<div', '<p', '<ul', '<ol', '<li', '<section', '<StatusNotice', '<Button']) {
    assert.equal(chips.includes(tag), false, `ห้าม ${tag} — ชิปอยู่ใน <p>`);
  }
  assert.match(chips, /<span className=\{styles\.chips\}>/);
  assert.match(chips, /<span className=\{styles\.chip\}>\s*\{chipRuns\(order\)\.map\(/);
  assert.match(chips, /const chipRuns = \(order\) => setupOrderChipText\(order\)\.split\(SEPARATOR\);/, 'ท่อนมาจากข้อความชิปตัวเดียวกับ haystack');
  assert.doesNotMatch(chips, /style=\{\{/);
});

test('⭐ GateOrderChips: ลิงก์ "เปิดใบสั่งขาย" เฉพาะคนที่เปิดใบได้ (ไม่มีสิทธิ์ = ไม่โชว์) · ไปหน้าใบของ SA', () => {
  const link = chips.match(/\{canOpen && \(\s*<Link[\s\S]*?<\/Link>\s*\)\}/);
  assert.ok(link, 'ลิงก์ต้องอยู่ใต้ canOpen');
  assert.match(link[0], /href=\{`\/sa\/sales-orders\/\$\{encodeURIComponent\(order\.orderId\)\}`\}/);
  assert.match(link[0], /className=\{`linklike \$\{styles\.open\}`\}/);
  assert.match(link[0], /เปิดใบสั่งขาย/);
  assert.equal((chips.match(/<Link/g) || []).length, 1);
});

test('⭐ L9: ชิปกับแถวรายการงานใช้ตัวสร้างข้อความ (ไม่มี import) — ไม่ลากตัวติดป้าย/serviceSetup เข้าหน้าจัดคิว', () => {
  assert.match(chips, /import \{ setupOrderChipText \} from "@\/lib\/service\/zoneSetupOrderText";/);
  const view = live(read('lib/service/scheduleQueueView.js'));
  assert.match(view, /import \{ setupOrderChipText \} from '\.\/zoneSetupOrderText';/);
  for (const [name, src] of [['GateOrderChips', chips], ['scheduleQueueView', view]]) {
    assert.doesNotMatch(src, /zoneSetupOrders'|zoneSetupOrders"|zoneSalesRepo|serviceSetup/, name);
  }
  // gateContext ถูก import ฝั่งจอด้วย (mergeGateContext · gateContextForSite) ⇒ ตัวโหลดชิปต้องเป็น dynamic import
  const ctx = live(read('lib/service/gateContext.js'));
  assert.doesNotMatch(ctx, /^import[^;]*(zoneSalesRepo|zoneSetupOrders|serviceSetup)/m, 'ห้าม import แบบ static');
  assert.match(ctx, /if \(withSetupOrders && zoneIds\.length\) \{[\s\S]*?await import\('\.\/zoneSalesRepo'\)/);
});

/* กราฟ import แบบ static ของหน้าจัดคิว — ตัว bundler ตามทางนี้ (dynamic import แยกก้อนและไม่โหลดจนกว่าจะเรียก) */
function staticGraph(entry) {
  const seen = new Set();
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const file of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    return null;
  };
  const walk = (file) => {
    if (seen.has(file) || file.endsWith('.css')) return;
    seen.add(file);
    const src = live(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)) {
      const next = resolve(file, m[1]);
      if (next) walk(next);
    }
  };
  walk(path.join(SRC, entry));
  return [...seen].map((f) => path.relative(SRC, f));
}

test('⭐ L9: กราฟ static ของหน้าจัดคิวมีตัวสร้างข้อความ แต่ไม่มีตัวติดป้าย/ตัวโหลดชิป', () => {
  const graph = staticGraph('app/service/schedule/page.js');
  assert.ok(graph.includes('components/service/GateOrderChips.js'), 'หน้าจัดคิววาดชิปผ่านการ์ด/แผงด่าน');
  assert.ok(graph.includes('lib/service/zoneSetupOrderText.js'));
  for (const heavy of ['lib/service/zoneSetupOrders.js', 'lib/service/zoneSalesRepo.js']) {
    assert.equal(graph.includes(heavy), false, `${heavy} ลาก serviceSetup.js (บิล/งวด/สิทธิ์) เข้า bundle หน้าจัดคิว`);
  }
});

test('⭐ H1: สองจุดวาดชิปไม่เรียก hook เพิ่ม — การ์ด/แผงด่านวาดข้อด่านใน .map()', () => {
  for (const [name, src] of [['ScheduleQueueCard', card], ['GatePanel', panel]]) {
    assert.equal((src.match(/useCan\(/g) || []).length, 0, `${name}: useCan อยู่ใน GateOrderChips เท่านั้น (rule 19)`);
    assert.match(src, /import GateOrderChips from "\.\/GateOrderChips";/, name);
  }
});

test('⭐ การ์ดรายการงาน: ชิปอยู่ท้ายก้อนเหตุของข้อด่าน (ใน <p className={styles.gate}>) · ส่ง item.orders ตรง ๆ', () => {
  const gateRow = card.match(/\{row\.gateItems\.map\(\(item\) => \(\s*<p key=\{item\.key\} className=\{styles\.gate\}>[\s\S]*?<\/p>\s*\)\)\}/);
  assert.ok(gateRow, 'หาแถวข้อด่านบนการ์ดไม่เจอ');
  const reason = gateRow[0].match(/<span>\s*\{item\.reason\}[\s\S]*?<\/span>\s*<\/p>/);
  assert.ok(reason, 'ก้อนเหตุของข้อด่าน');
  assert.match(reason[0], /<GateOrderChips orders=\{item\.orders\} \/>\s*<\/span>\s*<\/p>$/, 'ชิปปิดท้ายก้อนเหตุ — ไม่เป็นลูกตัวสุดท้ายของ <p> (กฎ .gate > span:last-child)');
  assert.equal((card.match(/<GateOrderChips/g) || []).length, 1);
});

test('⭐ แผงด่านในโมดัล: ชิปอยู่ท้ายก้อนเหตุ (ใน <p className={styles.detail}>) · ส่ง row.orders ตรง ๆ', () => {
  const detail = panel.match(/<p className=\{styles\.detail\}>[\s\S]*?<\/p>/);
  assert.ok(detail, 'หาบรรทัดเหตุของแผงด่านไม่เจอ');
  assert.match(detail[0], /<span className=\{styles\.reason\}>[\s\S]*?<GateOrderChips orders=\{row\.orders\} \/>\s*<\/span>/);
  assert.equal((panel.match(/<GateOrderChips/g) || []).length, 1);
  // ชิปมาพร้อมเหตุเสมอ — แถวข้อสัญญาที่ติดมีเหตุทุกครั้ง แต่เงื่อนไขเปิดก้อนต้องรวมชิปด้วย (ไม่หายเงียบเมื่อเหตุว่าง)
  assert.match(detail[0], /\{row\.detail \|\| row\.orders\?\.length \|\| \(row\.fix && onFix\) \? \(/);
});

test('CSS ของชิป: โทเคนล้วน · ห่อบรรทัดได้ที่รอยต่อท่อน (ไม่หั่นกลางชื่อ) · ไม่มีสีฮาร์ดโค้ด', () => {
  assert.match(chipsCss, /\.chips \{[^}]*flex-wrap: wrap;/);
  assert.match(chipsCss, /\.run \{[^}]*display: inline-block;/);
  assert.doesNotMatch(chipsCss.match(/\.chip \{[^}]*\}/)[0], /overflow-wrap: anywhere/, 'ห่อทั้งเส้น = หั่นชื่อคนกลางคำ');
  assert.match(chipsCss, /\.chip \{[^}]*border: 1px solid var\(--border[\w-]*\);/);
  assert.doesNotMatch(chipsCss, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'สีต้องมาจากโทเคน');
});
