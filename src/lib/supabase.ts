import { env } from "@/env"
import { createClient, PostgrestError } from "@supabase/supabase-js"
import { format } from "date-fns"
import { Colors, Guild } from "discord.js"

import { Database } from "@/types/supabase.type"
import {
  addToCachedReminderList,
  removeFromCachedReminderList,
} from "@/lib/groq"

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
  const { data: response, error: supabaseError } = await supabaseClient
    .from("reminders")
    .insert([data])
    .select()
    .single()

  const isRole = !!guild?.roles.cache.has(data.mention)

  if (supabaseError) {
    return {
      success: false,
      embeds: [],
      error: supabaseError,
    }
  }

  // Add to cached reminder list
  addToCachedReminderList(response)

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

export async function deleteReminder(guild: Guild, reminderId: string) {
  const { data: reminderData, error: supabaseFetchError } = await supabaseClient
    .from("reminders")
    .select("event")
    .eq("id", reminderId)
    .single()

  if (supabaseFetchError) {
    return {
      success: false,
      embeds: [],
      error: supabaseFetchError,
    }
  }

  const { error: supabaseError } = await supabaseClient
    .from("reminders")
    .delete()
    .eq("id", reminderId)

  if (supabaseError) {
    return {
      success: false,
      embeds: [],
      error: supabaseError,
    }
  }

  // Remove from cached reminder list
  removeFromCachedReminderList(reminderId)

  return {
    success: true,
    embeds: [
      {
        title: "🗓️ Reminder Deleted",
        description: `The reminder **${reminderData.event}** has been deleted`,
        color: Colors.Red,
        fields: [],
        footer: {
          text: `Deleted at ${format(new Date(), "HH:mm, d MMMM yyyy")}`,
        },
      },
    ],
  }
}
