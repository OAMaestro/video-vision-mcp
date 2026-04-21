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
exports.findCachedVideo = findCachedVideo;
exports.cacheVideo = cacheVideo;
exports.cleanupStaleCache = cleanupStaleCache;
const path_1 = require("path");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs/promises"));
const session_manager_1 = require("./session-manager");
// Videos cache for 7 days — independent of session cleanup (sessions die in 4h, cache lives on)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function urlToKey(url) {
    return (0, crypto_1.createHash)('sha256').update(url).digest('hex').slice(0, 24);
}
function metaPath(key) {
    return (0, path_1.join)(session_manager_1.VIDEO_CACHE_DIR, `${key}.json`);
}
function videoPath(key) {
    return (0, path_1.join)(session_manager_1.VIDEO_CACHE_DIR, `${key}.mp4`);
}
async function findCachedVideo(url) {
    try {
        const key = urlToKey(url);
        const meta = JSON.parse(await fs.readFile(metaPath(key), 'utf-8'));
        // Stale?
        if (Date.now() - meta.cached_at > CACHE_TTL_MS) {
            await evict(key);
            return null;
        }
        // File still there?
        await fs.access(meta.path);
        return meta.path;
    }
    catch {
        return null;
    }
}
async function cacheVideo(url, sourcePath) {
    await fs.mkdir(session_manager_1.VIDEO_CACHE_DIR, { recursive: true });
    const key = urlToKey(url);
    const dest = videoPath(key);
    await fs.copyFile(sourcePath, dest);
    const entry = { url, path: dest, cached_at: Date.now() };
    await fs.writeFile(metaPath(key), JSON.stringify(entry, null, 2));
    return dest;
}
async function evict(key) {
    await Promise.allSettled([
        fs.unlink(videoPath(key)),
        fs.unlink(metaPath(key)),
    ]);
}
async function cleanupStaleCache() {
    try {
        const files = await fs.readdir(session_manager_1.VIDEO_CACHE_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        for (const f of jsonFiles) {
            try {
                const meta = JSON.parse(await fs.readFile((0, path_1.join)(session_manager_1.VIDEO_CACHE_DIR, f), 'utf-8'));
                if (Date.now() - meta.cached_at > CACHE_TTL_MS) {
                    const key = f.replace('.json', '');
                    await evict(key);
                }
            }
            catch { /* skip unreadable entries */ }
        }
    }
    catch { /* cache dir doesn't exist yet — fine */ }
}
//# sourceMappingURL=source-cache.js.map