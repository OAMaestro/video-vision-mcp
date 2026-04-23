<div align="center">
  <img src="assets/banner.png" alt="Video Vision MCP — AI can now hear & see any video" width="100%" />
</div>

<div align="center">
  <br/>

  [![npm version](https://img.shields.io/npm/v/@oamaestro/video-vision-mcp?color=gold&style=flat-square)](https://www.npmjs.com/package/@oamaestro/video-vision-mcp)
  [![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg?style=flat-square)](LICENSE)
  [![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-gold?style=flat-square)](https://nodejs.org)
  [![MCP Compatible](https://img.shields.io/badge/MCP-compatible-gold?style=flat-square)](https://modelcontextprotocol.io)
  [![Platform](https://img.shields.io/badge/works%20with-Claude%20%7C%20Cursor%20%7C%20Cline%20%7C%20Windsurf-gold?style=flat-square)](#setup)

  <br/>
  <h3>Give your AI eyes — and ears — for video.</h3>
  <p><em>YouTube. TikTok. Instagram Reels. X. Local files. Any video, any platform, zero cloud.</em></p>
  <br/>
</div>

---

Your AI can read docs. Write code. Analyze images.

Until now, it couldn't **watch a video.**

**Video Vision MCP** fixes that.

Drop in a YouTube link, a TikTok, a screen recording — your AI sees every key frame, hears every word, and can answer anything you ask about it. No Gemini API. No OpenAI key. No GPU. Runs entirely on your laptop, works with whatever AI you're already using.

> Works with **Claude Code, Cursor, Cline, Windsurf, Continue**, and any MCP-compatible tool.

---

## Why this changes everything

Most AI tools are blind to video. You paste a link and get nothing. You'd have to manually transcribe it yourself, screenshot it yourself, describe it yourself — then paste all of that into the chat. That's 15 minutes of work before you even ask a question.

Video Vision MCP collapses that to zero.

One URL. Your AI watches it. Done.

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

> **First-time heads-up:** If a video has no captions, Whisper downloads a ~150MB speech model the first time. Takes about a minute. After that, it's cached forever at `~/.oamaestro/models/` and every future run is instant.

---

## Setup

### Let your AI set it up for you

The easiest install is zero steps on your end — just paste this into your AI chat:

```
Please configure the Video Vision MCP so you can watch videos for me. The package is @oamaestro/video-vision-mcp and the install command is: npx -y @oamaestro/video-vision-mcp — register it in your MCP settings, then confirm it's connected.
```

Your AI will handle the rest. It knows how to wire up MCP servers for whatever tool you're using.

---

### Manual setup

**Claude Code** — one command:
```bash
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
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) · `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |

No API keys. No environment variables. No "step 3 of 11". Just paste and go.

---

## Just talk to it

```
"Watch this YouTube tutorial and give me the exact steps as a numbered list"
```

```
"I recorded myself doing this task manually. Watch it and write an automation spec."
```

```
"Transcribe this meeting recording and pull out all the action items."
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

```
"Watch this TikTok and tell me exactly how they edited it — cuts, transitions, effects."
```

```
"Summarize this 1-hour conference talk in 5 bullet points. Include timestamps for the key moments."
```

---

## Supported sources

**Platforms:** YouTube, TikTok, Instagram Reels, Twitter/X, Facebook, Vimeo, Reddit, Twitch clips, LinkedIn, Dailymotion — and 1000+ more via yt-dlp.

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

Temp files are created during analysis and cleaned up automatically when the server stops. Or call `cleanup` at any time.

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

## Contributing

PRs welcome. If you find a bug, have a feature idea, or want to extend platform support — open an issue or just reach out directly.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<div align="center">

---

### Built by OA Maestro

<p>I build AI tools for founders, creators, and builders who don't have time to wait for the big players to catch up.</p>

<p>
  If this tool saved you time, helped you ship something, or just blew your mind —<br/>
  I'd genuinely love to hear about it. That's the whole reason I build these things.
</p>

**Get in touch:**

[realoamaestro@gmail.com](mailto:realoamaestro@gmail.com)

**Find me everywhere as** `@OAMaestro`

[GitHub](https://github.com/OAMaestro) &nbsp;·&nbsp; [YouTube](https://youtube.com/@OAMaestro) &nbsp;·&nbsp; [TikTok](https://tiktok.com/@OAMaestro) &nbsp;·&nbsp; [Instagram](https://instagram.com/OAMaestro) &nbsp;·&nbsp; [X / Twitter](https://x.com/OAMaestro)

<br/>

*If you're using this in a project, building something cool with it, or want to collaborate — slide into my DMs. I'm always down to connect with builders doing interesting things.*

<br/>

**MIT License** &nbsp;·&nbsp; Free forever &nbsp;·&nbsp; Use it. Build with it. Ship it.

---

</div>
