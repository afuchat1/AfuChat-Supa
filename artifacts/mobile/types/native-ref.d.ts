// React Native 0.88 exposes host-component instances separately from their
// function-component values; refs should use these instance types.
declare global {
  namespace AfuNativeRef {
    type ScrollView = import("react-native").ScrollViewInstance;
    type Text = import("react-native").TextInstance;
    type TextInput = import("react-native").TextInputInstance;
    type View = import("react-native").ViewInstance;
  }
}

export {};
