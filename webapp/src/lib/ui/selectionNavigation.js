export function enabledIndexes(items = []) {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && !item.disabled)
    .map(({ index }) => index);
}

export function nextEnabledIndex(items, currentIndex, key, orientation = "horizontal") {
  const indexes = enabledIndexes(items);
  if (!indexes.length) return -1;
  if (key === "Home") return indexes[0];
  if (key === "End") return indexes[indexes.length - 1];

  const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  if (key !== previousKey && key !== nextKey) return -1;

  const position = indexes.indexOf(currentIndex);
  const start = position >= 0 ? position : 0;
  const offset = key === nextKey ? 1 : -1;
  return indexes[(start + offset + indexes.length) % indexes.length];
}
