import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { patchReactEditTextSource } = require("../plugins/withChatTextSelection.js");

const reactEditTextCallback = `          override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
            if (contextMenuHidden) {
              return false
            }
            menu.removeItem(android.R.id.pasteAsPlainText)
            return true
          }`;

test("keeps Android selection handles while clearing native action items", () => {
  const patched = patchReactEditTextSource(reactEditTextCallback);

  assert.match(patched, /menu\.clear\(\)/);
  assert.match(patched, /if \(contextMenuHidden\)[\s\S]*return true/);
  assert.doesNotMatch(patched, /return false/);
});

test("native selection patch is idempotent", () => {
  const once = patchReactEditTextSource(reactEditTextCallback);
  assert.equal(patchReactEditTextSource(once), once);
});

test("fails clearly when React Native changes its Android callback", () => {
  assert.throws(
    () => patchReactEditTextSource("override fun onCreateActionMode() = false"),
    /Could not find React Native's contextMenuHidden selection guard/,
  );
});
