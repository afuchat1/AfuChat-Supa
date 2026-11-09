---
name: Inline timestamp correct approach — ghost tail + absolute
description: How to implement WhatsApp-style inline timestamps in chat bubbles (text fills every line, timestamp floats on the last line only).
---

## The rule
Use `opacity: 0` ghost text via the RichText `tail` prop + `position: absolute` timestamp inside the Pressable bubble.

## What NOT to do

### ❌ `paddingRight` on RichText
Reserves space on EVERY line, not just the last. Creates an ugly empty column on the right of all intermediate lines. Users see it as broken whitespace.

### ❌ `color: "transparent"` ghost text
On some Android / Hermes engines the transparent colour falls back to the inherited parent colour, making the ghost text visible as a duplicate timestamp.

### ❌ `flexDirection: "row"` inside bubble
Forces bubble width = text_natural_width + timestamp_width. The 72% maxWidth still clamps it but makes the bubble always try to be max-width, inflating narrow messages.

### ❌ `position: absolute` inside a child `<View>` wrapper
The wrapper's own height is computed incorrectly — the absolute child is excluded from its parent's height but the wrapper still grows, pushing the timestamp below the text.

## How to apply

```jsx
// 1. Ghost: invisible inline spacer — appended to the last text line only
const ghost = (
  <Text style={{ opacity: 0, fontSize: 11, fontFamily: "Inter_400Regular", includeFontPadding: false }}>
    {msg.edited_at ? "  edited" : ""}{" "}{formatMsgTime(msg.sent_at)}{isMe ? "    " : " "}
  </Text>
);

// 2. Text with ghost tail — no paddingRight needed
<RichText style={bubbleText} tail={ghost}>{displayText}</RichText>

// 3. Real timestamp absolutely inside the Pressable (bubble)
//    bottom/right values match bubble's paddingBottom(4) / paddingHorizontal(10)
<View style={[metaRow, { position: "absolute", bottom: 4, right: 10 }]}>
  {editedLabel}{timeText}{tickIcon}
</View>
```

**Why `opacity: 0` works:** opacity is a compositing property applied at the View/span rendering level — it makes the span invisible on all platforms (Android, iOS, RN 0.83+) without touching the text-colour rendering path that `transparent` relies on.

**Why absolute inside Pressable (not a child wrapper):** The Pressable's height = paddingTop + text height + paddingBottom. The absolute timestamp at `bottom: 4` sits exactly at the last line's bottom. No child wrapper means no intermediate height miscalculation.
