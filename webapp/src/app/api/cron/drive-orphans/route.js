// ── กวาดหาไฟล์กำพร้าบน Drive สัปดาห์ละครั้ง แล้วบอกแอดมิน ─────────────────
//
// 🐞 ที่มา (PR #1394): ฟอร์มสร้างงานอัปไบต์ขึ้น Drive แล้วไม่ได้บันทึกแถวใน
// `attachments` ⇒ ไฟล์อยู่ครบบน Drive แต่ไม่มีอะไรในระบบชี้ถึง ผู้ใช้เห็นว่า
// "แนบแล้วหาย" · เงียบอยู่ 17/07 → 24/08/69 เพราะ **ไม่มีใครนับไฟล์กำพร้าเป็นประจำ**
// เครื่องมือตรวจมีอยู่แล้ว (หน้าตั้งค่า → ที่เก็บไฟล์) แต่ต้องมีคนเปิดหน้าถึงจะเห็น
//
// ⭐ ตัวนี้คือ **ตาข่ายชั้นสุดท้าย** — ชั้นก่อนหน้า (ทะเบียนผู้เรียก `uploadFileBytes`
// + ชื่อฟังก์ชันที่บอกความจริง) กันของใหม่ไม่ให้พลาดแบบเดิม แต่มองไม่เห็นของที่
// หลุดไปแล้วหรือพลาดด้วยเหตุอื่น · ตัวนี้เปลี่ยน "ไฟล์หายเงียบ" เป็นตัวเลขที่มีคนเห็น
//
// ⚠️ **อ่านอย่างเดียว ไม่ทิ้งอะไรทั้งสิ้น** — ไฟล์กำพร้าคือไฟล์ที่ผู้ใช้อาจกำลังตามหา
// อยู่ การทิ้งอัตโนมัติจะกลายเป็นตัวลบหลักฐานของบั๊กที่ยังไม่มีใครรู้ · การทิ้งยังอยู่
// ที่หน้าตั้งค่า → ที่เก็บไฟล์ ซึ่งคนกดต้องเห็นรายการก่อนเสมอ
//
// เรียกโดย Vercel Cron (ดู vercel.json) ด้วย Authorization: Bearer CRON_SECRET
// หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ — กติกาเดียวกับ cron ตัวอื่น
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { businessDate } from '@/lib/businessDate';
import { auditOrphanDriveItems } from '@/lib/driveMaintenance';
import { driveEnvStatus } from '@/lib/drive';
import { notifyUsers } from '@/lib/notifications';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';
// เดินไล่ทั้ง Shared Drive แล้วรวบผู้อ้างอิงจากหลายตาราง — นานกว่า cron ตัวอื่นมาก
export const maxDuration = 300;

/* ต่ำกว่านี้ถือว่าเป็นเศษปกติ (อัปแล้วยกเลิกกลางคัน · rollback ที่ลบไฟล์ไม่ทัน)
   ไม่ใช่สัญญาณว่ามีอะไรพัง — ปลุกทุกใบจะกลายเป็นวอลเปเปอร์ที่ไม่มีใครอ่าน
   ⚠️ ปรับตัวเลขนี้ได้ แต่อย่าปรับเป็น 0: "แจ้งทุกครั้ง" = "ไม่มีใครแจ้ง" ภายในเดือนเดียว */
const ORPHAN_FILE_ALERT = 3;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // ไม่มี Drive = ไม่มีอะไรให้กวาด · ตอบ 200 เพื่อไม่ให้ cron ขึ้นแดงทุกสัปดาห์
  // บน environment ที่ตั้งใจไม่ต่อ Drive
  const env = driveEnvStatus();
  if (!env.ok) return Response.json({ skipped: 'drive ยังไม่ได้ตั้งค่า', missing: env.missing });

  let report;
  try {
    report = await auditOrphanDriveItems();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  // นับเฉพาะ **ไฟล์** — โฟลเดอร์ว่างที่ไม่มีใครอ้างเป็นเรื่องบ้านรก ไม่ใช่ของหาย
  const files = (report.orphans || []).filter((o) => o.kind === 'ไฟล์');
  const bytes = files.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);
  const summary = { scanned: report.scanned, orphanFiles: files.length, orphanBytes: bytes };

  if (files.length < ORPHAN_FILE_ALERT) return Response.json({ ...summary, notified: 0 });

  const directory = await loadUserDirectory(getSupabaseAdmin());
  const admins = [...directory.values()].filter((u) => u.role === 'admin' && !u.disabled);
  if (!admins.length) return Response.json({ ...summary, notified: 0, note: 'ไม่มีแอดมินที่ยังใช้งานอยู่' });

  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const newest = files.slice(0, 3).map((o) => o.name).join(' · ');

  const { sent } = await notifyUsers(getSupabaseAdmin(), {
    userIds: admins.map((u) => u.id),
    // ⚠️ ไม่ใช่ entity จริงในระบบ — เป็นหัวข้อของรายงานประจำ · href จึงต้องส่งเอง
    // ไม่งั้น notificationHref เดาปลายทางไม่ได้แล้วได้ลิงก์ตาย
    entityType: 'drive_orphans',
    entityId: 'weekly',
    kind: 'drive_orphans',
    title: `ไฟล์บน Drive ที่ไม่มีใครอ้างถึง ${files.length} ไฟล์ (${mb} MB)`,
    body: `กวาดทั้งหมด ${report.scanned} รายการ · ตัวอย่าง: ${newest}`
      + ' — เปิดดูรายการเต็มที่ ตั้งค่า → ที่เก็บไฟล์ ก่อนตัดสินใจว่าอันไหนคือไฟล์ที่ผู้ใช้ตามหาอยู่',
    href: '/settings/storage',
    // สัปดาห์ละใบ — กดยิงซ้ำเองวันเดียวกันไม่เกิดแถวซ้ำ
    dedupeKey: `drive-orphans-${businessDate()}`,
  });

  return Response.json({ ...summary, notified: sent });
}
