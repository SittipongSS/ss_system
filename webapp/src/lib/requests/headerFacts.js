// ── หัวใบคำร้อง — ประกอบที่นี่ ไม่ใช่ใน JSX ────────────────────────────────
//
// ⭐ **แยกออกมาเพราะเดิมมันเทสต์ไม่ได้** — ของเดิมเป็นอาเรย์ที่ประกอบกลาง JSX ของ
// หน้ารายละเอียด (1,600 บรรทัด) ⇒ กติกา "ช่องไหนขึ้นเมื่อไร" ไม่มีอะไรตรึงไว้เลย
// และเป็นที่มาของบั๊กที่ผู้ใช้แจ้งเองสองรอบ (IS-26080003 · ม-98 → ม-101)
//
// ⭐ **โครงหัวใบแบ่งเป็นสามชั้น** (มติผู้ใช้ 2026-08-11 · ม-101 — เลือกจากม็อกอัพ 3 แบบ)
//
//   1. บรรทัดเรื่อง   — หัวข้อคำร้อง + **ลูกค้า** ต่อท้ายเป็นประโยคเดียว ("ทำอะไร ให้ใคร")
//   2. บรรทัดคน      — ชิป **ผู้ยื่น → ผู้รับเรื่อง** สองฝั่งของใบอยู่ติดกัน
//   3. แถบข้อเท็จจริง — เหลือแต่ **เรื่องเวลา** (ส่งเมื่อ · คืบหน้า · สองวันกำหนด)
//
// ⚠️ ลูกค้ากับคนถูกยกออกจากแถบข้อเท็จจริงแล้ว — อย่าเติมกลับเข้าไปเป็นช่องอีก
// มันจะกลายเป็นข้อมูลเดียวกันสองที่บนหัวเดียวกัน
import { fmtDate } from '@/lib/format';
import { requestSideText } from '@/lib/requests/replyTurn';

const DAY_MS = 24 * 60 * 60 * 1000;

// วันแบบปฏิทิน — เทียบที่ "วัน" ไม่ใช่ที่ชั่วโมง เพราะหน้าจอพูดว่า "อีก 3 วัน"
//
// ⚠️ **นับตามปฏิทินของเครื่องที่เรนเดอร์** (กติกาเดียวกับ `fmtDate`) — ตั้งใจให้ตรงกับ
// วันที่ที่พิมพ์อยู่ข้าง ๆ กัน ไม่ใช่ตรงกับเวลาไทยเสมอ · เทสต์จึงต้องสร้างวันจาก "ตอนนี้"
// ไม่ใช่สะกดเวลาพร้อม offset (เทสต์แบบหลังผ่านบนเครื่องไทยแต่แดงบน CI ที่เป็น UTC)
// ⚠️ ตัดเวลาทิ้งทั้งสองฝั่งก่อนลบกัน ไม่งั้นใบที่ส่งเมื่อ 23:50 จะกลายเป็น "1 วันก่อน"
// ตอนตีหนึ่ง ซึ่งจริงแต่ไม่ใช่คำตอบที่คนถาม
function dayDiff(fromValue, toValue) {
  // ⚠️ กันค่าว่างก่อนเสมอ — `new Date(null)` คือ 1 ม.ค. 1970 ซึ่ง **เป็นวันที่ที่ถูกต้อง**
  // ⇒ ใบที่ยังไม่มีวันจะได้คำตอบว่า "เร็วกว่าที่ขอ 20,679 วัน" แทนที่จะเงียบ
  if (!fromValue || !toValue) return null;
  const from = new Date(fromValue);
  const to = new Date(toValue);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const f = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const t = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((t - f) / DAY_MS);
}

/** "ค้างมา 3 วัน" / "เมื่อวาน" / "วันนี้" — นับจากวันที่ส่งถึงวันนี้ */
export function ageLabel(sentAt, now = new Date()) {
  const days = dayDiff(sentAt, now);
  if (days === null || days < 0) return null;
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  return `ค้างมา ${days} วัน`;
}

/** "อีก 3 วัน" / "วันนี้" / "เลยมา 2 วัน" — นับจากวันนี้ถึงวันกำหนด */
export function countdownLabel(dueDate, now = new Date()) {
  const days = dayDiff(now, dueDate);
  if (days === null) return null;
  if (days === 0) return 'ครบกำหนดวันนี้';
  if (days > 0) return `อีก ${days} วัน`;
  return `เลยกำหนดมา ${Math.abs(days)} วัน`;
}

/**
 * เทียบวันที่ฝ่ายรับปาก กับวันที่ผู้ขอต้องการ
 * คืน `{ text, tone }` — tone ใช้เลือกสีที่หน้าจอ (`ok` เขียว · `late` แดง)
 *
 * ⭐ ผู้ใช้ขอให้เห็นสองวันนี้พร้อมกันเสมอ (ม-101) — ของเดิมสลับกันใช้ช่องเดียว
 * พอฝ่ายรับปากวันแล้ว วันที่ผู้ขอขอจะหายไป ⇒ เทียบไม่ได้ว่าตรงกับที่ขอไหม
 * ทั้งที่นั่นคือสิ่งเดียวที่ผู้ขอต้องดู
 */
export function committedVsRequested(committedDate, requestedDate) {
  const days = dayDiff(committedDate, requestedDate);
  if (days === null) return null;
  if (days === 0) return { text: 'ตรงกับที่ขอ', tone: 'ok' };
  if (days > 0) return { text: `เร็วกว่าที่ขอ ${days} วัน`, tone: 'ok' };
  return { text: `ช้ากว่าที่ขอ ${Math.abs(days)} วัน`, tone: 'late' };
}

/**
 * ชิปผู้ยื่นบนหัวใบ — `{ requester }`
 *
 * ⚠️ `mine` ต้องมาจาก **"ฉันเป็นคนเปิดใบนี้"** (`_opener` จาก server) ไม่ใช่ `_mine`
 * ซึ่งแปลว่า "จัดการได้" — ตั้งแต่ทีมทำแทนกันได้ (ม-100) สองอย่างนี้ไม่เท่ากันแล้ว
 * และป้าย "ใบของฉัน" ที่ขึ้นบนใบของเพื่อนคือการโกหกหน้าจอ
 *
 * ⚠️ **ผู้รับเรื่องไม่อยู่ในชิป** — เคยลองทำเป็นชิปคู่ (ผู้ยื่น → ผู้รับเรื่อง) แล้วผู้ใช้
 * เลือกกลับไปใช้บรรทัด "รับเรื่องโดย …" ใต้หัวใบแทน (ม-101.2) · ที่นี่จึงมีฝั่งเดียว
 * ห้ามเติมกลับโดยไม่ถามก่อน — สองที่พร้อมกันคือข้อมูลซ้ำที่ผู้ใช้ทักมาแล้ว
 */
export function requestHeaderPeople(request, { mine = false } = {}) {
  if (!request) return null;
  const team = String(request.team || '').trim();
  return {
    requester: {
      name: request.requestedByName || '—',
      // ใบของตัวเองไม่ต้องอ่านชื่อตัวเอง — บอกทีมพอ · ใบของเพื่อนต้องเห็นชื่อ
      label: mine ? 'ใบของฉัน' : 'ผู้ยื่น',
      team: team || null,
      mine,
    },
  };
}

/**
 * ช่องในแถบข้อเท็จจริง — คืนอาเรย์ `{ key, label, value, sub, tone }`
 *
 * ⚠️ **เหลือแต่เรื่องเวลา** — ลูกค้าอยู่บรรทัดเรื่อง · คนอยู่บรรทัดชิป (ม-101)
 * @param hasItems ใบนี้มีบรรทัดข้างในไหม — ตัดสินว่าจะมีช่อง "ตอบแล้ว" หรือไม่
 * @param progress `{ done, total }` ของบรรทัด
 * @param now ฉีดเวลาเข้ามาได้เพื่อให้เทสต์ตรึงค่าได้ (หน้าจอส่งเวลาจริง)
 */
export function requestHeaderFacts(request, { hasItems = false, progress = null, now = new Date() } = {}) {
  if (!request) return [];
  const facts = [];

  // ⭐ **วันที่ส่ง ไม่ใช่วันที่สร้าง** — ร่างที่ยังไม่ส่งไม่มีความหมายกับใครนอกจากคนเปิด
  // และคำถามแรกของคนตามงานคือ "ส่งไปกี่วันแล้ว" (มติผู้ใช้ ม-101)
  if (request.submittedAt) {
    facts.push({
      key: 'submitted',
      label: 'ส่งเมื่อ',
      value: fmtDate(request.submittedAt),
      sub: ageLabel(request.submittedAt, now),
    });
  } else {
    facts.push({ key: 'submitted', label: 'สถานะใบ', value: 'ยังไม่ได้ส่ง', sub: 'ร่างที่ยังไม่เข้าคิวฝ่าย' });
  }

  if (hasItems && progress) {
    facts.push({
      key: 'progress',
      label: 'ตอบแล้ว',
      value: `${progress.done}/${progress.total} รายการ`,
      sub: progress.done ? null : 'ยังไม่มีรายการที่ตอบ',
    });
  }

  // ⭐ ด่วนขึ้นเฉพาะใบที่ติ๊กด่วนจริง — เดิมป้ายนี้มีแต่ในคิว คนที่เปิดใบเข้าไป
  // ไม่มีทางรู้ว่าใบนี้ด่วน และ `urgentReason` ที่บังคับกรอกไม่เคยถูกอ่านที่ไหนเลย
  if (request.urgent) {
    facts.push({
      key: 'urgent',
      label: 'ความเร่งด่วน',
      value: 'งานด่วน',
      sub: request.urgentReason || null,
      tone: 'late',
    });
  }

  // ── สองวันกำหนด — อยู่คู่กันเสมอ ────────────────────────────────────
  const wanted = String(request.requestedDueDate || '').trim();
  const committed = String(request.committedDueDate || '').trim();

  facts.push({
    key: 'requestedDue',
    label: 'ผู้ขอต้องการรับงาน',
    value: wanted ? fmtDate(wanted) : '—',
    sub: wanted ? countdownLabel(wanted, now) : 'ใบเก่าที่เปิดก่อนกติกาบังคับวัน',
  });

  const gap = committed && wanted ? committedVsRequested(committed, wanted) : null;
  facts.push({
    key: 'committedDue',
    label: `${request.dept || 'ฝ่าย'} กำหนดส่ง`,
    // ⚠️ "ยังไม่ระบุ" ไม่ใช่ขีด — ขีดอ่านได้ทั้ง "ไม่มีกำหนด" และ "ระบบไม่รู้"
    // ซึ่งคนละเรื่องกัน (บทเรียนเดียวกับคอลัมน์วันในคิว RD)
    value: committed ? fmtDate(committed) : 'ยังไม่ระบุ',
    // ⚠️ คำนี้ต้องตรงกับปุ่ม (มติผู้ใช้ 2026-08-19) — วันกำหนดส่งไม่ได้เกิดตอนกดรับ
    // เรื่องอีกแล้ว มันเป็นก้าว "แจ้งกำหนดส่ง" ที่ฝ่ายกดทีหลังได้
    sub: committed ? (gap?.text || null) : requestSideText(request, 'dept', 'ยังไม่ได้แจ้งกำหนดส่ง'),
    tone: committed ? gap?.tone || null : 'muted',
  });

  return facts;
}
