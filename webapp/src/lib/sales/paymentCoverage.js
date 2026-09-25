// ── งวดชำระครอบช่วงบริการไหน + ค่า "จ่ายถึง" (mig 0320) ─────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-30**: *"จ่ายก่อนบริการเสมอ ถ้าไม่จ่าย TS เอาลงคิวไม่ได้"*
//   (docs/service-contract-phase-plan.md §0 ข้อ 1 · §3.2)
//
// ทั้งเส้นบริการห้อยอยู่กับค่าเดียว — **paidThrough = เงินที่รับแล้วครอบบริการถึงวันไหน**
// ด่านเข้าไซต์ (PR-C) เอาไปตัดสินว่านัดวันนั้นลงคิวได้ไหม ⇒ ที่นี่คือ**ตัวตัดสินเดียว**
// ของทั้งระบบ ห้ามคิดเงื่อนไขนี้ซ้ำที่จอไหนอีก (กติกาเดียวกับ `visitGate`/`termIsActive`)
//
// ⚠️ **`reported` ไม่นับ — นับเมื่อ `confirmed` เท่านั้น** (กติกาเดิมของ mig 0245)
//   งวดที่ SA กดว่าลูกค้าจ่ายแล้วแต่บัญชียังไม่รับรอง ไม่ขยับ "จ่ายถึง" แม้แต่วันเดียว
//   ไม่งั้น SA แจ้งเองปลดด่านเอง = เท่ากับไม่มีด่าน
//
// ⚠️ **ไม่อ่านนาฬิกาในไฟล์นี้** — ทุกฟังก์ชันที่ต้องรู้ "วันนี้" รับ `todayIso` เข้ามา
//   ผู้เรียกส่ง `businessDate()` (นาฬิกาไทย) เสมอ · เหตุผล: อ่านนาฬิกาตอนเรนเดอร์แล้ว
//   จอกับ server ตอบคนละวันได้ และเทสต์กลายเป็นของที่พังเองตอนข้ามเที่ยงคืน
//
// ⚠️ เลขคณิตวันในไฟล์นี้เป็น **ปฏิทินล้วน** (สตริงวัน `YYYY-MM-DD` ตรึง T00:00:00Z)
//   ไม่มีโซนเวลาเข้ามาเกี่ยว — เป็นรูปแบบที่ด่าน `check:thaitime` อนุญาตไว้ชัดเจน

/* งวดที่ "รับเงินแล้วจริง" — ที่เดียวที่นิยามคำนี้ */
export const isConfirmed = (row) => String(row?.status || '') === 'confirmed';

const dateOf = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

/* สตริง ISO วันล้วนเทียบกันด้วย < > ได้ตรง ๆ (เรียงตามตัวอักษร = เรียงตามเวลา)
   — เขียนเป็นฟังก์ชันไว้กันคนหลังเผลอ new Date() แล้วได้ปัญหาโซนเวลากลับมา */
const isBefore = (a, b) => a < b;

/* ── ค่าหลัก: เงินครอบบริการถึงวันไหน ────────────────────────────────────
   `null` = **ยังไม่ครอบอะไรเลย** ไม่ใช่ "ครอบทุกวัน" — ผู้เรียกต้องอ่านว่าติดด่าน
   ⚠️ งวดที่ `confirmed` แต่ไม่มี `coversTo` **ไม่นับ** (ไม่ใช่นับเป็นอนันต์) —
   เงินเข้าจริงแต่ไม่มีใครบอกว่าซื้อบริการช่วงไหน ระบบจึงตอบแทนไม่ได้
   ⇒ ต้องโผล่เป็นคำเตือนให้คนไปเติม (ดู `coverageWarnings`) ไม่ใช่ปล่อยผ่านเงียบ ๆ */
export function paidThrough(installments = []) {
  let best = null;
  for (const row of installments || []) {
    if (!isConfirmed(row)) continue;
    const to = dateOf(row?.coversTo);
    if (!to) continue;
    if (!best || isBefore(best, to)) best = to;
  }
  return best;
}

/* วันนัดนี้อยู่ในช่วงที่เงินครอบไหม — ตัวที่ด่านข้อ 2 เรียกจริง (PR-C)
   ⚠️ **fail-closed ทุกทางที่ไม่แน่ใจ**: ไม่รู้วันนัด · ส่ง installments มาไม่ใช่อาเรย์
   (null/undefined = ผู้เรียกยังไม่ได้โหลด หรือ API นั้นไม่ได้ select มา) · อาเรย์ว่าง
   · ไม่มีงวดไหน confirmed ⇒ ตอบ **ไม่ผ่าน** ทั้งหมด
   ⭐ **"ใบยอด 0 ไม่มีงวด" ไม่ตัดสินที่นี่** — ระบบมีตัวตัดสินตัวเดียวของเรื่องนั้นอยู่แล้วคือ
   `paymentNotRequired(orderTotal)` (lib/sales/salesOrderPayments.js) ซึ่ง `installmentActionError`
   ใช้อยู่ · ถ้าที่นี่แปล "ไม่มีแถว = ผ่าน" เอง จะกลายเป็นกติกาที่สองที่กว้างกว่าของจริง:
   ใบยอดไม่เป็นศูนย์ก็ไม่มีแถวได้ (ใบเก่าก่อน mig 0245 ที่ยังไม่มีใครกด "เริ่มติดตามการชำระ")
   แล้วด่านจะเปิดให้ทุกนัดของใบที่ยังไม่เคยเก็บเงินสักบาท — fail-open ที่ตรงข้ามกับมติ
   ⇒ ผู้เรียกใน PR-C ต้องประกอบเอง: `paymentNotRequired(order.totalAmount) || coversDate(...)` */
export function coversDate(installments, dateIso) {
  const day = dateOf(dateIso);
  if (!day) return false;
  if (!Array.isArray(installments)) return false;
  const through = paidThrough(installments);
  return !!through && !isBefore(through, day);
}

/* ── งวดเลยกำหนดที่บัญชียังไม่รับรอง — บล็อกทั้งใบ ไม่มี grace ───────────
   นับ `rejected` ด้วย: บัญชีตีกลับ = เงินยังไม่เข้า ไม่ใช่เรื่องจบแล้ว
   คืน "แถว" ไม่ใช่ boolean เพราะทั้งจอคิวและด่านต้องบอกได้ว่า *งวดไหน* ค้าง */
export function overdueUnconfirmed(installments = [], todayIso) {
  const today = dateOf(todayIso);
  if (!today) return [];
  return (installments || []).filter((row) => {
    if (isConfirmed(row)) return false;
    const due = dateOf(row?.dueDate);
    return !!due && isBefore(due, today);
  });
}

export const hasOverdueUnconfirmed = (installments, todayIso) =>
  overdueUnconfirmed(installments, todayIso).length > 0;

/* ── สรุปสำหรับหัวการ์ด/แถบสถานะเส้น ───────────────────────────────────── */
export function coverageRollup(installments = [], todayIso) {
  const rows = Array.isArray(installments) ? installments : [];
  const overdue = overdueUnconfirmed(rows, todayIso);
  return {
    total: rows.length,
    confirmedCount: rows.filter(isConfirmed).length,
    paidThrough: paidThrough(rows),
    overdueCount: overdue.length,
    /* งวดที่รับเงินแล้วแต่ไม่มีช่วงครอบ — ตัวเลขนี้คือเหตุผลที่ "จ่ายถึง" ต่ำกว่าความจริง */
    confirmedWithoutCoverage: rows.filter((row) => isConfirmed(row) && !dateOf(row?.coversTo)).length,
  };
}

/* ── คำเตือนเรื่องช่วงครอบ — **เตือน ไม่บล็อก** ─────────────────────────
   ⭐ จงใจไม่มี constraint ที่ฐานและไม่มีด่านที่ API: แผนชำระของจริงในชีตทีมมี
   29 รูปแบบพิมพ์มือ (มัดจำ + รายเดือน + ก้อนท้าย ปนกัน) ถ้าบล็อกช่วงซ้อน/เว้น
   ใบจริงจะบันทึกไม่ได้ทั้งใบ ⇒ บอกให้คนเห็นแล้วให้คนตัดสิน
   เรียงตาม seq ก่อนเทียบเสมอ — ลำดับในอาเรย์ที่ API คืนมาไม่ใช่ลำดับงวด */
export function coverageWarnings(installments = []) {
  const rows = [...(installments || [])]
    .filter(Boolean)
    .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));

  const out = [];
  for (const row of rows) {
    const from = dateOf(row?.coversFrom);
    const to = dateOf(row?.coversTo);
    if (isConfirmed(row) && !to) {
      out.push({ kind: 'confirmed_without_coverage', seq: row?.seq ?? null });
      continue;
    }
    if ((from && !to) || (!from && to)) out.push({ kind: 'half_range', seq: row?.seq ?? null });
  }

  const ranged = rows.filter((row) => dateOf(row?.coversFrom) && dateOf(row?.coversTo));
  for (let i = 1; i < ranged.length; i += 1) {
    const prevTo = dateOf(ranged[i - 1].coversTo);
    const from = dateOf(ranged[i].coversFrom);
    if (!isBefore(prevTo, from)) {
      out.push({ kind: 'overlap', seq: ranged[i]?.seq ?? null, since: from, until: prevTo });
      continue;
    }
    if (from !== addDays(prevTo, 1)) {
      out.push({ kind: 'gap', seq: ranged[i]?.seq ?? null, since: addDays(prevTo, 1), until: addDays(from, -1) });
    }
  }
  return out;
}

/* ── ช่วงครอบต่อเนื่องเต็มสัญญา — **ด่าน** ของใบสั่งขายย้อนหลัง (mig 0374 · มติ 22/09) ──────────
   ⭐ ตัวเดียวกับลูปท้ายของ `historical_so_check_installments` ในฐาน: เรียงตามวันเริ่มครอบ (แล้ววันสิ้นสุด)
     งวดแรกเริ่มวันเริ่มสัญญา · งวดถัดไปเริ่มวันถัดจากวันสิ้นสุดของงวดก่อนพอดี · งวดสุดท้ายจบวันสิ้นสุดสัญญาพอดี
     ⇒ `coverageIsContinuous` ตอบ true ⇔ ฐานผ่านข้อนี้ — พรีวิวกับบันทึกต้องตัดสินเหมือนกัน (บทเรียน #1685)
   ⚠️ **คนละกติกากับ `coverageWarnings`** ข้างบน — ตัวนั้นเตือนใบปกติ (แผนชำระจริงพิมพ์มือหลายรูปแบบ ห้ามบล็อก)
     ส่วนใบย้อนหลังคีย์เงินทั้งสัญญาในครั้งเดียว (ยกมา + ที่ยังต้องเก็บ) ⇒ ช่องโหว่/ช่วงซ้อน = คีย์ผิดแน่นอน
   · 'missing' = งวดที่ไม่มีช่วงครอบที่ใช้ได้ (ไม่กรอก · วันไม่มีจริง · เริ่มหลังสิ้นสุด) — ฐานตีกลับงวดแบบนี้ตั้งแต่
     ตรวจรายงวด ⇒ เจอแล้วคืนเฉพาะกลุ่มนี้ ไม่ไล่ต่อ (ไล่ต่อได้แต่ช่องโหว่ปลอมรอบงวดที่ขาด)
     · ไม่มีงวดเลย / ช่วงสัญญาใช้ไม่ได้ = 'missing' แถวเดียว (ไม่ครอบอะไรเลย) — ⚠️ ฐาน **ข้าม** ลูปนี้เมื่อไม่มีงวด
       เพราะใบ ฿0 ไม่มีงวด ⇒ ผู้เรียกตัดสินใบ ฿0 เองก่อนถามตัวนี้ (fail-closed ที่นี่ ไม่ใช่เดาว่าผ่าน)
   · 'start' / 'gap' / 'overlap' / 'end' พก since..until = ช่วงวันที่ขาด/ซ้อน/เกินจริง ให้จอบอกได้ตรงวัน
     · `index` = ตำแหน่งในอาเรย์ที่ส่งเข้ามา (ผู้เรียกผูกกลับไปหาช่องในฟอร์ม) · `seq` = row.seq ถ้ามี
   · "วันที่คาด" เดินแบบเดียวกับฐาน (วันสิ้นสุดงวดล่าสุด + 1) แต่ **ไม่ถอยหลัง** เมื่องวดซ้อนอยู่ข้างในงวดก่อน —
     กันรายงานช่องโหว่ปลอมถัดจากงวดที่ซ้อน · ผลว่าผ่าน/ไม่ผ่านยังเท่าฐานเป๊ะ: ก่อนเจอข้อผิดข้อแรกทุกงวดเดินหน้า
     เสมอ (เริ่ม = วันที่คาด และสิ้นสุด ≥ เริ่ม) ⇒ วันที่คาดสองฝั่งเท่ากันจนถึงจุดนั้น */
const calendarDay = (value) => {
  const day = dateOf(value);
  // `new Date('2026-02-30')` ไม่ error แต่ปัดเป็น 2 มี.ค. — บวก 0 วันแล้วต้องได้สตริงเดิม (ฐาน cast แล้ว error)
  return day && addDays(day, 0) === day ? day : null;
};
const minDay = (a, b) => (isBefore(a, b) ? a : b);

export function coverageContinuityErrors(rows = [], { start = null, end = null } = {}) {
  const first = calendarDay(start);
  const last = calendarDay(end);
  const list = Array.isArray(rows) ? rows : [];
  if (!first || !last || isBefore(last, first) || !list.length) {
    return [{ kind: 'missing', seq: null, index: null, since: first && last ? first : null, until: first && last ? last : null }];
  }

  const spans = [];
  const missing = [];
  list.forEach((row, index) => {
    const from = calendarDay(row?.coversFrom);
    const to = calendarDay(row?.coversTo);
    const seq = row?.seq ?? null;
    if (!from || !to || isBefore(to, from)) {
      missing.push({ kind: 'missing', seq, index, since: null, until: null });
      return;
    }
    spans.push({ from, to, seq, index });
  });
  if (missing.length) return missing;

  // = ORDER BY coversFrom, coversTo ของฐาน (สตริงวัน ISO เรียงตามตัวอักษร = เรียงตามเวลา)
  spans.sort((a, b) => (a.from === b.from ? (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) : (a.from < b.from ? -1 : 1)));

  const out = [];
  let expect = first;
  spans.forEach((span, i) => {
    const at = { seq: span.seq, index: span.index };
    if (span.from !== expect) {
      if (i === 0) {
        // งวดแรกไม่เริ่มวันเริ่มสัญญา — เริ่มช้า (วันต้นสัญญาไม่มีใครครอบ) หรือเริ่มก่อนสัญญา
        out.push(isBefore(expect, span.from)
          ? { kind: 'start', ...at, since: expect, until: addDays(span.from, -1) }
          : { kind: 'start', ...at, since: span.from, until: addDays(expect, -1) });
      } else if (isBefore(expect, span.from)) {
        out.push({ kind: 'gap', ...at, since: expect, until: addDays(span.from, -1) });
      } else {
        out.push({ kind: 'overlap', ...at, since: span.from, until: minDay(addDays(expect, -1), span.to) });
      }
    }
    const next = addDays(span.to, 1);
    if (isBefore(expect, next)) expect = next;
  });

  const through = addDays(expect, -1);
  if (through !== last) {
    const tail = spans[spans.length - 1];
    const at = { seq: tail.seq, index: tail.index };
    out.push(isBefore(through, last)
      ? { kind: 'end', ...at, since: expect, until: last }            // ยังไม่ถึงวันสิ้นสุดสัญญา
      : { kind: 'end', ...at, since: addDays(last, 1), until: through }); // ครอบเกินวันสิ้นสุดสัญญา
  }
  return out;
}

export const coverageIsContinuous = (rows, bounds) => coverageContinuityErrors(rows, bounds).length === 0;

/* ── เลขคณิตปฏิทิน (ไม่มีโซนเวลา) ──────────────────────────────────────── */
export function addDays(dateIso, days) {
  const day = dateOf(dateIso);
  if (!day) return null;
  const base = new Date(`${day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  /* ⚠️ ประกอบสตริงจากส่วน UTC เอง **ไม่ใช้ `.toISOString().slice(0, 10)`** — ที่นี่ไม่ผิด
     เพราะเป็นเลขคณิตปฏิทินล้วน แต่รูปนั้นคือรูปที่ด่าน `check:thaitime` ไล่จับ และมันจับ
     ตามชื่อตัวแปร ⇒ วันหนึ่งใครเปลี่ยนชื่อตัวแปรเป็นอะไรที่ลงท้าย `At` ด่านจะแดงทันที
     โดยไม่มีอะไรผิดจริง · เขียนแบบนี้แล้วไม่ต้องพึ่งโชคของชื่อตัวแปร */
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function daysBetween(fromIso, toIso) {
  const a = dateOf(fromIso);
  const b = dateOf(toIso);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/* ── ปุ่ม "แบ่งช่วงอัตโนมัติ" ─────────────────────────────────────────────
   แบ่งช่วงสัญญาเป็น n ท่อนต่อกันสนิท (ไม่ซ้อน ไม่เว้น) — **งวดสุดท้ายกินเศษ**
   เพื่อให้วันจบท่อนสุดท้าย = วันจบสัญญาเป๊ะเสมอ (ค่าที่คนตรวจจะมองหาก่อนเพื่อน)
   ⚠️ เป็น **ปุ่มให้คนกด ไม่ใช่ค่าตั้งต้นที่เติมเงียบ ๆ** — กฎฟอร์มของ repo:
   สิ่งที่เป็นการตัดสินใจห้ามมี default (แผนชำระจริงไม่ได้แบ่งเท่ากันทุกใบ) */
export function splitCoverageEvenly({ startDate, endDate, count } = {}) {
  const from = dateOf(startDate);
  const to = dateOf(endDate);
  const parts = Number(count);
  if (!from || !to || !Number.isInteger(parts) || parts < 1) return [];
  const span = daysBetween(from, to) + 1;
  if (span < parts) return [];

  const size = Math.floor(span / parts);
  const out = [];
  let cursor = from;
  for (let i = 0; i < parts; i += 1) {
    const last = i === parts - 1;
    const end = last ? to : addDays(cursor, size - 1);
    out.push({ coversFrom: cursor, coversTo: end });
    cursor = addDays(end, 1);
  }
  return out;
}

/* ── แบ่งช่วงตาม **เดือนปฏิทิน** (มติเจ้าของ 25/09 — รื้อขั้นงวดชำระของ SO ย้อนหลัง) ─────────────────
   🐞 ของเดิม (`splitCoverageEvenly`) หารจำนวนวันเท่า ๆ กัน ⇒ สัญญา 1 ม.ค.–31 ธ.ค. แบ่ง 12 งวดได้ 01/01–30/01 ·
      31/01–01/03 · 02/03–31/03 … ช่วงไม่ตรงเดือน วันครบกำหนดเลื่อนทุกงวด (SO-26090232-0 ลงฐานไปแบบนั้นแล้ว)
      ทั้งที่ชีตจริงเก็บ "ทุกวันที่เดิมของเดือน" เสมอ
   ⇒ ขอบของรอบที่ k = **วันที่เดียวกับวันเริ่ม ในเดือนที่ k ถัดไป** · เดือนที่ไม่มีวันที่นั้น (31 → เม.ย. · 29–31 → ก.พ.)
     ขอบเลื่อนไปวันที่ 1 ของเดือนถัดไป = รอบนั้นจบ "สิ้นเดือน" (อ่านอย่างที่คนเขียนสัญญาอ่าน)
   ⚠️ ไฟล์นี้ไม่ตัดสินว่าช่วงทั้งก้อน "ลงตัวเป็นเดือนไหม" — ผู้เรียกส่ง `months` ที่ตรวจแล้วมา
     (กติกาของฟอร์มอยู่ที่ `serviceMonthSpan` ของ historicalIntakeForm) */
const isoOfUtc = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

/** วันแรกของรอบที่ k (k เดือนหลังวันเริ่ม) — `monthEdge('2026-01-31', 1)` = '2026-03-01' (ก.พ. ไม่มีวันที่ 31) */
export function monthEdge(startIso, k) {
  const from = dateOf(startIso);
  const n = Number(k);
  if (!from || !Number.isInteger(n) || n < 0) return null;
  if (n === 0) return from;
  const [year, month, day] = from.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1 + n, day));
  if (probe.getUTCDate() === day) return isoOfUtc(probe);
  return isoOfUtc(new Date(Date.UTC(year, month + n, 1)));
}

/** วันที่เดียวกับวันเริ่มในเดือนที่ k ถัดไป **ตัดที่สิ้นเดือน** (ไม่ล้นไปเดือนหน้า) — "เดือนประจำ" ของรอบที่ k
 *  ใช้ตัดสินวันครบกำหนดแบบ "สิ้นเดือน" / "ทุกวันที่ n" ให้ได้เดือนละหนึ่งวัน
 *  🐞 รีวิว 25/09: เคยใช้วันเริ่มของท่อน (ซึ่งล้นไปวันที่ 1 ของเดือนหน้าเมื่อเดือนนั้นไม่มีวันที่เริ่ม) ⇒ สัญญาเริ่มวันที่
 *     29–31 ได้วันครบกำหนดซ้ำเดือนเดียวกันสองงวด และไม่มีงวดใน ก.พ./เม.ย./มิ.ย. … */
export function monthAnchor(startIso, k) {
  const from = dateOf(startIso);
  const n = Number(k);
  if (!from || !Number.isInteger(n) || n < 0) return null;
  const [year, month, day] = from.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + n + 1, 0)).getUTCDate();
  return isoOfUtc(new Date(Date.UTC(year, month - 1 + n, Math.min(day, lastDay))));
}

/**
 * ช่วง → ท่อนละ `stepMonths` เดือนปฏิทินบน **ตารางเดือนของ `gridStart`** ต่อกันสนิท · ท่อนสุดท้ายจบที่ `endDate` เสมอ
 * (สัญญาที่จบตรงวันครบรอบ ท่อนสุดท้ายจึงยาวขึ้นหนึ่งวัน — มติเจ้าของ 25/09)
 * @param months   จำนวนเดือนของช่วง (ผู้เรียกตรวจมาแล้ว) · หารด้วย stepMonths ไม่ลงตัว = [] (ผู้เรียกบอกเหตุเอง)
 * @param gridStart วันเริ่มของตารางเดือน (วันเริ่มสัญญา) — ไม่ส่ง = `startDate` · 🐞 รีวิว 25/09: ช่วงที่เหลือหลังงวดยกมาของ
 *   สัญญาเริ่มวันที่ 31 เริ่มวันที่ 1 (ขอบที่ล้น) ⇒ นับเดือนใหม่จากวันที่ 1 แล้ว "ไม่ลงตัว" ทั้งที่ตรงตารางของสัญญาเป๊ะ
 * @param offset   ท่อนแรกเริ่มที่เดือนที่ `offset` ของตาราง (`monthEdge(gridStart, offset) === startDate`)
 * @returns `[{ coversFrom, coversTo, anchor }]` — anchor = เดือนประจำของท่อน (`monthAnchor`)
 */
export function splitCoverageByMonths({ startDate, endDate, months, stepMonths, gridStart = null, offset = 0 } = {}) {
  const from = dateOf(startDate);
  const to = dateOf(endDate);
  const grid = dateOf(gridStart) || from;
  const skip = Number(offset) || 0;
  const total = Number(months);
  const step = Number(stepMonths);
  if (!from || !to || !grid || to < from) return [];
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(step) || step < 1 || total % step !== 0) return [];
  if (monthEdge(grid, skip) !== from) return [];
  const count = total / step;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const coversFrom = monthEdge(grid, skip + i * step);
    const coversTo = i === count - 1 ? to : addDays(monthEdge(grid, skip + (i + 1) * step), -1);
    if (!coversFrom || !coversTo || coversTo < coversFrom) return [];
    out.push({ coversFrom, coversTo, anchor: monthAnchor(grid, skip + i * step) });
  }
  return out;
}

/**
 * วันครบกำหนดของงวดหนึ่ง ตามกติกาที่ผู้คีย์เลือกในหน้าต่างแบ่งงวด (ชีตจริงใช้สามแบบ — ดู r3_research)
 * @param rule 'start' (วันเริ่มของงวด) · 'monthEnd' (สิ้นเดือนของเดือนประจำงวด) · 'day' (ทุกวันที่ n —
 *   วันแรกที่ตรง n นับจากวันเริ่มของงวด · เดือนที่ไม่มีวันที่ n ใช้สิ้นเดือน) · 'manual' (ว่าง — กรอกเองในตาราง)
 * @returns สตริงวัน หรือ '' เมื่อไม่มีกติกา/ข้อมูลไม่พอ (ไม่เดาแทนผู้คีย์)
 */
export function dueDateByRule(coversFrom, rule, day = null, anchor = null) {
  const start = dateOf(coversFrom);
  if (!start) return '';
  if (rule === 'start') return start;
  /* "สิ้นเดือน" / "ทุกวันที่ n" คิดจากเดือนประจำของงวด (anchor) — ไม่ส่ง = วันเริ่มของงวด */
  const from = dateOf(anchor) || start;
  const [year, month, d] = from.split('-').map(Number);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (rule === 'monthEnd') return isoOfUtc(new Date(Date.UTC(year, month - 1, lastDay(year, month))));
  if (rule === 'day') {
    const n = Number(day);
    if (!Number.isInteger(n) || n < 1 || n > 31) return '';
    const inMonth = (y, m) => Math.min(n, lastDay(y, m));
    if (inMonth(year, month) >= d) return isoOfUtc(new Date(Date.UTC(year, month - 1, inMonth(year, month))));
    const next = new Date(Date.UTC(year, month, 1));
    const ny = next.getUTCFullYear();
    const nm = next.getUTCMonth() + 1;
    return isoOfUtc(new Date(Date.UTC(ny, nm - 1, inMonth(ny, nm))));
  }
  return '';
}
