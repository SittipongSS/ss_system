import { withUser, ok } from '@/lib/http';
import { generateProjectCode } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ supabase }) => {
  return ok({ nextCode: await generateProjectCode(supabase) });
});
