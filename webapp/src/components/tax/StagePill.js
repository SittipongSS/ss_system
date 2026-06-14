"use client";
import { CheckCircle2, Clock, XCircle, Wallet, Loader } from "lucide-react";
import { statusMeta } from "@/lib/tax/status";

// Unified excise-tax status badge for BOTH tracks (registration + order).
// Single source of truth = lib/tax/status.js. Eventually replaces
// ProductStatusPill + OrderStatusPill + the inline ternaries in /tax/history.
const ICON = {
  pending_legal: Clock,
  approved: CheckCircle2,
  pending: Wallet,
  received: Clock,
  filing: Loader,
  complete: CheckCircle2,
  rejected: XCircle,
};

export default function StagePill({ status, size = 13, showIcon = true }) {
  const { label, tone } = statusMeta(status);
  const Icon = ICON[status];
  return (
    <span className={`status-pill ${tone} inline-flex items-center gap-1 w-fit`}>
      {showIcon && Icon && <Icon size={size} />} {label}
    </span>
  );
}
