"use client";

/* ปุ่มกลางของระบบ — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาส `btn` / `btn-*`

   ก่อนหน้านี้ไม่มี primitive ปุ่ม แต่ละหน้าจึงประกอบคลาสเอง 116 ไฟล์ (ยังเหลืออีกมาก
   ระหว่างทยอยย้าย ดู scripts/ui-legacy-budget.json) พอ `.btn` ใน globals.css มี 23 บล็อก
   กระจายกัน คนเขียนหน้าใหม่จึงเดาไม่ออกว่าจะได้ปุ่มหน้าตาไหน — ปุ่มเดียวกันเลยหน้าตา
   ไม่ตรงกันข้ามโมดูล และเคยหลุด prod มาแล้วว่าคลาสที่เขียนไม่มีอยู่จริง (`btn danger`
   ที่ไม่มี selector = ปุ่มลบกลายเป็นปุ่มเทา, PR #699)

   ปุ่มนี้ **ไม่เปลี่ยนหน้าตาของเดิม** โดยเจตนา — มันแค่ย้ายการประกอบคลาสมาไว้ที่เดียว
   การเปลี่ยนดีไซน์ปุ่มจริง ๆ ให้แก้ที่ globals.css แล้วดูผลพร้อมกันทั้งระบบที่
   /settings/design-preview */

const TONES = {
  neutral: "btn-secondary",   // การกระทำรอง — พื้นเดียวกับ panel
  primary: "btn-primary",     // navy = "ยืนยันสิ่งที่ทำอยู่" (บันทึก/ยืนยัน/พิมพ์)
  accent: "btn-accent",       // terracotta = "เริ่มของใหม่" — หน้าละ 1 ปุ่มเท่านั้น
  danger: "btn-danger",
  warning: "btn-warning",
};

/* ⚠️ `quiet` กับ `ghost` เกือบซ้ำกันและมีมาก่อนหน้านี้ทั้งคู่ (`.btn.ghost` globals:687
   vs `.btn.action-ghost` globals:2818) ต่างกันแค่ ghost คงสีตาม tone ส่วน quiet เป็น
   สีข้อความปกติ — ยังไม่ยุบรวมเพราะต้องดูด้วยตาก่อนว่าปุ่มไหนควรเป็นแบบไหน
   ทั้งสองแบบวางเทียบกันไว้แล้วที่ /settings/design-preview */
const VARIANTS = {
  filled: null,
  outline: "action-outline",
  ghost: "action-ghost",
  quiet: "ghost",
};

export default function Button({
  as: Component = "button",
  // ไม่ระบุ tone = ปุ่มพื้นฐาน (คลาส `btn` เปล่า) ซึ่งเป็นแบบที่ใช้มากที่สุดในระบบ
  // ห้ามตั้งค่าเริ่มต้นเป็น neutral: `btn-secondary` ให้ค่าเดียวกับ `btn` ก็จริง
  // แต่ปุ่มไอคอน (`btn-icon`) มีพื้น/ขนาดของตัวเอง การใส่ tone ให้อัตโนมัติจะทับ
  tone,
  variant = "filled",
  size = "md",
  iconOnly = false,
  icon,
  className = "",
  children,
  ...props
}) {
  const classes = [
    iconOnly ? "btn-icon" : "btn",
    tone ? (TONES[tone] || TONES.neutral) : null,
    VARIANTS[variant],
    size === "sm" ? "sm" : null,
    className,
  ].filter(Boolean).join(" ").trim();

  // ปุ่มในฟอร์มที่ไม่ได้ระบุ type จะกลายเป็น submit โดยปริยาย — เคยทำให้ฟอร์มส่งเอง
  // ตอนกดปุ่มที่ตั้งใจให้เปิดโมดัล จึงบังคับ type="button" ให้เมื่อไม่ได้ส่งมา
  const typeProp = Component === "button" && props.type === undefined ? { type: "button" } : {};

  return (
    <Component className={classes} {...typeProp} {...props}>
      {icon}
      {iconOnly ? null : children}
    </Component>
  );
}
