import { Router } from "express";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/config";

const router = Router();

router.post("/account-purge", async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/account-purge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
