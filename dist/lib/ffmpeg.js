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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFFmpegPath = getFFmpegPath;
exports.getFFprobePath = getFFprobePath;
exports.spawnProcess = spawnProcess;
exports.getLocalVideoInfo = getLocalVideoInfo;
exports.extractFrames = extractFrames;
exports.extractFrameAt = extractFrameAt;
exports.extractAudio = extractAudio;
exports.extractEmbeddedSubtitles = extractEmbeddedSubtitles;
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
const ffprobe_1 = __importDefault(require("@ffprobe-installer/ffprobe"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path_1 = require("path");
const FFMPEG = ffmpeg_1.default.path;
const FFPROBE = ffprobe_1.default.path;
function getFFmpegPath() { return FFMPEG; }
function getFFprobePath() { return FFPROBE; }
function spawnProcess(bin, args) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)(bin, args);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                reject(new Error(stderr || `Process exited with code ${code}`));
            }
        });
        proc.on('error', (err) => reject(err));
    });
}
function secondsToHMS(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
async function getLocalVideoInfo(filePath) {
    const { stdout } = await spawnProcess(FFPROBE, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
    ]);
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s) => s.codec_type === 'video') ?? data.streams?.[0] ?? {};
    const format = data.format ?? {};
    const durationSec = parseFloat(format.duration ?? '0');
    const fpsRaw = videoStream.r_frame_rate ?? '25/1';
    const [num, den] = fpsRaw.split('/').map(Number);
    const fps = den ? Math.round((num / den) * 100) / 100 : num;
    const has_subtitles = (data.streams ?? []).some((s) => s.codec_type === 'subtitle');
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
async function extractFrames(input, outputDir, opts) {
    await fs.mkdir(outputDir, { recursive: true });
    const baseArgs = [];
    const vfParts = [];
    if (opts.start_time)
        baseArgs.push('-ss', opts.start_time);
    if (opts.end_time)
        baseArgs.push('-to', opts.end_time);
    baseArgs.push('-i', input);
    const outputPattern = (0, path_1.join)(outputDir, 'frame_%04d.jpg');
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
            await fs.rename((0, path_1.join)(outputDir, extracted[i]), (0, path_1.join)(outputDir, newName));
        }
    }
    else if (opts.mode === 'scene') {
        const threshold = opts.scene_threshold ?? 0.3;
        vfParts.push(`select='gt(scene,${threshold})'`, 'scale=768:-2', DRAWTEXT_FILTER);
        const args = [
            ...baseArgs,
            '-vf', vfParts.join(','),
            '-vsync', 'vfr',
            '-q:v', '3',
            outputPattern,
        ];
        await spawnProcess(FFMPEG, args);
    }
    else if (opts.mode === 'interval') {
        const fps = opts.fps ?? 1;
        vfParts.push(`fps=${fps}`, 'scale=768:-2', DRAWTEXT_FILTER);
        const args = [
            ...baseArgs,
            '-vf', vfParts.join(','),
            '-q:v', '3',
            outputPattern,
        ];
        await spawnProcess(FFMPEG, args);
    }
    else if (opts.mode === 'keyframe') {
        vfParts.push("select='eq(pict_type\\\\,I)'", 'scale=768:-2', DRAWTEXT_FILTER);
        const args = [
            ...baseArgs,
            '-vf', vfParts.join(','),
            '-vsync', 'vfr',
            '-q:v', '3',
            outputPattern,
        ];
        await spawnProcess(FFMPEG, args);
    }
    else if (opts.mode === 'targeted') {
        // Each timestamp is a separate extraction
        const timestamps = opts.timestamps ?? [];
        for (let i = 0; i < timestamps.length; i++) {
            const ts = timestamps[i];
            const outPath = (0, path_1.join)(outputDir, `frame_${String(i + 1).padStart(4, '0')}.jpg`);
            await extractFrameAt(input, ts, outPath, opts.max_width ?? 768);
        }
    }
    // Collect all .jpg files in outputDir
    const files = await fs.readdir(outputDir);
    return files
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .map(f => (0, path_1.join)(outputDir, f));
}
async function extractFrameAt(input, timestamp, outputPath, maxWidth = 768) {
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
async function extractAudio(input, outputPath) {
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
async function extractEmbeddedSubtitles(input, outputPath) {
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
        }
        catch {
            return false;
        }
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=ffmpeg.js.map