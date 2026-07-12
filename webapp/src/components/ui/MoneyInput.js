"use client";

import { useEffect, useState } from "react";
import { formatMoneyInput, parseNumberInput } from "@/lib/format";

export default function MoneyInput({ value, onChange, allowNegative = false, className = "", ...props }) {
  const [text, setText] = useState(() => formatMoneyInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatMoneyInput(value));
  }, [value, focused]);

  const handleChange = (event) => {
    const next = event.target.value;
    if (!/^-?[\d,]*(?:\.\d*)?$/.test(next) || (!allowNegative && next.includes("-"))) return;
    setText(next);
    const parsed = parseNumberInput(next);
    onChange?.(parsed, next);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      className={`premium-input numeric-input ${className}`.trim()}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={handleChange}
      onBlur={(event) => {
        setFocused(false);
        setText(formatMoneyInput(text));
        props.onBlur?.(event);
      }}
    />
  );
}
