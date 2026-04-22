import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

const CATEGORIES = ["utility", "social", "finance", "games", "education", "productivity", "entertainment", "tools", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const HTTPS_RE = /^https:\/\/.+/i;
const GITHUB_RE = /^https:\/\/(www\.)?github\.com\/.+/i;

function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function SubmitMiniAppScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("utility");
  const [iconUrl, setIconUrl] = useState("");
  const [appUrl, setAppUrl] = useState("https://");
  const [privacyUrl, setPrivacyUrl] = useState("https://");
  const [termsUrl, setTermsUrl] = useState("https://");
  const [githubUrl, setGithubUrl] = useState("https://github.com/");
  const [submitting, setSubmitting] = useState(false);
  const [touchedSlug, setTouchedSlug] = useState(false);

  const effectiveSlug = useMemo(
    () => (touchedSlug && slug ? slug : suggestSlug(name)),
    [name, slug, touchedSlug],
  );

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (name.trim().length > 60) e.name = "Name is too long (max 60)";
    if (!SLUG_RE.test(effectiveSlug)) e.slug = "Slug must be 3–40 chars, lowercase letters/numbers/dashes";
    if (tagline.length > 140) e.tagline = "Max 140 characters";
    if (description.length > 4000) e.description = "Max 4000 characters";
    if (iconUrl && !HTTPS_RE.test(iconUrl)) e.iconUrl = "Must start with https://";
    if (!HTTPS_RE.test(appUrl)) e.appUrl = "App URL must start with https://";
    if (!HTTPS_RE.test(privacyUrl)) e.privacyUrl = "Privacy URL must start with https://";
    if (!HTTPS_RE.test(termsUrl)) e.termsUrl = "Terms URL must start with https://";
    if (!GITHUB_RE.test(githubUrl)) e.githubUrl = "Must be a https://github.com/... URL";
    return e;
  }, [name, effectiveSlug, tagline, description, iconUrl, appUrl, privacyUrl, termsUrl, githubUrl]);

  const canSubmit = !submitting && !!user && Object.keys(errors).length === 0;

  async function onSubmit() {
    if (!user) {
      showAlert("Sign in required", "Please sign in to publish a mini app.");
      return;
    }
    if (!canSubmit) {
      showAlert("Fix errors", "Please correct the highlighted fields.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("mini_apps").insert({
        slug: effectiveSlug,
        name: name.trim(),
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        category,
        icon_url: iconUrl.trim() || null,
        app_url: appUrl.trim(),
        privacy_url: privacyUrl.trim(),
        terms_url: termsUrl.trim(),
        github_url: githubUrl.trim(),
        author_id: user.id,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505") {
          showAlert("Slug taken", "That slug is already in use. Please choose a different one.");
        } else {
          showAlert("Failed to submit", error.message);
        }
        setSubmitting(false);
        return;
      }
      showAlert(
        "Submitted!",
        "Your mini app is awaiting review. Once approved, it will appear at /apps/" + effectiveSlug,
        [{ text: "OK", onPress: () => router.replace("/apps" as any) }],
      );
    } catch (err: any) {
      showAlert("Error", err?.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Publish Mini App</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Build something lightweight on the web, then publish it to AfuChat. Your app loads inside an in-app frame at
          <Text style={{ color: colors.text, fontWeight: "600" }}> afuchat.com/apps/your-slug</Text>.
        </Text>

        <Field label="App name *" error={errors.name} colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="My Mini App"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            maxLength={60}
          />
        </Field>

        <Field label="Slug *" hint="Used in the URL. Letters, numbers, and dashes." error={errors.slug} colors={colors}>
          <TextInput
            value={effectiveSlug}
            onChangeText={(t) => {
              setTouchedSlug(true);
              setSlug(t.toLowerCase());
            }}
            placeholder="my-mini-app"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Will be: afuchat.com/apps/{effectiveSlug || "your-slug"}
          </Text>
        </Field>

        <Field label="Category *" colors={colors}>
          <View style={styles.catRow}>
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.catChip,
                    { backgroundColor: active ? colors.accent : colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={{ color: active ? "#fff" : colors.text, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="Tagline" hint="Shown under the name (max 140 chars)" error={errors.tagline} colors={colors}>
          <TextInput
            value={tagline}
            onChangeText={setTagline}
            placeholder="A one-liner about your app"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            maxLength={140}
          />
        </Field>

        <Field label="Description" error={errors.description} colors={colors}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What does your app do?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, minHeight: 100, textAlignVertical: "top" },
            ]}
            maxLength={4000}
          />
        </Field>

        <Field label="Icon URL" hint="Square image, 256×256 recommended" error={errors.iconUrl} colors={colors}>
          <TextInput
            value={iconUrl}
            onChangeText={setIconUrl}
            placeholder="https://example.com/icon.png"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
        </Field>

        <Field label="App URL *" hint="HTTPS URL of your web app. Must allow embedding (no X-Frame-Options DENY)." error={errors.appUrl} colors={colors}>
          <TextInput
            value={appUrl}
            onChangeText={setAppUrl}
            placeholder="https://yourdomain.com/app"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
        </Field>

        <Field label="Privacy Policy URL *" error={errors.privacyUrl} colors={colors}>
          <TextInput
            value={privacyUrl}
            onChangeText={setPrivacyUrl}
            placeholder="https://yourdomain.com/privacy"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
        </Field>

        <Field label="Terms of Service URL *" error={errors.termsUrl} colors={colors}>
          <TextInput
            value={termsUrl}
            onChangeText={setTermsUrl}
            placeholder="https://yourdomain.com/terms"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
        </Field>

        <Field label="GitHub Repository *" hint="Public GitHub repo for your app" error={errors.githubUrl} colors={colors}>
          <TextInput
            value={githubUrl}
            onChangeText={setGithubUrl}
            placeholder="https://github.com/your/repo"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
        </Field>

        <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
            Submissions are reviewed before going live. Apps must follow AfuChat policies. Privacy, Terms, and source links
            are required and shown to every user.
          </Text>
        </View>

        <TouchableOpacity
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitBtn,
            { backgroundColor: canSubmit ? colors.accent : colors.border, opacity: canSubmit ? 1 : 0.7 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Submit for review</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  error,
  colors,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>{label}</Text>
      {children}
      {!!hint && !error && (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{hint}</Text>
      )}
      {!!error && <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
});
