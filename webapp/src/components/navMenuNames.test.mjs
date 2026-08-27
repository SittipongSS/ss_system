// ── ชื่อเมนู "คิวงานของตัวเอง" ห้ามซ้ำข้ามระบบ ────────────────────────────
//
// 🐞 เคยเกิดจริง 2026-07-31: ระบบบริหารงานขายมี "งานของฉัน" (/sa/tasks = งานติดตาม
// ส่วนบุคคล) อยู่ก่อน แล้วระบบธุรกิจบริการเพิ่ม "งานของฉัน" อีกตัว (/service/my-visits
// = นัดเข้าไซต์) ชื่อเดียวกันเป๊ะทั้งที่คนละเรื่องกันคนละระบบ — คนที่ทำงานสองระบบ
// จำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
//
// เทสต์นี้อ่านนิยามเมนูจากซอร์สตรง ๆ เพราะ AppLayout เป็น client component ที่มี hook
// เต็มไปหมด import มารันในเทสต์ไม่ได้ · ตรวจแค่คู่ที่ชนกันมาแล้วจริง ไม่ใช่ห้ามซ้ำทั้งไฟล์
// (ชื่ออย่าง "ภาพรวม" ซ้ำได้ตามระบบ — บริบทชัดเพราะเป็นเมนูแรกของแต่ละระบบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AppLayout.js'), 'utf8');

// ดึงชื่อเมนูของ href ที่ระบุ จากบรรทัดนิยามเมนูในซอร์ส
function menuNameFor(href) {
  const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
  assert.ok(line, `ไม่พบเมนู ${href} ใน AppLayout — ถ้าย้าย/ลบเมนู ให้แก้เทสต์นี้ด้วย`);
  const match = /name: '([^']+)'/.exec(line);
  assert.ok(match, `เมนู ${href} ไม่มี name`);
  return match[1];
}

test('⭐ คิวงานของตัวเองสองระบบต้องใช้คนละชื่อ — ชื่อซ้ำข้ามระบบทำให้คนเปิดผิดหน้าประจำ', () => {
  const sales = menuNameFor('/sa/tasks');           // บริหารงานขาย — งานติดตามส่วนบุคคล
  const service = menuNameFor('/service/today');    // ธุรกิจบริการ — นัดเข้าไซต์ (F-1: เดิม /service/my-visits "นัดของฉัน")

  assert.notEqual(sales, service);
  assert.equal(sales, 'งานของฉัน');
  assert.equal(service, 'งานวันนี้');
});

test('⭐ X-1: สองระบบมีหน้าภาพรวมของตัวเอง คนละเส้นทาง — ไม่ใช่ปฏิทินรวม', () => {
  // มติผู้ใช้ 2026-08-01: เลิกทำหน้ารวมสองโมดูล เพราะเป็นคนละทีมปฏิบัติงาน
  // ถ้าวันไหนมีคนยุบสองเมนูนี้ให้ชี้ที่เดียวกัน เทสต์นี้จะดับ
  assert.equal(menuNameFor('/production'), 'ภาพรวม');
  assert.equal(menuNameFor('/service'), 'ภาพรวม');
  assert.ok(!SOURCE.includes("href: '/schedule'"), 'ห้ามมีปฏิทินรวมสองระบบ');
});

test('⭐ ทุกเมนูของธุรกิจบริการต้องแคบด้วยฝ่าย ไม่ใช่แค่ cap', () => {
  // cap `service:view` อยู่ที่ role `staff` ซึ่ง PC/PD/WH/QC/TS ใช้ร่วมกัน —
  // ตัวกั้นจริงคือ canViewService ที่แคบเหลือฝ่าย TS · เมนูที่เช็คแค่ cap จะโผล่
  // ให้ฝ่ายโรงงานเห็น ซึ่งขัดมติแยกทีม (ดู lib/pm/teamSeparation.test.mjs)
  const lines = SOURCE.split(/\r?\n/).filter((row) => /href: '\/service(\/|')/.test(row));
  assert.ok(lines.length >= 4, 'ควรเจอเมนูของระบบธุรกิจบริการอย่างน้อย 4 รายการ');
  for (const line of lines) {
    assert.match(line, /visible: canViewService|visible: canEditService/, line.trim());
  }
});

// ── ชื่อสั้นสำหรับแถบล่างมือถือ ────────────────────────────────────────
//
// แถบล่างเป็นแบบปัดหน้า หน้าละไม่เกิน 5 ช่อง · ช่องกว้าง 71px (5 ช่อง) หรือ 88.8px
// (4 ช่อง) วัดจริง 2026-08-02 ที่จอ 375px ด้วยฟอนต์ IBM Plex Sans Thai 10.5px
//
// 🪤 **นับจำนวนอักขระแทนความกว้างไม่ได้** — ป้ายที่ถูกตัดยาว 12–15 อักขระ ส่วนป้าย
// ที่ไม่ถูกตัดยาวได้ถึง 14 (ช่วงทับกัน) เพราะอักษรละตินกว้างกว่าไทยที่จำนวนตัวเท่ากัน
// เทสต์นี้จึงล็อก **รายชื่อ** ที่วัดมาแล้ว ไม่ใช่สูตรคำนวณ: ถ้ามีคนเปลี่ยนชื่อเมนู
// เพิ่มเมนู หรือย้ายเมนูข้ามระบบ (จำนวนช่องเปลี่ยน → ความกว้างช่องเปลี่ยน)
// เทสต์จะดับเพื่อบังคับให้กลับไปวัดแถบที่ 375px ใหม่ ไม่ใช่เดาเอา
const NEEDS_SHORT_NAME = {
  '/sahamit/po': 'PO',            // "Purchase Orders"  83.9px > ช่อง 75px
  '/mgmt/rocks': 'Rocks',         // "Rock & Improve"   80.6px > ช่อง 75px
  '/sahamit/material': 'ของเข้า', // "ของเข้า (สหมิตร)" 77.5px > ช่อง 75px
};

// ป้ายที่ "เกือบ" ล้นแต่รอดเพราะระบบของมันมีช่องกว้างกว่า — ถ้าวันไหนมีคนเพิ่มเมนู
// เข้าระบบนั้นจนช่องแคบลง ป้ายพวกนี้จะเป็นกลุ่มแรกที่ถูกตัด
// (F-1 2026-08-27: /service/schedule หลุดจากลิสต์ — เปลี่ยนชื่อ "ตารางเข้าบริการ" →
//  "จัดคิวช่าง" ซึ่งสั้นกว่าเดิมมาก ไม่เฉียดขอบช่องแล้ว)
const NEAR_LIMIT = ['/tax/filings', '/production/board'];

test('⭐ ป้ายที่ยาวเกินช่องแถบล่างต้องมี shortName — ตัดท้ายด้วย … แล้วอ่านไม่ออก', () => {
  for (const [href, expected] of Object.entries(NEEDS_SHORT_NAME)) {
    const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
    assert.ok(line, `ไม่พบเมนู ${href}`);
    const match = /shortName: '([^']+)'/.exec(line);
    assert.ok(match, `เมนู ${href} ต้องมี shortName (ป้ายเต็มยาวเกินช่อง 71px)`);
    assert.equal(match[1], expected);
  }
});

test('shortName ต้องสั้นกว่าชื่อเต็มจริง ๆ และห้ามซ้ำกับชื่อเมนูตัวอื่น', () => {
  const lines = SOURCE.split(/\r?\n/).filter((row) => row.includes('shortName:'));
  const allNames = [...SOURCE.matchAll(/\bname: '([^']+)'/g)].map((m) => m[1]);
  for (const line of lines) {
    const full = /\bname: '([^']+)'/.exec(line)[1];
    const short = /shortName: '([^']+)'/.exec(line)[1];
    assert.ok(short.length < full.length, `shortName "${short}" ไม่ได้สั้นกว่า "${full}"`);
    assert.ok(!allNames.includes(short),
      `shortName "${short}" ไปซ้ำกับชื่อเมนูอีกตัว — คนจะแยกไม่ออกว่าปุ่มไหนคืออะไร`);
  }
});

test('เมนูที่ป้ายเกือบเต็มช่องยังอยู่ครบ — ถ้าถูกย้าย/เปลี่ยนชื่อ ให้ไปวัดแถบล่างใหม่', () => {
  for (const href of NEAR_LIMIT) {
    assert.ok(SOURCE.includes(`href: '${href}'`),
      `${href} หายไปหรือถูกเปลี่ยนเส้นทาง — จำนวนช่องของระบบนั้นอาจเปลี่ยน ต้องวัดใหม่`);
  }
});

test('เมนูของแต่ละระบบอยู่ใต้เส้นทางของระบบตัวเอง — ไม่ยืมเส้นทางข้ามระบบ', () => {
  // /sa/tasks อยู่ในกลุ่ม salesplan · /service/* อยู่ในกลุ่ม service
  // ถ้าวันไหนมีคนย้าย "งานวันนี้" ไปไว้ใต้ /sa หรือ /pm ระบบธุรกิจบริการจะกลายเป็น
  // เมนูของฝ่ายขายอีกครั้ง ซึ่งเป็นเรื่องที่ตั้งใจแยกออกมาตั้งแต่ต้น (มติ 2026-07-30)
  assert.ok(SOURCE.includes("href: '/service/today'"));
  assert.ok(!SOURCE.includes("href: '/sa/today'"));
  assert.ok(!SOURCE.includes("href: '/pm/today'"));
});

// ── ทุกระบบต้องมีแถบเมนูของตัวเอง ────────────────────────────────────────
//
// 🐞 เกิดจริง: ระบบ "วิจัยและพัฒนา" มีการ์ดใน SYSTEM_CATALOG · มีหน้า `/rd` และ
// `/rd/requests` · ผ่าน OPEN_PAGES ครบ — **แต่ไม่มีกลุ่มเมนูใน AppLayout**
// ⇒ `menuItems = currentGroup?.items || []` ได้อาเรย์ว่าง ⇒ ฝ่าย RD สลับเข้าบ้าน
// ตัวเองแล้วไปไหนต่อไม่ได้เลย · build ผ่าน เทสต์เขียว หน้าเรนเดอร์ปกติทุกอย่าง
// ผิดแค่เปลือกที่ครอบมัน — ไม่มีอะไรจับได้จนกว่าจะมีคนเปิดดูของจริง
test('⭐ ทุกระบบใน SYSTEM_CATALOG ต้องมีกลุ่มเมนูของตัวเอง — ไม่มีกลุ่ม = แถบเมนูว่าง', async () => {
  const { SYSTEM_ORDER } = await import('../config/systems.js');
  for (const key of SYSTEM_ORDER) {
    assert.ok(SOURCE.includes(`system: '${key}'`),
      `ระบบ "${key}" ไม่มีกลุ่มเมนูใน AppLayout.allGroups — ผู้ใช้เข้าระบบนี้แล้วแถบเมนูจะว่าง`);
  }
});

test('⭐ คิวคำร้องสองระบบต้องใช้คนละชื่อ — คนละมุมของตารางเดียวกัน', () => {
  // บริหารงานขาย "คำร้อง" = ใบที่ฉันเปิดส่งไปให้ฝ่ายอื่น
  // วิจัยและพัฒนา "คิวคำร้อง" = ใบที่ส่งมาถึงฝ่ายฉัน
  // ชื่อเดียวกันเมื่อไร คนที่ทำงานสองระบบจะเปิดผิดหน้าประจำ (โรคเดียวกับ
  // "งานของฉัน" × "นัดของฉัน" ที่ชนกันมาแล้วจริงเมื่อ 2026-07-31)
  const sales = menuNameFor('/requests');
  const rd = menuNameFor('/rd/requests');
  assert.notEqual(sales, rd);
  assert.equal(sales, 'คำร้อง');
  assert.equal(rd, 'คิวคำร้อง');
});

test('เมนูของระบบวิจัยและพัฒนาแคบด้วยฝ่าย และเปิดให้ admin ได้ด้วย', () => {
  // ⚠️ admin ไม่ถือ `requests:answer` ⇒ ถ้า caps มีตัวเดียว เมนูจะถูกกรองทิ้งหมด
  // แล้วกลุ่มถูกตัดออกทั้งก้อน = แถบว่างสำหรับ admin ทั้งที่เห็นการ์ดระบบ
  const lines = SOURCE.split(/\r?\n/).filter((row) => /href: '\/rd(\/|')/.test(row));
  assert.ok(lines.length >= 2, 'ควรเจอเมนูของระบบวิจัยและพัฒนาอย่างน้อย 2 รายการ');
  for (const line of lines) {
    assert.match(line, /visible: canAccessRd/, line.trim());
    assert.match(line, /'users:manage'/, line.trim());
  }
});

/* 🐞 เจอจริง 2026-08-13 ตอนเพิ่มโมดูลบัญชี: เขียนเมนูโดยมีแต่ `visible` ไม่มี `caps`
   ⇒ ตัวกรองใน AppLayout อ่าน `item.caps || [item.cap]` ได้ `[undefined]` ⇒ ไม่ผ่าน
   สักข้อ ⇒ กลุ่มเหลือศูนย์รายการ ⇒ `.filter((g) => g.items.length > 0)` ตัดทิ้งทั้งกลุ่ม
   ผลคือเปลือกขึ้นชื่อระบบถูกต้องแต่ **แถบเมนูว่างเปล่า** — build และเทสต์อื่นจับไม่ได้
   เพราะทุกอย่างเรนเดอร์ปกติ · อาการเดียวกับที่คอมเมนต์ของกลุ่ม RD เตือนไว้ */
test('⭐ ทุกเมนูต้องมี cap กำกับ — ไม่งั้นกลุ่มถูกกรองทิ้งจนแถบเมนูว่าง', () => {
  const menuLines = SOURCE.split(/\r?\n/).filter((row) => /^\s*\{ href: '\//.test(row));
  assert.ok(menuLines.length > 20, 'อ่านนิยามเมนูจากซอร์สไม่เจอ — โครงไฟล์เปลี่ยนไปแล้ว');

  const missing = menuLines
    .filter((row) => !/\bcaps?:/.test(row))
    .map((row) => /href: '([^']+)'/.exec(row)?.[1]);

  assert.deepEqual(missing, [], `เมนูเหล่านี้ไม่มี cap/caps: ${missing.join(', ')}`);
});

test('เมนูโมดูลบัญชีครอบทั้ง role finance คนฝ่าย FN ที่ยังเป็น staff และ admin', () => {
  for (const href of ['/finance', '/finance/payments']) {
    const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
    assert.ok(line, `ไม่พบเมนู ${href}`);
    // payments:confirm = finance + FN staff · users:manage = admin (ซึ่งไม่ถือตัวแรก)
    assert.match(line, /payments:confirm/);
    assert.match(line, /users:manage/);
    // ตัวแคบจริงคือฝ่าย ไม่ใช่ cap — cap กว้างกว่าฝ่ายโดยตั้งใจ
    assert.match(line, /visible: canAccessFinance/);
  }
});

/* ── กฎสามชั้น §ข้อ 5 (docs/module-ownership-rules.md · มติผู้ใช้ 2026-08-13) ──
   เมนู = "งานที่ฝ่ายนี้ทำ" ไม่ใช่ "ทุกอย่างที่เขาอ่านได้" · ฝ่ายบัญชีเคยเห็นเมนูงานขาย
   ครบทั้งชุดเพราะถือ `salesplan:view` ซึ่งไม่เคยมีใครตัดสิน — มันติดมากับ cap
   ⚠️ ตัดที่ `visible` ไม่ใช่ที่ `cap` เพราะ cap คุม **สิทธิ์อ่าน** ซึ่งยังต้องเปิด
      (FN กดลิงก์จากใบไปดีล/โครงการยังต้องเข้าได้) */
test('⭐ เมนูงานขายที่เป็นงานของฝ่ายขายล้วน ๆ ต้องกันฝ่ายบัญชีออก', () => {
  for (const href of ['/sa/dashboard', '/sa/deals', '/sa/projects', '/sa/tasks']) {
    const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
    assert.ok(line, `ไม่พบเมนู ${href}`);
    assert.match(line, /visible: worksInSalesPipeline/, `${href} ต้องกัน FN ออกจากเมนู`);
  }
});

test('⭐ เอกสารที่ฝ่ายบัญชีต้องเปิดจริง ต้องยังอยู่ในเมนูเขา', () => {
  // ใบสั่งขาย = ที่ตั้งของขั้นบัญชี · ใบเสนอราคา = ที่อยู่ของแผนชำระ/ยอด/VAT ที่ต้องตรวจ
  for (const href of ['/sa/sales-orders', '/sa/quotations']) {
    const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
    assert.ok(line, `ไม่พบเมนู ${href}`);
    assert.doesNotMatch(line, /visible: worksInSalesPipeline/, `${href} ต้องไม่กัน FN ออก`);
  }
});

/* ── แถวระบบบนหัว: แถว "ไปที่<ระบบ>" ต้องไม่ซ้ำกับเมนูแรกของระบบนั้น ─────────
   🐞 ผู้ใช้ทัก 2026-08-26: ดรอปดาวน์ของ "บริหารงานขาย" มีแถว "ไปที่บริหารงานขาย"
   อยู่เหนือ "ภาพรวม" ทั้งที่พาไปที่เดียวกัน — เพราะ landing ของระบบเป็น `/sa`
   แต่เมนูภาพรวมมี href `/sa/dashboard` (match ครอบ `/sa` ไว้แล้ว) ⇒ เทียบ href
   ตรง ๆ จึงไม่เจอ · ต้องถามด้วย `match` ซึ่งเป็นตัวที่รู้ว่า path ไหนเป็นของเมนูใด */
test('แถว "ไปที่<ระบบ>" ตัดสินด้วย match ไม่ใช่เทียบ href', () => {
  assert.match(SOURCE, /const hasHomeItem = g\.items\.some\(\(item\) => item\.match\(g\.home\)\)/,
    'เทียบ href ตรง ๆ = ได้แถวซ้ำกับเมนูแรกของระบบที่ landing ไม่ตรง href เป๊ะ');
  /* เงื่อนไขนี้ห้ามหายไปเฉย ๆ — ระบบที่ landing ไม่อยู่ในเมนูตัวเองจะไม่มีทางเข้า
     เพราะปุ่มบนแถบระบบไม่พาไปไหน (กดแล้วกางเมนูอย่างเดียว) */
  assert.match(SOURCE, /\{!hasHomeItem && \(/, 'ยังต้องมีทางเข้าหน้าแรกของระบบที่เมนูไม่ครอบ');
  /* landing ของบริหารงานขายคือ `/sa` และเมนู "ภาพรวม" ต้องยัง match มันอยู่
     ถ้าวันหนึ่ง match ตัวนี้ถูกตัดให้แคบลง แถวซ้ำจะกลับมาเงียบ ๆ */
  const overview = SOURCE.split(/\r?\n/).find((row) => row.includes("href: '/sa/dashboard'"));
  assert.ok(overview && overview.includes("p === '/sa'"), 'เมนูภาพรวมของฝ่ายขายต้องยังครอบ /sa');
});
