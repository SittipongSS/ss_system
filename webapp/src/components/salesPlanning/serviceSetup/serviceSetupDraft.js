// ── ร่างการแก้งานบริการบนจอ (ตารางรายการของใบสั่งขาย · mig 0392 · PR-A) — ตรรกะล้วน ไม่มี JSX ──────────────
//
// ⭐ **จอถือแค่ "สิ่งที่แก้"** — ฐาน (ก้อน GET ของ `…/service-setup`) เป็นความจริงเสมอ · ร่างเก็บเฉพาะคีย์ที่ผู้ใช้แตะ
//   ⇒ ก้อนบันทึก (PATCH) ส่งเฉพาะที่ต่างจากฐานจริง ๆ (คีย์ที่ไม่ส่ง = ไม่เปลี่ยน · `zones` ที่ส่ง = แทนทั้งชุดของบรรทัดนั้น)
//   ⇒ โหลดฐานใหม่ (บันทึกแล้ว · ถูกแก้จากอีกหน้าต่าง) = `rebaseDraft` ทิ้งคีย์ที่เท่าฐานใหม่แล้ว ที่เหลือคือสิ่งที่ยังค้าง
// ⭐ ช่องตัวเลขเก็บเป็น "ข้อความที่พิมพ์" — ตัวตรวจของ server เป็นคนตัดสินว่าใช้ได้ไหม (400 fieldErrors ขึ้นแดงรายช่อง)
//   จอไม่เดา/ไม่ตัดทิ้งเอง ยกเว้นแถวโซนที่ยังไม่ได้เลือกโซน (แถวว่าง = ยังไม่มีอะไรให้บันทึก ไม่ใช่ข้อผิด)
// ⭐ ช่วงบริการ (mig 0400 · มติเจ้าของ 01/10): ร่างมีคีย์ `periodMode` ('whole' | 'line') · `period` (ช่วงของทั้งใบ — ใช้ตอนโหมดทั้งใบ)
//   · `lines[id].period` (`{ from, to }` ตามที่พิมพ์ — ใช้ตอนโหมดแยกรายรายการ และเฉพาะบรรทัดที่เป็นงานบริการ)
//   คีย์ของโหมดที่ไม่ได้ใช้อยู่ **ค้างในร่างได้แต่ไม่ถูกส่ง** ⇒ สลับโหมดไปมาก่อนบันทึกไม่มีอะไรหาย (`switchPeriodMode`)
//   🔴 **ค่าที่สวิตช์เติมให้ ไม่ใช่ของที่คนพิมพ์ — ห้ามเขียนลงร่าง** (ตรวจทาน ui-leftover-seeded-periods): ช่วงตั้งต้นของรายการตอนสลับ
//      ทั้งใบ → แยกรายรายการ และช่วงรวมตอนสลับ แยกรายรายการ → ทั้งใบ **คิดตอนวาด** จากของบนจอ (`mergedLines` · `wholePeriodOfDraft`)
//      ⇒ ร่างมีแต่ของที่คนแตะ · แก้ช่วงของใบแล้วสลับใหม่ = รายการตามช่วงใหม่ · โหลดฐานใหม่ไม่มีค่าที่ไม่มีใครพิมพ์โผล่มาทับของอีกหน้าต่าง
//   · ของที่คนพิมพ์ระหว่างสลับไปอีกโหมด แล้วสลับกลับโดยยังไม่บันทึก พักไว้ที่ `parked` (ตัววาด/ก้อนบันทึกไม่อ่าน) — สลับไปอีกรอบได้คืน ·
//     ฐานเปลี่ยน (`rebaseDraft`) = ทิ้ง
// ⚠️ `expectedUpdatedAt` = `updatedAt` ของก้อน GET **ตามตัวอักษร** — ห้ามแปลงผ่าน Date (ไมโครวินาทีหาย ⇒ ทุกการบันทึกตายด้วย stale)
// ⚠️ ไฟล์นี้ถูกเทสต์ใต้ node (serviceSetupUi.test.mjs) — ห้าม import คอมโพเนนต์/ของฝั่ง browser
import { categoryOf } from '@/lib/master/categoryOf';
import {
  SERVICE_BACKFILL_RAIL_TEXT, SERVICE_BACKFILL_STATE_LABELS, SERVICE_DEFER_TEXT, SERVICE_DEFERRED_TEXT, SERVICE_KIND_NOT_SERVICE, SERVICE_KIND_PACKAGE,
  SERVICE_PERIOD_MODE_LINE, SERVICE_PERIOD_MODE_WHOLE, SERVICE_PERIOD_TEXT, SERVICE_REOPENED_TEXT, SERVICE_ROLE_UNSET,
  SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_LINE_TEXT, SERVICE_SETUP_PANEL_TEXT, periodEnvelope, periodSpan, validServicePeriod,
} from '@/lib/sales/serviceSetup';
import { NA, fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';

const PACKAGE_CATEGORY = '02-001';
export const EMPTY_DRAFT = Object.freeze({ lines: Object.freeze({}) });

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

/** ข้อความที่พิมพ์ → จำนวนเต็ม · ว่าง = null · อย่างอื่น (0 · 1.5 · ตัวอักษร) ส่งตามที่พิมพ์ให้ server ตีกลับรายช่อง */
export function intOrRaw(raw) {
  const value = text(raw);
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : value;
}
/** ค่าที่ใช้คิดตัวเลขบนจอ — จำนวนเต็มบวกเท่านั้น อย่างอื่น = ยังไม่มี */
export function positiveIntOrNull(raw) {
  const value = intOrRaw(raw);
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
const rawOf = (value) => (value === null || value === undefined ? '' : String(value));

/* ══ บรรทัด: ชนิด ═══════════════════════════════════════════════════════════════════════════════════ */

/** บรรทัด "เพิ่มรายการเอง" (ไม่มีทั้งรหัส FG และสินค้า) — กติกาเดียวกับ `isManualSalesLine` */
export const isManualViewLine = (line) => !line?.fgCode && !line?.productId;

/** ชนิดที่ตัดสินได้เองจากบรรทัด (ไม่ดูค่าที่เก็บ) — FG ตามหมวดของรหัส · พิมพ์เองตามหมวดที่คนออกใบเลือก · ไม่รู้ = null
 *  ⚠️ ตัวเดียวกับ `derivedLineRole` ของ serviceSetup.js (อ่านจากก้อน GET ที่ `categoryCode` ถูกคิดมาแล้ว) */
export function derivedRoleOf(line) {
  if (!isManualViewLine(line)) return categoryOf(line?.fgCode) === PACKAGE_CATEGORY ? SERVICE_KIND_PACKAGE : SERVICE_KIND_NOT_SERVICE;
  const code = text(line?.categoryCode);
  if (!code) return null;
  return code === PACKAGE_CATEGORY ? SERVICE_KIND_PACKAGE : SERVICE_KIND_NOT_SERVICE;
}

/* ══ ฐาน (ก้อน GET) ════════════════════════════════════════════════════════════════════════════════ */

function allocationsOf(view, lineId) {
  return list(view?.allocations)
    .filter((row) => row?.lineId === lineId)
    .sort((a, b) => (Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
      || (String(a?.zoneId) < String(b?.zoneId) ? -1 : String(a?.zoneId) > String(b?.zoneId) ? 1 : 0));
}

/** ค่าที่ฐานถือของบรรทัดหนึ่ง — `{ kind, serviceProductId, serviceFgCode, rounds, period, zones:[{zoneId, packsPerRound}] }`
 *  · `period` = ช่วงของรายการที่บันทึกไว้ (`{ from, to }` · โหมดทั้งใบ/ไม่ใช่งานบริการ = null — ฐานเก็บว่างเสมอ) */
export function baseLineOf(view, lineId) {
  const line = list(view?.lines).find((row) => row?.lineId === lineId) || {};
  return {
    kind: line.kind ?? null,
    serviceProductId: line.serviceProductId ?? null,
    serviceFgCode: line.serviceFgCode ?? null,
    rounds: line.rounds ?? null,
    period: line.period ?? null,
    zones: allocationsOf(view, lineId).map((row) => ({ zoneId: row.zoneId, packsPerRound: row.packsPerRound ?? null })),
  };
}

const samePeriod = (a, b) => (text(a?.from) === text(b?.from) && text(a?.to) === text(b?.to));
const periodOrNull = (period) => {
  const from = text(period?.from);
  const to = text(period?.to);
  return !from && !to ? null : { from, to };
};
const samePeriodOrNull = (a, b) => {
  const left = periodOrNull(a);
  const right = periodOrNull(b);
  return (left === null && right === null) || (!!left && !!right && samePeriod(left, right));
};
const lineMode = (mode) => (mode === SERVICE_PERIOD_MODE_LINE ? SERVICE_PERIOD_MODE_LINE : SERVICE_PERIOD_MODE_WHOLE);

/** โหมดช่วงบริการบนจอ = ร่าง (ถ้าสลับไว้) ไม่งั้นค่าที่บันทึก · ไม่รู้ = 'whole' (ใบเดิมทุกใบ) */
export function periodModeOfDraft(view, draft = EMPTY_DRAFT) {
  return lineMode(hasOwn(draft, 'periodMode') ? draft.periodMode : view?.periodMode);
}

const sameZones = (a, b) => a.length === b.length
  && a.every((row, index) => row.zoneId === b[index].zoneId && (row.packsPerRound ?? null) === (b[index].packsPerRound ?? null));
const zonesForPayload = (rows) => list(rows)
  .filter((row) => text(row?.zoneId))
  .map((row) => ({ zoneId: text(row.zoneId), packsPerRound: intOrRaw(row.packsPerRound) }));

/* ══ รวมฐาน + ร่าง (สิ่งที่จอวาด) ════════════════════════════════════════════════════════════════════ */

/**
 * บรรทัดที่จอวาด = ฐาน + ร่าง — เรียงตาม `lineNo` ของก้อน GET
 * @param fgById Map id → ตัวเลือก FG (`view.fgOptions`) — ใช้เติมรหัส FG ของแพ็คเกจที่เพิ่งเลือก
 * @returns `[{ ...viewLine, manual, derivedRole, baseKind, kind, role, roleSource, serviceProductId, serviceFgCode,
 *             rounds (ข้อความ), period, zones:[{ key, zoneId, packsPerRound (ข้อความ) }] }]`
 *   · `period` (mig 0400) = ช่วงของรายการ `{ from, to }` (ข้อความ ISO ตามที่พิมพ์ · ว่างทั้งคู่ = null) — มีค่า **เฉพาะโหมด
 *     แยกรายรายการ และบรรทัดที่เป็นงานบริการ** (ร่างถ้าแตะ ไม่งั้นฐาน) · โหมดทั้งใบ/ไม่ใช่งานบริการ/ยังไม่ตอบ = null เสมอ
 */
export function mergedLines(view, draft = EMPTY_DRAFT, { fgById = new Map() } = {}) {
  const byLine = periodModeOfDraft(view, draft) === SERVICE_PERIOD_MODE_LINE;
  /* ทั้งใบ (บันทึกไว้) → แยกรายรายการ (ร่าง): รายการงานบริการที่คนยังไม่แตะช่วง ได้ช่วงของทั้งใบที่เห็นบนจอเป็นค่าตั้งต้น (เมื่อครบและเรียงถูก)
     — คิดตอนวาด ไม่เขียนลงร่าง · ใบที่บันทึกเป็นแยกรายรายการแล้วไม่มีค่าตั้งต้น (รายการที่ว่าง = ว่าง) */
  const seed = byLine && lineMode(view?.periodMode) !== SERVICE_PERIOD_MODE_LINE
    ? validServicePeriod(wholePeriodOfDraft(view, draft))
    : null;
  return mergeWith(view, draft, { fgById, byLine, seed });
}

/* ตัวรวมฐาน + ร่าง — `byLine` = วาดช่วงของรายการไหม · `seed` = ช่วงตั้งต้นของรายการที่ยังไม่มีทั้งในร่างและในฐาน (null = ไม่เติม) */
function mergeWith(view, draft, { fgById = new Map(), byLine = false, seed = null } = {}) {
  const lines = [...list(view?.lines)].sort((a, b) => Number(a?.lineNo ?? 0) - Number(b?.lineNo ?? 0));
  const linePeriod = (edit, base) => {
    if (hasOwn(edit, 'period')) return periodOrNull(edit.period);
    return periodOrNull(base.period) ?? (seed ? { from: seed.from, to: seed.to } : null);
  };
  return lines.map((line) => {
    const lineId = line.lineId;
    const edit = draft?.lines?.[lineId] || {};
    const base = baseLineOf(view, lineId);
    const manual = isManualViewLine(line);
    const derivedRole = derivedRoleOf(line);
    const kind = manual && hasOwn(edit, 'kind') ? edit.kind : base.kind;
    const role = kind || derivedRole || SERVICE_ROLE_UNSET;
    const roleSource = kind ? 'stored' : (!manual ? 'fg' : (derivedRole ? 'category' : 'none'));
    const serviceProductId = manual && hasOwn(edit, 'serviceProductId') ? (edit.serviceProductId || null) : base.serviceProductId;
    const picked = serviceProductId ? fgById.get(serviceProductId) : null;
    const serviceFgCode = manual && hasOwn(edit, 'serviceProductId')
      ? (serviceProductId ? (picked?.fgCode ?? (serviceProductId === base.serviceProductId ? base.serviceFgCode : null)) : null)
      : base.serviceFgCode;
    const zones = hasOwn(edit, 'zones')
      ? list(edit.zones).map((row) => ({ key: row.key, zoneId: text(row.zoneId), packsPerRound: rawOf(row.packsPerRound) }))
      : base.zones.map((row) => ({ key: `z:${row.zoneId}`, zoneId: row.zoneId, packsPerRound: rawOf(row.packsPerRound) }));
    return {
      ...line,
      manual,
      derivedRole,
      baseKind: base.kind,
      kind,
      role,
      roleSource,
      serviceProductId,
      serviceFgCode,
      rounds: hasOwn(edit, 'rounds') ? rawOf(edit.rounds) : rawOf(base.rounds),
      period: byLine && role === SERVICE_KIND_PACKAGE ? linePeriod(edit, base) : null,
      zones,
    };
  });
}

/**
 * ช่วงของทั้งใบที่เห็นบนจอ (โหมดทั้งใบ) → `{ from, to }` ตามที่พิมพ์ หรือ null
 *   · ร่างมีคีย์ `period` (คนพิมพ์) = ตัวนั้น
 *   · ใบที่บันทึกเป็นแยกรายรายการ (ร่างสลับมาทั้งใบ) = **ช่วงรวมของรายการ** (ร่างถ้าแตะ ไม่งั้นฐาน · เฉพาะช่วงที่ใช้ได้) — คิดตอนวาด
 *     ⇒ สลับกลับไปแก้ช่วงของรายการแล้วสลับมาใหม่ ได้ช่วงรวมใหม่ (ไม่ค้างค่าของรอบแรก)
 *   · อย่างอื่น = ช่วงที่บันทึกไว้ (`view.period`)
 */
export function wholePeriodOfDraft(view, draft = EMPTY_DRAFT) {
  if (hasOwn(draft, 'period')) return draft.period ?? null;
  if (lineMode(view?.periodMode) !== SERVICE_PERIOD_MODE_LINE) return view?.period ?? null;
  return localEnvelope(mergeWith(view, draft, { byLine: true }));
}

/* ══ ช่วงบริการ: สวิตช์ "ทั้งใบช่วงเดียว | แยกรายรายการ" (mig 0400 · แผน IMPL_PLAN_PERIOD §1 D-P4) ═══════════════════ */

/** ช่วงรวมบนจอ (เริ่มแรกสุด → จบสุดท้าย) ของรายการที่เป็นงานบริการ — คิดจากช่วงที่ใช้ได้เท่านั้น ครบหรือไม่ครบก็ได้ · ไม่มีสักช่วง = null
 *  ⚠️ ใช้วาดแถบ "ช่วงรวมของใบ" เท่านั้น — ค่าที่เก็บบนใบมาจาก RPC บันทึก (เก็บเมื่อครบทุกรายการ) */
export function localEnvelope(merged = []) {
  return periodEnvelope(list(merged).filter((line) => line?.role === SERVICE_KIND_PACKAGE).map((line) => line.period));
}

/** ตัวนับ "ใส่ช่วงแล้ว x/y รายการ" บนจอ — `{ total, filled }` (รายการที่เป็นงานบริการ / ที่มีช่วงใช้ได้) */
export function linePeriodCounters(merged = []) {
  const packages = list(merged).filter((line) => line?.role === SERVICE_KIND_PACKAGE);
  return { total: packages.length, filled: packages.filter((line) => validServicePeriod(line.period)).length };
}

/** ต้นทางของปุ่ม "เหมือนรายการ n" — รายการงานบริการแรก (ตามเลขรายการ) ที่มีช่วงใช้ได้ → `{ lineId, lineNo, period }` · ไม่มี = null */
export function sameSourceOf(merged = []) {
  const source = [...list(merged)]
    .sort((a, b) => Number(a?.lineNo ?? 0) - Number(b?.lineNo ?? 0))
    .find((line) => line?.role === SERVICE_KIND_PACKAGE && validServicePeriod(line.period));
  return source ? { lineId: source.lineId, lineNo: source.lineNo, period: validServicePeriod(source.period) } : null;
}

/* ของที่คนพิมพ์ระหว่างสลับไปอีกโหมด (ยังไม่บันทึก) — ย้ายเข้า/ออกจาก `parked` ตอนสลับกลับ/สลับไปอีกรอบ
   · ใบที่บันทึกเป็นทั้งใบ: ช่วงของรายการที่พิมพ์ตอนอยู่แยกรายรายการ (`lines[id].period`) → `parked.lines`
   · ใบที่บันทึกเป็นแยกรายรายการ: ช่วงของใบที่พิมพ์ตอนอยู่ทั้งใบ (`period`) → `parked.period` */
function parkExcursion(draft, saved) {
  const out = { ...draft };
  delete out.periodMode;
  delete out.parked;
  if (saved === SERVICE_PERIOD_MODE_LINE) {
    if (!hasOwn(draft, 'period')) return out;
    delete out.period;
    return { ...out, parked: { period: draft.period } };
  }
  const lines = {};
  const parkedLines = {};
  for (const [lineId, edit] of Object.entries(draft.lines || {})) {
    if (!hasOwn(edit, 'period')) { lines[lineId] = edit; continue; }
    const rest = { ...edit };
    delete rest.period;
    parkedLines[lineId] = edit.period;
    if (Object.keys(rest).length) lines[lineId] = rest;
  }
  out.lines = lines;
  return Object.keys(parkedLines).length ? { ...out, parked: { lines: parkedLines } } : out;
}
function unparkExcursion(draft, saved, target) {
  const out = { ...draft, periodMode: target };
  const parked = draft.parked || null;
  delete out.parked;
  if (!parked) return out;
  if (saved === SERVICE_PERIOD_MODE_LINE) {
    if (hasOwn(parked, 'period') && !hasOwn(out, 'period')) out.period = parked.period;
    return out;
  }
  const lines = { ...(out.lines || {}) };
  for (const [lineId, period] of Object.entries(parked.lines || {})) {
    if (!hasOwn(lines[lineId], 'period')) lines[lineId] = { ...(lines[lineId] || {}), period };
  }
  out.lines = lines;
  return out;
}

/**
 * สลับโหมดช่วงบริการในร่าง — ตัดสินจาก **โหมดที่บันทึกไว้** (`view.periodMode`) · ร่างได้แค่คีย์ `periodMode`:
 *   · ไปโหมดที่ต่างจากที่บันทึก = ตั้ง `periodMode` (+ คืนของที่พักไว้จากการสลับรอบก่อน) — **ไม่เขียนช่วงใดลงร่าง**
 *     ค่าตั้งต้นที่เห็นหลังสลับคิดตอนวาด: ทั้งใบ → แยกรายรายการ = รายการงานบริการที่ยังไม่มีช่วงได้ช่วงของทั้งใบบนจอ (`mergedLines`) ·
 *     แยกรายรายการ → ทั้งใบ = ช่องของใบได้ช่วงรวมของรายการบนจอ (`wholePeriodOfDraft`)
 *   · กลับไปโหมดที่บันทึกไว้ = ถอดคีย์ `periodMode` + พักของที่พิมพ์ระหว่างสลับไว้ที่ `parked` ⇒ ไม่มีอะไรค้างให้บันทึกเพราะสวิตช์
 *     และไม่มีคีย์ของอีกโหมดซ่อนอยู่ในร่างที่ "ไม่มีอะไรค้าง"
 * 🐞 ตรวจทาน ui-leftover-seeded-periods: เดิมสวิตช์เขียนค่าตั้งต้นลงร่างเหมือนคนพิมพ์ แล้วสลับกลับถอดแค่คีย์โหมด ⇒
 *    (1) แก้ช่วงของใบแล้วสลับใหม่ รายการยังเป็นช่วงเก่า · (2) อีกหน้าต่างบันทึกเป็นแยกรายรายการ → โหลดใหม่หลัง 409 →
 *    ค่าที่ซ่อนอยู่โผล่เป็น "ยังไม่บันทึก" แล้วทับช่วงห้ารายการของอีกหน้าต่างด้วยวันที่ไม่มีใครพิมพ์ · (3) ฝั่งช่วงของใบแบบเดียวกัน
 * 🐞 กติกาเดิมของแผน ("กลับทั้งใบ = ใส่ช่วงรวมเมื่อไม่เท่าฐาน") ยิงตอนเลิกการสลับของใบที่ไม่เคยแยกรายรายการด้วย
 *    ⇒ ช่วงของทั้งใบเปลี่ยนเงียบ ๆ หลังแก้ช่วงของรายการไปหนึ่งช่อง — จึงตัดสินจากโหมดที่บันทึกไว้
 */
export function switchPeriodMode(view, draft = EMPTY_DRAFT, next) {
  const current = draft || EMPTY_DRAFT;
  const saved = lineMode(view?.periodMode);
  const target = lineMode(next);
  const away = hasOwn(current, 'periodMode') && lineMode(current.periodMode) !== saved;
  if (target === saved) {
    if (!hasOwn(current, 'periodMode')) return current;
    if (away) return parkExcursion(current, saved);
    const rest = { ...current };
    delete rest.periodMode;
    return rest;
  }
  if (away) return current;
  return unparkExcursion(current, saved, target);
}

/** "ใช้ช่วงเดียวกันทุกรายการ…" — ใส่ช่วงเดียวกันให้ทุกรายการที่เป็นงานบริการ (เฉพาะโหมดแยกรายรายการ · ยังไม่บันทึก) */
export function applyPeriodToAllLines(view, draft = EMPTY_DRAFT, period) {
  const current = draft || EMPTY_DRAFT;
  if (periodModeOfDraft(view, current) !== SERVICE_PERIOD_MODE_LINE) return current;
  const value = { from: text(period?.from), to: text(period?.to) };
  const lines = { ...(current.lines || {}) };
  for (const line of mergedLines(view, current)) {
    if (line.role === SERVICE_KIND_PACKAGE) lines[line.lineId] = { ...(lines[line.lineId] || {}), period: { ...value } };
  }
  return { ...current, lines };
}

/** ปุ่ม "เหมือนรายการ n" — คัดลอกช่วงมาใส่รายการเดียว */
export function copyLinePeriod(draft = EMPTY_DRAFT, lineId, period) {
  return patchDraftLine(draft, lineId, { period: { from: text(period?.from), to: text(period?.to) } });
}

/* ══ ก้อนบันทึก ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * ร่าง → ก้อน PATCH (`{ expectedUpdatedAt, periodMode?, period?, lines? }`) · ไม่มีอะไรต่างจากฐาน = null
 * ⚠️ บรรทัด FG ไม่ส่ง `kind`/`serviceProductId` เด็ดขาด (server ตีกลับ `service_setup_kind_on_fg_line`)
 * ⭐ ช่วงบริการ (mig 0400):
 *   · `periodMode` ส่งเมื่อต่างจากที่บันทึกไว้เท่านั้น · **สลับโหมดอย่างเดียวก็เป็นก้อนบันทึก** (ใบที่ยังไม่มีงานบริการ = `{ expectedUpdatedAt, periodMode }`)
 *   · `period` (ช่วงของใบ) ส่งเฉพาะเมื่อโหมดหลังบันทึกเป็นทั้งใบ — โหมดแยกรายรายการ server ตีกลับ (`service_setup_period_derived`)
 *     🔴 ตอนสลับ แยกรายรายการ → ทั้งใบ ส่ง `period` **เสมอ** ตามที่เห็นบนจอ (ล้างสองช่อง = null ชัด ๆ) — ไม่ส่ง = RPC เก็บช่วงรวมของ
 *     รายการเดิมให้เอง ⇒ ช่องที่จอโชว์ว่าว่างกลับมามีช่วงหลังบันทึก (ตรวจทาน ui-line-to-whole-cleared-period)
 *   · `lines[].period` ส่งเฉพาะเมื่อโหมดหลังบันทึกเป็นแยกรายรายการ + บรรทัดเป็นงานบริการ + ต่างจากฐาน
 *     (`{ from, to }` ตามที่พิมพ์ · ว่างทั้งคู่ = null · ครึ่งเดียว/กลับหัวส่งตามที่พิมพ์ให้ server ตีกลับรายช่อง)
 *     บรรทัดที่มีแต่ `period` ส่งได้ทั้งบรรทัด FG และพิมพ์เอง — ไม่พ่วง `kind`/`serviceProductId`
 *   · 🔴 ตอนสลับ ทั้งใบ → แยกรายรายการ ส่งช่วงของ **ทุก** รายการงานบริการตามที่เห็นบนจอ (ว่าง = null ชัด ๆ) — RPC เติมช่วงของใบ
 *     ให้รายการที่ก้อนบันทึกไม่เอ่ยถึง ⇒ ไม่ส่ง = รายการที่จอโชว์ว่าว่าง (ล้างเอง · เพิ่งตอบ ‘ใช่’) ได้ช่วงของใบมาเองหลังบันทึก
 */
export function setupPayload(view, draft = EMPTY_DRAFT) {
  if (!view) return null;
  const out = { expectedUpdatedAt: view.updatedAt ?? null };
  const savedMode = lineMode(view.periodMode);
  const mode = periodModeOfDraft(view, draft);
  const byLine = mode === SERVICE_PERIOD_MODE_LINE;
  if (mode !== savedMode) out.periodMode = mode;
  if (!byLine) {
    const next = periodOrNull(wholePeriodOfDraft(view, draft));
    if (mode !== savedMode) out.period = next;
    else if (hasOwn(draft, 'period') && !samePeriodOrNull(next, view.period)) out.period = next;
  }
  const switchedToLine = byLine && savedMode !== SERVICE_PERIOD_MODE_LINE;
  const lines = [];
  for (const line of mergedLines(view, draft)) {
    const edit = draft?.lines?.[line.lineId] || null;
    const base = baseLineOf(view, line.lineId);
    const manual = line.manual;
    const entry = { lineId: line.lineId };
    if (manual && hasOwn(edit, 'kind') && (edit.kind ?? null) !== base.kind) entry.kind = edit.kind ?? null;
    if (manual && hasOwn(edit, 'serviceProductId') && (edit.serviceProductId || null) !== (base.serviceProductId || null)) {
      entry.serviceProductId = edit.serviceProductId || null;
    }
    if (hasOwn(edit, 'rounds')) {
      const rounds = intOrRaw(edit.rounds);
      if (rounds !== (base.rounds ?? null)) entry.rounds = rounds;
    }
    if (hasOwn(edit, 'zones')) {
      const zones = zonesForPayload(edit.zones);
      if (!sameZones(zones, base.zones)) entry.zones = zones;
    }
    if (byLine && line.role === SERVICE_KIND_PACKAGE && (switchedToLine || !samePeriodOrNull(line.period, base.period))) {
      entry.period = periodOrNull(line.period);
    }
    if (Object.keys(entry).length > 1) lines.push(entry);
  }
  if (lines.length) out.lines = lines;
  return hasOwn(out, 'periodMode') || hasOwn(out, 'period') || lines.length ? out : null;
}

/** มีอะไรที่ยังไม่บันทึกไหม — นิยามเดียวกับก้อนบันทึก (แถวโซนว่างอย่างเดียวไม่นับ) */
export const draftDirty = (view, draft) => setupPayload(view, draft) !== null;

/** ฐานเปลี่ยน (บันทึกแล้ว · โหลดใหม่หลังถูกแก้จากอีกหน้าต่าง) → ทิ้งคีย์ของร่างที่เท่าฐานใหม่แล้ว ที่เหลือคือที่ยังค้าง
 *  (คีย์โหมด/ช่วงที่ยังอยู่ในก้อนบันทึกคงไว้ · คีย์ช่วงของโหมดที่ไม่ได้ใช้อยู่ + ของที่พักไว้ `parked` ถูกทิ้ง — ฐานใหม่มาแล้ว
 *   ไม่ใช่การสลับไปมาบนฐานเดิม · ค่าตั้งต้นของสวิตช์ไม่เคยอยู่ในร่าง ⇒ คิดใหม่จากฐานใหม่เอง) */
export function rebaseDraft(view, draft = EMPTY_DRAFT) {
  if (!view || !draft) return EMPTY_DRAFT;
  const payload = setupPayload(view, draft);
  if (!payload) return EMPTY_DRAFT;
  const next = { lines: {} };
  if (hasOwn(payload, 'periodMode')) next.periodMode = draft.periodMode;
  if (hasOwn(payload, 'period') && hasOwn(draft, 'period')) next.period = draft.period;
  for (const entry of list(payload.lines)) {
    const edit = draft.lines?.[entry.lineId];
    if (!edit) continue;
    const kept = {};
    for (const key of ['kind', 'serviceProductId', 'rounds', 'zones', 'period']) {
      if (hasOwn(entry, key) && hasOwn(edit, key)) kept[key] = edit[key];
    }
    if (Object.keys(kept).length) next.lines[entry.lineId] = kept;
  }
  return next;
}

/** แก้บรรทัดเดียวในร่าง (ไม่แตะของเดิม) */
export function patchDraftLine(draft = EMPTY_DRAFT, lineId, patch = {}) {
  const current = draft?.lines?.[lineId] || {};
  return { ...draft, lines: { ...(draft?.lines || {}), [lineId]: { ...current, ...patch } } };
}

/* ══ บริบทบนจอ (ใช้ตัวรวม serviceSetupTotals / lineSetupTotals / lineQtyCrossCheck ของ serviceSetup.js) ════════ */

/** รูปบรรทัดแบบที่ตัวรวมของ serviceSetup.js อ่าน (`serviceKind` · `serviceRounds` · `metadata.categoryCode`) */
export const ctxLineOf = (line) => ({
  id: line.lineId,
  lineNo: line.lineNo,
  fgCode: line.fgCode ?? null,
  productId: line.productId ?? null,
  description: line.description ?? null,
  qty: line.qty ?? null,
  unit: line.unit ?? null,
  metadata: { categoryCode: line.categoryCode ?? null, note: line.note ?? null },
  serviceKind: line.kind ?? null,
  serviceProductId: line.serviceProductId ?? null,
  serviceFgCode: line.serviceFgCode ?? null,
  serviceRounds: positiveIntOrNull(line.rounds),
  /* ช่วงของรายการ (mig 0400) — ชื่อคอลัมน์เดียวกับฐาน ให้ตัวรวม/ตัวนับของ serviceSetup.js อ่านได้ (`linePeriodOf`) */
  servicePeriodFrom: text(line.period?.from) || null,
  servicePeriodTo: text(line.period?.to) || null,
});

/** `{ lines, allocations, zonesById, periodMode? }` จากบรรทัดที่จอวาด — ตัวเลขบนชิป/ท้ายตาราง/เส้นประใต้บรรทัดตามร่างทันที
 *  · `periodMode` (โหมดบนจอ) — ตัวรวมของ serviceSetup.js ถามโหมดจาก `ctx.periodMode` (จอไม่มี `ctx.order`) · ไม่ส่ง = ทั้งใบ */
export function localSetupCtx(merged = [], zonesById = new Map(), { periodMode = null } = {}) {
  return {
    ...(periodMode ? { periodMode: lineMode(periodMode) } : {}),
    lines: merged.map(ctxLineOf),
    allocations: merged.flatMap((line) => line.zones
      .filter((row) => row.zoneId)
      .map((row, index) => ({
        salesOrderLineId: line.lineId, zoneId: row.zoneId, packsPerRound: positiveIntOrNull(row.packsPerRound), sortOrder: index,
      }))),
    zonesById,
  };
}

/**
 * ป้ายสถานะของบรรทัด (ช่อง "รายการ" ของตารางงานบริการ) — นับเฉพาะของที่ยังว่าง (โครงสร้าง)
 * ความถูกต้องของแพ็คเกจ/โซน (ปิดใช้งาน · ของลูกค้าอื่น) เป็นข้อที่ยังขาดจาก server หลังกดยื่น
 * → `{ state: 'unset'|'missing'|'complete'|'none', count, label }`
 * · โหมดแยกรายรายการ (`periodMode: 'line'`): รายการงานบริการที่ยังไม่มีช่วงใช้ได้ = ขาดอีกหนึ่งข้อ (คู่กับข้อ `line_period_missing`)
 */
export function lineMissing(line, { periodMode = null } = {}) {
  if (!line) return { state: 'none', count: 0, label: null };
  if (line.role === SERVICE_ROLE_UNSET) return { state: 'unset', count: 1, label: 'ยังไม่ตอบ' };
  const zones = list(line.zones).filter((row) => row.zoneId);
  if (line.role === SERVICE_KIND_NOT_SERVICE) {
    return zones.length ? { state: 'missing', count: 1, label: 'ยังขาด 1 ข้อ' } : { state: 'none', count: 0, label: null };
  }
  let count = 0;
  if (periodMode === SERVICE_PERIOD_MODE_LINE && !validServicePeriod(line.period)) count += 1;
  if (line.manual && !(text(line.serviceProductId) && text(line.serviceFgCode))) count += 1;
  if (positiveIntOrNull(line.rounds) === null) count += 1;
  if (!zones.length) count += 1;
  count += zones.filter((row) => positiveIntOrNull(row.packsPerRound) === null).length;
  return count ? { state: 'missing', count, label: `ยังขาด ${fmtNumber(count)} ข้อ` } : { state: 'complete', count: 0, label: 'ตั้งครบ' };
}

/* ══ ช่องที่ขึ้นแดง / id ของช่อง ══════════════════════════════════════════════════════════════════════ */

/** id ของช่องในบรรทัดหนึ่ง — ตรงกับ `serviceSetupFieldId` ของ serviceSetup.js (ภาคผนวก §2.2 ของแผน) */
export const lineFieldId = (lineId, field) => `svc-line-${lineId}-${field}`;
export const zonePacksFieldId = (lineId, zoneId) => `svc-zone-${lineId}-${zoneId}-packs`;
export const PERIOD_FIELD_ID = 'svc-period';
/** ปุ่ม "บันทึกงานบริการ" — ข้อ "ยังไม่บันทึก" ของแผงแดงพามาที่นี่ (`serviceSetupFieldId` ของข้อ unsaved) */
export const SAVE_FIELD_ID = 'svc-save';

/** อีเวนต์ "พาไปที่ช่องนี้" (ปุ่ม "ไปแก้" ของแผงแดง) — กล่องที่ย่อแถวโซนไว้ฟังแล้วกางตัวเองก่อนโฟกัส
 *  (`revealServiceSetupField` ใน SalesOrderServiceLines.js ยิง · `detail.fieldId` = id ของช่อง) */
export const SERVICE_SETUP_REVEAL_EVENT = 'service-setup:reveal';

/** id ทุกช่องของบรรทัดนั้น (ใช้ถามว่า "แผงแดง/การกระโดดชี้เข้าบรรทัดนี้ไหม" แบบตรงตัว ไม่ใช่เดาจากคำนำหน้า) */
export function lineFieldIds(line) {
  const ids = ['kind', 'period', 'fg', 'zones', 'rounds'].map((field) => lineFieldId(line.lineId, field));
  for (const row of list(line.zones)) if (row.zoneId) ids.push(zonePacksFieldId(line.lineId, row.zoneId));
  return ids;
}

/**
 * ผลตีกลับ 400 ของการบันทึก (`fieldErrors:[{lineId, zoneId?, field, message}]`) → ช่องที่ขึ้นแดง
 * → `{ byField: Map fieldId → ข้อความ, byZone: Map "lineId:zoneId" → ข้อความ, general: string[] }`
 *   (field 'payload'/'line' ไม่มีช่อง ⇒ ขึ้นเป็นข้อความรวมที่แถบบันทึก)
 *   · 'period' ที่มี lineId = ช่วงของรายการ (`svc-line-<id>-period`) · ไม่มี lineId / 'periodMode' = แถบช่วงของใบ (`svc-period`)
 */
export function fieldErrorsView(fieldErrors = []) {
  const byField = new Map();
  const byZone = new Map();
  const general = [];
  const add = (map, key, message) => map.set(key, map.has(key) ? `${map.get(key)} · ${message}` : message);
  for (const item of list(fieldErrors)) {
    const message = text(item?.message);
    if (!message) continue;
    const { lineId, zoneId, field } = item;
    /* ⚠️ ช่วงของรายการ (มี lineId) ต้องถามก่อนช่วงของใบ — ไม่งั้นแดงของรายการไปขึ้นที่แถบช่วงของใบ (mig 0400) */
    if (field === 'period' && lineId) add(byField, lineFieldId(lineId, 'period'), message);
    else if (field === 'period' || field === 'periodMode') add(byField, PERIOD_FIELD_ID, message);
    else if (field === 'packs' && lineId && zoneId) add(byField, zonePacksFieldId(lineId, zoneId), message);
    else if (['kind', 'fg', 'rounds', 'zones'].includes(field) && lineId) {
      add(byField, lineFieldId(lineId, field), message);
      if (field === 'zones' && zoneId) add(byZone, `${lineId}:${zoneId}`, message);
    } else if (!general.includes(message)) general.push(message);
  }
  return { byField, byZone, general };
}

/* ══ ช่วงบริการ / ชิป ═════════════════════════════════════════════════════════════════════════════════ */

/** ข้อความช่วง "dd/mm/yyyy–dd/mm/yyyy" · ยังไม่ครบ = '—' */
export function periodLabel(period) {
  const from = text(period?.from);
  const to = text(period?.to);
  return from && to ? `${fmtDate(from)}–${fmtDate(to)}` : NA;
}

/** ความยาวช่วง (ชิดท้ายแถบช่วงบริการ "= 12 เดือน") — ยังไม่ครบ/กลับหัว = '' */
export const periodReadout = (period) => periodSpan(period).label;

/* ══ แผงแดงหลังกดยื่น (SubmitGateNotice) ══════════════════════════════════════════════════════════════ */

/** "รายการ 3: ยังไม่ใส่จำนวนรอบบริการ" → `{ head: 'รายการ 3', rest: ': ยังไม่ใส่จำนวนรอบบริการ' }` (หัวตัวหนาตามม็อก) */
export function issueHeadTail(message) {
  const value = String(message ?? '');
  const match = value.match(/^((?:รายการ|งวด) [^:]{1,80}?):\s/);
  return match ? { head: match[1], rest: value.slice(match[1].length) } : { head: '', rest: value };
}

/* ข้อที่รวมเป็นแถวเดียวได้เมื่อซ้ำหลายงวด — ข้อความรูปเดียวกันต่างแค่เลขงวด (12× "ยังไม่เลือกรอบวางบิล" = แถวเดียว) */
const MERGE_KEYS = new Set(['billing_missing', 'due_missing', 'coverage_missing']);
/* ข้อวันงวด — กลุ่มหลายงวดของสองข้อนี้ "ไปแก้" = โหมดตั้งวันงวด + แผง "เติมวันงวดที่ว่าง…" (#1846 · `entry.dateFill`) */
const DATE_FILL_KEYS = new Set(['billing_missing', 'due_missing']);
/* แผงเติมแตะงวดนี้แบบไหน (ธงรายงวดจากด่าน `dateFill`: 'empty' | 'dated' | null) — ไม่มีธง (ก้อน GET รุ่นก่อน) = ค่าตั้งต้นเติมได้
   · null = ไม่มีทางไหนแตะ (ต่างจาก "ไม่ส่ง") */
const dateFillModeOf = (entry) => (hasOwn(entry, 'dateFill') ? entry.dateFill : 'empty');
/* ธงรายงวดของด่านไม่ใช่คำขอเปิดแผง — แถวของแผงแดงมี `dateFill` เฉพาะแถวรวมที่ "ไปแก้" เปิดแผงเติมได้ (หน้าใบอ่านธงนี้) */
const withoutDateFill = (entry) => {
  if (!hasOwn(entry, 'dateFill')) return entry;
  const out = { ...entry };
  delete out.dateFill;
  return out;
};

/** [1,2,3,5,7,8] → "1–3, 5, 7–8" (เลขงวดเรียงน้อยไปมาก · ค่าที่ไม่ใช่ตัวเลขต่อท้ายตามที่มา) */
export function seqRangesText(seqs = []) {
  const nums = [...new Set(list(seqs).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < nums.length; i += 1) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1;
    parts.push(j > i ? `${nums[i]}–${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return parts.join(', ');
}

/* ข้อเดียวกันหลายงวด → แถวเดียว "งวด 1–12: … · 12 งวด" (ช่องอื่นยังแดงรายเซลล์จาก Map ของหน้า)
   · ข้อวันงวด (`dateFill`) — "ไปแก้" = หน้าใบขอแผงงวดเข้าโหมดตั้งวันงวดแล้วเปิดแผง "เติมวันงวดที่ว่าง…" (เปิดไม่ได้ = งวดแรก)
     'empty' = เปิดแบบค่าตั้งต้น · 'dated' = เปิดพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย"
     + ทางลัดเป็นตัวหนังสือ (`hinted` — ครั้งเดียวต่อแบบของแผง: สองกลุ่มที่เปิดแผงแบบเดียวกัน ต่อทั้งสองแถว = คำเดิมซ้ำ ·
       สองกลุ่มที่เปิดคนละแบบ = คำคนละคำ ต่างคนต่างได้)
   · ช่วงครอบ — "ไปแก้" = เซลล์ของงวดแรก */
function mergedItem(entries, { hinted = new Set(), deferrable = false } = {}) {
  const [first] = entries;
  const { rest } = issueHeadTail(first?.message);
  const seqs = entries.map((entry) => entry?.seq);
  /* ทุกงวดของกลุ่มต้องเป็นงวดที่แผงเติมแตะ ('empty' หรือ 'dated' จากด่าน) · มีงวดที่ไม่มีทางไหนแตะ (null) = ไปที่ช่องของงวดแรก
     และไม่บอกทางลัด (ทางลัดพูดว่า "ทีเดียวได้" — ต้องจริงทั้งกลุ่ม) · มี 'dated' แม้งวดเดียว = เปิดพร้อมสวิตช์จัดใหม่
     (จัดใหม่ครอบงวดที่ว่างด้วย — `installmentBillingRedatable` ⊇ `installmentBillingFillable`) และคำทางลัดบอกว่าวันเดิมถูกแทน */
  const modes = entries.map(dateFillModeOf);
  const offered = DATE_FILL_KEYS.has(first?.key) && modes.every((mode) => mode === 'empty' || mode === 'dated');
  const dateFill = offered ? (modes.includes('dated') ? 'dated' : 'empty') : null;
  const hint = dateFill && !hinted.has(dateFill)
    ? (dateFill === 'dated' ? SERVICE_SETUP_PANEL_TEXT.dateFillRedateHint : SERVICE_SETUP_PANEL_TEXT.dateFillHint)
    : '';
  if (hint) hinted.add(dateFill);
  const message = `${SERVICE_SETUP_PANEL_TEXT.mergedSeqs({ seqs: seqRangesText(seqs), rest, n: entries.length })}${hint}`;
  return {
    kind: 'issue',
    entry: { ...withoutDateFill(first), message, ...(dateFill ? { dateFill } : {}) },
    entries,
    tag: null,
    jump: true,
    deferrable,
  };
}

/**
 * ข้อที่ยังขาด + คำเตือน → กลุ่มของแผงแดง (รายการ/แท็บภาพรวม · งวดชำระ/แท็บการชำระ)
 * @returns `[{ key, title, count (ข้อที่บล็อก), warnCount, items: [{ kind:'issue'|'warning', entry, entries?, tag, jump }] }]`
 *   — กลุ่มว่างไม่ขึ้น
 *   · ของบัญชี (owner FN — ทั้งข้อที่บล็อกและคำเตือน) มีป้าย "รอฝ่ายบัญชี" และ **ไม่มี "ไปแก้"** (ฝ่ายขายแก้ไม่ได้)
 *   · ข้อเดียวกันหลายงวด (วันวางบิล · กำหนดชำระ · ช่วงครอบ) รวมเป็นแถวเดียว — `count` ยังนับทุกข้อ (ตรงกับป้ายบนแท็บ)
 *     🐞 เดิมแถวละงวด ⇒ ลูกค้าวางบิล 12 งวดได้ 12 แถวเหมือนกันทุกตัวอักษร จอ 375px ยาวหลายหน้าจอก่อนถึงตาราง
 *   · แถวรวมของข้อวันงวดมี `entry.dateFill` ('empty' | 'dated') — หน้าใบอ่านธงนี้ตอน "ไปแก้" (โหมดตั้งวันงวด + แผงเติม · #1846 ·
 *     'dated' = พร้อม "จัดใหม่งวดที่มีวันแล้วด้วย") · แถวเดี่ยวไม่มีธงนี้ (ธงรายงวดของด่านถูกถอด — แถวเดี่ยวไปที่เซลล์ของงวดนั้น)
 *   · `item.deferrable` (mig 0404) = แถวนี้ติดป้าย 'ข้ามได้' — ผู้เรียกส่งตัวถาม `deferrable(entry)` (ข้อ **ตัวเดิมของ `issues`**) มาเอง
 *     ไม่ส่ง = false ทุกแถว (แผงเดิมทุกตัวอักษร) · ของบัญชี (owner FN) และคำเตือนไม่มีทางเป็น true · แถวรวม: ทุกข้อรหัสเดียวกัน ⇒ ข้อแรกตัดสิน
 */
export function submitGateGroups(issues = [], warnings = [], { deferrable = null } = {}) {
  const canDefer = (entry) => (typeof deferrable === 'function' && entry?.owner !== 'FN' ? !!deferrable(entry) : false);
  const groups = [
    { key: 'overview', title: SERVICE_SETUP_PANEL_TEXT.groups.overview, count: 0, warnCount: 0, items: [] },
    { key: 'payment', title: SERVICE_SETUP_PANEL_TEXT.groups.payment, count: 0, warnCount: 0, items: [] },
  ];
  const groupOf = (entry) => (entry?.tab === 'payment' ? groups[1] : groups[0]);
  const sameKey = new Map();
  for (const entry of list(issues)) {
    if (entry?.tab !== 'payment' || !MERGE_KEYS.has(entry?.key) || entry?.owner === 'FN') continue;
    const mergeKey = `${entry.key}\u0000${entry.billingMode || ''}`;
    sameKey.set(mergeKey, [...(sameKey.get(mergeKey) || []), entry]);
  }
  const placed = new Set();
  const hinted = new Set();
  for (const entry of list(issues)) {
    const group = groupOf(entry);
    group.count += 1;
    const mergeKey = `${entry?.key}\u0000${entry?.billingMode || ''}`;
    const bucket = entry?.tab === 'payment' && entry?.owner !== 'FN' ? sameKey.get(mergeKey) : null;
    if (bucket && bucket.length > 1) {
      if (placed.has(mergeKey)) continue;
      placed.add(mergeKey);
      group.items.push(mergedItem(bucket, { hinted, deferrable: canDefer(bucket[0]) }));
      continue;
    }
    const fn = entry?.owner === 'FN';
    group.items.push({
      kind: 'issue', entry: withoutDateFill(entry), tag: fn ? (entry.tag || SERVICE_SETUP_PANEL_TEXT.fnTag) : null, jump: !fn,
      deferrable: canDefer(entry),
    });
  }
  for (const entry of list(warnings)) {
    const fn = entry?.owner === 'FN';
    const group = groupOf(entry);
    group.warnCount += 1;
    group.items.push({
      kind: 'warning', entry, tag: fn ? (entry.tag || SERVICE_SETUP_PANEL_TEXT.fnTag) : SERVICE_SETUP_PANEL_TEXT.warningTag, jump: !fn,
      deferrable: false,
    });
  }
  return groups.filter((group) => group.items.length);
}

/* ══ ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404 · มติเจ้าของ 01/10) — ตัวช่วยของจอ ═════════════════════════════════════
   ⭐ ตัวตัดสินทุกตัวอยู่ที่ serviceSetup.js (`view.skip` · `view.deferred` ของก้อน GET) — ที่นี่แค่เลือกว่าจอวาดแบบไหน ไม่คิดข้อเอง */

/**
 * แถวของแผงแดงติดป้าย 'ข้ามได้' เมื่อไร (`view.skip` ของก้อน GET)
 *   · ข้ามได้ (`canSkip`) — บรรทัดท้ายแผงอ้าง "ข้อที่ติดป้าย ‘ข้ามได้’" ⇒ ต้องมีป้ายให้ชี้
 *   · ติดเพราะยังเหลือข้อที่ข้ามไม่ได้ — แผงต้องแยกให้เห็นว่าข้อไหนเลื่อนได้ ข้อไหนต้องแก้ก่อน
 *   · 🔴 ใบ Rev. ที่ใบเดิมยังเดินรอบบริการ (D-F18) = ข้ามไม่ได้ทั้งใบ ⇒ **ไม่มีป้าย** (ป้ายจะขัดกับบรรทัดท้ายแผง "ข้ามการตั้งงานบริการไม่ได้")
 * ⚠️ ก้อน `skip` ไม่มีช่องบอกชนิดของเหตุ ⇒ แยกสองกรณีด้วยบรรทัดท้ายแผงที่ server เลือก (ตัวสร้างข้อความตัวเดียวกันจากแคตตาล็อก)
 */
export function skipTagsShown(skip) {
  if (!skip?.visible) return false;
  if (skip.canSkip) return true;
  return skip.lead === SERVICE_DEFER_TEXT.panelBlocked(skip.deferredCount, skip.blockingCount);
}

/**
 * ประกาศบนใบ **รออนุมัติ** ที่ผู้ยื่นเลือกข้ามการตั้งงานบริการ (`view.deferred` · stage 'pending') — ทุกคนที่เปิดใบเห็น
 * → `{ tone, title, tag, lines }` หรือ null (ไม่มีตราการข้าม · ไม่ใช่ขั้นรออนุมัติ — หลังอนุมัติเป็นหน้าที่ของแบนเนอร์/การ์ดราง)
 * สี่แบบจาก `active` (การอนุมัติตอนนี้จะไม่เปิดงานให้ TS) × `blocking` (ข้อที่หยุดการอนุมัติตอนนี้) — ไม่สัญญาการอนุมัติที่ด่านจะปฏิเสธ:
 *   ยังข้ามอยู่ + ไม่มีข้อค้าง   เตือน + ป้าย · บอกผลของการอนุมัติ + ทางให้ตั้งก่อน (ดึงกลับ/ตีกลับ)
 *   ยังข้ามอยู่ + มีข้อที่ข้ามไม่ได้ เตือน + ป้าย · บอกว่าอนุมัติไม่ได้จนกว่าจะตีกลับ
 *   ไม่ข้ามแล้ว + ไม่มีข้อค้าง   ข้อมูล · งานบริการครบแล้ว อนุมัติแล้วส่ง TS ตามปกติ
 *   ไม่ข้ามแล้ว + มีข้อค้าง      เตือน · ข้ามไม่ได้แล้วและยังขาด — อนุมัติไม่ได้
 * 🔴 ไม่มีแบบไหนเป็นสีแดง (ยังไม่มีใครกดอะไร — กฎ 3)
 */
export function deferNoticeOfView(view) {
  const deferred = view?.deferred || null;
  if (!deferred || deferred.stage !== 'pending') return null;
  const blocking = Number(deferred.blocking) || 0;
  const title = SERVICE_DEFERRED_TEXT.pendingTitle;
  if (deferred.active) {
    return {
      tone: 'warning',
      title,
      tag: SERVICE_DEFERRED_TEXT.badge,
      lines: [
        SERVICE_DEFERRED_TEXT.pendingLine(deferred, Number(deferred.missing) || 0),
        blocking > 0 ? SERVICE_DEFERRED_TEXT.pendingBlocked(blocking) : SERVICE_DEFERRED_TEXT.pendingHow,
      ],
    };
  }
  if (blocking > 0) return { tone: 'warning', title, tag: null, lines: [SERVICE_DEFERRED_TEXT.pendingStuck(deferred, blocking)] };
  return { tone: 'info', title, tag: null, lines: [SERVICE_DEFERRED_TEXT.pendingComplete(deferred)] };
}

/* ══ การ์ดราง / แบนเนอร์ของงานบริการย้อนหลัง ══════════════════════════════════════════════════════════════ */

/** สถานะการตั้งย้อนหลังจากก้อน GET — ตัวเดียวกับ `serviceBackfillState` (ป้ายจาก SERVICE_BACKFILL_STATE_LABELS)
 *  ⭐ ขั้น 'backfill' ของก้อน GET = อนุมัติแล้ว ยังไม่ถูก Rev. ทับ ยังไม่ประทับ ⇒ 'submitted' ตรงนี้คือรอผู้จัดการตรวจจริง (D28) */
export function backfillStateOfView(view) {
  if (!view || view.flow !== 'backfill') return null;
  const state = view.state?.setupState ?? null;
  if (state === 'submitted') return 'submitted';
  if (state === 'rejected') return 'rejected';
  /* สลับเป็นแยกรายรายการแล้วบันทึก = เริ่มตั้งแล้ว (ช่วงของใบว่างจนกว่ารายการจะมีช่วงครบ — ดูจากช่วงของใบอย่างเดียวไม่พอ) */
  const started = !!view.period || view.periodMode === SERVICE_PERIOD_MODE_LINE || list(view.allocations).length > 0
    || list(view.lines).some((line) => line?.kind || line?.serviceProductId);
  return started ? 'editing' : 'not_started';
}

/** การ์ดราง "งานบริการ (ใบเดิม)" อยู่ **บนสุดของรางขวา** (เหนือการ์ดยอดสุทธิ/จัดการเอกสาร) ระหว่างที่ยังต้องตั้ง/ยื่น — มติเจ้าของ 29/09
 *  ⇒ ปุ่ม "ยื่นตรวจงานบริการ" อยู่ในกรอบรางขวาที่ปักหมุดที่ 1440 (รางสูงไม่เกินจอ · ไม่ต้องเลื่อนในราง) · ยื่นตรวจแล้ว (รอผู้จัดการตรวจ) = กลับใต้การ์ดจัดการเอกสาร
 *  · ขั้นอื่น (pipeline · ประทับแล้ว · ก้อน GET ยังไม่มา) = false (การ์ดไม่ขึ้นอยู่แล้ว) */
export function backfillRailOnTop(view) {
  const state = backfillStateOfView(view);
  return !!state && state !== 'submitted';
}

/** แถวตรวจของการ์ดรางแดงเมื่อไร — กด "ยื่นตรวจงานบริการ" แล้วไม่ผ่าน **ด่านของ server** (ก้อน GET สด · 400 ของการยื่น) เท่านั้น
 *  ⚠️ ด่าน "ยังไม่บันทึก" ของจอ (`source: 'client'`) ไม่นับ — แถวคิดจากของที่บันทึกแล้ว ⇒ แดงจากของเก่าที่คนแก้ไปแล้ว
 *    ("รายการ 1: ยังไม่เลือกชนิด" ทั้งที่ร่างเลือกแล้ว · UAT 29/09 ข้อ 1) · ไม่บอกที่มา = ไม่แดง (กฎ 3 ปลอดภัยไว้ก่อน) */
export function backfillRailPressed(submitIssues) {
  return submitIssues?.flow === 'backfill' && submitIssues?.source === 'server';
}

/** บันทึกงานบริการสำเร็จ → แผงแดงที่มีแต่ข้อ "ยังไม่บันทึก" หมดความหมาย = null · แผงอื่นคืน **ตัวเดิม** (ภาพ ณ ตอนกด · r2 S9)
 *  ⚠️ ตัวเดิมเท่านั้น — Map ช่องแดงของหน้า memo ตามตัวตนของแผง ตัวใหม่ = ตารางลืมว่าแก้ช่องไหนไปแล้ว */
export function submitIssuesAfterSave(submitIssues) {
  const issues = list(submitIssues?.issues);
  if (issues.length && issues.every((issue) => issue?.key === 'unsaved')) return null;
  return submitIssues ?? null;
}

/* ข้อของแถวตรวจแต่ละแถว → คำสั้นของบรรทัดรอง (ข้อความเต็มพกคำอธิบายบรรทัด ยาวจนดันคอลัมน์ป้ายหดเหลือคำละบรรทัด ·
   ข้อความเต็มอยู่ที่แผงแดงหลังกดยื่นแล้ว) */
const BANNER_UNCHANGED = 'ยอด/Actual/เอกสารไม่เปลี่ยน';

/** บรรทัดของแถบบนสุด "ใบนี้อนุมัติก่อนมีการตั้งงานบริการ" ตามสถานะ — ยื่นตรวจแล้ว = บอกว่ารอผู้จัดการ (ไม่สั่งให้ตั้งแล้วยื่นซ้ำ)
 *  ⭐ ข้อความรอตรวจตัวเดียวกับที่ล็อกการแก้บอก (`SERVICE_SETUP_EDIT_TEXT.backfillSubmitted`) */
export function backfillBannerText(view) {
  if (backfillStateOfView(view) === 'submitted') {
    const state = view?.state || {};
    const when = state.submittedAt ? ` · ยื่นเมื่อ ${fmtDate(state.submittedAt)}` : '';
    const who = state.submittedByName ? ` โดย ${state.submittedByName}` : '';
    return `${SERVICE_SETUP_EDIT_TEXT.backfillSubmitted}${when}${who} · ${BANNER_UNCHANGED}`;
  }
  /* เปิดแก้หลังอนุมัติ (mig 0396 · ภาคผนวก A.4) — ใคร/เมื่อไร/ทำไม + ช่องที่แก้ได้ของใบนี้ (`view.reopened.fields` ตามชนิดบรรทัด R20) */
  if (view?.reopened) return SERVICE_REOPENED_TEXT.bannerLine(view.reopened);
  /* ข้ามการตั้งงานบริการตอนยื่น (mig 0404) — ใคร/เมื่อไร + สิ่งที่ต้องตั้ง · server ไม่ส่ง `reopened` กับ `deferred` พร้อมกัน (เหตุการณ์ที่เกิดทีหลังชนะ) */
  if (view?.deferred?.stage === 'approved') return SERVICE_DEFERRED_TEXT.bannerLine(view.deferred);
  /* มติ 30/09: ลำดับเดียวกับการ์ดงานบริการ (แพ็คเกจ → ไซต์ · โซน → จำนวนรอบบริการ → รอบละกี่แพ็ค) · คำจากแคตตาล็อก `SERVICE_SETUP_LINE_TEXT` */
  return `ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · ${SERVICE_SETUP_LINE_TEXT.roundsLabel} · ${SERVICE_SETUP_LINE_TEXT.packsLabel} · ช่วงบริการ)`
    + ` แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ${BANNER_UNCHANGED}`;
}

/* หัว/ป้ายของแบนเนอร์และการ์ดรางงานบริการย้อนหลัง — "ใบเดิม" (อนุมัติก่อนมีการตั้งงานบริการ) · "แก้หลังอนุมัติ" (mig 0396)
   · "ข้ามตอนยื่น" (mig 0404 — ผู้ยื่นกด 'ยื่นโดยยังไม่ตั้งงานบริการ' แล้วใบอนุมัติไปโดยยังไม่ตั้ง)
   ⭐ ตัวตัดสินคือ `view.reopened` / `view.deferred` ของก้อน GET (`serviceSetupReopened` · `serviceSetupDeferred` — มีค่าเฉพาะตอนใบอยู่ในเส้นตั้งย้อนหลัง
     และไม่ตอบพร้อมกัน) · ขั้น (`flow`) ยัง 'backfill' · ไม่มีทั้งสอง = ใบเดิม (คำเดิมทุกตัวอักษร)
   ⚠️ คำของใบที่เปิดแก้มาจาก `SERVICE_REOPENED_TEXT` · ของใบที่ข้ามมาจาก `SERVICE_DEFERRED_TEXT` ที่เดียว · ขั้นแรกของรางของใบที่เปิดแก้ชื่อ "เปิดแก้"
     (ม็อก ReopenEditing) — ใบที่ข้ามยังเป็น "ตั้งค่า" (ใบไม่เคยตั้ง) และป้ายขั้นเป็นของใบเดิม (`SERVICE_BACKFILL_STATE_LABELS` — จริงกับใบนี้) */
const LEGACY_BACKFILL_COPY = Object.freeze({
  bannerTitle: 'ใบนี้อนุมัติก่อนมีการตั้งงานบริการ',
  eyebrow: 'Service setup · ใบเดิม',
  title: 'งานบริการ (ใบเดิม)',
  meta: 'ตั้งย้อนหลังบนใบที่อนุมัติแล้ว — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS',
  firstStep: 'ตั้งค่า',
});

/**
 * → `{ reopened, deferred, bannerTitle, bannerLead, eyebrow, title, meta, firstStep, stateLabel, reopenLine }`
 *   · `bannerLead` = บรรทัด "เปิดแก้ … โดย … · เหตุผล" / "ข้ามการตั้งงานบริการตอนยื่น … โดย …" เหนือบรรทัดรอตรวจ
 *     (ขั้นรอตรวจ — บรรทัดหลักเป็นของการยื่นแล้ว · ม็อก ReopenReview)
 *   · `reopenLine` = บรรทัดเดียวกันบนการ์ดราง (ทุกขั้น — ช่อง "ใคร · เมื่อไร" ของการ์ด) · ใบเดิม = null ทั้งสอง
 *   · `deferred` = ก้อน `view.deferred` ของใบที่อนุมัติโดยข้ามการตั้งงานบริการ (stage 'approved') · ใบอื่น = null
 */
export function backfillCopyOfView(view) {
  const state = backfillStateOfView(view);
  const reopened = view?.reopened || null;
  /* ใบรออนุมัติ (stage 'pending') มีประกาศของตัวเอง (`deferNoticeOfView`) — ที่นี่เฉพาะหลังอนุมัติ */
  const deferred = !reopened && view?.deferred?.stage === 'approved' ? view.deferred : null;
  if (deferred) {
    const deferLine = SERVICE_DEFERRED_TEXT.railLine(deferred);
    return {
      reopened: null,
      deferred,
      bannerTitle: SERVICE_DEFERRED_TEXT.bannerTitle,
      bannerLead: state === 'submitted' ? deferLine : null,
      eyebrow: SERVICE_DEFERRED_TEXT.railEyebrow,
      title: SERVICE_DEFERRED_TEXT.railTitle,
      meta: SERVICE_DEFERRED_TEXT.railMeta,
      firstStep: LEGACY_BACKFILL_COPY.firstStep,
      stateLabel: state ? SERVICE_BACKFILL_STATE_LABELS[state] : null,
      reopenLine: deferLine,
    };
  }
  if (!reopened) {
    return {
      ...LEGACY_BACKFILL_COPY, reopened: null, deferred: null, bannerLead: null, reopenLine: null,
      stateLabel: state ? SERVICE_BACKFILL_STATE_LABELS[state] : null,
    };
  }
  const reopenLine = SERVICE_REOPENED_TEXT.railLine(reopened);
  return {
    reopened,
    deferred: null,
    bannerTitle: SERVICE_REOPENED_TEXT.bannerTitle,
    bannerLead: state === 'submitted' ? reopenLine : null,
    eyebrow: SERVICE_REOPENED_TEXT.railEyebrow,
    title: SERVICE_REOPENED_TEXT.railTitle,
    meta: SERVICE_REOPENED_TEXT.railMeta,
    firstStep: 'เปิดแก้',
    /* ขั้นแก้พูด "กำลังแก้" (ใบนี้เคยตั้งครบแล้ว) · คำเดียวกับป้ายโซน/ชิปด่านนัดของ TS (`SERVICE_REOPENED_TEXT.stateLabel`) */
    stateLabel: state ? SERVICE_REOPENED_TEXT.stateLabel(state) : null,
    reopenLine,
  };
}

/** บรรทัดรองบนหัวการ์ด "รายการสินค้าและบริการ" ของใบสาย SERVICE — ที่มาของราคา (งานบริการอยู่การ์ดของตัวเองแล้ว · 01/10) */
export function linesCardMeta({ order, lineCount } = {}) {
  const n = `${fmtNumber(lineCount || 0)} รายการ`;
  const source = order?.quotationId ? `ราคา/จำนวนจาก ${order?.quotation?.quoteNumber || 'QT ต้นทาง'} แก้ไม่ได้` : 'คีย์จากเอกสารเดิม';
  return `${n} · ${source}`;
}

/** บรรทัดรองบนหัวการ์ด "งานบริการ" — ขั้นของงานบริการ (ม็อก BindGridEdit / BindGridMulti) */
export function serviceCardMeta({ view, flow, editable, totals } = {}) {
  const ask = 'ทุกรายการต้องตอบว่าเป็นงานบริการไหม · ถ้าใช่ เลือกแพ็คเกจ → ไซต์ · โซน → จำนวนรอบบริการ → รอบละกี่แพ็ค';
  if (flow === 'stamped') {
    const opened = view?.state?.termsOpenedAt;
    return `อนุมัติแล้ว · เปิด ${fmtNumber(totals?.zones || 0)} โซนให้ TS${opened ? ` เมื่อ ${fmtDateTime(opened)}` : ''}`;
  }
  if (editable && flow === 'pipeline') return `${ask} · แก้ได้จนกว่าจะยื่นอนุมัติ`;
  /* เปิดแก้หลังอนุมัติ (mig 0396 · ภาคผนวก A.4) — บอกว่าเป็นการแก้ใบที่ส่ง TS ไปแล้ว ไม่ใช่ใบเดิมที่ยังไม่เคยตั้ง */
  /* ข้ามการตั้งงานบริการตอนยื่น (mig 0404) — บอกว่าใบนี้อนุมัติมาโดยยังไม่ตั้ง ไม่ใช่ใบเก่าที่อนุมัติก่อนมีการตั้งงานบริการ */
  const deferred = view?.deferred?.stage === 'approved';
  if (editable && flow === 'backfill') {
    return `${ask} · ${view?.reopened ? SERVICE_REOPENED_TEXT.cardMeta : deferred ? SERVICE_DEFERRED_TEXT.cardMeta : 'แก้ได้จนกว่าจะยื่นตรวจ'}`;
  }
  /* ม็อก BackfillApproveModal: ใบเดิมที่ยื่นตรวจแล้วบอกวันยื่นบนหัวการ์ด · ใบที่เปิดแก้บอกว่าเป็นรอบแก้ (ม็อก ReopenReview) · ใบที่ข้าม = "ข้ามตอนยื่น" */
  if (flow === 'backfill' && view?.state?.setupState === 'submitted' && view?.state?.submittedAt) {
    return `${view?.reopened ? 'เปิดแก้หลังอนุมัติ' : deferred ? SERVICE_DEFERRED_TEXT.cardMetaSubmitted : 'ตั้งย้อนหลัง'} · ยื่นตรวจ ${fmtDate(view.state.submittedAt)}`;
  }
  return null;
}

const LINE_SHORT = Object.freeze({
  kind_missing: 'ยังไม่ตอบ ‘งานบริการ?’', fg_missing: 'ยังไม่เลือกแพ็คเกจ', fg_invalid: 'แพ็คเกจใช้ไม่ได้แล้ว',
  fg_foreign: 'แพ็คเกจของนิติบุคคลอื่น', rounds_missing: SERVICE_SETUP_LINE_TEXT.noRounds,
});
const ZONE_SHORT = Object.freeze({
  zones_missing: 'ยังไม่เลือกโซน', packs_missing: SERVICE_SETUP_LINE_TEXT.noPacks, zone_invalid: 'โซนใช้ไม่ได้', zones_on_not_service: 'มีโซนค้าง',
});
const LINE_KEYS = new Set(Object.keys(LINE_SHORT));
const ZONE_KEYS = new Set(Object.keys(ZONE_SHORT));
/* แถว "ช่วงครอบ" นับเฉพาะเรื่องช่วงครอบ · วันวางบิล/กำหนดชำระ/ยังไม่มีงวด เป็นแถวของตัวเอง (ม็อก BackfillApprovedSo มีแถววันวางบิล) */
const COVER_KEYS = new Set(['coverage_missing', 'coverage_start', 'coverage_gap', 'coverage_end']);
const BILL_KEYS = new Set(['installments_missing', 'due_missing', 'billing_missing']);

/**
 * แถวตรวจของการ์ด "งานบริการ (ใบเดิม)" — มาจากข้อที่ยังขาดของ server (สิ่งที่บันทึกแล้ว)
 * → `[{ key, label, value, sub, ok }]` · ⚠️ ก่อนกดยื่นจอวาดเป็นกลาง (ไม่แดง) — `ok` ใช้หลังกดเท่านั้น
 * 🔴 บรรทัดที่ยังไม่เลือกชนิดอาจเป็นแพ็คเกจ ⇒ ระหว่างที่ยังมี แถวโซน/ช่วงบริการ/งวด **ห้ามบอกว่าครบหรือไม่ต้องใส่**
 *   (server ไม่ตรวจโซน/ช่วง/งวดของบรรทัดที่ยังไม่รู้ชนิด — ไม่มีข้อ ≠ ครบ)
 */
export function backfillRailChecks(view) {
  if (!view) return [];
  const issues = list(view.issues);
  const lines = list(view.lines);
  const unset = Number(view.totals?.unsetLines || 0);
  const packageLines = Number(view.totals?.packageLines || 0);
  const linesWith = (keys) => new Set(issues.filter((issue) => keys.has(issue?.key)).map((issue) => issue.lineId));
  /* "รายการ 3: ยังไม่ใส่จำนวนรอบบริการ · อีก 2 รายการ" — ข้อแรกของแถว + จำนวนบรรทัดที่เหลือ */
  const shortSub = (keys, labels, badCount) => {
    const first = issues.find((issue) => keys.has(issue?.key));
    if (!first) return null;
    const lineNo = first.lineNo ?? lines.find((line) => line?.lineId === first.lineId)?.lineNo ?? null;
    const head = lineNo !== null ? `รายการ ${lineNo}: ` : '';
    return `${head}${labels[first.key]}${badCount > 1 ? ` · อีก ${fmtNumber(badCount - 1)} รายการ` : ''}`;
  };
  const moneyRow = (key, label, keys) => {
    const found = issues.filter((issue) => keys.has(issue?.key));
    if (found.length) return { key, label, value: `ยังขาด ${fmtNumber(found.length)} ข้อ`, sub: 'เติมที่แท็บการชำระ', ok: false };
    if (unset) return { key, label, value: 'รอตอบ ‘งานบริการ?’', sub: null, ok: false };
    if (!packageLines) return { key, label, value: NA, sub: 'ไม่มีแพ็คเกจ — ไม่ต้องใส่', ok: true };
    return { key, label, value: 'ครบ', sub: null, ok: true };
  };

  const lineBad = linesWith(LINE_KEYS);
  const zoneBad = linesWith(ZONE_KEYS);
  const zoneLines = lines.filter((line) => line?.role !== SERVICE_KIND_NOT_SERVICE || zoneBad.has(line?.lineId));
  const zoneDone = zoneLines.filter((line) => line.role === SERVICE_KIND_PACKAGE && !zoneBad.has(line.lineId)).length;
  const periodMissing = issues.some((issue) => issue?.key === 'period_missing');
  const mayNeedPeriod = packageLines + unset > 0;
  /* แถว "ช่วงบริการ" — โหมดทั้งใบ = แถวเดิมทุกตัวอักษร · แยกรายรายการ (mig 0400 · ม็อก "สิ่งที่ตรวจตอนยื่น"):
     ป้าย "ช่วงบริการ · แยกรายรายการ" / ค่า "4/5 รายการ" / บรรทัดรอง "รายการ 3 ยังไม่ใส่ · อีก n รายการ · ช่วงรวม …"
     ⚠️ ช่วงรวมคิดจากช่วงของรายการที่บันทึกแล้ว (`view.lines[].period`) — `view.period` ว่างจนกว่ารายการจะมีช่วงครบ */
  const periodRow = () => {
    if (view.periodMode !== SERVICE_PERIOD_MODE_LINE) {
      return {
        key: 'period', label: 'ช่วงบริการ',
        value: view.period ? periodLabel(view.period) : (mayNeedPeriod ? 'ยังไม่ใส่' : NA),
        /* ยังไม่ใส่ + รอเลือกชนิด + server ไม่ขึ้นข้อช่วงบริการ (ยังไม่มีแพ็คเกจที่บันทึกแล้ว) = บอกเหตุแบบแถวโซน (UAT 29/09 ข้อ 2)
           · มีข้อ period_missing แล้ว = แผงแดงบอกเอง ไม่พูดว่า "ถ้ามีแพ็คเกจ" ทั้งที่มีแล้ว */
        sub: view.period ? periodReadout(view.period) || null
          : !mayNeedPeriod ? 'ไม่มีแพ็คเกจ — ไม่ต้องใส่'
            : unset && !periodMissing ? SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind(fmtNumber(unset)) : null,
        ok: !periodMissing && (!!view.period || !unset),
      };
    }
    const total = Number(view.linePeriods?.total || 0);
    const filled = Number(view.linePeriods?.filled || 0);
    const label = SERVICE_PERIOD_TEXT.railLabelLine;
    /* ยังไม่มีรายการงานบริการที่บันทึกแล้ว = คำเดิมของแถวทั้งใบ (รอตอบ ‘งานบริการ?’ / ไม่มีแพ็คเกจ) */
    if (!total) {
      return {
        key: 'period', label,
        value: mayNeedPeriod ? 'ยังไม่ใส่' : NA,
        sub: !mayNeedPeriod ? 'ไม่มีแพ็คเกจ — ไม่ต้องใส่'
          : unset && !periodMissing ? SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind(fmtNumber(unset)) : null,
        ok: !periodMissing && !unset,
      };
    }
    const missing = issues.filter((issue) => issue?.key === 'line_period_missing');
    const first = missing[0] || null;
    const firstNo = first ? (first.lineNo ?? lines.find((line) => line?.lineId === first.lineId)?.lineNo ?? null) : null;
    const envelope = periodEnvelope(lines.map((line) => line?.period));
    /* รายการที่ยังไม่ตอบ ‘งานบริการ?’ อาจเป็นงานบริการ (ต้องมีช่วงของตัวเอง) ⇒ แถวยังไม่ผ่าน แม้ตัวนับอ่านว่าครบ ("2/2 รายการ")
       — ต้องบอกเหตุในบรรทัดรอง (คำเดียวกับแถวทั้งใบ) ไม่งั้นหลังกดยื่นแถวแดงโดยไม่มีอะไรบอกว่าทำไม (ตรวจทาน ui-rail-period-row-red-no-reason)
       · มีข้อช่วงของรายการ/ช่วงของใบอยู่แล้ว = ข้อนั้นบอกเหตุเอง ไม่ซ้อนคำ */
    const waitKind = unset && !missing.length && !periodMissing ? SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind(fmtNumber(unset)) : '';
    const sub = [
      firstNo !== null ? SERVICE_PERIOD_TEXT.railMissing(firstNo) : '',
      missing.length > 1 ? SERVICE_PERIOD_TEXT.railMore(missing.length - 1) : '',
      waitKind,
      envelope ? SERVICE_PERIOD_TEXT.railEnvelope(periodLabel(envelope)) : '',
    ].filter(Boolean).join(' · ') || null;
    return {
      key: 'period', label, value: SERVICE_PERIOD_TEXT.railCount(filled, total), sub,
      ok: !periodMissing && !missing.length && !unset,
    };
  };

  return [
    {
      key: 'lines', label: `งานบริการ? · แพ็คเกจ · ${SERVICE_SETUP_LINE_TEXT.roundsLabel}`,
      value: `${fmtNumber(lines.length - lineBad.size)}/${fmtNumber(lines.length)} รายการ`,
      sub: shortSub(LINE_KEYS, LINE_SHORT, lineBad.size), ok: lineBad.size === 0,
    },
    {
      key: 'zones', label: `ไซต์ · โซน · ${SERVICE_SETUP_LINE_TEXT.packsLabel}`,
      value: zoneLines.length ? `${fmtNumber(zoneDone)}/${fmtNumber(zoneLines.length)} รายการ` : 'ไม่มีแพ็คเกจ',
      sub: unset ? SERVICE_BACKFILL_RAIL_TEXT.waitKind(fmtNumber(unset)) : shortSub(ZONE_KEYS, ZONE_SHORT, zoneBad.size),
      ok: zoneBad.size === 0 && !unset,
    },
    periodRow(),
    moneyRow('installments', 'ช่วงครอบของงวดที่ยังไม่รับรอง', COVER_KEYS),
    moneyRow('billing', 'วันวางบิล · กำหนดชำระ', BILL_KEYS),
  ];
}

/** แถบผู้อนุมัติ: "งานบริการ: 6 โซน · 5 ไซต์ · …" → `{ label, parts }` (แยกไม่ได้ = ทั้งก้อนเป็นส่วนเดียว) */
export function stripParts(stripText) {
  const value = String(stripText ?? '');
  const colon = value.indexOf(': ');
  if (colon < 0 || colon > 20) return { label: '', parts: value ? [value] : [] };
  return { label: value.slice(0, colon + 1), parts: value.slice(colon + 2).split(' · ').filter(Boolean) };
}

/* ══ ทางเพิ่มไซต์ (D19) ═══════════════════════════════════════════════════════════════════════════════ */

/** ลิงก์เปิดคำร้องประเมินพื้นที่ — ฟอร์มคำร้องอ่าน `kind · dealId · salesOrderId · returnTo` (requests/new/page.js) */
export function surveyRequestHref({ dealId = null, orderId = null } = {}) {
  const params = new URLSearchParams({ kind: 'site_survey' });
  if (dealId) params.set('dealId', String(dealId));
  if (orderId) params.set('salesOrderId', String(orderId));
  if (orderId) params.set('returnTo', `/sa/sales-orders/${orderId}`);
  return `/requests/new?${params.toString()}`;
}
