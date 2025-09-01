import { env } from "@/env"
import { format, parse } from "date-fns"
import { DiscordAPIError, Message, MessageFlags, TextChannel } from "discord.js"
import Groq from "groq-sdk"

import { Database } from "@/types/supabase.type"
import { Config } from "@/lib/config"
import { getGroqChatCompletion, getGroqChatSummary } from "@/lib/groq"
import { Logger } from "@/lib/logger"
import { createReminder, deleteReminder } from "@/lib/supabase"

/**
 * Application command event
 */

const messageHistory: Groq.Chat.Completions.ChatCompletionMessageParam[] = []

const MAX_MESSAGE_LENGTH = 2000
const HISTORY_THRESHOLD = 20

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context: string
) {
  return (await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${context} timed out after ${ms}ms`)),
        ms
      )
    ),
  ])) as T
}

export default async (message: Message) => {
  // Return if the message is from a bot or not in the correct channel or not mention/replying the bot
  if (message.author.bot) return
  if (message.channelId !== env.HASBI3_CHANNEL_ID) return
  if (message.mentions.users.first()?.id !== message.client.user!.id) {
    return
  }

  // Remove the bot mention from the message content
  const messageContent = message.content.replace(
    new RegExp(`<@!?${message.client.user!.id}>\\s*`),
    ""
  )

  // Handle reset history by keyword
  if (messageContent.toLowerCase().includes(Config.GROQ.RESET_KEYWORD)) {
    const RESET_RESPONSE_MESSAGE = "Saya tidak mengerti apa yang kamu maksud."
    messageHistory.length = 0
    messageHistory.push({
      name: "Hasbi",
      content: RESET_RESPONSE_MESSAGE,
      role: "assistant",
    })
    message.reply(RESET_RESPONSE_MESSAGE)
    return
  }

  // Fetch the last 20 messages if the message history is empty, if more than threshold, summarize the history
  if (messageHistory.length === 0) {
    const fetchedMessages = await message.channel.messages.fetch({
      limit: HISTORY_THRESHOLD,
    })

    const historyMessages = [...fetchedMessages.values()]
      .reverse()
      .map((m) => ({
        name: m.author.bot ? "Hasbi" : m.author.username,
        content: m.content,
        role: m.author.bot ? "assistant" : "user",
      }))

    messageHistory.push(
      ...(historyMessages as Groq.Chat.Completions.ChatCompletionMessageParam[])
    )
  } else {
    if (messageHistory.length > HISTORY_THRESHOLD) {
      const summary = await withTimeout(
        getGroqChatSummary(messageHistory),
        15000,
        "getGroqChatSummary"
      )
      messageHistory.length = 0
      messageHistory.push({
        name: "summary",
        content: summary.choices[0]?.message?.content || "",
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
    const start = Date.now()
    const chatCompletion = await withTimeout(
      getGroqChatCompletion(messageHistory),
      20000,
      "getGroqChatCompletion"
    )
    Logger.debug(`Groq completion took ${Date.now() - start}ms`)
    const chatResponse = chatCompletion.choices[0]?.message

    if (chatResponse) {
      Logger.info(chatResponse)

      const isToolCall =
        chatResponse.tool_calls && chatResponse.tool_calls.length > 0

      if (isToolCall) {
        for (const toolCall of chatResponse.tool_calls!) {
          if (toolCall.function.name === "CREATE_REMINDER") {
            let args: any
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch (err: any) {
              await channel.send({
                content: `❌ Invalid tool args: ${err.message}`,
              })
              continue
            }
            const date = args.date || format(new Date(), "M/d/yyyy")
            const mention = args.mention || message.author.id
            const channelId = args.channel || message.channel.id

            if (args.event && args.time) {
              const remindAt = parse(
                `${date} ${args.time} ${Config.TIMEZONE_OFFSET}`,
                "M/d/yyyy HH:mm xxx",
                new Date()
              )

              if (isNaN(remindAt.getTime())) {
                await channel.send({
                  content: "❌ Invalid date/time for reminder.",
                })
                continue
              }

              channel.sendTyping()
              const response = await createReminder(channel.guild, {
                event: args.event,
                mention: mention,
                channel: channelId,
                remind_at: remindAt.toISOString(),
                sent: false,
              })

              if (response?.error) {
                await channel.send({
                  content: `❌ Error: ${response.error.message}`,
                })
                return
              }

              await channel.send({
                embeds: response?.embeds,
              })
            }
          }

          if (toolCall.function.name === "DELETE_REMINDER") {
            let args: any
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch (err: any) {
              await channel.send({
                content: `❌ Invalid tool args: ${err.message}`,
              })
              continue
            }
            const reminderId = args.id

            channel.sendTyping()
            const response = await deleteReminder(channel.guild, reminderId)

            if (response?.error) {
              await channel.send({
                content: `❌ Error: ${response.error.message}`,
              })
              return
            }

            await channel.send({
              embeds: response?.embeds,
            })
          }
        }
      }

      const responseContent = chatResponse.content

      if (responseContent) {
        for (let i = 0; i < responseContent.length; i += MAX_MESSAGE_LENGTH) {
          const chunk = responseContent.slice(i, i + MAX_MESSAGE_LENGTH)
          await channel.send(chunk)
        }
      }

      // Message history has been pushed in the tool call block
      if (isToolCall) return

      messageHistory.push({
        name: "Hasbi",
        content: chatResponse.content || "",
        role: "assistant",
      })
      return
    }

    await channel.send("❌ No response from model.")
  } catch (error: any) {
    Logger.error(error)
    if (error instanceof DiscordAPIError) {
      message.reply(`❌ DiscordAPIError: ${error.message}`)
      return
    }
    message.reply(`❌ Error: ${error?.error?.error?.message || error.message}`)
  }
}
