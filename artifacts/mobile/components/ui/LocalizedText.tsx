import React, { forwardRef, useMemo } from "react";
import {
  Text as NativeText,
  type TextProps,
} from "react-native";
import { useLanguage } from "@/context/LanguageContext";

function localizeChildren(
  children: React.ReactNode,
  translate: (text: string) => string,
  shouldTranslate: (text: string) => boolean,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      if (!shouldTranslate(child)) return child;
      return translate(child);
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (!element.props.children) return child;
      return React.cloneElement(element, {
        children: localizeChildren(element.props.children, translate, shouldTranslate),
      });
    }
    return child;
  });
}

/**
 * Drop-in Text replacement used by the Babel localization transform.
 * Only text nodes are passed through t(); icons, numbers, links, and other
 * dynamic React elements are left untouched.
 */
type LocalizedTextProps = TextProps & {
  __afuchatStaticText?: boolean;
  __afuchatStaticParts?: string[];
  __afuchatTranslateAllText?: boolean;
};

const LocalizedText = forwardRef<AfuNativeRef.Text, LocalizedTextProps>(function LocalizedText(
  {
    children,
    __afuchatStaticText: _staticText = false,
    __afuchatStaticParts = [],
    __afuchatTranslateAllText = false,
    ...props
  },
  ref,
) {
  const { t } = useLanguage();
  const staticPartKey = __afuchatStaticParts.join("\u0000");
  const shouldTranslate = useMemo(() => {
    const staticParts = new Set(__afuchatStaticParts);
    return (text: string) => __afuchatTranslateAllText || staticParts.has(text);
  }, [__afuchatTranslateAllText, staticPartKey]);

  const localizedChildren = useMemo(
    () =>
      localizeChildren(
        children,
        t,
        shouldTranslate,
      ),
    [children, shouldTranslate, t],
  );

  return (
    <NativeText ref={ref} {...props}>
      {localizedChildren}
    </NativeText>
  );
});

LocalizedText.displayName = "LocalizedText";

export default LocalizedText;