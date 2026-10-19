// ── ผู้ลงนามของรายงานการประเมินพื้นที่ (FM-TS-01) — ตรรกะล้วน (สเปก PR-SIG §2 · มติเจ้าของ 09/10/2026) ─────────────
//
// ⭐ **ที่เดียวที่ตอบว่า "ใครลงนาม · ใครยังไม่มีลายเซ็น · จอต้องพูดว่าอะไร"** — รอบตรวจก่อนส่งผล · ขั้นออกเลข · ตัวสร้างภาพนิ่ง ·
//   แถวด่านบนการ์ด · กล่องยืนยันสองกล่อง อ่านจากที่นี่ทั้งหมด ⇒ สี่ที่พูดคำเดียวกัน
//
//   ที่นั่ง `assessor`  ผู้ประเมิน            = คนบนนัดที่เอกสารรับรอง (`visit.assigneeId` / `assigneeName`)
//   ที่นั่ง `approver`  ผู้ตรวจสอบและอนุมัติ   = หัวหน้าที่ส่งผล (`request.answeredById` / `answeredByName`)
//   ที่นั่งลูกค้าเป็นแบบฟอร์มเปล่าให้เซ็นมือ — ไม่อยู่ที่นี่
//
// 🔴 **ล้วนจริง ๆ** — ไม่อ่าน env ไม่แตะฐาน ไม่มี `node:` / `server-only`: ใบตัวอย่างของหน้าตั้งค่า (ฝั่ง client) ลากไฟล์นี้
//   มาทางตัวสร้างภาพนิ่ง (เทสต์เดินสาย import ของใบตัวอย่างคุมไว้) · กติกาเปิดหรือปิดอ่านจาก `inputs.signatureRule` ที่ตัวโหลดตั้ง
//
// 🔴 **ปิดไว้ = ไม่มีอะไรเกิด** — ทุกฟังก์ชันที่คืนลิสต์คืน `[]` เมื่อ `inputs.signatureRule !== 'required'`
// 🔴 **ไม่รู้ = ไม่มี** (fail closed) — กติกาเปิดแล้ว `inputs.signatures` หาย/ผิดรูป = ไม่มีใครมีลายเซ็น ·
//   "อ่านไม่สำเร็จ" เป็นอีกเรื่อง: ตัวโหลดเอ่ยชื่อ `signatures` ใน `unknown` แล้วด่านพูดว่า "อ่าน…ไม่สำเร็จ" แทน (ผู้เรียก: `surveyReportFreezeIssues`)
//
// 🔴 **มีลายเซ็นอย่างเดียวไม่พอ — บัญชีของคนบนที่นั่งต้อง "นั่งที่นั่งนั้นได้" ด้วย** (`inputs.signerEligible` · `surveyReportSeatEligible`)
//   ผู้ประเมิน = บัญชีฝ่ายบริการ (`canBeServiceAssignee`) · ผู้ตรวจสอบและอนุมัติ = คนที่มีสิทธิ์ส่งผลประเมิน (`canSendSurveyResult`)
//   — ตัวโหลดอ่านบัญชีจริงแล้วตั้งธงให้ · ธงไม่ใช่ `true` ตรงตัว = **ไม่พิมพ์ลายเซ็นของบัญชีนั้น และไม่แตะไฟล์ของเขาในคลัง**
//   🐞 รหัสผู้รับผิดชอบของนัดเป็นช่องที่ผู้จัดคิวแก้ได้ (และเส้นมอบหมายของคำร้องเขียนทับได้) — ไม่มียามนี้ = ใส่รหัสของใครก็ได้ที่มี
//      ลายเซ็น (เช่นผู้บริหารฝ่ายขาย) แล้วลายเซ็นจริงของคนนั้นขึ้นกระดาษที่ส่งลูกค้า โดยเจ้าตัวไม่รู้เรื่อง ·
//      ใบที่ถูกตอบผ่านปุ่มทั่วไปก่อน 24/09 ก็พิมพ์ลายเซ็นของคนที่ไม่ใช่หัวหน้าใต้คำว่า "หัวหน้าฝ่ายบริการ" ได้เหมือนกัน
//
// ⭐ **ใบที่มีพื้นที่ประเมินจากแบบ** (งวด S3 §2.6 · มติ O1) — ถูกถามเรื่องลายเซ็นเหมือนใบลงหน้างาน:
//   ใบผสม     ผู้ประเมิน = คนบนนัด · ผู้ตรวจสอบและอนุมัติ = ผู้ส่งผล (กติกาเดียวกับใบลงหน้างานทุกข้อ)
//   จากแบบล้วน ไม่มีนัด ⇒ ที่นั่งที่พิมพ์ชื่อมีแค่ผู้ส่งผล · ที่นั่งที่ 1 ("ผู้ประเมินจากแบบ") ได้ **ลายเซ็นของผู้ส่งผล**
//             เฉพาะเมื่อ `surveyDrawingSeatSigner` บอกว่าผู้ประเมินจากแบบคนเดียวของทุกพื้นที่คือเขา — ไม่งั้นที่นั่งที่ 1 พิมพ์ชื่อกับคำ
//             "ลายเซ็นอิเล็กทรอนิกส์" (`surveyReportView`) · ไม่มีการอ่านเพิ่ม ไม่มีประโยคใหม่
import { surveyDrawingAssessor, surveyMethodMix } from './surveyMethod';

/** ค่าของ `inputs.signatureRule` เมื่อกติกาเปิด — ค่าอื่นทุกค่า (รวมไม่มีคีย์) = ปิด */
export const SURVEY_SIGN_RULE = 'required';

/** ลำดับของที่นั่ง = ลำดับบนกระดาษและลำดับของบรรทัดบนจอ */
export const SURVEY_SIGN_SEATS = Object.freeze(['assessor', 'approver']);

/** ชื่อที่นั่ง — คำเดียวกับหัวที่นั่งบนกระดาษ (`signoffPart` ของ surveyReportView) · เทสต์ล็อกคู่กัน */
export const SURVEY_SIGN_SEAT_LABEL = Object.freeze({ assessor: 'ผู้ประเมิน', approver: 'ผู้ตรวจสอบและอนุมัติ' });

/** ที่ที่เจ้าตัวไปเพิ่มลายเซ็น — ป้ายเดียวกับเมนู · จอประกอบลิงก์จากคู่นี้ */
export const SURVEY_SIGN_ACCOUNT = Object.freeze({ label: 'บัญชีของฉัน', href: '/account' });

/**
 * เหตุถาวรของไฟล์ลายเซ็น (`SURVEY_SIGN_FAILURE` ของ surveyReportImages) → คำที่คนอ่านออก
 * ⚠️ เขียนเป็นสตริงตรง ๆ ไม่ import ค่าคงที่ — โมดูลรูปเป็นของหนักฝั่ง server ไฟล์นี้ต้องล้วน · เทสต์ล็อกว่าครบทุกเหตุถาวร
 *    ทางออกของทุกข้อเหมือนกัน: เจ้าของลายเซ็นอัปโหลดลายเซ็นใหม่
 */
export const SURVEY_SIGN_FAILURE_LABELS = Object.freeze({
  sign_path: 'ที่เก็บไฟล์ลายเซ็นไม่ถูกต้อง',
  sign_missing: 'ไฟล์ลายเซ็นหายจากที่เก็บ',
  sign_mismatch: 'ไฟล์ลายเซ็นไม่ตรงกับที่บันทึกไว้',
  sign_undecodable: 'เปิดไฟล์ลายเซ็นไม่ได้',
  sign_blank: 'ภาพลายเซ็นว่างหรือจางเกินไป',
});

const ACCOUNT = `“${SURVEY_SIGN_ACCOUNT.label}”`;
const BOTH_SEATS = `${SURVEY_SIGN_SEAT_LABEL.assessor} และ${SURVEY_SIGN_SEAT_LABEL.approver}`;

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};
const idOf = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : null);
const ruleOn = (inputs) => inputs?.signatureRule === SURVEY_SIGN_RULE;

/* ชิ้นของตัวโหลดที่ตัดสินธงของแต่ละที่นั่ง — ชิ้นนั้นอ่านไม่สำเร็จ = บรรทัด "อ่าน…ไม่สำเร็จ" ของด่านพูดแทนแล้ว ไม่ต้องพูดซ้ำที่นี่ */
const ELIGIBLE_PIECE = Object.freeze({ assessor: 'assigneeRole', approver: 'signatures' });

/**
 * 🔑 **บัญชีของคนบนที่นั่งนั่งที่นั่งนั้นได้ไหม** — `true` | `false` | `null` (ไม่รู้) จาก `inputs.signerEligible[seat]` ที่ตัวโหลดตั้ง
 *   `assessor`  บัญชีที่ผูกกับนัดเป็นบัญชีฝ่ายบริการ (`canBeServiceAssignee`) — บัญชีถูกลบ = `false` · อ่านบัญชีไม่สำเร็จ = `null`
 *   `approver`  ผู้ส่งผลมีสิทธิ์ส่งผลประเมิน (`canSendSurveyResult`) — คนที่กำลังกดส่ง = `true` (เส้นส่งผลตรวจสิทธิ์ก่อนแล้ว) ·
 *               ใบที่ตอบไปแล้ว = อ่านบัญชีของผู้ตอบ
 * 🔴 **fail closed** — ค่าที่ไม่ใช่ `true`/`false` ตรงตัว (ไม่มีคีย์ · ผิดรูป) = `null` · ผู้เรียกพิมพ์ลายเซ็นเฉพาะเมื่อได้ `true`
 */
export function surveyReportSeatEligible(inputs, seat) {
  const store = inputs?.signerEligible;
  if (!store || typeof store !== 'object' || Array.isArray(store) || !Object.hasOwn(store, seat)) return null;
  return store[seat] === true ? true : store[seat] === false ? false : null;
}

/**
 * 🔑 **ที่นั่งที่กระดาษพิมพ์ชื่อ** — `[{ seat, userId, name }]` ตามลำดับบนกระดาษ (ผู้ประเมินก่อน)
 *   `assessor`  เมื่อนัดที่รับรองมีชื่อผู้ประเมิน · `approver` เมื่อใบถูกตอบและมีชื่อผู้ส่งผล (รอบตรวจก่อนส่งผลใส่ผู้ส่งที่กำลังจะเขียนมาแล้ว)
 *   `userId` เป็น `null` ได้ (ชื่อพิมพ์แต่ไม่ได้ผูกบัญชี — แถวเก่า/แก้มือ) ⇒ ผู้เรียกปฏิเสธด้วยข้อความของตัวเอง
 * ⚠️ ไม่ถามว่ากติกาเปิดไหม ไม่ถามวิธีประเมิน — ตอบแค่ "ที่นั่งไหนมีชื่อ"
 */
export function surveyReportSigners(inputs) {
  const out = [];
  const visit = inputs?.visit || null;
  const request = inputs?.request || null;
  const assessor = text(visit?.assigneeName);
  if (assessor) out.push({ seat: 'assessor', userId: idOf(visit.assigneeId), name: assessor });
  const approver = text(request?.answeredByName);
  if (request?.answeredAt && approver) out.push({ seat: 'approver', userId: idOf(request.answeredById), name: approver });
  return out;
}

/* ลายเซ็นฉบับที่ใช้อยู่ของผู้ใช้หนึ่งคนจาก `inputs.signatures` — ผิดรูปตรงไหน = ไม่มี (fail closed) */
function versionOf(inputs, userId) {
  const store = inputs?.signatures;
  if (!userId || !store || typeof store !== 'object' || Array.isArray(store)) return null;
  const hit = Object.hasOwn(store, userId) ? store[userId] : null;
  return hit && typeof hit === 'object' && idOf(hit.versionId) ? hit : null;
}

/* ที่นั่ง → คน (คนเดียวสองที่นั่ง = แถวเดียว) · ที่นั่งที่ไม่มีบัญชีเป็นแถวของตัวเอง (`userId: null`) */
function people(inputs) {
  const rows = [];
  for (const s of surveyReportSigners(inputs)) {
    const hit = s.userId ? rows.find((row) => row.userId === s.userId) : null;
    if (hit) hit.seats.push(s.seat);
    else rows.push({ seats: [s.seat], userId: s.userId, name: s.name });
  }
  return rows;
}

/**
 * 🔑 **บรรทัดของผู้ลงนามที่ทำให้เอกสารออกไม่ได้** — คนละบรรทัด (คนเดียวสองที่นั่ง = บรรทัดเดียว) · `[]` เมื่อกติกาปิดหรือทุกคนพร้อม
 *
 * ① **ยังไม่มีลายเซ็น** — `{ kind: 'content', sign: true, userId, seats, text }`
 *   · `content` = ชนิดเดียวที่เส้นส่งผลตีกลับ **ก่อนเขียนอะไร** และชนิดเดียวที่ขึ้น `document.send.blockers`
 *   · `sign: true` = ไม่ต้องดึงผลกลับ — เจ้าตัวเพิ่มลายเซ็นแล้วกดใหม่ได้เลย (ผู้อ่านธงนี้: `blocked()` ของขั้นออกเลข ·
 *     `documentChecks` · การ์ดเอกสาร) · `userId` อยู่ในบรรทัดให้ server เทียบกับคนดู (`self`) — **ไม่ออก payload และไม่อยู่ในข้อความ**
 *   · ที่นั่งที่พิมพ์ชื่อแต่ไม่ได้ผูกบัญชี = `{ kind: 'content', text }` ล้วน ไม่มี `sign` (ไม่มีใครเพิ่มลายเซ็นให้ได้)
 *
 *   ข้อความไม่ขึ้นกับคนดู:
 *   ผู้ประเมิน                         … ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน
 *   ผู้ส่งผล · ใบยังไม่ส่ง (`answerPending`)  … เพิ่มที่ “บัญชีของฉัน” ก่อนส่งผล หรือให้หัวหน้าที่มีลายเซ็นแล้วเป็นผู้ส่งผล
 *   ผู้ส่งผล · ใบส่งไปแล้ว               … ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” หรือดึงผลกลับแล้วให้หัวหน้าที่มีลายเซ็นส่งใหม่
 *   คนเดียวสองที่นั่ง                    <ชื่อ> (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ) … ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน
 *   ผู้ประเมินที่บัญชีถูกปิด/ถูกลบ (`assigneeAccount`)  … และบัญชีถูกปิดหรือถูกลบแล้ว — เพิ่มลายเซ็นไม่ได้ แจ้งผู้ดูแลระบบ
 *     (ยังเป็น `content` + `sign` — ใบนี้ส่งใหม่ไม่ได้จนกว่าเจ้าของตัดสิน · คำถามเปิดข้อ 1 ของสเปก)
 *
 * ② **บัญชีของคนบนที่นั่งนั่งที่นั่งนั้นไม่ได้** (`surveyReportSeatEligible` เป็น `false`) — `{ kind: 'content', text }` ล้วน **ไม่มี `sign`**:
 *   เพิ่มลายเซ็นไม่ช่วย ต้องแก้ที่ตัวใบ · ถามก่อนเรื่องลายเซ็น และที่นั่งนั้นไม่ถูกถามเรื่องลายเซ็นอีก
 *   ผู้ประเมิน   <ชื่อ> ไม่ใช่บัญชีฝ่ายบริการ — … แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด
 *   ผู้ส่งผล     <ชื่อ> ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน (หัวหน้าฝ่ายบริการ) — … ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่
 *   ⚠️ ข้อยกเว้นเดียว: ผู้ประเมินที่ **บัญชีถูกลบและไม่มีลายเซ็น** ยังได้บรรทัด "บัญชีถูกปิดหรือถูกลบแล้ว" ของข้อ ① (พูดตรงกว่า)
 *
 * ③ **ไม่รู้ว่าบัญชีนั่งได้ไหม** (`null`) — ชิ้นที่ตัดสินอ่านไม่สำเร็จ (`inputs.unknown`) = ด่านพูดว่า "อ่าน…ไม่สำเร็จ" แทนแล้ว ไม่พูดซ้ำ ·
 *   ไม่งั้น `{ kind: 'system', text }` (ไม่ตีกลับการส่งผล แต่ขั้นออกเลขไม่ออก) · ที่นั่งนั้นยังถูกถามเรื่องลายเซ็นตามข้อ ①
 *
 * ⚠️ ไม่ดูว่าอ่านลายเซ็นสำเร็จไหม — เรื่องนั้นเป็นของผู้เรียก (`surveyReportFreezeIssues`)
 */
export function surveyReportSignatureIssues(inputs) {
  if (!ruleOn(inputs)) return [];
  const out = [];
  const account = inputs.assigneeAccount;
  const pending = inputs.answerPending === true;
  const unread = new Set(list(inputs.unknown));
  for (const person of people(inputs)) {
    const { userId, name } = person;
    if (!userId) {
      out.push({
        kind: 'content',
        text: `${SURVEY_SIGN_SEAT_LABEL[person.seats[0]]} ${name} ไม่ได้ผูกกับบัญชีผู้ใช้ — ออกเอกสารไม่ได้ แจ้งผู้จัดคิวหรือผู้ดูแลระบบ`,
      });
      continue;
    }
    const signed = !!versionOf(inputs, userId);
    /* ── ②③ บัญชีนั่งที่นั่งนี้ได้ไหม — ก่อนถามเรื่องลายเซ็น · `seats` = ที่นั่งที่ยังถูกถามเรื่องลายเซ็นต่อ ── */
    const seats = [];
    for (const seat of person.seats) {
      const eligible = surveyReportSeatEligible(inputs, seat);
      const label = SURVEY_SIGN_SEAT_LABEL[seat];
      if (eligible === null && !unread.has(ELIGIBLE_PIECE[seat])) {
        out.push({ kind: 'system', text: `ยืนยันบัญชีของ${label} ${name} ไม่สำเร็จ — ยังไม่ได้ออกเอกสาร กดอีกครั้ง` });
      }
      if (eligible !== false || (seat === 'assessor' && account === 'missing' && !signed)) {
        seats.push(seat);
        continue;
      }
      out.push({
        kind: 'content',
        text: seat === 'assessor'
          ? `${label} ${name} ไม่ใช่บัญชีฝ่ายบริการ — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด`
          : `${label} ${name} (ผู้ส่งผล) ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน (หัวหน้าฝ่ายบริการ) — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่`,
      });
    }
    /* ── ① ยังไม่มีลายเซ็น ── */
    if (signed || !seats.length) continue;
    const both = seats.length > 1;
    const assessor = seats.includes('assessor');
    const who = both ? `${name} (${BOTH_SEATS})` : `${SURVEY_SIGN_SEAT_LABEL[seats[0]]} ${name}${assessor ? '' : ' (ผู้ส่งผล)'}`;
    /* บัญชีของผู้ประเมินถูกปิด/ถูกลบ = เจ้าตัวเข้ามาเพิ่มลายเซ็นไม่ได้ — พูดตามจริง ไม่ชี้ไปที่ “บัญชีของฉัน”
       ⚠️ ยกเว้นคนเดียวสองที่นั่งที่กำลังกดส่งผลอยู่ตอนนี้: คนที่กดปุ่มได้ย่อมยังเข้าระบบได้ (ตัวอ่านบัญชีตอบ 404 กับผู้ใช้ทดสอบได้) */
    const gone = assessor && (account === 'disabled' || account === 'missing') && !(both && pending);
    let way;
    if (gone) way = ' และบัญชีถูกปิดหรือถูกลบแล้ว — เพิ่มลายเซ็นไม่ได้ แจ้งผู้ดูแลระบบ';
    else if (assessor) way = ` — ให้เจ้าตัวเพิ่มที่ ${ACCOUNT} ก่อน`;
    else if (pending) way = ` — เพิ่มที่ ${ACCOUNT} ก่อนส่งผล หรือให้หัวหน้าที่มีลายเซ็นแล้วเป็นผู้ส่งผล`;
    else way = ` — ให้เจ้าตัวเพิ่มที่ ${ACCOUNT} หรือดึงผลกลับแล้วให้หัวหน้าที่มีลายเซ็นส่งใหม่`;
    out.push({ kind: 'content', sign: true, userId, seats: [...seats], text: `${who} ยังไม่มีลายเซ็นในระบบ${way}` });
  }
  return out;
}

/**
 * 🔑 **ใครนั่งที่นั่งที่ 1 ของใบประเมินจากแบบทั้งใบ** (งวด S3 §2.6) — `{ userId, name }` ของผู้ส่งผล หรือ `null`
 *   ไม่ใช่ `null` เมื่อครบทุกข้อ:
 *     · ทุกพื้นที่ที่ยังอยู่ในใบเป็นจากแบบ (`surveyMethodMix(...).mode === 'drawing'`)
 *     · ใบถูกตอบ (รอบตรวจก่อนส่งผล = ผู้ส่งที่กำลังจะเขียนที่ตัวโหลดทับมาแล้ว) และมี `answeredById` กับ `answeredByName`
 *     · ทุกพื้นที่ที่ไม่ถูกตัด ผู้ประเมินจากแบบ (`surveyDrawingAssessor`) คือผู้ส่งผล:
 *         แถวรู้บัญชี (`byId`) ⇒ บัญชีต้องตรง · แถวไม่รู้บัญชี (คนสลับวิธี — ไม่มีคอลัมน์ id) ⇒ ชื่อตรงกันตัวต่อตัว (ตัดช่องว่างหัวท้าย)
 *   ⭐ ทางชื่อมีไว้ให้ใบที่ถูกสลับทั้งใบโดยไม่บันทึกใหม่ (ทุกพื้นที่ตกทาง ② ของ `surveyDrawingAssessor`) — ไม่งั้นหัวหน้าคนเดียว
 *      ขึ้นสองที่นั่ง ที่นั่งหนึ่งเป็นคำ อีกที่นั่งเป็นรูป · ของที่คัดลอกคือ **ลายเซ็นของผู้ส่งผลเอง** ใต้ชื่อที่เท่ากับชื่อเขา และกล่องยืนยัน
 *      บอกชื่อทั้งสองที่นั่งก่อนกด (`surveyReportSignersText`)
 * ⚠️ ไม่ถามว่ากติกาลายเซ็นเปิดไหม — ตอบแค่เรื่องคน (ภาพนิ่งเก็บคำตอบเป็น `assessment.drawingById`)
 */
export function surveyDrawingSeatSigner(inputs) {
  if (surveyMethodMix(inputs?.zones).mode !== 'drawing') return null;
  const request = inputs?.request || null;
  const id = idOf(request?.answeredById);
  const name = text(request?.answeredByName);
  if (!request?.answeredAt || !id || !name) return null;
  for (const row of list(inputs.zones)) {
    if (!row || (row.status || 'ok') === 'cut') continue;
    const who = surveyDrawingAssessor(row, request);
    const same = who?.byId ? who.byId === id : who?.name != null && who.name === name;
    if (!same) return null;
  }
  return { userId: id, name };
}

/**
 * 🔑 **ลายเซ็นฉบับที่จะพิมพ์ คนละแถว** — `[{ seats, userId, name, version }]` · ป้อนตัวเตรียมไฟล์ลายเซ็น
 *   (`prepareSurveyReportSignatures`) และเป็นของที่เส้นส่งผลส่งต่อให้ขั้นออกเลข (ตรึงฉบับ ณ ตอนกดส่ง)
 *   `version` = `{ versionId, versionNumber, storagePath, sha256, width, height }` จาก `inputs.signatures`
 *
 * คืน `[]` เว้นแต่ **ครบทั้งสามข้อ**: กติกาเปิด ·
 *   บัญชีของคนบนทุกที่นั่ง **นั่งที่นั่งนั้นได้** (`surveyReportSeatEligible` เป็น `true` ตรงตัว) · ทุกที่นั่งที่พิมพ์ชื่อมีลายเซ็น
 *   ⇒ "ไม่ว่าง" แปลว่าเอกสารของใบนี้พิมพ์ลายเซ็นได้ครบทุกที่นั่ง (จอใช้บอกชื่อผู้ลงนามในกล่องยืนยัน)
 * ⭐ ใบจากแบบล้วนที่ `surveyDrawingSeatSigner` ไม่เป็น `null` — แถวของผู้ส่งผลได้ `seats: ['assessor', 'approver']`
 *   (กล่องยืนยันพูดว่าลายเซ็นลงทั้งสองช่อง) · สิทธิ์ถามเฉพาะที่นั่ง `approver`: สิทธิ์นั่งที่นั่งที่ 1 ของใบนี้คือสิทธิ์ส่งผล
 *   (ธง `assessor` มาจากบัญชีบนนัด ซึ่งใบนี้ไม่มี)
 * 🔴 `[]` = **ไม่มีใครไปอ่านไฟล์ลายเซ็นในคลัง** — บัญชีที่นั่งไม่ได้ (หรือยังไม่รู้) ไม่ถูกดึงไฟล์ แม้จะมีลายเซ็นอยู่
 * 🔴 `storagePath` อยู่ในแถวนี้ — **ห้ามส่งทั้งแถวออก payload** (ผู้เรียกฝั่งจอคัดแค่ `seats` กับ `name`)
 */
export function surveyReportSignerVersions(inputs) {
  if (!ruleOn(inputs)) return [];
  const seat1 = surveyDrawingSeatSigner(inputs);
  const rows = people(inputs);
  const out = [];
  for (const person of rows) {
    if (!person.seats.every((seat) => surveyReportSeatEligible(inputs, seat) === true)) return [];
    const version = versionOf(inputs, person.userId);
    if (!version) return [];
    const both = seat1 && person.userId === seat1.userId && person.seats.includes('approver') && !person.seats.includes('assessor');
    out.push({ seats: both ? ['assessor', 'approver'] : [...person.seats], userId: person.userId, name: person.name, version });
  }
  return out;
}

/**
 * วลีผู้ลงนามของกล่องยืนยันทั้งสองกล่อง (ส่งผล · ออกเอกสาร) — ไม่มีคำนำหน้า ไม่มีจุดจบ ผู้เรียกต่อประโยคเอง
 *   สองคน        `<ชื่อ> (ผู้ประเมิน) และ <ชื่อ> (ผู้ตรวจสอบและอนุมัติ)`
 *   คนเดียวสองที่นั่ง  `<ชื่อ> ทั้งสองช่อง (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ)`
 * @param signers แถวคนละแถว `[{ seats, name }]` (ผลของ `surveyReportSignerVersions` หรือที่คัดมาแล้ว) หรือแถวรายที่นั่ง `[{ seat, name }]`
 * @returns สตริง · `''` เมื่อไม่มีผู้ลงนาม
 */
export function surveyReportSignersText(signers) {
  const persons = [];
  for (const row of list(signers)) {
    const name = text(row?.name);
    const seats = (Array.isArray(row?.seats) ? row.seats : [row?.seat]).filter((seat) => SURVEY_SIGN_SEATS.includes(seat));
    if (!name || !seats.length) continue;
    // แถวรายที่นั่งของคนเดียวกัน (มี `userId` ตรงกัน) รวมเป็นคนเดียว — ไม่พิมพ์ชื่อเดิมสองรอบ
    const userId = idOf(row.userId);
    const hit = userId ? persons.find((p) => p.userId === userId) : null;
    if (hit) hit.seats.push(...seats);
    else persons.push({ userId, name, seats: [...seats] });
  }
  // เรียงตามที่นั่งบนกระดาษ (ผู้ประเมินก่อน) ไม่ว่าผู้เรียกจะส่งลำดับไหนมา
  const rank = (p) => Math.min(...p.seats.map((seat) => SURVEY_SIGN_SEATS.indexOf(seat)));
  return persons.sort((a, b) => rank(a) - rank(b)).map((p) => {
    const ordered = SURVEY_SIGN_SEATS.filter((seat) => p.seats.includes(seat));
    return ordered.length > 1 ? `${p.name} ทั้งสองช่อง (${BOTH_SEATS})` : `${p.name} (${SURVEY_SIGN_SEAT_LABEL[ordered[0]]})`;
  }).join(' และ ');
}

/**
 * บรรทัดของไฟล์ลายเซ็นที่เตรียมไม่ได้ — ตัวเดียวของเส้นส่งผล (409 ก่อนเขียน) และขั้นออกเลข (I4b)
 * @param failed  `failed` ของ `prepareSurveyReportSignatures` — `[{ name, reason, permanent }]`
 * @param opts.permanent  `true` (ค่าตั้งต้น) = เฉพาะเหตุถาวร: `ลายเซ็นของ <ชื่อ> ใช้พิมพ์ไม่ได้ (<เหตุ>)`
 *                        `false` = เฉพาะเหตุชั่วคราว: `ดึงลายเซ็นของ <ชื่อ> ไม่สำเร็จ`
 * @returns `string[]` ไม่ซ้ำ ตามลำดับของ `failed`
 */
export function surveyReportSignFileLines(failed, { permanent = true } = {}) {
  const out = [];
  for (const row of list(failed)) {
    if (!row || (row.permanent === true) !== (permanent === true)) continue;
    const name = text(row.name) || 'ผู้ลงนาม';
    const line = permanent === true
      ? `ลายเซ็นของ ${name} ใช้พิมพ์ไม่ได้ (${SURVEY_SIGN_FAILURE_LABELS[row.reason] || 'เปิดไฟล์ลายเซ็นไม่ได้'})`
      : `ดึงลายเซ็นของ ${name} ไม่สำเร็จ`;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}
