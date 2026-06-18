"use client";
import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

// Toast แจ้งเตือนลอยกลางล่างจอ — auto-dismiss. ใช้แทน alert() เนทีฟที่หน้าตาไม่เข้าธีม.
// ใช้: const [toast, setToast] = useState(null); setToast({ kind, msg });
//      <Toast toast={toast} onClose={() => setToast(null)} />
const KIND = {
  success: { icon: CheckCircle2, color: "var(--green)" },
  error: { icon: AlertTriangle, color: "var(--red)" },
  info: { icon: Info, color: "var(--accent)" },
};

export default function Toast({ toast, onClose, duration = 3200 }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [toast, onClose, duration]);

  if (!toast) return null;
  const { icon: Icon, color } = KIND[toast.kind] || KIND.info;
  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        zIndex: 1000, display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 14px 12px 16px", background: "var(--panel)",
        border: "1px solid var(--border)", borderLeft: `4px solid ${color}`,
        borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.20)",
        maxWidth: "min(92vw, 480px)", animation: "fadeIn 0.15s ease-out",
      }}
    >
      <Icon size={18} color={color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "13px", color: "var(--text)", flex: 1, whiteSpace: "pre-wrap" }}>{toast.msg}</span>
      <button className="btn-icon" onClick={onClose} aria-label="ปิด" style={{ flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}
