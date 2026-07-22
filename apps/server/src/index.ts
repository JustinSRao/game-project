import { buildServer } from "./app.js";

const PORT = Number(process.env["PORT"] ?? 3001);

async function main(): Promise<void> {
  const app = buildServer({ logger: true });

  if (!process.env["ANTHROPIC_API_KEY"]) {
    app.log.warn(
      "ANTHROPIC_API_KEY is not set — the server will boot, but POST /api/sessions " +
        "will return 503 until a key is configured.",
    );
  }

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
