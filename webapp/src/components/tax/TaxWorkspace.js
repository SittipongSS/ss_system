"use client";

// Thin alias of the shared <Workspace> shell, kept so the six /tax pages can
// keep importing TaxWorkspace / TaxSpinner unchanged. New modules should import
// from "@/components/ui/Workspace" directly.
import Workspace, { Spinner } from "@/components/ui/Workspace";

export default Workspace;
export const TaxSpinner = Spinner;
