import { env } from "@/env"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import Groq from "groq-sdk"
import type { Model } from "groq-sdk/resources/models.mjs"

import { Database } from "@/types/supabase.type"
import { supabaseClient } from "@/lib/supabase"

import { Config } from "./config"

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
})

export const getGroqModelList = async () => {
  const models = await groq.models.list()
  return models
}

export let GROQ_MODEL_LIST: Model["id"][] = []
export let GROQ_CURRENT_MODEL = Config.GROQ.DEFAULT_MODEL

export const setCurrentGroqModel = (model: Model["id"]) => {
  GROQ_CURRENT_MODEL = model
}

export const getGroqChatSummary = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  const historyJson = JSON.stringify(history)
  return groq.chat.completions.create({
    model: GROQ_CURRENT_MODEL,
    stop: null,
    stream: false,
    messages: [
      {
        role: "system",
        content: `Please provide a concise summary of the following conversation between you (assistant) and users. History: ${historyJson}`,
      },
    ],
  })
}

export let cachedReminderList:
  | Database["public"]["Tables"]["reminders"]["Row"][]
  | undefined = []
export const addToCachedReminderList = (
  reminder: Database["public"]["Tables"]["reminders"]["Row"]
) => {
  cachedReminderList?.push(reminder)
}

export const removeFromCachedReminderList = (reminderId: string) => {
  cachedReminderList = cachedReminderList?.filter(
    (reminder) => reminder.id !== reminderId
  )
}

async function getReminderList() {
  if (cachedReminderList && cachedReminderList.length > 0) {
    return cachedReminderList
      .map(
        (reminder, idx) =>
          `${idx + 1}.
          ID: "${reminder.id}" (Do not mention this ID in the conversation),
          Event: ${reminder.event}, 
          Date & Time: ${format(
            reminder.remind_at.toLocaleString(),
            "HH:mm, d MMMM yyyy",
            {
              locale: id,
            }
          )}
          Mention: ${reminder.mention ? `<@${reminder.mention}>` : "N/A"},
          Channel: ${reminder.channel ? `<#${reminder.channel}>` : "N/A"}`
      )
      .join("\n")
  }

  const { data: reminders, error } = await supabaseClient
    .from("reminders")
    .select("*")

  if (error) {
    return "No active reminders."
  }
  cachedReminderList = reminders || []
  return await getReminderList()
}

export const getGroqChatCompletion = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  const reminderListText = await getReminderList()
  return groq.chat.completions.create({
    model: GROQ_CURRENT_MODEL,
    temperature: 0.3,
    stop: null,
    stream: false,
    messages: [
      {
        name: "instruction",
        role: "system",
        content: [
          Config.GROQ.INSTRUCTION,
          `Your current model is ${GROQ_CURRENT_MODEL}.`,
          `Today's date is ${new Date().toLocaleDateString()}.`,
          `This is the reminder list:`,
          `${reminderListText}`,
        ].join("\n"),
      },
      ...history,
    ],
    tool_choice: "auto",
    tools: [
      {
        type: "function",
        function: {
          name: "CREATE_REMINDER",
          description:
            "Call this function to create a reminder when required. Use it properly based on the conversation context to set up an event reminder. Return in JSON format with specified parameters.",
          parameters: {
            type: "object",
            properties: {
              event: {
                type: "string",
                description:
                  "A brief description of the event to remind about.",
              },
              time: {
                type: "string",
                description:
                  "The time for the reminder; Always return in HH:mm format.",
              },
              date: {
                type: "string",
                description:
                  "The date for the reminder; Always return in M/d/yyyy format.",
              },
              mention: {
                type: "string",
                description:
                  "User ID to mention; return only the numeric ID as string. Leave empty string if not defined.",
              },
              channel: {
                type: "string",
                description:
                  "Channel ID where the reminder will be sent; return only the numeric ID as string. Leave empty string if not defined.",
              },
            },
            required: ["event", "time"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "DELETE_REMINDER",
          description:
            "Call this function to delete a reminder when required. Use it properly based on the conversation context and the reminder list you have knowledge of to determine the correct reminder ID to delete. Figure out the appropriate ID from the conversation and reminder list. If struggling, list all the reminders with their IDs and ask the user to select the correct one. Return in JSON format with specified parameters.",
          parameters: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "The ID of the reminder to delete; deduce the correct ID from the conversation context and the reminder list. Return only the numeric ID as string.",
              },
            },
            required: ["id"],
          },
        },
      },
    ],
  })
}
