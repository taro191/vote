import { runMigrations } from "./migrations.js";

runMigrations().catch((e) => {
  console.error(e);
  process.exit(1);
});
