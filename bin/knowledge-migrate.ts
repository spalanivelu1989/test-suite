import { migrate } from "../src/knowledge/store/migrate";
import { closeAllPools } from "../src/knowledge/store/db";

// Apply pending Knowledge-Layer migrations. Run with the DB url in env:
//   node --env-file=.env.local --import tsx bin/knowledge-migrate.ts
// or: KNOWLEDGE_DATABASE_URL=... npx tsx bin/knowledge-migrate.ts

async function main() {
  const url = process.env.KNOWLEDGE_DATABASE_URL;
  if (!url) {
    console.error("KNOWLEDGE_DATABASE_URL is not set — nothing to migrate.");
    process.exit(1);
  }
  const applied = await migrate(url);
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s): ${applied.join(", ")}`
      : "No pending migrations.",
  );
  await closeAllPools();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
