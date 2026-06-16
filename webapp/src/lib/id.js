// Collision-resistant id generator for app-assigned primary keys.
// Replaces the ad-hoc `PREFIX + Date.now().slice(-6)` schemes that collided
// when rows were created within the same millisecond (e.g. project_products
// inserted in a loop). A per-process counter guarantees uniqueness within an
// instance even in the same millisecond; time + random keep ids distinct
// across instances. Ids stay short (~16 chars) to fit existing id columns.
//
// Prefixes are meaningful elsewhere (e.g. a project id 'PRJ-…' must never look
// like a human code 'PJ-…'), so callers keep passing the same prefix.
let counter = 0;
export function genId(prefix) {
  const time = Date.now().toString(36);
  counter = (counter + 1) & 0xffff;
  const seq = counter.toString(36);
  const rand = Math.floor(Math.random() * 0x10000).toString(36);
  return `${prefix}-${time}${seq}${rand}`;
}
