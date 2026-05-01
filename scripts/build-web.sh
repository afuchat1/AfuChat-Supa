#!/bin/bash
set -e

# Typecheck Vercel Edge functions before building so TypeScript errors
# in api/ are caught here instead of failing silently after deployment.
echo "Typechecking api/ edge functions..."
npx tsc --project api/tsconfig.json --noEmit

export EXPO_PUBLIC_SUPABASE_URL="https://rhnsjqqtdzlkvqazfcbg.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY"
pnpm --filter @workspace/mobile exec expo export --platform web --output-dir dist

node scripts/inject-seo.cjs
