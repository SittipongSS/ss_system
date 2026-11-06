// นัดหมายของลีด — ส่วนที่คุยกับฐาน (mig 0424) · กติกาบริสุทธิ์อยู่ที่ leadAppointments.js
//
// ⭐ ลำดับ "จองก่อน แล้วค่อยขยับอย่างอื่น" ทุกทาง (รับลีด · แก้ลีด · นัดประชุม):
//    ห้องชน = 409 ก่อนที่ลีด/สถานะ/ประวัติจะขยับแม้แต่ช่องเดียว · แทรกนัดใหม่ **ก่อน** ปิดนัดเดิมของ
//    ลีดใบเดียวกัน (ฐานยอมให้ลีดเดียวกันซ้อนตัวเองได้ — ดู EXCLUDE ใน 0424) ⇒ ปิดนัดเดิมล้มกลางทาง
//    ยังเหลือนัดที่ถูกต้องอย่างน้อยหนึ่งนัด ไม่ใช่ห้องหายทั้งคู่
// ⚠️ supabase ไม่ throw (memory supabase-never-throws) — ทุกฟังก์ชันคืน { data, error } ให้ผู้เรียกตัดสิน

import { genId } from '@/lib/id';
import { inLeadScope } from '@/lib/sales/leads';
import { appointmentConflictMessage, pickUpcomingAppointment } from '@/lib/sales/leadAppointments';

export const APPOINTMENT_COLUMNS = 'id, leadId, source, mode, room, startAt, endAt, leadEventId, endedAt, endedReason, endedByName, createdBy, createdByName, createdAt';

/** SQLSTATE ของ EXCLUDE — สองคนจองห้องเดียวกันพร้อมกัน ผ่านด่านเช็คก่อนทั้งคู่ แล้วฐานปัดคนที่สอง */
export const isRoomOverlapError = (error) => error?.code === '23P01';

/** นัดที่ยังไม่ปิดซึ่งคาบช่วง [fromIso, untilIso) — ทุกห้องทุกรูปแบบ */
export async function loadActiveAppointmentsInRange(supabase, { fromIso, untilIso }) {
  return supabase
    .from('lead_appointments')
    .select(APPOINTMENT_COLUMNS)
    .is('endedAt', null)
    .lt('startAt', untilIso)
    .gt('endAt', fromIso)
    .order('startAt', { ascending: true })
    .limit(1000); // ช่วงยาวสุด 45 วันของสามห้อง (หลักสิบนัดต่อสัปดาห์) — เพดานนี้คือตาข่าย ไม่ใช่ขนาดงานจริง
}

/** แปะชื่อลูกค้าให้แถวที่คนดูมองเห็นลีดต้นทางได้ — นอกขอบเขต = ไม่มีชื่อ (ไม่ใช่ตัดแถวทิ้ง:
 *  ห้องที่ไม่ว่างต้องยังไม่ว่างในสายตาทุกคน แม้จะไม่รู้ว่าเป็นของใคร) */
export async function withVisibleLeadNames(supabase, user, rows = []) {
  const ids = [...new Set(rows.map((row) => row.leadId).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await supabase
    .from('sales_leads')
    .select('id, contactName, company, team, assigneeId, createdBy')
    .in('id', ids)
    // id ไม่ซ้ำ ⇒ ได้ไม่เกินจำนวน id ที่ถาม · ids มาจากนัดของวันเดียว/นัดที่ชน (หลักสิบ) ไม่ใช่ทั้งตาราง
    .limit(ids.length);
  if (error) {
    console.error('[lead appointments] อ่านชื่อลีดของนัดไม่สำเร็จ — โชว์นัดแบบไม่มีชื่อ:', error.message);
    return rows.map((row) => ({ ...row, leadId: null }));
  }
  const byId = new Map((data || []).map((lead) => [lead.id, lead]));
  return rows.map((row) => {
    const lead = byId.get(row.leadId);
    if (!lead || !inLeadScope(user, lead)) return { ...row, leadId: null, contactName: null, company: null };
    return { ...row, contactName: lead.contactName || null, company: lead.company || null };
  });
}

/** นัดที่ชนกับ `candidate` ในฐาน (กติกาเดียวกับ appointmentConflicts / EXCLUDE) */
export async function findRoomConflicts(supabase, candidate, { leadId = null } = {}) {
  if (!candidate?.room) return { data: [], error: null };
  let query = supabase
    .from('lead_appointments')
    .select(APPOINTMENT_COLUMNS)
    .is('endedAt', null)
    .eq('room', candidate.room)
    .lt('startAt', candidate.endAt)
    .gt('endAt', candidate.startAt);
  if (leadId) query = query.neq('leadId', leadId);
  return query.order('startAt', { ascending: true });
}

/** ปิดนัดที่ยังรออยู่ของลีด (จบหลัง now) — `replaced` · `cancelled` · `lead_closed`
 *  ⚠️ นัดที่ผ่านไปแล้วไม่แตะ — มันคือประวัติว่า "เคยนัดวันนั้น" ไม่ใช่สิ่งที่กันห้องอยู่ */
export async function releaseLeadAppointments(supabase, { leadId, reason, user, nowIso, exceptId = null }) {
  let query = supabase
    .from('lead_appointments')
    .update({
      endedAt: nowIso,
      endedReason: reason,
      endedBy: user?.id || null,
      endedByName: user?.name || null,
      updatedAt: nowIso,
    })
    .eq('leadId', leadId)
    .is('endedAt', null)
    .gt('endAt', nowIso);
  if (exceptId) query = query.neq('id', exceptId);
  return query.select(APPOINTMENT_COLUMNS);
}

/**
 * จองนัดให้ลีด — เช็คห้อง → แทรก → ปิดนัดเดิมที่ยังรออยู่ (มติข้อ 6)
 * @param appointment ค่าที่ผ่าน normalizeAppointmentInput แล้ว { mode, room, startAt, endAt }
 * @returns {Promise<{ data?: object, conflict?: string, error?: string, releaseError?: string }>}
 */
export async function bookLeadAppointment(supabase, {
  leadId, appointment, source, leadEventId = null, user, nowIso, viewer = user,
}) {
  const conflictOf = async () => {
    const { data, error } = await findRoomConflicts(supabase, appointment, { leadId });
    if (error) return `ห้องนี้ไม่ว่างในช่วงเวลานั้น — เลือกห้องอื่นหรือเปลี่ยนเวลา`;
    if (!data?.length) return null;
    return appointmentConflictMessage(await withVisibleLeadNames(supabase, viewer, data));
  };

  if (appointment.room) {
    const conflict = await conflictOf();
    if (conflict) return { conflict };
  }

  const row = {
    id: genId('APT'),
    leadId,
    source,
    mode: appointment.mode,
    room: appointment.room || null,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    leadEventId,
    createdBy: user?.id || null,
    createdByName: user?.name || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const { data, error } = await supabase.from('lead_appointments').insert(row).select(APPOINTMENT_COLUMNS).single();
  if (error) {
    // แพ้คนที่กดพร้อมกัน — ด่านเช็คก่อนผ่านทั้งคู่ ฐานปัดคนที่สอง
    if (isRoomOverlapError(error)) return { conflict: (await conflictOf()) || 'ห้องนี้เพิ่งถูกจองในช่วงเวลานั้น — เลือกห้องอื่นหรือเปลี่ยนเวลา' };
    return { error: `บันทึกนัดไม่สำเร็จ: ${error.message}` };
  }

  const released = await releaseLeadAppointments(supabase, {
    leadId, reason: 'replaced', user, nowIso, exceptId: data.id,
  });
  if (released.error) {
    console.error('[lead appointments] ปิดนัดเดิมไม่สำเร็จ — ลีดมีนัดรอสองนัด:', leadId, released.error.message);
    return { data, releaseError: released.error.message, replaced: [] };
  }
  return { data, replaced: released.data || [] };
}

/** แถวนัดทั้งหมดของลีดใบเดียว (หน้ารายละเอียด) — เรียงใหม่ไปเก่า */
export async function loadLeadAppointments(supabase, leadId) {
  return supabase
    .from('lead_appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('leadId', leadId)
    .order('startAt', { ascending: false });
}

/** นัดที่รออยู่ของลีดใบเดียว */
export async function loadUpcomingAppointment(supabase, leadId, nowIso) {
  const { data, error } = await supabase
    .from('lead_appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('leadId', leadId)
    .is('endedAt', null)
    .gt('endAt', nowIso);
  if (error) return { data: null, error };
  return { data: pickUpcomingAppointment(data || [], nowIso), error: null };
}

/**
 * แปะ `appointment` (นัดที่รออยู่) ให้ลีดทุกใบในลิสต์ — ธงบนหน้ารายการ
 * ⭐ ถามด้วยเวลา (นัดที่ยังไม่จบ) ไม่ใช่ด้วยรายชื่อลีด — ลิสต์ลีดของ MKT/แอดมินเป็นพันใบ (`.in()` ยาวเกิน
 *    16 KB · memory postgrest-16kb-filter) ส่วนนัดที่ยังไม่จบมีหลักสิบ
 * ⚠️ อ่านไม่สำเร็จ (รวมถึงตารางยังไม่มีก่อนรัน 0424) = ไม่มีธง แต่คิวลีดยังเปิดได้ — หน้าทำงานหลัก
 *    ล้มทั้งหน้าเพราะป้ายเสริมคือแลกผิดฝั่ง (ท่าเดียวกับ attachBounceContext)
 */
export async function attachUpcomingAppointments(supabase, leads, nowIso) {
  if (!leads?.length) return;
  const { data, error } = await supabase
    .from('lead_appointments')
    .select(APPOINTMENT_COLUMNS)
    .is('endedAt', null)
    .gt('endAt', nowIso)
    .order('startAt', { ascending: true })
    .limit(1000);
  if (error) {
    console.error('[leads] อ่านนัดหมายไม่สำเร็จ — รายการจะไม่มีธงนัด:', error.message);
    return;
  }
  const byLead = new Map();
  for (const row of data || []) {
    if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
    byLead.get(row.leadId).push(row);
  }
  for (const lead of leads) {
    const rows = byLead.get(lead.id);
    if (rows?.length) lead.appointment = pickUpcomingAppointment(rows, nowIso);
  }
}
