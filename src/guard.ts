/**
 * Guardrail: this server is meant for local / development HAC instances only.
 * Refuse to start against a non-private host unless HAC_ALLOW_REMOTE=true.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1") {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b, c, d] = ipv4.slice(1).map(Number);
    if ([a, b, c, d].some((octet) => octet > 255)) {
      return false;
    }
    return a === 127
      || a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }

  return false;
}

export function assertAllowedHacUrl(url: URL): void {
  if (isPrivateHost(url.hostname)) {
    return;
  }
  if (process.env.HAC_ALLOW_REMOTE === "true") {
    return;
  }

  throw new Error(
    `Refusing to connect to non-private host "${url.hostname}". This server is intended for local/dev HAC only. Set HAC_ALLOW_REMOTE=true to override.`
  );
}
