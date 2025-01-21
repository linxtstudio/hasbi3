import {
  ActionRowBuilder,
  Colors,
  ComponentType,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js"

import { SlashCommand, SlashCommandConfig } from "@/types/command.type"
import {
  getGroqModelList,
  GROQ_CURRENT_MODEL,
  GROQ_MODEL_LIST,
  setCurrentGroqModel,
} from "@/lib/groq"

const config: SlashCommandConfig = {
  description: "Set configuration for the chat model",
  usage: "/chat config",
  options: [],
}

const command: SlashCommand = {
  execute: async (interaction) => {
    const response = await interaction.deferReply({
      withResponse: true,
    })

    if (GROQ_MODEL_LIST.length === 0) {
      const modelList = await getGroqModelList()
      GROQ_MODEL_LIST.push(...modelList.data.map((model) => model.id))
    }

    const selectModelmenu = new StringSelectMenuBuilder()
      .setCustomId("chat_config_model")
      .setPlaceholder("Select chat model")
      .addOptions(
        GROQ_MODEL_LIST.map((model) =>
          new StringSelectMenuOptionBuilder().setLabel(model).setValue(model)
        )
      )

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectModelmenu
    )

    await interaction.editReply({
      content: "Change chat configuration:",
      embeds: [
        {
          title: "⚙️ Active Configuration",
          description: `Model: **${GROQ_CURRENT_MODEL}**`,
          color: Colors.Blue,
          fields: [],
        },
      ],
      components: [row],
    })

    const collector =
      response.resource!.message!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      })

    collector.on("collect", async (i) => {
      const selection = i.values[0]
      setCurrentGroqModel(selection)
      await i.reply({
        content: `Model has changed to **${selection}**`,
        flags: MessageFlags.Ephemeral,
      })
    })
  },
}

export default { command, config }
