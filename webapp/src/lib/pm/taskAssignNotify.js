// แจ้งเตือน "มอบหมายงาน" เข้ากล่องแจ้งเตือนรายคน (มติผู้ใช้ 2026-08-20)
//
// ⭐ ที่มา: การเปลี่ยนมือของงาน **เงียบสนิททั้งระบบ** — เปลี่ยน `assigneeId` ไม่เขียน
// แถวลงเธรด (`autoTaskUpdates` ดูแค่ status/dueDate/lateReason/blockedReason) และไม่ยิง
// แจ้งเตือนสักทาง ⇒ คนที่ถูกมอบงานรู้ตัวก็ต่อเมื่อบังเอิญเปิดหน้า "งานของฉัน"
//
// ⚠️ **สองแถวสองมุมมอง ไม่ใช่แถวเดียวส่งหลายคน** — `notifyUsers` เขียนหัวเรื่อง
// เดียวกันให้ทุกคนในลิสต์ · "งานเข้ามือคุณ" กับ "งานหลุดจากมือคุณ" คนละเรื่องกัน
// ถ้ารวมเป็นข้อความเดียวจะมีฝั่งหนึ่งอ่านผิดเสมอ
//
// ⚠️ กติกาผู้รับของ mig 0185: ห้าม "ทุกคนในฝ่าย" — ที่นี่คือคนที่ผูกกับงานใบนั้นจริง
// (ผู้รับใหม่ · ผู้รับเดิมที่เพิ่งหลุดมือ · เจ้าของงาน) ลบคนที่เพิ่งกดเอง
//
// ⚠️ แถวในเธรด (kind `assign`) ตั้งใจให้ **quiet** — ประวัติ "ทำไมงานย้ายมือ" ต้องมี
// แต่การเด้งเป็นหน้าที่ของไฟล์นี้ ไม่งั้นหนึ่งการกระทำเด้งสองใบ (บั๊กเดิม #1205)
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';

const trim = (s, n) => (s ? String(s).slice(0, n) : '');

/**
 * ส่วนที่ตัดสินใจล้วน ๆ (เทสต์ได้โดยไม่ต้องมี supabase) — คืนรายการแจ้งเตือนที่ต้องยิง
 *
 * @param task  แถวงาน**หลังบันทึกแล้ว** (`assigneeId` = ผู้รับคนใหม่ · null = ถอนมอบหมาย)
 */
export function taskAssignNotices({
  task, actorId = null, actorName = null, previousAssigneeId = null, assigneeName = null,
} = {}) {
  if (!task?.id) return [];
  const next = task.assigneeId ? String(task.assigneeId) : null;
  const prev = previousAssigneeId ? String(previousAssigneeId) : null;
  if (next === prev) return [];   // ไม่ได้เปลี่ยนมือ = ไม่มีอะไรต้องบอกใคร

  const actor = actorId ? String(actorId) : null;
  const title = trim(task.title, 120) || 'งาน';
  const due = task.dueDate ? ` · กำหนดส่ง ${task.dueDate}` : '';
  const by = actorName || 'ระบบ';
  const out = [];

  // 1) คนที่งานเพิ่งเข้ามือ — คนเดียวที่ต้องลงมือต่อจริง ๆ
  if (next && next !== actor) {
    out.push({
      userIds: [next],
      title: `มอบหมายงานให้คุณ · ${title}`,
      body: `${by} มอบหมายงานนี้ให้คุณ${due}`,
    });
  }

  // 2) คนที่งานเพิ่งหลุดจากมือ + เจ้าของงาน — กันทำงานซ้ำ/ตามงานผิดคน
  // (เจ้าของงานอยู่ในกติกาผู้รับของ personal_task อยู่แล้ว — ดู UPDATE_ENTITIES)
  const told = new Set([next, actor].filter(Boolean));
  const others = [prev, task.ownerId ? String(task.ownerId) : null]
    .filter((id) => id && !told.has(id));
  if (others.length) {
    out.push({
      userIds: [...new Set(others)],
      title: `งานย้ายมือ · ${title}`,
      body: (() => {
        if (!next) return `${by} ถอนการมอบหมายงานนี้`;
        // ไม่รู้ชื่อผู้รับใหม่ = อย่าแต่งประโยคให้ดูเหมือนรู้ — บอกแค่ว่างานย้ายไปแล้ว
        if (!assigneeName) return `${by} ย้ายงานนี้ไปให้คนอื่นแล้ว`;
        return next === actor
          ? `${by} รับช่วงงานนี้ไป`
          : `${by} มอบหมายงานนี้ให้ ${assigneeName}`;
      })(),
    });
  }
  return out;
}

/**
 * ยิงแจ้งเตือนแบบ fire-and-forget
 * ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว จึงห้ามเพิ่ม latency และห้าม throw
 */
export function notifyTaskAssigned(supabase, options = {}) {
  const notices = taskAssignNotices(options);
  if (!notices.length) return;
  const { task, actorName = null } = options;
  const deliver = async () => {
    for (const notice of notices) {
      await notifyUsers(supabase, {
        userIds: notice.userIds,
        entityType: 'personal_task',
        entityId: task.id,
        // ⚠️ kind ของตัวเอง ไม่ใช่ `thread_update` — กระดิ่งกรองด้วย kind นี้
        // (NOTIFICATION_BOXES.bell) เพื่อเอาเฉพาะการมอบหมาย ไม่ลากเธรดงานทั้งเธรดมา
        kind: 'task_assign',
        title: notice.title,
        body: notice.body,
        actorName,
      });
    }
  };
  try {
    after(deliver);
  } catch {
    // นอกบริบท request ของ Next (script/เทสต์) — ยิงตรงแล้วปล่อย error หายไปเอง
    deliver().catch(() => {});
  }
}
