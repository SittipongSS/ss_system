// ── เทสต์ต้องไม่ถือคีย์ฐานข้อมูลจริง ─────────────────────────────────────────
//
// 🐞 2026-10-09: `audit_logs` บน production มีแถวปลอม 1,523 แถว (ผู้ใช้ "RD Staff" รหัส U1 ·
// SCT-1/FML-1) สะสมตั้งแต่ 26/08 — เทสต์ของ `registryPriceRoute` เรียก handler ตัวจริง ซึ่งเขียน
// audit ผ่าน `getSupabaseAdmin()` · CI ตั้ง SUPABASE_SERVICE_ROLE_KEY ไว้ทั้ง job (ให้ด่าน
// check:columns/refs/teams) ⇒ `npm test` ถือคีย์ production ไปด้วย และไม่มีเทสต์ไหนแดง
// เพราะ `recordAudit` ไม่ throw
//
// ⚠️ รูนี้ไม่ได้มีแค่ audit — เทสต์ไหนก็ตามที่หลุดไปถึง client ตัวจริง (insert/update/delete)
// จะเขียน production ได้เหมือนกัน ⇒ ปิดที่ต้นทาง: **โปรเซสเทสต์ไม่มีคีย์ให้ใช้เลย**
// เทสต์ที่ต้องการ client ต้องส่งตัวจำลองเข้าไปเอง (หรือตั้ง env ชี้ 127.0.0.1 ภายในเทสต์)
//
// ⚠️ ถอดเฉพาะตอนรันเทสต์ — `test-loader.mjs` ถูกใช้กับสคริปต์ที่ต้องต่อฐานจริงด้วย
// (`npm run check:taxid` · สคริปต์ backfill) ซึ่งต้องได้คีย์ตามเดิม
export const DATABASE_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

/**
 * โปรเซสนี้กำลังรันเทสต์ไหม — ตัวแม่ของ `node --test` หรือโปรเซสที่รันไฟล์เทสต์ (ลูกที่ตัวแม่แตกออกมา · รันตรง ๆ)
 *
 * ⚠️ **ห้ามดูจาก env `NODE_TEST_CONTEXT`** — มันตกทอดไปถึงสคริปต์ที่เทสต์ spawn ต่ออีกชั้น
 * (`linePackParity.test.mjs` รัน `scripts/check-line-pack-parity.mjs` ผ่าน loader ตัวนี้ พร้อมคีย์ปลอมที่ชี้ 127.0.0.1)
 * ⇒ คีย์ที่เทสต์ตั้งให้เองโดยเจตนาถูกถอด สคริปต์พังทั้งที่ไม่ได้ต่อฐานจริง · ตัวชี้ขาดคือ "ไฟล์ที่รันเป็นไฟล์เทสต์"
 */
export function isTestRun({ execArgv = [], argv = [] } = {}) {
  return execArgv.includes('--test') || /\.test\.[mc]?js$/.test(String(argv[1] || ''));
}

// ป้ายที่ทิ้งไว้ใน env หลังถอด — `getSupabaseAdmin()` อ่านเพื่อบอกเหตุที่ถูกต้อง ("เทสต์ถอดคีย์ออกเอง")
// แทนข้อความ "ยังไม่ได้ตั้ง env" ที่พาคนไปไล่ผิดทาง · ไม่พิมพ์แจ้งตอนถอด: loader รันในโปรเซสของ
// ไฟล์เทสต์ทุกไฟล์ (ตัวแม่ของ `node --test` ไม่รัน --import) ⇒ ได้ข้อความซ้ำหลายร้อยบรรทัดต่อรอบ
export const SCRUBBED_FLAG = 'SS_TEST_DATABASE_KEYS_SCRUBBED';

/** ถอดคีย์ฐานข้อมูลออกจาก env ของโปรเซสเทสต์ — คืนชื่อคีย์ที่ถอด (ว่าง = ไม่ใช่เทสต์ หรือไม่มีคีย์อยู่แล้ว) */
export function scrubDatabaseKeys(proc = process) {
  if (!isTestRun(proc)) return [];
  const removed = DATABASE_KEYS.filter((key) => proc.env[key] != null);
  for (const key of removed) delete proc.env[key];
  if (removed.length) proc.env[SCRUBBED_FLAG] = removed.join(',');
  return removed;
}
