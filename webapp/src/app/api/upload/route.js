import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  MAX_UPLOAD_BYTES, MAX_UPLOAD_MB,
  ACCEPTED_UPLOAD_MIME, ACCEPTED_UPLOAD_EXT,
} from '@/lib/master/attachmentTypes';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

// ขนาดสูงสุดต่อไฟล์ — ค่ากลางจาก attachmentTypes (env override ได้).
const MAX_BYTES = Number(process.env.SUPABASE_MAX_UPLOAD_MB) > 0
  ? Number(process.env.SUPABASE_MAX_UPLOAD_MB) * 1024 * 1024
  : MAX_UPLOAD_BYTES;
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

export async function POST(request) {
  try {
    // ต้องล็อกอินก่อนจึงอัปไฟล์ได้ (กัน upload สาธารณะ). สิทธิ์รายเอกสาร
    // ตรวจต่อตอนบันทึก metadata ที่ /api/master/attachments (canEditRecord).
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    const customerName = formData.get('customerName');

    if (!file) {
      return Response.json({ error: 'No file received.' }, { status: 400 });
    }

    // จำกัดขนาดไฟล์ก่อนอ่านลง buffer (กันไฟล์ใหญ่ถมพื้นที่/ค่าใช้จ่าย).
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return Response.json(
        { error: `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_MB} MB)` },
        { status: 413 },
      );
    }

    // รับเฉพาะเอกสาร PDF/รูป — กันไฟล์อันตราย (.exe/.html) ที่ยิง API ตรง.
    // ผ่านถ้า mime อยู่ในลิสต์ หรือ (mime ว่าง/กว้าง) แต่นามสกุลถูกต้อง.
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const mimeOk = file.type && ACCEPTED_UPLOAD_MIME.includes(file.type);
    const extOk = ACCEPTED_UPLOAD_EXT.includes(ext);
    if (!mimeOk && !extOk) {
      return Response.json(
        { error: 'ชนิดไฟล์ไม่รองรับ (รับเฉพาะ PDF, PNG, JPG, WEBP)' },
        { status: 415 },
      );
    }

    const supabase = getSupabaseAdmin();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Supabase Storage keys must be ASCII-safe. Thai/Unicode chars cause an
    // "Invalid key" error, so we strip to [A-Za-z0-9] for the folder and to a
    // safe set for the filename (Thai customer names -> "general" folder).
    const folder =
      (customerName || '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'general';
    const safeName =
      (file.name || 'file')
        .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
        .replace(/^_+/, '') || 'file';
    const timestamp = Date.now();
    const objectPath = `${folder}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return Response.json({ error: 'File upload failed' }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return Response.json({ url: data.publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: 'File upload failed' }, { status: 500 });
  }
}
