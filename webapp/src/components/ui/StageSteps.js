"use client";
// ── แถบขั้น — ตัวเลือกที่เป็น "ลำดับ" เห็นทุกขั้นพร้อมผลของมันก่อนกด ──────
//
// ใช้แทนดรอปดาวน์สถานะดีล (กติกาคอนโทรล v2 — มติผู้ใช้ 2026-08-08):
// `sub` ใต้ชื่อขั้นคือผลของการเลือก (เช่น FC% ของขั้นนั้น) — คนเห็นก่อนกด
// ว่าเลือกแล้วได้อะไร ช่อง FC แยกจึงถูกยุบทิ้งได้ทั้งช่อง
//
// ขั้นปลายพิเศษ (Won/Lost ของโหมดดีลเก่า): ส่ง `tone: "win" | "lose"` และ
// `cut: true` ที่ขั้นแรกของกลุ่มปลายเพื่อคั่นด้วยเส้นหนา — primitive ไม่รู้จัก
// ความหมายของขั้น มันแค่วาดตามที่ผู้เรียกประกาศ
export default function StageSteps({
  value,
  onChange,
  steps = [],   // [{ value, label, sub?, tone?, cut?, disabled? }]
  disabled = false,
  ariaLabel,
}) {
  return (
    <div className="stage-steps" role="radiogroup" aria-label={ariaLabel}>
      {steps.map((step) => (
        <button
          key={step.value}
          type="button"
          role="radio"
          aria-checked={value === step.value}
          data-on={value === step.value ? "1" : undefined}
          data-tone={step.tone}
          data-cut={step.cut ? "1" : undefined}
          className="stage-step"
          disabled={disabled || step.disabled}
          onClick={() => onChange?.(step.value)}
        >
          <span className="stage-step-label">{step.label}</span>
          {step.sub ? <span className="stage-step-sub">{step.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}
