import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { userId, userIds, title, body, data } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Body is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const targetIds: string[] = userIds || (userId ? [userId] : []);
    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'userId or userIds is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetIds.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Maximum 100 recipients per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetIds.includes(caller.id)) {
      const filtered = targetIds.filter(id => id !== caller.id);
      if (filtered.length === 0) {
        return new Response(
          JSON.stringify({ sent: 0, total: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: profiles, error: profileError } = await adminClient
      .from('profiles')
      .select('id, expo_push_token')
      .in('id', targetIds.filter(id => id !== caller.id))
      .not('expo_push_token', 'is', null);

    if (profileError) throw profileError;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: prefRows } = await adminClient
      .from('notification_preferences')
      .select('user_id, push_enabled')
      .in('user_id', profiles.map(p => p.id));

    const disabledUsers = new Set(
      (prefRows || []).filter(p => p.push_enabled === false).map(p => p.user_id)
    );

    const tokens = profiles
      .filter(p => !disabledUsers.has(p.id))
      .map(p => p.expo_push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages = tokens.map(token => ({
      to: token,
      title: title.substring(0, 100),
      body: body.substring(0, 200),
      data: data || {},
      sound: 'default' as const,
      badge: 1,
    }));

    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    let sent = 0;
    for (const chunk of chunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (response.ok) {
        const result = await response.json();
        const tickets = result.data || [];
        sent += tickets.filter((t: any) => t.status === 'ok').length;
      } else {
        console.error('Expo push error:', response.status, await response.text());
      }
    }

    return new Response(
      JSON.stringify({ sent, total: tokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending push notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
