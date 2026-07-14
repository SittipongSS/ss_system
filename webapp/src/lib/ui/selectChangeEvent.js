export function createSelectChangeEvent(value, name = "") {
  const target = { value, name };
  let defaultPrevented = false;
  let propagationStopped = false;

  return {
    target,
    currentTarget: target,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
    isPropagationStopped() {
      return propagationStopped;
    },
  };
}
