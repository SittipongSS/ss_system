"use client";

// แท็บสลับ "ส่วน/มุมมอง" ของหน้า (M3 Tabs — active = เส้นใต้). คู่กับ ViewSwitcher
// (`.segmented` = ตัวกรอง/สลับโหมด active พื้นส้ม). กติกา: สลับหน้า→Tabs, กรองในหน้า→segmented.
// component เดียวสำหรับทุก tab bar ในระบบ กัน drift (แต่ก่อนแต่ละหน้าเขียน .tabs-header เอง).
//   tabs=[{ key, label, disabled? }] · value · onChange(key). label เป็น node ได้ (ใส่ count/ไอคอน).
//   ตัวที่เป็น falsy ใน tabs ถูกข้าม → caller filter เงื่อนไขสิทธิ์ได้เลย.
export default function Tabs({ tabs, value, onChange, ariaLabel = "แท็บ", className = "" }) {
  return (
    <div className={`tabs-header ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {(tabs || []).filter(Boolean).map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={`tab-btn ${value === tab.key ? "active" : ""}`}
          onClick={() => onChange(tab.key)}
          disabled={tab.disabled}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
