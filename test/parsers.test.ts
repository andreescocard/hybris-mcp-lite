import { describe, expect, it } from "vitest";
import { isPrivateHost } from "../src/guard.js";
import { extractCsrf, parseFlexibleSearchResponse } from "../src/htmlParse.js";
import { maskConfig } from "../src/mask.js";

describe("FlexibleSearch response parsing", () => {
  it("extracts headers and rows from HAC-style tables", () => {
    const parsed = parseFlexibleSearchResponse(`
      <table>
        <thead><tr><th>PK</th><th>Code</th></tr></thead>
        <tbody><tr><td>8796</td><td>Product</td></tr></tbody>
      </table>
    `, 10);

    expect(parsed).toEqual({
      columns: ["PK", "Code"],
      rows: [{ PK: "8796", Code: "Product" }],
      truncated: false
    });
  });

  it("caps rows and marks truncation", () => {
    const parsed = parseFlexibleSearchResponse(`
      <table>
        <tr><th>count</th></tr>
        <tr><td>1</td></tr>
        <tr><td>2</td></tr>
      </table>
    `, 1);

    expect(parsed.rows).toEqual([{ count: "1" }]);
    expect(parsed.truncated).toBe(true);
  });
});

describe("CSRF extraction", () => {
  it("reads the token from a hidden input", () => {
    expect(extractCsrf('<input type="hidden" name="_csrf" value="abc-123"/>')).toBe("abc-123");
  });
});

describe("private host guard", () => {
  it.each(["localhost", "127.0.0.1", "127.5.5.5", "[::1]", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.10", "hac.local", "dev.localhost"])(
    "allows %s", (host) => expect(isPrivateHost(host)).toBe(true)
  );

  it.each(["example.com", "172.32.0.1", "172.15.0.1", "192.169.0.1", "8.8.8.8", "10.evil.com", "localhost.example.com", "300.1.1.1"])(
    "rejects %s", (host) => expect(isPrivateHost(host)).toBe(false)
  );
});

describe("config masking", () => {
  it("masks sensitive keys in a full property listing", () => {
    const masked = maskConfig({ properties: { "db.password": "x", "build.version": "1", "api.Token": "y" } });
    expect(masked).toEqual({ properties: { "db.password": "****", "build.version": "1", "api.Token": "****" } });
  });

  it("masks a single sensitive key lookup", () => {
    expect(maskConfig({ key: "media.secret.key", value: "abc" })).toEqual({ key: "media.secret.key", value: "****" });
    expect(maskConfig({ key: "build.version", value: "1" })).toEqual({ key: "build.version", value: "1" });
  });
});
