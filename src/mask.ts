const SENSITIVE_KEY = /pass|secret|token|key|credential/i;
const MASK = "****";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/** Mask values of sensitive-looking configuration keys in a config_get payload. */
export function maskConfig(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;

  if (record.properties && typeof record.properties === "object") {
    const masked = Object.fromEntries(
      Object.entries(record.properties as Record<string, unknown>).map(([key, value]) => [
        key,
        isSensitiveKey(key) && value !== null && value !== undefined ? MASK : value
      ])
    );
    return { ...record, properties: masked };
  }

  if (typeof record.key === "string" && isSensitiveKey(record.key) && record.value !== null && record.value !== undefined) {
    return { ...record, value: MASK };
  }

  return payload;
}
