import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertAllowedHacUrl } from "./guard.js";
import {
  extractCsrf,
  parseFlexibleSearchResponse,
  parseGroovyResponse,
  type FlexibleSearchResult,
  type GroovyResult
} from "./htmlParse.js";

type Cookie = {
  name: string;
  value: string;
};

type RequestOptions = {
  retryAuth?: boolean;
  timeoutMs?: number;
};

export class HacClient {
  private readonly baseUrl: URL;
  private readonly user: string;
  private readonly pass: string;
  private cookies = new Map<string, Cookie>();
  private csrf?: string;

  constructor() {
    const hacUrl = process.env.HAC_URL ?? "https://localhost:9002/hac";
    const user = process.env.HAC_USER;
    const pass = process.env.HAC_PASS;

    if (!user || !pass) {
      throw new Error("HAC_USER and HAC_PASS environment variables are required.");
    }

    this.baseUrl = new URL(hacUrl.endsWith("/") ? hacUrl : `${hacUrl}/`);
    assertAllowedHacUrl(this.baseUrl);
    this.user = user;
    this.pass = pass;
  }

  async flexibleSearch(query: string, maxCount: number, translate = false): Promise<FlexibleSearchResult | { sql: string }> {
    if (translate) {
      const html = await this.postConsole("console/flexsearch/translate", {
        flexibleSearchQuery: query,
        user: "admin"
      });
      return { sql: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() };
    }

    const html = await this.postConsole("console/flexsearch/execute", {
      flexibleSearchQuery: query,
      maxCount: String(maxCount),
      user: "admin"
    });

    return parseFlexibleSearchResponse(html, maxCount);
  }

  async groovyJson<T = unknown>(script: string): Promise<T> {
    const result = await this.runReadOnlyGroovy(script);
    const payload = result.executionResult || result.outputText;
    if (!payload) {
      throw new Error(`Groovy JSON template returned no payload.${result.stacktrace ? ` Stacktrace: ${result.stacktrace}` : ""}`);
    }

    const parsed = JSON.parse(payload) as T;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const error = parsed as { error?: string; message?: string; stacktrace?: string };
      throw new Error(`Groovy template failed: ${error.error ?? "Error"} ${error.message ?? ""}${error.stacktrace ? `\n${error.stacktrace}` : ""}`.trim());
    }

    return parsed;
  }

  // Read tools only ever submit Groovy with commit=false, so HAC rolls back any
  // write. This is the only code path that talks to the scripting console.
  private async runReadOnlyGroovy(script: string): Promise<GroovyResult> {
    const html = await this.postConsole("console/scripting/execute", {
      script,
      commit: "false",
      scriptType: "groovy",
      language: "groovy"
    });

    return parseGroovyResponse(html);
  }

  async logsTail(lines: number, grep?: string): Promise<{ path: string; lines: string[]; grep?: string }> {
    const path = resolveLogPath();
    const content = await readFile(path, "utf8");
    let logLines = content.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    if (grep) {
      const pattern = new RegExp(grep, "i");
      logLines = logLines.filter((line) => pattern.test(line));
    }

    return {
      path,
      lines: logLines.slice(-lines),
      grep
    };
  }

  private async postConsole(path: string, body: Record<string, string>, options: RequestOptions = {}): Promise<string> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      ...body,
      _csrf: this.csrf ?? ""
    });
    const response = await this.fetchWithTimeout(this.url(path), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "cookie": this.cookieHeader(),
        "accept": "application/json, text/html, */*",
        "x-csrf-token": this.csrf ?? ""
      },
      body: params,
      redirect: "manual"
    }, options.timeoutMs);

    this.storeCookies(response.headers);

    // HAC answers a rejected/expired CSRF token with 405, not 403.
    const staleCsrf = response.status === 405;
    if ((this.needsLogin(response) || staleCsrf) && options.retryAuth !== false) {
      this.csrf = undefined;
      this.cookies.clear();
      await this.login();
      return this.postConsole(path, body, { retryAuth: false });
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HAC POST ${path} failed with HTTP ${response.status}: ${text.slice(0, 2000)}`);
    }

    return text;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.csrf || this.cookies.size === 0) {
      await this.login();
    }
  }

  private async login(): Promise<void> {
    const loginPage = await this.fetchWithTimeout(this.url("login"), {
      headers: {
        "cookie": this.cookieHeader(),
        "accept": "text/html"
      },
      redirect: "manual"
    });
    this.storeCookies(loginPage.headers);
    const loginHtml = await loginPage.text();
    const csrf = extractCsrf(loginHtml);

    if (!csrf) {
      throw new Error("Could not find HAC login _csrf token.");
    }

    const params = new URLSearchParams({
      j_username: this.user,
      j_password: this.pass,
      _csrf: csrf
    });
    const response = await this.fetchWithTimeout(this.url("j_spring_security_check"), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "cookie": this.cookieHeader()
      },
      body: params,
      redirect: "manual"
    });

    this.storeCookies(response.headers);

    if (![200, 302, 303].includes(response.status)) {
      const text = await response.text();
      throw new Error(`HAC login failed with HTTP ${response.status}: ${text.slice(0, 2000)}`);
    }

    const landingPage = await this.fetchWithTimeout(this.url(""), {
      headers: {
        "cookie": this.cookieHeader(),
        "accept": "text/html"
      },
      redirect: "manual"
    });
    this.storeCookies(landingPage.headers);

    if (this.needsLogin(landingPage) || !landingPage.ok) {
      throw new Error("HAC login did not establish an authenticated session.");
    }

    // Spring rotates the CSRF token on authentication, so the pre-login token is
    // never a valid fallback here — HAC rejects a stale token with HTTP 405.
    const landingHtml = await landingPage.text();
    const sessionCsrf = extractCsrf(landingHtml);
    if (!sessionCsrf) {
      throw new Error("Could not find post-login HAC _csrf token.");
    }

    this.csrf = sessionCsrf;
  }

  private needsLogin(response: Response): boolean {
    const location = response.headers.get("location") ?? "";
    return response.status === 401
      || response.status === 403
      || (response.status >= 300 && response.status < 400 && /login|j_spring_security_check/i.test(location));
  }

  private url(path: string): URL {
    return new URL(path.replace(/^\//, ""), this.baseUrl);
  }

  private async fetchWithTimeout(url: URL, init: RequestInit, timeoutMs = Number(process.env.HAC_TIMEOUT_MS ?? 30000)): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.values()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  private storeCookies(headers: Headers): void {
    const setCookie = getSetCookieHeaders(headers);
    for (const header of setCookie) {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      this.cookies.set(name, { name, value });
    }
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withMethod = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withMethod.getSetCookie === "function") {
    return withMethod.getSetCookie();
  }

  const header = headers.get("set-cookie");
  return header ? [header] : [];
}

function resolveLogPath(): string {
  const configured = process.env.HAC_LOG_PATH;
  if (!configured) {
    throw new Error("HAC_LOG_PATH is not set. Point it at the local console log file to use logs_tail.");
  }

  return resolve(configured);
}
