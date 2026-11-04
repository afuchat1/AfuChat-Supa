# ============================================================================
# AfuChat — minimal custom R8 rules
# Applied to Android release builds (APK + AAB).
#
# Expo and React Native libraries ship their own consumer rules. Keep this file
# limited to app-owned components and the one native module whose classes are
# registered across the New Architecture JNI/TurboModule boundary.
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

# App-owned Android components referenced by the manifest or React package.
-keep public class com.afuchat.mobile.AfuChatWidgetProvider { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsPackage { *; }
-keep public class com.afuchat.mobile.AfuChatShareShortcutsModule { *; }