import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import { TranscriptResult } from '../types';

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

// Model cache lives in ~/.oamaestro/models — set BEFORE any pipeline call
env.cacheDir = join(homedir(), '.oamaestro', 'models');

let transcriptionPipeline: any = null;
let initPromise: Promise<any> | null = null;

export async function isModelCached(): Promise<boolean> {
  const modelDir = join(homedir(), '.oamaestro', 'models', 'Xenova', 'whisper-base');
  try {
    await fs.access(modelDir);
    return true;
  } catch {
    return false;
  }
}

async function getBestDevice(): Promise<'webgpu' | 'cpu'> {
  try {
    // WebGPU is available in some Node.js environments (v18+ with experimental flags)
    // Try it, fall back silently if not — no drama
    const nav = globalThis.navigator as any;
    if (nav?.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch { /* not available — no worries */ }
  return 'cpu';
}

export async function getTranscriber(): Promise<any> {
  if (transcriptionPipeline !== null) return transcriptionPipeline;

  // Guard against concurrent calls both trying to initialize at the same time
  if (initPromise === null) {
    initPromise = (async () => {
      const device = await getBestDevice();
      log(`Loading Whisper on ${device === 'webgpu' ? 'GPU — nice, this will be fast' : 'CPU — solid, reliable, slightly caffeinated'}...`);
      const p = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { device });
      transcriptionPipeline = p;
      return p;
    })().catch(err => {
      initPromise = null; // reset so the next call can retry
      throw err;
    });
  }

  return initPromise;
}

export async function transcribeFile(
  audioPath: string,
  options: { language?: string; returnTimestamps?: boolean }
): Promise<TranscriptResult> {
  const t = await getTranscriber();
  const result = await t(audioPath, {
    return_timestamps: options.returnTimestamps ?? true,
    language: options.language ?? null,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return { text: result.text, chunks: result.chunks ?? [] };
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds == null) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toSrtTime(seconds: number): string {
  if (isNaN(seconds) || seconds == null) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatTranscript(result: TranscriptResult, format: 'plain' | 'timestamped' | 'srt'): string {
  if (format === 'plain') {
    return result.text.trim();
  }
  if (format === 'timestamped') {
    return result.chunks
      .map(c => `[${formatTime(c.timestamp[0])}] ${c.text.trim()}`)
      .join('\n');
  }
  // srt
  return result.chunks
    .map((c, i) =>
      `${i + 1}\n${toSrtTime(c.timestamp[0])} --> ${toSrtTime(c.timestamp[1])}\n${c.text.trim()}\n`
    )
    .join('\n');
}
