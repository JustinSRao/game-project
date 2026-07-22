import { NO_KEY_MESSAGE, resolveProvider } from "@howeverfar/director";
import { buildServer } from "./app.js";

const PORT = Number(process.env["PORT"] ?? 3001);

/**
 * Loopback by default. This process holds the API key and its routes will
 * happily spend it, so binding 0.0.0.0 would expose that to everyone on the
 * network. Set HOST explicitly (e.g. 0.0.0.0 in a container) to widen it.
 */
const HOST = process.env["HOST"] ?? "127.0.0.1";

async function main(): Promise<void> {
  const app = buildServer({ logger: true });

  const provider = resolveProvider();
  if (provider) {
    app.log.info(`Director provider: ${provider}`);
  } else {
    app.log.warn(
      `${NO_KEY_MESSAGE} The server will boot, but POST /api/sessions returns 503 until then.`,
    );
  }

  await app.listen({ port: PORT, host: HOST });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
