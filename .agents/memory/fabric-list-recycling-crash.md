---
name: Fabric list recycling crash
description: Android React Native Fabric crash caused by reattaching a child that still belongs to a clipping parent
---

React Native 0.83 with Fabric can throw `The specified child already has a parent` from `SurfaceMountingManager.addViewAt` through `ReactClippingViewManager.addView` when virtualized-list clipping races view recycling.

**Why:** The exception is native and bypasses JavaScript error boundaries, so it terminates the app for affected Android users. The stack does not identify the screen, and the default Android `FlatList` behavior enables clipping even when the prop is omitted.

**How to apply:** Set `removeClippedSubviews={false}` on dynamic/high-traffic FlatLists and SectionLists, and use the app startup compatibility guard to make the default false. Keep virtualization controls such as `windowSize`, batching, and pagination so memory usage remains bounded.