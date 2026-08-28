// ── แจ้งเตือนข้ามเลน SA ↔ RA ของทะเบียนสรรพสามิต ──────────────────────────
//
// ⭐ ที่มา: `PATCH /api/excise-registrations/[id]` เคยมีบล็อกแจ้งข้ามเลนอยู่จริง แต่
// ตัวส่งถูกถอดออกตอนเลิกใช้ Google Chat (mig 0236) เหลือไว้แต่โครง `if` ที่ว่างเปล่า
// ทั้งสองกิ่ง ⇒ ตั้งแต่นั้นมา **ไม่มีใครรู้อะไรเลย**: ฝ่าย RA ไม่รู้ว่ามีทะเบียนรอ
// ตรวจ ฝ่ายขายไม่รู้ผลจนกว่าจะเปิดหน้าไปดูเอง
// ของจริงตอนตรวจระบบ 2026-08-28: ทะเบียน 17 ใบ **ค้างที่ `pending_legal` ทั้งหมด**
// เก้าใบในนั้นค้างมา 28–34 วัน ทั้งที่เอกสารครบและราคาขายปลีกครบทุกใบ
//
// ⚠️ กติกาผู้รับของ mig 0185: **ห้าม "ทุกคนในฝ่าย"** — ที่นี่ส่งเฉพาะคนที่ต้องลงมือ
// ต่อจริง: คิวตรวจเป็นของ **ตำแหน่ง** (RA) ส่วนผลการตรวจส่งกลับ **เจ้าของใบ**
// (`ownerId`) ไม่ใช่ทั้งทีมขาย
//
// ⚠️ fire-and-forget — ผู้เรียกอยู่หลังจุดที่บันทึกสำเร็จแล้ว แจ้งเตือนพลาดต้องไม่ทำ
// ให้การอนุมัติที่สำเร็จแล้วตอบ error
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';

/* ตำแหน่งที่ "ตรวจอนุมัติทะเบียน" ได้ — ตรงกับด่าน `ra:approve` ของ route
   admin เป็น **ตัวสำรอง** ใช้เมื่อไม่มี RA ในระบบเลย: ไม่มีใครรับแจ้งเตือนคือ
   ความล้มเหลวเงียบแบบเดียวกับที่ไฟล์นี้เกิดมาแก้ */
const APPROVERS = ['ra'];
const APPROVER_FALLBACK = ['admin'];

const usersWhere = (directory, predicate) =>
  [...(directory?.values?.() || [])].filter((u) => u && !u.disabled && predicate(u)).map((u) => u.id);

const approverIds = (directory) => {
  const primary = usersWhere(directory, (u) => APPROVERS.includes(u.role));
  return primary.length ? primary : usersWhere(directory, (u) => APPROVER_FALLBACK.includes(u.role));
};

const trim = (s, n) => (s ? String(s).slice(0, n) : '');
const nameOf = (reg) => trim(reg?.fgCode, 60).trim() || 'ทะเบียน';
const customerOf = (reg) => trim(reg?.customerName, 80) || null;

/**
 * ใครต้องรู้ + ข้อความว่าอะไร สำหรับการเปลี่ยนสถานะหนึ่งครั้ง — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 *
 * @param action    submit | approve | reject | revoke
 * @param registration แถวทะเบียน **หลัง** บันทึกแล้ว
 * @param directory Map ของผู้ใช้จาก loadUserDirectory
 * @param actorId   คนที่กดปุ่ม — ไม่ต้องแจ้งตัวเอง
 * @param reason    เหตุผลที่ตีกลับ/ปลดอนุมัติ
 * @returns {{userIds: string[], title: string, body: string|null}|null}
 */
export function registrationNotice({ action, registration, directory, actorId, reason } = {}) {
  if (!registration?.id) return null;
  const actor = actorId ? String(actorId) : null;
  const fg = nameOf(registration);
  const customer = customerOf(registration);
  const owner = registration.ownerId ? String(registration.ownerId) : null;
  const without = (ids) => [...new Set(ids.filter((id) => id && id !== actor))];

  if (action === 'submit') {
    const userIds = without(approverIds(directory));
    if (!userIds.length) return null;
    return {
      userIds,
      title: `รอตรวจขึ้นทะเบียน · ${fg}`,
      body: [customer, 'เอกสารครบแล้ว รอฝ่าย RA ตรวจอนุมัติ'].filter(Boolean).join(' — '),
    };
  }

  /* ผลการตรวจกลับไปหา **เจ้าของใบ** — คนที่ต้องแก้ต่อ/เอาไปออกใบยื่นคือคนนั้น
     ไม่มี ownerId (ใบเก่าก่อนมีคอลัมน์) = ไม่มีใครให้ส่ง ไม่ใช่เหตุให้ส่งทั้งทีม */
  if (!owner || owner === actor) return null;

  if (action === 'approve') {
    return {
      userIds: [owner],
      title: `ขึ้นทะเบียนแล้ว · ${fg}`,
      body: [customer, registration.approvalNumber ? `เลขที่อนุมัติ ${registration.approvalNumber}` : null]
        .filter(Boolean).join(' — ') || null,
    };
  }
  if (action === 'reject') {
    return {
      userIds: [owner],
      title: `ตีกลับให้แก้ไข · ${fg}`,
      body: trim(reason, 300) || customer,
    };
  }
  if (action === 'revoke') {
    return {
      userIds: [owner],
      /* ⚠️ ต้องบอกผลลัพธ์ ไม่ใช่แค่ชื่อการกระทำ — ทะเบียนที่ถูกปลดอนุมัติจะ
         **หลุดจากตัวเลือกตอนออกใบยื่นทันที** ฝ่ายขายที่กำลังจะออกใบต้องรู้เหตุ */
      title: `ปลดอนุมัติทะเบียน · ${fg}`,
      body: trim(reason, 300) || 'ทะเบียนกลับเป็นฉบับร่าง ต้องยื่นขออนุมัติใหม่',
    };
  }
  return null;
}

/** ยิงจริง — เรียกได้ทุกครั้งที่สถานะเปลี่ยน ไม่ต้องเช็คอะไรก่อน (เงียบเองเมื่อไม่มีใครต้องรู้) */
export async function notifyRegistration(supabase, { action, registration, directory, actor, reason } = {}) {
  const notice = registrationNotice({
    action, registration, directory, actorId: actor?.id, reason,
  });
  if (!notice) return;
  const deliver = async () => {
    await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'excise_registration',
      entityId: registration.id,
      kind: `excise_${action}`,
      title: notice.title,
      body: notice.body,
      actorName: actor?.name || null,
    });
  };
  try {
    after(deliver);
  } catch {
    // นอกบริบท request ของ Next (เช่น script/เทสต์) — ยิงตรงแล้วปล่อย error หายไปเอง
    deliver().catch(() => {});
  }
}
