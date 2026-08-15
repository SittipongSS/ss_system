/* ── กฎที่ทั้งระบบยึด แต่เดิมไม่มีอะไรบังคับ ────────────────────────────────
 *
 * ทุกข้อในไฟล์นี้เป็นกฎที่ทีมตัดสินไปแล้วและเขียนไว้ในคอมเมนต์/เอกสาร — แต่บังคับ
 * ด้วยความจำของคนล้วน · ตรวจระบบ 2026-08-16 พบว่ากฎแบบนี้หลุดไปแล้วอย่างน้อยสองข้อ
 * (ด่านสิทธิ์ของ route ที่สตรีมไฟล์ถูกก๊อปเป็นชุดที่สอง · โมดัลอนุมัติราคาผลิตไม่บอก
 * ผลลัพธ์) ⇒ ยกมาเป็นเทสต์ที่ตกทันทีเมื่อมีคนเผลอ
 *
 * ⚠️ เทสต์พวกนี้อ่าน **ข้อความในซอร์ส** ไม่ได้รันโค้ด — จงใจ เพราะสิ่งที่ต้องกันคือ
 * "ลืมเขียน" ไม่ใช่ "เขียนแล้วทำงานผิด" · ข้อเสียคือมันผูกกับรูปของโค้ด ⇒ ถ้า refactor
 * แล้วตก ให้แก้เทสต์ให้ตรงกับรูปใหม่ **หลังยืนยันว่ากฎยังอยู่จริง** ไม่ใช่ลบทิ้ง
 *
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  QUOTATION_APPROVAL_INVALIDATING_FIELDS, QUOTATION_NON_CONTENT_FIELDS,
} from './sales/quotationDocumentFields.js';

const SRC = join(process.cwd(), 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const listFiles = (dir, name) => execSync(`find ${join(SRC, dir)} -name "${name}"`)
  .toString().trim().split('\n').filter(Boolean)
  .map((f) => f.replace(`${SRC}/`, ''));

/* ⚠️ **ต้องตัดคอมเมนต์ก่อนมองหาชื่อฟังก์ชัน** — ไม่งั้นไฟล์ที่แค่ *พูดถึง* ด่านใน
   คอมเมนต์ก็ผ่านฟรี · เจอจริงตอนทดสอบเทสต์ข้อ 4: จอที่ถอด approvalPrompt ออกแล้ว
   ยังผ่าน เพราะคอมเมนต์ข้างบนเขียนคำว่า "กฎใน lib/approvalPrompt" ไว้ */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. ทุก API route ต้องมีด่านสิทธิ์ ───────────────────────────────────────
//
// 🐞 ระบบนี้ไม่มี RLS policy สักข้อ (migration เปิด RLS 71 ไฟล์ · `create policy` = 0)
// และทุกอย่างวิ่งผ่าน API ด้วย service-role key ⇒ **ไม่มีตาข่ายรองที่ชั้นฐานข้อมูล**
// route ไหนลืมตรวจสิทธิ์ = ข้อมูลหลุดเต็ม ๆ โดยไม่มีอะไรจับได้

/* route ที่ **ตั้งใจ** ไม่มีด่านของตัวเอง — ต้องเขียนเหตุผลกำกับทุกบรรทัด
   เพิ่มรายการที่นี่ = ประกาศต่อทีมว่า "เส้นนี้เปิดให้ทุกคนที่ล็อกอิน และนี่คือเหตุผล" */
const ROUTES_WITHOUT_OWN_GUARD = {
  'thai-address/route.js': 'ทะเบียนจังหวัด/อำเภอ/ตำบลของกรมการปกครอง — ข้อมูลสาธารณะ ไม่มีของใครอยู่ในนั้น',
  'users/me/route.js': 'คืนโปรไฟล์ของ session เอง อ่าน user จาก cookie ไม่รับ id จากผู้เรียก',
  'notifications/route.js': 'กล่องของตัวเอง — ทุก query ยึด user.id จาก session ไม่มีพารามิเตอร์ให้ระบุคนอื่น',
  'customers/by-tax-id/route.js': 'ด่านเตือนเลขผู้เสียภาษีซ้ำ — คืนเฉพาะ 7 คอลัมน์ที่บอกว่า "ซ้ำกับใคร"',
  'products/by-customer/route.js': 'ด่านเตือนสินค้าซ้ำ — คืนชื่อกับขนาด ไม่คืนราคา/ต้นทุน',
  'customers/next-code/route.js': 'พรีวิวเลขรันถัดไป ไม่จองเลข ไม่เปิดข้อมูลของใคร',
  'products/next-code/route.js': 'พรีวิวเลขรันถัดไป ไม่จองเลข ไม่เปิดข้อมูลของใคร',
  'master/customers/[id]/relations/route.js': 'ส่ง user เข้า customerRelations ซึ่งกรองรายโมดูลตามขอบเขตของผู้ดู',
  'master/products/[id]/relations/route.js': 'ส่ง user เข้า productRelations ด้วยเหตุผลเดียวกับฝั่งลูกค้า',
  'master/formulas/[id]/price/route.js': 'ด่านอยู่ใน makeRegistryPriceHandler (401 ถ้าไม่ล็อกอิน · canQuoteMaterial)',
  'master/scents/[id]/price/route.js': 'ด่านอยู่ใน makeRegistryPriceHandler ตัวเดียวกับฝั่งสูตร',
};

const GUARD_CALL = /\b(can[A-Z][A-Za-z]*|require[A-Z][A-Za-z]*|getSahamitContext|assert[A-Z][A-Za-z]*)\s*\(/;
const GUARD_IMPORT = /from ['"][^'"]*\/(permissions|authUser)['"]/;

/** ไฟล์ที่มีแต่ `export { … } from '…'` = ชื่อพ้องของ route อื่น ด่านอยู่ปลายทาง
 *
 * ⚠️ ยอมให้มี route segment config ปนได้ (`export const dynamic/runtime/revalidate`)
 * — Next ไม่รับ re-export ของค่าพวกนี้ ไฟล์ alias จึงต้องประกาศเองเสมอ */
const SEGMENT_CONFIG = /^export const (dynamic|runtime|revalidate|fetchCache|maxDuration|preferredRegion)\s*=/;
const isAliasOnly = (text) => {
  const code = text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
  const reExports = code.filter((l) => l.startsWith('export ') && l.includes(' from '));
  return reExports.length > 0
    && code.every((l) => reExports.includes(l) || SEGMENT_CONFIG.test(l));
};

test('กฎ 1: ทุก API route ต้องมีด่านสิทธิ์ — ไม่มี RLS เป็นตาข่ายรอง', () => {
  const bare = [];
  for (const rel of listFiles('app/api', 'route.js')) {
    const raw = read(rel);
    const text = stripComments(raw);
    const key = rel.replace('app/api/', '');
    if (GUARD_CALL.test(text) || GUARD_IMPORT.test(text)) continue;
    if (isAliasOnly(raw)) continue;
    if (/CRON_SECRET/.test(text)) continue; // ผู้เรียกเป็นเครื่อง ยืนยันด้วย Bearer
    if (ROUTES_WITHOUT_OWN_GUARD[key]) continue;
    bare.push(key);
  }
  assert.deepEqual(bare, [],
    `route ที่ไม่มีด่านสิทธิ์และไม่ได้ประกาศเหตุผลไว้: ${bare.join(', ')}\n`
    + 'เรียก can*/require* หรือเพิ่มลง ROUTES_WITHOUT_OWN_GUARD พร้อมเหตุผล');
});

test('กฎ 1ก: ลิสต์ยกเว้นต้องไม่มีของตายค้าง — ทุกรายการต้องชี้ไฟล์ที่มีอยู่จริง', () => {
  const all = new Set(listFiles('app/api', 'route.js').map((r) => r.replace('app/api/', '')));
  const stale = Object.keys(ROUTES_WITHOUT_OWN_GUARD).filter((k) => !all.has(k));
  assert.deepEqual(stale, [], `ลิสต์ยกเว้นอ้าง route ที่ไม่มีแล้ว: ${stale.join(', ')}`);
});

// ── 2. สวิตช์ล็อกดาวน์ต้องเปิดอยู่ ─────────────────────────────────────────
test('กฎ 2: ADMIN_LOCKDOWN ต้องเป็น true — ปิดเมื่อไรด่านหน้า/API ชั้นสองดับทั้งชุด', () => {
  // 🪤 เป็นค่าคงที่ในโค้ด ไม่ใช่ env ⇒ แก้เป็น false แล้ว deploy ได้เลยโดยไม่มีใครทัก
  // ถ้าจะปิดจริง ต้องมาแก้เทสต์ข้อนี้ด้วย = มีร่องรอยใน PR ให้คนเห็น
  assert.match(read('proxy.js'), /const ADMIN_LOCKDOWN = true;/);
});

// ── 3. ยอดงวดที่เซ็นไปแล้วห้ามปลดล็อก ──────────────────────────────────────
test('กฎ 3: ห้ามมีที่ไหนเขียน frozenAt เป็น null — ยอดงวดที่ freeze แล้วห้ามกลับไปเดินตามแผน', () => {
  /* 🪤 ทั้งสายพึ่งข้อเท็จจริงที่ว่า `frozenAt` ประทับแล้วไม่มีวันถูกล้าง:
     - `withLiveAmounts` เขียนยอดทับเฉพาะงวดที่ยัง **ไม่** freeze
     - `installmentActionError` ห้ามแจ้งชำระบนงวดที่ยังไม่ freeze
     - `freezeInstallments` ออกก่อนทันทีเมื่อทุกแถว freeze แล้ว
     ⇒ วันไหนมีคนเพิ่มปุ่ม "ปลดล็อกงวด" ยอดที่บัญชีรับรองไปแล้วจะขยับได้เงียบ ๆ */
  const offenders = listFiles('.', '*.js')
    .filter((rel) => !rel.includes('/node_modules/'))
    .filter((rel) => /frozenAt\s*:\s*null/.test(read(rel)));
  assert.deepEqual(offenders, [], `เขียน frozenAt: null ที่ ${offenders.join(', ')}`);
});

// ── 4. ทุกจุดอนุมัติต้องบอกผลลัพธ์ ─────────────────────────────────────────
//
// `approvalPrompt` บังคับได้แค่ "ถ้าเรียกฉัน ต้องส่ง effects" — บังคับให้คนเรียกไม่ได้
// ข้อนี้จึงตรวจฝั่งผู้เรียก: จอที่ยิงคำสั่งอนุมัติต้องผ่านตัวกลางนั้น

/* จอที่ยิงคำสั่งอนุมัติแต่ **ตั้งใจ** ไม่ผ่าน approvalPrompt — ต้องมีเหตุผล */
const APPROVAL_SCREENS_WITHOUT_PROMPT = {
  // ยังไม่มี — จอใหม่ที่อนุมัติได้ต้องเรียก approvalPrompt/ตัวช่วยของมัน
};

const APPROVE_ACTION = /["'`]\/approve["'`]|action:\s*["'](approve|finance_approve)["']|decision:\s*["']approve["']/;

test('กฎ 4: จอที่มีปุ่มอนุมัติต้องบอกผลลัพธ์ผ่าน approvalPrompt', () => {
  const screens = [...listFiles('app', 'page.js'), ...listFiles('components', '*.js')];
  const missing = screens.filter((rel) => {
    const text = stripComments(read(rel));
    if (!APPROVE_ACTION.test(text)) return false;
    if (/approvalPrompt|ApprovalEffects|ApprovalPrompt|useApprovalDecision/.test(text)) return false;
    return !APPROVAL_SCREENS_WITHOUT_PROMPT[rel];
  });
  assert.deepEqual(missing, [],
    `จออนุมัติที่ไม่ได้บอกผลลัพธ์: ${missing.join(', ')}\n`
    + 'เรียก approvalPrompt (หรือตัวช่วยของมัน) หรือประกาศเหตุผลใน APPROVAL_SCREENS_WITHOUT_PROMPT');
});

// ── 5. ช่องที่พิมพ์บนเอกสารต้องล้างการอนุมัติเมื่อถูกแก้ ────────────────────
test('กฎ 5: PATCH ใบเสนอราคาต้องอ้างทุกช่องใน QUOTATION_APPROVAL_INVALIDATING_FIELDS', () => {
  /* 🪤 ลายนิ้วมือ hash เฉพาะตัวเลข/บรรทัด ⇒ ที่อยู่บนใบกับภาษาเอกสารจับด้วย hash ไม่ได้
     ต้องพึ่งลิสต์ระบุชื่อช่องใน route · ลิสต์เขียนมือ = ช่องใหม่ตกหล่นได้เงียบ ๆ
     ⇒ ข้อนี้บังคับว่าทะเบียนกับ route ต้องตรงกัน */
  const src = stripComments(read('app/api/sales-planning/quotations/[id]/route.js'));
  /* เอาเฉพาะช่วงที่ตัดสิน "เนื้อหาเปลี่ยนไหม" — ทั้ง **คำสั่ง** ไม่ใช่บรรทัดเดียว
     (นิพจน์ contentChanged ยาวสามบรรทัด · ตัดแค่บรรทัดแรกจะพลาด notes/quoteDate/
     validUntil/docLanguage ซึ่งอยู่บรรทัดต่อมา — เจอตอนรันเทสต์ครั้งแรก) */
  const lines = src.split('\n');
  const statementFrom = (pattern) => {
    const start = lines.findIndex((l) => pattern.test(l));
    if (start < 0) return '';
    let out = '';
    for (let i = start; i < Math.min(start + 8, lines.length); i++) {
      out += `${lines[i]}\n`;
      if (/;\s*$/.test(lines[i].trim())) break;
    }
    return out;
  };
  const decisive = [/const contentChanged/, /const moneyChanged/, /const addressPicked/]
    .map(statementFrom).join('\n');

  const missing = QUOTATION_APPROVAL_INVALIDATING_FIELDS.filter((f) => !decisive.includes(`'${f}'`));
  assert.deepEqual(missing, [],
    `ช่องที่ทะเบียนบอกว่าต้องล้างการอนุมัติ แต่ route ไม่ได้ดู: ${missing.join(', ')}`);
});

test('กฎ 5ก: ช่องที่ยกเว้นต้องไม่ทับกับช่องที่ต้องล้างการอนุมัติ', () => {
  const overlap = Object.keys(QUOTATION_NON_CONTENT_FIELDS)
    .filter((f) => QUOTATION_APPROVAL_INVALIDATING_FIELDS.includes(f));
  assert.deepEqual(overlap, [], `ประกาศขัดกันเอง: ${overlap.join(', ')}`);
});

test('กฎ 5ข: การล้างการอนุมัติต้องกลับไป "ยังไม่ยื่น" ไม่ใช่ "รออนุมัติ"', () => {
  /* หลักฐานการยื่นรอบก่อนผูกกับ fingerprint ของเนื้อหาที่เปลี่ยนไปแล้ว จึงสิ้นผล —
     ถอยไป 'pending' เมื่อไร ใบจะรออนุมัติทั้งที่ไม่มีใครยื่นเนื้อหาชุดใหม่เลย */
  const src = stripComments(read('app/api/sales-planning/quotations/[id]/route.js'));
  assert.match(src, /patch\.approvalStatus = 'not_submitted';/);
  assert.match(src, /patch\.approvalFingerprint = null;/);
});
