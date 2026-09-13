// Vercel serverless entrypoint: an Express app is a valid (req, res) => void
// handler, so we just re-export the configured app from the backend workspace.
import { app } from "../backend/src/app.js";

export default app;
