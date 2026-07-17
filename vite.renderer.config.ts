import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), developmentCsp(command === "serve")],
}));

function developmentCsp(enabled: boolean): Plugin {
  return {
    name: "fluxmail-development-csp",
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        "connect-src 'none'",
        "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
      );
    },
  };
}
