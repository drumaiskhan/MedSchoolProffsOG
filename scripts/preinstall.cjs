const fs = require("fs");

const filesToRemove = ["package-lock.json", "yarn.lock"];

for (const file of filesToRemove) {
  try {
    fs.rmSync(file, { force: true });
    console.log(`Removed ${file}`);
  } catch (error) {
    console.warn(`Could not remove ${file}:`, error.message);
  }
}

const userAgent = process.env.npm_config_user_agent || "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("");
  console.error("ERROR: This project must be installed with pnpm.");
  console.error("");
  console.error(`Detected package manager: ${userAgent || "unknown"}`);
  console.error("");
  process.exit(1);
}

console.log("pnpm detected. Installation can continue.");
