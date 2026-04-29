import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

router.post("/chats/create", async (req: Request, res: Response) => {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      res.status(503).json({ error: "Service not configured" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const jwt = authHeader.slice(7);

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const { contactId } = req.body;
    if (!contactId || typeof contactId !== "string") {
      res.status(400).json({ error: "contactId is required" });
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: chat, error: chatError } = await adminClient
      .from("chats")
      .insert({ is_group: false, created_by: user.id, user_id: user.id })
      .select()
      .single();

    if (chatError || !chat) {
      res.status(500).json({ error: "Failed to create chat", detail: chatError?.message });
      return;
    }

    const { error: memberError } = await adminClient
      .from("chat_members")
      .insert([
        { chat_id: chat.id, user_id: user.id },
        { chat_id: chat.id, user_id: contactId },
      ]);

    if (memberError) {
      await adminClient.from("chats").delete().eq("id", chat.id);
      res.status(500).json({ error: "Failed to add members", detail: memberError.message });
      return;
    }

    res.json({ chatId: chat.id });
  } catch (err: any) {
    res.status(500).json({ error: "Internal error", detail: err.message });
  }
});

export default router;
