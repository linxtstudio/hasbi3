import { format } from "date-fns"
import { id } from "date-fns/locale"
import { Colors } from "discord.js"

import { SlashCommand, SlashCommandConfig } from "@/types/command.type"
import { supabaseClient } from "@/lib/supabase"

const config: SlashCommandConfig = {
  description: "See all current reminders",
  usage: "/reminder list",
  options: [],
}

const command: SlashCommand = {
  execute: async (interaction) => {
    await interaction.deferReply({
      withResponse: true,
    })

    const { data: reminders, error } = await supabaseClient
      .from("reminders")
      .select("*")

    if (error) {
      await interaction.editReply(
        "❌ An error occurred while fetching reminders."
      )
      return
    }

    const reminderList = reminders.map((reminder) => {
      return `- ${reminder.event} - ${format(
        reminder.remind_at.toLocaleString(),
        "HH:mm, d MMMM yyyy",
        {
          locale: id,
        }
      )}\n`
    })

    if (!reminderList.length) {
      await interaction.editReply("🙏 There are no active reminders.")
      return
    }

    await interaction.editReply({
      embeds: [
        {
          title: "⌛ Active Reminder",
          description: reminderList.join(""),
          color: Colors.Blue,
          fields: [],
        },
      ],
    })
  },
}

export default { command, config }
