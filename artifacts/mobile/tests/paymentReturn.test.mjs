import test from "node:test";
import assert from "node:assert/strict";
import { parsePaymentReturnParams } from "../lib/paymentReturn.ts";

test("routes the legacy AfuChat payment-complete URL to the return screen", () => {
  assert.deepEqual(
    parsePaymentReturnParams("https://afuchat.com/about?payment-complete=1&session_id=sess-123"),
    { session_id: "sess-123" },
  );
});

test("keeps provider and purpose on the dedicated payment return route", () => {
  assert.deepEqual(
    parsePaymentReturnParams(
      "https://www.afuchat.com/payment-return?provider=whop&purpose=donation&session_id=sess-456",
    ),
    { session_id: "sess-456", provider: "whop", purpose: "donation" },
  );
});

test("supports AfuChat custom-scheme payment returns", () => {
  assert.deepEqual(
    parsePaymentReturnParams("afuchat://payment-return?provider=whop&session_id=sess-789"),
    { session_id: "sess-789", provider: "whop" },
  );
});

test("does not treat other hosts or unrelated app links as payment returns", () => {
  assert.equal(parsePaymentReturnParams("https://checkout.example/payment-return?session_id=x"), null);
  assert.equal(parsePaymentReturnParams("https://afuchat.com/about?tab=help"), null);
});
