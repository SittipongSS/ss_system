// ── ทะเบียนขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10) — ไม่แตะ DB ─────────────────────
//
// ⭐ **พื้นที่หนึ่งมีขนาดเดียว + จำนวน** — ขนาดมาจากทะเบียนที่แอดมิน/หัวหน้าฝ่ายบริการ **เพิ่ม · แก้ · ลบ** ได้
//   (ไม่ใช่สี่ขนาดตายตัว) · ระบบ **เสนอ** ขนาดจากช่วง ลบ.ม. ของพื้นที่ และเสนอจำนวน 1 · หัวหน้าเปลี่ยนได้ทั้งคู่
//   🔄 แทนสูตรเดิม ceil(ลบ.ม. ÷ 2,400) ที่ถอดจาก `survey.js` แล้ว
//
// ⭐ **พื้นที่เก็บภาพนิ่ง ไม่ใช่ FK** — `packageSize` (รหัส) · `packageSizeSuggested` (ที่ระบบเสนอตอนเคาะ) ·
//   `packageSizeManual` (ขนาดนั้นเป็นแบบหัวหน้าเลือกเองไหม ตอนเคาะ) ⇒ ลบ/แก้ขนาดในทะเบียนไม่ทำให้ใบที่เคาะหรือ
//   ส่งผลไปแล้วเปลี่ยนความหมาย · **ข้อเดียว** ที่ต้องเทียบทะเบียนสด: ใบที่ยังไม่ส่งผลซึ่งถือขนาดที่ถูกลบไปแล้ว
//   ต้องเลือกใหม่ก่อนส่ง (`surveyPackageSizeGates`)
//
// ⭐ **ลำดับไม่มีช่องให้กรอก** — เรียงจากข้อมูล: หัวหน้าเลือกเอง (ตามรหัส) → ช่วงน้อยไปมาก → ไม่มีเพดานท้ายสุด
//   ⇒ ขนาดใหม่ลงถูกที่ในแถบเลือกเองโดยไม่ต้องมีใครจัดลำดับ
//
// ⚠️ ไฟล์นี้ import `survey.js` — **ห้ามย้อนทาง** (`survey.js` ต้องไม่รู้จักทะเบียน · ดูหัวไฟล์นั้น)
// ⚠️ ใช้ได้ทั้งจอและ API (กติกาเดียวกับ `assetModels.js`) — ด่านที่ปุ่มรู้แต่ server ไม่รู้ = ปุ่มที่จางเงียบ
import { fmtNumber } from '@/lib/format';
import { packageNeedsNote, surveyPackageMixText, surveyZoneName, surveyZoneSize } from './survey.js';

export const PACKAGE_SIZE_CODE_PATTERN = /^[A-Z0-9]{2,4}$/;
export const PACKAGE_SIZE_NAME_MAX = 60;
export const PACKAGE_SIZE_NOTE_MAX = 500;
/* เพดานกันพิมพ์ผิดหลัก — 1,000,000 ลบ.ม. คือโกดังขนาดสนามบิน ไม่ใช่โซนกระจายกลิ่น */
export const PACKAGE_SIZE_MAX_CBM = 1000000;
export const PACKAGE_QTY_MAX = 99;

export const PACKAGE_SIZE_EDIT_DENIED = 'แก้ทะเบียนขนาดแพ็คเกจได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ';
/* 🔑 ข้อความเดียวของ "อ่านทะเบียนไม่สำเร็จ" — ด่านส่งผล · route เคาะ · จอ ใช้ตัวนี้ (fail-closed ทุกจุด) */
export const PACKAGE_SIZE_REGISTRY_DOWN = 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ — ลองใหม่';
/* ข้อความเดียวกันบน **จอ** ที่ทะเบียนมากับ GET (แท็บสรุปส่งผล · การ์ดจัดการผล) — ไม่มี "ลองใหม่": ตรงนั้นไม่มีอะไรให้กดซ้ำ
   ทางออกคือปุ่ม "โหลดใหม่" ที่จอวางไว้ข้างข้อความ (🐞 UAT 01/10: "ลองใหม่" ขึ้นสามที่โดยไม่มีปุ่มให้ลอง)
   ⚠️ ตัวข้างบน (`…_DOWN`) ยังเป็นคำตอบของ server ตอน **บันทึก/ส่ง** — ที่นั่น "ลองใหม่" = กดปุ่มเดิมอีกครั้ง ซึ่งมีอยู่จริง */
export const PACKAGE_SIZE_REGISTRY_UNREAD = 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ';
export const PACKAGE_SIZE_NOT_FOUND = 'ไม่พบขนาดนี้ในทะเบียน';
export const PACKAGE_NOTE_REQUIRED = 'แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผลด้วย';
/* แท็บที่เปิดค้างมาก่อน deploy (bundle เก่า) ส่งแค่ `{ packageQty, packageNote }` — จอนั้นไม่มีแถบขนาด และช่องเหตุผลโผล่ตามสูตร
   ÷2,400 เดิม ⇒ ข้อความด่านสั่งให้ทำสิ่งที่จอนั้นทำไม่ได้ · ต่อท้ายทางออกเดียวที่มีจริง (จอรุ่นนี้ส่งคีย์ `packageSize` เสมอ) */
export const PACKAGE_STALE_SCREEN_HINT = ' (หน้านี้เป็นรุ่นเก่า — โหลดหน้าใหม่แล้วเคาะอีกครั้ง)';

/** คีย์ของแถวด่าน "ขนาดถูกลบจากทะเบียน" — การ์ดควบคุมใช้แยกแถวนี้ออกจากด่านหกข้อ */
export const PACKAGE_SIZE_GONE_GATE = 'packageSizeGone';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value.filter((s) => s && typeof s === 'object') : []);
const isCut = (row) => (row?.status || 'ok') === 'cut';

/** รหัสขนาด — ตัดช่องว่าง + ตัวใหญ่ · ว่าง = `''` (ผู้เรียกตัดสินเองว่าว่างแปลว่าอะไร) */
export const normalizePackageSizeCode = (value) => text(value).toUpperCase();

/* ช่วง ลบ.ม. จากช่องกรอก: ว่าง → null (ไม่มีเพดาน) · "2,400" → 2400 · อ่านไม่ออก → NaN (ด่านตีกลับ)
   ⚠️ จุลภาครับเฉพาะรูปคั่นหลักพัน — "1,5" กำกวม (1.5 หรือ 15?) ⇒ NaN ให้คนพิมพ์ใหม่ ไม่เดาแทน */
function parseCbm(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return Number(raw.replace(/,/g, ''));
  return NaN;
}

const cbmOf = (size) => {
  const n = Number(size?.maxCbm);
  return size?.maxCbm === null || size?.maxCbm === undefined || !Number.isFinite(n) ? null : n;
};
const isSuggested = (size) => size?.autoSuggest !== false;
const cbmText = (n) => fmtNumber(n, { maximumFractionDigits: 2 });

/**
 * ล้างค่าจากฟอร์ม/คำขอให้เป็นแถวที่เก็บลงฐานได้ — คืน `{ value }` (ตรวจถูกผิดที่ `packageSizeError`)
 *
 * ⭐ **ขนาดที่หัวหน้าเลือกเองไม่มีช่วง** — ฟอร์มซ่อนช่องช่วงเมื่อสลับเป็น "หัวหน้าเลือกเอง" และ PATCH รวมแถวเดิม
 *   ก่อนตรวจ ⇒ ช่วงเดิมค้างมากับคำขอได้โดยที่คนไม่เห็น · ช่องที่มองไม่เห็นต้องไม่ตีกลับ ⇒ ทิ้งที่นี่
 *   (CHECK `service_package_sizes_manual_no_band` เป็นตาข่ายชั้นฐาน)
 */
export function normalizePackageSizeInput(input) {
  const body = input && typeof input === 'object' ? input : {};
  const autoSuggest = !(body.autoSuggest === false || body.autoSuggest === 'false');
  return {
    value: {
      code: normalizePackageSizeCode(body.code),
      nameEn: text(body.nameEn).replace(/\s+/g, ' '),
      maxCbm: autoSuggest ? parseCbm(body.maxCbm) : null,
      autoSuggest,
      note: text(body.note) || null,
    },
  };
}

/**
 * 🔑 **ด่านเดียวของการแก้ทะเบียนขนาดแพ็คเกจ** — คืนข้อความไทยเมื่อทำไม่ได้ หรือ `null` เมื่อผ่าน
 *   (ฟอร์มกับ route ถามตัวเดียวกัน · กติกาเดียวกับ `assetModelError`)
 *
 * @param mode        `'create' | 'update' | 'delete'`
 * @param ctx.canEdit ผู้ใช้แก้ทะเบียนได้ไหม (`canManagePackageSizes` — ผู้เรียกคำนวณมาให้)
 * @param ctx.before  แถวเดิม (โหมดแก้/ลบ)
 * @param ctx.sizes   ทะเบียนทั้งชุด ณ ตอนนี้ — ใช้ตรวจซ้ำ/ช่วงชน/เหลือขนาดสุดท้าย
 *
 * ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ · ไม่มีทะเบียนให้เทียบ = ปฏิเสธ (ไม่ใช่ปล่อยให้ซ้ำแล้วไปตายที่ unique index)
 */
export function packageSizeError(mode, input = {}, ctx = {}) {
  const { canEdit = false, before = null, sizes = null } = ctx || {};
  if (!canEdit) return PACKAGE_SIZE_EDIT_DENIED;
  if (!Array.isArray(sizes)) return PACKAGE_SIZE_REGISTRY_DOWN;
  const all = list(sizes);

  if (mode === 'delete') {
    if (!before) return PACKAGE_SIZE_NOT_FOUND;
    /* ⭐ **ลบได้แม้มีใบใช้อยู่** (มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") — พื้นที่เก็บรหัสเป็นภาพนิ่ง ใบที่ส่งผลแล้วไม่เปลี่ยน
       ใบที่ยังไม่ส่งถูกด่าน "ขนาดถูกลบ" บังคับให้เลือกใหม่ · กล่องยืนยันบอกจำนวนใบที่กระทบ (`packageSizeUsageText`)
       ⚠️ ห้ามลบจนทะเบียนว่าง — ไม่มีขนาดให้เลือก = ทุกใบส่งผลไม่ได้ และไม่มีจอไหนบอกว่าเพราะอะไร */
    if (all.filter((s) => s.code !== before.code).length === 0) {
      return 'ต้องเหลืออย่างน้อยหนึ่งขนาดในทะเบียน — เพิ่มขนาดใหม่ก่อนแล้วค่อยลบขนาดนี้';
    }
    return null;
  }

  const { value } = normalizePackageSizeInput(input);
  if (!PACKAGE_SIZE_CODE_PATTERN.test(value.code)) {
    return 'รหัสขนาดต้องเป็นตัวอักษรอังกฤษตัวใหญ่หรือตัวเลข 2–4 ตัว (เช่น SM · ST · XL)';
  }
  if (mode === 'update') {
    if (!before) return PACKAGE_SIZE_NOT_FOUND;
    /* 🔴 **รหัสแก้ไม่ได้** — พื้นที่ที่เคาะไปแล้วเก็บรหัสนี้เป็นภาพนิ่ง (ไม่มี FK ให้ตามไปแก้) ⇒ เปลี่ยนรหัส =
       ใบที่ยังไม่ส่งทุกใบกลายเป็น "ขนาดถูกลบ" เงียบ ๆ · อยากได้รหัสใหม่ = เพิ่มขนาดใหม่แล้วลบตัวเก่า (กล่องลบบอกผล) */
    if (value.code !== normalizePackageSizeCode(before.code)) {
      return `รหัส ${normalizePackageSizeCode(before.code)} แก้ไม่ได้ — พื้นที่ที่เคาะไปแล้วเก็บรหัสนี้ไว้ · ต้องการรหัสใหม่ให้เพิ่มขนาดใหม่แล้วลบขนาดนี้`;
    }
  } else if (all.some((s) => normalizePackageSizeCode(s.code) === value.code)) {
    return `รหัส ${value.code} มีอยู่แล้วในทะเบียน`;
  }

  if (!value.nameEn) return 'ต้องระบุชื่อเต็มของขนาด';
  if (value.nameEn.length > PACKAGE_SIZE_NAME_MAX) return `ชื่อเต็มยาวเกิน ${PACKAGE_SIZE_NAME_MAX} ตัวอักษร`;
  if ((value.note || '').length > PACKAGE_SIZE_NOTE_MAX) return `หมายเหตุยาวเกิน ${PACKAGE_SIZE_NOTE_MAX} ตัวอักษร`;

  if (value.autoSuggest) {
    if (value.maxCbm !== null) {
      if (!Number.isFinite(value.maxCbm) || !(value.maxCbm > 0)) {
        return 'ขนาดพื้นที่สูงสุด (ลบ.ม.) ต้องเป็นตัวเลขมากกว่า 0 — เกินหลักพันพิมพ์ 2400 หรือ 2,400';
      }
      if (value.maxCbm > PACKAGE_SIZE_MAX_CBM) return 'ขนาดพื้นที่สูงสุดดูเหมือนพิมพ์ผิดหลัก';
    }
    /* 🔴 **ระบบต้องเสนอได้คำตอบเดียว** — สองขนาดช่วงเดียวกัน หรือสองขนาดไม่มีเพดาน = ระบบเลือกไม่ได้ว่าจะเสนอตัวไหน
       (unique index สองตัวของ 0398 เป็นตาข่ายชั้นฐาน · ที่นี่คือข้อความที่คนอ่านรู้เรื่อง) */
    const others = all.filter((s) => normalizePackageSizeCode(s.code) !== value.code && isSuggested(s));
    const clash = others.find((s) => cbmOf(s) === value.maxCbm);
    if (clash) {
      return value.maxCbm === null
        ? `มีขนาดไม่มีเพดานอยู่แล้ว: ${clash.code}`
        : `ช่วงไม่เกิน ${cbmText(value.maxCbm)} ลบ.ม. มีอยู่แล้ว: ${clash.code}`;
    }
  }
  return null;
}

/** เรียงตามที่แถบเลือกและตารางทะเบียนแสดง — หัวหน้าเลือกเอง (ตามรหัส) → ช่วงน้อยไปมาก → ไม่มีเพดานท้ายสุด */
export function sortPackageSizes(sizes) {
  const group = (s) => (!isSuggested(s) ? 0 : cbmOf(s) === null ? 2 : 1);
  return list(sizes).slice().sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 1 && cbmOf(a) !== cbmOf(b)) return cbmOf(a) - cbmOf(b);
    return String(a.code).localeCompare(String(b.code), 'en');
  });
}

/* ช่วงที่มีในทะเบียน (เฉพาะขนาดที่ระบบเสนอ) เรียงน้อยไปมาก */
const bandsOf = (sizes) => list(sizes).filter((s) => isSuggested(s) && cbmOf(s) !== null)
  .map(cbmOf).sort((a, b) => a - b);

/** ช่วงของขนาดแบบสั้น — "เลือกเอง" · "≤ 300 ลบ.ม." · "เกิน 2,400 ลบ.ม." (ป้ายใต้รหัสในแถบเลือก · คอลัมน์ทะเบียน) */
export function packageSizeBandText(size, sizes) {
  if (!size) return '';
  if (!isSuggested(size)) return 'เลือกเอง';
  const max = cbmOf(size);
  if (max !== null) return `≤ ${cbmText(max)} ลบ.ม.`;
  const top = bandsOf(sizes).at(-1);
  return top === undefined ? 'ทุกขนาดพื้นที่' : `เกิน ${cbmText(top)} ลบ.ม.`;
}

/** บรรทัดรองของตารางทะเบียน — ระบบเสนอขนาดนี้เมื่อไร ("ระบบเสนอเมื่อเกิน 300 ถึง 2,400 ลบ.ม.") */
export function packageSizeRangeText(size, sizes) {
  if (!size) return '';
  if (!isSuggested(size)) return 'ระบบไม่เสนอ — หัวหน้าเลือกเอง';
  const bands = bandsOf(sizes);
  const max = cbmOf(size);
  if (max === null) {
    const top = bands.at(-1);
    return top === undefined ? 'ระบบเสนอทุกขนาดพื้นที่' : `ระบบเสนอเมื่อเกิน ${cbmText(top)} ลบ.ม.`;
  }
  const below = bands.filter((b) => b < max).at(-1);
  return below === undefined
    ? `ระบบเสนอเมื่อไม่เกิน ${cbmText(max)} ลบ.ม.`
    : `ระบบเสนอเมื่อเกิน ${cbmText(below)} ถึง ${cbmText(max)} ลบ.ม.`;
}

/**
 * ⭐ **ที่ระบบเสนอ** — ขนาดจากช่วง ลบ.ม. + จำนวน 1 · คืน `{ code, qty: 1 }` หรือ `null` (ยังเสนอไม่ได้)
 *
 * ในบรรดาขนาดที่ระบบเสนอ: ช่วงเล็กที่สุดที่ยัง ≥ ปริมาตร · ไม่มี = ขนาดไม่มีเพดาน · ไม่มีอีก = `null`
 * 🔴 ขนาดที่หัวหน้าเลือกเอง (`autoSuggest = false` เช่น XS ห้องน้ำ) **ไม่ถูกเสนอเด็ดขาด** — ระบบดูห้องน้ำไม่ออกจากปริมาตร
 * ⚠️ ไม่มีปริมาตร (ยังไม่วัด) = `null` ไม่ใช่ขนาดเล็กสุด — ข้อเสนอที่มาจากศูนย์คือการเดา
 * ⚠️ จำนวนเสนอ 1 เสมอ — สูตร ceil(ลบ.ม. ÷ 2,400) ถอดแล้ว (มติเจ้าของ 01/10) · หัวหน้าปรับจำนวนเองพร้อมเหตุผล
 */
export function suggestedPackageSize(volumeCbm, sizes) {
  const volume = Number(volumeCbm);
  if (volumeCbm === null || volumeCbm === undefined || volumeCbm === '' || !(volume > 0)) return null;
  const offered = list(sizes).filter(isSuggested);
  const banded = offered.filter((s) => cbmOf(s) !== null && cbmOf(s) >= volume)
    .sort((a, b) => cbmOf(a) - cbmOf(b))[0];
  const pick = banded || offered.find((s) => cbmOf(s) === null) || null;
  return pick ? { code: normalizePackageSizeCode(pick.code), qty: 1 } : null;
}

/** คำเตือนของทะเบียน (ขึ้นเหนือตาราง) — สภาพที่ทำให้ระบบเสนอขนาดไม่ได้ · ไม่มี = `[]` */
export function packageRegistryWarnings(sizes) {
  const offered = list(sizes).filter(isSuggested);
  if (!offered.length) return ['ไม่มีขนาดที่ระบบเสนอเลย — หัวหน้าต้องเลือกขนาดเองทุกพื้นที่'];
  if (offered.some((s) => cbmOf(s) === null)) return [];
  return [`พื้นที่เกิน ${cbmText(bandsOf(sizes).at(-1))} ลบ.ม. ระบบจะไม่เสนอขนาด`];
}

/** "SM 1 · ST 1" เรียงตามทะเบียน — รหัสที่ถูกลบไปแล้วต่อท้าย · ไม่มีทะเบียน = เรียงตามรหัส */
export function packageMixText(bySize, sizes) {
  const order = Array.isArray(sizes) ? sortPackageSizes(sizes).map((s) => normalizePackageSizeCode(s.code)) : null;
  return surveyPackageMixText(bySize, order);
}

/**
 * "ใบประเมินที่ยังไม่ส่งผล 3 ใบ (5 พื้นที่) ใช้ขนาดนี้" — กล่องยืนยันลบและสรุป audit ใช้ประโยคเดียวกัน
 * @param usage `{ surveys, zones }` ของรหัสนั้นจาก `packageSizeUsage` (ไม่มีคีย์ = ไม่มีใบใช้)
 */
export function packageSizeUsageText(usage) {
  const surveys = Number(usage?.surveys) || 0;
  const zones = Number(usage?.zones) || 0;
  return surveys > 0
    ? `ใบประเมินที่ยังไม่ส่งผล ${fmtNumber(surveys)} ใบ (${fmtNumber(zones)} พื้นที่) ใช้ขนาดนี้`
    : 'ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้';
}

/* ══ การเคาะขนาด + จำนวนของหัวหน้า ═══════════════════════════════════════════
 *
 * 🔑 **ตัวตัดสินเดียวของ route `PUT` และร่างบนจอ** (`surveyDecisionError` เรียกตัวนี้) — คืน `{ patch, error }`
 *   `patch` = ช่องแพ็คเกจที่ต้องเขียนลงแถว (รวมภาพนิ่งที่ประทับ) · `error` = ข้อความไทย (`registryDown` = 500 ไม่ใช่ 400)
 *
 * @param row   แถว `service_survey_zones` ปัจจุบัน
 * @param body  `{ packageQty?, packageSize?, packageNote? }` — `undefined` = ไม่แตะช่องนั้น
 * @param sizes ทะเบียน ณ ตอนนี้ (`null` = อ่านไม่สำเร็จ)
 *
 * กติกา (ตรวจจาก **ค่าหลังรวม** เสมอ — แก้ทีละช่องต้องตัดสินจากของที่อยู่บนแถวจริง):
 *   · ล้างจำนวน = ล้างภาพนิ่งทั้งสาม (ยังไม่เคาะ = ไม่มีขนาด) — แม้จอส่งขนาดเดิมมาด้วย
 *   · จำนวนต้องมีขนาด · ขนาดต้องมีจำนวน · ขนาดต้องอยู่ในทะเบียน
 *   · ⭐ **ประทับ `packageSizeSuggested`/`packageSizeManual` เฉพาะเมื่อขนาดหรือจำนวนเปลี่ยน** — แก้เหตุผลอย่างเดียว
 *     ใช้ภาพนิ่งเดิมบนแถว ⇒ แถวก่อนมีขนาด (back-fill ST) ไม่โดนย้อนบังคับเหตุผลเพราะแค่ถูกบันทึกซ้ำ
 *   · ต่างจากที่ระบบเสนอต้องมีเหตุผล (`packageNeedsNote` · ตรวจหลังประทับ)
 *   ⚠️ ปล่อยให้ล้างเหตุผลทิ้งได้เมื่อยังไม่เคาะแพ็คเกจ — ด่านตอนกดส่งผลจับเอง
 *   ⚠️ คำขอที่มีจำนวนแต่ **ไม่มีคีย์ `packageSize`** = แท็บรุ่นก่อน deploy — ตัดสินเหมือนเดิม (fail-closed) แต่สองข้อความที่จอเก่า
 *     แก้เองไม่ได้ ("เลือกขนาด" · "ต้องบอกเหตุผล") ต่อท้ายด้วย `PACKAGE_STALE_SCREEN_HINT`
 */
export function surveyPackageDecision(row = {}, body = {}, sizes = null) {
  const input = body && typeof body === 'object' ? body : {};
  const patch = {};
  const staleHint = input.packageQty !== undefined && input.packageQty !== null && input.packageQty !== ''
    && input.packageSize === undefined ? PACKAGE_STALE_SCREEN_HINT : '';

  if (input.packageQty !== undefined) {
    if (input.packageQty === null || input.packageQty === '') {
      patch.packageQty = null;
    } else {
      const qty = Number(input.packageQty);
      if (!Number.isInteger(qty) || qty < 1) return { patch: null, error: 'จำนวนแพ็คเกจต้องเป็นจำนวนเต็มอย่างน้อย 1' };
      if (qty > PACKAGE_QTY_MAX) return { patch: null, error: 'จำนวนแพ็คเกจดูเหมือนพิมพ์ผิดหลัก' };
      patch.packageQty = qty;
    }
  }
  if (input.packageSize !== undefined) patch.packageSize = normalizePackageSizeCode(input.packageSize) || null;
  if (input.packageNote !== undefined) {
    const note = text(input.packageNote);
    if (note.length > 500) return { patch: null, error: 'เหตุผลยาวเกิน 500 ตัวอักษร' };
    patch.packageNote = note || null;
  }
  if (!Object.keys(patch).length) return { patch, error: null };

  const rowQty = Number(row?.packageQty) > 0 ? Number(row.packageQty) : null;
  const rowSize = normalizePackageSizeCode(row?.packageSize) || null;
  const qty = 'packageQty' in patch ? patch.packageQty : rowQty;
  const size = 'packageSize' in patch ? patch.packageSize : rowSize;

  if ('packageQty' in patch && patch.packageQty === null) {
    Object.assign(patch, { packageSize: null, packageSizeSuggested: null, packageSizeManual: false });
  } else if (qty === null) {
    if (size) return { patch: null, error: 'ระบุจำนวนแพ็คเกจด้วย' };
  } else if (!size) {
    return { patch: null, error: `เลือกขนาดแพ็คเกจด้วย${staleHint}` };
  } else if (qty !== rowQty || size !== rowSize) {
    if (!Array.isArray(sizes)) return { patch: null, error: PACKAGE_SIZE_REGISTRY_DOWN, registryDown: true };
    const found = list(sizes).find((s) => normalizePackageSizeCode(s.code) === size);
    if (!found) {
      /* รหัสเดิมบนแถวที่หาไม่เจอ = ถูกลบจากทะเบียน · รหัสใหม่ที่หาไม่เจอ = จอถือทะเบียนเก่า */
      return {
        patch: null,
        error: size === rowSize
          ? `ขนาดแพ็คเกจ ${size} ถูกลบจากทะเบียนแล้ว — เลือกใหม่`
          : `ไม่พบขนาดแพ็คเกจ ${size} ในทะเบียน — โหลดหน้าใหม่`,
      };
    }
    patch.packageSize = size;
    patch.packageSizeSuggested = suggestedPackageSize(surveyZoneSize(row?.parts).volumeCbm, sizes)?.code ?? null;
    patch.packageSizeManual = !isSuggested(found);
  }

  const after = { ...row, ...patch };
  if (Number(after.packageQty) > 0 && packageNeedsNote(after) && !text(after.packageNote)) {
    return { patch: null, error: `${PACKAGE_NOTE_REQUIRED}${staleHint}` };
  }
  return { patch, error: null };
}

/* ══ วัดใหม่หลังหัวหน้าเคาะ: ประทับ "ที่ระบบเสนอ" ใหม่ (route `PATCH` ของช่าง) ══════════════
 *
 * 🐞 **ช่องโหว่ที่ตัวนี้ปิด** (review PR-P) — ด่าน "ต่างจากที่ระบบเสนอต้องบอกเหตุผล" (mig 0345) อ่านภาพนิ่ง
 *   `packageSizeSuggested` ซึ่งเดิมประทับเฉพาะตอนหัวหน้าเคาะ (`PUT`) ⇒ ช่างวัดใหม่ทีหลัง (ส่งกลับ · ดึงผลกลับ · หัวหน้าแก้ขนาดเอง)
 *   ภาพนิ่งค้างค่าของปริมาตรเก่า: เคาะ SM × 1 ไว้ แล้ววัดใหม่ได้ 3,600 ลบ.ม. = ส่งผลได้โดยไม่มีเหตุผล · เคาะก่อนมีปริมาตร
 *   (ภาพนิ่งว่าง) แล้วค่อยวัด = เหมือนกัน · ก่อนมีขนาด กติกานี้คิดสดจาก `parts` ⇒ วัดใหม่เปิดด่านเองเสมอ
 *
 * ⭐ **ปริมาตรเปลี่ยน = ข้อเสนอของระบบเปลี่ยน ⇒ ประทับใหม่** · ขนาด/จำนวน/เลือกเอง ที่หัวหน้าเคาะ **ไม่แตะ** (ช่างไม่เคาะแทนหัวหน้า)
 *   ⇒ ด่าน `package` ของหกข้อถามเหตุผลเอง และช่องเหตุผลบนแท็บสรุปโผล่ (`needNote`) โดยไม่ต้องมีกติกาชุดที่สอง
 * ⚠️ **ปริมาตรเท่าเดิม = ไม่ประทับ** (แก้ชื่อส่วน · ย้ายตัวเลขข้ามส่วน) — ภาพนิ่งคือ "ที่ระบบเสนอตอนเคาะ" · ทะเบียนที่ถูกแก้ทีหลัง
 *   ต้องไม่ย้อนบังคับเหตุผลเพราะช่างแค่กดบันทึกซ้ำ (แถว back-fill ST ที่ภาพนิ่งว่างก็ยังไม่ถูกย้อนบังคับ)
 * ⚠️ ยังไม่เคาะ (`packageQty` ว่าง) = ไม่มีภาพนิ่งให้ประทับ — `PUT` ประทับเองตอนเคาะ
 */

/** การบันทึกผลวัดครั้งนี้ต้องประทับ "ที่ระบบเสนอ" ใหม่ไหม — route ถามก่อนอ่านทะเบียน (ช่างบันทึกทั่วไปไม่เสีย query เพิ่ม) */
export function surveyRemeasureTouchesSuggestion(row = {}, parts) {
  if (!Array.isArray(parts) || !(Number(row?.packageQty) > 0)) return false;
  return surveyZoneSize(parts).volumeCbm !== surveyZoneSize(row?.parts).volumeCbm;
}

/**
 * ภาพนิ่ง "ที่ระบบเสนอ" ของแถวที่เคาะแล้วและเพิ่งถูกวัดใหม่ — คืน `{ patch, error, summary }`
 * @param row   แถว `service_survey_zones` ก่อนบันทึก
 * @param parts ส่วนที่จะเขียน (ผ่าน `normalizeSurveyParts` แล้ว) · ไม่ใช่อาร์เรย์ = คำขอไม่แตะขนาด
 * @param sizes ทะเบียน ณ ตอนนี้ (`null` = อ่านไม่สำเร็จ)
 *
 * `patch` = `{}` (ไม่ต้องประทับ) หรือ `{ packageSizeSuggested }` **ช่องเดียว** · `summary` = ท่อนต่อท้ายสรุป audit
 * 🔴 **อ่านทะเบียนไม่สำเร็จ = ไม่ให้บันทึก** (`registryDown` · 500) — เขียนขนาดใหม่โดยปล่อยภาพนิ่งเก่าไว้ คือช่องโหว่เดิมกลับมาเงียบ ๆ
 *    ส่วนล้างภาพนิ่งทิ้งคือปิดด่านเหตุผลเอง (ไม่มีที่ระบบเสนอ = ไม่มีอะไรให้ต่าง) ⇒ ทางเดียวที่ไม่โกหกคือให้ช่างกดใหม่
 * ⚠️ วัดใหม่จนไม่เหลือปริมาตร = ล้างภาพนิ่ง **โดยตั้งใจ** (ไม่ต้องถามทะเบียน) — ด่าน "ขนาด" ของช่างบล็อกใบอยู่แล้ว
 *    และวัดครบเมื่อไรก็ประทับใหม่อีกรอบ
 */
export function surveyRemeasureStamp(row = {}, parts, sizes = null) {
  if (!surveyRemeasureTouchesSuggestion(row, parts)) return { patch: {}, error: null, summary: '' };
  const volume = surveyZoneSize(parts).volumeCbm;
  if (volume > 0 && !Array.isArray(sizes)) {
    return { patch: null, error: PACKAGE_SIZE_REGISTRY_DOWN, registryDown: true, summary: '' };
  }
  const before = normalizePackageSizeCode(row?.packageSizeSuggested) || null;
  const after = volume > 0 ? (suggestedPackageSize(volume, sizes)?.code ?? null) : null;
  return {
    patch: { packageSizeSuggested: after },
    error: null,
    summary: before === after ? '' : ` · วัดใหม่หลังเคาะ: ระบบเสนอขนาด ${before || '—'} → ${after || '—'}`,
  };
}

/* ══ ขนาดที่ไม่เคยถูกเทียบกับข้อเสนอของระบบ (back-fill ST ของ 0398) ═══════════════════
 *
 * ⭐ **ตัวตัดสินเดียวของ "ทักให้ตรวจขนาด"** — บรรทัดทักในแถว (`surveyPackageCell.reviewText`) · คำเตือนบนการ์ดจัดการผล ·
 *   ข้อในโมดัลยืนยันส่งผล อ่านตัวนี้ทั้งหมด (🐞 UAT 01/10: เดิมทักเฉพาะในแถว ⇒ การ์ดขึ้น "ผ่านครบ" ปุ่มส่งเป็นกรมท่า และโมดัล
 *   บอกแค่ "2 แพ็คเกจ (SM 1 · ST 1)" — ใบที่ค้างตอน deploy ไปถึงฝ่ายขายเป็น ST ได้ในแตะเดียวโดยไม่มีอะไรทักตรงที่กด)
 * ⚠️ **ทัก ไม่บล็อก** — บังคับเลือกใหม่หรือไม่ยังเป็นคำถามเปิดของเจ้าของ (สเปก PR-P §10) และบล็อกวันนี้คือทางตัน:
 *    หัวหน้าที่ต้องการ ST จริงไม่มีทาง "ยืนยัน ST" (เลือกค่าเดิมซ้ำ = ร่างไม่ dirty ⇒ ไม่มีอะไรบันทึก ภาพนิ่งยังว่าง)
 * เงื่อนไข (ตรวจจากแถวที่บันทึกแล้ว): ไม่ถูกตัด · เคาะแล้ว (จำนวน + ขนาด) · **ไม่มีภาพนิ่ง "ที่ระบบเสนอ"** · ขนาดยังอยู่ในทะเบียน
 *   (ถูกลบ = ด่านของมันเอง) · ระบบเสนอได้ และเสนอ **ขนาดอื่น** (จำนวนที่ไม่ใช่ 1 บนแถวเก่าคือเลขที่หัวหน้าเคาะเองจริง ไม่ทัก)
 */

/** ข้อเสนอสดของแถวที่ขนาดยังไม่เคยถูกเทียบ — `{ code, qty }` หรือ `null` (ไม่ต้องทัก · อ่านทะเบียนไม่ได้ก็ `null`) */
export function packageSizeUnchecked(row = {}, sizes = null) {
  if (!Array.isArray(sizes) || isCut(row)) return null;
  const size = normalizePackageSizeCode(row?.packageSize);
  if (!(Number(row?.packageQty) > 0) || !size || normalizePackageSizeCode(row?.packageSizeSuggested)) return null;
  if (!list(sizes).some((s) => normalizePackageSizeCode(s.code) === size)) return null;
  const live = suggestedPackageSize(surveyZoneSize(row?.parts).volumeCbm, sizes);
  return live && live.code !== size ? live : null;
}

/** แถวทั้งใบที่ต้องทักก่อนส่งผล — `[{ zoneId, zoneName, size, suggested }]` (ไม่มี = `[]`) */
export function surveyPackageReviewRows(rows = [], sizes = null) {
  const out = [];
  for (const row of list(rows)) {
    const live = packageSizeUnchecked(row, sizes);
    if (live) out.push({ zoneId: row.id, zoneName: surveyZoneName(row), size: normalizePackageSizeCode(row.packageSize), suggested: live.code });
  }
  return out;
}

/** ประโยคเดียวของคำเตือน — การ์ดและโมดัลส่งผลใช้ตัวเดียวกัน · ไม่มีแถว = `null`
 *  "MeetingRoom1 ยังเป็น ST ที่ตั้งไว้ก่อนมีข้อเสนอของระบบ (ตอนนี้ระบบเสนอ SM)" */
export function surveyPackageReviewText(reviewRows = []) {
  const rows = list(reviewRows);
  if (!rows.length) return null;
  const names = rows.map((r) => `${r.zoneName} ยังเป็น ${r.size} (ระบบเสนอ ${r.suggested})`).join(' · ');
  return `ขนาดที่ตั้งไว้ก่อนมีข้อเสนอของระบบ ${fmtNumber(rows.length)} พื้นที่ — ${names}`;
}

/* ══ ด่านส่งผล: ขนาดที่เคาะไว้ยังอยู่ในทะเบียนไหม ════════════════════════════
 *
 * 🔑 **แถวด่านเดียว รูปร่างเดียวกับ `surveySpotGates`** (`key · owner · label · short · ok · done · total · zones ·
 *   zoneIds · count · reason`) ⇒ การ์ดควบคุมวางต่อท้ายด่านหกข้อได้เลย และ route ส่งผลถาม `reason` ตัวเดียวกัน
 *
 * ⭐ เจ้าของ = **หัวหน้า** — เลือกขนาดใหม่ที่แท็บสรุปส่งผลได้เอง ไม่ต้องส่งกลับให้ช่าง
 * ⚠️ ตรวจเฉพาะใบที่ยังไม่ส่งผล (ผู้เรียกคือด่านส่งผล) — ใบที่ส่งแล้วถือรหัสเป็นภาพนิ่ง ไม่มีใครมาถามด่านนี้
 * ⚠️ พื้นที่ที่ถูกตัดออก/ยังไม่เคาะขนาด ไม่นับ (ข้อ "แพ็คเกจ" ของหกข้อบล็อกแถวที่ยังไม่เคาะอยู่แล้ว)
 * 🔴 `sizes` ไม่ใช่อาร์เรย์ (อ่านทะเบียนไม่สำเร็จ) = **ไม่ผ่าน** เมื่อมีแถวที่เคาะขนาดแล้ว — ไม่รู้ว่าขนาดยังอยู่ไหม
 *    ห้ามปล่อยส่ง (fail-closed · ข้อความ `PACKAGE_SIZE_REGISTRY_DOWN`)
 */
export function surveyPackageSizeGates(rows = [], sizes = null) {
  const active = list(rows).filter((r) => !isCut(r));
  const sized = active.filter((r) => normalizePackageSizeCode(r.packageSize));
  const known = Array.isArray(sizes) ? new Set(list(sizes).map((s) => normalizePackageSizeCode(s.code))) : null;
  const stuck = known ? sized.filter((r) => !known.has(normalizePackageSizeCode(r.packageSize))) : sized;

  let reason = null;
  if (stuck.length) {
    if (!known) {
      reason = PACKAGE_SIZE_REGISTRY_DOWN;
    } else {
      const byCode = new Map();
      for (const row of stuck) {
        const code = normalizePackageSizeCode(row.packageSize);
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push(surveyZoneName(row));
      }
      reason = [...byCode.entries()]
        .map(([code, names]) => `ขนาดแพ็คเกจ ${code} ถูกลบจากทะเบียนแล้ว — เลือกใหม่ (${names.join(' · ')})`)
        .join(' | ');
    }
  }
  return [{
    key: PACKAGE_SIZE_GONE_GATE,
    owner: 'head',
    /* ป้ายสั้นบนบรรทัด "หัวหน้าต้องทำ: …" ของการ์ด — **สิ่งที่ต้องทำ** ไม่ใช่สภาพ (🐞 UAT 01/10: "ขนาดถูกลบ" บอกอาการ) */
    short: 'เลือกขนาดใหม่',
    label: 'ขนาดแพ็คเกจที่เคาะยังอยู่ในทะเบียน',
    ok: stuck.length === 0,
    done: active.length - stuck.length,
    total: active.length,
    zones: stuck.map(surveyZoneName),
    zoneIds: stuck.map((r) => r.id),
    count: stuck.length,
    reason,
  }];
}

/** 🔑 ด่านส่งผล ส่วนขนาดแพ็คเกจ — ผู้เรียกถามต่อจาก `surveySendError` เสมอ (route ส่งผล · การ์ด) · ผ่าน = `null` */
export function surveyPackageSizeSendError(rows = [], sizes = null) {
  const failed = surveyPackageSizeGates(rows, sizes).filter((g) => !g.ok);
  return failed.length ? failed.map((g) => g.reason).join(' | ') : null;
}
