import { env } from "@/env"
import Groq from "groq-sdk"

import { Config } from "./config"

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
})

export const getGroqChatCompletion = async (
  history: Groq.Chat.Completions.ChatCompletionMessageParam[]
) => {
  return groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: Config.GROQ.INSTRUCTION,
      },
      ...history,
    ],
    model: "llama-3.3-70b-versatile",

    // Controls randomness: lowering results in less random completions.
    // As the temperature approaches zero, the model will become deterministic
    // and repetitive.
    temperature: 1.2,

    // The maximum number of tokens to generate. Requests can use up to
    // 2048 tokens shared between prompt and completion.
    max_completion_tokens: 1024,

    // Controls diversity via nucleus sampling: 0.5 means half of all
    // likelihood-weighted options are considered.
    top_p: 1,

    // A stop sequence is a predefined or user-specified text string that
    // signals an AI to stop generating content, ensuring its responses
    // remain focused and concise. Examples include punctuation marks and
    // markers like "[end]".
    stop: null,

    // If set, partial message deltas will be sent.
    stream: false,
  })
}
