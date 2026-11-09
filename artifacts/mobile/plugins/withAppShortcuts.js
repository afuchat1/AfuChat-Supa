/**
 * Adds AfuChat's launcher shortcuts to native builds.
 *
 * Android receives dynamic recent-chat shortcuts from the app and reads the
 * widget provider from res/xml. iOS shortcut definitions live in app.json;
 * this plugin forwards their URL payload through Expo's normal URL delegate.
 *
 * Expo Go cannot install launcher shortcuts because it does not contain the
 * generated native resources. A preview or production build is required.
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withAppDelegate,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SHORTCUTS_RESOURCE = "afuchat_shortcuts";
const MANIFEST_META_NAME = "android.app.shortcuts";
const ANDROID_MARKER = "AfuChat launcher shortcuts";
const IOS_MARKER = "// AfuChat launcher shortcut URL forwarding";
const IOS_LAUNCH_MARKER = "// AfuChat launcher shortcut cold-start forwarding";

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Launcher shortcuts are dynamic and contain only the eight most recent
         conversations. This file intentionally has no static shortcuts. -->
    <!-- Android Direct Share remains available through the generic share target. -->
    <share-target android:targetClass="com.afuchat.mobile.MainActivity">
        <intent-filter>
            <action android:name="android.intent.action.SEND" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:mimeType="text/*" />
            <data android:mimeType="image/*" />
            <data android:mimeType="video/*" />
            <data android:mimeType="audio/*" />
            <data android:mimeType="application/*" />
        </intent-filter>
        <category android:name="android.shortcut.conversation" />
    </share-target>
</shortcuts>
`;

const SHORTCUT_STRINGS = `    <!-- ${ANDROID_MARKER} -->
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="140dp"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/afuchat_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`;

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp"
    android:background="@drawable/afuchat_widget_background">
    <TextView
        android:id="@+id/widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="@string/widget_title"
         android:textColor="@color/afuchat_widget_text"
        android:textSize="16sp"
        android:textStyle="bold"
        android:maxLines="1" />
    <TextView
        android:id="@+id/widget_empty"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="14dp"
        android:text="@string/widget_empty"
         android:textColor="@color/afuchat_widget_text_muted"
        android:textSize="13sp"
        android:visibility="gone" />
    <LinearLayout
        android:id="@+id/widget_row_1"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="10dp"
        android:gravity="center_vertical"
        android:orientation="horizontal"
        android:visibility="gone">
        <TextView
            android:id="@+id/widget_row_1_initial"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:gravity="center"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="13sp"
            android:textStyle="bold"
            android:background="@drawable/afuchat_widget_avatar" />
        <TextView
            android:id="@+id/widget_row_1_label"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="10dp"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="14sp"
            android:maxLines="1"
            android:ellipsize="end" />
    </LinearLayout>
    <LinearLayout
        android:id="@+id/widget_row_2"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:gravity="center_vertical"
        android:orientation="horizontal"
        android:visibility="gone">
        <TextView
            android:id="@+id/widget_row_2_initial"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:gravity="center"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="13sp"
            android:textStyle="bold"
            android:background="@drawable/afuchat_widget_avatar" />
        <TextView
            android:id="@+id/widget_row_2_label"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="10dp"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="14sp"
            android:maxLines="1"
            android:ellipsize="end" />
    </LinearLayout>
    <LinearLayout
        android:id="@+id/widget_row_3"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:gravity="center_vertical"
        android:orientation="horizontal"
        android:visibility="gone">
        <TextView
            android:id="@+id/widget_row_3_initial"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:gravity="center"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="13sp"
            android:textStyle="bold"
            android:background="@drawable/afuchat_widget_avatar" />
        <TextView
            android:id="@+id/widget_row_3_label"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="10dp"
         android:textColor="@color/afuchat_widget_text"
            android:textSize="14sp"
            android:maxLines="1"
            android:ellipsize="end" />
    </LinearLayout>
</LinearLayout>
`;

const WIDGET_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/afuchat_widget_background" />
    <corners android:radius="24dp" />
</shape>
`;

const WIDGET_AVATAR_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="@color/afuchat_widget_avatar" />
</shape>
`;

const WIDGET_COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="afuchat_widget_background">#F5F0E8</color>
    <color name="afuchat_widget_text">#000000</color>
    <color name="afuchat_widget_text_muted">#8C7F6A</color>
    <color name="afuchat_widget_avatar">#EDE8DC</color>
</resources>
`;

const WIDGET_COLORS_NIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="afuchat_widget_background">#000000</color>
    <color name="afuchat_widget_text">#FFF8F0</color>
    <color name="afuchat_widget_text_muted">#717171</color>
    <color name="afuchat_widget_avatar">#111111</color>
</resources>
`;

function withShortcutManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) return manifestConfig;

    // android.app.shortcuts belongs on the launcher activity, not on the
    // application element. Android silently ignores the resource otherwise,
    // so dynamic conversation shortcuts never appear in the Sharesheet.
    const activities = application.activity ?? (application.activity = []);
    const mainActivity =
      activities.find((item) => {
        const name = item.$?.["android:name"] || "";
        return name === ".MainActivity" || name.endsWith(".MainActivity");
      }) || activities[0];
    if (!mainActivity) return manifestConfig;

    const metadata = mainActivity["meta-data"] ?? (mainActivity["meta-data"] = []);
    const existing = metadata.find(
      (item) => item.$?.["android:name"] === MANIFEST_META_NAME,
    );
    const shortcutMetadata = existing ?? { $: { "android:name": MANIFEST_META_NAME } };
    shortcutMetadata.$ = {
      ...shortcutMetadata.$,
      "android:resource": `@xml/${SHORTCUTS_RESOURCE}`,
    };
    if (!existing) metadata.push(shortcutMetadata);

    // Migrate manifests produced by older versions of this plugin, which
    // incorrectly placed the metadata under <application>.
    if (Array.isArray(application["meta-data"])) {
      application["meta-data"] = application["meta-data"].filter(
        (item) => item.$?.["android:name"] !== MANIFEST_META_NAME,
      );
      if (application["meta-data"].length === 0) delete application["meta-data"];
    }

    const receivers = application.receiver ?? (application.receiver = []);
    const widgetReceiverName = ".AfuChatWidgetProvider";
    const existingReceiver = receivers.find(
      (item) => item.$?.["android:name"] === widgetReceiverName,
    );
    if (!existingReceiver) {
      receivers.push({
        $: {
          "android:name": widgetReceiverName,
          "android:exported": "true",
          "android:label": "@string/widget_title",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/afuchat_widget_info",
            },
          },
        ],
      });
    }

    return manifestConfig;
  });
}

function withShortcutResources(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const resDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const xmlDir = path.join(resDir, "xml");
      const layoutDir = path.join(resDir, "layout");
      const drawableDir = path.join(resDir, "drawable");
      const valuesDir = path.join(resDir, "values");
      const valuesNightDir = path.join(resDir, "values-night");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.mkdirSync(valuesNightDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, `${SHORTCUTS_RESOURCE}.xml`),
        SHORTCUTS_XML,
      );
      fs.writeFileSync(path.join(xmlDir, "afuchat_widget_info.xml"), WIDGET_INFO_XML);
      fs.writeFileSync(path.join(layoutDir, "afuchat_widget.xml"), WIDGET_LAYOUT_XML);
      fs.writeFileSync(
        path.join(drawableDir, "afuchat_widget_background.xml"),
        WIDGET_BACKGROUND_XML,
      );
      fs.writeFileSync(
        path.join(drawableDir, "afuchat_widget_avatar.xml"),
        WIDGET_AVATAR_XML,
      );
      fs.writeFileSync(path.join(valuesDir, "afuchat_widget_colors.xml"), WIDGET_COLORS_XML);
      fs.writeFileSync(
        path.join(valuesNightDir, "afuchat_widget_colors.xml"),
        WIDGET_COLORS_NIGHT_XML,
      );

      const stringsPath = path.join(valuesDir, "strings.xml");
      let strings = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, "utf8")
        : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
      if (!strings.includes(ANDROID_MARKER)) {
        strings = strings.replace("</resources>", `${SHORTCUT_STRINGS}</resources>`);
        fs.writeFileSync(stringsPath, strings);
      }
      if (!strings.includes('name="widget_title"')) {
        strings = strings.replace(
          "</resources>",
          `    <string name="widget_title">Recent chats</string>
    <string name="widget_empty">Open AfuChat to see your recent chats</string>
</resources>`,
        );
        fs.writeFileSync(stringsPath, strings);
      }

      return modConfig;
    },
  ]);
}

function withNativeShareShortcuts(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const platformRoot = modConfig.modRequest.platformProjectRoot;
      const packageDir = path.join(
        platformRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "afuchat",
        "mobile",
      );
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, "AfuChatShareShortcutsModule.kt"),
        `package com.afuchat.mobile

import android.content.Context
import android.content.Intent
 import android.appwidget.AppWidgetManager
 import android.appwidget.AppWidgetHost
 import android.content.ComponentName
 import android.media.AudioManager
 import android.os.Handler
 import android.os.Looper
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.app.Person
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
 import org.json.JSONArray
 import org.json.JSONObject
import java.net.URL

class AfuChatShareShortcutsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val avatarCache = mutableMapOf<String, Bitmap>()

  private data class ChatShortcut(
    val chatId: String,
    val label: String,
    val avatarUrl: String?,
  )

  override fun getName(): String = "AfuChatShareShortcuts"

  @ReactMethod
  fun update(recipients: ReadableArray, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      promise.resolve(false)
      return
    }

    val chats = mutableListOf<ChatShortcut>()
    for (index in 0 until recipients.size()) {
      val item = recipients.getMap(index) ?: continue
      val chatId = if (item.hasKey("chatId") && !item.isNull("chatId")) item.getString("chatId") else null
      val label = if (item.hasKey("label") && !item.isNull("label")) item.getString("label") else null
      val avatarUrl = if (item.hasKey("avatarUrl") && !item.isNull("avatarUrl")) item.getString("avatarUrl") else null
      if (!chatId.isNullOrBlank() && !label.isNullOrBlank()) {
        chats.add(ChatShortcut(chatId, label, avatarUrl))
      }
      if (chats.size >= 8) break
    }

    val context = reactContext.applicationContext
    Thread {
      try {
        val manager = context.getSystemService(Context.SHORTCUT_SERVICE) as? ShortcutManager
        if (manager == null) {
          promise.resolve(false)
          return@Thread
        }

         val widgetRows = JSONArray()
         chats.take(8).forEach { chat ->
           widgetRows.put(JSONObject().apply {
             put("chatId", chat.chatId)
             put("label", chat.label)
           })
         }
         context.getSharedPreferences("afuchat_widget", Context.MODE_PRIVATE)
           .edit()
           .putString("recent_chats", widgetRows.toString())
           .apply()

        val shortcuts = chats.mapIndexed { rank, chat ->
          val icon = loadAvatarIcon(chat.avatarUrl)
            ?: createInitialIcon(context, chat.label)
           val chatIntent = Intent(Intent.ACTION_VIEW).apply {
             data = Uri.parse("afuchat://chat/" + Uri.encode(chat.chatId))
             setPackage(context.packageName)
            putExtra("afuchat_chat_id", chat.chatId)
          }
          val builder = ShortcutInfo.Builder(context, "share-chat-" + chat.chatId)
            .setShortLabel(chat.label.take(25))
             .setLongLabel(("Open " + chat.label).take(80))
            .setIcon(icon)
             .setIntent(chatIntent)
            .setRank(rank)
            .setCategories(setOf("android.shortcut.conversation"))
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            builder.setLongLived(true)
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setPerson(Person.Builder().setName(chat.label).setIcon(icon).build())
          }
          builder.build()
        }
        manager.setDynamicShortcuts(shortcuts)
         AfuChatWidgetProvider.updateAll(context)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("SHARE_SHORTCUTS_UPDATE_FAILED", error)
      }
    }.start()
  }

  private fun loadAvatarIcon(avatarUrl: String?): Icon? {
    if (avatarUrl.isNullOrBlank()) return null
    synchronized(avatarCache) {
      avatarCache[avatarUrl]?.let { return Icon.createWithBitmap(it) }
    }
    return try {
      val connection = URL(avatarUrl).openConnection()
      connection.connectTimeout = 4000
      connection.readTimeout = 4000
      connection.getInputStream().use { stream ->
        val bitmap = BitmapFactory.decodeStream(stream) ?: return null
        synchronized(avatarCache) {
          avatarCache[avatarUrl] = bitmap
        }
        Icon.createWithBitmap(bitmap)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun createInitialIcon(context: Context, label: String): Icon {
    val size = 192
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    paint.color = android.graphics.Color.rgb(20, 31, 190)
    canvas.drawColor(paint.color)
    paint.color = android.graphics.Color.WHITE
    paint.textAlign = android.graphics.Paint.Align.CENTER
    paint.textSize = 78f
    paint.typeface = android.graphics.Typeface.DEFAULT_BOLD
    val initial = label.trim().firstOrNull()?.uppercase() ?: "A"
    val baseline = size / 2f - (paint.ascent() + paint.descent()) / 2f
    canvas.drawText(initial, size / 2f, baseline, paint)
    return Icon.createWithBitmap(bitmap)
  }

  @ReactMethod
  fun getInitialChatId(promise: Promise) {
    try {
      val intent = reactApplicationContext.currentActivity?.intent
      val data = intent?.data
      val fromData = data?.getQueryParameter("chatId")
        ?: if (data?.host == "chat") data.pathSegments.firstOrNull() else null
      val fromExtra = intent?.getStringExtra("afuchat_chat_id")
      val shortcutId = intent?.getStringExtra("android.intent.extra.shortcut.ID")
      val fromShortcut = shortcutId
        ?.takeIf { it.startsWith("share-chat-") }
        ?.removePrefix("share-chat-")
      val chatId = fromData ?: fromExtra ?: fromShortcut
      promise.resolve(chatId)
    } catch (error: Exception) {
      promise.reject("SHARE_CHAT_ID_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun requestWidgetPin(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(false)
      return
    }

    // Launcher widget APIs must be called on the main thread. React Native
    // native methods run on a module queue, which made the old request fail
    // silently on some Android launchers.
    Handler(Looper.getMainLooper()).post {
      try {
        val context = reactApplicationContext.applicationContext
        val manager = context.getSystemService(Context.APPWIDGET_SERVICE) as? AppWidgetManager
        val provider = ComponentName(context, AfuChatWidgetProvider::class.java)
        if (manager == null) {
          promise.resolve(false)
          return@post
        }
        if (manager.isRequestPinAppWidgetSupported) {
          promise.resolve(manager.requestPinAppWidget(provider, null, null))
          return@post
        }

        // Older launchers do not support the pin API, but can still open the
        // system widget picker. This gives Settings a usable install action
        // instead of requiring users to discover the widget manually.
         val host = AppWidgetHost(context, 0xAF01)
         val widgetId = host.allocateAppWidgetId()
        val picker = Intent(AppWidgetManager.ACTION_APPWIDGET_PICK).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, provider)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(picker)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("WIDGET_PIN_REQUEST_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun setSpeakerphone(enabled: Boolean, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
      promise.resolve(false)
      return
    }
    Handler(Looper.getMainLooper()).post {
      try {
        val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audio == null) {
          promise.resolve(false)
          return@post
        }
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = enabled
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("CALL_AUDIO_ROUTE_FAILED", error)
      }
    }
  }
}
`,
      );

      fs.writeFileSync(
        path.join(packageDir, "AfuChatWidgetProvider.kt"),
        `package com.afuchat.mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray

class AfuChatWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      updateWidget(context, appWidgetManager, appWidgetId)
    }
  }

  private fun updateWidget(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
  ) {
    val views = RemoteViews(context.packageName, R.layout.afuchat_widget)
    val raw = context
      .getSharedPreferences("afuchat_widget", Context.MODE_PRIVATE)
      .getString("recent_chats", "[]")
    val chats = try {
      JSONArray(raw ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }

    val rowIds = intArrayOf(R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3)
    val initialIds = intArrayOf(
      R.id.widget_row_1_initial,
      R.id.widget_row_2_initial,
      R.id.widget_row_3_initial,
    )
    val labelIds = intArrayOf(
      R.id.widget_row_1_label,
      R.id.widget_row_2_label,
      R.id.widget_row_3_label,
    )

    views.setViewVisibility(
      R.id.widget_empty,
      if (chats.length() == 0) View.VISIBLE else View.GONE,
    )
    views.setOnClickPendingIntent(
      R.id.widget_title,
      pendingIntent(context, "afuchat://chats", 9000),
    )

    for (index in rowIds.indices) {
      if (index >= chats.length()) {
        views.setViewVisibility(rowIds[index], View.GONE)
        continue
      }

      val chat = chats.optJSONObject(index) ?: continue
      val chatId = chat.optString("chatId")
      val label = chat.optString("label", "Chat")
      views.setViewVisibility(rowIds[index], View.VISIBLE)
      views.setTextViewText(initialIds[index], label.trim().firstOrNull()?.uppercase() ?: "A")
      views.setTextViewText(labelIds[index], label)
      views.setOnClickPendingIntent(
        rowIds[index],
        pendingIntent(context, "afuchat://chat/" + Uri.encode(chatId), index + 9001),
      )
    }

    manager.updateAppWidget(appWidgetId, views)
  }

  private fun pendingIntent(context: Context, url: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setClassName(context, "com.afuchat.mobile.MainActivity")
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, AfuChatWidgetProvider::class.java)
      manager.getAppWidgetIds(component).forEach { appWidgetId ->
        AfuChatWidgetProvider().updateWidget(context, manager, appWidgetId)
      }
    }
  }
}
`,
      );

      fs.writeFileSync(
        path.join(packageDir, "AfuChatShareShortcutsPackage.kt"),
        `package com.afuchat.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AfuChatShareShortcutsPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(AfuChatShareShortcutsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`,
      );

      return modConfig;
    },
  ]);
}

function withNativePackageRegistration(config) {
  return withMainApplication(config, (applicationConfig) => {
    let contents = applicationConfig.modResults.contents;
    const importLine = "import com.afuchat.mobile.AfuChatShareShortcutsPackage";
    const moduleMarker = "add(AfuChatShareShortcutsPackage())";
    const webRtcImportLine = "import com.oney.WebRTCModule.WebRTCModulePackage";
    const webRtcModuleMarker = "add(WebRTCModulePackage())";
    const staleDataSyncImport = "import com.afuchat.mobile.AfuChatDataSyncPackage";

    if (contents.includes(staleDataSyncImport)) {
      contents = contents.replace(
        new RegExp(`\\s*${staleDataSyncImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"),
        "\n",
      );
    }

    if (!contents.includes(importLine)) {
      const configurationImport = "import android.content.res.Configuration";
      if (contents.includes(configurationImport)) {
        contents = contents.replace(
          configurationImport,
          `${configurationImport}\n\n${importLine}`,
        );
      } else {
        contents = contents.replace(
          /^(package [^\n]+)$/m,
          `$1\n\n${importLine}`,
        );
      }
    }

    if (!contents.includes(moduleMarker)) {
      const existingManualPackage = "add(AfuChatDataSyncPackage())";
      if (contents.includes(existingManualPackage)) {
        contents = contents.replace(
          new RegExp(`\\s*${existingManualPackage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"),
          "\n",
        );
      }
      contents = contents.replace(
        /(\s*\/\/ Packages that cannot be autolinked yet can be added manually here, for example:)/,
        `\n          ${moduleMarker}$1`,
      );
    }

    // Expo's module autolinker does not include react-native-webrtc 124 in
    // the SDK 55 package list. Register its ReactPackage explicitly or the
    // JS package evaluates with NativeModules.WebRTCModule == null in the
    // installed Android build.
    if (!contents.includes(webRtcImportLine)) {
      contents = contents.replace(
        importLine,
        `${importLine}\nimport ${webRtcImportLine.slice("import ".length)}`,
      );
    }
    if (!contents.includes(webRtcModuleMarker)) {
      contents = contents.replace(
        moduleMarker,
        `${moduleMarker}\n          ${webRtcModuleMarker}`,
      );
    }

    applicationConfig.modResults.contents = contents;
    return applicationConfig;
  });
}

function withIosShortcutRouting(config) {
  return withAppDelegate(config, (delegateConfig) => {
    let contents = delegateConfig.modResults.contents;

    if (!contents.includes("import UIKit")) {
      contents = `import UIKit\n${contents}`;
    }

    if (!contents.includes(IOS_LAUNCH_MARKER)) {
      const coldStartForwarder = `

    ${IOS_LAUNCH_MARKER}
    if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
       let urlString = shortcutItem.userInfo?["url"] as? String,
       let url = URL(string: urlString) {
      DispatchQueue.main.async {
        application.open(url, options: [:], completionHandler: nil)
      }
    }
`;
      const launchAnchor =
        "return super.application(application, didFinishLaunchingWithOptions: launchOptions)";
      if (contents.includes(launchAnchor)) {
        contents = contents.replace(
          launchAnchor,
          `${coldStartForwarder}\n    ${launchAnchor}`,
        );
      }
    }

    if (contents.includes(IOS_MARKER)) {
      delegateConfig.modResults.contents = contents;
      return delegateConfig;
    }

    const shortcutHandler = `

  ${IOS_MARKER}
  override func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    if let urlString = shortcutItem.userInfo?["url"] as? String,
       let url = URL(string: urlString) {
      let handled = super.application(application, open: url, options: [:])
      completionHandler(handled)
      return
    }
    super.application(
      application,
      performActionFor: shortcutItem,
      completionHandler: completionHandler
    )
  }
`;
    const closingBrace = contents.lastIndexOf("\n}");
    delegateConfig.modResults.contents =
      closingBrace >= 0
        ? `${contents.slice(0, closingBrace)}${shortcutHandler}${contents.slice(closingBrace)}`
        : `${contents}${shortcutHandler}`;
    return delegateConfig;
  });
}

module.exports = function withAppShortcuts(config) {
  config = withShortcutManifest(config);
  config = withShortcutResources(config);
  config = withNativeShareShortcuts(config);
  config = withNativePackageRegistration(config);
  config = withIosShortcutRouting(config);
  return config;
};