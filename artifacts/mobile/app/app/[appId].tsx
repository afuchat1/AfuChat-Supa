import React from "react";
import { Platform } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import AppPageShell, { normalizeAppNavKey, type FullAppId } from "@/components/superapp/AppPageShell";
import AfuPayApp from "@/modules/afupay";
import AfuMarketApp from "@/modules/afumarket";
import AfuBusinessApp from "@/modules/afubusiness";
import AfuFreelanceApp from "@/modules/afufreelance";
import FreelanceDetailScreen from "@/app/freelance/[id]";
import AfuCollectionsApp from "@/modules/afucollections";
import AfuEventsApp from "@/modules/afuevents";
import AfuUsernamesApp from "@/modules/afuusernames";
import QRScannerScreen from "@/app/qr-scanner";
import AfuSavedApp from "@/modules/afusaved";
import GamesScreen from "@/app/games";
import PlayRouter from "@/app/games/play";
import KampalaHustleGame from "@/app/games/lifesim";
import { SearchScreen } from "@/app/(tabs)/search";
import FileManagerScreen from "@/app/file-manager";
import GiftsScreen from "@/app/gifts";
import GiftMarketplaceScreen from "@/app/gifts/marketplace";
import MatchScreen from "@/app/match";
import MatchPreferencesScreen from "@/app/match/preferences";
import CartScreen from "@/app/shop/cart";
import MyOrdersScreen from "@/app/shop/my-orders";
import ShopManageScreen from "@/app/shop/manage";
import SellerApplyScreen from "@/app/shop/apply";
import StoreStorefrontScreen from "@/app/shop/[userId]";
import ProductDetailScreen from "@/app/shop/product/[id]";
import OrderDetailScreen from "@/app/shop/order/[id]";
import MatchConversationScreen from "@/app/match/[id]";
import MatchOnboardingScreen from "@/app/match/onboarding";
import MatchProfileScreen from "@/app/match/profile";
import MatchSettingsScreen from "@/app/match/settings";
import MatchViewProfileScreen from "@/app/match/view-profile";
import BillsScreen from "@/app/mini-programs/bills";
import AirtimeScreen from "@/app/mini-programs/airtime";
import DataBundlesScreen from "@/app/mini-programs/data-bundles";
import FeeDetailsScreen from "@/app/mini-programs/fee-details";
import HotelsScreen from "@/app/mini-programs/hotels";
import TicketsScreen from "@/app/mini-programs/tickets";
import TransferScreen from "@/app/mini-programs/transfer";
import MoneyRequestScreen from "@/app/wallet/request";
import AfuMusicApp from "@/modules/afumusic";
import {
  cacheMusicTrackOffline,
  getMusicPlaybackUri,
  listMusicTracks,
  listOfflineMusicTracks,
  publishMusicTrack,
  purchaseMusicTrack,
  removeMusicTrack,
  removeMusicTrackOffline,
  searchMusicTracks,
} from "@/lib/afuMusic";
import { useAuth } from "@/context/AuthContext";

const APP_IDS: FullAppId[] = [
  "afupay", "afumarket", "afugames", "afubusiness", "afusearch",
  "afufreelance", "afufiles", "afugifts",
  "afuevents", "afumatch", "afucollections", "afuusernames",
  "afuqr", "afusaved", "afumusic",
];

function isAppId(value: string): value is FullAppId {
  return APP_IDS.includes(value as FullAppId);
}

function AppContent({
  appId,
  section,
  params,
}: {
  appId: FullAppId;
  section?: string;
  params: Record<string, string>;
}) {
  switch (appId) {
    case "afupay":
      if (section === "bills") return <BillsScreen />;
      if (section === "airtime") return <AirtimeScreen />;
      if (section === "data-bundles") return <DataBundlesScreen />;
      if (section === "fee-details") return <FeeDetailsScreen />;
      if (section === "hotels") return <HotelsScreen />;
      if (section === "tickets") return <TicketsScreen />;
      if (section === "transfer") return <TransferScreen />;
      if (section === "request") return <MoneyRequestScreen />;
      return (
        <AfuPayApp
          initialView={section as any}
          initialRecipientId={params.initialRecipientId ?? params.recipientId}
          paymentReference={params.paymentReference}
        />
      );
    case "afumarket":
      if (section === "cart") return <CartScreen />;
      if (section === "orders") return <MyOrdersScreen />;
      if (section === "manage") return <ShopManageScreen />;
      if (section === "apply") return <SellerApplyScreen />;
      if (section === "storefront") return <StoreStorefrontScreen />;
      if (section === "product") return <ProductDetailScreen />;
      if (section === "order") return <OrderDetailScreen />;
      return <AfuMarketApp initialScreen={section as any} />;
    case "afugames":
      if (section === "progress") return <KampalaHustleGame />;
      if (section === "play") return <PlayRouter />;
      return <GamesScreen />;
    case "afubusiness":
      return <AfuBusinessApp initialScreen={section as any} />;
    case "afusearch":
      return <SearchScreen title="AfuSearch" initialTab={section as any} />;
    case "afufreelance":
      if (section === "detail") return <FreelanceDetailScreen />;
      return <AfuFreelanceApp initialScreen={section as any} />;
    case "afufiles":
      return <FileManagerScreen />;
    case "afugifts":
      if (section === "marketplace") return <GiftMarketplaceScreen />;
      return <GiftsScreen />;
    case "afuevents":
      return <AfuEventsApp initialTab={section as any} />;
    case "afumatch":
      if (section === "preferences") return <MatchPreferencesScreen />;
      if (section === "settings") return <MatchSettingsScreen />;
      if (section === "profile") return <MatchProfileScreen />;
      if (section === "onboarding") return <MatchOnboardingScreen />;
      if (section === "view-profile") return <MatchViewProfileScreen />;
      if (section === "conversation") return <MatchConversationScreen />;
      return <MatchScreen initialTab={section as any} />;
    case "afucollections":
      return <AfuCollectionsApp />;
    case "afuusernames":
      return <AfuUsernamesApp initialTab={section as any} />;
    case "afuqr":
      // Keep the Apps-directory scanner in sync with the standalone scanner.
      // The canonical screen resolves AfuChat QR codes to native profile,
      // Send Money, and Request Money actions instead of opening the web URL.
      return <QRScannerScreen />;
    case "afusaved":
      return <AfuSavedApp />;
    case "afumusic":
      return <ConnectedAfuMusic initialSection={section} />;
  }
}

export default function FullAppRoute() {
  const params = useLocalSearchParams<{
    appId?: string;
    section?: string;
    initialRecipientId?: string;
    recipientId?: string;
    paymentReference?: string;
  }>();
  const rawId = Array.isArray(params.appId) ? params.appId[0] : params.appId;
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const routeParams = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const normalized = Array.isArray(value) ? value[0] : value;
      return normalized == null ? [] : [[key, normalized]];
    }),
  ) as Record<string, string>;
  if (!rawId || !isAppId(rawId)) return null;
  if (rawId === "afumusic" && Platform.OS === "web") return <Redirect href="/" />;
  return (
    <AppPageShell appId={rawId} activeKey={normalizeAppNavKey(section)} showNav={rawId !== "afumusic"}>
      <AppContent appId={rawId} section={section} params={routeParams} />
    </AppPageShell>
  );
}

function ConnectedAfuMusic({ initialSection }: { initialSection?: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  return (
    <AfuMusicApp
      initialSection={(initialSection as any) || "discover"}
      acoinBalance={profile?.acoin}
      onBrowse={listMusicTracks}
      onSearch={searchMusicTracks}
      onPurchase={(track) => purchaseMusicTrack(track.id)}
      onCache={cacheMusicTrackOffline}
      onRemoveCache={removeMusicTrackOffline}
      onListOffline={listOfflineMusicTracks}
      onResolveAudio={getMusicPlaybackUri}
      onUpload={publishMusicTrack}
      onDeleteUpload={removeMusicTrack}
      onOpenWallet={() => router.push("/app/afupay")}
    />
  );
}