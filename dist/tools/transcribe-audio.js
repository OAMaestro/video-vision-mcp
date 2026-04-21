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
exports.transcribeAudioTool = transcribeAudioTool;
const ytdlp = __importStar(require("../lib/ytdlp"));
const ffmpeg = __importStar(require("../lib/ffmpeg"));
const transcriber = __importStar(require("../lib/transcriber"));
const sourceCache = __importStar(require("../lib/source-cache"));
const source_cache_1 = require("../lib/source-cache");
const preflight_1 = require("../lib/preflight");
const session_manager_1 = require("../lib/session-manager");
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
async function transcribeAudioTool(args, sessionDir) {
    try {
        const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
        const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');
        let sourcePath;
        if (isRemote) {
            // Check cache first
            const cached = await sourceCache.findCachedVideo(args.source);
            if (cached) {
                sourcePath = cached;
            }
            else {
                // Get video info for preflight
                const info = await ytdlp.getVideoInfo(args.source, args.cookies);
                const preflight = (0, preflight_1.checkPreFlight)(info.duration_seconds);
                if (!preflight.ok) {
                    return [{ type: 'text', text: preflight.error ?? 'Preflight check failed.' }];
                }
                const downloadPath = (0, path_1.join)(jobDir, 'source.mp4');
                await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
                sourcePath = await (0, source_cache_1.cacheVideo)(args.source, downloadPath);
                await (0, session_manager_1.updateJobManifest)(jobDir, { source: args.source, source_type: 'remote' });
            }
        }
        else {
            sourcePath = args.source;
        }
        // Extract audio
        const audioPath = (0, path_1.join)(jobDir, 'audio.wav');
        let audioExists = false;
        try {
            await fs.access(audioPath);
            audioExists = true;
        }
        catch {
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
    }
    catch (err) {
        return [{ type: 'text', text: `Error transcribing audio: ${err.message}` }];
    }
}
//# sourceMappingURL=transcribe-audio.js.map