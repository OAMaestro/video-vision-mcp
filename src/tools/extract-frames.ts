import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import * as sourceCache from '../lib/source-cache';
import { cacheVideo } from '../lib/source-cache';
import { checkPreFlight } from '../lib/preflight';
import { createJobDir, updateJobManifest } from '../lib/session-manager';
import { join } from 'path';
import { MCPContent, ExtractionOptions } from '../types';

export async function extractFramesTool(
  args: {
    source: string;
    mode: 'scene' | 'interval' | 'keyframe' | 'targeted' | 'overview';
    fps?: number;
    scene_threshold?: number;
    gap_fill_interval?: number;
    timestamps?: string[];
    max_frames?: number;
    output_dir?: string;
    start_time?: string;
    end_time?: string;
    cookies?: string;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    const jobDir = await createJobDir(sessionDir);
    const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');

    let sourcePath: string;
    let durationSeconds: number | undefined;

    if (isRemote) {
      const cached = await sourceCache.findCachedVideo(args.source);
      if (cached) {
        sourcePath = cached;
        // Get duration for overview mode
        if (args.mode === 'overview') {
          try {
            const info = await ffmpeg.getLocalVideoInfo(sourcePath);
            durationSeconds = info.duration_seconds;
          } catch {
            // best effort
          }
        }
      } else {
        const info = await ytdlp.getVideoInfo(args.source, args.cookies);
        const preflight = checkPreFlight(info.duration_seconds);
        if (!preflight.ok) {
          return [{ type: 'text', text: preflight.error ?? 'Preflight check failed.' }];
        }
        durationSeconds = info.duration_seconds;

        const downloadPath = join(jobDir, 'source.mp4');
        await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
        sourcePath = await cacheVideo(args.source, downloadPath);
        await updateJobManifest(jobDir, { source: args.source, source_type: 'remote' });
      }
    } else {
      sourcePath = args.source;
      if (args.mode === 'overview') {
        try {
          const info = await ffmpeg.getLocalVideoInfo(sourcePath);
          durationSeconds = info.duration_seconds;
        } catch {
          // best effort
        }
      }
    }

    const outputDir = args.output_dir ?? join(jobDir, 'frames');

    const opts: ExtractionOptions = {
      mode: args.mode,
      fps: args.fps,
      scene_threshold: args.scene_threshold,
      gap_fill_interval: args.gap_fill_interval,
      timestamps: args.timestamps,
      max_frames: args.max_frames,
      start_time: args.start_time,
      end_time: args.end_time,
      durationSeconds,
    };

    const framePaths = await ffmpeg.extractFrames(sourcePath, outputDir, opts);

    const results = framePaths.map((p, i) => {
      const filename = p.split(/[\\/]/).pop() ?? '';
      // Parse timestamp from filename pattern: frame_NNNN_HH-MM-SS.jpg
      const match = filename.match(/frame_\d+_(\d{2})-(\d{2})-(\d{2})\.jpg$/);
      let timestamp: string;
      if (match) {
        timestamp = `${match[1]}:${match[2]}:${match[3]}`;
      } else {
        timestamp = String(i);
      }
      const numMatch = filename.match(/frame_(\d+)/);
      const frame_number = numMatch ? parseInt(numMatch[1], 10) : i + 1;

      return { path: p, timestamp, frame_number };
    });

    return [{ type: 'text', text: JSON.stringify(results, null, 2) }];
  } catch (err: any) {
    return [{ type: 'text', text: `Error extracting frames: ${err.message}` }];
  }
}
