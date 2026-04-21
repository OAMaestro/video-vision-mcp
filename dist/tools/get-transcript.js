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
exports.getTranscriptTool = getTranscriptTool;
const ytdlp = __importStar(require("../lib/ytdlp"));
const ffmpeg = __importStar(require("../lib/ffmpeg"));
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
const session_manager_1 = require("../lib/session-manager");
const NO_CAPTIONS_MSG = 'No captions found for this video. Use the `transcribe_audio` tool to generate a transcript using local speech recognition.';
function parseSrtToPlain(srt) {
    // Remove SRT numbering and timestamps, keep only text
    return srt
        .replace(/^\d+\s*$/gm, '')
        .replace(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\s*$/gm, '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .join(' ');
}
function parseSrtToTimestamped(srt) {
    const blocks = srt.split(/\n\n+/).filter(Boolean);
    const lines = [];
    for (const block of blocks) {
        const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (blockLines.length < 2)
            continue;
        // blockLines[0] might be a number, blockLines[1] might be timestamp
        let tsLine = '';
        let textLines = [];
        for (const bl of blockLines) {
            if (/^\d+$/.test(bl))
                continue; // SRT index
            if (/^\d{2}:\d{2}:\d{2}/.test(bl)) {
                tsLine = bl.split('-->')[0].trim().replace(',', '.');
                // Convert HH:MM:SS.mmm to M:SS
                const parts = tsLine.split(':');
                const h = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const s = parseFloat(parts[2]);
                const totalM = h * 60 + m;
                const sFloor = Math.floor(s);
                tsLine = `${totalM}:${String(sFloor).padStart(2, '0')}`;
            }
            else {
                textLines.push(bl);
            }
        }
        if (textLines.length > 0) {
            lines.push(`[${tsLine}] ${textLines.join(' ')}`);
        }
    }
    return lines.join('\n');
}
async function getTranscriptTool(args, sessionDir) {
    try {
        const isRemote = args.source.startsWith('http://') || args.source.startsWith('https://');
        if (isRemote) {
            const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
            const srtPath = await ytdlp.downloadSubtitles(args.source, jobDir, args.language ?? 'en', args.cookies);
            if (!srtPath) {
                return [{ type: 'text', text: NO_CAPTIONS_MSG }];
            }
            const raw = await fs.readFile(srtPath, 'utf-8');
            const formatted = formatSrt(raw, args.format);
            return [{ type: 'text', text: formatted }];
        }
        else {
            const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
            const tempSrt = (0, path_1.join)(jobDir, 'subtitles.srt');
            const success = await ffmpeg.extractEmbeddedSubtitles(args.source, tempSrt);
            if (!success) {
                return [{ type: 'text', text: NO_CAPTIONS_MSG }];
            }
            const raw = await fs.readFile(tempSrt, 'utf-8');
            const formatted = formatSrt(raw, args.format);
            return [{ type: 'text', text: formatted }];
        }
    }
    catch (err) {
        return [{ type: 'text', text: `Error getting transcript: ${err.message}` }];
    }
}
function formatSrt(raw, format) {
    if (format === 'srt')
        return raw;
    if (format === 'plain')
        return parseSrtToPlain(raw);
    return parseSrtToTimestamped(raw);
}
//# sourceMappingURL=get-transcript.js.map