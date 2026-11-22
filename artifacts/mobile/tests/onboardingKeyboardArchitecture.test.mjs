import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/onboarding/index.tsx", import.meta.url), "utf8");

test("onboarding delegates focused-field scrolling and footer movement to the controller", () => {
  assert.match(source, /<KeyboardAwareScrollView[\s\S]*?bottomOffset=\{KEYBOARD_ACTION_CLEARANCE\}/);
  assert.match(source, /<KeyboardStickyView/);
  assert.doesNotMatch(source, /scrollResponderScrollNativeHandleToKeyboard/);
  assert.doesNotMatch(source, /focusScrollTimerRef|scrollFocusedInputIntoView/);
});
