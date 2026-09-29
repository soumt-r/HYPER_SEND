import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const queryClient = postgres(process.env.DATABASE_URL || "postgres://hyper_user:hyper_password@localhost:5432/hyper_send");

export const db = drizzle(queryClient, { schema });
