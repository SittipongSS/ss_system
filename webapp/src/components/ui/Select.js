"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

function flattenOptions(children, groupLabel = "") {
  const rows = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "optgroup") {
      rows.push(...flattenOptions(child.props.children, child.props.label || ""));
      return;
    }
    if (child.type !== "option") {
      if (child.props?.children) rows.push(...flattenOptions(child.props.children, groupLabel));
      return;
    }
    rows.push({
      value: String(child.props.value ?? ""),
      label: child.props.children,
      text: String(child.props.children ?? ""),
      disabled: Boolean(child.props.disabled),
      group: groupLabel,
    });
  });
  return rows;
}

function eventFor(value, name) {
  const target = { value, name: name || "" };
  return { target, currentTarget: target };
}

const Select = forwardRef(function Select(
  {
    compact = false,
    tone,
    fullWidth = false,
    options,
    children,
    className = "",
    style,
    value = "",
    onChange,
    disabled = false,
    name,
    required,
    placeholder,
    "aria-label": ariaLabel,
    title,
    onClick,
    ...rest
  },
  forwardedRef,
) {
  const generatedId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState({});

  const rows = useMemo(() => {
    if (options) {
      return options.map((option) => ({
        ...option,
        value: String(option.value ?? ""),
        text: String(option.label ?? ""),
      }));
    }
    return flattenOptions(children);
  }, [children, options]);

  const stringValue = String(value ?? "");
  const selected = rows.find((row) => row.value === stringValue);
  const selectedIndex = rows.findIndex((row) => row.value === stringValue);

  const setRefs = (node) => {
    triggerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const roomBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = Math.min(300, Math.max(42, rows.length * 38));
      const above = roomBelow < estimatedHeight + 12 && rect.top > roomBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8)),
        top: above ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
        width: Math.max(rect.width, 180),
        maxHeight: above ? Math.max(120, rect.top - 16) : Math.max(120, roomBelow - 14),
      });
    };
    const closeOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    place();
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, rows.length]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : rows.findIndex((row) => !row.disabled));
  }, [open, rows, selectedIndex]);

  const choose = (row) => {
    if (!row || row.disabled) return;
    onChange?.(eventFor(row.value, name));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (direction) => {
    if (!rows.length) return;
    let next = activeIndex;
    for (let count = 0; count < rows.length; count += 1) {
      next = (next + direction + rows.length) % rows.length;
      if (!rows[next].disabled) break;
    }
    setActiveIndex(next);
    requestAnimationFrame(() => menuRef.current?.querySelector(`[data-option-index="${next}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) setOpen(true);
      else choose(rows[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(rows.findIndex((row) => !row.disabled));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(rows.findLastIndex((row) => !row.disabled));
    }
  };

  const cls = [
    "ui-select",
    compact && "compact",
    tone && "tone",
    fullWidth && "w-full",
    open && "open",
    className,
  ].filter(Boolean).join(" ");
  const toneStyle = tone ? { "--select-tone": tone } : undefined;
  const listboxId = `${generatedId}-listbox`;

  return (
    <>
      <button
        ref={setRefs}
        type="button"
        className={cls}
        style={{ ...toneStyle, ...style }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        data-required={required || undefined}
        title={title}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
        {...rest}
      >
        <span className={`ui-select-value ${selected ? "" : "placeholder"}`.trim()}>
          {selected?.label ?? placeholder ?? "— เลือก —"}
        </span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>
      {name || required ? (
        <select
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          value={stringValue}
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
            setOpen(true);
          }}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, opacity: 0, pointerEvents: "none" }}
        >
          {rows.map((row, index) => <option key={`${row.value}-${index}`} value={row.value}>{row.text}</option>)}
        </select>
      ) : null}
      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} id={listboxId} role="listbox" className="ui-select-menu" style={menuStyle} aria-label={ariaLabel || title}>
          {rows.length ? rows.map((row, index) => {
            const showGroup = row.group && rows[index - 1]?.group !== row.group;
            const isSelected = row.value === stringValue;
            return (
              <div key={`${row.group}-${row.value}-${index}`}>
                {showGroup ? <div className="ui-select-group">{row.group}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-option-index={index}
                  disabled={row.disabled}
                  className={`ui-select-option ${isSelected ? "selected" : ""} ${activeIndex === index ? "active" : ""}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(row)}
                >
                  <span>{row.label}</span>
                  {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              </div>
            );
          }) : <div className="ui-select-empty">ไม่มีตัวเลือก</div>}
        </div>,
        document.body,
      ) : null}
    </>
  );
});

export default Select;
