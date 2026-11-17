import test from "node:test";
import assert from "node:assert/strict";
import {
  getChatAttachmentExtension,
  getChatAttachmentName,
  normalizeChatAttachmentMimeType,
  normalizeChatAttachmentSize,
} from "../lib/chatAttachmentMetadata.ts";

test("keeps an original filename and an unfamiliar extension", () => {
  assert.equal(getChatAttachmentName("research.export.psd"), "research.export.psd");
  assert.equal(getChatAttachmentExtension("research.export.psd", "application/octet-stream"), "psd");
});

test("recovers a readable filename from an encoded upload URL", () => {
  assert.equal(
    getChatAttachmentName(null, "https://cdn.example/chat/my%20report_1760000000000_ab12cd34.docx?token=x"),
    "my report.docx",
  );
});

test("sanitizes paths while preserving a useful file name", () => {
  assert.equal(getChatAttachmentName("../../private/report.pdf"), "report.pdf");
});

test("infers a known MIME type from the filename and normalizes size", () => {
  assert.equal(normalizeChatAttachmentMimeType("application/octet-stream", "report.pdf"), "application/pdf");
  assert.equal(normalizeChatAttachmentSize(512.9), 512);
  assert.equal(normalizeChatAttachmentSize(0), null);
});
