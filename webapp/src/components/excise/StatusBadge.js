"use client";
import { CheckCircle2, Clock, XCircle, Wallet, Loader, FileEdit } from "lucide-react";
import { statusMeta } from "@/lib/excise/workflow";

// Status badge for BOTH excise tracks. Single source of truth = workflow.js.
const ICONS = { CheckCircle2, Clock, XCircle, Wallet, Loader, FileEdit };

export default function StatusBadge({ status, size = 13, showIcon = true }) {
  const { label, tone, icon } = statusMeta(status);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <span className={`status-pill ${tone} inline-flex items-center gap-1 w-fit`}>
      {showIcon && Icon && <Icon size={size} />} {label}
    </span>
  );
}
