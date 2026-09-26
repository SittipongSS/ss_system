// ── ใบที่อาจซ้ำของใบสั่งขายย้อนหลัง + บันทึกการยืนยันของผู้คีย์ (มติเจ้าของ 26/09 — "บันทึกใบซ้ำที่ผู้คีย์ยืนยัน") ──────
//
// ⭐ ของเดิม (A17 ③ พักไว้): ผู้คีย์เปิดสวิตช์ "ตรวจแล้ว ไม่ใช่ใบซ้ำ" แล้วระบบส่งแค่ `acknowledgeDuplicates: true` — **ไม่มีที่ไหน
//   บันทึกว่าใบไหน ใครยืนยัน เมื่อไร** ⇒ ผู้จัดการฝ่ายขายที่อนุมัติมองไม่เห็นเลยว่ามีใบที่อาจซ้ำ
// ⭐ รอบนี้ (มติ 26/09 ทั้ง 4 ข้อ):
//   ① ใบที่อาจซ้ำที่เกิด "หลัง" ผู้คีย์ยืนยัน = **เตือน ไม่บล็อก** ในหน้าต่างอนุมัติ (ตรวจใหม่ตอนเปิดใบ)
//   ② ช่องเหตุผลช่องเดียว **ไม่บังคับ** ≤ 500 ตัวอักษร
//   ③ ใบที่ถูกตีกลับ/ดึงกลับแล้วเปิดมาแก้ = สวิตช์เริ่มปิด ต้องยืนยันใหม่ · โชว์ "รอบก่อน …" + เติมเหตุผลเดิมให้
//   ④ หน้าใบ: การ์ดในแท็บภาพรวม (ต่อจากการ์ดโซน)
// ⭐ ไม่ต้องแก้ฐาน: บันทึกอยู่ที่ `sales_orders.metadata.historicalIntake.duplicateReview` — RPC ของ 0374 เก็บ
//   `p_header.intake` ทั้งก้อน (สร้าง `0374:929` · แก้ `0374:1054-1056`) ในทรานแซกชันเดียวกับใบ
//   🔴 **ใส่ที่ route หลังประกอบอาร์กิวเมนต์แล้วเท่านั้น** (historicalOrderCommit) — ห้ามใส่ใน `historicalServiceRpcArgs`
//      / `plan.header`: ลายนิ้วมือของคำขอคิดจากตัวนั้น ⇒ เวลา/ผู้คีย์/รายการที่ต่างกันทำให้ส่งซ้ำได้ intake_key_conflict ทุกครั้ง
// ⚠️ ไฟล์นี้บริสุทธิ์ — ไม่มี React · ไม่อ่านนาฬิกา (เวลาส่งมาจากผู้เรียก) · ไม่ยิงฐาน
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format';
import { charLength, historicalRefsOf } from '@/lib/sales/historicalOrders';

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const normRef = (value) => text(value).toLowerCase();
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** เหตุผลของผู้คีย์ (มติ 26/09 ข้อ 2) — ไม่บังคับ · นับแบบ Postgres length() (`charLength`) */
export const HISTORICAL_DUPLICATE_NOTE_MAX = 500;

/** ตัดข้อความเหตุผลให้ไม่เกินเพดาน **นับหน่วยเดียวกับ server** (code point) — ไม่ใช้ maxLength ของเบราว์เซอร์ที่นับ UTF-16/grapheme
    ต่างกันไปตามเบราว์เซอร์ (รีวิว 26/09: ตัวนับกับเพดานเคยพูดคนละตัวเลข) */
export function historicalDuplicateNoteClamp(value) {
  return [...String(value ?? '')].slice(0, HISTORICAL_DUPLICATE_NOTE_MAX).join('');
}
/* เพดานของรายการ id ที่รับจาก body — ใบของลูกค้ารายเดียวไม่มีทางถึง · กัน body ยักษ์ */
const ACK_IDS_MAX = 200;
const ID_MAX = 64;
export const HISTORICAL_DUPLICATE_REVIEW_VERSION = 1;

/**
 * ใบที่อาจซ้ำ — ตัวเดียวที่ทั้งแผน (ตอนคีย์) และหน้าใบ (ตอนผู้อนุมัติเปิด) ใช้
 * กติกา: ใบย้อนหลังของลูกค้ารายเดียวกัน ไม่นับใบนี้เองและใบที่ยกเลิกแล้ว · ตรงกันที่วันเริ่มสัญญา (`orderDate` ของใบย้อนหลัง
 * = วันเริ่มสัญญา — 0374:921/1044) หรือเลขเอกสารเดิมตัวใดตัวหนึ่ง (ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ช่องว่างหัวท้าย)
 * @param rows ใบย้อนหลังของลูกค้า `{ id, orderNumber, orderDate, status, historical*Ref }`
 * @param refs `{ quote, express, invoice }` หรืออาเรย์ของเลขเอกสารเดิมของใบนี้
 * @returns `[{ id, orderNumber, orderDate, status, refs, matchedOn: [{ kind: 'startDate'|'ref', value }] }]`
 */
export function historicalDuplicateMatches({ rows = [], selfOrderId = null, startDate = null, refs = {} } = {}) {
  const own = Array.isArray(refs) ? refs : Object.values(isPlainObject(refs) ? refs : {});
  const refSet = new Set(own.map(normRef).filter(Boolean));
  const start = text(startDate) || null;
  return list(rows)
    .filter((row) => row.id && row.id !== selfOrderId && row.status !== 'cancelled')
    .map((row) => {
      const sameStart = Boolean(start && row.orderDate === start);
      const sameRefs = historicalRefsOf(row).filter((ref) => refSet.has(normRef(ref)));
      return { row, sameStart, sameRefs };
    })
    .filter(({ sameStart, sameRefs }) => sameStart || sameRefs.length)
    .map(({ row, sameStart, sameRefs }) => ({
      id: row.id, orderNumber: row.orderNumber || null, orderDate: row.orderDate || null,
      status: row.status || null, refs: historicalRefsOf(row),
      matchedOn: [...(sameStart ? [{ kind: 'startDate', value: start }] : []), ...sameRefs.map((ref) => ({ kind: 'ref', value: ref }))],
    }));
}

/** "ตรงกันที่ …" — ประโยคเดียวของขั้น ④ · หน้าต่างอนุมัติ · การ์ดหน้าใบ */
export function historicalMatchedOnText(matchedOn = []) {
  const parts = list(matchedOn).map((item) => (item.kind === 'startDate' ? 'วันเริ่มสัญญา' : `เลขเอกสารเดิม ${text(item.value)}`));
  return parts.join(' · ') || '—';
}

/**
 * การยืนยันที่ body ส่งมา — **ยืนยันเป็นรายใบ** (id ที่ผู้คีย์เห็นตอนเปิดสวิตช์) ไม่ใช่ ใช่/ไม่ใช่
 * 🐞 ของเดิม: `acknowledgeDuplicates: true` ผ่านกับรายการไหนก็ได้ที่ server คิดตอนบันทึก — รวมใบที่ผู้คีย์ไม่เคยเห็น
 *    (พรีวิวใหม่ได้ใบเพิ่มแต่สวิตช์ยังเปิดค้าง)
 * ⚠️ ช่วงเปลี่ยนผ่าน: แท็บที่เปิดค้างจากก่อน deploy ส่งแค่ `true` ⇒ รับเป็น "ทุกใบตอนนี้" แล้วบันทึก `basis: 'flag'`
 *   (ไม่รับ = แท็บเก่าวน 409 ไม่รู้จบ — สวิตช์ปิด แล้วส่ง true มาอีก)
 * @returns `{ ids, flag, note }` — note ตัดช่องว่างหัวท้ายแล้ว (ความยาวตรวจที่ `historicalDuplicateAckIssue`)
 */
export function historicalDuplicateAckOf(body = {}) {
  const input = isPlainObject(body) ? body : {};
  const ids = [...new Set((Array.isArray(input.acknowledgedDuplicateIds) ? input.acknowledgedDuplicateIds : [])
    .map(text).filter((id) => id && id.length <= ID_MAX))].slice(0, ACK_IDS_MAX);
  return { ids, flag: input.acknowledgeDuplicates === true, note: text(input.duplicateNote) };
}

/** ยืนยันครบทุกใบที่อาจซ้ำตอนนี้หรือยัง (ใบที่ไม่อยู่ในรายการของ server ไม่นับ) · ไม่มีใบที่อาจซ้ำ = ผ่าน */
export function historicalDuplicatesAcknowledged(duplicates = [], ack = {}) {
  const rows = list(duplicates);
  if (!rows.length) return true;
  if (ack?.flag === true) return true;
  const ids = new Set(list(ack?.ids));
  return rows.every((row) => ids.has(row.id));
}

/** ข้อผิดพลาดของช่องเหตุผล — ไม่บังคับ แต่ยาวเกินเพดานตีกลับ (ช่อง `duplicateNote` สังกัดขั้น ④) */
export function historicalDuplicateAckIssue(ack = {}) {
  return charLength(text(ack?.note)) > HISTORICAL_DUPLICATE_NOTE_MAX
    ? { field: 'duplicateNote', message: `เหตุผลว่าทำไมไม่ใช่ใบซ้ำยาวเกิน ${fmtNumber(HISTORICAL_DUPLICATE_NOTE_MAX)} ตัวอักษร` }
    : null;
}

/**
 * บันทึกการยืนยันที่เขียนลงใบ (ทุกครั้งที่บันทึกจริงผ่านด่าน — แม้ไม่มีใบที่อาจซ้ำ: `orders: []`)
 * ⇒ "ไม่มีบันทึก" แปลได้อย่างเดียวว่าใบนั้นบันทึกครั้งสุดท้ายก่อนมีระบบนี้
 * ⭐ `orders` = รายการของ server ณ ตอนบันทึก ตามตัว (สถานะ ณ ตอนยืนยัน · `matchedOn` ที่คิดย้อนหลังไม่ได้เพราะทั้งสองใบแก้ได้)
 * ⭐ ชื่อผู้ยืนยันเก็บเป็นภาพนิ่ง (ชื่อตอนนั้น) · เวลามาจากผู้เรียก (นาฬิกา server)
 * @param basis 'ids' | 'flag' (แท็บรุ่นก่อน) · ไม่มีใบที่อาจซ้ำ = 'none'
 */
export function historicalDuplicateReviewRecord({ duplicates = [], ack = {}, user = null, now = null } = {}) {
  const orders = list(duplicates).map((row) => ({
    id: row.id, orderNumber: row.orderNumber || null, orderDate: row.orderDate || null, status: row.status || null,
    refs: list(row.refs), matchedOn: list(row.matchedOn),
  }));
  const acked = new Set(list(ack?.ids));
  const basis = !orders.length ? 'none' : (orders.every((row) => acked.has(row.id)) ? 'ids' : (ack?.flag === true ? 'flag' : 'ids'));
  const note = orders.length ? text(ack?.note) : '';
  return {
    v: HISTORICAL_DUPLICATE_REVIEW_VERSION,
    checkedAt: now instanceof Date ? now.toISOString() : (text(now) || null),
    byId: user?.id || null,
    byName: text(user?.name) || text(user?.email) || null,
    byRole: user?.role || null,
    basis,
    orders,
    ...(note ? { note } : {}),
  };
}

/** บันทึกที่อยู่บนใบ (อ่านอย่างเดียว) — รูปไม่ถูก = ไม่มีบันทึก (ใบก่อนมีระบบนี้) */
export function historicalDuplicateReviewOf(order) {
  const review = order?.metadata?.historicalIntake?.duplicateReview;
  if (!isPlainObject(review) || !Array.isArray(review.orders)) return null;
  return review;
}

/**
 * ภาพรวมสำหรับผู้อนุมัติ (หน้าต่างอนุมัติ + การ์ดหน้าใบ) — บันทึกของผู้คีย์ เทียบกับการตรวจใหม่ตอนเปิดใบ
 * @param review บันทึกบนใบ (`historicalDuplicateReviewOf`) · null = ไม่มีบันทึก
 * @param check  ผลตรวจใหม่ `{ candidates: [...matches], statusById: { id: status } }` · null = ยังไม่รู้/โหลดไม่ขึ้น
 * @param statusLabel ป้ายสถานะของใบย้อนหลัง (ผู้เรียกส่ง `historicalStatusCopy(s).label`)
 * @returns `{ show, count, review, rows: [{ id, orderNumber, orderDate, matched, refs, statusAtAck, statusNow, isNew, gone }], newCount }`
 */
export function historicalDuplicateReviewView(review, check = null, { statusLabel = (status) => text(status) || '—' } = {}) {
  const stored = review ? list(review.orders) : [];
  const statusById = isPlainObject(check?.statusById) ? check.statusById : null;
  const storedIds = new Set(stored.map((row) => row.id));
  const nowStatus = (id) => {
    if (!statusById) return null;
    return Object.prototype.hasOwnProperty.call(statusById, id) ? statusById[id] : 'deleted';
  };
  const label = (status) => (status === 'deleted' ? 'ลบแล้ว' : statusLabel(status));
  const rows = stored.map((row) => {
    const now = nowStatus(row.id);
    return {
      id: row.id, orderNumber: row.orderNumber || null, orderDate: row.orderDate || null,
      matched: historicalMatchedOnText(row.matchedOn), refs: list(row.refs),
      statusAtAck: row.status ? statusLabel(row.status) : '—',
      statusNow: now === null ? null : label(now),
      gone: now === 'deleted' || now === 'cancelled',
      isNew: false,
    };
  });
  const fresh = list(check?.candidates).filter((row) => !storedIds.has(row.id)).map((row) => ({
    id: row.id, orderNumber: row.orderNumber || null, orderDate: row.orderDate || null,
    matched: historicalMatchedOnText(row.matchedOn), refs: list(row.refs),
    statusAtAck: null, statusNow: statusLabel(row.status), gone: false, isNew: true,
  }));
  const all = [...rows, ...fresh];
  /* สามสถานะของบันทึก — คำบนการ์ด/หน้าต่างอนุมัติต้องไม่อ้างการยืนยันที่ไม่มี (รีวิว 26/09):
     none = ใบก่อนมีระบบนี้ · empty = ตอนบันทึกไม่มีใบที่อาจซ้ำ (orders: []) · confirmed = ผู้คีย์ยืนยันรายใบไว้ */
  const record = !review ? 'none' : (stored.length ? 'confirmed' : 'empty');
  return { show: all.length > 0, count: all.length, newCount: fresh.length, review: review || null, record, rows: all };
}

/**
 * ถ้อยคำของการ์ด "ใบที่อาจซ้ำ" บนหน้าใบ — ตามสถานะของบันทึก และสถานะของใบ
 * 🐞 รีวิว 26/09: การ์ดขึ้นทุกสถานะ (ตรวจใหม่ทุกครั้งที่เปิดใบ) แต่ถ้อยคำเคยสั่ง "เปิดดูก่อนอนุมัติ" แม้ใบอนุมัติ/ยกเลิกแล้ว
 *    และพูด "หลังผู้คีย์ยืนยัน" กับใบที่ไม่มีบันทึกการยืนยันเลย
 * @returns `{ meta, newTag, notice: { tone, title, body } | null }`
 */
export function historicalDuplicateCardCopy(view, { status = null } = {}) {
  const review = view?.review || null;
  const byline = historicalDuplicateAckByline(review);
  const meta = view?.record === 'confirmed'
    ? `ผู้คีย์ยืนยันว่าไม่ซ้ำ — ${byline}`
    : view?.record === 'empty'
      ? `ตอนบันทึก (${byline}) ไม่พบใบที่อาจซ้ำ — ระบบพบเพิ่มตอนเปิดใบ`
      : 'ใบนี้บันทึกก่อนระบบเก็บการยืนยันของผู้คีย์ — ระบบพบตอนเปิดใบ';
  const newTag = view?.record === 'confirmed' ? 'พบหลังผู้คีย์ยืนยัน' : (view?.record === 'empty' ? 'พบหลังผู้คีย์บันทึก' : 'พบตอนเปิดใบ');
  const newCount = Number(view?.newCount) || 0;
  if (!newCount) return { meta, newTag, notice: null };
  const pending = status === 'pending_approval';
  const title = view?.record === 'none'
    ? `ใบที่อาจซ้ำ ${fmtNumber(newCount)} ใบ — ไม่มีบันทึกการยืนยันของผู้คีย์`
    : `พบใบที่อาจซ้ำเพิ่ม ${fmtNumber(newCount)} ใบ${view?.record === 'confirmed' ? 'หลังผู้คีย์ยืนยัน' : 'หลังผู้คีย์บันทึก'}`;
  const body = pending
    ? 'ผู้คีย์ยังไม่ได้ตรวจใบนี้ — เปิดดูก่อนอนุมัติ (ไม่บล็อกการอนุมัติ)'
    : 'ผู้คีย์ไม่ได้ตรวจใบนี้ตอนบันทึก — ข้อมูลประกอบ ไม่มีผลกับสถานะของใบ';
  return { meta, newTag, notice: { tone: pending ? 'warning' : 'info', title, body } };
}

/** "ยืนยันโดย … · เวลา" — ชื่อภาพนิ่งของบันทึก · เวลาไทย · ไม่มีเวลา = ขีด (fmtDateTime('') = "-" ไม่ใช่ขีดของระบบ) */
export function historicalDuplicateAckByline(review) {
  if (!review) return null;
  return `${text(review.byName) || 'ผู้คีย์'} · ${text(review.checkedAt) ? fmtDateTime(review.checkedAt) : '—'}`;
}

const ROWS_SHOWN = 3;
/**
 * แถวของหน้าต่างอนุมัติ (⚠️ เตือน ไม่บล็อก — มติ 26/09 ข้อ 1) · ไม่มีอะไรจะพูด = ไม่มีแถว
 * @param loadError ของเสริมโหลดไม่ขึ้น — การตรวจใหม่ไม่รู้ผล แต่บันทึกของผู้คีย์ยังพูดได้ (มากับแถวใบ)
 */
export function historicalDuplicateApprovalRows(review, check = null, { statusLabel, loadError = false } = {}) {
  const view = historicalDuplicateReviewView(review, loadError ? null : check, { statusLabel });
  const lines = [];
  const confirmed = view.rows.filter((row) => !row.isNew);
  const fresh = view.rows.filter((row) => row.isNew);
  if (confirmed.length) {
    const note = text(review?.note);
    lines.push(`⚠️ ใบที่อาจซ้ำ ${fmtNumber(confirmed.length)} ใบ — ผู้คีย์ยืนยันว่าไม่ซ้ำ (${historicalDuplicateAckByline(review)})`
      + `${note ? ` · เหตุผล: “${note}”` : ''}${review?.basis === 'flag' ? ' · ยืนยันจากฟอร์มรุ่นก่อน (ไม่ได้ระบุรายใบ)' : ''}`);
    for (const row of confirmed.slice(0, ROWS_SHOWN)) {
      const status = row.statusNow && row.statusNow !== row.statusAtAck
        ? `ตอนยืนยัน: ${row.statusAtAck} · ตอนนี้: ${row.statusNow}` : row.statusAtAck;
      lines.push(`⚠️ ${text(row.orderNumber) || row.id} (${status}) — ตรงกันที่ ${row.matched}`);
    }
    if (confirmed.length > ROWS_SHOWN) lines.push(`⚠️ และอีก ${fmtNumber(confirmed.length - ROWS_SHOWN)} ใบ — ดูการ์ด “ใบที่อาจซ้ำ” ในหน้าใบ`);
  }
  if (fresh.length) {
    const head = view.record === 'confirmed'
      ? 'พบใบที่อาจซ้ำเพิ่มหลังผู้คีย์ยืนยัน'
      : view.record === 'empty'
        ? `พบใบที่อาจซ้ำหลังผู้คีย์บันทึก (ตอนบันทึก ${historicalDuplicateAckByline(review)} ไม่มีใบที่อาจซ้ำ)`
        : 'ใบที่อาจซ้ำ — ไม่มีบันทึกการยืนยันของผู้คีย์ (ใบนี้บันทึกก่อนระบบเก็บ)';
    const shown = fresh.slice(0, ROWS_SHOWN)
      .map((row) => `${text(row.orderNumber) || row.id} (${row.statusNow}) — ตรงกันที่ ${row.matched}`).join(' · ');
    lines.push(`⚠️ ${head}: ${shown}${fresh.length > ROWS_SHOWN ? ` · และอีก ${fmtNumber(fresh.length - ROWS_SHOWN)} ใบ` : ''}`);
  }
  if (loadError && !review) lines.push('ใบที่อาจซ้ำ: โหลดไม่ขึ้น — เปิดทะเบียนใบสั่งขายของลูกค้ารายนี้ดูเองก่อนอนุมัติ');
  return lines;
}

/** วันที่ในตาราง — ขีดเมื่อไม่มี */
export const historicalDuplicateDate = (iso) => (text(iso) ? fmtDate(iso) : '—');
