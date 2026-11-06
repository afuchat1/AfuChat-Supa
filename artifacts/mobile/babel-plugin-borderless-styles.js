const BORDER_STYLE_PROPERTIES = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderStart",
  "borderEnd",
  "borderBlock",
  "borderInline",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "borderTopColor",
  "borderTopWidth",
  "borderTopStyle",
  "borderRightColor",
  "borderRightWidth",
  "borderRightStyle",
  "borderBottomColor",
  "borderBottomWidth",
  "borderBottomStyle",
  "borderLeftColor",
  "borderLeftWidth",
  "borderLeftStyle",
  "borderStartColor",
  "borderStartWidth",
  "borderStartStyle",
  "borderEndColor",
  "borderEndWidth",
  "borderEndStyle",
  "borderBlockColor",
  "borderBlockWidth",
  "borderBlockStyle",
  "borderInlineColor",
  "borderInlineWidth",
  "borderInlineStyle",
]);

function propertyName(property, types) {
  if (!types.isObjectProperty(property)) return null;
  if (types.isIdentifier(property.key)) return property.key.name;
  if (types.isStringLiteral(property.key)) return property.key.value;
  return null;
}

function isBorderReset(key, value, types) {
  const stringValue = types.isStringLiteral(value)
    ? value.value.trim().toLowerCase()
    : null;

  if (key === "border" || /width$/i.test(key)) {
    if (types.isNumericLiteral(value) && value.value === 0) return true;
    if (stringValue && /^0(?:\.0+)?(?:px)?$/.test(stringValue)) return true;
  }

  if (
    stringValue === "none" &&
    (key === "border" || key.startsWith("border"))
  ) {
    return true;
  }

  return /color$/i.test(key) && stringValue === "transparent";
}

function isStyleSheetCreateCall(node, types) {
  if (!types.isCallExpression(node) || !types.isMemberExpression(node.callee)) {
    return false;
  }
  const { object, property, computed } = node.callee;
  if (computed || !types.isIdentifier(property, { name: "create" })) return false;
  if (types.isIdentifier(object, { name: "StyleSheet" })) return true;
  return (
    types.isMemberExpression(object) &&
    !object.computed &&
    types.isIdentifier(object.property, { name: "StyleSheet" }) &&
    types.isIdentifier(object.object, { name: "RN" })
  );
}

function isInsideStyleDefinition(path, types) {
  return Boolean(
    path.findParent((parent) => {
      if (
        parent.isJSXAttribute() &&
        types.isJSXIdentifier(parent.node.name, { name: "style" })
      ) {
        return true;
      }
      return isStyleSheetCreateCall(parent.node, types);
    }),
  );
}

function isThinLineDimension(value, types) {
  if (types.isNumericLiteral(value)) return value.value > 0 && value.value <= 2;
  if (
    types.isStringLiteral(value) &&
    /^\s*\d+(?:\.\d+)?px\s*$/.test(value.value)
  ) {
    return Number.parseFloat(value.value) <= 2;
  }
  return (
    types.isMemberExpression(value) &&
    types.isIdentifier(value.property, { name: "hairlineWidth" })
  );
}

function hasThinLineDimension(objectPath, types) {
  return objectPath.get("properties").some((propertyPath) => {
    const key = propertyName(propertyPath.node, types);
    return (
      (key === "width" || key === "height") &&
      isThinLineDimension(propertyPath.node.value, types)
    );
  });
}

module.exports = function borderlessStylesPlugin({ types }) {
  return {
    name: "borderless-app-styles",
    visitor: {
      ObjectProperty(path, state) {
        const key = propertyName(path.node, types);
        // boxShadow is a web-only surface edge in this app. Native surfaces
        // use shadowColor/elevation instead, so removing this key preserves
        // native depth while eliminating web rings across shared controls.
        if (key === "boxShadow" && state.file.opts.caller?.platform === "web") {
          path.remove();
          return;
        }

        if (!isInsideStyleDefinition(path, types)) return;

        // Keep explicit resets: deleting borderWidth: 0 exposes browser-default
        // outlines on web inputs and controls even though the app asks for none.
        if (
          BORDER_STYLE_PROPERTIES.has(key) &&
          !isBorderReset(key, path.node.value, types)
        ) {
          path.remove();
          return;
        }

        if (
          key === "backgroundColor" &&
          path.parentPath.isObjectExpression() &&
          hasThinLineDimension(path.parentPath, types)
        ) {
          path.remove();
        }
      },
    },
  };
};
