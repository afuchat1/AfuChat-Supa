---
name: Shadow props web deprecation fix
description: How to fix the RN Web shadow* deprecation warning throughout the codebase
---

## Rule
Never use bare `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset` in `StyleSheet.create` or inline styles. Wrap them in `Platform.select`.

**Why:** React Native Web logs a deprecation warning for all shadow* props not guarded to a non-web platform. `StyleSheet.hairlineWidth` also throws on web — replace with `0.5`.

**How to apply:**
```ts
...Platform.select({
  web: { boxShadow: "0 Ypx Zpx rgba(0,0,0,0.N)" } as any,
  default: { shadowColor: "#000", shadowOpacity: N, shadowRadius: Z, shadowOffset: { width: 0, height: Y }, elevation: E },
}),
```

For inline props (not StyleSheet.create), use:
```ts
...(Platform.OS !== "web" ? { shadowColor: color, shadowOpacity: 0.3 } : {})
```

The grep pattern that finds TRUE positives (excludes already-guarded lines):
```
grep -rn "shadowColor|shadowOpacity" --include="*.tsx" | grep -v "Platform\." | grep -v "default:|ios:|web:"
```
