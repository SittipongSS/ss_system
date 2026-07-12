"use client";

import { useEffect, useState } from "react";
import { formatMoneyInput, formatMoneyInputWhileTyping, parseNumberInput } from "@/lib/format";

export default function MoneyInput({ value, onChange, allowNegative = false, className = "", ...props }) {
  const [text, setText] = useState(() => formatMoneyInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatMoneyInput(value));
  }, [value, focused]);

  const handleChange = (event) => {
    const next = event.target.value;
    if (!/^-?[\d,]*(?:\.\d*)?$/.test(next) || (!allowNegative && next.includes("-"))) return;
    const cursor = event.target.selectionStart ?? next.length;
    const significantBeforeCursor = next.slice(0, cursor).replace(/,/g, "").length;
    const formatted = formatMoneyInputWhileTyping(next);
    setText(formatted);
    const parsed = parseNumberInput(formatted);
    onChange?.(parsed, formatted);
    requestAnimationFrame(() => {
      const input = event.target;
      let significant = 0;
      let nextCursor = formatted.length;
      for (let i = 0; i < formatted.length; i += 1) {
        if (formatted[i] !== ",") significant += 1;
        if (significant >= significantBeforeCursor) { nextCursor = i + 1; break; }
      }
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      className={`premium-input numeric-input ${className}`.trim()}
      value={text}
      onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
      onChange={handleChange}
      onBlur={(event) => {
        setFocused(false);
        setText(formatMoneyInput(text));
        props.onBlur?.(event);
      }}
    />
  );
}
