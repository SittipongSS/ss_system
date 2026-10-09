// ── ยามทางเขียนของเลขแพ็ค: ทุกทางที่สร้าง/ก๊อป/เขียนบรรทัดใบเสนอราคาต้องพก packQty หรือปฏิเสธ (mig 0407) ─────────
//
// 🪤 โรคที่ยามนี้กัน — คีย์ที่ **หายเงียบ** ระหว่างทาง (โรคเดียวกับ saveQuotationContentColumns / quotationReviseColumns):
//   เลขแพ็คคูณเงิน ⇒ หายหนึ่งทอด = ยอดของบรรทัดกับตัวเลขบนบรรทัดไม่ตรงกัน โดยไม่มี error ถ้าเลขแพ็คเป็น 1
//   (CHECK ของฐานมองเห็นเฉพาะเลขแพ็คตั้งแต่ 2 ขึ้นไป)
//   ทางเขียนฝั่ง JS มีสี่ทาง: สร้างใบ (INSERT ตรง) · บันทึกเนื้อหา (RPC ที่ whitelist คีย์) · ออก Rev. (ลิสต์คีย์เขียนมือ + INSERT ตรง)
//   · ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน (ไม่ผ่านตัว normalize)
//
// ⭐ งวด PR-1 ช่องยังปิด — เทสต์พฤติกรรมในไฟล์นี้เปิดช่องผ่าน "ช่องสำหรับเทสต์" (`packInputOpen`) เพื่อพิสูจน์ทางเดินทั้งเส้น
//   และยามซอร์สข้างล่างห้ามโค้ดของแอปส่งค่านั้นเอง
// ⚠️ ไฟล์นี้ยึด **ตัวประกอบใน lib** (ตัว normalize · ตัว sync ราคา · ตัวประกอบเนื้อหา Rev. · ตัวสร้างใบ) + รูปของซอร์ส
//   **พฤติกรรมของสองเส้นทาง** (PATCH ใบ · ออก Rev.) — รวมทางที่ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน ยอดหัวใบ ลายนิ้วมือตอนส่ง และ "ผลของด่านถูกใช้"
//   อยู่ที่ linePackRoutes.test.mjs ซึ่งเรียกตัว handler จริงกับฐานปลอม (รีวิว 08/10 js-01: ยามซอร์สอย่างเดียวปล่อยตัวกลายพันธุ์รอดเก้าตัว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enforceMasterPrices, normalizeManualLines } from './quoteLines.js';
import { buildQuotationRevisionContent } from './quotationRevision.js';
import { QuotationDraftError, createQuotationDraft } from './createQuotationDraft.js';
import { LINE_PACK_TEXT, LinePackError, QUOTE_PACK_INPUT_OPEN, withPackColumn } from './linePacks.js';
import { quoteLineNet, quoteTotals } from '../salesPlanning.js';

/* 🔴 dev DB = prod DB: ตัดคีย์ของฐานจริงออกจากโปรเซสของไฟล์นี้ (node --test รันไฟล์ละโปรเซส) — เทสต์ข้างล่างใช้ฐานปลอมล้วน
   แต่ถ้าวันหนึ่งทางเดินของ createQuotationDraft ไปถึง recordAudit (ซึ่งหยิบ client จริงจาก env เอง) ก็ต้องเขียนอะไรไม่ได้ */
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) delete process.env[name];

const SRC = new URL('../../', import.meta.url); // webapp/src/
const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, SRC), 'utf8');

const PATCH_ROUTE = 'app/api/sales-planning/quotations/[id]/route.js';
const REVISE_ROUTE = 'app/api/sales-planning/quotations/[id]/revise/route.js';
const DRAFT_LIB = 'lib/sales/createQuotationDraft.js';
const REVISION_LIB = 'lib/sales/quotationRevision.js';
const QUOTE_LINES_LIB = 'lib/sales/quoteLines.js';

/* ตัดคอมเมนต์ทิ้งก่อนอ่านโครงสร้าง (รู้จักสตริง — '//' ใน URL ไม่ใช่คอมเมนต์) · ท่าเดียวกับ quotationReviseColumns.test.mjs */
function stripComments(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (two === '/*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch; i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') { out += src[i]; i += 1; }
        out += src[i]; i += 1;
      }
      out += src[i] ?? ''; i += 1; continue;
    }
    out += ch; i += 1;
  }
  return out;
}
const code = (relative) => stripComments(read(relative));

/* ทุกไฟล์โค้ดของแอปใต้ src/ ที่ไม่ใช่เทสต์ — คืน path แบบ relative ต่อ src/ */
function appSourceFiles() {
  const root = fileURLToPath(SRC);
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|jsx|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(path.slice(root.length).replace(/^\/+/, ''));
    }
  })(root.replace(/\/+$/, ''));
  return out;
}
const APP_FILES = appSourceFiles();

/* อาร์กิวเมนต์ของการเรียก `name(` ทุกจุดในซอร์ส (วงเล็บสมดุล) */
function callArguments(src, name) {
  const out = [];
  const pattern = new RegExp(`(?<![\\w$.])${name}\\(`, 'g');
  for (const m of src.matchAll(pattern)) {
    let depth = 0; let i = m.index + m[0].length - 1;
    for (; i < src.length; i += 1) {
      if (src[i] === '(') depth += 1;
      if (src[i] === ')') { depth -= 1; if (depth === 0) break; }
    }
    out.push(src.slice(m.index + m[0].length, i));
  }
  return out;
}

/* ═══ ยามซอร์ส ═════════════════════════════════════════════════════════════════════════════════════════ */

test('ตัวตั้งของยาม: อ่านไฟล์โค้ดของแอปได้จริง และตัวตัดคอมเมนต์ไม่กินโค้ด', () => {
  assert.ok(APP_FILES.length > 500, `อ่านได้แค่ ${APP_FILES.length} ไฟล์ — ตัวเดินโฟลเดอร์น่าจะพัง`);
  for (const file of [PATCH_ROUTE, REVISE_ROUTE, DRAFT_LIB, REVISION_LIB, QUOTE_LINES_LIB]) assert.ok(APP_FILES.includes(file), file);
  assert.equal(stripComments("a('//x'); // ทิ้ง\n/* ทิ้ง */ b(`/*y*/`);"), "a('//x'); \n b(`/*y*/`);");
  assert.deepEqual(callArguments('f(a, g(b), { c: (1) }); x.f(z); f()', 'f'), ['a, g(b), { c: (1) }', '']);
});

test('🔴 ผู้เรียก normalizeManualLines มีแค่สี่ไฟล์ที่รู้จัก — สามตัวที่รับคำขอจับ LinePackError แล้วตอบ 400 (ลืมจับ = 500 · จับแล้วเดินต่อ = ยอดหดเงียบ)', () => {
  const callers = APP_FILES.filter((file) => file !== QUOTE_LINES_LIB && /(?<![\w$.])normalizeManualLines\(/.test(code(file))).sort();
  assert.deepEqual(callers, [PATCH_ROUTE, REVISE_ROUTE, DRAFT_LIB, REVISION_LIB].sort(),
    'มีผู้เรียกใหม่ — ตัวนี้โยน LinePackError ได้แล้ว: จับแล้วตอบ 400 พร้อมข้อความ แล้วมาขึ้นทะเบียนที่นี่');
  // สองเส้นทาง: catch แล้วตอบ badRequest ด้วยข้อความของ error
  for (const file of [PATCH_ROUTE, REVISE_ROUTE]) {
    assert.match(code(file), /catch \(e\) \{\s*if \(e instanceof LinePackError\) return badRequest\(e\.message\);\s*throw e;\s*\}/, file);
  }
  // ตัวสร้างใบ: แปลงเป็น QuotationDraftError 400 (ผู้เรียกสองทางแปลงเป็นคำตอบอยู่แล้ว)
  assert.match(code(DRAFT_LIB), /catch \(e\) \{\s*if \(e instanceof LinePackError\) throw new QuotationDraftError\(e\.message, 400\);\s*throw e;\s*\}/);
  // ตัวประกอบเนื้อหา Rev. ไม่จับเอง — เส้นทางออก Rev. เรียกตัว normalize กับบรรทัดชุดเดียวกันไปก่อนแล้ว (และจับไว้)
  assert.doesNotMatch(code(REVISION_LIB), /catch/);
  const revise = code(REVISE_ROUTE);
  assert.ok(revise.indexOf('revLines = normalizeManualLines(') < revise.indexOf('buildQuotationRevisionContent(quote, body)'),
    'เส้นทางออก Rev. ต้อง normalize (ในบล็อกที่จับ error) ก่อนเรียกตัวประกอบเนื้อหา');
});

test('🔴 ช่องสำหรับเทสต์ (packInputOpen) — ประกาศสามที่ ค่าตั้งต้น = สวิตช์จริง · ไม่มีโค้ดของแอปส่งค่าให้มัน', () => {
  assert.equal(QUOTE_PACK_INPUT_OPEN, false);
  assert.match(code(QUOTE_LINES_LIB), /export function normalizeManualLines\(lines = \[\], \{ packInputOpen = QUOTE_PACK_INPUT_OPEN \} = \{\}\)/);
  assert.match(code(REVISION_LIB), /export function buildQuotationRevisionContent\(quote, body = \{\}, \{ packInputOpen = QUOTE_PACK_INPUT_OPEN \} = \{\}\)/);
  assert.match(code(DRAFT_LIB), /export async function createQuotationDraft\(\{\s*supabase, user, deal, body = \{\}, request, packInputOpen = QUOTE_PACK_INPUT_OPEN,\s*\}\)/);

  const mentions = APP_FILES.filter((file) => /packInputOpen/.test(code(file))).sort();
  assert.deepEqual(mentions, [DRAFT_LIB, REVISION_LIB, QUOTE_LINES_LIB].sort(), 'ไฟล์ที่เอ่ยชื่อช่องนี้ต้องมีแค่สามไฟล์ที่ประกาศมัน');
  for (const file of mentions) {
    const src = code(file);
    // ไม่มีใครตั้งค่าให้คีย์นี้ (`packInputOpen: …`) — ส่งต่อได้แบบย่อ `{ packInputOpen }` เท่านั้น
    assert.doesNotMatch(src, /packInputOpen\s*:/, `${file}: ห้ามส่งค่าให้ packInputOpen`);
    // ทุก `=` หลังชื่อนี้คือค่าตั้งต้นจากสวิตช์จริง
    for (const m of src.matchAll(/packInputOpen\s*=\s*([^,)}\s]+)/g)) assert.equal(m[1], 'QUOTE_PACK_INPUT_OPEN', `${file}: ${m[0]}`);
  }
  // ตัว normalize ถูกเรียกพร้อมตัวเลือกได้แค่ `{ packInputOpen }` ที่ส่งต่อมา — route เรียกแบบไม่มีตัวเลือก
  for (const file of [PATCH_ROUTE, REVISE_ROUTE]) {
    for (const args of callArguments(code(file), 'normalizeManualLines')) assert.doesNotMatch(args, /\{/, `${file}: route ห้ามส่งตัวเลือกให้ตัว normalize`);
    for (const args of callArguments(code(file), 'buildQuotationRevisionContent')) assert.equal(args.trim(), 'quote, body', file);
  }
  // ผู้เรียกตัวสร้างใบ (เส้นทางมาตรฐาน · สายสหมิตร) — ไฟล์ที่ประกาศฟังก์ชันเองไม่นับ
  const draftCallers = APP_FILES.filter((file) => file !== DRAFT_LIB && callArguments(code(file), 'createQuotationDraft').length);
  assert.ok(draftCallers.length >= 2, `ต้องเจอผู้เรียกตัวสร้างใบอย่างน้อยสองทาง — เจอ ${draftCallers.join(', ') || 'ไม่มี'}`);
  for (const file of draftCallers) {
    for (const args of callArguments(code(file), 'createQuotationDraft')) assert.doesNotMatch(args, /packInputOpen/, `${file}: ผู้เรียกตัวสร้างใบห้ามส่ง packInputOpen`);
  }
});

test('🔴 ด่านเลขแพ็ค (linePackIssues) — สามจุด ตัวเลือกตามมติ: บันทึกเนื้อหา = ค่าตั้งต้น · ออก Rev. = ไม่บังคับกรอก · สร้างใบ = ไม่บังคับเฉพาะบรรทัดที่ตั้งต้นจากโครงการ', () => {
  const callers = APP_FILES.filter((file) => file !== 'lib/sales/linePacks.js' && /(?<![\w$.])linePackIssues\(/.test(code(file))).sort();
  assert.deepEqual(callers, [PATCH_ROUTE, REVISE_ROUTE, DRAFT_LIB].sort());
  // บันทึกเนื้อหา (มติ A4): วันที่เปิดช่อง ทุกบรรทัดหมวด 02-001 ต้องมีเลขแพ็ค — และเป็นด่านเดียวของทางที่ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน
  assert.deepEqual(callArguments(code(PATCH_ROUTE), 'linePackIssues'), ['newLines']);
  // ออก Rev. (มติ 08/10 ข้อ 3): ก๊อปบรรทัดตามที่เป็น — ด่านบังคับกรอกทักตอนบันทึก/ส่งร่างฉบับนั้น
  assert.deepEqual(callArguments(code(REVISE_ROUTE), 'linePackIssues'), ['revisionLines, { requireOnCategory: false }']);
  // สร้างใบ: ช่องเทสต์ป้อนทั้งตัว normalize และด่าน · บรรทัดที่ตั้งต้นจากโครงการยังไม่มีใครกรอก
  assert.deepEqual(callArguments(code(DRAFT_LIB), 'linePackIssues'), ['lines, { open: packInputOpen, requireOnCategory: !seeded }']);
  // ไม่มีจุดไหนเปิดด่านด้วยค่าตรง ๆ
  for (const file of callers) {
    for (const args of callArguments(code(file), 'linePackIssues')) assert.doesNotMatch(args, /(?<![\w$])open\s*:\s*(?!packInputOpen\b)\S/, `${file}: ${args}`);
  }
  // ด่านอยู่ **ก่อน** ทุกการเขียน: PATCH ก่อน RPC · Rev. ก่อน INSERT หัวใบ · สร้างใบก่อนออกเลขใบ
  const patch = code(PATCH_ROUTE);
  assert.ok(patch.indexOf('linePackIssues(newLines)') < patch.indexOf("rpc('save_quotation_content'"));
  assert.ok(patch.indexOf('enforceMasterPrices(supabase, newLines') < patch.indexOf('linePackIssues(newLines)'), 'ตรวจบรรทัดชุดสุดท้ายหลัง sync ราคา');
  const revise = code(REVISE_ROUTE);
  assert.ok(revise.indexOf('linePackIssues(revisionLines') < revise.indexOf('.insert({'));
  const nextRevRead = revise.indexOf(".eq('baseNumber', base)");
  assert.ok(nextRevRead > 0, 'หาจุดอ่านเลข Rev. ถัดไปไม่เจอ — ไฟล์เปลี่ยนท่าเขียน');
  assert.ok(revise.indexOf('linePackIssues(revisionLines') < nextRevRead, 'ก่อนอ่าน/เขียนอะไรของฉบับใหม่ (จุดแรกคืออ่านเลข Rev. ถัดไป)');
  const draft = code(DRAFT_LIB);
  assert.ok(draft.indexOf('linePackIssues(lines') < draft.indexOf('insertQuotationWithNumber(supabase'));
  assert.ok(draft.indexOf('seedLinesFromProject(supabase, deal)') < draft.indexOf('linePackIssues(lines'), 'ตรวจหลังตั้งต้นจากโครงการ');
});

test('🔴 INSERT ตรงลงตารางบรรทัดมีสองจุดที่รู้จัก และทั้งสองผ่าน withPackColumn (ทุกแถวของคำขอเดียวรูปเดียวกัน · ไม่เอ่ยชื่อคอลัมน์เมื่อไม่มีเลขแพ็ค)', () => {
  const found = [];
  for (const file of APP_FILES) {
    const src = code(file);
    for (const m of src.matchAll(/\.from\(\s*['"`](quotation_lines|sales_order_lines)['"`]\s*\)\s*\.(insert|upsert)\(/g)) {
      const start = m.index + m[0].length;
      let depth = 1; let i = start;
      for (; i < src.length && depth > 0; i += 1) { if (src[i] === '(') depth += 1; if (src[i] === ')') depth -= 1; }
      found.push({ file, table: m[1], verb: m[2], arg: src.slice(start, i - 1).trim(), src });
    }
  }
  assert.deepEqual(found.map((f) => `${f.file} ${f.table}.${f.verb}`).sort(), [
    `${REVISE_ROUTE} quotation_lines.insert`, `${DRAFT_LIB} quotation_lines.insert`,
  ].sort(), 'มีทางเขียนบรรทัดตรง ๆ เพิ่ม/หาย — ทางใหม่ต้องพก packQty ผ่าน withPackColumn แล้วมาขึ้นทะเบียนที่นี่');
  for (const { file, arg, src } of found) {
    const direct = /^withPackColumn\(/.test(arg);
    const viaConst = /^[A-Za-z_$][\w$]*$/.test(arg) && new RegExp(`const ${arg} = withPackColumn\\(`).test(src);
    assert.ok(direct || viaConst, `${file}: .insert(${arg}) ต้องเป็นผลของ withPackColumn(...)`);
  }
});

test('🔴 ลิสต์คีย์เขียนมือของบรรทัดฉบับ Rev. มีทุกคีย์ที่ตัว normalize คืน — รวม packQty ในรูปที่ไม่เอ่ยชื่อคอลัมน์เมื่อไม่มีเลขแพ็ค', () => {
  const src = code(REVISE_ROUTE);
  const from = src.indexOf('const lineRows = revisionLines.map(');
  const to = src.indexOf('}));', from);
  assert.ok(from > 0 && to > from, 'หาลิสต์คีย์ของบรรทัดฉบับ Rev. ไม่เจอ — ไฟล์ย้ายหรือเปลี่ยนท่าเขียน');
  const map = src.slice(from, to);
  // รูปที่ตรึงไว้: เอ่ยชื่อคอลัมน์เฉพาะบรรทัดที่มีเลขแพ็ค (0 ไม่ใช่ค่าว่าง — ส่งต่อให้ฐานปฏิเสธ ไม่ใช่หายเงียบ)
  assert.ok(map.includes('...(l.packQty != null ? { packQty: l.packQty } : {}),'), 'ลิสต์คีย์ของ Rev. ต้องพก packQty');
  // ทุกคีย์ที่ตัว normalize คืนได้ (บรรทัดที่มีเลขแพ็ค = ชุดเต็ม) ต้องมีในลิสต์ — เพิ่มคีย์ใหม่ให้บรรทัดแล้วลืม Rev. = แดง
  const [full] = normalizeManualLines([{ description: 'x', qty: 1, unitPrice: 1, packQty: 2 }], { packInputOpen: true });
  for (const key of Object.keys(full)) {
    assert.match(map, new RegExp(`(?<![\\w$.])${key}\\s*:`), `ลิสต์คีย์ของบรรทัดฉบับ Rev. ไม่มี "${key}" ⇒ หายเงียบทุกครั้งที่ออก Rev.`);
  }
  assert.match(map, /quotationId\s*:\s*newId/);
});

test('ทางเขียนทั้งสามแปลง error ของ CHECK 0407 (กฎเงินของบรรทัด · ช่วงเลขแพ็ค) เป็นข้อความไทย — ไม่โยนชื่อ constraint ดิบขึ้นจอ', () => {
  assert.match(code(PATCH_ROUTE), /if \(error\) return fail\(lineMoneyRuleMessage\(error\) \|\| error\.message, 500\);/);
  assert.match(code(REVISE_ROUTE), /return fail\(lineMoneyRuleMessage\(lineErr\) \|\| lineErr\.message, 500\);/);
  assert.match(code(DRAFT_LIB), /throw new QuotationDraftError\(lineMoneyRuleMessage\(lineError\) \|\| lineError\.message, 500\);/);
  // ถอยใบที่สร้างค้างยังอยู่ครบ (ไม่มีทรานแซกชันข้ามสองคำขอ)
  assert.match(code(REVISE_ROUTE), /if \(lineErr\) \{\s*await supabase\.from\('quotations'\)\.delete\(\)\.eq\('id', newId\);/);
  assert.match(code(DRAFT_LIB), /if \(lineError\) \{\s*await supabase\.from\('quotations'\)\.delete\(\)\.eq\('id', quote\.id\);/);
});

/* ── ทางบันทึกเนื้อหา: RPC whitelist คีย์ของบรรทัด ─────────────────────────────────────────────────────── */

const SAVE_FN = 'save_quotation_content';
const stripSqlComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* รายการคอลัมน์ที่ตัวบันทึกเนื้อหา "รับได้จริง" จากแต่ละบรรทัดของ p_lines
   = ชนิดของ jsonb_to_recordset ในนิยามล่าสุด (ไฟล์เลขสูงสุดที่ CREATE OR REPLACE ตัวนี้)
   + คอลัมน์ที่ 0407 ปะเพิ่ม (แถว Q3) เมื่อเจ้าของนิยามล่าสุดอยู่ก่อน 0407
   ⇒ migration หลังจากนี้ที่เขียนฟังก์ชันทับทั้งก้อน **ต้องมี "packQty" ในลิสต์ของตัวเอง** ไม่งั้นเทสต์นี้แดง */
function saveRecordsetColumns() {
  const files = readdirSync(MIGRATIONS).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
  const definer = files.filter((name) => new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${SAVE_FN}\\s*\\(`, 'i')
    .test(stripSqlComments(readFileSync(new URL(name, MIGRATIONS), 'utf8')))).pop();
  assert.ok(definer, `ต้องมี migration ที่นิยาม ${SAVE_FN}`);
  const sql = stripSqlComments(readFileSync(new URL(definer, MIGRATIONS), 'utf8'));
  const body = sql.slice(sql.search(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${SAVE_FN}\\s*\\(`, 'i')));
  const m = /FROM jsonb_to_recordset\(p_lines\) AS x\(([\s\S]*?)\);/.exec(body);
  assert.ok(m, `อ่านชนิดของ jsonb_to_recordset จาก ${definer} ไม่ได้`);
  const columns = new Map(m[1].split(',').map((part) => {
    const col = /^\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+([a-z]+)/.exec(part);
    assert.ok(col, `อ่านคอลัมน์ไม่ได้: ${part}`);
    return [col[1], col[2]];
  }));
  let patchedBy = null;
  if (Number(definer.slice(0, 4)) < 407) {
    const patch = readFileSync(new URL('0407_quotation_line_pack_qty.sql', MIGRATIONS), 'utf8');
    // แถว Q3 ของ §4: ข้อความใหม่ที่ต่อท้ายชนิดของ recordset
    const q3 = /\$rp\$\\1, "([A-Za-z]+)" ([a-z]+) \/\* 0407\/Q3 \*\/\\2\$rp\$,\s*'0407\/Q3'\)/.exec(patch);
    assert.ok(q3, 'หาแถวปะ Q3 ใน 0407 ไม่เจอ');
    assert.match(patch, new RegExp(`\\('${SAVE_FN}',\\s*\\$re\\$[^\\n]*\\$re\\$,\\s*\\$rp\\$\\\\1, "packQty" integer /\\* 0407/Q3 \\*/`), 'แถว Q3 ต้องเป็นของตัวบันทึกเนื้อหา');
    columns.set(q3[1], q3[2]);
    patchedBy = '0407';
  }
  return { definer, patchedBy, columns };
}

test('🔴 ทุกคีย์ที่ตัว normalize ส่งเข้า p_lines มีคอลัมน์รองรับในตัวบันทึกเนื้อหา — packQty เป็นจำนวนเต็ม (คีย์ที่ไม่มีในลิสต์ถูกทิ้งเงียบ)', () => {
  const { definer, patchedBy, columns } = saveRecordsetColumns();
  assert.equal(columns.get('packQty'), 'integer',
    `นิยามล่าสุดของ ${SAVE_FN} (${definer}${patchedBy ? ` + แพตช์ ${patchedBy}` : ''}) ไม่รับ "packQty" ⇒ เลขแพ็คหายเงียบทุกครั้งที่บันทึกใบ`);
  const [full] = normalizeManualLines([{ description: 'x', qty: 1, unitPrice: 1, packQty: 2 }], { packInputOpen: true });
  const [plain] = normalizeManualLines([{ description: 'x', qty: 1, unitPrice: 1 }]);
  assert.deepEqual(Object.keys(full).filter((key) => !(key in plain)), ['packQty']);
  for (const key of Object.keys(full)) {
    assert.ok(columns.has(key), `${definer}: recordset ของ p_lines ไม่มี "${key}" ⇒ ค่าที่ตัว normalize ส่งไปถูกทิ้งเงียบ`);
  }
  // เส้นทางบันทึกส่งบรรทัดชุดสุดท้ายเข้า RPC ทั้งก้อน (ไม่กรองคีย์เอง) — เลขแพ็คจึงไปถึง recordset
  const patch = code(PATCH_ROUTE);
  assert.match(patch, /const rows = newLines \|\| null;/);
  assert.match(patch, /p_lines: rows,/);
});

/* ═══ พฤติกรรม: ทางออก Rev. ทั้งเส้น ═══════════════════════════════════════════════════════════════════ */

const SDS_FG = 'FG-278-02-001-0757';
const productsDb = (products) => ({
  from: (table) => {
    if (table === 'product_types') return { select: async () => ({ data: [], error: null }) };
    assert.equal(table, 'products', `unexpected table: ${table}`);
    return { select: () => ({ in: async (_col, ids) => ({ data: products.filter((p) => ids.includes(p.id)), error: null }) }) };
  },
});
/* บรรทัดที่เก็บไว้ของใบเดิม หน้าตาแบบที่ select * คืน (มีคีย์ที่ตารางเติมเอง) */
const storedLine = (over = {}) => ({
  id: 'QTL-old', quotationId: 'QT-old', productId: 'P1', fgCode: SDS_FG, description: 'ระบบกระจายกลิ่น SDS', qty: 12, unit: 'เดือน',
  unitPrice: 3500, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 42000, source: 'manual', sortOrder: 0,
  metadata: {}, serviceRoundsIgnored: undefined, createdAt: '2026-10-01T00:00:00Z', packQty: null, ...over,
});

test('⭐ ออก Rev. ทั้งเส้น (normalize → ราคาทะเบียนขยับ → ประกอบเนื้อหา → แถว INSERT): เลขแพ็ค 1 และ 2 รอด · ยอด = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลด', async () => {
  const quote = {
    discountType: null, discountValue: 0, vatRate: 7, paymentPlan: { type: 'full' }, paymentTerms: null, validUntil: null, notes: null, referenceNote: null,
    lines: [
      storedLine({ id: 'QTL-1', packQty: 2, discountType: 'amount', discountValue: 14400, discountAmount: 14400, lineTotal: 69600 }),
      storedLine({ id: 'QTL-2', productId: 'P2', packQty: 1, sortOrder: 1 }),
      storedLine({ id: 'QTL-3', productId: null, fgCode: null, description: 'ค่าติดตั้ง', qty: 1, unit: 'งาน', unitPrice: 500, lineTotal: 500, sortOrder: 2 }),
    ],
  };
  const master = [
    { id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 4000 },
    { id: 'P2', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 4000 },
  ];
  // ลำดับเดียวกับเส้นทาง: normalize → enforceMasterPrices → buildQuotationRevisionContent (normalize อีกรอบข้างใน)
  const revLines = normalizeManualLines(quote.lines, { packInputOpen: true });
  const body = { lines: await enforceMasterPrices(productsDb(master), revLines, quote.lines) };
  const revision = buildQuotationRevisionContent(quote, body, { packInputOpen: true });
  assert.equal(revision.ok, true);
  assert.deepEqual(revision.lines.map((l) => l.packQty), [2, 1, undefined]);
  assert.deepEqual(revision.lines.map((l) => l.unitPrice), [4000, 4000, 500]);
  assert.deepEqual(revision.lines.map((l) => l.lineTotal), [81600, 48000, 500], '2 × 12 × 4,000 − 14,400 · 1 × 12 × 4,000 · บรรทัดพิมพ์เองเท่าเดิม');
  assert.deepEqual(revision.lines.map((l) => l.unit), ['เดือน', 'เดือน', 'งาน']);
  assert.deepEqual(revision.totals, quoteTotals(revision.lines, { vatRate: 7 }));
  assert.equal(revision.totals.subtotal, 130100);
  for (const line of revision.lines) assert.equal(line.lineTotal, quoteLineNet(line).lineTotal, 'ยอดของบรรทัด = สูตรกลางของบรรทัดนั้น');
  // แถวที่เส้นทางจะ INSERT: รูปของลิสต์คีย์ใน route (ยามซอร์สข้างบนตรึงรูปนี้) แล้วผ่าน withPackColumn
  const rows = withPackColumn(revision.lines.map((l) => ({
    id: 'new', lineTotal: l.lineTotal, ...(l.packQty != null ? { packQty: l.packQty } : {}),
  })));
  assert.deepEqual(rows.map((r) => r.packQty), [2, 1, null], 'ทุกแถวมีคีย์ — บรรทัดที่ไม่มีเลขแพ็คส่ง null ชัด ๆ');
});

test('🔴 ออก Rev. ขณะช่องปิด: บรรทัดที่เก็บไว้มีเลขแพ็ค = ปฏิเสธพร้อมเลขรายการ ไม่ใช่ออกฉบับใหม่ที่เลขแพ็คหาย', () => {
  const lines = [storedLine({ packQty: 2, lineTotal: 84000 }), storedLine({ id: 'QTL-2', sortOrder: 1 }), storedLine({ id: 'QTL-3', packQty: 1, sortOrder: 2 })];
  let error = null;
  try { normalizeManualLines(lines); } catch (e) { error = e; }
  assert.ok(error instanceof LinePackError);
  assert.equal(error.message, `รายการ 1, 3: ${LINE_PACK_TEXT.closed}`);
  // ตัวประกอบเนื้อหาเองก็ปฏิเสธเมื่อไม่ได้รับช่องเทสต์ (ค่าตั้งต้น = สวิตช์จริง)
  assert.throws(() => buildQuotationRevisionContent({ lines, vatRate: 7 }, {}), LinePackError);
  assert.throws(() => buildQuotationRevisionContent({ lines: [], vatRate: 7 }, { lines }), LinePackError);
});

test('ออก Rev. ของใบที่ไม่มีเลขแพ็ค (ทุกใบวันนี้ · packQty: null จาก select *): เนื้อหาเท่าเดิม ไม่มีคีย์ packQty ในบรรทัดไหนเลย', async () => {
  const lines = [storedLine(), storedLine({ id: 'QTL-2', qty: 24, discountType: 'amount', discountValue: 14400, discountAmount: 14400, lineTotal: 69600, sortOrder: 1 })];
  const master = [{ id: 'P1', fgCode: SDS_FG, productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 3500 }];
  const quote = { lines, discountType: null, discountValue: 0, vatRate: 7, paymentPlan: { type: 'full' } };
  const body = { lines: await enforceMasterPrices(productsDb(master), normalizeManualLines(lines), lines) };
  const revision = buildQuotationRevisionContent(quote, body);
  assert.deepEqual(revision.lines.map((l) => l.lineTotal), [42000, 69600]);
  assert.deepEqual(revision.lines.map((l) => l.unit), ['แพ็คเกจ', 'แพ็คเกจ'], 'หน่วยขายของทะเบียนตามเดิม');
  for (const line of revision.lines) assert.equal('packQty' in line, false);
  const rows = withPackColumn(revision.lines.map((l) => ({ id: 'new', ...(l.packQty != null ? { packQty: l.packQty } : {}) })));
  for (const row of rows) assert.equal('packQty' in row, false, 'คำขอ INSERT ไม่เอ่ยชื่อคอลัมน์');
});

/* ═══ พฤติกรรม: ทางสร้างใบ (createQuotationDraft) ด้วยฐานปลอม ═══════════════════════════════════════════ */

const MONEY_RULE_ERROR = { code: '23514', message: 'new row for relation "quotation_lines" violates check constraint "quotation_lines_line_money_rule"' };

/* ฐานปลอมของทางสร้างใบ — INSERT ของบรรทัดตอบ error เสมอ (ค่าตั้งต้น = CHECK ของ 0407 ปฏิเสธ)
   ⇒ เก็บแถวที่ถูกส่งไป INSERT ได้ และทางเดินจบที่ "ถอยใบ" ก่อนถึงการขยับดีล / audit (ซึ่งไม่ใช่เรื่องของเทสต์นี้) */
function draftDb({ products = [], projectRows = [], lineInsertError = MONEY_RULE_ERROR } = {}) {
  const calls = { tables: [], rpc: [], rpcRows: [], lineInserts: [], quotationDeletes: [] };
  const maybeSingle = (data) => ({ maybeSingle: async () => ({ data, error: null }) });
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === 'products') return { select: () => ({ in: async (_col, ids) => ({ data: products.filter((p) => ids.includes(p.id)), error: null }) }) };
      if (table === 'product_types') return { select: async () => ({ data: [], error: null }) };
      if (table === 'project_products') return { select: () => ({ eq: async () => ({ data: projectRows, error: null }) }) };
      if (table === 'customers') return { select: () => ({ eq: () => maybeSingle({ taxId: null, nameEn: null, addresses: [], contacts: [] }) }) };
      if (table === 'document_standard_versions') return { select: () => ({ eq: () => ({ eq: () => maybeSingle(null) }) }) };
      if (table === 'quotation_lines') {
        return { insert: (rows) => { calls.lineInserts.push(rows); return { select: async () => ({ data: null, error: lineInsertError }) }; } };
      }
      if (table === 'quotations') return { delete: () => ({ eq: async (_col, id) => { calls.quotationDeletes.push(id); return { error: null }; } }) };
      throw new Error(`unexpected table: ${table}`);
    },
    rpc: async (name, args) => {
      calls.rpc.push(name);
      assert.equal(name, 'create_quotation_with_number');
      // หัวใบที่ถูกส่งไปออกเลข (ยอดหัวใบอยู่ในก้อนนี้) — เก็บไว้ให้เทสต์เทียบกับบรรทัดชุดเดียวกัน
      calls.rpcRows.push(args.p_row);
      return { data: { ...args.p_row, quoteNumber: 'QT-TEST-0' }, error: null };
    },
  };
}
const DEAL = { id: 'DL-1', customerId: 'CUS-1', customerName: 'ลูกค้าทดสอบ', projectId: 'PJ-1', stage: 'quotation', ownerId: null };
const USER = { id: 'U-1', name: 'ผู้ทดสอบ' };
const MASTER = [
  { id: 'P1', fgCode: SDS_FG, customerId: 'CUS-1', productDescription: 'ระบบกระจายกลิ่น SDS', saleUnit: 'แพ็คเกจ', costPrice: 3500 },
  { id: 'P9', fgCode: 'FG-336-01-009-1290', customerId: 'CUS-1', productDescription: 'น้ำหอม', saleUnit: 'ชิ้น', costPrice: 100 },
];
const draftLine = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'ระบบกระจายกลิ่น SDS', qty: 12, unitPrice: 3500, ...over });
const rejected = async (promise) => {
  try { await promise; } catch (error) { return error; }
  return null;
};
/* หัวใบที่ส่งเข้า RPC ออกเลข พูดยอดเดียวกับบรรทัดที่ถูก INSERT — เทียบสามทาง: ตัวเลขที่ตรึงไว้ · ผลรวม lineTotal ของแถวที่ INSERT ·
   quoteTotals ของแถวชุดนั้น (สูตรกลาง) */
function headerEqualsLines(db, rows, expected) {
  assert.equal(db.calls.rpcRows.length, 1, 'ออกเลขใบครั้งเดียว');
  const header = db.calls.rpcRows[0];
  const got = { subtotal: header.subtotal, discountAmount: header.discountAmount, vatAmount: header.vatAmount, totalAmount: header.totalAmount };
  assert.deepEqual(got, expected, 'ยอดหัวใบที่ส่งเข้า RPC ออกเลข');
  assert.equal(header.subtotal, rows.reduce((sum, row) => sum + row.lineTotal, 0), 'subtotal ของหัวใบ = ผลรวม lineTotal ของบรรทัดที่ INSERT');
  assert.deepEqual(got, quoteTotals(rows, { discountType: header.discountType, discountValue: header.discountValue, vatRate: header.vatRate }));
  assert.equal(header.vatRate, 7);
}

test('🔴 สร้างใบขณะช่องปิด (ค่าตั้งต้น): ส่งเลขแพ็คมา = QuotationDraftError 400 ที่บอกเลขรายการ — ไม่แตะฐานเลยสักคำสั่ง', async () => {
  const untouched = { from: () => { throw new Error('must not query'); }, rpc: () => { throw new Error('must not call rpc'); } };
  for (const packQty of [2, '2', 1, 0, 'abc']) {
    const error = await rejected(createQuotationDraft({
      supabase: untouched, user: USER, deal: DEAL, body: { lines: [draftLine(), draftLine({ packQty })] },
    }));
    assert.ok(error instanceof QuotationDraftError, `packQty=${JSON.stringify(packQty)}`);
    assert.equal(error.status, 400);
    assert.equal(error.message, `รายการ 2: ${LINE_PACK_TEXT.closed}`);
  }
});

test('สร้างใบที่ไม่มีเลขแพ็ค (ทุกคำขอวันนี้): แถวที่ INSERT ไม่มีคีย์ packQty สักแถว — คำขอหน้าตาเดิม ใช้ได้แม้ฐานยังไม่มีคอลัมน์', async () => {
  const db = draftDb({ products: MASTER });
  const error = await rejected(createQuotationDraft({
    supabase: db, user: USER, deal: DEAL,
    body: { lines: [draftLine(), draftLine({ packQty: null }), draftLine({ productId: 'P9', fgCode: 'FG-336-01-009-1290', qty: 3, packQty: '' })] },
  }));
  assert.equal(db.calls.lineInserts.length, 1);
  const rows = db.calls.lineInserts[0];
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal('packQty' in row, false);
    assert.equal(row.quotationId, db.calls.quotationDeletes[0]);
  }
  assert.deepEqual(rows.map((r) => r.lineTotal), [42000, 42000, 300]);
  assert.deepEqual(rows.map((r) => r.unit), ['แพ็คเกจ', 'แพ็คเกจ', 'ชิ้น']);
  // ยอดหัวใบที่ส่งเข้า RPC ออกเลข = ผลรวมของบรรทัดชุดเดียวกัน (VAT ตั้งต้น 7) — ตัวเลขของวันนี้ตรึงไว้ด้วย
  headerEqualsLines(db, rows, { subtotal: 84300, discountAmount: 0, vatAmount: 5901, totalAmount: 90201 });
  // ฐานปลอมตอบว่า CHECK ของ 0407 ปฏิเสธ ⇒ ข้อความไทย + ถอยใบที่เพิ่งสร้าง
  assert.ok(error instanceof QuotationDraftError);
  assert.deepEqual([error.status, error.message], [500, LINE_PACK_TEXT.moneyRule]);
  assert.equal(db.calls.quotationDeletes.length, 1);
});

test('⭐ สร้างใบ (ช่องเปิดในเทสต์): ทุกแถวที่ INSERT มีคีย์ packQty รูปเดียวกัน · ยอด = แพ็ค × จำนวน × ราคาทะเบียน · หน่วย = เดือน', async () => {
  const db = draftDb({ products: MASTER });
  const error = await rejected(createQuotationDraft({
    supabase: db, user: USER, deal: DEAL, packInputOpen: true,
    body: {
      lines: [
        draftLine({ packQty: 2, unitPrice: 1, discountType: 'amount', discountValue: 14400 }), // ราคาที่จอส่งมาไม่ถูกใช้ — ทะเบียน 3,500
        draftLine({ packQty: '1' }),
        draftLine({ productId: 'P9', fgCode: 'FG-336-01-009-1290', qty: 3 }),
      ],
    },
  }));
  const rows = db.calls.lineInserts[0];
  assert.deepEqual(rows.map((r) => r.packQty), [2, 1, null]);
  for (const row of rows) assert.equal('packQty' in row, true, 'ทุกแถวของคำขอเดียวต้องมีคีย์ชุดเดียวกัน');
  assert.deepEqual(rows.map((r) => r.lineTotal), [69600, 42000, 300], '2 × 12 × 3,500 − 14,400 · 1 × 12 × 3,500 · 3 × 100');
  assert.deepEqual(rows.map((r) => r.unit), ['เดือน', 'เดือน', 'ชิ้น']);
  /* 🐞 รีวิว 08/10 (js-02): เดิมบรรทัดนี้เช็กแค่ชื่อ RPC ทั้งที่คอมเมนต์บอกว่าเช็กยอดหัวใบ — ตัวกลายพันธุ์ที่คิดยอดหัวใบจากบรรทัด
     ที่ถูกถอดเลขแพ็ค (subtotal 69,900 ทั้งที่บรรทัดรวม 111,900) จึงรอด · ฐานไม่มีกฎผูกหัวใบกับบรรทัด และ SO/Actual อ่านยอดหัวใบ
     ⇒ ยอดหัวใบที่ส่งเข้า RPC ออกเลข = ผลรวมของบรรทัดชุดเดียวกัน (VAT ตั้งต้น 7): 69,600 + 42,000 + 300 = 111,900 */
  assert.deepEqual(db.calls.rpc, ['create_quotation_with_number']);
  headerEqualsLines(db, rows, { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
  assert.ok(error instanceof QuotationDraftError);
  assert.equal(error.message, LINE_PACK_TEXT.moneyRule);
});

test('สร้างใบ (ช่องเปิดในเทสต์): หมวด 02-001 ที่คนกรอกเองไม่มีเลขแพ็ค = ปฏิเสธ · มีเลขบนหมวดอื่น = ปฏิเสธ — ก่อนออกเลขใบ', async () => {
  const db = draftDb({ products: MASTER });
  const required = await rejected(createQuotationDraft({
    supabase: db, user: USER, deal: DEAL, packInputOpen: true, body: { lines: [draftLine({ packQty: 2 }), draftLine()] },
  }));
  assert.deepEqual([required.status, required.message], [400, `รายการ 2: ${LINE_PACK_TEXT.required}`]);
  const notAllowed = await rejected(createQuotationDraft({
    supabase: db, user: USER, deal: DEAL, packInputOpen: true,
    body: { lines: [draftLine({ productId: 'P9', fgCode: 'FG-336-01-009-1290', packQty: 2 })] },
  }));
  assert.deepEqual([notAllowed.status, notAllowed.message], [400, `รายการ 1: ${LINE_PACK_TEXT.notAllowed}`]);
  assert.deepEqual(db.calls.rpc, [], 'ไม่มีการออกเลขใบ');
  assert.deepEqual(db.calls.lineInserts, []);
});

test('สร้างใบจากบรรทัดของโครงการ (ช่องเปิดในเทสต์): บรรทัดหมวด 02-001 ที่ระบบตั้งต้นให้ยังไม่ถูกบังคับเลขแพ็ค — ด่านทักตอนบันทึก/ส่งครั้งถัดไป', async () => {
  const projectRows = [{ id: 'PP-1', productId: 'P1', orderQty: '12', product: MASTER[0] }];
  for (const packInputOpen of [true, undefined]) {
    const db = draftDb({ products: MASTER, projectRows });
    const error = await rejected(createQuotationDraft({
      supabase: db, user: USER, deal: DEAL, body: { seedFromProject: true }, ...(packInputOpen ? { packInputOpen } : {}),
    }));
    assert.equal(db.calls.lineInserts.length, 1, 'ผ่านด่านเลขแพ็คไปถึง INSERT');
    const rows = db.calls.lineInserts[0];
    assert.deepEqual(rows.map((r) => [r.fgCode, r.lineTotal, r.unit, 'packQty' in r]), [[SDS_FG, 42000, 'แพ็คเกจ', false]]);
    assert.equal(error.message, LINE_PACK_TEXT.moneyRule);
  }
});
