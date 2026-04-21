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
exports.extractFramesTool = extractFramesTool;
const ytdlp = __importStar(require("../lib/ytdlp"));
const ffmpeg = __importStar(require("../lib/ffmpeg"));
const sourceCache = __importStar(require("../lib/source-cache"));
const source_cache_1 = require("../lib/source-cache");
const preflight_1 = require("../lib/preflight");
const session_manager_1 = require("../lib/session-manager");
const path_1 = require("path");
async function extractFramesTool(args, sessionDir) {
    try {
        const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
        const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');
        let sourcePath;
        let durationSeconds;
        if (isRemote) {
            const cached = await sourceCache.findCachedVideo(args.source);
            if (cached) {
                sourcePath = cached;
                // Get duration for overview mode
                if (args.mode === 'overview') {
                    try {
                        const info = await ffmpeg.getLocalVideoInfo(sourcePath);
                        durationSeconds = info.duration_seconds;
                    }
                    catch {
                        // best effort
                    }
                }
            }
            else {
                const info = await ytdlp.getVideoInfo(args.source, args.cookies);
                const preflight = (0, preflight_1.checkPreFlight)(info.duration_seconds);
                if (!preflight.ok) {
                    return [{ type: 'text', text: preflight.error ?? 'Preflight check failed.' }];
                }
                durationSeconds = info.duration_seconds;
                const downloadPath = (0, path_1.join)(jobDir, 'source.mp4');
                await ytdlp.downloadVideo(args.source, downloadPath, { cookies: args.cookies });
                sourcePath = await (0, source_cache_1.cacheVideo)(args.source, downloadPath);
                await (0, session_manager_1.updateJobManifest)(jobDir, { source: args.source, source_type: 'remote' });
            }
        }
        else {
            sourcePath = args.source;
            if (args.mode === 'overview') {
                try {
                    const info = await ffmpeg.getLocalVideoInfo(sourcePath);
                    durationSeconds = info.duration_seconds;
                }
                catch {
                    // best effort
                }
            }
        }
        const outputDir = args.output_dir ?? (0, path_1.join)(jobDir, 'frames');
        const opts = {
            mode: args.mode,
            fps: args.fps,
            scene_threshold: args.scene_threshold,
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
            let timestamp;
            if (match) {
                timestamp = `${match[1]}:${match[2]}:${match[3]}`;
            }
            else {
                timestamp = String(i);
            }
            const numMatch = filename.match(/frame_(\d+)/);
            const frame_number = numMatch ? parseInt(numMatch[1], 10) : i + 1;
            return { path: p, timestamp, frame_number };
        });
        return [{ type: 'text', text: JSON.stringify(results, null, 2) }];
    }
    catch (err) {
        return [{ type: 'text', text: `Error extracting frames: ${err.message}` }];
    }
}
//# sourceMappingURL=extract-frames.js.map