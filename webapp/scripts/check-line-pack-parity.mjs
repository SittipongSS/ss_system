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
//   งวด PR-3 · ประตูทางเดียว (docs/qt-pack-column.md) — หัวข้อ ⑥ รันเสมอ · ⑦ ⑧ ⑨ รันเมื่อใส่ --pack-launch:
//     ⑥ ฉบับ Rev. ไม่มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค เมื่อฉบับต้นทางมีเลขแพ็ค
//     ⑦ ใบที่ยื่น/อนุมัติตั้งแต่วันเปิดช่อง ไม่มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค
//     ⑧ ไม่มีการบันทึกใบเสนอราคา (audit_logs) ที่ทำเลขแพ็คของบรรทัดหมวด 02-001 หาย — พิมพ์เลขใบ · รายการ · เลขแพ็คเดิม · ยอดเดิม
//     ⑨ ไม่มีเลขแพ็คหายข้ามสองการบันทึก (การบันทึกหนึ่งเอาบรรทัดที่มีเลขแพ็คของสินค้าออก แล้วการบันทึกถัดไปเพิ่มสินค้านั้นกลับโดยไม่มีเลขแพ็ค —
//        จุดบอดของ ⑧ และของยาม mig 0410) — พิมพ์เลขใบ · สินค้า · รายการ · เลขแพ็คเดิม · ยอดเดิม · สองการบันทึก
//   --pack-launch=<เวลา ISO มีเขตเวลา>   เวลาที่งวด PR-3 ขึ้น production (จดไว้ใน webapp/DEPLOY.md) เช่น 2026-10-12T10:00:00+07:00
//       audit_logs อ่านตั้งแต่เวลานี้ **ทุกรอบ** (การบันทึกแรกของคู่ ⑨ อยู่ก่อน --audit-since ได้) — โตตามจำนวนการบันทึกตั้งแต่วันเปิดช่อง
//   --audit-since=<เวลา ISO มีเขตเวลา>   ⑧ รายงานการบันทึกตั้งแต่เวลานี้แทนวันเปิดช่อง (ค่าของรอบที่ผ่านล่าสุด — สคริปต์พิมพ์ให้ท้ายผล)
//   --pairs-since=<เวลา ISO มีเขตเวลา>   ⑨ รายงานคู่ที่การบันทึกที่สองอยู่ตั้งแต่เวลานี้ ⇒ คู่หนึ่งถูกรายงานรอบเดียว (คู่ก่อนหน้านั้นพิมพ์เป็นข้อมูล)
//       ตัวชี้ของ ⑨ เอง — มีแต่รอบที่มีหัวข้อ ⑨ พิมพ์ให้ · ไม่ใส่ = ไล่คู่ตั้งแต่วันเปิดช่อง: --audit-since ของรอบที่ยังไม่มี ⑨ (ที่จดไว้ใน DEPLOY.md)
//       ไม่ได้รับรองคู่ของ ⑨ — ถ้า ⑨ ใช้ตัวนั้น คู่ที่เกิดก่อนเวลานั้น (รวมช่วงก่อนรัน 0410) จะถูกใช้ทิ้งโดยไม่มีใครเห็น (รีวิว 19/10)
//   --expect-min-packed=<QT>,<SO>   จำนวน **บรรทัดที่มีเลขแพ็ค** ของรอบก่อน — ใส่ทุกครั้งหลัง deploy และหลังถอยรุ่น
//       น้อยกว่า = **ต้องดู** ไม่ใช่ "รุ่นเก่าเขียนทับ" เสมอ (ลบใบร่าง/ลบบรรทัดตามปกติก็ลดได้ · ของที่หายถูกชดเชยด้วยบรรทัดใหม่ก็ไม่ลด)
//       · ใส่ --pack-launch ด้วย: ⑥–⑨ เป็นตัวตัดสิน จำนวนที่ลดเป็นข้อมูล (สคริปต์พิมพ์ว่าบรรทัดไหนถูกลบ) — เมื่อ ⑥–⑨ เจอเลขแพ็คที่หาย
//         สคริปต์ไม่บอกว่า "ลดลงตามปกติ" แต่ชี้ให้ดูหัวข้อนั้น (ครึ่งแรกของคู่ ⑨ คือบรรทัดที่ ⑧ พิมพ์ว่าถูกลบ)
//       · ไม่ใส่ --pack-launch: จำนวนที่ลด = exit 1 เพราะยังบอกไม่ได้ว่าเพราะอะไร
//
// ⚠️ อ่านอย่างเดียว — มีแต่ .select() (คำขอ GET) ไม่มีการเขียนฐานเลย (dev DB = prod DB)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchAllResult } from '../src/lib/supabaseFetchAll.js';
import {
  checkRuleDiffs, fingerprintDiffs, headerTotalDiffs, lineMoneyDiffs, loadQuotationAuditSince, loadQuotationLineMoney,
  loadSalesOrderLineMoney, packCopyDiffs, packLossAcrossSaves, packLossInAudit, packedCoverageGaps, packedLineCount, parityCoverageGaps, parseParityArgs,
  revisionPackLoss, sentWithoutPack,
} from '../src/lib/sales/linePackParity.js';
import { quotationApprovalFingerprint } from '../src/lib/sales/quotationApprovalFingerprint.js';
import { salesOrderApprovalFingerprint } from '../src/lib/sales/salesOrderApprovalFingerprint.js';

const { beforeMigration, floors, problems, packLaunch, auditSince, pairsSince } = parseParityArgs(process.argv.slice(2));
if (problems.length) {
  console.error(`${problems.join('\n')}\nใช้ได้: --before-migration · --expect-min-lines=<QT>,<SO> · --expect-min-fingerprints=<QT>,<SO> · --expect-min-packed=<QT>,<SO> · --pack-launch=<เวลา ISO> · --audit-since=<เวลา ISO> · --pairs-since=<เวลา ISO>`);
  process.exit(2);
}
/* เวลาที่รอบนี้เริ่มอ่าน — พิมพ์เป็น --audit-since ของรอบถัดไป (ก่อนอ่านแถวแรก: การบันทึกที่เกิดระหว่างรันจะถูกไล่ในรอบหน้า ไม่ตกหล่น) */
const runStartedAt = new Date().toISOString();

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
/* all = พิมพ์ทุกรายการ (⑧ ⑨ — ทุกรายการคือค่าที่ต้องกู้ ตัวที่หกขึ้นไปต้องไม่หายจากผล) · ไม่ใส่ = ตัวอย่าง 5 รายการ */
const section = (title, count, total, list = [], { all = false } = {}) => {
  const okMark = count === 0 ? '✓' : '✗';
  console.log(`${okMark} ${title}: ต่าง ${count} จาก ${total}${count ? (all ? ` — ทุกรายการ ${JSON.stringify(list)}` : ` — ตัวอย่าง ${sample(list)}`) : ''}`);
  differences += count;
};

console.log(`ฐาน: ${new URL(url).host} · โหมด: ${beforeMigration ? 'ก่อนรัน 0407 (select *)' : 'หลังรัน 0407 (อ่านคอลัมน์ packQty ตามชื่อ)'}`);
const packedCounts = { packedQuotationLines: packedLineCount(quotationLines), packedSalesOrderLines: packedLineCount(salesOrderLines) };
console.log(`บรรทัดใบเสนอราคา ${quotationLines.length} (มีเลขแพ็ค ${packedCounts.packedQuotationLines}) · บรรทัดใบสั่งขาย ${salesOrderLines.length} (มีเลขแพ็ค ${packedCounts.packedSalesOrderLines})`);

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

/* ── ประตูทางเดียว (งวด PR-3): เลขแพ็คหายตรงไหน — ตัวจับที่ชี้บรรทัด (linePackParity.js · รีวิวเงิน 09/10) ─────────────────
   ⑥ รันเสมอ (อ่านจากใบที่โหลดมาแล้ว) · ⑦ ⑧ ⑨ ต้องรู้วันเปิดช่อง (--pack-launch) — อ่าน audit_logs เพิ่ม (GET) **ตั้งแต่วันเปิดช่องทุกรอบ**:
   การบันทึกแรกของคู่ ⑨ (เอาบรรทัดที่มีเลขแพ็คออก) อยู่ก่อนตัวชี้ได้ · ⑧ นับตั้งแต่ --audit-since · การบันทึกที่สองของ ⑨ นับตั้งแต่ --pairs-since (ไม่ใส่ = วันเปิดช่อง) */
const lossSample = (list) => JSON.stringify(list.slice(0, 5));
const revLoss = revisionPackLoss(quotations);
section('⑥ ฉบับ Rev. พกเลขแพ็คครบ (ต้นทางมีเลขแพ็ค ⇒ ไม่มีบรรทัดหมวด 02-001 ที่ขาด)', revLoss.diffs.length, revLoss.checked, revLoss.diffs);
/* ตัวจับไหนเจอเลขแพ็คที่หาย — ใช้ตัดสินข้อความของจำนวนบรรทัดที่มีเลขแพ็คที่ลดลง (ข้างล่าง) */
const lossFound = { '⑥': revLoss.diffs.length, '⑦': 0, '⑧': 0, '⑨': 0 };
let auditRemoved = [];
if (packLaunch) {
  const unsent = sentWithoutPack(quotations, packLaunch);
  section(`⑦ ใบที่ยื่น/อนุมัติตั้งแต่วันเปิดช่อง (${packLaunch}) ไม่มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค`, unsent.diffs.length, unsent.checked, unsent.diffs);
  lossFound['⑦'] = unsent.diffs.length;
  const scanFrom = auditSince || packLaunch;
  const auditRows = await read('บันทึกการแก้ไขใบเสนอราคา (audit_logs)', loadQuotationAuditSince(supabase, packLaunch));
  const loss = packLossInAudit(auditRows, { since: scanFrom });
  section(`⑧ การบันทึกใบเสนอราคาตั้งแต่ ${scanFrom} ไม่ทำเลขแพ็คของบรรทัดหมวด 02-001 หาย`, loss.stripped.length, loss.compared, loss.stripped, { all: true });
  lossFound['⑧'] = loss.stripped.length;
  if (loss.stripped.length) {
    console.error('    🔴 แต่ละรายการ = ใบที่ถูกบันทึกทับโดยรุ่นที่ไม่รู้จักเลขแพ็ค (รุ่นก่อนงวด PR-1 — dev server ของ worktree เก่า · preview ของแบรนช์เก่า · production ที่ถูกถอย)');
    console.error('       rows[].packQty และ rows[].lineTotal คือค่าเดิมที่ต้องกู้คืน (rows[].row นับตามลำดับก่อนการบันทึกนั้น · rows[].now = ยอดของบรรทัดตำแหน่งเดียวกันหลังการบันทึกนั้น ไม่ใช่ยอดวันนี้)'
      + ' — ใบทั้งก้อนก่อนบันทึกอยู่ที่ audit_logs.before ของ auditId นั้น');
  }
  auditRemoved = loss.removed;
  console.log(`    อ่าน audit ${auditRows.length} แถว (ตั้งแต่วันเปิดช่อง) · ⑧ เทียบบรรทัดก่อน–หลังได้ ${loss.compared} · บรรทัดที่มีเลขแพ็คถูกลบ/ย้ายหมวดด้วยการทำงานปกติ ${auditRemoved.reduce((sum, entry) => sum + entry.rows.length, 0)} บรรทัด${auditRemoved.length ? ` — ${lossSample(auditRemoved.map(({ number, how, rows }) => ({ number, how, rows: rows.map((row) => row.row) })))}` : ''}`);
  /* ⑨ ใช้ตัวชี้ของตัวเอง (รีวิว 19/10): --audit-since ที่จดไว้ก่อนมี ⑨ ไม่ได้รับรองคู่ของ ⑨ — ใช้ตัวนั้น = คู่ที่การบันทึกที่สองอยู่ก่อนเวลานั้นถูกใช้ทิ้งเงียบ */
  const pairsFrom = pairsSince || packLaunch;
  const across = packLossAcrossSaves(auditRows, { since: pairsFrom, launch: packLaunch });
  section(`⑨ การบันทึกใบเสนอราคาตั้งแต่ ${pairsFrom} ไม่เพิ่มสินค้าที่ถูกเอาบรรทัดที่มีเลขแพ็คออกกลับมาโดยไม่มีเลขแพ็ค (เลขแพ็คหายข้ามสองการบันทึก)`, across.pairs.length, across.checked, across.pairs, { all: true });
  lossFound['⑨'] = across.pairs.length;
  if (across.pairs.length) {
    console.error('    🔴 แต่ละรายการ = สินค้าที่บรรทัดมีเลขแพ็คถูกเอาออกในการบันทึกหนึ่ง (removed — บรรทัดข้อมูลของ ⑧ นับเป็น "ถูกลบ") แล้วถูกเพิ่มกลับโดยไม่มีเลขแพ็คในการบันทึกถัดไป (readded · ฉบับ Rev. ก็ได้)');
    console.error('       ยามของ mig 0410 และ ⑧ เห็นแค่การบันทึกครั้งเดียว · รุ่นที่ทำได้: รุ่นก่อนงวด PR-1 (dev server ของ worktree เก่า · preview ของแบรนช์เก่า · production ที่ถูกถอย) หรือรุ่นของงวด PR-2');
    console.error('       rows[].packQty = เลขแพ็คเดิมที่ต้องกู้ให้รายการที่ rows[].row ของใบ (นับตามลำดับหลังการบันทึกที่สอง) · rows[].lineTotal = ยอดเดิม ใช้ตรง ๆ ได้เฉพาะเมื่อจำนวน · ราคา · ส่วนลดไม่เปลี่ยน');
    console.error('       (ค่าเดิม rows[].qty / unitPrice / discountAmount · ค่าหลังการบันทึกที่สอง rows[].now — ไม่ใช่ค่าวันนี้) ไม่งั้นกรอกเลขแพ็คในแอปให้คิดยอดใหม่ หรือคิด แพ็ค × จำนวน × ราคา − ส่วนลด');
    console.error('       ค่าเดิม null = เพิ่มกลับมากกว่าที่เอาออก ไม่มีค่าเดิมในบันทึก — คนขายต้องกรอกเอง · ใบทั้งก้อนก่อนเอาออกอยู่ที่ audit_logs.before ของ removed.auditId');
  }
  /* การบันทึกเดียวกันขึ้นทั้ง ⑧ และ ⑨ = ของหายสองรายการ (packLossAcrossSaves ไม่จดบรรทัดที่ ⑧ รายงาน) — เลขรายการของสองหัวข้อนับคนละจังหวะ */
  const strippedIds = new Set(loss.stripped.map((entry) => entry.auditId));
  const both = [...new Set(across.pairs.map((pair) => pair.readded.auditId).filter((id) => strippedIds.has(id)))];
  if (both.length) {
    console.error(`    ⚠️ การบันทึก auditId ${both.join(', ')} ขึ้นทั้ง ⑧ และ ⑨ — คนละรายการ: ⑧ = บรรทัดที่ถูกเขียนทับในการบันทึกนั้น (rows[].row นับก่อนบันทึก)`
      + ' · ⑨ = สินค้าที่ถูกเอาออกในการบันทึกก่อนหน้า (rows[].row นับหลังบันทึก · ชื่อสินค้าอยู่ที่ product) — เทียบ audit_logs.before / after ของการบันทึกนั้นก่อนกู้ทีละรายการ');
  }
  console.log(`    ⑨ ไล่การเอาบรรทัดที่มีเลขแพ็คออก ${across.removals} ครั้ง (ตั้งแต่วันเปิดช่อง) · เทียบการบันทึกตั้งแต่ ${pairsFrom} ได้ ${across.checked}`
    + ` · คู่ที่การบันทึกที่สองอยู่ก่อน ${pairsFrom} (รอบก่อนรายงานแล้ว) ${across.earlier.length}`
    + `${across.earlier.length ? ` — ${JSON.stringify(across.earlier.map(({ number, removed, readded }) => ({ number, removed: removed.auditId, readded: readded.auditId })))}` : ''}`);
  if (!pairsSince) console.log('    ⑨ ไล่คู่ตั้งแต่วันเปิดช่อง (ไม่มี --pairs-since — ตัวชี้ของ ⑨ มีแต่รอบที่มีหัวข้อ ⑨ พิมพ์ให้ · --audit-since ไม่ใช้กับ ⑨)');
} else {
  console.log('   ⑦ ⑧ ⑨ ไม่ได้ตรวจ — ใส่ --pack-launch=<เวลาที่งวด PR-3 ขึ้น production> เพื่อหาใบที่ยื่น/อนุมัติโดยขาดเลขแพ็ค และการบันทึกที่ทำเลขแพ็คหาย (ครั้งเดียว ⑧ · ข้ามสองการบันทึก ⑨)');
}

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

/* ── จำนวนบรรทัดที่มีเลขแพ็คเทียบกับรอบก่อน (packedCoverageGaps — ตรวจเมื่อใส่ --expect-min-packed) ──
   น้อยกว่า = "ต้องดู" · มี --pack-launch: หัวข้อ ⑥–⑨ ชี้บรรทัดได้แล้ว จำนวนที่ลดจึงเป็นข้อมูล (ลบใบ/ลบบรรทัดตามปกติ)
   · ไม่มี --pack-launch: ยังบอกไม่ได้ว่าเพราะอะไร = exit 1
   🔴 ประโยค "ลดลง…ตามปกติ" พูดได้เฉพาะเมื่อ ⑥–⑨ **ไม่เจออะไรเลย** — เดิมพิมพ์ทุกครั้งที่มี --pack-launch: การทำหายข้ามสองการบันทึก
      (เอาออก → บันทึก → เพิ่มกลับไม่มีเลข → บันทึก) ทำให้จำนวนลดพอดี และครึ่งแรกของมันขึ้นในบรรทัดข้อมูลของ ⑧ ว่า "ถูกลบ" ⇒ ประโยคปลอบใจ
      ชี้คนอ่านออกจากเลขแพ็คที่หายจริง · เจอ = ชี้หัวข้อนั้น (⑨ ก่อน) แทน */
const packedGaps = packedCoverageGaps(packedCounts, floors);
const packedDropBlocks = packedGaps.length > 0 && !packLaunch;
const lossMarks = Object.entries(lossFound).filter(([, count]) => count > 0).map(([mark]) => mark);
for (const gap of packedGaps) {
  const line = `${gap.label} น้อยกว่ารอบก่อน: ${gap.got} (รอบก่อน ${gap.min})`;
  if (packedDropBlocks) console.error(`✗ ต้องดู · ${line}`);
  else if (lossMarks.includes('⑨')) console.error(`✗ ต้องดู · ${line} — หัวข้อ ⑨ พบเลขแพ็คหายข้ามสองการบันทึก ⇒ ดูหัวข้อ ⑨ ก่อน: บรรทัดที่ ⑧ พิมพ์ว่าถูกลบ/ย้ายหมวดอาจเป็นครึ่งแรกของคู่นั้น`);
  else if (lossMarks.length) console.error(`✗ ต้องดู · ${line} — หัวข้อ ${lossMarks.join(' ')} พบเลขแพ็คที่หาย ⇒ ดูหัวข้อนั้นก่อน (จำนวนที่ลดอาจมาจากตรงนั้น)`);
  else console.log(`ℹ️ ${line} — หัวข้อ ⑥–⑨ ไม่พบเลขแพ็คที่หายจากบรรทัดหมวด 02-001 ⇒ ลดลงเพราะลบใบ/ลบบรรทัด/ย้ายหมวดตามปกติ`);
}

if (differences) {
  console.error(`\n✗ พบจุดต่าง ${differences} จุด — อย่า deploy / อย่าเดินงวดถัดไปจนกว่าจะอธิบายได้ทุกจุด`);
}
if (gaps.length) {
  console.error(`\n✗ เทียบไม่ครบ ${gaps.length} หัวข้อ — ผลรอบนี้ใช้เป็นหลักฐานไม่ได้ (คีย์อ่านแถวไม่ได้ · ชี้ผิดฐาน · หรือข้อมูลหาย) ตรวจ .env.local แล้วรันใหม่`);
}
if (packedDropBlocks) {
  console.error('\n✗ บรรทัดที่มีเลขแพ็คน้อยกว่ารอบก่อน — ต้องดูก่อนเดินงานต่อ: รันใหม่พร้อม --pack-launch=<เวลาที่งวด PR-3 ขึ้น production> ให้หัวข้อ ⑥–⑨ ชี้บรรทัด'
    + ' · ลดลงเพราะลบใบร่าง/ลบบรรทัดตามปกติก็ได้ — ถ้าเป็นรุ่นเก่าบันทึกทับ (ยอดหดเหลือ จำนวน × ราคา) หัวข้อ ⑧ จะบอกเลขใบ รายการ และยอดเดิม'
    + ' · ถ้าเอาออกแล้วเพิ่มสินค้าเดิมกลับโดยไม่มีเลขแพ็คในการบันทึกถัดไป หัวข้อ ⑨ จะบอก (docs/qt-pack-column.md หัวข้อประตูทางเดียว)');
}
if (differences || gaps.length || packedDropBlocks) process.exit(1);
console.log('\n✓ ไม่มีจุดต่าง — ยอดทุกบรรทัด · ยอดหัวใบ · ลายนิ้วมือทุกใบ ตรงกับที่เก็บไว้');
console.log(`  ตรึงจำนวนของรอบนี้ในรอบถัดไป: --expect-min-lines=${counts.quotationLines},${counts.salesOrderLines} --expect-min-fingerprints=${counts.quotationFingerprints},${counts.salesOrderFingerprints} --expect-min-packed=${packedCounts.packedQuotationLines},${packedCounts.packedSalesOrderLines}`);
if (packLaunch) console.log(`  รอบถัดไปไล่ audit ต่อจากรอบนี้: --pack-launch=${packLaunch} --audit-since=${runStartedAt} --pairs-since=${runStartedAt}`);
