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
import { requestKindMeta } from '@/lib/master/requestTypes';
import { requestSideText } from '@/lib/requests/replyTurn';
import { liveCommittedDueDate, liveDueDate } from '@/lib/requests/dueRound';
import { requestDueOwed } from '@/lib/requests/queueBoard';
import { requestClosure, requestClosureStarted } from '@/lib/requests/closure';
/* ประเมินจากแบบ งวด 4 (S4 C-5) — วันที่ผู้ขออยากให้เข้าพื้นที่มีตัวอ่านเดียว (pure · ใช้ได้ทั้งเบราว์เซอร์และ server) */
import { SURVEY_NO_VISIT_WISH_TEXT, surveyFiledAsDrawing, surveyWishedVisit } from '@/lib/service/surveyIntake';
import { dueInfo } from '@/lib/dueState';
import { calendarDays } from '@/lib/dueState';


// วันแบบปฏิทิน — เทียบที่ "วัน" ไม่ใช่ที่ชั่วโมง เพราะหน้าจอพูดว่า "อีก 3 วัน"
//
// ⭐ **วันไทยเสมอ** (ตัวกลาง `calendarDays` · งวด 2) — 🐞 เดิมนับตามปฏิทินของเครื่องที่เรนเดอร์ ⇒ เครื่องที่ตั้งโซนอื่น
//    (หรือเรนเดอร์ฝั่ง server ที่เป็น UTC) นับ "ค้าง n วัน" ของใบที่ส่งตอนเช้ามืดผิดหนึ่งวัน
// ⚠️ ค่าว่าง = null (ไม่ใช่ 1 ม.ค. 1970) · ตัดเวลาทิ้งทั้งสองฝั่ง (วันของตราไทย) — ใบที่ส่ง 23:50 ไม่กลายเป็น "1 วันก่อน" ตอนตีหนึ่ง
function dayDiff(fromValue, toValue) {
  if (!fromValue || !toValue) return null;
  return calendarDays(fromValue, toValue);
}

/** "ค้างมา 3 วัน" / "เมื่อวาน" / "วันนี้" — นับจากวันที่ส่งถึงวันนี้ */
export function ageLabel(sentAt, now = new Date()) {
  const days = dayDiff(sentAt, now);
  if (days === null || days < 0) return null;
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'เมื่อวาน';
  return `ค้าง ${days} วัน`; // คำชุด "เลยกำหนด" (มติ 23/11/2026) — เดิม "ค้างมา" 
}


/**
 * นับถอยหลังของ **วันที่ฝ่ายรับปาก** — คำชุด "เลยกำหนด" (มติเจ้าของ 23/11/2026) · `{ text, tone }` หรือ null
 *
 * ⚠️ วันไทยล้วนทั้งคู่ (`YYYY-MM-DD` · หน้าส่ง `businessDate()` ที่จับใน effect) ⇒ เลขคณิตปฏิทินที่ตรึง `T00:00:00Z`
 *    ไม่ใช่ปฏิทินของเครื่องแบบ `dayDiff` — ป้ายแดงต้องตรงกับคิวทุกเครื่อง ทุกเขตเวลา
 */
export function dueCountdown(due, today) {
  // ตัวกลาง `lib/dueState` (งวด 2) — อีก ≤ 3 วันเหลืองเหมือนครบวันนี้ (มติ 23/11/2026)
  const info = dueInfo(due, today);
  if (info.key === 'none') return null;
  return { text: info.text, tone: info.key === 'late' ? 'late' : info.key === 'later' ? null : 'warn' };
}

/**
 * เทียบวันที่ฝ่ายรับปาก กับวันที่ผู้ขอต้องการ
 * คืน `{ text, tone }` — tone ใช้เลือกสีที่หน้าจอ (`ok` เขียว · `late` แดง)
 *
 * ⭐ ผู้ใช้ขอให้เห็นสองวันนี้พร้อมกันเสมอ (ม-101) — ของเดิมสลับกันใช้ช่องเดียว
 * พอฝ่ายรับปากวันแล้ว วันที่ผู้ขอขอจะหายไป ⇒ เทียบไม่ได้ว่าตรงกับที่ขอไหม
 * ทั้งที่นั่นคือสิ่งเดียวที่ผู้ขอต้องดู
 * @param today วันไทยวันนี้ `YYYY-MM-DD` — ส่งมา = วันที่รับปากผ่านไปแล้วคืน `null` (ไม่มีบรรทัดเทียบ) · ไม่ส่ง = เทียบเสมอ (ผู้เรียกเดิม)
 */
export function committedVsRequested(committedDate, requestedDate, { today = null } = {}) {
  /* ⭐ **เลยวันที่รับปากแล้ว = ไม่เทียบกับวันที่ขอ** (S2b แก้หลังตรวจจอ sales-minor-3) — "เร็วกว่าที่ขอ 5 วัน" สีเขียวใต้วันที่พลาดไปแล้ว
     ข้างหัวแดง "เลยวันที่จะส่งผลมา 2 วัน" อ่านไม่ออกว่าช้าหรือเร็ว · กติกาเดียวกับขั้นลงคิวที่ซ่อนบรรทัดนี้ตอนเลยวันนัดอยู่แล้ว
     ⚠️ เทียบวันไทยแบบสตริง (`YYYY-MM-DD` ทั้งคู่ — ผู้เรียกส่ง "วันนี้" ของ `businessDate()`) · ไม่ส่ง `today` = พฤติกรรมเดิมทุกผู้เรียก */
  const due = String(committedDate ?? '').trim();
  if (today && due && due < String(today).trim()) return null;
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
export function requestHeaderFacts(request, { hasItems = false, progress = null, now = new Date(), today = null } = {}) {
  if (!request) return [];
  const facts = [];

  // ⭐ **วันที่ส่ง ไม่ใช่วันที่สร้าง** — ร่างที่ยังไม่ส่งไม่มีความหมายกับใครนอกจากคนเปิด
  // และคำถามแรกของคนตามงานคือ "ส่งไปกี่วันแล้ว" (มติผู้ใช้ ม-101)
  if (request.submittedAt) {
    /* 🐞 ใบที่จบ/ยกเลิก/มีฝั่งปิดแล้วไม่นับ "ค้างมา n วัน" (ตรวจทั้งระบบ 23/11/2026) — เดิมนับขึ้นทุกวันบนใบยกเลิก
       (RQ-FD-26110585 · ยกเลิกแล้วยังขึ้น "ค้างมา 6 วัน") · ตัวตัดสินชุดเดียวกับ `noCountdown` ข้างล่าง */
    const ended = requestClosureStarted(request) || requestClosure(request).complete || requestClosure(request).cancelled;
    facts.push({
      key: 'submitted',
      label: 'ส่งเมื่อ',
      value: fmtDate(request.submittedAt),
      sub: ended ? null : ageLabel(request.submittedAt, now),
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
  /* 🔴 **ผ่าน `surveyWishedVisit` ไม่อ่านคอลัมน์ตรง ๆ** (S4 C-5) — ใบประเมินที่ยื่นเป็นประเมินจากแบบเก็บ `requestedDueDate`
     = กระจกของวันรับผล (คอลัมน์ต้องมีค่า) ⇒ ตัวอ่านคืน "ไม่รู้" ให้ใบนั้นเสมอ · หัวข้ออื่น/ใบลงหน้างาน = ค่าคอลัมน์เดิม */
  const noWish = surveyFiledAsDrawing(request);
  const wish = surveyWishedVisit(request);
  const wanted = wish.known ? String(wish.date).trim() : '';
  // ⚠️ วันของรอบก่อน = ยังไม่มีวันของรอบนี้ ⇒ การ์ดหัวใบต้องไม่ขัดกับรางใต้มัน
  // ⚠️ ช่องนี้คือ `committedDueDate` (ใบประเมิน = วันนัด) — ตัวนับ "เลยกำหนด" คือ `liveDueDate` (ใบประเมิน = วันส่งผล · มติ 24/11/2026)
  const committed = liveCommittedDueDate(request) || '';
  const dueDate = liveDueDate(request) || '';

  /* ⚠️ ใบที่จบแล้ว/มีฝั่งปิดแล้วไม่นับถอยหลังอีก (ม-145) — "เลยกำหนดมา 22 วัน" ข้างการ์ดที่เขียน
     "ปิดครบ 2/2" คือสัญญาณ "ยังไม่จบ" ที่คิว/แดชบอร์ดเลิกพูดไปแล้ว (รีวิวจับได้) */
  const closure = requestClosure(request);
  const noCountdown = requestClosureStarted(request) || closure.complete || closure.cancelled;
  /* ⚠️ **ป้ายเดินตามทะเบียนหัวข้อ** — หัวข้อที่ฝ่ายปลายทางต้องเดินทางไปทำเองไม่ได้
     "รับงาน" ที่ไหน (ประเมินพื้นที่ = วันที่ต้องการให้เข้าพื้นที่) · ตัวเดียวกับป้ายบน
     ช่องจริงในฟอร์ม ⇒ การ์ดหัวใบกับฟอร์มเรียกของชิ้นเดียวกันด้วยคำเดียวกัน */
  const copy = requestKindMeta(request.kind)?.form || {};
  /* ⚠️ **เปลี่ยนป้ายเฉพาะหัวข้อที่มีสองวัน** — หัวข้อที่มีวันเดียวยังใช้คำกลางเดิม
     ("ผู้ขอต้องการรับงาน" / "RD กำหนดส่ง" · มติผู้ใช้ 2026-08-19 ล็อกคำไว้)
     ⇒ ที่เปลี่ยนคือใบที่ถ้าไม่บอกชื่อวันจะอ่านไม่ออกว่าวันไหนคือวันไหน */
  const twoDates = !!copy.resultDueLabel;
  /* ⭐ **ใบประเมินที่ประเมินจากแบบทั้งใบไม่มีวันเข้าพื้นที่** (mig 0408 · แผน survey-desk-assessment §4 · งวด S2a)
     — ใบแบบนี้ไม่ลงคิว ไม่มีนัด ⇒ สองช่องวันเข้าพื้นที่ (ผู้ขอ: วันที่ต้องการให้เข้า · ฝ่าย: วันนัด) ไม่ถูกส่งออก
       เหลือคู่วันส่งผลข้างล่างคู่เดียว ป้ายเดิม
     🐞 ปล่อยไว้ = หัวใบขึ้น "TS: วันนัดเข้าพื้นที่" ด้วยวันส่งผล: ตอนรับปากวันส่งผล `committedDueDate` ถูกเขียนเป็นวันเดียวกัน
        (คิวและตัวนับเลยกำหนดอ่านคอลัมน์นั้น) ทั้งที่ไม่มีใครนัดใครไว้
     ⚠️ ธง `surveyNeedsVisit` มาจากตัวโหลดคำร้อง (คิดจากแถวพื้นที่) — **`false` ตรงตัวเท่านั้น** · ไม่มีธง / ค่าอื่น = ต้องมีนัด
        (กติกาของงวด S1) ⇒ ใบของวันนี้ทุกใบได้สองช่องเดิม
     ⚠️ ถามคู่กับ `twoDates` — ธงนี้เป็นของหัวข้อที่มีวันส่งผลแยก หัวข้อที่มีวันเดียวถือมาก็ต้องไม่เหลือหัวใบที่ไม่มีวันสักช่อง */
  const deskJob = twoDates && request.surveyNeedsVisit === false;
  if (!deskJob) {
    facts.push({
      key: 'requestedDue',
      label: twoDates ? `ผู้ขอ: ${copy.dueLabel}` : 'ผู้ขอต้องการรับงาน',
      /* ⚠️ ยื่นเป็นประเมินจากแบบ (หัวหน้าสลับกลับเป็นลงหน้างานแล้วช่องนี้จึงขึ้น) — ไม่มีใครขอวันเข้า: บอกตรง ๆ และ
         **sub เป็น null** · ทางสำรองของวันว่าง ("ใบเก่าที่เปิดก่อนกติกาบังคับวัน") จะเรียกใบที่เพิ่งยื่นว่าใบเก่า */
      value: noWish ? SURVEY_NO_VISIT_WISH_TEXT : (wanted ? fmtDate(wanted) : '—'),
      /* ⭐ **วันที่ผู้ขอขอเป็นวันอ้างอิงเฉย ๆ — ไม่นับถอยหลัง ไม่แดง** (มติเจ้าของ 23/11/2026)
         🐞 เดิมนับ "เลยกำหนดมา n วัน" จากวันนี้ ขณะที่คิว/ตัวเลข/ปฏิทินนับ "เลยกำหนด" จากวันที่ฝ่ายรับปากเท่านั้น
            ⇒ หัวใบบอกเลยกำหนดทั้งที่คิวบอก "อีก 3 วัน" · นับถอยหลังย้ายไปช่องวันที่ฝ่ายรับปากข้างล่าง */
      sub: noWish ? null : wanted ? null : 'ใบเก่าที่เปิดก่อนกติกาบังคับวัน',
    });

    /* ⭐ นับถอยหลังเฉพาะวันที่ฝ่ายยังติดค้าง (`requestDueOwed` — ตัวตัดสินเดียวกับคิว: ตาผู้ขอ/มีฝั่งปิด/ใบจบ = ไม่นับ)
       · เลยกำหนดแล้วไม่ต่อบรรทัด "เร็ว/ช้ากว่าที่ขอ" (`today` ทำให้ `committedVsRequested` เงียบ — S2b) */
    /* ⭐ หัวข้อสองวัน (ประเมินพื้นที่): นับถอยหลังที่ช่อง **วันส่งผล** ข้างล่าง ไม่ใช่ช่องวันนัด (มติเจ้าของ 24/11/2026) */
    const countdown = committed && !twoDates && !noCountdown && requestDueOwed(request) ? dueCountdown(committed, today) : null;
    const gap = committed && wanted ? committedVsRequested(committed, wanted, { today: countdown?.tone === 'late' ? today : null }) : null;
    facts.push({
      key: 'committedDue',
      label: twoDates
        ? `${request.dept || 'ฝ่าย'}: ${copy.committedDueLabel}`
        : `${request.dept || 'ฝ่าย'} กำหนดส่ง`,
      // ⚠️ "ยังไม่ระบุ" ไม่ใช่ขีด — ขีดอ่านได้ทั้ง "ไม่มีกำหนด" และ "ระบบไม่รู้"
      // ซึ่งคนละเรื่องกัน (บทเรียนเดียวกับคอลัมน์วันในคิว RD)
      /* ⚠️ ไม่มีวันและไม่มีใครต้องแจ้งแล้ว (จบ/ยกเลิก/มีฝั่งปิด) = ขีด ตรงกับช่องกำหนดส่งในคิว (ม-145)
         · "ยังไม่ระบุ" แปลว่ายังรอวันอยู่ ซึ่งไม่จริงสำหรับใบพวกนี้ */
      value: committed ? fmtDate(committed) : (noCountdown ? '—' : 'ยังไม่ระบุ'),
      // ⚠️ คำนี้ต้องตรงกับปุ่ม (มติผู้ใช้ 2026-08-19) — วันกำหนดส่งไม่ได้เกิดตอนกดรับ
      // เรื่องอีกแล้ว มันเป็นก้าว "แจ้งกำหนดส่ง" ที่ฝ่ายกดทีหลังได้
      sub: committed
        ? [countdown?.text, gap?.text].filter(Boolean).join(' · ') || null
        : noDueReason(request, closure),
      tone: committed ? countdown?.tone || gap?.tone || null : 'muted',
    });
  }

  /* ── วันที่สาม/สี่: **วันส่งผล** (มติผู้ใช้ 2026-09-21 · mig 0368) ──────────
     ⭐ หัวข้อที่ฝ่ายปลายทาง *ไปทำถึงที่* มีสองเหตุการณ์ที่ไม่เคยเป็นวันเดียวกัน — วันที่ไป
        กับวันที่ส่งของกลับ · สองช่องข้างบนพูดถึง **วันที่ไป** เท่านั้น
     ⚠️ ขึ้นเฉพาะหัวข้อที่ทะเบียนประกาศป้ายไว้ — ใบหัวข้ออื่นไม่มีวันชุดนี้ และการ์ด
        ที่ขึ้นเป็นขีดเปล่า ๆ สองช่องคือสัญญาณรบกวนล้วน ๆ
     ⭐ **นับถอยหลังที่ช่องนี้** (มติเจ้าของ 24/11/2026 "นับจากวันส่งผล") — คิว/แถบตัวเลข/กระดิ่งนับ "เลยกำหนด" จากวันส่งผล
        (`liveDueDate`) แล้ว · ช่องวันนัดข้างบนเลิกนับ ⇒ ยังมีนาฬิกาเดียวบนหัวใบ
        🪦 เดิม (21/09) นับที่วันเข้าพื้นที่ และช่องนี้ไม่นับ */
  if (twoDates) {
    const wantedResult = String(request.requestedResultDate || '').trim();
    const committedResult = String(request.committedResultDate || '').trim();
    const resultCountdown = dueDate && !noCountdown && requestDueOwed(request) ? dueCountdown(dueDate, today) : null;
    facts.push({
      key: 'requestedResultDue',
      label: `ผู้ขอ: ${copy.resultDueLabel}`,
      value: wantedResult ? fmtDate(wantedResult) : '—',
      sub: wantedResult ? null : 'ใบเก่าที่เปิดก่อนกติกาแยกสองวัน',
    });
    facts.push({
      key: 'committedResultDue',
      label: `${request.dept || 'ฝ่าย'}: ${copy.committedResultLabel || 'วันที่จะส่งผล'}`,
      value: committedResult ? fmtDate(committedResult) : (noCountdown ? '—' : 'ยังไม่ระบุ'),
      sub: committedResult ? resultCountdown?.text || null : requestSideText(request, 'dept', 'ยังไม่ได้แจ้งวันส่งผล'),
      tone: committedResult ? resultCountdown?.tone || null : 'muted',
    });
  }

  return facts;
}

/* ทำไมไม่มีวันกำหนดส่ง — บอกตามสถานะจริงของการปิด (ม-145) · 🐞 รอบแรกเขียนรวบว่า "ปิดเรื่องแล้ว
   อย่างน้อยหนึ่งฝั่ง" ⇒ ใบยกเลิกถูกบอกว่าปิด และใบปิดครบก็ยังเขียน "อย่างน้อยหนึ่งฝั่ง" */
function noDueReason(request, closure) {
  if (closure.cancelled) return 'ยกเลิกแล้ว — ไม่มีกำหนดส่ง';
  if (closure.complete) return requestSideText(request, 'dept', 'ไม่ได้แจ้งกำหนดส่ง — ปิดครบแล้ว');
  if (closure.requesterDone) return requestSideText(request, 'requester', 'ปิดแล้ว — ไม่ต้องแจ้งกำหนดส่ง');
  if (closure.deptDone) return requestSideText(request, 'dept', 'ตอบครบแล้ว — ไม่ได้แจ้งกำหนดส่ง');
  return requestSideText(request, 'dept', 'ยังไม่ได้แจ้งกำหนดส่ง');
}
