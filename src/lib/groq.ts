import { env } from "@/env"
import Groq from "groq-sdk"
import type {
  ModelListResponse as GroqModelListResponse,
  Model,
} from "groq-sdk/resources/models.mjs"

import { Config } from "./config"

export interface ModelListResponse extends GroqModelListResponse {
  data: Array<
    Model & {
      context_window: number
    }
  >
}

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
})

export const getGroqModelList = async () => {
  const models = (await groq.models.list()) as unknown as ModelListResponse
  return models
}

export let GROQ_MODEL_LIST: Model["id"][] = []
export let GROQ_CURRENT_MODEL = Config.GROQ.DEFAULT_MODEL

export const setCurrentGroqModel = (model: Model["id"]) => {
  GROQ_CURRENT_MODEL = model
}

export const getGroqChatCompletion = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  return groq.chat.completions.create({
    messages: [
      {
        name: "instruction",
        role: "system",
        content: `${Config.GROQ.INSTRUCTION}. Model yang kamu gunakan saat ini adalah ${GROQ_CURRENT_MODEL}.`,
      },
      ...history,
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "createReminder",
          description:
            "Helps determine if the user wants assistance to create a reminder. If confirmed, the reminder creation process can be triggered.",
          parameters: {
            type: "object",
            properties: {
              confirm: {
                type: "boolean",
                description:
                  "True if the user wants help creating a reminder; otherwise, false.",
              },
              event: {
                type: "string",
                description: "What to remind about in short sentence",
              },
              date: {
                type: "string",
                description:
                  "What date to remind; Return in M/d/yyyy format. If not defined return current empty string",
              },
              time: {
                type: "string",
                description: "What time to remind; Return in HH:mm format",
              },
            },
            required: ["confirm"],
          },
        },
      },
    ],
    model: GROQ_CURRENT_MODEL,
    temperature: 1.2,
    top_p: 1,
    stop: null,
    stream: false,
  })
}
export const getGroqChatSummary = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  const historyJson = JSON.stringify(history)
  return groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `Please provide a concise summary of the following conversation between you (assistant) and user. History: ${historyJson}`,
      },
    ],
    model: GROQ_CURRENT_MODEL,
    temperature: 0.3,
    top_p: 1,
    stop: null,
    stream: false,
  })
}
