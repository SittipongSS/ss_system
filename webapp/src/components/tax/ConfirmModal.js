"use client";

import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Compatibility adapter during the one-release migration window.
export default function ConfirmModal({ danger = true, ...props }) {
  return <ConfirmDialog {...props} danger={danger} />;
}
