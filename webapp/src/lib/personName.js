export function compactPersonName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name || name.includes("@")) return name;
  const parts = name.split(" ");
  if (parts.length < 2) return name;
  const initial = Array.from(parts.at(-1))[0];
  return initial ? `${parts[0]} ${initial.toLocaleUpperCase()}.` : parts[0];
}
