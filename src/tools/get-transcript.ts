import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent } from '../types';
import { createJobDir } from '../lib/session-manager';

const NO_CAPTIONS_MSG =
  'No captions found for this video. Use the `transcribe_audio` tool to generate a transcript using local speech recognition.';

function parseSrtToPlain(srt: string): string {
  // Remove SRT numbering and timestamps, keep only text
  return srt
    .replace(/^\d+\s*$/gm, '')
    .replace(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\s*$/gm, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ');
}

function parseSrtToTimestamped(srt: string): string {
  const blocks = srt.split(/\n\n+/).filter(Boolean);
  const lines: string[] = [];
  for (const block of blocks) {
    const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (blockLines.length < 2) continue;
    // blockLines[0] might be a number, blockLines[1] might be timestamp
    let tsLine = '';
    let textLines: string[] = [];
    for (const bl of blockLines) {
      if (/^\d+$/.test(bl)) continue; // SRT index
      if (/^\d{2}:\d{2}:\d{2}/.test(bl)) {
        tsLine = bl.split('-->')[0].trim().replace(',', '.');
        // Convert HH:MM:SS.mmm to M:SS
        const parts = tsLine.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseFloat(parts[2]);
        const totalM = h * 60 + m;
        const sFloor = Math.floor(s);
        tsLine = `${totalM}:${String(sFloor).padStart(2, '0')}`;
      } else {
        textLines.push(bl);
      }
    }
    if (textLines.length > 0) {
      lines.push(`[${tsLine}] ${textLines.join(' ')}`);
    }
  }
  return lines.join('\n');
}

export async function getTranscriptTool(
  args: {
    source: string;
    language?: string;
    format: 'timestamped' | 'plain' | 'srt';
    cookies?: string;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');

    if (isRemote) {
      const jobDir = await createJobDir(sessionDir);
      const srtPath = await ytdlp.downloadSubtitles(
        args.source,
        jobDir,
        args.language ?? 'en',
        args.cookies
      );
      if (!srtPath) {
        return [{ type: 'text', text: NO_CAPTIONS_MSG }];
      }
      const raw = await fs.readFile(srtPath, 'utf-8');
      const formatted = formatSrt(raw, args.format);
      return [{ type: 'text', text: formatted }];
    } else {
      const jobDir = await createJobDir(sessionDir);
      const tempSrt = join(jobDir, 'subtitles.srt');
      const success = await ffmpeg.extractEmbeddedSubtitles(args.source, tempSrt);
      if (!success) {
        return [{ type: 'text', text: NO_CAPTIONS_MSG }];
      }
      const raw = await fs.readFile(tempSrt, 'utf-8');
      const formatted = formatSrt(raw, args.format);
      return [{ type: 'text', text: formatted }];
    }
  } catch (err: any) {
    return [{ type: 'text', text: `Error getting transcript: ${err.message}` }];
  }
}

function formatSrt(raw: string, format: 'timestamped' | 'plain' | 'srt'): string {
  if (format === 'srt') return raw;
  if (format === 'plain') return parseSrtToPlain(raw);
  return parseSrtToTimestamped(raw);
}
