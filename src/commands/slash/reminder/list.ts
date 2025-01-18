import { format, parse } from "date-fns"
import { Colors, MessageFlags } from "discord.js"

import { SlashCommand, SlashCommandConfig } from "@/types/command"
import { Config } from "@/lib/config"

const config: SlashCommandConfig = {
  description: "Remind me about something",
  usage: "/reminder list",
}

const command: SlashCommand = {
  execute: async (interaction) => {
    await interaction.deferReply({
      withResponse: true,
    })
  },
}

export default { command, config }
