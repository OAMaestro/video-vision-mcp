import express from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createSessionDir, cleanupSession } from './lib/session-manager';
import { createVideoVisionServer } from './mcp-server';
import { analyzeVideoTool } from './tools/analyze-video';
import { extractFramesTool } from './tools/extract-frames';
import { getVideoInfoTool } from './tools/get-video-info';
import { getTranscriptTool } from './tools/get-transcript';
import { transcribeAudioTool } from './tools/transcribe-audio';
import { extractFrameAtTool } from './tools/extract-frame-at';
import { createFrameGridTool } from './tools/create-frame-grid';
import { cleanupTool } from './tools/cleanup';

const app = express();
app.use(express.json());

// --- MCP-over-HTTP (Streamable HTTP) ---

const mcpTransports = new Map<string, StreamableHTTPServerTransport>();

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    const transport = mcpTransports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Unknown session' });
      return;
    }
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // No session yet: initialize a fresh MCP connection + its session dir.
  try {
    const sessionDir = await createSessionDir();
    const server = createVideoVisionServer(async () => sessionDir);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    transport.onclose = () => {
      if (transport.sessionId) mcpTransports.delete(transport.sessionId);
      void cleanupSession(sessionDir);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId) mcpTransports.set(transport.sessionId, transport);
  } catch (err: any) {
    res.status(500).json({ error: `session init failed: ${err.message}` });
  }
});

// --- REST routes (unchanged) ---

app.post('/analyze', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await analyzeVideoTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/extract', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await extractFramesTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/info', async (req, res) => {
  try {
    const result = await getVideoInfoTool(req.body);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/transcript', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await getTranscriptTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/transcribe', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await transcribeAudioTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/frame', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await extractFrameAtTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/grid', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await createFrameGridTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/cleanup', async (req, res) => {
  try {
    const sessionDir = await createSessionDir();
    const result = await cleanupTool(req.body, sessionDir);
    res.json({ content: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const args = process.argv.slice(2);
const serverMode = args.includes('--server');
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : 3000;

if (serverMode) {
  const httpServer = app.listen(port, () =>
    console.error(`[video-vision-mcp] REST + MCP on port ${port} (MCP at /mcp)`)
  );
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;
  httpServer.keepAliveTimeout = 655_000;
}

export { app };
