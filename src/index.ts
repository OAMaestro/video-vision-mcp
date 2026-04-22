import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createSessionDir, cleanupSession, cleanupOldSessions } from './lib/session-manager';
import { cleanupStaleCache } from './lib/source-cache';
import { analyzeVideoTool } from './tools/analyze-video';
import { extractFramesTool } from './tools/extract-frames';
import { getVideoInfoTool } from './tools/get-video-info';
import { getTranscriptTool } from './tools/get-transcript';
import { transcribeAudioTool } from './tools/transcribe-audio';
import { extractFrameAtTool } from './tools/extract-frame-at';
import { createFrameGridTool } from './tools/create-frame-grid';
import { cleanupTool } from './tools/cleanup';

const server = new Server(
  { name: 'video-vision-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'analyze_video',
      description: 'End-to-end video analysis: download, extract frames, transcribe audio, return visual grids and transcript to the AI. First use on a video without captions will download the Whisper speech model (~150MB, one-time, stored in ~/.oamaestro/models).',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Local file path or URL (YouTube, TikTok, etc.)' },
          query: { type: 'string', description: 'What to look for or analyze in the video' },
          mode: { type: 'string', enum: ['overview', 'detailed', 'full'], description: 'overview=14 evenly spaced frames (default), detailed=scene detection, full=scene detection + forced Whisper' },
          start_time: { type: 'string', description: 'Start time e.g. "00:02:30" or "150"' },
          end_time: { type: 'string', description: 'End time e.g. "00:05:00"' },
          scene_threshold: { type: 'number', description: 'Scene change sensitivity 0.1-0.9 (default 0.3)' },
          gap_fill_interval: { type: 'number', description: 'For detailed/full mode: extract a fill frame in any gap larger than this many seconds (default 2). Set to 0 to disable.' },
          max_frames: { type: 'number', description: 'Max frames to extract (default 80, hard cap 150)' },
          cookies: { type: 'string', description: 'Path to cookies.txt for auth-gated content' },
        },
        required: ['source', 'query'],
      },
    },
    {
      name: 'extract_frames',
      description: 'Extract video frames to disk with full mode control.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          mode: { type: 'string', enum: ['scene', 'interval', 'keyframe', 'targeted', 'overview'] },
          fps: { type: 'number' },
          scene_threshold: { type: 'number' },
          gap_fill_interval: { type: 'number' },
          timestamps: { type: 'array', items: { type: 'string' } },
          max_frames: { type: 'number' },
          output_dir: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          cookies: { type: 'string' },
        },
        required: ['source', 'mode'],
      },
    },
    {
      name: 'get_video_info',
      description: 'Get video metadata without downloading. Returns duration, resolution, fps, estimated download size.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          cookies: { type: 'string' },
        },
        required: ['source'],
      },
    },
    {
      name: 'get_transcript',
      description: 'Get existing captions/subtitles. Fast path — no audio transcription. Use transcribe_audio if no captions exist.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          language: { type: 'string', description: 'Language code e.g. "en"' },
          format: { type: 'string', enum: ['timestamped', 'plain', 'srt'] },
          cookies: { type: 'string' },
        },
        required: ['source', 'format'],
      },
    },
    {
      name: 'transcribe_audio',
      description: 'Generate a transcript from audio using local Whisper. Works on any video, no API key required. First run downloads the Whisper model (~150MB, one-time).',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          language: { type: 'string' },
          format: { type: 'string', enum: ['timestamped', 'plain', 'srt'] },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          cookies: { type: 'string' },
        },
        required: ['source'],
      },
    },
    {
      name: 'extract_frame_at',
      description: 'Extract a single frame at a specific timestamp. Returns the frame as an image for AI visual analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          timestamp: { type: 'string', description: 'e.g. "00:03:45" or "225"' },
          max_width: { type: 'number' },
          cookies: { type: 'string' },
        },
        required: ['source', 'timestamp'],
      },
    },
    {
      name: 'create_frame_grid',
      description: 'Compose existing frame images into a grid for AI analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          frame_paths: { type: 'array', items: { type: 'string' } },
          columns: { type: 'number' },
          cell_width: { type: 'number' },
          include_frame_labels: { type: 'boolean' },
        },
        required: ['frame_paths'],
      },
    },
    {
      name: 'cleanup',
      description: 'Delete temporary files from video analysis sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['job', 'session', 'all'] },
          job_id: { type: 'string' },
        },
        required: ['scope'],
      },
    },
  ],
}));

let currentSessionDir: string | null = null;

async function getSession(): Promise<string> {
  if (!currentSessionDir) {
    currentSessionDir = await createSessionDir();
  }
  return currentSessionDir;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const sessionDir = await getSession();

  try {
    switch (name) {
      case 'analyze_video': return { content: await analyzeVideoTool(args as any, sessionDir) };
      case 'extract_frames': return { content: await extractFramesTool(args as any, sessionDir) };
      case 'get_video_info': return { content: await getVideoInfoTool(args as any) };
      case 'get_transcript': return { content: await getTranscriptTool(args as any, sessionDir) };
      case 'transcribe_audio': return { content: await transcribeAudioTool(args as any, sessionDir) };
      case 'extract_frame_at': return { content: await extractFrameAtTool(args as any, sessionDir) };
      case 'create_frame_grid': return { content: await createFrameGridTool(args as any, sessionDir) };
      case 'cleanup': return { content: await cleanupTool(args as any, sessionDir) };
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
  }
});

process.on('SIGTERM', async () => {
  if (currentSessionDir) await cleanupSession(currentSessionDir);
  process.exit(0);
});
process.on('SIGINT', async () => {
  if (currentSessionDir) await cleanupSession(currentSessionDir);
  process.exit(0);
});

async function main() {
  process.stderr.write('[OA Maestro] Video Vision MCP is live. Ready to watch anything.\n');
  process.stderr.write('[OA Maestro] Built by OA Maestro — @OAMaestro on all socials.\n');
  await cleanupOldSessions();
  await cleanupStaleCache();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
