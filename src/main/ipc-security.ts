export function isAllowedFrameUrl(url: string, developmentServerUrl?: string): boolean {
  try {
    const candidate = new URL(url);
    if (candidate.protocol === "app:" && candidate.hostname === "fluxmail") return true;
    if (!developmentServerUrl) return false;
    return candidate.origin === new URL(developmentServerUrl).origin;
  } catch {
    return false;
  }
}
