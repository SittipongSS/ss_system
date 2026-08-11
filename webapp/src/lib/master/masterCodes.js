// ── รหัสข้อมูลหลัก: ลูกค้า (AR) และสินค้า (FG) ─────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-12 — โมดัลเพิ่มลูกค้า/เพิ่มสินค้ามีสวิตช์ "ระบบใหม่" (ตั้งต้นเปิด
// กดปิดได้ทุกครั้ง เพราะยังต้องบันทึกของเก่าย้อนหลังตลอดไป):
//
//   เปิด (auto)   AR-AAAA            4 หลัก เริ่ม 1001
//                 FG-AAAA-BB-CCC-DDDDD   AAAA = รหัสลูกค้า · BB-CCC = หมวดสินค้า
//                                        DDDDD = เลขรันเริ่ม 10001 (นับรวมทั้งระบบ)
//   ปิด (manual)  AR-AAA             3 หลัก · กรอกเอง
//                 FG-AAA-BB-CCC-DDDD     กรอกเอง ไม่กินเลขรัน
//
// ไฟล์นี้เป็น **ที่เดียว** ที่รู้รูปแบบรหัส — ฟอร์ม (ตัวประกอบรหัสให้เห็น) กับ API
// (ด่านตรวจก่อน insert) เรียกตัวตรวจตัวเดียวกัน ตามกฎ "เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้
// ห้ามมี" ในเอกสารวิธีคิดออกแบบฟอร์ม
//
// ไม่มี import ฝั่ง server — client component เรียกได้ตรง ๆ (ฟังก์ชันที่ต้องแตะ DB
// รับ `supabase` เข้ามาแทน แพตเทิร์นเดียวกับ lib/entityCode.js)
import { categoryOf } from '@/lib/master/categoryOf';

export const CODE_MODE_AUTO = 'auto';
export const CODE_MODE_MANUAL = 'manual';
export const DEFAULT_CODE_MODE = CODE_MODE_AUTO;
export const codeModeOf = (value) => (value === CODE_MODE_MANUAL ? CODE_MODE_MANUAL : CODE_MODE_AUTO);

// scope ของเคาน์เตอร์ (entity_number_counters, mig 0230) — AR/FG รันยาวตัวเดียว
// ตลอดกาล ไม่แยกรายเดือนเหมือนดีล/โครงการ จึงใช้คีย์เดือนคงที่
export const COUNTER_MONTH = '-';
export const AR_SCOPE = 'AR';
export const FG_SCOPE = 'FG';

// เลขแรกที่จะได้ (mig 0230 ตั้ง lastNo ไว้ที่ค่านี้ลบหนึ่ง)
export const AR_FIRST_NUMBER = 1001;
export const FG_FIRST_NUMBER = 10001;

// รูปแบบรหัส — auto/manual ต่างกันที่ **จำนวนหลัก** เท่านั้น จึงแยกกันได้จากตัวรหัสเอง
// โดยไม่ต้องเก็บธงว่าใบไหนออกด้วยโหมดไหน (ธงที่เก็บซ้ำกับสิ่งที่อ่านได้จากค่าจริง คือ
// ธงที่วันหนึ่งจะไม่ตรงกับค่าจริง)
export const AR_AUTO_RE = /^AR-\d{4}$/;
export const AR_MANUAL_RE = /^AR-\d{3}$/;
export const FG_AUTO_RE = /^FG-\d{4}-\d{2}-\d{3}-\d{5}$/;
export const FG_MANUAL_RE = /^FG-\d{3}-\d{2}-\d{3}-\d{4}$/;

export const AR_AUTO_HINT = 'AR-AAAA (4 หลัก)';
export const AR_MANUAL_HINT = 'AR-AAA (3 หลัก)';
export const FG_AUTO_HINT = 'FG-AAAA-BB-CCC-DDDDD';
export const FG_MANUAL_HINT = 'FG-AAA-BB-CCC-DDDD';

const digitsOf = (value) => String(value ?? '').trim();

// รหัสนี้ออกโดยระบบหรือเปล่า — ใช้ตัดสินว่า "โมดัลแก้ไข" จะล็อกช่องรหัสไหม
// (เลขที่ระบบจองไปแล้ว แก้ทิ้งไม่ได้ ไม่งั้นเลขนั้นหายจากระบบโดยไม่มีใครรู้)
export const isAutoArCode = (code) => AR_AUTO_RE.test(digitsOf(code));
export const isAutoFgCode = (code) => FG_AUTO_RE.test(digitsOf(code));

export const formatArCode = (number) => `AR-${String(number).padStart(4, '0')}`;

// ── AAAA ของรหัส FG = รหัสลูกค้าเติมศูนย์ให้ครบ 4 หลัก ────────────────────
// ⚠️ มติผู้ใช้ 2026-08-12: **ลูกค้าเก่ารหัส 3 หลักไม่ถูกเปลี่ยนรหัส** — AR-109 ยังเป็น
// AR-109 ทุกที่ (เอกสาร/ระบบสหมิตรอ้างค่านี้ตรง ๆ) และเติมศูนย์เฉพาะตอนประกอบรหัส FG
// ให้ได้ 0109 · ที่ต้องเป็นแบบนี้เพราะช่อง AAAA ของรูปแบบใหม่กว้าง 4 หลักตายตัว
// ⇒ ความยาวรหัส FG เท่ากันทุกใบ ไม่ว่าลูกค้าจะเป็นรายเก่าหรือใหม่
export function customerCodeSegment(arCode) {
  const m = digitsOf(arCode).match(/^AR-(\d{3,4})$/);
  if (!m) return null;
  return m[1].padStart(4, '0');
}

// ประกอบรหัส FG จากสามคำตอบ — คืน null ถ้ายังตอบไม่ครบ (ฟอร์มใช้ค่านี้โชว์ช่องว่าง
// ทีละท่อนตามที่กรอก ไม่ใช่รอครบแล้วค่อยโผล่ทั้งก้อน)
export function composeFgCode({ arCode, categoryCode, runNo } = {}) {
  const customer = customerCodeSegment(arCode);
  const category = digitsOf(categoryCode).match(/^(\d{2})-(\d{3})$/);
  const run = Number(runNo);
  if (!customer || !category || !Number.isFinite(run) || run <= 0) return null;
  return `FG-${customer}-${category[1]}-${category[2]}-${String(run).padStart(5, '0')}`;
}

// ท่อนของรหัส FG สำหรับ "แถบรหัส" ในฟอร์ม (CodeStrip) — ท่อนที่ยังตอบไม่ครบเป็น
// ช่องว่าง ไม่ใช่หายไป คนกรอกจะได้เห็นว่าเหลืออีกกี่ท่อน
export function fgCodeParts({ arCode, categoryCode, runNo } = {}) {
  const customer = customerCodeSegment(arCode);
  const category = digitsOf(categoryCode).match(/^(\d{2})-(\d{3})$/);
  const run = Number(runNo);
  return [
    { key: 'prefix', label: 'คงที่', value: 'FG', tone: 'fixed' },
    { key: 'customer', label: 'ลูกค้า', value: customer, tone: 'from', placeholder: 'AAAA' },
    { key: 'main', label: 'หมวดหลัก', value: category?.[1] ?? null, tone: 'from', placeholder: 'BB' },
    { key: 'sub', label: 'หมวดรอง', value: category?.[2] ?? null, tone: 'from', placeholder: 'CCC' },
    {
      key: 'run',
      label: 'เลขถัดไป',
      value: Number.isFinite(run) && run > 0 ? String(run).padStart(5, '0') : null,
      tone: 'new',
      placeholder: 'DDDDD',
    },
  ];
}

export function arCodeParts(number) {
  const run = Number(number);
  return [
    { key: 'prefix', label: 'คงที่', value: 'AR', tone: 'fixed' },
    {
      key: 'run',
      label: 'เลขถัดไป',
      value: Number.isFinite(run) && run > 0 ? String(run).padStart(4, '0') : null,
      tone: 'new',
      placeholder: 'AAAA',
    },
  ];
}

// ── ด่านตรวจ (ฟอร์มกับ API เรียกตัวเดียวกัน) ──────────────────────────────
// คืนข้อความไทยเมื่อผิด · null เมื่อผ่าน
//
// ⚠️ โหมด manual รับ **ทั้งสองรูปแบบ** ตั้งใจ: ปิดสวิตช์แล้วพิมพ์รหัส 4 หลักของใบที่
// ระบบเคยออกให้ (เช่นย้ายข้อมูลจากอีกที่/พิมพ์ซ้ำใบที่ลบไป) ต้องทำได้ ไม่งั้นจะมีรหัส
// ที่ระบบเองออกให้แต่กรอกกลับเข้าไปไม่ได้ · ที่ห้ามคือ "รูปแบบอื่น" ล้วน ๆ
export function arCodeError(code, { mode = CODE_MODE_MANUAL } = {}) {
  const value = digitsOf(code);
  if (!value) return 'กรุณากรอกรหัสลูกค้า (AR Code)';
  if (codeModeOf(mode) === CODE_MODE_AUTO) {
    return AR_AUTO_RE.test(value) ? null : `รหัสลูกค้าอัตโนมัติต้องเป็น ${AR_AUTO_HINT}`;
  }
  if (AR_MANUAL_RE.test(value) || AR_AUTO_RE.test(value)) return null;
  return `รูปแบบรหัสลูกค้าไม่ถูกต้อง — ต้องเป็น ${AR_MANUAL_HINT} เช่น AR-109`;
}

export function fgCodeError(code, { mode = CODE_MODE_MANUAL, categoryCode = null } = {}) {
  const value = digitsOf(code);
  if (!value) return 'กรุณากรอกรหัสสินค้า (FG Code)';
  const shapeOk = codeModeOf(mode) === CODE_MODE_AUTO
    ? FG_AUTO_RE.test(value)
    : FG_MANUAL_RE.test(value) || FG_AUTO_RE.test(value);
  if (!shapeOk) {
    return codeModeOf(mode) === CODE_MODE_AUTO
      ? `รหัสสินค้าอัตโนมัติต้องเป็น ${FG_AUTO_HINT}`
      : `รูปแบบรหัสสินค้าไม่ถูกต้อง — ต้องเป็น ${FG_MANUAL_HINT}`;
  }
  // หมวดที่เลือกไว้ต้องตรงกับ BB-CCC ในรหัส — สองค่านี้ถูกเก็บคนละคอลัมน์
  // (products.categoryCode กับ products.fgCode) ปล่อยให้ขัดกันเมื่อไร ภาษี/อย. จะคิด
  // จากหมวดหนึ่ง แต่คนอ่านรหัสเห็นอีกหมวดหนึ่ง
  const picked = digitsOf(categoryCode);
  if (picked && categoryOf(value) !== picked) {
    return `รหัสสินค้าไม่ตรงกับหมวดที่เลือก (${picked}) — ส่วน BB-CCC ในรหัสต้องเป็นหมวดเดียวกัน`;
  }
  return null;
}

// ── เคาน์เตอร์ (mig 0230 · RPC ของ mig 0096) ──────────────────────────────
// จองเลขจริง — atomic ต้องเรียกตอน insert เท่านั้น
export async function nextMasterNumber(supabase, scope) {
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: COUNTER_MONTH });
  if (error) throw new Error(`ออกเลขรัน ${scope} ไม่สำเร็จ: ${error.message}`);
  return Number(data);
}

// พรีวิว "เลขถัดไป" โดยไม่กินเลข — สำหรับโชว์ในฟอร์มเท่านั้น (ไม่ atomic)
// เลขที่โชว์อาจไม่ใช่เลขที่ได้จริงถ้ามีคนบันทึกก่อน ฟอร์มจึงต้องเขียนกำกับไว้
export async function peekMasterNumber(supabase, scope) {
  const first = scope === AR_SCOPE ? AR_FIRST_NUMBER : FG_FIRST_NUMBER;
  const { data, error } = await supabase
    .from('entity_number_counters')
    .select('lastNo')
    .eq('scope', scope)
    .eq('month', COUNTER_MONTH)
    .maybeSingle();
  if (error) throw new Error(`อ่านเลขรัน ${scope} ไม่สำเร็จ: ${error.message}`);
  // ยังไม่มีแถว = ยังไม่เคยออกเลข (หรือ mig 0230 ยังไม่ได้รัน) → เลขแรกของ scope นั้น
  const last = Number(data?.lastNo ?? 0);
  return last + 1 > first ? last + 1 : first;
}
