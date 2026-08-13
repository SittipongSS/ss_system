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
// สองโหมดนี้ **แยกขาดจากกัน** — โหมดกรอกเองพิมพ์ได้เฉพาะรูปแบบเดิม ห้ามพิมพ์รูปแบบ
// ที่ระบบเป็นคนออก (เหตุผลอยู่ที่ arCodeError/fgCodeError ข้างล่าง)
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

// กองเลขที่ "ร่างซึ่งไม่เคยอนุมัติ" คืนมาตอนถูกลบ (mig 0248) — ตัวออกรหัสหยิบจากกองนี้
// ก่อนรันเลขใหม่เสมอ · เลขของแถวที่เคยอนุมัติแล้วไม่เคยเข้ากองนี้ (ดู isReusableCode)
export const RECLAIMED_TABLE = 'entity_number_reclaimed';

// ── ลบแล้วเลขได้คืนไหม ────────────────────────────────────────────────────
// ⭐ มติผู้ใช้ 2026-08-13: ร่างที่ลบทิ้ง เลขกลับมาใช้ได้ · ของที่อนุมัติแล้ว เลขตายถาวร
//
// ⚠️ **ตัดสินจาก `firstApprovedAt` ไม่ใช่ `approvalStatus`** — ของที่อนุมัติแล้วถูกแก้ไข
// จะถูกดีดกลับเป็น 'pending' และ `approvedAt` ถูกล้างทิ้ง (resetApprovalOnEdit) ⇒ ดูสถานะ
// ปัจจุบันเมื่อไร เลขของลูกค้าที่รหัสอยู่บนเอกสารจริงแล้วจะถูกปล่อยคืนให้รายอื่น
//
// ของจริงบังคับที่ trigger ฝั่ง DB (คืนเลขในทรานแซกชันเดียวกับ DELETE ไม่ว่าลบทางไหน)
// ตัวนี้มีไว้ให้ฝั่งแอปพูดเรื่องเดียวกันได้ — ข้อความยืนยันก่อนลบ/เทส ไม่ใช่ด่านตัดสิน
// ไม่มีแถวให้ดู = ตอบ "ไม่คืน" เสมอ (ยังโหลดไม่เสร็จ/อ่านไม่ได้ ต้องไม่กลายเป็นคำสัญญา
// ว่าเลขจะกลับมา — ฝั่งที่ผิดพลาดแล้วเสียหายคือฝั่งที่บอกว่าคืนได้ทั้งที่ไม่คืน)
//
// ⚠️ **เช็คว่ามีคีย์ ไม่ใช่แค่ค่าว่าง** — ช่วงที่โค้ดขึ้นแล้วแต่ mig 0248 ยังไม่ได้รันมือบน
// Supabase คอลัมน์นี้ยังไม่มี ⇒ แถวที่ส่งกลับมาไม่มีคีย์นี้เลย ซึ่งต่างจาก `null`
// (มีคอลัมน์ = ยังไม่เคยอนุมัติจริง) · ถ้าดูแค่ค่าว่าง ทุกแถวจะกลายเป็น "ร่าง" ทั้งระบบ
// แล้วหน้าจอจะสัญญาว่าเลขคืนทั้งที่ trigger ที่จะคืนเลขยังไม่มีอยู่
export function isReusableCode(record) {
  if (!record || !('firstApprovedAt' in record)) return false;
  return !record.firstApprovedAt;
}

// เลขแรกที่จะได้ (mig 0230 ตั้ง lastNo ไว้ที่ค่านี้ลบหนึ่ง)
export const AR_FIRST_NUMBER = 1001;
export const FG_FIRST_NUMBER = 10001;

// ท่อนหน้าเลขรัน + ความกว้างของเลข — ฟังก์ชัน SQL ที่ออกรหัส (mig 0237) รับสองค่านี้ไป
// แล้วเติมเฉพาะตัวเลขที่จองได้ ⇒ ไฟล์นี้ยังเป็นที่เดียวที่รู้รูปแบบรหัส
export const AR_PREFIX = 'AR-';
export const AR_WIDTH = 4;
export const FG_WIDTH = 5;

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

export const formatArCode = (number) => `${AR_PREFIX}${String(number).padStart(AR_WIDTH, '0')}`;

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

// ท่อนหน้าเลขรันของรหัส FG (`FG-AAAA-BB-CCC-`) — คืน null ถ้ายังตอบไม่ครบ
// ตัวออกรหัสฝั่ง SQL รับค่านี้ไปเติมเลขท้าย จึงต้องเป็นตัวเดียวกับที่ composeFgCode ใช้
export function fgCodePrefix({ arCode, categoryCode } = {}) {
  const customer = customerCodeSegment(arCode);
  const category = digitsOf(categoryCode).match(/^(\d{2})-(\d{3})$/);
  if (!customer || !category) return null;
  return `FG-${customer}-${category[1]}-${category[2]}-`;
}

// ประกอบรหัส FG จากสามคำตอบ — คืน null ถ้ายังตอบไม่ครบ (ฟอร์มใช้ค่านี้โชว์ช่องว่าง
// ทีละท่อนตามที่กรอก ไม่ใช่รอครบแล้วค่อยโผล่ทั้งก้อน)
export function composeFgCode({ arCode, categoryCode, runNo } = {}) {
  const prefix = fgCodePrefix({ arCode, categoryCode });
  const run = Number(runNo);
  if (!prefix || !Number.isFinite(run) || run <= 0) return null;
  return `${prefix}${String(run).padStart(FG_WIDTH, '0')}`;
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
// ⚠️ **โหมด manual รับเฉพาะรูปแบบเดิมเท่านั้น — ทั้งรูปแบบและจำนวนหลัก**
// (มติผู้ใช้ 2026-08-12 · กลับมติเดิมของวันเดียวกันที่ยอมให้พิมพ์รูปแบบใหม่กลับเข้าไปได้)
//
// ที่ต้องห้ามเพราะรหัสรูปแบบใหม่ = เลขที่เคาน์เตอร์กลางเป็นเจ้าของ ปล่อยให้พิมพ์เองได้
// เมื่อไร คนพิมพ์จะไป "จับจอง" เลขที่เคาน์เตอร์ยังรันไปไม่ถึง เช่นพิมพ์ AR-1005 ตอน
// เคาน์เตอร์อยู่ที่ 1001 · พอเคาน์เตอร์รันมาถึง 1005 คนที่เปิดสวิตช์อยู่จะโดน unique
// ตีกลับว่า "รหัสนี้มีในระบบแล้ว" ทั้งที่ไม่ได้ทำอะไรผิด และเลข 1005 ก็หายไปด้วย
// (เคาน์เตอร์ไม่ได้ซิงก์กับข้อมูลจริงหลัง mig 0230 รันไปแล้ว)
//
// ⇒ ต้องการรหัสรูปแบบใหม่ = เปิดสวิตช์ให้ระบบออกให้เท่านั้น
export function arCodeError(code, { mode = CODE_MODE_MANUAL } = {}) {
  const value = digitsOf(code);
  if (!value) return 'กรุณากรอกรหัสลูกค้า (AR Code)';
  if (codeModeOf(mode) === CODE_MODE_AUTO) {
    return AR_AUTO_RE.test(value) ? null : `รหัสลูกค้าอัตโนมัติต้องเป็น ${AR_AUTO_HINT}`;
  }
  if (AR_MANUAL_RE.test(value)) return null;
  if (AR_AUTO_RE.test(value)) {
    return `${value} เป็นรหัสรูปแบบที่ระบบออกให้ (${AR_AUTO_HINT}) — พิมพ์เองไม่ได้ ถ้าต้องการรหัสแบบนี้ให้เปิดสวิตช์ระบบใหม่`;
  }
  return `รูปแบบรหัสลูกค้าไม่ถูกต้อง — ต้องเป็น ${AR_MANUAL_HINT} เช่น AR-109`;
}

export function fgCodeError(code, { mode = CODE_MODE_MANUAL, categoryCode = null } = {}) {
  const value = digitsOf(code);
  if (!value) return 'กรุณากรอกรหัสสินค้า (FG Code)';
  if (codeModeOf(mode) === CODE_MODE_AUTO) {
    if (!FG_AUTO_RE.test(value)) return `รหัสสินค้าอัตโนมัติต้องเป็น ${FG_AUTO_HINT}`;
  } else if (!FG_MANUAL_RE.test(value)) {
    return FG_AUTO_RE.test(value)
      ? `${value} เป็นรหัสรูปแบบที่ระบบออกให้ (${FG_AUTO_HINT}) — พิมพ์เองไม่ได้ ถ้าต้องการรหัสแบบนี้ให้เปิดสวิตช์ระบบใหม่`
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

// ── สร้างแถวพร้อมออกรหัส (mig 0237) ───────────────────────────────────────
// ⚠️ **ห้ามกลับไปจองเลขเองแล้วค่อย insert แยก** — นั่นคือสองทรานแซกชัน เลขถูก commit
// ตั้งแต่คำสั่งแรก ⇒ insert ล้มเมื่อไรเลขนั้นหายจากระบบถาวร (เลขข้าม) · ฟังก์ชัน SQL
// ข้างล่างบวกเลขกับ insert ในคำสั่งเดียว ล้มตรงไหนก็ rollback คืนเลขให้เอง
//
// คืน { data, error } ดิบจาก supabase-js ตามเดิม — ผู้เรียกยังแปลง error.code '23505'
// เป็นข้อความซ้ำได้เหมือนตอนที่ยัง insert ตรง ๆ
export function insertCustomerWithCode(supabase, row) {
  return supabase.rpc('create_customer_with_code', {
    p_prefix: AR_PREFIX,
    p_width: AR_WIDTH,
    p_row: row,
  });
}

// prefix มาจาก fgCodePrefix() ของใบนั้น (ลูกค้า + หมวดที่ตรวจแล้ว) — ไม่ใช่สตริงจาก client
export function insertProductWithCode(supabase, prefix, row) {
  return supabase.rpc('create_product_with_code', {
    p_prefix: prefix,
    p_width: FG_WIDTH,
    p_row: row,
  });
}

// PostgREST ตอบ 42P01 (undefined_table) หรือ PGRST205 (ไม่มีในสคีมาแคช) เมื่อยังไม่มีตาราง
const isMissingTableError = (error) => error?.code === '42P01' || error?.code === 'PGRST205';

// พรีวิว "เลขถัดไป" โดยไม่กินเลข — สำหรับโชว์ในฟอร์มเท่านั้น (ไม่ atomic)
// เลขที่โชว์อาจไม่ใช่เลขที่ได้จริงถ้ามีคนบันทึกก่อน ฟอร์มจึงต้องเขียนกำกับไว้
//
// ⚠️ **ต้องดูกองเลขคืนก่อนเคาน์เตอร์ ให้ตรงลำดับเดียวกับฟังก์ชัน SQL** (mig 0248) —
// ร่างที่ยังไม่เคยอนุมัติถูกลบแล้วเลขกลับเข้ากอง `entity_number_reclaimed` และตัวออกรหัส
// หยิบจากกองนั้นก่อนเสมอ · ถ้าพรีวิวยังอ่านแต่เคาน์เตอร์ แถบรหัสจะโชว์เลขใหม่ (เช่น
// AR-1009) แต่เลขที่ได้จริงคือเลขที่คืนมา (AR-1005) — ผู้ใช้ไม่ได้พิมพ์เอง จึงไม่มีทางรู้
// ว่าโดนสลับ นอกจากไปเปิดดูทีหลัง
//
// ตัวนี้ไม่ได้เช็คว่าเลขในกอง "ว่างจริงไหม" ต่างจากฝั่ง SQL ที่เช็คแล้วข้ามใบที่ชน —
// ตั้งใจ: นี่คือพรีวิวที่คลาดได้อยู่แล้ว การเพิ่มด่านเช็คที่นี่คือกติกาชุดที่สองที่ต้องคอย
// ตามให้ตรงกับ SQL ตลอดไป
export async function peekMasterNumber(supabase, scope) {
  const first = scope === AR_SCOPE ? AR_FIRST_NUMBER : FG_FIRST_NUMBER;
  const { data: reclaimed, error: reclaimError } = await supabase
    .from(RECLAIMED_TABLE)
    .select('no')
    .eq('scope', scope)
    .order('no', { ascending: true })
    .limit(1)
    .maybeSingle();
  // ยังไม่มีตาราง = mig 0248 ยังไม่ได้รันมือบน Supabase (โค้ดขึ้นก่อน migration ได้เสมอ
  // ในโปรเจกต์นี้) ⇒ ตัวออกรหัสฝั่ง SQL ก็ยังเป็นตัวเดิมที่ไม่มีกองเลขคืน การอ่าน
  // เคาน์เตอร์อย่างเดียวจึงเป็นคำตอบที่ถูกต้องพอดี ไม่ใช่การกลบ error
  // (ถ้าโยนที่นี่ แถบรหัสในโมดัลเพิ่มลูกค้า/สินค้าจะโชว์ "—" เงียบ ๆ ทั้งระบบ)
  if (reclaimError && !isMissingTableError(reclaimError)) {
    throw new Error(`อ่านเลขคืน ${scope} ไม่สำเร็จ: ${reclaimError.message}`);
  }
  const returned = Number(reclaimed?.no ?? 0);
  if (returned > 0) return returned;

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
