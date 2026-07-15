// Proxy แสดง/ดาวน์โหลดไฟล์หลักฐานการปิด Won ของใบเสนอราคา (quotations.wonAttachments).
// สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ (pattern เดียวกับ activities/[id]/file) แล้ว
// stream bytes จาก private Supabase Storage / Google Drive; ไฟล์ legacy บน
// public Supabase Storage ยัง redirect URL เดิมเพื่อ backward compatibility.
// ?i=<index> ชี้ไฟล์ในอาเรย์ wonAttachments (default 0).
import { Readable } from 'node:stream';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { DEFAULT_WON_EVIDENCE_BUCKET } from '@/lib/sales/quotationWonEvidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !canViewSalesPlanning(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: quote } = await supabase
    .from('quotations')
    .select('id, dealId, wonAttachments')
    .eq('id', id)
    .maybeSingle();
  if (!quote) return Response.json({ error: 'ไม่พบใบเสนอราคา' }, { status: 404 });

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (!deal || !inSalesViewScope(user, deal)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const list = Array.isArray(quote.wonAttachments) ? quote.wonAttachments : [];
  const idx = Number(new URL(request.url).searchParams.get('i')) || 0;
  const att = list[idx];
  if (!att || (!att.fileUrl && !att.storagePath)) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }

  // New Won evidence: private bucket, streamed only after deal-scope auth above.
  if (att.storagePath) {
    const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_WON_EVIDENCE_BUCKET;
    const safeQuoteId = String(quote.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
    if (att.storageBucket !== privateBucket || !String(att.storagePath).startsWith(`quotations/${safeQuoteId}/won/`)) {
      return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
    }
    const { data, error } = await supabase.storage.from(privateBucket).download(att.storagePath);
    if (error || !data) {
      console.error('[quotations/file] private storage download failed:', error);
      return Response.json({ error: 'ดึงไฟล์หลักฐานไม่สำเร็จ' }, { status: 502 });
    }
    return new Response(data, {
      headers: {
        'Content-Type': att.mimeType || data.type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // Legacy Supabase public URL (no Drive id / private path) → redirect ตรง.
  if (!att.driveFileId) return Response.redirect(att.fileUrl, 307);

  // Drive: stream bytes ผ่าน server (ไฟล์ private).
  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    return new Response(Readable.toWeb(stream), {
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[quotations/file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
