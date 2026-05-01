import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function maybeSingle(query: any) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}
