// ── ภาพรวมระบบวางแผนผลิต (X-1) — logic ล้วน ───────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-01: **เลิกทำปฏิทินรวมสองโมดูล** เปลี่ยนเป็นหน้าภาพรวมของ
// แต่ละระบบแยกกัน — สองโมดูลเป็นคนละทีมปฏิบัติงาน (PD/PC/WH/QC กับ TS) หน้าที่
// รวมสองอย่างเข้าด้วยกันจึงไม่มีใครเป็นเจ้าของ และทุกคนต้องกรองของคนอื่นทิ้งก่อนอ่าน
//
// ⚠️ หน้าภาพรวมต้องตอบว่า **"วันนี้ต้องตัดสินใจอะไรก่อน"** ไม่ใช่โชว์ตัวเลขสวย ๆ —
// ตัวเลขที่กดต่อไปหางานไม่ได้ คือตัวเลขที่ไม่มีใครเปิดดูรอบสอง
import { toLocalISODate } from './dateHelpers';
import { LIVE_JOB_STATUSES, jobFinishDate, lineLoad, dueRisk, readinessConflict } from './productionPlan';
import { businessDate } from '@/lib/businessDate';

// ── ตัวเลขหัวหน้าจอ ──────────────────────────────────────────────────────
// ⚠️ ยกเลิกไม่นับในทุกช่อง — งานที่ถูกยกเลิกยังอยู่ในตารางเพื่อเก็บประวัติ
export function productionCounts(jobs = []) {
  const alive = jobs.filter((j) => j.status !== 'cancelled');
  return {
    draft: alive.filter((j) => j.status === 'draft').length,
    planned: alive.filter((j) => j.status === 'planned').length,
    running: alive.filter((j) => j.status === 'in_progress').length,
    done: alive.filter((j) => j.status === 'done').length,
  };
}

// ── งานที่ต้องตัดสินใจก่อน — หัวใจของหน้าภาพรวม ──────────────────────────
//
// ⚠️ งานหนึ่งใบมีได้หลายเหตุผล — คืน**ทุก**เหตุผลของใบนั้น ไม่ใช่เลือกอันแรก
//    (ใบที่ทั้งของยังไม่มา *และ* จบช้ากว่ากำหนด คือใบที่ต้องโทรหาลูกค้าที่สุด
//     ถ้าโชว์เหตุผลเดียวมันจะดูเท่ากับใบที่มีปัญหาข้อเดียว)
export function productionAttention(jobs = [], lines = [], { holidays, overridesByLine = new Map() } = {}) {
  const linesById = new Map(lines.map((l) => [l.id, l]));
  const rows = [];

  for (const job of jobs) {
    if (job.status === 'cancelled' || job.status === 'done') continue;
    const line = linesById.get(job.lineId) || null;
    const reasons = [];

    const conflict = readinessConflict(job, job.readiness);
    if (conflict) reasons.push(conflict);

    const finish = jobFinishDate(job, line, {
      holidays,
      lineOverrides: overridesByLine.get(job.lineId) || new Map(),
    });
    const risk = dueRisk(job, finish);
    if (risk) reasons.push(risk);

    // ⭐ งานร่างคือของที่ "ยังไม่มีใครตัดสินใจ" — ต้องอยู่ในรายการนี้เสมอ ไม่งั้น
    // มันจะนอนอยู่ในคิวเงียบ ๆ จนเลยกำหนดส่งแล้วค่อยมีคนสังเกต
    if (job.status === 'draft') {
      reasons.push({ kind: 'unplanned', message: 'ยังไม่ได้วางคิวผลิต' });
    }

    if (reasons.length) rows.push({ job, finish, reasons });
  }

  // เร่งสุดขึ้นก่อน: เหตุผลเยอะกว่า → กำหนดส่งเร็วกว่า → ไม่มีกำหนดส่งไปท้าย
  // ⚠️ "ไม่รู้กำหนดส่ง" ไม่ได้แปลว่า "ด่วนที่สุด" (กติกาเดียวกับ sortQueue)
  return rows.sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return b.reasons.length - a.reasons.length;
    const ad = a.job.dueDate || '';
    const bd = b.job.dueDate || '';
    if (ad === bd) return String(a.job.code || '').localeCompare(String(b.job.code || ''));
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  });
}

// ── กำลังผลิตในช่วงที่ดู — "โรงงานแน่นแค่ไหน" ในตัวเลขเดียว ────────────────
//
// ⚠️ ช่องที่ยังไม่กรอกกำลัง (capacity = null) ไม่ถูกนับทั้งตัวตั้งและตัวหาร —
// ไม่งั้น % จะต่ำผิดจริงโดยไม่มีใครรู้ว่าเพราะข้อมูลขาด ไม่ใช่เพราะไลน์ว่าง ·
// คืน `unknownCells` ออกไปด้วยเพื่อให้หน้าจอบอกได้ว่าตัวเลขนี้อ่านจากข้อมูลไม่ครบ
export function capacityGlance(jobs = [], lines = [], { from, to, holidays, overridesByLine } = {}) {
  const load = lineLoad(jobs, lines, { from, to, holidays, overridesByLine });
  let planned = 0;
  let capacity = 0;
  let overloadedCells = 0;
  let unknownCells = 0;

  for (const cell of load.values()) {
    if (cell.capacity == null) { unknownCells += 1; continue; }
    planned += cell.planned;
    capacity += cell.capacity;
    if (cell.capacity > 0 && cell.planned > cell.capacity) overloadedCells += 1;
  }

  return {
    planned,
    capacity,
    // ⚠️ ค่าดิบ ไม่ปัด — จอจัดรูปแบบเองด้วย `fmtPercent` (ทศนิยม 2 ตำแหน่ง)
    // ปัดที่นี่ = ทศนิยมหายตั้งแต่ต้นทาง จอได้แค่ ".00" หลอก ๆ
    // `null` (ไม่รู้กำลังเลย) ต้องคงเป็น null ไม่ใช่ 0 — จอแปลงเป็น "—" เอง
    pct: capacity > 0 ? (planned / capacity) * 100 : null,
    overloadedCells,
    unknownCells,
  };
}

// ── ไลน์ไหนเดินอะไรอยู่วันนี้ — "ตอนนี้โรงงานทำอะไร" ─────────────────────
//
// คืนครบทุกไลน์ที่เปิดใช้ รวมไลน์ที่ว่าง — ไลน์ว่างคือข้อมูล ไม่ใช่ช่องที่ควรหาย
// (PC ต้องเห็นที่ว่างเพื่อแทรกงานด่วน)
export function runningToday(jobs = [], lines = [], { todayIso = businessDate(), holidays, overridesByLine } = {}) {
  const load = lineLoad(jobs, lines, { from: todayIso, to: todayIso, holidays, overridesByLine });
  return lines
    .filter((line) => line.isActive !== false)
    .map((line) => {
      const cell = load.get(`${line.id}|${todayIso}`) || null;
      return {
        line,
        date: todayIso,
        planned: cell?.planned ?? 0,
        capacity: cell?.capacity ?? null,
        pct: cell?.pct ?? null,
        jobs: cell?.jobs ?? [],
      };
    });
}

// จำนวนงานที่ยังกินกำลังผลิตอยู่ — ใช้บอกว่าตัวเลขกำลังผลิตมาจากงานกี่ใบ
export const liveJobs = (jobs = []) => jobs.filter((j) => LIVE_JOB_STATUSES.includes(j.status));
