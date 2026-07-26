"use client";
import { useCallback, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import styles from "./Toast.module.css";

// Toast แจ้งเตือนลอยกลางล่างจอ — auto-dismiss. ใช้แทน alert() เนทีฟที่หน้าตาไม่เข้าธีม.
// ใช้: const [toast, setToast] = useState(null); setToast({ kind, msg });
//      <Toast toast={toast} onClose={() => setToast(null)} />
const KIND = {
  success: { icon: CheckCircle2, role: "status" },
  error: { icon: AlertCircle, role: "alert" },
  warning: { icon: AlertTriangle, role: "alert" },
  info: { icon: Info, role: "status" },
};

export default function Toast({ toast, onClose, duration = 3200 }) {
  const timerRef = useRef(null);
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stopTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
  }, []);

  const startTimer = useCallback(() => {
    if (!toast || timerRef.current || remainingRef.current <= 0) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current?.(), remainingRef.current);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    remainingRef.current = toast.duration ?? duration;
    startTimer();
    return stopTimer;
  }, [toast, duration, startTimer, stopTimer]);

  if (!toast) return null;
  const kind = KIND[toast.kind] ? toast.kind : "info";
  const { icon: Icon, role } = KIND[kind];
  return (
    <div
      className={`${styles.toast} ${styles[kind]}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      onFocus={stopTimer}
      onBlur={startTimer}
    >
      <span className={styles.icon}><Icon size={18} aria-hidden="true" /></span>
      <span className={styles.message}>{toast.msg}</span>
      <button type="button" className={`btn-icon ${styles.close}`} onClick={onClose} aria-label="ปิดการแจ้งเตือน">
        <X size={14} />
      </button>
    </div>
  );
}
