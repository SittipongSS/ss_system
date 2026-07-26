const TOAST_KINDS = new Set(["success", "error", "warning", "info"]);

let toastSequence = 0;

function defaultToastId() {
  toastSequence += 1;
  return `toast-${Date.now()}-${toastSequence}`;
}

function messageOf(input) {
  if (input instanceof Error) return input.message;
  if (typeof input === "string" || typeof input === "number") return String(input);
  return input?.msg ?? input?.message ?? "";
}

export function normalizeToast(input, options = {}, idFactory = defaultToastId) {
  const source = input && typeof input === "object" && !(input instanceof Error)
    ? { ...input, ...options }
    : { ...options, msg: messageOf(input) };
  const msg = String(messageOf(source)).trim();
  if (!msg) throw new TypeError("Toast requires a non-empty message");

  const durationValue = Number(source.duration);
  return {
    ...source,
    id: source.id || idFactory(),
    kind: TOAST_KINDS.has(source.kind) ? source.kind : "info",
    msg,
    duration: Number.isFinite(durationValue) ? Math.max(0, durationValue) : undefined,
  };
}

export const INITIAL_TOAST_QUEUE = Object.freeze({
  active: null,
  pending: [],
});

export function toastQueueReducer(state, action) {
  switch (action.type) {
    case "enqueue": {
      if (!state.active) return { active: action.toast, pending: [] };

      const maxQueue = Math.max(1, Number(action.maxQueue) || 5);
      const pendingCapacity = maxQueue - 1;
      if (!pendingCapacity) return state;

      return {
        active: state.active,
        pending: [...state.pending, action.toast].slice(-pendingCapacity),
      };
    }
    case "dismiss": {
      if (!action.id || action.id === state.active?.id) {
        const [next = null, ...pending] = state.pending;
        return { active: next, pending };
      }
      return {
        active: state.active,
        pending: state.pending.filter((toast) => toast.id !== action.id),
      };
    }
    case "clear":
      return INITIAL_TOAST_QUEUE;
    default:
      return state;
  }
}
