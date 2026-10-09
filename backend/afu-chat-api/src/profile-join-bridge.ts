type SelectNode = {
  raw: string;
  alias?: string;
  relation?: string;
  modifiers?: string[];
  children?: SelectNode[];
};

export type ProfileJoinPlan = {
  parentPath: string[];
  foreignKeyColumn: string;
  alias: string;
  fields: string;
  outputKeys: string[] | null;
  inner: boolean;
  schema: "accounts";
};

type ForeignKeyRule = {
  column: string;
  schema: "accounts";
};

const PROFILE_FOREIGN_KEYS: Readonly<Record<string, ForeignKeyRule>> = Object.freeze({
  digital_events_creator_id_fkey: { column: "creator_id", schema: "accounts" },
  freelance_listings_seller_id_fkey: { column: "seller_id", schema: "accounts" },
  freelance_reviews_reviewer_id_fkey: { column: "reviewer_id", schema: "accounts" },
  gift_transactions_sender_id_fkey: { column: "sender_id", schema: "accounts" },
  paid_communities_creator_id_fkey: { column: "creator_id", schema: "accounts" },
  red_envelope_claims_claimer_id_fkey: { column: "claimer_id", schema: "accounts" },
  red_envelopes_sender_id_fkey: { column: "sender_id", schema: "accounts" },
  shop_order_messages_sender_id_fkey: { column: "sender_id", schema: "accounts" },
  shop_orders_buyer_id_fkey: { column: "buyer_id", schema: "accounts" },
  shop_orders_seller_id_fkey: { column: "seller_id", schema: "accounts" },
  shop_reviews_reviewer_id_fkey: { column: "reviewer_id", schema: "accounts" },
  shops_seller_id_fkey: { column: "seller_id", schema: "accounts" },
  stories_user_id_fkey: { column: "user_id", schema: "accounts" },
  story_views_viewer_id_fkey: { column: "viewer_id", schema: "accounts" },
  support_messages_sender_id_fkey: { column: "sender_id", schema: "accounts" },
  xp_transfers_receiver_id_fkey: { column: "receiver_id", schema: "accounts" },
  xp_transfers_sender_id_fkey: { column: "sender_id", schema: "accounts" },
});

function splitTopLevel(value: string): string[] | null {
  const result: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (char === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0 || quoted) return null;
  const last = value.slice(start).trim();
  if (last) result.push(last);
  return result;
}

function parseNode(raw: string): SelectNode {
  const opening = raw.indexOf("(");
  if (opening < 0 || !raw.endsWith(")")) return { raw };

  const head = raw.slice(0, opening).trim();
  const match = head.match(
    /^(?:(?<alias>[a-zA-Z_][a-zA-Z0-9_]*):)?(?<relation>[a-zA-Z_][a-zA-Z0-9_]*)(?<mods>(?:![a-zA-Z0-9_-]+)*)$/,
  );
  if (!match?.groups) return { raw };

  const content = raw.slice(opening + 1, -1);
  const childRaw = splitTopLevel(content);
  if (childRaw === null) return { raw };
  return {
    raw,
    alias: match.groups.alias,
    relation: match.groups.relation,
    modifiers: match.groups.mods
      .split("!")
      .filter(Boolean),
    children: childRaw.map(parseNode),
  };
}

function serializeNode(node: SelectNode): string {
  if (!node.children || !node.relation) return node.raw;
  const head = node.raw.slice(0, node.raw.indexOf("("));
  return `${head}(${node.children.map(serializeNode).join(",")})`;
}

function selectedOutputKeys(fields: string): string[] | null {
  const items = splitTopLevel(fields);
  if (!items || items.some((item) => item === "*")) return null;
  const keys: string[] = [];
  for (const item of items) {
    const match = item.match(
      /^(?:(?<alias>[a-zA-Z_][a-zA-Z0-9_]*):)?(?<column>[a-zA-Z_][a-zA-Z0-9_]*)(?::[a-zA-Z_][a-zA-Z0-9_]*)?$/,
    );
    if (!match?.groups) return null;
    keys.push(match.groups.alias || match.groups.column);
  }
  return keys;
}

function hasColumn(nodes: SelectNode[], column: string): boolean {
  return nodes.some((node) => node.raw === column || node.alias === column);
}

export function rewriteCrossSchemaProfileSelect(
  rootSchema: string,
  selector: string,
): { selector: string; plans: ProfileJoinPlan[]; unsupported: boolean } | null {
  const source = splitTopLevel(selector);
  if (!source) return null;
  const plans: ProfileJoinPlan[] = [];
  let unsupported = false;

  const rewrite = (nodes: SelectNode[], path: string[]): SelectNode[] => {
    const result: SelectNode[] = [];
    const requiredColumns = new Set<string>();

    for (const node of nodes) {
      if (node.relation === "profiles" && node.children) {
        const foreignKey = node.modifiers?.find((modifier) => modifier.endsWith("_fkey"));
        const rule = foreignKey ? PROFILE_FOREIGN_KEYS[foreignKey] : undefined;
        if (rule && rule.schema !== rootSchema) {
          if (node.modifiers?.includes("inner")) {
            // Preserve the database's semantics rather than silently changing
            // a filtered relationship into an outer join.
            unsupported = true;
            result.push(node);
            continue;
          }
          const fields = node.children.map(serializeNode).join(",");
          const outputKeys = selectedOutputKeys(fields);
          const fieldItems = splitTopLevel(fields);
          const explicitlySelectsAll = fieldItems?.some((field) => field === "*") ?? false;
          if (outputKeys === null && !explicitlySelectsAll) {
            unsupported = true;
            result.push(node);
            continue;
          }
          plans.push({
            parentPath: path,
            foreignKeyColumn: rule.column,
            alias: node.alias || "profiles",
            fields,
            outputKeys,
            inner: false,
            schema: rule.schema,
          });
          requiredColumns.add(rule.column);
          continue;
        }
      }

      if (node.children && node.relation) {
        const nestedPath = [...path, node.alias || node.relation];
        node.children = rewrite(node.children, nestedPath);
      }
      result.push(node);
    }

    for (const column of requiredColumns) {
      if (!hasColumn(result, column) && !result.some((node) => node.raw === "*")) {
        result.push({ raw: column });
      }
    }
    return result;
  };

  const rewritten = rewrite(source.map(parseNode), []);
  return {
    selector: rewritten.map(serializeNode).join(","),
    plans,
    unsupported,
  };
}

export function collectRowsAtPath(payload: unknown, path: string[]): Record<string, unknown>[] {
  let rows = Array.isArray(payload)
    ? payload.filter(isRecord)
    : isRecord(payload)
      ? [payload]
      : [];
  for (const key of path) {
    const next: Record<string, unknown>[] = [];
    for (const row of rows) {
      const value = row[key];
      if (Array.isArray(value)) next.push(...value.filter(isRecord));
      else if (isRecord(value)) next.push(value);
    }
    rows = next;
  }
  return rows;
}

export function applyProfileJoinPlans(
  payload: unknown,
  plans: ProfileJoinPlan[],
  profileById: Map<string, Record<string, unknown>>,
): unknown {
  for (const plan of plans) {
    const parents = collectRowsAtPath(payload, plan.parentPath);
    for (const parent of parents) {
      const id = parent[plan.foreignKeyColumn];
      const profile = typeof id === "string" ? profileById.get(id) : undefined;
      if (!profile) {
        parent[plan.alias] = null;
        continue;
      }
      if (plan.outputKeys === null) {
        parent[plan.alias] = { ...profile };
      } else {
        const selected: Record<string, unknown> = {};
        for (const key of plan.outputKeys) {
          if (Object.hasOwn(profile, key)) selected[key] = profile[key];
        }
        parent[plan.alias] = selected;
      }
    }
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
