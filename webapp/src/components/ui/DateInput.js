"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { displayDateToIso, isoDateToDisplay } from "@/lib/format";

function formatTypedDate(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DateInput({ value = "", onChange, className = "", style, min, max, disabled, required, name, id, ariaLabel, title }) {
  const [text, setText] = useState(() => isoDateToDisplay(value));
  const [focused, setFocused] = useState(false);
  const nativeRef = useRef(null);

  useEffect(() => {
    if (!focused) setText(isoDateToDisplay(value));
  }, [value, focused]);

  const update = (nextText) => {
    const formatted = formatTypedDate(nextText);
    setText(formatted);
    if (!formatted) onChange?.("");
    else {
      const iso = displayDateToIso(formatted);
      if (iso) onChange?.(iso);
    }
  };

  return (
    <span className={`date-input-wrap ${className}`.trim()} style={style}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        className="premium-input date-input-text"
        value={text}
        placeholder="DD/MM/YYYY"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        required={required}
        onFocus={() => setFocused(true)}
        onChange={(event) => update(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const iso = displayDateToIso(text);
          setText(iso ? isoDateToDisplay(iso) : isoDateToDisplay(value));
        }}
      />
      <input
        ref={nativeRef}
        type="date"
        className="date-input-native"
        value={value || ""}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onChange?.(event.target.value)}
      />
      <button type="button" className="date-input-picker" disabled={disabled} aria-label="เปิดปฏิทิน" onClick={() => {
        const picker = nativeRef.current;
        if (!picker) return;
        if (picker.showPicker) picker.showPicker();
        else picker.click();
      }}>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
    </span>
  );
}
