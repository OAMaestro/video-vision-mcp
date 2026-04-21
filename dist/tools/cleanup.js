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
exports.cleanupTool = cleanupTool;
const sessionManager = __importStar(require("../lib/session-manager"));
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
async function cleanupTool(args, sessionDir) {
    try {
        if (args.scope === 'job') {
            if (!args.job_id) {
                return [{ type: 'text', text: 'Error: job_id is required when scope is "job".' }];
            }
            const jobDir = (0, path_1.join)(sessionDir, 'jobs', args.job_id);
            const size = await sessionManager.getSessionSize(jobDir);
            await fs.rm(jobDir, { recursive: true, force: true });
            return [{ type: 'text', text: `Deleted job ${args.job_id}. Freed ~${(size / 1024 / 1024).toFixed(1)}MB` }];
        }
        if (args.scope === 'session') {
            const jobsDir = (0, path_1.join)(sessionDir, 'jobs');
            let totalSize = 0;
            let jobCount = 0;
            try {
                const entries = await fs.readdir(jobsDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory())
                        continue;
                    const jobDir = (0, path_1.join)(jobsDir, entry.name);
                    totalSize += await sessionManager.getSessionSize(jobDir);
                    await fs.rm(jobDir, { recursive: true, force: true });
                    jobCount++;
                }
            }
            catch {
                // no jobs dir — nothing to delete
            }
            return [{ type: 'text', text: `Deleted ${jobCount} job(s) from current session. Freed ~${(totalSize / 1024 / 1024).toFixed(1)}MB` }];
        }
        if (args.scope === 'all') {
            await sessionManager.cleanupOldSessions(0);
            return [{ type: 'text', text: 'All sessions have been deleted.' }];
        }
        return [{ type: 'text', text: `Unknown scope: ${args.scope}` }];
    }
    catch (err) {
        return [{ type: 'text', text: `Error during cleanup: ${err.message}` }];
    }
}
//# sourceMappingURL=cleanup.js.map