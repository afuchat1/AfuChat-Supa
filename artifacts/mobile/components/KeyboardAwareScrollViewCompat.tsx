import { ScrollView, ScrollViewProps } from "react-native";

let KeyboardAwareScrollView: any = ScrollView;
try {
  KeyboardAwareScrollView = require("react-native-keyboard-controller").KeyboardAwareScrollView;
} catch (_) {}

type Props = ScrollViewProps & {
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  [key: string]: any;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
