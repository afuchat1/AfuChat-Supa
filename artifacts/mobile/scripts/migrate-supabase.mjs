import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const sourceRef = "rhnsjqqtdzlkvqazfcbg";
const targetProjectUrl = "https://poijhidfekwfthyksatp.supabase.co";
const sourceSqlUrl = `https://api.supabase.com/v1/projects/${sourceRef}/database/query`;
const targetRestUrl = `${targetProjectUrl}/rest/v1`;
const targetPooler = process.env.NEW_SUPABASE_POOLER_URL;
const sourceAccessToken = process.env.SUPABASE_ACCESS_TOKEN;
const targetServiceRole = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
const mode = process.argv[2] ?? "schema";

if (!targetPooler || !sourceAccessToken || !targetServiceRole) {
  throw new Error("Required migration secrets are not available.");
}

const q = async (sql) => {
  const response = await fetch(sourceSqlUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sourceAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Source SQL ${response.status}: ${text.slice(0, 500)}`);
  }
  const result = JSON.parse(text);
  if (!Array.isArray(result)) {
    throw new Error(`Source SQL returned a non-row result: ${text.slice(0, 500)}`);
  }
  return result;
};

const sqlIdent = (value) => `"${String(value).replaceAll('"', '""')}"`;
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const publicToAfuchat = (value) =>
  String(value).replaceAll(/\bpublic\./g, "afuchat.");

const runPsql = (sql, label) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        targetPooler,
        "-X",
        "-A",
        "-t",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=terse",
        "-c",
        sql,
      ],
      { env: { ...process.env, PGSSLMODE: "require" }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed: ${stderr.slice(0, 2000)}`));
      } else {
        resolve(stdout);
      }
    });
  });

const runPsqlFile = (file, label) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [targetPooler, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-f", file],
      { env: { ...process.env, PGSSLMODE: "require" }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed: ${stderr.slice(0, 3000)}`));
      } else {
        resolve(stdout);
      }
    });
  });

const queryMetadata = async () => {
  const [tables, columns, enums, sequences, constraints, indexes, policies, functions, triggers] =
    await Promise.all([
      q(`
        select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity,
               case c.relreplident when 'f' then 'full' when 'i' then 'index'
                    when 'n' then 'nothing' else 'default' end as replica_identity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname
      `),
      q(`
        select c.relname as table_name, a.attnum, a.attname as column_name,
               format_type(a.atttypid, a.atttypmod) as type_sql,
               a.attnotnull as not_null, a.attidentity, a.attgenerated,
               pg_get_expr(d.adbin, d.adrelid) as default_sql
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname, a.attnum
      `),
      q(`
        select t.typname as type_name,
               array_to_json(array_agg(e.enumlabel order by e.enumsortorder)) as labels
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        join pg_enum e on e.enumtypid = t.oid
        where n.nspname = 'public'
        group by t.typname
        order by t.typname
      `),
      q(`
        select sequence_name
        from information_schema.sequences
        where sequence_schema = 'public'
        order by sequence_name
      `),
      q(`
        select c.relname as table_name, con.conname as constraint_name,
               con.contype, replace(pg_get_constraintdef(con.oid, true), 'public.', 'afuchat.') as constraint_sql
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and con.contype in ('p','u','f','c','x')
        order by c.relname, con.conname
      `),
      q(`
        select c.relname as table_name, i.relname as index_name,
               replace(pg_get_indexdef(i.oid), 'public.', 'afuchat.') as index_sql
        from pg_index ix
        join pg_class c on c.oid = ix.indrelid
        join pg_class i on i.oid = ix.indexrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not ix.indisprimary
          and not exists (
            select 1 from pg_constraint con
            where con.conindid = ix.indexrelid
          )
        order by c.relname, i.relname
      `),
      q(`
        select tablename as table_name, policyname, permissive, roles, cmd,
               array_to_json(roles) as roles_json, qual, with_check
        from pg_policies
        where schemaname = 'public'
        order by tablename, policyname
      `),
      q(`
        select p.oid, pg_get_functiondef(p.oid) as function_sql
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
        order by p.proname, p.oid
      `),
      q(`
        select c.relname as table_name, pg_get_triggerdef(t.oid, true) as trigger_sql
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by c.relname, t.tgname
      `),
    ]);
  return { tables, columns, enums, sequences, constraints, indexes, policies, functions, triggers };
};

const createSchemaSql = (meta) => {
  const lines = [
    "BEGIN;",
    "CREATE SCHEMA IF NOT EXISTS afuchat;",
    "GRANT USAGE ON SCHEMA afuchat TO anon, authenticated, service_role;",
  ];

  for (const type of meta.enums) {
    const labels = type.labels.map((label) => sqlLiteral(label)).join(", ");
    lines.push(
      `DO $$ BEGIN CREATE TYPE afuchat.${sqlIdent(type.type_name)} AS ENUM (${labels}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  for (const sequence of meta.sequences) {
    lines.push(`CREATE SEQUENCE IF NOT EXISTS afuchat.${sqlIdent(sequence.sequence_name)};`);
  }

  const columnsByTable = new Map();
  for (const column of meta.columns) {
    const list = columnsByTable.get(column.table_name) ?? [];
    list.push(column);
    columnsByTable.set(column.table_name, list);
  }

  for (const table of meta.tables) {
    const columns = columnsByTable.get(table.table_name) ?? [];
    const definitions = columns.map((column) => {
      const generated =
        column.attgenerated === "s"
          ? ` GENERATED ALWAYS AS (${publicToAfuchat(column.default_sql)}) STORED`
          : "";
      const identity =
        column.attidentity === "a"
          ? " GENERATED ALWAYS AS IDENTITY"
          : column.attidentity === "d"
            ? " GENERATED BY DEFAULT AS IDENTITY"
            : "";
      const defaultSql =
        !generated && !identity && column.default_sql
          ? ` DEFAULT ${publicToAfuchat(column.default_sql)}`
          : "";
      const notNull = column.not_null ? " NOT NULL" : "";
      return `  ${sqlIdent(column.column_name)} ${publicToAfuchat(column.type_sql)}${defaultSql}${identity}${generated}${notNull}`;
    });
    lines.push(
      `CREATE TABLE IF NOT EXISTS afuchat.${sqlIdent(table.table_name)} (\n${definitions.join(",\n")}\n);`,
    );
  }

  for (const constraint of meta.constraints) {
    lines.push(
      `DO $$ BEGIN ALTER TABLE afuchat.${sqlIdent(constraint.table_name)} ADD CONSTRAINT ${sqlIdent(constraint.constraint_name)} ${constraint.constraint_sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  for (const index of meta.indexes) {
    lines.push(`${index.index_sql};`);
  }

  for (const table of meta.tables) {
    lines.push(`ALTER TABLE afuchat.${sqlIdent(table.table_name)} ENABLE ROW LEVEL SECURITY;`);
    if (table.relforcerowsecurity) {
      lines.push(`ALTER TABLE afuchat.${sqlIdent(table.table_name)} FORCE ROW LEVEL SECURITY;`);
    }
    if (table.replica_identity === "full") {
      lines.push(`ALTER TABLE afuchat.${sqlIdent(table.table_name)} REPLICA IDENTITY FULL;`);
    } else if (table.replica_identity === "nothing") {
      lines.push(`ALTER TABLE afuchat.${sqlIdent(table.table_name)} REPLICA IDENTITY NOTHING;`);
    }
  }

  for (const table of meta.tables) {
    const name = sqlIdent(table.table_name);
    lines.push(`DROP VIEW IF EXISTS public.${name} CASCADE;`);
    lines.push(`CREATE VIEW public.${name} WITH (security_invoker = true) AS SELECT * FROM afuchat.${name};`);
    lines.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${name} TO anon, authenticated, service_role;`);
    lines.push(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA afuchat TO anon, authenticated, service_role;`);
  }

  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
};

const createSecuritySql = (meta) => {
  const lines = ["BEGIN;"];

  for (const policy of meta.policies) {
    const policyRoles = policy.roles_json ?? ["public"];
    const roles = (Array.isArray(policyRoles) ? policyRoles : [String(policyRoles)])
      .map((role) => (role === "public" ? "public" : sqlIdent(role)))
      .join(", ");
    const mode = policy.permissive === "PERMISSIVE" ? "PERMISSIVE" : "RESTRICTIVE";
    const using = policy.qual ? ` USING (${policy.qual})` : "";
    const check = policy.with_check ? ` WITH CHECK (${policy.with_check})` : "";
    lines.push(
      `DROP POLICY IF EXISTS ${sqlIdent(policy.policyname)} ON afuchat.${sqlIdent(policy.table_name)};`,
      `CREATE POLICY ${sqlIdent(policy.policyname)} ON afuchat.${sqlIdent(policy.table_name)} AS ${mode} FOR ${policy.cmd} TO ${roles}${using}${check};`,
    );
  }

  for (const fn of meta.functions) {
    lines.push(fn.function_sql);
  }

  for (const trigger of meta.triggers) {
    lines.push(`${trigger.trigger_sql.replace(/\bON public\./g, "ON afuchat.")};`);
  }

  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
};

const createRealtimeSql = (meta) => {
  const lines = ["BEGIN;"];
  for (const table of meta.tables) {
    lines.push(
      `ALTER TABLE afuchat.${sqlIdent(table.table_name)} REPLICA IDENTITY FULL;`,
      `DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE afuchat.${sqlIdent(table.table_name)}; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;`,
    );
  }
  lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
};

const writeTemp = async (name, content) => {
  const file = path.join(os.tmpdir(), `afuchat-${name}-${process.pid}.sql`);
  await fs.writeFile(file, content, "utf8");
  return file;
};

const runSchema = async () => {
  const meta = await queryMetadata();
  console.log(`Source metadata: ${meta.tables.length} tables, ${meta.functions.length} functions, ${meta.policies.length} policies.`);
  const schemaFile = await writeTemp("schema", createSchemaSql(meta));
  await runPsqlFile(schemaFile, "schema phase");
  const securityFile = await writeTemp("security", createSecuritySql(meta));
  await runPsqlFile(securityFile, "security phase");
  const realtimeFile = await writeTemp("realtime", createRealtimeSql(meta));
  await runPsqlFile(realtimeFile, "realtime phase");
  console.log("Schema, compatibility views, functions, policies, triggers, and realtime configuration applied.");
};

const restHeaders = {
  apikey: targetServiceRole,
  Authorization: `Bearer ${targetServiceRole}`,
};

const insertJsonRows = async (schema, table, columns, rows) => {
  if (!rows.length) return;
  const stageFile = path.join(os.tmpdir(), `afuchat-stage-${process.pid}-${table}.csv`);
  const csv = rows
    .map((row) => {
      const value = JSON.stringify(row).replaceAll('"', '""');
      return `"${value}"`;
    })
    .join("\n");
  await fs.writeFile(stageFile, `${csv}\n`, "utf8");
  const columnList = columns.map((column) => sqlIdent(column)).join(", ");
  const targetType = `${schema}.${sqlIdent(table)}`;
  const sql = [
    "BEGIN;",
    "SET LOCAL session_replication_role = replica;",
    "CREATE TEMP TABLE afuchat_json_stage (payload jsonb) ON COMMIT DROP;",
    `\\copy afuchat_json_stage(payload) FROM ${sqlLiteral(stageFile)} WITH (FORMAT csv);`,
    `INSERT INTO ${targetType} (${columnList}) SELECT (jsonb_populate_record(NULL::${targetType}, payload)).* FROM afuchat_json_stage ON CONFLICT DO NOTHING;`,
    "COMMIT;",
  ].join("\n");
  const file = await writeTemp(`data-${table}`, sql);
  await runPsqlFile(file, `data phase ${schema}.${table}`);
  await fs.unlink(stageFile).catch(() => {});
};

const sourceRows = async (schema, table, offset, limit) => {
  const qualified = `${sqlIdent(schema)}.${sqlIdent(table)}`;
  const result = await q(
    `select row_to_json(t) as row from (select * from ${qualified} limit ${limit} offset ${offset}) t`,
  );
  return result.map((entry) => entry.row);
};

const targetColumns = async (schema, table) => {
  const escapedSchema = schema.replaceAll("'", "''");
  const escapedTable = table.replaceAll("'", "''");
  const output = await runPsql(
    `select column_name from information_schema.columns where table_schema = '${escapedSchema}' and table_name = '${escapedTable}' order by ordinal_position`,
    `target columns ${schema}.${table}`,
  );
  return output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const sourceCount = async (schema, table) => {
  const result = await q(
    `select count(*)::bigint as count from ${sqlIdent(schema)}.${sqlIdent(table)}`,
  );
  return Number(result[0]?.count ?? 0);
};

const migrateDataTable = async (schema, table) => {
  const count = await sourceCount(schema, table);
  if (!count) return 0;
  const columns = await targetColumns("afuchat", table);
  if (!columns.length) throw new Error(`Target table afuchat.${table} is missing.`);
  let copied = 0;
  for (let offset = 0; offset < count; offset += 500) {
    const rows = await sourceRows(schema, table, offset, 500);
    await insertJsonRows("afuchat", table, columns, rows);
    copied += rows.length;
  }
  console.log(`Copied ${copied} rows: ${schema}.${table}`);
  return copied;
};

const migrateAuthTable = async (table) => {
  const count = await sourceCount("auth", table);
  if (!count) return 0;
  const columns = await targetColumns("auth", table);
  if (!columns.length) {
    console.log(`Skipped unavailable target auth table: auth.${table}`);
    return 0;
  }
  let copied = 0;
  for (let offset = 0; offset < count; offset += 500) {
    const rows = await sourceRows("auth", table, offset, 500);
    await insertJsonRows("auth", table, columns, rows);
    copied += rows.length;
  }
  console.log(`Copied ${copied} rows: auth.${table}`);
  return copied;
};

const runData = async () => {
  const tables = await q(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  const authTables = ["users", "identities", "mfa_factors", "mfa_amr_claims", "user_roles"];
  let total = 0;
  for (const row of authTables) total += await migrateAuthTable(row);
  for (const row of tables) total += await migrateDataTable("public", row.table_name);
  console.log(`Data phase complete: ${total} rows copied.`);
};

if (mode === "schema") {
  await runSchema();
} else if (mode === "data") {
  await runData();
} else {
  throw new Error(`Unknown mode: ${mode}. Use schema or data.`);
}