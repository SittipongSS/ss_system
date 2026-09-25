// ── ปุ่มอนุมัติใบเสนอราคาไม่รอ chromium (มติผู้ใช้ 2026-09-24 "ทำเลย") ──────────────────────────
//
// 🐞 ผู้ใช้: "กดอนุมัติแล้วโหลดนาน เพราะลายเซ็นอยู่ Google Drive หรือนานที่เข้ารหัส" — วัดจาก prod (38 ใบล่าสุด)
//    ไม่ใช่ทั้งสองอย่าง: ลายเซ็นอยู่ Supabase Storage และโหลด + base64 + ตรึง HTML ใช้ค่ากลาง ~0.34 วิ
//    ตัวที่กินเวลาคือ chromium พิมพ์ PDF ถาวร ค่ากลาง 4.8 วิ (2.1–6.0) จากทั้งคำขอ ~5.3 วิ
//    ⇒ ย้ายไปทำหลังตอบหน้าจอ (`after`) · ดาวน์โหลดยังสร้างเองได้ถ้า PDF ยังไม่เกิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureIssuedQuotationPdfLater } from './issuedQuotationPdf.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
const ROUTES = [
  'app/api/sales-planning/quotations/[id]/approval/route.js', // กดอนุมัติ
  'app/api/sales-planning/quotations/[id]/route.js', // เปลี่ยนภาษาใบที่อนุมัติแล้ว = ตรึงฉบับใหม่
];

test('🔴 อนุมัติ/เปลี่ยนภาษา ไม่ await chromium ในคำขอ — ส่งต่อให้ captureIssuedQuotationPdfLater', () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.doesNotMatch(src, /await captureIssuedQuotationPdf\(/, rel);
    assert.doesNotMatch(src, /import \{[^}]*\bcaptureIssuedQuotationPdf\b[^}]*\} from '@\/lib\/sales\/issuedQuotationPdf'/, rel);
    assert.match(src, /captureIssuedQuotationPdfLater\(supabase, \{/, rel);
    // งานใน after กินเพดานเวลาของ route — ต้องเผื่อ cold start ของ chromium เท่าเส้นดาวน์โหลด
    assert.match(src, /export const maxDuration = 60;/, rel);
  }
  // ตาข่ายของการย้ายไปทำทีหลัง: PDF ยังไม่เกิดตอนกดดาวน์โหลด = เส้นนี้สร้างเองจาก HTML ที่ตรึง
  assert.match(read('app/api/sales-planning/quotations/[id]/issued/pdf/route.js'), /await captureIssuedQuotationPdf\(/);
});

test('ตัวห่อใช้ after ของ Next และ log ทุกครั้งที่พลาด (ไม่มีใครรออยู่ปลายทางแล้ว)', () => {
  const src = read('lib/sales/issuedQuotationPdf.js');
  assert.match(src, /import \{ after \} from 'next\/server';/);
  assert.match(src, /after\(run\);/);
  assert.match(src, /\.catch\(\(error\) => console\.error\(/);
});

test('ไม่มีฉบับตรึง (snapshot/HTML) = ไม่ทำอะไร', async () => {
  let touched = false;
  const supabase = { from() { touched = true; throw new Error('ต้องไม่ถูกเรียก'); } };
  captureIssuedQuotationPdfLater(supabase, { quotationId: 'QT-1', snapshotId: null, html: '<p>x</p>' });
  captureIssuedQuotationPdfLater(supabase, { quotationId: 'QT-1', snapshotId: 'ISD-1', html: '' });
  captureIssuedQuotationPdfLater(supabase, { quotationId: 'QT-1', snapshotId: 'ISD-1' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(touched, false);
});

test('นอกบริบท request (สคริปต์/เทสต์) ยิงตรง · พลาด = log พร้อมเลขใบ ไม่โยนออกมา', async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    // อ่านแถว PDF เดิมพัง ⇒ captureIssuedQuotationPdf โยนก่อนถึง chromium
    const failing = {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: null, error: new Error('db down') }),
    };
    const supabase = { from: () => failing };
    captureIssuedQuotationPdfLater(supabase, { quotationId: 'QT-1', snapshotId: 'ISD-1', html: '<p>x</p>' });
    captureIssuedQuotationPdfLater(supabase, { quotationId: 'QT-2', snapshotId: 'ISD-2', html: '<p>x</p>' },
      { logLabel: 'reissue quotation pdf for language failed' });
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged.map(([label, quotationId]) => [label, quotationId]), [
    ['issued quotation pdf capture failed', 'QT-1'],
    ['reissue quotation pdf for language failed', 'QT-2'],
  ]);
  assert.equal(logged[0][2]?.message, 'db down');
});
