import express from 'express';
import { createSessionDir } from './lib/session-manager';
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
  app.listen(port, () => console.error(`[video-vision-mcp] REST server on port ${port}`));
}

export { app };
