# ============================================================================
# AfuChat — minimal custom R8 rules
# Applied to Android release builds (APK + AAB).
#
# Expo and React Native libraries usually ship consumer rules. Keep this file
# limited to app-owned components and native/JNI boundaries whose names are
# accessed indirectly, including the react-native-webrtc native/JNI boundary.
# ============================================================================

# Preserve source locations in mapping.txt for Google Play Console and Sentry.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Reflection metadata used by Android components and native module bridges.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# react-native-webrtc registers this package through its native module provider.
# Keep the bridge stable in release builds; upstream consumer rules are also
# included by the current package.
-keep class com.oney.WebRTCModule.** { *; }

# WebRTC's native JNI bindings resolve these Java names at runtime. Retain the
# app-level safeguards for release builds alongside the upstream consumer rules.
-keep class org.webrtc.** { *; }
-keep class org.jni_zero.** { *; }
-keep class J.N { *; }
-dontwarn org.jni_zero.**
# WebRTC M155 references this optional AV1 JNI class, which is absent from the
# Android artifact. Keep the suppression limited to the exact missing class.
-dontwarn org.webrtc.Dav1dDecoder$Natives

# App-owned Android components referenced by the manifest or React package.
-keep public class com.afuchat.mobile.AfuChatWidgetProvider { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsPackage { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsModule { *; }