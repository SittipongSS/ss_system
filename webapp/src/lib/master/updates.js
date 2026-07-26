// ── เธรดอัปเดตของกลาง (mig 0163) — ชั้นเข้าถึงข้อมูล (server only) ────────
// ตารางเดียวสำหรับทุก entity — ดูทะเบียนสิทธิ์ที่ lib/master/updateAccess.js
import { randomUUID } from 'crypto';
import { redactDeleted, sanitizeUpdateAttachments } from '@/lib/master/updateTypes';

// เธรดของ entity หนึ่ง — เก่าไปใหม่ (อ่านไล่เป็นเรื่องราว)
// พลาด = คืน [] ไม่ทำหน้ารายละเอียดพัง (เช่นยังไม่ได้รัน migration) แต่ log ไว้
// ให้เห็นว่าเงียบเพราะอะไร (บทเรียนจาก listTaskUpdates เดิม)
export async function listUpdates(supabase, entityType, entityId) {
  if (!entityType || !entityId) return [];
  const { data, error } = await supabase
    .from('entity_updates').select('*')
    .eq('entityType', entityType).eq('entityId', entityId)
    .order('createdAt', { ascending: true });
  if (error) {
    console.error('[updates] listUpdates failed', entityType, entityId, error.message);
    return [];
  }
  return (data || []).map(redactDeleted);
}

export async function findUpdate(supabase, id) {
  const { data, error } = await supabase
    .from('entity_updates').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`อ่านข้อความไม่สำเร็จ: ${error.message}`);
  return data || null;
}

// เพิ่มรายการลงเธรด — คืน { row, error } และ **ไม่ throw**
//
// ⚠️ ผู้เรียกเลือกเองว่าจะแคร์ไหม: auto-log หลังบันทึกงานสำเร็จ = ไม่แคร์ (ฟีดพลาด
// ต้องไม่ทำให้ action หลักพังตาม) · ตอนคนกดปุ่มส่ง = ต้องเช็คแล้วตีกลับ ไม่งั้น
// ผู้ใช้เห็น 201 ทั้งที่ไม่ได้บันทึก (เคยเกิดจริงตอน mig 0113 ยังไม่ได้รัน)
export async function appendUpdate(supabase, {
  entityType, entityId, kind = 'comment', body = null, meta = {},
  attachments = [], user = null,
}) {
  const row = {
    id: `EUP-${randomUUID()}`,
    entityType,
    entityId: String(entityId),
    kind,
    body: body ? String(body).slice(0, 4000) : null,
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
    attachments: sanitizeUpdateAttachments(attachments),
    authorId: user?.id != null ? String(user.id) : null,
    authorName: user?.name ?? null,
    authorDept: user?.department ?? null,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('entity_updates').insert(row).select().single();
  if (error) {
    console.error('[updates] appendUpdate failed', entityType, entityId, error.message);
    return { row: null, error: error.message };
  }
  return { row: data, error: null };
}

// ลบเธรดทั้งก้อนตอนลบ entity — ไม่มี FK จึงต้องเก็บกวาดเอง
// (แพตเทิร์นเดียวกับ purgeAttachments; ดู forceDelete.js)
export async function purgeUpdates(supabase, entityType, entityId) {
  if (!entityType || !entityId) return;
  return purgeUpdatesMany(supabase, entityType, [entityId]);
}

// ลบเธรดของหลาย entity พร้อมกัน — ใช้ตอน cascade ลบดีล/โครงการที่กวาดงานลูกไปทั้งชุด
export async function purgeUpdatesMany(supabase, entityType, entityIds = []) {
  const ids = (entityIds || []).filter(Boolean).map(String);
  if (!entityType || !ids.length) return;
  const { error } = await supabase
    .from('entity_updates').delete()
    .eq('entityType', entityType).in('entityId', ids);
  if (error) console.error('[updates] purgeUpdates failed', entityType, ids.length, error.message);
}
