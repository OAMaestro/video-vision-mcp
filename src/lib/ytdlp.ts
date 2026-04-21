import YTDlpWrap from 'yt-dlp-wrap';
import { join } from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import { spawnSync } from 'child_process';
import { VideoInfo } from '../types';
import { BIN_DIR } from './session-manager';

const BIN_PATH = join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const VERSION_CACHE_PATH = join(homedir(), '.oamaestro', 'ytdlp-version.json');

function secondsToHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Returns true if the binary at BIN_PATH is a valid yt-dlp executable */
async function isBinaryValid(): Promise<boolean> {
  try {
    await fs.access(BIN_PATH);
    const result = spawnSync(BIN_PATH, ['--version'], { timeout: 10000, encoding: 'utf-8' });
    return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

async function downloadBinary(): Promise<void> {
  await fs.mkdir(BIN_DIR, { recursive: true });
  log('First-time setup: downloading yt-dlp (knows 1000+ platforms, very overachieving)...');
  log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');

  // Direct download URL — avoids GitHub API rate limits entirely
  const platform = process.platform;
  const filename = platform === 'win32' ? 'yt-dlp.exe'
    : platform === 'darwin' ? 'yt-dlp_macos'
    : 'yt-dlp';
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`;

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp (HTTP ${response.status}). Check your internet connection.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Detect HTML response before writing (GitHub rate-limit pages are HTML)
  if (buffer.slice(0, 200).toString('utf-8').toLowerCase().includes('<!doctype')) {
    throw new Error('yt-dlp download returned an HTML page (GitHub rate limit). Try again in a few minutes.');
  }

  await fs.writeFile(BIN_PATH, buffer);

  // Make executable on Mac/Linux
  if (platform !== 'win32') {
    await fs.chmod(BIN_PATH, 0o755);
  }

  if (!(await isBinaryValid())) {
    try { await fs.unlink(BIN_PATH); } catch { /* ignore */ }
    throw new Error('yt-dlp download produced an invalid binary. Try again or download manually to: ' + BIN_PATH);
  }
  log('yt-dlp ready. 1000+ platforms, zero subscriptions.');
}

async function ensureBinary(): Promise<void> {
  // If binary exists and is valid, do version check; otherwise download
  const valid = await isBinaryValid();

  if (!valid) {
    await downloadBinary();
  }

  // Check version cache (non-blocking — failure is fine)
  try {
    let shouldCheck = true;
    try {
      const cacheRaw = await fs.readFile(VERSION_CACHE_PATH, 'utf-8');
      const cache = JSON.parse(cacheRaw) as { version: string; checked_at: number };
      const age = Date.now() - cache.checked_at;
      if (age < 24 * 60 * 60 * 1000) {
        shouldCheck = false;
      }
    } catch {
      shouldCheck = true;
    }

    if (shouldCheck) {
      const response = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
      const data = await response.json() as { tag_name: string };
      const latestTag = data.tag_name;

      let cachedVersion = '';
      try {
        const cacheRaw = await fs.readFile(VERSION_CACHE_PATH, 'utf-8');
        const cache = JSON.parse(cacheRaw) as { version: string; checked_at: number };
        cachedVersion = cache.version;
      } catch {
        // no cache
      }

      if (latestTag && latestTag !== cachedVersion) {
        // Try to update — don't fail if update download is bad
        try {
          await downloadBinary();
        } catch {
          // Update failed — existing binary still works
        }
      }

      await fs.writeFile(
        VERSION_CACHE_PATH,
        JSON.stringify({ version: latestTag, checked_at: Date.now() }, null, 2)
      );
    }
  } catch {
    // Network errors — binary still works
  }
}

export function getClient(): YTDlpWrap {
  return new YTDlpWrap(BIN_PATH);
}

export async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  await ensureBinary();
  const client = getClient();
  const args: string[] = ['--dump-json', url];
  if (cookies) args.push('--cookies', cookies);
  const json = await client.execPromise(args);
  const info = JSON.parse(json);

  return {
    title: info.title,
    duration: secondsToHMS(info.duration ?? 0),
    duration_seconds: info.duration ?? 0,
    fps: info.fps ?? 25,
    resolution: `${info.width ?? 0}x${info.height ?? 0}`,
    format: info.ext ?? 'mp4',
    estimated_download_mb: Math.round((info.duration * 100) / 1024),
    has_subtitles: !!(info.subtitles && Object.keys(info.subtitles).length > 0),
    subtitle_languages: info.subtitles ? Object.keys(info.subtitles) : [],
    uploader: info.uploader,
    upload_date: info.upload_date,
  };
}

export async function downloadVideo(
  url: string,
  outputPath: string,
  options: { cookies?: string }
): Promise<void> {
  await ensureBinary();
  const client = getClient();
  const args: string[] = [
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    url,
  ];
  if (options.cookies) args.push('--cookies', options.cookies);
  await client.execPromise(args);
}

export async function downloadSubtitles(
  url: string,
  outputDir: string,
  language: string,
  cookies?: string
): Promise<string | null> {
  try {
    await ensureBinary();
    const client = getClient();
    const args: string[] = [
      '--write-subs',
      '--write-auto-subs',
      '--skip-download',
      '--sub-lang', language,
      '--sub-format', 'srt',
      '-o', join(outputDir, 'subtitle'),
      url,
    ];
    if (cookies) args.push('--cookies', cookies);
    await client.execPromise(args);

    // Check outputDir for any .srt or .vtt file
    const files = await fs.readdir(outputDir);
    const subFile = files.find(f => f.endsWith('.srt') || f.endsWith('.vtt'));
    if (subFile) return join(outputDir, subFile);
    return null;
  } catch {
    return null;
  }
}
