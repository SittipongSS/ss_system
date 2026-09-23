// ── ลบนัดได้ไหม — กติกาเดียวของปุ่ม "ลบนัด" และของ DELETE /api/service/visits/[id] (มติเจ้าของ 24/09) ──
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · ลบได้เฉพาะ **งานนอกรอบ** (ไม่มี planId · ไม่มี requestId) ที่ยังไม่มีใครไปถึงไซต์
//   · นัดของรอบ / ใบคำร้อง = ลบไม่ได้ (ยกเลิกแทน) และปุ่มไม่โชว์
//   · นัดถอนเครื่องจากเรื่อง "ไม่ต่อสัญญา" = ลบไม่ได้ แต่ปุ่มโชว์แล้วบอกเหตุตอนกด
//   · ปิดงานแล้ว = ไม่มีปุ่ม · กำลังทำ = ปุ่มโชว์แล้วบอกเหตุ
//   · API ถามด่านตัวเดียวกัน (ยามอ่านซอร์ส — route เป็น handler ของ Next)
//   · "ไปถึงไซต์แล้ว" ดูจากร่องรอยบนใบ + แถวลูก ไม่ใช่สถานะอย่างเดียว (รีวิว 24/09: ทำไม่ได้ → ยกเลิก → ลบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import {
  VISIT_DELETE_BLOCKS, VISIT_DELETE_BLOCK_LABELS, VISIT_DELETE_CREW_ERROR, VISIT_EDIT_FORM_PLACE,
  hasSiteVisitTrace, isOutOfRoundVisit, isRenewalRetrieveVisit,
  visitDeleteBlock, visitDeleteBlocker, visitDeleteButton, visitDeletePrompt,
} from './visitDelete.js';
import { ensureRetrieveVisit } from './renewalRetrieveVisit.js';
import { originText } from './scheduleQueueView.js';
import { ensureVisits, normalizeVisitInput } from './rounds.js';
import { VISIT_STATUSES_MANUAL } from './visitStatus.js';
import { IRREVERSIBLE_NOTE } from '../approvalPrompt.js';

/* ⚠️ visitsRepo ลาก `@/lib/http` → `next/headers` (ทางเดียวกับ visitBundle.test.mjs) — ต่อ hook ก่อน import */
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { return n(s === 'next/headers' ? 'next/headers.js' : s, c); }",
));
const { visitFieldRecordCount } = await import('./visitsRepo.js');

const v = (o = {}) => ({ id: 'V1', code: 'SV-26090001', siteId: 'S1', kind: 'repair', status: 'draft', scheduledDate: '2026-09-24', ...o });
const OPEN_STATES = ['draft', 'scheduled', 'rescheduled', 'cancelled'];
const CLOSED_STATES = ['done', 'partial', 'unable'];

test('⭐ งานนอกรอบที่ยังไม่มีใครไปถึงไซต์ = ลบได้ · ปุ่มโชว์และกดได้', () => {
  for (const status of OPEN_STATES) {
    for (const kind of ['repair', 'install', 'refill', 'maintenance', 'inspect']) {
      const visit = v({ status, kind });
      assert.equal(isOutOfRoundVisit(visit), true);
      assert.equal(visitDeleteBlock(visit), null, `${kind}/${status}`);
      assert.equal(visitDeleteBlocker(visit), '');
      assert.deepEqual(visitDeleteButton(visit), { blocker: '' }, `${kind}/${status}`);
    }
  }
});

test('🔴 นัดของรอบบริการลบไม่ได้ (บันทึกรอบครั้งหน้าเติมวันนั้นกลับมา) · ปุ่มนี้ไม่โชว์', () => {
  for (const status of OPEN_STATES) {
    const visit = v({ planId: 'P1', status });
    assert.equal(visitDeleteBlock(visit)?.code, 'round');
    assert.match(visitDeleteBlocker(visit), /รอบบริการ/);
    assert.match(visitDeleteBlocker(visit), /ยกเลิก/, 'ต้องชี้ทางที่ถูก');
    assert.equal(visitDeleteButton(visit), null, 'ไม่ใช่งานนอกรอบ — ไม่ใช่เรื่องของปุ่มนี้');
  }
  // นัดของรอบที่เป็นชนิดถอนเครื่อง ยังเป็นนัดของรอบ (ไม่ใช่นัดถอนจากเรื่องไม่ต่อสัญญา)
  assert.equal(visitDeleteBlock(v({ planId: 'P1', kind: 'remove' }))?.code, 'round');
  assert.equal(isRenewalRetrieveVisit(v({ planId: 'P1', kind: 'remove' })), false);
});

test('🔴 นัดของใบคำร้องประเมินพื้นที่ลบไม่ได้ (วันบนใบผูกกับนัด) · ปุ่มนี้ไม่โชว์', () => {
  const visit = v({ requestId: 'RQ1', kind: 'survey', status: 'scheduled' });
  assert.equal(visitDeleteBlock(visit)?.code, 'survey');
  assert.match(visitDeleteBlocker(visit), /คำร้อง/);
  assert.match(visitDeleteBlocker(visit), /ลงคิวใหม่/);
  assert.equal(visitDeleteButton(visit), null);
  // มีทั้งใบและรอบ ⇒ ต้นเรื่องที่ขึ้นคือใบ (ลำดับเดียวกับป้ายต้นเรื่อง)
  assert.equal(visitDeleteBlock(v({ requestId: 'RQ1', planId: 'P1' }))?.code, 'survey');
});

test('🔴 ไปถึงไซต์แล้ว = ประวัติ ลบไม่ได้ · ปิดแล้วไม่มีปุ่ม · กำลังทำมีปุ่มแต่บอกเหตุ', () => {
  for (const status of CLOSED_STATES) {
    const visit = v({ status });
    assert.equal(visitDeleteBlock(visit)?.code, 'visited', status);
    assert.equal(visitDeleteButton(visit), null, `${status}: ปุ่มลบบนใบที่ปิดแล้วชวนให้ลบประวัติ`);
  }
  const working = v({ status: 'in_progress' });
  assert.equal(visitDeleteBlock(working)?.code, 'visited');
  assert.deepEqual(visitDeleteButton(working), { blocker: VISIT_DELETE_BLOCKS.visited });
  // ข้อความเดิมของ route ก่อนมีไฟล์นี้ — คนเคยเห็นแล้ว
  assert.match(VISIT_DELETE_BLOCKS.visited, /ประวัติการเข้าไซต์/);
});

/* ⭐ นัดถอนเครื่องที่ระบบสร้างตอนฝ่ายขายปิดเรื่อง "ไม่ต่อ" — **สร้างด้วยตัวสร้างจริง** แล้วถามด่าน
   (ไม่ใช่เขียนรูปแถวเอง) ⇒ วันไหนตัวสร้างเริ่มผูก planId/requestId หรือเปลี่ยนชนิด เทสต์นี้แดงทันที */
function fakeSupabase() {
  const chain = (rows) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder, order: () => builder,
      limit: () => builder, range: () => builder,
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from: () => chain([]),
    rpc: (_name, args) => Promise.resolve({
      data: (args.p_rows || []).map((row) => ({ ...row, code: 'SV-26090099' })), error: null,
    }),
  };
}

test('🔴 นัดถอนจากเรื่อง "ไม่ต่อสัญญา" ลบไม่ได้ — ปุ่มโชว์แล้วบอกเหตุ ให้ยกเลิกแทน', async () => {
  const { visit, error } = await ensureRetrieveVisit(fakeSupabase(), {
    site: { id: 'S1', name: 'ไซต์ A' }, followup: { declineReason: 'ปิดสาขา' }, user: { id: 'u', name: 'AE' },
    todayIso: '2026-09-24',
  });
  assert.equal(error, null);
  assert.equal(isOutOfRoundVisit(visit), true, 'ตัวสร้างไม่ผูกรอบ/ใบ');
  assert.equal(isRenewalRetrieveVisit(visit), true);
  assert.equal(visitDeleteBlock(visit)?.code, 'retrieve');
  const button = visitDeleteButton(visit);
  assert.ok(button, 'โชว์ปุ่ม — ไม่ใช่ซ่อนเงียบ (คนจะถามว่าทำไมใบนี้ไม่มีปุ่มลบ)');
  assert.equal(button.blocker, VISIT_DELETE_BLOCKS.retrieve);
  // เหตุต้องบอก: ไม่มีใครสร้างให้ใหม่ · เครื่องค้างที่ไซต์ · ทางที่ถูก = ยกเลิก
  assert.match(button.blocker, /ไม่ต่อสัญญา/);
  assert.match(button.blocker, /ไม่สร้างให้ใหม่/);
  assert.match(button.blocker, /ใช้งาน/);
  assert.match(button.blocker, /ยกเลิก/);
  // ป้ายต้นเรื่องบนการ์ดกับด่านลบชี้ใบชุดเดียวกัน
  assert.equal(originText(visit), 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา');
  // นัดถอนที่ไปถึงไซต์แล้ว = ประวัติ (ไม่มีปุ่ม) · ยกเลิกไปแล้ว = ยังลบไม่ได้ (เหตุเดิม)
  assert.equal(visitDeleteButton({ ...visit, status: 'done' }), null);
  assert.equal(visitDeleteBlock({ ...visit, status: 'cancelled' })?.code, 'retrieve');
});

test('ป้ายต้นเรื่องอ่านนิยามนัดถอนจากตัวเดียวกับด่านลบ', () => {
  assert.equal(originText({ kind: 'remove' }), 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา');
  assert.equal(originText({ kind: 'remove', planId: 'P1' }), 'จากรอบบริการ');
  assert.equal(originText({ kind: 'repair' }), 'งานนอกรอบ');
  assert.equal(isRenewalRetrieveVisit({ kind: 'repair' }), false);
  assert.equal(isRenewalRetrieveVisit(null), false);
  assert.equal(visitDeleteButton(null), null);
});

test('ป้ายสั้นของ audit ครบทุกเหตุ · ข้อความเจ้าหน้าที่หน้างานชี้ผู้จัดคิว', () => {
  assert.deepEqual(Object.keys(VISIT_DELETE_BLOCK_LABELS).sort(), Object.keys(VISIT_DELETE_BLOCKS).sort());
  assert.match(VISIT_DELETE_CREW_ERROR, /ผู้จัดคิว/);
});

test('⭐ กล่องยืนยัน: ใบไหน (รหัส · ไซต์ · วัน) · หายจากตาราง/รายการงาน · ย้อนไม่ได้ · หน้าตาเป็นการลบ', () => {
  const prompt = visitDeletePrompt(v({ status: 'draft' }), { siteName: 'เซ็นทรัลเวิลด์', when: 'พ. 24 ก.ย. 09:00–12:00' });
  assert.equal(prompt.title, 'ลบนัด');
  assert.equal(prompt.description, 'ยืนยันลบนัด SV-26090001 · เซ็นทรัลเวิลด์ · พ. 24 ก.ย. 09:00–12:00 หรือไม่');
  assert.match(prompt.detail, new RegExp(IRREVERSIBLE_NOTE), 'irreversible=true');
  assert.match(prompt.detail, /ตารางนัดเข้าบริการและรายการงาน/);
  assert.match(prompt.detail, /กู้คืนเองไม่ได้/);
  assert.match(prompt.detail, /“ยกเลิก”/, 'ต้องบอกทางที่เหลือร่องรอย');
  assert.equal(prompt.confirmLabel, 'ลบนัด');
  assert.equal(prompt.tone, 'danger');
  assert.doesNotMatch(prompt.detail, /งานวันนี้/, 'ร่างยังไม่อยู่ในงานวันนี้ของใคร');

  // ขึ้นตารางแล้วมีคน ⇒ บอกว่าหายจากงานของคนนั้น **วันของนัด** (ไม่ใช่ "วันนี้")
  const live = visitDeletePrompt(v({ status: 'scheduled', assigneeName: 'สมชาย ใจดี' }), { siteName: 'ไซต์ A', when: 'พ. 24 ก.ย.', day: 'พ. 24 ก.ย.' });
  assert.match(live.detail, /และงานวัน พ\. 24 ก\.ย\. ของ สมชาย ใจดี/);
  assert.doesNotMatch(live.detail, /งานวันนี้/, 'นัดวันพุธหน้าไม่ใช่ "งานวันนี้"');
  assert.doesNotMatch(live.detail, /ผู้ไปด้วย/, 'ไม่มีผู้ไปด้วย = ไม่พูดถึง');
  // ไม่มีชื่อไซต์/วันที่จัดรูป ⇒ ถอยไปใช้ค่าดิบ ไม่ใช่หัวข้อว่าง
  assert.match(visitDeletePrompt(v()).description, /SV-26090001 · S1 · 2026-09-24/);
});

/* ═══ API ถามด่านตัวเดียวกัน ═══════════════════════════════════════════════ */
const route = readFileSync(new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
const del = route.slice(route.indexOf('export const DELETE'));

test('🔴 DELETE ถาม visitDeleteBlock ตัวเดียวกับปุ่ม — ไม่มีเงื่อนไขของตัวเอง', () => {
  assert.match(del, /const block = visitDeleteBlock\(before, \{ fieldRecords: fieldRecords\.count \}\);\s*if \(block && !force\) return conflict\(block\.message\);/);
  assert.doesNotMatch(del, /canDeleteVisit\(/, 'ด่านเก่า (ประวัติอย่างเดียว) ต้องไม่เหลือเป็นเส้นที่สอง');
  assert.doesNotMatch(del, /\.planId|\.requestId|'remove'/, 'ห้ามเขียนเงื่อนไขซ้ำที่ route');
  // audit บอกว่าข้ามด่านอะไร
  assert.match(del, /แอดมินข้ามด่าน\$\{VISIT_DELETE_BLOCK_LABELS\[block\.code\]\}/);
});

test('🔴 DELETE: เจ้าหน้าที่หน้างาน (ownWorkOnly) ลบไม่ได้ แม้เป็นงานของตัวเอง — ก่อนเส้น force', () => {
  assert.match(del, /if \(access\.ownWorkOnly\) return forbidden\(VISIT_DELETE_CREW_ERROR\);/);
  assert.ok(del.indexOf('access.ownWorkOnly') < del.indexOf('isForceRequest('));
  assert.ok(del.indexOf('requireVisit(') < del.indexOf('access.ownWorkOnly'));
});

/* ═══ รีวิว 24/09 ─ "ไปถึงไซต์แล้ว" ต้องดูร่องรอย ไม่ใช่สถานะอย่างเดียว ═══════════════════════════
   🐞 ใบที่ปิดเป็น "ทำไม่ได้" แล้วถูกเปลี่ยนกลับเป็น ยกเลิก/นัดไว้/ร่าง ในฟอร์มแก้นัด เคยลบได้ ⇒ เธรด "ทำไม่ได้"
      ถูกกวาด + ผลรายเครื่อง/ของที่ใช้หายตาม CASCADE */
const unableBefore = () => v({
  status: 'unable', actualDate: '2026-09-23', actualStartTime: null, actualEndTime: null,
  unableReason: 'อาคารไม่ให้เข้าวันหยุด ลูกค้าไม่แจ้ง',
});

test('🔴 ปิด "ทำไม่ได้" แล้วเปิดกลับ (ยกเลิก/นัดไว้/ร่าง/เลื่อนแล้ว) = ยังเป็นประวัติ — ปุ่มโชว์แต่กดไม่ได้ · API ตีกลับ', () => {
  const before = unableBefore();
  assert.equal(visitDeleteBlock(before)?.code, 'visited', 'ตั้งต้น: ใบที่ปิดแล้วลบไม่ได้');
  for (const status of VISIT_STATUSES_MANUAL.filter((s) => s !== 'unable')) {
    // ⭐ ทางจริงของ PATCH: `normalizeVisitInput({ ...before, ...body })` — ฟอร์มส่งค่าเดิมกลับพร้อมสถานะใหม่
    const { value, error } = normalizeVisitInput({ ...before, status }, { existingKind: before.kind });
    assert.equal(error, null, status);
    const reopened = { ...before, ...value };
    assert.equal(reopened.actualDate, '2026-09-23', `${status}: PATCH ไม่ล้างวันเข้าจริง — ร่องรอยต้องอ่านได้`);
    assert.equal(hasSiteVisitTrace(reopened), true, status);
    assert.equal(visitDeleteBlock(reopened)?.code, 'visited', `${status}: ต้องยังเป็นประวัติการเข้าไซต์`);
    assert.deepEqual(visitDeleteButton(reopened), { blocker: VISIT_DELETE_BLOCKS.visited },
      `${status}: ปุ่มโชว์แล้วบอกเหตุ — ไม่ใช่กดลบได้`);
  }
});

test('🔴 ร่องรอยแต่ละช่องพอให้ลบไม่ได้ · แถวลูก (ผลรายเครื่อง/ของที่ใช้) ที่ route นับให้ก็เช่นกัน', () => {
  for (const trace of [{ actualDate: '2026-09-23' }, { actualStartTime: '09:05' }, { actualEndTime: '10:00' }]) {
    assert.equal(visitDeleteBlock(v({ status: 'scheduled', ...trace }))?.code, 'visited', JSON.stringify(trace));
  }
  // ผลรายเครื่อง/ของที่ใช้ ไม่มีร่องรอยบนแถวนัด (บันทึกไว้แต่ยังไม่ได้ปิด) — จอไม่รู้ route เป็นคนนับ
  assert.equal(visitDeleteBlock(v({ status: 'scheduled' }), { fieldRecords: 1 })?.code, 'visited');
  assert.equal(visitDeleteBlock(v({ status: 'scheduled' }), { fieldRecords: 0 }), null);
  // ต้นเรื่องยังมาก่อนประวัติ (เหตุที่แก้ยากที่สุดขึ้นก่อน)
  assert.equal(visitDeleteBlock(v({ planId: 'P1', actualDate: '2026-09-23' }))?.code, 'round');
});

test('⭐ ไม่มีทางตัน: เหตุผล "ทำไม่ได้" ที่ค้างในช่องที่มองไม่เห็นไม่นับเป็นร่องรอย — ล้างวันเข้าจริงแล้วลบได้', () => {
  /* ช่อง unableReason บนฟอร์มโผล่เฉพาะตอนสถานะ "ทำไม่ได้" ⇒ ถ้านับ คนที่ล้างวันเข้าจริงเพราะบันทึกผิด
     จะติดเหตุ "ไปถึงไซต์แล้ว" จากช่องที่แก้เองไม่ได้ */
  const cleaned = v({ status: 'cancelled', actualDate: null, unableReason: 'พิมพ์ไว้แล้วเปลี่ยนใจ ไม่ได้ไปจริง' });
  assert.equal(hasSiteVisitTrace(cleaned), false);
  assert.equal(visitDeleteBlock(cleaned), null);
  assert.match(VISIT_DELETE_BLOCKS.visited, /แก้ข้อมูล/, 'ข้อความบอกทางออก (แก้ข้อมูล) — ตรงกับที่ล้างได้จริง');
});

test('⭐ visitFieldRecordCount นับทั้งผลรายเครื่องและของที่ใช้ · query พัง = คืน error ไม่ใช่ 0 (ลบได้)', async () => {
  const fake = (counts, errors = {}) => ({
    from: (table) => {
      const q = {
        select: (_col, opts) => { assert.deepEqual(opts, { count: 'exact', head: true }); return q; },
        eq: (col, val) => {
          assert.equal(col, 'visitId'); assert.equal(val, 'V1');
          return Promise.resolve({ count: counts[table] ?? 0, error: errors[table] || null });
        },
      };
      return q;
    },
  });
  assert.deepEqual(await visitFieldRecordCount(fake({ service_visit_assets: 2, service_visit_items: 3 }), 'V1'), { count: 5, error: null });
  assert.deepEqual(await visitFieldRecordCount(fake({}), 'V1'), { count: 0, error: null });
  const broken = await visitFieldRecordCount(fake({ service_visit_items: 4 }, { service_visit_assets: { message: 'boom' } }), 'V1');
  assert.equal(broken.count, null);
  assert.equal(broken.error.message, 'boom');
});

test('🔴 DELETE นับแถวลูกก่อนถามด่าน · นับพัง = 500 (ไม่ถือว่าไม่มี)', () => {
  assert.match(del, /const fieldRecords = await visitFieldRecordCount\(supabase, id\);\s*if \(fieldRecords\.error\) return fail\(fieldRecords\.error\.message, 500\);/);
  assert.ok(del.indexOf('visitFieldRecordCount(') < del.indexOf('visitDeleteBlock('));
  assert.ok(del.indexOf('visitDeleteBlock(') < del.indexOf(".from('service_visits').delete()"));
});

/* ═══ รีวิว 24/09 ─ ข้อความต้องบอกที่อยู่ของตัวคุมที่มีจริง (หน้าไซต์ไม่มีฟอร์มแก้นัด) ═══════════ */
test('⭐ ทุกเหตุที่สั่ง "เปลี่ยนเป็นยกเลิก" บอกว่าฟอร์มแก้นัดอยู่หน้าไหน — ชื่อหน้าตรงหัวหน้าจริง', () => {
  const schedule = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  const pageTitle = schedule.match(/title="([^"]+)"\s*\n\s*subtitle=/)?.[1];
  assert.equal(pageTitle, 'จัดคิวเจ้าหน้าที่', 'หัวหน้าจัดคิวเปลี่ยนชื่อ ⇒ แก้ VISIT_EDIT_FORM_PLACE ด้วย');
  assert.ok(VISIT_EDIT_FORM_PLACE.endsWith(`หน้า${pageTitle}`));
  for (const [code, message] of Object.entries(VISIT_DELETE_BLOCKS)) {
    if (!/ฟอร์มแก้นัด/.test(message)) continue;
    assert.ok(message.includes(VISIT_EDIT_FORM_PLACE), `${code}: "ในฟอร์มแก้นัด" เฉย ๆ บนหน้าไซต์หาไม่เจอ`);
  }
  assert.match(VISIT_DELETE_BLOCKS.survey, /การ์ดคำร้องบนหน้าเดียวกัน/);
});

/* ═══ รีวิว 24/09 ─ เหตุของนัดของรอบต้องไม่สัญญาสิ่งที่ระบบไม่ทำ ═══════════════════════════════════ */
test('⭐ นัดของรอบ: ลบแล้ววันนั้นกลับมา "เมื่อบันทึกรอบอีกครั้ง" (ไม่ใช่เอง) · ยกเลิกแล้วไม่เติมซ้ำ — ตามตัวเติมนัดจริง', () => {
  const plan = { id: 'P1', siteId: 'S1', kind: 'refill', startDate: '2026-09-01', everyDays: 28, isActive: true };
  const from = '2026-09-24';
  const planned = ensureVisits(plan, [], { from });
  assert.ok(planned.length >= 2, 'ตั้งต้นต้องมีวันตามรอบในช่วง 90 วัน');
  const [first, ...rest] = planned.map((row) => ({ ...row, status: 'scheduled' }));
  // ลบนัดวันแรกทิ้ง ⇒ บันทึกรอบครั้งหน้า (ensureVisits) เติมวันนั้นกลับมา
  assert.deepEqual(ensureVisits(plan, rest, { from }).map((r) => r.scheduledDate), [first.scheduledDate]);
  // ยกเลิกแทน ⇒ รอบนับว่ามี ไม่เติมซ้ำ
  assert.deepEqual(ensureVisits(plan, [{ ...first, status: 'cancelled' }, ...rest], { from }), []);
  // ข้อความ: ไม่ใช่ "กลับมาเอง" · ต้องบอกว่าเกิดตอนบันทึกรอบ
  assert.doesNotMatch(VISIT_DELETE_BLOCKS.round, /เอง/);
  assert.match(VISIT_DELETE_BLOCKS.round, /เมื่อมีคนบันทึกรอบบริการอีกครั้ง/);
  assert.match(VISIT_DELETE_BLOCKS.round, /ไม่เติมซ้ำ/);
});

/* ═══ รีวิว 24/09 ─ กล่องยืนยันนับผู้ไปด้วย ═══════════════════════════════════════════════════════ */
test('⭐ กล่องยืนยัน: นัดที่ขึ้นตารางแล้วบอกทั้งผู้รับผิดชอบและจำนวนผู้ไปด้วย พร้อมวันของนัด', () => {
  const visit = v({ status: 'scheduled', assigneeName: 'สมชาย ใจดี', assistantIds: ['U2', 'U3'] });
  const prompt = visitDeletePrompt(visit, { siteName: 'ไซต์ A', when: 'พ. 1 ต.ค. 09:00–12:00', day: 'พ. 1 ต.ค.' });
  assert.match(prompt.detail, /และงานวัน พ\. 1 ต\.ค\. ของ สมชาย ใจดี กับผู้ไปด้วยอีก 2 คน/);
  // ไม่มีผู้รับผิดชอบแต่มีผู้ไปด้วย ⇒ ยังบอกว่าหายจากงานของใคร
  const helpersOnly = visitDeletePrompt(v({ status: 'scheduled', assistantIds: ['U2'] }), { day: 'พ. 1 ต.ค.' });
  assert.match(helpersOnly.detail, /ของ ผู้ไปด้วย 1 คน/);
  // ไม่ส่งวันที่จัดรูป ⇒ ถอยไปใช้วันดิบของนัด ไม่ใช่ "วันนี้"
  assert.match(visitDeletePrompt(visit).detail, /งานวัน 2026-09-24 ของ สมชาย ใจดี/);
  // ร่าง = ยังไม่อยู่ในงานของใคร แม้ติ๊กคนไว้แล้ว
  assert.doesNotMatch(visitDeletePrompt({ ...visit, status: 'draft' }).detail, /ผู้ไปด้วย|ของ สมชาย/);
  // หน้าจัดคิวส่งวันที่จัดรูปเข้ามา
  const schedule = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  assert.match(schedule, /visitDeletePrompt\(visit, \{ siteName: sitesById\.get\(visit\.siteId\)\?\.name, when, day \}\)/);
});
