// ── API เครื่องมือดูแลที่เก็บไฟล์ (Google Drive) — admin เท่านั้น ────────────
// ใช้โดยหน้า /settings/storage · งานทั้งหมดต้องรันบน Vercel (WIF ออก token ที่นั่น)
//
// GET  ?action=health[&write=1] — ตรวจการเชื่อมต่อ (write=1 = ทดสอบเขียนไฟล์จริง)
// GET  ?action=audit            — ตรวจว่าไฟล์ที่ระบบอ้างถึงยังอยู่บน Drive จริงไหม
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import {
  driveHealth, auditDriveFiles, auditOrphanDriveItems, trashOrphanDriveItems,
  auditOrphanAttachmentRows, purgeOrphanAttachmentRows,
} from '@/lib/driveMaintenance';

// googleapis + OIDC token ต้อง Node runtime · การย้ายทีละชุดกินเวลาได้ถึงเพดาน
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const guard = async () => {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!can(user.role, 'users:manage')) {
    return { error: Response.json({ error: 'เครื่องมือนี้สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 }) };
  }
  return { user };
};

export async function GET(request) {
  const { user, error } = await guard();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'health';
  try {
    if (action === 'health') {
      return Response.json(await driveHealth({ writeTest: searchParams.get('write') === '1' }));
    }
    if (action === 'audit') return Response.json(await auditDriveFiles());
    if (action === 'orphans') return Response.json(await auditOrphanDriveItems());
    if (action === 'orphan-rows') return Response.json(await auditOrphanAttachmentRows());
    return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
  } catch (err) {
    console.error(`[admin/drive] ${action} failed`, err);
    // ส่งข้อความจริงกลับไป — หน้านี้มีไว้ "หาสาเหตุ" ข้อความกำกวมทำให้ไร้ประโยชน์
    // (ผู้เรียกเป็น admin แล้ว จึงไม่มีข้อมูลรั่วให้คนนอก)
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, error } = await guard();
  if (error) return error;

  const body = await request.json().catch(() => ({}));

  // ทิ้งของกำพร้าลงถังขยะ — รับ id ที่ผู้ใช้เห็นตอนกด แล้ว server คำนวณซ้ำเองก่อนทิ้ง
  if (body.action === 'trash-orphans') {
    if (!Array.isArray(body.ids) || !body.ids.length) {
      return Response.json({ error: 'ไม่มีรายการที่จะทิ้ง' }, { status: 400 });
    }
    try {
      const result = await trashOrphanDriveItems(body.ids);
      await recordAudit({
        user,
        action: 'delete',
        entityType: 'drive_orphan_cleanup',
        entityId: `trashed-${result.trashed}`,
        after: { requested: result.requested, trashed: result.trashed, skipped: result.skipped },
        request,
      });
      return Response.json(result);
    } catch (err) {
      console.error('[admin/drive] trash-orphans failed', err);
      return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
  }

  // ลบแถวไฟล์แนบที่ระเบียนแม่ถูกลบไปแล้ว (ไม่แตะไฟล์บน Drive)
  if (body.action === 'purge-orphan-rows') {
    try {
      const result = await purgeOrphanAttachmentRows();
      /* ⚠️ **บันทึกตัวตนของแถวที่ลบ ไม่ใช่แค่จำนวน** — ไฟล์บน Drive ยังอยู่ต่อ (ตั้งใจ)
         แต่หลังลบแถวแล้วไม่มีอะไรบอกได้อีกว่าไฟล์ใบไหนเคยเป็นของระเบียนใด · บันทึกนี้
         คือทางเดียวที่จะตามกลับได้ว่า "ไฟล์กำพร้าที่เห็นในหัวข้อถัดไปมาจากไหน" */
      await recordAudit({
        user,
        action: 'delete',
        entityType: 'attachment_orphan_rows',
        entityId: `deleted-${result.deleted}`,
        after: result,
        request,
      });
      return Response.json(result);
    } catch (err) {
      console.error('[admin/drive] purge-orphan-rows failed', err);
      return Response.json({ error: String(err?.message || err) }, { status: 500 });
    }
  }

  return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
}
