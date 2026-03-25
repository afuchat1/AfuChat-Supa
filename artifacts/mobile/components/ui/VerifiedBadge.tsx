import React from "react";
import { Ionicons } from "@expo/vector-icons";
import Colors from "../../constants/colors";

type Props = {
  isVerified?: boolean;
  isOrganizationVerified?: boolean;
  size?: number;
};

export default function VerifiedBadge({ isVerified, isOrganizationVerified, size = 14 }: Props) {
  if (isOrganizationVerified) {
    return <Ionicons name="checkmark-circle" size={size} color="#D4A853" style={{ marginLeft: 4 }} />;
  }
  if (isVerified) {
    return <Ionicons name="checkmark-circle" size={size} color={Colors.brand} style={{ marginLeft: 4 }} />;
  }
  return null;
}
