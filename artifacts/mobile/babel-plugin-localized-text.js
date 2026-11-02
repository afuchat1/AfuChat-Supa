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
          state.afuTextInputUsed = false;
          state.afuInputSurfaceUsed = false;
          state.uiTextLiterals = new Set();
          const filename = state.filename || state.file?.opts?.filename || "";
          state.isAppSource =
            !filename.includes("node_modules") &&
            !filename.includes(`${require("path").sep}vendor${require("path").sep}`);
          state.hasNativeTextInputImport = path.node.body.some(
            (node) =>
              t.isImportDeclaration(node) &&
              node.source.value === "react-native" &&
              node.specifiers.some(
                (specifier) =>
                  t.isImportSpecifier(specifier) &&
                  t.isIdentifier(specifier.imported, { name: "TextInput" }) &&
                  t.isIdentifier(specifier.local, { name: "TextInput" }),
              ),
          );
          state.hasNativeViewImport = path.node.body.some(
            (node) =>
              t.isImportDeclaration(node) &&
              node.source.value === "react-native" &&
              node.specifiers.some(
                (specifier) =>
                  t.isImportSpecifier(specifier) &&
                  t.isIdentifier(specifier.imported, { name: "View" }) &&
                  t.isIdentifier(specifier.local, { name: "View" }),
              ),
          );
        },
        exit(path, state) {
          if (!state.isAppSource) return;
          if (state.hasNativeViewImport) {
            const transformInputSurfaces = (node, nestedInSurface = false) => {
              if (!node || typeof node !== "object") return;
              if (t.isJSXElement(node)) {
                const opening = node.openingElement;
                const elementName = t.isJSXIdentifier(opening.name) ? opening.name.name : "";
                const currentIsSurface = ["FloatingGlassSurface", "AfuInputSurface"].includes(elementName);
                for (const child of node.children) {
                  transformInputSurfaces(child, nestedInSurface || currentIsSurface);
                }
                if (elementName !== "View" || nestedInSurface) return;

                const inputChildren = node.children.filter(
                  (child) =>
                    t.isJSXElement(child) &&
                    t.isJSXIdentifier(child.openingElement.name, { name: "AfuTextInput" }),
                );
                if (inputChildren.length === 0) return;

                const styleAttribute = opening.attributes.find(
                  (attribute) =>
                    t.isJSXAttribute(attribute) &&
                    t.isJSXIdentifier(attribute.name, { name: "style" }),
                );
                if (!styleAttribute || !t.isJSXExpressionContainer(styleAttribute.value)) return;
                if (
                  opening.attributes.some(
                    (attribute) =>
                      t.isJSXAttribute(attribute) &&
                      t.isJSXIdentifier(attribute.name, { name: "ref" }),
                  )
                ) {
                  return;
                }

                const styleIdentifiers = [];
                const styleKeys = [];
                const collectStyleTokens = (styleNode) => {
                  if (!styleNode || typeof styleNode !== "object") return;
                  if (t.isIdentifier(styleNode)) styleIdentifiers.push(styleNode.name);
                  if (t.isObjectProperty(styleNode)) {
                    const key = styleNode.key;
                    if (t.isIdentifier(key)) styleKeys.push(key.name);
                    if (t.isStringLiteral(key)) styleKeys.push(key.value);
                  }
                  for (const key of t.VISITOR_KEYS[styleNode.type] || []) {
                    const value = styleNode[key];
                    if (Array.isArray(value)) value.forEach(collectStyleTokens);
                    else collectStyleTokens(value);
                  }
                };
                collectStyleTokens(styleAttribute.value.expression);

                const hasNamedInputSurface = styleIdentifiers.some(
                  (name) =>
                    /(?:input|search|reply|comment|phone|amount|price|caption|otp|code|field)/i.test(name) &&
                    /(?:wrap|wrapper|row|pill|bar|box|container|field|input|search)$/i.test(name),
                );
                const lowerStyleKeys = new Set(styleKeys.map((key) => key.toLowerCase()));
                const hasInlineInputSurface =
                  lowerStyleKeys.has("flexdirection") &&
                  (lowerStyleKeys.has("backgroundcolor") ||
                    lowerStyleKeys.has("bordercolor") ||
                    lowerStyleKeys.has("borderwidth")) &&
                  (lowerStyleKeys.has("height") ||
                    lowerStyleKeys.has("borderradius") ||
                    lowerStyleKeys.has("borderwidth"));
                if (!hasNamedInputSurface && !hasInlineInputSurface) return;

                for (const child of inputChildren) {
                  const appearance = child.openingElement.attributes.find(
                    (attribute) =>
                      t.isJSXAttribute(attribute) &&
                      t.isJSXIdentifier(attribute.name, { name: "appearance" }),
                  );
                  if (appearance) {
                    appearance.value = t.stringLiteral("embedded");
                  } else {
                    child.openingElement.attributes.push(
                      t.jsxAttribute(t.jsxIdentifier("appearance"), t.stringLiteral("embedded")),
                    );
                  }
                }

                opening.name = t.jsxIdentifier("AfuInputSurface");
                if (node.closingElement) {
                  node.closingElement.name = t.jsxIdentifier("AfuInputSurface");
                }
                state.afuInputSurfaceUsed = true;
                return;
              }

              for (const key of t.VISITOR_KEYS[node.type] || []) {
                const value = node[key];
                if (Array.isArray(value)) value.forEach((child) => transformInputSurfaces(child, nestedInSurface));
                else transformInputSurfaces(value, nestedInSurface);
              }
            };
            for (const node of path.node.body) transformInputSurfaces(node);
          }
          if (state.afuInputSurfaceUsed) {
            const alreadyImported = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/components/ui/AfuInputSurface",
            );
            if (!alreadyImported) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importSpecifier(t.identifier("AfuInputSurface"), t.identifier("AfuInputSurface"))],
                  t.stringLiteral("@/components/ui/AfuInputSurface"),
                ),
              );
            }
          }
          if (state.afuTextInputUsed) {
            const alreadyImported = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/components/ui/AfuTextInput",
            );
            if (!alreadyImported) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier("AfuTextInput"))],
                  t.stringLiteral("@/components/ui/AfuTextInput"),
                ),
              );
            }
          }
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
      JSXElement: {
        enter(path, state) {
          if (!state.isAppSource || !state.hasNativeViewImport) return;
          const opening = path.node.openingElement;
          if (!t.isJSXIdentifier(opening.name, { name: "View" })) return;

          let hasFloatingAncestor = false;
          for (let ancestor = path.parentPath; ancestor; ancestor = ancestor.parentPath) {
            if (!ancestor.isJSXElement()) continue;
            const ancestorName = ancestor.node.openingElement.name;
            if (
              t.isJSXIdentifier(ancestorName) &&
              ["FloatingGlassSurface", "AfuInputSurface"].includes(ancestorName.name)
            ) {
              hasFloatingAncestor = true;
              break;
            }
          }
          if (hasFloatingAncestor) return;

          const inputChildren = path.node.children.filter(
            (child) =>
              t.isJSXElement(child) &&
              t.isJSXIdentifier(child.openingElement.name) &&
              ["TextInput", "AfuTextInput"].includes(child.openingElement.name.name),
          );
          if (inputChildren.length === 0) return;

          const styleAttribute = opening.attributes.find(
            (attribute) =>
              t.isJSXAttribute(attribute) &&
              t.isJSXIdentifier(attribute.name, { name: "style" }),
          );
          if (!styleAttribute || !t.isJSXExpressionContainer(styleAttribute.value)) return;
          if (
            opening.attributes.some(
              (attribute) =>
                t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: "ref" }),
            )
          ) {
            return;
          }

          const styleIdentifiers = [];
          const styleKeys = [];
          const collectStyleTokens = (node) => {
            if (!node || typeof node !== "object") return;
            if (t.isIdentifier(node)) styleIdentifiers.push(node.name);
            if (t.isObjectProperty(node)) {
              const key = node.key;
              if (t.isIdentifier(key)) styleKeys.push(key.name);
              if (t.isStringLiteral(key)) styleKeys.push(key.value);
            }
            for (const key of t.VISITOR_KEYS[node.type] || []) {
              const value = node[key];
              if (Array.isArray(value)) value.forEach(collectStyleTokens);
              else collectStyleTokens(value);
            }
          };
          collectStyleTokens(styleAttribute.value.expression);

          const hasNamedInputSurface = styleIdentifiers.some(
            (name) =>
              /(?:input|search|reply|comment|phone|amount|price|caption|otp|code|field)/i.test(name) &&
              /(?:wrap|wrapper|row|pill|bar|box|container|field|input|search)$/i.test(name),
          );
          const lowerStyleKeys = new Set(styleKeys.map((key) => key.toLowerCase()));
          const hasInlineInputSurface =
            lowerStyleKeys.has("flexdirection") &&
            (lowerStyleKeys.has("backgroundcolor") ||
              lowerStyleKeys.has("bordercolor") ||
              lowerStyleKeys.has("borderwidth")) &&
            (lowerStyleKeys.has("height") ||
              lowerStyleKeys.has("borderradius") ||
              lowerStyleKeys.has("borderwidth"));
          if (!hasNamedInputSurface && !hasInlineInputSurface) return;

          for (const child of inputChildren) {
            const appearance = child.openingElement.attributes.find(
              (attribute) =>
                t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: "appearance" }),
            );
            if (appearance) {
              appearance.value = t.stringLiteral("embedded");
            } else {
              child.openingElement.attributes.push(
                t.jsxAttribute(t.jsxIdentifier("appearance"), t.stringLiteral("embedded")),
              );
            }
          }

          opening.name = t.jsxIdentifier("AfuInputSurface");
          if (path.node.closingElement) {
            path.node.closingElement.name = t.jsxIdentifier("AfuInputSurface");
          }
          state.afuInputSurfaceUsed = true;
        },
      },
      JSXIdentifier(path, state) {
        if (!state.isAppSource) return;
        if (
          path.node.name === "TextInput" &&
          state.hasNativeTextInputImport &&
          (path.parentPath.isJSXOpeningElement() ||
            path.parentPath.isJSXClosingElement())
        ) {
          path.node.name = "AfuTextInput";
          state.afuTextInputUsed = true;
          return;
        }
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