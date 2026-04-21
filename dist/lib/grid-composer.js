"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeGrid = composeGrid;
const sharp_1 = __importDefault(require("sharp"));
const CELL_WIDTH = 480;
const COLUMNS = 4;
function parseTimestampFromFilename(filename) {
    // Pattern: frame_NNNN_HH-MM-SS.jpg
    const match = filename.match(/frame_\d+_(\d{2})-(\d{2})-(\d{2})\.jpg$/);
    if (match) {
        return `${match[1]}:${match[2]}:${match[3]}`;
    }
    return '00:00:00';
}
async function composeGrid(framePaths, outputPath, options = {}) {
    // 1. Load first frame metadata
    const meta = await (0, sharp_1.default)(framePaths[0]).metadata();
    // 2. cellHeight
    const cellHeight = Math.round(CELL_WIDTH / ((meta.width ?? 1) / (meta.height ?? 1)));
    // 3. rows
    const rows = Math.ceil(framePaths.length / COLUMNS);
    // 4. gridWidth
    const gridWidth = COLUMNS * CELL_WIDTH;
    // 5. Composite frames
    const composites = await Promise.all(framePaths.map(async (p, i) => {
        const buf = await (0, sharp_1.default)(p)
            .resize(CELL_WIDTH, cellHeight, { fit: 'fill' })
            .toBuffer();
        const col = i % COLUMNS;
        const row = Math.floor(i / COLUMNS);
        return { input: buf, left: col * CELL_WIDTH, top: row * cellHeight };
    }));
    // 6. Create blank canvas and composite
    await (0, sharp_1.default)({
        create: {
            width: gridWidth,
            height: rows * cellHeight,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
        .composite(composites)
        .jpeg({ quality: 85 })
        .toFile(outputPath);
    // 7. Determine time_start / time_end from filenames
    const firstFilename = framePaths[0].split(/[\\/]/).pop() ?? '';
    const lastFilename = framePaths[framePaths.length - 1].split(/[\\/]/).pop() ?? '';
    const time_start = parseTimestampFromFilename(firstFilename);
    const time_end = parseTimestampFromFilename(lastFilename);
    return {
        path: outputPath,
        rows,
        columns: COLUMNS,
        frame_count: framePaths.length,
        time_start,
        time_end,
    };
}
//# sourceMappingURL=grid-composer.js.map