import { env } from "@/env"
import { Message } from "discord.js"
import Groq from "groq-sdk"

import { getGroqChatCompletion } from "@/lib/groq"

/**
 * Application command event
 */

type ChatCompletionMessage = {
  name: string
  content: string
  role: string
}

const messageHistory: ChatCompletionMessage[] = []

export default async (message: Message) => {
  // Return if the message is from a bot or not in the correct channel or not mentioning the bot
  if (message.author.bot) return
  if (message.channelId !== env.HASBI3_CHANNEL_ID) return
  if (
    !message.mentions.has(message.client.user!) &&
    !message.reference?.messageId
  )
    return

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
    messageHistory.push({
      name: message.author.username,
      content: message.content,
      role: "user",
    })
  }

  if (messageHistory.length > 20) {
    messageHistory.shift()
  }

  try {
    const chatCompletion = await getGroqChatCompletion(
      messageHistory as Groq.Chat.Completions.ChatCompletionMessageParam[]
    )

    const chatResponse = chatCompletion.choices[0]?.message?.content

    if (chatResponse && chatResponse.length > 2000) {
      const chunks = chatResponse.match(/.{1,2000}/g) || []
      for (const chunk of chunks) {
        await message.reply(chunk)
      }
      messageHistory.push({
        name: "Hasbi",
        content: chatResponse,
        role: "assistant",
      })
      return
    }
  } catch (error) {
    console.error(error)
  }
}
