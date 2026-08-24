// ── คอมมิตที่ production กำลังรันอยู่จริง ─────────────────────────────────
//
// GET /api/version → { sha, shortSha, ref, deploymentId, env }
//
// ⭐ ทำไมต้องมี: deployment record ของ GitHub บอกได้แค่ "Vercel build เสร็จแบบ
// success" **ไม่ได้บอกว่าไฟล์ที่เสิร์ฟตรงกับซอร์ส** — ตอน turbopack build cache
// เปิดอยู่ (20–21/08/69) build รายงาน success ทุกรอบทั้งที่คาย CSS เก่าออกมา
// คนใช้เห็นว่า "งานไม่ขึ้น" แต่ทุกหน้าจอฝั่งเราเขียวหมด · เส้นนี้ทำให้ deploy
// workflow ถามเว็บจริงได้ว่า "ตอนนี้แกรันคอมมิตไหน" แล้วเทียบกับที่เพิ่งดันไป
//
// ⚠️ **ไม่มีด่าน session** (ดู bypassesSessionGate ใน proxy.js) — ผู้เรียกคือ
// GitHub Actions ซึ่งไม่มีวันมี cookie · ปลอดภัยเพราะสิ่งที่คืนคือเลขคอมมิตของ
// รีโปซึ่งเปิดสาธารณะอยู่แล้ว และไม่แตะฐานข้อมูลเลยสักแถว
// ⚠️ **ห้ามใส่อะไรมากกว่านี้** (เวอร์ชัน dependency · ค่า env · ชื่อคน) — เส้นที่
// ไม่มีด่านต้องคืนเฉพาะของที่เปิดเผยได้อยู่แล้ว
//
// ⚠️ `VERCEL_GIT_COMMIT_SHA` มีเฉพาะบน Vercel — รันเครื่องตัวเองได้ null ซึ่งถูก
// แล้ว: dev ไม่มี "คอมมิตที่ deploy"
import { NextResponse } from 'next/server';

// ต้องสดเสมอ: ถ้าโดน cache ที่ขอบ คำตอบจะเป็นของ deployment ก่อนหน้า แล้วด่าน
// ตรวจใน workflow จะรอจนหมดเวลาโดยที่ของขึ้นไปเรียบร้อยแล้ว
export const dynamic = 'force-dynamic';

export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  return NextResponse.json(
    {
      sha,
      shortSha: sha ? sha.slice(0, 8) : null,
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      env: process.env.VERCEL_ENV || 'development',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
