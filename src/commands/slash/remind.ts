import { SlashCommand, SlashCommandConfig } from "@/types/command"
import { MessageFlags } from "discord.js"

const config: SlashCommandConfig = {
  description: "Remind me about something",
  usage: "/remind",
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
    await interaction.reply({
      content: "Creating reminder...",
    })

    const event = interaction.options.get("event", true).value as string
    const time = interaction.options.get("time", true).value as string

    const timeFormatRegex = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeFormatRegex.test(time)) {
      await interaction.editReply('❌ The time format is invalid. Please use the format HH:mm (24-hour).');
      return
    }

    const currentTime = new Date()
    let date = interaction.options.get("date")?.value as string

    if (!date) {
      const [hours, minutes] = time.split(":").map(Number);
      const eventTime = new Date(currentTime);
      eventTime.setHours(hours, minutes, 0, 0);
  
      // If the event time is in the past (before the current time), set it for tomorrow
      if (eventTime < currentTime) {
          date = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];  // Tomorrow
      } else {
          date = currentTime.toISOString().split("T")[0];  // Today
      }
  }

    await interaction.editReply(
      `A new reminder for: ${event} at ${time} on ${date} has been created.`
    )
  },
}

export default { command, config }
