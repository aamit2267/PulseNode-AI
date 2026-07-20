import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://pulsenode:pulsenode_dev@localhost:5432/pulsenode_dev"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
});

export const config = envSchema.parse(process.env);
