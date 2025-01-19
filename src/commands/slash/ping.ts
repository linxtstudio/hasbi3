import { MessageFlags } from "discord.js"

import { SlashCommand, SlashCommandConfig } from "@/types/command.type"

const config: SlashCommandConfig = {
  description: "Show the latency of the bot",
  usage: "/ping",
  options: [
    {
      name: "emoji",
      description: "The emoji to use",
      type: "STRING",
      required: false,
    },
  ],
}

const command: SlashCommand = {
  execute: async (interaction) => {
    const ping = await interaction.reply({
      content: "Pinging...",
      flags: MessageFlags.Ephemeral,
    })

    const emoji = interaction.options.get("emoji")?.value ?? "🏓"

    await interaction.editReply(
      `Pong ${emoji}! Latency is ${ping.createdTimestamp - interaction.createdTimestamp}ms.`
    )
  },
}

export default { command, config }
