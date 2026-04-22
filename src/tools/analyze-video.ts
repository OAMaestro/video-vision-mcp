import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import * as frameExtractor from '../lib/frame-extractor';
import * as transcriber from '../lib/transcriber';
import * as sourceCache from '../lib/source-cache';
import { cacheVideo } from '../lib/source-cache';
import { checkPreFlight } from '../lib/preflight';
import { createJobDir, updateJobManifest } from '../lib/session-manager';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent, ExtractionOptions, VideoInfo } from '../types';

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

// Clean raw SRT into readable timestamped text so the AI gets signal, not noise
function cleanSrt(raw: string): string {
  return raw
    .split(/\n\n+/)
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      let ts = '';
      const text: string[] = [];
      for (const l of lines) {
        if (/^\d+$/.test(l)) continue; // SRT index number
        if (/^\d{2}:\d{2}:\d{2}/.test(l)) {
          const start = l.split('-->')[0].trim().replace(',', '.');
          const parts = start.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const s = Math.floor(parseFloat(parts[2]));
          ts = h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
        } else {
          text.push(l);
        }
      }
      return text.length ? `[${ts}] ${text.join(' ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

export async function analyzeVideoTool(
  args: {
    source: string;
    query: string;
    mode?: 'overview' | 'detailed' | 'full';
    start_time?: string;
    end_time?: string;
    scene_threshold?: number;
    gap_fill_interval?: number;
    max_frames?: number;
    cookies?: string;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    const jobDir = await createJobDir(sessionDir);
    const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');
    const mode = args.mode ?? 'overview';

    let sourcePath: string;
    let videoInfo: VideoInfo;
    let preflightWarning: string | undefined;

    if (isRemote) {
      // Get metadata first (no download yet)
      log('Reading video metadata...');
      videoInfo = await ytdlp.getVideoInfo(args.source, args.cookies);
      log(`Got it — "${videoInfo.title ?? args.source}" (${videoInfo.duration})`);

      // Run preflight
      const preflight = checkPreFlight(videoInfo.duration_seconds);
      if (!preflight.ok) {
        return [{ type: 'text', text: preflight.error ?? 'Preflight check failed.' }];
      }
      if (preflight.warning) {
        preflightWarning = preflight.warning;
      }

      // Check cache
      const cached = await sourceCache.findCachedVideo(args.source);
      if (cached) {
        log('Already downloaded this one. Using cache — look at us being efficient.');
        sourcePath = cached;
      } else {
        log('Downloading video... your AI is about to watch this so you don\'t have to.');
        const downloadPath = join(jobDir, 'source.mp4');
        await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
        // Move to persistent cache so the next session doesn't re-download
        sourcePath = await cacheVideo(args.source, downloadPath);
        await updateJobManifest(jobDir, { source: args.source, source_type: 'remote' });
        log('Download complete. Cached for 7 days — same URL next time is instant.');
      }
    } else {
      // Validate file exists
      try {
        await fs.access(args.source);
      } catch {
        return [{ type: 'text', text: `Error: File not found: ${args.source}` }];
      }
      log('Inspecting local file...');
      sourcePath = args.source;
      videoInfo = await ffmpeg.getLocalVideoInfo(sourcePath);
      log(`Local file ready — ${videoInfo.duration}`);
    }

    // Build extraction options
    let extractionOpts: ExtractionOptions;
    if (mode === 'overview') {
      extractionOpts = {
        mode: 'overview',
        durationSeconds: videoInfo.duration_seconds,
        max_frames: args.max_frames ?? 80,
        start_time: args.start_time,
        end_time: args.end_time,
      };
    } else {
      // detailed or full
      extractionOpts = {
        mode: 'scene',
        scene_threshold: args.scene_threshold ?? 0.2,
        gap_fill_interval: args.gap_fill_interval ?? 2,
        max_frames: args.max_frames ?? 80,
        start_time: args.start_time,
        end_time: args.end_time,
        durationSeconds: videoInfo.duration_seconds,
      };
    }

    log('Extracting frames + fetching captions simultaneously. Multitasking.');
    // Run frame extraction and caption download in parallel
    const [frameResult, captionResult] = await Promise.allSettled([
      frameExtractor.extractAndGrid(sourcePath, jobDir, extractionOpts),
      isRemote
        ? ytdlp.downloadSubtitles(args.source, jobDir, 'en', args.cookies)
        : ffmpeg.extractEmbeddedSubtitles(sourcePath, join(jobDir, 'subtitles.srt')),
    ]);

    // Process frame result
    const extractResult =
      frameResult.status === 'fulfilled'
        ? frameResult.value
        : { grids: [], frames: [], adjustedThreshold: undefined };

    // Process caption result
    let captionPath: string | null = null;
    if (captionResult.status === 'fulfilled') {
      const val = captionResult.value;
      if (typeof val === 'string') {
        captionPath = val; // URL path returned by downloadSubtitles
      } else if (val === true) {
        captionPath = join(jobDir, 'subtitles.srt'); // local embedded subtitle
      }
    }

    // Transcript logic
    let transcriptText = '';
    const hasCaptions = captionPath !== null;

    if (hasCaptions && mode !== 'full') {
      log('Captions found. Skipping Whisper — someone already did the transcription work for us.');
      try {
        const raw = await fs.readFile(captionPath!, 'utf-8');
        transcriptText = cleanSrt(raw);
      } catch {
        transcriptText = '';
      }
    } else if (hasCaptions && mode === 'full') {
      // Use Whisper for accuracy despite having captions
      try {
        const modelCached = await transcriber.isModelCached();
        if (!modelCached) {
          log('First-time setup: pulling down the Whisper speech model (~150MB). One-time thing. Grab a coffee.');
          log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
        }
        const audioPath = join(jobDir, 'audio.wav');
        log('Full mode: ripping the audio track...');
        await ffmpeg.extractAudio(sourcePath, audioPath);
        if (!modelCached) log('Model ready. That\'s the last time you\'ll see that message.');
        log('Whisper is listening... very attentively.');
        const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
        log('Transcription done.');
        transcriptText = transcriber.formatTranscript(result, 'timestamped');
      } catch (err: any) {
        log(`Whisper stumbled (${err.message}), falling back to captions.`);
        try {
          transcriptText = await fs.readFile(captionPath!, 'utf-8');
        } catch {
          transcriptText = '';
        }
      }
    } else if (!hasCaptions && videoInfo.duration_seconds < 600) {
      // No captions + short video: run Whisper
      try {
        const modelCached = await transcriber.isModelCached();
        if (!modelCached) {
          log('No captions found — time for plan B. Pulling Whisper model (~150MB, first time only).');
          log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
        } else {
          log('No captions — firing up Whisper.');
        }
        const audioPath = join(jobDir, 'audio.wav');
        log('Extracting audio track...');
        await ffmpeg.extractAudio(sourcePath, audioPath);
        if (!modelCached) log('Model cached. Never downloading that again.');
        log('Whisper is listening... unlike most people at meetings.');
        const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
        log('Transcription complete.');
        const modelNote = modelCached ? '' : 'Note: Whisper model downloaded and cached (~150MB). Future runs are instant.\n\n';
        transcriptText = modelNote + transcriber.formatTranscript(result, 'timestamped');
      } catch (err: any) {
        transcriptText = `Audio transcription failed (${err.message}). Visual analysis only.`;
      }
    } else if (!hasCaptions && videoInfo.duration_seconds >= 600) {
      // No captions + long video: run Whisper
      const mins = Math.round(videoInfo.duration_seconds / 60);
      try {
        const modelCached = await transcriber.isModelCached();
        if (!modelCached) {
          log(`${mins}-minute video, no captions. Pulling Whisper model first (~150MB, one-time).`);
          log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
        } else {
          log(`No captions on a ${mins}min video. Running Whisper — this is the slow part.`);
        }
        const audioPath = join(jobDir, 'audio.wav');
        log(`Extracting audio from ${mins}min video...`);
        await ffmpeg.extractAudio(sourcePath, audioPath);
        if (!modelCached) log('Model cached. Never doing that again.');
        log(`Whisper is chewing through ${mins} minutes of audio. We're working on GPU support. Promise.`);
        const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
        log('Transcription done. Worth the wait.');
        const modelNote = modelCached ? '' : 'Note: Whisper model downloaded and cached (~150MB). Future runs are instant.\n\n';
        transcriptText =
          modelNote +
          `No captions found. Transcribed ${mins}min audio with local Whisper.\n\n` +
          transcriber.formatTranscript(result, 'timestamped');
      } catch (err: any) {
        transcriptText = `Audio transcription failed (${err.message}). Visual analysis only.`;
      }
    }

    // Build content array
    const content: MCPContent[] = [];

    // Prepend preflight warning if any
    if (preflightWarning) {
      content.push({ type: 'text', text: `Warning: ${preflightWarning}` });
    }

    // Note about adjusted threshold
    let thresholdNote = '';
    if (extractResult.adjustedThreshold !== undefined) {
      thresholdNote = `Note: Scene threshold was automatically adjusted to ${extractResult.adjustedThreshold.toFixed(2)} to reduce frame count.\n\n`;
    }

    const { grids, frames } = extractResult;

    if (grids.length === 0 && frames.length > 0) {
      // Return individual frame images
      for (const frame of frames) {
        try {
          const buf = await fs.readFile(frame.path);
          const b64 = buf.toString('base64');
          content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' });
        } catch {
          // skip unreadable frames
        }
      }
      const summary =
        thresholdNote +
        `Video: ${videoInfo.title ?? args.source}\n` +
        `Duration: ${videoInfo.duration}\n` +
        `Frames: ${frames.length}\n\n` +
        (transcriptText ? `Transcript:\n${transcriptText}` : '');
      content.push({ type: 'text', text: summary });
    } else if (grids.length === 1) {
      const grid = grids[0];
      const buf = await fs.readFile(grid.path);
      const b64 = buf.toString('base64');
      content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' });
      const summary =
        thresholdNote +
        `Video: ${videoInfo.title ?? args.source}\n` +
        `Duration: ${videoInfo.duration} | Frames: ${grid.frame_count} | Range: ${grid.time_start} – ${grid.time_end}\n\n` +
        (transcriptText ? `Transcript:\n${transcriptText}` : '');
      content.push({ type: 'text', text: summary });
    } else if (grids.length > 1) {
      // Multiple grids
      const overview =
        thresholdNote +
        `Video: ${videoInfo.title ?? args.source}\n` +
        `Duration: ${videoInfo.duration} | Total frames: ${frames.length} | Grids: ${grids.length}`;
      content.push({ type: 'text', text: overview });

      for (let i = 0; i < grids.length; i++) {
        const grid = grids[i];
        const buf = await fs.readFile(grid.path);
        const b64 = buf.toString('base64');
        content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' });

        const gridLabel = `Grid ${i + 1}/${grids.length} | ${grid.time_start} – ${grid.time_end} | ${grid.frame_count} frames`;
        // Include transcript section for this grid if we have chunks
        content.push({ type: 'text', text: gridLabel });
      }

      // Append transcript at the end if we have one
      if (transcriptText) {
        content.push({ type: 'text', text: `Transcript:\n${transcriptText}` });
      }
    } else {
      // No grids, no frames
      const msg =
        thresholdNote +
        `Video: ${videoInfo.title ?? args.source}\n` +
        `Duration: ${videoInfo.duration}\n` +
        'No frames could be extracted from this video.\n\n' +
        (transcriptText ? `Transcript:\n${transcriptText}` : '');
      content.push({ type: 'text', text: msg });
    }

    log('Done. Your AI can now see and hear this. — OA Maestro, everywhere. @OAMaestro on all socials.');
    return content;
  } catch (err: any) {
    return [{ type: 'text', text: `Error analyzing video: ${err.message}` }];
  }
}
