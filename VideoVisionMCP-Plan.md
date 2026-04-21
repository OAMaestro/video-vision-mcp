# OA Maestro — Video Vision MCP
## Complete Specification & Implementation Document
### Version 3.0 — Single-Session Build Ready

---

## Project Identity

**Repo:** `github.com/OAMaestro/video-vision-mcp`
**Package:** `@oamaestro/video-vision-mcp`
**Author:** OA Maestro — `realoamaestro@gmail.com`
**License:** MIT
**Tagline:** Give your AI the ability to actually watch videos — and hear them too.

---

## The One-Paragraph Pitch

Your AI can read text. It can see images. But until now, it couldn't watch a video. Video Vision MCP extracts frames AND transcribes audio from any video — local files, YouTube, TikTok, Instagram Reels, and 1000+ other platforms — and hands them directly to your AI to analyze using its own built-in vision and comprehension. No Gemini API key. No OpenAI Vision API. No Ollama. No extra subscriptions. No powerful hardware required. Works with Claude Code, Cursor, Cline, Windsurf, Continue, and any MCP-compatible tool.

---

## Why This Doesn't Exist Yet (Researched Gap)

Four repos exist. None solved it:

| Repo | Problem |
|------|---------|
| `tan-yong-sheng/ai-vision-mcp` | Requires Google Gemini API key — just a Gemini wrapper |
| `minbang930/Youtube-Vision-MCP` | YouTube only + requires Gemini API key |
| `michaelbaker-dev/mcpVideoParser` | Requires Ollama + Llava running locally — heavy hardware dependency |
| `GleidsonFerSanP/video-reader-mcp` | VS Code + GitHub Copilot only — 66 total installs, not universal |

**The real gap:** None of them use the calling LLM's own built-in vision. Every major LLM today (Claude, GPT-4o, Gemini, Llama-Vision) can already analyze images natively. They just need a tool to extract frames. And none of them offer local speech-to-text for videos without captions. That is the entire product — we are the bridge, not another AI model.

---

## Compatibility — Who Can Use This

**MCP is an open standard, not Anthropic-only.** MCP-compatible tools:
- Claude Code
- Cursor
- Windsurf
- Cline (VS Code)
- Continue.dev
- Zed Editor
- Goose (Block)
- Any tool implementing the open MCP spec

**Mainstream chat UIs (ChatGPT web, Gemini web, Claude.ai web):**
These don't support MCP natively. This is a v2 Chrome extension problem. State this clearly in the README. v1 is MCP + CLI.

**Three interfaces from one codebase:**
1. **MCP server** — primary, for all MCP-compatible tools
2. **CLI** — `npx @oamaestro/video-vision-mcp analyze ...` — any terminal, any AI
3. **REST API** — `--server --port 3000` — HTTP integrations, future Chrome extension

---

## CRITICAL ARCHITECTURE DECISION — How Images Are Returned to the LLM

> **This is the most important decision in the whole codebase. Get it wrong and the tool doesn't work.**

In MCP, tools return `content` blocks. There are two types:
- `TextContent`: `{ type: "text", text: string }`
- `ImageContent`: `{ type: "image", data: string, mimeType: "image/jpeg" }` where `data` is base64-encoded

**File paths DO NOT work.** If a tool returns `"path": "/tmp/frame.jpg"`, the LLM sees a text string — it cannot see the image. The LLM only sees images when they are returned as `ImageContent` blocks with base64 data embedded directly in the tool response.

**Rule for this project:**

| Tool | Return format | Why |
|------|--------------|-----|
| `analyze_video` | ImageContent (base64 grid images) + TextContent (metadata, transcript) | LLM must see frames immediately |
| `extract_frame_at` | ImageContent (base64 single frame) + TextContent (timestamp) | LLM must see frame |
| `create_frame_grid` | ImageContent (base64 grid) + TextContent (metadata) | LLM must see grid |
| `extract_frames` | TextContent only (file paths array) | User wants frames on disk |
| `get_video_info` | TextContent only (metadata JSON) | No visual content |
| `get_transcript` | TextContent only (transcript text) | No visual content |
| `transcribe_audio` | TextContent only (transcript text) | No visual content |
| `cleanup` | TextContent only (confirmation) | No visual content |

**Implementation pattern for image-returning tools:**

```typescript
// In any tool that returns images:
const imageBuffer = await fs.readFile(gridImagePath);
const base64 = imageBuffer.toString('base64');

return {
  content: [
    {
      type: "image",
      data: base64,
      mimeType: "image/jpeg"
    },
    {
      type: "text",
      text: `Analyzed ${framesExtracted} frames from "${title}". Duration: ${duration}. Grid covers ${startTime} — ${endTime}.`
    }
  ]
};
```

For multiple grids (long videos), return multiple ImageContent blocks in sequence, each followed by a TextContent describing its time range.

---

## Hardware-Aware Design (Run on Any Laptop)

> **The user base includes people on 5-year-old MacBooks with 50GB free disk. Design for them, not for a server.**

### The Real Resource Costs

**CPU:** ffmpeg scene detection reads the full video stream internally (even if it saves few frames). It is single-threaded but not intensive on modern CPUs — a 30-min video takes 10-30 seconds on a typical laptop. Acceptable.

**RAM:** ffmpeg streams, it does not load the full video into memory. Sharp streams too. Peak RAM usage is well under 200MB for any video. Not a concern with our approach.

**Disk — the real constraint.** Here is the actual math with our optimizations:

| Video length | yt-dlp download (720p max) | Frames (scene detect, 768px) | Audio WAV (16kHz mono) | Total temp |
|---|---|---|---|---|
| 5 min tutorial | ~30MB | ~1.5MB (20 frames) | ~10MB | ~42MB |
| 30 min tutorial | ~180MB | ~4MB (50 frames) | ~57MB | ~241MB |
| 1 hour deep-dive | ~360MB | ~7MB (80 frames) | ~115MB | ~482MB |
| 2 hour course | ~720MB | ~12MB (120 frames) | ~230MB | ~962MB |

**The audio WAV is only created if `transcribe_audio` is called.** The video download is the dominant cost. Frames and audio WAV are small by comparison.

**Safety rules enforced by the tool:**
1. Check available disk space before any operation
2. Refuse to start if less than 500MB free (with clear message)
3. Refuse to download videos estimated over 2GB (configurable, default 2GB)
4. Hard cap: never extract more than 150 frames per call (default cap: 80)
5. Download at max 720p — never 1080p or 4K
6. Audio WAV is always extracted to the same job directory and cleaned up with it

### Pre-Flight Estimation (Before Any Download Starts)

Before downloading any remote video, the tool MUST:
1. Run `yt-dlp --dump-json [URL]` to get video metadata (fast, no download)
2. Estimate download size: `duration_seconds × ~100KB/s` (conservative 720p estimate)
3. Check `df` (Mac/Linux) or `wmic logicaldisk` (Windows) for free disk space
4. If estimated download > 50% of free space: show warning + ask to continue
5. If estimated download > 80% of free space: refuse with helpful message

**Warning message:**
```
This video is 47 minutes long. Estimated download: ~280MB.
You have ~340MB free on disk.
Recommended: use start_time and end_time to analyze a specific section,
or free up disk space first.
To analyze minutes 5-15 only: add start_time: "00:05:00", end_time: "00:15:00"
```

For local files: check file size, estimate temp frame space, check disk. Local file is not copied — only small frames extracted.

---

## Video Sources Supported

### Local Files
Any format ffmpeg handles: `.mp4` `.mov` `.avi` `.mkv` `.webm` `.m4v` `.flv` `.wmv` `.ts` `.mts`

### Remote URLs via yt-dlp (1000+ sites)
Key platforms to highlight in README:
- YouTube, TikTok, Instagram Reels, Twitter/X, Facebook, Vimeo, Reddit, Dailymotion, Twitch clips, LinkedIn videos

**ALWAYS download at max 720p:**
```bash
yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4 [URL]
```
720p is more than sufficient for frame analysis. This reduces download size by 60-80% vs 4K.

**Cookie support for authenticated content:**
TikTok and Instagram increasingly gate content behind login. Accept optional `cookies` parameter pointing to a `cookies.txt` file (Netscape format, exportable via browser extensions like "Get cookies.txt"). Pass to yt-dlp via `--cookies [path]`. Never require, always support.

**yt-dlp auto-update:**
yt-dlp breaks when platforms update. Must auto-check for updates before each download:
- Store binary at `~/.oamaestro/bin/yt-dlp[.exe]`
- Cache version check at `~/.oamaestro/ytdlp-version.json` with timestamp
- If cache older than 24h: check GitHub releases API for latest version
- If newer available: download and replace silently
- Always update the cache timestamp after check

---

## Session-Based Temp File Lifecycle

> **This is the second most critical design decision. The user needs to be able to re-examine frames from earlier in the conversation without re-downloading the video.**

### Why "Delete After Use" Is Wrong

If the user says "go back and check what's happening at 3:42", the tool needs to either:
- Re-examine the downloaded video already in temp (fast, free) — ✅ correct
- Re-download the video — slow, wasteful, annoying — ❌ wrong

### The Session Model

```
~/.oamaestro/
├── bin/
│   └── yt-dlp[.exe]                    # Persistent — the auto-managed binary
├── models/
│   └── Xenova/
│       └── whisper-base/               # Whisper model cache (one-time ~145MB download)
├── ytdlp-version.json                  # { version, checked_at }
└── sessions/
    └── [session-uuid]/                 # Created when MCP server starts
        ├── session.json                # { started_at, last_active_at }
        └── jobs/
            └── [job-uuid]/             # Created per analyze/extract call
                ├── manifest.json       # { source, type, url_or_path, created_at }
                ├── source.mp4          # Downloaded video (remote sources only)
                ├── audio.wav           # Extracted audio (only if transcribe_audio called)
                └── frames/
                    ├── frame_001_00-00-05.jpg
                    ├── frame_002_00-00-47.jpg
                    └── grid_01.jpg
```

### Lifecycle Rules

| Event | Action |
|-------|--------|
| MCP server starts | Create new session directory, write `session.json` |
| Tool call made | Create new job directory, store source video + frames |
| Tool response returned | Keep all files (session is active, user may follow up) |
| MCP server stops cleanly (SIGTERM/SIGINT) | Delete own session directory |
| MCP server starts and finds old sessions | Delete any session directories older than 4 hours |
| `cleanup` tool called | Delete specified job, or all jobs in current session |
| Total `~/.oamaestro/sessions/` > 2GB | Log warning to stderr, suggest running cleanup |

**The user's re-examination scenario:**
1. User: "Analyze this YouTube tutorial" → tool downloads video, extracts frames, returns base64 grids
2. User: "Go back and look at the part around 8:30" → tool calls `extract_frame_at` on the already-downloaded `source.mp4` in the session temp — instant, no re-download
3. User: "What are they saying in that section?" → tool calls `transcribe_audio` on same `source.mp4`, extracts audio, runs Whisper — no re-download

This works because the session directory outlives any individual tool call.

---

## The ffmpeg Pipeline — Single Pass, No Intermediates

> **Do not extract full-resolution frames and then resize. Do everything in one ffmpeg command.**

### How to Get the ffmpeg and ffprobe Binary Paths

```typescript
// At the top of src/lib/ffmpeg.ts:
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const FFMPEG_PATH = ffmpegInstaller.path;    // e.g. /node_modules/@ffmpeg-installer/ffmpeg/bin/...
const FFPROBE_PATH = ffprobeInstaller.path;  // e.g. /node_modules/@ffprobe-installer/ffprobe/bin/...

// All spawned processes MUST use these explicit paths, never rely on system PATH.
```

### Getting Local File Info (ffprobe)

```bash
[FFPROBE_PATH] -v quiet -print_format json -show_format -show_streams [input_path]
```

Parse the JSON output: `streams[0].r_frame_rate` for fps, `format.duration` for duration, `streams[0].width` and `.height` for resolution, `format.format_name` for format, `streams` array for subtitle tracks.

### Scene Detection + Resize + Timestamp in One Pass

```bash
[FFMPEG_PATH] \
  -ss [start_time] \
  -to [end_time] \
  -i [input] \
  -vf "select='gt(scene,[threshold])',scale=768:-2,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4" \
  -vsync vfr \
  -q:v 3 \
  [output_dir]/frame_%04d.jpg
```

Breaking this down:
- `-ss` / `-to`: time range (optional — skip for full video)
- `scale=768:-2`: resize to 768px wide, height auto-calculated maintaining aspect ratio (`-2` ensures divisibility by 2)
- `select='gt(scene,[threshold])'`: only save frame if scene changed by > threshold (0.0-1.0)
- `drawtext`: burn timestamp into frame. Note: double-escape the colon: `%{pts\\:hms}`
- `-vsync vfr`: variable frame rate — only outputs selected frames
- `-q:v 3`: JPEG quality (1=best, 31=worst; 3 = high quality, small file ~50-100KB per frame)

**This means ffmpeg never writes a full-resolution intermediate file. 768px small files from the start.**

### Overview Mode (Evenly Spaced Frames)

Overview mode extracts 14 frames evenly spaced across the video. The formula requires knowing duration first (from ffprobe/yt-dlp metadata), then calculating the interval.

```typescript
// In code, before calling ffmpeg:
const TARGET_FRAMES = 14;
const interval = Math.max(1, Math.floor(durationSeconds / TARGET_FRAMES)); // seconds between frames
const fpsFilter = `1/${interval}`; // e.g. "1/120" for a 30-min video = one frame every 2 minutes
```

```bash
[FFMPEG_PATH] -i [input] \
  -vf "fps=[fpsFilter],scale=768:-2,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4" \
  -frames:v 14 -q:v 3 [output_dir]/frame_%04d.jpg
```

`fps=1/120` means "output one frame per 120 seconds." `-frames:v 14` caps it at 14 even if rounding produces one extra. No scene threshold needed — this is purely time-based.

### Interval Mode (Fixed FPS)

```bash
[FFMPEG_PATH] -ss [start] -to [end] -i [input] \
  -vf "fps=[fps],scale=768:-2,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4" \
  -q:v 3 [output_dir]/frame_%04d.jpg
```

### Keyframe Mode

```bash
[FFMPEG_PATH] -ss [start] -to [end] -i [input] \
  -vf "select='eq(pict_type\\,I)',scale=768:-2,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4" \
  -vsync vfr -q:v 3 [output_dir]/frame_%04d.jpg
```

### Targeted Mode (Specific Timestamps)

For each timestamp, seek directly to it:
```bash
[FFMPEG_PATH] -ss [timestamp] -i [input] -vframes 1 \
  -vf "scale=768:-2,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4" \
  -q:v 3 [output_path].jpg
```
Seeking with `-ss` before `-i` is fast (keyframe seek). Then extract exactly 1 frame.

### Audio Extraction for Transcription

```bash
[FFMPEG_PATH] -i [input_path] \
  -ar 16000 \
  -ac 1 \
  -c:a pcm_s16le \
  -y \
  [output_dir]/audio.wav
```

- `-ar 16000`: 16kHz sample rate (required by Whisper)
- `-ac 1`: mono (required by Whisper)
- `-c:a pcm_s16le`: PCM 16-bit little-endian WAV format
- `-y`: overwrite if exists

For a 30-min video, this produces a ~57MB WAV file. This is stored in the job directory and cleaned up with it.

### Scene Threshold Guide

| Value | Use case | Typical frame count (30 min video) |
|-------|----------|-----------------------------------|
| 0.1 | Fast action, gaming, screen recordings with frequent changes | 200-400 |
| 0.2 | Screen recordings, workflow demos, UI walkthroughs | 80-150 |
| 0.3 | Default — tutorials, presentations, product demos | 40-80 |
| 0.4 | Long interviews, slow-paced content | 20-50 |
| 0.5 | Movies, single-shot content | 10-30 |

**Hard cap enforcement:**
After scene detection, if `frames_extracted > max_frames` (default 80, absolute max 150):
1. Log a warning to stderr
2. Increase threshold by 0.05 and re-run
3. Repeat until under cap
4. Inform LLM: "Scene threshold was auto-adjusted to 0.4 to stay within the 80-frame limit. Use start_time/end_time to analyze a specific section for more detail."

---

## Frame Grid Composition

After extraction, frames are compiled into grid images before being returned as base64 to the LLM. This is the token-efficiency mechanism.

### Grid Logic

- < 5 frames: return individual images (no grid needed)
- 5-48 frames: 4-column grid, auto rows
- > 48 frames: multiple grids, each covering a section of the timeline

### Grid Composition with Sharp

```typescript
// Each cell: 480px wide (4 cells = 1920px total grid width)
// Sharp composites them efficiently without loading all into memory

const CELL_WIDTH = 480;
const COLUMNS = 4;
const cellHeight = Math.round(CELL_WIDTH / aspectRatio);

// Add frame number label to each cell (top-left corner, white on dark)
// The timestamp is already burned into the frame by ffmpeg
// The label is the frame index (e.g. "14/47") for navigation reference
```

Grid images are saved to the job directory, then read and base64-encoded for the MCP response, then kept in temp for potential follow-up use.

---

## Audio Transcription — Local Whisper via @huggingface/transformers

> **This gives the tool full coverage: visual analysis for anything with frames, audio transcription for anything with speech, even when no captions exist.**

### How It Works

`@huggingface/transformers` v3 ships a WebAssembly/ONNX port of OpenAI Whisper that runs directly in Node.js. No Python. No binary to install. No API key. The model (~145MB) downloads once to `~/.oamaestro/models/` on first use, then is cached permanently. All subsequent transcriptions use the cached model.

### First-Run Message

When `transcribe_audio` is called for the first time (model not yet cached), the tool MUST inform the user before waiting:

```
Transcribing audio with local Whisper model.
First run: downloading model to ~/.oamaestro/models/ (~145MB one-time download).
This may take 1-2 minutes. Subsequent transcriptions start immediately.
```

### Model Configuration

```typescript
// src/lib/transcriber.ts
import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { homedir } from 'os';

// Point model cache to our directory (aligns with session model)
env.cacheDir = join(homedir(), '.oamaestro', 'models');

let transcriptionPipeline: any = null;  // Lazy loaded on first use

export async function getTranscriber() {
  if (!transcriptionPipeline) {
    transcriptionPipeline = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base',    // ~145MB, multilingual, good quality
      { device: 'cpu' }         // CPU only — GPU (WebGPU) not reliable in all Node environments
    );
  }
  return transcriptionPipeline;
}

export async function transcribeFile(audioPath: string, options: {
  language?: string;
  returnTimestamps?: boolean;
}): Promise<TranscriptResult> {
  const t = await getTranscriber();
  const result = await t(audioPath, {
    return_timestamps: options.returnTimestamps ?? true,
    language: options.language ?? null,  // null = auto-detect language
    chunk_length_s: 30,                  // Process in 30-second chunks (memory efficient)
    stride_length_s: 5,                  // 5-second overlap between chunks (continuity)
  });
  // result.text = full transcript
  // result.chunks = [{ timestamp: [startSec, endSec], text: "..." }, ...]
  return result;
}
```

### Transcript Formatting

```typescript
export function formatTranscript(result: TranscriptResult, format: 'plain' | 'timestamped' | 'srt'): string {
  if (format === 'plain') {
    return result.text.trim();
  }
  if (format === 'timestamped') {
    return result.chunks
      .map(c => `[${formatTime(c.timestamp[0])}] ${c.text.trim()}`)
      .join('\n');
  }
  if (format === 'srt') {
    return result.chunks
      .map((c, i) => `${i + 1}\n${toSrtTime(c.timestamp[0])} --> ${toSrtTime(c.timestamp[1])}\n${c.text.trim()}\n`)
      .join('\n');
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}
```

---

## The Eight MCP Tools — Final Specifications

### Tool 1: `analyze_video` ⭐ Primary Tool

**Purpose:** End-to-end — download, extract, grid, return. The tool most users will call.

**Input schema:**
```typescript
{
  source: string;             // Local path OR any URL (YouTube, TikTok, etc.)
  query: string;              // "What are the steps shown?" "What does the UI look like?"
  mode?: 'overview'           // 14 evenly spaced frames (DEFAULT) — transcript always included automatically
        | 'detailed'          // Scene-detection frames — transcript always included automatically
        | 'full';             // Scene frames + Whisper always (even if captions exist — highest accuracy)
  start_time?: string;        // "00:02:30" or "150" (seconds)
  end_time?: string;          // "00:05:00" or "300" (seconds)
  scene_threshold?: number;   // Override default 0.3 — see threshold guide
  max_frames?: number;        // Override default 80 — hard cap still enforced at 150
  cookies?: string;           // Path to cookies.txt for auth-gated content
}
```

> **Transcript is always included — the user never has to ask for it.** `analyze_video` always attempts caption extraction first (fast). If captions are found, they are included automatically. If no captions are found, Whisper runs automatically — no user prompt, no follow-up needed. The tool handles it completely. `mode: 'full'` forces Whisper even when captions exist, for maximum accuracy. The only difference between modes is frame extraction strategy, not whether a transcript is produced.

**Behavior (step by step):**
1. If URL: run pre-flight check (get metadata, estimate size, check disk space)
2. If disk check fails: return helpful error, do not proceed
3. If URL: download via yt-dlp at max 720p to session job directory
4. If local: validate file exists and is a supported format
5. Get video duration (from yt-dlp metadata for remote, ffprobe for local)
6. **In parallel:** run ffmpeg frame extraction AND attempt caption extraction:
   - Frame extraction: ffmpeg single-pass (overview or scene depending on mode)
   - Caption extraction: try yt-dlp `--write-subs --write-auto-subs --skip-download` for remote URLs; try ffmpeg embedded subtitle extraction for local files
7. If frame count exceeds cap: auto-adjust threshold, re-run, notify LLM
8. Compile frames into grid image(s) using sharp
9. Caption result:
   - Captions found → include formatted transcript in response automatically
   - No captions found AND mode is NOT `full` → include note: "No captions found. Use `mode: 'full'` to transcribe audio with local Whisper."
   - No captions found AND mode IS `full` → run Whisper: ffmpeg audio extraction → `transcribeFile()`
   - Mode IS `full` AND captions exist → still run Whisper for highest accuracy (Whisper beats auto-captions)
10. Read grid images, encode to base64
11. Return MCP response with ImageContent + TextContent blocks (transcript interleaved per grid time range if present)
12. Keep all temp files alive in session directory

**MCP response structure:**
```typescript
// overview or detailed — captions found (single grid):
content: [
  { type: "image", data: base64, mimeType: "image/jpeg" },
  { type: "text", text: "28:14 video. 47 frames. Transcript (auto-captions):\n\n[0:00] Welcome to this tutorial...\n[0:32] First we'll cover..." }
]

// overview or detailed — no captions, Whisper ran automatically (single grid):
content: [
  { type: "image", data: base64, mimeType: "image/jpeg" },
  { type: "text", text: "0:47 video. 14 frames. Transcript (Whisper):\n\n[0:00] Hey guys, today I'm going to show you...\n[0:15] So the first thing you want to do is..." }
]

// no captions, long video (>10 min) — Whisper ran automatically, result includes explanation prefix:
// ⚠️ ARCHITECTURE NOTE: MCP uses request/response — a tool can only return ONE response.
// There is no way to "send a progress message before" and then send results after.
// The correct pattern: run Whisper to completion first, then return ONE combined response
// where the first TextContent block explains what happened (past tense).
// Do NOT attempt to stream or send multiple responses from a single tool call.
content: [
  { type: "image", data: base64grid1, mimeType: "image/jpeg" },
  { type: "text", text: "Grid 1 (00:00:00—00:07:03):\nNo captions found — transcribed with local Whisper (28-min video, took ~28 min on CPU).\n[0:00] Alright so today we're diving into..." },
  { type: "image", data: base64grid2, mimeType: "image/jpeg" },
  { type: "text", text: "Grid 2 (00:07:15—00:14:30):\n[7:16] Now this is where it gets interesting..." },
]

// full mode — Whisper always, multiple grids:
content: [
  { type: "text", text: "87 frames in 6 grids. Duration: 1:12:30. Transcript via Whisper." },
  { type: "image", data: base64grid1, mimeType: "image/jpeg" },
  { type: "text", text: "Grid 1 (00:00:00—00:12:05):\n[0:00] Let's start by opening the terminal...\n[1:14] Now type the following command..." },
  { type: "image", data: base64grid2, mimeType: "image/jpeg" },
  { type: "text", text: "Grid 2 (00:12:18—00:24:40):\n[12:20] Once that's installed, we move on to..." },
]
```

### Tool 2: `extract_frames` — Lower-Level Control

**Purpose:** When the user wants frames saved to disk for their own use, or wants full control.

**Input schema:**
```typescript
{
  source: string;
  mode: 'scene' | 'interval' | 'keyframe' | 'targeted' | 'overview';
  fps?: number;                // interval mode only, default 1
  scene_threshold?: number;    // scene mode, default 0.3
  timestamps?: string[];       // targeted mode ["00:01:30", "00:04:22"]
  max_frames?: number;         // default 80, absolute cap 150
  output_dir?: string;         // custom output dir (default: session job dir)
  start_time?: string;
  end_time?: string;
  cookies?: string;
}
```

**Returns:** TextContent with array of `{ path, timestamp, frame_number }` — file paths on disk.

*Note: This tool returns file paths not base64, because the user explicitly wants frames saved to disk.*

### Tool 3: `get_video_info` — Metadata Without Downloading

**Purpose:** Check video details before committing to a download.

**Input:** `{ source: string, cookies?: string }`

**Returns:** TextContent with:
```typescript
{
  title?: string;
  duration: string;           // "00:28:14"
  duration_seconds: number;
  fps: number;
  resolution: string;         // "1920x1080"
  format: string;
  estimated_download_size: string;  // "~180MB at 720p"
  has_subtitles: boolean;
  subtitle_languages?: string[];
  uploader?: string;
  upload_date?: string;
}
```

**Implementation note:** Use `yt-dlp --dump-json [URL]` for remote URLs, `ffprobe -v quiet -print_format json -show_format -show_streams [path]` for local files. No video download occurs for either.

### Tool 4: `get_transcript` — Captions/Subtitles Only (Fast)

**Purpose:** Extract existing captions/subtitles. Fast path — no transcription needed.

**Input:**
```typescript
{
  source: string;
  language?: string;          // "en" default
  format: 'timestamped' | 'plain' | 'srt';
  cookies?: string;
}
```

**Behavior:**
- YouTube with captions: yt-dlp `--write-subs --write-auto-subs --skip-download`
- Local with embedded subs: ffmpeg `-map 0:s:0 -f srt`
- No captions found: Return error: "No captions found for this video. Use the `transcribe_audio` tool to generate a transcript using local speech recognition."

**Returns:** TextContent with formatted transcript.

### Tool 5: `transcribe_audio` ⭐ New — Local Speech-to-Text

**Purpose:** Generate a transcript from the audio of any video, even when no captions exist. Uses local Whisper — no API key, no internet after first model download.

**Input schema:**
```typescript
{
  source: string;             // Local path OR URL
  language?: string;          // "en", "es", "fr", etc. — omit for auto-detect
  format?: 'timestamped'      // "[0:32] Text here" per chunk — DEFAULT
          | 'plain'           // Full text, no timestamps
          | 'srt';            // Proper SRT subtitle format
  start_time?: string;        // Transcribe a section only
  end_time?: string;
  cookies?: string;
}
```

**Behavior (step by step):**
1. If URL: check session cache for already-downloaded video, download if needed
2. Check if `audio.wav` already exists in this job's directory — reuse if present
3. If not: run ffmpeg audio extraction command to produce `[job_dir]/audio.wav`
4. Check if Whisper model is cached in `~/.oamaestro/models/`
5. If not cached: send user message about first-run model download (~145MB), then proceed
6. Lazy-load transcription pipeline via `getTranscriber()`
7. Run `transcribeFile(audioPath, { language, returnTimestamps: true })`
8. Format output per requested format
9. Return TextContent with formatted transcript + source info

**MCP response:**
```typescript
content: [
  {
    type: "text",
    text: "Transcript of 28:14 video (auto-detected language: English, Whisper base model):\n\n[formatted transcript]"
  }
]
```

**Returns:** TextContent only — transcript is text, no images needed.

### Tool 6: `extract_frame_at` — Single Frame Investigation

**Purpose:** Re-examine a specific moment. Key tool for follow-up questions.

**Input:**
```typescript
{
  source: string;             // Can be the original URL or a cached local path from a prior job
  timestamp: string;          // "00:03:45" or "225"
  max_width?: number;         // default 768
  cookies?: string;
}
```

**Smart caching behavior:**
Before downloading, check if this source already has a downloaded `source.mp4` in any job in the current session. If so, use the cached file — no re-download.

**Returns:** ImageContent (base64 single frame) + TextContent (timestamp confirmation).

### Tool 7: `create_frame_grid` — Compose Your Own Grid

**Purpose:** User has extracted frames (via `extract_frames`) and wants to compose a grid for LLM analysis.

**Input:**
```typescript
{
  frame_paths: string[];     // Paths to existing frame images on disk
  columns?: number;          // default 4
  cell_width?: number;       // default 480
  include_frame_labels?: boolean;  // default true
}
```

**Returns:** ImageContent (base64 grid) + TextContent (frame count, dimensions).

### Tool 8: `cleanup` — Manual Temp Control

**Purpose:** User control over temp files. Good hygiene, respects user's disk.

**Input:**
```typescript
{
  scope: 'job'       // Delete a specific job
        | 'session'  // Delete all jobs in current session
        | 'all';     // Delete all oamaestro session data (nuclear option)
  job_id?: string;   // Required if scope is 'job'
}
```

**Returns:** TextContent confirming what was deleted and how much disk was freed.

---

## Error Handling — Every Error Must Help the User

Never return raw errors. Every error path must tell the user the likely cause AND what to do.

| Situation | User-facing message |
|-----------|-------------------|
| yt-dlp download fails (generic) | "Could not download this video. It may be private, age-restricted, or geo-blocked. Options: (1) download manually and give me the local file path, (2) pass a cookies.txt file with the cookies parameter" |
| Age-restricted content | "This video requires age verification. Export your browser cookies as cookies.txt (use the 'Get cookies.txt LOCALLY' browser extension) and pass the file path via the cookies parameter" |
| Disk space insufficient | "Not enough disk space. You have Xmb free but this download needs ~Ymb. Free up space or use start_time/end_time to analyze a shorter section" |
| Video too long (>2GB estimate) | "This video is very long (~Xhrs). Analyzing the full video would use ~Ymb of disk. Use start_time and end_time to focus on a section — e.g. start_time: '00:10:00', end_time: '00:20:00'" |
| No captions found (analyze_video, short video <10 min) | Whisper runs automatically. No message shown — transcript appears in response as normal. |
| No captions found (analyze_video, long video ≥10 min) | Progress message sent first: "No captions found. Transcribing [duration] video audio with local Whisper (~[N] min). Starting now..." then Whisper runs automatically. |
| No captions found (get_transcript tool) | "No captions found for this video. Use the `transcribe_audio` tool to generate a transcript using local speech recognition (no API key required)." |
| Unsupported file format | "This file format (X) is not supported. Supported formats: mp4, mov, avi, mkv, webm, m4v, flv, wmv, ts, mts" |
| ffmpeg binary issue | "ffmpeg binary not found. The installation may be incomplete. Try: npm install -g @oamaestro/video-vision-mcp" |
| Frame cap hit | "Scene detection would produce X frames, which exceeds the 150-frame limit. Threshold auto-adjusted to Y, producing Z frames instead. For higher detail, use start_time/end_time to analyze a specific section" |
| CAPTCHA detected | "A CAPTCHA appeared. This site requires human verification and cannot be automated. Try downloading the video manually and providing the local path" |
| TikTok auth needed | "This TikTok content requires login. Export your browser cookies as cookies.txt and pass it with the cookies parameter" |
| Whisper model download fails | "Could not download the Whisper transcription model. Check your internet connection and try again. The model (~145MB) only needs to download once." |
| Audio extraction fails | "Could not extract audio from this video. The file may be corrupted or video-only with no audio track." |

---

## File Structure

```
video-vision-mcp/
├── src/
│   ├── index.ts                      # MCP server — registers all 8 tools
│   ├── server.ts                     # REST API server mode (express)
│   ├── cli.ts                        # CLI entry point (commander)
│   ├── tools/
│   │   ├── analyze-video.ts          # Primary end-to-end tool
│   │   ├── extract-frames.ts         # Lower-level frame extraction to disk
│   │   ├── get-video-info.ts         # Metadata only, no download
│   │   ├── get-transcript.ts         # Captions/subtitles only (fast)
│   │   ├── transcribe-audio.ts       # Local Whisper speech-to-text
│   │   ├── extract-frame-at.ts       # Single frame at timestamp
│   │   ├── create-frame-grid.ts      # Grid from existing frames
│   │   └── cleanup.ts                # Temp file management
│   ├── lib/
│   │   ├── ffmpeg.ts                 # All ffmpeg/ffprobe operations
│   │   ├── ytdlp.ts                  # yt-dlp binary management + download
│   │   ├── transcriber.ts            # Whisper via @huggingface/transformers
│   │   ├── preflight.ts              # Disk space checks, size estimation
│   │   ├── frame-extractor.ts        # Orchestrates ffmpeg extraction + auto-threshold
│   │   ├── grid-composer.ts          # Sharp-based grid composition
│   │   ├── session-manager.ts        # Session/job directory lifecycle
│   │   └── source-cache.ts           # Check if source already downloaded in session
│   └── types.ts                      # All shared TypeScript interfaces
├── bin/
│   └── cli.js                        # npm bin shim
├── .github/
│   ├── workflows/
│   │   └── ci.yml                    # GitHub Actions CI
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── package.json
├── tsconfig.json
├── README.md
├── CONTRIBUTING.md
└── LICENSE                           # MIT
```

---

## Dependencies — Pinned to Known Stable Ranges

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "@ffprobe-installer/ffprobe": "^1.4.1",
    "@huggingface/transformers": "^3.0.0",
    "yt-dlp-wrap": "^2.3.12",
    "sharp": "^0.33.0",
    "express": "^4.18.0",
    "commander": "^12.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "@types/uuid": "^9.0.0"
  }
}
```

**Why these — and what changed:**
- `@ffmpeg-installer/ffmpeg` — bundles platform ffmpeg binaries; never require users to install system ffmpeg
- `@ffprobe-installer/ffprobe` — **NEW** — bundles ffprobe separately (not included with ffmpeg installer); needed for local file metadata
- `@huggingface/transformers` — **NEW** — Whisper in pure JavaScript; runs in Node.js with ONNX; automatically uses `onnxruntime-node` backend; no extra install
- `yt-dlp-wrap` — manages yt-dlp binary lifecycle; configured with custom binary path `new YTDlpWrap('~/.oamaestro/bin/yt-dlp')`
- `sharp` — fastest Node.js image processing for grid composition (native bindings)
- `node-fetch` **REMOVED** — Node.js 18+ has native `fetch` built-in; no need for this dependency

---

## package.json Complete Spec

```json
{
  "name": "@oamaestro/video-vision-mcp",
  "version": "0.1.0",
  "description": "Give your AI the ability to actually watch videos. MCP server for frame extraction, visual analysis, and audio transcription of any local or online video.",
  "author": {
    "name": "OA Maestro",
    "email": "realoamaestro@gmail.com"
  },
  "license": "MIT",
  "keywords": [
    "mcp", "model-context-protocol", "video", "vision", "ai", "llm",
    "claude", "cursor", "cline", "frame-extraction", "youtube", "whisper",
    "tiktok", "ffmpeg", "yt-dlp", "open-source", "ai-tools", "transcription"
  ],
  "bin": {
    "video-vision-mcp": "./bin/cli.js"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "bin", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "dev": "npx ts-node src/index.ts",
    "start": "node dist/index.js",
    "start:server": "node dist/server.js --server",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "@ffprobe-installer/ffprobe": "^1.4.1",
    "@huggingface/transformers": "^3.0.0",
    "yt-dlp-wrap": "^2.3.12",
    "sharp": "^0.33.0",
    "express": "^4.18.0",
    "commander": "^12.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "@types/uuid": "^9.0.0"
  }
}
```

---

## tsconfig.json — Use CommonJS (Simplest for Node.js MCP Server)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Why CommonJS, not NodeNext/ESM:**
- MCP servers run as Node.js processes — CommonJS has zero friction
- ESM with NodeNext requires all imports to have `.js` extensions (e.g. `import { foo } from './lib/ffmpeg.js'`) — error-prone
- `sharp`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe` all work cleanly with CommonJS
- `@huggingface/transformers` v3 supports CommonJS via `require()`

---

## bin/cli.js — The npm Bin Shim

```javascript
#!/usr/bin/env node
require('../dist/cli.js');
```

This file is CommonJS-compatible. It simply requires the compiled CLI entry point.

---

## GitHub Actions CI

File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run build
      - name: Verify MCP server starts
        run: timeout 5 node dist/index.js || true
```

---

## Community Infrastructure

### CONTRIBUTING.md Content

```markdown
# Contributing to Video Vision MCP

Thanks for contributing! Here's how it works.

## What We Welcome
- Bug fixes
- New video source support (new yt-dlp sites, edge cases)
- Better error messages
- Performance improvements
- Documentation improvements

## What We Don't Merge
- New external API key dependencies (Gemini, OpenAI, etc.) — this defeats the purpose
- Breaking changes to existing tool schemas without a major version bump
- Features that require server-side infrastructure

## Process
1. Open an issue first for anything non-trivial — discuss before building
2. Fork the repo, create a feature branch
3. Make your changes, ensure `npm run build` passes
4. Open a PR with the template filled out

## Running Locally
npm install
npm run build
node dist/index.js    # starts MCP server on stdio
```

### Issue Templates and PR Template

**Bug report** (`.github/ISSUE_TEMPLATE/bug_report.md`):
```markdown
---
name: Bug report
about: Something isn't working
---

**What happened:**

**What you expected:**

**Video source:** (YouTube/TikTok/local — no need to share private URLs)

**Error message:**

**Environment:**
- OS: [Windows/Mac/Linux]
- Node version: [run `node --version`]
- Package version: [run `npx @oamaestro/video-vision-mcp --version`]
- MCP client: [Claude Code/Cursor/Cline/etc]
```

**Feature request** (`.github/ISSUE_TEMPLATE/feature_request.md`):
```markdown
---
name: Feature request
about: Suggest something new
---

**What problem does this solve?**

**What would you like?**

**Are you willing to build it?**
```

**PR Template** (`.github/PULL_REQUEST_TEMPLATE.md`):
```markdown
## What does this PR do?

## Does it add a new API key dependency? (Should be No)

## Does `npm run build` pass?

## Does it change any tool input/output schemas? If yes, describe the change.

## Related issue: #
```

---

## README Opening — Exact Text

```markdown
# Video Vision MCP

**Give your AI the ability to actually watch videos — and hear them too.**

Your AI can read text. It can analyze images. But until now, it couldn't watch a video.

Video Vision MCP is an MCP server that extracts frames AND transcribes audio from any video —
local files, YouTube, TikTok, Instagram Reels, and 1000+ platforms — and gives them directly
to your AI using its own built-in vision and comprehension.

**No Gemini API key. No OpenAI API. No Ollama. No extra subscriptions.
Works on any laptop — no powerful hardware required.**

Works with Claude Code, Cursor, Cline, Windsurf, Continue, and any MCP-compatible tool.

---

## How It Works

Every time you point it at a video, here's what happens automatically:

1. **Frames extracted** — scene changes detected, key moments captured at 768px, timestamps burned in
2. **Captions fetched** — subtitles pulled instantly if the platform has them (YouTube, TikTok, etc.)
3. **No captions?** — Whisper transcribes the audio locally, no API key, nothing to set up
4. **Frames compiled into grids** — 16 frames per image for token efficiency, your AI sees the whole timeline
5. **Everything returned together** — your AI gets the visuals and the words in one shot, fully in sync

You don't configure any of this. You don't choose between visual or audio. It just handles it.

---

## Quick Start

Add to your MCP client config:

\`\`\`json
{
  "mcpServers": {
    "video-vision": {
      "command": "npx",
      "args": ["-y", "@oamaestro/video-vision-mcp"]
    }
  }
}
\`\`\`

Then ask your AI anything about any video.
```

---

## v2 Roadmap — State in README, Don't Build Now

```markdown
## Roadmap

- [ ] **Chrome extension** — analyze videos directly from ChatGPT, Gemini, Claude.ai web
- [ ] **Batch processing** — analyze a YouTube playlist or folder of videos
- [ ] **Video comparison** — watch two videos and compare them side by side
- [ ] **Real-time analysis** — analyze a screen recording while it's being made
- [ ] **Webhook support** — async processing via HTTP callbacks
- [ ] **GPU acceleration** — WebGPU-backed Whisper for faster transcription on capable hardware
```

Note: Whisper transcription ships in v1 — it is no longer a roadmap item.

---

## Implementation Order — Single Session, Top to Bottom

Execute phases in order. Every step builds without TypeScript errors before proceeding to the next. Never move to the next step if the current step doesn't compile.

### Phase 0 — Environment Verification
```
0a. Run: node --version  → Must print v18.x.x or higher. Stop if not.
0b. Run: npm --version   → Must print a version number. Stop if not.
0c. Create directory: video-vision-mcp/
0d. cd into video-vision-mcp/
```

### Phase 1 — Project Scaffold

```
Step 1. Create package.json using the exact spec above.

Step 2. Create tsconfig.json using the exact spec above (CommonJS, not NodeNext).

Step 3. Run: npm install
        Expected: node_modules/ created, no errors.
        If sharp install fails on Windows: run `npm install --ignore-scripts` then `npm rebuild sharp`

Step 4. Create all directories (run these as mkdir commands):
        src/
        src/tools/
        src/lib/
        bin/
        .github/
        .github/workflows/
        .github/ISSUE_TEMPLATE/

Step 5. Create src/types.ts with all shared interfaces (see types spec below).

Step 6. Create stub files for every source file — just `export {};` in each:
        src/index.ts
        src/server.ts
        src/cli.ts
        src/tools/analyze-video.ts
        src/tools/extract-frames.ts
        src/tools/get-video-info.ts
        src/tools/get-transcript.ts
        src/tools/transcribe-audio.ts
        src/tools/extract-frame-at.ts
        src/tools/create-frame-grid.ts
        src/tools/cleanup.ts
        src/lib/ffmpeg.ts
        src/lib/ytdlp.ts
        src/lib/transcriber.ts
        src/lib/preflight.ts
        src/lib/frame-extractor.ts
        src/lib/grid-composer.ts
        src/lib/session-manager.ts
        src/lib/source-cache.ts

Step 7. Run: npm run build
        Expected: dist/ created, zero TypeScript errors.
        If errors: fix before proceeding.
```

### Phase 2 — Core Libraries (Build in This Exact Order)

```
Step 8. src/lib/session-manager.ts
        - Import: path, os, fs/promises, uuid
        - Constants: OAMAESTRO_DIR = join(homedir(), '.oamaestro'), SESSIONS_DIR, BIN_DIR, MODELS_DIR
        - createSessionDir(): creates sessions/[uuid]/ and writes session.json { started_at: ISO string, last_active_at: ISO string }
        - createJobDir(sessionDir): creates jobs/[uuid]/ and writes manifest.json { source: '', source_type: 'local', created_at: ISO string }
        - updateJobManifest(jobDir, data): merges data into manifest.json
        - cleanupSession(sessionDir): rm -rf the session directory, log freed bytes
        - cleanupOldSessions(): on server start, delete any sessions/ subdirs where session.json.started_at is >4 hours ago
        - getSessionSize(sessionDir): returns total bytes in session directory
        - Export all functions.
        Run: npm run build. Must pass.

Step 9. src/lib/preflight.ts
        - Import: child_process (execSync), os, path
        - function getFreeDiskBytes(): number
          On Windows: parse `wmic logicaldisk where "DeviceID='C:'" get FreeSpace` output
          On Mac/Linux: parse `df -k [homedir]` output (second column of second row × 1024)
        - function estimateDownloadBytes(durationSeconds: number): number
          Formula: durationSeconds * 100 * 1024  (100KB/s for 720p)
        - function checkPreFlight(durationSeconds: number): PreflightResult
          type PreflightResult = { ok: boolean; warning?: string; error?: string }
          Rules:
            freeBytes < 500MB → error: "Less than 500MB free disk space. Free up space before continuing."
            estimatedBytes > freeBytes * 0.8 → error with exact message from error table
            estimatedBytes > freeBytes * 0.5 → warning with exact message from error table
            otherwise → { ok: true }
        Run: npm run build. Must pass.

Step 10. src/lib/ffmpeg.ts
        - Import: @ffmpeg-installer/ffmpeg, @ffprobe-installer/ffprobe, child_process (spawn), fs/promises, path
        - const FFMPEG = (ffmpegInstaller as any).path
        - const FFPROBE = (ffprobeInstaller as any).path
        - function spawnProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }>
          Spawns the process, collects stdout/stderr, rejects on non-zero exit code with stderr as message.
        - async function getLocalVideoInfo(filePath: string): Promise<VideoInfo>
          Runs: FFPROBE -v quiet -print_format json -show_format -show_streams [filePath]
          Parses JSON: duration from format.duration, fps from streams[0].r_frame_rate (split on '/'), 
          resolution from streams[0].width + streams[0].height, format from format.format_name,
          has_subtitles = streams.some(s => s.codec_type === 'subtitle')
        - async function extractFrames(input: string, outputDir: string, opts: ExtractionOptions): Promise<string[]>
          Builds ffmpeg command based on opts.mode:
            'overview': calculate interval = Math.max(1, Math.floor(durationSeconds / 14)), use fps=1/[interval], -frames:v 14
            'scene': use select='gt(scene,[threshold])', vsync vfr
            'interval': use fps=[opts.fps ?? 1]
            'keyframe': use select='eq(pict_type\\,I)', vsync vfr
            'targeted': for each timestamp, run separate single-frame extraction
          All modes include: scale=768:-2, drawtext filter (see exact string in ffmpeg pipeline section)
          Returns array of output file paths (glob outputDir for *.jpg after run)
        - async function extractFrameAt(input: string, timestamp: string, outputPath: string): Promise<void>
          Runs single-frame extraction at timestamp. Uses -ss [timestamp] before -i for keyframe seek.
        - async function extractAudio(input: string, outputPath: string): Promise<void>
          Runs: FFMPEG -i [input] -ar 16000 -ac 1 -c:a pcm_s16le -y [outputPath]
        - async function extractEmbeddedSubtitles(input: string, outputPath: string): Promise<boolean>
          Runs: FFMPEG -i [input] -map 0:s:0 -f srt [outputPath]
          Returns true if succeeded (subtitle track existed), false if not.
        Run: npm run build. Must pass.

Step 11. src/lib/ytdlp.ts
        - Import: YTDlpWrap from yt-dlp-wrap, path, os, fs/promises, child_process
        - const BIN_DIR = join(homedir(), '.oamaestro', 'bin')
        - const BIN_PATH = join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
        - const VERSION_CACHE_PATH = join(homedir(), '.oamaestro', 'ytdlp-version.json')
        - async function ensureBinary(): Promise<void>
          Check if BIN_PATH exists. If not: mkdir BIN_DIR, use YTDlpWrap.downloadFromGithub(BIN_PATH, 'latest').
          Always: check VERSION_CACHE_PATH. If missing or last_checked > 24h ago: 
            Fetch https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest (using native fetch).
            Extract tag_name. If different from cached version: call YTDlpWrap.downloadFromGithub(BIN_PATH, tag_name).
            Write VERSION_CACHE_PATH: { version: tag_name, checked_at: Date.now() }
        - function getClient(): YTDlpWrap
          Call ensureBinary() in callers before using client.
          Returns new YTDlpWrap(BIN_PATH)
        - async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo>
          Build args: ['--dump-json', url]
          If cookies: add ['--cookies', cookies]
          Run via ytdlpClient.execPromise(args)
          Parse JSON output. Map to VideoInfo interface. 
          estimated_download_mb = Math.round(duration_seconds * 100 / 1024)
        - async function downloadVideo(url: string, outputPath: string, options: { cookies?: string }): Promise<void>
          Build args: ['-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]', '--merge-output-format', 'mp4', '-o', outputPath, url]
          If cookies: add ['--cookies', cookies]
          Run via ytdlpClient.execPromise(args)
        - async function downloadSubtitles(url: string, outputDir: string, language: string, cookies?: string): Promise<string | null>
          Build args: ['--write-subs', '--write-auto-subs', '--skip-download', '--sub-lang', language, '--sub-format', 'srt', '-o', join(outputDir, 'subtitle'), url]
          Run. Check if any .srt file was created in outputDir. Return path or null.
        Run: npm run build. Must pass.

Step 12. src/lib/source-cache.ts
        - Import: path, fs/promises, session-manager
        - async function findCachedVideo(sessionDir: string, source: string): Promise<string | null>
          Walk all job directories in sessionDir/jobs/
          For each job, read manifest.json
          If manifest.source === source AND manifest.cached_video_path exists AND file at that path exists:
            Return the cached_video_path
          Return null if not found
        Run: npm run build. Must pass.

Step 13. src/lib/transcriber.ts
        - Full implementation as specified in the Audio Transcription section above.
        - Export: transcribeFile(), formatTranscript()
        - Also export: isModelCached() → boolean (checks if ~/.oamaestro/models/Xenova/whisper-base/ exists)
        Run: npm run build. Must pass.

Step 14. src/lib/grid-composer.ts
        - Import: sharp, path, fs/promises
        - const CELL_WIDTH = 480
        - const COLUMNS = 4
        - async function composeGrid(framePaths: string[], outputPath: string, options: { includeLabels?: boolean }): Promise<GridResult>
          1. Load first frame to determine aspect ratio: sharp(framePaths[0]).metadata() → { width, height }
          2. Calculate cellHeight = Math.round(CELL_WIDTH / (width / height))
          3. Resize all frames to CELL_WIDTH × cellHeight using sharp (create array of resized buffers)
          4. Calculate grid dimensions: rows = Math.ceil(framePaths.length / COLUMNS), gridWidth = COLUMNS * CELL_WIDTH
          5. Create blank canvas: sharp({ create: { width: gridWidth, height: rows * cellHeight, channels: 3, background: { r: 0, g: 0, b: 0 } } })
          6. Composite all frames onto canvas using sharp .composite() with calculated left/top offsets
          7. Save as JPEG quality 85 to outputPath
          8. Return GridResult
        Run: npm run build. Must pass.

Step 15. src/lib/frame-extractor.ts
        - Import: ffmpeg, session-manager, grid-composer, path, fs/promises
        - async function extractAndGrid(input: string, jobDir: string, opts: ExtractionOptions): Promise<{ grids: GridResult[], frames: FrameInfo[], adjustedThreshold?: number }>
          1. Run ffmpeg.extractFrames(input, join(jobDir, 'frames'), opts)
          2. Count extracted frames
          3. If count > (opts.max_frames ?? 80) AND opts.mode === 'scene':
             Increment opts.scene_threshold by 0.05 (cap at 0.95)
             If still > 150: return error
             Re-run ffmpeg.extractFrames with new threshold
             Store adjustedThreshold for caller to report to LLM
          4. Build FrameInfo array from extracted file paths (parse timestamp from filename)
          5. If frames < 5: return individual frames without grid
          6. Split frames into groups of 16 (or fewer for final group)
          7. For each group: call gridComposer.composeGrid(group, gridOutputPath)
          8. Return { grids, frames, adjustedThreshold }
        Run: npm run build. Must pass.
```

### Phase 3 — Tools (Build in This Exact Order)

```
Step 16. src/tools/get-video-info.ts
        Input: { source: string, cookies?: string }
        Logic:
          If source starts with 'http://' or 'https://': call ytdlp.getVideoInfo(source, cookies)
          Else: call ffmpeg.getLocalVideoInfo(source)
        Return: MCPTextContent with JSON.stringify(videoInfo, null, 2)
        Run: npm run build. Must pass.

Step 17. src/tools/get-transcript.ts
        Input: { source: string, language?: string, format: 'timestamped' | 'plain' | 'srt', cookies?: string }
        Logic:
          If remote URL: 
            Call ytdlp.downloadSubtitles(source, tempDir, language ?? 'en', cookies)
            If returned path: read SRT file, format per requested format, return TextContent
            If null: return TextContent with error message pointing to transcribe_audio tool
          If local file:
            Create temp output path, call ffmpeg.extractEmbeddedSubtitles(source, tempPath)
            If true: read SRT, format, return TextContent
            If false: return TextContent with error message pointing to transcribe_audio tool
        Run: npm run build. Must pass.

Step 18. src/tools/transcribe-audio.ts
        Input: { source: string, language?: string, format?: 'timestamped'|'plain'|'srt', start_time?: string, end_time?: string, cookies?: string }
        Logic:
          1. Ensure session + create job
          2. Resolve source: if URL, check source cache for existing download; if not cached, run preflight + ytdlp.downloadVideo
          3. If start_time/end_time provided: use ffmpeg to extract a segment first (saves time on transcription)
          4. Check if audio.wav already exists in job dir (reuse if present)
          5. If not: call ffmpeg.extractAudio(sourceVideoPath, join(jobDir, 'audio.wav'))
          6. Check transcriber.isModelCached(): if false, return FIRST a TextContent informing user about download, THEN proceed
          7. Call transcriber.transcribeFile(audioPath, { language, returnTimestamps: true })
          8. Call transcriber.formatTranscript(result, format ?? 'timestamped')
          9. Return TextContent: "Transcript of [duration] video (language: [detected/specified], model: Whisper base):\n\n[transcript]"
        Run: npm run build. Must pass.

Step 19. src/tools/extract-frame-at.ts
        Input: { source: string, timestamp: string, max_width?: number, cookies?: string }
        Logic:
          1. Ensure session + create job
          2. Check source cache: if URL already downloaded, use cached path
          3. If URL not cached: run preflight + ytdlp.downloadVideo
          4. outputPath = join(jobDir, 'frame_at_[timestamp].jpg')
          5. Call ffmpeg.extractFrameAt(sourcePath, timestamp, outputPath)
          6. Read file, base64 encode
          7. Return [ImageContent(base64), TextContent("Frame at [timestamp]")]
        Run: npm run build. Must pass.

Step 20. src/tools/extract-frames.ts
        Input: { source, mode, fps?, scene_threshold?, timestamps?, max_frames?, output_dir?, start_time?, end_time?, cookies? }
        Logic:
          1. Ensure session + create job
          2. Resolve source (same pattern as extract-frame-at)
          3. outputDir = opts.output_dir ?? join(jobDir, 'frames')
          4. Call ffmpeg.extractFrames(sourcePath, outputDir, opts)
          5. Return TextContent with JSON array of { path, timestamp, frame_number }
        Run: npm run build. Must pass.

Step 21. src/tools/create-frame-grid.ts
        Input: { frame_paths: string[], columns?: number, cell_width?: number, include_frame_labels?: boolean }
        Logic:
          1. Validate all paths exist
          2. Create job dir for output
          3. Call gridComposer.composeGrid(frame_paths, outputPath, options)
          4. Read grid file, base64 encode
          5. Return [ImageContent(base64), TextContent("Grid: [N] frames, [cols]×[rows]")]
        Run: npm run build. Must pass.

Step 22. src/tools/cleanup.ts
        Input: { scope: 'job' | 'session' | 'all', job_id?: string }
        Logic:
          'job': if job_id missing → error. Delete jobDir, calculate freed bytes.
          'session': delete all jobs in current session dir, keep session.json.
          'all': call sessionManager.cleanupOldSessions() with threshold of 0 (delete everything).
        Return: TextContent("Deleted [N] files, freed [X]MB")
        Run: npm run build. Must pass.

Step 23. src/tools/analyze-video.ts (main tool — built last because it uses everything)
        Input: { source, query, mode?, start_time?, end_time?, scene_threshold?, max_frames?, cookies? }
        Logic (full flow):
          1. Ensure session + create job
          2. If URL: run preflight.checkPreFlight → if error: return TextContent with error message
          3. If URL: check source cache → if not cached: run ytdlp.downloadVideo
             Update jobManifest with { source, source_type: 'remote', cached_video_path }
          4. If local: validate file exists, check format supported, update jobManifest { source_type: 'local' }
          5. Get video duration (from yt-dlp metadata for remote, ffprobe for local)
          6. Build ExtractionOptions based on mode:
             'overview': { mode: 'overview', durationSeconds }
             'detailed': { mode: 'scene', scene_threshold: opts.scene_threshold ?? 0.3 }
             'full':     { mode: 'scene', scene_threshold: opts.scene_threshold ?? 0.3 }
          7. Run frame extraction AND caption extraction IN PARALLEL using Promise.all:
             - frameExtractor.extractAndGrid(sourcePath, jobDir, extractionOpts)
             - captionResult: for remote URLs try ytdlp.downloadSubtitles; for local files try ffmpeg.extractEmbeddedSubtitles
               Capture result (srt text or null) — do NOT let caption failure block frame extraction
          8. Caption logic after parallel completes:
             - captions found AND mode !== 'full' → use captions as transcript. Done.
             - captions found AND mode === 'full' → run Whisper anyway (higher accuracy than auto-captions)
             - no captions AND video duration < 600s (10 min) → run Whisper silently, no pre-message
             - no captions AND video duration ≥ 600s → run Whisper: ffmpeg.extractAudio → transcriber.transcribeFile
               (estimated_minutes = Math.ceil(duration_seconds / 60) — rough 1× real-time estimate on CPU)
               ⚠️ ARCHITECTURE CONSTRAINT — MCP IS REQUEST/RESPONSE, NOT STREAMING:
               A tool call returns exactly ONE response when it finishes. You cannot send a "starting now..."
               message and then send results later — MCP has no mechanism for this. The correct pattern:
               run Whisper all the way to completion FIRST, then return a single combined response where
               the first TextContent explains what happened in past tense, e.g.:
               "No captions found. Transcribed [duration] audio with local Whisper (took ~[N] min on CPU)."
               followed by the grids. Never attempt to send two separate responses from one tool call.
             - Whisper failure (any reason) → include note in response: "Audio transcription failed. Visual analysis only." — do not let it fail the whole tool call
          9. If Whisper ran: split transcript chunks by time range to align with each grid's time window
         10. Build content array:
             - Single grid, no transcript: [ImageContent, TextContent("N frames. Duration: X. No captions found. Use mode: 'full' to transcribe audio.")]
             - Single grid, with transcript: [ImageContent, TextContent("N frames. Duration: X.\n\nTranscript:\n[transcript]")]
             - Multiple grids: [TextContent overview] then per grid: [ImageContent, TextContent("Grid N (time range):\n[transcript section or no-caption note]")]
         11. Return content array
        Run: npm run build. Must pass.
```

### Phase 4 — Interfaces

```
Step 24. src/index.ts — MCP Server
        Import Server from @modelcontextprotocol/sdk/server/index.js
        Import StdioServerTransport from @modelcontextprotocol/sdk/server/stdio.js
        Import all 8 tool handler functions
        
        Create server:
          const server = new Server({ name: 'video-vision-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })
        
        Register each tool with server.setRequestHandler(ListToolsRequestSchema, ...) returning tool schemas
        Register server.setRequestHandler(CallToolRequestSchema, ...) routing to tool handlers
        
        Handle SIGTERM and SIGINT:
          process.on('SIGTERM', async () => { await sessionManager.cleanupSession(currentSessionDir); process.exit(0); })
          process.on('SIGINT', async () => { await sessionManager.cleanupSession(currentSessionDir); process.exit(0); })
        
        On startup: call sessionManager.cleanupOldSessions()
        
        Connect: const transport = new StdioServerTransport(); await server.connect(transport)
        
        Run: npm run build. Must pass.

Step 25. src/cli.ts — Commander CLI
        Import { Command } from 'commander'
        Import all tool handler functions
        
        Create program with version, description
        
        Add subcommands:
          analyze: --source, --query, --mode, --start-time, --end-time, --cookies
          extract: --source, --mode, --fps, --scene-threshold, --max-frames, --output-dir
          info: --source, --cookies
          transcript: --source, --language, --format, --cookies
          transcribe: --source, --language, --format, --start-time, --end-time, --cookies
          cleanup: --scope, --job-id
        
        Each subcommand action: call tool handler, print result to stdout as formatted text
        
        program.parse()
        Run: npm run build. Must pass.

Step 26. bin/cli.js
        Content: exactly #!/usr/bin/env node\nrequire('../dist/cli.js');
        Make executable on Mac/Linux: chmod +x bin/cli.js
        Run: npm run build. Must pass.

Step 27. src/server.ts — REST API
        Import express
        Import all tool handler functions
        
        Create Express app
        POST /analyze → analyze-video handler
        POST /extract → extract-frames handler
        POST /info → get-video-info handler
        POST /transcript → get-transcript handler
        POST /transcribe → transcribe-audio handler
        POST /frame → extract-frame-at handler
        POST /grid → create-frame-grid handler
        POST /cleanup → cleanup handler
        
        Parse --server and --port flags from process.argv
        If --server flag present: app.listen(port)
        
        Run: npm run build. Must pass.
```

### Phase 5 — Community Files

```
Step 28. README.md — use exact text from README Opening section above, then add:
         - Tools table listing all 8 tools with one-line descriptions
         - Use cases section (copy from Use Cases section below)
         - Quick start MCP config snippet
         - CLI usage examples
         - Supported platforms list
         - Disk usage table
         - Limitations section (must be logged in for auth-gated content, CAPTCHAs, etc.)
         - Using with OA Autopilot section
         - Roadmap section

Step 29. CONTRIBUTING.md — exact text from Community Infrastructure section above

Step 30. LICENSE — MIT license text:
         Copyright 2026 OA Maestro
         (followed by standard MIT license text)

Step 31. .github/workflows/ci.yml — exact YAML from GitHub Actions CI section above

Step 32. .github/ISSUE_TEMPLATE/bug_report.md — exact text from above

Step 33. .github/ISSUE_TEMPLATE/feature_request.md — exact text from above

Step 34. .github/PULL_REQUEST_TEMPLATE.md — exact text from above
```

### Phase 6 — Verification

```
Step 35. Run: npm run build
         Expected: zero TypeScript errors, dist/ fully populated.

Step 36. Run: node dist/index.js &
         Expected: server starts, no crash output.
         Kill with: kill %1

Step 37. Run: node dist/cli.js --help
         Expected: shows all subcommands listed.

Step 38. Run: node dist/cli.js info --source "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
         Expected: prints VideoInfo JSON (title, duration, fps, resolution, estimated download size).
         This is the "Rick Roll" video — reliable public test target, always available.

Step 39. Run: node dist/cli.js analyze --source "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --query "describe what you see" --mode overview
         Expected: downloads video, extracts ~14 frames, composes grid(s), outputs base64 data to stdout.
         Verify: ~/.oamaestro/sessions/ now contains a session dir with job dir containing source.mp4 and frames/.

Step 40. Run: node dist/cli.js transcribe --source "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
         Expected: first run downloads Whisper model to ~/.oamaestro/models/ (wait for it).
         Then: outputs timestamped transcript of the Rick Roll video.
         Verify: ~/.oamaestro/models/Xenova/whisper-base/ now exists.

Step 41. Run: node dist/cli.js cleanup --scope session
         Expected: prints "Deleted X files, freed XMB"
         Verify: session directory is removed from ~/.oamaestro/sessions/

Step 42. Run: node dist/index.js and send a test MCP message via stdin to confirm MCP protocol works.
         Send: {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
         Expected: JSON response listing all 8 tools.
```

---

## src/types.ts — All Shared Types

```typescript
export interface VideoInfo {
  title?: string;
  duration: string;           // "HH:MM:SS"
  duration_seconds: number;
  fps: number;
  resolution: string;         // "1920x1080"
  format: string;
  estimated_download_mb?: number;
  has_subtitles: boolean;
  subtitle_languages?: string[];
  uploader?: string;
  upload_date?: string;
}

export interface FrameInfo {
  path: string;
  timestamp: string;          // "HH:MM:SS"
  timestamp_seconds: number;
  frame_number: number;
}

export interface ExtractionOptions {
  mode: 'scene' | 'interval' | 'keyframe' | 'targeted' | 'overview';
  fps?: number;
  scene_threshold?: number;
  timestamps?: string[];
  max_frames?: number;
  start_time?: string;
  end_time?: string;
  max_width?: number;
  overlay_timestamp?: boolean;
  durationSeconds?: number;   // Required for overview mode to calculate interval
}

export interface GridResult {
  path: string;
  rows: number;
  columns: number;
  frame_count: number;
  time_start: string;
  time_end: string;
}

export interface SessionInfo {
  session_id: string;
  session_dir: string;
  started_at: string;
}

export interface JobInfo {
  job_id: string;
  job_dir: string;
  source: string;
  source_type: 'local' | 'remote';
  created_at: string;
  cached_video_path?: string;
}

export interface TranscriptChunk {
  timestamp: [number, number];  // [startSeconds, endSeconds]
  text: string;
}

export interface TranscriptResult {
  text: string;
  chunks: TranscriptChunk[];
}

export interface PreflightResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

export type MCPTextContent = { type: 'text'; text: string };
export type MCPImageContent = { type: 'image'; data: string; mimeType: string };
export type MCPContent = MCPTextContent | MCPImageContent;
```

---

## Use Cases for README

**1. Watch any tutorial — get the steps**
```
analyze this YouTube tutorial and give me the exact steps as a numbered list,
including commands shown on screen.
Source: https://youtube.com/watch?v=...
```

**2. Record your workflow, AI automates it**
```
I recorded myself doing this task manually. Watch the video and write
a step-by-step automation spec I can use with OA Autopilot.
Source: /Users/me/recordings/workflow.mp4
```

**3. Transcribe a screen recording (no captions needed)**
```
Transcribe this recording of my team meeting and give me action items.
Source: /Users/me/recordings/meeting.mp4
```

**4. Competitor intelligence**
```
Watch this product demo and list every feature shown, in order, with timestamps.
Source: https://youtube.com/watch?v=...
```

**5. Content breakdown**
```
Watch this TikTok: what hook do they use in the first 3 seconds,
what's the structure, what CTA do they end with?
Source: https://tiktok.com/@username/video/...
```

**6. Extract code from coding videos**
```
Watch this coding tutorial and extract every terminal command and code snippet
shown on screen, in order, with the timestamp each appears.
Source: https://youtube.com/watch?v=...
```

---

## Critical Notes — Read Before Writing Any Code

1. **Base64 ImageContent is the ONLY way the LLM sees images.** File paths in tool responses are invisible to the LLM's vision. `analyze_video`, `extract_frame_at`, and `create_frame_grid` MUST return `{ type: "image", data: base64, mimeType: "image/jpeg" }` content blocks.

2. **Both ffmpeg and ffprobe paths come from their respective npm packages.** Never rely on system PATH for either binary. `import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'` → `ffmpegInstaller.path`. `import ffprobeInstaller from '@ffprobe-installer/ffprobe'` → `ffprobeInstaller.path`.

3. **ffmpeg does everything in one pass.** Scene detection + resize to 768px + timestamp overlay all happen in a single ffmpeg command. Never write full-resolution intermediates to disk.

4. **Overview mode requires duration first.** Get video duration via yt-dlp `--dump-json` or ffprobe before building the ffmpeg command. Calculate `interval = Math.max(1, Math.floor(durationSeconds / 14))`, then use `-vf "fps=1/[interval]"`.

5. **yt-dlp downloads at max 720p.** Always use format selector `bestvideo[height<=720]+bestaudio/best[height<=720]`. Analysis quality is the same as 4K; disk usage is 60-80% lower.

6. **Pre-flight disk check before every remote download.** Estimate size from duration × ~100KB/s, check available disk, refuse if risky, show exact message from error table.

7. **Transcript is always produced by `analyze_video` — the user never has to ask.** Caption extraction runs in parallel with frame extraction via `Promise.all`. If captions are found → use them. If not → Whisper runs automatically. Short videos (<10 min) run Whisper silently. Long videos (≥10 min) run Whisper then explain in the response (past tense: "No captions found. Transcribed with local Whisper."). `mode: 'full'` forces Whisper even when captions exist. Whisper failure must never fail the whole tool call — fall back to "Audio transcription failed. Visual analysis only." Caption failure must never block frame extraction. **MCP constraint: one tool call = one response. Never attempt to send a "starting..." message mid-execution. Run Whisper to completion, then return a single combined response.**

8. **Session-based temp files.** Session dir created on server start. Jobs accumulate in session dir. Server cleans own session dir on exit (SIGTERM/SIGINT). Server cleans sessions >4h old on startup. Never delete mid-session.

9. **Source caching within session.** Before downloading a URL, check if it was already downloaded in the current session via `source-cache.ts`. Return cached path to avoid redundant downloads.

10. **Hard frame cap auto-adjusts.** If scene detection would produce >80 frames (default cap): increase threshold by 0.05, try again, repeat until under cap. Notify LLM of the adjustment. Never silently truncate — always explain.

11. **yt-dlp binary lives in `~/.oamaestro/bin/`.** Instantiate with `new YTDlpWrap(BIN_PATH)` to use custom path. Check for updates every 24h using GitHub releases API with native fetch (no node-fetch needed — Node 18+ has it built in).

12. **Whisper model lives in `~/.oamaestro/models/`.** Set `env.cacheDir` before any pipeline call. Lazy-load: only download model when `transcribe_audio` or `analyze_video` with mode `full` is actually called.

13. **CommonJS throughout.** tsconfig uses `"module": "CommonJS"`. All imports use standard `require()` / `import` syntax without `.js` extensions. `bin/cli.js` uses `require()`.

14. **Every error message tells the user what to do next.** No raw error strings. No stack traces to the user. Catch everything, translate to human-friendly messages per the error table.

15. **Multiple grids for long videos.** If a video produces >16 frames, compile into multiple 4×4 grids. Return all grids as separate ImageContent blocks in the MCP response, each preceded by a TextContent describing its time range.

16. **Test with the Rick Roll video.** `https://www.youtube.com/watch?v=dQw4w9WgXcQ` — reliable, always public, well-known, safe. 3:33 long (ideal for tests — short download, enough content to verify). It also has YouTube auto-captions, so it tests the automatic caption path too.

---

*Project by OA Maestro — github.com/OAMaestro*
*Sister project: OA Autopilot — github.com/OAMaestro/autopilot*
*License: MIT — build on it, fork it, make it yours*
