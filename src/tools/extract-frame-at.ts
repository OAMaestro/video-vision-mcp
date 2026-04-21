import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import * as sourceCache from '../lib/source-cache';
import { cacheVideo } from '../lib/source-cache';
import { checkPreFlight } from '../lib/preflight';
import { createJobDir, updateJobManifest } from '../lib/session-manager';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent } from '../types';

export async function extractFrameAtTool(
  args: {
    source: string;
    timestamp: string;
    max_width?: number;
    cookies?: string;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    const jobDir = await createJobDir(sessionDir);
    const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');

    let sourcePath: string;

    if (isRemote) {
      const cached = await sourceCache.findCachedVideo(args.source);
      if (cached) {
        sourcePath = cached;
      } else {
        const info = await ytdlp.getVideoInfo(args.source, args.cookies);
        const preflight = checkPreFlight(info.duration_seconds);
        if (!preflight.ok) {
          return [{ type: 'text', text: preflight.error ?? 'Preflight check failed.' }];
        }

        const downloadPath = join(jobDir, 'source.mp4');
        await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
        sourcePath = await cacheVideo(args.source, downloadPath);
        await updateJobManifest(jobDir, { source: args.source, source_type: 'remote' });
      }
    } else {
      sourcePath = args.source;
    }

    const outputPath = join(jobDir, `frame_at_${args.timestamp.replace(/:/g, '-')}.jpg`);
    await ffmpeg.extractFrameAt(sourcePath, args.timestamp, outputPath, args.max_width ?? 768);

    const buf = await fs.readFile(outputPath);
    const base64 = buf.toString('base64');

    return [
      { type: 'image', data: base64, mimeType: 'image/jpeg' },
      { type: 'text', text: `Frame at ${args.timestamp}` },
    ];
  } catch (err: any) {
    return [{ type: 'text', text: `Error extracting frame: ${err.message}` }];
  }
}
