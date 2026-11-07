import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const appRoot = join(mobileRoot, "app");
const outputPath = join(mobileRoot, "lib", "generatedRouteManifest.ts");
const checkOnly = process.argv.includes("--check");

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await routeFiles(filePath)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

function routePathsFromFile(filePath) {
  const relativePath = relative(appRoot, filePath).replaceAll("\\", "/");
  const parts = relativePath.replace(/\.(?:ts|tsx)$/, "").split("/");
  const fileName = parts.at(-1);
  // Expo Router reserves _layout for layout config; other underscore-prefixed
  // files (for example _tabLayout.tsx) are routable and appear in its sitemap.
  if (!fileName || fileName === "_layout" || fileName.startsWith("+")) return [];

  const routeParts = [...parts];
  if (routeParts.at(-1) === "index") routeParts.pop();

  const canonicalParts = routeParts.filter((part) => !/^\([^/]+\)$/.test(part));
  const canonical = `/${canonicalParts.join("/")}`.replace(/\/$/, "") || "/";
  const grouped = `/${routeParts.join("/")}`.replace(/\/$/, "") || "/";
  return [...new Set([canonical, ...(grouped !== canonical ? [grouped] : [])])];
}

const files = await routeFiles(appRoot);
const canonicalRoutes = new Set();
const groupedRoutes = new Set();

for (const filePath of files) {
  const [canonical, grouped] = routePathsFromFile(filePath);
  if (!canonical) continue;
  canonicalRoutes.add(canonical);
  if (grouped && grouped !== canonical) groupedRoutes.add(grouped);
}

const sortedCanonical = [...canonicalRoutes].sort((a, b) => a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b));
const sortedGrouped = [...groupedRoutes].sort((a, b) => a.localeCompare(b));
const generated = `/* Generated from app/ by scripts/generate-route-manifest.mjs. Do not edit by hand. */
export const APP_ROUTE_PATHS = ${JSON.stringify(sortedCanonical, null, 2)} as const;

export const APP_GROUPED_ROUTE_PATHS = ${JSON.stringify(sortedGrouped, null, 2)} as const;
`;

if (checkOnly) {
  let current = "";
  try {
    current = await readFile(outputPath, "utf8");
  } catch {}
  if (current !== generated) {
    console.error("Route manifest is out of date. Run node scripts/generate-route-manifest.mjs.");
    process.exit(1);
  }
  console.log(`Route manifest is current (${sortedCanonical.length} app paths).`);
} else {
  await writeFile(outputPath, generated);
  console.log(`Generated ${sortedCanonical.length} app paths and ${sortedGrouped.length} grouped aliases.`);
}
