import { withUser, badRequest, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Approval was removed from the quotation workflow. Keep this route as an
// explicit compatibility response for stale clients instead of creating a
// pending approval state again.
export const POST = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  return badRequest('ใบเสนอราคาไม่ต้องขออนุมัติแล้ว');
});
