// ── ผู้ใช้สมมติตอน dev ที่ยังไม่ได้ตั้งค่า Supabase ────────────────────────
//
// แยกออกจาก `authUser.js` เพราะไฟล์นั้น import `next/headers` ซึ่ง unit test
// รันตรง ๆ ไม่ได้ — ตรรกะ "ใครคือคนที่สวมบทอยู่" ต้องเทสต์ได้
//
// ⚠️ ทางนี้เดินได้ **เฉพาะเมื่อ `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` ไม่มีค่า**
//   บน production ทั้งคู่มีเสมอ ⇒ ฟังก์ชันนี้ไม่มีวันถูกเรียกที่นั่น
//
// ⭐ `NEXT_PUBLIC_DEV_BYPASS_ROLE` / `_DEPARTMENT` / `_TEAM` — สวมบทบาทอื่นตอน UAT
//   ได้โดย **ไม่ต้องแตะรหัสผ่านของใคร** (คอมเมนต์ `NEXT_PUBLIC_SUPABASE_*` สองตัว
//   ใน `.env.local` เพื่อเปิด bypass แล้วตั้งสามตัวนี้)
//   ค่าตั้งต้นยังเป็น `ae_supervisor` เหมือนเดิมทุกประการ
//
// ⚠️ ต้องขึ้นต้น `NEXT_PUBLIC_` เพราะ **ฝั่งเบราว์เซอร์ต้องอ่านค่าเดียวกันได้** —
//   `AppLayout` ตัดสินเมนู/ปุ่มจาก role ที่ตัวเองถืออยู่ ถ้า server เป็น admin แต่
//   client ยังเป็น ae_supervisor จะได้หน้าจอที่ปุ่มหายแต่ API ยอม = UAT ที่เชื่อไม่ได้
import { ROLES, departmentFor, normalizeRole, userTeams } from '@/lib/permissions';

export function devBypassUser(env = process.env) {
  /* role ที่ไม่รู้จักถอยกลับค่าตั้งต้น — ห้ามสร้าง role ผีที่ไม่มีใน ROLE_CAPS
     ⚠️ `normalizeRole` แปลงชื่อเก่าเป็นใหม่ แต่ **ไม่ได้ตรวจว่ามีอยู่จริง** (คืนค่าที่
     ส่งเข้าไปตรง ๆ ถ้าไม่รู้จัก) ⇒ ต้องเทียบกับ ROLES เองอีกชั้น ไม่งั้นพิมพ์ผิด
     ตัวเดียวได้ผู้ใช้ที่ไม่มีสิทธิ์อะไรเลยแล้วนั่งงงว่าทำไมทุกหน้าเด้ง */
  const asked = normalizeRole(env.NEXT_PUBLIC_DEV_BYPASS_ROLE);
  const role = ROLES.includes(asked) ? asked : 'ae_supervisor';
  // env เป็นสตริงเสมอ — คั่นหลายทีมด้วยจุลภาค (`DEV_BYPASS_TEAM=SV,KA`)
  const teams = userTeams(String(env.NEXT_PUBLIC_DEV_BYPASS_TEAM || '').split(',').map((t) => t.trim()).filter(Boolean));
  return {
    id: 'local-dev',
    role,
    team: teams[0] || null,
    teams,
    department: env.NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT || departmentFor(role) || 'SALES',
    name: 'Local Dev',
    devBypass: true,
  };
}
