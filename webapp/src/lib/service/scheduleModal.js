// ── โมดัลจัดคิวแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) — ตรรกะล้วนของเปลือกเดียวสองงาน ──
//
// ⭐ สองโมดัลบนหน้าจัดคิว — `ServiceVisitModal` (แก้นัด · ปล่อยร่าง) กับ `CommitDueDialog`
//    (ลงคิวเข้าพื้นที่) — ใช้เปลือกเดียว (`ScheduleModalShell`) ช่องเวลาเดียว (`TimeWindowField`)
//    แผงด่านเดียว (`GatePanel`) และตัวเลือกเจ้าหน้าที่ตัวเดียว (`CrewLoadPicker`)
//    ⇒ **กติกาทุกข้ออยู่ที่นี่** (เทสต์ได้ใต้ raw node) · คอมโพเนนต์วาดอย่างเดียว
// ⚠️ ไม่มีกติกาใหม่ของข้อมูล — ด่านมาจาก `visitGate` (ตัวเดียวกับ server) · ภาระจาก `crewLoadPeople` ·
//    เวลาทับจาก `windowsOverlap` · ช่วงเข้าไซต์จาก `accessConflict` · คำจากการ์ดรายการงาน
// ⚠️ ขอบเขต "UI อย่างเดียว" — ไม่มีฟังก์ชันไหนในไฟล์นี้ประกอบก้อนที่ส่ง API
import { NA, fmtDate, fmtTime } from '@/lib/format';
import { quoteView } from '@/lib/master/updateQuote';
import { commitDueMode } from '@/lib/requests/commitDue';
import { MAX_ASSETS_PER_DAY, assigneeOverloaded, overloaded, projectedDayLoad, workloadText } from './visitLoad';
import {
  TIME_PRESETS, VISIT_KINDS_MANUAL, VISIT_KIND_LABELS, VISIT_STATUSES_MANUAL, VISIT_STATUS_LABELS,
  isReschedule, visitTimeText, windowsOverlap,
} from './rounds';
import { accessConflict, accessTimeText, accessWindowText, toHHMM } from './sites';
import { evaluateVisitGate, gateBlocker, gatePassed, visitSkipsContractGates } from './visitGate';
import { isLiveVisit } from './visitStatus';
import { hasSiteVisitTrace } from './visitDelete';
import { isFreeRow } from './scheduleQueue';
import { surveyVisitDraft } from './surveyVisit';
import { GATE_FIX, gateItemView, originText, ownerTone } from './scheduleQueueView';
import { accessWarnText, dayText, siteLoadText, siteWhereText, thaiDayOf, withWarnings } from './queueWords';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/* ═══ เวลานัด — แผ่นลัดที่ "เลือกอยู่" จริง (pain 8) ══════════════════════════════════════
   ⭐ แผ่นที่เลือกอยู่ **อ่านจากเวลาในฟอร์ม** ไม่ใช่ค่าที่เก็บ — เช้า/บ่าย/เต็มวันเป็นปุ่มลัดที่เติมเวลา
      (`TIME_PRESETS` · ไม่มีคอลัมน์ใน DB) · เก็บสองที่เมื่อไรเพี้ยนหากันเมื่อนั้น */
export const TIME_PRESET_NONE = 'none';
export const TIME_PRESET_CUSTOM = 'custom';

/* "09–12" ของแผ่นลัด — ชั่วโมงเปล่า ๆ พอ (ทุกปุ่มลัดเริ่ม/จบที่นาที 00) */
const hourSpan = (preset) => `${preset.startTime.slice(0, 2)}–${preset.endTime.slice(0, 2)}`;

/* ปุ่มลัดของช่องที่เก็บได้แค่เวลาเริ่ม (ลงคิวเข้าพื้นที่ · `committedDueTime` · D1) — เช้า/บ่าย เติมแค่เวลาเริ่ม
   ⚠️ ไม่มี "เต็มวัน": เวลาเริ่มของเต็มวัน (09:00) ซ้ำกับเช้า และ "ไปทั้งวัน" ของงานนี้คือ "ไม่ระบุเวลา" อยู่แล้ว
      (สองแผ่นที่ได้ค่าเดียวกัน = แผ่นที่เลือกอยู่บอกไม่ได้ว่าอันไหน) */
const START_ONLY_PRESETS = TIME_PRESETS.filter((p) => p.key !== 'fullday');
const presetsFor = (withEnd) => (withEnd ? TIME_PRESETS : START_ONLY_PRESETS);

/**
 * แผ่นเวลาทั้งแถว — `[{ key, label, sub }]` ตามลำดับบนจอ
 * @param withEnd ช่องเวลามีเวลาจบไหม — ลงคิวเข้าพื้นที่เก็บได้แค่เวลาเริ่ม (`committedDueTime` · D1)
 *   ⇒ เช้า/บ่าย **เติมแค่เวลาเริ่ม** และป้ายบอกเวลาเริ่ม ("09:00") ไม่ใช่ช่วง "09–12" ที่ไม่ถูกเก็บ
 *   🐞 รีวิว UAT 24/09: เคยเหลือสองแผ่น (ไม่ระบุ/กำหนดเอง) ต่างจากแบบ A ที่เจ้าของเลือก (ห้าแผ่น)
 * ⚠️ "เต็มวัน" ไม่มีตัวเลขกำกับ — มันคือเวลางานทั้งวันอยู่แล้ว และแถวห้าแผ่นกว้างไม่พอ (แบบ A)
 */
export function timePresetOptions({ withEnd = true } = {}) {
  const presets = presetsFor(withEnd).map((p) => ({
    key: p.key,
    label: p.label,
    sub: !withEnd ? p.startTime : p.key === 'fullday' ? '' : hourSpan(p),
  }));
  return [
    ...presets,
    { key: TIME_PRESET_NONE, label: 'ไม่ระบุเวลา', sub: '' },
    { key: TIME_PRESET_CUSTOM, label: 'กำหนดเอง', sub: '' },
  ];
}

/** แผ่นที่ตรงกับเวลาในฟอร์ม — ปุ่มลัดตรงเป๊ะ = key ของมัน · ว่าง = 'none' · อื่น ๆ = 'custom'
 *  (`withEnd: false` เทียบแค่เวลาเริ่ม — เวลาจบไม่ถูกเก็บ) */
export function timePresetOf({ startTime, endTime } = {}, { withEnd = true } = {}) {
  const start = toHHMM(startTime);
  const end = withEnd ? toHHMM(endTime) : '';
  if (!start && !end) return TIME_PRESET_NONE;
  const hit = presetsFor(withEnd).find((p) => p.startTime === start && (!withEnd || p.endTime === end));
  return hit ? hit.key : TIME_PRESET_CUSTOM;
}

/** เวลาหลังกดแผ่น — ปุ่มลัดเติมเวลา · ไม่ระบุ = ล้าง · กำหนดเอง = คงค่าเดิม (แล้วช่องพาโฟกัสไปเวลาเริ่ม) */
export function applyTimePreset(key, current = {}, { withEnd = true } = {}) {
  const preset = presetsFor(withEnd).find((p) => p.key === key);
  if (preset) return { startTime: preset.startTime, endTime: withEnd ? preset.endTime : '' };
  if (key === TIME_PRESET_NONE) return { startTime: '', endTime: '' };
  return { startTime: current.startTime || '', endTime: withEnd ? current.endTime || '' : '' };
}

/**
 * กดแผ่นเวลา (เมาส์ หรือ ลูกศรของ radiogroup) — `{ times, remembered }`
 * 🐞 รีวิว UAT 24/09: ลูกศรเลือกไปด้วย ⇒ จาก "กำหนดเอง" 10:30–12:00 กดลูกศรครั้งเดียว เวลาที่พิมพ์ถูกทับ/ล้าง
 *    แล้วกลับมา "กำหนดเอง" ได้ค่าของปุ่มลัดแทน — เวลาที่พิมพ์หายเงียบ ๆ
 *    ⇒ **ออกจาก "กำหนดเอง" = จำเวลาที่พิมพ์ไว้ · กลับมา "กำหนดเอง" = ได้คืน** (ลูกศรยังเลือกตามพฤติกรรมของ radio)
 * @param selected   แผ่นที่เลือกอยู่ก่อนกด
 * @param current    เวลาในฟอร์มตอนนี้
 * @param remembered เวลาที่จำไว้ครั้งก่อน (null = ไม่มี) — ผู้เรียกเก็บใน ref (ไม่ใช่ค่าที่บันทึก)
 */
export function pickTimePreset(key, { selected, current = {}, remembered = null, withEnd = true } = {}) {
  let memo = remembered;
  const typed = toHHMM(current.startTime) || (withEnd && toHHMM(current.endTime));
  if (selected === TIME_PRESET_CUSTOM && key !== TIME_PRESET_CUSTOM && typed) {
    memo = { startTime: current.startTime || '', endTime: withEnd ? current.endTime || '' : '' };
  }
  if (key === TIME_PRESET_CUSTOM && memo) return { times: { ...memo }, remembered: memo };
  return { times: applyTimePreset(key, current, { withEnd }), remembered: memo };
}

/* ═══ ช่วงที่ไซต์ให้เข้า — บรรทัดใต้เวลา (pain 9) ═════════════════════════════════════════ */

/* จอไม่มีช่วงเข้าของไซต์ในมือ (หน้าใบคำร้อง — `surveySite` ไม่ได้ select ช่วงเวลา · D2)
   🐞 รีวิว UAT 24/09 (high): เคยบอก "ตรวจตอนลงคิว" แต่ไม่มีใครตรวจ — server สร้างนัดจากไซต์ที่ `loadSurveySite`
      select แค่ id/code/name/customerId ⇒ ด่าน ④ ไม่เห็นช่วงเวลาเลย ⇒ บอกตรง ๆ ว่าจอนี้ไม่เห็น และไม่บล็อก */
export const ACCESS_UNKNOWN_TEXT = 'หน้านี้ไม่เห็นช่วงที่ไซต์ให้เข้า — ไม่บล็อกการลงคิว';

/* เหตุที่ชน แบบไม่พูดช่วงซ้ำ — ช่วงอยู่หน้าเส้นแล้ว ("ไซต์ให้เข้า … 10:00–16:00 — 09:00–12:00 เข้าก่อนเวลาที่ไซต์อนุญาต")
   🐞 รีวิว UAT 24/09: เคยต่อข้อความเต็มของด่าน "(10:00–16:00)" ท้ายเส้น = ช่วงเดียวกันสองรอบในบรรทัดเดียว */
function accessConflictShort(conflict, { date, startTime, endTime }) {
  if (conflict.kind === 'day') return `${dayText(date)} ไม่ใช่วันที่ไซต์ให้เข้า`;
  const what = String(conflict.message || '').replace(/\s*\([^)]*\)\s*$/, '');
  return `${visitTimeText({ startTime, endTime })} ${what}`;
}

/**
 * บรรทัดข้อจำกัดใต้ช่องเวลา — `{ state, windowText, text }` หรือ null (ยังไม่มีไซต์)
 * · ok       — "10:30–12:00 อยู่ในช่วง" (เขียว)
 * · conflict — สิ่งที่ชน (ตัดสินที่ `accessConflict` ตัวเดียวกับด่าน ④) ไม่พูดช่วงซ้ำ (อำพัน)
 * · untimed  — มีช่วงเข้า แต่นัดยังไม่ระบุเวลา (ไม่ตัดสิน — กติกาเดียวกับด่าน)
 * · open     — ไซต์ไม่ได้จำกัดวัน/เวลาเข้า
 * · unknown  — จอไม่มีช่วงเข้าของไซต์ในมือ (หน้าใบคำร้อง · D2) ⇒ บอกว่าจอนี้ไม่เห็น ไม่เดาว่าผ่าน
 */
export function accessLine(site, { date, startTime, endTime } = {}, { known = true } = {}) {
  if (!known) return { state: 'unknown', windowText: '', text: ACCESS_UNKNOWN_TEXT };
  if (!site) return null;
  const windowText = accessWindowText(site);
  if (!windowText) return { state: 'open', windowText: '', text: 'ไซต์นี้ไม่ได้จำกัดวัน/เวลาเข้า' };
  const conflict = accessConflict(site, { date, startTime, endTime });
  if (conflict) return { state: 'conflict', windowText, text: accessConflictShort(conflict, { date, startTime, endTime }) };
  if (!toHHMM(startTime) && !toHHMM(endTime)) return { state: 'untimed', windowText, text: 'ยังไม่ระบุเวลา' };
  return { state: 'ok', windowText, text: `${visitTimeText({ startTime, endTime })} อยู่ในช่วง` };
}

/* ═══ ด่านก่อนขึ้นตาราง — แผงสี่ข้อ (pain 5 · 16) ═══════════════════════════════════════ */
const GATE_NUMBERS = ['①', '②', '③', '④'];

export const GATE_CAPTIONS = Object.freeze({
  draft: 'ร่างไม่ขึ้นตาราง ไม่นับภาระของเจ้าหน้าที่ และไม่โผล่ในงานวันนี้ — ผ่านครบแล้วกด “ปล่อยขึ้นตาราง”',
  create: 'ผ่านครบ = ขึ้นตารางทันที · ไม่ครบ = จอดเป็นร่างในแท็บรอจัด',
  /* ลงคิวเข้าพื้นที่: ข้อ ③ เป็นช่องบังคับของฟอร์ม (ขาด = กดลงคิวไม่ได้ · `surveyScheduleGaps`) ส่วนข้อ ④
     **เตือนเท่านั้น** — 🐞 รีวิว UAT 24/09 (high): เคยเขียนว่า "นัดจอดเป็นร่าง" แต่ server สร้างนัดจากไซต์ที่
     `loadSurveySite` select แค่ id/code/name/customerId ⇒ ด่าน ④ ไม่เห็นช่วงเวลา นัดลงตารางช่างเสมอ
     (ยามที่ surveyVisit.test.mjs แดงทันทีถ้าวันหนึ่ง server เริ่มเห็นช่วงเวลา ⇒ ต้องกลับมาแก้คำนี้) */
  survey: 'ขาดเจ้าหน้าที่ = ลงคิวไม่ได้ · นอกช่วงเข้าไซต์ = เตือนเท่านั้น นัดยังขึ้นตาราง',
});

/* ข้อ ①② ของงานที่ไม่ต้องตรวจ — คำสั้นแบบ A ("ไม่ต้องตรวจ — งานสำรวจ") แทนข้อความเต็มของด่าน
   🐞 รีวิว UAT 24/09: "(มติผู้ใช้ 2026-08-31)" ตัดบรรทัดกลางวันที่บน 390px · ที่มาของมติอยู่ในเอกสาร ไม่ใช่บนแผง */
const EXEMPT_WORDS = Object.freeze({ survey: 'งานสำรวจ', remove: 'งานถอนเครื่อง' });
const exemptDetail = (visit) => `ไม่ต้องตรวจ — ${EXEMPT_WORDS[visit?.kind] || 'งานนี้'}`;

/* ข้อ ④ ของหน้าที่ไม่เห็นช่วงเข้าไซต์ (หน้าใบคำร้อง) — ไม่ใช่ "ตรวจตอนลงคิว" (ไม่มีใครตรวจ · ดู ACCESS_UNKNOWN_TEXT) */
export const ACCESS_UNKNOWN_GATE_TEXT = 'หน้านี้ไม่เห็นช่วงเข้าไซต์ — ไม่บล็อกการลงคิว';
/* ข้อ ④ ที่ server ไม่บล็อก (ลงคิวเข้าพื้นที่) แต่เวลาชนช่วงของไซต์ — ต่อท้ายเหตุเต็มของด่าน */
const ACCESS_ADVISORY_SUFFIX = 'เตือนเท่านั้น นัดยังขึ้นตาราง';

/* ข้อ ④ ผ่าน — บอกว่าผ่านเพราะอะไรเสมอ · ด่านเองคืน detail ว่าง (D3)
   · "10:30–12:00 อยู่ในช่วง 10:00–16:00" · ไม่ระบุเวลา = "ยังไม่ระบุเวลา — ทั้งวัน" · ไซต์ไม่จำกัด = บอกว่าไม่จำกัด
   🐞 รีวิว UAT 24/09: ไม่ระบุเวลาเคยเป็นแถวเปล่ามีแต่ป้าย TS */
function accessPassDetail(site, visit) {
  if (!site) return '';
  if (!accessWindowText(site)) return 'ไซต์ไม่จำกัดวัน/เวลาเข้า';
  if (!toHHMM(visit?.startTime) && !toHHMM(visit?.endTime)) return 'ยังไม่ระบุเวลา — ทั้งวัน';
  const range = accessTimeText(site);
  if (!range) return `${dayText(visit?.scheduledDate)} อยู่ในวันที่ไซต์ให้เข้า`;
  return `${visitTimeText(visit)} อยู่ในช่วง ${range}`;
}

/**
 * แผงด่าน — แถวละข้อ พร้อมเจ้าของ สถานะ เหตุ และลิงก์แก้ (ข้อที่ TS แก้เองได้)
 *
 * @param items    ผลของ `evaluateVisitGate` (ตัวเดียวกับ server) — **ห้ามคิดเงื่อนไขเองที่นี่**
 * @param visit    นัด/ร่างที่ถูกประเมิน (อ่านแค่ชนิดงานกับเวลา)
 * @param accessKnown จอมีช่วงเข้าของไซต์ไหม — ไม่มี (หน้าใบคำร้อง) ⇒ ข้อ ④ เป็น `unknown` "หน้านี้ไม่เห็นช่วงเข้าไซต์"
 *                 และ **ไม่นับว่าผ่าน** (ไม่รู้ ≠ ผ่าน)
 * @param advisoryAccess ข้อ ④ ไม่บล็อกงานนี้ที่ server (ลงคิวเข้าพื้นที่ — ดู GATE_CAPTIONS.survey) ⇒ ชน = `warn`
 *                 (เตือน · ไม่นับผ่าน · ไม่บล็อก) แทน `fail`
 * @param site     ไซต์ (ประกอบเหตุผ่านของข้อ ④)
 * @param mode     'draft' | 'create' | 'survey' — คำอธิบายใต้หัวแผง
 * @returns `{ rows, passed, total, ready, tone, summary, verdict, caption }`
 *   · rows[].state ∈ pass · fail · warn · exempt (งานสำรวจ/ถอนเครื่อง ข้อ ①②) · unknown · parked
 *   · exempt นับเป็นผ่าน (ด่านตอบ ok เอง — ไม่ต้องตรวจ ไม่ใช่ตรวจแล้วไม่ผ่าน) · warn/unknown ไม่นับผ่าน แต่ไม่บล็อก
 */
export function gatePanelView(items = [], {
  visit = null, accessKnown = true, site = null, mode = 'draft', advisoryAccess = false,
} = {}) {
  const exemptKind = visitSkipsContractGates(visit);
  const rows = (items || []).map((item, index) => {
    let state = item.state === 'ok' ? 'pass' : item.state === 'blocked' ? 'fail' : 'parked';
    let detail = item.detail || '';
    let fix = null;
    if (exemptKind && (item.key === 'contract' || item.key === 'payment')) {
      state = 'exempt';
      detail = exemptDetail(visit);
    }
    if (item.key === 'access' && !accessKnown) {
      state = 'unknown';
      detail = ACCESS_UNKNOWN_GATE_TEXT;
    } else if (state === 'fail') {
      /* ⭐ คำชุดเดียวกับการ์ด — ข้อที่มีลิงก์แก้ตัดครึ่งหลังของเหตุที่เป็นคำสั่งซ้ำ (`gateItemView`) */
      const view = gateItemView({ key: item.key, owner: item.owner, reason: item.detail || item.label, fix: item.fix });
      detail = view.reason;
      fix = view.fix && GATE_FIX[view.fix] ? { key: view.fix, ...GATE_FIX[view.fix] } : null;
      if (item.key === 'access' && advisoryAccess) {
        state = 'warn';
        detail = `${detail} · ${ACCESS_ADVISORY_SUFFIX}`;
      }
    } else if (item.key === 'access' && state === 'pass' && !detail) {
      detail = accessPassDetail(site, visit);
    }
    return {
      key: item.key,
      n: GATE_NUMBERS[index] || '',
      label: item.label,
      state,
      owner: item.owner || NA,
      ownerTone: ownerTone(item.owner),
      detail,
      fix,
    };
  });
  const passed = rows.filter((r) => r.state === 'pass' || r.state === 'exempt').length;
  const blocked = rows.filter((r) => r.state === 'fail').length;
  const parked = rows.filter((r) => r.state === 'parked').length;
  const unknown = rows.some((r) => r.state === 'unknown');
  const warned = rows.some((r) => r.state === 'warn');
  const ready = blocked === 0;
  /* ⭐ คำตัดสินที่โปรแกรมอ่านจอประกาศในหัวแผง ต้องพูดเรื่องเดียวกับป้ายนับ
     🐞 รีวิว UAT 24/09: ข้อ ④ ยังไม่ได้ตรวจ (ป้าย 3/4) แต่คำอ่านบอก "ขึ้นตารางได้" */
  let verdict;
  if (!ready) verdict = 'ยังขึ้นตารางไม่ได้';
  else if (unknown) verdict = 'ยังตรวจไม่ครบ — ข้อ ④ ไม่บล็อกการลงคิว';
  else if (warned) verdict = 'ขึ้นตารางได้ — ข้อ ④ เตือนเท่านั้น';
  else verdict = mode === 'draft' ? 'ปล่อยขึ้นตารางได้' : 'ขึ้นตารางได้';
  return {
    rows,
    passed,
    total: rows.length,
    ready,
    tone: blocked || warned ? 'warning' : unknown ? 'info' : 'success',
    summary: `ผ่าน ${passed} จาก ${rows.length} ข้อ`,
    verdict,
    caption: (GATE_CAPTIONS[mode] || GATE_CAPTIONS.create)
      + (parked ? ` · ${parked} ข้อรอระบบสัญญา (ไม่บล็อก)` : ''),
  };
}

/**
 * ป้ายสั้นของข้อที่ติด — บรรทัดผลลัพธ์ใต้ปุ่ม (`['③ ยังไม่มีเจ้าหน้าที่', '④ นอกช่วงเข้าไซต์ 14:30–16:30']`)
 * 🐞 รีวิว UAT 24/09: บรรทัดใต้ปุ่มเคยเป็นเหตุเต็มของด่าน ("ยังขึ้นตารางไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่…
 *    · เข้าก่อนเวลาที่ไซต์อนุญาต (14:30–16:30)") ขีดยาวซ้อนกันกินทั้งแถบท้าย ⇒ เหตุเต็มอยู่ที่แผงด่าน (และ toast
 *    ตอนกดปุ่ม · `gateBlocker`) · ใต้ปุ่มพูดแค่ "ข้อไหน"
 * · ①② บอกเจ้าของ (TS แก้เองไม่ได้ — ต้องรู้ว่าจะไปตามใคร) · ④ แยกวันที่ไซต์ไม่เปิดกับนอกช่วงเวลา (`accessWarnText`)
 * @param items ผลของ `evaluateVisitGate` · site/visit = ไซต์และค่าที่กำลังกรอก (ตัวเดียวกับที่ด่านใช้)
 */
export function gateShortReasons(items = [], { site = null, visit = null } = {}) {
  return (items || []).filter((item) => item.state === 'blocked').map((item) => {
    if (item.key === 'contract') return `① สัญญา (${item.owner || NA})`;
    if (item.key === 'payment') return `② งวดเงิน (${item.owner || NA})`;
    if (item.key === 'assignee') return '③ ยังไม่มีเจ้าหน้าที่';
    if (item.key === 'access') {
      const text = accessWarnText(site, {
        date: visit?.scheduledDate, startTime: visit?.startTime, endTime: visit?.endTime,
      });
      return `④ ${text || 'นอกช่วงเข้าไซต์'}`;
    }
    return item.label;
  });
}

/* ═══ ตัวเลือกเจ้าหน้าที่ — ว่างเป็นแผ่น · ไม่ว่างเป็นแถวพร้อมแถบภาระ (pain 3 · 15) ═══════════ */
export const CREW_ROSTER_TEXT = Object.freeze({
  loading: 'กำลังโหลดรายชื่อเจ้าหน้าที่…',
  error: 'โหลดรายชื่อเจ้าหน้าที่ไม่สำเร็จ — ปิดแล้วเปิดใหม่อีกครั้ง',
  empty: 'ยังไม่มีบัญชีที่รับงานเข้าไซต์ได้ — เปิดบัญชีฝ่าย TS ก่อน',
});
export const CREW_NODATE_TEXT = 'ภาระของแต่ละคน — เลือกวันก่อนจึงจะเห็นตัวเลข';
/* ⚠️ state 'unknown' = ขีด ไม่ใช่ 0 — ศูนย์ที่เดาเองอ่านว่า "ว่าง" แล้วงานถูกยัดให้คนที่เต็มแล้ว */
export const CREW_UNKNOWN_TEXT = 'ยังโหลดภาระไม่ได้ — ตัวเลขว่างไม่ได้แปลว่าว่าง';
export const CREW_GONE_NOTE = 'ไม่อยู่ในรายชื่อเจ้าหน้าที่บริการแล้ว';
export const UNASSIGNED_LABEL = 'ยังไม่มอบหมาย';

/* แถบภาระ: ขีดละหนึ่งจุด เต็มแถบ 18 จุด (1.5 เท่าของเพดาน) ⇒ เส้นเพดานอยู่ที่สองในสามของแถบ */
export const LOAD_BAR_SCALE = Math.round(MAX_ASSETS_PER_DAY * 1.5);

/**
 * ขีดของแถบภาระ — ไม่มี `style={{ width }}` (ทรงเดียวกับแถบวัดของ `SurveyControlCard`)
 * @param now จุดของคนนั้นวันนั้นตอนนี้ · add จุดของไซต์นี้ถ้าเลือกคนนี้
 * @returns `{ cells: [{ fill: 'now'|'add'|'', cap }], total, over, clamped }`
 *   · `cap` = ขีดสุดท้ายก่อนเพดาน (ขอบขวาของขีดที่ MAX_ASSETS_PER_DAY)
 *   · เกินแถบ = ตัดที่ขีดสุดท้าย (`clamped`) — ตัวเลขข้าง ๆ แถบบอกค่าจริงเสมอ
 */
export function loadBarCells({ now = 0, add = 0 } = {}) {
  const current = Math.max(0, Number(now) || 0);
  const extra = Math.max(0, Number(add) || 0);
  const total = current + extra;
  const nowCells = Math.min(current, LOAD_BAR_SCALE);
  const addCells = Math.min(extra, LOAD_BAR_SCALE - nowCells);
  const cells = Array.from({ length: LOAD_BAR_SCALE }, (_, i) => ({
    fill: i < nowCells ? 'now' : i < nowCells + addCells ? 'add' : '',
    cap: i === MAX_ASSETS_PER_DAY - 1,
  }));
  return { cells, total, over: total > MAX_ASSETS_PER_DAY, clamped: total > LOAD_BAR_SCALE };
}

/* "ถ้าเลือก 3 นัด · 12/12 จุด" — ไม่รู้ภาระของไซต์ (หน้าใบคำร้อง) พูดแค่จำนวนนัด ไม่เดาจุด
   ⭐ ตัวเลขจาก `projectedDayLoad` ตัวเดียวกับคำเตือนเกินภาระบนบรรทัดผลลัพธ์ใต้ปุ่ม */
function projectionOf(row, siteLoad) {
  const next = projectedDayLoad(row, siteLoad);
  const text = next.known
    ? `ถ้าเลือก ${next.visits} นัด · ${next.assets}/${MAX_ASSETS_PER_DAY} จุด`
    : `ถ้าเลือก ${next.visits} นัด`;
  return { text, over: next.over, assets: next.assets };
}

/* คำใต้แถว "ยังไม่มอบหมาย" — แบบ A พูดครบสองท่อน (รีวิว UAT 24/09: ของเดิมบอกแค่ "ทุกทีมหยิบได้") */
export const UNASSIGNED_SUB = 'ทุกทีมหยิบได้ แต่ขึ้นตารางไม่ได้';

/**
 * ตัวเลือกเจ้าหน้าที่ทั้งกล่อง — คอมโพเนนต์วาดตามนี้อย่างเดียว
 *
 * @param technicians รายชื่อ [{ id, name, team? }] — ลำดับที่ส่งมาคือลำดับบนจอ
 * @param load        `{ state: 'ok'|'unknown', people }` จาก `staffLoadFor`/`useCrewLoad` (`crewLoadPeople`)
 * @param siteLoad    `{ assets, packs }` ของไซต์ที่กำลังนัด · null = ไม่รู้ (ถ้าเลือกพูดแค่นัด)
 * @param timeWindow  `{ startTime, endTime }` ที่กำลังกรอก — ใช้เตือนเวลาทับ (`windowsOverlap`)
 * @param rosterState 'loading' | 'error' | 'ready' — รายชื่อเอง (คนละเรื่องกับภาระ)
 * @returns `{ roster, state, head, notice, free, busy, plain, pinned, unassigned, invalid }`
 *   · state 'ok'      — `free` (แผ่น · ว่างทั้งวัน) + `busy` (แถว · แถบภาระ + ถ้าเลือก + เตือน)
 *   · state 'unknown' / 'nodate' — `plain` (แผ่นล้วน ไม่มีตัวเลข) ⇒ **ไม่มีศูนย์ปลอม**
 *   · `pinned` — ผู้รับผิดชอบเดิมที่หลุดรายชื่อ (กันแถวที่เลือกอยู่หายเงียบ)
 *   · `unassigned` — เฉพาะ `allowUnassigned` (ลงคิวคำร้องบังคับเจ้าหน้าที่ ⇒ null)
 *   · `invalid` — ช่องบังคับ (ไม่มีแถวยังไม่มอบหมาย) ที่ยังไม่มีใครถูกเลือก ⇒ กรอบสีเตือน (รีวิว UAT 24/09 · แบบ A)
 *     ⚠️ ตรงกับช่องที่ขาด "ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ" ของ `surveyScheduleGaps` (ค่าว่าง = ขาด)
 * ⚠️ **เตือน ไม่ห้าม** — เกินภาระ/เวลาทับเลือกได้เสมอ (มีแต่ด่าน ①–④ ที่บล็อก)
 * ⚠️ "ว่าง" = `isFreeRow` ตัวเดียวกับ `freeCrewOn` ของการ์ด ⇒ "วันนั้นว่าง n จาก m คน" เท่ากันสองจอ
 */
export function crewPickerView({
  technicians = [], load = null, dateIso = '', value = '', currentName = '',
  allowUnassigned = true, siteLoad = null, timeWindow = null, rosterState = 'ready',
} = {}) {
  const list = Array.isArray(technicians) ? technicians : [];
  const roster = rosterState === 'loading' || rosterState === 'error'
    ? rosterState
    : (list.length ? 'ready' : 'empty');
  const dated = !!dateIso;
  const known = dated && load?.state === 'ok';
  const state = !dated ? 'nodate' : known ? 'ok' : 'unknown';
  const byId = new Map((load?.people || []).map((person) => [person.id, person]));

  const rows = list.map((tech) => {
    const person = byId.get(tech.id) || {};
    return {
      id: tech.id,
      name: tech.name || person.name || '',
      /* ทีมจากผลภาระก่อน แล้วค่อยจากรายชื่อ — โหลดภาระไม่ได้ ชื่อทีมจะได้ไม่หายไปด้วย */
      team: person.team || tech.team || '',
      visits: Number(person.visits) || 0,
      assets: Number(person.assets) || 0,
      packs: Number(person.packs) || 0,
      assisting: Number(person.assisting) || 0,
      dayVisits: Array.isArray(person.dayVisits) ? person.dayVisits : [],
      selected: tech.id === value,
    };
  });
  /* 🐞 กันแถวที่เลือกอยู่ "หายไปเฉย ๆ" — ผู้รับผิดชอบเดิมที่ไม่อยู่ในรายชื่อแล้ว (ย้ายฝ่าย/ปิดบัญชี)
     ไม่มีแถวของเขา = กลุ่มไม่มีอะไรถูกเลือก แล้วอ่านเหมือน "ยังไม่มอบหมาย" ทั้งที่ใบยังผูกคนเดิม */
  const pinned = value && !list.some((tech) => tech.id === value)
    ? { id: value, name: currentName || '', note: CREW_GONE_NOTE, selected: true }
    : null;

  const plainOf = (row) => ({ id: row.id, name: row.name, team: row.team, selected: row.selected });
  const freeRows = known ? rows.filter(isFreeRow) : [];
  const head = {
    text: dated ? `ภาระวันที่ ${dayText(dateIso)} — ไม่นับร่าง` : CREW_NODATE_TEXT,
    aside: !dated ? '' : known ? `วันนั้นว่าง ${freeRows.length} จาก ${rows.length} คน` : `วันนั้นว่าง ${NA} จาก ${rows.length} คน`,
    asideTone: known ? (freeRows.length ? 'ok' : 'warn') : '',
  };

  let free = null;
  let busy = [];
  if (known) {
    free = {
      label: `ว่างทั้งวัน · ${freeRows.length} คน`,
      projection: projectionOf({ visits: 0, assets: 0 }, siteLoad).text,
      people: freeRows.map(plainOf),
    };
    busy = rows.filter((row) => !isFreeRow(row)).map((row) => {
      const projection = projectionOf(row, siteLoad);
      const tags = [];
      if (overloaded(row)) tags.push({ key: 'over', text: `เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`, tone: 'warning' });
      if (row.assisting > 0) tags.push({ key: 'assist', text: `ไปช่วย ${row.assisting} นัด`, tone: 'neutral' });
      const overlaps = timeWindow
        ? row.dayVisits
          .filter((visit) => windowsOverlap(timeWindow, visit))
          .map((visit) => ({ key: visit.id || visit.code, text: `เวลาทับ ${visit.code} ${visitTimeText(visit)}`, tone: 'warning' }))
        : [];
      return {
        ...plainOf(row),
        nowText: `ตอนนี้ ${workloadText(row)}`,
        tags,
        overlaps,
        projection: { text: projection.text, over: projection.over },
        bar: loadBarCells({ now: row.assets, add: siteLoad ? (siteLoad.assets || 0) : 0 }),
      };
    });
  }

  return {
    roster: { state: roster, text: CREW_ROSTER_TEXT[roster] || '' },
    state,
    head,
    notice: dated && !known ? CREW_UNKNOWN_TEXT : '',
    free,
    busy,
    plain: known ? [] : rows.map(plainOf),
    pinned,
    unassigned: allowUnassigned ? { label: UNASSIGNED_LABEL, sub: UNASSIGNED_SUB, selected: !value } : null,
    invalid: !allowUnassigned && !value,
  };
}

/* ═══ หัวโมดัลนัด + ข้อความของการปล่อย ══════════════════════════════════════════════════ */

/**
 * หัวของโมดัลนัด — `{ title, kind, status, origin, context }` รูปเดียวกับ `commitDueHeader`
 * · สร้าง ("นัดเข้าบริการ") ไม่มีชิปชนิด/สถานะ · แก้ ("แก้นัด SV-…") มีชิปชนิด (ตามฟอร์ม) + สถานะ (ของใบ · ร่างเส้นประ)
 * @param site ไซต์ของฟอร์ม — บรรทัดบริบท "รหัส · ชื่อ · ลูกค้า"
 */
export function visitHeaderView(visit, { form = null, site = null } = {}) {
  const editing = !!visit;
  const kind = form?.kind || visit?.kind || '';
  return {
    title: editing ? `แก้นัด ${visit.code || ''}`.trim() : 'นัดเข้าบริการ',
    kind: editing && kind ? { key: kind, label: VISIT_KIND_LABELS[kind] || kind } : null,
    status: editing
      ? { key: visit.status, label: VISIT_STATUS_LABELS[visit.status] || visit.status, draft: visit.status === 'draft' }
      : null,
    origin: originText(editing ? visit : form),
    context: site ? { code: site.code || '', name: site.name || '', customer: site.customerName || '' } : null,
  };
}

/* ป้ายของโซนที่ด่านตัดออกจากนัด (ติดบางโซน = นัดยังไปได้ · ใบส่งงานตัดโซนนั้น — `evaluateVisitGate`) */
export const ZONE_SKIPPED_TAG = 'งดบริการ';

/**
 * แถว "งานนี้" (คอลัมน์ซ้าย) ของโมดัลนัด — **รูปเดียวกับ `commitDueJobRows`** (`JobFacts` วาดทั้งสองงาน)
 *   `[{ key, label, value?, kind?, extra?, items? }]`
 * · งาน   — ชนิดงาน (จุดสีตามชนิด) + ภาระของไซต์ "3 จุด · 2 แพ็ค" (`siteLoadText` ตัวเดียวกับการ์ด)
 * · โซน   — ชื่อโซนของไซต์ (บริบทด่านที่จอแม่ส่งมา) · ติดด่านบางโซน = ป้าย "งดบริการ" (D4: ไม่มีจุด/แพ็ครายโซนในมือ)
 * · ที่ไหน — เขตวิ่งงาน · วิธีเข้า (`siteWhereText`)
 * · ที่มา  — ต้นเรื่องของนัด (`originText` ตัวเดียวกับการ์ด)
 * ⚠️ โซนกรองตามไซต์ในฟอร์ม — บริบทด่านเป็นของไซต์ตอนเปิดโมดัล · เปลี่ยนไซต์แล้วโซนเดิมต้องไม่ค้าง
 * ⚠️ งานที่ข้ามด่าน ①② (สำรวจ/ถอนเครื่อง) ไม่มีป้ายงดบริการ · ทุกโซนติด = ด่านทั้งใบติด (แผงด่านบอกเหตุ) ไม่ใช่ป้ายรายโซน
 */
export function visitJobRows({ visit = null, form = {}, site = null, zones = [], zoneGates = [], siteLoad = null } = {}) {
  const kind = form?.kind || visit?.kind || '';
  const siteId = form?.siteId || '';
  const zoneList = (Array.isArray(zones) ? zones : []).filter((zone) => zone && (!zone.siteId || zone.siteId === siteId));
  const blocked = new Set((Array.isArray(zoneGates) ? zoneGates : [])
    .filter((gate) => gate.state === 'blocked').map((gate) => gate.zoneId));
  const partial = blocked.size > 0 && blocked.size < zoneList.length && !visitSkipsContractGates({ kind });
  const zoneItems = zoneList.map((zone) => ({
    key: zone.id,
    text: zone.name || zone.code || NA,
    tag: partial && blocked.has(zone.id) ? ZONE_SKIPPED_TAG : '',
  }));
  return [
    { key: 'kind', label: 'งาน', value: VISIT_KIND_LABELS[kind] || kind || NA, kind: kind || null, extra: siteLoadText(siteLoad) },
    zoneItems.length ? { key: 'zones', label: 'โซน', items: zoneItems } : null,
    { key: 'where', label: 'ที่ไหน', value: siteWhereText(site) || NA },
    { key: 'origin', label: 'ที่มา', value: originText(visit || form) },
  ].filter(Boolean);
}

/**
 * แผงด่านของ "ลงคิวเข้าพื้นที่" — ด่านของ **นัดที่จะเกิด** (แถวรูปเดียวกับที่ `createSurveyVisit` บันทึก)
 * ⭐ `surveyVisitDraft` + `evaluateVisitGate` — ข้อความ/เจ้าของ/ลิงก์แก้ชุดเดียวกับโมดัลนัด
 * · ①② ไม่ต้องตรวจ (งานสำรวจ) · ③ ติดจนกว่าจะเลือกคน (ช่องบังคับ — บล็อกปุ่ม "ลงคิว")
 * · ④ **เตือนเท่านั้น** (`advisoryAccess`) — 🐞 รีวิว UAT 24/09 (high): server สร้างนัดจากไซต์ที่ `loadSurveySite`
 *   select แค่ id/code/name/customerId ⇒ ด่าน ④ ของ server ไม่เห็นช่วงเวลา นัดลงตารางช่างเสมอ · แผงเคยขึ้น
 *   "ไม่ผ่าน" + บรรทัดผลลัพธ์ "จะจอดเป็นร่าง" = ทายผิด · ช่วงเวลาของไซต์ (แถวเต็มบนหน้าจัดคิว) ยังเตือนให้เห็น
 *   ⚠️ ยาม: surveyVisit.test.mjs (ไซต์รูปที่ `loadSurveySite` คืนจริง) — server เริ่มเห็นช่วงเวลาเมื่อไร ยามแดง
 * · จอไม่มีช่วงเข้าของไซต์ (หน้าใบคำร้อง · D2) ⇒ ข้อ ④ "หน้านี้ไม่เห็นช่วงเข้าไซต์" ไม่นับว่าผ่าน
 * @returns ผลของ `gatePanelView` · แจ้งกำหนดส่ง (หัวข้ออื่น) = null (ไม่มีนัด ไม่มีด่าน)
 */
export function commitDueGateView(request, form, { site = null, accessKnown = true, technicians = [] } = {}) {
  if (commitDueMode(request) !== 'site') return null;
  const f = form || {};
  const known = !!(accessKnown && site);
  const name = (technicians || []).find((tech) => tech.id === f.assigneeId)?.name || '';
  const draft = surveyVisitDraft({ request, date: f.date, time: f.time, assigneeId: f.assigneeId, assigneeName: name });
  const gate = evaluateVisitGate(draft, { site: known ? site : null });
  return gatePanelView(gate, { visit: draft, accessKnown: known, site, mode: 'survey', advisoryAccess: true });
}

/* ═══ ผู้ไปด้วย (ชิป) ══════════════════════════════════════════════════════════════════════ */
/* 🐞 รีวิว UAT 24/09: ผู้ไปด้วยที่ไม่อยู่ในรายชื่อ (ย้ายออกจาก TS — `canBeServiceAssignee` กรองทิ้ง) หรือรายชื่อที่ยัง
   โหลดไม่เสร็จ (หน้าจัดคิวโหลดรายชื่อตอนเปิดโมดัล) ขึ้นบนชิปเป็นรหัสผู้ใช้ดิบ (UUID) ⇒ คำอ่านได้แทน */
export const HELPER_GONE_TEXT = 'เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว';
export const HELPER_LOADING_TEXT = 'กำลังโหลดชื่อ…';

/**
 * ของที่ชิปผู้ไปด้วยวาด — `{ chips: [{ id, name, known }], options: [{ value, label }], hint }`
 * · chips   — ผู้ไปด้วยที่เลือกไว้ (ไม่มีผู้รับผิดชอบ) ตามลำดับค่าเดิม · ชื่อจากรายชื่อ / กำลังโหลด / หลุดรายชื่อ
 * · options — คนที่เพิ่มได้ (ไม่มีผู้รับผิดชอบ · ไม่มีคนที่เลือกแล้ว) ตามลำดับรายชื่อ
 * · hint    — คำใบ้เดิมสองท่อนตามสถานะ (ว่าง: ไปคนเดียว · มีคน: เขาเห็นนัดในงานวันนี้ของตัวเอง)
 * @param rosterState 'loading' | 'error' | 'ready' — ของตัวเลือกผู้รับผิดชอบตัวเดียวกัน
 */
export function helperChipsView({ value = [], technicians = [], assigneeId = '', rosterState = 'ready' } = {}) {
  const ids = (Array.isArray(value) ? value : []).filter(Boolean);
  const roster = Array.isArray(technicians) ? technicians : [];
  const byId = new Map(roster.map((tech) => [tech.id, tech]));
  const chips = ids.filter((id) => id !== assigneeId).map((id) => {
    const tech = byId.get(id);
    if (tech) return { id, name: tech.name || HELPER_GONE_TEXT, known: true };
    return { id, name: rosterState === 'loading' ? HELPER_LOADING_TEXT : HELPER_GONE_TEXT, known: false };
  });
  return {
    chips,
    options: roster
      .filter((tech) => tech.id !== assigneeId && !ids.includes(tech.id))
      .map((tech) => ({ value: tech.id, label: tech.name })),
    hint: chips.length ? 'คนที่เลือกจะเห็นนัดนี้ในงานวันนี้ของตัวเอง' : 'เว้นว่าง = ไปคนเดียว',
  };
}

/**
 * `assistantIds` ที่ส่งออก — **ลำดับรายชื่อ** (ไม่ใช่ลำดับที่กด) · คนหลุดรายชื่อต่อท้ายตามลำดับเดิม · ตัดผู้รับผิดชอบ/ค่าว่าง
 * ⚠️ ก้อนที่บันทึกเท่ากับแผ่นเลือกหลายของเดิมเป๊ะ (ขอบเขต "UI อย่างเดียว")
 */
export function orderHelperIds(next = [], { technicians = [], assigneeId = '' } = {}) {
  const wanted = new Set((next || []).filter((id) => id && id !== assigneeId));
  const inRoster = (technicians || []).map((tech) => tech.id).filter((id) => wanted.has(id));
  const outside = [...wanted].filter((id) => !inRoster.includes(id));
  return [...inRoster, ...outside];
}

/* ═══ ท่อนที่ห้ามหั่นกลางบรรทัด ═════════════════════════════════════════════════════════════ */
/* ช่วงเวลา (รวมวงเล็บ) · วันไทย "พฤ. 1 ต.ค." (+ปี) · วันที่ ISO — ท่อนละก้อนเดียว
   🐞 รีวิว UAT 24/09: บน 390px บรรทัดช่วงเข้าไซต์ตัดเป็น "(14:30–" / "16:30)" · มติ "2026-" / "08-31" */
const KEEP_TOGETHER = /\(?\d{1,2}:\d{2}(?:–\d{1,2}:\d{2})?\)?|(?:อา|จ|อ|พ|พฤ|ศ|ส)\. \d{1,2} [\u0E00-\u0E7F]{1,3}\.[\u0E00-\u0E7F]{1,2}\.(?: \d{4})?|\d{4}-\d{2}-\d{2}/gu;

/**
 * แบ่งข้อความเป็นท่อน `[{ text, keep }]` — `keep` = ห่อด้วย nowrap (`KeepTogether` ใน ScheduleModalParts)
 * ⚠️ ไม่ตัดคำไทยเอง — ท่อนอื่นให้เบราว์เซอร์ตัดบรรทัดตามปกติ
 */
export function keepTogetherRuns(text) {
  const source = String(text || '');
  const runs = [];
  let at = 0;
  for (const match of source.matchAll(KEEP_TOGETHER)) {
    if (match.index > at) runs.push({ text: source.slice(at, match.index), keep: false });
    runs.push({ text: match[0], keep: true });
    at = match.index + match[0].length;
  }
  if (at < source.length) runs.push({ text: source.slice(at), keep: false });
  return runs;
}

/**
 * บรรทัดย่อของ "ความเคลื่อนไหวของนัดนี้" ตอนพับ — `{ count, latest }`
 *   latest = "อ. 22 ก.ย. 14:05 · Apisith — ลูกค้าขอให้เข้าหลัง 10:30…"
 * ⭐ อ่านจากก้อนที่เธรดโหลดเอง (`UpdateThread onItemsChange`) — **ไม่ยิง API ซ้ำ** (การเปิดเธรดมาร์ค
 *    แจ้งเตือนว่าอ่านแล้ว ต้องเกิดครั้งเดียว)
 * ⚠️ วันเวลาเป็นเวลาไทย (`thaiDayOf` · `fmtTime`) · ข้อความตัดสั้นด้วยตัวเดียวกับกล่องยกคำพูด (`quoteView`)
 * @param items null = ยังโหลดไม่เสร็จ ⇒ ไม่มีตัวเลข (ไม่ใช่ 0)
 */
export function threadDigest(items) {
  if (!Array.isArray(items)) return { count: null, latest: '' };
  const rows = items.filter(Boolean);
  if (!rows.length) return { count: 0, latest: '' };
  const latest = rows.reduce((best, row) => (String(row.createdAt || '') > String(best.createdAt || '') ? row : best));
  const quote = quoteView(latest);
  const when = latest.createdAt ? [dayText(thaiDayOf(latest.createdAt)), fmtTime(latest.createdAt)].filter(Boolean).join(' ') : '';
  const lead = [when, firstName(quote.author)].filter(Boolean).join(' · ');
  return { count: rows.length, latest: lead ? `${lead} — ${quote.text}` : quote.text };
}

/**
 * "จะขึ้นช่อง {ชื่อ} · {วัน} {เวลา} บนตาราง และโผล่ในงานวันนี้ของ {ชื่อต้น} วันนั้น"
 * ⭐ ประโยคเดียวของกล่องยืนยัน "ปล่อยขึ้นตาราง" บนการ์ด และบรรทัดผลลัพธ์ใต้ปุ่มในโมดัล
 * ⚠️ วรรคหน้า-หลังชื่อเสมอ — ชื่ออังกฤษติดคำไทยอ่านเป็นคำเดียว (บทเรียนรีวิว 24/09)
 */
export function releaseSlotText(visit) {
  if (!visit) return '';
  const day = dayText(visit.scheduledDate);
  if (!visit.assigneeId) return `จะขึ้นแถว “${UNASSIGNED_LABEL}” · ${day}`;
  const name = visit.assigneeName || 'เจ้าหน้าที่';
  return `จะขึ้นช่อง ${name} · ${day} ${visitTimeText(visit)} บนตาราง และโผล่ในงานวันนี้ของ ${firstName(name)} วันนั้น`;
}

/** toast หลังปล่อยร่างขึ้นตาราง — คำเดียวกันไม่ว่าจะปล่อยจากการ์ดหรือจากโมดัล (BRIEF C1) */
export function releasedToastText(visit) {
  if (!visit) return '';
  return `ปล่อย ${visit.code || visit.id} ขึ้นตารางแล้ว — ${visit.assigneeName || UNASSIGNED_LABEL} · ${dayText(visit.scheduledDate)}`;
}

/* ═══ โมดัลนัด: ส่วนไหนโผล่ · ปุ่มไหนอยู่ท้าย · บรรทัดผลลัพธ์ (ตาราง 1c ของแผน) ══════════════ */

/* สถานะที่ร่างเลือกเองได้ (D5) — **ไม่มี "นัดไว้"**: ปุ่มหลัก "ปล่อยขึ้นตาราง" คือทางเดียวที่ร่างขึ้นตาราง
   (server ตรวจด่านซ้ำตอนร่าง → นัดไว้ ไม่ว่าจะมาทางไหน · ถอดตัวเลือกนี้ = ไม่มีทางที่สามให้งง pain 6)
   ⚠️ "ยกเลิก/ทำไม่ได้/เลื่อนแล้ว" ของร่างยังต้องมี — เป็นทางเดียวที่ปิดร่างทิ้งจากโมดัล */
export const DRAFT_STATUS_OPTIONS = Object.freeze(['draft', 'unable', 'rescheduled', 'cancelled']);

/* คำเตือนเกินภาระบนบรรทัดผลลัพธ์ — ป้ายเดียวกับแถวของคนนั้นในตัวเลือก */
export const OVERLOAD_WARN_TEXT = `เกินภาระ ${MAX_ASSETS_PER_DAY} จุด`;
export const STAMPED_STATUS_HINT = 'สถานะนี้มาจากปุ่มเริ่มงาน/ปิดงานของเจ้าหน้าที่ แก้จากที่นี่ไม่ได้';
export const OVERRIDE_TRACE_TEXT = 'นัดนี้จะขึ้นตารางทั้งที่ยังไม่ผ่านด่าน — ใบจะติดร่องรอย “ข้ามด่าน” ถาวร พร้อมชื่อคุณและเหตุผล';
export const OVERRIDE_REASON_MIN = 10;

/* ผลการเข้าจริง: 'open' | 'collapsed' | 'hidden' — ส่วนที่ยังไม่ถึงเวลาไม่ต้องอยู่ในทาง (pain 7)
   ⚠️ ซ่อนแค่บนจอ — ค่าในฟอร์มยังอยู่ครบ (`visitToForm`) ⇒ ก้อนที่บันทึกไม่เปลี่ยน */
function actualSection(visit, form, todayIso) {
  if (!visit) return 'hidden';
  if (form.status === 'unable') return 'open';
  const saved = visit.status;
  if (saved === 'draft') return hasSiteVisitTrace(visit) ? 'open' : 'hidden';
  if (saved === 'rescheduled' || saved === 'cancelled') return hasSiteVisitTrace(visit) ? 'collapsed' : 'hidden';
  if (saved === 'scheduled') {
    const date = form.scheduledDate || visit.scheduledDate;
    return date && todayIso && date > todayIso && !hasSiteVisitTrace(visit) ? 'collapsed' : 'open';
  }
  return 'open';
}

/* ช่องบนตารางของค่าที่กรอก — "Phuwadol Aoonnankad · พฤ. 1 ต.ค. 10:30–12:00" */
const slotText = (v) => `${v.assigneeName || UNASSIGNED_LABEL} · ${dayText(v.scheduledDate)} ${visitTimeText(v)}`;

/**
 * ทุกอย่างของโมดัลนัดที่ขึ้นกับ "สถานะ × ต้นเรื่อง × สิทธิ์" — คอมโพเนนต์ไม่ตัดสินเอง
 *
 * @param visit    แถวที่บันทึกไว้ (null = สร้าง)
 * @param form     ค่าที่กำลังกรอก (`visitToForm`)
 * @param gate     `evaluateVisitGate` ของค่าที่กำลังกรอก (ตัวเดียวกับ server)
 * @param canOverride `canOverrideServiceGate` (แอดมินเท่านั้น — D9)
 * @param deleteAction `visitDeleteButton(visit)` เมื่อผู้เรียกส่ง `onDelete` มา · ไม่มีสิทธิ์ = null
 * @param overriding แผ่นข้ามด่านเปิดอยู่ · overrideReason เหตุผลที่พิมพ์
 * @param load/siteLoad ภาระของวันที่กรอก + ภาระของไซต์ — คนที่เลือกจะเกินภาระ ⇒ บรรทัดผลลัพธ์เตือน (ไม่บล็อก)
 * @param site     ไซต์ของฟอร์ม — ป้ายสั้นของข้อ ④ ("นอกช่วงเข้าไซต์ 14:30–16:30")
 * @returns `{ sections, secondary, primary, outcome }`
 *   · secondary = ปุ่มรองซ้ายล่าง `[{ key, label, tone?, variant?, blocker? }]` (ผู้เรียกผูก onClick ตาม key)
 *   · primary   = ปุ่มหลัก **ปุ่มเดียว** `{ key, label, busyLabel, blocker, disabled }`
 *   · outcome   = บรรทัดใต้ปุ่ม `{ tone: 'ok'|'warn'|'info'|'error', text }` — error ทับทุกอย่าง
 */
export function visitModalView({
  visit = null, form = {}, todayIso = '', gate = [], canOverride = false, deleteAction = null,
  overriding = false, overrideReason = '', error = '', deleting = false, load = null, siteLoad = null, site = null,
} = {}) {
  const editing = !!visit;
  const saved = visit?.status || null;
  const draft = saved === 'draft';
  const releasing = draft && form.status === 'draft';
  const passed = gatePassed(gate);
  const manualStatus = VISIT_STATUSES_MANUAL.includes(form.status);
  const rescheduling = isReschedule(visit, form);

  const sections = {
    gates: !editing || draft,
    gateMode: editing ? 'draft' : 'create',
    siteEditOpen: !form.siteId,
    kindLocked: !VISIT_KINDS_MANUAL.includes(form.kind),
    reschedule: rescheduling,
    rescheduleHint: rescheduling
      ? `เลื่อนจาก ${dayText(visit.scheduledDate)} → ${dayText(form.scheduledDate)} · เหตุผลจะถูกบันทึกลงความเคลื่อนไหวของนัดนี้`
      : '',
    status: !editing ? null : manualStatus ? 'edit' : 'locked',
    /* ชิปสถานะของร่าง = ทางปิดร่างทิ้ง (ยกเลิก/ทำไม่ได้/เลื่อนแล้ว) ไม่ใช่งานหลักของโมดัล ⇒ พับไว้ ('folded')
       🐞 รีวิว UAT 24/09: บนจอ 1440 ชิปชุดนี้ใต้แผงด่านดันหมายเหตุ/ความเคลื่อนไหวตกขอบล่าง (แบบ A ไม่มีบนร่าง)
       ⚠️ ปุ่ม/ตัวเลือกยังอยู่ครบ (กฎชุดปุ่มเท่าเดิม) · เลือกสถานะอื่นแล้ว = กาง ('open') ให้เห็นว่าเลือกอะไร ·
          นัดที่ขึ้นตารางแล้ว/สร้าง = 'none' (ชิปโชว์ตามเดิม / ไม่มีชิป) */
    statusFold: draft ? (form.status === 'draft' ? 'folded' : 'open') : 'none',
    statusOptions: !editing ? []
      : (manualStatus ? (draft ? DRAFT_STATUS_OPTIONS : VISIT_STATUSES_MANUAL) : [form.status])
        .map((value) => ({ value, label: VISIT_STATUS_LABELS[value] || value })),
    statusHint: editing && !manualStatus ? STAMPED_STATUS_HINT : '',
    unableReason: editing && form.status === 'unable',
    unableHint: String(form.unableReason || '').trim().length >= 10
      ? 'ผู้ขอจะเห็นเหตุผลนี้ — ใบประเมินจะถอยกลับขั้นลงคิวให้เอง'
      : 'อย่างน้อย 10 ตัวอักษร (ฐานข้อมูลบังคับ)',
    actual: actualSection(visit, form, todayIso),
    thread: editing,
  };

  // ── ปุ่มท้าย ──
  let secondary;
  let primary;
  if (overriding) {
    secondary = [{ key: 'cancelOverride', label: 'ยกเลิกการข้ามด่าน', variant: 'quiet' }];
    primary = {
      key: 'override', label: 'ข้ามด่านและขึ้นตาราง', busyLabel: 'กำลังบันทึก…', blocker: '',
      disabled: String(overrideReason || '').trim().length < OVERRIDE_REASON_MIN,
    };
  } else {
    secondary = [
      deleteAction ? {
        key: 'delete', label: deleting ? 'กำลังลบ…' : 'ลบนัด', tone: 'danger', variant: 'outline',
        blocker: deleteAction.blocker || '',
      } : null,
      /* ยกเลิก/ข้ามด่าน = ปุ่มเงียบ (แบบ A) · บันทึกร่าง = ปุ่มรองทึบ — ปุ่มหลักมีปุ่มเดียวที่ขวา */
      { key: 'cancel', label: 'ยกเลิก', variant: 'quiet' },
      releasing ? { key: 'saveDraft', label: 'บันทึกร่าง' } : null,
      releasing && !passed && canOverride ? { key: 'override', label: 'ข้ามด่าน (แอดมิน)', variant: 'quiet' } : null,
    ].filter(Boolean);
    primary = !editing
      ? { key: 'create', label: 'สร้างนัด', busyLabel: 'กำลังบันทึก…', blocker: '', disabled: false }
      : releasing
        ? { key: 'release', label: 'ปล่อยขึ้นตาราง', busyLabel: 'กำลังบันทึก…', blocker: passed ? '' : gateBlocker(gate), disabled: false }
        : { key: 'save', label: 'บันทึกการแก้ไข', busyLabel: 'กำลังบันทึก…', blocker: '', disabled: false };
  }

  // ── บรรทัดผลลัพธ์ ──
  /* ข้อที่ติดพูดสั้น (`gateShortReasons`) — เหตุเต็มอยู่ที่แผงด่านและ toast ของปุ่ม (รีวิว UAT 24/09)
     ขึ้นตารางได้แต่คนที่เลือกเกินภาระ ⇒ อำพัน + "เกินภาระ 12 จุด (เตือนเท่านั้น)" (คำเดียวกับกล่องยืนยันบนการ์ด) */
  const short = () => gateShortReasons(gate, { site, visit: form }).join(' · ');
  const landing = () => {
    const over = assigneeOverloaded({ load, assigneeId: form.assigneeId, siteLoad });
    return { tone: over ? 'warn' : 'ok', text: withWarnings(releaseSlotText(form), [over ? OVERLOAD_WARN_TEXT : '']) };
  };
  let outcome;
  if (error) {
    outcome = { tone: 'error', text: error };
  } else if (overriding) {
    outcome = { tone: 'warn', text: OVERRIDE_TRACE_TEXT };
  } else if (!editing) {
    outcome = passed ? landing() : { tone: 'warn', text: `จะจอดเป็นร่างในแท็บรอจัด — ${short()}` };
  } else if (releasing) {
    outcome = passed ? landing() : { tone: 'warn', text: `ยังขึ้นตารางไม่ได้ — ${short()}` };
  } else if (form.status !== saved) {
    const label = VISIT_STATUS_LABELS[form.status] || form.status;
    outcome = isLiveVisit({ status: form.status })
      ? { tone: 'info', text: `จะเปลี่ยนสถานะเป็น “${label}” — ยังนับเป็นงานของวันนั้น` }
      : { tone: 'warn', text: `จะเปลี่ยนสถานะเป็น “${label}” — ไม่นับภาระ ไม่อยู่ในงานวันนี้ของใคร` };
  } else if (!isLiveVisit(visit)) {
    outcome = { tone: 'info', text: `นัดนี้ “${VISIT_STATUS_LABELS[saved] || saved}” — ไม่อยู่บนตาราง ไม่นับภาระ` };
  } else {
    const moved = form.scheduledDate !== visit.scheduledDate
      || toHHMM(form.startTime) !== toHHMM(visit.startTime)
      || toHHMM(form.endTime) !== toHHMM(visit.endTime)
      || (form.assigneeId || '') !== (visit.assigneeId || '');
    outcome = { tone: 'info', text: `${moved ? 'จะย้ายไปช่อง' : 'ยังอยู่ช่อง'} ${slotText(form)}` };
  }

  return { sections, secondary, primary, outcome };
}

/* ═══ ผลการเข้าจริงของงานที่จบคนละวัน (mig 0386 · มติเจ้าของ 24/09 ข้อ 4) ═══════════════════════════
   ⭐ ฟอร์มนี้ **ไม่มีช่องวันที่เสร็จจริง** (ช่องแก้ได้ยกไว้ทีหลัง) — ค่ามาจากปุ่มส่งงาน/ปิดงานที่ประทับข้ามวัน
      แล้ว server เก็บค่าเดิมไว้เองเสมอ (PATCH ตรวจ `{...before, ...body}`) ⇒ สองข้อข้างล่างคือสิ่งที่จอต้องทำ */

/**
 * ค่าที่ **ตัวตรวจฝั่งจอ** (`normalizeVisitInput`) ต้องเห็น = ค่าที่ server จะตรวจจริง
 * 🐞 ไม่เติมวันที่เสร็จจริงของแถวเดิม ⇒ นัดที่ส่งงานข้ามวัน (เริ่ม 24/09 14:00 · เสร็จ 25/09 09:00) บันทึกจาก
 *    โมดัลนี้ไม่ได้อีกเลยสักช่อง — ตัวตรวจฝั่งจอเทียบ 14:00 กับ 09:00 เหมือนวันเดียวกันแล้วตีกลับก่อนยิง API
 *    ทั้งที่ server รับ (มันเห็นวันที่เสร็จจริงของแถวเดิม) · ทางตันแบบ "จอตีกลับ แต่ server รับ"
 * ⚠️ ใช้ตรวจเท่านั้น — ก้อนที่ส่ง API ยังเป็น `form` เดิม (server เติมจากแถวเดิมเอง)
 * ⚠️ ฐานที่ยังไม่รัน 0386 ไม่มีคีย์นี้บนแถว ⇒ ไม่เติม = พฤติกรรมเดิมทุกอย่าง
 */
export function visitFormCheckInput(payload = {}, visit = null) {
  if (!visit || !Object.prototype.hasOwnProperty.call(visit, 'actualEndDate')) return payload;
  return { ...payload, actualEndDate: visit.actualEndDate ?? null };
}

/**
 * บรรทัดบอก "เสร็จวันไหน" ใต้ช่องเวลาเข้าจริง — null = จบวันเดียวกับวันเข้า (หรือยังไม่มีเวลาเสร็จ)
 * ⭐ ไม่บอก = "เริ่ม 14:00 · เสร็จ 09:00" อ่านเหมือนเวลากลับหัว แล้วคนแก้ "ให้ถูก" จนชั่วโมงงานเพี้ยน
 * ⚠️ ถามจาก **วันเข้าที่กำลังกรอก** — แก้วันเข้าให้ถึง/เลยวันเสร็จแล้ว บรรทัดนี้ต้องหาย (server ยุบเป็นวันเดียวกัน
 *    หรือตีกลับ "วันที่เสร็จจริงต้องไม่ก่อนวันที่เข้าจริง" ซึ่งขึ้นที่บรรทัดผลลัพธ์อยู่แล้ว)
 */
export function visitEndDateNote(visit = null, form = {}) {
  const end = String(visit?.actualEndDate || '').slice(0, 10);
  const start = String(form?.actualDate || '').slice(0, 10);
  const endTime = toHHMM(form?.actualEndTime);
  if (!end || !start || !endTime || end <= start) return null;
  return `เสร็จวันที่ ${fmtDate(end)} เวลา ${endTime} น. — ส่งงานข้ามวัน เวลาเสร็จเป็นของวันนั้น`;
}
