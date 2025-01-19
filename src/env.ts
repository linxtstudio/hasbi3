import dotenv from "dotenv"
import { z } from "zod"

import { Logger } from "./lib/logger"

dotenv.config()

const envSchema = z.object({
  DISCORD_TOKEN: z.string(),
  DISCORD_APP_ID: z.string(),
  GROQ_API_KEY: z.string(),
  SUPABASE_URL: z.string(),
  SUPABASE_KEY: z.string(),
  GUILD_ID: z.string(),
  HASBI3_CHANNEL_ID: z.string(),
  DEBUG: z.preprocess(
    (val) => (val === undefined ? undefined : String(val)),
    z.string().transform((val) => {
      const lower = val.toLowerCase()
      if (lower === "true" || lower === "1") return true
      return false
    })
  ),
  NODE_ENV: z.string(),
})

function parseEnv<T>(schema: z.ZodSchema<T>) {
  try {
    return schema.parse(process.env)
  } catch (err) {
    if (!(err instanceof z.ZodError)) {
      Logger.error(err)
      process.exit(1)
    }

    console.error("Invalid environment variables:", err.flatten().fieldErrors)
    process.exit(1)
  }
}

export const env = parseEnv(envSchema)
