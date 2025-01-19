import {
  ChatInputCommandInteraction,
  type CacheType,
  type Interaction,
} from "discord.js"

import type {
  SlashCommand,
  SlashCommandInteraction,
} from "@/types/command.type"
import { type DiscordClient } from "@/lib/client"
import { Logger } from "@/lib/logger"

/**
 * Application command event
 */
export default async (interaction: ChatInputCommandInteraction<CacheType>) => {
  if (!interaction.isCommand()) return

  const { commandName } = interaction

  try {
    const subCommand = interaction.options.getSubcommand()
    if (subCommand) {
      await executeSlashCommand(`${commandName}/${subCommand}`, interaction)
      return
    }
  } catch (_error) {
    Logger.info(`Slash command "${commandName}" has no subcommand`)
  }

  await executeSlashCommand(commandName, interaction)
}

/**
 * Execute a slash command
 * @param commandName  The name of the command
 * @param interaction  The interaction object
 */
async function executeSlashCommand(
  commandName: string,
  interaction: SlashCommandInteraction
) {
  try {
    const client = interaction.client as DiscordClient
    const commandConfig = client.slashConfigs.find(
      (command) => command.name === commandName
    )

    if (!commandConfig) {
      Logger.warn(`Slash command "${commandName}" not found in config`)
      await interaction.reply({
        content: "This command is not available!",
        ephemeral: true,
      })
      return
    }

    const rawModule = await import(
      `../../commands/slash/${commandConfig.fileName}`
    )
    const { command }: { command: SlashCommand } = (
      rawModule.default?.default ? rawModule.default : rawModule
    ).default

    await command.execute(interaction)
  } catch (error) {
    Logger.error(`Error executing slash command "${commandName}": \n\t${error}`)
  }
}
