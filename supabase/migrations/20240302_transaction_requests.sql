-- Create transaction_requests table for ACoin payment requests via QR scan
CREATE TABLE IF NOT EXISTS public.transaction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'acoin' CHECK (currency IN ('acoin', 'nexa')),
  amount integer NOT NULL CHECK (amount > 0),
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create requests" ON public.transaction_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can view their own requests" ON public.transaction_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = owner_id);

CREATE POLICY "Owner can update request status" ON public.transaction_requests
  FOR UPDATE USING (auth.uid() = owner_id);
