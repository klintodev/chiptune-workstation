function truncateToLength(value, maximumLength) {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maximumLength) break;
    result += character;
  }
  return result.trimEnd();
}

function normalizePart(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function createBoundedUniqueName(base, existingNames, {
  fallback = "Untitled",
  maximumLength,
  suffix = "",
} = {}) {
  if (!Number.isInteger(maximumLength) || maximumLength < 1) {
    throw new RangeError("A generated-name limit must be a positive integer.");
  }
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames);
  const normalizedFallback = normalizePart(fallback) || "Untitled";
  const normalizedBase = normalizePart(base) || normalizedFallback;
  const normalizedSuffix = normalizePart(suffix);
  const descriptiveSuffix = normalizedSuffix ? ` ${normalizedSuffix}` : "";

  function candidate(number = null) {
    const numericSuffix = number === null ? "" : ` ${number}`;
    const reserved = `${descriptiveSuffix}${numericSuffix}`;
    if (reserved.length >= maximumLength) {
      throw new RangeError("Generated-name suffix does not fit inside its length limit.");
    }
    const fittedBase = truncateToLength(normalizedBase, maximumLength - reserved.length)
      || truncateToLength(normalizedFallback, maximumLength - reserved.length)
      || "X";
    return `${fittedBase}${reserved}`;
  }

  const first = candidate();
  if (!names.has(first)) return first;
  let number = 2;
  while (names.has(candidate(number))) number += 1;
  return candidate(number);
}
