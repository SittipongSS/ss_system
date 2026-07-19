"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Crop, Move, RotateCcw, ZoomIn } from "lucide-react";
import {
  SIGNATURE_CROP_MAX_ZOOM,
  SIGNATURE_CROP_MIN_ZOOM,
  SIGNATURE_CROP_OUTPUT_HEIGHT,
  SIGNATURE_CROP_OUTPUT_WIDTH,
  signatureCropDrawRect,
  signatureCropTransform,
} from "@/lib/signatureCrop";
import { SIGNATURE_MAX_BYTES } from "@/lib/signatures";
import styles from "./SignatureVault.module.css";

function croppedFileName(name) {
  const base = String(name || "signature").replace(/\.png$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${base || "signature"}-cropped.png`;
}

const SignatureCropper = forwardRef(function SignatureCropper({ file, onReadyChange }, ref) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [image, setImage] = useState(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const candidate = new window.Image();
    setSourceUrl(url);
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoadError("");
    candidate.onload = () => setImage({ element: candidate, width: candidate.naturalWidth, height: candidate.naturalHeight });
    candidate.onerror = () => setLoadError("ไฟล์ภาพไม่สมบูรณ์หรือไม่ใช่ PNG ที่รองรับ");
    candidate.src = url;
    return () => {
      candidate.onload = null;
      candidate.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => signatureCropTransform({
    imageWidth: image?.width,
    imageHeight: image?.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    zoom,
    offsetX: offset.x,
    offsetY: offset.y,
  }), [image, offset, viewport, zoom]);

  useEffect(() => {
    if (!transform) return;
    if (transform.offsetX !== offset.x || transform.offsetY !== offset.y) {
      setOffset({ x: transform.offsetX, y: transform.offsetY });
    }
  }, [offset, transform]);

  const ready = !!transform && !loadError;
  useEffect(() => { onReadyChange?.(ready); }, [onReadyChange, ready]);

  const moveBy = useCallback((dx, dy) => {
    if (!image || !viewport.width || !viewport.height) return;
    setOffset((current) => {
      const next = signatureCropTransform({
        imageWidth: image.width,
        imageHeight: image.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        zoom,
        offsetX: current.x + dx,
        offsetY: current.y + dy,
      });
      return next ? { x: next.offsetX, y: next.offsetY } : current;
    });
  }, [image, viewport, zoom]);

  const exportFile = useCallback(async () => {
    if (!ready || !image) throw new Error("ภาพยังไม่พร้อมสำหรับการครอป");
    const rect = signatureCropDrawRect({
      imageWidth: image.width,
      imageHeight: image.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    if (!rect) throw new Error("คำนวณพื้นที่ครอปไม่สำเร็จ");

    const canvas = document.createElement("canvas");
    canvas.width = SIGNATURE_CROP_OUTPUT_WIDTH;
    canvas.height = SIGNATURE_CROP_OUTPUT_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการครอปภาพ");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image.element, rect.x, rect.y, rect.width, rect.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("สร้างไฟล์ PNG ที่ครอปไม่สำเร็จ");
    if (blob.size > SIGNATURE_MAX_BYTES) {
      throw new Error("ไฟล์หลังครอปใหญ่เกิน 1 MB กรุณาเลือกภาพที่มีพื้นหลังเรียบกว่า");
    }
    return new File([blob], croppedFileName(file?.name), { type: "image/png", lastModified: Date.now() });
  }, [file?.name, image, offset, ready, viewport, zoom]);

  useImperativeHandle(ref, () => ({ exportFile }), [exportFile]);

  const pointerDown = (event) => {
    if (!ready) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const pointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    moveBy(event.clientX - drag.x, event.clientY - drag.y);
    dragRef.current = { id: drag.id, x: event.clientX, y: event.clientY };
  };

  const pointerEnd = (event) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const keyDown = (event) => {
    const step = event.shiftKey ? 12 : 4;
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      moveBy(...moves[event.key]);
    } else if (["+", "="].includes(event.key)) {
      event.preventDefault();
      setZoom((value) => Math.min(SIGNATURE_CROP_MAX_ZOOM, value + 0.05));
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom((value) => Math.max(SIGNATURE_CROP_MIN_ZOOM, value - 0.05));
    } else if (event.key === "Home") {
      event.preventDefault();
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  };

  return (
    <section className={styles.cropSection} aria-labelledby="signature-crop-heading">
      <div className={styles.sectionHeading}>
        <div><h3 id="signature-crop-heading"><Crop size={16} aria-hidden="true" /> ครอปลายเซ็น</h3><p>จัดลายเซ็นให้พอดีกรอบ 3:1 ก่อนบันทึก</p></div>
        <span className="ui-badge" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>1200×400 px</span>
      </div>

      <div
        ref={viewportRef}
        className={`${styles.cropViewport} ${ready ? styles.cropReady : ""}`}
        role="group"
        tabIndex={ready ? 0 : -1}
        aria-label="พื้นที่ครอปลายเซ็น ลากเพื่อจัดตำแหน่ง ใช้ปุ่มลูกศรเพื่อขยับ ปุ่มบวกลบเพื่อซูม และ Home เพื่อรีเซ็ต"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onKeyDown={keyDown}
      >
        {sourceUrl && image && transform ? (
          <Image
            src={sourceUrl}
            alt=""
            aria-hidden="true"
            width={image.width}
            height={image.height}
            unoptimized
            draggable={false}
            className={styles.cropImage}
            style={{
              width: transform.displayWidth,
              height: transform.displayHeight,
              transform: `translate(calc(-50% + ${transform.offsetX}px), calc(-50% + ${transform.offsetY}px))`,
            }}
          />
        ) : (
          <div className={styles.cropLoading}>{loadError || "กำลังเตรียมภาพ…"}</div>
        )}
        {ready && <span className={styles.cropMoveHint} aria-hidden="true"><Move size={14} /> ลากเพื่อจัดตำแหน่ง</span>}
      </div>

      <div className={styles.cropControls}>
        <label htmlFor="signature-crop-zoom"><ZoomIn size={15} aria-hidden="true" /> ซูม <span>{Math.round(zoom * 100)}%</span></label>
        <input
          id="signature-crop-zoom"
          type="range"
          min={SIGNATURE_CROP_MIN_ZOOM}
          max={SIGNATURE_CROP_MAX_ZOOM}
          step="0.01"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          disabled={!ready}
        />
        <button type="button" className="btn ghost sm" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} disabled={!ready}>
          <RotateCcw size={14} aria-hidden="true" /> รีเซ็ต
        </button>
      </div>
      <p className={styles.assistText}>ลากภาพหรือใช้ปุ่มลูกศรเพื่อจัดตำแหน่ง · Shift + ลูกศรเพื่อขยับเร็ว · +/− เพื่อซูม</p>
      {loadError && <p className={styles.validationError} role="alert">{loadError}</p>}
    </section>
  );
});

export default SignatureCropper;
