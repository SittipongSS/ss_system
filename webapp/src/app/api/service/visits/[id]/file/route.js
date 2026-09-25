// ── ไฟล์หลักฐานหน้างานของนัด (รูปหน้างาน · ลายเซ็นผู้รับงาน) ────────────────────────
// GET ?i=<ลำดับรูปใน attachments> | ?sig=1  →  สตรีมไบต์จาก Drive ผ่าน server
//
// ⭐ สิทธิ์ = **สิทธิ์อ่านใบส่งงานเป๊ะ** (`requireVisit({ report: true })` ตัวเดียวกับ GET ของใบ) ⇒ ใครเปิดใบได้
//    ก็เปิดรูปในใบได้ ไม่มีด่านที่สองให้เพี้ยนกันเอง · ฝ่ายขายอ่านได้ตามมติผู้ใช้ 2026-09-24
// 🐞 ทำไมต้องมีเส้นนี้ — หัวไฟล์ lib/service/visitFiles.js (Shared Drive ไม่เปิดให้พนักงานเปิดตรง)
// ⚠️ ขอบเขตความไว้ใจเท่าไฟล์แนบของ entity (`/api/master/attachments/[id]/file`): สตรีมได้เฉพาะไฟล์ที่แถว
//    อ้างถึง และคนเขียนแถวได้คือคนที่แก้นัดได้ (TS) — server ไม่ได้ตรวจว่าไฟล์บน Drive อัปมาเพื่อนัดนี้จริง
import { Readable } from 'node:stream';
import { withUser, fail } from '@/lib/http';
import { requireVisit } from '@/lib/service/visitsRepo';
import { visitFileTarget } from '@/lib/service/visitFiles';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  let target;
  try {
    const access = await requireVisit({ user, supabase, id, report: true });
    if (access.response) return access.response;
    target = visitFileTarget(access.visit, new URL(req.url).searchParams);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (target.error) return fail(target.error, target.status);

  try {
    const { getFileMeta, getFileStream } = await import('@/lib/drive');
    /* ชนิดไฟล์เอาจาก Drive — แถวของนัดเก็บแค่ url/ชื่อ/ก่อน-หลัง (ลายเซ็นไม่มีชื่อเลย) ⇒ เดาจากชื่อในแถว
       แล้วรูปที่ชื่อไม่มีนามสกุลจะกลายเป็น "ดาวน์โหลด" แทนเปิดดู · ถามก่อนสตรีมเพื่อจับไฟล์ที่ถูกลบด้วย */
    const meta = await getFileMeta(target.driveFileId, 'id, name, mimeType, trashed');
    if (meta?.trashed) return fail('ไฟล์นี้ถูกลบออกจาก Drive แล้ว', 404);
    const stream = await getFileStream(target.driveFileId);
    return new Response(Readable.toWeb(stream), {
      headers: attachmentFileHeaders({ mimeType: meta?.mimeType, fileName: meta?.name || target.name }),
    });
  } catch (err) {
    console.error('[service/visits/file] drive stream failed:', id, err?.message);
    if (err?.code === 404 || err?.status === 404) return fail('ไม่พบไฟล์นี้บน Drive — อาจถูกลบไปแล้ว', 404);
    // บอกสาเหตุจริง — คนที่กดแล้วไม่ขึ้นต้องรู้ว่าควรแจ้งใคร (ตรวจได้ที่ ตั้งค่า → ที่เก็บไฟล์)
    const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
    return fail(`ดึงไฟล์จาก Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}`, 502);
  }
});
