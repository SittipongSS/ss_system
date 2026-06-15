// Master-data namespace alias. The canonical /api/master/* URLs re-export the
// existing handlers so master-data consumers use one cohesive namespace while
// the legacy /api/customers paths keep working for cross-domain callers (tax,
// PM). Gating is applied to both by the proxy (it normalises /api/master/X).
export { GET, POST } from "../../customers/route";
