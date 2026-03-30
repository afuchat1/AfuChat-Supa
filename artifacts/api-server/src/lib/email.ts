const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM = "AfuChat Notifications <notifications@afuchat.com>";
const SUPPORT_EMAIL = "support@afuchat.com";
const SUPPORT_INBOX = "support+tickets@afuchat.com";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set, skipping email");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        reply_to: opts.replyTo,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return false;
  }
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a}
  .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:#00BCD4;padding:24px 32px;display:flex;align-items:center;gap:12px}
  .header h1{color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px}
  .logo{width:36px;height:36px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
  .body{padding:32px}
  .title{font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:12px}
  .text{font-size:15px;color:#444;line-height:1.6;margin-bottom:16px}
  .card{background:#f8f8f8;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #00BCD4}
  .card .label{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:6px}
  .card .value{font-size:15px;color:#1a1a1a;font-weight:500}
  .btn{display:inline-block;background:#00BCD4;color:#fff!important;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;margin:8px 0}
  .divider{height:1px;background:#eee;margin:24px 0}
  .meta{font-size:13px;color:#888;line-height:1.6}
  .badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px}
  .badge-open{background:#e3f9e5;color:#1a7f1a}
  .badge-urgent{background:#ffe5e5;color:#cc0000}
  .badge-info{background:#e5f5ff;color:#0066cc}
  .footer{background:#f5f5f5;padding:20px 32px;font-size:12px;color:#888;text-align:center;border-top:1px solid #eee}
  .footer a{color:#00BCD4;text-decoration:none}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">💬</div>
    <h1>AfuChat</h1>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>This email was sent from <a href="mailto:notifications@afuchat.com">notifications@afuchat.com</a></p>
    <p style="margin-top:6px">AfuChat · Making connections meaningful</p>
  </div>
</div>
</body>
</html>`;
}

// ─── Support Ticket Emails ──────────────────────────────────────────────

export function emailUserTicketCreated(opts: {
  to: string;
  ticketId: string;
  subject: string;
  category: string;
  preview: string;
}): Promise<boolean> {
  const shortId = opts.ticketId.split("-")[0].toUpperCase();
  return sendEmail({
    to: opts.to,
    subject: `[#${shortId}] Your support request has been received`,
    html: baseTemplate(`
      <p class="title">We've received your request 👋</p>
      <span class="badge badge-open">Ticket #${shortId}</span>
      <p class="text">Thanks for reaching out to AfuChat Support. Our team will review your request and get back to you shortly.</p>
      <div class="card">
        <div class="label">Subject</div>
        <div class="value">${escHtml(opts.subject)}</div>
        <div class="label" style="margin-top:12px">Category</div>
        <div class="value">${escHtml(opts.category)}</div>
        <div class="label" style="margin-top:12px">Your message</div>
        <div class="value" style="color:#555">${escHtml(opts.preview)}</div>
      </div>
      <p class="text">You'll be notified by email when our team responds. You can also check the status of your ticket in the AfuChat app under <strong>Support</strong>.</p>
      <div class="divider"></div>
      <p class="meta">Ticket ID: ${opts.ticketId}<br/>If you need to add more details, simply reply to this email.</p>
    `),
    replyTo: `support+${opts.ticketId}@afuchat.com`,
  });
}

export function emailStaffNewTicket(opts: {
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  userEmail: string;
  userName: string;
  preview: string;
}): Promise<boolean> {
  const shortId = opts.ticketId.split("-")[0].toUpperCase();
  const priorityColor = opts.priority === "urgent" ? "#cc0000" : opts.priority === "high" ? "#FF9500" : "#444";
  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `[NEW TICKET #${shortId}] ${opts.subject}`,
    html: baseTemplate(`
      <p class="title">New Support Ticket</p>
      <span class="badge badge-info">Ticket #${shortId}</span>
      <div class="card">
        <div class="label">From</div>
        <div class="value">${escHtml(opts.userName)} &lt;${escHtml(opts.userEmail)}&gt;</div>
        <div class="label" style="margin-top:12px">Subject</div>
        <div class="value">${escHtml(opts.subject)}</div>
        <div class="label" style="margin-top:12px">Category</div>
        <div class="value">${escHtml(opts.category)}</div>
        <div class="label" style="margin-top:12px">Priority</div>
        <div class="value" style="color:${priorityColor};font-weight:600;text-transform:capitalize">${escHtml(opts.priority)}</div>
        <div class="label" style="margin-top:12px">Message</div>
        <div class="value" style="color:#555;white-space:pre-wrap">${escHtml(opts.preview)}</div>
      </div>
      <a href="https://afuchat.com" class="btn">View in Support Dashboard</a>
      <div class="divider"></div>
      <p class="meta">Ticket ID: ${opts.ticketId}<br/>Reply directly to this email to respond to the user — your reply will appear in the ticket thread.</p>
    `),
    replyTo: opts.userEmail,
  });
}

export function emailUserStaffReply(opts: {
  to: string;
  ticketId: string;
  ticketSubject: string;
  staffName: string;
  replyText: string;
}): Promise<boolean> {
  const shortId = opts.ticketId.split("-")[0].toUpperCase();
  return sendEmail({
    to: opts.to,
    subject: `Re: [#${shortId}] ${opts.ticketSubject}`,
    html: baseTemplate(`
      <p class="title">A reply from AfuChat Support</p>
      <span class="badge badge-open">Ticket #${shortId}</span>
      <p class="text"><strong>${escHtml(opts.staffName)}</strong> from the AfuChat Support team has responded to your request.</p>
      <div class="card">
        <div class="label">Their reply</div>
        <div class="value" style="white-space:pre-wrap">${escHtml(opts.replyText)}</div>
      </div>
      <p class="text">You can reply directly to this email, or open the AfuChat app to continue the conversation in your support ticket.</p>
      <div class="divider"></div>
      <p class="meta">Ticket: #${shortId} — ${escHtml(opts.ticketSubject)}<br/>Ticket ID: ${opts.ticketId}</p>
    `),
    replyTo: `support+${opts.ticketId}@afuchat.com`,
  });
}

// ─── Transaction Emails ─────────────────────────────────────────────────

export function emailOrderPlaced(opts: {
  to: string;
  buyerName: string;
  orderId: string;
  productName: string;
  amount: number;
  sellerName: string;
}): Promise<boolean> {
  const shortOrder = opts.orderId.split("-")[0].toUpperCase();
  return sendEmail({
    to: opts.to,
    subject: `Order #${shortOrder} placed successfully`,
    html: baseTemplate(`
      <p class="title">Order placed! 🛒</p>
      <p class="text">Hi ${escHtml(opts.buyerName)}, your order has been placed and is now awaiting the seller to ship it.</p>
      <div class="card">
        <div class="label">Order ID</div>
        <div class="value">#${shortOrder}</div>
        <div class="label" style="margin-top:12px">Product</div>
        <div class="value">${escHtml(opts.productName)}</div>
        <div class="label" style="margin-top:12px">Seller</div>
        <div class="value">${escHtml(opts.sellerName)}</div>
        <div class="label" style="margin-top:12px">Amount Paid</div>
        <div class="value" style="color:#00BCD4;font-weight:700">${opts.amount.toLocaleString()} AC</div>
      </div>
      <p class="text">Your funds are held securely in escrow and will be released to the seller only after you confirm delivery.</p>
      <div class="divider"></div>
      <p class="meta">Order ID: ${opts.orderId}</p>
    `),
  });
}

export function emailOrderShipped(opts: {
  to: string;
  buyerName: string;
  orderId: string;
  productName: string;
  sellerName: string;
}): Promise<boolean> {
  const shortOrder = opts.orderId.split("-")[0].toUpperCase();
  return sendEmail({
    to: opts.to,
    subject: `Your order #${shortOrder} has been shipped 📦`,
    html: baseTemplate(`
      <p class="title">Your order is on its way! 📦</p>
      <p class="text">Hi ${escHtml(opts.buyerName)}, <strong>${escHtml(opts.sellerName)}</strong> has shipped your order.</p>
      <div class="card">
        <div class="label">Order ID</div>
        <div class="value">#${shortOrder}</div>
        <div class="label" style="margin-top:12px">Product</div>
        <div class="value">${escHtml(opts.productName)}</div>
      </div>
      <p class="text">Once you receive your item, please confirm delivery in the AfuChat app to release payment to the seller.</p>
      <div class="divider"></div>
      <p class="meta">Order ID: ${opts.orderId}</p>
    `),
  });
}

export function emailOrderDelivered(opts: {
  to: string;
  sellerName: string;
  orderId: string;
  productName: string;
  amount: number;
}): Promise<boolean> {
  const shortOrder = opts.orderId.split("-")[0].toUpperCase();
  return sendEmail({
    to: opts.to,
    subject: `Payment released for order #${shortOrder} ✅`,
    html: baseTemplate(`
      <p class="title">Payment released to you ✅</p>
      <p class="text">Hi ${escHtml(opts.sellerName)}, the buyer has confirmed delivery. Your payment has been released from escrow.</p>
      <div class="card">
        <div class="label">Order ID</div>
        <div class="value">#${shortOrder}</div>
        <div class="label" style="margin-top:12px">Product</div>
        <div class="value">${escHtml(opts.productName)}</div>
        <div class="label" style="margin-top:12px">Amount Received</div>
        <div class="value" style="color:#34C759;font-weight:700">+${opts.amount.toLocaleString()} AC</div>
      </div>
      <div class="divider"></div>
      <p class="meta">Order ID: ${opts.orderId}</p>
    `),
  });
}

export function emailAcoinTransaction(opts: {
  to: string;
  userName: string;
  type: "sent" | "received";
  amount: number;
  counterpartName: string;
  note?: string;
}): Promise<boolean> {
  const isReceived = opts.type === "received";
  return sendEmail({
    to: opts.to,
    subject: isReceived
      ? `You received ${opts.amount.toLocaleString()} AC from ${opts.counterpartName}`
      : `You sent ${opts.amount.toLocaleString()} AC to ${opts.counterpartName}`,
    html: baseTemplate(`
      <p class="title">${isReceived ? "ACoins Received 💰" : "ACoins Sent 📤"}</p>
      <p class="text">Hi ${escHtml(opts.userName)},</p>
      <div class="card">
        <div class="label">${isReceived ? "From" : "To"}</div>
        <div class="value">${escHtml(opts.counterpartName)}</div>
        <div class="label" style="margin-top:12px">Amount</div>
        <div class="value" style="color:${isReceived ? "#34C759" : "#FF3B30"};font-weight:700;font-size:22px">${isReceived ? "+" : "-"}${opts.amount.toLocaleString()} AC</div>
        ${opts.note ? `<div class="label" style="margin-top:12px">Note</div><div class="value">${escHtml(opts.note)}</div>` : ""}
      </div>
      <p class="text">Your AfuPay balance has been updated. Open the AfuChat app to view your wallet.</p>
    `),
  });
}

// ─── Security Emails ────────────────────────────────────────────────────

export function emailNewDeviceLogin(opts: {
  to: string;
  userName: string;
  deviceName: string;
  deviceOs: string;
  city?: string;
  country?: string;
  time: string;
}): Promise<boolean> {
  const location = [opts.city, opts.country].filter(Boolean).join(", ") || "Unknown location";
  return sendEmail({
    to: opts.to,
    subject: "New device sign-in to your AfuChat account",
    html: baseTemplate(`
      <p class="title">New device sign-in detected 🔐</p>
      <p class="text">Hi ${escHtml(opts.userName)}, your AfuChat account was accessed from a new device.</p>
      <div class="card">
        <div class="label">Device</div>
        <div class="value">${escHtml(opts.deviceName)} (${escHtml(opts.deviceOs)})</div>
        <div class="label" style="margin-top:12px">Location</div>
        <div class="value">${escHtml(location)}</div>
        <div class="label" style="margin-top:12px">Time</div>
        <div class="value">${escHtml(opts.time)}</div>
      </div>
      <p class="text">If this was you, no action is needed. If you don't recognize this sign-in, please secure your account immediately by changing your password.</p>
      <div class="divider"></div>
      <p class="meta">For security questions, contact <a href="mailto:support@afuchat.com" style="color:#00BCD4">support@afuchat.com</a></p>
    `),
  });
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { SUPPORT_EMAIL, SUPPORT_INBOX };
