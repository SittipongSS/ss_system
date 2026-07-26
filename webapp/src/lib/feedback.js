import { normalizeToast } from "@/lib/toastQueue";

export const TOAST_EVENT = "ss-system:toast";

export function notifyToast(input, options = {}) {
  if (typeof window === "undefined") return null;
  const item = normalizeToast(input, options);
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: item }));
  return item.id;
}

for (const kind of ["success", "error", "warning", "info"]) {
  notifyToast[kind] = (message, options = {}) => notifyToast(message, { ...options, kind });
}
