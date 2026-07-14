import { withUser, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// Won is a commercial-document action. Keeping this endpoint as an explicit
// error prevents old clients from bypassing the quotation flow.
export const POST = withUser(async ({ user }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  return badRequest('ปิด Won ผ่านใบเสนอราคาเท่านั้น กรุณาออกใบเสนอราคาแล้วกด Won ที่ใบเสนอราคา');
});
