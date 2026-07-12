"use client";

export default function MaskedNumberInput({ value = "", onChange, format, maxDigits, className = "", ...props }) {
  const formatted = format(value);
  const handleChange = (event) => {
    const cursor = event.target.selectionStart ?? event.target.value.length;
    const digitsBefore = event.target.value.slice(0, cursor).replace(/\D/g, "").length;
    const digits = event.target.value.replace(/\D/g, "").slice(0, maxDigits);
    onChange?.(digits);
    const next = format(digits);
    requestAnimationFrame(() => {
      const input = event.target;
      let seen = 0;
      let nextCursor = next.length;
      for (let index = 0; index < next.length; index += 1) {
        if (/\d/.test(next[index])) seen += 1;
        if (seen >= digitsBefore) { nextCursor = index + 1; break; }
      }
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };
  return (
    <input
      {...props}
      type="tel"
      inputMode="numeric"
      autoComplete="off"
      className={`premium-input tabular-nums ${className}`.trim()}
      value={formatted}
      onChange={handleChange}
    />
  );
}
