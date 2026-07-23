function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Return a deterministic JSON encoding.
 *
 * Unlike `JSON.stringify`, this function rejects values that do not have a
 * portable JSON representation. That keeps metadata commitments identical
 * across runtimes and prevents an `undefined`, `BigInt`, class instance, or
 * cyclic value from being signed differently than it is displayed.
 */
export function stableJson(value: unknown): string {
  return serializeJson(value, new Set<object>());
}

function serializeJson(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    throw new TypeError(`Value of type ${typeof value} is not valid JSON`);
  }

  if (ancestors.has(value)) {
    throw new TypeError("Cyclic values are not valid JSON");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return `[${value.map(item => serializeJson(item, ancestors)).join(",")}]`;
    }

    if (!isPlainObject(value)) {
      throw new TypeError("Only plain objects are valid JSON objects");
    }

    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );

    return `{${entries
      .map(([key, entryValue]) => {
        if (entryValue === undefined) {
          throw new TypeError(`JSON object property ${key} is undefined`);
        }
        return `${JSON.stringify(key)}:${serializeJson(entryValue, ancestors)}`;
      })
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
