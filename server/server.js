import "dotenv/config";
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const PORT = process.env.PORT || 5000;

// Password reset emails need all of these; warn loudly instead of failing silently later.
for (const name of ["CLIENT_ORIGIN", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
  if (!process.env[name]) console.warn(`WARNING: ${name} is not set, so password reset emails won't work.`);
}

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
