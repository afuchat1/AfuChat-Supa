import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.afuchat.app";

const C = {
  brand:     "#00BCD4",
  brandDark: "#00838F",
  navy:      "#0A1A2E",
  navy2:     "#0F2744",
  navy3:     "#1A3A5C",
  white:     "#FFFFFF",
  offWhite:  "#F8FAFF",
  border:    "#E8EDF5",
  muted:     "#64748B",
  text:      "#0A1A2E",
  textLight: "#94A3B8",
  green:     "#34C759",
  purple:    "#AF52DE",
  orange:    "#FF9500",
  pink:      "#FF6B9D",
  blue:      "#007AFF",
};

const NAV_H = 64;
const afuLogo = require("@/assets/images/afu-symbol.png");

const FEATURES = [
  { icon: "chatbubbles",       color: C.brand,   title: "Real-Time Messaging",   desc: "Instant 1-on-1 and group chats with typing indicators, read receipts, and delivery status." },
  { icon: "sparkles",          color: C.purple,  title: "AI-Powered Assistant",  desc: "Built-in AfuAI answers questions, drafts messages, and generates content inside every chat." },
  { icon: "images",            color: C.orange,  title: "Rich Media Sharing",    desc: "Share photos, videos, voice notes, documents, and GIFs — all in one seamless conversation." },
  { icon: "people",            color: C.green,   title: "Groups & Channels",     desc: "Create communities, broadcast channels, and group chats with unlimited members." },
  { icon: "shield-checkmark",  color: "#FF2D55", title: "Secure & Private",      desc: "Your conversations are protected with industry-standard security and full privacy controls." },
  { icon: "globe",             color: C.blue,    title: "Cross-Platform",        desc: "Available on Android, iOS and the web — your chats sync seamlessly across all your devices." },
];

const STATS = [
  { value: "50K+",  label: "Active Users" },
  { value: "5M+",   label: "Messages Sent" },
  { value: "10+",   label: "Countries" },
  { value: "4.8 ★", label: "App Rating" },
];

const NAV_LINKS = ["Features", "About", "Download"];

// ─────────────────────────────────────────────────────────────
//  PHONE MOCKUP
// ─────────────────────────────────────────────────────────────
const CHAT_ROWS = [
  { name: "Sarah K.",     msg: "Hey! Did you see the new AI update? 🔥", time: "2m",  unread: 2, color: C.pink },
  { name: "AfuAI 🤖",    msg: "Sure! I can help you with that request.", time: "5m",  unread: 0, color: C.purple },
  { name: "Work Group",   msg: "Meeting confirmed for 3 PM today ✓",      time: "10m", unread: 5, color: C.green },
  { name: "David M.",     msg: "Thanks for the quick update! 👍",          time: "1h",  unread: 0, color: C.orange },
  { name: "Community",    msg: "Welcome to AfuChat! 🎉",                   time: "2h",  unread: 0, color: C.blue },
];

function PhoneMockup({ scale = 1 }: { scale?: number }) {
  const s = scale;
  const W = 220 * s, H = 440 * s;
  return (
    <View style={{ width: W, height: H, borderRadius: 36 * s, backgroundColor: C.navy, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 40 }}>
      {/* Status bar */}
      <View style={{ height: 28 * s, backgroundColor: C.navy, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 * s }}>
        <Text style={{ color: "#fff", fontSize: 10 * s, fontWeight: "600" }}>9:41</Text>
        <View style={{ flexDirection: "row", gap: 4 * s, alignItems: "center" }}>
          <Ionicons name="wifi" size={11 * s} color="#fff" />
          <Ionicons name="battery-half" size={11 * s} color="#fff" />
        </View>
      </View>

      {/* App header */}
      <View style={{ height: 44 * s, backgroundColor: C.brand, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 * s, gap: 8 * s }}>
        <Image source={afuLogo} style={{ width: 20 * s, height: 20 * s }} tintColor="#fff" resizeMode="contain" />
        <Text style={{ color: "#fff", fontSize: 16 * s, fontWeight: "700", flex: 1 }}>AfuChat</Text>
        <Ionicons name="search-outline" size={18 * s} color="#fff" />
        <Ionicons name="ellipsis-vertical" size={18 * s} color="#fff" />
      </View>

      {/* Chat list */}
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        {CHAT_ROWS.map((item, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12 * s, paddingVertical: 8 * s, borderBottomWidth: 0.5, borderBottomColor: "#F0F0F0" }}>
            <View style={{ width: 36 * s, height: 36 * s, borderRadius: 18 * s, backgroundColor: item.color, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 13 * s, fontWeight: "700" }}>{item.name[0]}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 8 * s }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12 * s, fontWeight: "600", color: C.navy }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ fontSize: 9 * s, color: C.muted }}>{item.time}</Text>
              </View>
              <Text style={{ fontSize: 10 * s, color: C.muted, marginTop: 1 * s }} numberOfLines={1}>{item.msg}</Text>
            </View>
            {item.unread > 0 && (
              <View style={{ width: 17 * s, height: 17 * s, borderRadius: 9 * s, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginLeft: 6 * s }}>
                <Text style={{ color: "#fff", fontSize: 9 * s, fontWeight: "700" }}>{item.unread}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Bottom tab bar */}
      <View style={{ height: 50 * s, backgroundColor: "#fff", borderTopWidth: 0.5, borderTopColor: "#E0E0E0", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 10 * s }}>
        {[
          { icon: "chatbubbles",  active: true },
          { icon: "compass",      active: false },
          { icon: "people",       active: false },
          { icon: "person",       active: false },
        ].map((tab, i) => (
          <View key={i} style={{ alignItems: "center" }}>
            <Ionicons name={(tab.active ? tab.icon : `${tab.icon}-outline`) as any} size={22 * s} color={tab.active ? C.brand : "#BCC"} />
            {tab.active && <View style={{ width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: C.brand, marginTop: 2 * s }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  DESKTOP MOCKUP
// ─────────────────────────────────────────────────────────────
function DesktopMockup() {
  const DESK_MSG = [
    { text: "Hey! Have you tried the AfuAI feature yet?", mine: false },
    { text: "Yes! It helped me draft the whole report 🔥", mine: true },
    { text: "Right? It's like having a co-pilot in every chat", mine: false },
    { text: "AfuChat just keeps getting better 💯", mine: true },
  ];
  return (
    <View style={dm.wrap}>
      {/* Screen */}
      <View style={dm.screen}>
        {/* Browser chrome */}
        <View style={dm.chrome}>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
              <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
            ))}
          </View>
          <View style={dm.urlBar}>
            <Ionicons name="lock-closed" size={9} color="#999" />
            <Text style={dm.url}> afuchat.com</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        {/* App UI */}
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Sidebar */}
          <View style={dm.sidebar}>
            <LinearGradient colors={[C.navy, C.navy2]} style={dm.sidebarHeader}>
              <Image source={afuLogo} style={{ width: 18, height: 18 }} tintColor="#fff" resizeMode="contain" />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginLeft: 6 }}>AfuChat</Text>
            </LinearGradient>
            {["Chats", "Discover", "Channels", "Groups"].map((item, i) => (
              <View key={i} style={[dm.sidebarItem, i === 0 && { backgroundColor: "rgba(0,188,212,0.12)" }]}>
                <Ionicons name={["chatbubbles-outline", "compass-outline", "megaphone-outline", "people-outline"][i] as any} size={13} color={i === 0 ? C.brand : "#888"} />
                <Text style={[dm.sidebarLabel, { color: i === 0 ? C.brand : "#666" }]}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Chat list column */}
          <View style={dm.chatCol}>
            <View style={dm.chatColHeader}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.navy }}>Messages</Text>
              <Ionicons name="create-outline" size={13} color="#999" />
            </View>
            {[
              { n: "Sarah K.", p: "Hey! Have you tried...", c: C.pink },
              { n: "AfuAI",    p: "I can help with that!", c: C.purple },
              { n: "Work",     p: "Meeting confirmed ✓",   c: C.green },
              { n: "David",    p: "Thanks! 👍",            c: C.orange },
            ].map((item, i) => (
              <View key={i} style={[dm.chatRow, i === 0 && { backgroundColor: "rgba(0,188,212,0.08)" }]}>
                <View style={[dm.chatAvatar, { backgroundColor: item.c }]}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{item.n[0]}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: C.navy }}>{item.n}</Text>
                  <Text style={{ fontSize: 9, color: C.muted }} numberOfLines={1}>{item.p}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Main chat area */}
          <View style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={dm.mainHeader}>
              <View style={[dm.mainAvatar, { backgroundColor: C.pink }]}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>S</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.navy, marginLeft: 8, flex: 1 }}>Sarah K.</Text>
              <Ionicons name="videocam-outline" size={13} color="#999" />
              <Ionicons name="call-outline" size={13} color="#999" style={{ marginLeft: 10 }} />
            </View>

            <View style={{ flex: 1, padding: 10, gap: 6 }}>
              {DESK_MSG.map((m, i) => (
                <View key={i} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                  <View style={{ backgroundColor: m.mine ? C.brand : "#F0F0F0", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 10, color: m.mine ? "#fff" : C.navy }}>{m.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={dm.inputRow}>
              <Ionicons name="add-circle-outline" size={14} color="#999" />
              <View style={{ flex: 1, height: 24, backgroundColor: "#F0F4F8", borderRadius: 12, marginHorizontal: 8, justifyContent: "center", paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 9, color: "#999" }}>Type a message...</Text>
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="send" size={11} color="#fff" />
              </View>
            </View>
          </View>
        </View>
      </View>
      {/* Laptop base */}
      <View style={dm.base} />
      <View style={dm.stand} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  FEATURE CARD
// ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, color, title, desc, anim }: { icon: string; color: string; title: string; desc: string; anim: Animated.Value }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      <Pressable
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[fc.card, hovered && fc.cardHovered]}
      >
        <View style={[fc.iconBox, { backgroundColor: color + "18" }]}>
          <Ionicons name={icon as any} size={26} color={color} />
        </View>
        <Text style={fc.title}>{title}</Text>
        <Text style={fc.desc}>{desc}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
//  NAV BAR
// ─────────────────────────────────────────────────────────────
function NavBar({ scrolled, isDesktop, menuOpen, setMenuOpen, onLogin, onDownload }: {
  scrolled: boolean; isDesktop: boolean; menuOpen: boolean; setMenuOpen: (v: boolean) => void; onLogin: () => void; onDownload: () => void;
}) {
  const [hoverIdx, setHoverIdx] = useState(-1);
  return (
    <View style={{ zIndex: 1000 }}>
      <View style={[nb.bar, scrolled && nb.barScrolled]}>
        {/* Logo */}
        <TouchableOpacity style={nb.logo} activeOpacity={0.8}>
          <View style={nb.logoIcon}>
            <Image source={afuLogo} style={{ width: 22, height: 22 }} tintColor="#fff" resizeMode="contain" />
          </View>
          <Text style={nb.logoText}>AfuChat</Text>
        </TouchableOpacity>

        {/* Desktop links */}
        {isDesktop && (
          <View style={nb.links}>
            {NAV_LINKS.map((label, i) => (
              <Pressable
                key={label}
                onHoverIn={() => setHoverIdx(i)}
                onHoverOut={() => setHoverIdx(-1)}
                onPress={label === "Download" ? onDownload : undefined}
                style={nb.link}
              >
                <Text style={[nb.linkText, hoverIdx === i && nb.linkHovered]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Login */}
        <TouchableOpacity onPress={onLogin} activeOpacity={0.85} style={nb.loginBtn}>
          <Text style={nb.loginText}>Login</Text>
        </TouchableOpacity>

        {/* Mobile hamburger */}
        {!isDesktop && (
          <TouchableOpacity onPress={() => setMenuOpen(!menuOpen)} style={nb.burger} activeOpacity={0.7}>
            <Ionicons name={menuOpen ? "close" : "menu"} size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Mobile dropdown */}
      {menuOpen && !isDesktop && (
        <View style={nb.dropdown}>
          {NAV_LINKS.map((label) => (
            <TouchableOpacity key={label} style={nb.dropItem} onPress={() => { setMenuOpen(false); if (label === "Download") onDownload(); }}>
              <Text style={nb.dropText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={nb.dropLoginBtn} onPress={() => { setMenuOpen(false); onLogin(); }}>
            <Text style={nb.dropLoginText}>Login to AfuChat</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  SECTION WRAPPER
// ─────────────────────────────────────────────────────────────
function Section({ children, bg = "#fff", style }: { children: React.ReactNode; bg?: string; style?: object }) {
  return (
    <View style={[{ backgroundColor: bg, paddingVertical: 72, paddingHorizontal: 24, alignItems: "center" }, style]}>
      <View style={{ width: "100%", maxWidth: 1100 }}>
        {children}
      </View>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <View style={{ width: 24, height: 2, backgroundColor: C.brand, borderRadius: 1 }} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: C.brand, letterSpacing: 1.2, textTransform: "uppercase" }}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  APP STORE BADGE
// ─────────────────────────────────────────────────────────────
function PlayStoreBadge({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(PLAY_STORE_URL)}
      activeOpacity={0.85}
      style={[
        as.badge,
        large && as.badgeLarge,
        { backgroundColor: light ? "rgba(255,255,255,0.12)" : C.navy, borderWidth: 1.5, borderColor: light ? "rgba(255,255,255,0.3)" : C.brand },
      ]}
    >
      <Ionicons name="logo-google-playstore" size={large ? 24 : 18} color={light ? "#fff" : C.brand} />
      <View style={{ marginLeft: large ? 10 : 8 }}>
        <Text style={[as.sub, { color: light ? "rgba(255,255,255,0.7)" : C.muted }]}>GET IT ON</Text>
        <Text style={[as.main, { fontSize: large ? 18 : 14, color: light ? "#fff" : C.navy }]}>Google Play</Text>
      </View>
    </TouchableOpacity>
  );
}

function WebAppBadge({ large = false, light = false, onPress }: { large?: boolean; light?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[as.badge, large && as.badgeLarge, { backgroundColor: C.brand }]}>
      <Ionicons name="globe" size={large ? 24 : 18} color="#fff" />
      <View style={{ marginLeft: large ? 10 : 8 }}>
        <Text style={[as.sub, { color: "rgba(255,255,255,0.7)" }]}>OPEN ON</Text>
        <Text style={[as.main, { fontSize: large ? 18 : 14, color: "#fff" }]}>Web App</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
//  FOOTER HELPERS
// ─────────────────────────────────────────────────────────────

type FooterLink = { label: string; path?: any; url?: string };

function FooterLinkCol({ heading, items }: { heading: string; items: FooterLink[] }) {
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const router = useRouter();
  return (
    <View style={{ minWidth: 140, gap: 16 }}>
      <Text style={ft.colHeading}>{heading}</Text>
      <View style={{ gap: 14 }}>
        {items.map((item, i) => (
          <Pressable
            key={item.label}
            onHoverIn={() => setHoveredIdx(i)}
            onHoverOut={() => setHoveredIdx(-1)}
            onPress={() => {
              if (item.url) Linking.openURL(item.url);
              else if (item.path) router.push(item.path);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Text style={[ft.colLink, hoveredIdx === i && ft.colLinkHovered]}>
              {item.label}
            </Text>
            {hoveredIdx === i && (
              <Ionicons name="arrow-forward" size={11} color={C.brand} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SocialBtn({ icon, url, label }: { icon: string; url: string; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => Linking.openURL(url)}
      accessibilityLabel={label}
      style={[ft.socialBtn, hovered && ft.socialBtnHovered]}
    >
      <Ionicons name={icon as any} size={17} color={hovered ? C.brand : "rgba(255,255,255,0.65)"} />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const downloadRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  const heroAnim  = useRef(new Animated.Value(0)).current;
  const featureAnims = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const statAnim  = useRef(new Animated.Value(0)).current;
  const phone1Anim = useRef(new Animated.Value(0)).current;
  const phone2Anim = useRef(new Animated.Value(0)).current;
  const ctaAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(heroAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(statAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.stagger(70, featureAnims.map(a => Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true }))),
      Animated.parallel([
        Animated.timing(phone1Anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(phone2Anim, { toValue: 1, duration: 600, delay: 150, useNativeDriver: true }),
      ]),
      Animated.timing(ctaAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const goLogin    = () => router.push("/(auth)/login" as any);
  const goRegister = () => router.push("/(auth)/register" as any);
  const goDiscover = () => router.push("/(tabs)/discover" as any);

  const scrollToDownload = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const phoneScale = isDesktop ? 1 : Math.min((width - 48) / 220, 1.1);

  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      {/* ── STICKY NAV (outside ScrollView → stays on top) ── */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 999 }}>
        <NavBar
          scrolled={scrolled}
          isDesktop={isDesktop}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          onLogin={goLogin}
          onDownload={scrollToDownload}
        />
      </View>

      {/* ── SCROLLABLE CONTENT ───────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: NAV_H }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
      >

        {/* ═══════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════ */}
        <LinearGradient colors={[C.navy, C.navy2, "#0F3054"]} style={hero.section}>
          {/* Decorative circles */}
          <View style={{ position: "absolute", top: -60, right: -80, width: 400, height: 400, borderRadius: 200, backgroundColor: C.brand + "10", pointerEvents: "none" as any }} />
          <View style={{ position: "absolute", bottom: 0, left: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: C.brand + "08", pointerEvents: "none" as any }} />

          <View style={[hero.inner, isDesktop && hero.innerDesktop]}>
            {/* Left: copy */}
            <Animated.View style={[hero.copy, isDesktop && { maxWidth: 520 }, { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
              <View style={hero.eyebrow}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand }} />
                <Text style={hero.eyebrowText}>The All-in-One Super App</Text>
              </View>
              <Text style={[hero.headline, !isDesktop && { fontSize: 36 }]}>
                Say More.{"\n"}
                <Text style={{ color: C.brand }}>Do More.</Text>
              </Text>
              <Text style={hero.sub}>
                AfuChat brings real-time messaging, AI assistance, social discovery, and payments into one beautifully designed app — built for everyone.
              </Text>
              <View style={[hero.ctaRow, !isDesktop && { flexDirection: "column", alignItems: "stretch" }]}>
                <PlayStoreBadge large light />
                <WebAppBadge large light onPress={goDiscover} />
              </View>

              <View style={hero.trust}>
                {[{ icon: "shield-checkmark", label: "Secure & Private" }, { icon: "flash", label: "Lightning Fast" }, { icon: "globe", label: "Works Everywhere" }].map((t, i) => (
                  <View key={i} style={hero.trustItem}>
                    <Ionicons name={t.icon as any} size={14} color={C.brand} />
                    <Text style={hero.trustLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Right: phone mockup (desktop only) */}
            {isDesktop && (
              <Animated.View style={{ opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], alignItems: "center" }}>
                <View style={{ transform: [{ rotate: "-4deg" }], shadowColor: C.brand, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 40 }}>
                  <PhoneMockup scale={1} />
                </View>
                {/* Floating badge */}
                <View style={hero.floatingBadge}>
                  <Ionicons name="sparkles" size={14} color={C.purple} />
                  <Text style={hero.floatingBadgeText}>AfuAI built in</Text>
                </View>
              </Animated.View>
            )}
          </View>

          {/* Mobile: phone below headline */}
          {!isDesktop && (
            <View style={{ alignItems: "center", marginTop: 40, paddingBottom: 20 }}>
              <PhoneMockup scale={phoneScale} />
            </View>
          )}
        </LinearGradient>

        {/* ═══════════════════════════════════════════════════
            STATS BAR
        ═══════════════════════════════════════════════════ */}
        <Animated.View style={{ opacity: statAnim }}>
          <View style={stats.bar}>
            {STATS.map((s, i) => (
              <React.Fragment key={s.label}>
                <View style={stats.item}>
                  <Text style={stats.value}>{s.value}</Text>
                  <Text style={stats.label}>{s.label}</Text>
                </View>
                {i < STATS.length - 1 && <View style={stats.divider} />}
              </React.Fragment>
            ))}
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════
            FEATURES
        ═══════════════════════════════════════════════════ */}
        <Section bg={C.offWhite}>
          <SectionLabel text="Features" />
          <Text style={[sec.h2, !isDesktop && { fontSize: 26 }]}>
            Everything You Need,{"\n"}
            <Text style={{ color: C.brand }}>All in One Place</Text>
          </Text>
          <Text style={[sec.body, { maxWidth: 560, marginTop: 12, marginBottom: 40 }]}>
            AfuChat is more than a messaging app. It's your social home — packed with powerful features that keep you connected and productive.
          </Text>
          <View style={[feat.grid, !isDesktop && { flexDirection: "column" }]}>
            {FEATURES.map((f, i) => (
              <View key={f.title} style={[feat.col, !isDesktop && { width: "100%" }]}>
                <FeatureCard {...f} anim={featureAnims[i]} />
              </View>
            ))}
          </View>
        </Section>

        {/* ═══════════════════════════════════════════════════
            MOBILE SHOWCASE
        ═══════════════════════════════════════════════════ */}
        <Section bg="#fff">
          <View style={[showcase.row, !isDesktop && { flexDirection: "column-reverse" }]}>
            {/* Phone */}
            <Animated.View style={[showcase.phone, { opacity: phone1Anim, transform: [{ translateX: phone1Anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]}>
              <View style={{ transform: [{ rotate: "3deg" }] }}>
                <PhoneMockup scale={isDesktop ? 1 : Math.min((width - 48) / 220, 1)} />
              </View>
              {/* Floating card */}
              <View style={showcase.floatCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.brand + "20", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="notifications" size={16} color={C.brand} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.navy }}>New Message</Text>
                    <Text style={{ fontSize: 11, color: C.muted }}>Sarah: "Let's catch up!" 👋</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Copy */}
            <Animated.View style={[showcase.copy, isDesktop && { maxWidth: 480 }, { opacity: phone1Anim }]}>
              <SectionLabel text="Mobile App" />
              <Text style={[sec.h2, !isDesktop && { fontSize: 26 }]}>Chat on the Go,{"\n"}<Text style={{ color: C.brand }}>Anywhere.</Text></Text>
              <Text style={[sec.body, { marginTop: 12, marginBottom: 28 }]}>
                The AfuChat mobile app delivers a premium messaging experience with blazing-fast performance, rich notifications, and a beautiful interface designed for everyday use.
              </Text>
              {[
                { icon: "notifications",     color: C.brand,   label: "Smart notifications — never miss a message" },
                { icon: "mic",               color: C.orange,  label: "Voice notes with one tap" },
                { icon: "sparkles",          color: C.purple,  label: "AfuAI assistant inside every chat" },
                { icon: "images",            color: C.green,   label: "Rich media: photos, videos, docs" },
              ].map((item, i) => (
                <View key={i} style={showcase.featureRow}>
                  <View style={[showcase.featureIcon, { backgroundColor: item.color + "18" }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <Text style={showcase.featureLabel}>{item.label}</Text>
                </View>
              ))}
              <View style={[hero.ctaRow, { marginTop: 32, flexWrap: "wrap" }]}>
                <PlayStoreBadge />
                <WebAppBadge onPress={goDiscover} />
              </View>
            </Animated.View>
          </View>
        </Section>

        {/* ═══════════════════════════════════════════════════
            DESKTOP SHOWCASE
        ═══════════════════════════════════════════════════ */}
        <Section bg={C.offWhite}>
          <View style={[showcase.row, !isDesktop && { flexDirection: "column" }]}>
            {/* Copy */}
            <Animated.View style={[showcase.copy, isDesktop && { maxWidth: 440 }, { opacity: phone2Anim }]}>
              <SectionLabel text="Web Platform" />
              <Text style={[sec.h2, !isDesktop && { fontSize: 26 }]}>Powerful on{"\n"}<Text style={{ color: C.brand }}>Desktop Too.</Text></Text>
              <Text style={[sec.body, { marginTop: 12, marginBottom: 28 }]}>
                AfuChat's web platform gives you the full experience from any browser — no install required. Multi-column layout, keyboard shortcuts, and a productivity-first design.
              </Text>
              {[
                { icon: "browsers",          color: C.brand,   label: "Works in any modern browser, no install" },
                { icon: "people",            color: C.blue,    label: "Manage groups and channels with ease" },
                { icon: "chatbubbles",       color: C.green,   label: "Multi-column view for power users" },
                { icon: "sparkles",          color: C.purple,  label: "Full AfuAI access on desktop" },
              ].map((item, i) => (
                <View key={i} style={showcase.featureRow}>
                  <View style={[showcase.featureIcon, { backgroundColor: item.color + "18" }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <Text style={showcase.featureLabel}>{item.label}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={goDiscover} activeOpacity={0.85} style={[dl.primaryBtn, { marginTop: 32, alignSelf: "flex-start" }]}>
                <Ionicons name="globe" size={18} color="#fff" />
                <Text style={dl.primaryBtnText}>Open Web App</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Desktop mockup */}
            {isDesktop && (
              <Animated.View style={{ opacity: phone2Anim, transform: [{ translateX: phone2Anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }}>
                <DesktopMockup />
              </Animated.View>
            )}
          </View>
          {!isDesktop && (
            <View style={{ marginTop: 32, alignItems: "center" }}>
              <DesktopMockup />
            </View>
          )}
        </Section>

        {/* ═══════════════════════════════════════════════════
            DOWNLOAD CTA  (enhanced)
        ═══════════════════════════════════════════════════ */}
        <Animated.View style={{ opacity: ctaAnim }}>
          <LinearGradient
            colors={["#0D2340", "#0F2F50", "#00515A"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={dl.section}
          >
            {/* Decorative blobs */}
            <View style={{ position: "absolute", top: -100, right: -100, width: 500, height: 500, borderRadius: 250, backgroundColor: C.brand + "12", pointerEvents: "none" as any }} />
            <View style={{ position: "absolute", bottom: -80, left: -80, width: 380, height: 380, borderRadius: 190, backgroundColor: "#007AFF18", pointerEvents: "none" as any }} />
            <View style={{ position: "absolute", top: "40%", left: "30%", width: 200, height: 200, borderRadius: 100, backgroundColor: C.brand + "08", pointerEvents: "none" as any }} />

            <View style={{ alignItems: "center", maxWidth: 680, alignSelf: "center", width: "100%" }}>

              {/* Social proof */}
              <View style={dl.proof}>
                <View style={{ flexDirection: "row", gap: 3 }}>
                  {[1,2,3,4,5].map(i => (
                    <Ionicons key={i} name="star" size={13} color="#FFD700" />
                  ))}
                </View>
                <Text style={dl.proofText}>Loved by 50,000+ users across Africa</Text>
              </View>

              {/* Icon */}
              <View style={dl.iconCircle}>
                <Image source={afuLogo} style={{ width: 44, height: 44 }} tintColor="#fff" resizeMode="contain" />
              </View>

              {/* Heading */}
              <Text style={[dl.heading, !isDesktop && { fontSize: 30 }]}>
                Your All-in-One Super App{"\n"}
                <Text style={{ color: C.brand }}>Is Ready for You</Text>
              </Text>

              {/* Sub */}
              <Text style={dl.sub}>
                Join thousands already using AfuChat to chat, discover, and stay connected — completely free, forever. No hidden fees, no limits.
              </Text>

              {/* Feature pills */}
              <View style={[dl.pills, !isDesktop && { flexWrap: "wrap", justifyContent: "center" }]}>
                {[
                  { icon: "sparkles-outline", label: "Built-in AI" },
                  { icon: "shield-checkmark-outline", label: "End-to-End Secure" },
                  { icon: "people-outline", label: "Groups & Channels" },
                  { icon: "globe-outline", label: "Works on Web" },
                ].map((p, i) => (
                  <View key={i} style={dl.pill}>
                    <Ionicons name={p.icon as any} size={13} color={C.brand} />
                    <Text style={dl.pillText}>{p.label}</Text>
                  </View>
                ))}
              </View>

              {/* Badges */}
              <View style={[dl.badges, !isDesktop && { flexDirection: "column", width: "100%", maxWidth: 300, alignSelf: "center" }]}>
                <PlayStoreBadge large light />
                <WebAppBadge large light onPress={goDiscover} />
              </View>

              {/* Trust line */}
              <View style={dl.trust}>
                {["Free forever", "No credit card", "Available everywhere"].map((t, i) => (
                  <React.Fragment key={t}>
                    {i > 0 && <View style={dl.trustDot} />}
                    <Text style={dl.trustText}>{t}</Text>
                  </React.Fragment>
                ))}
              </View>

              {/* Sign-up link */}
              <TouchableOpacity onPress={goRegister} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 24 }}>
                <Text style={dl.signupPlain}>Don't have an account?</Text>
                <Text style={dl.signupCta}>Create one for free →</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════════════ */}
        <View style={ft.footer}>

          {/* ── Top grid: brand col + link columns ── */}
          <View style={[ft.mainRow, !isDesktop && { flexDirection: "column", gap: 40 }]}>

            {/* Brand column */}
            <View style={ft.brandCol}>
              {/* Logo */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <View style={ft.logoBox}>
                  <Image source={afuLogo} style={{ width: 20, height: 20 }} tintColor="#fff" resizeMode="contain" />
                </View>
                <Text style={ft.logoText}>AfuChat</Text>
              </View>

              {/* Description */}
              <Text style={ft.desc}>
                The all-in-one super app for real-time messaging, AI assistance, social discovery, and payments. Built for everyone, everywhere.
              </Text>

              {/* Mini Play badge */}
              <TouchableOpacity
                onPress={() => Linking.openURL(PLAY_STORE_URL)}
                activeOpacity={0.8}
                style={ft.miniBadge}
              >
                <Ionicons name="logo-google-playstore" size={15} color={C.brand} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={ft.miniBadgeSub}>GET IT ON</Text>
                  <Text style={ft.miniBadgeMain}>Google Play</Text>
                </View>
              </TouchableOpacity>

              {/* Social icons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
                <SocialBtn icon="logo-twitter"          url="https://twitter.com/afuchat"           label="Twitter / X" />
                <SocialBtn icon="logo-facebook"         url="https://facebook.com/afuchat"          label="Facebook" />
                <SocialBtn icon="logo-instagram"        url="https://instagram.com/afuchat"         label="Instagram" />
                <SocialBtn icon="logo-youtube"          url="https://youtube.com/@afuchat"          label="YouTube" />
              </View>
            </View>

            {/* Link columns */}
            <View style={[ft.colsGrid, !isDesktop && { width: "100%", flexWrap: "wrap", gap: 32 }]}>
              <FooterLinkCol
                heading="Quick Links"
                items={[
                  { label: "Features",        path: undefined },
                  { label: "About AfuChat",   path: "/about" as any },
                  { label: "Download App",    url: PLAY_STORE_URL },
                  { label: "Open Web App",    path: "/(tabs)/discover" as any },
                ]}
              />
              <FooterLinkCol
                heading="Company"
                items={[
                  { label: "About Us",        path: "/about" as any },
                  { label: "Contact Us",      url: "mailto:support@afuchat.com" },
                  { label: "Help & Support",  url: "mailto:support@afuchat.com" },
                  { label: "Community",       path: "/(tabs)/discover" as any },
                ]}
              />
              <FooterLinkCol
                heading="Legal"
                items={[
                  { label: "Privacy Policy",  path: "/privacy" as any },
                  { label: "Terms of Service",path: "/terms" as any },
                  { label: "Cookie Policy",   path: "/privacy" as any },
                  { label: "Security",        path: "/about" as any },
                ]}
              />
            </View>
          </View>

          {/* ── Newsletter / contact strip ── */}
          <View style={[ft.contactStrip, !isDesktop && { flexDirection: "column", gap: 10, alignItems: "flex-start" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="mail-outline" size={16} color={C.brand} />
              <Text style={ft.contactLabel}>Have questions? Reach us at</Text>
              <TouchableOpacity onPress={() => Linking.openURL("mailto:support@afuchat.com")} activeOpacity={0.7}>
                <Text style={ft.contactEmail}>support@afuchat.com</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.35)" />
              <Text style={ft.contactMeta}>Entebbe, Uganda · Serving Africa & Beyond</Text>
            </View>
          </View>

          {/* ── Divider ── */}
          <View style={ft.divider} />

          {/* ── Copyright bar ── */}
          <View style={[ft.bottomBar, !isDesktop && { flexDirection: "column", alignItems: "flex-start", gap: 16 }]}>
            <Text style={ft.copyright}>
              © {new Date().getFullYear()} AfuChat. All rights reserved.
            </Text>

            {/* Legal links */}
            <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
              {([
                { label: "Privacy Policy",   path: "/privacy" as any },
                { label: "Terms of Service", path: "/terms" as any },
                { label: "Cookies",          path: "/privacy" as any },
              ] as FooterLink[]).map((link, i) => (
                <TouchableOpacity key={i} onPress={() => router.push(link.path)} activeOpacity={0.7}>
                  <Text style={ft.bottomLink}>{link.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={ft.madeIn}>🇺🇬 Made in Uganda</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────────────────────

const nb = StyleSheet.create({
  bar: {
    height: NAV_H,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    gap: 4,
  },
  barScrolled: {
    backgroundColor: C.navy + "F5",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    ...(Platform.OS === "web" ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {}) as any,
  },
  logo: { flexDirection: "row", alignItems: "center", gap: 10, marginRight: 16 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  links: { flexDirection: "row", gap: 4 },
  link: { paddingHorizontal: 14, paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.75)" },
  linkHovered: { color: "#fff" },
  loginBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 22, backgroundColor: C.brand, marginLeft: 8 },
  loginText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  burger: { marginLeft: 12, padding: 4 },
  dropdown: { backgroundColor: C.navy2, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", paddingHorizontal: 20, paddingBottom: 16 },
  dropItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  dropText: { fontSize: 16, color: "rgba(255,255,255,0.85)", fontWeight: "500" },
  dropLoginBtn: { marginTop: 16, backgroundColor: C.brand, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  dropLoginText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

const hero = StyleSheet.create({
  section: { paddingTop: 80, paddingBottom: 72, paddingHorizontal: 24 },
  inner: { alignItems: "center", gap: 32, width: "100%", maxWidth: 1100, alignSelf: "center" },
  innerDesktop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  copy: { flex: 1 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  eyebrowText: { fontSize: 13, fontWeight: "600", color: C.brand, letterSpacing: 0.8, textTransform: "uppercase" },
  headline: { fontSize: 56, fontWeight: "800", color: "#fff", lineHeight: 64, letterSpacing: -1.5, marginBottom: 20 },
  sub: { fontSize: 17, color: "rgba(255,255,255,0.72)", lineHeight: 27, marginBottom: 36, maxWidth: 480 },
  ctaRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  trust: { flexDirection: "row", flexWrap: "wrap", gap: 20, marginTop: 36 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "500" },
  floatingBadge: { position: "absolute", bottom: -16, right: -10, backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  floatingBadgeText: { fontSize: 13, fontWeight: "600", color: C.navy },
});

const stats = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 24, paddingHorizontal: 24, justifyContent: "center", flexWrap: "wrap", gap: 0 },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, minWidth: 80 },
  value: { fontSize: 28, fontWeight: "800", color: C.brand, letterSpacing: -0.5 },
  label: { fontSize: 13, color: C.muted, marginTop: 2, fontWeight: "500" },
  divider: { width: 1, backgroundColor: C.border, alignSelf: "stretch", marginVertical: 4 },
});

const sec = StyleSheet.create({
  h2: { fontSize: 38, fontWeight: "800", color: C.navy, lineHeight: 46, letterSpacing: -1 },
  body: { fontSize: 16, color: C.muted, lineHeight: 26 },
});

const feat = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  col: { width: "31%", minWidth: 200 },
});

const fc = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 22, gap: 10, borderWidth: 1, borderColor: C.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  cardHovered: { shadowOpacity: 0.12, shadowRadius: 20, borderColor: C.brand + "50", transform: [{ translateY: -2 }] } as any,
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: C.navy },
  desc: { fontSize: 14, color: C.muted, lineHeight: 22 },
});

const showcase = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 60, width: "100%" },
  phone: { alignItems: "center", position: "relative" },
  copy: { flex: 1, gap: 0 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 15, color: C.text, fontWeight: "500", flex: 1 },
  floatCard: { position: "absolute", bottom: 20, right: -20, backgroundColor: "#fff", borderRadius: 16, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, width: 220, borderWidth: 1, borderColor: C.border },
});

const as = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, gap: 0 },
  badgeLarge: { paddingHorizontal: 22, paddingVertical: 14 },
  sub: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  main: { fontWeight: "700", letterSpacing: -0.2 },
});

const dl = StyleSheet.create({
  section: { paddingVertical: 100, paddingHorizontal: 24, alignItems: "center", overflow: "hidden" },
  proof: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginBottom: 32 },
  proofText: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  iconCircle: { width: 88, height: 88, borderRadius: 26, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginBottom: 28, shadowColor: C.brand, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 28 },
  heading: { fontSize: 42, fontWeight: "800", color: "#fff", textAlign: "center", letterSpacing: -1, marginBottom: 18, lineHeight: 52 },
  sub: { fontSize: 17, color: "rgba(255,255,255,0.68)", textAlign: "center", lineHeight: 28, marginBottom: 32, maxWidth: 540 },
  pills: { flexDirection: "row", gap: 10, marginBottom: 40 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(0,188,212,0.3)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 30 },
  pillText: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  badges: { flexDirection: "row", gap: 16, flexWrap: "wrap", justifyContent: "center" },
  trust: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28 },
  trustDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },
  trustText: { fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  signupPlain: { fontSize: 15, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  signupCta: { fontSize: 15, color: C.brand, fontWeight: "700" },
});

const ft = StyleSheet.create({
  // Outer shell
  footer: { backgroundColor: "#07152A", paddingTop: 72, paddingHorizontal: 32, paddingBottom: 0 },

  // Top content row
  mainRow: { flexDirection: "row", gap: 56, flexWrap: "wrap", paddingBottom: 56 },

  // Brand column
  brandCol: { flex: 1, minWidth: 220, maxWidth: 280 },
  logoBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  desc: { fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 23, marginBottom: 20 },

  // Mini Play badge
  miniBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  miniBadgeSub: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 0.8, textTransform: "uppercase" },
  miniBadgeMain: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // Social buttons
  socialBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  socialBtnHovered: { backgroundColor: "rgba(0,188,212,0.15)", borderColor: "rgba(0,188,212,0.4)" },

  // Link columns grid
  colsGrid: { flexDirection: "row", gap: 48, flex: 1 },

  // Each column
  colHeading: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.9)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  colLink: { fontSize: 14, color: "rgba(255,255,255,0.48)", fontWeight: "500", lineHeight: 20 },
  colLinkHovered: { color: "rgba(255,255,255,0.9)" },

  // Contact strip
  contactStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, marginBottom: 36, gap: 12 },
  contactLabel: { fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
  contactEmail: { fontSize: 14, color: C.brand, fontWeight: "700" },
  contactMeta: { fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: "500" },

  // Divider
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: -32 },

  // Copyright bar
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 22, flexWrap: "wrap", gap: 12 },
  copyright: { fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: "500" },
  bottomLink: { fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  madeIn: { fontSize: 13, color: "rgba(255,255,255,0.28)" },
});

const dm = StyleSheet.create({
  wrap: { alignItems: "center" },
  screen: { width: 560, height: 340, backgroundColor: "#F0F4F8", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#D0D8E4", shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 30 },
  chrome: { height: 36, backgroundColor: "#E8EDF5", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  urlBar: { flex: 1, height: 22, backgroundColor: "#fff", borderRadius: 6, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, marginHorizontal: 8 },
  url: { fontSize: 10, color: "#666" },
  sidebar: { width: 120, backgroundColor: "#F8FAFF", borderRightWidth: 1, borderRightColor: "#E0E8F0" },
  sidebarHeader: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  sidebarItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 9, gap: 8 },
  sidebarLabel: { fontSize: 11, fontWeight: "600" },
  chatCol: { width: 150, backgroundColor: "#fff", borderRightWidth: 1, borderRightColor: "#E0E8F0" },
  chatColHeader: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: "#E0E8F0" },
  chatRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F0F0F0" },
  chatAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  mainHeader: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#F0F4F8" },
  mainAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  messages: { flex: 1, padding: 10, gap: 6 },
  msgBubble: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: "75%", alignSelf: "flex-start" },
  mine: { alignSelf: "flex-end", backgroundColor: C.brand },
  theirs: { backgroundColor: "#F0F0F0" },
  msgText: { fontSize: 10 },
  inputRow: { height: 40, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#F0F4F8", gap: 8 },
  base: { width: 600, height: 14, backgroundColor: "#D0D8E4", borderRadius: 4, marginTop: 2 },
  stand: { width: 120, height: 8, backgroundColor: "#C0C8D4", borderRadius: 4 },
});
