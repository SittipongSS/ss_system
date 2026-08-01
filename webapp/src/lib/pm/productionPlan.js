// ── แผนผลิต (mig 0189 · P-2) — logic ล้วน ─────────────────────────────────
//
// ⭐ **แผนคือค่าที่คำนวณได้ ไม่ใช่ตารางสำเนา** (หลักการข้อ 1 ของแผน) — การกระจาย
// งานลงรายวันคำนวณจาก (วันเริ่ม, จำนวน, อัตราต่อวัน, วันหยุด) ทุกครั้งที่ถาม
// **ไม่มีตาราง booking รายวัน** เพราะสำเนาที่ไม่มีใครอัปเดตตามคือที่มาของบั๊กภาษี 4 สูตร
//
// ⭐ ระบบนี้ไม่ได้แค่วาดตาราง แต่ตอบว่า **แผนนี้เป็นไปได้ไหม** — readinessConflict
// กับ dueRisk คือหัวใจ ที่เหลือเป็นเครื่องมือประกอบ
import { isBusinessDay, toLocalISODate } from './dateHelpers';
import { capacityOn } from './productionLines';

export const JOB_STATUSES = ['draft', 'planned', 'in_progress', 'done', 'cancelled'];
export const JOB_STATUS_LABELS = {
  draft: 'ร่าง',
  planned: 'วางคิวแล้ว',
  in_progress: 'กำลังผลิต',
  done: 'ผลิตเสร็จ',
  cancelled: 'ยกเลิก',
};

// งานที่ยัง "กินกำลังผลิต" อยู่จริง — ร่างยังไม่กิน (ยังไม่มีไลน์) · จบ/ยกเลิกไม่กินแล้ว
export const LIVE_JOB_STATUSES = ['planned', 'in_progress'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const parseDate = (iso) => {
  if (!ISO_DATE.test(String(iso ?? ''))) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

function dateError(value, label) {
  if (!value) return null;
  if (!ISO_DATE.test(String(value))) return `${label}ไม่ถูกต้อง`;
  const year = Number(String(value).slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  return null;
}

// ── ตรวจข้อมูลงานผลิตก่อนแตะ DB ──────────────────────────────────────────
export function normalizeJobInput(body = {}) {
  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0) return { value: null, error: 'จำนวนต้องเป็นตัวเลขมากกว่า 0' };

  const status = body.status ?? 'draft';
  if (!JOB_STATUSES.includes(status)) return { value: null, error: 'สถานะงานผลิตไม่ถูกต้อง' };

  for (const [field, label] of [
    ['dueDate', 'กำหนดส่ง'], ['plannedStart', 'วันเริ่มผลิต'],
    ['actualStart', 'วันเริ่มจริง'], ['actualFinish', 'วันจบจริง'],
  ]) {
    const err = dateError(body[field], label);
    if (err) return { value: null, error: err };
  }
  if (body.actualStart && body.actualFinish && String(body.actualFinish) < String(body.actualStart)) {
    return { value: null, error: 'วันจบจริงต้องไม่ก่อนวันเริ่มจริง' };
  }

  // ⚠️ อัตราต่อวันว่างได้ = "ใช้กำลังมาตรฐานของไลน์" · ห้ามแปลงเป็น 0
  //    (0 = เดินไม่ได้เลย ซึ่งจะทำให้ spreadJob วนไม่รู้จบถ้าไม่กัน)
  let ratePerDay = null;
  if (body.ratePerDay !== undefined && body.ratePerDay !== null && String(body.ratePerDay).trim() !== '') {
    ratePerDay = Number(body.ratePerDay);
    if (!Number.isFinite(ratePerDay) || ratePerDay <= 0) {
      return { value: null, error: 'อัตราผลิตต่อวันต้องเป็นตัวเลขมากกว่า 0' };
    }
  }

  let qtyProduced = null;
  if (body.qtyProduced !== undefined && body.qtyProduced !== null && String(body.qtyProduced).trim() !== '') {
    qtyProduced = Number(body.qtyProduced);
    if (!Number.isFinite(qtyProduced) || qtyProduced < 0) {
      return { value: null, error: 'จำนวนที่ผลิตได้ต้องเป็นตัวเลขไม่ติดลบ' };
    }
  }

  // ⭐ วางคิวแล้วต้องรู้ว่าไลน์ไหน เริ่มวันไหน (ตรงกับ CHECK ใน mig 0189) —
  // งาน planned ที่ไม่มีไลน์จะลอยอยู่บนบอร์ดโดยไม่มีช่องให้วาง แล้วคนอ่านบอร์ด
  // จะเชื่อว่ายังไม่มีคิวทั้งที่มี
  const needsPlan = status !== 'draft' && status !== 'cancelled';
  if (needsPlan && !body.lineId) return { value: null, error: 'ต้องเลือกไลน์ผลิตก่อนวางคิว' };
  if (needsPlan && !body.plannedStart) return { value: null, error: 'ต้องระบุวันเริ่มผลิตก่อนวางคิว' };

  const dayOverrides = {};
  if (body.dayOverrides && typeof body.dayOverrides === 'object' && !Array.isArray(body.dayOverrides)) {
    for (const [date, raw] of Object.entries(body.dayOverrides)) {
      if (!ISO_DATE.test(date)) return { value: null, error: `วันที่ใน "ปรับกำลังรายวัน" ไม่ถูกต้อง (${date})` };
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        return { value: null, error: `กำลังผลิตของวัน ${date} ต้องเป็นตัวเลขไม่ติดลบ` };
      }
      dayOverrides[date] = value;
    }
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };
  const unit = String(body.unit ?? '').trim();
  if (unit.length > 30) return { value: null, error: 'หน่วยยาวเกิน 30 ตัวอักษร' };

  return {
    value: {
      projectId: body.projectId || null,
      dealId: body.dealId || null,
      salesOrderId: body.salesOrderId || null,
      salesOrderLineId: body.salesOrderLineId || null,
      productId: body.productId || null,
      fgCode: String(body.fgCode ?? '').trim() || null,
      productName: String(body.productName ?? '').trim() || null,
      qty,
      unit: unit || null,
      dueDate: body.dueDate || null,
      lineId: body.lineId || null,
      plannedStart: body.plannedStart || null,
      ratePerDay,
      dayOverrides,
      status,
      actualStart: body.actualStart || null,
      actualFinish: body.actualFinish || null,
      qtyProduced,
      ownerId: body.ownerId || null,
      ownerName: String(body.ownerName ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}

// ── กระจายงานลงวันทำการ ──────────────────────────────────────────────────
// คืน [{date, qty}] — เดินจาก plannedStart ไปข้างหน้า วันละ `rate` จนครบ qty
//
// ลำดับความสำคัญของอัตราต่อวัน:
//   1. dayOverrides[date]  — วันนั้นเดินเท่านี้ (0 = ไม่เดินงานใบนี้)
//   2. job.ratePerDay      — งานใบนี้เดินช้ากว่า/เร็วกว่ากำลังไลน์
//   3. capacityOn(line)    — กำลังมาตรฐานของไลน์วันนั้น
//
// ⚠️ ไม่รู้กำลัง (capacity = null) และไม่ได้ระบุ ratePerDay → **คืน [] ไม่เดา**
//    เพราะแท่งงานที่วาดจากอัตราที่เดาเอาเองจะดูน่าเชื่อถือทั้งที่ไม่มีข้อมูลรองรับ
export function spreadJob(job, line, { holidays, lineOverrides = new Map(), maxDays = 400 } = {}) {
  const start = parseDate(job?.plannedStart);
  const total = Number(job?.qty);
  if (!start || !Number.isFinite(total) || total <= 0) return [];

  const jobRate = job?.ratePerDay == null ? null : Number(job.ratePerDay);
  const overrides = job?.dayOverrides && typeof job.dayOverrides === 'object' ? job.dayOverrides : {};

  const out = [];
  let remaining = total;
  const cursor = new Date(start);
  for (let guard = 0; guard < maxDays && remaining > 0; guard += 1) {
    const iso = toLocalISODate(cursor);

    let rate = null;
    if (Object.prototype.hasOwnProperty.call(overrides, iso)) {
      rate = Number(overrides[iso]);
    } else if (jobRate !== null && Number.isFinite(jobRate) && jobRate > 0) {
      // ⚠️ อัตราของงานยังต้องเคารพวันหยุด/วันปิดไลน์ — ไม่งั้นงานจะเดินต่อในวัน
      // ที่โรงงานปิด แล้วแผนจะจบเร็วกว่าความจริงเสมอ
      const capacity = capacityOn(line, iso, lineOverrides, holidays);
      rate = capacity === 0 ? 0 : jobRate;
    } else {
      rate = capacityOn(line, iso, lineOverrides, holidays);
    }

    if (rate === null) return [];          // ไม่รู้กำลัง = ไม่เดา
    if (rate > 0) {
      const take = Math.min(remaining, rate);
      out.push({ date: iso, qty: take });
      remaining -= take;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // เดินจนชนเพดานแล้วยังไม่หมด = อัตราน้อยเกินจนแผนไม่จบในกรอบที่มองเห็น
  return remaining > 0 ? [] : out;
}

// วันสุดท้ายที่งานจบ — ใช้ตอบบนหน้า SO ("ผลิต 12–14 ส.ค.")
export function jobFinishDate(job, line, opts = {}) {
  const days = spreadJob(job, line, opts);
  return days.length ? days[days.length - 1].date : null;
}

export function jobDateRange(job, line, opts = {}) {
  const days = spreadJob(job, line, opts);
  if (!days.length) return null;
  return { start: days[0].date, finish: days[days.length - 1].date, days: days.length };
}

// ── โหลดของไลน์รายวัน — เนื้อของบอร์ด (P-3) ──────────────────────────────
// คืน Map<'lineId|date', { planned, capacity, pct, jobs[] }>
export function lineLoad(jobs = [], lines = [], { from, to, holidays, overridesByLine = new Map() } = {}) {
  const map = new Map();
  const fromD = parseDate(from);
  const toD = parseDate(to);
  const linesById = new Map(lines.map((l) => [l.id, l]));

  for (const job of jobs) {
    if (!LIVE_JOB_STATUSES.includes(job.status)) continue;
    const line = linesById.get(job.lineId);
    if (!line) continue;
    const days = spreadJob(job, line, {
      holidays,
      lineOverrides: overridesByLine.get(line.id) || new Map(),
    });
    for (const day of days) {
      const d = parseDate(day.date);
      if (fromD && d < fromD) continue;
      if (toD && d > toD) continue;
      const key = `${line.id}|${day.date}`;
      if (!map.has(key)) {
        map.set(key, {
          lineId: line.id,
          date: day.date,
          planned: 0,
          capacity: capacityOn(line, day.date, overridesByLine.get(line.id) || new Map(), holidays),
          jobs: [],
        });
      }
      const cell = map.get(key);
      cell.planned += day.qty;
      cell.jobs.push({ id: job.id, code: job.code, qty: day.qty, productName: job.productName });
    }
  }

  for (const cell of map.values()) {
    // ⚠️ กำลังที่ไม่รู้ (null) → pct = null ไม่ใช่ Infinity — ช่องที่ยังไม่กรอกกำลัง
    // ต้องไม่ขึ้นแดงว่าเกิน (ดู capacityOn)
    cell.pct = cell.capacity == null || cell.capacity === 0
      ? null
      : Math.round((cell.planned / cell.capacity) * 100);
  }
  return map;
}

// วันที่จองเกินกำลัง — แถบแดงบนบอร์ด · **เตือน ไม่บล็อก** (โรงงานจริงมี OT)
export function overloadedDays(load) {
  const cells = load instanceof Map ? [...load.values()] : (load || []);
  return cells.filter((c) => c.capacity != null && c.capacity > 0 && c.planned > c.capacity);
}

// ── ตัวตอบว่า "แผนนี้เป็นไปได้ไหม" ────────────────────────────────────────

// ⭐ วางผลิตก่อนของมาถึง — ดึงจาก productionReadiness() ของ deliveries.js ที่มีอยู่แล้ว
// นี่คือเหตุผลที่โมดูลนี้ไม่ใช่ระบบใหม่ที่ไม่รู้จักใคร: ของเข้าที่ PC กรอกไว้แล้ว
// กลายเป็นตัวตัดสินว่าคิวที่วางเป็นไปได้จริงไหม
//
// ⚠️ readiness.state === 'unknown' (ยังไม่มีรายการของเข้า) → **ไม่ฟ้อง** เพราะ
// "ไม่รู้" ไม่ใช่ "ผิด" · ของ long-lead ที่สั่งก่อนออก SO ก็ยังไม่มีแถวตอนนั้น
export function readinessConflict(job, readiness) {
  if (!job?.plannedStart || !readiness) return null;
  if (readiness.state === 'ready' || readiness.state === 'unknown') return null;
  if (!readiness.lastDue) {
    return { kind: 'materials', message: 'ของยังไม่ครบและยังไม่มีกำหนดถึง — วางคิวไว้ก่อนได้ แต่ยังเริ่มผลิตไม่ได้' };
  }
  if (String(job.plannedStart) < String(readiness.lastDue)) {
    return {
      kind: 'materials',
      message: `วางผลิต ${job.plannedStart} แต่ของครบ ${readiness.lastDue} — เริ่มไม่ได้ตามแผน`,
    };
  }
  return null;
}

// ⭐ จบช้ากว่ากำหนดส่ง — ตัวเลขที่ SA ต้องรู้ก่อนลูกค้าโทรมาถาม
export function dueRisk(job, finishDate) {
  if (!job?.dueDate || !finishDate) return null;
  const due = parseDate(job.dueDate);
  const finish = parseDate(finishDate);
  if (!due || !finish || finish <= due) return null;
  const lateDays = Math.round((finish.getTime() - due.getTime()) / 86400000);
  return { kind: 'due', lateDays, message: `จบ ${finishDate} ช้ากว่ากำหนดส่ง ${lateDays} วัน` };
}

// ป้ายเตือนรวมของงานหนึ่งใบ — **เตือน ไม่บล็อก** ทุกข้อ
export function jobWarnings(job, line, { readiness = null, holidays, lineOverrides } = {}) {
  const out = [];
  const conflict = readinessConflict(job, readiness);
  if (conflict) out.push(conflict);

  const finish = jobFinishDate(job, line, { holidays, lineOverrides });
  const risk = dueRisk(job, finish);
  if (risk) out.push(risk);

  // งานที่วางคิวแล้วแต่คำนวณแผนไม่ออก = ไลน์ยังไม่กรอกกำลัง และงานก็ไม่ระบุอัตรา
  if (LIVE_JOB_STATUSES.includes(job?.status) && job?.lineId && !finish) {
    out.push({ kind: 'rate', message: 'ยังคำนวณวันจบไม่ได้ — ไลน์ยังไม่ได้กรอกกำลังผลิต และงานนี้ไม่ได้ระบุอัตราต่อวัน' });
  }
  return out;
}

// ── คิวงาน — หน้าที่ PC เปิดจริงทุกเช้า ──────────────────────────────────
// เรียงตาม "ต้องตัดสินใจก่อน" ไม่ใช่ตามที่ DB คืนมา:
//   งานที่ยังไม่วางคิว (draft) ขึ้นก่อน แล้วเรียงตามกำหนดส่ง — ไม่มีกำหนดส่งไปท้าย
//
// ⚠️ งานที่ไม่มี dueDate ต้องไม่ถูกดันขึ้นหัวคิวเพราะค่าว่างเรียงมาก่อน — ของที่
// "ไม่รู้กำหนด" ไม่ได้แปลว่า "ด่วนที่สุด"
export function sortQueue(jobs = []) {
  const rank = (job) => (job.status === 'draft' ? 0 : 1);
  return [...jobs].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ad = a.dueDate || '';
    const bd = b.dueDate || '';
    if (!ad && !bd) return String(a.code || '').localeCompare(String(b.code || ''));
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  });
}

// ── งานร่างที่ควรสร้างจาก SO ที่อนุมัติแล้ว ───────────────────────────────
// ⭐ หนึ่งใบต่อ 1 SO line ที่มี `productId` — บรรทัดบริการ/ค่าออกแบบฉลากไม่มี
// productId จึงไม่สร้าง (ไม่งั้นคิวผลิตจะมีงาน "ค่าออกแบบฉลาก" ให้ PC งง)
//
// ⚠️ **ห้ามสร้างจาก QT** — QT ยังไม่ใช่คำสั่ง จะได้คิวขยะที่ไม่มีใครกล้าลบ
// ⚠️ กันซ้ำด้วย salesOrderLineId ที่มีงานอยู่แล้ว — ฟังก์ชันนี้ถูกเรียกซ้ำได้ทุกครั้ง
//    ที่เปิดคิว ถ้าไม่กัน คิวจะบวมด้วยงานเดียวกันสิบใบภายในสัปดาห์เดียว
export function draftJobsForSalesOrder(order, lines = [], { existingLineIds = [] } = {}) {
  if (!order || order.status !== 'approved') return [];
  const taken = new Set(existingLineIds);
  const rows = [];
  for (const line of lines) {
    if (!line?.productId) continue;
    if (taken.has(line.id)) continue;
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    taken.add(line.id);
    rows.push({
      projectId: order.projectId || null,
      dealId: order.dealId || null,
      salesOrderId: order.id,
      salesOrderLineId: line.id,
      productId: line.productId,
      fgCode: line.fgCode || null,
      productName: line.description || null,
      qty,
      // กำหนดส่งของงานผลิต = กำหนดชำระของ SO ถ้ามี (ตัวเดียวที่ผูกกับวันบน SO)
      // ⚠️ ไม่เดาเป็น "วันสั่ง + N วัน" — เดาแล้วคิวจะเรียงตามวันที่ไม่มีใครตกลงกัน
      dueDate: order.paymentDueDate || null,
      status: 'draft',
    });
  }
  return rows;
}
