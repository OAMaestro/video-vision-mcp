import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import * as transcriber from '../lib/transcriber';
import * as sourceCache from '../lib/source-cache';
import { cacheVideo } from '../lib/source-cache';
import { checkPreFlight } from '../lib/preflight';
import { createJobDir, updateJobManifest } from '../lib/session-manager';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent } from '../types';

export async function transcribeAudioTool(
  args: {
    source: string;
    language?: string;
    format?: 'timestamped' | 'plain' | 'srt';
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

    if (isRemote) {
      // Check cache first
      const cached = await sourceCache.findCachedVideo(args.source);
      if (cached) {
        sourcePath = cached;
      } else {
        // Get video info for preflight
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

    // Extract audio
    const audioPath = join(jobDir, 'audio.wav');
    let audioExists = false;
    try {
      await fs.access(audioPath);
      audioExists = true;
    } catch {
      audioExists = false;
    }
    if (!audioExists) {
      await ffmpeg.extractAudio(sourcePath, audioPath);
    }

    // Check if model is cached — note first-run download
    const modelCached = await transcriber.isModelCached();
    let prefixNote = '';
    if (!modelCached) {
      prefixNote = 'Note: Downloading Whisper model for the first time (~150MB). This will take a moment.\n\n';
    }

    const result = await transcriber.transcribeFile(audioPath, {
      language: args.language,
      returnTimestamps: true,
    });

    const formatted = transcriber.formatTranscript(result, args.format ?? 'timestamped');
    const finalText = prefixNote + formatted;

    return [{ type: 'text', text: finalText }];
  } catch (err: any) {
    return [{ type: 'text', text: `Error transcribing audio: ${err.message}` }];
  }
}
