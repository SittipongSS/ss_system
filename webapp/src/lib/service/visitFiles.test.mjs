// ── ไฟล์หลักฐานหน้างานของนัดเปิดผ่านระบบ ไม่ใช่ลิงก์ Drive ตรง ──────────────────────────────
//
// 🐞 รูปหน้างาน/ลายเซ็นผู้รับงานเก็บเป็น `webViewLink` ของ Drive แล้วจอลิงก์ตรง ⇒ ไฟล์อยู่ใน Shared Drive
//    ที่มีสมาชิก 2 ราย (มติ #1274 ห้ามเพิ่มพนักงาน/แชร์ทั้งโดเมน) ⇒ TS และฝ่ายขายกดแล้วเจอหน้าขอสิทธิ์
//    ของ Google ทุกคน · พบระหว่างเปิดใบส่งงานให้ฝ่ายขาย (มติผู้ใช้ 2026-09-24) ก่อนมีนัดไหนปิดงานพร้อมรูป
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VISIT_SIGNATURE_FILE_NAME, pickVisitFile, savedVisitFileHref, visitFileHref, visitFileTarget,
} from './visitFiles.js';
import { buildVisitReport } from './visitReport.js';
import { parseDriveId } from '../driveId.js';
import { lockedOut } from '../../proxy.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
const drive = (id) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
const visit = {
  id: 'SVV-abc',
  attachments: [
    { url: drive('1PhotoBeforeAAAAAAA'), name: 'IMG_0001.jpg', kind: 'before' },
    { url: drive('1PhotoAfterBBBBBBBB'), name: 'รูปหน้างาน', kind: 'after' },
  ],
  customerSignatureUrl: drive('1SignatureCCCCCCCC'),
};
const q = (query) => new URLSearchParams(query);

test('ลิงก์ของระบบ: ?i=<ลำดับ> / ?sig=1 · ลำดับเพี้ยน = null (ไม่ใช่ลิงก์เสีย)', () => {
  assert.equal(visitFileHref('SVV-abc', { index: 0 }), '/api/service/visits/SVV-abc/file?i=0');
  assert.equal(visitFileHref('SVV-abc', { index: 3 }), '/api/service/visits/SVV-abc/file?i=3');
  assert.equal(visitFileHref('SVV-abc', { signature: true }), '/api/service/visits/SVV-abc/file?sig=1');
  assert.equal(visitFileHref('SV V/1', { index: 0 }), '/api/service/visits/SV%20V%2F1/file?i=0');
  for (const index of [-1, 1.5, '0', null, undefined, NaN]) {
    assert.equal(visitFileHref('SVV-abc', { index }), null, String(index));
  }
  assert.equal(visitFileHref('', { index: 0 }), null);
});

test('🔴 server หยิบไฟล์จากแถวของนัดเท่านั้น — Drive id ใน query ไม่มีผล', () => {
  assert.equal(visitFileTarget(visit, q('i=0')).driveFileId, '1PhotoBeforeAAAAAAA');
  assert.equal(visitFileTarget(visit, q('i=1')).driveFileId, '1PhotoAfterBBBBBBBB');
  assert.equal(visitFileTarget(visit, q('sig=1')).driveFileId, '1SignatureCCCCCCCC');
  // ยัด id ของไฟล์อื่นมาทุกรูปแบบ — ได้ไฟล์ของแถวเสมอ หรือไม่ได้อะไรเลย
  assert.equal(visitFileTarget(visit, q('i=0&id=1SomeoneElsesFileXXX')).driveFileId, '1PhotoBeforeAAAAAAA');
  assert.equal(visitFileTarget(visit, q('f=1SomeoneElsesFileXXX')).status, 404);
  assert.equal(visitFileTarget(visit, q(`url=${encodeURIComponent(drive('1SomeoneElsesFileXXX'))}`)).status, 404);
});

test('ลำดับที่เสีย/เกินช่วง = ไม่พบ (ไม่เดาเป็นรูปแรกแบบเธรดอัปเดต)', () => {
  for (const query of ['', 'i=', 'i=2', 'i=-1', 'i=1.5', 'i=abc', 'i=0x1', 'i=99999', 'sig=0']) {
    assert.equal(pickVisitFile(visit, q(query)), null, query);
    assert.deepEqual(visitFileTarget(visit, q(query)), { status: 404, error: 'ไม่พบไฟล์นี้ในนัด' }, query);
  }
  assert.equal(pickVisitFile({ ...visit, customerSignatureUrl: null }, q('sig=1')), null);
  assert.equal(pickVisitFile({ id: 'x' }, q('i=0')), null);
  assert.equal(pickVisitFile(null, q('i=0')), null);
  // ช่องว่างในแถวไม่ใช่ไฟล์
  assert.equal(pickVisitFile({ attachments: [{ url: '   ' }] }, q('i=0')), null);
});

test('sig=1 มาก่อน i · ชื่อไฟล์สำรองเมื่อแถวไม่มีชื่อ', () => {
  assert.deepEqual(pickVisitFile(visit, q('i=0&sig=1')), { url: visit.customerSignatureUrl, name: VISIT_SIGNATURE_FILE_NAME });
  assert.deepEqual(pickVisitFile(visit, q('i=0')), { url: visit.attachments[0].url, name: 'IMG_0001.jpg' });
  assert.equal(pickVisitFile({ attachments: [{ url: drive('1NoNameDDDDDDDDDD') }] }, q('i=0')).name, 'รูปหน้างาน');
});

test('🔴 URL ที่ไม่ใช่ Drive = ไม่พบ — ไม่ redirect ตามค่าในแถว (กัน open redirect จากโดเมนแอป)', () => {
  for (const url of ['https://evil.example/photo.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
    const target = visitFileTarget({ attachments: [{ url }] }, q('i=0'));
    assert.equal(target.status, 404, url);
    assert.equal(target.driveFileId, undefined, url);
  }
  const route = read('app/api/service/visits/[id]/file/route.js');
  assert.doesNotMatch(route, /Response\.redirect|redirect\(/);
});

test('แผ่นปิดงาน: ไฟล์ที่บันทึกแล้ว → ลิงก์ของระบบตามลำดับในแถวล่าสุด · ไฟล์ที่ยังไม่บันทึก = null', () => {
  assert.equal(savedVisitFileHref('SVV-abc', visit, visit.attachments[1].url), '/api/service/visits/SVV-abc/file?i=1');
  assert.equal(savedVisitFileHref('SVV-abc', visit, ` ${visit.customerSignatureUrl} `), '/api/service/visits/SVV-abc/file?sig=1');
  assert.equal(savedVisitFileHref('SVV-abc', visit, drive('1JustUploadedEEEEEE')), null);
  assert.equal(savedVisitFileHref('SVV-abc', null, visit.attachments[0].url), null);
  assert.equal(savedVisitFileHref('SVV-abc', visit, ''), null);
  // แถวเรียงใหม่ (อีกเครื่องบันทึกทับ) — ลำดับตามแถวล่าสุด ไม่ใช่ตามฟอร์ม
  const reordered = { ...visit, attachments: [visit.attachments[1], visit.attachments[0]] };
  assert.equal(savedVisitFileHref('SVV-abc', reordered, visit.attachments[0].url), '/api/service/visits/SVV-abc/file?i=1');
});

test('parseDriveId ย้ายไป lib/driveId.js — lib/drive.js ยังส่งต่อชื่อเดิม (lib/master/googleDocs เรียกผ่านมัน)', () => {
  assert.equal(parseDriveId(drive('1PhotoBeforeAAAAAAA')), '1PhotoBeforeAAAAAAA');
  assert.equal(parseDriveId('https://drive.google.com/open?id=1OpenIdFFFFFFFFFF'), '1OpenIdFFFFFFFFFF');
  assert.equal(parseDriveId('https://docs.google.com/document/d/1DocGGGGGGGGGGGG/edit'), '1DocGGGGGGGGGGGG');
  assert.equal(parseDriveId('https://drive.google.com/file/d/short/view'), null);
  assert.equal(parseDriveId(null), null);
  assert.match(read('lib/drive.js'), /export \{ parseDriveId \} from '@\/lib\/driveId';/);
  assert.doesNotMatch(read('lib/drive.js'), /export function parseDriveId/);
});

test('🔴 ใบส่งงานส่งต่อ attachments ทั้งแถว ไม่กรอง ไม่เรียง — จอชี้ไฟล์ด้วยลำดับนี้', () => {
  const withGap = { ...visit, attachments: [visit.attachments[1], { url: '', kind: 'other' }, visit.attachments[0]] };
  const report = buildVisitReport({ visit: withGap });
  assert.deepEqual(report.attachments, withGap.attachments);
  assert.equal(report.signatureUrl, visit.customerSignatureUrl);
});

test('🔴 เส้นไฟล์ใช้ด่านเดียวกับใบส่งงาน และตัดสินไฟล์ผ่าน visitFileTarget เท่านั้น', () => {
  const route = read('app/api/service/visits/[id]/file/route.js');
  assert.match(route, /export const runtime = 'nodejs'/, 'lib/drive ต้องรันบน Node');
  assert.match(route, /requireVisit\(\{ user, supabase, id, report: true \}\)/);
  assert.match(route, /visitFileTarget\(access\.visit, new URL\(req\.url\)\.searchParams\)/);
  assert.match(route, /getFileStream\(target\.driveFileId\)/);
  assert.match(route, /attachmentFileHeaders\(/, 'header ชุดเดียวกับไฟล์แนบ — ชนิดไม่ปลอดภัยต้องเป็นดาวน์โหลด + nosniff');
  // อ่าน query ที่อื่นเมื่อไร = มีทางให้ id จากภายนอกหลุดไปถึง Drive
  assert.doesNotMatch(route, /searchParams\.get\(/);
  assert.doesNotMatch(route, /parseDriveId/);
});

test('🔴 จอไม่ลิงก์ URL ของ Drive ที่เก็บในแถวตรง ๆ อีก', () => {
  const page = read('app/service/visits/[id]/page.js');
  const sheet = read('components/service/CloseVisitSheet.js');
  for (const [rel, src] of [['page', page], ['sheet', sheet]]) {
    assert.doesNotMatch(src, /href=\{(att\.url|report\.signatureUrl|form\.customerSignatureUrl)\}/, rel);
    assert.doesNotMatch(src, /href=\{[^}]*(?:\.url|Url)\}/, `${rel}: href ที่เป็น url ดิบจากแถว`);
  }
  assert.match(page, /href=\{visitFileHref\(visit\.id, \{ index \}\)\}/);
  assert.match(page, /href=\{visitFileHref\(visit\.id, \{ signature: true \}\)\}/);
  assert.match(sheet, /savedVisitFileHref\(visit\.id, savedFiles \|\| visit, url\)/);
  // ไฟล์ที่เพิ่งอัป (ยังไม่อยู่ในแถว) เปิดจากไบต์ในเครื่อง — และต้องคืนหน่วยความจำ
  assert.match(sheet, /URL\.createObjectURL\(blob\)/);
  assert.match(sheet, /URL\.revokeObjectURL\(url\)/);
});

test('proxy ไม่ตัดเส้นไฟล์ของฝ่ายขาย/TS (GET ใต้ /api/service)', () => {
  for (const role of ['ae', 'ac', 'ae_supervisor', 'commercial_manager', 'ts_manager']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/api/service/visits/SVV-1/file', 'GET', true), false, role);
  }
});
