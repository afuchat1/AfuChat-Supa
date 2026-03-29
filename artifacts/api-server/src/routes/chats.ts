import { Router, type Request, type Response } from "express";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/config";

const router = Router();

router.post("/chats/create", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { contactId } = req.body;
    if (!contactId || typeof contactId !== "string") {
      res.status(400).json({ error: "contactId is required" });
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ contactId }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: "Internal error", detail: err.message });
  }
});

export default router;
