
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config();

const { connectDB } = await import("./config/db.js");
const { default: app } = await import("./app.js");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}

await connectDB();

// Vercel uses the exported Express app
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;

  app.listen(port, () => {
    console.log(`LuxuryStay API listening on ${port}`);
  });
}

export default app;
