import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAppAccent } from "@/context/AppAccentContext";

type Props = {
  isVerified?: boolean;
  isOrganizationVerified?: boolean;
  size?: number;
};

export default function VerifiedBadge({ isVerified, isOrganizationVerified, size = 14 }: Props) {
  const { accent } = useAppAccent();
  if (isOrganizationVerified) {
    return <Ionicons name="checkmark-circle" size={size} color="#D4A853" style={{ marginLeft: 4 }} />;
  }
  if (isVerified) {
    return <Ionicons name="checkmark-circle" size={size} color={accent} style={{ marginLeft: 4 }} />;
  }
  return null;
}
