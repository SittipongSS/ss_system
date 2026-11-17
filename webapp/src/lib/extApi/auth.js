// ── ยืนยันตัวระบบปลายทางของ `/api/ext/v1` (แผน docs/so-external-api-plan.md · มติ 4) ─────────────────────
//
// header `Authorization: Bearer ssk_<keyId>_<secret>` — หนึ่งคีย์ต่อหนึ่งระบบ · เรียกจากเซิร์ฟเวอร์เท่านั้น (ไม่เปิด CORS)
// ⭐ ฐานเก็บแค่ sha256(secret) เป็น hex · เทียบด้วย `crypto.timingSafeEqual` (กันวัดเวลาเดาทีละตัวอักษร)
// ⚠️ ทุกทางที่ไม่ผ่านตอบรูปเดียวกัน (`invalid_key`) — ไม่บอกว่าผิดที่ keyId หรือ secret (กันไล่เดาคีย์ที่มีจริง)
//    ยกเว้นคีย์ถูกแต่ไม่มี scope = 403 `missing_scope` (คนถือคีย์จริงต้องรู้ว่าขาดสิทธิ์อะไร)
// ⚠️ อ่านฐานไม่ได้ ≠ คีย์ผิด — คืน `error` ให้ route ตอบ 500 (ห้ามตอบ 401 ที่พาปลายทางไปหมุนคีย์ทิ้ง)
import { createHash, timingSafeEqual } from 'node:crypto';

export const KEY_PREFIX = 'ssk';
export const SCOPE_SO_READ = 'so:read';
const KEY_RE = /^ssk_([a-z0-9]{8})_([A-Za-z0-9_-]{32,128})$/;
// อัปเดต `lastUsedAt` ไม่เกินนาทีละครั้ง — ปลายทางดึงถี่ได้ ไม่ต้องเขียนทุกคำขอ
const LAST_USED_EVERY_MS = 60 * 1000;

export const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/** แกะ header → `{ keyId, secret }` หรือ null (ไม่มี/รูปผิด) */
export function parseApiKey(authorization) {
  const raw = String(authorization || '').trim();
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  if (!m) return null;
  const key = KEY_RE.exec(m[1]);
  return key ? { keyId: key[1], secret: key[2] } : null;
}

function sameHash(hexA, hexB) {
  if (typeof hexA !== 'string' || typeof hexB !== 'string' || hexA.length !== hexB.length) return false;
  return timingSafeEqual(Buffer.from(hexA, 'hex'), Buffer.from(hexB, 'hex'));
}

/**
 * @returns {Promise<{ client } | { status: 401|403|500, error: string, message: string }>}
 *   `client` = แถว `api_clients` (ไม่มี `keyHash`)
 */
export async function authenticateApiClient(supabase, authorization, { scope = SCOPE_SO_READ, now = new Date() } = {}) {
  const invalid = { status: 401, error: 'invalid_key', message: 'คีย์ไม่ถูกต้อง หรือถูกเพิกถอนแล้ว' };
  const parsed = parseApiKey(authorization);
  if (!parsed) return invalid;
  const { data: row, error } = await supabase
    .from('api_clients')
    .select('id, name, "keyId", "keyHash", scopes, "revokedAt", "lastUsedAt"')
    .eq('keyId', parsed.keyId)
    .maybeSingle();
  if (error) return { status: 500, error: 'server_error', message: `ตรวจคีย์ไม่สำเร็จ: ${error.message}` };
  // keyId ไม่มีจริง: ยังคำนวณ hash ทิ้งหนึ่งรอบ ให้เวลาตอบใกล้เคียงทางที่ keyId มีจริง
  const actual = sha256Hex(parsed.secret);
  if (!row) return invalid;
  if (!sameHash(actual, row.keyHash)) return invalid;
  if (row.revokedAt) return invalid;
  if (!Array.isArray(row.scopes) || !row.scopes.includes(scope)) {
    return { status: 403, error: 'missing_scope', message: `คีย์นี้ไม่มีสิทธิ์ ${scope}` };
  }
  const last = row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0;
  if (!last || now.getTime() - last >= LAST_USED_EVERY_MS) {
    const { error: touchError } = await supabase.from('api_clients')
      .update({ lastUsedAt: now.toISOString() }).eq('id', row.id);
    // เขียนเวลาใช้ล่าสุดพลาด ≠ คีย์ใช้ไม่ได้ — ปล่อยผ่าน แต่ต้องเห็นใน log
    if (touchError) console.error('[ext-api] อัปเดต lastUsedAt ไม่สำเร็จ', row.id, touchError.message);
  }
  const { keyHash: _hash, ...client } = row;
  return { client };
}
