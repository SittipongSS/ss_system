import { createHash, randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { recordAudit } from '@/lib/audit';
import {
  emptyUserSignatureState,
  loadUserSignatureAdmin,
  signatureRpcError,
  UserSignatureError,
} from '@/lib/admin/userSignatures';
import {
  inspectSignaturePng,
  normalizeSignatureRevokeReason,
  SIGNATURE_BUCKET,
  SIGNATURE_MIME,
  signatureStoragePrefix,
} from '@/lib/signatures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function responseError(error) {
  const status = error instanceof UserSignatureError ? error.status : 500;
  const message = error instanceof UserSignatureError
    ? error.message
    : 'จัดการลายเซ็นไม่สำเร็จ';
  return Response.json({ error: message }, { status });
}

function localVersion(user, metadata, id = `local-signature-version-${randomUUID()}`) {
  const createdAt = new Date().toISOString();
  return {
    id,
    versionNumber: 1,
    ...metadata,
    sha256: null,
    createdByName: user.name,
    createdAt,
    state: 'active',
    previewUrl: null,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (user.devBypass) return Response.json(emptyUserSignatureState({ localOnly: true }));

  try {
    return Response.json(await loadUserSignatureAdmin(getSupabaseAdmin(), user.id));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'กรุณาเลือกไฟล์ PNG' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const inspected = inspectSignaturePng(buffer);
  if (inspected.error) return Response.json({ error: inspected.error }, { status: 400 });

  const expectedActiveVersionId = String(formData.get('expectedActiveVersionId') || '').trim() || null;
  if (user.devBypass) {
    const version = localVersion(user, inspected.value);
    return Response.json(emptyUserSignatureState({
      active: version,
      versions: [version],
      events: [{
        id: `local-signature-event-${randomUUID()}`,
        action: expectedActiveVersionId ? 'replace' : 'upload',
        versionId: version.id,
        previousVersionId: expectedActiveVersionId,
        reason: null,
        actorName: user.name,
        createdAt: version.createdAt,
      }],
      localOnly: true,
    }), { status: 201 });
  }

  const supabase = getSupabaseAdmin();
  const signatureId = `signature-${randomUUID()}`;
  const versionId = `signature-version-${randomUUID()}`;
  const eventId = `signature-event-${randomUUID()}`;
  const storagePath = `${signatureStoragePrefix(user.id)}${randomUUID()}.png`;
  const sha256 = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;

  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: SIGNATURE_MIME,
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) return responseError(new UserSignatureError('อัปโหลดไฟล์ลายเซ็นไม่สำเร็จ', 500));

  const { data, error: rpcError } = await supabase.rpc('publish_user_signature_version_atomic', {
    p_signature_id: signatureId,
    p_version_id: versionId,
    p_event_id: eventId,
    p_user_id: user.id,
    p_expected_active_version_id: expectedActiveVersionId,
    p_storage_bucket: SIGNATURE_BUCKET,
    p_storage_path: storagePath,
    p_mime_type: SIGNATURE_MIME,
    p_size_bytes: inspected.value.sizeBytes,
    p_sha256: sha256,
    p_width: inspected.value.width,
    p_height: inspected.value.height,
    p_actor_id: user.id,
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
    p_actor_team: user.team || null,
  });

  if (rpcError) {
    await supabase.storage.from(SIGNATURE_BUCKET).remove([storagePath]);
    return responseError(signatureRpcError(rpcError));
  }

  await recordAudit({
    user,
    action: data?.event?.action === 'replace' ? 'update' : 'create',
    entityType: 'user_signature',
    entityId: data?.root?.id || signatureId,
    before: expectedActiveVersionId ? { activeVersionId: expectedActiveVersionId } : null,
    after: {
      activeVersionId: data?.version?.id || versionId,
      versionNumber: data?.version?.versionNumber,
      mimeType: SIGNATURE_MIME,
      sizeBytes: inspected.value.sizeBytes,
      width: inspected.value.width,
      height: inspected.value.height,
    },
    summary: `${expectedActiveVersionId ? 'เปลี่ยน' : 'เพิ่ม'}ลายเซ็นอิเล็กทรอนิกส์ของตนเอง`,
    request,
  });

  try {
    return Response.json(await loadUserSignatureAdmin(supabase, user.id), { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const expectedActiveVersionId = String(body.expectedActiveVersionId || '').trim();
  const normalizedReason = normalizeSignatureRevokeReason(body.reason);
  if (!expectedActiveVersionId) {
    return Response.json({ error: 'ไม่พบลายเซ็นที่ต้องการยกเลิก' }, { status: 400 });
  }
  if (normalizedReason.error) return Response.json({ error: normalizedReason.error }, { status: 400 });

  if (user.devBypass) {
    return Response.json(emptyUserSignatureState({ localOnly: true }));
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('revoke_user_signature_atomic', {
    p_event_id: `signature-event-${randomUUID()}`,
    p_user_id: user.id,
    p_expected_active_version_id: expectedActiveVersionId,
    p_reason: normalizedReason.value,
    p_actor_id: user.id,
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
    p_actor_team: user.team || null,
  });
  if (error) return responseError(signatureRpcError(error));

  await recordAudit({
    user,
    action: 'update',
    entityType: 'user_signature',
    entityId: data?.root?.id || user.id,
    before: { activeVersionId: expectedActiveVersionId },
    after: { activeVersionId: null, reason: normalizedReason.value },
    summary: 'ยกเลิกลายเซ็นอิเล็กทรอนิกส์ของตนเอง',
    request,
  });

  try {
    return Response.json(await loadUserSignatureAdmin(supabase, user.id));
  } catch (loadError) {
    return responseError(loadError);
  }
}
