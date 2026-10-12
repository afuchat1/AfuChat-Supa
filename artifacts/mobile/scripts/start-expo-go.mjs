import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import QRCode from "qrcode";

const port = 8000;
const bundlePath =
  "/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable";

const expoSession = process.env.REPLIT_EXPO_SESSION_SECRET;
if (expoSession) {
  const login = spawnSync(
    "pnpm",
    ["exec", "create-launch", "login", "--session", expoSession],
    { env: process.env, stdio: "inherit" },
  );
  if (login.error || login.status !== 0) {
    console.warn(
      "Replit-managed Expo CLI sign-in did not complete; continuing to start Metro.",
    );
  }
}

const expo = spawn(
  "pnpm",
  ["exec", "expo", "start", "--go", "--lan", "--port", String(port)],
  {
    env: process.env,
    // Expo CLI treats a TTY as interactive and waits at its optional account
    // prompt. A piped stdout keeps logs visible while allowing anonymous mode.
    stdio: ["ignore", "pipe", "inherit"],
  },
);
expo.stdout?.pipe(process.stdout);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bundleIsReady() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: bundlePath,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );

    request.setTimeout(5000, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function warmAndroidBundle() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (expo.exitCode !== null) return;
    if (await bundleIsReady()) {
      console.log("Expo Android bundle warmed and ready for Expo Go.");
      const domain = process.env.REPLIT_DEV_DOMAIN;
      if (!domain) {
        console.warn("Secure Expo Go QR unavailable: REPLIT_DEV_DOMAIN is not set.");
        return;
      }

      const secureUrl = `exps://${domain}:${port}`;
      console.log(
        "Use this HTTPS-backed Expo Go QR, not Metro's exp:// QR; Replit's forwarded port requires HTTPS.",
      );
      console.log(`Secure Expo Go URL: ${secureUrl}`);
      console.log(await QRCode.toString(secureUrl, { type: "terminal", small: true }));
      return;
    }
    await sleep(2000);
  }

  console.warn("Expo Android bundle did not finish warming before the startup timeout.");
}

expo.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    expo.kill(signal);
  });
}

warmAndroidBundle().catch((error) => {
  console.warn("Expo bundle warm-up failed:", error);
});