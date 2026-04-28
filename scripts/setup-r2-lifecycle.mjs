#!/usr/bin/env node
/**
 * Apply AfuChat's default lifecycle rules to the configured R2 bucket.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID            (or R2_S3_ENDPOINT)
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET                        default: afuchat-media
 *
 * Rules applied:
 *   1. Abort incomplete multipart uploads after 7 days.
 *   2. Expire objects under stories/ after 30 days.
 *   3. Expire objects under chat-media/ tagged lifecycle=ephemeral after 30 days.
 */

import {
  S3Client,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ENDPOINT =
  process.env.R2_S3_ENDPOINT ||
  (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "afuchat-media";

if (!ENDPOINT || !KEY || !SECRET) {
  console.error("Missing R2 credentials. Need CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: KEY, secretAccessKey: SECRET },
});

const Rules = [
  {
    ID: "abort-incomplete-multipart-7d",
    Status: "Enabled",
    Filter: { Prefix: "" },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
  },
  {
    ID: "expire-stories-30d",
    Status: "Enabled",
    Filter: { Prefix: "stories/" },
    Expiration: { Days: 30 },
  },
  {
    ID: "expire-ephemeral-chat-media-30d",
    Status: "Enabled",
    Filter: {
      And: {
        Prefix: "chat-media/",
        Tags: [{ Key: "lifecycle", Value: "ephemeral" }],
      },
    },
    Expiration: { Days: 30 },
  },
];

console.log(`Applying ${Rules.length} lifecycle rule(s) to bucket "${BUCKET}"…`);
await s3.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: BUCKET,
    LifecycleConfiguration: { Rules },
  }),
);

const verify = await s3.send(
  new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET }),
);
console.log("Active rules now:");
for (const r of verify.Rules || []) {
  const what = r.Expiration?.Days
    ? `expire after ${r.Expiration.Days}d`
    : r.AbortIncompleteMultipartUpload
      ? `abort multipart after ${r.AbortIncompleteMultipartUpload.DaysAfterInitiation}d`
      : "(no action?)";
  const where = r.Filter?.Prefix || r.Filter?.And?.Prefix || "(all)";
  console.log(`  - ${r.ID}: ${what}  prefix="${where}"  status=${r.Status}`);
}
console.log("Done.");
