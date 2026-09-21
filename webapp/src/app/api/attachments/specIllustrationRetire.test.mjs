// ── ลบภาพประกอบใบสเปคที่เอกสาร FM-SA-04 อ้างอยู่ = ปลดระวาง ไม่ใช่ลบ ─────────────
//
// มติ 21/09/2569 (docs/fm-sa-04-document-model.md "รูปห้ามหาย") — เอกสารที่ยื่นหรืออนุมัติแล้ว
// ชี้รูปด้วย id ใน `illustrationIds` ⇒ ลบแถวแล้วปล่อยไฟล์บน Drive = กระดาษที่ส่งลูกค้าไปแล้ว
// เปิดรูปไม่ขึ้นตลอดกาล และกู้ไม่ได้เพราะตัวไฟล์หายไปด้วย
//
// ⚠️ อ่านจาก source ไม่ใช่ import — route.js ของ Next export ได้แค่ handler และตัว route
//    ลาก supabase admin + cookies ของ next/headers มาด้วย (แพตเทิร์นเดียวกับ
//    attachmentWriteGateCoverage.test.mjs) · สิ่งที่ล็อกที่นี่คือ **ลำดับและการเดินสาย**
//    ซึ่งเป็นจุดที่พังเงียบ: ด่านที่มาหลังคำสั่งลบ หรืออ่าน error แล้วไหลต่อไปลบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ลอกคอมเมนต์ออก — คอมเมนต์ในไฟล์เล่าเรื่อง "ลบ" ไว้หลายที่ ต้องไม่ถูกนับเป็นโค้ด
const source = readFileSync(fileURLToPath(new URL('./[id]/route.js', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const sliceFn = (start) => {
  const at = source.indexOf(start);
  assert.ok(at >= 0, `หา "${start}" ไม่เจอ — ชื่อเปลี่ยนหรือย้ายที่แล้ว`);
  const end = source.indexOf('\n}\n', at);
  return source.slice(at, end === -1 ? undefined : end);
};

const deleteHandler = sliceFn('export async function DELETE(');
const retire = sliceFn('async function retireReferencedIllustration(');
const recheck = sliceFn('async function retireBeforeDelete(');
const patchHandler = sliceFn('export async function PATCH(');
const stampAt = source.indexOf('const retiredMetadataOf =');
const stamp = source.slice(stampAt, source.indexOf('\n});\n', stampAt));

test('🔴 ด่านปลดระวางต้องมาก่อนคำสั่งลบแถวและก่อนปล่อยไฟล์ — หลังจากนั้นไม่มีอะไรให้เก็บแล้ว', () => {
  const gate = deleteHandler.indexOf('retireReferencedIllustration(');
  const rowDelete = deleteHandler.indexOf(".from('attachments').delete()");
  const release = deleteHandler.indexOf('releaseAttachmentFile(att)');
  assert.ok(gate > 0, 'DELETE ต้องเรียก retireReferencedIllustration');
  assert.ok(rowDelete > 0 && release > 0, 'หาคำสั่งลบแถว/ปล่อยไฟล์ไม่เจอ');
  assert.ok(gate < rowDelete && gate < release, 'ด่านปลดระวางต้องอยู่ก่อนคำสั่งลบทั้งสอง');
  // ผลของด่าน (ปลดระวางแล้ว หรือ error) ต้องจบคำขอ ไม่ใช่ถูกทิ้งแล้วเดินไปลบต่อ
  assert.match(deleteHandler, /const handled = await retireReferencedIllustration\([^)]*\);\s*if \(handled\) return handled;/);
});

test('ด่านจับเฉพาะภาพประกอบของสินค้า — ไฟล์แนบชนิดอื่นลบได้ตามเดิม', () => {
  assert.match(deleteHandler, /att\.entityType === 'product' && att\.docType === SPEC_ILLUSTRATION_DOC_TYPE/);
});

test('🔴 ตรวจการอ้างอิงไม่สำเร็จ = หยุดที่ 500 ห้ามไหลไปลบ (supabase ไม่ throw)', () => {
  // ตัวตรวจคือ isIllustrationReferenced ของ store — query `.contains('illustrationIds', [id])`
  // กับ Rev ที่ไม่ใช่ร่าง และคืน { error } เมื่ออ่านไม่ได้ (ไม่ใช่ referenced: false)
  assert.match(retire, /const ref = await isIllustrationReferenced\(supabase, att\.id\);/);
  const errorCheck = retire.indexOf('if (ref.error)');
  const notReferenced = retire.indexOf('if (!ref.referenced) return null;');
  assert.ok(errorCheck > 0, 'ต้องเช็ค ref.error');
  assert.ok(notReferenced > 0, 'ไม่มีใครอ้าง = คืน null ให้ลบตามปกติ');
  assert.ok(errorCheck < notReferenced, 'ต้องเช็ค error ก่อนตัดสินว่า "ไม่มีใครอ้าง"');
  assert.match(retire.slice(errorCheck, notReferenced), /status: 500/);
});

test('ปลดระวาง = ประทับ metadata ของแถวเดิม ไม่ลบแถว ไม่ปล่อยไฟล์ และเช็คว่าโดนแถวจริง', () => {
  assert.doesNotMatch(retire, /\.delete\(/, 'ด่านปลดระวางต้องไม่ลบแถว');
  assert.doesNotMatch(retire, /releaseAttachmentFile/, 'ด่านปลดระวางต้องไม่ปล่อยไฟล์บน Drive');
  // ตราปลดระวางประกอบที่เดียว (retiredMetadataOf) — สองทางที่ประทับใช้ก้อนเดียวกัน
  assert.ok(stampAt > 0, 'หา retiredMetadataOf ไม่เจอ');
  for (const key of ['retiredAt', 'retiredBy', 'retiredByName']) {
    assert.match(stamp, new RegExp(`${key}:`), `ต้องประทับ ${key}`);
  }
  // metadata เดิม (คำบรรยาย · ลำดับ · คีย์ของ Drive) ต้องคงอยู่ — ประทับทับทั้งก้อนแล้วคำบรรยายหาย
  assert.match(stamp, /\.\.\.\(att\.metadata \|\| \{\}\)/);
  assert.match(retire, /const metadata = retiredMetadataOf\(att, user\);/);
  assert.match(retire, /\.update\(\{ metadata \}\)\.eq\('id', att\.id\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(retire, /if \(retireError\) return/);
  assert.match(retire, /if \(!retired\) return/);
  // กดซ้ำไม่ประทับทับ — ผู้ปลดคนแรกคือข้อมูลที่ต้องเก็บ
  assert.match(retire, /if \(!isRetiredAttachment\(att\)\)/);
});

test('คำตอบบอกผู้ใช้ว่าทำไมรูปไม่ถูกลบ — ข้อความตามมติ', () => {
  assert.match(source, /'รูปนี้อยู่ในเอกสาร FM-SA-04 ที่ยื่นหรืออนุมัติแล้ว จึงเก็บไฟล์ไว้และซ่อนจากสเปค'/);
  assert.match(retire, /success: true, retired: true, message: SPEC_ILLUSTRATION_RETIRED_MESSAGE/);
});

test('PATCH ตัดคีย์ปลดระวางออกจากคำขอ — จอยกเลิกการปลดระวางเองไม่ได้', () => {
  assert.match(patchHandler, /for \(const key of RETIRED_METADATA_KEYS\) delete requested\[key\];/);
  const strip = patchHandler.indexOf('for (const key of RETIRED_METADATA_KEYS)');
  const merge = patchHandler.indexOf('const merged =');
  assert.ok(strip > 0 && strip < merge, 'ต้องตัดก่อน merge');
  assert.match(patchHandler, /const merged = \{ \.\.\.\(att\.metadata \|\| \{\}\), \.\.\.requested \};/);
});

/* 🔴 ลบรูปที่ "ยังไม่มีใครอ้าง" แข่งกับคำขอยื่นที่กำลังวิ่ง — คำขอยื่นอ่านรูปไปแล้วแต่ยังไม่ commit
   ⇒ ด่านแรกไม่เห็น · ถ้าลบแถว + ปล่อยไฟล์ทันที กระดาษที่อนุมัติทีหลังชี้ไฟล์ที่หายไปตลอดกาล
   ⇒ ประทับปลดระวางก่อน แล้วตรวจซ้ำ · ฝั่งยื่นตรวจรูปซ้ำหลังเขียน (ถอยถ้ารูปหาย/ถูกปลดระวาง) */
test('🔴 ลบรูปที่ไม่มีใครอ้าง: ประทับปลดระวางก่อน → ตรวจซ้ำ → ค่อยลบแถวและปล่อยไฟล์', () => {
  const first = deleteHandler.indexOf('retireReferencedIllustration(');
  const second = deleteHandler.indexOf('retireBeforeDelete(');
  const rowDelete = deleteHandler.indexOf(".from('attachments').delete()");
  const release = deleteHandler.indexOf('releaseAttachmentFile(att)');
  assert.ok(first > 0 && second > first, 'ตรวจซ้ำต้องมาหลังด่านแรก');
  assert.ok(second < rowDelete && second < release, 'ตรวจซ้ำต้องมาก่อนลบแถว/ปล่อยไฟล์');
  assert.match(deleteHandler, /const raced = await retireBeforeDelete\([^)]*\);\s*if \(raced\) return raced;/);

  // ในตัวตรวจซ้ำ: ประทับก่อน แล้วค่อยถาม · ไม่ลบแถว ไม่ปล่อยไฟล์เอง
  const stampCall = recheck.indexOf('retiredMetadataOf(att, user)');
  const ask = recheck.indexOf('isIllustrationReferenced(supabase, att.id)');
  assert.ok(stampCall > 0 && ask > stampCall, 'ต้องประทับปลดระวางก่อนตรวจซ้ำ');
  assert.match(recheck, /if \(!isRetiredAttachment\(att\)\)/, 'กดซ้ำไม่ประทับทับ');
  assert.match(recheck, /if \(retireError\) return/);
  assert.match(recheck, /if \(!retired\) return/);
  assert.doesNotMatch(recheck, /\.delete\(/);
  assert.doesNotMatch(recheck, /releaseAttachmentFile/);
  // ตรวจซ้ำล้ม = หยุด (เก็บไฟล์ไว้) · มีคนอ้างทัน = ตอบว่าปลดระวาง ไม่ใช่ลบ
  const errorCheck = recheck.indexOf('if (again.error)');
  const referenced = recheck.indexOf('if (again.referenced)');
  assert.ok(errorCheck > ask && referenced > errorCheck);
  assert.match(recheck.slice(errorCheck, referenced), /status: 500/);
  assert.match(recheck.slice(referenced), /retired: true, message: SPEC_ILLUSTRATION_RETIRED_MESSAGE/);
});
