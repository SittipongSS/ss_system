"use client";

import { useEffect } from "react";

export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
}
