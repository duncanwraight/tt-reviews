import { config } from "dotenv";

// Load environment variables from .dev.vars for testing
config({ path: ".dev.vars" });

// Global test setup
global.fetch = global.fetch || fetch;
