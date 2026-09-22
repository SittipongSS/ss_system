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

const API = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => stripComments(readFileSync(join(API, rel), 'utf8'));

const DOC_ROUTE = 'sales-planning/spec-documents/[id]/route.js';
const ORDER_DOCS_ROUTE = 'sales-planning/sales-orders/[id]/spec-documents/route.js';
const SPEC_ROUTE = 'products/[id]/spec/route.js';
const SO_ROUTE = 'sales-planning/sales-orders/[id]/route.js';
const NEW_ROUTES = [DOC_ROUTE, ORDER_DOCS_ROUTE, SPEC_ROUTE];

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
  assert.match(branch, /loadDocumentLine\(supabase, document\)/);
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
  assert.match(fn, /!u\.disabled && u\.role === 'ae_supervisor'/);
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
  assert.match(post, /loadOrder\(supabase, id, user, 'edit'\)/);
  const existingAt = post.indexOf(".from('product_spec_documents')");
  const createAt = post.indexOf('createSpecDocument(supabase');
  assert.ok(existingAt > 0 && createAt > existingAt, 'ต้องตรวจเอกสารเดิมก่อนออกเลข');
  assert.match(post, /if \(existingRes\.error\) return fail\(/, 'ตรวจไม่ขึ้นต้องไม่ถือว่ายังไม่มีเอกสาร');
  assert.match(post, /documentCreateGate\(\{/);
  assert.match(source, /isHistoricalOrder\(order\)/);
  assert.match(source, /loadOrder\(supabase, id, user, 'view'\)/);
  // บรรทัดใบสั่งขายโตตามธุรกรรม — ต้องไล่หน้า (check:rowcap)
  assert.match(source, /fetchAllResult\(\(\) => supabase\s*\.from\('sales_order_lines'\)/);
});

test('GET ของการ์ดบนหน้า SO: สถานะรายบรรทัดจาก lineDocumentState + เอกสารที่บรรทัดถูกถอดพร้อมปุ่มยกเลิก', () => {
  const source = code(ORDER_DOCS_ROUTE);
  assert.match(source, /state: lineDocumentState\(\{/);
  assert.match(source, /doc\.status === 'active' && \(!doc\.salesOrderLineId \|\| !lineIds\.has\(doc\.salesOrderLineId\)\)/);
  assert.match(source, /\}\)\.void,/, 'ปุ่มยกเลิกของแถวที่บรรทัดถูกถอดต้องมาจาก documentActions().void');
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
