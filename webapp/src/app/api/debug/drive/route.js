// Debug: เช็กการเชื่อมต่อ Google Drive (WIF) ตรง ๆ — คืน error จริงจาก Google.
// เปิด GET /api/debug/drive (ต้องล็อกอิน) เพื่อวินิจฉัยว่าติด env / auth / permission.
// ลบทิ้งได้หลังแก้เสร็จ.
import { getCurrentUser } from '@/lib/authUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const env = {
    STORAGE_BACKEND: process.env.STORAGE_BACKEND || '(unset)',
    GOOGLE_WIF_AUDIENCE: process.env.GOOGLE_WIF_AUDIENCE || '(unset)',
    GOOGLE_SA_EMAIL: process.env.GOOGLE_SA_EMAIL || '(unset)',
    GOOGLE_SHARED_DRIVE_ID: process.env.GOOGLE_SHARED_DRIVE_ID || '(unset)',
    hasVercelOidcToken: !!process.env.VERCEL_OIDC_TOKEN,
  };

  try {
    const { getDrive } = await import('@/lib/drive');
    const drive = getDrive();
    // เข้าถึง Shared Drive (ต้องการ: WIF auth ทำงาน + SA เป็นสมาชิก Shared Drive).
    const res = await drive.drives.get({ driveId: process.env.GOOGLE_SHARED_DRIVE_ID });
    return Response.json({ ok: true, env, sharedDrive: { id: res.data.id, name: res.data.name } });
  } catch (err) {
    return Response.json({
      ok: false,
      env,
      error: err?.message || String(err),
      code: err?.code || null,
      details: err?.response?.data || err?.errors || null,
    });
  }
}
