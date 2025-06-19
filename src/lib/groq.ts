import { env } from "@/env"
import Groq from "groq-sdk"
import type { Model } from "groq-sdk/resources/models.mjs"

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

export const getGroqChatCompletion = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  return groq.chat.completions.create({
    model: GROQ_CURRENT_MODEL,
    temperature: 0.3,
    stop: null,
    stream: false,
    messages: [
      {
        name: "instruction",
        role: "system",
        content: `${Config.GROQ.INSTRUCTION} Your current model is ${GROQ_CURRENT_MODEL}. Today's date is ${new Date().toLocaleDateString()}. `,
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
    ],
  })
}
