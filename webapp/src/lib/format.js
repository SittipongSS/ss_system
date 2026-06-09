// Shared formatting helpers — single source of truth for money/date display
// so every page renders THB and Thai dates identically.

export const fmtMoney = (amount) =>
  (amount || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });

// Date-only (no time), tolerant of null / plain date strings.
export const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // already a display string
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};

// Date + time.
export const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("th-TH");
};
