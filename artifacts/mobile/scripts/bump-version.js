const fs = require("fs");
const path = require("path");

const appJsonPath = path.resolve(__dirname, "../app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

const oldVersion = appJson.expo.version;
const parts = oldVersion.split(".").map(Number);

parts[parts.length - 1] += 1;

const newVersion = parts.join(".");
appJson.expo.version = newVersion;

const versionCode = parseInt(parts.join(""), 10);
if (!appJson.expo.android) appJson.expo.android = {};
appJson.expo.android.versionCode = versionCode;

if (!appJson.expo.ios) appJson.expo.ios = {};
appJson.expo.ios.buildNumber = newVersion;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");

console.log(`Version bumped: ${oldVersion} → ${newVersion} (versionCode: ${versionCode})`);
