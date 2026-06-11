import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

export const dynamic = 'force-dynamic';

// GET /api/pm/personal-tasks — งานส่วนตัวของฉันเท่านั้น (เห็นเฉพาะของตัวเอง).
export async function GET() {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('personal_tasks')
    .select('*')
    .eq('ownerId', user.id)
    .order('createdAt', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST /api/pm/personal-tasks — สร้างงานส่วนตัวของฉัน.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.title || !body.title.trim()) {
    return Response.json({ error: 'ต้องระบุชื่องาน' }, { status: 400 });
  }

  const row = {
    id: 'PST-' + Date.now().toString(36),
    ownerId: user.id,
    title: body.title.trim(),
    note: body.note || '',
    dueDate: body.dueDate || null,
    status: body.status || 'Pending',
    projectId: body.projectId || null,
  };
  const { data, error } = await supabase.from('personal_tasks').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
