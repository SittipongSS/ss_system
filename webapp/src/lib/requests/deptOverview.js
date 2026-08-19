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
import { requestNextStep, requestDueText } from '@/lib/requests/queueBoard';
import { FACET_NONE } from '@/lib/requests/queueList';
import { requestAssignee } from '@/lib/requests/assign';

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
 * ⚠️ **"ใครถือ" = คนที่กดรับเรื่อง ไม่ใช่คนที่ลงมือปรุง** — ระบบยังไม่มีฟิลด์
 * ผู้รับผิดชอบรายคน · หัวหน้าที่กดรับแทนทีมทั้งกองจะขึ้นชื่อตัวเองคนเดียว
 * (ข้อจำกัดที่บอกผู้ใช้ไว้แล้วตอนเลือกแบบ ก — งานถัดไปคือเพิ่มฟิลด์นั้น)
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

export function requestStageKey(request) {
  if (!request) return null;
  if (request.status === 'closed') return 'closed';
  const next = requestNextStep(request);
  if (!next) return null;                      // ยกเลิก/จบแบบอื่น — ไม่อยู่ในสายพาน
  if (request.status === 'pending') return 'unacked';
  return next.owner === 'dept' ? 'working' : 'waiting';
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
    if (key === 'closed') {
      const closedMonth = String(request.closedAt || '').slice(0, 7);
      if (!closedMonth || (monthKey && closedMonth !== monthKey)) continue;
    }
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
