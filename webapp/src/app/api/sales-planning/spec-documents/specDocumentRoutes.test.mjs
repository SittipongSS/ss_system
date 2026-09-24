// ── เส้น API ของเอกสาร FM-SA-04 (mig 0370) — ยามระดับซอร์ส ─────────────────────────
//
// ⭐ เราต์ import ใต้ raw Node ไม่ได้ (withUser อ่าน session ของ Next · ตัวตรึงกระดาษเป็นโมดูล
//    ของอีกชั้น) ⇒ ที่นี่ล็อก "รูปร่างที่ต้องมี" จากซอร์ส แพตเทิร์นเดียวกับ columns.test.mjs /
//    historicalMoneyGuards — ตรรกะจริงของด่านเทสต์อยู่ที่ productSpecDocWorkflow.test.mjs แล้ว
// ⚠️ ตัดคอมเมนต์ก่อนตรวจทุกครั้ง — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOC_ACTION_KEYS } from '@/lib/sales/productSpecDocWorkflow';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';
import { SALES_BELL_ROLES } from '@/lib/permissions';

const API = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => stripComments(readFileSync(join(API, rel), 'utf8'));

const DOC_ROUTE = 'sales-planning/spec-documents/[id]/route.js';
const ORDER_DOCS_ROUTE = 'sales-planning/sales-orders/[id]/spec-documents/route.js';
// หน้า "ออกเอกสาร" (มติเจ้าของ 23/09/2569) — ข้อมูล + ด่าน · กระดาษร่าง · ทั้งสองเส้นอ่านอย่างเดียว
const NEW_PAGE_ROUTE = 'sales-planning/sales-orders/[id]/spec-documents/new/route.js';
const PREVIEW_ROUTE = 'sales-planning/sales-orders/[id]/spec-documents/preview/route.js';
const SPEC_ROUTE = 'products/[id]/spec/route.js';
const SO_ROUTE = 'sales-planning/sales-orders/[id]/route.js';
const NEW_ROUTES = [DOC_ROUTE, ORDER_DOCS_ROUTE, NEW_PAGE_ROUTE, PREVIEW_ROUTE, SPEC_ROUTE];
const LIB = join(API, '..', '..', 'lib');
const libCode = (rel) => stripComments(readFileSync(join(LIB, rel), 'utf8'));
// ตัวโหลดใบ/บรรทัดที่ทุกเส้นใต้ `sales-orders/[id]/spec-documents` ใช้ร่วมกัน (ไฟล์ route ส่งออกฟังก์ชันอื่นไม่ได้)
const ORDER_LOADER = 'sales/productSpecDocOrder.js';

/* ตัดก้อนโค้ดของ action หนึ่งตัว **ใน PATCH handler** — จาก `action === '<x>'` ถึง
   `} else if (action ===` ถัดไป (หรือจุดจบของสาย) · ⚠️ ต้องเริ่มค้นที่ `export const PATCH`
   ไม่งั้นไปเจอ `action === '<x>'` ของตัวเลือกผู้รับแจ้งเตือนข้างบนแทน */
function branchOf(source, action) {
  const patch = source.slice(source.indexOf('export const PATCH'));
  const start = patch.search(new RegExp(`action === '${action}'`));
  assert.ok(start >= 0, `หา branch ของ ${action} ไม่เจอ`);
  const rest = patch.slice(start);
  const end = rest.search(/\}\s*else if \(action ===|\/\/ ⚠️ before\/after|const revLabel = /);
  return end > 0 ? rest.slice(0, end) : rest;
}

test('🪤 เส้นเก่า spec-issues ถูกถอดแล้ว — เหลือแต่เส้นเอกสารชุดใหม่', () => {
  assert.equal(existsSync(join(API, 'sales-planning/sales-orders/[id]/spec-issues/route.js')), false);
  for (const rel of NEW_ROUTES) assert.ok(existsSync(join(API, rel)), `${rel} ต้องมีอยู่`);
});

test('🔴 ด่านอนุมัติของ FM-SA-04 ไม่ใช้ isSuperuser — ae_supervisor นับเป็น superuser แล้วจะข้ามขั้นเจ้าของดีล', () => {
  for (const rel of NEW_ROUTES) {
    assert.doesNotMatch(code(rel), /isSuperuser/, `${rel} ห้ามเรียก isSuperuser`);
  }
});

test('handler ของ withUser อ่าน params ด้วย `await ctx.params` ไม่ใช่ `{ params }`', () => {
  for (const rel of NEW_ROUTES) {
    const source = code(rel);
    assert.match(source, /const \{ id \} = await ctx\.params/, `${rel} ต้องอ่าน id จาก ctx.params`);
    assert.doesNotMatch(source, /withUser\(async \(\{[^}]*\bparams\b/, `${rel} ห้ามรับ { params } ตรง ๆ`);
  }
});

test('⭐ PATCH ของเอกสารถาม documentActions ตัวเดียวกับจอ และครบทุก action ในทะเบียน', () => {
  const source = code(DOC_ROUTE);
  assert.match(source, /documentActions\(\{ document, latest, salesOrder, dealOwnerId, user \}\)\[key\]/,
    'ด่านของ PATCH ต้องเป็น documentActions()[key] — คิดเงื่อนไขเองเมื่อไร จอกับ API จะยอมคนละอย่าง');
  assert.match(source, /const key = DOC_ACTION_KEYS\[action\]/);
  for (const action of Object.keys(DOC_ACTION_KEYS)) {
    assert.match(source, new RegExp(`action === '${action}'`), `ไม่มี branch ของ ${action}`);
  }
  // ตัวแยก 403/409 ของปุ่มที่ถูกซ่อนต้องรู้จักทุก action (ไม่งั้น TypeError ⇒ 500)
  for (const table of ['ACTION_ROLE', 'ACTION_FORBIDDEN']) {
    const block = source.slice(source.indexOf(`const ${table} = {`), source.indexOf('};', source.indexOf(`const ${table} = {`)));
    for (const action of Object.keys(DOC_ACTION_KEYS)) {
      assert.match(block, new RegExp(`\\b${action}:`), `${table} ขาด ${action}`);
    }
  }
});

test('ทุกการเปลี่ยนสถานะ Rev เดินผ่าน revisionPatch + transitionRevision (ก้อนที่ผ่าน CHECK ของ 0370)', () => {
  const source = code(DOC_ROUTE);
  for (const action of ['submit', 'sup_approve']) {
    const branch = branchOf(source, action);
    assert.match(branch, new RegExp(`revisionPatch\\('${action}'`), `${action} ต้องใช้ revisionPatch`);
    assert.match(branch, /transitionRevision\(supabase, \{ revision: latest, patch: step\.patch \}\)/);
  }
  const shared = branchOf(source, 'withdraw');
  assert.match(shared, /revisionPatch\('reject'/);
  assert.match(shared, /revisionPatch\(action, \{ user, now \}\)/);
  assert.match(shared, /transitionRevision\(/);
  // ห้ามเขียน product_spec_document_revisions ตรงจากเราต์ — `.eq('status', เดิม)` + เช็คโดนแถวอยู่ที่ store
  assert.doesNotMatch(source, /\.from\('product_spec_document_revisions'\)/);
  assert.doesNotMatch(source, /\.from\('product_spec_documents'\)/);
});

test('ยื่น = ถ่ายภาพนิ่งจาก buildDocumentSnapshot ด้วยบรรทัด SO ของเอกสารเอง', () => {
  const branch = branchOf(code(DOC_ROUTE), 'submit');
  assert.match(branch, /loadDocumentLine\(supabase, document, latest\)/);
  assert.match(branch, /buildDocumentSnapshot\(supabase, \{/);
  assert.match(branch, /snapshot: snap\.snapshot, illustrationIds: snap\.illustrationIds/);
});

test('ตีกลับ/แก้ไข/ยกเลิก ต้องมีเหตุผล 10–500 ตัวอักษร (docReasonError) · ตีกลับบันทึกขั้นที่ตีกลับ', () => {
  const source = code(DOC_ROUTE);
  const reject = branchOf(source, 'withdraw'); // withdraw/ae_approve/reject ใช้ branch เดียวกัน
  assert.match(reject, /docReasonError\(reason, \{ label: 'เหตุผลที่ตีกลับ' \}\)/);
  assert.match(reject, /stage: rejectStageOf\(latest\)/);
  assert.match(branchOf(source, 'revise'), /docReasonError\(reason/);
  assert.match(branchOf(source, 'void'), /docReasonError\(reason/);
});

test('⭐ AE Sup อนุมัติ: ปิด Rev ก่อนหน้า + currentRevNo แล้วค่อยตรึงกระดาษ · ตรึงล้มไม่ถอยการอนุมัติ', () => {
  const source = code(DOC_ROUTE);
  assert.match(source, /import \{ freezeProductSpecRevision \} from '@\/lib\/sales\/productSpecFreeze'/);
  const branch = branchOf(source, 'sup_approve');
  const finalAt = branch.indexOf('applyFinalApproval(');
  const freezeAt = branch.indexOf('freezeProductSpecRevision(');
  assert.ok(finalAt > 0 && freezeAt > finalAt, 'ต้อง applyFinalApproval ก่อน freezeProductSpecRevision');
  // หลังการอนุมัติสำเร็จแล้ว ห้ามมี `return fail(` — ล้มต้องเป็น warning ไม่ใช่ error
  const afterApproval = branch.slice(branch.indexOf('revisionAfter = moved.row'));
  assert.doesNotMatch(afterApproval, /return fail\(/, 'ของที่ตามหลังการอนุมัติล้ม = warning ไม่ใช่ fail');
  assert.match(afterApproval, /warnings\.push\(/);
  assert.match(afterApproval, /try \{[\s\S]*freezeProductSpecRevision[\s\S]*\} catch/, 'ตัวเรนเดอร์ throw ได้ ต้องห่อ try');
});

test('ทุก action ลง audit (before/after เต็มทั้งเอกสารและ Rev) และคำเตือนตามไปใน audit ด้วย', () => {
  const source = code(DOC_ROUTE);
  const audit = source.slice(source.indexOf('await recordAudit({'));
  assert.match(audit, /entityType: 'product_spec_document'/);
  assert.match(audit, /before: \{ document, revision: latest \}/);
  assert.match(audit, /document: documentAfter,\s*revision: revisionAfter/);
  assert.match(audit, /warnings\.length \? \{ warnings \}/);
});

test('แจ้งเตือนตามตารางมติ: ยื่น→เจ้าของดีล · AE อนุมัติ→ae_supervisor ที่ active · ตีกลับ→ผู้ยื่น · อนุมัติ→ผู้ยื่น+เจ้าของดีล', () => {
  const source = code(DOC_ROUTE);
  const fn = source.slice(source.indexOf('async function recipientsFor'), source.indexOf('function noticeText'));
  assert.match(fn, /action === 'submit'\) return \[dealOwner\?\.id\]/);
  // ผังตำแหน่ง 2026-09-24 ข้อ 6: CCO/CM อนุมัติขั้นนี้ได้แต่ไม่รับกระดิ่ง ⇒ ผู้รับยังเป็น AE Sup อย่างเดียว
  assert.match(fn, /!u\.disabled && SALES_BELL_ROLES\.includes\(u\.role\)/);
  assert.deepEqual(SALES_BELL_ROLES, ['ae_supervisor']);
  assert.match(fn, /action === 'reject'\) return \[latest\?\.submittedBy\]/);
  assert.match(fn, /action === 'sup_approve'\) return \[latest\?\.submittedBy, dealOwner\?\.id\]/);
  assert.match(source, /entityType: 'product_spec_document'/);
  // ห้ามแจ้งตัวเอง
  assert.match(source, /filter\(\(uid\) => uid !== actorId\)/);
});

test('หัวแจ้งเตือน = "…รายละเอียดผลิตภัณฑ์ · DDMMYY-XXX-RR" ทั้งสี่การกระทำ — ไม่ใช่เลขที่ดิบ + "Rev."', () => {
  /* เราต์ส่งออกฟังก์ชันอื่นนอกจาก handler ไม่ได้ (ข้อจำกัดของไฟล์ route) ⇒ ดึง `describe` + `noticeText` จากซอร์ส
     มารันจริง (ไม่ใช่แค่จับข้อความ) · 🐞 ผลตรวจรอบสอง: ไม่มีเทสต์ตรึงหัวแจ้งเตือน ถอยกลับเป็นรูปเก่าก็ยังเขียว */
  const source = code(DOC_ROUTE);
  const block = source.slice(source.indexOf('function describe('), source.indexOf('function notifyLater'));
  const { describe, noticeText } = new Function('formatSpecDocNo', `${block}\nreturn { describe, noticeText };`)(formatSpecDocNo);
  const context = {
    document: { docNo: 'FM-SA-04-220969-001' },
    revision: { revNo: 1 },
    product: { fgCode: 'FG-1', productDescription: 'น้ำหอม' },
    salesOrder: { orderNumber: 'SO-26090177-0' },
  };
  const { head, body } = describe(context);
  assert.equal(head, '220969-001-01');
  assert.equal(body, 'FG-1 น้ำหอม · ใบสั่งขาย SO-26090177-0');
  const titles = {
    submit: 'รอ AE อนุมัติรายละเอียดผลิตภัณฑ์ · 220969-001-01',
    ae_approve: 'รอ AE Supervisor อนุมัติรายละเอียดผลิตภัณฑ์ · 220969-001-01',
    reject: 'รายละเอียดผลิตภัณฑ์ถูกตีกลับ · 220969-001-01',
    sup_approve: 'รายละเอียดผลิตภัณฑ์อนุมัติแล้ว · 220969-001-01',
  };
  for (const [action, title] of Object.entries(titles)) {
    const text = noticeText(action, { head, body, reason: 'แก้ฝา' });
    assert.equal(text.title, title, action);
    assert.doesNotMatch(text.title, /FM-SA-04-220969-001|Rev\./, `${action}: ห้ามเลขที่ดิบ/"Rev." ในหัว`);
  }
  assert.match(noticeText('reject', { head, body, reason: 'แก้ฝา' }).body, /^แก้ฝา — /);
});

test('GET ของเอกสาร: ขอบเขตมาจาก SO ที่ผูก (loadScoped view) · ไม่มี SO แล้ว = ฝ่ายขายเท่านั้น', () => {
  const source = code(DOC_ROUTE);
  assert.match(source, /loadScoped\(supabase, 'sales_orders', loaded\.document\.salesOrderId, user, mode\)/);
  assert.match(source, /loadVisibleDocument\(supabase, id, user, 'view'\)/);
  assert.match(source, /loadVisibleDocument\(supabase, id, user, 'edit'\)/);
  assert.match(source, /else if \(!canEditProductSpec\(user\?\.role\)\)/);
});

test('ออกเอกสารจากบรรทัด SO: AC เท่านั้น · ตรวจเอกสารเดิมของบรรทัดก่อนเรียก RPC · ใบย้อนหลังถูกกัน', () => {
  const source = code(ORDER_DOCS_ROUTE);
  const post = source.slice(source.indexOf('export const POST'));
  assert.match(post, /canIssueProductSpecDocument\(user\.role\)/);
  assert.match(post, /loadSpecDocOrder\(supabase, id, user, 'edit'\)/);
  const existingAt = post.indexOf('loadLiveDocumentForLine(supabase, lineId)');
  const createAt = post.indexOf('createSpecDocument(supabase');
  assert.ok(existingAt > 0 && createAt > existingAt, 'ต้องตรวจเอกสารเดิมก่อนออกเลข');
  assert.match(post, /if \(existingRes\.error\) return fail\(/, 'ตรวจไม่ขึ้นต้องไม่ถือว่ายังไม่มีเอกสาร');
  assert.match(post, /documentCreateGate\(\{/);
  assert.match(source, /loadSpecDocOrder\(supabase, id, user, 'view'\)/);
  // ตัวโหลดกลาง: ใบย้อนหลังถูกกัน · ขอบเขตจาก loadScoped · บรรทัดโตตามธุรกรรม — ต้องไล่หน้า (check:rowcap)
  const loader = libCode(ORDER_LOADER);
  assert.match(loader, /isHistoricalOrder\(order\)/);
  assert.match(loader, /loadScoped\(supabase, 'sales_orders', id, user, mode\)/);
  assert.match(loader, /fetchAllResult\(\(\) => supabase\s*\.from\('sales_order_lines'\)/);
  // บรรทัดพก quotationLineId — จำนวนผลิตของกระดาษร่างถอยไปบรรทัดใบเสนอราคาที่บรรทัดชี้
  assert.match(loader, /select\('id, salesOrderId, quotationLineId, productId,/);
  // ตัวอ่านเอกสารเดิมของบรรทัด: ไม่นับใบ void · อ่านไม่ขึ้น = error (ไม่ใช่ "ยังไม่มี")
  const store = libCode('sales/productSpecStore.js');
  const live = store.slice(store.indexOf('export async function loadLiveDocumentForLine'), store.indexOf('function mapCreateDocumentError'));
  assert.match(live, /\.eq\('salesOrderLineId', salesOrderLineId\)\s*\.neq\('status', 'void'\)/);
  assert.match(live, /if \(error\) return \{ error: messageOf\(error\) \}/);
});

/* 🔴 มติเจ้าของ 23/09/2569 "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก" — เปิดหน้าออกเอกสาร/ดูกระดาษร่างแล้ว
   กดยกเลิก ต้องไม่เหลืออะไรในฐาน ⇒ สองเส้นของหน้านั้นห้ามมีคำสั่งเขียนแม้แต่ตัวเดียว (ทั้งในเราต์และในตัวประกอบกระดาษร่าง) */
const WRITE_CALL = /\.(insert|update|upsert|delete|rpc)\(/;
test('🔴 เส้นของหน้า "ออกเอกสาร" (ข้อมูล · กระดาษร่าง) ไม่เขียนอะไรเลย — ไม่ insert/update/rpc ไม่ออกเลข', () => {
  for (const rel of [NEW_PAGE_ROUTE, PREVIEW_ROUTE]) {
    const source = code(rel);
    assert.doesNotMatch(source, WRITE_CALL, `${rel} ห้ามมีคำสั่งเขียน`);
    assert.doesNotMatch(source, /createSpecDocument|recordAudit|freezeProductSpecRevision|renderSpecDocumentPaper/,
      `${rel} ห้ามเรียกตัวที่ออกเลข/ลง audit/ตรึงกระดาษ`);
    assert.doesNotMatch(source, /export const (POST|PUT|PATCH|DELETE)\b/, `${rel} มีแต่ GET`);
    assert.match(source, /export const GET = withUser\(/);
    // ตัวโหลด/ขอบเขตชุดเดียวกับการ์ดและการออกเลขจริง
    assert.match(source, /loadSpecDocOrder\(supabase, id, user, 'view'\)/, `${rel} ขอบเขตโหมด view ผ่านตัวโหลดกลาง`);
    assert.match(source, /if \(loaded\.blocked\)/, `${rel} ใบย้อนหลังต้องถูกกัน`);
    assert.match(source, /if \(loaded\.error\)/, `${rel} อ่านบรรทัดไม่ขึ้นต้องไม่เงียบ`);
  }
  // ตัวประกอบกระดาษร่างใน productSpecFreeze ก็ห้ามเขียน (ต่างจากตัวพิมพ์เอกสารจริงที่ตรึงฉบับอนุมัติ)
  const freeze = libCode('sales/productSpecFreeze.js');
  const draft = freeze.slice(freeze.indexOf('export async function renderSpecDocumentDraftPreview'), freeze.indexOf('export function specPaperResponse'));
  assert.ok(draft.length > 50, 'หา renderSpecDocumentDraftPreview ไม่เจอ');
  assert.doesNotMatch(draft, WRITE_CALL);
  assert.doesNotMatch(draft, /freezeProductSpecRevision|\.from\(/, 'กระดาษร่างประกอบผ่าน buildDocumentSnapshot เท่านั้น');
  assert.match(draft, /buildDocumentSnapshot\(supabase, \{/);
  assert.match(draft, /document: null,\s*revision: null,/, 'ยังไม่มีเอกสาร = เลขที่เป็นขีด');
  assert.match(draft, /productSpecWatermark\(\{ language:/, 'ลายน้ำ "ฉบับร่าง" ตามภาษาของ SO');
});

test('⭐ เส้นข้อมูลของหน้าออกเอกสาร ถามด่านชุดเดียวกับ POST — documentCreateGate + เอกสารเดิมของบรรทัด + สเปค', () => {
  const source = code(NEW_PAGE_ROUTE);
  assert.match(source, /documentCreateGate\(\{\s*user, salesOrder: order, line, spec, existingDocument: existing, scopeReason,\s*\}\)/);
  assert.match(source, /const scopeReason = productSpecScopeReason\(\{ fgCode: line\.fgCode \}\)/, 'scopeReason รูปเดียวกับ POST');
  assert.match(source, /loadLiveDocumentForLine\(supabase, line\.id\)/);
  assert.match(source, /if \(existingRes\.error\) return fail\(/);
  assert.match(source, /loadSpecRecord\(supabase, line\.productId\)/);
  assert.match(source, /if \(specRes\.error\) return fail\(/);
  // ของที่กระดาษจะพิมพ์อ่านด้วยตัวเดียวกับภาพนิ่ง · อ่านล้ม = 500 ไม่ใช่ขีด
  assert.match(source, /loadDocumentQuantity\(supabase, \{ order, line, productId: line\.productId \}\)/);
  assert.match(source, /if \(quantity\.error\) return fail\(/);
  assert.match(source, /loadDealOwner\(supabase, order\)/);
  assert.match(source, /if \(owner\.error\) return fail\(/);
  assert.match(source, /specDocQuotationNumber\(order, quote\.quotation\)/);
  // ไม่ส่งแถว SO ทั้งแถว (ยอดเงิน · metadata) ให้จอ
  assert.doesNotMatch(source, /order: order[,\s}]/);
  assert.doesNotMatch(source, /\.\.\.order\b/);
  assert.match(source, /canEditSpec: canEditProductSpec\(user\.role\)/);
});

/* 🐞 ผลตรวจสด 23/09: role ที่หน้าใหม่บอกว่า "ไม่มีสิทธิ์ออกเอกสารนี้" (senior_ae · rd) ยิง URL ของกระดาษร่าง
   ตรง ๆ แล้วได้กระดาษเต็มใบ (สเปค + กล่องผู้ซื้อ) ⇒ จอปิดประตูแต่หน้าต่างเปิด · มติ 23/09: **กระดาษของ
   "ของที่ยังไม่มีใครตัดสินใจออก" แคบเท่าปุ่มที่พามา** (AC/admin) — ต่างจากกระดาษของเอกสารที่ *มีแล้ว*
   ซึ่งกว้างเท่าคนที่เห็นใบสั่งขาย เพราะมันมีอยู่ได้ก็ต่อเมื่อ AC ออกไปแล้ว (docs §จอ) */
test('🔴 กระดาษร่างแคบเท่าปุ่มที่พามา — AC/admin เท่านั้น และตัดก่อนแตะฐาน', () => {
  const source = code(PREVIEW_ROUTE);
  const gateAt = source.indexOf('canIssueProductSpecDocument(user.role)');
  const loadAt = source.indexOf('loadSpecDocOrder(supabase');
  assert.ok(gateAt > 0, 'กระดาษร่างต้องถาม canIssueProductSpecDocument');
  assert.ok(loadAt > gateAt, 'ด่านคนต้องมาก่อนอ่านฐาน');
  assert.match(source, /canIssueProductSpecDocument\(user\.role\)\) \{\s*return specPaperErrorResponse\(req, 'ออกเอกสาร FM-SA-04 ได้เฉพาะ AC/,
    'ไม่ผ่านด่าน = หน้าไทยที่บอกเหตุเดียวกับจอ ไม่ใช่ "forbidden" ดิบ');
  // เส้นข้อมูลของหน้าใหม่ยัง **กว้าง** โดยตั้งใจ (ทุกคนที่เห็นใบสั่งขายเปิดได้) แต่ตอบแค่คำบอกเมื่อไม่มีสิทธิ์ออก
  const data = code(NEW_PAGE_ROUTE);
  assert.match(data, /if \(!canViewSalesPlanning\(user\)\) return forbidden\(/);
  assert.match(data, /if \(!gate\.visible\) \{\s*return ok\(\{ order: orderView, line: specDocLineView\(line\), gate, existingDocument: null, spec: null \}\)/,
    'ไม่มีสิทธิ์ออก = ไม่ส่งสเปค/สินค้า/เจ้าของดีลออกไป (จอขึ้นแค่คำบอก)');
});

test('กระดาษร่าง: บรรทัดนอกหมวด/ไม่ผูกสินค้า = หน้าแจ้งเหตุภาษาไทย · ล้ม/throw = หน้าไทย ไม่ใช่ 500 ดิบ', () => {
  const source = code(PREVIEW_ROUTE);
  assert.match(source, /const scopeReason = specDocLineScopeReason\(line\)/);
  assert.match(source, /if \(scopeReason\) return specPaperErrorResponse\(req, scopeReason, 400\)/);
  assert.match(source, /specPaperScopedErrorResponse\(req, loaded\.response\)/);
  assert.match(source, /renderSpecDocumentDraftPreview\(supabase, \{ order, line, dealOwner: owner\.dealOwner \}\)/);
  assert.match(source, /\} catch \(error\) \{[\s\S]*specPaperErrorResponse\(req,/);
  assert.match(source, /export const runtime = 'nodejs'/);
});

test('GET ของการ์ดบนหน้า SO: สถานะรายบรรทัดจาก lineDocumentState + เอกสารที่บรรทัดถูกถอดพร้อมปุ่มปลายทาง', () => {
  const source = code(ORDER_DOCS_ROUTE);
  assert.match(source, /state: lineDocumentState\(\{/);
  assert.match(source, /doc\.status === 'active' && \(!doc\.salesOrderLineId \|\| !lineIds\.has\(doc\.salesOrderLineId\)\)/);
  /* 🔴 ทั้งคู่ต้องมาจาก `documentActions` ก้อนเดียวกัน (มติ 23/09 "ซ่อนปุ่มยกเลิกช่วงร่าง") — ส่งแต่ `.void`
     = แถวของร่างที่ไม่เคยยื่นไม่มีปุ่มอะไรเลยบนการ์ด (ทางตัน) */
  assert.match(source, /voidAction: actions\.void,/, 'ปุ่มยกเลิกของแถวที่บรรทัดถูกถอดต้องมาจาก documentActions().void');
  assert.match(source, /removeAction: actions\.remove,/, 'ปุ่มลบร่างของแถวที่บรรทัดถูกถอดต้องมาจาก documentActions().remove');
  // โมดัลยกเลิกต้องประกอบเลขรูปเดียวกับแถว (DDMMYY-XXX-RR) ⇒ ต้องได้ Rev ดิบ (ผลตรวจรอบสอง)
  assert.match(source, /revNo: doc\.latest \? doc\.latest\.revNo : null/);
  assert.match(source, /return ok\(\{ orderStatus: order\.status, rows, orphans \}\)/);
});

test('สเปคของสินค้า: ทุกทางเขียนถาม canEditProductSpec · ลบถาม productSpecDeleteBlock · audit ถือแถวเต็ม', () => {
  const source = code(SPEC_ROUTE);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const start = source.indexOf(`export const ${method}`);
    const next = source.indexOf('export const', start + 10);
    const body = source.slice(start, next > 0 ? next : undefined);
    assert.match(body, /if \(!canEditProductSpec\(user\.role\)\) return forbidden\(/, `${method} ต้องถามสิทธิ์แก้สเปค`);
    assert.match(body, /await recordAudit\(\{/, `${method} ต้องลง audit`);
  }
  const del = source.slice(source.indexOf('export const DELETE'));
  assert.match(del, /productSpecDeleteBlock\(\{ spec: before\.spec, documents: before\.documents, role: user\.role \}\)/);
  // ⚠️ audit_logs.before คือทางกู้ทางเดียว — ต้องเป็นแถวเต็มพร้อม checklist ไม่ใช่แค่ id
  assert.match(del, /before: before\.spec,/);
  // ลบแล้วแต่ล้างกระจกบนทะเบียนสินค้าไม่ผ่าน = สำเร็จพร้อม warning (ไม่ใช่เงียบ)
  assert.match(del, /return ok\(removed\.warning \? \{ deleted: true, warning: removed\.warning \} : \{ deleted: true \}\)/);
  assert.match(source, /permissions: productSpecPermissions\(/);
  // การ์ดภาพรวมบนหน้าสเปคอ่านช่องที่ประกอบแล้วชุดเดียวกับกระดาษ — ไม่ใช่แถวดิบของทะเบียน
  assert.match(source, /const printed = await loadProductPrintFields\(supabase, product\.id\);\s*if \(printed\.error\) return \{ error: printed\.error \};/);
  assert.match(source, /product: \{ \.\.\.product, \.\.\.printed\.product, team: product\.team, ownerId: product\.ownerId \}/);
});

test('🔴 ยื่น: ตรวจรูปในภาพนิ่งซ้ำหลังเขียน — ไม่ครบ/ตรวจไม่ได้ = ถอย Rev กลับสภาพเดิม ไม่ตอบว่ายื่นสำเร็จ', () => {
  const branch = branchOf(code(DOC_ROUTE), 'submit');
  const written = branch.indexOf('transitionRevision(supabase, { revision: latest, patch: step.patch })');
  const check = branch.indexOf('missingSnapshotIllustrations(supabase, snap.illustrationIds)');
  const accepted = branch.indexOf('revisionAfter = moved.row');
  assert.ok(written > 0 && check > written && accepted > check, 'ตรวจหลังเขียน และก่อนถือว่ายื่นสำเร็จ');
  const guard = branch.slice(check, accepted);
  assert.match(guard, /if \(check\.error \|\| check\.missing\.length\)/);
  assert.match(guard, /undoSubmitPatch\(latest, step\.patch,/);
  assert.match(guard, /return conflict\(/);
});

/* ── DELETE: ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ────────────
   🔴 ระบบไม่มีถังขยะ — `audit_logs.before` คือทางกู้ทางเดียว ([[deleted-data-recovery]])
      ⇒ ลำดับ "audit ก่อน แล้วค่อยลบ" เป็นข้อบังคับ ไม่ใช่รสนิยม */
const deleteBranch = (source) => source.slice(source.indexOf('export const DELETE'));

test('⭐ ลบร่าง: เป็น DELETE ของเราต์เอกสาร ไม่ใช่ action ของ PATCH · ด่านคือ documentActions().remove', () => {
  const source = code(DOC_ROUTE);
  assert.match(source, /export const DELETE = withUser\(/, 'ต้องมีเมธอด DELETE');
  const del = deleteBranch(source);
  assert.match(del, /const \{ id \} = await ctx\.params/);
  assert.match(del, /loadVisibleDocument\(supabase, id, user, 'edit'\)/, 'ขอบเขตชุดเดียวกับ PATCH');
  assert.match(del, /documentActions\(\{[\s\S]*?\}\)\.remove/, 'ด่านต้องเป็น documentActions().remove ไม่ใช่เงื่อนไขที่คิดเองที่เราต์');
  // ลบร่างต้องไม่ปนเข้าไปในทะเบียน action ของ PATCH (ไม่งั้นเมธอดจะเพี้ยนกันคนละทาง)
  assert.doesNotMatch(source, /action === 'remove'/);
});

test('🔴 ลบร่าง: ลง audit (before = เอกสาร + Rev เต็ม) **ก่อน** เรียกตัวลบ — ลบก่อนแล้วเขียนคือจังหวะที่แถวหายโดยไม่มีสำเนา', () => {
  const del = deleteBranch(code(DOC_ROUTE));
  const auditAt = del.indexOf('await recordAudit({');
  const deleteAt = del.indexOf('deleteDraftDocument(supabase');
  assert.ok(auditAt > 0, 'ต้องลง audit');
  assert.ok(deleteAt > auditAt, 'audit ต้องมาก่อนการลบ');
  const audit = del.slice(auditAt, deleteAt);
  assert.match(audit, /action: 'delete'/);
  assert.match(audit, /entityType: 'product_spec_document'/);
  assert.match(audit, /before: \{ document, revision: latest \}/, 'before ต้องเป็นแถวเต็มทั้งคู่ ไม่ใช่แค่ id');
  // ลบเดินผ่าน store (RPC ของ 0375) — ห้าม .delete() ตรงจากเราต์ (ยามของ 0370 อยู่บน trigger)
  assert.doesNotMatch(del, /\.delete\(\)/);
});

test('🔴 ลบร่างไม่ผ่าน = ไม่ปล่อยให้ audit โกหกว่าลบแล้ว · ตอบรหัสของ store (409 เมื่อมีคนยื่นแทรก)', () => {
  const del = deleteBranch(code(DOC_ROUTE));
  const failAt = del.indexOf('if (removed.error)');
  assert.ok(failAt > 0, 'ต้องเช็ค error ของตัวลบ');
  const failure = del.slice(failAt);
  assert.match(failure, /await recordAudit\(\{/, 'ลบไม่ผ่านต้องมีแถว audit แก้กลับ');
  assert.match(failure, /deleteFailed: removed\.error/);
  assert.match(failure, /return fail\(removed\.error, removed\.status \|\| 500\)/);
});

/* 🔴 มติ 23/09 ถอดปุ่มยกเลิกของร่างที่ไม่เคยยื่น ⇒ ถ้า RPC ปฏิเสธการลบทั้งที่ตัวตัดสินฝั่งแอปยังว่า "ลบได้"
   ข้อความของ RPC ("ใช้ยกเลิกเอกสารแทน") กับ PATCH void (`FRESH_DRAFT_VOID_BLOCK` "ใช้ลบร่าง") จะส่งคนวนกัน */
test('🔴 RPC ปฏิเสธการลบแต่อ่านใหม่ยังลบได้ = ให้แจ้งผู้ดูแล ไม่ส่งไปหาปุ่มยกเลิกที่ไม่มี', () => {
  const del = deleteBranch(code(DOC_ROUTE));
  const failure = del.slice(del.indexOf('if (removed.error)'));
  const guard = failure.indexOf('if (removed.conflict)');
  assert.ok(guard > 0, 'ต้องแยกกรณี RPC ปฏิเสธ (409)');
  assert.ok(guard < failure.indexOf('return fail(removed.error'), 'ต้องตัดสินก่อนส่งข้อความของ RPC ต่อ');
  const branch = failure.slice(guard, failure.indexOf('return fail(removed.error'));
  assert.match(branch, /loadVisibleDocument\(supabase, id, user, 'edit'\)/, 'ต้องอ่านใบใหม่ — มีคนยื่นแทรกคือกรณีปกติ');
  assert.match(branch, /documentExitKey\(again\.document, again\.latest\) === 'remove'/);
  assert.match(branch, /return conflict\(DRAFT_EXIT_MISMATCH\)/);
});

test('⭐ ยกเลิกร่างที่ไม่เคยยื่น (ปุ่มถูกซ่อนตามมติ 23/09) = 409 พร้อมทางที่ใช้ได้จริง ไม่ใช่ "สถานะเปลี่ยนแล้ว"', () => {
  const source = code(DOC_ROUTE);
  const start = source.indexOf('function hiddenActionResponse');
  const end = source.indexOf('function describe(', start);
  assert.ok(start > 0 && end > start, 'ไม่พบ hiddenActionResponse');
  const hidden = source.slice(start, end);
  const specific = hidden.indexOf("documentExitKey(document, latest) === 'remove'");
  const stale = hidden.indexOf('return conflict(STALE)');
  assert.ok(specific > 0, 'ต้องแยกกรณี void บนร่างที่ลบได้');
  assert.ok(specific < stale, 'ต้องตัดสินก่อนตก "สถานะเปลี่ยนแล้ว"');
  assert.match(hidden, /return conflict\(FRESH_DRAFT_VOID_BLOCK\)/);
  // เหตุบนปุ่มยื่นของใบที่บรรทัดหาย ต้องชี้ปุ่มที่มีจริง (ร่างที่ไม่เคยยื่น = ลบ)
  assert.match(source, /return \{ error: lineRemovedBlock\(document, latest\), status: 400 \}/);
});

test('ลบร่างที่ปุ่มถูกซ่อน: ไม่ใช่ AC = 403 · ใบที่ลบไม่ได้มาแต่ต้น = เหตุจริง ไม่ใช่ "สถานะเปลี่ยนแล้ว"', () => {
  const del = deleteBranch(code(DOC_ROUTE));
  assert.match(del, /if \(!canIssueProductSpecDocument\(user\?\.role\)\) return forbidden\('ลบร่างเอกสารได้เฉพาะ AC'\)/);
  assert.match(del, /return conflict\(draftDeleteBlock\(document, latest\) \|\| STALE\)/,
    'ร่างที่เคยยื่นแล้วดึงกลับไม่ได้ "เปลี่ยนสถานะ" — โหลดใหม่กี่รอบก็ลบไม่ได้ ต้องบอกเหตุจริง');
});

test('ลบสำเร็จ = ส่ง id ใบสั่งขายกลับให้จอเด้งไปหน้านั้น (อ่านเอกสารที่ลบแล้วซ้ำไม่ได้)', () => {
  const del = deleteBranch(code(DOC_ROUTE));
  assert.match(del, /return ok\(\{\s*deleted: true,/);
  assert.match(del, /salesOrderId: document\.salesOrderId \|\| null/);
  assert.doesNotMatch(del, /loadSpecDocument\(supabase, id\)/, 'ลบแล้วห้ามอ่านกลับ — ได้ 404 แน่นอน');
  // 🔴 เลขที่ไม่นำกลับมาใช้ — ห้ามมีโค้ดไหนไปยุ่งกับตัวนับ
  assert.doesNotMatch(del, /entity_number_counters|next_quote_number/);
});

test('ปุ่ม "แก้สเปคที่หน้าสินค้า" ตามสิทธิ์แก้สเปค — API ส่ง canEditSpec มาจาก canEditProductSpec', () => {
  const source = code(DOC_ROUTE);
  const payload = source.slice(source.indexOf('function documentPayload'), source.indexOf('function undoSubmitPatch'));
  assert.match(payload, /canEditSpec: canEditProductSpec\(user\?\.role\)/);
});

test('⭐ hook ของ SO: ยกเลิก (ทั้งสองทาง) ⇒ void เอกสาร · ออก Rev ⇒ ย้ายเอกสาร · ล้ม = warning ไม่ใช่ 500', () => {
  const source = code(SO_ROUTE);
  // ยกเลิกทาง RPC ย้อน Won + ทางยกเลิกเฉย ๆ = สองจุด
  const voidCalls = source.match(/await voidSpecDocumentsAfterCancel\(\{ supabase, user, req, order: before \}\)/g) || [];
  assert.equal(voidCalls.length, 2, 'ต้อง void เอกสารทั้งทางยกเลิกเฉย ๆ และทาง cancel_sales_order_with_reversal_atomic');
  const reversal = source.slice(source.indexOf("rpc('cancel_sales_order_with_reversal_atomic'"));
  assert.ok(reversal.indexOf('voidSpecDocumentsAfterCancel') > reversal.indexOf('if (revErr)'),
    'hook ต้องอยู่หลังจุดที่ RPC สำเร็จแล้ว');
  const revise = source.slice(source.indexOf("rpc('revise_approved_sales_order_atomic'"));
  assert.ok(revise.indexOf('moveSpecDocumentsAfterRevise') > revise.indexOf('if (error)'),
    'hook ต้องอยู่หลังจุดที่ RPC ออก Rev สำเร็จแล้ว');
  assert.match(revise, /oldOrder: before, newOrder: revision/);
  // ตัว hook ห้าม throw/ตอบ error ออกไป — คืนข้อความเตือนแล้วลง audit
  for (const fn of ['voidSpecDocumentsAfterCancel', 'moveSpecDocumentsAfterRevise']) {
    const start = source.indexOf(`async function ${fn}`);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    assert.match(body, /try \{/, `${fn} ต้องห่อ try`);
    assert.match(body, /await recordAudit\(\{/, `${fn} ต้องลง audit`);
    assert.doesNotMatch(body, /return fail\(|throw /, `${fn} ห้ามทำให้ action ของ SO ล้ม`);
  }
  assert.match(source, /ใบสั่งขาย \$\{order\?\.orderNumber \|\| order\?\.id\} ถูกยกเลิก/, 'เหตุผลตามมติ: ใบสั่งขาย <เลข> ถูกยกเลิก');
});

test('🔴 บังคับลบ SO: จดเอกสาร active ก่อนลบ (อ่านไม่ขึ้น = หยุด) แล้ว void หลังลบสำเร็จ', () => {
  const del = code(SO_ROUTE).slice(code(SO_ROUTE).indexOf('export const DELETE'));
  const listed = del.indexOf('activeDocumentsForOrder(supabase, id)');
  const guard = del.indexOf('if (specDocs.error) return fail(');
  const removed = del.indexOf("rpc('force_delete_sales_order'");
  const voided = del.indexOf('voidSpecDocumentsAfterForceDelete({');
  assert.ok(listed > 0 && guard > listed && removed > guard, 'จด + เช็ค error ก่อนลบ');
  assert.ok(voided > removed, 'void หลังลบสำเร็จ — ลบล้มต้องไม่ทิ้งเอกสารที่ void ไปแล้วบน SO ที่ยังอยู่');
  assert.match(del, /return ok\(\{ deleted: true, forced: force, \.\.\.\(warning \? \{ warning \} : \{\}\) \}\)/);
});
