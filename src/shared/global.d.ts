import type { FluxmailDesktopApi } from "./contracts";

declare global {
  interface Window {
    fluxmail: FluxmailDesktopApi;
  }
}

export {};
