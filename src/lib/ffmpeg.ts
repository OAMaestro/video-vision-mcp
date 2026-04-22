import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { join } from 'path';
import { ExtractionOptions, VideoInfo } from '../types';

const FFMPEG: string = (ffmpegInstaller as any).path;
const FFPROBE: string = (ffprobeInstaller as any).path;

export function getFFmpegPath(): string { return FFMPEG; }
export function getFFprobePath(): string { return FFPROBE; }

export function spawnProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });
    proc.on('error', (err) => reject(err));
  });
}

function secondsToHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function getLocalVideoInfo(filePath: string): Promise<VideoInfo> {
  const { stdout } = await spawnProcess(FFPROBE, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const videoStream = data.streams?.find((s: any) => s.codec_type === 'video') ?? data.streams?.[0] ?? {};
  const format = data.format ?? {};

  const durationSec = parseFloat(format.duration ?? '0');
  const fpsRaw: string = videoStream.r_frame_rate ?? '25/1';
  const [num, den] = fpsRaw.split('/').map(Number);
  const fps = den ? Math.round((num / den) * 100) / 100 : num;

  const has_subtitles = (data.streams ?? []).some((s: any) => s.codec_type === 'subtitle');

  return {
    title: format.tags?.title,
    duration: secondsToHMS(durationSec),
    duration_seconds: durationSec,
    fps,
    resolution: `${videoStream.width ?? 0}x${videoStream.height ?? 0}`,
    format: format.format_name ?? 'unknown',
    has_subtitles,
    subtitle_languages: [],
  };
}

const DRAWTEXT_FILTER = "drawtext=text='%{pts\\\\:hms}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4";

function parsePtsTimes(stderr: string): number[] {
  const times: number[] = [];
  const re = /\bpts_time:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    times.push(parseFloat(m[1]));
  }
  if (times.length === 0) {
    process.stderr.write(`[OA Maestro] parsePtsTimes: found 0 timestamps in stderr\n`);
  }
  return times;
}

async function renameFramesWithTimes(outputDir: string, ptsTimes: number[], durationSeconds?: number): Promise<void> {
  const files = (await fs.readdir(outputDir))
    .filter(f => /^frame_\d{4}\.jpg$/.test(f))
    .sort();

  let timesToUse: number[];
  if (ptsTimes.length >= files.length) {
    timesToUse = ptsTimes;
  } else if (ptsTimes.length === 0 && durationSeconds !== undefined && durationSeconds > 0) {
    // fallback: distribute evenly across video duration
    process.stderr.write(`[OA Maestro] renameFramesWithTimes: no pts timestamps, using synthetic distribution over ${durationSeconds}s\n`);
    timesToUse = files.map((_, i) => (durationSeconds / files.length) * i);
  } else if (ptsTimes.length > 0 && ptsTimes.length < files.length) {
    process.stderr.write(`[OA Maestro] renameFramesWithTimes: pts timestamps (${ptsTimes.length}) fewer than files (${files.length}), using available\n`);
    // extend with evenly-distributed tail for frames beyond ptsTimes coverage
    if (durationSeconds && durationSeconds > 0) {
      const covered = ptsTimes.length;
      const tail = files.slice(covered).map((_, i) =>
        ptsTimes[covered - 1] + ((durationSeconds - ptsTimes[covered - 1]) / (files.length - covered)) * (i + 1)
      );
      timesToUse = [...ptsTimes, ...tail];
    } else {
      timesToUse = ptsTimes; // best-effort: last frames stay unrenamed
    }
  } else {
    process.stderr.write(`[OA Maestro] renameFramesWithTimes: no timestamps and no duration — skipping rename\n`);
    return;
  }

  for (let i = 0; i < files.length && i < timesToUse.length; i++) {
    const sec = timesToUse[i];
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const tsTag = `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`;
    const newName = files[i].replace('.jpg', `_${tsTag}.jpg`);
    try {
      await fs.rename(join(outputDir, files[i]), join(outputDir, newName));
    } catch (err: any) {
      process.stderr.write(`[OA Maestro] rename failed: ${files[i]} → ${newName}: ${err.message}\n`);
    }
  }
}

export async function extractFrames(
  input: string,
  outputDir: string,
  opts: ExtractionOptions
): Promise<string[]> {
  await fs.mkdir(outputDir, { recursive: true });

  const baseArgs: string[] = [];
  const vfParts: string[] = [];

  if (opts.start_time) baseArgs.push('-ss', opts.start_time);
  if (opts.end_time) baseArgs.push('-to', opts.end_time);
  baseArgs.push('-i', input);

  const outputPattern = join(outputDir, 'frame_%04d.jpg');

  if (opts.mode === 'overview') {
    const dur = opts.durationSeconds ?? 60;
    const interval = Math.max(1, Math.floor(dur / 14));
    vfParts.push(`fps=1/${interval}`, 'scale=768:-2', DRAWTEXT_FILTER);
    const args = [
      ...baseArgs,
      '-vf', vfParts.join(','),
      '-frames:v', '14',
      '-q:v', '3',
      outputPattern,
    ];
    await spawnProcess(FFMPEG, args);

    // Rename frame_NNNN.jpg → frame_NNNN_HH-MM-SS.jpg so grid labels actually work.
    // Timestamps are deterministic for overview mode: frame i is at i * interval seconds.
    const extracted = (await fs.readdir(outputDir)).filter(f => /^frame_\d{4}\.jpg$/.test(f)).sort();
    for (let i = 0; i < extracted.length; i++) {
      const ts = i * interval;
      const h = Math.floor(ts / 3600);
      const m = Math.floor((ts % 3600) / 60);
      const s = ts % 60;
      const tsTag = `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`;
      const newName = extracted[i].replace('.jpg', `_${tsTag}.jpg`);
      try {
        await fs.rename(join(outputDir, extracted[i]), join(outputDir, newName));
      } catch (err: any) {
        process.stderr.write(`[OA Maestro] rename failed: ${extracted[i]} → ${newName}: ${err.message}\n`);
      }
    }
  } else if (opts.mode === 'scene') {
    const threshold = opts.scene_threshold ?? 0.3;
    vfParts.push(`select='gt(scene,${threshold})'`, 'showinfo', 'scale=768:-2', DRAWTEXT_FILTER);
    const args = [
      ...baseArgs,
      '-vf', vfParts.join(','),
      '-vsync', 'vfr',
      '-q:v', '3',
      outputPattern,
    ];
    const { stderr } = await spawnProcess(FFMPEG, args);
    const ptsTimes = parsePtsTimes(stderr);
    await renameFramesWithTimes(outputDir, ptsTimes, opts.durationSeconds);
  } else if (opts.mode === 'interval') {
    const fps = opts.fps ?? 1;
    vfParts.push(`fps=${fps}`, 'showinfo', 'scale=768:-2', DRAWTEXT_FILTER);
    const args = [
      ...baseArgs,
      '-vf', vfParts.join(','),
      '-q:v', '3',
      outputPattern,
    ];
    const { stderr } = await spawnProcess(FFMPEG, args);
    const ptsTimes = parsePtsTimes(stderr);
    await renameFramesWithTimes(outputDir, ptsTimes, opts.durationSeconds);
  } else if (opts.mode === 'keyframe') {
    vfParts.push("select='eq(pict_type\\\\,I)'", 'showinfo', 'scale=768:-2', DRAWTEXT_FILTER);
    const args = [
      ...baseArgs,
      '-vf', vfParts.join(','),
      '-vsync', 'vfr',
      '-q:v', '3',
      outputPattern,
    ];
    const { stderr } = await spawnProcess(FFMPEG, args);
    const ptsTimes = parsePtsTimes(stderr);
    await renameFramesWithTimes(outputDir, ptsTimes, opts.durationSeconds);
  } else if (opts.mode === 'targeted') {
    // Each timestamp is a separate extraction
    const timestamps = opts.timestamps ?? [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const outPath = join(outputDir, `frame_${String(i + 1).padStart(4, '0')}.jpg`);
      await extractFrameAt(input, ts, outPath, opts.max_width ?? 768);
    }
  }

  // Collect all .jpg files in outputDir
  const files = await fs.readdir(outputDir);
  return files
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => join(outputDir, f));
}

export async function extractFrameAt(
  input: string,
  timestamp: string,
  outputPath: string,
  maxWidth = 768
): Promise<void> {
  const vf = `scale=${maxWidth}:-2,${DRAWTEXT_FILTER}`;
  const args = [
    '-ss', timestamp,
    '-i', input,
    '-vframes', '1',
    '-vf', vf,
    '-q:v', '3',
    outputPath,
  ];
  await spawnProcess(FFMPEG, args);
}

export async function extractAudio(input: string, outputPath: string): Promise<void> {
  const args = [
    '-i', input,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    '-y',
    outputPath,
  ];
  await spawnProcess(FFMPEG, args);
}

export async function extractEmbeddedSubtitles(input: string, outputPath: string): Promise<boolean> {
  try {
    await spawnProcess(FFMPEG, [
      '-i', input,
      '-map', '0:s:0',
      '-f', 'srt',
      '-y',
      outputPath,
    ]);
    // Check if file was actually created and has content
    try {
      const stat = await fs.stat(outputPath);
      return stat.size > 0;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
