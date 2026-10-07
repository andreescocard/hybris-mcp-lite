export type FlexibleSearchResult = {
  columns: string[];
  rows: Record<string, string>[];
  truncated: boolean;
};

export type GroovyResult = {
  executionResult: string;
  outputText: string;
  stacktrace?: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

export function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|pre|textarea)>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstCapture(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return stripTags(match[1]);
    }
  }

  return "";
}

export function extractCsrf(html: string): string | undefined {
  const inputMatch = html.match(/<input[^>]+name=["']_csrf["'][^>]*>/i);
  const token = inputMatch?.[0].match(/value=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+name=["']_csrf["'][^>]*>/i)?.[0].match(/content=["']([^"']+)["']/i)?.[1];

  return token ? decodeHtml(token) : undefined;
}

export function parseGroovyResponse(htmlOrJson: string): GroovyResult {
  const json = tryParseJson(htmlOrJson);
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    return {
      executionResult: stringifyField(record.executionResult ?? record.result ?? ""),
      outputText: stringifyField(record.outputText ?? record.output ?? ""),
      stacktrace: optionalString(record.stacktrace ?? record.exception ?? record.error)
    };
  }

  return {
    executionResult: firstCapture(htmlOrJson, [
      /id=["']executionResult["'][^>]*>([\s\S]*?)<\/(?:textarea|pre|div)>/i,
      /class=["'][^"']*executionResult[^"']*["'][^>]*>([\s\S]*?)<\/(?:pre|div|td)>/i,
      /Execution Result<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/(?:pre|div|td)>/i
    ]),
    outputText: firstCapture(htmlOrJson, [
      /id=["']outputText["'][^>]*>([\s\S]*?)<\/(?:textarea|pre|div)>/i,
      /class=["'][^"']*outputText[^"']*["'][^>]*>([\s\S]*?)<\/(?:pre|div|td)>/i,
      /Output Text<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/(?:pre|div|td)>/i
    ]),
    stacktrace: firstCapture(htmlOrJson, [
      /id=["']stacktrace["'][^>]*>([\s\S]*?)<\/(?:textarea|pre|div)>/i,
      /class=["'][^"']*(?:stacktrace|exception|error)[^"']*["'][^>]*>([\s\S]*?)<\/(?:pre|div|td)>/i
    ]) || undefined
  };
}

export function parseFlexibleSearchResponse(htmlOrJson: string, requestedMaxCount: number): FlexibleSearchResult {
  const json = tryParseJson(htmlOrJson);
  if (json && typeof json === "object") {
    const parsed = parseFlexibleSearchJson(json as Record<string, unknown>, requestedMaxCount);
    if (parsed) {
      return parsed;
    }
  }

  const tableMatch = htmlOrJson.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    const text = stripTags(htmlOrJson);
    return {
      columns: text ? ["message"] : [],
      rows: text ? [{ message: text }] : [],
      truncated: false
    };
  }

  const table = tableMatch[0];
  const headerCells = Array.from(table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((match) => stripTags(match[1]));
  const rowMatches = Array.from(table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  const rows: Record<string, string>[] = [];
  let columns = headerCells.filter(Boolean);

  for (const rowMatch of rowMatches) {
    const cells = Array.from(rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => stripTags(match[1]));
    if (cells.length === 0) {
      continue;
    }

    if (columns.length === 0) {
      columns = cells.map((_, index) => `column${index + 1}`);
    }

    const row: Record<string, string> = {};
    cells.slice(0, columns.length).forEach((cell, index) => {
      row[columns[index] ?? `column${index + 1}`] = cell;
    });
    rows.push(row);
  }

  const cappedRows = rows.slice(0, requestedMaxCount);
  return {
    columns,
    rows: cappedRows,
    truncated: rows.length > cappedRows.length || /truncated|maximum|maxCount/i.test(stripTags(htmlOrJson))
  };
}

function parseFlexibleSearchJson(record: Record<string, unknown>, requestedMaxCount: number): FlexibleSearchResult | undefined {
  const rawRows = (record.rows ?? record.resultList ?? record.data) as unknown;
  if (!Array.isArray(rawRows)) {
    return undefined;
  }

  const rows = rawRows.map((row) => {
    if (Array.isArray(row)) {
      return Object.fromEntries(row.map((value, index) => [`column${index + 1}`, stringifyField(value)]));
    }

    if (row && typeof row === "object") {
      return Object.fromEntries(
        Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, stringifyField(value)])
      );
    }

    return { value: stringifyField(row) };
  });

  const columns = Array.isArray(record.columns)
    ? record.columns.map((column) => stringifyField(column))
    : Object.keys(rows[0] ?? {});
  const cappedRows = rows.slice(0, requestedMaxCount);

  return {
    columns,
    rows: cappedRows,
    truncated: Boolean(record.truncated) || rows.length > cappedRows.length
  };
}

export function stringifyField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return stripTags(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  return JSON.stringify(value);
}

function optionalString(value: unknown): string | undefined {
  const text = stringifyField(value);
  return text || undefined;
}

export function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
