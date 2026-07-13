"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Select from "@/components/ui/Select";

export default function SortControl({
  value,
  onChange,
  options,
  direction = "asc",
  onDirectionChange,
  label = "เรียง",
  compact = true,
  selectStyle,
  title = "เรียงลำดับ",
}) {
  return (
    <div className="ui-sort-control" role="group" aria-label={title}>
      <span className="ui-sort-label"><ArrowUpDown size={14} aria-hidden="true" />{label}</span>
      <Select compact={compact} value={value} onChange={onChange} style={selectStyle} title={title}>
        {options.map((option) => <option key={option.value ?? option.key} value={option.value ?? option.key}>{option.label}</option>)}
      </Select>
      {onDirectionChange ? (
        <button
          type="button"
          className="btn-icon ui-sort-direction"
          onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
          title={direction === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
          aria-label={direction === "asc" ? "เรียงจากน้อยไปมาก" : "เรียงจากมากไปน้อย"}
        >
          {direction === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </button>
      ) : null}
    </div>
  );
}

