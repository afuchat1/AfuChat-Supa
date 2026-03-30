import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import {
  emailUserTicketCreated,
  emailStaffNewTicket,
  emailUserStaffReply,
  emailNewDeviceLogin,
  emailOrderPlaced,
  emailOrderShipped,
  emailOrderDelivered,
  emailAcoinTransaction,
} from "../lib/email";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let watcherStarted = false;

export function startRealtimeWatcher() {
  if (watcherStarted || !supabaseUrl || !serviceKey) {
    if (!supabaseUrl || !serviceKey) {
      logger.warn("[watcher] Missing Supabase config — email watcher not started");
    }
    return;
  }
  watcherStarted = true;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info("[watcher] Starting Supabase realtime watcher");

  // ── Support Tickets ────────────────────────────────────────────────────
  admin
    .channel("support-tickets-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, async (payload) => {
      const ticket = payload.new as any;
      logger.info({ ticketId: ticket.id }, "[watcher] New support ticket");

      // Fetch user profile for display name
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, handle, email:id")
        .eq("id", ticket.user_id)
        .single();

      // Fetch first message (the user's initial message)
      await new Promise((r) => setTimeout(r, 1000)); // wait a bit for messages to be inserted
      const { data: messages } = await admin
        .from("support_messages")
        .select("message")
        .eq("ticket_id", ticket.id)
        .eq("sender_type", "user")
        .order("created_at", { ascending: true })
        .limit(1);

      const preview = messages?.[0]?.message || "(no message)";
      const userName = (profile as any)?.display_name || (profile as any)?.handle || "User";

      // Email user confirmation
      if (ticket.email) {
        emailUserTicketCreated({
          to: ticket.email,
          ticketId: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          preview,
        }).catch((e) => logger.error(e, "[watcher] emailUserTicketCreated failed"));
      }

      // Email support staff
      emailStaffNewTicket({
        ticketId: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        userEmail: ticket.email,
        userName,
        preview,
      }).catch((e) => logger.error(e, "[watcher] emailStaffNewTicket failed"));
    })
    .subscribe();

  // ── Support Messages (staff replies → email user) ──────────────────────
  admin
    .channel("support-messages-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, async (payload) => {
      const msg = payload.new as any;
      if (msg.sender_type !== "staff" || msg.is_internal) return;

      logger.info({ msgId: msg.id, ticketId: msg.ticket_id }, "[watcher] Staff replied to ticket");

      const { data: ticket } = await admin
        .from("support_tickets")
        .select("email, subject, user_id")
        .eq("id", msg.ticket_id)
        .single();

      if (!ticket?.email) return;

      const { data: staffProfile } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", msg.sender_id)
        .single();

      const staffName = (staffProfile as any)?.display_name || (staffProfile as any)?.handle || "AfuChat Support";

      emailUserStaffReply({
        to: (ticket as any).email,
        ticketId: msg.ticket_id,
        ticketSubject: (ticket as any).subject,
        staffName,
        replyText: msg.message,
      }).catch((e) => logger.error(e, "[watcher] emailUserStaffReply failed"));
    })
    .subscribe();

  // ── Device Sessions (new device → email user) ──────────────────────────
  admin
    .channel("device-sessions-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_device_sessions" }, async (payload) => {
      const session = payload.new as any;
      logger.info({ userId: session.user_id }, "[watcher] New device session");

      // Get user email from auth
      const { data: { user } } = await admin.auth.admin.getUserById(session.user_id);
      if (!user?.email) return;

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", session.user_id)
        .single();

      const userName = (profile as any)?.display_name || (profile as any)?.handle || "there";

      emailNewDeviceLogin({
        to: user.email,
        userName,
        deviceName: session.device_name || "Unknown device",
        deviceOs: session.device_os || "Unknown OS",
        city: session.city,
        country: session.country,
        time: new Date(session.created_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "short" }) + " UTC",
      }).catch((e) => logger.error(e, "[watcher] emailNewDeviceLogin failed"));
    })
    .subscribe();

  // ── Shop Orders (new order → email buyer) ─────────────────────────────
  admin
    .channel("shop-orders-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_orders" }, async (payload) => {
      const order = payload.new as any;
      logger.info({ orderId: order.id }, "[watcher] New shop order");

      await new Promise((r) => setTimeout(r, 500));

      const { data: buyer } = await admin.auth.admin.getUserById(order.buyer_id);
      const { data: buyerProfile } = await admin.from("profiles").select("display_name, handle").eq("id", order.buyer_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();
      const { data: shop } = await admin.from("shops").select("name").eq("id", order.shop_id).single();

      if (!buyer.user?.email) return;

      emailOrderPlaced({
        to: buyer.user.email,
        buyerName: (buyerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        amount: order.escrowed_acoin || 0,
        sellerName: (shop as any)?.name || "the seller",
      }).catch((e) => logger.error(e, "[watcher] emailOrderPlaced failed"));
    })
    .subscribe();

  // ── Shop Orders (status=shipped → email buyer) ─────────────────────────
  admin
    .channel("shop-orders-shipped-watcher")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_orders", filter: "status=eq.shipped" }, async (payload) => {
      const order = payload.new as any;
      if (!order.seller_confirmed_at) return;
      logger.info({ orderId: order.id }, "[watcher] Order shipped");

      const { data: buyer } = await admin.auth.admin.getUserById(order.buyer_id);
      const { data: buyerProfile } = await admin.from("profiles").select("display_name").eq("id", order.buyer_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();
      const { data: shop } = await admin.from("shops").select("name").eq("id", order.shop_id).single();

      if (!buyer.user?.email) return;

      emailOrderShipped({
        to: buyer.user.email,
        buyerName: (buyerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        sellerName: (shop as any)?.name || "the seller",
      }).catch((e) => logger.error(e, "[watcher] emailOrderShipped failed"));
    })
    .subscribe();

  // ── Shop Orders (status=delivered → email seller) ─────────────────────
  admin
    .channel("shop-orders-delivered-watcher")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_orders", filter: "status=eq.delivered" }, async (payload) => {
      const order = payload.new as any;
      logger.info({ orderId: order.id }, "[watcher] Order delivered, releasing to seller");

      const { data: shop } = await admin.from("shops").select("name, seller_id").eq("id", order.shop_id).single();
      if (!(shop as any)?.seller_id) return;

      const { data: seller } = await admin.auth.admin.getUserById((shop as any).seller_id);
      const { data: sellerProfile } = await admin.from("profiles").select("display_name").eq("id", (shop as any).seller_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();

      if (!seller.user?.email) return;

      emailOrderDelivered({
        to: seller.user.email,
        sellerName: (sellerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        amount: order.escrowed_acoin || 0,
      }).catch((e) => logger.error(e, "[watcher] emailOrderDelivered failed"));
    })
    .subscribe();

  // ── ACoin Transactions ─────────────────────────────────────────────────
  admin
    .channel("acoin-transactions-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "acoin_transactions" }, async (payload) => {
      const txn = payload.new as any;
      if (!["transfer", "gift"].includes(txn.type)) return;
      logger.info({ txnId: txn.id, type: txn.type }, "[watcher] ACoin transaction");

      const sendEmailForUser = async (userId: string, type: "sent" | "received", counterpartId: string) => {
        const { data: user } = await admin.auth.admin.getUserById(userId);
        if (!user.user?.email) return;
        const { data: profile } = await admin.from("profiles").select("display_name, handle").eq("id", userId).single();
        const { data: counterpart } = await admin.from("profiles").select("display_name, handle").eq("id", counterpartId).single();
        const userName = (profile as any)?.display_name || (profile as any)?.handle || "there";
        const counterpartName = (counterpart as any)?.display_name || (counterpart as any)?.handle || "someone";

        emailAcoinTransaction({
          to: user.user.email,
          userName,
          type,
          amount: Math.abs(txn.amount),
          counterpartName,
          note: txn.note || txn.description,
        }).catch((e) => logger.error(e, "[watcher] emailAcoinTransaction failed"));
      };

      if (txn.user_id) sendEmailForUser(txn.user_id, "sent", txn.related_user_id).catch(() => {});
      if (txn.related_user_id) sendEmailForUser(txn.related_user_id, "received", txn.user_id).catch(() => {});
    })
    .subscribe();

  logger.info("[watcher] All realtime channels subscribed");
}
