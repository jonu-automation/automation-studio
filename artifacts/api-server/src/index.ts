import app from "./app";
import { logger } from "./lib/logger";
import { initScheduler, startApprovalExpiryJob } from "./lib/scheduler";
import { localMode } from "./lib/runtime";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

await initScheduler();
startApprovalExpiryJob();

app.listen(port, localMode ? "127.0.0.1" : "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
