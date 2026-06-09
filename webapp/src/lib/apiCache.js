// In-memory cache for API list data, shared across client-side navigations
// (this module loads once per browser session). Enables a stale-while-
// revalidate pattern: pages show cached data instantly, then refresh in the
// background — so re-opening a menu feels instant instead of showing a spinner.
export const apiCache = new Map();
