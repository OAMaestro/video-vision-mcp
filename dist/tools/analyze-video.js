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
exports.analyzeVideoTool = analyzeVideoTool;
const ytdlp = __importStar(require("../lib/ytdlp"));
const ffmpeg = __importStar(require("../lib/ffmpeg"));
const frameExtractor = __importStar(require("../lib/frame-extractor"));
const transcriber = __importStar(require("../lib/transcriber"));
const sourceCache = __importStar(require("../lib/source-cache"));
const source_cache_1 = require("../lib/source-cache");
const preflight_1 = require("../lib/preflight");
const session_manager_1 = require("../lib/session-manager");
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
const log = (msg) => process.stderr.write(`[OA Maestro] ${msg}\n`);
// Clean raw SRT into readable timestamped text so the AI gets signal, not noise
function cleanSrt(raw) {
    return raw
        .split(/\n\n+/)
        .filter(Boolean)
        .map(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        let ts = '';
        const text = [];
        for (const l of lines) {
            if (/^\d+$/.test(l))
                continue; // SRT index number
            if (/^\d{2}:\d{2}:\d{2}/.test(l)) {
                const start = l.split('-->')[0].trim().replace(',', '.');
                const parts = start.split(':');
                const h = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const s = Math.floor(parseFloat(parts[2]));
                ts = h > 0
                    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    : `${m}:${String(s).padStart(2, '0')}`;
            }
            else {
                text.push(l);
            }
        }
        return text.length ? `[${ts}] ${text.join(' ')}` : '';
    })
        .filter(Boolean)
        .join('\n');
}
async function analyzeVideoTool(args, sessionDir) {
    try {
        const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
        const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');
        const mode = args.mode ?? 'overview';
        let sourcePath;
        let videoInfo;
        let preflightWarning;
        if (isRemote) {
            // Get metadata first (no download yet)
            log('Reading video metadata...');
            videoInfo = await ytdlp.getVideoInfo(args.source, args.cookies);
            log(`Got it — "${videoInfo.title ?? args.source}" (${videoInfo.duration})`);
            // Run preflight
            const preflight = (0, preflight_1.checkPreFlight)(videoInfo.duration_seconds);
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
            }
            else {
                log('Downloading video... your AI is about to watch this so you don\'t have to.');
                const downloadPath = (0, path_1.join)(jobDir, 'source.mp4');
                await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
                // Move to persistent cache so the next session doesn't re-download
                sourcePath = await (0, source_cache_1.cacheVideo)(args.source, downloadPath);
                await (0, session_manager_1.updateJobManifest)(jobDir, { source: args.source, source_type: 'remote' });
                log('Download complete. Cached for 7 days — same URL next time is instant.');
            }
        }
        else {
            // Validate file exists
            try {
                await fs.access(args.source);
            }
            catch {
                return [{ type: 'text', text: `Error: File not found: ${args.source}` }];
            }
            log('Inspecting local file...');
            sourcePath = args.source;
            videoInfo = await ffmpeg.getLocalVideoInfo(sourcePath);
            log(`Local file ready — ${videoInfo.duration}`);
        }
        // Build extraction options
        let extractionOpts;
        if (mode === 'overview') {
            extractionOpts = {
                mode: 'overview',
                durationSeconds: videoInfo.duration_seconds,
                max_frames: args.max_frames ?? 80,
                start_time: args.start_time,
                end_time: args.end_time,
            };
        }
        else {
            // detailed or full
            extractionOpts = {
                mode: 'scene',
                scene_threshold: args.scene_threshold ?? 0.2,
                max_frames: args.max_frames ?? 80,
                start_time: args.start_time,
                end_time: args.end_time,
            };
        }
        log('Extracting frames + fetching captions simultaneously. Multitasking.');
        // Run frame extraction and caption download in parallel
        const [frameResult, captionResult] = await Promise.allSettled([
            frameExtractor.extractAndGrid(sourcePath, jobDir, extractionOpts),
            isRemote
                ? ytdlp.downloadSubtitles(args.source, jobDir, 'en', args.cookies)
                : ffmpeg.extractEmbeddedSubtitles(sourcePath, (0, path_1.join)(jobDir, 'subtitles.srt')),
        ]);
        // Process frame result
        const extractResult = frameResult.status === 'fulfilled'
            ? frameResult.value
            : { grids: [], frames: [], adjustedThreshold: undefined };
        // Process caption result
        let captionPath = null;
        if (captionResult.status === 'fulfilled') {
            const val = captionResult.value;
            if (typeof val === 'string') {
                captionPath = val; // URL path returned by downloadSubtitles
            }
            else if (val === true) {
                captionPath = (0, path_1.join)(jobDir, 'subtitles.srt'); // local embedded subtitle
            }
        }
        // Transcript logic
        let transcriptText = '';
        const hasCaptions = captionPath !== null;
        if (hasCaptions && mode !== 'full') {
            log('Captions found. Skipping Whisper — someone already did the transcription work for us.');
            try {
                const raw = await fs.readFile(captionPath, 'utf-8');
                transcriptText = cleanSrt(raw);
            }
            catch {
                transcriptText = '';
            }
        }
        else if (hasCaptions && mode === 'full') {
            // Use Whisper for accuracy despite having captions
            try {
                const modelCached = await transcriber.isModelCached();
                if (!modelCached) {
                    log('First-time setup: pulling down the Whisper speech model (~150MB). One-time thing. Grab a coffee.');
                    log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
                }
                const audioPath = (0, path_1.join)(jobDir, 'audio.wav');
                log('Full mode: ripping the audio track...');
                await ffmpeg.extractAudio(sourcePath, audioPath);
                if (!modelCached)
                    log('Model ready. That\'s the last time you\'ll see that message.');
                log('Whisper is listening... very attentively.');
                const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
                log('Transcription done.');
                transcriptText = transcriber.formatTranscript(result, 'timestamped');
            }
            catch (err) {
                log(`Whisper stumbled (${err.message}), falling back to captions.`);
                try {
                    transcriptText = await fs.readFile(captionPath, 'utf-8');
                }
                catch {
                    transcriptText = '';
                }
            }
        }
        else if (!hasCaptions && videoInfo.duration_seconds < 600) {
            // No captions + short video: run Whisper
            try {
                const modelCached = await transcriber.isModelCached();
                if (!modelCached) {
                    log('No captions found — time for plan B. Pulling Whisper model (~150MB, first time only).');
                    log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
                }
                else {
                    log('No captions — firing up Whisper.');
                }
                const audioPath = (0, path_1.join)(jobDir, 'audio.wav');
                log('Extracting audio track...');
                await ffmpeg.extractAudio(sourcePath, audioPath);
                if (!modelCached)
                    log('Model cached. Never downloading that again.');
                log('Whisper is listening... unlike most people at meetings.');
                const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
                log('Transcription complete.');
                const modelNote = modelCached ? '' : 'Note: Whisper model downloaded and cached (~150MB). Future runs are instant.\n\n';
                transcriptText = modelNote + transcriber.formatTranscript(result, 'timestamped');
            }
            catch (err) {
                transcriptText = `Audio transcription failed (${err.message}). Visual analysis only.`;
            }
        }
        else if (!hasCaptions && videoInfo.duration_seconds >= 600) {
            // No captions + long video: run Whisper
            const mins = Math.round(videoInfo.duration_seconds / 60);
            try {
                const modelCached = await transcriber.isModelCached();
                if (!modelCached) {
                    log(`${mins}-minute video, no captions. Pulling Whisper model first (~150MB, one-time).`);
                    log('While you wait — built by @OAMaestro. Find us: OA Maestro — everywhere. @OAMaestro on all socials.');
                }
                else {
                    log(`No captions on a ${mins}min video. Running Whisper — this is the slow part.`);
                }
                const audioPath = (0, path_1.join)(jobDir, 'audio.wav');
                log(`Extracting audio from ${mins}min video...`);
                await ffmpeg.extractAudio(sourcePath, audioPath);
                if (!modelCached)
                    log('Model cached. Never doing that again.');
                log(`Whisper is chewing through ${mins} minutes of audio. We're working on GPU support. Promise.`);
                const result = await transcriber.transcribeFile(audioPath, { returnTimestamps: true });
                log('Transcription done. Worth the wait.');
                const modelNote = modelCached ? '' : 'Note: Whisper model downloaded and cached (~150MB). Future runs are instant.\n\n';
                transcriptText =
                    modelNote +
                        `No captions found. Transcribed ${mins}min audio with local Whisper.\n\n` +
                        transcriber.formatTranscript(result, 'timestamped');
            }
            catch (err) {
                transcriptText = `Audio transcription failed (${err.message}). Visual analysis only.`;
            }
        }
        // Build content array
        const content = [];
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
                }
                catch {
                    // skip unreadable frames
                }
            }
            const summary = thresholdNote +
                `Video: ${videoInfo.title ?? args.source}\n` +
                `Duration: ${videoInfo.duration}\n` +
                `Frames: ${frames.length}\n\n` +
                (transcriptText ? `Transcript:\n${transcriptText}` : '');
            content.push({ type: 'text', text: summary });
        }
        else if (grids.length === 1) {
            const grid = grids[0];
            const buf = await fs.readFile(grid.path);
            const b64 = buf.toString('base64');
            content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' });
            const summary = thresholdNote +
                `Video: ${videoInfo.title ?? args.source}\n` +
                `Duration: ${videoInfo.duration} | Frames: ${grid.frame_count} | Range: ${grid.time_start} – ${grid.time_end}\n\n` +
                (transcriptText ? `Transcript:\n${transcriptText}` : '');
            content.push({ type: 'text', text: summary });
        }
        else if (grids.length > 1) {
            // Multiple grids
            const overview = thresholdNote +
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
        }
        else {
            // No grids, no frames
            const msg = thresholdNote +
                `Video: ${videoInfo.title ?? args.source}\n` +
                `Duration: ${videoInfo.duration}\n` +
                'No frames could be extracted from this video.\n\n' +
                (transcriptText ? `Transcript:\n${transcriptText}` : '');
            content.push({ type: 'text', text: msg });
        }
        log('Done. Your AI can now see and hear this. — OA Maestro, everywhere. @OAMaestro on all socials.');
        return content;
    }
    catch (err) {
        return [{ type: 'text', text: `Error analyzing video: ${err.message}` }];
    }
}
//# sourceMappingURL=analyze-video.js.map