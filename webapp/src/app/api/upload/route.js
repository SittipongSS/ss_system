import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const customerName = formData.get('customerName');

    if (!file) {
      return Response.json({ error: 'No file received.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const buffer = Buffer.from(await file.arrayBuffer());

    const sanitizedCustomer = customerName
      ? customerName.replace(/[^a-zA-Z0-9ก-๙]/g, '_')
      : 'General';
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const objectPath = `${sanitizedCustomer}/${filename}`;

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
