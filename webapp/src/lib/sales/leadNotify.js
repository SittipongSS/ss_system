// แจ้งเตือน "จุดส่งมอบลีด" เข้ากล่องแจ้งเตือนรายคนในแอป
//
// ทำไมต้องมี: เส้นชีวิตของลีดมีจุดส่งมอบ 4 จุด (รับเข้า → คัดกรอง → มอบหมาย → ตีกลับ)
// และทุกจุดมี SLA 1 วันทำการผูกอยู่ — แต่ของเดิม**แจ้งผ่าน Google Chat webhook อย่างเดียว**
// ซึ่งเป็นห้องรวมของฝ่าย ไม่ได้บอกว่าใครต้องทำ และถ้าองค์กรยังไม่ได้เปิด webhook
// (สถานะจริง 2026-08-08: ปิดอยู่ทุก space) **ไม่มีใครได้รับอะไรเลยสักทาง**
//
// ผลที่เกิดจริง: ลีด 14 ใบค้างรอติดต่อกลับข้ามเดือน ใบที่นานสุด 10 วันทำการ ทั้งที่
// SLA คือ 1 วันทำการ — ไม่ใช่เพราะคนไม่ทำ แต่เพราะไม่มีอะไรบอกว่ามีของเข้ามา
//
// ⚠️ **ไม่ได้แทน webhook** — คนละหน้าที่ตามที่ mig 0185 เขียนไว้:
// webhook = ประกาศให้ฝ่าย · notifications = งานของ *คุณ* คนเดียว · เปิด webhook
// เมื่อไรก็ได้ทั้งสองทาง
//
// ⚠️ กติกาผู้รับของ mig 0185: **ห้ามใช้ "ทุกคนในฝ่าย"** ไม่งั้นกล่องตายใน 1 สัปดาห์
// (คนเลิกอ่านเพราะ 90% ไม่เกี่ยวกับตัวเอง) — ที่นี่จึงส่งเฉพาะคนที่ *ต้องลงมือต่อ* จริง ๆ

import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { LEAD_CHANNEL_LABELS } from '@/lib/sales/leads';
import { TEAM_LABELS } from '@/lib/permissions';

/* ตำแหน่งที่ "คัดกรอง" ได้ — คิวกลางเป็นของหัวหน้าฝ่ายขาย
   admin เป็น **ตัวสำรอง** ใช้เมื่อไม่มี ae_supervisor ในระบบเลย: ไม่มีใครรับแจ้งเตือน
   คือความล้มเหลวเงียบแบบเดียวกับที่ไฟล์นี้เกิดมาแก้ */
const SCREENERS = ['ae_supervisor'];
const SCREENER_FALLBACK = ['admin'];
/* ตำแหน่งที่ "กระจายลีดของทีม" ได้ — ตรงกับด่าน inTeam ของ handler (senior_ae/ac)
   AC ไม่ได้เป็นเจ้าของลีด (มติ 2026-08-08) แต่ยังกระจายให้ทีมได้ จึงต้องรู้ด้วย */
const SPREADERS = ['senior_ae', 'ac'];

const usersWhere = (directory, predicate) =>
  [...(directory?.values?.() || [])].filter((u) => u && !u.disabled && predicate(u)).map((u) => u.id);

const nameOf = (lead) => [lead?.contactName, lead?.company].filter(Boolean).join(' · ') || 'ลีด';
const channelOf = (lead) => LEAD_CHANNEL_LABELS[lead?.channel] || lead?.channel || '-';
const teamOf = (lead) => TEAM_LABELS[lead?.team] || lead?.team || '-';

/**
 * ใครต้องรู้ + ข้อความว่าอะไร สำหรับจุดส่งมอบหนึ่งจุด — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 *
 * @param action    create | screen | assign | bounce
 * @param lead      แถวลีด **หลัง** ทำรายการแล้ว (ยกเว้น bounce ดู previousAssigneeId)
 * @param directory Map ของผู้ใช้จาก loadUserDirectory
 * @param actorId   คนที่กดปุ่ม — ไม่ต้องแจ้งตัวเอง
 * @returns {{userIds: string[], title: string, body: string|null}|null}
 */
export function leadHandoffNotice({ action, lead, directory, actorId, previousAssigneeId, reason } = {}) {
  if (!lead?.id) return null;
  const who = nameOf(lead);
  let userIds = [];
  let title = '';
  let body = null;

  if (action === 'create') {
    userIds = usersWhere(directory, (u) => SCREENERS.includes(u.role));
    if (!userIds.length) userIds = usersWhere(directory, (u) => SCREENER_FALLBACK.includes(u.role));
    title = `ลีดใหม่รอคัดกรอง · ${who}`;
    body = `รับผ่าน ${channelOf(lead)} — คัดกรองและเลือกทีมภายใน 1 วันทำการ`;
  } else if (action === 'screen') {
    if (!lead.team) return null; // คัดกรองแล้วต้องมีทีมเสมอ — ไม่มีทีม = ไม่รู้จะบอกใคร
    userIds = usersWhere(directory, (u) => SPREADERS.includes(u.role) && u.team === lead.team);
    // เว้นวรรคหลัง "ทีม" — ชื่อทีมทุกตัวเป็นอังกฤษ ("New ODM") ติดกันแล้วอ่านสะดุด
    title = `ลีดเข้าทีม ${teamOf(lead)} รอกระจาย · ${who}`;
    body = 'มอบหมายผู้รับผิดชอบภายใน 1 วันทำการ';
  } else if (action === 'assign') {
    if (!lead.assigneeId) return null;
    userIds = [lead.assigneeId];
    title = `คุณได้รับลีดใหม่ · ${who}`;
    body = `รับผ่าน ${channelOf(lead)} — ติดต่อกลับภายใน 1 วันทำการ`;
  } else if (action === 'bounce') {
    /* ตีกลับ = ของกลับเข้าคิวกลาง **และ** ของถูกดึงออกจากมือคนเดิม — สองฝั่งต้องรู้คนละเรื่อง
       ผู้รับเดิมต้องมาจาก `previousAssigneeId` เพราะ handler ล้าง assigneeId ไปแล้ว */
    const screeners = usersWhere(directory, (u) => SCREENERS.includes(u.role));
    userIds = [...(screeners.length ? screeners : usersWhere(directory, (u) => SCREENER_FALLBACK.includes(u.role))), previousAssigneeId];
    title = `ลีดถูกตีกลับคิวคัดกรอง · ${who}`;
    body = reason ? `เหตุผล: ${reason}` : 'กลับไปรอคัดกรองใหม่';
  } else {
    return null;
  }

  const recipients = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => id !== String(actorId || ''));
  if (!recipients.length) return null;
  return { userIds: recipients, title, body };
}

/**
 * ยิงแจ้งเตือนแบบ fire-and-forget — ท่าเดียวกับ `sendChat` (lib/chat.js)
 * ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว จึงห้ามเพิ่ม latency และห้าม throw
 */
export function notifyLeadHandoff(supabase, { action, lead, directory, actor, previousAssigneeId, reason } = {}) {
  const notice = leadHandoffNotice({
    action, lead, directory, actorId: actor?.id, previousAssigneeId, reason,
  });
  if (!notice) return;
  const deliver = async () => {
    await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'lead',
      entityId: lead.id,
      kind: `lead_${action}`,
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
