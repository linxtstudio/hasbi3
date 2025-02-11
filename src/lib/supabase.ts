import { env } from "@/env"
import { createClient, PostgrestError } from "@supabase/supabase-js"
import { format } from "date-fns"
import { Colors, Guild } from "discord.js"

import { SlashCommandInteraction } from "@/types/command.type"
import { Database } from "@/types/supabase.type"

export const supabaseClient = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_KEY
)

type CreateReminderResponse = {
  success: boolean
  embeds:
    | {
        title: string
        description: string
        color: number
        fields: []
        footer: {
          text: string
        }
      }[]
    | []
  error: PostgrestError | null
}

export async function createReminder(
  guild: Guild,
  data: Database["public"]["Tables"]["reminders"]["Insert"]
): Promise<CreateReminderResponse> {
  const { error: supabaseError } = await supabaseClient
    .from("reminders")
    .insert([data])

  const isRole = !!guild?.roles.cache.has(data.mention)

  if (supabaseError) {
    return {
      success: false,
      embeds: [],
      error: supabaseError,
    }
  }

  return {
    success: true,
    embeds: [
      {
        title: "🗓️ New Reminder",
        description: `<@${isRole ? "&" : ""}${data.mention}>, A new reminder for **${data.event}** has been created`,
        color: Colors.Green,
        fields: [],
        footer: {
          text: `${format(data.remind_at, "HH:mm, d MMMM yyyy")}`,
        },
      },
    ],
    error: null,
  }
}
