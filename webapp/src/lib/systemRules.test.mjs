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
import { SCOPED_TABLES } from './scopedRow.js';

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
  'version/route.js': 'คืนเลขคอมมิตของรีโปสาธารณะให้ deploy workflow ตรวจว่าของขึ้นจริง — ไม่แตะฐานข้อมูล ไม่มีพารามิเตอร์',
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

// ── 6. "โหลดแถวแล้วลืมตรวจ" ต้องลดลงอย่างเดียว ─────────────────────────────
//
// 🐞 ตรวจระบบ 2026-08-16 (audit/11-row-guards.md): ทุก handler เขียนด่านรายแถวด้วยรูป
// ของตัวเอง — บางที่ตรวจแถวที่โหลด บางที่ตรวจ entity แม่ บางที่ตรวจ payload ⇒ **สแกน
// ด้วยเครื่องแยกถูก/ผิดไม่ได้** (ลองมาแล้วสองวิธี ให้ false positive ทั้งคู่)
//
// ⭐ `loadScoped()` ทำให้ "ถือแถวไว้โดยยังไม่ผ่านด่าน" เขียนไม่ออก · ข้อนี้เป็น **ratchet**
// (กติกาเดียวกับ audit:ui / check:rowcap): จุดที่ยังโหลดเองได้ **ลดได้อย่างเดียว**
// ห้ามเพิ่ม ⇒ ของใหม่ต้องใช้ loadScoped ส่วนของเก่าค่อยทยอยย้าย

/* เพดานจำนวนจุดที่ยัง `.from(<ตารางในทะเบียน>).select(...).eq('id', …)` เอง
   2026-08-16 — ตั้งเพดานครั้งแรกที่ 107
   2026-08-17 — **แคบตัวนับให้เหลือเฉพาะ `.select()`** แล้วรูดเพดานเป็น 65
   2026-08-17 (รอบสอง) — ย้ายอีก 8 จุด / 5 ไฟล์ ⇒ **57**
   2026-08-17 (รอบสาม) — ย้ายอีก 2 จุด + งานอื่นที่ merge ระหว่างทางเก็บไป 4 จุด ⇒ **49**

   ⚠️ **รูปที่ย้ายง่ายหมดแล้ว** — ที่เหลือส่วนใหญ่ย้ายแล้ว *ได้ของแย่ลง* หรือ
   **เปลี่ยนพฤติกรรม** ต้องอ่านทีละจุด ตัวอย่างที่เจอและเว้นไว้โดยตั้งใจ:
     · `pm/project-tasks/reorder` ใช้ `inScope(pmEditScope(role), …)` ส่วนทะเบียนใช้
       `inPmProjectScope` ซึ่ง **กว้างกว่า** (เจ้าของโครงการที่มี `pm:edit` ผ่านด้วย)
       ⇒ ย้ายแล้ว **ด่านหลวมลง** ไม่ใช่เท่าเดิม
     · `quotations/[id]` · `accept` · `approval` ต้องการ `lines:quotation_lines(*)`
       ที่ทะเบียนไม่ได้ join มา
     · `leads/[id]/transition` ตัดสินรายก้าวจาก `lead.team`/`assigneeId` — เพรดิเคตคนละตัว
   ⇒ พื้นของตัวเลขนี้ไม่ใช่ 0 และรอบถัดไปควรเป็น "อ่านแล้วตัดสิน" ไม่ใช่กวาดเป็นชุด

   🐞 **ทำไมต้องแคบ** — ตัวนับเดิมจับทุกคำสั่งที่มี `.eq('id')` ภายใน 220 ตัวอักษร
   ซึ่งรวม `.update()` 20 จุด และ `.delete()` 15 จุดเข้ามาด้วย · สองอย่างนั้นเป็นการ
   **เขียนหลังผ่านด่านแล้ว** — `loadScoped` แทนไม่ได้และไม่ควรแทน ⇒ 35 จาก 107 จุด
   เป็นพื้นที่ที่รูดลงไม่ได้เลย ตัวเลขจึงมีพื้นถาวรที่ไม่ได้แปลว่าอะไร
   ⇒ ตอนนี้นับเฉพาะ **การโหลด** ซึ่งเป็นสิ่งเดียวที่ `loadScoped` แทนได้จริง
   ⚠️ แคบตัวนับ = ต้องรูดเพดานลงเท่าจำนวนที่ตัดออกในคอมมิตเดียวกัน ไม่งั้นเพดานที่
   "ลดลง" จะเป็นแค่การเปลี่ยนหน่วยวัด ไม่ใช่การแก้อะไร (65 = 72 ที่นับได้ก่อนย้าย
   ลบ 7 จุดที่ย้ายจริงในรอบนี้)

   ตัวเลขนี้ยังรวมจุดที่ตรวจสิทธิ์ถูกต้องอยู่แล้ว — มันวัด "รูปแบบที่ตรวจสอบด้วยเครื่อง
   ไม่ได้" ไม่ใช่ "จุดที่ผิด" ⇒ รูดลงตอนที่ไปแตะไฟล์นั้นอยู่แล้ว ไม่ใช่รื้อทีเดียว
   ⚠️ **ไม่ใช่ทุกจุดที่ย้ายได้** — เส้นที่มีด่านเฉพาะตัว (เช่น `leads/[id]/transition`
   ที่ตัดสินจาก `lead.team`/`assigneeId` รายก้าว) ใช้ `loadScoped` แทนไม่ได้
   เพราะเพรดิเคตคนละตัว ⇒ พื้นของตัวเลขนี้ไม่ใช่ 0

   2026-08-20 — **49 → 53** (ระบบสัญญา · mig 0278) · ขึ้น 4 จุด ทั้งสี่เป็นการอ่าน
   **แถวข้างเคียง หลังแถวประธานผ่าน `loadScoped` ไปแล้ว** ไม่ใช่การถือแถวโดยไม่ผ่านด่าน:
     · `contracts/route.js` (projects) — อ่าน `line` ของโครงการเพื่อตัดสินชนิดสัญญา
       ⇒ `loadScoped('projects')` ใช้เพรดิเคต **PM** (`inPmProjectScope`) ซึ่งเป็นคนละ
       ด่านกับสายขาย: AE ที่เปิดดีลได้จะอ่านสายธุรกิจของโครงการตัวเองไม่ได้
     · `contracts/[id]/route.js` (quotations) — ดึงเลขที่/สถานะใบเสนอราคาที่สัญญาอ้าง
     · `contracts/[id]/issue/route.js` (quotations) — ยืนยันว่าใบยังอนุมัติอยู่ ณ วินาทีที่ออก
     · `contracts/options/route.js` (projects) — เหตุผลเดียวกับข้อแรก (จอถามว่าดีลนี้
       ออกสัญญาอะไรได้ ⇒ ต้องอ่านสายธุรกิจของโครงการ)
   ⇒ สองจุดหลังเป็นการ "ตรวจของที่ผูกอยู่" ของแถวที่ผ่านด่านแล้ว ไม่ใช่ประตูเข้าใบ

   2026-08-21 — **53 → 56** (บันทึกเพิ่มเติมสัญญา · mig 0282) · ทั้งสามจุดอ่าน
   **สัญญาแม่** ของบันทึกที่ผ่าน `loadScoped` มาแล้ว (`addenda/[id]` · `issue` · `document`)
   ⇒ ไม่ใช่ประตูเข้าใบ แต่เป็นการอ่านเอกสารต้นทางที่บันทึกแนบท้ายอยู่ ซึ่ง `loadScoped`
   ทำแทนไม่ได้: มันจะตรวจด่านของ *สัญญา* ซ้ำอีกชั้นทั้งที่บันทึกถือ team/ownerId ของตัวเอง

   2026-08-24 — **56 → 57** (แก้ยอดที่ขอวางบิลบนคำร้อง) · `sa/requests/[id]/route.js`
   (quotations) อ่าน `totalAmount` ของใบที่คำร้อง **อ้างอยู่แล้ว** เพื่อคิดยอดใหม่ —
   รูปเดียวกับที่ `POST /api/sa/requests` ทำตอนเปิดใบ (ซึ่งถูกนับอยู่แล้ว)
   ⚠️ `loadScoped('quotations', …)` แทนไม่ได้ **และจะพัง**: มันใช้ด่าน *สายขาย*
   (`inSalesViewScope`) ⇒ คนที่จัดการคำร้องได้แต่ไม่ได้อยู่ในขอบเขตดีลนั้น (แอดมิน ·
   เพื่อนร่วมทีมของผู้เปิด) จะแก้ยอดไม่ได้ทั้งที่ด่านของ *คำร้อง* ให้ผ่านแล้ว
   ⇒ เป็นการ "อ่านของที่ผูกอยู่ของแถวที่ผ่านด่านแล้ว" ตามข้อยกเว้นข้างบน

   2026-09-02 — **57 → 58** (รอบบริการผูกใบสั่งขาย) · `service/plans/route.js`
   (sales_orders) ตรวจแค่ว่า **id ที่อ้างถึงมีอยู่จริงไหม** ก่อนเขียนลง
   `service_plans."salesOrderId"` ซึ่งเป็นคอลัมน์ที่ไม่มี FK (mig 0188) และ
   `normalizePlanInput` ปล่อยผ่านทุกค่า ⇒ id มั่วเข้าฐานได้เงียบ ๆ แล้วคอลัมน์
   "รอบที่เดิน n/N" บนทะเบียนใบสั่งขายจะนับให้ใบที่ไม่มีอยู่จริง
   ⚠️ `loadScoped('sales_orders', …)` แทนไม่ได้ **และจะพัง**: มันใช้ด่าน *สายขาย*
   (`inSalesViewScope`) ส่วนคนที่วางรอบคือฝ่าย TS ซึ่งผ่านด่านของ *โมดูลบริการ* มาแล้ว
   ⇒ เป็นการตรวจปลายทางของค่าที่กำลังจะเขียน ไม่ใช่ประตูเข้าใบสั่งขาย

   2026-09-02 — **58 → 59** (ย้ายรอบไปใบอื่นได้) · `service/plans/[id]/route.js`
   (sales_orders) เป็นด่าน **ตัวเดียวกับ POST ข้างบนทุกประการ** ย้ายมาอยู่ฝั่ง PATCH
   เพราะเพิ่งเปิดให้ผูก/ย้ายใบของรอบที่มีอยู่แล้ว (ก่อนหน้านี้ไม่มีจอไหนส่งค่านี้มา
   ทาง PATCH เลย จึงไม่มีด่าน) ⇒ ไม่ใช่จุดใหม่ในเชิงเหตุผล เป็นรูที่เพิ่งเปิดของด่านเดิม
   ⚠️ ยิงเฉพาะตอนค่า **เปลี่ยน** (`movedOrder`) — PATCH ผสม `{...before, ...body}`
   ⇒ ถามทุกครั้งคือคิวรีที่ไม่ได้ตอบอะไรใหม่ในการแก้ความถี่/เจ้าหน้าที่ตามปกติ */
const SELF_LOAD_CAP = 59;

test('กฎ 6: การโหลดแถวเองบนตารางที่มีทะเบียนขอบเขต ต้องไม่เพิ่ม (ratchet)', () => {
  const tables = Object.keys(SCOPED_TABLES);
  const hits = [];
  for (const rel of listFiles('app/api', 'route.js')) {
    const text = stripComments(read(rel));
    for (const t of tables) {
      // นับเฉพาะ "โหลดแถวเดียวด้วย id" — ลิสต์/ตัวกรองไม่เกี่ยว · และเฉพาะ `.select()`
      // ไม่นับ `.update()`/`.delete()` ซึ่งเป็นการเขียนหลังผ่านด่านแล้ว
      const re = new RegExp(`from\\(\\s*['"]${t}['"]\\s*\\)[\\s\\S]{0,220}?\\.eq\\(\\s*['"]id['"]`, 'g');
      for (const m of text.match(re) || []) {
        if (!/\.select\(/.test(m.slice(m.indexOf(')') + 1))) continue;
        hits.push(`${rel}  (${t})`);
      }
    }
  }
  assert.ok(hits.length <= SELF_LOAD_CAP,
    `โหลดแถวเองเพิ่มขึ้นเป็น ${hits.length} จุด (เพดาน ${SELF_LOAD_CAP})\n`
    + 'ของใหม่ให้ใช้ loadScoped(supabase, table, id, user, mode) จาก @/lib/scopedRow\n'
    + hits.slice(0, 12).join('\n'));
  if (hits.length < SELF_LOAD_CAP) {
    console.log(`  ⭐ กฎ 6: เหลือ ${hits.length}/${SELF_LOAD_CAP} — รูดเพดานลงใน systemRules.test.mjs`);
  }
});

// ── 7. สร้างสูตรจากกลิ่น = ต้องส่งลูกค้าไปด้วย ─────────────────────────────
//
// 🐞 **บั๊กจริง 2026-08-19** — มติ 2026-08-10 กลับทิศจาก mig 0207: server เลิก *derive*
// ลูกค้าจากกลิ่น เปลี่ยนเป็น *ตรวจ* ว่าลูกค้าที่ส่งมาตรงกับเจ้าของกลิ่น
// (`formulaScentCustomerError`) · ฟอร์มทะเบียนปรับตามแล้ว แต่ **เส้นคำร้องถูกลืม** ⇒
// RD กด "ส่งงาน" ทีไรก็โดน "สูตรฐาน (ไม่ผูกลูกค้า) เลือกกลิ่นของลูกค้าไม่ได้" ทุกครั้ง
// และไม่มีอะไรจับได้เลยจนผู้ใช้ถ่ายจอมาให้ดู
//
// ⚠️ กฎคือ **มีกลิ่น = ต้องมีลูกค้า** — สูตรฐาน (ไม่ผูกลูกค้า) ผูกกลิ่นของใครไม่ได้
// ตามนิยาม · จุดที่ไม่มีกลิ่น (จัดระเบียบ) ส่งลูกค้าผ่าน `fallbackCustomer` แทน
test('กฎ 7: createFormula ที่ส่ง scentId ต้องส่ง customerId ด้วยเสมอ', () => {
  const bad = [];
  for (const rel of listFiles('app/api', 'route.js')) {
    const text = stripComments(read(rel));
    if (!text.includes('createFormula(')) continue;
    for (const m of text.match(/createFormula\([\s\S]{0,1200}?\}\s*,\s*user/g) || []) {
      if (/scentId\s*:/.test(m) && !/customerId\s*:/.test(m)) bad.push(rel);
    }
  }
  assert.deepEqual(bad, [],
    'สร้างสูตรจากกลิ่นโดยไม่ส่งลูกค้า — ด่าน formulaScentCustomerError จะตีกลับทุกครั้ง\n'
    + bad.join('\n'));
});
