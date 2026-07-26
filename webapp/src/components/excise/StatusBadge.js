"use client";
import { CheckCircle2, Clock, XCircle, Wallet, Loader, FileEdit } from "lucide-react";
import { statusMeta } from "@/lib/excise/workflow";
import UiStatusBadge from "@/components/ui/StatusBadge";

// Status badge for BOTH excise tracks. Single source of truth = workflow.js.
const ICONS = { CheckCircle2, Clock, XCircle, Wallet, Loader, FileEdit };

export default function StatusBadge({ status, size = 13, showIcon = true }) {
  const { label, tone, icon } = statusMeta(status);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <UiStatusBadge
      label={label}
      tone={tone}
      icon={Icon}
      iconSize={size}
      showIcon={showIcon}
    />
  );
}
