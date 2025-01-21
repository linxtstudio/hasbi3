import { env } from "@/env"
import { checkReminders } from "@/services/reminder"
import { ActivityType } from "discord.js"

import { type DiscordClient } from "@/lib/client"
import { Logger } from "@/lib/logger"

export default async (client: DiscordClient) => {
  Logger.info(`Logged in as ${client.user?.tag}!`)

  if (env.NODE_ENV === "development") {
    client.user!.setActivity("⚠️ Development Mode", {
      type: ActivityType.Custom,
    })
  }

  await checkReminders(client)
}
