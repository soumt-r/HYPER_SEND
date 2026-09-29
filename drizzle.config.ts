export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://hyper_user:hyper_password@localhost:5432/hyper_send",
  },
};
