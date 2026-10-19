// ── ภาพรวมของ "ฝ่ายผู้รับ" — งานอยู่ที่ใคร และค้างขั้นไหน (ล้วน ไม่แตะจอ) ──
//
// ⭐ **สองคำถามที่หน้า `/rd` ตอบไม่ได้เลย** (มติผู้ใช้ 2026-08-12 · แบบ ก + ค)
//   · *"งานอยู่ที่ใคร"* — ทั้งหน้าไม่มีชื่อคนสักที่ ทั้งที่ `acknowledgedByName`
//     มากับแถวอยู่แล้ว ⇒ หัวหน้าต้องเปิดคิวแล้วกวาดตาทีละแถว
//   · *"ค้างขั้นไหน หนักแค่ไหน"* — ใบพัฒนากลิ่นหนึ่งใบมีได้ 5 กลิ่น ⇒ จำนวนใบอย่างเดียว
//     อ่านไม่ออกว่าหนักแค่ไหน ⇒ **ใบเป็นตัวเลขหลัก กลิ่นเป็นบรรทัดรอง**
//     (ดูเหตุผลที่ `stageValue` — เคยสลับกันแล้วมันโกหกกับข้อมูลจริง)
//
// ⚠️ **ไม่มีฟิลด์ใหม่ในฐานข้อมูลเลย** — ทุกอย่างคำนวณจากสิ่งที่ `/api/sa/requests`
// ส่งมาอยู่แล้ว (`items` · `acknowledgedById/Name` · `committedDueDate` · `closedAt`)
import { deptQueueRows, queueCounts, requestNextStep, requestDueText } from '@/lib/requests/queueBoard';
import { FACET_NONE } from '@/lib/requests/queueList';
import { requestAssignee } from '@/lib/requests/assign';
import { requestClosedOn } from '@/lib/requests/closure';
import { businessDayKey } from '@/lib/datePeriods';

/* คีย์ของกองที่ยังไม่มีใครรับ — ต้องเป็นคีย์จริง ไม่ใช่ null เพราะมันเป็นแถวหนึ่ง
   ในตารางเดียวกับคน (กองที่ต้องแจกก่อนอย่างอื่น)

   🐞 **ต้องเป็นค่าเดียวกับ `FACET_NONE` ของตัวกรองในคิว** — แถวนี้ลิงก์ไป
   `/rd/requests?owner=<key>` แล้วคิวเอาไปตั้งเป็นตัวกรอง "ผู้รับเรื่อง" ·
   เคยประกาศเป็น `'__unassigned'` ของตัวเอง ⇒ กดแล้วได้ตารางว่างเปล่า ทั้งที่
   ตัวเลขข้าง ๆ บอกว่ามี 9 ใบ (เจอตอนกดจริงบนพรีวิว 2026-08-12) */
export const UNASSIGNED = FACET_NONE;

/**
 * จำนวน "บรรทัด" ของใบ — กลิ่นสำหรับพัฒนากลิ่น · รายการวัสดุสำหรับขอราคา
 *
 * ⚠️ **0 แปลว่าใบนี้ไม่มีบรรทัด ไม่ใช่ "ยังไม่ได้กรอก"** — ชนิดสอบถาม/ขอเอกสาร/ขอ
 * mockup ไม่มีบรรทัดโดยธรรมชาติ และบนคิวจริงมันคือ **ส่วนใหญ่** ⇒ ห้ามเอาจำนวน
 * บรรทัดไปเป็นตัวเลขหลักของอะไรก็ตาม (ดู `stageValue`)
 */
export const requestLineCount = (request) => (Array.isArray(request?.items) ? request.items.length : 0);

// ⚠️ **ที่เดียวที่ตัดสินว่าใบอยู่ที่ใคร** คือ `requestAssignee` — ผู้รับผิดชอบก่อน
// แล้วถอยไปคนที่กดรับเรื่อง (mig 0230) · เขียนกฎถอยหลังซ้ำที่นี่เมื่อไร ตารางคน
// กับตัวกรองในคิวจะเริ่มตอบไม่ตรงกัน
const nameOf = (request) => requestAssignee(request).name;

/**
 * งานค้างรายคน — คืนแถวเรียงจากคนที่ถือเยอะสุด · กอง "ยังไม่มีคนรับ" ต่อท้ายเสมอ
 *
 * `rows` ต้องเป็น **ใบของฝ่ายนี้ที่ยังไม่จบ** (ผู้เรียกกรองมาแล้ว) — ฟังก์ชันนี้
 * ไม่รู้ว่าฝ่ายไหนและไม่ตัดสินสิทธิ์ (กติกาเดียวกับ `queueTabRows`)
 *
 * ⚠️ **"ใครถือ" = ผู้รับผิดชอบที่มอบหมายไว้ แล้วถอยไปคนที่กดรับเรื่อง** (`requestAssignee`
 * · mig 0230) — คอมเมนต์เดิมตรงนี้เขียนว่า "ระบบยังไม่มีฟิลด์ผู้รับผิดชอบรายคน" ซึ่ง
 * เลิกจริงไปตั้งแต่ mig 0230 แล้ว (แก้ 2026-09-08)
 *
 * ⚠️ **นับเป็น "ใบ" ระดับหัวใบ ไม่ใช่ระดับกลิ่น** — ตัวนี้ตอบว่า *ใบ* อยู่ที่ใคร ส่วน
 * *กลิ่นก้อนไหนใครปรุง* เป็นคนละแกน อยู่ที่ `lib/rd/perfumerBoard.js` (mig 0350)
 * ⇒ สองที่นี้ให้ตัวเลขคนละชุดสำหรับคนเดียวกันได้โดยไม่ผิด **แต่ป้ายต้องบอกให้ต่าง**
 * ("งานค้างรายคน" = ใบ · "ตารางงานผู้ปรุงกลิ่น" = กลิ่น)
 */
export function ownerWorkload(rows = [], { todayIso = null } = {}) {
  const map = new Map();
  for (const request of rows) {
    const who = requestAssignee(request);
    const key = who.id || (who.name ? who.name.toLocaleLowerCase('th-TH') : UNASSIGNED);
    const bucket = map.get(key) || {
      key,
      name: key === UNASSIGNED ? 'ยังไม่มีคนรับ' : (who.name || 'ผู้รับผิดชอบ'),
      unassigned: key === UNASSIGNED,
      requests: 0,
      lines: 0,
      overdue: 0,
      // ใบที่รอนานสุดในกองนี้ — กองที่ไม่มีคนรับต้องบอกได้ว่ารอมากี่วันแล้ว
      waitingDays: 0,
    };
    bucket.requests += 1;
    bucket.lines += requestLineCount(request);
    const due = requestDueText(request, { todayIso });
    if (due?.overdue) bucket.overdue += 1;
    const days = daysWaiting(request, todayIso);
    if (days > bucket.waitingDays) bucket.waitingDays = days;
    map.set(key, bucket);
  }
  const out = [...map.values()].sort((a, b) => (b.requests - a.requests)
    || (b.lines - a.lines)
    || a.name.localeCompare(b.name, 'th'));
  // กองที่ยังไม่มีคนรับไปท้ายเสมอ — มันไม่ใช่ "คนที่ถือน้อยที่สุด"
  return out.filter((row) => !row.unassigned).concat(out.filter((row) => row.unassigned));
}

// รอมากี่วันแล้ว — นับจากวันที่ส่งเข้ามา (ไม่ใช่วันที่สร้างร่าง)
function daysWaiting(request, todayIso) {
  const from = String(request?.submittedAt || request?.createdAt || '').slice(0, 10);
  if (!from || !todayIso) return 0;
  const ms = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86400000));
}

// ── สายพาน 4 ขั้น — ใบเป็นตัวเลขหลัก กลิ่นเป็นบรรทัดรอง ──────────────────
//
// ⚠️ **ขั้นตอนไม่ใช่สถานะดิบ** — `acknowledged` ใบหนึ่งอาจตอบไปแล้วบางบรรทัดและ
// รอผู้ขอมารับอยู่ ⇒ ใช้ `requestNextStep` ตัวเดียวกับที่คิวใช้ตัดสินว่า "ตาใคร"
// ไม่งั้นสายพานกับคิวจะบอกคนละเรื่องเกี่ยวกับใบเดียวกัน
export const DEPT_PIPELINE_STAGES = [
  { key: 'unacked', label: 'รอรับเรื่อง', tone: 'warning' },
  { key: 'working', label: 'กำลังปรุง', tone: 'info' },
  { key: 'waiting', label: 'ส่งแล้ว รอผู้ขอ', tone: 'neutral' },
  { key: 'closed', label: 'ปิดเดือนนี้', tone: 'good' },
];

/* ⭐ **ตาใครมาก่อนสถานะดิบ** (ตรวจตัวกรอง 08/10 · H10) — แต่ละขั้นต้องเท่ากับแถวที่ลิงก์ของการ์ด
   (`DEPT_STAGE_QUEUE`) เปิดให้เห็นเป๊ะ: รอรับเรื่อง/กำลังปรุง = แท็บ "รอ <ฝ่าย> ตอบ" (ตาฝ่าย) กรองด้วย
   ตัวเลขของแถบ · ส่งแล้ว รอผู้ขอ = แท็บ "รอผู้ขอทำต่อ" (ตาผู้ขอ) ทั้งแท็บ
   🐞 ของเดิมถาม `pending` ก่อนถามตาใคร ⇒ ใบ `pending` ที่ตกเป็นตาผู้ขอ (มีตราตอบแล้ว) ถูกนับ "รอรับเรื่อง"
      แต่ไปอยู่แท็บรอผู้ขอ — กดการ์ดแล้วหาไม่เจอ */
export function requestStageKey(request) {
  if (!request) return null;
  if (request.status === 'closed') return 'closed';
  const next = requestNextStep(request);
  if (!next) return null;                      // ยกเลิก/จบแบบอื่น — ไม่อยู่ในสายพาน
  if (next.owner !== 'dept') return 'waiting';
  return request.status === 'pending' ? 'unacked' : 'working';
}

/**
 * ใบนี้ "ปิดในเดือน" `monthKey` (`YYYY-MM` เวลาไทย) ไหม — ตัวเดียวที่ขั้น "ปิดเดือนนี้" ของสายพาน
 * กับตัวกรองเดือนของแท็บประวัติ (`/rd/requests?tab=history&closed=YYYY-MM`) ใช้ร่วมกัน
 *
 * ⚠️ ปิดครบ (`closed`) เท่านั้น — ใบยกเลิกอยู่แท็บประวัติด้วยแต่ไม่ใช่ "ปิด" (คนละคำ คนละผล · ดู closure.js)
 * ⚠️ เดือนที่ใบจบจริง = ตราหลังสุด (`requestClosedOn`) ตัดด้วยวันไทย — ผู้ขอปิด ส.ค. ฝ่ายกด ก.ย. = ปิดเดือน ก.ย. (ม-145)
 */
export function requestClosedInMonth(request, monthKey) {
  if (request?.status !== 'closed' || !monthKey) return false;
  return String(businessDayKey(requestClosedOn(request)) || '').slice(0, 7) === monthKey;
}

/** `YYYY-MM` ที่ใช้เป็นค่าตัวกรองเดือนได้ — อย่างอื่น (ว่าง · พิมพ์มาผิด) = ไม่กรอง */
export const isMonthKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value ?? ''));

/* ── การ์ดสายพาน → คิวของฝ่ายที่กรองไว้แล้ว (ตรวจตัวกรอง 08/10 · H10 H11) ──────────
   🐞 ของเดิมทุกการ์ดพาไปแค่แท็บ ⇒ "รอรับเรื่อง 2" เปิดแท็บรอฝ่ายตอบทั้งแท็บ (95 ใบ) · "ปิดเดือนนี้ 45"
      เปิดประวัติตลอดกาลรวมใบยกเลิก (145 ใบ)
   ⭐ ตัวกรองเป็นของที่คิวรู้จักอยู่แล้ว: `count` = คีย์แถบตัวเลข (`matchesQueueCount`) · `closed` = เดือน
      (`requestClosedInMonth`) ⇒ เลขบนการ์ด = แถวที่ปลายทางโชว์ (deptOverview.test.mjs เทียบให้) */
export const DEPT_STAGE_QUEUE = Object.freeze({
  unacked: Object.freeze({ tab: 'todo', count: 'unacked' }),
  working: Object.freeze({ tab: 'todo', count: 'working' }),
  waiting: Object.freeze({ tab: 'waiting' }),
  closed: Object.freeze({ tab: 'history', closedMonth: true }),
});

export function deptStageQueueHref(stageKey, { queueHref = '/rd/requests', month } = {}) {
  const link = DEPT_STAGE_QUEUE[stageKey];
  if (!link) return queueHref;
  const params = new URLSearchParams({ tab: link.tab });
  if (link.count) params.set('count', link.count);
  if (link.closedMonth && isMonthKey(month)) params.set('closed', month);
  return `${queueHref}?${params}`;
}

/**
 * "เลยวันที่รับปากไว้" แยกตามตาใคร — ป้ายเตือนบนหน้าภาพรวม (ตรวจตัวกรอง 08/10 · H9)
 *
 * 🐞 ป้ายเคยนับจากทุกใบของฝ่ายแล้วพาไปแท็บรอฝ่ายตอบ ⇒ "เลย 57 ใบ" เปิดมาเจอ 24 (อีก 33 ใบส่งแล้ว
 *    รอผู้ขอ อยู่อีกแท็บ) · นับแยกด้วยแท็บเดียวกับคิว (`deptQueueRows`) และตัวเลข "เลยกำหนด" ตัวเดียวกับ
 *    แถบในคิว (`queueCounts`) ⇒ ปุ่มแต่ละปุ่มพาไปแถวที่เลขของมันบอกเป๊ะ · `total` = ผลรวมสองแท็บ
 *    (ใบในประวัติไม่มีทาง "เลยกำหนด" — ตัวนับไม่นับใบที่จบแล้ว) ⇒ ตรงกับ "เลยกำหนดแล้ว N ใบ" ของปฏิทิน
 */
export function deptOverdueByTurn(rows = [], { dept, todayIso = null } = {}) {
  const overdueIn = (tab) => queueCounts(deptQueueRows(rows, { dept, tab }), { todayIso }).overdue;
  const deptTurn = overdueIn('todo');
  const requesterTurn = overdueIn('waiting');
  return { dept: deptTurn, requester: requesterTurn, total: deptTurn + requesterTurn };
}

/**
 * สายพานของฝ่าย — คืน `[{ key, label, tone, requests, lines, noLines, oldestDays }]`
 *
 * ⚠️ `month` ใช้กับขั้น "ปิดเดือนนี้" เท่านั้น (รูปแบบ `YYYY-MM`) — ขั้นอื่นเป็น
 * ของค้าง ณ ตอนนี้ ไม่ผูกกับเดือน · ใบที่ปิดเดือนก่อนไม่ควรบวกเข้ามาให้ตัวเลขพอง
 */
export function deptPipeline(rows = [], { todayIso = null, month = null } = {}) {
  const monthKey = month || String(todayIso || '').slice(0, 7);
  const base = DEPT_PIPELINE_STAGES.map((stage) => ({
    ...stage, requests: 0, lines: 0, noLines: 0, oldestDays: 0,
  }));
  const byKey = new Map(base.map((stage) => [stage.key, stage]));
  for (const request of rows) {
    const key = requestStageKey(request);
    const stage = byKey.get(key);
    if (!stage) continue;
    /* เดือนที่ใบจบจริง (ตราหลังสุด · เวลาไทย) — ม-145 · ตัวเดียวกับตัวกรองเดือนของแท็บประวัติที่การ์ดลิงก์ไป
       (เดิมอ่าน `closedAt` ตัด UTC ⇒ ใบหายจากทั้งสองเดือน) */
    if (key === 'closed' && !requestClosedInMonth(request, monthKey)) continue;
    stage.requests += 1;
    const lines = requestLineCount(request);
    if (lines) stage.lines += lines; else stage.noLines += 1;
    const days = daysWaiting(request, todayIso);
    if (days > stage.oldestDays) stage.oldestDays = days;
  }
  return base;
}

/**
 * ตัวเลขหลักของขั้น — **นับเป็นใบเสมอ**
 *
 * 🐞 **เคยให้กลิ่นเป็นตัวเลขหลักแล้วมันโกหกทันทีที่เจอข้อมูลจริง** (แก้วันเดียวกับที่
 * ทำ 2026-08-12) — คิวจริงของ RD ตอนนั้น: ขั้น "รอรับเรื่อง" มี **9 ใบ แต่มีบรรทัด
 * แค่ใบเดียว** (ที่เหลือเป็นชนิดสอบถาม/ขอ mockup ซึ่งไม่มีบรรทัดโดยธรรมชาติ)
 * ⇒ หัวการ์ดขึ้นว่า **"1 กลิ่น"** ทั้งที่มีเก้าใบรอคนรับอยู่ = อ่านเหมือนแทบไม่มีงาน
 *
 * ⇒ กลับด้าน: **ใบเป็นตัวเลขหลัก · กลิ่นเป็นบรรทัดรอง** (`stageNote`) · ใบเทียบกันได้
 * ทุกชนิดคำร้องและไม่มีวันหายไปจากตัวเลข ส่วนกลิ่นยังอยู่ครบสำหรับใบที่มีบรรทัดจริง
 */
export function stageValue(stage) {
  return { value: stage?.requests || 0, unit: 'ใบ' };
}

/**
 * บรรทัดรองของขั้น — จำนวนกลิ่น (ถ้ามี) + รอนานสุดกี่วัน
 *
 * ⚠️ ไม่ต้องพูดถึง "ใบที่ไม่มีบรรทัด" อีกแล้ว — ตั้งแต่ตัวเลขหลักเป็น *ใบ* ผลรวมก็ครบ
 * ในตัวเอง · บอกซ้ำจะกลายเป็นคำอธิบายของสิ่งที่ไม่มีใครสงสัย
 */
export function stageNote(stage) {
  if (!stage || !stage.requests) return 'ไม่มีของค้างในขั้นนี้';
  const parts = [];
  if (stage.lines > 0) parts.push(`${stage.lines} กลิ่น`);
  if (stage.key !== 'closed' && stage.oldestDays > 0) parts.push(`รอนานสุด ${stage.oldestDays} วัน`);
  return parts.length ? parts.join(' · ') : 'ไม่มีบรรทัดย่อย';
}
