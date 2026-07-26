"use client";

import { useRef } from "react";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";

function descriptorOf(option) {
  if (typeof option === "string" || typeof option === "number") {
    return { value: option, label: String(option) };
  }
  return option;
}

export default function Segmented({
  options = [],
  value,
  onChange,
  ariaLabel = "ตัวเลือก",
  className = "",
  showLabels = true,
  activationMode = "automatic",
}) {
  const buttonsRef = useRef([]);
  const items = options.map(descriptorOf).filter((option) => option?.value !== undefined);
  const hasSelectedOption = items.some((option) => option.value === value && !option.disabled);
  const firstEnabledIndex = items.findIndex((option) => !option.disabled);

  const moveFocus = (event, currentIndex) => {
    const nextIndex = nextEnabledIndex(items, currentIndex, event.key);
    if (nextIndex < 0) return;
    event.preventDefault();
    buttonsRef.current[nextIndex]?.focus();
    if (activationMode === "automatic") onChange?.(items[nextIndex].value);
  };

  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {items.map((option, index) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(node) => { buttonsRef.current[index] = node; }}
            type="button"
            className={`${active ? "active" : ""} ${!showLabels ? "icon" : ""}`.trim()}
            onClick={() => onChange?.(option.value)}
            onKeyDown={(event) => moveFocus(event, index)}
            aria-pressed={active}
            aria-label={option.ariaLabel || (!showLabels ? option.label : undefined)}
            title={option.title}
            disabled={option.disabled}
            tabIndex={active || (!hasSelectedOption && index === firstEnabledIndex) ? 0 : -1}
          >
            {Icon ? <Icon size={option.iconSize || 15} aria-hidden="true" /> : null}
            {showLabels ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
