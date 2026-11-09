import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSessionDir, cleanupSession, cleanupOldSessions } from './lib/session-manager';
import { cleanupStaleCache } from './lib/source-cache';
import { createVideoVisionServer } from './mcp-server';

let currentSessionDir: string | null = null;

async function getSession(): Promise<string> {
  if (!currentSessionDir) {
    currentSessionDir = await createSessionDir();
  }
  return currentSessionDir;
}

process.on('SIGTERM', async () => {
  if (currentSessionDir) await cleanupSession(currentSessionDir);
  process.exit(0);
});
process.on('SIGINT', async () => {
  if (currentSessionDir) await cleanupSession(currentSessionDir);
  process.exit(0);
});

async function main() {
  process.stderr.write('[OA Maestro] Video Vision MCP is live (stdio). Ready to watch anything.\n');
  await cleanupOldSessions();
  await cleanupStaleCache();
  const server = createVideoVisionServer(getSession);
  await server.connect(new StdioServerTransport());
}

main().catch(console.error);
