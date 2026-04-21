# Video Vision MCP

<div align="center">
  <img src="assets/banner.gif" alt="Video Vision MCP" width="720" />
  <br/>
  <strong>Give your AI eyes for video.</strong>
  <br/><br/>
</div>

Your AI can read docs. It can write code. It can analyze images.

Until now, it couldn't watch a video.

**Video Vision MCP** fixes that. Drop in a YouTube link, a TikTok, a local screen recording — your AI sees every key frame, hears every word, and can answer anything you ask about it. No Gemini API. No OpenAI. No cloud. No GPU. Runs locally on your laptop, works with whatever AI you already have.

> Works with Claude Code, Cursor, Cline, Windsurf, Continue, and any MCP-compatible tool.

---

## Setup

### Let your AI set it up for you

The easiest install is zero steps on your end — just paste this into your AI chat:

```
Please configure the Video Vision MCP so you can watch videos for me. The package is @oamaestro/video-vision-mcp and the install command is: npx -y @oamaestro/video-vision-mcp — register it in your MCP settings, then confirm it's connected.
```

Your AI will handle the rest — it knows how to wire up MCP servers for whatever tool you're using.

---

### Manual setup

**Claude Code** (one command):
```
claude mcp add video-vision -- npx -y @oamaestro/video-vision-mcp
```

**Cursor / Cline / Windsurf / Continue / any MCP-compatible tool:**

Paste this into your MCP config file:

```json
{
  "mcpServers": {
    "video-vision": {
      "command": "npx",
      "args": ["-y", "@oamaestro/video-vision-mcp"]
    }
  }
}
```

| Tool | Config file location |
|------|---------------------|
| **Cursor** | Settings → Features → MCP Servers |
| **Cline** (VS Code) | Cline extension settings → MCP Servers |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Continue** | `~/.continue/config.json` |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |

No API keys. No environment variables. No "step 3 of 11". Just paste and go.

---

## What actually happens

Every time you point it at a video:

1. **Downloads it** — YouTube, TikTok, Instagram, 1000+ platforms via yt-dlp. Or reads it locally.
2. **Detects scene changes** — extracts the frames that actually matter, not one every 5 seconds
3. **Burns timestamps in** — every frame has the time visible so your AI knows exactly when things happen
4. **Grabs captions** — if the platform has subtitles, it grabs them instantly. No transcription needed.
5. **No captions?** — runs [Whisper](https://github.com/openai/whisper) locally on CPU. No API key, no cloud, no setup.
6. **Returns everything together** — frame grids + transcript + metadata, all in one shot

You don't configure any of this. It figures it out.

> **First-time heads-up:** If a video has no captions, Whisper downloads a ~150MB speech model the first time. Takes about a minute. After that, it's cached forever at `~/.oamaestro/models/` and every future run skips it.

---

## Just talk to it

```
"Watch this YouTube tutorial and give me the exact steps as a numbered list"
```

```
"I recorded myself doing this task manually. Watch it and write an automation spec."
```

```
"Transcribe this meeting recording and give me the action items."
```

```
"Watch this product demo. List every feature shown, in order, with timestamps."
```

```
"Extract every terminal command visible in this coding tutorial."
```

```
"Compare the UI in this screen recording against our Figma spec."
```

---

## Supported sources

**Platforms:** YouTube, TikTok, Instagram Reels, Twitter/X, Facebook, Vimeo, Reddit, Twitch clips, LinkedIn, Dailymotion, and 1000+ more via yt-dlp.

**Local files:** `.mp4` `.mov` `.avi` `.mkv` `.webm` `.m4v` `.flv` `.wmv` `.ts` `.mts`

---

## Tools

| Tool | What it does |
|------|-------------|
| `analyze_video` | The main one. Download → frames → transcript → AI |
| `extract_frames` | Frames to disk, full mode control |
| `get_video_info` | Metadata without downloading |
| `get_transcript` | Captions only — fast, no transcription |
| `transcribe_audio` | Local Whisper transcription |
| `extract_frame_at` | Single frame at a specific timestamp |
| `create_frame_grid` | Compose existing frames into a grid |
| `cleanup` | Delete temp session files |

### Analysis modes

| Mode | How it works | Good for |
|------|-------------|---------|
| `overview` *(default)* | 14 evenly-spaced frames | Quick summary, short videos |
| `detailed` | Scene-change detection | Tutorials, product demos, anything with cuts |
| `full` | Scene frames + forced Whisper | When you need maximum accuracy |

---

## Disk usage

Temp files are created during analysis and cleaned up automatically when the server stops. Or call `cleanup` whenever.

| Video length | Approx temp disk |
|---|---|
| 5 min | ~42 MB |
| 30 min | ~241 MB |
| 1 hour | ~482 MB |
| 2 hours | ~962 MB |

---

## Known limits

- **Auth-gated content** (some TikTok, Instagram) requires a `cookies.txt` file passed via the `cookies` param
- **CAPTCHAs** can't be bypassed — if a platform blocks the download, grab the file manually and pass the local path
- **Long videos without captions** take time — Whisper runs on CPU, no GPU acceleration yet. Use `start_time`/`end_time` to analyze a specific section instead of the whole thing
- **ChatGPT / Claude.ai web** — browser extension coming in v2

---

## Roadmap

- [ ] **Chrome extension** — analyze videos directly from ChatGPT, Gemini, Claude.ai
- [ ] **Batch processing** — YouTube playlists, folders of local files
- [ ] **Video comparison** — watch two videos and diff them side by side
- [ ] **GPU acceleration** — WebGPU Whisper for faster transcription

---

<div align="center">
  Made by <a href="https://github.com/OAMaestro">OA Maestro</a> &nbsp;·&nbsp; MIT License
</div>
