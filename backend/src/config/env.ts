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
  // Comma-separated list of allowed browser origins, e.g.
  // "http://localhost:8080,https://docs.example.com". Unset = allow any origin
  // (fine for local development, tighten before deploying).
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

const PLACEHOLDER_SECRETS = new Set([
  "dev_only_change_me",
  "change_this_in_production",
  "change_this_to_a_long_random_string_in_production",
]);

if (config.env === "production" && (PLACEHOLDER_SECRETS.has(config.jwtSecret) || config.jwtSecret.length < 32)) {
  console.warn(
    "[security] JWT_SECRET is a placeholder or shorter than 32 characters. " +
      "Anyone who knows it can forge login tokens — set a long random value before exposing this app."
  );
}
