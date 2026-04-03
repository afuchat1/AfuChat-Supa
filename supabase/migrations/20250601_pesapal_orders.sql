CREATE TABLE IF NOT EXISTS public.pesapal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_reference TEXT UNIQUE NOT NULL,
  tracking_id TEXT,
  acoin_amount INTEGER NOT NULL CHECK (acoin_amount > 0),
  amount_usd NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'invalid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pesapal_orders_user ON public.pesapal_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pesapal_orders_ref ON public.pesapal_orders(merchant_reference);
CREATE INDEX IF NOT EXISTS idx_pesapal_orders_tracking ON public.pesapal_orders(tracking_id);

ALTER TABLE public.pesapal_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pesapal orders"
  ON public.pesapal_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_pesapal_order_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pesapal_orders_updated
  BEFORE UPDATE ON public.pesapal_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_pesapal_order_updated();
