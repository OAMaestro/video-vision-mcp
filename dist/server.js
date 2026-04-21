"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const session_manager_1 = require("./lib/session-manager");
const analyze_video_1 = require("./tools/analyze-video");
const extract_frames_1 = require("./tools/extract-frames");
const get_video_info_1 = require("./tools/get-video-info");
const get_transcript_1 = require("./tools/get-transcript");
const transcribe_audio_1 = require("./tools/transcribe-audio");
const extract_frame_at_1 = require("./tools/extract-frame-at");
const create_frame_grid_1 = require("./tools/create-frame-grid");
const cleanup_1 = require("./tools/cleanup");
const app = (0, express_1.default)();
exports.app = app;
app.use(express_1.default.json());
app.post('/analyze', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, analyze_video_1.analyzeVideoTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/extract', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, extract_frames_1.extractFramesTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/info', async (req, res) => {
    try {
        const result = await (0, get_video_info_1.getVideoInfoTool)(req.body);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/transcript', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, get_transcript_1.getTranscriptTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/transcribe', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, transcribe_audio_1.transcribeAudioTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/frame', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, extract_frame_at_1.extractFrameAtTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/grid', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, create_frame_grid_1.createFrameGridTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/cleanup', async (req, res) => {
    try {
        const sessionDir = await (0, session_manager_1.createSessionDir)();
        const result = await (0, cleanup_1.cleanupTool)(req.body, sessionDir);
        res.json({ content: result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const args = process.argv.slice(2);
const serverMode = args.includes('--server');
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : 3000;
if (serverMode) {
    app.listen(port, () => console.error(`[video-vision-mcp] REST server on port ${port}`));
}
//# sourceMappingURL=server.js.map