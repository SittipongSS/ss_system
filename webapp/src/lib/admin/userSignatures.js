import {
  SIGNATURE_BUCKET,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_MAX_HEIGHT,
  SIGNATURE_MAX_WIDTH,
  SIGNATURE_MIN_HEIGHT,
  SIGNATURE_MIN_WIDTH,
  signatureVersionState,
} from '@/lib/signatures';

export class UserSignatureError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'UserSignatureError';
    this.status = status;
  }
}

export const emptyUserSignatureState = (extra = {}) => ({
  active: null,
  versions: [],
  events: [],
  limits: {
    bucket: SIGNATURE_BUCKET,
    maxBytes: SIGNATURE_MAX_BYTES,
    minWidth: SIGNATURE_MIN_WIDTH,
    maxWidth: SIGNATURE_MAX_WIDTH,
    minHeight: SIGNATURE_MIN_HEIGHT,
    maxHeight: SIGNATURE_MAX_HEIGHT,
    acceptedMime: 'image/png',
  },
  ...extra,
});

function clientVersion(version, activeVersionId, events) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    mimeType: version.mimeType,
    sizeBytes: Number(version.sizeBytes) || 0,
    sha256: version.sha256,
    width: version.width,
    height: version.height,
    createdByName: version.createdByName,
    createdAt: version.createdAt,
    state: signatureVersionState(version.id, activeVersionId, events),
    previewUrl: `/api/account/signature/${encodeURIComponent(version.id)}/file`,
  };
}

function clientEvent(event) {
  return {
    id: event.id,
    action: event.action,
    versionId: event.versionId,
    previousVersionId: event.previousVersionId,
    reason: event.reason,
    actorName: event.actorName,
    createdAt: event.createdAt,
  };
}

export async function loadUserSignatureAdmin(supabase, userId) {
  const { data: root, error: rootError } = await supabase
    .from('user_signatures')
    .select('*')
    .eq('userId', userId)
    .maybeSingle();
  if (rootError) throw new UserSignatureError('โหลดข้อมูลลายเซ็นไม่สำเร็จ');
  if (!root) return emptyUserSignatureState();

  const [{ data: versions, error: versionError }, { data: events, error: eventError }] = await Promise.all([
    supabase
      .from('user_signature_versions')
      .select('*')
      .eq('signatureId', root.id)
      .order('versionNumber', { ascending: false }),
    supabase
      .from('user_signature_events')
      .select('*')
      .eq('signatureId', root.id)
      .order('createdAt', { ascending: false }),
  ]);
  if (versionError) throw new UserSignatureError('โหลดข้อมูลลายเซ็นไม่สำเร็จ');
  if (eventError) throw new UserSignatureError('โหลดข้อมูลลายเซ็นไม่สำเร็จ');

  const safeEvents = (events || []).map(clientEvent);
  const safeVersions = (versions || []).map((version) => clientVersion(version, root.activeVersionId, events || []));
  return emptyUserSignatureState({
    active: safeVersions.find((version) => version.id === root.activeVersionId) || null,
    versions: safeVersions,
    events: safeEvents,
    updatedAt: root.updatedAt,
  });
}

export function signatureRpcError(error) {
  const message = error?.message || String(error || '');
  if (message.includes('user_signature_active_stale')) {
    return new UserSignatureError('ลายเซ็นถูกเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409);
  }
  if (message.includes('user_signature_active_missing')) {
    return new UserSignatureError('ไม่มีลายเซ็นที่ใช้งานอยู่', 409);
  }
  if (message.includes('user_signature_revoke_reason_required')) {
    return new UserSignatureError('กรุณาระบุเหตุผลที่ยกเลิกลายเซ็น', 400);
  }
  if (message.includes('user_signature_asset_invalid') || message.includes('user_signature_storage_path_invalid')) {
    return new UserSignatureError('ข้อมูลไฟล์ลายเซ็นไม่ถูกต้อง', 400);
  }
  if (message.includes('user_signature_owner_mismatch')) {
    return new UserSignatureError('forbidden', 403);
  }
  return new UserSignatureError('จัดการลายเซ็นไม่สำเร็จ', 500);
}
