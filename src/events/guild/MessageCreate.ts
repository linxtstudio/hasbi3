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
  if (message.author.bot) return
  if (message.channelId !== env.HASBI3_CHANNEL_ID) return
  if (message.reference?.messageId) {
    const repliedMessage = await message.channel.messages.fetch(
      message.reference.messageId
    )
    if (!repliedMessage.author.bot) return
  }

  //   Fetch message history if it's empty
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

  const chatCompletion = await getGroqChatCompletion(
    messageHistory as Groq.Chat.Completions.ChatCompletionMessageParam[]
  )

  const chatResponse = chatCompletion.choices[0]?.message?.content
  if (chatResponse) {
    await message.reply(chatResponse)
    messageHistory.push({
      name: "Hasbi",
      content: chatResponse,
      role: "assistant",
    })
  }
}
