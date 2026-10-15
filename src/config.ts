export const config = {
  port: Number(process.env.PORT ?? 3500),
  dbPath: process.env.DB_PATH ?? "cabinet.sqlite",
  sharedDir: process.env.SHARED_DIR ?? null,
  controlDir: process.env.CONTROL_DIR ?? null,
  platform: {
    baseUrl: process.env.PLATFORM_BASE_URL,
    slug: process.env.PLATFORM_SLUG,
    apiKey: process.env.PLATFORM_API_KEY,
    playerSegment: process.env.PLATFORM_PLAYER_SEGMENT ?? "hidden_base",
    cohort: process.env.PLATFORM_COHORT,
    eventType: process.env.PLATFORM_EVENT_TYPE ?? "player.registered",
  },
  internal: {
    host: process.env.INTERNAL_HOST ?? "127.0.0.1",
    port: Number(process.env.INTERNAL_PORT ?? 3501),
  },
};
