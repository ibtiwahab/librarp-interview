import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-long-enough-000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-that-is-long-enough-00000",
      MONGODB_URI: "mongodb://127.0.0.1:27017/librarp-test",
      FRONTEND_URL: "http://localhost:3000",
    },
  },
});
