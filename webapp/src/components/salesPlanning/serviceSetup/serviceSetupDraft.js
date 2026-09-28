// ── ร่างการแก้งานบริการบนจอ (ตารางรายการของใบสั่งขาย · mig 0391 · PR-A) — ตรรกะล้วน ไม่มี JSX ──────────────
//
// ⭐ **จอถือแค่ "สิ่งที่แก้"** — ฐาน (ก้อน GET ของ `…/service-setup`) เป็นความจริงเสมอ · ร่างเก็บเฉพาะคีย์ที่ผู้ใช้แตะ
//   ⇒ ก้อนบันทึก (PATCH) ส่งเฉพาะที่ต่างจากฐานจริง ๆ (คีย์ที่ไม่ส่ง = ไม่เปลี่ยน · `zones` ที่ส่ง = แทนทั้งชุดของบรรทัดนั้น)
//   ⇒ โหลดฐานใหม่ (บันทึกแล้ว · ถูกแก้จากอีกหน้าต่าง) = `rebaseDraft` ทิ้งคีย์ที่เท่าฐานใหม่แล้ว ที่เหลือคือสิ่งที่ยังค้าง
// ⭐ ช่องตัวเลขเก็บเป็น "ข้อความที่พิมพ์" — ตัวตรวจของ server เป็นคนตัดสินว่าใช้ได้ไหม (400 fieldErrors ขึ้นแดงรายช่อง)
//   จอไม่เดา/ไม่ตัดทิ้งเอง ยกเว้นแถวโซนที่ยังไม่ได้เลือกโซน (แถวว่าง = ยังไม่มีอะไรให้บันทึก ไม่ใช่ข้อผิด)
// ⚠️ `expectedUpdatedAt` = `updatedAt` ของก้อน GET **ตามตัวอักษร** — ห้ามแปลงผ่าน Date (ไมโครวินาทีหาย ⇒ ทุกการบันทึกตายด้วย stale)
// ⚠️ ไฟล์นี้ถูกเทสต์ใต้ node (serviceSetupUi.test.mjs) — ห้าม import คอมโพเนนต์/ของฝั่ง browser
import { categoryOf } from '@/lib/master/categoryOf';
import {
  SERVICE_KIND_NOT_SERVICE, SERVICE_KIND_PACKAGE, SERVICE_ROLE_UNSET, SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_PANEL_TEXT, periodSpan,
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

/** ค่าที่ฐานถือของบรรทัดหนึ่ง — `{ kind, serviceProductId, serviceFgCode, rounds, zones:[{zoneId, packsPerRound}] }` */
export function baseLineOf(view, lineId) {
  const line = list(view?.lines).find((row) => row?.lineId === lineId) || {};
  return {
    kind: line.kind ?? null,
    serviceProductId: line.serviceProductId ?? null,
    serviceFgCode: line.serviceFgCode ?? null,
    rounds: line.rounds ?? null,
    zones: allocationsOf(view, lineId).map((row) => ({ zoneId: row.zoneId, packsPerRound: row.packsPerRound ?? null })),
  };
}

const samePeriod = (a, b) => (text(a?.from) === text(b?.from) && text(a?.to) === text(b?.to));
const periodOrNull = (period) => {
  const from = text(period?.from);
  const to = text(period?.to);
  return !from && !to ? null : { from, to };
};
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
 *             rounds (ข้อความ), zones:[{ key, zoneId, packsPerRound (ข้อความ) }] }]`
 */
export function mergedLines(view, draft = EMPTY_DRAFT, { fgById = new Map() } = {}) {
  const lines = [...list(view?.lines)].sort((a, b) => Number(a?.lineNo ?? 0) - Number(b?.lineNo ?? 0));
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
      zones,
    };
  });
}

/* ══ ก้อนบันทึก ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * ร่าง → ก้อน PATCH (`{ expectedUpdatedAt, period?, lines? }`) · ไม่มีอะไรต่างจากฐาน = null
 * ⚠️ บรรทัด FG ไม่ส่ง `kind`/`serviceProductId` เด็ดขาด (server ตีกลับ `service_setup_kind_on_fg_line`)
 */
export function setupPayload(view, draft = EMPTY_DRAFT) {
  if (!view) return null;
  const out = { expectedUpdatedAt: view.updatedAt ?? null };
  if (hasOwn(draft, 'period')) {
    const next = periodOrNull(draft.period);
    const base = periodOrNull(view.period);
    if (!(next === null && base === null) && !(next && base && samePeriod(next, base))) out.period = next;
  }
  const lines = [];
  for (const line of [...list(view.lines)].sort((a, b) => Number(a?.lineNo ?? 0) - Number(b?.lineNo ?? 0))) {
    const edit = draft?.lines?.[line.lineId];
    if (!edit) continue;
    const base = baseLineOf(view, line.lineId);
    const manual = isManualViewLine(line);
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
    if (Object.keys(entry).length > 1) lines.push(entry);
  }
  if (lines.length) out.lines = lines;
  return hasOwn(out, 'period') || lines.length ? out : null;
}

/** มีอะไรที่ยังไม่บันทึกไหม — นิยามเดียวกับก้อนบันทึก (แถวโซนว่างอย่างเดียวไม่นับ) */
export const draftDirty = (view, draft) => setupPayload(view, draft) !== null;

/** ฐานเปลี่ยน (บันทึกแล้ว · โหลดใหม่หลังถูกแก้จากอีกหน้าต่าง) → ทิ้งคีย์ของร่างที่เท่าฐานใหม่แล้ว ที่เหลือคือที่ยังค้าง */
export function rebaseDraft(view, draft = EMPTY_DRAFT) {
  if (!view || !draft) return EMPTY_DRAFT;
  const payload = setupPayload(view, draft);
  if (!payload) return EMPTY_DRAFT;
  const next = { lines: {} };
  if (hasOwn(payload, 'period')) next.period = draft.period;
  for (const entry of list(payload.lines)) {
    const edit = draft.lines[entry.lineId];
    const kept = {};
    for (const key of ['kind', 'serviceProductId', 'rounds', 'zones']) {
      if (hasOwn(entry, key)) kept[key] = edit[key];
    }
    next.lines[entry.lineId] = kept;
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
});

/** `{ lines, allocations, zonesById }` จากบรรทัดที่จอวาด — ตัวเลขบนชิป/ท้ายตาราง/เส้นประใต้บรรทัดตามร่างทันที */
export function localSetupCtx(merged = [], zonesById = new Map()) {
  return {
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
 * ป้ายสถานะของบรรทัด (หัวกล่อง "งานบริการของรายการนี้") — นับเฉพาะของที่ยังว่าง (โครงสร้าง)
 * ความถูกต้องของแพ็คเกจ/โซน (ปิดใช้งาน · ของลูกค้าอื่น) เป็นข้อที่ยังขาดจาก server หลังกดยื่น
 * → `{ state: 'unset'|'missing'|'complete'|'none', count, label }`
 */
export function lineMissing(line) {
  if (!line) return { state: 'none', count: 0, label: null };
  if (line.role === SERVICE_ROLE_UNSET) return { state: 'unset', count: 1, label: 'ยังไม่เลือกชนิด' };
  const zones = list(line.zones).filter((row) => row.zoneId);
  if (line.role === SERVICE_KIND_NOT_SERVICE) {
    return zones.length ? { state: 'missing', count: 1, label: 'ยังขาด 1 ข้อ' } : { state: 'none', count: 0, label: null };
  }
  let count = 0;
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
  const ids = ['kind', 'fg', 'zones', 'rounds'].map((field) => lineFieldId(line.lineId, field));
  for (const row of list(line.zones)) if (row.zoneId) ids.push(zonePacksFieldId(line.lineId, row.zoneId));
  return ids;
}

/**
 * ผลตีกลับ 400 ของการบันทึก (`fieldErrors:[{lineId, zoneId?, field, message}]`) → ช่องที่ขึ้นแดง
 * → `{ byField: Map fieldId → ข้อความ, byZone: Map "lineId:zoneId" → ข้อความ, general: string[] }`
 *   (field 'payload'/'line' ไม่มีช่อง ⇒ ขึ้นเป็นข้อความรวมที่แถบบันทึก)
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
    if (field === 'period') add(byField, PERIOD_FIELD_ID, message);
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

/** "รายการ 3: ยังไม่ใส่รอบบริการ" → `{ head: 'รายการ 3', rest: ': ยังไม่ใส่รอบบริการ' }` (หัวตัวหนาตามม็อก) */
export function issueHeadTail(message) {
  const value = String(message ?? '');
  const match = value.match(/^((?:รายการ|งวด) [^:]{1,80}?):\s/);
  return match ? { head: match[1], rest: value.slice(match[1].length) } : { head: '', rest: value };
}

/* ข้อที่รวมเป็นแถวเดียวได้เมื่อซ้ำหลายงวด — ข้อความรูปเดียวกันต่างแค่เลขงวด (12× "ยังไม่เลือกรอบวางบิล" = แถวเดียว) */
const MERGE_KEYS = new Set(['billing_missing', 'due_missing', 'coverage_missing']);
/* ข้อวันงวด — กลุ่มหลายงวดของสองข้อนี้ "ไปแก้" = โหมดตั้งวันงวด + แผง "เติมวันงวดที่ว่าง…" (#1846 · `entry.dateFill`) */
const DATE_FILL_KEYS = new Set(['billing_missing', 'due_missing']);

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
     + ทางลัดเป็นตัวหนังสือ (`withHint` — กลุ่มวันงวดแรกของแผงเท่านั้น: สองกลุ่มเปิดแผงเติมอันเดียวกัน)
   · ช่วงครอบ — "ไปแก้" = เซลล์ของงวดแรก */
function mergedItem(entries, { withHint = false } = {}) {
  const [first] = entries;
  const { rest } = issueHeadTail(first?.message);
  const seqs = entries.map((entry) => entry?.seq);
  /* ทุกงวดของกลุ่มต้องเป็นงวดที่แผงเติมแตะ (`dateFillable` จากด่าน — ไม่มีธง = ถือว่าเติมได้) · มีงวดที่เติมไม่ได้ = ไปที่ช่องของงวดแรก
     และไม่บอกทางลัด (ทางลัดพูดว่า "เติมทีเดียวได้" — ต้องจริงทั้งกลุ่ม) */
  const dateFill = DATE_FILL_KEYS.has(first?.key) && entries.every((entry) => entry?.dateFillable !== false);
  const hint = dateFill && withHint ? SERVICE_SETUP_PANEL_TEXT.dateFillHint : '';
  const message = `${SERVICE_SETUP_PANEL_TEXT.mergedSeqs({ seqs: seqRangesText(seqs), rest, n: entries.length })}${hint}`;
  return {
    kind: 'issue',
    entry: { ...first, message, ...(dateFill ? { dateFill: true } : {}) },
    entries,
    tag: null,
    jump: true,
  };
}

/**
 * ข้อที่ยังขาด + คำเตือน → กลุ่มของแผงแดง (รายการ/แท็บภาพรวม · งวดชำระ/แท็บการชำระ)
 * @returns `[{ key, title, count (ข้อที่บล็อก), warnCount, items: [{ kind:'issue'|'warning', entry, entries?, tag, jump }] }]`
 *   — กลุ่มว่างไม่ขึ้น
 *   · ของบัญชี (owner FN — ทั้งข้อที่บล็อกและคำเตือน) มีป้าย "รอฝ่ายบัญชี" และ **ไม่มี "ไปแก้"** (ฝ่ายขายแก้ไม่ได้)
 *   · ข้อเดียวกันหลายงวด (วันวางบิล · กำหนดชำระ · ช่วงครอบ) รวมเป็นแถวเดียว — `count` ยังนับทุกข้อ (ตรงกับป้ายบนแท็บ)
 *     🐞 เดิมแถวละงวด ⇒ ลูกค้าวางบิล 12 งวดได้ 12 แถวเหมือนกันทุกตัวอักษร จอ 375px ยาวหลายหน้าจอก่อนถึงตาราง
 *   · แถวรวมของข้อวันงวดมี `entry.dateFill` — หน้าใบอ่านธงนี้ตอน "ไปแก้" (โหมดตั้งวันงวด + แผงเติม · #1846)
 */
export function submitGateGroups(issues = [], warnings = []) {
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
  let hinted = false;
  for (const entry of list(issues)) {
    const group = groupOf(entry);
    group.count += 1;
    const mergeKey = `${entry?.key}\u0000${entry?.billingMode || ''}`;
    const bucket = entry?.tab === 'payment' && entry?.owner !== 'FN' ? sameKey.get(mergeKey) : null;
    if (bucket && bucket.length > 1) {
      if (placed.has(mergeKey)) continue;
      placed.add(mergeKey);
      const item = mergedItem(bucket, { withHint: !hinted });
      if (item.entry.dateFill) hinted = true;
      group.items.push(item);
      continue;
    }
    const fn = entry?.owner === 'FN';
    group.items.push({ kind: 'issue', entry, tag: fn ? (entry.tag || SERVICE_SETUP_PANEL_TEXT.fnTag) : null, jump: !fn });
  }
  for (const entry of list(warnings)) {
    const fn = entry?.owner === 'FN';
    const group = groupOf(entry);
    group.warnCount += 1;
    group.items.push({
      kind: 'warning', entry, tag: fn ? (entry.tag || SERVICE_SETUP_PANEL_TEXT.fnTag) : SERVICE_SETUP_PANEL_TEXT.warningTag, jump: !fn,
    });
  }
  return groups.filter((group) => group.items.length);
}

/* ══ การ์ดราง / แบนเนอร์ของงานบริการย้อนหลัง ══════════════════════════════════════════════════════════════ */

/** สถานะการตั้งย้อนหลังจากก้อน GET — ตัวเดียวกับ `serviceBackfillState` (ป้ายจาก SERVICE_BACKFILL_STATE_LABELS)
 *  ⭐ ขั้น 'backfill' ของก้อน GET = อนุมัติแล้ว ยังไม่ถูก Rev. ทับ ยังไม่ประทับ ⇒ 'submitted' ตรงนี้คือรอผู้จัดการตรวจจริง (D28) */
export function backfillStateOfView(view) {
  if (!view || view.flow !== 'backfill') return null;
  const state = view.state?.setupState ?? null;
  if (state === 'submitted') return 'submitted';
  if (state === 'rejected') return 'rejected';
  const started = !!view.period || list(view.allocations).length > 0
    || list(view.lines).some((line) => line?.kind || line?.serviceProductId);
  return started ? 'editing' : 'not_started';
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
  return `ตั้งแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ · ช่วงบริการ แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ${BANNER_UNCHANGED}`;
}

/** บรรทัดรองบนหัวการ์ด "รายการสินค้าและบริการ" ของใบสาย SERVICE (ที่มาของราคา · ขั้นของงานบริการ) */
export function linesCardMeta({ order, view, flow, editable, lineCount, totals } = {}) {
  const n = `${fmtNumber(lineCount || 0)} รายการ`;
  const source = order?.quotationId ? `ราคา/จำนวนจาก ${order?.quotation?.quoteNumber || 'QT ต้นทาง'} แก้ไม่ได้` : 'คีย์จากเอกสารเดิม';
  if (flow === 'stamped') {
    const opened = view?.state?.termsOpenedAt;
    return `${n} · อนุมัติแล้ว · เปิด ${fmtNumber(totals?.zones || 0)} โซนให้ TS${opened ? ` เมื่อ ${fmtDateTime(opened)}` : ''}`;
  }
  if (editable && flow === 'pipeline') return `${n} · ${source} · งานบริการตั้งได้จนกว่าจะยื่นอนุมัติ`;
  if (editable && flow === 'backfill') return `${n} · ${source} · งานบริการตั้งได้จนกว่าจะยื่นตรวจ`;
  /* ม็อก BackfillApproveModal: ใบเดิมที่ยื่นตรวจแล้วบอกวันยื่นบนหัวการ์ด */
  if (flow === 'backfill' && view?.state?.setupState === 'submitted' && view?.state?.submittedAt) {
    return `${n} · ${source} · งานบริการตั้งย้อนหลัง ยื่นตรวจ ${fmtDate(view.state.submittedAt)}`;
  }
  return `${n} · ${source}`;
}

const LINE_SHORT = Object.freeze({
  kind_missing: 'ยังไม่เลือกชนิด', fg_missing: 'ยังไม่เลือกแพ็คเกจ', fg_invalid: 'แพ็คเกจใช้ไม่ได้แล้ว',
  fg_foreign: 'แพ็คเกจของนิติบุคคลอื่น', rounds_missing: 'ยังไม่ใส่รอบบริการ',
});
const ZONE_SHORT = Object.freeze({
  zones_missing: 'ยังไม่เลือกโซน', packs_missing: 'ยังไม่ใส่แพ็คต่อรอบ', zone_invalid: 'โซนใช้ไม่ได้', zones_on_not_service: 'มีโซนค้าง',
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
  /* "รายการ 3: ยังไม่ใส่รอบบริการ · อีก 2 รายการ" — ข้อแรกของแถว + จำนวนบรรทัดที่เหลือ */
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
    if (unset) return { key, label, value: 'รอเลือกชนิดรายการ', sub: null, ok: false };
    if (!packageLines) return { key, label, value: NA, sub: 'ไม่มีแพ็คเกจ — ไม่ต้องใส่', ok: true };
    return { key, label, value: 'ครบ', sub: null, ok: true };
  };

  const lineBad = linesWith(LINE_KEYS);
  const zoneBad = linesWith(ZONE_KEYS);
  const zoneLines = lines.filter((line) => line?.role !== SERVICE_KIND_NOT_SERVICE || zoneBad.has(line?.lineId));
  const zoneDone = zoneLines.filter((line) => line.role === SERVICE_KIND_PACKAGE && !zoneBad.has(line.lineId)).length;
  const periodMissing = issues.some((issue) => issue?.key === 'period_missing');
  const mayNeedPeriod = packageLines + unset > 0;

  return [
    {
      key: 'lines', label: 'ชนิด · แพ็คเกจ · รอบบริการ',
      value: `${fmtNumber(lines.length - lineBad.size)}/${fmtNumber(lines.length)} รายการ`,
      sub: shortSub(LINE_KEYS, LINE_SHORT, lineBad.size), ok: lineBad.size === 0,
    },
    {
      key: 'zones', label: 'ไซต์ · โซน · แพ็คต่อรอบ',
      value: zoneLines.length ? `${fmtNumber(zoneDone)}/${fmtNumber(zoneLines.length)} รายการ` : 'ไม่มีแพ็คเกจ',
      sub: unset ? `รอเลือกชนิด ${fmtNumber(unset)} รายการ` : shortSub(ZONE_KEYS, ZONE_SHORT, zoneBad.size),
      ok: zoneBad.size === 0 && !unset,
    },
    {
      key: 'period', label: 'ช่วงบริการ',
      value: view.period ? periodLabel(view.period) : (mayNeedPeriod ? 'ยังไม่ใส่' : NA),
      sub: view.period ? periodReadout(view.period) || null : (mayNeedPeriod ? null : 'ไม่มีแพ็คเกจ — ไม่ต้องใส่'),
      ok: !periodMissing && (!!view.period || !unset),
    },
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
