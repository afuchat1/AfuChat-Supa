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
  ["exec", "expo", "start", "--go", "--tunnel", "--port", String(port)],
  {
    env: process.env,
    // A piped stdout keeps logs visible while Expo CLI uses its anonymous,
    // non-interactive startup instead of waiting at the account prompt.
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

function getExpoGoUrl() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        headers: {
          accept: "application/expo+json",
          "expo-platform": "android",
          "expo-protocol-version": "1",
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            resolve(null);
            return;
          }
          try {
            const manifest = JSON.parse(body);
            const host = manifest.extra?.expoGo?.debuggerHost;
            resolve(host ? `exp://${host}` : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    request.setTimeout(5000, () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

async function warmAndroidBundle() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (expo.exitCode !== null) return;
    if (await bundleIsReady()) {
      const expoGoUrl = await getExpoGoUrl();
      if (!expoGoUrl) {
        console.warn("Android bundle is ready, but the Expo Go tunnel URL is unavailable.");
        return;
      }
      console.log("Expo Android bundle warmed and ready for Expo Go.");
      console.log(`Expo Go tunnel URL: ${expoGoUrl}`);
      console.log(await QRCode.toString(expoGoUrl, { type: "terminal", small: true }));
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