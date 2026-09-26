// ── ตัวทำตาม "ผลที่ต้องทำ" ของประวัติหน้าพื้นที่ (แผน §10.5 S7 · §3.3) — ประวัติ/นาฬิกา/กล่องถามปลอม ─────────
//
// ⭐ ตัวตัดสินมีเทสต์ครบทุกแถวแล้ว (surveyZoneRoute.test.mjs) — ที่นี่ตรึงของที่ตัวตัดสินมองไม่เห็น:
//   URL + กุญแจบนรายการประวัติ · ลำดับ "ทิ้งร่าง → เขียนประวัติ" · กล่องถามไม่ซ้อน · การย้อนที่เราสั่งแล้วไม่มีเหตุการณ์ตามมา
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURVEY_ZONE_SETTLE_MS, createSurveyZoneRouteRunner } from './surveyZoneRouteRunner.js';

/** เบราว์เซอร์ปลอม — จดทุกคำสั่งตามลำดับ · กล่องถามตอบตามที่เทสต์สั่ง · นาฬิกาเดินด้วยมือ */
function rig({ split = false, dirtyZoneIds = [], answers = [] } = {}) {
  const log = [];
  const page = { requestId: 'DR-1', zoneIds: ['z1', 'z2', 'z3'], dirtyZoneIds, defaultZoneId: 'z1', split };
  const timers = [];
  const asks = [];
  const tabs = [];
  const runner = createSurveyZoneRouteRunner({
    read: () => page,
    history: {
      push: (data, url) => log.push(['push', url, data]),
      replace: (data, url) => log.push(['replace', url, data]),
      go: (delta) => log.push(['go', delta]),
    },
    onAsk: (effect) => {
      asks.push(effect);
      log.push(['ask', effect.via]);
      return Promise.resolve(answers.shift() ?? false);
    },
    onResetDraft: () => log.push(['resetDraft']),
    onTab: (tab, zoneId) => { log.push(['tab', tab]); tabs.push([tab, zoneId]); },
    onShown: () => {},
    queueDom: (effect) => log.push(['dom', effect.kind, effect.to || effect.target]),
    scrollY: () => 420,
    setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; },
    clearTimer: (id) => { if (timers[id]) timers[id].live = false; },
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const fire = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });
  return { runner, log, page, timers, asks, tabs, tick, fire };
}

test('เขียนประวัติ: URL ของใบ/พื้นที่ + กุญแจของเราเองบนรายการ (ปุ่มย้อนอ่าน ?zone= ของรายการที่ไปถึง)', () => {
  const { runner, log } = rig();
  runner.dispatch({ type: 'init', zoneId: 'z2' });
  assert.deepEqual(log, [
    ['replace', '/service/surveys/DR-1', { surveySheet: true }],
    ['push', '/service/surveys/DR-1?zone=z2', { surveyZone: 'z2' }],
  ]);
  assert.equal(runner.state().shown, 'z2');
});

test('ออกจากหน้ารายการ (หน้าเดียว) จำตำแหน่งเลื่อน · กลับรายการสั่งคืนตำแหน่งแล้วโฟกัสแถวเดิม', () => {
  const { runner, log } = rig();
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z3' });
  assert.equal(runner.savedScroll(), 420);
  assert.deepEqual(log.slice(1), [
    ['push', '/service/surveys/DR-1?zone=z3', { surveyZone: 'z3' }],
    ['dom', 'scroll', 'top'],
    ['dom', 'focus', 'heading'],
  ]);
  log.length = 0;
  runner.dispatch({ type: 'list' });
  assert.deepEqual(log, [['go', -1], ['dom', 'scroll', 'restore'], ['dom', 'focus', 'row']]);
});

test('🔴 การย้อนที่เราสั่งแล้วไม่มีเหตุการณ์ตามมา (แท็บเพิ่งเปิด) — settle ล้าง skip ไม่ให้กินปุ่มย้อนจริงครั้งถัดไป', () => {
  const { runner, timers, fire } = rig();
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z1' });
  runner.dispatch({ type: 'list' });
  assert.equal(runner.state().skip, 1);
  assert.equal(timers.at(-1).ms, SURVEY_ZONE_SETTLE_MS);
  fire();
  assert.equal(runner.state().skip, 0);
});

test('เหตุการณ์ย้อนมาถึงตามคำสั่ง = กิน skip และยกเลิกนาฬิกา settle', () => {
  const { runner, timers } = rig();
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z1' });
  runner.dispatch({ type: 'list' });
  runner.dispatch({ type: 'pop', zoneId: null });
  assert.equal(runner.state().skip, 0);
  assert.equal(timers.at(-1).live, false, 'settle ไม่ต้องวิ่งแล้ว');
});

test('ค่าค้าง + ปุ่มย้อนของเครื่อง: ดันชั้นเดิมกลับก่อน แล้วถาม · ตอบ "ทิ้ง" = ทิ้งร่างก่อน แล้วค่อยย้อนจริง', async () => {
  const { runner, log, page, tick } = rig({ answers: [true] });
  runner.dispatch({ type: 'init', zoneId: 'z2' });
  page.dirtyZoneIds = ['z2'];
  log.length = 0;
  runner.dispatch({ type: 'pop', zoneId: null });
  assert.deepEqual(log[0], ['push', '/service/surveys/DR-1?zone=z2', { surveyZone: 'z2' }], 'undo ก่อนถาม');
  await tick();
  assert.deepEqual(log[1], ['ask', 'pop']);
  await tick();
  const after = log.slice(2).map((row) => row[0]);
  assert.deepEqual(after.slice(0, 2), ['resetDraft', 'go'], 'ทิ้งร่างก่อน — ไม่งั้นหน้าพื้นที่ที่ถูกถอดรายงาน "ค้าง" อีกรอบ');
  assert.equal(runner.state().shown, null);
});

test('ตอบ "กลับไปบันทึก" = อยู่ที่เดิม ไม่แตะประวัติอีก ไม่ทิ้งร่าง', async () => {
  const { runner, log, page, tick } = rig({ answers: [false] });
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z1' });
  page.dirtyZoneIds = ['z1'];
  log.length = 0;
  runner.dispatch({ type: 'open', zoneId: 'z2' });
  await tick();
  await tick();
  assert.deepEqual(log, [['ask', 'nav']]);
  assert.equal(runner.state().shown, 'z1');
  assert.equal(runner.state().pending, null);
});

test('🔴 กล่องถามไม่ซ้อน — กดย้ายซ้ำระหว่างกล่องเปิด ไม่เปิดกล่องใบที่สอง (กล่องกลางถือได้ใบเดียว ใบแรกจะค้างไม่ตอบ)', async () => {
  const { runner, asks, page, tick } = rig({ answers: [true] });
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z1' });
  page.dirtyZoneIds = ['z1'];
  runner.dispatch({ type: 'open', zoneId: 'z2' });
  runner.dispatch({ type: 'open', zoneId: 'z3' });
  await tick();
  assert.equal(asks.length, 1);
  await tick();
  assert.equal(runner.state().shown, 'z3', 'คำตอบใช้กับการย้ายล่าสุดที่รออยู่');
});

test('ค่าค้างของพื้นที่อื่น (ไม่ใช่ที่เปิดอยู่) ไม่ทำให้ถาม', () => {
  const { runner, log } = rig({ dirtyZoneIds: ['z3'] });
  runner.dispatch({ type: 'init', zoneId: null });
  runner.dispatch({ type: 'open', zoneId: 'z1' });
  log.length = 0;
  runner.dispatch({ type: 'open', zoneId: 'z2' });
  assert.equal(log[0][0], 'replace');
});

test('สลับแท็บตอนไม่มีค่าค้าง = สลับเลย (ประวัติไม่ถูกแตะโดยตัวทำ)', () => {
  const { runner, log } = rig({ split: true });
  runner.dispatch({ type: 'init', zoneId: null });
  log.length = 0;
  runner.dispatch({ type: 'tab', tab: 'result' });
  assert.deepEqual(log, [['tab', 'result']]);
});

/* ══ 🐞 UAT 25/09 — รีวิวเส้นประวัติของจอหน้างาน (#15–#17) ══════════════════════════════════════════════ */

test('🐞 รีเฟรชบนรายการ ?zone= ของเราเอง (กุญแจ surveyZone) — ไม่เขียนประวัติเลย · ย้อนครั้งถัดไปยังถามค่าค้าง', async () => {
  const { runner, log, page, tick } = rig({ split: true, answers: [false] });
  runner.dispatch({ type: 'init', zoneId: 'z2', here: 'z2' });
  assert.deepEqual(log, [], 'เดิม: replace ใบ + push z2 ทุกครั้งที่รีเฟรช ⇒ กอง [ใบ, ใบ, z2]');
  page.dirtyZoneIds = ['z2'];
  runner.dispatch({ type: 'pop', zoneId: null });
  await tick();
  assert.deepEqual(log.map((row) => row[0]), ['push', 'ask']);
});

test('🐞 สองบาน: ย้อนออกแล้วตกชั้นใบซ้ำของหน้านี้ = ดัน ?zone= กลับ · พิมพ์แล้วย้อนอีกครั้งยังถาม', async () => {
  const { runner, log, page, tick } = rig({ split: true, answers: [false] });
  runner.dispatch({ type: 'init', zoneId: 'z1' });
  log.length = 0;
  runner.dispatch({ type: 'pop', zoneId: null });
  assert.deepEqual(log, [['go', -1]]);
  runner.dispatch({ type: 'pop', zoneId: null });
  assert.deepEqual(log[1], ['push', '/service/surveys/DR-1?zone=z1', { surveyZone: 'z1' }]);
  page.dirtyZoneIds = ['z1'];
  log.length = 0;
  runner.dispatch({ type: 'pop', zoneId: null });
  await tick();
  assert.deepEqual(log.map((row) => row[0]), ['push', 'ask'], 'เดิม: go -1 ออกหน้า ค่าที่พิมพ์หายไม่ถาม');
});

test('🐞 สองบาน: ย้อนออกจากแท็บสรุปตอนการเคาะค้าง — ดันรายการแท็บสรุปกลับ (กุญแจชั้นพื้นที่คงอยู่) · ถามแบบออกจากหน้า · ตอบทิ้ง = go -2', async () => {
  const { runner, log, page, asks, tick } = rig({ split: true, answers: [true] });
  runner.dispatch({ type: 'init', zoneId: 'z2' });
  Object.assign(page, { pageDirty: true, tab: 'result' });
  log.length = 0;
  runner.dispatch({ type: 'pop', zoneId: null });
  assert.deepEqual(log[0], ['push', '/service/surveys/DR-1?tab=result', { surveyZone: 'z2' }]);
  await tick();
  assert.deepEqual(asks, [{ kind: 'ask', from: 'z2', to: null, via: 'leave' }]);
  await tick();
  // 🐞 review 26/09 ไม่ทิ้งร่างก่อนออก — ออกจริง = หน้าถูกถอดอยู่แล้ว · ออกไม่ได้ (แท็บใหม่) = ค่าต้องยังอยู่
  assert.deepEqual(log.slice(2).map((row) => row[0]), ['go']);
  assert.deepEqual(log.at(-1), ['go', -2]);
});

test('🐞 สลับแท็บพกชั้นพื้นที่ไปให้ผู้เรียก · กดแท็บเดิมซ้ำไม่ถึงผู้เรียก', () => {
  const { runner, page, tabs } = rig({ split: true, dirtyZoneIds: [] });
  runner.dispatch({ type: 'init', zoneId: 'z2' });
  page.tab = 'field';
  runner.dispatch({ type: 'tab', tab: 'field' });
  assert.deepEqual(tabs, [], 'แท็บเดิม = ไม่ทำอะไร');
  runner.dispatch({ type: 'tab', tab: 'result' });
  page.tab = 'result';
  runner.dispatch({ type: 'tab', tab: 'field' });
  assert.deepEqual(tabs, [['result', 'z2'], ['field', 'z2']], 'กลับหน้างาน = ?zone=z2 ไม่ใช่ URL ใบเปล่า');
});

/* ══ 🐞 review 26/09 — กองประวัติจริง: เริ่มบนแท็บสรุป · ออกไม่ได้ในแท็บใหม่ · หมุนจอตอนอยู่แท็บสรุป ══════════════ */

const SHEET = '/service/surveys/DR-1';

/** เบราว์เซอร์ปลอมที่มี **กองประวัติจริง** — `go()` ส่ง popstate ทีหลัง · เกินกอง = ไม่เกิดอะไรเลย (แบบเบราว์เซอร์จริง) ·
 *  popstate ของ path อื่น = ออกจากหน้าแล้ว (ตัวต่อสายไม่ส่งต่อ) · แท็บของหน้าเดินตาม URL **หลัง** ตัวต่อสายตอบ
 *  (ตัวต่อสายอ่านแท็บของรอบวาดก่อน — หน้าวาดใหม่ทีหลัง) · `reload()` = รีเฟรช (ตัวทำใหม่บนกองเดิม) */
function stackRig({ entries, split = false, tab = 'field', defaultZoneId = 'z1', answers = [] }) {
  const stack = entries.map((url) => ({ url, data: {} }));
  let at = stack.length - 1;
  const log = [];
  const timers = [];
  const page = {
    requestId: 'DR-1', zoneIds: ['z1', 'z2', 'z3'], defaultZoneId, split, tab,
    dirtyZoneIds: [], pageDirty: false, left: false, draftEpoch: 0,
  };
  const hrefOf = (next, zoneId) => (next === 'result' ? `${SHEET}?tab=result` : zoneId ? `${SHEET}?zone=${zoneId}` : SHEET);
  let runner = null;
  const popstate = () => {
    const [path, search = ''] = stack[at].url.split('?');
    if (path !== SHEET) { page.left = true; return; }
    runner.dispatch({ type: 'pop', zoneId: new URLSearchParams(search).get('zone') });
    page.tab = /tab=result/.test(stack[at].url) ? 'result' : 'field';
  };
  const make = () => createSurveyZoneRouteRunner({
    read: () => page,
    history: {
      push: (data, url) => { stack.splice(at + 1); stack.push({ url, data }); at = stack.length - 1; },
      replace: (data, url) => { stack[at] = { url, data }; },
      go: (delta) => {
        const to = at + delta;
        if (to < 0 || to >= stack.length) { log.push(['go-nothing', delta]); return; }
        log.push(['go', delta]);
        setImmediate(() => { at = to; popstate(); });
      },
      entry: () => stack[at].data,
    },
    onAsk: (effect) => { log.push(['ask', effect.via]); return Promise.resolve(answers.shift() ?? false); },
    onResetDraft: () => { page.draftEpoch += 1; page.dirtyZoneIds = []; log.push(['resetDraft']); },
    onTab: (next, zoneId, layer) => {
      page.tab = next;
      stack[at] = { url: hrefOf(next, zoneId), data: zoneId ? { surveyZone: zoneId } : layer ? { surveyLayer: true } : { surveySheet: true } };
    },
    onShown: () => {},
    queueDom: () => {},
    setTimer: (fn) => { timers.push({ fn, live: true }); return timers.length - 1; },
    clearTimer: (id) => { if (timers[id]) timers[id].live = false; },
  });
  runner = make();
  return {
    page, log, stack,
    runner: () => runner,
    reload: () => { runner = make(); },
    /* ตัวต่อสายเริ่ม — `?zone=` ของรายการที่เปิดอยู่ + กุญแจชั้นพื้นที่ (`layerHere`) */
    start: () => runner.dispatch({
      type: 'init',
      zoneId: new URLSearchParams(stack[at].url.split('?')[1] || '').get('zone'),
      here: stack[at].data.surveyZone ?? null,
    }),
    /* ปุ่มย้อนของเครื่อง — รายการแรกของแท็บ = ปุ่มดับ */
    userBack: () => { if (at === 0) return false; at -= 1; popstate(); return true; },
    settle: () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); }),
    flush: async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); },
    urls: () => stack.map((e, i) => (i === at ? `[${e.url}]` : e.url)),
  };
}

test('🐞 review 26/09 สองบาน เปิดจากกระดิ่งที่แท็บสรุป (?tab=result) · การเคาะค้าง · กดย้อน = ถามออกจากหน้า (เดิมออกเงียบ)', async () => {
  const b = stackRig({ entries: ['/requests/R', `${SHEET}?tab=result`], split: true, tab: 'result', answers: [false, true] });
  b.start();
  assert.deepEqual(b.urls(), ['/requests/R', SHEET, `[${SHEET}?tab=result]`],
    'เริ่มบนแท็บสรุป = ปูชั้นใบ (URL หน้างาน) + ชั้นบนที่คง ?tab=result (เขียน ?zone= = แท็บเด้งไปหน้างาน)');
  assert.deepEqual(b.stack[2].data, { surveyZone: 'z1' }, 'กุญแจพกพื้นที่ — กลับหน้างานได้บานขวาเดิม');
  b.page.pageDirty = true;
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, [['ask', 'leave']]);
  assert.equal(b.page.left, false);
  assert.equal(b.page.tab, 'result', 'ตอบ "กลับไป" = อยู่แท็บสรุปที่เดิม');
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log.slice(1), [['ask', 'leave'], ['go', -2]]);
  assert.equal(b.page.left, true, 'ตอบ "ทิ้งแล้วออก" = ออกจากหน้าจริง');
});

test('🐞 review 26/09 หน้าเดียวบนแท็บสรุป = ไม่ดันชั้น (ย้อนออกหน้าเหมือนเดิม — หน้าเดียวไม่ถามเรื่องของค้างระดับหน้า)', async () => {
  const b = stackRig({ entries: ['/requests/R', `${SHEET}?tab=result`], tab: 'result' });
  b.start();
  assert.deepEqual(b.urls(), ['/requests/R', `[${SHEET}?tab=result]`]);
  b.page.pageDirty = true;
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, []);
  assert.equal(b.page.left, true);
});

test('🐞 review 26/09 สองบานที่ไม่มีพื้นที่ให้โชว์ (ตัดออกหมด) ยังดันชั้นเปล่า · ย้อนตอนการเคาะค้างยังถาม · รีเฟรชไม่ดันซ้อน', async () => {
  const b = stackRig({ entries: ['/prev', SHEET], split: true, defaultZoneId: null });
  b.start();
  assert.deepEqual(b.urls(), ['/prev', SHEET, `[${SHEET}]`], 'เดิม: ไม่ดันอะไร ⇒ ย้อนครั้งแรกออกหน้าเลย');
  assert.deepEqual(b.stack[2].data, { surveyLayer: true }, 'กุญแจชั้นเปล่า — รีเฟรชแล้วรู้ว่าชั้นใบอยู่ข้างล่าง');
  b.reload();
  b.start();
  assert.equal(b.stack.length, 3, 'รีเฟรชบนชั้นเปล่า = ไม่แทนที่เป็นใบแล้วดันซ้ำ');
  b.page.pageDirty = true;
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, [['ask', 'leave']]);
  assert.equal(b.page.left, false);
});

test('🐞 review 26/09 หน้าเดียว → แท็บสรุป → หมุนเป็นสองบาน: ชั้นที่ดันคง ?tab=result · ย้อนตอนการเคาะค้าง = ถามออกจากหน้า', async () => {
  const b = stackRig({ entries: ['/prev', SHEET] });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'result' });
  b.page.split = true;
  b.runner().dispatch({ type: 'mode' });
  assert.deepEqual(b.urls(), ['/prev', SHEET, `[${SHEET}?tab=result]`], 'เดิม: ดัน ?zone=z1 ทับแท็บสรุป · ชั้นใบกลับเป็น URL หน้างาน');
  b.page.pageDirty = true;
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, [['ask', 'leave']]);
  assert.equal(b.page.left, false);
  assert.equal(b.page.tab, 'result');
});

test('🐞 review 26/09 สองบาน → แท็บสรุป → หมุนเป็นหน้าเดียว → ย้อน = รายการพื้นที่ของแท็บหน้างาน ไม่ออกจากหน้า', async () => {
  const b = stackRig({ entries: ['/prev', SHEET], split: true });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'result' });
  b.page.split = false;
  b.runner().dispatch({ type: 'mode' });
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, false, 'เดิม: โหมดค้างสองบาน ⇒ ย้อนออกทั้งหน้า');
  assert.equal(b.page.tab, 'field');
  assert.equal(b.runner().state().shown, null, 'หน้ารายการ');
  assert.deepEqual(b.log, []);
});

test('🐞 review 26/09 รอบสอง: เปิดจากกระดิ่งบนแท็บสรุป (สองบาน) → หน้างาน → หมุนเป็นหน้าเดียว → ย้อน = รายการพื้นที่ (เดิมตกแท็บสรุป)', async () => {
  const b = stackRig({ entries: ['/requests/R', `${SHEET}?tab=result`], split: true, tab: 'result' });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'field' });
  assert.deepEqual(b.urls(), ['/requests/R', SHEET, `[${SHEET}?zone=z1]`]);
  b.page.split = false;
  b.runner().dispatch({ type: 'mode' });
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, false);
  assert.equal(b.page.tab, 'field', 'รายการของแท็บหน้างาน ไม่ใช่แท็บสรุป');
  assert.equal(b.runner().state().shown, null);
});

test('🐞 review 26/09 รอบสอง: หน้าเดียว → แท็บสรุป → หมุนเป็นสองบาน → หน้างาน → หมุนกลับ → ย้อน = รายการพื้นที่', async () => {
  const b = stackRig({ entries: ['/prev', SHEET] });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'result' });
  b.page.split = true;
  b.runner().dispatch({ type: 'mode' });
  b.runner().dispatch({ type: 'tab', tab: 'field' });
  b.page.split = false;
  b.runner().dispatch({ type: 'mode' });
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, false);
  assert.equal(b.page.tab, 'field');
  assert.equal(b.runner().state().shown, null);
});

test('🐞 review 26/09 รอบสอง: สองบานที่ไม่มีพื้นที่ → หมุนเป็นหน้าเดียว → ย้อนครั้งแรกออกหน้า (ไม่ใช่ปุ่มที่ไม่ทำอะไร)', async () => {
  const b = stackRig({ entries: ['/prev', SHEET], split: true, defaultZoneId: null });
  b.start();
  b.page.split = false;
  b.runner().dispatch({ type: 'mode' });
  await b.flush();
  assert.deepEqual(b.urls(), ['/prev', `[${SHEET}]`, SHEET], 'ย้อนลงชั้นใบเอง (ชั้นเปล่าเหลือเป็นรายการ "ไปหน้า")');
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, true);
});

test('🐞 review 26/09 รอบสาม: สองบานไม่มีพื้นที่ → สลับแท็บ → รีเฟรช = กองไม่โต · ย้อนครั้งแรกออกหน้า', async () => {
  const b = stackRig({ entries: ['/prev', SHEET], split: true, defaultZoneId: null });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'result' });
  assert.deepEqual(b.stack[2].data, { surveyLayer: true }, 'สลับแท็บคงกุญแจชั้นเปล่า');
  b.reload();
  b.start();
  assert.equal(b.stack.length, 3, 'เดิม: [prev, ใบ, ใบ, ชั้น] หลังรีเฟรช');
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, true);
});

test('🐞 review 26/09 รอบสาม: สองบานไม่มีพื้นที่ → แท็บสรุป → หมุนเป็นหน้าเดียว → กลับหน้างาน = ทิ้งชั้นเปล่า · ย้อนครั้งแรกออกหน้า', async () => {
  const b = stackRig({ entries: ['/prev', SHEET], split: true, defaultZoneId: null });
  b.start();
  b.runner().dispatch({ type: 'tab', tab: 'result' });
  b.page.split = false;
  b.runner().dispatch({ type: 'mode' });
  b.runner().dispatch({ type: 'tab', tab: 'field' });
  await b.flush();
  b.userBack();
  await b.flush();
  assert.equal(b.page.left, true, 'เดิม: ย้อนครั้งแรกไม่ทำอะไร');
});

test('🐞 review 26/09 รอบสาม: หมุนเป็นสองบานบนชั้นแท็บสรุปของเราเอง (ไปหน้ากลับมา) = แทนที่ชั้นนั้น ไม่เขียนชั้นใบทับแล้วดันซ้อน', () => {
  const b = stackRig({ entries: ['/prev', SHEET, `${SHEET}?tab=result`], tab: 'result' });
  b.stack[2].data = { surveyZone: 'z1' };
  b.start();
  const before = b.stack.length;
  b.page.split = true;
  b.runner().dispatch({ type: 'mode', ours: true });
  assert.equal(b.stack.length, before, 'ไม่ดันซ้อน');
  assert.equal(b.stack[1].url, SHEET, 'ชั้นใบยังเป็น URL หน้างาน');
});

test('🐞 review 26/09 แท็บใหม่ (ไม่มีหน้าก่อนหน้า): ตอบ "ทิ้งแล้วออก" แต่ออกไม่ได้ = ค่าที่พิมพ์ยังอยู่ · ย้อนครั้งถัดไปไม่ถามซ้ำ', async () => {
  const b = stackRig({ entries: [SHEET], split: true, answers: [true, true] });
  b.start();
  b.page.dirtyZoneIds = ['z1'];
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, [['ask', 'leave'], ['go-nothing', -2]]);
  assert.equal(b.page.draftEpoch, 0, 'เดิม: ทิ้งร่างก่อนย้อน ⇒ ค่าหายทั้งที่ยังอยู่หน้าเดิม');
  b.settle();
  b.log.length = 0;
  b.userBack();
  await b.flush();
  assert.deepEqual(b.log, [], 'ชั้นใบคือรายการแรกของแท็บ — ไม่ถาม "ทิ้งแล้วออก" ที่ไม่ไปไหน');
  assert.equal(b.page.left, false);
  assert.equal(b.page.draftEpoch, 0);
  assert.equal(b.userBack(), false, 'ปุ่มย้อนดับแล้ว (รายการแรกของแท็บ)');
});

test('🐞 review 26/09 ตอบ "ทิ้งแล้วออก" แล้วการย้อนตกรายการของหน้านี้เอง (กองเก่า [ใบ, ใบ, พื้นที่]) = ย้อนต่อจนพ้นหน้า ไม่ถามซ้ำ', async () => {
  const b = stackRig({ entries: ['/prev', SHEET, SHEET], split: true, answers: [true, true] });
  b.start();
  b.page.pageDirty = true;
  b.userBack();
  await b.flush();
  assert.equal(b.log.filter((row) => row[0] === 'ask').length, 1);
  assert.equal(b.page.left, true);
});

test('🐞 review 26/09 ตัวต่อสาย: เริ่มเมื่อข้อมูลมา (ทุกแท็บ) · ตามทันเฉพาะแท็บหน้างาน · หมุนจอส่งทุกแท็บ · ตัวทำอ่านกุญแจชั้นเปล่า', () => {
  /* hook ไม่มีตัววาดในเทสต์ — ตรึงการต่อสายที่พฤติกรรมข้างบนพึ่ง (เดิม: รอแท็บหน้างานถึงเริ่ม · หมุนจอส่งเฉพาะแท็บหน้างาน) */
  const hook = readFileSync(new URL('../../components/service/useSurveyZoneRoute.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(hook, /const active = ready && tab !== "result";/);
  assert.match(hook, /if \(!ready\) return;\s*if \(startedRef\.current\) \{\s*if \(active\) catchUp\(\);\s*return;\s*\}/);
  assert.match(hook, /const pendingKnown = active && pending !== null/, 'พื้นที่ที่จองไว้เปิดบนแท็บหน้างานเท่านั้น');
  assert.match(hook, /useEffect\(\(\) => \{\s*if \(startedRef\.current\) engine\.dispatch\(\{ type: "mode", ours: onOurLayer\(\) \}\);\s*\}, \[split, engine\]\);/);
  assert.match(hook, /entry: \(\) => window\.history\.state,/);
});
