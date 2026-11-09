import { Linking, Platform } from "react-native";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/lib/supabase";
import { isOnline } from "@/lib/offlineStore";
import {
  getLocalPhoneContacts,
  replacePhoneContactMatches,
  saveDevicePhoneContacts,
  type DevicePhoneContact,
  type LocalPhoneContact,
} from "@/lib/storage/localPhoneContacts";

export const AFUCHAT_DOWNLOAD_URL =
  "https://play.google.com/store/apps/details?id=com.afuchat.mobile";

export const AFUCHAT_INVITE_MESSAGE =
  `Hey! I’m using AfuChat to stay connected through messaging, calls, and sharing. Join me there so we can connect on AfuChat: ${AFUCHAT_DOWNLOAD_URL}`;

function countryRegion(value: unknown): CountryCode | undefined {
  if (typeof value !== "string") return undefined;
  const region = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(region) ? (region as CountryCode) : undefined;
}

/**
 * Matching uses E.164 whenever the device provides enough country information.
 * The original device number is kept separately for display, so formatting
 * never changes the contact's visible name or device ordering.
 */
export function normalizePhoneNumber(raw: string, region?: unknown): string {
  const value = raw.trim();
  if (!value) return "";

  const parsed = parsePhoneNumberFromString(value, countryRegion(region));
  // Never invent a country code for a local or malformed number. A guessed
  // "+digits" value can point WhatsApp at a completely different person.
  if (!parsed || !parsed.isPossible() || !parsed.isValid()) return "";
  return parsed.number;
}

export function isValidInternationalPhoneNumber(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("+")
    && normalizePhoneNumber(normalized) === normalized;
}

/**
 * Opens the system dialer for a validated contact number.
 *
 * This intentionally uses the user-confirmed dialer flow instead of placing
 * a call silently. It works without CALL_PHONE and keeps the call under the
 * phone OS's control.
 */
export async function callPhoneNumber(phone: string): Promise<boolean> {
  if (!isValidInternationalPhoneNumber(phone)) return false;

  const url = `tel:${phone}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return true;
    }
  } catch {}

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function readDevicePhoneContacts(): Promise<{
  contacts: DevicePhoneContact[];
  permission: "granted" | "denied" | "unavailable";
}> {
  if (Platform.OS === "web") return { contacts: [], permission: "unavailable" };

  try {
    const Contacts = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return { contacts: [], permission: "denied" };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });
    const contacts: DevicePhoneContact[] = [];

    data.forEach((contact, position) => {
      const name = contact.name?.trim() || "Unknown";
      (contact.phoneNumbers ?? []).forEach((phoneNumber, phoneIndex) => {
        const raw = (phoneNumber.number ?? "").trim();
        const normalized = normalizePhoneNumber(
          raw,
          (phoneNumber as { countryCode?: string | null }).countryCode,
        );
        if (!raw || !normalized) return;

        contacts.push({
          key: `${contact.id ?? position}:${phoneIndex}`,
          name,
          // Keep the device's exact display value. Only normalized_phone is
          // used for matching, so local contacts never get reformatted.
          phone: raw,
          normalized_phone: normalized,
          position,
          phone_index: phoneIndex,
        });
      });
    });

    return { contacts, permission: "granted" };
  } catch {
    return { contacts: [], permission: "unavailable" };
  }
}

/**
 * Cached rows are returned by the hook immediately. This function saves the
 * device scan before doing any network request, then resolves AfuChat matches
 * in the background without changing the original device order.
 */
export async function syncPhoneContacts(
  userId: string | undefined,
  onDeviceContacts?: (contacts: LocalPhoneContact[]) => void,
  onUpdatedContacts?: (contacts: LocalPhoneContact[]) => void,
): Promise<"granted" | "denied" | "unavailable"> {
  const result = await readDevicePhoneContacts();
  if (result.permission !== "granted") return result.permission;

  await saveDevicePhoneContacts(result.contacts);
  const local = await getLocalPhoneContacts();
  onDeviceContacts?.(local);
  if (!userId || !isOnline()) return "granted";

  try {
    const phones = [...new Set(result.contacts.map((contact) => contact.normalized_phone))];
    const matches = [];
    for (let index = 0; index < phones.length; index += 100) {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, handle, avatar_url, bio, acoin, is_verified, is_organization_verified, phone_number",
        )
        .in("phone_number", phones.slice(index, index + 100))
        .neq("id", userId);
      if (error) return "granted";
      if (data) matches.push(...data);
    }

    await replacePhoneContactMatches(
      matches.map((profile: any) => ({
        normalized_phone: normalizePhoneNumber(profile.phone_number),
        user_id: profile.id,
        display_name: profile.display_name ?? "",
        handle: profile.handle ?? "",
        avatar_url: profile.avatar_url ?? null,
        bio: profile.bio ?? null,
        acoin: Number(profile.acoin ?? 0),
        is_verified: !!profile.is_verified,
        is_organization_verified: !!profile.is_organization_verified,
      })),
    );
    onUpdatedContacts?.(await getLocalPhoneContacts());
  } catch {
    // The device scan is already cached; matching is best-effort.
  }
  return "granted";
}

/**
 * Opens the native SMS composer addressed directly to a validated phone
 * number. Invites intentionally do not use share sheets or app-specific
 * deep links: the Invite action is always a direct-number invite.
 */
export async function sendPhoneInvite(
  normalizedPhone: string,
  method: "whatsapp" | "telegram" | "sms" = "sms",
): Promise<void> {
  if (!isValidInternationalPhoneNumber(normalizedPhone)) {
    return;
  }

  const encodedMessage = encodeURIComponent(AFUCHAT_INVITE_MESSAGE);
  const digits = normalizedPhone.replace(/\D/g, "");
  const appUrl =
    method === "whatsapp"
      ? `whatsapp://send?phone=${digits}&text=${encodedMessage}`
      : method === "telegram"
        ? `tg://msg_url?url=${encodeURIComponent(AFUCHAT_DOWNLOAD_URL)}&text=${encodedMessage}`
        : `sms:${normalizedPhone}?body=${encodedMessage}`;

  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {}

  // Some Android builds reject canOpenURL even when the selected app is
  // available, so try the direct URI once more before reporting the failure.
  try {
    await Linking.openURL(appUrl);
  } catch {
    // Keep the invite action quiet when the selected app is unavailable.
  }
}

/**
 * Opens WhatsApp for the exact international phone number. WhatsApp itself
 * decides whether that number has an account; the number is never replaced
 * with a generic share destination.
 */
export async function sendWhatsAppInvite(normalizedPhone: string): Promise<void> {
  if (!isValidInternationalPhoneNumber(normalizedPhone)) {
    return;
  }

  const digits = normalizedPhone.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(AFUCHAT_INVITE_MESSAGE);
  const appUrl = `whatsapp://send?phone=${digits}&text=${encodedMessage}`;
  const webUrl = `https://wa.me/${digits}?text=${encodedMessage}`;

  try {
    if (await Linking.canOpenURL(appUrl)) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {}

  try {
    await Linking.openURL(webUrl);
  } catch {
    // Keep the invite action quiet when WhatsApp is not installed.
  }
}