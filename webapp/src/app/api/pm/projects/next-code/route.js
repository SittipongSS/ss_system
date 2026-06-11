import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `PJ-${yy}${mm}`;

  const { data: latest, error } = await supabase
    .from('projects')
    .select('code')
    .ilike('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let nextNum = 1;
  if (latest && latest.length > 0 && latest[0].code) {
    const lastCode = latest[0].code;
    const lastNumStr = lastCode.slice(prefix.length);
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }
  const nextCode = `${prefix}${nextNum.toString().padStart(3, '0')}`;

  return Response.json({ nextCode });
}
