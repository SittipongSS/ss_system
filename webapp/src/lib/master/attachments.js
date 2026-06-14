// ── Master Data: attachments ──────────────────────────────────────────
// Shared-core access layer for the polymorphic attachments table (migration
// 0028). เอกสารแนบของ customer/product (เฟส A) อ่าน/เขียนผ่านโมดูลนี้.
//
// Server-only: ใช้ service-role admin client (bypass RLS). ห้าม import ใน client.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// เอกสารทั้งหมดของ entity หนึ่งๆ (ใหม่สุดก่อน).
export async function listAttachments(entityType, entityId) {
  if (!entityType || !entityId) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entityType', entityType)
    .eq('entityId', entityId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

// เอกสารแนบรายตัว (หรือ null).
export async function getAttachment(id) {
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
