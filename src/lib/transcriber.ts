import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import { TranscriptResult } from '../types';

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

// Model cache lives in ~/.oamaestro/models — set BEFORE any pipeline call
env.cacheDir = join(homedir(), '.oamaestro', 'models');

// Remote Whisper (OpenAI-compatible) offload — opt-in via env. Unset = local std ONNX whisper.
const WHISPER_URL = (process.env.WHISPER_URL ?? '').replace(/\/+$/, '');
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? '';
const WHISPER_API_KEY = process.env.WHISPER_API_KEY ?? '';

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

function wavToFloat32Array(buf: Buffer): Float32Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 12; // skip RIFF<size>WAVE
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      const start = offset + 8;
      const n = Math.floor((buf.length - start) / 2);
      const i16 = new Int16Array(buf.buffer, buf.byteOffset + start, n);
      const f32 = new Float32Array(n);
      for (let i = 0; i < n; i++) f32[i] = i16[i] / 32768;
      return f32;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No data chunk found in WAV');
}

export async function transcribeFile(
  audioPath: string,
  options: { language?: string; returnTimestamps?: boolean }
): Promise<TranscriptResult> {
  if (WHISPER_URL) {
    try {
      return await transcribeRemote(audioPath);
    } catch (err: any) {
      log(`remote whisper failed (${err.message}) — falling back to local ONNX`);
    }
  }
  return transcribeLocal(audioPath, options);
}

async function transcribeLocal(
  audioPath: string,
  options: { language?: string; returnTimestamps?: boolean }
): Promise<TranscriptResult> {
  const t = await getTranscriber();
  const buf = await fs.readFile(audioPath);
  const samples = wavToFloat32Array(buf);
  const result = await t(samples, {
    return_timestamps: options.returnTimestamps ?? true,
    language: options.language ?? null,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return { text: result.text, chunks: result.chunks ?? [] };
}

// FILE-ONLY. Do NOT send response_format / timestamp_granularities — this server 500s on them.
async function transcribeRemote(audioPath: string): Promise<TranscriptResult> {
  const wav = await fs.readFile(audioPath); // extractAudio already emits 16k mono WAV
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
  if (WHISPER_MODEL) form.append('model', WHISPER_MODEL);
  const headers: Record<string, string> = {};
  if (WHISPER_API_KEY) headers.Authorization = `Bearer ${WHISPER_API_KEY}`;
  const resp = await fetch(WHISPER_URL, {
    method: 'POST',
    body: form,
    headers,
    signal: AbortSignal.timeout(300_000),
  });
  if (!resp.ok) throw new Error(`remote whisper HTTP ${resp.status}`);
  const j = await resp.json();
  return { text: j.text ?? '', chunks: [] }; // no segments from this server
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
  // Remote whisper returns no segments — fall back to plain text so we don't render blank.
  if (format === 'plain' || result.chunks.length === 0) {
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
