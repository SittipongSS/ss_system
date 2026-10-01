// ── การเคาะของหัวหน้าบนแท็บสรุปส่งผล — ตัวตัดสินล้วน (PR5) ────────────────
//
// ⭐ **แท็บสรุปเลิกบันทึกทุกคลิก** (มติผู้ใช้ 2026-09-16) — เดิมทุกครั้งที่กด +/− หรือ
//   ติ๊กจุด จอยิง `PUT` ทันที ⇒ หัวหน้าที่กำลังลองตัวเลขเขียนลงฐานไปแล้วสิบรอบ
//   โดยไม่มีจังหวะไหนเลยที่เขาพูดว่า "เอาตามนี้" · ตอนนี้เขาเคาะจนพอใจแล้วค่อยกด
//   "บันทึกการเคาะ" ครั้งเดียว
//
// 🔑 **ไฟล์นี้ไม่รู้จัก React และไม่ยิง API** — จอถือร่าง ไฟล์นี้ตอบสี่คำถาม:
//   ค่าตั้งต้นของพื้นที่นี้คืออะไร · ร่างต่างจากฐานไหม · ร่างนี้บันทึกได้หรือยัง ·
//   payload ที่ต้องส่งคืออะไร
//
// ⚠️ **ด่านของขนาด + จำนวน + เหตุผล ต้องตรงกับ server เป๊ะ** — ทั้งที่นี่และ route `PUT` ถาม
//   `surveyPackageDecision` (`packageSizes.js`) ตัวเดียวกัน ซึ่งตรวจจาก **ค่าหลังรวม patch** ไม่ใช่จาก body
//   ⇒ จอปล่อยผ่านแล้วไปตายที่ server (หรือแย่กว่า: จอบล็อกทั้งที่ server ยอม) ไม่ได้อีก
//
// ⭐ **ขนาดเดียว + จำนวน ต่อพื้นที่** (mig 0398 · มติเจ้าของ 01/10) — ร่างถือ `packageSize` (รหัสในทะเบียน) คู่กับ
//   `packageQty` · ระบบเสนอขนาดจากช่วง ลบ.ม. + จำนวน 1 แต่ **ไม่เลือกให้เอง** (ร่างที่ระบบเติมให้ = dirty ⇒
//   ยามออกจากหน้าเด้งบนจอที่ยังไม่มีใครแตะ) · หัวหน้ากดรับข้อเสนอเอง
import {
  PACKAGE_NOTE_REQUIRED, PACKAGE_SIZE_REGISTRY_UNREAD, normalizePackageSizeCode, packageSizeBandText, packageSizeUnchecked,
  sortPackageSizes, suggestedPackageSize, surveyPackageDecision,
} from './packageSizes.js';
import { surveyZonePackageText, surveyZoneSize } from './survey.js';
import { fmtNumber } from '@/lib/format';

const text = (v) => String(v ?? '').trim();
const isCut = (zone) => zone?.status === 'cut';

/* id ของจุดที่เลือกไว้ — **เรียงแล้วเสมอ** เพราะมันถูกเอาไปเทียบกันตรง ๆ
   ⚠️ ลำดับที่คนติ๊กไม่ใช่ข้อมูล ⇒ ติ๊กออกแล้วติ๊กกลับต้องได้ "ไม่ dirty" ไม่ใช่ dirty */
const spotIdList = (ids = []) => [...new Set((ids || []).filter((v) => v !== null && v !== undefined).map(String))].sort();

/** จุดทั้งหมดที่ช่างแจ้งมา (id เรียงตามที่ช่างกรอก) */
export function surveySpotIds(zone = {}) {
  const spots = Array.isArray(zone.spots) ? zone.spots : [];
  return spots.map((s) => String(s?.id)).filter((id) => id && id !== 'undefined');
}

/**
 * ค่าตั้งต้นของร่าง = สิ่งที่อยู่ในฐานตอนนี้
 * ⚠️ `packageQty` เป็น `null` เมื่อยังไม่เคาะ — ไม่ใช่ 0 และไม่ใช่ที่ระบบเสนอ · ข้อเสนอเป็นของ
 *   ที่หัวหน้าต้องกดรับ ไม่ใช่ค่าที่ระบบกรอกให้แล้วเขาลบทิ้งเอง
 * ⚠️ ไม่มีจำนวน = ไม่มีขนาด (ยังไม่เคาะ) — server ล้างภาพนิ่งคู่กันเสมอ
 */
export function surveyDecisionBase(zone = {}) {
  const qty = Number(zone.packageQty);
  const spots = Array.isArray(zone.spots) ? zone.spots : [];
  const packageQty = Number.isFinite(qty) && qty > 0 ? qty : null;
  return {
    packageQty,
    packageSize: packageQty === null ? null : (normalizePackageSizeCode(zone.packageSize) || null),
    packageNote: text(zone.packageNote),
    spotIds: spotIdList(spots.filter((s) => s?.selected === true).map((s) => s?.id)),
  };
}

/** ร่างที่ยังไม่ถูกแตะ = ค่าตั้งต้น · ใช้ทั้งตอนเปิดจอและตอน "ยกเลิก" */
export function surveyDecisionDraft(zone = {}, draft = null) {
  const base = surveyDecisionBase(zone);
  if (!draft) return base;
  /* ⚠️ `undefined` = **ช่องนี้ยังไม่ถูกแตะ** ไม่ใช่ "ล้างค่า" — ร่างเก็บเฉพาะช่องที่คนแก้
     ⇒ แก้จุดติดตั้งอย่างเดียวแล้วจำนวนแพ็คเกจที่เคาะไว้แล้วต้องไม่หายไปด้วย
     การล้างค่าจริงส่ง `null` หรือ `''` มา (ช่องว่างในกล่องตัวเลข) */
  const size = draft.packageSize === undefined ? base.packageSize
    : (normalizePackageSizeCode(draft.packageSize) || null);
  let qty = draft.packageQty === undefined ? base.packageQty
    : (draft.packageQty === null || draft.packageQty === '' ? null : Number(draft.packageQty));
  qty = Number.isFinite(qty) && qty > 0 ? qty : null;
  /* ⭐ **แตะขนาดตอนจำนวนยังว่าง = จำนวน 1** (ที่ระบบเสนอ) — แตะขนาดแล้วต้องกด + อีกทีถึงจะบันทึกได้ คือก้าวที่ไม่มีใครเดาออก
     ⚠️ เฉพาะเมื่อ **ยังไม่ได้แตะช่องจำนวน** — คนที่ล้างจำนวนเองหมายถึง "ยังไม่เคาะ" ⇒ ขนาดหายไปด้วย (ข้างล่าง) */
  if (qty === null && size && draft.packageQty === undefined) qty = 1;
  return {
    packageQty: qty,
    packageSize: qty === null ? null : size,
    /* 🐞 UAT PR-P 01/10: **ร่างถือข้อความตามที่พิมพ์ ไม่ตัดช่องว่าง** — เดิม `text()` ตัดหัวท้ายทุกครั้งที่กดแป้น ⇒ เว้นวรรคท้ายคำ
       หายก่อนตัวอักษรถัดไปจะมา คำจึงติดกันหมด ("ห้องAกับB") และข้อความที่ติดกันนั้นคือสิ่งที่ถูกส่ง · ตัดช่องว่างหัวท้าย
       เฉพาะตอน **เทียบ/ส่ง** (`noteOf`) — ช่องว่างล้วนจึงยังนับว่าไม่ได้พิมพ์เหตุผล */
    packageNote: draft.packageNote === undefined ? base.packageNote : String(draft.packageNote ?? ''),
    spotIds: draft.spotIds === undefined ? base.spotIds : spotIdList(draft.spotIds),
  };
}

/* เหตุผลของร่างในทรงที่ใช้เทียบและส่ง (ตัดช่องว่างหัวท้าย) — ร่างเองถือข้อความดิบที่คนกำลังพิมพ์ */
const noteOf = (next) => text(next?.packageNote);

const packageChanged = (base, next) => base.packageQty !== next.packageQty
  || base.packageSize !== next.packageSize
  || base.packageNote !== noteOf(next);

/** ร่างต่างจากฐานไหม — ตัวที่ยกธง "ยังไม่บันทึก" บนแถวและบนแถบของการ์ด */
export function surveyDecisionDirty(zone = {}, draft = null) {
  if (isCut(zone)) return false;
  const base = surveyDecisionBase(zone);
  const next = surveyDecisionDraft(zone, draft);
  return packageChanged(base, next) || base.spotIds.join('|') !== next.spotIds.join('|');
}

/**
 * บันทึกร่างนี้ได้หรือยัง — คืนข้อความเหตุผล หรือ `null` เมื่อผ่าน
 * 🔑 ตรวจจาก **ค่าหลังรวมร่างกับแถว** ด้วยตัวตัดสินเดียวกับ route `PUT` (`surveyPackageDecision`)
 * @param ctx.sizes ทะเบียนขนาดแพ็คเกจจาก GET ใบประเมิน (`packageSizes`) — ไม่ส่ง/`null` = เคาะขนาดไม่ได้ (fail-closed)
 */
export function surveyDecisionError(zone = {}, draft = null, { sizes = null } = {}) {
  if (isCut(zone)) return 'พื้นที่นี้ถูกตัดออกจากใบแล้ว';
  const base = surveyDecisionBase(zone);
  const next = surveyDecisionDraft(zone, draft);
  /* 🔴 จุดที่เลือกต้องอยู่ในรายการที่ช่างแจ้งมา — server ตอบ 400 ถ้าไม่ใช่ ⇒ จอที่ถือร่าง
     ข้ามรอบโหลด (ช่างลบจุดทิ้งระหว่างที่หัวหน้าเปิดจอค้าง) ต้องจับเองก่อนกดส่ง */
  const known = new Set(surveySpotIds(zone));
  if (next.spotIds.some((id) => !known.has(id))) return 'มีจุดที่เลือกซึ่งไม่อยู่ในรายการที่ช่างแจ้งมาแล้ว — โหลดหน้าใหม่';
  if (!packageChanged(base, next)) return null;
  /* ส่งสามช่องของร่างหลังรวม — ทรงเดียวกับ payload ที่ `surveyDecisionPayload` จะยิงจริง ⇒ ผลตัดสินเท่ากับของ server */
  return surveyPackageDecision(zone, {
    packageQty: next.packageQty, packageSize: next.packageSize, packageNote: noteOf(next),
  }, sizes).error;
}

/**
 * payload สำหรับ `PUT` — **เฉพาะกลุ่มที่เปลี่ยน** · ไม่มีอะไรเปลี่ยนคืน `null`
 * ⚠️ ส่งทุกช่องทุกครั้ง = เขียนทับของที่คนอื่นเพิ่งแก้ในช่องที่เราไม่ได้แตะ ⇒ จุดติดตั้งกับแพ็คเกจแยกกลุ่มกัน
 * ⭐ **ขนาด · จำนวน · เหตุผล ไปด้วยกันเสมอ** — ด่านของ server ตรวจจากค่าหลังรวมสามช่องนี้ · ส่งไม่ครบ = โน้ตที่เพิ่งพิมพ์
 *   หายไปพร้อมด่านที่เด้งกลับ · server ประทับ "ที่ระบบเสนอ" ใหม่เฉพาะเมื่อขนาด/จำนวน **เปลี่ยนค่า** ⇒ ส่งค่าเดิมซ้ำไม่มีผล
 */
export function surveyDecisionPayload(zone = {}, draft = null) {
  const base = surveyDecisionBase(zone);
  const next = surveyDecisionDraft(zone, draft);
  const payload = {};
  if (packageChanged(base, next)) {
    payload.packageQty = next.packageQty;
    payload.packageSize = next.packageSize;
    payload.packageNote = noteOf(next);
  }
  if (base.spotIds.join('|') !== next.spotIds.join('|')) payload.selectedSpotIds = next.spotIds;
  return Object.keys(payload).length ? payload : null;
}

/**
 * ที่ระบบเสนอของพื้นที่นี้ **ณ ตอนนี้** — `{ code, qty: 1 }` หรือ `null` (ยังไม่วัด/ไม่มีขนาดรองรับ/ไม่มีทะเบียน)
 * ⭐ ตัวเดียวกับที่ route `PUT` ประทับลง `packageSizeSuggested` ตอนบันทึก ⇒ ป้าย "ระบบเสนอ SM · 1 แพ็ค" บนแถว
 *   กับด่านเหตุผลของ server ไม่มีทางเถียงกัน
 */
export function surveySuggestedFor(zone = {}, sizes = null) {
  return suggestedPackageSize(surveyZoneSize(zone.parts).volumeCbm, sizes);
}

/**
 * 🔑 **ทุกอย่างที่ช่อง "แพ็คเกจ" ของแถวหนึ่งวาด** (แท็บสรุปส่งผล · `SurveyResultTable`) — จอไม่ประกอบข้อความเอง
 *
 * @param zone  แถว `service_survey_zones`
 * @param draft ร่างของหัวหน้า (ช่องที่ยังไม่แตะ = `undefined`)
 * @param ctx.sizes     ทะเบียนขนาดจาก GET ใบประเมิน (`packageSizes`) — `null` = อ่านไม่สำเร็จ
 * @param ctx.canDecide เคาะได้ไหม (คนเคาะ + ใบยังไม่ล็อก)
 *
 * ⭐ **ที่ระบบเสนอ มีสองตัวและใช้คนละที่**
 *   · เคาะได้ + ยังไม่เคาะ / ร่างแตะขนาด-จำนวน / ขนาดถูกลบ = **ข้อเสนอสด** จากทะเบียนตอนนี้ — ตัวเดียวกับที่ route `PUT`
 *     จะประทับเมื่อขนาด/จำนวนเปลี่ยน
 *   · เคาะแล้วและยังไม่ถูกแตะ (แม้คนดูจะเคาะได้) · ดูอย่างเดียว = **ภาพนิ่งบนแถว** (`packageSizeSuggested`) — ต้องเล่าสิ่งที่
 *     ระบบเสนอ *ตอนเคาะ* (ตัวเดียวกับที่ด่านเหตุผลอ่าน) ไม่ใช่สิ่งที่ทะเบียนวันนี้จะเสนอ (ช่วงในทะเบียนแก้ได้ทีหลัง)
 * ⭐ `needNote` ถาม `surveyPackageDecision` ด้วยเหตุผลว่าง — ตัวเดียวกับด่านบันทึก ⇒ ช่องเหตุผลโผล่ตรงกับที่ server จะตีกลับเป๊ะ
 *   (แถวก่อนมีขนาดที่ยังไม่ถูกแตะ ไม่ถูกย้อนบังคับเหตุผล · XS ที่หัวหน้าเลือกเองไม่ต้องมีเหตุผล)
 * 🔴 ขนาดที่เคาะไว้แต่ **ถูกลบจากทะเบียน** ยังต้องเห็นในแถบ (แผ่นแดงกดไม่ได้ "ST (ถูกลบ)") — หายไปเฉย ๆ = หัวหน้าเห็นแถบ
 *   ที่ไม่มีอะไรถูกเลือก ทั้งที่แถวเขียนว่าเคาะแล้ว และไม่รู้ว่าทำไมส่งผลไม่ได้
 * ⭐ **ขนาดที่ไม่เคยถูกเทียบกับข้อเสนอ ≠ ขนาดที่หัวหน้าเลือกแทนข้อเสนอ** (`reviewText` · review PR-P) — แถวที่เคาะก่อนมีขนาด
 *   ถูก migration 0398 ตั้งเป็น ST พร้อมภาพนิ่ง "ที่ระบบเสนอ" ว่าง ⇒ เขียนว่า "หัวหน้าเลือก ST แทน" คือโทษคนที่ไม่เคยเลือก และใบที่
 *   ค้างอยู่ตอน deploy ส่งให้ฝ่ายขายเป็น ST ได้โดยไม่มีอะไรทัก · ตอนนี้: บรรทัดกลาง ๆ ให้ตรวจ + ปุ่ม "ใช้ที่ระบบเสนอ" กดทีเดียว
 *   ⚠️ **ทักอย่างเดียว ไม่บล็อกการส่ง** — บังคับเลือกใหม่ทุกแถวหรือไม่ เป็นเรื่องที่เจ้าของต้องตัดสิน (`needNote` ยังไม่ถูกย้อนบังคับ)
 *   ⚠️ เฉพาะเมื่อ **ขนาด** ต่างจากข้อเสนอสด — จำนวนที่ไม่ใช่ 1 บนแถวเก่าคือเลขที่หัวหน้าเคาะเองจริง (พร้อมเหตุผลตามกติกาเดิม)
 *   ⚠️ เฉพาะร่างที่ยังไม่แตะขนาด/จำนวน — แตะแล้ว server ประทับข้อเสนอสด ⇒ กลับเข้ากติกา "หัวหน้าเลือก … แทน" + เหตุผลตามปกติ
 */
export function surveyPackageCell(zone = {}, draft = null, { sizes = null, canDecide = false } = {}) {
  const next = surveyDecisionDraft(zone, draft);
  const registry = Array.isArray(sizes) ? sortPackageSizes(sizes) : null;
  const known = new Map((registry || []).map((s) => [normalizePackageSizeCode(s.code), s]));
  const size = next.packageSize;
  const qty = next.packageQty;
  const gone = registry && size && !known.has(size) ? size : null;

  const options = (registry || []).map((s) => {
    const code = normalizePackageSizeCode(s.code);
    const band = packageSizeBandText(s, registry);
    return {
      value: code, label: code, title: `${s.nameEn || code} · ${band}`,
      ariaLabel: `ขนาด ${code} ${s.nameEn || ''} ${band}`.replace(/\s+/g, ' ').trim(),
    };
  });
  if (gone) {
    options.push({
      value: gone, label: `${gone} (ถูกลบ)`, disabled: true, gone: true, tone: 'danger',
      title: `ขนาด ${gone} ถูกลบจากทะเบียนแล้ว`, ariaLabel: `ขนาด ${gone} ถูกลบจากทะเบียนแล้ว`,
    });
  }

  const volume = surveyZoneSize(zone.parts).volumeCbm;
  const live = registry ? suggestedPackageSize(volume, registry) : null;
  const stamped = normalizePackageSizeCode(zone.packageSizeSuggested) || null;
  const base = surveyDecisionBase(zone);
  /* ร่างแตะขนาด/จำนวนไหม — แตะ = server ประทับข้อเสนอสดตอนบันทึก · ไม่แตะ = แถวยังถือภาพนิ่งเดิม */
  const touched = size !== base.packageSize || qty !== base.packageQty;
  /* ⭐ **แถวที่เคาะแล้วและยังไม่ถูกแตะ เล่าข้อเสนอจากภาพนิ่ง แม้คนดูจะเคาะได้** (UAT PR-P 01/10)
     🐞 เดิมคนเคาะเห็นข้อเสนอสดเสมอ ⇒ แอดมินเพิ่ม MD ≤ 1,000 ในทะเบียน แล้วพื้นที่ที่เคาะ ST ตามที่ระบบเสนอเป๊ะ ขึ้นว่า
        "ระบบเสนอ MD · หัวหน้าเลือก ST แทน" ทั้งที่ไม่มีใครเลือกแทนอะไร ไม่มีช่องเหตุผล และด่านของ server (อ่านภาพนิ่ง) ก็ไม่ถาม
        — จอกับด่านเล่าคนละเรื่อง และโทษคนที่ทำตามระบบ (ปัญหาเดียวกับแถว back-fill แต่เกิดกับแถวที่มีภาพนิ่ง)
     ⇒ ไม่แตะ = "ตอนเคาะระบบเสนอ ST" (ตัวเดียวกับที่ด่านเหตุผลอ่าน) + บรรทัดกลาง ๆ ว่าทะเบียนตอนนี้เสนออะไร
       · แตะขนาด/จำนวนเมื่อไร = ข้อเสนอสด (ตัวที่ server จะประทับ) + เหตุผลตามปกติ
     ⚠️ ขนาดที่ถูกลบไม่เข้ากติกานี้ — แถวนั้นต้องเลือกใหม่อยู่แล้ว ⇒ เล่าข้อเสนอสด (ตัวที่จะใช้จริงตอนเลือกใหม่) */
  const frozen = canDecide && base.packageQty !== null && !touched && !!stamped && !gone;
  const stale = frozen && (!live || live.code !== stamped);
  const suggested = canDecide && !frozen ? live : (stamped ? { code: stamped, qty: 1 } : null);

  const bandOf = (code) => {
    const row = known.get(code);
    return row ? ` (${packageSizeBandText(row, registry)})` : '';
  };
  let hint = null;
  if (suggested) {
    /* ช่วงในวงเล็บขึ้นเฉพาะข้อเสนอสด — ภาพนิ่งไม่รู้ว่าช่วงตอนนั้นคือเท่าไร (ทะเบียนแก้ได้ทีหลัง) · ภาพนิ่งที่ยังตรงกับ
       ทะเบียนตอนนี้ = ข้อเสนอเดียวกัน จึงขึ้นช่วงได้ */
    const band = canDecide && !stale ? bandOf(suggested.code) : '';
    hint = `${stale ? 'ตอนเคาะระบบเสนอ' : 'ระบบเสนอ'} ${suggested.code}${band} · ${fmtNumber(suggested.qty)} แพ็ค`;
  } else if (canDecide && registry && registry.length) {
    hint = !(volume > 0)
      ? 'ยังไม่มีปริมาตร — ระบบยังเสนอขนาดไม่ได้'
      : `ไม่มีขนาดในทะเบียนที่ระบบเสนอให้ ${fmtNumber(volume, { maximumFractionDigits: 2 })} ลบ.ม. — เลือกเอง`;
  }

  /* ขนาดบนแถวที่ไม่เคยถูกเทียบกับข้อเสนอ (ภาพนิ่งว่าง: back-fill ST ของ 0398 · เคาะตอนระบบยังเสนอไม่ได้) และต่างจากข้อเสนอสด
     — ตัวตัดสินเดียวกับคำเตือนบนการ์ดและโมดัลส่งผล (`packageSizeUnchecked`) */
  const unchecked = canDecide && !touched && !!packageSizeUnchecked(zone, registry);

  /* ต้องบอกเหตุผลไหม — ถามตัวตัดสินเดียวกับด่านบันทึก โดยทำเหมือนยังไม่ได้พิมพ์เหตุผล */
  const needNote = qty !== null && surveyPackageDecision(zone, {
    packageQty: qty, packageSize: size, packageNote: '',
  }, sizes).error === PACKAGE_NOTE_REQUIRED;
  const note = text(next.packageNote);

  return {
    size,
    qty,
    options,
    /* อ่านทะเบียนไม่สำเร็จ = เคาะขนาด/จำนวนไม่ได้ (server ตีกลับเหมือนกัน) — จอวาดค่าเดิมเป็นตัวหนังสือ + เหตุ
       ⚠️ ข้อความบนจอไม่มีคำว่า "ลองใหม่" — ทะเบียนมากับ GET ใบประเมิน ทางออกคือปุ่ม "โหลดใหม่" ที่จอวางไว้ข้างข้อความ */
    registryDown: registry ? null : PACKAGE_SIZE_REGISTRY_UNREAD,
    /* ทะเบียนอ่านได้แต่ว่าง — ไม่มีอะไรให้เลือก ⇒ จอบอกครั้งเดียว (พร้อมลิงก์ไปทะเบียน) และปิดตัวเพิ่ม/ลดจำนวน
       🐞 UAT 01/10: เดิมประโยคเดียวกันขึ้นสองครั้งในช่อง (ช่องขนาด + บรรทัดข้อเสนอ) และ −/+ ยังกดได้ทั้งที่ไม่มีขนาดให้คู่ */
    emptyRegistry: !!registry && registry.length === 0,
    emptyText: registry && !registry.length ? 'ยังไม่มีขนาดในทะเบียน' : null,
    canStep: !!registry && registry.length > 0,
    gone,
    goneText: gone ? `ขนาด ${gone} ถูกลบจากทะเบียนแล้ว — เลือกขนาดใหม่` : null,
    suggested,
    hint,
    overrideText: !unchecked && !gone && size && suggested && size !== suggested.code ? `หัวหน้าเลือก ${size} แทน` : null,
    /* แทน `overrideText` บนแถวที่ไม่มีใครเลือกขนาดนี้ "แทน" ข้อเสนอ — ไม่โทษหัวหน้า แต่ทักให้ตรวจก่อนส่ง */
    reviewText: unchecked ? `${size} ตั้งไว้ก่อนมีข้อเสนอของระบบ — ตรวจขนาดก่อนส่งผล` : null,
    /* ทะเบียนถูกแก้หลังเคาะ — ข้อเท็จจริงกลาง ๆ ไม่ใช่คำเตือน: แถวที่เคาะแล้วไม่ถูกเปิดใหม่เพราะทะเบียนเปลี่ยน (มติ: แก้ทะเบียน
       มีผลกับการเคาะครั้งถัดไป) แต่หัวหน้าควรเห็นว่าถ้าเคาะใหม่ตอนนี้ระบบจะเสนออะไร */
    registryText: stale && live ? `ทะเบียนตอนนี้เสนอ ${live.code}${bandOf(live.code)}` : null,
    qtyHint: suggested ? `เสนอ ${fmtNumber(suggested.qty)} แพ็ค` : null,
    /* ⭐ **ยังไม่เคาะ = ปุ่มรับข้อเสนอ ไม่ใช่ค่าที่เติมให้** — ร่างที่ระบบเติมเองคือร่างที่ dirty บนจอที่ยังไม่มีใครแตะ
       · แถวที่ขนาดยังไม่เคยถูกเทียบ (`unchecked`) ได้ปุ่มเดียวกัน — ทักแล้วต้องมีทางแก้ในคลิกเดียว
       · ขนาดถูกลบ = ต้องเลือกใหม่อยู่แล้ว ⇒ ข้อเสนอสดกดรับได้ทีเดียว
       · เคาะตามที่ระบบเสนอไว้เป๊ะ (ขนาดเดียวกัน · 1 แพ็ค) แล้วทะเบียนเปลี่ยนข้อเสนอ = กดตามข้อเสนอใหม่ได้ทีเดียว (ไม่บังคับ)
         ⚠️ จำนวนที่ไม่ใช่ 1 คือเลขที่หัวหน้าเคาะเอง — ไม่ชวนกดทับกลับเป็น 1 */
    accept: canDecide && live && (qty === null || unchecked || !!gone || (stale && size === stamped && qty === live.qty))
      ? { label: `ใช้ที่ระบบเสนอ: ${live.code} · ${fmtNumber(live.qty)} แพ็ค`, patch: { packageSize: live.code, packageQty: live.qty } }
      : null,
    needNote,
    /* ต้องมีเหตุผลและยังไม่ได้พิมพ์ — ป้ายแดง "ต้องบอกเหตุผล" ขึ้นเฉพาะตอนนี้ (🐞 UAT 01/10: ป้ายแดงค้างเหนือช่องที่กรอกแล้ว
       ⇒ แถวที่ผ่านแล้วยังดูเหมือนติด) */
    noteMissing: needNote && !note,
    /* ⭐ **ถอยเฉพาะพื้นที่นี้** (UAT 01/10) — แตะขนาดแล้วจำนวนเป็น 1 ทันที และ −/+ ไม่ลงต่ำกว่า 1 ⇒ เดิมแตะพลาดแล้วทางกลับ
       ทางเดียวคือ "ยกเลิก" ซึ่งทิ้งการเคาะของ **ทุกพื้นที่** · ปุ่มนี้คืนสามช่องของแพ็คเกจเป็นค่าในฐาน (จุดที่เลือกไม่แตะ)
       ⚠️ `undefined` = "ช่องนี้ยังไม่ถูกแตะ" ของร่าง (ดู `surveyDecisionDraft`) — ไม่ใช่การล้างค่า */
    reset: canDecide && (touched || note !== base.packageNote)
      ? {
        label: base.packageQty === null ? 'ล้างที่เคาะ' : 'คืนค่าที่บันทึกไว้',
        patch: { packageSize: undefined, packageQty: undefined, packageNote: undefined },
      }
      : null,
    valueText: surveyZonePackageText({ packageSize: size, packageQty: qty }),
  };
}

/**
 * สรุปการเคาะที่ค้างอยู่ทั้งใบ — แถบบนหัวการ์ดและด่าน `pendingDecisionZoneIds` อ่านตัวนี้
 * ⚠️ พื้นที่ที่ถูกตัดออกไม่นับ — แก้อะไรไม่ได้อยู่แล้ว ค่าค้างบนนั้นไม่ควรขวางการส่ง
 * @param ctx.sizes ทะเบียนขนาดแพ็คเกจ (ส่งต่อให้ `surveyDecisionError`)
 */
export function surveyPendingDecisions(zones = [], drafts = {}, { sizes = null } = {}) {
  const rows = Array.isArray(zones) ? zones : [];
  const dirty = [];
  const blocked = [];
  for (const zone of rows) {
    if (!zone || isCut(zone)) continue;
    const draft = drafts?.[zone.id];
    if (!surveyDecisionDirty(zone, draft)) continue;
    dirty.push(zone);
    const error = surveyDecisionError(zone, draft, { sizes });
    if (error) blocked.push({ id: String(zone.id), zoneName: zone.zoneName || '', error });
  }
  return {
    ids: dirty.map((z) => String(z.id)),
    rows: dirty,
    count: dirty.length,
    blocked,
    /* กดบันทึกได้เมื่อมีของค้าง **และไม่มีแถวไหนติดด่าน** — บันทึกครึ่งใบแล้วเหลือครึ่ง
       คือสภาพที่อธิบายยากกว่าเดิม (หัวหน้าไม่รู้ว่าอันไหนลงแล้ว) */
    canSave: dirty.length > 0 && blocked.length === 0,
  };
}
