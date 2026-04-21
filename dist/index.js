"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const session_manager_1 = require("./lib/session-manager");
const source_cache_1 = require("./lib/source-cache");
const analyze_video_1 = require("./tools/analyze-video");
const extract_frames_1 = require("./tools/extract-frames");
const get_video_info_1 = require("./tools/get-video-info");
const get_transcript_1 = require("./tools/get-transcript");
const transcribe_audio_1 = require("./tools/transcribe-audio");
const extract_frame_at_1 = require("./tools/extract-frame-at");
const create_frame_grid_1 = require("./tools/create-frame-grid");
const cleanup_1 = require("./tools/cleanup");
const server = new index_js_1.Server({ name: 'video-vision-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
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
let currentSessionDir = null;
async function getSession() {
    if (!currentSessionDir) {
        currentSessionDir = await (0, session_manager_1.createSessionDir)();
    }
    return currentSessionDir;
}
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const sessionDir = await getSession();
    try {
        switch (name) {
            case 'analyze_video': return { content: await (0, analyze_video_1.analyzeVideoTool)(args, sessionDir) };
            case 'extract_frames': return { content: await (0, extract_frames_1.extractFramesTool)(args, sessionDir) };
            case 'get_video_info': return { content: await (0, get_video_info_1.getVideoInfoTool)(args) };
            case 'get_transcript': return { content: await (0, get_transcript_1.getTranscriptTool)(args, sessionDir) };
            case 'transcribe_audio': return { content: await (0, transcribe_audio_1.transcribeAudioTool)(args, sessionDir) };
            case 'extract_frame_at': return { content: await (0, extract_frame_at_1.extractFrameAtTool)(args, sessionDir) };
            case 'create_frame_grid': return { content: await (0, create_frame_grid_1.createFrameGridTool)(args, sessionDir) };
            case 'cleanup': return { content: await (0, cleanup_1.cleanupTool)(args, sessionDir) };
            default: throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
});
process.on('SIGTERM', async () => {
    if (currentSessionDir)
        await (0, session_manager_1.cleanupSession)(currentSessionDir);
    process.exit(0);
});
process.on('SIGINT', async () => {
    if (currentSessionDir)
        await (0, session_manager_1.cleanupSession)(currentSessionDir);
    process.exit(0);
});
async function main() {
    process.stderr.write('[OA Maestro] Video Vision MCP is live. Ready to watch anything.\n');
    process.stderr.write('[OA Maestro] Built by OA Maestro — @OAMaestro on all socials.\n');
    await (0, session_manager_1.cleanupOldSessions)();
    await (0, source_cache_1.cleanupStaleCache)();
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
//# sourceMappingURL=index.js.map