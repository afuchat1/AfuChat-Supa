import type { Context } from "hono";
import type { createDbClient } from "./lib/db";

export interface Env {
  // Vars
  SUPABASE_URL: string;
  SUPABASE_PROJECT_ID: string;
  SUPABASE_DB_SCHEMA?: string;
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
  R2_BUCKET_NAME: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID: string;
  NODE_ENV: string;
  R2_PUBLIC_URL?: string;
  AFU_CDN_TARGET?: string;
  ENGAGERA_API_KEY?: string;
  RESEND_API_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_SERVICE_ACCOUNT_KEY?: string;
  PESAPAL_CONSUMER_KEY?: string;
  PESAPAL_CONSUMER_SECRET?: string;
  PESAPAL_IPN_ID?: string;
  PESAPAL_ENV?: string;
  PUBLIC_API_URL?: string;

  // Secrets
  SUPABASE_SERVICE_KEY: string;
  JWT_SECRET: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: string;

  // Bindings
  IMAGES_BUCKET: R2Bucket;
}

export interface AuthVariables {
  userId: string;
  email: string;
}

export type AppContext = Context<{ Bindings: Env; Variables: AuthVariables }>;
export type DbClient = ReturnType<typeof createDbClient>;
