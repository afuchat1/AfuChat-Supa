module.exports = function localizedTextPlugin({ types: t }) {
  function isUiTranslationCall(node) {
    return (
      t.isCallExpression(node) &&
      ((t.isIdentifier(node.callee) &&
        ["t", "localizeUi"].includes(node.callee.name)) ||
        (t.isMemberExpression(node.callee) &&
          t.isIdentifier(node.callee.property) &&
          ["t", "localizeUi"].includes(node.callee.property.name)))
    );
  }

  // Conditional labels such as loading ? "Saving…" : "Save" are UI copy,
  // while {profile.display_name} is user data. Only the former gets the
  // asynchronous global translation fallback.
  function isUiStringExpression(node) {
    if (isUiTranslationCall(node) || t.isStringLiteral(node)) return true;
    if (t.isConditionalExpression(node)) {
      return isUiStringExpression(node.consequent) && isUiStringExpression(node.alternate);
    }
    if (t.isLogicalExpression(node)) {
      return isUiStringExpression(node.left) && isUiStringExpression(node.right);
    }
    if (t.isTemplateLiteral(node)) {
      return node.expressions.length === 0;
    }
    return false;
  }

  function isUiCall(node) {
    if (!t.isCallExpression(node)) return false;
    if (t.isIdentifier(node.callee)) {
      return ["showAlert", "showToast", "confirmAlert"].includes(node.callee.name);
    }
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      return node.callee.property.name === "alert";
    }
    return false;
  }

  function localizeStaticExpression(node, state) {
    if (t.isStringLiteral(node)) {
      state.uiTextLiterals.add(node.value);
      state.localizeUiUsed = true;
      return t.callExpression(t.identifier("localizeUi"), [node]);
    }
    if (t.isConditionalExpression(node)) {
      node.consequent = localizeStaticExpression(node.consequent, state);
      node.alternate = localizeStaticExpression(node.alternate, state);
    } else if (t.isLogicalExpression(node)) {
      node.left = localizeStaticExpression(node.left, state);
      node.right = localizeStaticExpression(node.right, state);
    }
    return node;
  }

  return {
    name: "localized-text",
    visitor: {
      Program: {
        enter(path, state) {
          state.localizedTextUsed = false;
          state.localizeUiUsed = false;
          state.uiTextLiterals = new Set();
          const filename = state.filename || state.file?.opts?.filename || "";
          state.isAppSource =
            !filename.includes("node_modules") &&
            !filename.includes(`${require("path").sep}vendor${require("path").sep}`);
        },
        exit(path, state) {
          if (!state.isAppSource) return;
          if (state.localizedTextUsed) {
            const alreadyImported = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/components/ui/LocalizedText",
            );
            if (!alreadyImported) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier("LocalizedText"))],
                  t.stringLiteral("@/components/ui/LocalizedText"),
                ),
              );
            }
          }
          if (state.localizeUiUsed) {
            const alreadyUiImport = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/lib/i18n" &&
                node.specifiers.some(
                  (specifier) =>
                    t.isImportSpecifier(specifier) &&
                    specifier.imported.name === "localizeUi",
                ),
            );
            if (!alreadyUiImport) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.identifier("localizeUi"),
                      t.identifier("localizeUi"),
                    ),
                  ],
                  t.stringLiteral("@/lib/i18n"),
                ),
              );
            }
          }
          if (state.uiTextLiterals.size > 0) {
            const alreadyRegistryImport = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/lib/i18n" &&
                node.specifiers.some(
                  (specifier) =>
                    t.isImportSpecifier(specifier) &&
                    specifier.imported.name === "registerUiTexts",
                ),
            );
            if (!alreadyRegistryImport) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.identifier("registerUiTexts"),
                      t.identifier("registerUiTexts"),
                    ),
                  ],
                  t.stringLiteral("@/lib/i18n"),
                ),
              );
            }
            path.pushContainer(
              "body",
              t.expressionStatement(
                t.callExpression(t.identifier("registerUiTexts"), [
                  t.arrayExpression(
                    Array.from(state.uiTextLiterals).map((text) => t.stringLiteral(text)),
                  ),
                ]),
              ),
            );
          }
        },
      },
      JSXIdentifier(path, state) {
        if (!state.isAppSource) return;
        if (path.node.name !== "Text") {
          const attribute = path.parentPath;
          if (
            attribute.isJSXAttribute() &&
            [
              "placeholder",
              "accessibilityLabel",
              "accessibilityHint",
              "title",
              "label",
              "sublabel",
              "sub",
              "desc",
              "subtitle",
              "description",
              "note",
              "text",
              "message",
              "buttonText",
            ].includes(path.node.name) &&
            t.isStringLiteral(attribute.node.value)
          ) {
            state.uiTextLiterals.add(attribute.node.value.value);
            attribute.node.value = t.jsxExpressionContainer(
              t.callExpression(t.identifier("localizeUi"), [
                t.stringLiteral(attribute.node.value.value),
              ]),
            );
            state.localizeUiUsed = true;
          }
          return;
        }
        const parent = path.parentPath;
        if (
          !parent.isJSXOpeningElement() &&
          !parent.isJSXClosingElement()
        ) {
          return;
        }
        // Only static JSX copy and expressions that clearly produce UI copy
        // should be sent to the global UI translator. Dynamic children may be
        // user names, post content, amounts, or other values that must remain
        // exactly as supplied by the app.
        if (parent.isJSXOpeningElement()) {
          const element = parent.parentPath;
          const children = element.isJSXElement() ? element.node.children : [];
          const hasStaticText = children.some(
            (child) => t.isJSXText(child) && child.value.trim().length > 0,
          );
          const isUiExpressionChildren =
            children.length > 0 &&
            children.every(
              (child) =>
                t.isJSXExpressionContainer(child) &&
                isUiStringExpression(child.expression),
            );
          const hasNestedChildren = children.some(
            (child) => t.isJSXElement(child) || t.isJSXFragment(child),
          );
          if (hasStaticText) {
            children
              .filter((child) => t.isJSXText(child))
              .forEach((child) => state.uiTextLiterals.add(child.value));
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticParts"),
                t.jsxExpressionContainer(
                  t.arrayExpression(
                    children
                      .filter((child) => t.isJSXText(child))
                      .map((child) => t.stringLiteral(child.value)),
                  ),
                ),
              ),
            );
          } else if (isUiExpressionChildren) {
            children.forEach((child) => {
              if (!t.isJSXExpressionContainer(child)) return;
              const expression = child.expression;
              if (
                isUiTranslationCall(expression) &&
                expression.arguments[0] &&
                t.isStringLiteral(expression.arguments[0])
              ) {
                state.uiTextLiterals.add(expression.arguments[0].value);
              }
            });
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatTranslateAllText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
          }
        }
        path.node.name = "LocalizedText";
        state.localizedTextUsed = true;
      },
      JSXText(path, state) {
        if (!state.isAppSource || path.node.value.trim().length < 2) return;
        const parent = path.parentPath;
        if (!parent.isJSXElement()) return;
        const openingName = parent.node.openingElement.name;
        // Text handles its own children through __afuchatStaticParts so
        // dynamic names/content next to a static label remain untouched.
        if (t.isJSXIdentifier(openingName, { name: "Text" })) return;
        state.uiTextLiterals.add(path.node.value);
        state.localizeUiUsed = true;
        path.replaceWith(
          t.jsxExpressionContainer(
            t.callExpression(t.identifier("localizeUi"), [t.stringLiteral(path.node.value)]),
          ),
        );
      },
      JSXExpressionContainer(path, state) {
        if (!state.isAppSource || !isUiStringExpression(path.node.expression)) return;
        const parent = path.parentPath;
        if (!parent.isJSXElement()) return;
        const openingName = parent.node.openingElement.name;
        if (t.isJSXIdentifier(openingName, { name: "Text" })) return;
        path.node.expression = localizeStaticExpression(path.node.expression, state);
      },
      CallExpression(path, state) {
        if (!state.isAppSource || !isUiCall(path.node)) return;
        // String literals passed to alerts/toasts are UI copy too. Dynamic
        // server errors and user content remain untouched.
        path.node.arguments = path.node.arguments.map((argument, index) => {
          if (index > 2 && t.isIdentifier(path.node.callee, { name: "showAlert" })) {
            return argument;
          }
          return localizeStaticExpression(argument, state);
        });
      },
      ObjectProperty(path, state) {
        if (!state.isAppSource || !t.isIdentifier(path.node.key)) return;
        if (!["text", "confirmText", "cancelText"].includes(path.node.key.name)) return;
        const call = path.findParent((parent) => parent.isCallExpression() && isUiCall(parent.node));
        if (!call || !t.isStringLiteral(path.node.value)) return;
        state.uiTextLiterals.add(path.node.value.value);
        state.localizeUiUsed = true;
        path.node.value = t.callExpression(t.identifier("localizeUi"), [path.node.value]);
      },
    },
  };
};