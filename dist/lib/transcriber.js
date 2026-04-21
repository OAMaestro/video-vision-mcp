"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isModelCached = isModelCached;
exports.getTranscriber = getTranscriber;
exports.transcribeFile = transcribeFile;
exports.formatTranscript = formatTranscript;
const transformers_1 = require("@huggingface/transformers");
const path_1 = require("path");
const os_1 = require("os");
const fs = __importStar(require("fs/promises"));
const log = (msg) => process.stderr.write(`[OA Maestro] ${msg}\n`);
// Model cache lives in ~/.oamaestro/models — set BEFORE any pipeline call
transformers_1.env.cacheDir = (0, path_1.join)((0, os_1.homedir)(), '.oamaestro', 'models');
let transcriptionPipeline = null;
let initPromise = null;
async function isModelCached() {
    const modelDir = (0, path_1.join)((0, os_1.homedir)(), '.oamaestro', 'models', 'Xenova', 'whisper-base');
    try {
        await fs.access(modelDir);
        return true;
    }
    catch {
        return false;
    }
}
async function getBestDevice() {
    try {
        // WebGPU is available in some Node.js environments (v18+ with experimental flags)
        // Try it, fall back silently if not — no drama
        const nav = globalThis.navigator;
        if (nav?.gpu) {
            const adapter = await nav.gpu.requestAdapter();
            if (adapter)
                return 'webgpu';
        }
    }
    catch { /* not available — no worries */ }
    return 'cpu';
}
async function getTranscriber() {
    if (transcriptionPipeline !== null)
        return transcriptionPipeline;
    // Guard against concurrent calls both trying to initialize at the same time
    if (initPromise === null) {
        initPromise = (async () => {
            const device = await getBestDevice();
            log(`Loading Whisper on ${device === 'webgpu' ? 'GPU — nice, this will be fast' : 'CPU — solid, reliable, slightly caffeinated'}...`);
            const p = await (0, transformers_1.pipeline)('automatic-speech-recognition', 'Xenova/whisper-base', { device });
            transcriptionPipeline = p;
            return p;
        })().catch(err => {
            initPromise = null; // reset so the next call can retry
            throw err;
        });
    }
    return initPromise;
}
async function transcribeFile(audioPath, options) {
    const t = await getTranscriber();
    const result = await t(audioPath, {
        return_timestamps: options.returnTimestamps ?? true,
        language: options.language ?? null,
        chunk_length_s: 30,
        stride_length_s: 5,
    });
    return { text: result.text, chunks: result.chunks ?? [] };
}
function formatTime(seconds) {
    if (isNaN(seconds) || seconds == null)
        return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}
function toSrtTime(seconds) {
    if (isNaN(seconds) || seconds == null)
        seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
function formatTranscript(result, format) {
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
        .map((c, i) => `${i + 1}\n${toSrtTime(c.timestamp[0])} --> ${toSrtTime(c.timestamp[1])}\n${c.text.trim()}\n`)
        .join('\n');
}
//# sourceMappingURL=transcriber.js.map