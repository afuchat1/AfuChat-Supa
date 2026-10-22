-- Keep image-index lookups in a POST body instead of URL-encoding long CDN URLs
-- into PostgREST's request path.
CREATE OR REPLACE FUNCTION public.find_unindexed_visual_image_urls(
  p_image_urls text[]
)
RETURNS TABLE (image_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT candidate.image_url
  FROM unnest(coalesce(p_image_urls, ARRAY[]::text[])) AS candidate(image_url)
  WHERE candidate.image_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.visual_image_index AS indexed
      WHERE indexed.image_url = candidate.image_url
    );
$$;

REVOKE ALL ON FUNCTION public.find_unindexed_visual_image_urls(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_unindexed_visual_image_urls(text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
