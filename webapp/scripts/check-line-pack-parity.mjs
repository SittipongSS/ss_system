// ── ยอดของทุกบรรทัดยังตรงกับสูตรไหม · ลายนิ้วมือการอนุมัติยังตรงไหม (อ่านอย่างเดียว) ─────────────────────────
//
// ⭐ ทำไมต้องมี (ช่อง "แพ็ค/เดือน" ของใบเสนอราคา · mig 0407 · docs/qt-pack-column.md):
//   สูตรเงินของบรรทัดเปลี่ยนเป็น แพ็ค × จำนวน × ราคา − ส่วนลด — บรรทัดที่ไม่มีเลขแพ็คต้องได้ยอดเดิมทุกสตางค์
//   สคริปต์นี้คิด **ทุกบรรทัดบนฐานจริง** ใหม่ด้วยโค้ดชุดที่รันอยู่ แล้วเทียบกับค่าที่เก็บไว้ ห้าหัวข้อ:
//     ① บรรทัดใบเสนอราคา + บรรทัดใบสั่งขาย: สูตร JS (quoteLineNet) = lineTotal / discountAmount ที่เก็บ
//     ② บรรทัดเดียวกัน: นิพจน์ของ CHECK *_line_money_rule (ทศนิยมแท้) ไม่ปฏิเสธแถวไหน
//     ③ บรรทัดใบสั่งขายพกเลขแพ็คเท่ากับบรรทัดใบเสนอราคาต้นทาง (จุดบอดของ CHECK: เลขแพ็ค 1 ที่หายระหว่างทางก๊อป)
//     ④ ยอดหัวใบเสนอราคา (รวม · VAT · สุทธิ) = quoteTotals ของบรรทัดที่เก็บ
//     ⑤ ลายนิ้วมือการอนุมัติที่เก็บไว้ทุกใบ (ใบเสนอราคา · ใบสั่งขาย) = ที่โค้ดปัจจุบันคำนวณ
//   มีจุดต่างแม้จุดเดียว = exit 1 พร้อมตัวอย่างแถว
//   🔴 **เทียบไม่ครบ = exit 1 เหมือนกัน** — หัวข้อไหนอ่าน/เทียบได้ต่ำกว่าขั้นต่ำ (ไม่กำหนด = 1) ผล "ต่าง 0 จาก 0" ไม่ใช่หลักฐาน
//      (คีย์ที่มองไม่เห็นแถว · ชี้ผิดโปรเจกต์ ⇒ เดิมจบด้วย exit 0 ทั้งที่ไม่ได้เทียบอะไรเลย — รีวิว 08/10 js-03)
//
// Usage (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src · อ่าน .env.local):
//   node --import ./scripts/test-loader.mjs scripts/check-line-pack-parity.mjs
//       หลังเจ้าของรัน 0407 แล้ว (ก่อน merge และหลัง deploy) — อ่านคอลัมน์ packQty ตามชื่อ
//   node --import ./scripts/test-loader.mjs scripts/check-line-pack-parity.mjs --before-migration
//       ก่อนรัน 0407: ฐานยังไม่มีคอลัมน์ ⇒ อ่านบรรทัดด้วย select * (ไม่เอ่ยชื่อคอลัมน์) แล้วเทียบเหมือนกันทุกหัวข้อ
//   ตัวเลือกเสริม (ใส่ร่วมกับแบบไหนก็ได้): --expect-min-lines=<QT>,<SO>  --expect-min-fingerprints=<QT>,<SO>
//       ขั้นต่ำของ บรรทัด / ลายนิ้วมือ ที่ต้องอ่านได้ (ใบเสนอราคา,ใบสั่งขาย) — รอบหลัง deploy ใส่จำนวนของรอบก่อน merge
//       (สคริปต์พิมพ์ตัวเลือกพร้อมจำนวนของรอบนี้ให้ท้ายผล) · จำนวนลดลง = อ่านไม่ครบ = exit 1
//
// ⚠️ อ่านอย่างเดียว — มีแต่ .select() (คำขอ GET) ไม่มีการเขียนฐานเลย (dev DB = prod DB)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchAllResult } from '../src/lib/supabaseFetchAll.js';
import {
  checkRuleDiffs, fingerprintDiffs, headerTotalDiffs, lineMoneyDiffs, loadQuotationLineMoney,
  loadSalesOrderLineMoney, packCopyDiffs, parityCoverageGaps, parseParityArgs,
} from '../src/lib/sales/linePackParity.js';
import { quotationApprovalFingerprint } from '../src/lib/sales/quotationApprovalFingerprint.js';
import { salesOrderApprovalFingerprint } from '../src/lib/sales/salesOrderApprovalFingerprint.js';

const { beforeMigration, floors, problems } = parseParityArgs(process.argv.slice(2));
if (problems.length) {
  console.error(`${problems.join('\n')}\nใช้ได้: --before-migration · --expect-min-lines=<QT>,<SO> · --expect-min-fingerprints=<QT>,<SO>`);
  process.exit(2);
}

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ไม่มี .env.local — ใช้ env ของเชลล์ */ }

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('ไม่มี SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ตั้งใน .env.local)');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const die = (what, error) => {
  console.error(`✗ อ่าน ${what} ไม่สำเร็จ: ${error?.message || error}`);
  if (error?.code === '42703' && !beforeMigration) {
    console.error('  ฐานยังไม่มีคอลัมน์ packQty (ยังไม่ได้รัน migration 0407) — ตรวจก่อนรันให้ใส่ --before-migration');
  }
  process.exit(1);
};

/* ── อ่าน (GET ล้วน) ──────────────────────────────────────────────────────────────────────────────── */
const allRows = (table) => fetchAllResult(() => supabase.from(table).select('*').order('id', { ascending: true }));
const read = async (what, promise) => {
  const { data, error } = await promise;
  if (error) die(what, error);
  return data || [];
};

const quotationLines = await read('บรรทัดใบเสนอราคา', beforeMigration ? allRows('quotation_lines') : loadQuotationLineMoney(supabase));
const salesOrderLines = await read('บรรทัดใบสั่งขาย', beforeMigration ? allRows('sales_order_lines') : loadSalesOrderLineMoney(supabase));
/* หัวใบ + บรรทัดทั้งก้อน (select * — ทนได้ทั้งก่อนและหลังมีคอลัมน์) สำหรับยอดหัวใบและลายนิ้วมือ
   หน้าละ 200 ใบ: แถวที่ฝังบรรทัดมาด้วยหนัก และเพดาน 1,000 แถวนับที่หัวใบ */
const quotations = await read('ใบเสนอราคา', fetchAllResult(
  () => supabase.from('quotations').select('*, lines:quotation_lines(*)').order('id', { ascending: true }),
  { pageSize: 200 },
));
const salesOrders = await read('ใบสั่งขาย', fetchAllResult(
  () => supabase.from('sales_orders').select('*, lines:sales_order_lines(*)').order('id', { ascending: true }),
  { pageSize: 200 },
));

/* ── เทียบ ────────────────────────────────────────────────────────────────────────────────────────── */
let differences = 0;
const sample = (list) => JSON.stringify(list.slice(0, 5));
const section = (title, count, total, list = []) => {
  const okMark = count === 0 ? '✓' : '✗';
  console.log(`${okMark} ${title}: ต่าง ${count} จาก ${total}${count ? ` — ตัวอย่าง ${sample(list)}` : ''}`);
  differences += count;
};

console.log(`ฐาน: ${new URL(url).host} · โหมด: ${beforeMigration ? 'ก่อนรัน 0407 (select *)' : 'หลังรัน 0407 (อ่านคอลัมน์ packQty ตามชื่อ)'}`);
const packed = (rows) => rows.filter((r) => r.packQty !== null && r.packQty !== undefined).length;
console.log(`บรรทัดใบเสนอราคา ${quotationLines.length} (มีเลขแพ็ค ${packed(quotationLines)}) · บรรทัดใบสั่งขาย ${salesOrderLines.length} (มีเลขแพ็ค ${packed(salesOrderLines)})`);

for (const [name, rows] of [['บรรทัดใบเสนอราคา', quotationLines], ['บรรทัดใบสั่งขาย', salesOrderLines]]) {
  const money = lineMoneyDiffs(rows);
  section(`① สูตร JS = ยอดที่เก็บ · ${name}`, money.length, rows.length, money);
  const rule = checkRuleDiffs(rows);
  section(`② กฎเงินของฐาน (CHECK) ไม่ปฏิเสธ · ${name}`, rule.refused.length + rule.unreadable.length, rows.length, [...rule.refused, ...rule.unreadable]);
  console.log(`    ตรงเป๊ะ ${rows.length - rule.refused.length - rule.unreadable.length - rule.inexact.length} · ผ่านด้วยค่าคลาด 0.01 ${rule.inexact.length}`);
}

const copy = packCopyDiffs(salesOrderLines, quotationLines);
const linked = salesOrderLines.filter((r) => r.quotationLineId).length;
section('③ บรรทัดใบสั่งขายพกเลขแพ็คเท่าบรรทัดใบเสนอราคาต้นทาง', copy.length, linked, copy);

/* บรรทัดที่ฝังมากับหัวใบต้องครบเท่ากับที่อ่านจากตารางบรรทัดตรง ๆ — ไม่ครบ = หัวข้อ ④ ⑤ เทียบกับข้อมูลไม่ครบ */
const embeddedQuotationLines = quotations.reduce((sum, q) => sum + (q.lines || []).length, 0);
const embeddedOrderLines = salesOrders.reduce((sum, o) => sum + (o.lines || []).length, 0);
section('   บรรทัดที่ฝังมากับหัวใบครบ · ใบเสนอราคา', Math.abs(embeddedQuotationLines - quotationLines.length), quotationLines.length);
section('   บรรทัดที่ฝังมากับหัวใบครบ · ใบสั่งขาย', Math.abs(embeddedOrderLines - salesOrderLines.length), salesOrderLines.length);

const headers = headerTotalDiffs(quotations);
section('④ ยอดหัวใบเสนอราคา = quoteTotals ของบรรทัดที่เก็บ', headers.length, quotations.length, headers);

const quoteFp = fingerprintDiffs(quotations, quotationApprovalFingerprint);
section('⑤ ลายนิ้วมือการอนุมัติ · ใบเสนอราคา', quoteFp.diffs.length, quoteFp.checked, quoteFp.diffs);
const orderFp = fingerprintDiffs(salesOrders, salesOrderApprovalFingerprint);
section('⑤ ลายนิ้วมือการอนุมัติ · ใบสั่งขาย', orderFp.diffs.length, orderFp.checked, orderFp.diffs);
console.log(`    ใบเสนอราคา ${quotations.length} ใบ มีลายนิ้วมือ ${quoteFp.checked} · ใบสั่งขาย ${salesOrders.length} ใบ มีลายนิ้วมือ ${orderFp.checked}`);

/* ── ด่านความครบ: "ไม่มีจุดต่าง" ต้องมาจากการเทียบจริง (parityCoverageGaps — เทสต์ linePackParity.test.mjs) ────────── */
const counts = {
  quotationLines: quotationLines.length,
  salesOrderLines: salesOrderLines.length,
  quotations: quotations.length,
  salesOrders: salesOrders.length,
  linkedOrderLines: linked,
  quotationFingerprints: quoteFp.checked,
  salesOrderFingerprints: orderFp.checked,
};
const gaps = parityCoverageGaps(counts, floors);
for (const gap of gaps) console.error(`✗ เทียบไม่ครบ · ${gap.label}: ${gap.got} (ต้องไม่ต่ำกว่า ${gap.min})`);

if (differences) {
  console.error(`\n✗ พบจุดต่าง ${differences} จุด — อย่า deploy / อย่าเดินงวดถัดไปจนกว่าจะอธิบายได้ทุกจุด`);
}
if (gaps.length) {
  console.error(`\n✗ เทียบไม่ครบ ${gaps.length} หัวข้อ — ผลรอบนี้ใช้เป็นหลักฐานไม่ได้ (คีย์อ่านแถวไม่ได้ · ชี้ผิดฐาน · หรือข้อมูลหาย) ตรวจ .env.local แล้วรันใหม่`);
}
if (differences || gaps.length) process.exit(1);
console.log('\n✓ ไม่มีจุดต่าง — ยอดทุกบรรทัด · ยอดหัวใบ · ลายนิ้วมือทุกใบ ตรงกับที่เก็บไว้');
console.log(`  ตรึงจำนวนของรอบนี้ในรอบถัดไป: --expect-min-lines=${counts.quotationLines},${counts.salesOrderLines} --expect-min-fingerprints=${counts.quotationFingerprints},${counts.salesOrderFingerprints}`);
