import {
  DOMAIN_ID_PATTERN,
  MAX_PROJECT_STRUCTURE_DEPTH,
  MAX_PROJECT_STRUCTURE_NODES,
  MIGRATION_ID_NAMESPACE,
} from "./constants.js";

/**
 * Reject hostile JSON-shaped graphs before migration or recursive domain
 * validation touches them. A node is every JSON value (containers and scalar
 * children); the root is depth zero. Shared/cyclic object references are also
 * rejected because they cannot occur in a parsed Project document.
 */
export function assertBoundedV2Structure(value, {
  label = "Project data",
  maximumDepth = MAX_PROJECT_STRUCTURE_DEPTH,
  maximumNodes = MAX_PROJECT_STRUCTURE_NODES,
} = {}) {
  const seen = new WeakSet();
  const pending = [{ depth: 0, value }];
  let nodeCount = 1;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value)) {
      throw new TypeError(`${label} must be an acyclic JSON structure without shared objects.`);
    }
    seen.add(current.value);

    const keys = Array.isArray(current.value) ? null : Object.keys(current.value);
    const childCount = Array.isArray(current.value) ? current.value.length : keys.length;
    if (childCount > maximumNodes - nodeCount) {
      throw new RangeError(`${label} exceeds the structural node limit of ${maximumNodes}.`);
    }
    if (childCount > 0 && current.depth >= maximumDepth) {
      throw new RangeError(`${label} exceeds the maximum structural depth of ${maximumDepth}.`);
    }
    nodeCount += childCount;

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: current.depth + 1, value: current.value[index] });
      }
    } else {
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: current.depth + 1, value: current.value[keys[index]] });
      }
    }
  }

  return true;
}

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
}

export function assertExactKeys(value, expectedKeys, label) {
  assertRecord(value, label);
  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  const unexpected = actualKeys.filter((key) => !expected.has(key));
  const missing = expectedKeys.filter((key) => !Object.hasOwn(value, key));
  if (unexpected.length > 0 || missing.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
    if (unexpected.length > 0) parts.push(`unknown ${unexpected.join(", ")}`);
    throw new TypeError(`${label} has invalid keys (${parts.join("; ")}).`);
  }
}

export function assertFiniteNumber(value, label, minimum = -Infinity, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

export function assertInteger(value, label, minimum = -Infinity, maximum = Infinity) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
}

export function assertBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
}

export function assertEnum(value, values, label) {
  if (!values.includes(value)) throw new RangeError(`${label} is unsupported: ${value}.`);
}

export function assertDomainId(value, label = "Identifier") {
  if (typeof value !== "string" || !DOMAIN_ID_PATTERN.test(value)) {
    throw new RangeError(`${label} must match [A-Za-z0-9_-]{1,64}.`);
  }
}

export function assertName(value, label, maximumLength) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximumLength) {
    throw new TypeError(`${label} must contain 1 to ${maximumLength} characters.`);
  }
}

export function compareIds(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeIdPrefix(namespace) {
  const prefix = String(namespace).replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (prefix || "id").slice(0, 24);
}

export function createDeterministicMigrationId(namespace, seed, occupied = new Set()) {
  const prefix = normalizeIdPrefix(namespace);
  const digest = fnv1a32(`${MIGRATION_ID_NAMESPACE}\u0000${namespace}\u0000${seed}`).toString(36);
  const base = `${prefix}-${digest}`.slice(0, 64);
  if (!occupied.has(base)) return base;
  let attempt = 2;
  while (true) {
    const suffix = `-${attempt}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
    attempt += 1;
  }
}

export function allocateMigratedId(desired, namespace, seed, occupied) {
  const id = typeof desired === "string" && DOMAIN_ID_PATTERN.test(desired) && !occupied.has(desired)
    ? desired
    : createDeterministicMigrationId(namespace, seed, occupied);
  occupied.add(id);
  return id;
}

export function nextDomainId(prefix, occupied) {
  let number = 1;
  while (occupied.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}

export function createBoundedUniqueName(base, existingNames, { fallback, maximumLength, suffix = "" }) {
  const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const truncate = (value, maximum) => Array.from(value).slice(0, maximum).join("").trimEnd();
  const names = existingNames instanceof Set ? existingNames : new Set(existingNames);
  const safeFallback = normalize(fallback) || "Untitled";
  const safeBase = normalize(base) || safeFallback;
  const safeSuffix = normalize(suffix);
  const descriptiveSuffix = safeSuffix ? ` ${safeSuffix}` : "";
  const makeCandidate = (number = null) => {
    const numericSuffix = number === null ? "" : ` ${number}`;
    const reserved = `${descriptiveSuffix}${numericSuffix}`;
    const fitted = truncate(safeBase, maximumLength - reserved.length)
      || truncate(safeFallback, maximumLength - reserved.length)
      || "X";
    return `${fitted}${reserved}`;
  };
  let candidate = makeCandidate();
  if (!names.has(candidate)) return candidate;
  let number = 2;
  do candidate = makeCandidate(number++); while (names.has(candidate));
  return candidate;
}

export class V2DomainError extends RangeError {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "V2DomainError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}
