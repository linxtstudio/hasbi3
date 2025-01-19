import { env } from "@/env"
import { createClient } from "@supabase/supabase-js"

import { Database } from "@/types/supabase.type"

export const supabaseClient = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_KEY
)
