import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

export const dynamic = 'force-dynamic';

const EDITABLE = ['title', 'note', 'dueDate', 'status', 'projectId'];

async function loadOwned(supabase, id, user) {
  const { data } = await supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle();
  if (!data) return { task: null, owned: false };
  return { task: data, owned: data.ownerId === user?.id };
}

// PATCH /api/pm/personal-tasks/[id] — เจ้าของแก้ได้เท่านั้น.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { task, owned } = await loadOwned(supabase, id, user);
  if (!task) return Response.json({ error: 'ไม่พบงาน' }, { status: 404 });
  if (!owned) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json();
  const updates = {};
  for (const k of EDITABLE) {
    if (body[k] !== undefined) updates[k] = (k === 'dueDate' && body[k] === '') ? null : body[k];
  }
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('personal_tasks').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// DELETE /api/pm/personal-tasks/[id] — เจ้าของลบได้เท่านั้น.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { task, owned } = await loadOwned(supabase, id, user);
  if (!task) return Response.json({ error: 'ไม่พบงาน' }, { status: 404 });
  if (!owned) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { error } = await supabase.from('personal_tasks').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
