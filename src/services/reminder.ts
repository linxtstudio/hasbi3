import { env } from "@/env"
import { TextChannel } from "discord.js"

import { Database } from "@/types/supabase.type"
import { DiscordClient } from "@/lib/client"
import { removeFromCachedReminderList } from "@/lib/groq"
import { Logger } from "@/lib/logger"
import { supabaseClient } from "@/lib/supabase"

type Reminder = Database["public"]["Tables"]["reminders"]["Row"]

export async function checkReminders(client: DiscordClient) {
  supabaseClient
    .channel("reminder_sent_true")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "reminders",
        filter: "sent=eq.true",
      },
      async (payload) => {
        Logger.debug("Reminder received!")
        console.debug(payload)

        const reminder = payload.new as Reminder
        try {
          let channel: TextChannel | null = null
          try {
            const channelId = reminder.channel ?? env.HASBI3_CHANNEL_ID
            channel = (await client.channels.fetch(channelId)) as TextChannel
          } catch (error) {
            Logger.debug(
              `Channel ${reminder.channel} not found, using default channel`
            )
            channel = (await client.channels.fetch(
              env.HASBI3_CHANNEL_ID
            )) as TextChannel
          }

          if (!channel?.isTextBased()) return

          const isRole = channel.guild.roles.cache.has(reminder.mention)
          await channel.send({
            content: `<@${isRole ? "&" : ""}${reminder.mention}>, here's your reminder for **${reminder.event}**`,
          })

          const { error } = await supabaseClient
            .from("reminders")
            .delete()
            .eq("id", reminder.id)

          // Remove from cached reminder list
          removeFromCachedReminderList(reminder.id)

          if (error) {
            Logger.error(error)
          }
        } catch (error) {
          console.error(`Error processing reminder ${reminder.id}:`, error)
        }
      }
    )
    .subscribe()
}
