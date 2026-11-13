// ── แท็บ "กลิ่น" · "สูตร" ของหน้า "ราคา + Ingredient List" (มติเจ้าของ 09/11/2026) ─────────────────────────────
//
// ⭐ เจ้าของ: *"อยากดึงกลิ่นและสูตร ที่มาจากคำร้องและถูกคอนเฟิร์ม มาว่าอันไหนยังไม่ใส่ราคา และ ingredient"*
//   + *"แยกแท็บ กลิ่น กับ สูตร เพื่อให้ง่ายต่อการจัดการ"*
//   ⇒ หน่วยของสองแท็บนี้คือ **ตัวในทะเบียน** (หนึ่งแถว = หนึ่งกลิ่น / หนึ่งสูตร) ไม่ใช่แถวคำร้อง
//   · แท็บ "งานค้างในคำร้อง" (priceBoard.js) เห็นแค่แถวของใบที่ยังเปิด — วัด prod 09/11: แถวคอนเฟิร์ม 56 แถว
//     อยู่ในใบที่ปิด/ตอบครบแล้ว 30 แถว · สูตรที่ต้องมี Ingredient List 27 ตัวขาดครบทั้ง 27 (ราคาลงก่อน ม-158 จึงจบแถวไปแล้ว)
//     ⇒ ของที่ขาดส่วนใหญ่ไม่มีจอไหนรวมให้เห็นเลย
//
// ⭐ **"มาจากคำร้องและถูกคอนเฟิร์ม"** = ตัวที่แถวคำร้องของฝ่าย RD ผลิตขึ้น (`producedScentId` · `producedFormulaId`)
//   และลูกค้าคอนเฟิร์มแถวนั้น (`outcome = 'confirmed'`) — ใบสถานะไหนก็ได้ ยกเว้นร่าง/ยกเลิก
//   ⚠️ `scentId` / `formulaId` บนแถวคือ **ของที่ขอให้ทำต่อ** ไม่ใช่ของที่ได้ — ใช้ตัดสินไม่ได้
//   ⚠️ ทะเบียนไม่มีคอลัมน์ชี้กลับคำร้อง (สูตรไม่มีเลย · กลิ่นมีแค่ `briefId`) ⇒ ตามจากแถวคำร้องทางเดียว
//
// ⭐ "ยังไม่ใส่ราคา" = ไม่มีช่องไหนมีราคาที่อ่านได้ (ไม่ผูกวัสดุ · วัสดุยังไม่มีราคา · วัสดุร่าง/เก็บเข้ากรุ)
//   — กติกาเดียวกับขั้นราคาในคำร้อง: ใส่ **อย่างน้อยหนึ่งช่อง** พอ (ม-148) · ราคาหมดอายุ = มีราคา แต่ป้ายบอกแยก
// ⭐ "ยังไม่มี Ingredient List" = ตัวตัดสินเดียวกับขั้นในคำร้อง (`rowIngredientPlan` · หมวด 01/02 ยกเว้น 02-020)
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — route อ่านทะเบียน/ราคาแล้วส่งมาประกอบ (แพตเทิร์นเดียวกับ priceBoard.js)
import { rowStage } from '@/lib/requests/rowStage';
import { requestedLabel } from '@/lib/requests/rowLabel';
import { ingredientListMissing, rowIngredientPlan } from '@/lib/master/ingredientList';
import { PRICE_SLOTS, formulaPriceSlots } from '@/lib/master/priceSlots';
import { FORMULA_STATUS_LABELS, isFormulaUsable } from '@/lib/master/formulas';
import { SCENT_STATUS_LABELS, isScentUsable } from '@/lib/master/scents';
import { formulaLabelDate, scentLabelDate } from '@/lib/master/registryLabel';

const DEPT = 'RD';
/* ใบร่างยังไม่ถึงฝ่าย · ใบยกเลิก = งานที่ไม่เกิด (คอนเฟิร์มค้างบนใบที่ยกเลิกไม่ใช่ของที่ลูกค้าซื้อ) */
const SKIP_REQUEST_STATUSES = new Set(['draft', 'cancelled']);
/* แถวที่ลูกค้าคอนเฟิร์มแล้ว — ขั้นสามตัวท้ายของสายพัฒนา (ตอบปฏิเสธไปแล้ว = ไม่นับ แม้ผลลูกค้าจะเป็นคอนเฟิร์ม) */
const CONFIRMED_STAGES = new Set(['awaiting_price', 'awaiting_ingredients', 'done']);

/** สถานะราคาของหนึ่งตัวในทะเบียน — ป้ายบนจอ/ตัวเลือกตัวกรองชุดเดียวกัน */
export const REGISTRY_PRICE_STATES = Object.freeze({
  missing: { label: 'ยังไม่มีราคา', tone: 'warning' },
  expired: { label: 'ราคาหมดอายุ', tone: 'neutral' },
  ready: { label: 'มีราคาแล้ว', tone: 'success' },
  // ไม่มีช่องให้ใส่ (สูตรหัวน้ำหอมที่กลิ่นใช้ไม่ได้ · ตัวที่ยังไม่รับเข้าทะเบียน) — บอกเหตุแทนปุ่ม
  blocked: { label: 'ใส่ราคาไม่ได้', tone: 'danger' },
});

/** สถานะ Ingredient List — `none` = ตัวนี้ไม่ต้องมี (กลิ่น · สูตร 02-020) */
export const REGISTRY_INGREDIENT_STATES = Object.freeze({
  missing: { label: 'ยังไม่มี', tone: 'warning' },
  ready: { label: 'มีแล้ว', tone: 'success' },
  none: { label: 'ไม่ต้องใส่', tone: 'neutral' },
});

/**
 * แถวคำร้องที่ลูกค้าคอนเฟิร์ม → ที่มาของแต่ละกลิ่น/สูตร
 * คืน `{ scents: Map<id, Source[]>, formulas: Map<id, Source[]> }` · Source = `{ requestId, docNo, requestStatus,
 * itemId, confirmedAt, stage, label }` เรียงคอนเฟิร์มก่อนขึ้นก่อน (ไม่มีวันไปท้าย)
 */
export function confirmedRegistrySources(requests = []) {
  const scents = new Map();
  const formulas = new Map();
  const push = (map, id, source) => { if (!id) return; const list = map.get(id) || []; list.push(source); map.set(id, list); };
  for (const request of requests || []) {
    if (request?.dept !== DEPT || SKIP_REQUEST_STATUSES.has(request.status)) continue;
    for (const item of request.items || []) {
      if (item?.outcome !== 'confirmed') continue;
      const stage = rowStage(item);
      if (!CONFIRMED_STAGES.has(stage)) continue;
      const source = {
        requestId: request.id,
        docNo: request.docNo || null,
        requestStatus: request.status || null,
        itemId: item.id,
        confirmedAt: item.outcomeAt || null,
        stage,
        label: item.lineKind === 'product_dev' ? requestedLabel(item.label) : (item.label || ''),
      };
      push(scents, item.producedScentId, source);
      push(formulas, item.producedFormulaId, source);
    }
  }
  const byConfirmed = (a, b) => {
    const ad = a.confirmedAt || '', bd = b.confirmedAt || '';
    if (!ad !== !bd) return ad ? -1 : 1;
    return ad < bd ? -1 : ad > bd ? 1 : String(a.itemId).localeCompare(String(b.itemId));
  };
  for (const map of [scents, formulas]) for (const list of map.values()) list.sort(byConfirmed);
  return { scents, formulas };
}

/**
 * สถานะราคาจากราคาของทุกช่อง (`current[i].price` = รูปของ `attachRegistryPrice` · null = ไม่ผูกวัสดุ)
 * · ไม่มีช่อง = `blocked` · มีช่องไหนพร้อมใช้ = `ready` · มีแต่หมดอายุ = `expired` · ที่เหลือ = `missing`
 */
export function registryPriceState(current = [], { hasSlots = true } = {}) {
  if (!hasSlots) return 'blocked';
  const states = (current || []).map((c) => (c?.price?.unitPrice != null ? c.price.state : null));
  if (states.includes('ready')) return 'ready';
  if (states.includes('expired')) return 'expired';
  return 'missing';
}

/* ราคาของแต่ละช่องจาก map `${kind}:${id}` → price (ตัวเดียวกับที่ route อ่านด้วย `attachRegistryPrice`) */
const currentOf = (slots, prices, sourceOf) => slots.map((slot) => {
  const source = sourceOf(slot);
  return {
    key: slot.key,
    short: slot.short,
    text: slot.text,
    kind: slot.kind,
    source: source ? { id: source.id, code: source.code || null, name: source.name || null } : { id: slot.id, code: null, name: null },
    price: prices?.get?.(`${slot.kind}:${slot.id}`) || null,
  };
});

/* ส่วนที่สองแท็บมีเหมือนกัน — ที่มา · ลูกค้า (AR อ่านสดจากทะเบียนลูกค้า) · สถานะสองก้าว */
function baseRow(kind, entity, sources, { arById }) {
  const list = sources || [];
  const dates = list.map((s) => s.confirmedAt).filter(Boolean).sort();
  return {
    key: `${kind}:${entity.id}`,
    kind,
    id: entity.id,
    code: entity.code || null,
    name: entity.name || null,
    // วันที่บนป้าย "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11) — กลิ่น = วันผลิต · สูตร = วันที่สูตร
    date: (kind === 'scent' ? scentLabelDate(entity) : formulaLabelDate(entity)) || null,
    status: entity.status || null,
    customerId: entity.customerId || null,
    customerName: entity.customerName || null,
    customerArCode: (entity.customerId && arById?.get?.(entity.customerId)) || null,
    sources: list,
    firstConfirmedAt: dates[0] || null,
    lastConfirmedAt: dates[dates.length - 1] || null,
  };
}

/* ขั้นสุดท้าย — สองก้าวต้องครบ (ม-159): ราคาอย่างน้อยหนึ่งช่อง (หมดอายุนับว่ามี) + Ingredient List ถ้าต้องมี */
function withProgress(row) {
  const needsPrice = row.priceState === 'missing' || row.priceState === 'blocked';
  const needsIngredient = row.ingredientState === 'missing';
  return { ...row, needsPrice, needsIngredient, complete: !needsPrice && !needsIngredient };
}

/**
 * แถวของสองแท็บ — `{ scents: Row[], formulas: Row[] }` (ลำดับตามที่มา: คอนเฟิร์มก่อนขึ้นก่อน)
 * @param sources   ผลของ `confirmedRegistrySources`
 * @param scents    แถวทะเบียนกลิ่น — ทุกตัวในที่มา **และ** กลิ่นของสูตรในที่มา (ช่อง F ของสูตรลงที่กลิ่นของสูตร)
 * @param formulas  แถวทะเบียนสูตรของที่มา
 * @param prices    Map `${kind}:${id}` → ราคา (`attachRegistryPrice`)
 * @param arById    Map customerId → รหัส AR
 * ⚠️ ตัวที่ถูกลบไปแล้ว (แถวชี้ id ที่ไม่มีในทะเบียน) ไม่ขึ้น — ไม่มีที่ให้ใส่ราคา/Ingredient List
 */
export function priceRegistryRows({ sources, scents = [], formulas = [], prices = new Map(), arById = new Map() } = {}) {
  const scentById = new Map((scents || []).map((s) => [s.id, s]));
  const formulaById = new Map((formulas || []).map((f) => [f.id, f]));
  const opts = { arById };

  const scentRows = [];
  for (const [id, list] of sources?.scents || []) {
    const scent = scentById.get(id);
    if (!scent) continue;
    const usable = isScentUsable(scent);
    // กลิ่น = ช่อง F ช่องเดียว (ม-148) · ด่านเดียวกับ API ราคากลิ่น (`usableError`)
    const slots = usable ? [{ ...PRICE_SLOTS.F, id: scent.id }] : [];
    const current = currentOf(slots, prices, () => scent);
    scentRows.push(withProgress({
      ...baseRow('scent', scent, list, opts),
      customerTradeName: scent.customerTradeName || null,
      slots,
      priceBlocker: usable ? '' : `กลิ่นสถานะ "${SCENT_STATUS_LABELS[scent.status] || scent.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`,
      current,
      priceState: registryPriceState(current, { hasSlots: slots.length > 0 }),
      ingredient: { required: false, formulaId: null, current: null, missing: false },
      ingredientState: 'none',
    }));
  }

  const formulaRows = [];
  for (const [id, list] of sources?.formulas || []) {
    const formula = formulaById.get(id);
    if (!formula) continue;
    const scent = formula.scentId ? scentById.get(formula.scentId) || null : null;
    const usable = isFormulaUsable(formula);
    // ช่องของสูตร — ตัวประกอบเดียวกับปุ่มราคาหน้าทะเบียนสูตร + API ราคาสูตร (F ลงกลิ่นของสูตร · 02-020 = F อย่างเดียว)
    const plan = usable ? formulaPriceSlots(formula, scent) : {
      slots: [],
      blocker: `สูตรสถานะ "${FORMULA_STATUS_LABELS[formula.status] || formula.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`,
    };
    const current = currentOf(plan.slots, prices, (slot) => (slot.stampColumn === 'formulaId' ? formula : scent));
    const ingredientPlan = rowIngredientPlan(formula);
    const missing = ingredientListMissing(ingredientPlan);
    formulaRows.push(withProgress({
      ...baseRow('formula', formula, list, opts),
      categoryCode: formula.categoryCode || null,
      scent: scent ? { id: scent.id, code: scent.code || null, name: scent.name || null, producedAt: scent.producedAt || null, status: scent.status || null } : null,
      // ชื่อที่ลูกค้าเรียกอยู่ที่กลิ่นที่เดียว (มติเจ้าของ 04/11) — สูตรอ่านจากกลิ่นของมัน
      customerTradeName: scent?.customerTradeName || null,
      slots: plan.slots,
      priceBlocker: plan.slots.length ? '' : (plan.blocker || ''),
      current,
      priceState: registryPriceState(current, { hasSlots: plan.slots.length > 0 }),
      ingredient: { ...ingredientPlan, missing },
      ingredientState: !ingredientPlan.required ? 'none' : missing ? 'missing' : 'ready',
    }));
  }

  return { scents: scentRows, formulas: formulaRows };
}

/** ยอดของแท็บหนึ่ง — ป้ายบนแท็บ = `incomplete` (ของที่ยังต้องทำ) */
export function priceRegistryTotals(rows = []) {
  const list = rows || [];
  return {
    all: list.length,
    incomplete: list.filter((r) => !r.complete).length,
    complete: list.filter((r) => r.complete).length,
    missingPrice: list.filter((r) => r.needsPrice).length,
    expiredPrice: list.filter((r) => r.priceState === 'expired').length,
    missingIngredient: list.filter((r) => r.needsIngredient).length,
  };
}
