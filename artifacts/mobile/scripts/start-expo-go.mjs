import { spawn } from "node:child_process";
import http from "node:http";

const port = 8000;
const bundlePath =
  "/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&unstable_transformProfile=hermes-stable";

const expo = spawn(
  "pnpm",
  ["exec", "expo", "start", "--go", "--lan", "--port", String(port)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

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