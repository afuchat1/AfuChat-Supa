import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import {
  REVENUECAT_ANDROID_API_KEY,
  REVENUECAT_IOS_API_KEY,
  REVENUECAT_TEST_API_KEY,
} from "@/lib/env";

export const ACOIN_OFFERING_IDENTIFIER = "acoin_topup";

export type AcoinStorePackage = {
  amount: number;
  package: PurchasesPackage;
};

let configuredApiKey: string | null = null;
let configuredUserId: string | null = null;
let configurePromise: Promise<void> | null = null;

function isDevelopmentStore(): boolean {
  return __DEV__ || Constants.executionEnvironment === "storeClient";
}

function getApiKey(): string {
  if (isDevelopmentStore()) {
    if (REVENUECAT_TEST_API_KEY) return REVENUECAT_TEST_API_KEY;
    throw new Error("Acoin test purchases are not configured for this build.");
  }

  const key = Platform.OS === "ios"
    ? REVENUECAT_IOS_API_KEY
    : Platform.OS === "android"
      ? REVENUECAT_ANDROID_API_KEY
      : "";
  if (!key) throw new Error("In-app purchases are not configured for this device.");
  return key;
}

async function configureForUser(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("App Store purchases are not available on the web.");
  }
  if (!userId) throw new Error("Sign in before purchasing ACoins.");

  const apiKey = getApiKey();
  if (configurePromise) await configurePromise;

  if (!configuredApiKey) {
    configurePromise = (async () => {
      const alreadyConfigured = await Purchases.isConfigured();
      if (!alreadyConfigured) Purchases.configure({ apiKey, appUserID: userId });
      configuredApiKey = apiKey;
      configuredUserId = alreadyConfigured ? await Purchases.getAppUserID() : userId;
    })();
    try {
      await configurePromise;
    } finally {
      configurePromise = null;
    }
  }

  if (configuredApiKey !== apiKey) {
    throw new Error("The purchase service is already configured for another store.");
  }
  if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }
}

export async function getAcoinStorePackages(userId: string): Promise<AcoinStorePackage[]> {
  await configureForUser(userId);
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[ACOIN_OFFERING_IDENTIFIER];
  if (!offering) {
    throw new Error("Acoin purchases are not available for this store yet.");
  }

  return offering.availablePackages
    .map((purchasePackage) => {
      const match = /^acoin_(\d+)$/.exec(purchasePackage.product.identifier);
      return match
        ? { amount: Number(match[1]), package: purchasePackage }
        : null;
    })
    .filter((item): item is AcoinStorePackage => item !== null)
    .sort((a, b) => a.amount - b.amount);
}

export async function purchaseAcoinStorePackage(
  userId: string,
  purchasePackage: PurchasesPackage,
) {
  await configureForUser(userId);
  return Purchases.purchasePackage(purchasePackage);
}

export function shouldConfirmAcoinTestPurchase(): boolean {
  return isDevelopmentStore();
}

