import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: parseInt(required("PORT", "4000"), 10),
  maxUploadSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? "15", 10),
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000",
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "doccompare",
    password: process.env.DB_PASSWORD ?? "",
    name: process.env.DB_NAME ?? "doccompare",
  },
  jwtSecret: process.env.JWT_SECRET ?? "dev_only_change_me",
};
