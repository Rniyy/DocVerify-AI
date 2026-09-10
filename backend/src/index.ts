import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();

app.listen(config.port, () => {
  console.log(`AI Document Comparison Assistant backend listening on http://localhost:${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
});