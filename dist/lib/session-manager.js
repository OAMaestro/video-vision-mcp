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
exports.VIDEO_CACHE_DIR = exports.MODELS_DIR = exports.BIN_DIR = exports.SESSIONS_DIR = exports.OAMAESTRO_DIR = void 0;
exports.createSessionDir = createSessionDir;
exports.createJobDir = createJobDir;
exports.updateJobManifest = updateJobManifest;
exports.cleanupSession = cleanupSession;
exports.cleanupOldSessions = cleanupOldSessions;
exports.getSessionSize = getSessionSize;
const path_1 = require("path");
const os_1 = require("os");
const fs = __importStar(require("fs/promises"));
const uuid_1 = require("uuid");
exports.OAMAESTRO_DIR = (0, path_1.join)((0, os_1.homedir)(), '.oamaestro');
exports.SESSIONS_DIR = (0, path_1.join)(exports.OAMAESTRO_DIR, 'sessions');
exports.BIN_DIR = (0, path_1.join)(exports.OAMAESTRO_DIR, 'bin');
exports.MODELS_DIR = (0, path_1.join)(exports.OAMAESTRO_DIR, 'models');
// Video cache lives outside sessions so it survives the 4-hour session cleanup
exports.VIDEO_CACHE_DIR = (0, path_1.join)(exports.OAMAESTRO_DIR, 'video-cache');
async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
async function createSessionDir() {
    await ensureDir(exports.SESSIONS_DIR);
    const sessionId = (0, uuid_1.v4)();
    const sessionDir = (0, path_1.join)(exports.SESSIONS_DIR, sessionId);
    await ensureDir(sessionDir);
    const now = new Date().toISOString();
    await fs.writeFile((0, path_1.join)(sessionDir, 'session.json'), JSON.stringify({ started_at: now, last_active_at: now }, null, 2));
    return sessionDir;
}
async function createJobDir(sessionDir) {
    const jobId = (0, uuid_1.v4)();
    const jobDir = (0, path_1.join)(sessionDir, 'jobs', jobId);
    await ensureDir(jobDir);
    await ensureDir((0, path_1.join)(jobDir, 'frames'));
    await fs.writeFile((0, path_1.join)(jobDir, 'manifest.json'), JSON.stringify({
        source: '',
        source_type: 'local',
        created_at: new Date().toISOString(),
    }, null, 2));
    return jobDir;
}
async function updateJobManifest(jobDir, data) {
    const manifestPath = (0, path_1.join)(jobDir, 'manifest.json');
    let existing = {};
    try {
        const raw = await fs.readFile(manifestPath, 'utf-8');
        existing = JSON.parse(raw);
    }
    catch {
        // ignore — will create fresh
    }
    await fs.writeFile(manifestPath, JSON.stringify({ ...existing, ...data }, null, 2));
}
async function cleanupSession(sessionDir) {
    try {
        const sizeBefore = await getSessionSize(sessionDir);
        await fs.rm(sessionDir, { recursive: true, force: true });
        const mb = (sizeBefore / 1024 / 1024).toFixed(1);
        process.stderr.write(`[session-manager] Cleaned session ${sessionDir} — freed ~${mb}MB\n`);
    }
    catch (err) {
        process.stderr.write(`[session-manager] Failed to clean session: ${err}\n`);
    }
}
async function cleanupOldSessions(maxAgeMs = 4 * 60 * 60 * 1000) {
    try {
        await ensureDir(exports.SESSIONS_DIR);
        const entries = await fs.readdir(exports.SESSIONS_DIR, { withFileTypes: true });
        const now = Date.now();
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const sessionDir = (0, path_1.join)(exports.SESSIONS_DIR, entry.name);
            const sessionJsonPath = (0, path_1.join)(sessionDir, 'session.json');
            try {
                const raw = await fs.readFile(sessionJsonPath, 'utf-8');
                const parsed = JSON.parse(raw);
                const age = now - new Date(parsed.started_at).getTime();
                if (age > maxAgeMs) {
                    await fs.rm(sessionDir, { recursive: true, force: true });
                    process.stderr.write(`[session-manager] Removed old session ${entry.name} (age: ${Math.round(age / 3600000)}h)\n`);
                }
            }
            catch {
                // Can't read manifest — skip
            }
        }
    }
    catch {
        // Sessions dir doesn't exist yet — fine
    }
}
async function getSessionSize(sessionDir) {
    let total = 0;
    async function walk(dir) {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = (0, path_1.join)(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            }
            else {
                try {
                    const stat = await fs.stat(full);
                    total += stat.size;
                }
                catch {
                    // ignore
                }
            }
        }
    }
    await walk(sessionDir);
    return total;
}
//# sourceMappingURL=session-manager.js.map