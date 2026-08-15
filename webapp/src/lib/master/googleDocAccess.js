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
// ⚠️ **หนี้ที่ยังไม่ได้ใช้คืน: สิทธิ์ที่ให้ไปแล้วไม่หายเอง** — คนย้ายทีม/ลาออก ระบบ
// ตัดสิทธิ์ในแอปได้ทันที แต่ permission บนไฟล์ยังค้าง เขายังเปิดลิงก์เก่าได้
// ต้องมีตัวถอนคืนตอนปิดบัญชี ซึ่ง **ยังไม่ได้ทำในรอบนี้**
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
