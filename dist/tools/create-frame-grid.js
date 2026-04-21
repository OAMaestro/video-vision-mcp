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
exports.createFrameGridTool = createFrameGridTool;
const gridComposer = __importStar(require("../lib/grid-composer"));
const session_manager_1 = require("../lib/session-manager");
const path_1 = require("path");
const fs = __importStar(require("fs/promises"));
async function createFrameGridTool(args, sessionDir) {
    try {
        // Validate all paths exist
        for (const p of args.frame_paths) {
            try {
                await fs.access(p);
            }
            catch {
                return [{ type: 'text', text: `Error: Frame path does not exist: ${p}` }];
            }
        }
        const jobDir = await (0, session_manager_1.createJobDir)(sessionDir);
        const outputPath = (0, path_1.join)(jobDir, 'custom_grid.jpg');
        const grid = await gridComposer.composeGrid(args.frame_paths, outputPath, {
            includeLabels: args.include_frame_labels ?? true,
            columns: args.columns,
            cellWidth: args.cell_width,
        });
        const buf = await fs.readFile(outputPath);
        const base64 = buf.toString('base64');
        return [
            { type: 'image', data: base64, mimeType: 'image/jpeg' },
            { type: 'text', text: `Grid: ${grid.frame_count} frames, ${grid.columns}×${grid.rows}` },
        ];
    }
    catch (err) {
        return [{ type: 'text', text: `Error creating frame grid: ${err.message}` }];
    }
}
//# sourceMappingURL=create-frame-grid.js.map