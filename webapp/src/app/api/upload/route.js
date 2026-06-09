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
