// ── ออก/เพิกถอนคีย์ของ API ภายนอก `/api/ext/v1` (docs/so-external-api-plan.md) ──────────────────────────────
//
// ⚠️ **เขียนฐานจริง** (ฐาน dev = ฐาน prod) — รันเมื่อเจ้าของสั่งเท่านั้น
// ⚠️ secret พิมพ์บนจอ **ครั้งเดียว** — ฐานเก็บแค่ sha256 · หายแล้วกู้ไม่ได้ ต้องออกใหม่แล้วเพิกถอนตัวเก่า
// ⚠️ ไม่ใช้ SQL Editor ออกคีย์ — ผลลัพธ์ค้างในประวัติ query ได้
//
// ใช้ (รันจากโฟลเดอร์ webapp):
//   node --env-file=.env.local --import ./scripts/test-loader.mjs scripts/issue-api-key.mjs --name "ทีม X (คุณ Y)"
//   node --env-file=.env.local --import ./scripts/test-loader.mjs scripts/issue-api-key.mjs --revoke <keyId>
//   node --env-file=.env.local --import ./scripts/test-loader.mjs scripts/issue-api-key.mjs --list
import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KEY_PREFIX, SCOPE_SO_READ, parseApiKey, sha256Hex } from '@/lib/extApi/auth';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomKeyId(bytes = randomBytes(8)) {
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}
export function newApiKey() {
  const keyId = randomKeyId();
  const secret = randomBytes(30).toString('base64url'); // 40 ตัวอักษร
  return { keyId, secret, token: `${KEY_PREFIX}_${keyId}_${secret}`, keyHash: sha256Hex(secret) };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const actor = `script:issue-api-key:${process.env.USER || 'unknown'}`;
  if (process.argv.includes('--list')) {
    const { data, error } = await supabase.from('api_clients')
      .select('id, name, "keyId", scopes, "createdAt", "revokedAt", "lastUsedAt"').order('createdAt', { ascending: true }).limit(200);
    if (error) throw error;
    console.table(data);
    return;
  }
  const revoke = arg('--revoke');
  if (revoke) {
    const { data, error } = await supabase.from('api_clients')
      .update({ revokedAt: new Date().toISOString(), revokedBy: actor })
      .eq('keyId', revoke).is('revokedAt', null).select('id, name, "keyId"');
    if (error) throw error;
    console.log(data?.length ? `เพิกถอนแล้ว: ${data[0].name} (${data[0].keyId})` : `ไม่พบคีย์ ${revoke} ที่ยังใช้งานอยู่`);
    return;
  }
  const name = (arg('--name') || '').trim();
  if (!name) throw new Error('ต้องระบุ --name "<ชื่อทีม/ระบบ (คนดูแล)>"');
  const { keyId, token, keyHash } = newApiKey();
  if (!parseApiKey(`Bearer ${token}`)) throw new Error('คีย์ที่สุ่มได้ผิดรูป — ลองใหม่');
  const { error } = await supabase.from('api_clients').insert({
    id: `APC-${randomKeyId(randomBytes(12))}`, name, keyId, keyHash, scopes: [SCOPE_SO_READ], createdBy: actor,
  });
  if (error) throw error;
  console.log(`ออกคีย์ให้ ${name} แล้ว · keyId ${keyId}`);
  console.log('คีย์ (แสดงครั้งเดียว — ส่งให้ทีมปลายทางทางช่องที่ปลอดภัย ห้ามวางในแชตกลุ่ม):');
  console.log(token);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || error); process.exit(1); });
}
