// ── สิทธิ์เปิดเอกสารร่วมบน Drive — ให้ตามสิทธิ์ในระบบ ทีละไฟล์ ─────────────
//
// ⭐ **ทำไมไม่เพิ่มคนเข้า Shared Drive** (มติผู้ใช้ 2026-08-15) — สมาชิก Shared Drive
// เดินดูโครงสร้างโฟลเดอร์ทั้งบริษัทได้ ซึ่งไม่เอา · ให้สิทธิ์ **รายไฟล์** แทน คนจึง
// เห็นเฉพาะไฟล์ที่ตัวเองเคยเปิดผ่านระบบ (โผล่ใน "แชร์กับฉัน") เปิด Drive ตรง ๆ
// แล้วยังไม่เห็นโฟลเดอร์อะไรสักอัน
//
// ⭐ **ทำไมไม่แชร์ทั้งโดเมน** — ง่ายกว่าและไม่มีสิทธิ์ค้างเวลาคนลาออก แต่แปลว่าใคร
// ที่ได้ลิงก์ไปก็เปิดได้ แม้จะไม่มีสิทธิ์เห็นดีลใบนั้นในระบบ · ผู้ใช้เลือกว่า
// **ต้องเห็นใบนั้นในระบบก่อน** จึงต้องเป็นรายคน
//
// ⚠️ **สิทธิ์ที่ให้ไปแล้วไม่หายเอง** — ต้องถอนด้วย `revokeGoogleDocAccess()` ข้างล่าง
// (มีปุ่มในหน้าผู้ใช้) · เคสที่ต้องกดจริงคือ **ย้ายทีมทั้งที่ยังทำงานอยู่** เพราะพอ
// ลาออกแล้วบัญชีถูกปิด permission ที่ค้างก็เป็นบรรทัดตายที่ล็อกอินไม่ได้อยู่แล้ว
//
// ⚠️ server-only + Node runtime — โหลด lib/drive แบบ dynamic
import { isGoogleDoc } from '@/lib/master/googleDocView';

// ชื่อคีย์ใน metadata ที่จำว่าให้สิทธิ์ใครไปแล้ว — กันยิง Drive ซ้ำทุกครั้งที่เปิดหน้า
const GRANTED_KEY = 'accessGranted';

const grantedList = (attachment) => {
  const raw = attachment?.metadata?.[GRANTED_KEY];
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
};

// ให้สิทธิ์ผู้ใช้เปิดเอกสารร่วมของรายการที่ส่งมา — เรียกจาก route ที่ **ผ่านด่านสิทธิ์
// ของ entity แม่มาแล้วเท่านั้น** (ฟังก์ชันนี้ไม่ตรวจสิทธิ์ซ้ำ มันเชื่อผู้เรียก)
//
// `role` = 'writer' เมื่อผู้ใช้แนบ/ลบเอกสารของระเบียนนี้ได้ · 'reader' เมื่อดูได้อย่างเดียว
// คืนจำนวนไฟล์ที่เพิ่งให้สิทธิ์ไป (0 = ทุกใบเคยให้แล้ว หรือไม่มีเอกสารร่วมเลย)
export async function ensureGoogleDocAccess(supabase, attachments, { email, role }) {
  if (!email) return 0;
  const pending = (attachments || []).filter((att) => (
    isGoogleDoc(att) && att.metadata?.googleFileId && !grantedList(att).includes(email)
  ));
  if (!pending.length) return 0;

  // ⚠️ **ห้ามให้ขั้นนี้ทำให้รายการไฟล์แนบล้ม** — มันเป็นของแถม ไม่ใช่เนื้อหาหลักของ
  // คำขอ · Drive ล่ม/token หมดอายุ ต้องได้ลิสต์ครบเหมือนเดิม แค่กรอบพรีวิวว่าง
  // (ซึ่งมีคำอธิบายกำกับในกล่องอยู่แล้ว) ไม่ใช่ทั้งหน้าขึ้น "โหลดรายการไม่สำเร็จ"
  let drive;
  try {
    drive = await import('@/lib/drive');
  } catch (err) {
    console.error('[googleDocAccess] โหลด lib/drive ไม่ได้', err?.message);
    return 0;
  }

  let granted = 0;
  for (const att of pending) {
    try {
      await drive.grantFileRole(att.metadata.googleFileId, email, role);
    } catch (err) {
      // ⚠️ ดังแต่ไม่ล้ม — รายการไฟล์ต้องขึ้นเสมอแม้ Drive จะงอแง · ผลที่ผู้ใช้เห็นคือ
      // กรอบพรีวิวว่าง ซึ่งมีคำอธิบายกำกับอยู่แล้วในตัวกล่อง
      console.error('[googleDocAccess] ให้สิทธิ์ไม่สำเร็จ', att.id, email, err?.message);
      continue;
    }
    granted += 1;
    // จำไว้ในแถว — ครั้งหน้าไม่ต้องยิง Drive อีก
    // ⚠️ อ่าน-แล้ว-เขียนแบบนี้แข่งกันได้ถ้าเปิดสองแท็บพร้อมกัน · ผลแย่สุดคือชื่อหาย
    // ไปหนึ่งรายการแล้วรอบหน้าให้สิทธิ์ซ้ำ (Drive รับซ้ำได้) ไม่ใช่สิทธิ์รั่ว
    const next = [...grantedList(att), email];
    try {
      await supabase
        .from('attachments')
        .update({ metadata: { ...(att.metadata || {}), [GRANTED_KEY]: next } })
        .eq('id', att.id);
    } catch (err) {
      // จำไม่ได้ = รอบหน้าให้สิทธิ์ซ้ำ (Drive รับได้) — ไม่ใช่เหตุให้ทั้งคำขอล้ม
      console.error('[googleDocAccess] จดสิทธิ์ที่ให้ไปแล้วไม่สำเร็จ', att.id, err?.message);
    }
  }
  return granted;
}

// ถอนสิทธิ์ของ **ไฟล์ใบเดียว** ทุกคนที่ระบบเคยให้ — ใช้ตอนแถวไฟล์แนบกำลังจะหายไป
//
// 🐞 **ช่องที่ปิดด้วยฟังก์ชันนี้ (ผลตรวจรอบ 13 · ค-2)** — แถวเอกสารมีชีวิตไม่มี
// `driveFileId` ⇒ `releaseAttachmentFile` เดิมออกตั้งแต่บรรทัดแรกโดยไม่ทำอะไร
// (ถูกแล้วสำหรับ *ตัวไฟล์* — ลบแถว = เลิกผูก ไม่ใช่ลบเอกสาร) · **แต่แถวนั้นคือแถว
// เดียวกับที่ถือ `accessGranted`** ⇒ ลบแถวแล้ว:
//   · เอกสารบน Drive อยู่ต่อ (ตั้งใจ)
//   · permission ที่ระบบให้ไปอยู่ต่อด้วย (ไม่ตั้งใจ)
//   · **บันทึกว่าเคยให้ใครหายไปพร้อมแถว** ⇒ `revokeGoogleDocAccess` หาไฟล์ใบนี้ไม่เจอ
//     อีกเลย เพราะมันค้นจาก `attachments.metadata.accessGranted` ทางเดียว
// ⇒ ปุ่มโล่ในหน้าผู้ใช้ (ทางถอนทางเดียวของระบบ) ใช้กับไฟล์ใบนั้นไม่ได้ตลอดกาล
//
// ⚠️ **best-effort เหมือนการทิ้งไฟล์** — ถอนไม่ได้ต้องไม่บล็อกการลบแถว · แต่ต้องดัง
// เพราะสิทธิ์ที่ค้างหลังแถวหายคือของที่ไม่มีใครตามเก็บได้อีก
//
// คืนจำนวนที่ถอนสำเร็จจริง (ไม่ใช่จำนวนอีเมลที่วนผ่าน)
//
// ⚠️ `deps.drive` มีไว้ให้เทสต์ยัดตัวปลอมเข้ามา — โค้ดจริงไม่เคยส่ง · เส้นนี้เป็น
// "ของที่ถ้าพลาดแล้วไม่มีทางแก้" จึงต้องพิสูจน์ด้วยเทสต์ได้ ไม่ใช่ตรวจด้วยตาอย่างเดียว
export async function revokeAttachmentGrants(att, deps = {}) {
  const fileId = att?.metadata?.googleFileId;
  const emails = grantedList(att);
  if (!fileId || !emails.length) return 0;

  let drive = deps.drive;
  if (!drive) {
    try {
      drive = await import('@/lib/drive');
    } catch (err) {
      console.error('[googleDocAccess] โหลด lib/drive ไม่ได้ตอนถอนสิทธิ์ก่อนลบแถว', err?.message);
      return 0;
    }
  }

  let revoked = 0;
  for (const email of emails) {
    try {
      if (await drive.revokeFileRole(fileId, email)) revoked += 1;
    } catch (err) {
      // ⚠️ ดังให้สุด — แถวกำลังจะหาย ถ้าพลาดตรงนี้คือ **ไม่มีทางถอนอีกแล้ว**
      // ข้อความต้องมี fileId กับอีเมล เพราะนั่นคือทุกอย่างที่เหลือให้ตามเก็บด้วยมือ
      console.error('[googleDocAccess] ⚠️ ถอนสิทธิ์ก่อนลบแถวไม่สำเร็จ — สิทธิ์จะค้างถาวร',
        `file=${fileId}`, `email=${email}`, err?.message);
    }
  }
  return revoked;
}

// ถอนสิทธิ์เอกสารร่วมทั้งหมดของอีเมลหนึ่ง — ใช้ตอนคนย้ายทีมหรือปิดบัญชี
//
// ⭐ หาไฟล์เจอเพราะเราจดไว้ใน `metadata.accessGranted` — ไม่ต้องไล่ถาม Drive ทีละใบ
// ว่าใครมีสิทธิ์อยู่บ้าง (แพงและช้า) · แถวที่จดไว้คือทุกใบที่ระบบเคยให้สิทธิ์คนนี้
//
// ⚠️ ถอนเฉพาะสิทธิ์ที่ **ระบบเป็นคนให้** — ถ้าคนนั้นเป็นสมาชิก Shared Drive หรือมีคน
// ไปแชร์ให้เองใน Google เขายังเปิดได้อยู่ ซึ่งถูกแล้ว มันคนละทางกัน
//
// คืน { files, revoked, failed } — `failed > 0` แปลว่าบางใบยังค้าง ต้องกดซ้ำ
export async function revokeGoogleDocAccess(supabase, email) {
  const result = { files: 0, revoked: 0, failed: 0 };
  if (!email) return result;

  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, metadata')
    .contains('metadata', { [GRANTED_KEY]: [email] });
  if (error) throw error;
  result.files = (rows || []).length;
  if (!result.files) return result;

  const drive = await import('@/lib/drive');
  for (const att of rows) {
    const fileId = att.metadata?.googleFileId;
    try {
      if (fileId) await drive.revokeFileRole(fileId, email);
      result.revoked += 1;
    } catch (err) {
      // ⚠️ ล้มแล้ว **ห้ามลบชื่อออกจาก accessGranted** — ไม่งั้นจะหาไฟล์ใบนี้ไม่เจออีก
      // เลยตอนกดซ้ำ กลายเป็นสิทธิ์ค้างถาวรที่ไม่มีใครรู้
      console.error('[googleDocAccess] ถอนสิทธิ์ไม่สำเร็จ', att.id, email, err?.message);
      result.failed += 1;
      continue;
    }
    const next = grantedList(att).filter((x) => x !== email);
    try {
      await supabase
        .from('attachments')
        .update({ metadata: { ...(att.metadata || {}), [GRANTED_KEY]: next } })
        .eq('id', att.id);
    } catch (err) {
      console.error('[googleDocAccess] ล้างรายชื่อที่ถอนแล้วไม่สำเร็จ', att.id, err?.message);
    }
  }
  return result;
}
