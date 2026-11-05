# ============================================================================
# AfuChat — minimal custom R8 rules
# Applied to Android release builds (APK + AAB).
#
# Expo and React Native libraries usually ship consumer rules. Keep this file
# limited to app-owned components and native/JNI boundaries whose names are
# accessed indirectly, including react-native-webrtc 124.0.1.
# ============================================================================

# Preserve source locations in mapping.txt for Google Play Console and Sentry.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Reflection metadata used by Android components and native module bridges.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# react-native-webrtc registers this package through its native module provider.
# R8 cannot reliably see that Java/Kotlin reachability from the JS/TurboModule
# side, so removing or renaming it breaks calls in release builds.
-keep class com.oney.WebRTCModule.** { *; }

# WebRTC's native JNI bindings resolve these Java names at runtime. R8 must not
# rename or remove them; the upstream package's consumer rules are absent in
# react-native-webrtc 124.0.1.
-keep class org.webrtc.** { *; }
-keep class org.jni_zero.** { *; }
-keep class J.N { *; }
-dontwarn org.jni_zero.**

# App-owned Android components referenced by the manifest or React package.
-keep public class com.afuchat.mobile.AfuChatWidgetProvider { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsPackage { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsModule { *; }