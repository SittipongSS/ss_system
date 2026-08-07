"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bug, ChevronDown, KeyRound, LifeBuoy, LogOut, Moon, Sun, UserRound } from "lucide-react";

export default function AccountMenu({
  userName,
  userInitials,
  roleLabel,
  roleTone = "viewer",
  isDark,
  canChangePassword = true,
  onToggleTheme,
  onChangePassword,
  onReportIssue,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const act = (callback) => () => {
    setOpen(false);
    callback?.();
  };

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar" aria-hidden="true">{userInitials || userName.substring(0, 2).toUpperCase()}</span>
        <span className="account-menu-identity">
          <span className="user-name">{userName}</span>
          <span className={`topbar-user-role ${roleTone}`}>{roleLabel}</span>
        </span>
        <ChevronDown className={`account-menu-chevron${open ? " open" : ""}`} size={15} aria-hidden="true" />
      </button>

      {open && (
        <div id={menuId} className="account-menu-popover" role="menu" aria-label="บัญชีของฉัน">
          <Link href="/account" role="menuitem" className="account-menu-item" onClick={() => setOpen(false)}>
            <UserRound size={17} aria-hidden="true" />
            <span>บัญชีของฉัน</span>
          </Link>
          <button type="button" role="menuitem" className="account-menu-item" onClick={act(onToggleTheme)}>
            {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            <span>{isDark ? "ใช้โหมดสว่าง" : "ใช้โหมดมืด"}</span>
          </button>
          {canChangePassword && (
            <button type="button" role="menuitem" className="account-menu-item" onClick={act(onChangePassword)}>
              <KeyRound size={17} aria-hidden="true" />
              <span>เปลี่ยนรหัสผ่าน</span>
            </button>
          )}
          {/* แจ้งปัญหาระบบ (mig 0219) — อยู่ในเมนูนี้เพราะมันมีอยู่ **ทุกหน้า**
              ผู้ใช้จึงแจ้งได้จากหน้าที่พังโดยไม่ต้องเปลี่ยนหน้า (มติ Q5)
              ⚠️ ไม่ทำปุ่มลอย — ทับ UI บนมือถือ */}
          <div className="account-menu-divider" role="separator" />
          <button type="button" role="menuitem" className="account-menu-item" onClick={act(onReportIssue)}>
            <Bug size={17} aria-hidden="true" />
            <span>แจ้งปัญหาระบบ</span>
          </button>
          <Link href="/support" role="menuitem" className="account-menu-item" onClick={() => setOpen(false)}>
            <LifeBuoy size={17} aria-hidden="true" />
            <span>เรื่องที่ฉันแจ้ง</span>
          </Link>
          <div className="account-menu-divider" role="separator" />
          <button type="button" role="menuitem" className="account-menu-item danger" onClick={act(onLogout)}>
            <LogOut size={17} aria-hidden="true" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      )}
    </div>
  );
}
