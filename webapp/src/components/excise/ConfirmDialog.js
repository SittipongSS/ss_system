"use client";

import ConfirmDialogBase from "@/components/ui/ConfirmDialog";

// Compatibility adapter during the one-release migration window.
export default function ConfirmDialog(props) {
  return <ConfirmDialogBase {...props} closeOnSuccess />;
}
