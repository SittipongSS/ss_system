// ── ตัวทำตาม "ผลที่ต้องทำ" ของตัวตัดสินประวัติหน้าพื้นที่ (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.3) ─────────────────
//
// ⭐ **ตัวตัดสิน (`surveyZoneRouteStep`) ตอบว่าต้องทำอะไร · ตัวนี้ทำตามลำดับ** — แยกจาก hook (`useSurveyZoneRoute`)
//   เพื่อให้เทสต์ได้ด้วยของปลอม (ประวัติ · นาฬิกา · กล่องถาม) โดยไม่ต้องมีเบราว์เซอร์หรือ React
//   ของที่พังเงียบได้และเทสต์ของตัวตัดสินมองไม่เห็น: ลำดับ "ทิ้งร่าง → เขียนประวัติ" · กล่องถามซ้อนสองใบ ·
//   การย้อนที่เราสั่งแล้วไม่มีเหตุการณ์ตามมา (`skip` ค้างกินปุ่มย้อนจริงครั้งถัดไป)
//
// ⚠️ ถามทีละคำถาม — `confirmAction` ถือคำขอได้ใบเดียว ใบที่สองทับใบแรกแล้วใบแรกไม่มีวันตอบ (กับดักของหน้าจัดคิว)
//   ⇒ ระหว่างกล่องเปิดอยู่ คำถามใหม่ไม่เปิดกล่องซ้ำ · คำตอบใช้กับการย้ายล่าสุดที่รออยู่ (`pending` ของตัวตัดสิน)
// ⚠️ ไม่แตะ DOM เอง — เลื่อน/โฟกัสส่งต่อให้ผู้เรียก (`queueDom`) ทำหลังวาดเสร็จ (บานที่เพิ่งเปิดยังไม่อยู่ในจอ)
import { SURVEY_ZONE_ROUTE_START, surveyZoneRouteStep } from './surveyZoneRoute';
import { surveySheetHref } from './surveyFieldView';

/* การย้อนที่เราสั่ง — ถ้าเบราว์เซอร์ไม่ส่งเหตุการณ์กลับมาภายในเวลานี้ แปลว่าไม่มีหน้าให้ย้อน (ล้าง `skip`) */
export const SURVEY_ZONE_SETTLE_MS = 700;

/**
 * @param deps.read          `() => ({ requestId, zoneIds, dirtyZoneIds, pageDirty, tab, defaultZoneId, split })` — ค่าล่าสุดของหน้า
 * @param deps.history       `{ push(data, url), replace(data, url), go(delta), entry() }` — `entry()` = ข้อมูลบนรายการที่เปิดอยู่
 *                           (`history.state` — ตัวทำอ่านกุญแจชั้นเปล่า `surveyLayer` ให้ตอนเริ่ม)
 * @param deps.onAsk         `({ from, to, via }) => Promise<boolean>` — กล่อง "ทิ้งค่าที่ยังไม่บันทึก?"
 *                           (`via:'leave'` = ออกจากหน้า — ผู้เรียกถามด้วยกล่องของการออกจากหน้า `surveyLeaveConfirm`)
 * @param deps.onResetDraft  ทิ้งร่างของพื้นที่ที่เปิดอยู่
 * @param deps.onTab         `(tab, zoneId|null, layer) => void` — `zoneId` = ชั้นพื้นที่ของรายการนี้ · `layer` = ชั้นเปล่า (เขียน URL/กุญแจกลับ)
 * @param deps.onShown       `(zoneId|null) => void` — พื้นที่ที่ต้องวาด
 * @param deps.queueDom      `(effect) => void` — เลื่อน/โฟกัสหลังวาด
 * @param deps.scrollY       `() => number` · @param deps.setTimer / deps.clearTimer  นาฬิกา (เทสต์ใส่ของปลอม)
 * @returns `{ dispatch(event), state(), savedScroll() }`
 */
export function createSurveyZoneRouteRunner({
  read, history, onAsk, onResetDraft, onTab, onShown, queueDom,
  scrollY = () => 0, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t),
}) {
  let state = SURVEY_ZONE_ROUTE_START;
  let asking = false;
  let settleTimer = null;
  let savedScroll = 0;

  const ctx = () => {
    const now = read();
    const dirtyIds = (now.dirtyZoneIds || []).map(String);
    return {
      /* ค่าค้างของ **พื้นที่ที่เปิดอยู่** เท่านั้น — ถามจากสถานะล่าสุดของตัวตัดสิน ไม่ใช่ค่าของรอบวาดก่อน */
      dirty: state.shown !== null && dirtyIds.includes(state.shown),
      /* ของค้างระดับหน้า (การเคาะ · ข้อความถึงหัวหน้า · รูปที่ยังส่ง) — ตัวตัดสินถามเฉพาะตอนออกจากหน้า */
      pageDirty: now.pageDirty === true,
      tab: now.tab ?? null,
      split: now.split === true,
      zoneIds: (now.zoneIds || []).map(String),
      defaultZoneId: now.defaultZoneId ?? null,
    };
  };

  const write = ({ kind, zoneId, tab, layer }) => {
    /* `tab:'result'` = รายการของแท็บสรุป (เริ่ม/หมุนจอ/ย้อนออกบนแท็บสรุป) — URL ไม่พกพื้นที่ แต่กุญแจพก */
    const url = surveySheetHref(read().requestId, { zoneId, ...(tab ? { tab } : {}) });
    /* กุญแจของเราเองบนรายการประวัติ — Next คัดลอกสถานะภายในของมันมาต่อท้ายให้ (app-router หุ้ม pushState ไว้)
       ⚠️ `surveyZone` = "รายการนี้คือชั้นพื้นที่ที่ดันบนชั้นใบแล้ว" — เปิดหน้าใหม่บนรายการนี้ (รีเฟรช) ต้องไม่ดันซ้ำ
       · `surveyLayer` = ชั้นเปล่า (สองบานที่บานขวาว่าง — review 26/09) · ดัน = ชั้นเสมอ (ชั้นใบไม่เคยถูกดัน) */
    const data = zoneId ? { surveyZone: zoneId } : (layer || kind === 'push') ? { surveyLayer: true } : { surveySheet: true };
    if (kind === 'push') history.push(data, url);
    else history.replace(data, url);
  };

  function run(effects) {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'push':
        case 'replace':
          write(effect);
          break;
        case 'back':
          if (settleTimer !== null) clearTimer(settleTimer);
          settleTimer = setTimer(() => {
            settleTimer = null;
            dispatch({ type: 'settle' });
          }, SURVEY_ZONE_SETTLE_MS);
          history.go(-(effect.steps || 1));
          break;
        case 'ask':
          if (asking) break;
          asking = true;
          Promise.resolve()
            .then(() => onAsk?.(effect))
            .catch(() => false)
            .then((yes) => {
              asking = false;
              dispatch({ type: yes ? 'confirm' : 'cancel' });
            });
          break;
        case 'resetDraft':
          onResetDraft?.();
          break;
        case 'tab':
          onTab?.(effect.tab, effect.zoneId ?? null, effect.layer === true);
          break;
        case 'scroll':
        case 'focus':
          queueDom?.(effect);
          break;
        default:
          break;
      }
    }
  }

  function dispatch(event) {
    /* เหตุการณ์ย้อน/ไปหน้ามาถึงแล้ว = การย้อนที่เราสั่งไม่ต้องรอล้างอีก (ตัวตัดสินกิน `skip` เอง) */
    if (event?.type === 'pop' && settleTimer !== null) {
      clearTimer(settleTimer);
      settleTimer = null;
    }
    /* เริ่มบนชั้นเปล่าของเราเอง (รีเฟรช) — ตัวต่อสายส่งแค่กุญแจพื้นที่ (`here`) · กุญแจชั้นเปล่าอ่านจากรายการที่เปิดอยู่ที่นี่
       ⇒ ไม่แทนที่เป็นใบแล้วดันซ้ำ (กองไม่โตเป็น `[ใบ, ใบ, ชั้น]`) */
    const e = event?.type === 'init' && event.blank === undefined
      ? { ...event, blank: history.entry?.()?.surveyLayer === true }
      : event;
    const prev = state;
    const out = surveyZoneRouteStep(prev, e, ctx());
    state = out.state;
    /* ออกจากหน้ารายการ (หน้าเดียว) = จำตำแหน่งเลื่อนไว้ ให้ "← พื้นที่ทั้งหมด" พากลับมาที่แถวเดิม */
    if (prev.shown === null && state.shown !== null && state.mode === 'pages') savedScroll = scrollY();
    onShown?.(state.shown);
    run(out.effects);
  }

  return {
    dispatch,
    state: () => state,
    savedScroll: () => savedScroll,
    dispose: () => {
      if (settleTimer !== null) clearTimer(settleTimer);
      settleTimer = null;
    },
  };
}
