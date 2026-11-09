import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { SmartSheet } from "@/components/ui/SmartSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import { confirmAlert, showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

type Seller = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type Listing = {
  id: string;
  username: string;
  price: number;
  seller_id: string;
  created_at: string;
  is_auction: boolean;
  auction_end_at: string | null;
  reserve_price: number | null;
  current_bid: number;
  current_bidder_id: string | null;
  views: number;
  description: string | null;
  is_resale: boolean;
  seller: Seller | null;
};
type FeaturedPlacement = { id: string; listing_id: string; amount: number; ends_at: string; listing: Listing };

type OwnedUsername = {
  handle: string;
  owner_id: string;
};

const HANDLE_RE = /^[a-z0-9_]{1,30}$/;
function money(value: number): string {
  const amount = Math.max(0, Number(value) || 0);
  if (amount >= 1000000) {
    const compact = amount / 1000000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1000) {
    const compact = amount / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return new Intl.NumberFormat().format(amount);
}
const timeLeft = (end: string | null) => {
  if (!end) return "";
  const hours = Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 3600000));
  if (hours < 24) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
};

function friendlyError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("not enough") || text.includes("insufficient")) {
    return "Your wallet balance is too low for this username.";
  }
  if (text.includes("no longer") || text.includes("available")) {
    return "This username was just purchased or is no longer available.";
  }
  return message || "The transfer could not be completed. Nothing was charged.";
}

function SellerLine({ seller, colors }: { seller: Seller | null; colors: any }) {
  return (
    <View style={styles.sellerLine}>
      {seller?.avatar_url ? (
        <Image source={{ uri: seller.avatar_url }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="person" size={13} color={colors.accent} />
        </View>
      )}
      <Text style={[styles.sellerText, { color: colors.textMuted }]} numberOfLines={1}>
        {seller?.display_name || (seller?.handle ? `@${seller.handle}` : "Verified seller")}
      </Text>
      <Ionicons name="checkmark-circle" size={14} color={colors.success} />
    </View>
  );
}

function ListingCard({
  item,
  own,
  onPress,
  onDelist,
  colors,
}: {
  item: Listing;
  own: boolean;
  onPress: () => void;
  onDelist?: () => void;
  colors: any;
}) {
  const auction = item.is_auction;
  const displayPrice = auction ? Math.max(item.current_bid, item.reserve_price || 0) : item.price;
  return (
    <Pressable
      testID={`username-listing-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={own ? `Your listing for at ${item.username}` : `Buy at ${item.username}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <View style={[styles.handleMark, { backgroundColor: auction ? Colors.gold + "20" : colors.accent + "16" }]}>
        <Text style={[styles.handleMarkText, { color: colors.accent }]}>@</Text>
      </View>
      <View style={styles.cardMain}>
        <View style={styles.handleRow}>
          <Text style={[styles.handle, { color: colors.text }]} numberOfLines={1}>@{item.username}</Text>
          {auction ? <View style={[styles.auctionPill, { backgroundColor: Colors.gold + "20" }]}><Text style={[styles.auctionPillText, { color: Colors.gold }]}>LIVE AUCTION</Text></View> : null}
          {item.is_resale ? <View style={[styles.resalePill, { backgroundColor: Colors.gold + "20" }]}><Ionicons name="repeat-outline" size={10} color={Colors.gold} /><Text style={[styles.resalePillText, { color: Colors.gold }]}>RESALE</Text></View> : null}
        </View>
        <SellerLine seller={item.seller} colors={colors} />
        <Text style={[styles.cardNote, { color: colors.textMuted }]}>{own ? "Your active listing" : auction ? `${timeLeft(item.auction_end_at)} · ${item.views || 0} watchers` : "Instant ownership transfer"}</Text>
      </View>
      <View style={styles.price}>
        <Text style={[styles.priceValue, { color: own ? colors.textMuted : auction ? Colors.gold : colors.accent }]}>{money(displayPrice)}</Text>
        <Text style={[styles.priceUnit, { color: colors.textMuted }]}>{auction ? "current bid" : "ACoin"}</Text>
        {own ? (
          <Pressable
            testID={`delist-username-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Delist @${item.username}`}
            onPress={(event) => {
              event.stopPropagation();
              onDelist?.();
            }}
            style={[styles.delistButton, { borderColor: colors.error }]}
          >
            <Text style={[styles.delistButtonText, { color: colors.error }]}>Delist</Text>
          </Pressable>
        ) : (
          <Text style={[styles.priceAction, { color: auction ? Colors.gold : colors.accent }]}>{auction ? "Bid" : "Buy"}</Text>
        )}
      </View>
    </Pressable>
  );
}

function FeaturedCard({ item, colors, onPress }: { item: FeaturedPlacement; colors: any; onPress: () => void }) {
  const listing = item.listing;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.featuredCard, { backgroundColor: colors.surface, opacity: pressed ? 0.82 : 1 }]}>
      <View style={styles.featuredTop}><View style={[styles.featuredBadge, { backgroundColor: Colors.gold + "22" }]}><Ionicons name="star-outline" size={12} color={Colors.gold} /><Text style={[styles.featuredBadgeText, { color: Colors.gold }]}>FEATURED</Text></View><Text style={[styles.featuredTime, { color: colors.textMuted }]}>{timeLeft(item.ends_at)}</Text></View>
      <View style={styles.featuredHandleRow}>
        <Text style={[styles.featuredHandle, { color: colors.text }]} numberOfLines={1}>@{listing.username}</Text>
        {listing.is_resale ? <View style={[styles.resalePill, { backgroundColor: Colors.gold + "20" }]}><Ionicons name="repeat-outline" size={10} color={Colors.gold} /><Text style={[styles.resalePillText, { color: Colors.gold }]}>RESALE</Text></View> : null}
      </View>
      <Text style={[styles.featuredDescription, { color: colors.textMuted }]} numberOfLines={2}>{listing.description || "A premium handle ready for its next owner."}</Text>
      <View style={styles.featuredBottom}><Text style={[styles.featuredPrice, { color: listing.is_auction ? Colors.gold : colors.accent }]}>{money(listing.is_auction ? Math.max(listing.current_bid, listing.reserve_price || 0) : listing.price)} {listing.is_auction ? "current bid" : "ACoin"}</Text><Ionicons name="arrow-forward-circle" size={22} color={colors.accent} /></View>
    </Pressable>
  );
}

function FeatureSheet({ item, visible, onClose, onDone, colors }: { item: Listing | null; visible: boolean; onClose: () => void; onDone: () => void; colors: any }) {
  const [duration, setDuration] = useState("24");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setDuration("24"); setBusy(false); } }, [visible]);
  if (!item) return null;
  const cost = duration === "24" ? 250 : duration === "72" ? 600 : 1200;
  const feature = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("feature_username_listing", { p_listing_id: item.id, p_duration_hours: Number(duration) });
    setBusy(false);
    if (error) { showAlert("Could not feature listing", friendlyError(error.message)); return; }
    onClose(); onDone(); showAlert("Listing featured", `@${item.username} is now featured for ${duration === "168" ? "7 days" : `${duration} hours`}.`);
  };
  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.6} backgroundColor={colors.surface}>
      <View style={styles.sheet}>
        <View style={[styles.sheetIcon, { backgroundColor: Colors.gold + "20" }]}><Ionicons name="star-outline" size={25} color={Colors.gold} /></View>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Feature @{item.username}</Text>
        <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>Put your listing in front of serious buyers in the featured rail. Promotion is paid from your ACoin wallet.</Text>
        <View style={styles.featureOptions}>
          {[["24", "24 hours", "250 ACoin"], ["72", "3 days", "600 ACoin"], ["168", "7 days", "1.2K ACoin"]].map(([value, label, price]) => <Pressable key={value} onPress={() => setDuration(value)} style={[styles.featureOption, { backgroundColor: duration === value ? Colors.gold + "20" : colors.inputBg, borderColor: duration === value ? Colors.gold : "transparent" }]}><Text style={[styles.featureOptionLabel, { color: duration === value ? Colors.gold : colors.text }]}>{label}</Text><Text style={[styles.featureOptionPrice, { color: colors.textMuted }]}>{price}</Text></Pressable>)}
        </View>
        <Pressable onPress={() => void feature()} disabled={busy} style={[styles.primaryButton, { backgroundColor: Colors.gold, opacity: busy ? 0.65 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Feature for {duration === "168" ? "1.2K" : money(cost)} ACoin</Text>}</Pressable>
      </View>
    </SmartSheet>
  );
}

function BidSheet({ item, visible, onClose, onDone, colors }: { item: Listing | null; visible: boolean; onClose: () => void; onDone: () => void; colors: any }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setAmount(String(Math.max(item?.current_bid || 0, item?.reserve_price || 0) + 1)); setBusy(false); } }, [visible, item]);
  if (!item) return null;
  const bid = async () => {
    const value = Number.parseInt(amount, 10);
    if (!user?.id) { showAlert("Sign in required", "Sign in before placing a bid."); return; }
    if (!Number.isSafeInteger(value) || value <= Math.max(item.current_bid, item.reserve_price || 0)) { showAlert("Bid is too low", `Your bid must be higher than ${money(Math.max(item.current_bid, item.reserve_price || 0))} ACoin.`); return; }
    setBusy(true);
    const { error } = await supabase.rpc("place_username_bid", { p_listing_id: item.id, p_amount: value });
    setBusy(false);
    if (error) { showAlert("Bid not placed", friendlyError(error.message)); return; }
    onClose(); onDone(); showAlert("Bid placed", `You're now bidding ${money(value)} ACoin for @${item.username}.`);
  };
  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.56} backgroundColor={colors.surface}>
      <View style={styles.sheet}>
        <View style={[styles.sheetIcon, { backgroundColor: Colors.gold + "18" }]}><Ionicons name="hammer-outline" size={25} color={Colors.gold} /></View>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Place a serious bid</Text>
        <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>Bids are funded from your ACoin wallet immediately. If you are outbid, your previous bid is returned.</Text>
        <View style={[styles.receipt, { backgroundColor: colors.inputBg }]}>
          <View style={styles.receiptRow}><Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Handle</Text><Text style={[styles.receiptValue, { color: colors.text }]}>@{item.username}</Text></View>
          <View style={styles.receiptRow}><Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Ends</Text><Text style={[styles.receiptValue, { color: Colors.gold }]}>{timeLeft(item.auction_end_at)}</Text></View>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Your maximum bid</Text>
        <View style={[styles.inputField, { backgroundColor: colors.inputBg }]}><Ionicons name="flash" size={17} color={Colors.gold} /><TextInput value={amount} onChangeText={setAmount} style={[styles.input, { color: colors.text }]} keyboardType="number-pad" placeholderTextColor={colors.textMuted} /><Text style={[styles.suffix, { color: colors.textMuted }]}>ACoin</Text></View>
        <Pressable onPress={() => void bid()} disabled={busy} style={[styles.primaryButton, { backgroundColor: Colors.gold, opacity: busy ? 0.65 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Place bid</Text>}</Pressable>
      </View>
    </SmartSheet>
  );
}

function OwnedCard({ item, colors }: { item: OwnedUsername; colors: any }) {
  return (
    <View style={[styles.ownedCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.ownedMark, { backgroundColor: colors.accent + "16" }]}>
        <Text style={[styles.ownedAt, { color: colors.accent }]}>@</Text>
      </View>
      <Text style={[styles.ownedHandle, { color: colors.text }]} numberOfLines={1}>
        @{item.handle}
      </Text>
      <Text style={[styles.ownedCaption, { color: colors.textMuted }]}>Owned by you</Text>
    </View>
  );
}

function WalletBadge({
  balance,
  loading,
  colors,
}: {
  balance: number;
  loading: boolean;
  colors: any;
}) {
  return (
    <View style={[styles.walletBadge, { backgroundColor: colors.surface }]}>
      <View style={[styles.walletIcon, { backgroundColor: Colors.gold + "18" }]}>
        <Ionicons name="flash" size={15} color={Colors.gold} />
      </View>
      <View>
        <Text style={[styles.walletLabel, { color: colors.textMuted }]}>Wallet balance</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.balanceLoader} />
        ) : (
          <Text style={[styles.walletValue, { color: colors.text }]}>{money(balance)} ACoin</Text>
        )}
      </View>
    </View>
  );
}

function ListHandleSheet({
  visible,
  handles,
  userId,
  onClose,
  onDone,
  colors,
}: {
  visible: boolean;
  handles: string[];
  userId?: string;
  onClose: () => void;
  onDone: () => void;
  colors: any;
}) {
  const [selectedHandle, setSelectedHandle] = useState("");
  const [price, setPrice] = useState("");
  const [auction, setAuction] = useState(false);
  const [duration, setDuration] = useState("168");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedHandle(handles[0] ?? "");
      setPrice("");
      setAuction(false);
      setDuration("168");
      setBusy(false);
    }
  }, [visible, handles]);

  const submit = async () => {
    if (!userId) {
      showAlert("Sign in required", "Sign in before listing a username.");
      return;
    }
    const username = selectedHandle.replace(/^@/, "").trim().toLowerCase();
    const amount = Number.parseInt(price, 10);
    if (!HANDLE_RE.test(username)) {
      showAlert("No username to list", "Choose one of the usernames you own.");
      return;
    }
    if (!Number.isSafeInteger(amount) || amount < 1) {
      showAlert("Set a price", "Enter a whole ACoin amount of at least 1.");
      return;
    }

    Keyboard.dismiss();
    setBusy(true);
    const { error } = await supabase.rpc("create_username_listing", {
      p_username: username,
      p_price: amount,
      p_is_auction: auction,
      p_duration_hours: auction ? Number.parseInt(duration, 10) : null,
    });
    setBusy(false);
    if (error) {
      showAlert("Could not list username", friendlyError(error.message));
      return;
    }
    onClose();
    onDone();
    showAlert("Listing published", auction ? `@${username} is live for bids for ${duration} hours.` : `@${username} is now available for ${money(amount)} ACoin.`);
  };

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.62} backgroundColor={colors.surface}>
      <View style={styles.sheet}>
        <View style={[styles.sheetIcon, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="pricetag-outline" size={25} color={colors.accent} />
        </View>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Sell your username</Text>
        <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>
          Choose any username you own, then set a fixed price for a fast transfer or run a timed auction for a handle with real demand.
        </Text>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username to list</Text>
        <View style={styles.handleOptions}>
          {handles.map((candidate) => {
            const selected = candidate === selectedHandle;
            return (
              <Pressable
                key={candidate}
                onPress={() => setSelectedHandle(candidate)}
                style={[styles.handleOption, { backgroundColor: selected ? colors.accent : colors.inputBg }]}
              >
                <Text style={[styles.handleOptionText, { color: selected ? "#fff" : colors.text }]}>@{candidate}</Text>
                {selected ? <Ionicons name="checkmark-circle" size={15} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Price</Text>
        <View style={[styles.inputField, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="flash" size={17} color={Colors.gold} />
          <TextInput
            testID="username-listing-price"
            style={[styles.input, { color: colors.text }]}
            value={price}
            onChangeText={setPrice}
            placeholder="Amount in ACoin"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
          />
          <Text style={[styles.suffix, { color: colors.textMuted }]}>ACoin</Text>
        </View>
        <View style={styles.saleModeRow}>
          <Pressable onPress={() => setAuction(false)} style={[styles.saleMode, { backgroundColor: !auction ? colors.accent : colors.inputBg }]}><Ionicons name="flash-outline" size={15} color={!auction ? "#fff" : colors.textMuted} /><Text style={[styles.saleModeText, { color: !auction ? "#fff" : colors.textMuted }]}>Buy now</Text></Pressable>
          <Pressable onPress={() => setAuction(true)} style={[styles.saleMode, { backgroundColor: auction ? Colors.gold : colors.inputBg }]}><Ionicons name="hammer-outline" size={15} color={auction ? "#fff" : colors.textMuted} /><Text style={[styles.saleModeText, { color: auction ? "#fff" : colors.textMuted }]}>Auction</Text></Pressable>
        </View>
        {auction ? (
          <View style={styles.durationRow}>
            {[48, 72, 168].map((hours) => <Pressable key={hours} onPress={() => setDuration(String(hours))} style={[styles.durationPill, { backgroundColor: duration === String(hours) ? Colors.gold + "22" : colors.inputBg }]}><Text style={[styles.durationText, { color: duration === String(hours) ? Colors.gold : colors.textMuted }]}>{hours === 168 ? "7 days" : `${hours} hours`}</Text></Pressable>)}
          </View>
        ) : null}
        <Pressable
          testID="publish-username-listing"
          onPress={() => void submit()}
          disabled={busy}
          style={[styles.primaryButton, { backgroundColor: colors.accent, opacity: busy ? 0.65 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Publish listing</Text>}
        </Pressable>
      </View>
    </SmartSheet>
  );
}

function PurchaseSheet({
  item,
  balance,
  balanceLoading,
  visible,
  userId,
  onClose,
  onDone,
  onRefreshBalance,
  colors,
}: {
  item: Listing | null;
  balance: number;
  balanceLoading: boolean;
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onDone: () => void;
  onRefreshBalance: () => Promise<number | null>;
  colors: any;
}) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const canAfford = balance >= item.price;
  const buy = async () => {
    if (!userId) {
      showAlert("Sign in required", "Sign in before buying a username.");
      return;
    }
    setBusy(true);
    const currentBalance = await onRefreshBalance();
    if (currentBalance === null) {
      setBusy(false);
      showAlert("Wallet unavailable", "We could not verify your wallet balance. Nothing was charged.");
      return;
    }
    if (currentBalance < item.price) {
      setBusy(false);
      showAlert("Not enough ACoin", `You need ${money(item.price)} ACoin, but your wallet has ${money(currentBalance)}.`);
      return;
    }

    const { error } = await supabase.rpc("purchase_username", { p_listing_id: item.id });
    setBusy(false);
    if (error) {
      showAlert("Purchase not completed", friendlyError(error.message));
      onDone();
      return;
    }
    onClose();
    onDone();
    showAlert("Username secured", `@${item.username} now belongs to your account.`);
  };

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.66} backgroundColor={colors.surface}>
      <View style={styles.sheet}>
        <View style={[styles.sheetIcon, { backgroundColor: Colors.gold + "18" }]}>
          <Ionicons name="shield-checkmark-outline" size={25} color={Colors.gold} />
        </View>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Confirm purchase</Text>
        <Text style={[styles.sheetCopy, { color: colors.textMuted }]}>
          The wallet deduction, seller credit, and ownership transfer happen together. There is no simulated payment.
        </Text>
        <View style={[styles.receipt, { backgroundColor: colors.inputBg }]}>
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Username</Text>
            <Text style={[styles.receiptValue, { color: colors.text }]}>@{item.username}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Price</Text>
            <Text style={[styles.receiptValue, { color: colors.accent }]}>{money(item.price)} ACoin</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Your wallet</Text>
            <Text style={[styles.receiptValue, { color: canAfford ? colors.success : colors.error }]}>
              {balanceLoading ? "Checking…" : `${money(balance)} ACoin`}
            </Text>
          </View>
        </View>
        {!canAfford && !balanceLoading ? (
          <View style={[styles.warning, { backgroundColor: colors.errorSubtle }]}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.error} />
            <Text style={[styles.warningText, { color: colors.error }]}>Add ACoin to your wallet before buying.</Text>
          </View>
        ) : null}
        <Pressable
          testID="confirm-username-purchase"
          onPress={() => void buy()}
          disabled={busy || balanceLoading}
          style={[
            styles.primaryButton,
            { backgroundColor: canAfford ? colors.accent : colors.textMuted, opacity: busy || balanceLoading ? 0.65 : 1 },
          ]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Buy with wallet</Text>}
        </Pressable>
        <Pressable onPress={onClose} disabled={busy} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Not now</Text>
        </Pressable>
      </View>
    </SmartSheet>
  );
}

export default function AfuUsernamesApp({ initialTab }: { initialTab?: "market" | "owned" | "mine" }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [featured, setFeatured] = useState<FeaturedPlacement[]>([]);
  const [owned, setOwned] = useState<OwnedUsername[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"market" | "owned" | "mine">("market");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balance, setBalance] = useState(Number(profile?.acoin ?? 0));
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [selectedBid, setSelectedBid] = useState<Listing | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<Listing | null>(null);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const [listVisible, setListVisible] = useState(false);

  useEffect(() => {
    setBalance(Number(profile?.acoin ?? 0));
  }, [profile?.acoin]);

  const refreshBalance = useCallback(async (): Promise<number | null> => {
    if (!user?.id) return null;
    setBalanceLoading(true);
    const { data, error } = await supabase.from("profiles").select("acoin").eq("id", user.id).maybeSingle();
    setBalanceLoading(false);
    if (error || !data) return null;
    const nextBalance = Number(data.acoin ?? 0);
    setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
    void refreshProfile?.();
    return Number.isFinite(nextBalance) ? nextBalance : 0;
  }, [refreshProfile, user?.id]);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from("username_listings")
        .select("id, username, price, seller_id, created_at, is_auction, auction_end_at, reserve_price, current_bid, current_bidder_id, views, description, is_resale")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);
      const term = search.trim().replace(/^@/, "").toLowerCase();
      if (term) query = query.ilike("username", `%${term}%`);

      const [listingResult, ownedResult, featuredResult] = await Promise.all([
        query,
        user?.id
          ? supabase.from("owned_usernames").select("handle, owner_id").eq("owner_id", user.id).order("handle")
          : Promise.resolve({ data: [], error: null }),
        supabase.from("username_featured_listings").select("id, listing_id, amount, ends_at").gt("ends_at", new Date().toISOString()).order("ends_at", { ascending: false }).limit(12),
      ]);
      if (listingResult.error) throw listingResult.error;

      const rawListings = (listingResult.data || []) as Array<Omit<Listing, "seller">>;
      const sellerIds = [...new Set(rawListings.map((item) => item.seller_id).filter(Boolean))];
      let sellers: Seller[] = [];
      if (sellerIds.length) {
        const sellerResult = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", sellerIds);
        if (!sellerResult.error) sellers = (sellerResult.data || []) as Seller[];
      }
      const sellerMap = new Map(sellers.map((seller) => [seller.id, seller]));
      const enriched = rawListings.map((item) => ({ ...item, seller: sellerMap.get(item.seller_id) || null }));
      setListings(enriched);
      if (!featuredResult.error) {
        const byId = new Map(enriched.map((item) => [item.id, item]));
        setFeatured((featuredResult.data || []).map((placement: any) => ({ ...placement, listing: byId.get(placement.listing_id) })).filter((placement: any) => placement.listing));
      } else {
        setFeatured([]);
      }
      if (!ownedResult.error) setOwned((ownedResult.data || []) as OwnedUsername[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the username marketplace.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    const channel = supabase
      .channel("username-market-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "username_listings" }, () => void load(true))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const ownListingIds = useMemo(
    () => new Set(listings.filter((item) => item.seller_id === user?.id).map((item) => item.id)),
    [listings, user?.id],
  );
  const visibleListings = useMemo(() => {
    return listings
      .filter((item) => {
        if (tab === "mine") return item.seller_id === user?.id;
        if (tab === "market") return item.seller_id !== user?.id;
        return false;
      })
      .sort((a, b) => {
        if (a.is_auction !== b.is_auction) return a.is_auction ? -1 : 1;
        const aAmount = a.is_auction ? Math.max(a.current_bid || 0, a.reserve_price || 0) : a.price;
        const bAmount = b.is_auction ? Math.max(b.current_bid || 0, b.reserve_price || 0) : b.price;
        return aAmount - bAmount || a.created_at.localeCompare(b.created_at);
      });
  }, [listings, tab, user?.id]);
  const auctionCount = listings.filter((item) => item.is_auction).length;
  const sellerListingCount = listings.filter((item) => item.seller_id === user?.id).length;
  const listableHandles = useMemo(() => {
    const candidates = [profile?.handle ?? "", ...owned.map((item) => item.handle)];
    return [...new Set(candidates
      .map((handle) => handle.replace(/^@/, "").trim().toLowerCase())
      .filter((handle) => HANDLE_RE.test(handle)))];
  }, [owned, profile?.handle]);

  const delist = async (item: Listing) => {
    const confirmed = await confirmAlert(
      "Delist username?",
      `@${item.username} will be removed from the marketplace and will no longer be available to buyers.`,
      { confirmText: "Delist", destructive: true },
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc("delist_username_listing", { p_listing_id: item.id });
    if (error) {
      showAlert("Could not delist username", friendlyError(error.message));
      return;
    }
    setListings((current) => current.filter((listing) => listing.id !== item.id));
    showAlert("Username delisted", `@${item.username} is no longer listed for sale.`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => safeRouter.back("/apps")} hitSlop={10} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>USERNAME MARKET</Text>
          <Text style={[styles.title, { color: colors.text }]}>Find a name worth keeping.</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Rare handles, verified sellers, protected transfers.</Text>
        </View>
        {user ? <WalletBadge balance={balance} loading={balanceLoading} colors={colors} /> : null}
      </View>

      <View style={[styles.marketStats, { backgroundColor: colors.surface }]}>
        <View style={styles.stat}><Text style={[styles.statValue, { color: colors.text }]}>{listings.length}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>active listings</Text></View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}><Text style={[styles.statValue, { color: Colors.gold }]}>{auctionCount}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>live auctions</Text></View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}><Text style={[styles.statValue, { color: colors.accent }]}>{owned.length}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>in your portfolio</Text></View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          testID="username-market-search"
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search usernames"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <Pressable accessibilityLabel="Clear username search" onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {featured.length > 0 && tab === "market" ? (
        <View style={styles.featuredSection}>
          <View style={styles.featuredHeading}><View><Text style={[styles.sectionEyebrow, { color: Colors.gold }]}>CURATED PLACEMENTS</Text><Text style={[styles.featuredTitle, { color: colors.text }]}>Featured usernames</Text></View><Text style={[styles.featuredSwipe, { color: colors.textMuted }]}>Swipe to explore</Text></View>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={featured} keyExtractor={(item) => item.id} contentContainerStyle={styles.featuredList} renderItem={({ item }) => <FeaturedCard item={item} colors={colors} onPress={() => item.listing.is_auction ? setSelectedBid(item.listing) : setSelected(item.listing)} />} />
        </View>
      ) : null}

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setTab("market")} style={[styles.tab, tab === "market" && { borderBottomColor: colors.accent }]}>
          <Text style={[styles.tabText, { color: tab === "market" ? colors.accent : colors.textMuted }]}>Usernames</Text>
        </Pressable>
        <Pressable onPress={() => setTab("owned")} style={[styles.tab, tab === "owned" && { borderBottomColor: colors.accent }]}>
          <Text style={[styles.tabText, { color: tab === "owned" ? colors.accent : colors.textMuted }]}>Owned</Text>
          {owned.length ? <View style={[styles.count, { backgroundColor: colors.accent }]}><Text style={styles.countText}>{owned.length}</Text></View> : null}
        </Pressable>
        <Pressable onPress={() => setTab("mine")} style={[styles.tab, tab === "mine" && { borderBottomColor: colors.accent }]}>
          <Text style={[styles.tabText, { color: tab === "mine" ? colors.accent : colors.textMuted }]}>My Listings</Text>
          {sellerListingCount ? <View style={[styles.count, { backgroundColor: colors.accent }]}><Text style={styles.countText}>{sellerListingCount}</Text></View> : null}
        </Pressable>
      </View>

      {tab === "owned" ? (
        <FlatList
          key="owned-usernames"
          data={owned}
          keyExtractor={(item) => item.handle}
          numColumns={2}
          contentContainerStyle={[styles.ownedList, { paddingBottom: insets.bottom + 110 }]}
          columnWrapperStyle={styles.ownedColumns}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={35} color={colors.accent} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No owned usernames</Text>
              <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>Usernames you buy will be kept here.</Text>
            </View>
          }
          renderItem={({ item }) => <OwnedCard item={item} colors={colors} />}
        />
      ) : loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          key="marketplace-listings"
           data={visibleListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110, flexGrow: listings.length ? 0 : 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />}
          ListEmptyComponent={
             <View style={styles.empty}>
                <Ionicons name={loadError ? "cloud-offline-outline" : "pricetag-outline"} size={35} color={loadError ? colors.error : colors.accent} />
                 <Text style={[styles.emptyTitle, { color: colors.text }]}>{loadError ? "Marketplace unavailable" : tab === "mine" ? "No active listings" : search ? "No matches found" : "No usernames listed"}</Text>
                 <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>{loadError ? "Check your connection and try again." : tab === "mine" ? "Your usernames listed for sale will appear here." : "Try another search or list your current username for sale."}</Text>
              {loadError ? <Pressable onPress={() => void load()} style={[styles.retryButton, { backgroundColor: colors.accent }]}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
            </View>
          }
          renderItem={({ item }) => (
            <ListingCard
              item={item}
              own={ownListingIds.has(item.id)}
              colors={colors}
              onPress={() => {
                 if (ownListingIds.has(item.id)) {
                   return;
                 }
                 if (item.is_auction) { setSelectedBid(item); return; }
                 setSelected(item); void refreshBalance();
              }}
              onDelist={ownListingIds.has(item.id) ? () => void delist(item) : undefined}
            />
          )}
        />
      )}

      <Pressable
        testID="open-list-username"
        accessibilityRole="button"
        accessibilityLabel="List your username"
        onPress={() => (user ? setListVisible(true) : showAlert("Sign in required", "Sign in before listing a username."))}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 20, width: 136, height: 52, borderRadius: 26, flexDirection: "row", gap: 7, opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="add" size={27} color="#fff" />
        <Text style={styles.fabText}>List handle</Text>
      </Pressable>

      <PurchaseSheet
        item={selected}
        visible={!!selected}
        balance={balance}
        balanceLoading={balanceLoading}
        userId={user?.id}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null);
          void load(true);
        }}
        onRefreshBalance={refreshBalance}
        colors={colors}
      />
      <ListHandleSheet
        visible={listVisible}
        handles={listableHandles}
        userId={user?.id}
        onClose={() => setListVisible(false)}
        onDone={() => void load(true)}
        colors={colors}
      />
      <BidSheet item={selectedBid} visible={!!selectedBid} onClose={() => setSelectedBid(null)} onDone={() => void load(true)} colors={colors} />
      <FeatureSheet item={selectedFeature} visible={!!selectedFeature} onClose={() => setSelectedFeature(null)} onDone={() => void load(true)} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 15, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  headerTitle: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.7, fontFamily: "Inter_700Bold", marginBottom: 5 },
  title: { fontSize: 27, letterSpacing: -0.7, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular", marginTop: 4 },
  walletBadge: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 7, minWidth: 118 },
  walletIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  walletLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  walletValue: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 2 },
  balanceLoader: { alignSelf: "flex-start", marginTop: 3 },
  marketStats: { marginHorizontal: 16, marginBottom: 2, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  statDivider: { width: 1, height: 25 },
  searchBox: { marginHorizontal: 16, minHeight: 44, borderRadius: 999, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", paddingHorizontal: 16, borderBottomWidth: 1, marginTop: 12 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 3, paddingBottom: 10, marginRight: 18, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fabText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  countText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 16, paddingTop: 7, gap: 1 },
  card: { minHeight: 76, borderRadius: 15, marginVertical: 5, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  handleMark: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  handleMarkText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  cardMain: { flex: 1, minWidth: 0, gap: 3 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  handle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  auctionPill: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  auctionPillText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  resalePill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  resalePillText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  sellerLine: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  avatar: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sellerText: { flexShrink: 1, fontSize: 10, fontFamily: "Inter_500Medium" },
  cardNote: { fontSize: 10, fontFamily: "Inter_400Regular" },
  delistButton: { marginTop: 5, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  delistButtonText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  featuredSection: { marginTop: 14, marginBottom: 6 },
  featuredHeading: { paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 9 },
  sectionEyebrow: { fontSize: 9, letterSpacing: 1.4, fontFamily: "Inter_700Bold" },
  featuredTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  featuredSwipe: { fontSize: 10, fontFamily: "Inter_500Medium", paddingBottom: 2 },
  featuredList: { paddingHorizontal: 16, gap: 10 },
  featuredCard: { width: 252, minHeight: 142, borderRadius: 18, padding: 14, justifyContent: "space-between" },
  featuredTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  featuredBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  featuredBadgeText: { fontSize: 8, letterSpacing: 0.6, fontFamily: "Inter_700Bold" },
  featuredTime: { fontSize: 10, fontFamily: "Inter_500Medium" },
  featuredHandleRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0, marginTop: 11 },
  featuredHandle: { flexShrink: 1, fontSize: 21, fontFamily: "Inter_700Bold" },
  featuredDescription: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular", marginTop: 4 },
  featuredBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  featuredPrice: { fontSize: 12, fontFamily: "Inter_700Bold" },
  featureOptions: { flexDirection: "row", gap: 8 },
  featureOption: { flex: 1, minHeight: 58, borderRadius: 13, borderWidth: 1, padding: 9, justifyContent: "center" },
  featureOptionLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  featureOptionPrice: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 3 },
  price: { alignItems: "flex-end", gap: 1 },
  priceValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  priceUnit: { fontSize: 9, fontFamily: "Inter_400Regular" },
  priceAction: { fontSize: 10, fontFamily: "Inter_700Bold", marginTop: 2 },
  ownedList: { padding: 16, gap: 10 },
  ownedColumns: { gap: 10 },
  ownedCard: { flex: 1, minHeight: 125, borderRadius: 15, padding: 14, justifyContent: "space-between" },
  ownedMark: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ownedAt: { fontSize: 19, fontFamily: "Inter_700Bold" },
  ownedHandle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 10 },
  ownedCaption: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 44, gap: 9 },
  emptyTitle: { fontSize: 17, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", fontFamily: "Inter_400Regular" },
  retryButton: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 4 },
  retryText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  fab: { position: "absolute", right: 18, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  sheet: { width: "100%", paddingHorizontal: 20, paddingTop: 3, paddingBottom: 12, gap: 10 },
  sheetIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  sheetTitle: { fontSize: 21, textAlign: "center", fontFamily: "Inter_700Bold" },
  sheetCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", fontFamily: "Inter_400Regular", marginBottom: 3 },
  lockedField: { minHeight: 48, borderRadius: 999, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 9 },
  at: { fontSize: 18, fontFamily: "Inter_700Bold" },
  lockedValue: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  handleOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  handleOption: { minHeight: 40, borderRadius: 999, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 6 },
  handleOptionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  inputField: { minHeight: 48, borderRadius: 999, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 9 },
  input: { flex: 1, minHeight: 48, fontSize: 15, fontFamily: "Inter_400Regular" },
  suffix: { fontSize: 12, fontFamily: "Inter_400Regular" },
  priceHint: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular" },
  saleModeRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  saleMode: { flex: 1, minHeight: 42, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  saleModeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  durationRow: { flexDirection: "row", gap: 8 },
  durationPill: { flex: 1, minHeight: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  durationText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  primaryButton: { minHeight: 49, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, marginTop: 4 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  receipt: { borderRadius: 13, padding: 14, gap: 12 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  receiptLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  receiptValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  warning: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 7 },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  cancelButton: { alignItems: "center", paddingVertical: 6 },
  cancelText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});