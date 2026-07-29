"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import {
  INITIAL_TOAST_QUEUE,
  normalizeToast,
  toastQueueReducer,
} from "@/lib/toastQueue";
import { TOAST_EVENT } from "@/lib/feedback";
import Button from "./Button";
import styles from "./Toast.module.css";

export { notifyToast } from "@/lib/feedback";

const KIND = {
  success: { icon: CheckCircle2, role: "status" },
  error: { icon: AlertCircle, role: "alert" },
  warning: { icon: AlertTriangle, role: "alert" },
  info: { icon: Info, role: "status" },
};

const ToastContext = createContext(null);

function ToastPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

function ToastCard({ toast, onClose, duration = 3600 }) {
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
  const runAction = async () => {
    await toast.action?.onClick?.();
    if (toast.action?.dismissOnClick !== false) onClose?.();
  };

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
      {toast.action?.label ? (
        <button type="button" className={styles.action} onClick={runAction}>
          {toast.action.label}
        </button>
      ) : null}
      <Button
        iconOnly
        className={styles.close}
        onClick={onClose}
        aria-label="ปิดการแจ้งเตือน"
        icon={<X size={14} aria-hidden="true" />}
      />
    </div>
  );
}

function ToastViewport({ toast, onClose, duration }) {
  if (!toast) return null;
  return (
    <ToastPortal>
      <div className={styles.viewport} aria-label="การแจ้งเตือนของระบบ">
        <ToastCard key={toast.id || `${toast.kind}:${toast.msg}`} toast={toast} onClose={onClose} duration={duration} />
      </div>
    </ToastPortal>
  );
}

export function ToastProvider({
  children,
  duration = 3600,
  errorDuration = 5200,
  maxQueue = 5,
}) {
  const [queue, dispatch] = useReducer(toastQueueReducer, INITIAL_TOAST_QUEUE);

  const showToast = useCallback((input, options = {}) => {
    const item = normalizeToast(input, options);
    dispatch({ type: "enqueue", toast: item, maxQueue });
    return item.id;
  }, [maxQueue]);

  const dismiss = useCallback((id) => dispatch({ type: "dismiss", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  useEffect(() => {
    const receiveToast = (event) => {
      const item = normalizeToast(event.detail);
      dispatch({ type: "enqueue", toast: item, maxQueue });
    };
    window.addEventListener(TOAST_EVENT, receiveToast);
    return () => window.removeEventListener(TOAST_EVENT, receiveToast);
  }, [maxQueue]);

  const api = useMemo(() => {
    const byKind = (kind) => (message, options = {}) => showToast(message, { ...options, kind });
    return {
      showToast,
      success: byKind("success"),
      error: byKind("error"),
      warning: byKind("warning"),
      info: byKind("info"),
      dismiss,
      clear,
    };
  }, [clear, dismiss, showToast]);

  const activeDuration = queue.active?.duration
    ?? (queue.active?.kind === "error" ? errorDuration : duration);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport
        toast={queue.active}
        duration={activeDuration}
        onClose={() => dismiss(queue.active?.id)}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

// Compatibility API for existing pages. New consumers should use useToast().
export default function Toast({ toast, onClose, duration = 3600 }) {
  return <ToastViewport toast={toast} onClose={onClose} duration={duration} />;
}
