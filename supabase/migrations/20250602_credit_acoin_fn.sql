CREATE OR REPLACE FUNCTION public.credit_acoin(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET acoin = COALESCE(acoin, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_acoin(UUID, INTEGER) TO service_role;
