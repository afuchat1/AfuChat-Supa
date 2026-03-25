import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isDev = process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined;

const port = Number(process.env.PORT) || 3000;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig(async () => ({
  base: basePath,

  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
        "https://rhnsjqqtdzlkvqazfcbg.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ""
    ),
  },

  plugins: [
    react(),
    tailwindcss(),

    ...(isDev
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then(
            (m) => (m.default || m.runtimeErrorOverlay)()
          ),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            (m.cartographer || m.default)({
              root: path.resolve(import.meta.dirname, ".."),
            })
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            (m.devBanner || m.default)()
          ),
        ]
      : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets"
      ),
    },
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },

  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
