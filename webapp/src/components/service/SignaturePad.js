"use client";
// ── แผ่นเซ็นชื่อผู้รับงาน (S-3) ───────────────────────────────────────────
// ⚠️ **ไม่บังคับเซ็น** (มติผู้ใช้ 2026-07-30) — ลูกค้าไม่อยู่หน้างานมีจริง
// ปุ่ม "ข้าม" จึงต้องอยู่ตลอด ไม่ใช่ซ่อนไว้
//
// ใช้ Pointer Events ตัวเดียวคุมทั้งนิ้วและเมาส์ — ไม่ต้องเขียน touch/mouse แยก
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import styles from "./SignaturePad.module.css";

export default function SignaturePad({ onSave, onSkip, saving = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // ⚠️ canvas ต้องตั้งขนาดพิกเซลจริงตาม devicePixelRatio ไม่งั้นเส้นเบลอบนมือถือ
  // (ความกว้าง CSS ≠ ความกว้าง buffer — ของเดิมที่ลืมตรงนี้ได้ลายเซ็นแตกทุกเครื่อง)
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(canvas).color;
  }, []);

  useEffect(() => {
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    return () => window.removeEventListener("resize", fitCanvas);
  }, [fitCanvas]);

  const pointAt = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event) => {
    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    setHasInk(true);
  };

  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pointAt(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const save = () => {
    canvasRef.current.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  };

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.pad}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="ช่องเซ็นชื่อผู้รับงาน"
      />
      {!hasInk && <p className={styles.hint}>แตะเพื่อเซ็น</p>}
      <div className={styles.actions}>
        <Button tone="neutral" variant="quiet" size="sm" onClick={clear} disabled={!hasInk || saving}>ล้าง</Button>
        <Button tone="neutral" variant="quiet" size="sm" onClick={onSkip} disabled={saving}>ข้าม</Button>
        <Button tone="primary" size="sm" onClick={save} disabled={!hasInk || saving}>
          {saving ? "กำลังบันทึก…" : "ใช้ลายเซ็นนี้"}
        </Button>
      </div>
    </div>
  );
}
