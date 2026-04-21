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
exports.extractAndGrid = extractAndGrid;
const ffmpeg = __importStar(require("./ffmpeg"));
const gridComposer = __importStar(require("./grid-composer"));
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
const log = (msg) => process.stderr.write(`[OA Maestro] ${msg}\n`);
function parseTimestampFromFilename(filename) {
    // Pattern: frame_NNNN_HH-MM-SS.jpg
    const match = filename.match(/frame_\d+_(\d{2})-(\d{2})-(\d{2})\.jpg$/);
    if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const s = parseInt(match[3], 10);
        return {
            timestamp: `${match[1]}:${match[2]}:${match[3]}`,
            timestamp_seconds: h * 3600 + m * 60 + s,
        };
    }
    return { timestamp: '00:00:00', timestamp_seconds: 0 };
}
async function extractAndGrid(input, jobDir, opts) {
    // 1. framesDir
    const framesDir = (0, path_1.join)(jobDir, 'frames');
    // 2. Extract frames
    log(`Pulling frames (mode: ${opts.mode})...`);
    let framePaths = await ffmpeg.extractFrames(input, framesDir, opts);
    log(`Got ${framePaths.length} frames.`);
    const maxFrames = opts.max_frames ?? 80;
    let adjustedThreshold;
    // 3. If too many frames in scene mode, nudge threshold up and retry (up to 3x)
    if (framePaths.length > maxFrames && opts.mode === 'scene') {
        let currentThreshold = opts.scene_threshold ?? 0.3;
        for (let attempt = 0; attempt < 3 && framePaths.length > maxFrames; attempt++) {
            currentThreshold = Math.min(currentThreshold + 0.1, 0.95);
            adjustedThreshold = currentThreshold;
            const newOpts = { ...opts, scene_threshold: currentThreshold };
            try {
                const files = await fs.readdir(framesDir);
                await Promise.all(files.map(f => fs.unlink((0, path_1.join)(framesDir, f))));
            }
            catch { /* ignore */ }
            framePaths = await ffmpeg.extractFrames(input, framesDir, newOpts);
            log(`Threshold ${currentThreshold.toFixed(2)} → ${framePaths.length} frames.`);
        }
        // Still over 150 — evenly sample across the whole video rather than cutting the tail
        if (framePaths.length > 150) {
            log(`Still over 150 frames — sampling evenly so we don't miss the end.`);
            const step = framePaths.length / 150;
            framePaths = Array.from({ length: 150 }, (_, i) => framePaths[Math.floor(i * step)]);
        }
    }
    // 4. Build FrameInfo array
    const frames = framePaths.map((p, i) => {
        const filename = p.split(/[\\/]/).pop() ?? '';
        const { timestamp, timestamp_seconds } = parseTimestampFromFilename(filename);
        // Parse frame number from filename
        const numMatch = filename.match(/frame_(\d+)/);
        const frame_number = numMatch ? parseInt(numMatch[1], 10) : i + 1;
        return {
            path: p,
            timestamp,
            timestamp_seconds,
            frame_number,
        };
    });
    // 5. If fewer than 5 frames, return without grids
    if (frames.length < 5) {
        return { grids: [], frames, adjustedThreshold };
    }
    // 6. Group frames into chunks of 16
    const CHUNK_SIZE = 16;
    const grids = [];
    const totalGrids = Math.ceil(framePaths.length / CHUNK_SIZE);
    log(`Composing ${totalGrids} frame grid${totalGrids !== 1 ? 's' : ''}...`);
    for (let i = 0; i < framePaths.length; i += CHUNK_SIZE) {
        const chunk = framePaths.slice(i, i + CHUNK_SIZE);
        const gridPath = (0, path_1.join)(jobDir, `grid_${String(Math.floor(i / CHUNK_SIZE) + 1).padStart(2, '0')}.jpg`);
        const grid = await gridComposer.composeGrid(chunk, gridPath);
        grids.push(grid);
    }
    log('Grids ready. Handing everything to your AI.');
    return { grids, frames, adjustedThreshold };
}
//# sourceMappingURL=frame-extractor.js.map