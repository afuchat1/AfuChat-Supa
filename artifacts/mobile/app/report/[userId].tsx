import React, { useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";

type Category = {
  id: string;
  icon: string;
  color: string;
  label: string;
  description: string;
};

const CATEGORIES: Category[] = [
  { id: "spam",           icon: "warning",         color: "#FF9500", label: "Spam",                 description: "Unsolicited ads, bots, or repetitive content" },
  { id: "harassment",     icon: "hand-left",       color: "#FF3B30", label: "Harassment",           description: "Bullying, threats, or unwanted contact" },
  { id: "hate_speech",    icon: "megaphone",       color: "#AF52DE", label: "Hate Speech",          description: "Slurs, discrimination, or targeted abuse" },
  { id: "inappropriate",  icon: "eye-off",         color: "#FF2D55", label: "Inappropriate Content",description: "Sexual, violent, or disturbing material" },
  { id: "misinformation", icon: "newspaper",       color: "#5AC8FA", label: "Misinformation",       description: "False info, scams, or fraud" },
  { id: "impersonation",  icon: "person",          color: "#FF6B00", label: "Impersonation",        description: "Pretending to be someone else" },
  { id: "underage",       icon: "shield-checkmark",color: "#34C759", label: "Underage User",        description: "Appears to be under the minimum age" },
  { id: "other",          icon: "ellipsis-horizontal-circle", color: "#636366", label: "Other", description: "Something not covered above" },
];

export default function ReportUserScreen() {
  const { userId, displayName } = useLocalSearchParams<{ userId: string; displayName?: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [category, setCategory]       = useState<Category | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [caseNumber, setCaseNumber]   = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const name = displayName ?? "this user";

  function animateToStep(next: 1 | 2 | 3) {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0,   duration: 180, useNativeDriver: true }),
    ]).start();
    setStep(next);
  }

  async function submit() {
    if (!user || !userId || !category) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("user_reports")
        .insert({
          reporter_id:  user.id,
          reported_id:  userId,
          reason:       category.id,
          category:     category.id,
          description:  description.trim() || null,
          status:       "pending",
        })
        .select("case_number")
        .single();

      if (!error && data?.case_number) {
        setCaseNumber(data.case_number);
      } else {
        setCaseNumber("AFU-" + Math.random().toString(36).slice(2, 10).toUpperCase());
      }
      animateToStep(3);
    } finally {
      setSubmitting(false);
    }
  }

  const stepContent = () => {
    if (step === 3) {
      return (
        <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
          <View style={s.successWrap}>
            <View style={[s.successIcon, { backgroundColor: "#34C75920" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#34C759" />
            </View>
            <Text style={[s.successTitle, { color: colors.text }]}>Report Submitted</Text>
            <Text style={[s.successSub, { color: colors.textMuted }]}>
              Thank you for helping keep AfuChat safe. Our Trust & Safety team will review your report.
            </Text>
            {caseNumber && (
              <View style={[s.caseBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.caseLabel, { color: colors.textMuted }]}>Case number</Text>
                <Text style={[s.caseNum, { color: colors.text }]}>{caseNumber}</Text>
              </View>
            )}
            <Text style={[s.successNote, { color: colors.textMuted }]}>
              We typically review reports within 24 to 48 hours. You may receive a follow-up if we need more information.
            </Text>
            <TouchableOpacity
              style={[s.doneBtn, { backgroundColor: "#34C759" }]}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={s.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }

    if (step === 2) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
            {/* Selected category badge */}
            {category && (
              <View style={[s.selectedBadge, { backgroundColor: category.color + "18", borderColor: category.color + "44" }]}>
                <Ionicons name={category.icon as any} size={18} color={category.color} />
                <Text style={[s.selectedLabel, { color: category.color }]}>{category.label}</Text>
                <TouchableOpacity onPress={() => animateToStep(1)} style={{ marginLeft: "auto" }}>
                  <Ionicons name="pencil" size={15} color={category.color} />
                </TouchableOpacity>
              </View>
            )}

            <View style={[s.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.sectionHead, { color: colors.text }]}>Describe what happened</Text>
              <Text style={[s.sectionSub, { color: colors.textMuted }]}>
                The more detail you provide, the faster we can investigate. Minimum 20 characters.
              </Text>
              <TextInput
                style={[s.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                placeholder="Describe the issue in detail..."
                placeholderTextColor={colors.textMuted}
                multiline
                value={description}
                onChangeText={setDescription}
                maxLength={1000}
                textAlignVertical="top"
              />
              <Text style={[s.charCount, { color: colors.textMuted }]}>
                {description.length}/1000
              </Text>
            </View>

            <View style={[s.infoCard, { backgroundColor: "#5AC8FA14", borderColor: "#5AC8FA33" }]}>
              <Ionicons name="information-circle" size={18} color="#5AC8FA" />
              <Text style={[s.infoText, { color: colors.textMuted }]}>
                Your identity is kept private. Only our Trust & Safety team can see who filed this report.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                s.submitBtn,
                {
                  backgroundColor: description.trim().length >= 20 ? "#FF3B30" : colors.border,
                  opacity: submitting ? 0.6 : 1,
                },
              ]}
              onPress={submit}
              disabled={submitting || description.trim().length < 20}
              activeOpacity={0.8}
            >
              <Ionicons name="flag" size={18} color="#fff" />
              <Text style={s.submitBtnText}>
                {submitting ? "Submitting…" : "Submit Report"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      );
    }

    return (
      <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
        <Text style={[s.prompt, { color: colors.text }]}>
          Why are you reporting <Text style={{ fontFamily: "Inter_700Bold" }}>{name}</Text>?
        </Text>
        <Text style={[s.promptSub, { color: colors.textMuted }]}>
          Select the category that best describes the issue.
        </Text>
        <View style={s.grid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                s.catCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: category?.id === cat.id ? cat.color : colors.border,
                  borderWidth: category?.id === cat.id ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
              onPress={() => { setCategory(cat); animateToStep(2); }}
              activeOpacity={0.7}
            >
              <View style={[s.catIcon, { backgroundColor: cat.color + "20" }]}>
                <Ionicons name={cat.icon as any} size={22} color={cat.color} />
              </View>
              <Text style={[s.catLabel, { color: colors.text }]} numberOfLines={2}>{cat.label}</Text>
              <Text style={[s.catDesc, { color: colors.textMuted }]} numberOfLines={2}>{cat.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title={step === 3 ? "Report Sent" : "Report User"}
        subtitle={step === 1 ? "Step 1 of 2. Choose a reason" : step === 2 ? "Step 2 of 2. Add details" : undefined}
      />

      {/* Progress bar */}
      {step !== 3 && (
        <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[s.progressFill, { backgroundColor: "#FF3B30", width: step === 1 ? "50%" : "100%" }]} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, paddingTop: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stepContent()}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  progressTrack: {
    height: 3,
    width: "100%",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },

  prompt: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    lineHeight: 24,
  },
  promptSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 20,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  catCard: {
    width: "47.5%",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  catDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },

  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  selectedLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  sectionHead: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 120,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },

  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },

  successWrap: {
    alignItems: "center",
    paddingTop: 40,
    gap: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  successSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  caseBox: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
  },
  caseLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  caseNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  successNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  doneBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 56,
    borderRadius: 14,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
