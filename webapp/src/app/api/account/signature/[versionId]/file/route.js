import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isSignatureStoragePathForUser, SIGNATURE_BUCKET, SIGNATURE_MIME } from '@/lib/signatures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (user.devBypass) return Response.json({ error: 'ไม่มีไฟล์ลายเซ็นใน Local mode' }, { status: 404 });

  const { versionId } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: root, error: rootError } = await supabase
    .from('user_signatures')
    .select('id')
    .eq('userId', user.id)
    .maybeSingle();
  if (rootError) return Response.json({ error: 'โหลดไฟล์ลายเซ็นไม่สำเร็จ' }, { status: 500 });
  if (!root) return Response.json({ error: 'ไม่พบลายเซ็น' }, { status: 404 });

  const { data: version, error: versionError } = await supabase
    .from('user_signature_versions')
    .select('id, storageBucket, storagePath, mimeType, versionNumber')
    .eq('id', versionId)
    .eq('signatureId', root.id)
    .maybeSingle();
  if (versionError) return Response.json({ error: 'โหลดไฟล์ลายเซ็นไม่สำเร็จ' }, { status: 500 });
  if (!version || version.storageBucket !== SIGNATURE_BUCKET || version.mimeType !== SIGNATURE_MIME) {
    return Response.json({ error: 'ไม่พบไฟล์ลายเซ็น' }, { status: 404 });
  }

  if (!isSignatureStoragePathForUser(user.id, version.storagePath)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(version.storagePath);
  if (error || !data) return Response.json({ error: 'โหลดไฟล์ลายเซ็นไม่สำเร็จ' }, { status: 500 });

  return new Response(data, {
    headers: {
      'Content-Type': SIGNATURE_MIME,
      'Content-Disposition': `inline; filename="signature-v${version.versionNumber}.png"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
    },
  });
}
