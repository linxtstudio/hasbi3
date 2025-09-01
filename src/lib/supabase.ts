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
  newReminder: Database["public"]["Tables"]["reminders"]["Insert"]
): Promise<CreateReminderResponse> {
  function isRateLimit(err: any) {
    const msg = (err?.message || "").toLowerCase()
    return (
      err?.code === "429" ||
      msg.includes("rate limit") ||
      msg.includes("too many") ||
      msg.includes("exceed")
    )
  }

  let response: Database["public"]["Tables"]["reminders"]["Row"] | null = null
  let supabaseError: PostgrestError | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabaseClient
      .from("reminders")
      .insert([newReminder])
      .select()
      .single()
    if (!error) {
      response = data
      break
    }
    supabaseError = error
    if (!isRateLimit(error)) break
    const waitMs = attempt === 1 ? 300 : attempt === 2 ? 700 : 1200
    await new Promise((r) => setTimeout(r, waitMs))
  }

  const isRole = !!guild?.roles.cache.has(newReminder.mention)

  if (supabaseError) {
    return {
      success: false,
      embeds: [],
      error: supabaseError,
    }
  }

  // Add to cached reminder list
  if (response) addToCachedReminderList(response)

  return {
    success: true,
    embeds: [
      {
        title: "🗓️ New Reminder",
        description: `<@${isRole ? "&" : ""}${newReminder.mention}>, A new reminder for **${newReminder.event}** has been created`,
        color: Colors.Green,
        fields: [],
        footer: {
          text: `${format(new Date(newReminder.remind_at), "HH:mm, d MMMM yyyy")}`,
        },
      },
    ],
    error: null,
  }
}

export async function deleteReminder(guild: Guild, reminderId: string) {
  function isRateLimit(err: any) {
    const msg = (err?.message || "").toLowerCase()
    return (
      err?.code === "429" ||
      msg.includes("rate limit") ||
      msg.includes("too many") ||
      msg.includes("exceed")
    )
  }

  let reminderData: { event: string } | null = null
  let supabaseFetchError: PostgrestError | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabaseClient
      .from("reminders")
      .select("event")
      .eq("id", reminderId)
      .single()
    if (!error) {
      reminderData = data
      break
    }
    supabaseFetchError = error
    if (!isRateLimit(error)) break
    const waitMs = attempt === 1 ? 300 : attempt === 2 ? 700 : 1200
    await new Promise((r) => setTimeout(r, waitMs))
  }

  if (supabaseFetchError) {
    return {
      success: false,
      embeds: [],
      error: supabaseFetchError,
    }
  }

  let supabaseError: PostgrestError | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabaseClient
      .from("reminders")
      .delete()
      .eq("id", reminderId)
    if (!error) break
    supabaseError = error
    if (!isRateLimit(error)) break
    const waitMs = attempt === 1 ? 300 : attempt === 2 ? 700 : 1200
    await new Promise((r) => setTimeout(r, waitMs))
  }

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
        description: `The reminder **${reminderData?.event ?? "(unknown)"}** has been deleted`,
        color: Colors.Red,
        fields: [],
        footer: {
          text: `Deleted at ${format(new Date(), "HH:mm, d MMMM yyyy")}`,
        },
      },
    ],
  }
}
