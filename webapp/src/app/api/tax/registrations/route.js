// Tax namespace alias. The canonical /api/tax/* URLs re-export the existing
// excise-registrations handlers so tax consumers use one cohesive namespace,
// while the legacy /api/excise-registrations paths keep working for existing
// callers. Gating is role-based inside the handlers (getCurrentUser/viewScope),
// not path-based, so the alias behaves identically.
// dynamic ต้อง declare ตรง (Next ไม่รับ re-export ของ route segment config).
export const dynamic = 'force-dynamic';
export { GET, POST } from "../../excise-registrations/route";
