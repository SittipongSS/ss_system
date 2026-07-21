// Server-only access layer for the versioned holiday calendar (mig 0132).
// Mirrors lib/admin/organizationSettings.js: draft writes and lifecycle
// transitions go through service-role + atomic RPCs only.
import 'server-only';
import { randomUUID } from 'node:crypto';

export class HolidayCalendarError extends Error {
  constructor(message, status = 500, code = 'holiday_calendar_error') {
    super(message);
    this.name = 'HolidayCalendarError';
    this.status = status;
    this.code = code;
  }
}

function mappedError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['holiday_calendar_draft_exists', 'มีฉบับร่างที่กำลังแก้ไขอยู่แล้ว', 409],
    ['holiday_calendar_draft_stale', 'ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409],
    ['holiday_calendar_version_not_found', 'ไม่พบเวอร์ชันปฏิทินวันหยุด', 404],
    ['holiday_calendar_version_not_draft', 'เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409],
    ['holiday_calendar_change_note_required', 'กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่', 400],
    ['holiday_calendar_published_missing', 'ไม่พบปฏิทินวันหยุดเวอร์ชันที่เผยแพร่ (รัน migration 0132 หรือยัง?)', 409],
    ['holiday_calendar_root_missing', 'ไม่พบข้อมูลตั้งต้นของปฏิทินวันหยุด (รัน migration 0132 หรือยัง?)', 409],
  ];
  const match = mappings.find(([code]) => raw.includes(code));
  if (match) return new HolidayCalendarError(match[1], match[2], match[0]);
  return new HolidayCalendarError(raw || 'จัดการปฏิทินวันหยุดไม่สำเร็จ');
}

function assertExpectedUpdatedAt(value) {
  const text = String(value || '');
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new HolidayCalendarError('expectedUpdatedAt ไม่ถูกต้อง', 400, 'expected_updated_at_invalid');
  }
  return text;
}

export async function loadHolidayCalendarAdmin(supabase) {
  const [rootResult, versionsResult] = await Promise.all([
    supabase.from('holiday_calendars').select('id,publishedVersionId,updatedAt').eq('id', 'primary').maybeSingle(),
    supabase.from('holiday_calendar_versions').select('*').eq('calendarId', 'primary').order('versionNumber', { ascending: false }),
  ]);
  if (rootResult.error) throw mappedError(rootResult.error);
  if (versionsResult.error) throw mappedError(versionsResult.error);
  if (!rootResult.data) {
    throw new HolidayCalendarError('ไม่พบข้อมูลตั้งต้นของปฏิทินวันหยุด (รัน migration 0132 หรือยัง?)', 500, 'root_missing');
  }

  const versions = versionsResult.data || [];
  return {
    published: versions.find((row) => row.id === rootResult.data.publishedVersionId) || null,
    draft: versions.find((row) => row.status === 'draft') || null,
    versions,
  };
}

export async function createHolidayCalendarDraft(supabase, user) {
  const { data, error } = await supabase.rpc('create_holiday_calendar_draft', {
    p_draft_id: `holiday-calendar-${randomUUID()}`,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function updateHolidayCalendarDraft(supabase, id, input, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data: before, error: beforeError } = await supabase
    .from('holiday_calendar_versions')
    .select('*')
    .eq('id', id)
    .eq('calendarId', 'primary')
    .maybeSingle();
  if (beforeError) throw mappedError(beforeError);
  if (!before) throw new HolidayCalendarError('ไม่พบเวอร์ชันปฏิทินวันหยุด', 404, 'version_not_found');
  if (before.status !== 'draft') throw new HolidayCalendarError('เวอร์ชันนี้ไม่ใช่ฉบับร่างแล้ว', 409, 'version_not_draft');

  const now = new Date().toISOString();
  const { data: after, error } = await supabase
    .from('holiday_calendar_versions')
    .update({
      ...input,
      updatedById: String(user.id),
      updatedByName: user.name || null,
      updatedByRole: user.role || null,
      updatedAt: now,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .eq('updatedAt', expected)
    .select('*')
    .maybeSingle();
  if (error) throw mappedError(error);
  if (!after) throw new HolidayCalendarError('ฉบับร่างถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุด', 409, 'draft_stale');
  return { before, after };
}

export async function publishHolidayCalendarDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('publish_holiday_calendar_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}

export async function archiveHolidayCalendarDraft(supabase, id, expectedUpdatedAt, user) {
  const expected = assertExpectedUpdatedAt(expectedUpdatedAt);
  const { data, error } = await supabase.rpc('archive_holiday_calendar_draft_atomic', {
    p_version_id: id,
    p_expected_updated_at: expected,
    p_actor_id: String(user.id),
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
  });
  if (error) throw mappedError(error);
  return data;
}
