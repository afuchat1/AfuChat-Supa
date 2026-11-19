/**
 * Keeps Android's selection handles active while AfuChat supplies its own
 * Cut/Copy/Paste/Quote/formatting toolbar.
 *
 * React Native's contextMenuHidden callback rejects Android's selection
 * ActionMode entirely, which can cancel long-press text selection. Keep the
 * ActionMode alive but remove its system menu items instead.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER =
  "// AfuChat keeps selection handles while hiding Android's native action menu.";

const CONTEXT_MENU_BLOCK =
  /^(?<indent>[ \t]*)if \(contextMenuHidden\) \{\r?\n[ \t]*return false\r?\n[ \t]*\}\r?\n[ \t]*menu\.removeItem\(android\.R\.id\.pasteAsPlainText\)/m;

function patchReactEditTextSource(source) {
  if (source.includes(MARKER)) return source;

  const patched = source.replace(CONTEXT_MENU_BLOCK, (_match, indent) => [
    `${indent}if (contextMenuHidden) {`,
    `${indent}  ${MARKER}`,
    `${indent}  menu.clear()`,
    `${indent}  return true`,
    `${indent}}`,
    `${indent}menu.removeItem(android.R.id.pasteAsPlainText)`,
  ].join("\n"));

  if (patched === source) {
    throw new Error(
      "[withChatTextSelection] Could not find React Native's Android selection callback. " +
        "Review ReactEditText.kt before upgrading React Native.",
    );
  }
  return patched;
}

function withChatTextSelection(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const reactNativePackage = require.resolve("react-native/package.json", {
        paths: [projectRoot],
      });
      const reactNativeRoot = path.dirname(reactNativePackage);
      const sourcePath = path.join(
        reactNativeRoot,
        "ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactEditText.kt",
      );

      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          `[withChatTextSelection] React Native Android source not found at ${sourcePath}`,
        );
      }

      const source = fs.readFileSync(sourcePath, "utf8");
      const patched = patchReactEditTextSource(source);
      if (patched !== source) {
        fs.writeFileSync(sourcePath, patched);
        console.log("[withChatTextSelection] Android text selection uses AfuChat's menu.");
      }

      return config;
    },
  ]);
}

withChatTextSelection.patchReactEditTextSource = patchReactEditTextSource;

module.exports = withChatTextSelection;
