// ── แจ้งเตือนรายคนในแอป (notifications, mig 0185) ────────────────────────
//
// ระบบเดิมมีแต่ Chat webhook ที่ยิงเข้า**ห้องรวมของฝ่าย** — บอกไม่ได้ว่าใครต้องทำ
// และไม่รู้ว่าใครอ่านแล้ว · ไฟล์นี้คือฝั่ง "งานของคุณคนเดียว"
//
// ⭐ **ตั้งแต่ 2026-08-12 นี่คือช่องทางเดียวที่เหลือ** — ท่อ Google Chat ถูกถอดออก
// ทั้งระบบตามมติผู้ใช้ ("ใช้กระดิ่งกับป้ายตัวเลขก็พอ", mig 0236) ⇒ อะไรที่ไม่ได้ลง
// ที่นี่ = ไม่มีใครรู้ · ดูรายการที่ยอมให้เงียบใน docs/notifications-inbox.md §7
//
// ⚠️ **fire-and-forget เสมอ**: ทุกฟังก์ชันที่เขียนต้องกลืน error เอง (log ไว้)
// เพราะผู้เรียกอยู่หลังจุดที่ข้อความถูกบันทึกสำเร็จแล้ว — แจ้งเตือนพลาดต้องไม่ทำให้
// การโพสต์ที่สำเร็จแล้วตอบ error
import { randomUUID } from 'node:crypto';

// ⚠️ **ห้าม import จาก `lib/master/updates.js`** — ไฟล์นั้น import ไฟล์นี้ (fan-out
// อยู่ใน appendUpdate) การอ้างกลับจะเป็นวงกลม · ต้องการรู้แค่ "ใครเคยโพสต์" จึง
// query คอลัมน์เดียวเองตรง ๆ ซึ่งถูกกว่าโหลดเธรดทั้งเธรดอยู่แล้ว
import { updateEntityConfig, updateRecipients } from '@/lib/master/updateAccess';
import { isQuietUpdateKind, isSystemUpdateItem, updateKindMeta } from '@/lib/master/updateTypes';
import { mentionIdsOf } from '@/lib/master/mentions';
// ปลายทาง/ป้ายชื่ออยู่แยกเพราะหน้าจอต้อง import ด้วย (ไฟล์นี้ลากของฝั่ง server มา)
// re-export ไว้ให้ผู้เรียกเดิมไม่ต้องแก้ — ทะเบียนยังมีชุดเดียว
import { ENTITY_LABEL, entityLabel, notificationHref } from '@/lib/notificationTargets';

export { entityLabel, notificationHref };

// ── กล่องของกระดิ่ง (มติผู้ใช้ 2026-08-20) ───────────────────────────────
//
// ⭐ "กระดิ่งเอาแค่แจ้งเตือนเกี่ยวกับคำร้องก็พอ" + "เพิ่มเรื่องการมอบหมายงานด้วย"
// ⇒ กระดิ่งบนแถบบนแสดง **คำร้องข้ามฝ่าย · เรื่องแจ้งปัญหาระบบ · การมอบหมายงาน**
// เท่านั้น ทั้งรายการในกล่องและเลขบนป้าย
// (เดิมเป็นทุกชนิดปนกัน · ของจริง 3 วันล่าสุด: ดีล 383 · คำร้อง 222 · โปรเจกต์ 163
// ⇒ เรื่องคำร้องถูกดันตกขอบกล่อง 30 แถวเป็นปกติ)
//
// ⚠️ **แจ้งเตือนชนิดอื่นยังถูกเขียนลงตารางเหมือนเดิม ไม่ได้หายไปไหน** — อ่านได้ที่
// หน้าเต็ม `/notifications` ซึ่งยังแสดงทุกชนิด · ที่นี่กรองแค่ "กล่องไหนโชว์อะไร"
// ไม่ได้แตะกฎผู้รับ (มติ 14) และไม่ได้หยุดการเขียนของชนิดไหนเลย
//
// ⚠️ **กรองสองแกน และเป็น "หรือ" กัน**:
//   - `entityTypes` — ทั้ง entity เข้ากล่อง (ทุกความเคลื่อนไหวของคำร้อง/เรื่องแจ้งปัญหา)
//   - `kinds` — เหตุการณ์เดี่ยวที่เข้ากล่องโดยไม่ลากทั้ง entity มาด้วย
//     (`task_assign` = มอบหมายงาน · **ไม่เอา** เธรดงานทั้งเธรดซึ่ง 92% เป็นเหตุการณ์ระบบ)
//   คอลัมน์ `kind` ของแถวแจ้งเตือนเป็น `thread_update` เสมอเมื่อมาจากเธรด ⇒ เหตุการณ์
//   ที่อยากให้เข้ากล่องแบบเจาะจงต้องยิงผ่าน `notifyUsers()` ด้วย kind ของตัวเอง
/* ⭐ **ลีดเข้ากระดิ่งด้วย แต่เข้าทาง `kinds` ไม่ใช่ `entityTypes`** (2026-08-25)
 *
 * ทำไมต้องเข้า: ระบบทวงลีดค้างมีอยู่แล้วตั้งแต่ 2026-08-08 (`overdueLeadNotices`
 * + cron `daily-digest` ยิงทุกเช้า) และจุดส่งมอบก็แจ้งครบทั้งห้าจังหวะ — แต่ทั้งหมด
 * เป็น `entityType: 'lead'` ซึ่ง**ไม่อยู่ในทะเบียนนี้** ⇒ ไปโผล่ที่หน้าเต็ม
 * `/notifications` อย่างเดียว ซึ่งไม่มีใครเปิด · ของที่เขียนไว้ว่า "ติดต่อกลับภายใน
 * 1 วันทำการ" จึงไม่เคยถึงตาคนที่ต้องลงมือเลย (ต้นเหตุที่ leadNotify.js เกิดมาแก้
 * — ลีด 14 ใบค้างข้ามเดือน ใบที่นานสุด 10 วันทำการ — ยังแก้ไม่หายด้วยเหตุนี้)
 *
 * 🪤 **ทำไมไม่ใส่ `'lead'` ลง `entityTypes`** ทั้งที่สั้นกว่า: `entityTypes` ลาก
 * **ทุกความเคลื่อนไหว** ของ entity นั้นเข้ากล่อง รวมเธรดกลาง (`thread_update`)
 * ซึ่งเปิดอยู่กับลีดทุกใบทุกสถานะ ⇒ กระดิ่งจะเต็มไปด้วยคอมเมนต์ในเธรดลีด
 * แล้วคำร้องถูกดันตกขอบกล่อง 30 แถวอีกรอบ = ย้อนกลับไปเป็นปัญหาเดิมที่มติ
 * 2026-08-20 เพิ่งแก้ · `kinds` เลือกเฉพาะ "เหตุการณ์ที่ต้องลงมือ" ตามที่ทะเบียนนี้
 * ออกแบบไว้ให้ทำอยู่แล้ว
 *
 * ⚠️ ชุดนี้ต้องตรงกับ kind ที่ยิงจริงเสมอ — `notifyLeadHandoff` ยิง `lead_${action}`
 * (ห้าจังหวะ) และ cron ยิง `lead_overdue` · เพิ่ม action ใหม่ใน `leadHandoffNotice`
 * แล้วลืมเติมที่นี่ = แจ้งเตือนเงียบหายไปจากกระดิ่งโดยไม่มีอะไรฟ้อง
 * `notifications.test.mjs` อ่านซอร์สจริงมาเทียบกับลิสต์นี้ ดริฟต์แล้วแดง */
export const LEAD_BELL_KINDS = Object.freeze([
  'lead_create',    // รับลีดเข้าระบบ → ผู้ดูแลคัดกรอง
  'lead_screen',    // คัดกรองเข้าทีม → Senior AE/AC ของทีม
  'lead_assign',    // มอบหมาย → AE ผู้รับ
  'lead_reassign',  // เปลี่ยนมือ → ผู้รับใหม่ + ผู้รับเดิม
  'lead_bounce',    // ตีกลับ → ผู้คัดกรอง + คนที่เพิ่งถูกดึงลีดออกจากมือ
  'lead_overdue',   // ทวงประจำวัน (หนึ่งคนหนึ่งเด้งต่อวัน)
  /* ตีกลับอัตโนมัติ (mig 0291) — คนที่เพิ่งถูกดึงลีดออกจากมือ **ต้องรู้ตัว**
     ไม่งั้นจะรู้ตอนหาลีดไม่เจอ ซึ่งแย่กว่าไม่มีระบบตีกลับเลย */
  'lead_auto_bounce',
  // ใบที่วนครบโควตารอบ → ผู้ดูแลต้องตัดสินใจ (ย้ายทีม/มอบคนใหม่/ปิด)
  'lead_auto_bounce_stuck',
]);

export const NOTIFICATION_BOXES = {
  bell: {
    entityTypes: ['dept_request', 'system_issue'],
    kinds: ['task_assign', ...LEAD_BELL_KINDS],
  },
};

// ชื่อกล่องมาจาก query string ⇒ **ต้องผ่านทะเบียนเท่านั้น** ห้ามให้ฝั่งเบราว์เซอร์
// ส่ง entityType/kind ดิบมาเอง (วันนี้ยังตัดขอบเขตด้วย userId อยู่แล้ว แต่ทะเบียนทำให้
// "กล่องมีอะไรบ้าง" ตอบได้จากโค้ดที่เดียว ไม่ใช่จากสิ่งที่หน้าจอบังเอิญส่งมา)
export function notificationBox(box) {
  return NOTIFICATION_BOXES[String(box || '')] || null;
}

/**
 * กรองตามกล่อง — **ที่ฐานข้อมูล ไม่ใช่หลังดึงมา**
 *
 * ⚠️ `.or()` ก้อนเดียวเสมอ (ทุกเงื่อนไขของกล่องต่อกันด้วย "หรือ") · ผู้เรียกอาจมี
 * `.or()` ของตัวเองอยู่แล้ว (กุญแจหน้าถัดไป) — PostgREST เอา or สองก้อนมา **and**
 * กัน ซึ่งเป็นสิ่งที่ต้องการพอดี (ตรวจกับของจริงแล้ว: or+or = 284 เท่ากับ or+and)
 */
function applyBox(query, box) {
  if (!box) return query;
  const parts = [
    ...(box.entityTypes || []).map((t) => `entityType.eq.${t}`),
    ...(box.kinds || []).map((k) => `kind.eq.${k}`),
  ];
  return parts.length ? query.or(parts.join(',')) : query;
}

export const NOTIFICATION_LIST_LIMIT = 30;
// เพดานต่อคำขอของหน้า "ดูทั้งหมด" — กันคนแก้ query string ให้ดึงทั้งตารางในทีเดียว
export const NOTIFICATION_PAGE_MAX = 100;

export function entityTitle(entityType, parent) {
  // ⚠️ ลำดับสำคัญ: ของที่มี "เลขที่เอกสาร" ต้องมาก่อน `name`/`title` เสมอ —
  // ทะเบียนสรรพสามิตมีทั้ง fgCode และชื่อสินค้า คนทำงานเรียกด้วยรหัส FG
  const name = parent?.title || parent?.code || parent?.quoteNumber || parent?.orderNumber
    || parent?.poNumber || parent?.docNo || parent?.fgCode
    || parent?.contactName || parent?.name || parent?.id || '';
  const label = ENTITY_LABEL[entityType] || 'รายการ';
  return `${label} ${name}`.trim().slice(0, 200);
}

// ── ผู้รับของอัปเดตหนึ่งแถว ──────────────────────────────────────────────
// = คนที่ผูกกับ entity (ทะเบียน updateAccess) + **คนที่เคยโพสต์ในเธรดนั้น**
//   − คนที่เพิ่งโพสต์เอง (ไม่ต้องแจ้งตัวเอง)
//
// ⭐ "คนเคยโพสต์" คือส่วนที่ทำให้เธรดสองฝ่ายทำงานได้โดยไม่ต้องแจ้งทั้งฝ่าย: RD ที่
// ตอบเคสไปแล้วครั้งหนึ่งจะได้รับข้อความถัดไปเอง ส่วนคนที่ไม่เคยเกี่ยวไม่ถูกรบกวน
export function threadParticipants(items = []) {
  return [...new Set(
    items
      .filter((row) => !row?.deletedAt && row?.authorId)
      .map((row) => String(row.authorId)),
  )];
}

async function pastAuthors(supabase, entityType, entityId) {
  const { data, error } = await supabase
    .from('entity_updates').select('authorId, deletedAt')
    .eq('entityType', entityType).eq('entityId', String(entityId));
  if (error) {
    // อ่านคนเคยโพสต์ไม่ได้ ≠ ไม่มีใครเคยโพสต์ — log แล้วเดินต่อด้วยผู้รับจากทะเบียน
    // (แจ้งเตือนขาดคนดีกว่าโพสต์ไม่สำเร็จ) ดู [[supabase-masked-query-errors]]
    console.error('[notifications] อ่านคนเคยโพสต์ไม่สำเร็จ', entityType, entityId, error.message);
    return [];
  }
  return data || [];
}

export async function recipientsForUpdate(supabase, { entityType, entityId, parent, actorId, update }) {
  const [owners, thread] = await Promise.all([
    updateRecipients(supabase, entityType, parent),
    pastAuthors(supabase, entityType, entityId),
  ]);
  // คนที่ถูก @ ถึงในข้อความนี้ — id ถูกกรองด้วยด่านของ entity ตั้งแต่ตอนโพสต์แล้ว
  // (ดู lib/master/mentions) จึงเชื่อได้ตรงนี้
  const all = new Set([...owners, ...threadParticipants(thread), ...mentionIdsOf(update)]);
  if (actorId) all.delete(String(actorId));
  return [...all];
}

// ── เขียน ────────────────────────────────────────────────────────────────
// fan-out 1 ผู้รับ = 1 แถว (มติ 14) · unique (userId, updateId) กันซ้ำที่ระดับ DB
// จึงใช้ upsert แบบ ignore ได้ปลอดภัยเมื่อถูกเรียกซ้ำ
export async function notifyThreadUpdate(supabase, { entityType, entityId, parent, update, actor }) {
  try {
    if (!updateEntityConfig(entityType) || !update?.id) return { sent: 0 };
    // ชนิดที่ลงเธรดแต่ไม่เด้ง — วันนี้คือ `override` ของลูกค้า/สินค้า ซึ่งถูกเขียนคู่กับ
    // `approve` เสมอ (ดูเหตุผลเต็มที่ isQuietUpdateKind ใน lib/master/updateTypes.js)
    if (isQuietUpdateKind(entityType, update.kind)) return { sent: 0, quiet: true };
    const userIds = await recipientsForUpdate(supabase, {
      entityType, entityId, parent, actorId: actor?.id, update,
    });
    if (!userIds.length) return { sent: 0 };

    // เหตุการณ์ระบบก็แจ้งได้ (ถูกตีกลับ = สิ่งที่ต้องรู้ที่สุด) — ป้ายมาจากทะเบียน
    // ชนิดเดียวกับที่หน้าจอใช้ ผู้ใช้จะได้เห็นคำเดียวกันทั้งกล่องและในเธรด
    const kindLabel = updateKindMeta(entityType, update.kind)?.label || 'อัปเดต';
    const rows = userIds.map((userId) => ({
      id: `NTF-${randomUUID()}`,
      userId,
      entityType,
      entityId: String(entityId),
      updateId: update.id,
      kind: 'thread_update',
      title: `${kindLabel} · ${entityTitle(entityType, parent)}`.slice(0, 200),
      body: update.body ? String(update.body).slice(0, 500) : null,
      href: notificationHref(entityType, entityId),
      // เหตุการณ์ระบบไม่มี "คนพูด" ในความหมายของบทสนทนา แต่ยังมีคนกดปุ่ม —
      // โชว์ชื่อคนกดเสมอ ไม่งั้นอ่านว่า "ใครตีกลับ" ไม่ได้
      actorName: actor?.name || update.authorName || null,
      createdAt: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('notifications')
      .upsert(rows, { onConflict: 'userId,updateId', ignoreDuplicates: true });
    if (error) {
      console.error('[notifications] fan-out failed', entityType, entityId, error.message);
      return { sent: 0, error: error.message };
    }
    return { sent: rows.length, system: isSystemUpdateItem(entityType, { kind: 'own', row: update }) };
  } catch (e) {
    console.error('[notifications] fan-out threw', entityType, entityId, e.message);
    return { sent: 0, error: e.message };
  }
}

/**
 * แจ้งเตือนที่ **ไม่ได้มาจากเธรด** — ผู้เรียกระบุผู้รับเอง
 *
 * ใช้กับ "จุดส่งมอบงาน" ที่ไม่มีข้อความในเธรดให้เกาะ เช่นลีดถูกคัดกรองเข้าทีม
 * หรือถูกมอบให้ AE คนหนึ่ง — คนที่ต้องทำต่อคือคนที่ระบบเพิ่งเลือก ไม่ใช่คนที่เคย
 * คุยในเธรด (`recipientsForUpdate` จึงตอบคำถามนี้ไม่ได้)
 *
 * ⚠️ ไม่ใส่ `dedupeKey` = **ไม่มี dedupe ที่ระดับ DB** (Postgres ถือว่า NULL ไม่ซ้ำกับ
 * NULL) ซึ่งถูกแล้วสำหรับจุดส่งมอบ: มอบลีดสองครั้ง = สองเหตุการณ์จริง ควรเด้งสองครั้ง
 *
 * ⚠️ กติกาเดียวกับทั้งไฟล์: กลืน error เอง ห้าม throw กลับไปหาผู้เรียก — ผู้เรียก
 * อยู่หลังจุดที่ข้อมูลถูกบันทึกสำเร็จแล้ว แจ้งเตือนพลาดต้องไม่ทำให้งานที่สำเร็จตอบ error
 *
 * @param dedupeKey  กันซ้ำผ่าน unique index (userId, updateId) — ใส่เมื่อ "เหตุการณ์เดียวกัน
 *   อาจถูกยิงซ้ำ" เช่นสรุปประจำวันที่ cron รันแล้วแอดมินกดทดสอบซ้ำในวันเดียวกัน
 *   ⚠️ คอลัมน์ `updateId` ถูกออกแบบให้ชี้แถวใน entity_updates แต่ **ไม่มี FK** และถูกใช้
 *   เพื่อ dedupe อย่างเดียว (ตรวจแล้ว: ไม่มีที่ไหนอ่านค่านี้ไปทำอย่างอื่น) — ค่าสังเคราะห์
 *   จึงใส่ได้ ขอแค่ตั้งชื่อให้ไม่ชนกับ id จริงของ entity_updates (ขึ้นต้นด้วย `DIGEST-`)
 * @param href  ทับลิงก์ปลายทาง — ใช้เมื่อแจ้งเตือนสรุปหลายใบ แล้วที่ที่ควรพาไปคือ *คิว*
 *   ไม่ใช่ใบใดใบหนึ่ง
 */
export async function notifyUsers(supabase, { userIds = [], entityType, entityId, kind = 'handoff', title, body, actorName, dedupeKey = null, href } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!ids.length || !entityType || !entityId || !title) return { sent: 0 };
    const rows = ids.map((userId) => ({
      id: `NTF-${randomUUID()}`,
      userId,
      entityType,
      entityId: String(entityId),
      updateId: dedupeKey || null,
      kind,
      title: String(title).slice(0, 200),
      body: body ? String(body).slice(0, 500) : null,
      href: href || notificationHref(entityType, entityId),
      actorName: actorName || null,
      createdAt: new Date().toISOString(),
    }));
    /* มี dedupeKey = ยิงซ้ำได้โดยไม่เกิดแถวซ้ำ · ไม่มีก็ insert ตรง ๆ เพราะ
       upsert บน (userId, NULL) ไม่กันอะไรอยู่แล้ว (NULL ไม่ซ้ำกับ NULL) */
    const { error } = dedupeKey
      ? await supabase.from('notifications').upsert(rows, { onConflict: 'userId,updateId', ignoreDuplicates: true })
      : await supabase.from('notifications').insert(rows);
    if (error) {
      console.error('[notifications] notifyUsers failed', entityType, entityId, error.message);
      return { sent: 0, error: error.message };
    }
    return { sent: rows.length };
  } catch (e) {
    console.error('[notifications] notifyUsers threw', entityType, entityId, e.message);
    return { sent: 0, error: e.message };
  }
}

// ── อ่าน ─────────────────────────────────────────────────────────────────
//
// ⚠️ **เรียงด้วยสองคอลัมน์เสมอ (`createdAt` แล้ว `id`)** — fan-out เขียนหลายแถวด้วย
// `new Date().toISOString()` ค่าเดียวกัน ⇒ แถวเวลาชนกันเป็นเรื่องปกติ ไม่ใช่กรณีหายาก
// เรียงคอลัมน์เดียวแล้วลำดับของแถวที่ชนกันไม่นิ่ง หน้า "ดูทั้งหมด" จะข้ามหรือซ้ำแถว
// ตอนกดโหลดเพิ่ม (กุญแจหน้าถัดไปอ้างอิงแถวสุดท้ายของหน้าก่อน)
const pageOrder = (query) => query
  .order('createdAt', { ascending: false })
  .order('id', { ascending: false });

/**
 * กุญแจหน้าถัดไป = แถวสุดท้ายที่ส่งไปแล้ว (ไม่ใช่ offset)
 *
 * ⚠️ ห้ามเปลี่ยนไปใช้ `.range()` — ระหว่างที่คนกำลังไล่อ่าน แจ้งเตือนใหม่เข้ามาได้
 * ตลอด offset จะเลื่อนตามแล้วแถวเดิมโผล่ซ้ำ/หายไปเงียบ ๆ
 */
export function notificationCursor(row) {
  return row?.createdAt && row?.id ? `${row.createdAt}|${row.id}` : null;
}

function applyCursor(query, cursor) {
  const at = String(cursor || '').indexOf('|');
  if (at < 1) return query;
  const createdAt = cursor.slice(0, at);
  const id = cursor.slice(at + 1);
  // ครอบค่าด้วย double quote — timestamptz มี `:` และ `+` ที่ PostgREST ต้องอ่านเป็น
  // ค่าไม่ใช่ตัวคั่น (ไม่มี `,` ในสองค่านี้จึงปลอดภัยที่จะฝังใน or)
  return query.or(`createdAt.lt."${createdAt}",and(createdAt.eq."${createdAt}",id.lt."${id}")`);
}

export async function listNotifications(supabase, userId, {
  limit = NOTIFICATION_LIST_LIMIT, unreadOnly = false, cursor = null, box = null,
} = {}) {
  let query = supabase.from('notifications').select('*').eq('userId', String(userId));
  if (unreadOnly) query = query.is('readAt', null);
  // กรองในหน้าจอ = ขอ 30 แถวได้จริง 3 แถว แล้ว `hasMore` โกหก (เหตุผลเดียวกับ
  // โหมด "ยังไม่อ่าน")
  query = applyBox(query, box);
  query = applyCursor(query, cursor);
  const { data, error } = await pageOrder(query).limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * หนึ่งหน้าของกล่องแจ้งเตือน + รู้ว่ายังมีต่อไหม
 *
 * ขอเกินมา 1 แถวแล้วตัดทิ้ง — ถูกกว่า count ทั้งตารางทุกครั้งที่กดโหลดเพิ่ม และตอบ
 * คำถามเดียวที่หน้าจอถามจริง ๆ ("ปุ่มโหลดเพิ่มควรขึ้นไหม")
 */
export async function listNotificationPage(supabase, userId, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || NOTIFICATION_LIST_LIMIT, NOTIFICATION_PAGE_MAX));
  const rows = await listNotifications(supabase, userId, { ...options, limit: limit + 1 });
  const items = rows.slice(0, limit);
  return {
    items,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? notificationCursor(items[items.length - 1]) : null,
  };
}

// ⚠️ เลขบนป้ายต้องนับ **กล่องเดียวกับที่กระดิ่งแสดง** — ป้ายขึ้น 12 แล้วเปิดมาเจอ
// 3 แถวคือกระดิ่งที่ไม่มีใครเชื่ออีก
export async function unreadCount(supabase, userId, { box = null } = {}) {
  const query = applyBox(supabase
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('userId', String(userId)).is('readAt', null), box);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

// จำนวนทั้งหมดของคนนี้ — หน้า "ดูทั้งหมด" ใช้บอกว่ากำลังไล่อ่านอยู่ในกองใหญ่แค่ไหน
// (กระดิ่งไม่ต้องรู้ จึงไม่ถูกเรียกจากที่นั่น)
export async function totalCount(supabase, userId, { box = null } = {}) {
  const query = applyBox(supabase
    .from('notifications').select('id', { count: 'exact', head: true })
    .eq('userId', String(userId)), box);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

// ── อ่านแล้ว ─────────────────────────────────────────────────────────────
// (มติ 15) เปิดเธรด = mark read **ทั้ง entity ก้อนเดียว** ตั้งใจไม่ทำ watermark
// ต่อเธรดต่อคนแบบ Slack (เส้นคั่น "ข้อความใหม่") — แพงและได้เพิ่มน้อย
export async function markThreadRead(supabase, userId, entityType, entityId) {
  const { error } = await supabase
    .from('notifications').update({ readAt: new Date().toISOString() })
    .eq('userId', String(userId))
    .eq('entityType', entityType).eq('entityId', String(entityId))
    .is('readAt', null);
  if (error) throw error;
}

/**
 * ทำเครื่องหมายอ่านแล้วทีละแถว — มีไว้เพื่อหน้า "ดูทั้งหมด" โดยเฉพาะ
 *
 * ⚠️ **ไม่ได้ทำลายมติ 15** — มติ 15 พูดถึง *เธรด*: ไม่มีเส้นคั่น "ข้อความใหม่" ราย
 * ข้อความแบบ Slack และเปิดเธรด = อ่านทั้ง entity ก้อนเดียว ยังเป็นแบบนั้นทุกประการ
 * ตัวนี้ทำงานกับ *แถวในกล่อง* ซึ่งเป็นของคนละชั้น และจำเป็นเพราะมีแจ้งเตือนที่
 * ปลายทางไม่มีเธรดให้เปิด (`lead_overdue` ชี้ไปหน้าคิว · `service_visit` ชี้ไปตาราง)
 * ⇒ ถ้าไม่มีปุ่มนี้ แถวพวกนั้นจะค้างเป็น "ยังไม่อ่าน" ตลอดไป เหลือทางเดียวคือ
 * "อ่านทั้งหมด" ซึ่งล้างของที่ยังไม่ได้อ่านจริงไปด้วย
 *
 * ⚠️ ตัดขอบเขตด้วย `userId` เสมอ — id ของแถวมาจากฝั่งเบราว์เซอร์ ห้ามเชื่อลอย ๆ
 */
export async function markOneRead(supabase, userId, id) {
  const { error } = await supabase
    .from('notifications').update({ readAt: new Date().toISOString() })
    .eq('userId', String(userId)).eq('id', String(id))
    .is('readAt', null);
  if (error) throw error;
}

/**
 * "อ่านทั้งหมด"
 *
 * ⚠️ **ต้องล้างเท่าที่กล่องนั้นแสดง** — ปุ่มในกระดิ่ง (กล่องคำร้อง) ที่ไปล้าง
 * แจ้งเตือนดีล/ลีดที่เจ้าตัวไม่เคยเห็นด้วย = ทำของหายเงียบ ๆ โดยที่คนกดไม่รู้ตัว
 * ปุ่มบนหน้าเต็มยังล้างทั้งกองเหมือนเดิม เพราะหน้านั้นแสดงทั้งกองจริง ๆ
 */
export async function markAllRead(supabase, userId, { box = null } = {}) {
  const query = applyBox(supabase
    .from('notifications').update({ readAt: new Date().toISOString() })
    .eq('userId', String(userId)).is('readAt', null), box);
  const { error } = await query;
  if (error) throw error;
}

// ลบ entity → กวาดแจ้งเตือนของมันทิ้ง (ไม่มี FK — เรียกจาก purgeUpdatesMany ที่เดียว)
// ไม่กวาด = กล่องมีแถวที่กดแล้วเจอ 404 ค้างอยู่ตลอดไป
export async function purgeNotificationsMany(supabase, entityType, entityIds = []) {
  const ids = (entityIds || []).filter(Boolean).map(String);
  if (!entityType || !ids.length) return;
  const { error } = await supabase
    .from('notifications').delete()
    .eq('entityType', entityType).in('entityId', ids);
  if (error) console.error('[notifications] purge failed', entityType, ids.length, error.message);
}
