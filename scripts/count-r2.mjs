import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY },
});
async function countPrefix(prefix) {
  let count = 0, token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: "afuchat-media", Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
    count += (r.Contents||[]).length;
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return count;
}
const buckets = ["avatars","stories","profile-banners","product-images","event-images","restaurant-images","service-images","post-images","verification-documents","voice-messages","group-avatars","listing-images","mini-programs","mini-app-apks","developer-showcase","ai-chat-attachments","ai-generated-images","afumail-attachments","chat-attachments","shop-media","match-photos","videos"];
const r = await Promise.all(buckets.map(b => countPrefix(b+"/")));
let t=0; buckets.forEach((b,i)=>{ console.log(b.padEnd(28),r[i]); t+=r[i]; });
console.log("TOTAL", t);
