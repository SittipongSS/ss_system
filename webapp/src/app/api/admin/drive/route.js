// ── API เครื่องมือดูแลที่เก็บไฟล์ (Google Drive) — admin เท่านั้น ────────────
// ใช้โดยหน้า /settings/storage · งานทั้งหมดต้องรันบน Vercel (WIF ออก token ที่นั่น)
//
// GET  ?action=health[&write=1] — ตรวจการเชื่อมต่อ (write=1 = ทดสอบเขียนไฟล์จริง)
// GET  ?action=audit            — ตรวจว่าไฟล์ที่ระบบอ้างถึงยังอยู่บน Drive จริงไหม
// GET  ?action=plan             — แผนการจัดโครงโฟลเดอร์ (อ่าน DB อย่างเดียว ไม่แตะ Drive)
// POST { action:'restructure', offset, limit } — ย้ายจริงทีละชุด
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { driveHealth, auditDriveFiles, planRestructure, runRestructure } from '@/lib/driveMaintenance';

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
    if (action === 'plan') return Response.json(await planRestructure());
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
  if (body.action !== 'restructure') {
    return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
  }
  try {
    const result = await runRestructure({
      offset: Number(body.offset) || 0,
      limit: Math.min(Number(body.limit) || 40, 100),
    });
    // บันทึกไว้ว่าใครสั่งย้ายเมื่อไร — เป็นการเปลี่ยนโครงของจริงบน Drive
    await recordAudit({
      user,
      action: 'update',
      entityType: 'drive_restructure',
      entityId: `offset-${Number(body.offset) || 0}`,
      after: { moved: result.moved, skipped: result.skipped, errors: result.errors.length },
      request,
    });
    return Response.json(result);
  } catch (err) {
    console.error('[admin/drive] restructure failed', err);
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
