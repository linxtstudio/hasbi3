import { env } from "@/env"
import { DiscordAPIError, Message, TextChannel } from "discord.js"
import Groq from "groq-sdk"

import { Config } from "@/lib/config"
import { getGroqChatCompletion, getGroqChatSummary } from "@/lib/groq"

/**
 * Application command event
 */

type ChatCompletionMessage = {
  name: string
  content: string
  role: string
}

const messageHistory: ChatCompletionMessage[] = []
const MAX_MESSAGE_LENGTH = 2000

export default async (message: Message) => {
  // Return if the message is from a bot or not in the correct channel or not mentioning the bot
  if (message.author.bot) return
  if (message.channelId !== env.HASBI3_CHANNEL_ID) return
  if (
    !message.mentions.has(message.client.user!) &&
    !message.reference?.messageId
  )
    return

  if (message.content.toLowerCase().includes(Config.GROQ.RESET_KEYWORD)) {
    messageHistory.length = 0
    messageHistory.push({
      name: "Hasbi",
      content: "Saya tidak mengerti apa yang kamu maksud.",
      role: "assistant",
    })
    message.reply("Saya tidak mengerti apa yang kamu maksud.")
    return
  }

  // Fetch the last 20 messages if the message history is empty
  if (messageHistory.length === 0) {
    const response = await message.channel.messages.fetch({ limit: 20 })
    const mappedResponse = [...response.values()].reverse().map((message) => {
      return {
        name: message.author.bot ? "Hasbi" : message.author.username,
        content: message.content,
        role: message.author.bot ? "assistant" : "user",
      }
    })
    messageHistory.push(...mappedResponse)
  } else {
    if (messageHistory.length > 20) {
      const summary = await getGroqChatSummary(
        messageHistory as Groq.Chat.Completions.ChatCompletionMessageParam[]
      )
      messageHistory.length = 0
      messageHistory.push({
        name: "summary",
        content: summary.choices[0]?.message?.content as string,
        role: "system",
      })
    }
    messageHistory.push({
      name: message.author.username,
      content: message.content,
      role: "user",
    })
  }

  try {
    const channel = (await message.channel.fetch()) as TextChannel
    channel.sendTyping()

    const chatCompletion = await getGroqChatCompletion(
      messageHistory as Groq.Chat.Completions.ChatCompletionMessageParam[]
    )
    const chatResponse = chatCompletion.choices[0]?.message?.content

    if (chatResponse) {
      for (let i = 0; i < chatResponse.length; i += MAX_MESSAGE_LENGTH) {
        const chunk = chatResponse.slice(i, i + MAX_MESSAGE_LENGTH)
        await channel.send(chunk)
      }
      messageHistory.push({
        name: "Hasbi",
        content: chatResponse,
        role: "assistant",
      })
      return
    }
  } catch (error) {
    console.log(error)
    if (error instanceof DiscordAPIError) {
      message.reply(`❌ DiscordAPIError: ${error.message}`)
      return
    }
    message.reply(`❌ Error: ${error}`)
  }
}
