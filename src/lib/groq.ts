import { env } from "@/env"
import { format } from "date-fns"
import { id } from "date-fns/locale"
import Groq from "groq-sdk"
import type { Model } from "groq-sdk/resources/models.mjs"

import { Database } from "@/types/supabase.type"
import { supabaseClient } from "@/lib/supabase"

import { Config } from "./config"
import { Logger } from "./logger"

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

function withTimeout<T>(promise: Promise<T>, ms: number, context: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${context} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]) as Promise<T>
}

export async function initGroq() {
  try {
    Logger.debug("Initializing Groq models...")
    const res = await withTimeout(getGroqModelList(), 10000, "getGroqModelList")
    const ids = (res as any).data?.map((m: any) => m.id) || []
    GROQ_MODEL_LIST = ids
    if (!ids.includes(GROQ_CURRENT_MODEL)) {
      const preferredFallbacks: string[] = [
        "llama-3.1-8b-instant",
        "llama-3.1-8b",
        ids[0],
      ].filter(Boolean) as string[]
      const chosen = preferredFallbacks.find((m) => ids.includes(m)) || ids[0]
      if (chosen) {
        GROQ_CURRENT_MODEL = chosen
        Logger.warn(
          `Configured model '${Config.GROQ.DEFAULT_MODEL}' not available. Falling back to '${chosen}'.`
        )
      } else {
        Logger.error("No Groq models available from API.")
      }
    } else {
      Logger.debug(`Using Groq model '${GROQ_CURRENT_MODEL}'.`)
    }
  } catch (err: any) {
    Logger.error(`Failed to initialize Groq models: ${err.message}`)
  }
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
let reminderCacheAt: number | null = null
const REMINDER_CACHE_TTL_MS = 30_000
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
  // Serve from cache if within TTL, even for empty arrays
  if (reminderCacheAt && Date.now() - reminderCacheAt < REMINDER_CACHE_TTL_MS) {
    if (cachedReminderList && cachedReminderList.length > 0) {
      return cachedReminderList
        .map((reminder, idx) => {
          const remindAtDate = new Date(reminder.remind_at)
          const formattedDate = isNaN(remindAtDate.getTime())
            ? reminder.remind_at
            : format(remindAtDate, "HH:mm, d MMMM yyyy", { locale: id })

          return `${idx + 1}.
          ID: "${reminder.id}" (Do not mention this ID in the conversation),
          Event: ${reminder.event}, 
          Date & Time: ${formattedDate}
          Mention: ${reminder.mention ? `<@${reminder.mention}>` : "N/A"},
          Channel: ${reminder.channel ? `<#${reminder.channel}>` : "N/A"}`
        })
        .join("\n")
    }
    return "No active reminders."
  }

  function isRateLimit(err: any) {
    const msg = (err?.message || "").toLowerCase()
    return (
      err?.code === "429" ||
      msg.includes("rate limit") ||
      msg.includes("too many") ||
      msg.includes("exceed")
    )
  }

  const t0 = Date.now()
  let lastError: any = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data: reminders, error } = await supabaseClient
      .from("reminders")
      .select("*")

    if (!error) {
      Logger.debug(
        `Supabase reminders fetch took ${Date.now() - t0}ms on attempt ${attempt}`
      )
      cachedReminderList = reminders || []
      reminderCacheAt = Date.now()
      if (cachedReminderList.length > 0) {
        return cachedReminderList
          .map((reminder, idx) => {
            const remindAtDate = new Date(reminder.remind_at)
            const formattedDate = isNaN(remindAtDate.getTime())
              ? reminder.remind_at
              : format(remindAtDate, "HH:mm, d MMMM yyyy", { locale: id })

            return `${idx + 1}.
          ID: "${reminder.id}" (Do not mention this ID in the conversation),
          Event: ${reminder.event}, 
          Date & Time: ${formattedDate}
          Mention: ${reminder.mention ? `<@${reminder.mention}>` : "N/A"},
          Channel: ${reminder.channel ? `<#${reminder.channel}>` : "N/A"}`
          })
          .join("\n")
      }
      return "No active reminders."
    }

    lastError = error
    if (!isRateLimit(error)) {
      Logger.error(`Supabase error fetching reminders: ${error.message}`)
      break
    }

    const waitMs = attempt === 1 ? 300 : attempt === 2 ? 700 : 1200
    Logger.warn(
      `Supabase rate limited when fetching reminders (attempt ${attempt}). Retrying in ${waitMs}ms...`
    )
    await new Promise((r) => setTimeout(r, waitMs))
  }

  if (cachedReminderList && cachedReminderList.length > 0) {
    Logger.warn(
      `Using cached reminders due to Supabase errors: ${lastError?.message}`
    )
    return cachedReminderList
      .map((reminder, idx) => {
        const remindAtDate = new Date(reminder.remind_at)
        const formattedDate = isNaN(remindAtDate.getTime())
          ? reminder.remind_at
          : format(remindAtDate, "HH:mm, d MMMM yyyy", { locale: id })

        return `${idx + 1}.
          ID: "${reminder.id}" (Do not mention this ID in the conversation),
          Event: ${reminder.event}, 
          Date & Time: ${formattedDate}
          Mention: ${reminder.mention ? `<@${reminder.mention}>` : "N/A"},
          Channel: ${reminder.channel ? `<#${reminder.channel}>` : "N/A"}`
      })
      .join("\n")
  }

  // Cache empty state to respect TTL
  reminderCacheAt = Date.now()
  return "No active reminders."
}

export const getGroqChatCompletion = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  Logger.debug(`Preparing Groq completion with model '${GROQ_CURRENT_MODEL}'`)
  const t0 = Date.now()
  const reminderListText = await getReminderList()
  Logger.debug(`Fetched reminder list in ${Date.now() - t0}ms`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 18000)
  try {
    const res = await groq.chat.completions.create({
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
    Logger.debug(`Groq API call took ${Date.now() - t0}ms`)
    return res
  } finally {
    clearTimeout(timeout)
  }
}
