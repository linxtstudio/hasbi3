import { env } from "@/env"
import { format, parse } from "date-fns"
import { DiscordAPIError, Message, TextChannel } from "discord.js"
import Groq from "groq-sdk"

import { Config } from "@/lib/config"
import { getGroqChatCompletion, getGroqChatSummary } from "@/lib/groq"
import { Logger } from "@/lib/logger"
import { createReminder } from "@/lib/supabase"

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

  // Remove the bot mention from the message content
  const messageContent = message.content.replace(
    new RegExp(`<@!?${message.client.user!.id}>\\s*`),
    ""
  )

  if (messageContent.toLowerCase().includes(Config.GROQ.RESET_KEYWORD)) {
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
        content: messageContent,
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
      content: messageContent,
      role: "user",
    })
  }

  try {
    const channel = (await message.channel.fetch()) as TextChannel
    channel.sendTyping()

    const chatCompletion = await getGroqChatCompletion(
      messageHistory as Groq.Chat.Completions.ChatCompletionMessageParam[]
    )
    const chatResponse = chatCompletion.choices[0]?.message

    if (chatResponse) {
      // Handle tool calls
      if (chatResponse.tool_calls && chatResponse.tool_calls.length > 0) {
        for (const toolCall of chatResponse.tool_calls) {
          if (toolCall.function.name === "createReminder") {
            const args = JSON.parse(toolCall.function.arguments)
            Logger.debug("Tool Arguments")
            console.debug(args)
            if (args.confirm) {
              await channel.send(
                "💡 Sepertinya Anda ingin membuat pengingat. Saya akan membantu Anda dengan itu."
              )
              const date = args.date || format(new Date(), "M/d/yyyy")
              const time = args.time

              channel.sendTyping()
              const remindAt = parse(
                `${date} ${time} ${Config.TIMEZONE_OFFSET}`,
                "M/d/yyyy HH:mm xxx",
                new Date()
              )

              const response = await createReminder(channel.guild, {
                event: args.event,
                mention: message.author.id,
                channel: channel.id,
                remind_at: remindAt.toISOString(),
                sent: false,
              })

              await channel.send({
                embeds: response?.embeds,
              })
            }
          }
        }
      }

      // Handle basic chat response
      const responseContent = chatResponse.content
      if (responseContent) {
        for (let i = 0; i < responseContent.length; i += MAX_MESSAGE_LENGTH) {
          const chunk = responseContent.slice(i, i + MAX_MESSAGE_LENGTH)
          await channel.send(chunk)
        }
      }

      messageHistory.push({
        name: "Hasbi",
        content: chatResponse.content || "",
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
