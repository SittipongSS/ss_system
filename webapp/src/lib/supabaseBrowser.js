import { createBrowserClient } from '@supabase/ssr';
import { devBypassUser } from '@/lib/devBypass';

/* ตั้งค่า Supabase ฝั่งเบราว์เซอร์ครบหรือยัง — สะกดเหมือน `app/page.js` และ
   `app/home/page.js` (ทั้งสองที่อ่านค่าเดียวกันเพื่อสลับไปทาง devBypass)
   ⚠️ ต้องอ่าน `process.env.<ชื่อเต็ม>` ตรง ๆ เท่านั้น — Next แทนค่าให้ตอน build
   เฉพาะการอ้างแบบนี้ · ส่ง `process.env` ทั้งก้อนไปที่อื่นแล้วจะได้ค่าว่างในเบราว์เซอร์ */
export const SUPABASE_BROWSER_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ── ผู้ใช้สมมติฝั่งเบราว์เซอร์ตอน devBypass ────────────────────────────────
   🐞 **ที่มา (UAT 2026-09-09):** `devBypass` มีไว้ให้ "สวมบทบาทอื่นตอน UAT โดยไม่
   ต้องแตะรหัสผ่านของใคร" (ดู lib/devBypass.js) แต่ **หน้าไปป์ไลน์ดีลเปิดไม่ขึ้นเลย**
   ใต้โหมดนี้ — มันเรียก `createClient().auth.getUser()` เพื่อหา `meId` แล้ว
   `createBrowserClient` โยน "Your project's URL and API key are required" เพราะ
   env สองตัวนั้นคือ **สวิตช์ที่เปิด bypass** พอดี ⇒ เครื่องมือ UAT ใช้ UAT ไม่ได้
   (สี่จอที่เหลือรอดเพราะเอา `meId` มาทางอื่น — จอเดียวที่พังคือจอที่ต้องตรวจ)

   ⭐ คืน "ผู้ใช้คนเดียวกับฝั่ง server" — `devBypassUser().id` = `local-dev` เท่ากับที่
   `authUser.js` ใช้ ⇒ ขอบเขต "ของฉัน" บนจอกับด่านฝั่ง API ตัดสินจาก id เดียวกัน
   ถ้าสองฝั่งคิดว่าเป็นคนละคน จะได้ UAT ที่เชื่อไม่ได้ (กติกาเดียวกับ AppLayout)

   ⚠️ **ไม่มีทางเดินบน production** — ต้องขาด env ทั้งสองตัว *และ* ไม่ใช่ production
   build · เงื่อนไข NODE_ENV เป็นตัวเดียวกับที่ `app/page.js` ใช้กัน "prod ที่ตั้งค่า
   หลุด" ไม่ให้กลายเป็นการล็อกอินปลอม — ตรงนั้นต้องเด้ง error เหมือนเดิม
   ⚠️ รองรับเฉพาะเมธอดที่ผู้เรียกจริงใช้ (getUser/getSession/signOut/onAuthStateChange
   · ดู `grep createClient()`) — อย่างอื่นโยน error เดิมของ Supabase ไม่ใช่คืน
   ค่าว่างเงียบ ๆ ซึ่งจะกลายเป็นจอที่ "ทำงานได้" แต่ข้อมูลผิด */
const DEV_BYPASS_ALLOWED = !SUPABASE_BROWSER_CONFIGURED && process.env.NODE_ENV !== 'production';

const MISSING_ENV = "@supabase/ssr: Your project's URL and API key are required to create a Supabase client!";

function devBypassBrowserClient() {
  const me = devBypassUser({
    NEXT_PUBLIC_DEV_BYPASS_ROLE: process.env.NEXT_PUBLIC_DEV_BYPASS_ROLE,
    NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT: process.env.NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT,
    NEXT_PUBLIC_DEV_BYPASS_TEAM: process.env.NEXT_PUBLIC_DEV_BYPASS_TEAM,
  });
  const user = {
    id: me.id,
    email: 'local-dev@localhost',
    app_metadata: { role: me.role, department: me.department, team: me.team, teams: me.teams },
    user_metadata: { firstName: 'Local', lastName: 'Dev', name: me.name },
  };
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => { throw new Error(MISSING_ENV); },
    },
    from() { throw new Error(MISSING_ENV); },
  };
}

// Supabase client for use in client components (login, layout, logout).
// Uses the public anon key + cookie-based session (shared with proxy.js).
export function createClient() {
  if (DEV_BYPASS_ALLOWED) return devBypassBrowserClient();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
