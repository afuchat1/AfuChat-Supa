// Web stub for the local SQLite database.
// Metro automatically picks this file over db.ts when bundling for web
// (platform extension resolution: .web.ts > .ts).
//
// expo-sqlite's web implementation requires a WebAssembly file that is not
// included in the npm package, so importing it crashes the web build.
// The app is mobile-first; the web preview uses an in-memory no-op so the
// bundle compiles cleanly without any SQLite dependency on web.

export type DB = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
};

const stub: DB = {
  execAsync: async () => {},
  runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
};

export async function getDB(): Promise<DB> {
  return stub;
}
