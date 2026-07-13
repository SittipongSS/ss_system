"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock3 } from "lucide-react";
import { normalizeTime } from "@/lib/format";

export default function TimeInput({
  value = "",
  onChange,
  disabled,
  className = "",
  style,
  ariaLabel = "เวลา",
  minuteStep = 5,
  name,
}) {
  const [draft, setDraft] = useState(value ? String(value).slice(0, 5) : "");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const parsed = normalizeTime(value);
  const selectedHour = parsed?.slice(0, 2) || "";
  const selectedMinute = parsed?.slice(3, 5) || "";
  const minutes = useMemo(() => {
    const values = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => String(index * minuteStep).padStart(2, "0"));
    if (selectedMinute && !values.includes(selectedMinute)) values.push(selectedMinute);
    return values.sort();
  }, [minuteStep, selectedMinute]);

  useEffect(() => setDraft(value ? String(value).slice(0, 5) : ""), [value]);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = 300;
      const roomBelow = window.innerHeight - rect.bottom;
      const above = roomBelow < height + 12 && rect.top > roomBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 236)),
        top: above ? Math.max(8, rect.top - height - 6) : rect.bottom + 6,
        width: 228,
        maxHeight: above ? Math.max(180, rect.top - 16) : Math.max(180, roomBelow - 14),
      });
    };
    const outside = (event) => {
      if (!wrapRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    place();
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const commit = (next) => {
    const normalized = normalizeTime(next);
    if (normalized) {
      setDraft(normalized);
      onChange?.(normalized);
      return true;
    }
    setDraft(value ? String(value).slice(0, 5) : "");
    return false;
  };

  const choose = (hour, minute) => {
    const nextHour = hour || selectedHour || "00";
    const nextMinute = minute || selectedMinute || "00";
    commit(`${nextHour}:${nextMinute}`);
    if (hour && !minute) return;
    setOpen(false);
  };

  return (
    <>
      <span ref={wrapRef} className={`ui-time-input ${className}`.trim()} style={style}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="premium-input datetime-time"
          value={draft}
          disabled={disabled}
          name={name}
          aria-label={ariaLabel}
          placeholder="HH:mm"
          maxLength={5}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
          onBlur={() => { if (draft) commit(draft); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(draft);
            if (event.key === "ArrowDown") setOpen(true);
          }}
        />
        <button type="button" className="ui-time-trigger" disabled={disabled} aria-label="เลือกเวลาแบบ 24 ชั่วโมง" onClick={() => setOpen((current) => !current)}>
          <Clock3 size={15} />
        </button>
      </span>
      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="ui-time-menu" style={menuStyle}>
          <div className="ui-time-title">เวลา 24 ชั่วโมง</div>
          <div className="ui-time-columns">
            <div className="ui-time-column" aria-label="ชั่วโมง">
              {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => (
                <button key={hour} type="button" className={hour === selectedHour ? "selected" : ""} onClick={() => choose(hour, null)}>
                  <span>{hour}</span>{hour === selectedHour ? <Check size={13} /> : null}
                </button>
              ))}
            </div>
            <div className="ui-time-column" aria-label="นาที">
              {minutes.map((minute) => (
                <button key={minute} type="button" className={minute === selectedMinute ? "selected" : ""} onClick={() => choose(null, minute)}>
                  <span>{minute}</span>{minute === selectedMinute ? <Check size={13} /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="ui-time-preview">{selectedHour || "00"}:{selectedMinute || "00"}</div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
