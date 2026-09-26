// ── หน้าพื้นที่บนจอหน้างาน ↔ ประวัติของเบราว์เซอร์ — ตัวตัดสินล้วน (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.3) ──
//
// ⭐ **ทำไมต้องมีตัวนี้** — แบบ A เปิดพื้นที่เป็น "หน้า" (มือถือ) หรือบานขวา (จอกว้าง) ⇒ ปุ่มย้อนของมือถือ ·
//   ปัดขอบจอของ iOS · "← พื้นที่ทั้งหมด" ต้องพาไปที่เดียวกันเสมอ · และทุกทางออกจากพื้นที่ที่ **มีค่าพิมพ์ค้าง**
//   ต้องถามก่อนทิ้ง (เจ้าของเลือกไม่เก็บร่างในเครื่อง ⇒ ถามคือด่านเดียวที่กันค่าหาย)
//   🐞 ถ้าทุกการเปิดพื้นที่ "ดันหน้าใหม่" ปุ่ม "← พื้นที่ทั้งหมด" กับปุ่มย้อนจะพาไปคนละที่ (ย้อนไปพื้นที่ก่อนหน้า
//      ทีละอัน) · ถ้าไม่ดันเลย ปุ่มย้อนของมือถือพาออกจากใบทั้งใบพร้อมค่าที่พิมพ์ค้าง โดยไม่มีใครถาม
//
// 🔑 **กองประวัติของจอนี้มีได้แค่สองแบบ**: `[ใบ]` หรือ `[ใบ, พื้นที่]`
//   รายการ → พื้นที่ = ดันหนึ่งชั้น · พื้นที่ → พื้นที่ (‹ › · ถัดไป · ไปแก้) = **แทนที่** ชั้นบน ไม่ดันซ้อน
//   ⇒ ย้อนหนึ่งครั้งจากพื้นที่ไหนก็ได้ = กลับรายการเสมอ · ลิงก์ตรง `?zone=` ปูชั้น `[ใบ]` ไว้ก่อน ⇒ ย้อนครั้งแรก
//     ยังอยู่ในใบ (ไม่หลุดไปหน้าที่มาก่อนพร้อมค่าที่เพิ่งพิมพ์)
//   สองบาน (≥1000) ใช้กองเดียวกัน — ย้อนลงชั้น `[ใบ]` = **ออกจากหน้า** (ไม่มีหน้ารายการให้กลับ)
//   ⇒ สองบานต้องมีชั้นบนเสมอ ทั้งสองแท็บ (บานขวาว่าง = **ชั้นเปล่า** `layer:true`) ไม่งั้นย้อนครั้งแรกออกหน้าโดยไม่ถาม (review 26/09)
//
// ⚠️ **ย้อนแล้วค่อยถาม ไม่ใช่ถามก่อนย้อน** — เบราว์เซอร์ไม่ให้ขวางปุ่มย้อน ⇒ ค่าค้างอยู่ = ดันชั้นเดิมกลับ
//   (undo) แล้วค่อยถาม · ตอบ "ทิ้ง" ค่อยย้อนจริงอีกครั้ง
// ⚠️ `skip` = จำนวนครั้งที่ **เราสั่งย้อนเอง** — เหตุการณ์ย้อนที่ตามมาจากคำสั่งนั้นต้องไม่ถูกอ่านเป็น
//   "ผู้ใช้กดย้อน" (ไม่งั้นย้อนเองแล้วถามตัวเอง) · ตัวต่อสายยิง `settle` ล้างทิ้งเมื่อไม่มีเหตุการณ์ตามมา
//   (แท็บที่เปิดใหม่ไม่มีหน้าก่อนหน้าให้ย้อน — ตัวนับค้างจะกินการกดย้อนจริงครั้งถัดไป)
// ⚠️ ไฟล์นี้ไม่แตะ `history` เอง — คืน "ผลที่ต้องทำ" ให้ตัวต่อสาย (`useSurveyZoneRoute`) ทำตามลำดับ
//   ⇒ เทสต์ทุกแถวของตาราง §3.3 ได้ด้วยข้อมูลล้วน

/** สภาพตั้งต้น — `above` = มีชั้นพื้นที่ซ้อนบนชั้นใบอยู่ · `pending` = การย้ายที่รอคำตอบ "ทิ้งไหม" ·
 *  `leaving` = ตอบ "ทิ้งแล้วออก" แล้ว รอเบราว์เซอร์พาออก · `root` = ชั้นใบคือรายการแรกของแท็บ (รู้จากการออกที่ไม่เกิดขึ้น) */
export const SURVEY_ZONE_ROUTE_START = Object.freeze({
  mode: 'pages', shown: null, above: false, pending: null, skip: 0, leaving: false, root: false,
});

const idOf = (value) => (value === null || value === undefined || value === '' ? null : String(value));
const isKnown = (zoneIds, id) => id !== null && (Array.isArray(zoneIds) ? zoneIds : []).map(String).includes(id);

/* มาถึงพื้นที่ — หน้าเดียว: เลื่อนขึ้นบนสุด + โฟกัสหัวพื้นที่ (คนใช้โปรแกรมอ่านจอได้ยินชื่อพื้นที่ใหม่)
   · สองบาน: เลื่อนบานขวาให้เห็นหัว (รายการยังอยู่ข้างซ้าย โฟกัสไม่ต้องย้าย) */
const arrive = (mode) => (mode === 'split'
  ? [{ kind: 'scroll', to: 'pane' }]
  : [{ kind: 'scroll', to: 'top' }, { kind: 'focus', target: 'heading' }]);

/* กลับรายการ (หน้าเดียว) — คืนตำแหน่งเลื่อนเดิม + โฟกัสแถวของพื้นที่ที่เพิ่งออกมา */
const backToListEffects = (from) => [{ kind: 'scroll', to: 'restore' }, { kind: 'focus', target: 'row', zoneId: from }];

/* ย้ายชั้นบนเป็นพื้นที่ `to` — มีชั้นพื้นที่อยู่แล้ว = แทนที่ · ยังไม่มี = ดัน */
const toZone = (state, to) => ({
  state: { ...state, shown: to, above: true, pending: null },
  effects: [{ kind: state.above ? 'replace' : 'push', zoneId: to }, ...arrive(state.mode)],
});

/* ลงไปชั้นใบ (รายการ) ด้วยการย้อนของเราเอง — ⚠️ ไม่มีชั้นพื้นที่ (ไม่ควรเกิด) = แทนที่ URL แทนการย้อน
   ⇒ ย้อนตอนไม่มีชั้นให้ย้อนคือพาออกจากหน้า */
const toSheet = (state) => ({
  state: { ...state, shown: null, above: false, pending: null, skip: state.above ? state.skip + 1 : state.skip },
  effects: [
    state.above ? { kind: 'back', steps: 1 } : { kind: 'replace', zoneId: null },
    ...(state.mode === 'split' ? [] : backToListEffects(state.shown)),
  ],
});

const ask = (state, pending) => ({
  state: { ...state, pending },
  effects: [{ kind: 'ask', from: state.shown, to: pending.to, via: pending.via }],
});

const same = (state) => ({ state, effects: [] });

/* เขียนชั้นพื้นที่ — `zoneId` null = **ชั้นเปล่า** (`layer:true` · สองบานที่ไม่มีพื้นที่ให้โชว์ — ย้อนแล้วต้องยังถึงด่านออก
   จากหน้า ตัวทำเขียนกุญแจ `surveyLayer`) · อยู่แท็บสรุป = คง `?tab=result` (เขียน `?zone=` ตอนนั้น = แท็บเด้งไปหน้างานเอง) */
const layerWrite = (kind, zoneId, tab) => ({
  kind, zoneId, ...(zoneId === null ? { layer: true } : {}), ...(tab === 'result' ? { tab } : {}),
});

/* ชั้นพื้นที่ที่รายการประวัติตอนนี้เป็นอยู่ — ผลสลับแท็บพกไปด้วย ⇒ แท็บหน้างานเขียน `?zone=` กลับ ·
   แท็บสรุปคงกุญแจ `surveyZone` ไว้บนรายการ (รีเฟรชบนแท็บสรุปแล้วกลับหน้างาน ไม่ดันชั้นซ้อน)
   · ชั้นเปล่า = `layer:true` (🐞 review 26/09 รอบสาม: สลับแท็บเขียนกุญแจใบทับชั้นเปล่า ⇒ รีเฟรชแล้วดันชั้นซ้อน) */
const layerOf = (state) => (!state.above ? {} : state.shown !== null ? { zoneId: state.shown } : { layer: true });

/**
 * 🔑 ก้าวเดียวของตาราง §3.3 — `(สภาพ, เหตุการณ์, บริบท) → { state, effects }`
 *
 * @param state  สภาพเดิม (`SURVEY_ZONE_ROUTE_START` ตอนเริ่ม)
 * @param event  หนึ่งใน
 *   `{ type:'init', zoneId, here, blank }`  เปิดหน้า (`zoneId` จาก `?zone=` หรือ null · `here` = กุญแจ `surveyZone`
 *                              บนรายการประวัติที่เปิดอยู่ — มี = รายการนี้คือชั้นพื้นที่ที่เราดันไว้เองแล้ว ·
 *                              `blank` = รายการนี้คือชั้นเปล่าของเรา (กุญแจ `surveyLayer` — ตัวทำอ่านให้) · เริ่มได้ทั้งสองแท็บ)
 *   `{ type:'open', zoneId }`  กดแถว · ‹ › · ถัดไป · ไปแก้ · เปิด X · หลังเพิ่มพื้นที่
 *   `{ type:'list' }`          "← พื้นที่ทั้งหมด" (หน้าเดียวเท่านั้น)
 *   `{ type:'pop', zoneId }`   เบราว์เซอร์ย้อน/ไปหน้า — `zoneId` ของชั้นที่ไปถึง (null = ชั้นใบ)
 *   `{ type:'tab', tab }`      สลับแท็บ หน้างาน/สรุปส่งผล
 *   `{ type:'confirm' }` · `{ type:'cancel' }`  คำตอบของกล่อง "ทิ้งค่าที่ยังไม่บันทึก?"
 *   `{ type:'mode' }`          ความกว้างข้ามเส้น 1000 (หมุนแท็บเล็ต) — อ่านโหมดใหม่จาก `split`
 *   `{ type:'zones' }`         รายการพื้นที่เปลี่ยน (ลบพื้นที่ที่เพิ่ม · โหลดใหม่) — อ่านจาก `zoneIds`
 *   `{ type:'settle' }`        ไม่มีเหตุการณ์ย้อนตามคำสั่งย้อนของเรา — ล้าง `skip`
 * @param ctx `{ dirty, pageDirty, split, tab, zoneIds, defaultZoneId }`
 *   `dirty` = พื้นที่ที่เปิดอยู่มีค่าพิมพ์ค้าง · `pageDirty` = ของค้างระดับหน้า (การเคาะของหัวหน้า · ข้อความถึง
 *   หัวหน้า · รูปที่ยังส่งไม่เสร็จ) — ถามเฉพาะตอน **ออกจากหน้า** · `tab` = แท็บที่เปิดอยู่ (`'field'|'result'`) ·
 *   `defaultZoneId` = `surveyDefaultZoneId(...)`
 * @returns `{ state, effects }` — effects ทำตามลำดับ:
 *   `{kind:'push'|'replace', zoneId|null, layer?, tab?}` (null = URL ของใบ · `layer:true` = ชั้นเปล่า ·
 *   `tab:'result'` = รายการของแท็บสรุป) ·
 *   `{kind:'back', steps}` ·
 *   `{kind:'ask', from, to, via}` · `{kind:'resetDraft'}` (ทิ้งร่างของพื้นที่ = เปลี่ยน key) ·
 *   `{kind:'scroll', to:'top'|'restore'|'pane'}` · `{kind:'focus', target:'heading'|'row'|'list', zoneId?}` ·
 *   `{kind:'tab', tab, zoneId?}` (`zoneId` = ชั้นพื้นที่ที่รายการนี้เป็นอยู่ — แท็บหน้างานเขียน `?zone=` กลับ)
 */
export function surveyZoneRouteStep(state = SURVEY_ZONE_ROUTE_START, event = {}, {
  dirty = false, pageDirty = false, split = false, tab = null, zoneIds = [], defaultZoneId = null,
} = {}) {
  const s = { ...SURVEY_ZONE_ROUTE_START, ...(state || {}) };
  /* ค่าค้างมีความหมายเฉพาะตอนมีพื้นที่เปิดอยู่ — หน้ารายการไม่มีร่างให้ทิ้ง */
  const unsaved = dirty === true && s.shown !== null;
  const fallback = isKnown(zoneIds, idOf(defaultZoneId)) ? idOf(defaultZoneId) : null;

  switch (event?.type) {
    case 'init': {
      const mode = split ? 'split' : 'pages';
      const here = idOf(event.here);
      const blank = event.blank === true;
      const asked = idOf(event.zoneId) ?? here;
      /* ลิงก์ที่ชี้พื้นที่ที่ไม่มีแล้ว = เปิดเหมือนไม่มีลิงก์ (หน้าเดียว: รายการ · สองบาน: พื้นที่ตั้งต้น) */
      const target = isKnown(zoneIds, asked) ? asked : (mode === 'split' ? fallback : null);
      /* 🐞 UAT 25/09 **รายการนี้คือชั้นพื้นที่ของเราเองอยู่แล้ว** (รีเฟรช · ดึงลงรีเฟรช · iOS โหลดแท็บใหม่หลังกล้อง ·
         ย้อนกลับมาจากหน้าที่ไปด้วยลิงก์) — เดิมแทนที่เป็นชั้นใบแล้วดันซ้ำทุกครั้ง ⇒ กองโตเป็น `[ใบ, ใบ, พื้นที่]`
         ปุ่มย้อนที่ไม่ทำอะไรสะสมทีละครั้ง และสองบานย้อนลงชั้นใบซ้ำแล้วด่านค่าค้างหลุด (ย้อนอีกครั้ง = ออกหน้าไม่ถาม)
         ⇒ ชั้นใบอยู่ข้างล่างแล้ว: พื้นที่เดิม = ไม่แตะประวัติ · พื้นที่อื่น = แทนที่ชั้นบน · ไม่มีพื้นที่ให้โชว์ = ย้อนลงชั้นใบ
         🐞 review 26/09 ยกเว้น **สองบาน / แท็บสรุป** — คงรายการนี้เป็นชั้นเปล่า: สองบานย้อนแล้วต้องยังถึงด่านออกจากหน้า ·
            แท็บสรุปย้อน = URL เปลี่ยน แท็บเด้งไปหน้างานใต้มือ (ชั้นเปล่าของเราเองอยู่แล้ว = ไม่แตะเลย) */
      if (here !== null || blank) {
        const start = { ...SURVEY_ZONE_ROUTE_START, mode };
        if (target !== null && target === here) return { state: { ...start, shown: target, above: true }, effects: [] };
        if (target) return { state: { ...start, shown: target, above: true }, effects: [layerWrite('replace', target, tab)] };
        if (mode === 'split' || tab === 'result') {
          return { state: { ...start, above: true }, effects: blank ? [] : [layerWrite('replace', null, tab)] };
        }
        return { state: { ...start, skip: 1 }, effects: [{ kind: 'back', steps: 1 }] };
      }
      /* 🐞 review 26/09 **เริ่มบนแท็บสรุป** (กระดิ่ง · answerVia `?tab=result`) — เดิมตัวต่อสายรอกลับหน้างานถึงเริ่ม ⇒ สองบาน
         กดย้อนตอนการเคาะค้าง = ออกหน้าไม่ถาม · ตอนนี้เริ่มทั้งสองแท็บ ทุกการเขียนบนแท็บสรุปคง `?tab=result` (กุญแจพกพื้นที่)
         · สองบานที่ไม่มีพื้นที่ให้โชว์ (ตัดออกหมด · ยังไม่มีพื้นที่) ดัน **ชั้นเปล่า** — เดิมไม่ดัน ⇒ ย้อนครั้งแรกออกหน้าไม่ถาม
         · หน้าเดียวไม่มีลิงก์พื้นที่ = อยู่ชั้นใบ (รายการ) เหมือนเดิม — มติ: หน้าเดียวไม่ถามของค้างระดับหน้าตอนย้อน */
      /* 🐞 review 26/09 รอบสอง: **ชั้นใบใต้ชั้นบนเป็น URL ของแท็บหน้างานเสมอ** — เดิมเขียน `?tab=result` ลงชั้นใบด้วย แล้วสลับแท็บเขียนทับได้
         แค่ชั้นบน ⇒ กลับหน้างาน → หมุนเป็นหน้าเดียว → ย้อน = ตกแท็บสรุป (ควรเป็นรายการพื้นที่) · ชั้นใบคือ "รายการ" ของหน้าเดียว
         ⚠️ ไม่มีชั้นบน (หน้าเดียวบนแท็บสรุป) = คง URL เดิม — ไม่งั้นแท็บเด้งไปหน้างานใต้มือตอนเปิดหน้า */
      const layered = target !== null || mode === 'split';
      const effects = [{ kind: 'replace', zoneId: null, ...(!layered && tab === 'result' ? { tab } : {}) }];
      if (layered) effects.push(layerWrite('push', target, tab));
      return {
        state: { ...SURVEY_ZONE_ROUTE_START, mode, shown: target, above: layered },
        effects,
      };
    }

    case 'open': {
      const to = idOf(event.zoneId);
      if (!isKnown(zoneIds, to) || to === s.shown) return same(s);
      if (unsaved) return ask(s, { to, via: 'nav' });
      return toZone(s, to);
    }

    case 'list': {
      if (s.mode === 'split' || s.shown === null) return same(s);
      if (unsaved) return ask(s, { to: null, via: 'nav' });
      return toSheet(s);
    }

    case 'pop': {
      const to = idOf(event.zoneId);
      /* 🐞 review 26/09 ตอบ "ทิ้งแล้วออก" แล้วการย้อนของเราตกรายการของหน้านี้เอง (กองเก่า `[ใบ, ใบ, พื้นที่]`) — ผู้ใช้ตอบออกแล้ว
         และร่างไม่ถูกทิ้งตอนตอบ (ด่านถามจะเด้งซ้ำ) ⇒ ย้อนต่อจนพ้นหน้า · ย้อนต่อไม่ได้ = `settle` จำว่าชั้นใบคือรายการแรก */
      if (s.leaving) return { state: { ...s, above: false }, effects: [{ kind: 'back', steps: 1 }] };
      if (s.skip > 0) {
        /* 🐞 UAT 25/09 สองบานย้อนออก (ไม่มีค่าค้าง) แล้ว "ย้อนเอง" ไปตกชั้นใบซ้ำ **ของหน้านี้เอง** (กองเก่าที่มี `[ใบ, ใบ]`)
           — เดิมกิน skip แล้วค้างสภาพ "ไม่มีชั้นบน แต่บานขวายังโชว์พื้นที่" ⇒ ช่างพิมพ์ต่อ แล้วย้อนอีกครั้งหลุดออกหน้า
           โดยไม่มีใครถาม ⇒ ยังอยู่ในหน้า = ดันชั้นพื้นที่ที่โชว์อยู่กลับ (ด่านค่าค้างทำงานเหมือนเดิม · ดันแล้วตัดชั้นซ้ำทิ้ง)
           · review 26/09 บานขวาว่าง = ดันชั้นเปล่ากลับ (ด่านของค้างระดับหน้าก็ต้องไม่หลุด) · แท็บสรุปคง `?tab=result` */
        if (s.mode === 'split' && !s.above && to === null) {
          return { state: { ...s, skip: s.skip - 1, above: true }, effects: [layerWrite('push', s.shown, tab)] };
        }
        return same({ ...s, skip: s.skip - 1 });
      }
      if (to === null) {
        if (s.mode === 'split') {
          /* สองบานไม่มีหน้ารายการ — ลงถึงชั้นใบ = ผู้ใช้กำลังออกจากหน้า
             🐞 UAT 25/09 ของค้างระดับหน้า (การเคาะ · ข้อความถึงหัวหน้า · รูปที่ยังส่ง) ก็ต้องถาม — เดิมดูแค่ค่าในพื้นที่
             แล้วตัวต่อสายสั่งย้อนออกเอง ⇒ การเคาะบนแท็บสรุปหายเงียบ · ดันรายการที่ผู้ใช้อยู่กลับ **แท็บเดิม**
             (อยู่แท็บสรุป = `?tab=result` — ดัน `?zone=` แล้วแท็บเด้งไปหน้างานใต้กล่องถาม)
             🐞 review 26/09 ชั้นใบคือรายการแรกของแท็บ (เคยตอบออกแล้วไม่ไปไหน) = ย้อนออกไม่ได้อยู่แล้ว ⇒ ไม่ถาม ไม่ดันกลับ
             (เดิมถาม "ทิ้งแล้วออก" ทุกครั้งแล้วไม่ไปไหน · ปุ่มย้อนของเครื่องดับเองที่รายการแรก) */
          if (s.root) return same({ ...s, above: false });
          if (unsaved || pageDirty === true) {
            return {
              state: { ...s, above: true, pending: { to: null, via: 'leave' } },
              effects: [
                layerWrite('push', s.shown, tab),
                { kind: 'ask', from: s.shown, to: null, via: 'leave' },
              ],
            };
          }
          return { state: { ...s, above: false, skip: s.skip + 1 }, effects: [{ kind: 'back', steps: 1 }] };
        }
        if (s.shown === null) return same({ ...s, above: false });
        if (unsaved) {
          return {
            state: { ...s, above: true, pending: { to: null, via: 'pop' } },
            effects: [{ kind: 'push', zoneId: s.shown }, { kind: 'ask', from: s.shown, to: null, via: 'pop' }],
          };
        }
        return { state: { ...s, shown: null, above: false }, effects: backToListEffects(s.shown) };
      }
      /* ชั้นที่ชี้พื้นที่ที่ไม่มีแล้ว (ถูกลบไปจากอีกเครื่อง) — คืน URL ให้ตรงกับที่จอโชว์อยู่ ไม่ย้ายไปไหน */
      if (!isKnown(zoneIds, to)) {
        return { state: s, effects: [{ kind: 'replace', zoneId: s.shown }] };
      }
      if (to === s.shown) return same({ ...s, above: true });
      if (unsaved) {
        return {
          state: { ...s, above: true, pending: { to, via: 'pop' } },
          effects: [{ kind: 'replace', zoneId: s.shown }, { kind: 'ask', from: s.shown, to, via: 'pop' }],
        };
      }
      return { state: { ...s, shown: to, above: true }, effects: arrive(s.mode) };
    }

    case 'tab': {
      /* 🐞 UAT 25/09 กดแท็บที่เลือกอยู่แล้ว (แถบแท็บยิง onChange ทั้งแท็บเดิม) — เดิมมีค่าค้าง = กล่อง "ทิ้ง?" ของการย้าย
         ที่ไม่ได้ไปไหน · ไม่มีค่าค้าง = เขียน URL ใบเปล่าทับ `?zone=` ⇒ ไม่ทำอะไร */
      if (!event.tab || event.tab === tab) return same(s);
      if (unsaved) return ask(s, { to: event.tab, via: 'tab' });
      /* 🐞 review 26/09 รอบสาม: หน้าเดียวกลับแท็บหน้างานบนชั้นเปล่าที่ค้างมาจากสองบาน (หมุนตอนอยู่แท็บสรุป) — ชั้นเปล่าบนรายการ
         = ปุ่มย้อนที่ไม่ทำอะไร ⇒ ย้อนทิ้งเองแบบเดียวกับตอนหมุน */
      if (s.mode === 'pages' && s.above && s.shown === null && event.tab !== 'result') {
        return {
          state: { ...s, above: false, skip: s.skip + 1 },
          effects: [{ kind: 'tab', tab: event.tab, ...layerOf(s) }, { kind: 'back', steps: 1 }],
        };
      }
      return { state: s, effects: [{ kind: 'tab', tab: event.tab, ...layerOf(s) }] };
    }

    case 'confirm': {
      const p = s.pending;
      if (!p) return same(s);
      const reset = { kind: 'resetDraft' };
      if (p.via === 'leave') {
        /* ชั้นพื้นที่ที่ดันกลับไว้ + ชั้นใบ = ย้อนสองชั้นถึงหน้าที่มาก่อน (ไม่ใช่เหตุการณ์ของหน้านี้แล้ว)
           🐞 review 26/09 **ไม่ทิ้งร่าง** — ออกจริง = หน้าถูกถอดเองอยู่แล้ว · แท็บที่เปิดใหม่ (ไม่มีหน้าก่อนหน้า) ย้อนสองชั้นไม่เกิดอะไร
           เดิมทิ้งร่างก่อนย้อน ⇒ ค่าที่พิมพ์หายทั้งที่ยังอยู่หน้าเดิม · `leaving` รอผล (ย้อนตกหน้านี้ = ย้อนต่อ · `settle` = ออกไม่ได้) */
        return { state: { ...s, pending: null, leaving: true }, effects: [{ kind: 'back', steps: 2 }] };
      }
      if (p.via === 'tab') {
        return { state: { ...s, pending: null }, effects: [reset, { kind: 'tab', tab: p.to, ...layerOf(s) }] };
      }
      if (p.to === null) {
        const out = toSheet(s);
        return { state: out.state, effects: [reset, ...out.effects] };
      }
      if (p.via === 'pop') {
        /* ไปหน้า (Forward) ถึงชั้นพื้นที่อื่น — ชั้นนั้นถูกแทนด้วยพื้นที่เดิมไว้ตอนถาม ⇒ แทนกลับเป็นปลายทาง */
        return {
          state: { ...s, shown: p.to, above: true, pending: null },
          effects: [reset, { kind: 'replace', zoneId: p.to }, ...arrive(s.mode)],
        };
      }
      const out = toZone(s, p.to);
      return { state: out.state, effects: [reset, ...out.effects] };
    }

    case 'cancel':
      /* ชั้นที่ดัน/แทนกลับไว้ตอนถามตรงกับที่จอโชว์อยู่แล้ว ⇒ ไม่มีอะไรต้องทำนอกจากลืมคำถาม */
      return same({ ...s, pending: null });

    case 'mode': {
      const mode = split ? 'split' : 'pages';
      if (mode === s.mode) return same(s);
      /* หมุนเป็นแนวนอนตอนอยู่หน้ารายการ — บานขวาต้องมีพื้นที่ (บานว่างคือจอครึ่งหนึ่งที่ไม่ตอบอะไร)
         ⚠️ ไม่ย้ายโฟกัส/ไม่เลื่อน — หมุนจอไม่ใช่การกดของผู้ใช้
         🐞 review 26/09 ตัวต่อสายส่งเหตุการณ์นี้ **ทุกแท็บ** แล้ว (เดิมเฉพาะแท็บหน้างาน ⇒ หมุนบนแท็บสรุปแล้วย้อน ใช้โหมดเก่า:
            สองบานเก่าพาออกทั้งหน้าแทนกลับรายการ · หน้าเดียวเก่าไม่มีชั้นให้ด่านออกจากหน้า) ⇒ อยู่แท็บสรุปเขียนคง `?tab=result`
            · ไม่มีพื้นที่ตั้งต้น = ชั้นเปล่า (สองบานต้องมีชั้นเสมอ) */
      if (mode === 'split' && s.shown === null && (fallback || !s.above)) {
        /* ยังไม่มีชั้นบน + อยู่แท็บสรุป = รายการนี้คือชั้นใบที่สลับแท็บเขียนเป็น `?tab=result` ไว้ ⇒ คืนชั้นใบเป็น URL หน้างานก่อนดัน
           (🐞 review 26/09 รอบสอง: ชั้นใบค้าง `?tab=result` แล้วย้อนจากพื้นที่ตกแท็บสรุปแทนรายการ) · แท็บเด้งแวบเดียวตอนหมุนจอ */
        /* `ours` = รายการที่เปิดอยู่คือชั้นของเราเอง (กุญแจ `surveyZone`/`surveyLayer` — ตัวต่อสายอ่านให้) แม้สภาพจะคิดว่าอยู่ชั้นใบ
           (ไปหน้า/Forward กลับขึ้นชั้นแท็บสรุป — `pop` อ่านแค่ `?zone=`) ⇒ แทนที่ชั้นนั้น ไม่ใช่เขียนชั้นใบทับชั้นเราแล้วดันซ้อน (รอบสาม) */
        const onLayer = s.above || event.ours === true;
        const base = !onLayer && tab === 'result' ? [{ kind: 'replace', zoneId: null }] : [];
        return {
          state: { ...s, mode, shown: fallback, above: true },
          effects: [...base, layerWrite(onLayer ? 'replace' : 'push', fallback, tab)],
        };
      }
      /* สองบาน → หน้าเดียวบนรายการของแท็บหน้างาน ที่มีชั้นเปล่าค้าง (บานขวาว่าง) — หน้าเดียวไม่มีบานขวา ชั้นเปล่ากลายเป็นปุ่มย้อนที่
         ไม่ทำอะไร (🐞 review 26/09 รอบสอง) ⇒ ย้อนทิ้งชั้นเปล่าเอง · แท็บสรุปคงไว้ (ย้อนจากแท็บสรุป = กลับรายการ) */
      if (mode === 'pages' && s.above && s.shown === null && tab !== 'result') {
        return { state: { ...s, mode, above: false, skip: s.skip + 1 }, effects: [{ kind: 'back', steps: 1 }] };
      }
      return same({ ...s, mode });
    }

    case 'zones': {
      if (s.shown === null) {
        /* 🐞 UAT 25/09 สองบานที่เริ่มตอนใบยังไม่มีพื้นที่ — พื้นที่มาถึงทีหลัง (เพิ่ม · โหลดใหม่) บานขวาค้างคำว่างตลอด
           ⇒ ดันพื้นที่ตั้งต้นขึ้นบานขวา ท่าเดียวกับหมุนจอ (ไม่เลื่อน/ไม่ย้ายโฟกัส — ไม่ใช่การกดของผู้ใช้) */
        if (s.mode === 'split' && fallback) {
          return {
            state: { ...s, shown: fallback, above: true },
            effects: [{ kind: s.above ? 'replace' : 'push', zoneId: fallback }],
          };
        }
        return same(s);
      }
      if (isKnown(zoneIds, s.shown)) return same(s);
      /* พื้นที่ที่เปิดอยู่หายไป (ลบพื้นที่ที่เพิ่งเพิ่ม · ลิงก์เก่า) — ร่างของมันไม่มีที่ให้บันทึกแล้ว ⇒ ไม่ถาม
         สองบาน: ย้ายไปพื้นที่ตั้งต้น (ไม่เหลือเลย = ชั้นเปล่า) · หน้าเดียว: กลับรายการ */
      const cleared = { ...s, pending: null };
      if (s.mode === 'split' && fallback) {
        return {
          state: { ...cleared, shown: fallback, above: true },
          effects: [{ kind: s.above ? 'replace' : 'push', zoneId: fallback }, ...arrive('split')],
        };
      }
      /* 🐞 review 26/09 สองบานที่ไม่เหลือพื้นที่ให้โชว์ = ชั้นเปล่าแทนชั้นเดิม — เดิมย้อนลงชั้นใบ ⇒ ย้อนครั้งถัดไปออกหน้าไม่ถาม */
      if (s.mode === 'split') {
        return {
          state: { ...cleared, shown: null, above: true },
          effects: [layerWrite(s.above ? 'replace' : 'push', null, tab), { kind: 'focus', target: 'list' }],
        };
      }
      return {
        state: { ...cleared, shown: null, above: false, skip: s.above ? s.skip + 1 : s.skip },
        effects: [
          s.above ? { kind: 'back', steps: 1 } : { kind: 'replace', zoneId: null },
          { kind: 'focus', target: 'list' },
        ],
      };
    }

    case 'settle':
      /* 🐞 review 26/09 ตอบออกแล้วเบราว์เซอร์ไม่พาไปไหน = ไม่มีหน้าก่อนชั้นใบ (แท็บที่เปิดใหม่) ⇒ จำไว้ ย้อนครั้งหน้าไม่ถามเรื่องที่ทำไม่ได้ */
      if (s.leaving) return same({ ...s, skip: 0, leaving: false, root: true });
      return s.skip ? same({ ...s, skip: 0 }) : same(s);

    default:
      return same(s);
  }
}
