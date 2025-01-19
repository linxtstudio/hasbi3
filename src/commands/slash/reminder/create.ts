import { format, parse } from "date-fns"
import { Colors } from "discord.js"

import { SlashCommand, SlashCommandConfig } from "@/types/command.type"
import { Config } from "@/lib/config"
import { supabaseClient } from "@/lib/supabase"

const config: SlashCommandConfig = {
  description: "Remind me about something",
  usage: "/reminder create <event> <time> [date] [mention]",
  options: [
    {
      name: "event",
      description: "Something to remind about",
      type: "STRING",
      required: true,
    },
    {
      name: "time",
      description: "Time to remind about (24 hour format)",
      type: "STRING",
      required: true,
    },
    {
      name: "date",
      description: "Date to remind about",
      type: "STRING",
      required: false,
    },
    {
      name: "mention",
      description: "User to mention when the reminder is sent",
      type: "MENTIONABLE",
      required: false,
    },
  ],
}

const command: SlashCommand = {
  execute: async (interaction) => {
    await interaction.deferReply({
      withResponse: true,
    })

    const event = interaction.options.get("event", true).value as string
    const time = interaction.options.get("time", true).value as string
    const mention =
      (interaction.options.get("mention")?.value as string) ??
      interaction.user.id

    const timeFormatRegex = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

    if (!timeFormatRegex.test(time)) {
      await interaction.editReply(
        "❌ The time format is invalid. Please use the `HH:mm` format."
      )
      return
    }

    const currentTime = new Date().toLocaleString("en-US", {
      timeZone: Config.TIMEZONE,
    })
    let date = interaction.options.get("date")?.value as string

    if (!date) {
      const [hours, minutes] = time.split(":").map(Number)
      const now = new Date(currentTime)
      const eventTime = new Date(currentTime)
      eventTime.setHours(hours, minutes, 0, 0)

      const timeDiffInMinutes =
        (eventTime.getTime() - now.getTime()) / (1000 * 60)

      if (timeDiffInMinutes < 0) {
        date = new Date(new Date(currentTime).getTime() + 24 * 60 * 60 * 1000)
          .toLocaleString("en-US", { timeZone: Config.TIMEZONE })
          .split(",")[0]
      } else {
        date = new Date(currentTime)
          .toLocaleString("en-US", { timeZone: Config.TIMEZONE })
          .split(",")[0]
      }
    }

    const remindAt = parse(`${date} ${time}`, "M/d/yyyy HH:mm", new Date())
    const data = {
      event,
      mention: mention,
      remind_at: remindAt.toISOString(),
      sent: true,
    }
    const { error } = await supabaseClient.from("reminders").insert([data])

    if (error) {
      await interaction.editReply(
        "❌ There was an error while creating the reminder."
      )
      return
    }

    const isRole = !!interaction.guild?.roles.cache.has(mention)
    await interaction.editReply({
      embeds: [
        {
          title: "🗓️ New Reminder",
          description: `<@${isRole ? "&" : ""}${mention}>, A new reminder for **${event}** has been created`,
          color: Colors.Green,
          fields: [],
          footer: {
            text: `${format(remindAt, "HH:mm, d MMMM yyyy")}`,
          },
        },
      ],
    })
  },
}

export default { command, config }
