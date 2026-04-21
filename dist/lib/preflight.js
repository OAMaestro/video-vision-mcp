"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFreeDiskBytes = getFreeDiskBytes;
exports.estimateDownloadBytes = estimateDownloadBytes;
exports.checkPreFlight = checkPreFlight;
const child_process_1 = require("child_process");
const os_1 = require("os");
function getFreeDiskBytes() {
    try {
        if (process.platform === 'win32') {
            // Use PowerShell — wmic is deprecated on Windows 11 and unreliable
            // Check the drive that actually holds the home dir, not always C:
            const drive = ((0, os_1.homedir)().match(/^([A-Za-z]):/) ?? ['', 'C'])[1].toUpperCase();
            const output = (0, child_process_1.execSync)(`powershell -Command "(Get-PSDrive ${drive}).Free"`, { encoding: 'utf-8', timeout: 10000 });
            const bytes = parseInt(output.trim(), 10);
            if (!isNaN(bytes))
                return bytes;
            return Infinity;
        }
        else {
            // Mac/Linux: df -k [homedir] — second column of second row × 1024
            const output = (0, child_process_1.execSync)(`df -k "${(0, os_1.homedir)()}"`, { encoding: 'utf-8', timeout: 10000 });
            const lines = output.trim().split(/\r?\n/);
            if (lines.length >= 2) {
                const parts = lines[1].trim().split(/\s+/);
                // Column index 3 = Available (df -k output: Filesystem 1K-blocks Used Available ...)
                const avail = parseInt(parts[3], 10);
                if (!isNaN(avail))
                    return avail * 1024;
            }
            return Infinity;
        }
    }
    catch {
        return Infinity; // If we can't check, don't block
    }
}
function estimateDownloadBytes(durationSeconds) {
    return durationSeconds * 100 * 1024; // 100KB/s for 720p
}
const MB = 1024 * 1024;
function checkPreFlight(durationSeconds) {
    const freeBytes = getFreeDiskBytes();
    const estimatedBytes = estimateDownloadBytes(durationSeconds);
    const freeMB = Math.round(freeBytes / MB);
    const estimatedMB = Math.round(estimatedBytes / MB);
    if (freeBytes < 500 * MB) {
        return {
            ok: false,
            error: `Less than 500MB free disk space (you have ~${freeMB}MB). Free up space before continuing.`,
        };
    }
    if (estimatedBytes > freeBytes * 0.8) {
        const mins = Math.round(durationSeconds / 60);
        return {
            ok: false,
            error: `This video is ${mins} minutes long. Estimated download: ~${estimatedMB}MB. You only have ~${freeMB}MB free on disk. Free up space or use start_time/end_time to analyze a shorter section.`,
        };
    }
    if (estimatedBytes > freeBytes * 0.5) {
        const mins = Math.round(durationSeconds / 60);
        return {
            ok: true,
            warning: `This video is ${mins} minutes long. Estimated download: ~${estimatedMB}MB.\nYou have ~${freeMB}MB free on disk.\nRecommended: use start_time and end_time to analyze a specific section,\nor free up disk space first.\nTo analyze minutes 5-15 only: add start_time: "00:05:00", end_time: "00:15:00"`,
        };
    }
    return { ok: true };
}
//# sourceMappingURL=preflight.js.map