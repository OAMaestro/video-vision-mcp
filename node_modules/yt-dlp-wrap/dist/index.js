"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var child_process_1 = require("child_process");
var fs_1 = __importDefault(require("fs"));
var https_1 = __importDefault(require("https"));
var os_1 = __importDefault(require("os"));
var stream_1 = require("stream");
var executableName = 'yt-dlp';
var progressRegex = /\[download\] *(.*) of ([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;
var YTDlpWrap = /** @class */ (function () {
    function YTDlpWrap(binaryPath) {
        if (binaryPath === void 0) { binaryPath = executableName; }
        this.binaryPath = binaryPath;
    }
    YTDlpWrap.prototype.getBinaryPath = function () {
        return this.binaryPath;
    };
    YTDlpWrap.prototype.setBinaryPath = function (binaryPath) {
        this.binaryPath = binaryPath;
    };
    YTDlpWrap.createGetMessage = function (url) {
        return new Promise(function (resolve, reject) {
            https_1.default.get(url, function (httpResponse) {
                httpResponse.on('error', function (e) { return reject(e); });
                resolve(httpResponse);
            });
        });
    };
    YTDlpWrap.processMessageToFile = function (message, filePath) {
        var file = fs_1.default.createWriteStream(filePath);
        return new Promise(function (resolve, reject) {
            message.pipe(file);
            message.on('error', function (e) { return reject(e); });
            file.on('finish', function () {
                return message.statusCode == 200 ? resolve(message) : reject(message);
            });
        });
    };
    YTDlpWrap.downloadFile = function (fileURL, filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var currentUrl, message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        currentUrl = fileURL;
                        _a.label = 1;
                    case 1:
                        if (!currentUrl) return [3 /*break*/, 6];
                        return [4 /*yield*/, YTDlpWrap.createGetMessage(currentUrl)];
                    case 2:
                        message = _a.sent();
                        if (!message.headers.location) return [3 /*break*/, 3];
                        currentUrl = message.headers.location;
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, YTDlpWrap.processMessageToFile(message, filePath)];
                    case 4: return [2 /*return*/, _a.sent()];
                    case 5: return [3 /*break*/, 1];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    YTDlpWrap.getGithubReleases = function (page, perPage) {
        if (page === void 0) { page = 1; }
        if (perPage === void 0) { perPage = 1; }
        return new Promise(function (resolve, reject) {
            var apiURL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases?page=' +
                page +
                '&per_page=' +
                perPage;
            https_1.default.get(apiURL, { headers: { 'User-Agent': 'node' } }, function (response) {
                var resonseString = '';
                response.setEncoding('utf8');
                response.on('data', function (body) { return (resonseString += body); });
                response.on('error', function (e) { return reject(e); });
                response.on('end', function () {
                    return response.statusCode == 200
                        ? resolve(JSON.parse(resonseString))
                        : reject(response);
                });
            });
        });
    };
    YTDlpWrap.downloadFromGithub = function (filePath, version, platform) {
        if (platform === void 0) { platform = os_1.default.platform(); }
        return __awaiter(this, void 0, void 0, function () {
            var isWin32, fileName, fileURL;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        isWin32 = platform == 'win32';
                        fileName = "".concat(executableName).concat(isWin32 ? '.exe' : '');
                        if (!!version) return [3 /*break*/, 2];
                        return [4 /*yield*/, YTDlpWrap.getGithubReleases(1, 1)];
                    case 1:
                        version = (_a.sent())[0].tag_name;
                        _a.label = 2;
                    case 2:
                        if (!filePath)
                            filePath = './' + fileName;
                        fileURL = 'https://github.com/yt-dlp/yt-dlp/releases/download/' +
                            version +
                            '/' +
                            fileName;
                        return [4 /*yield*/, YTDlpWrap.downloadFile(fileURL, filePath)];
                    case 3:
                        _a.sent();
                        !isWin32 && fs_1.default.chmodSync(filePath, '777');
                        return [2 /*return*/];
                }
            });
        });
    };
    YTDlpWrap.prototype.exec = function (ytDlpArguments, options, abortSignal) {
        if (ytDlpArguments === void 0) { ytDlpArguments = []; }
        if (options === void 0) { options = {}; }
        if (abortSignal === void 0) { abortSignal = null; }
        options = YTDlpWrap.setDefaultOptions(options);
        var execEventEmitter = new events_1.EventEmitter();
        var ytDlpProcess = (0, child_process_1.spawn)(this.binaryPath, ytDlpArguments, options);
        execEventEmitter.ytDlpProcess = ytDlpProcess;
        YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess);
        var stderrData = '';
        var processError;
        ytDlpProcess.stdout.on('data', function (data) {
            return YTDlpWrap.emitYoutubeDlEvents(data.toString(), execEventEmitter);
        });
        ytDlpProcess.stderr.on('data', function (data) { return (stderrData += data.toString()); });
        ytDlpProcess.on('error', function (error) { return (processError = error); });
        ytDlpProcess.on('close', function (code) {
            if (code === 0 || ytDlpProcess.killed)
                execEventEmitter.emit('close', code);
            else
                execEventEmitter.emit('error', YTDlpWrap.createError(code, processError, stderrData));
        });
        return execEventEmitter;
    };
    YTDlpWrap.prototype.execPromise = function (ytDlpArguments, options, abortSignal) {
        var _this = this;
        if (ytDlpArguments === void 0) { ytDlpArguments = []; }
        if (options === void 0) { options = {}; }
        if (abortSignal === void 0) { abortSignal = null; }
        var ytDlpProcess;
        var ytDlpPromise = new Promise(function (resolve, reject) {
            options = YTDlpWrap.setDefaultOptions(options);
            ytDlpProcess = (0, child_process_1.execFile)(_this.binaryPath, ytDlpArguments, options, function (error, stdout, stderr) {
                if (error)
                    reject(YTDlpWrap.createError(error, null, stderr));
                resolve(stdout);
            });
            YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess);
        });
        ytDlpPromise.ytDlpProcess = ytDlpProcess;
        return ytDlpPromise;
    };
    YTDlpWrap.prototype.execStream = function (ytDlpArguments, options, abortSignal) {
        if (ytDlpArguments === void 0) { ytDlpArguments = []; }
        if (options === void 0) { options = {}; }
        if (abortSignal === void 0) { abortSignal = null; }
        var readStream = new stream_1.Readable({ read: function (size) { } });
        options = YTDlpWrap.setDefaultOptions(options);
        ytDlpArguments = ytDlpArguments.concat(['-o', '-']);
        var ytDlpProcess = (0, child_process_1.spawn)(this.binaryPath, ytDlpArguments, options);
        readStream.ytDlpProcess = ytDlpProcess;
        YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess);
        var stderrData = '';
        var processError;
        ytDlpProcess.stdout.on('data', function (data) { return readStream.push(data); });
        ytDlpProcess.stderr.on('data', function (data) {
            var stringData = data.toString();
            YTDlpWrap.emitYoutubeDlEvents(stringData, readStream);
            stderrData += stringData;
        });
        ytDlpProcess.on('error', function (error) { return (processError = error); });
        ytDlpProcess.on('close', function (code) {
            if (code === 0 || ytDlpProcess.killed) {
                readStream.emit('close');
                readStream.destroy();
                readStream.emit('end');
            }
            else {
                var error = YTDlpWrap.createError(code, processError, stderrData);
                readStream.emit('error', error);
                readStream.destroy(error);
            }
        });
        return readStream;
    };
    YTDlpWrap.prototype.getExtractors = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.execPromise(['--list-extractors'])];
                    case 1:
                        ytDlpStdout = _a.sent();
                        return [2 /*return*/, ytDlpStdout.split('\n')];
                }
            });
        });
    };
    YTDlpWrap.prototype.getExtractorDescriptions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.execPromise(['--extractor-descriptions'])];
                    case 1:
                        ytDlpStdout = _a.sent();
                        return [2 /*return*/, ytDlpStdout.split('\n')];
                }
            });
        });
    };
    YTDlpWrap.prototype.getHelp = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.execPromise(['--help'])];
                    case 1:
                        ytDlpStdout = _a.sent();
                        return [2 /*return*/, ytDlpStdout];
                }
            });
        });
    };
    YTDlpWrap.prototype.getUserAgent = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.execPromise(['--dump-user-agent'])];
                    case 1:
                        ytDlpStdout = _a.sent();
                        return [2 /*return*/, ytDlpStdout];
                }
            });
        });
    };
    YTDlpWrap.prototype.getVersion = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.execPromise(['--version'])];
                    case 1:
                        ytDlpStdout = _a.sent();
                        return [2 /*return*/, ytDlpStdout];
                }
            });
        });
    };
    YTDlpWrap.prototype.getVideoInfo = function (ytDlpArguments) {
        return __awaiter(this, void 0, void 0, function () {
            var ytDlpStdout;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof ytDlpArguments == 'string')
                            ytDlpArguments = [ytDlpArguments];
                        if (!ytDlpArguments.includes('-f') &&
                            !ytDlpArguments.includes('--format'))
                            ytDlpArguments = ytDlpArguments.concat(['-f', 'best']);
                        return [4 /*yield*/, this.execPromise(ytDlpArguments.concat(['--dump-json']))];
                    case 1:
                        ytDlpStdout = _a.sent();
                        try {
                            return [2 /*return*/, JSON.parse(ytDlpStdout)];
                        }
                        catch (e) {
                            return [2 /*return*/, JSON.parse('[' + ytDlpStdout.replace(/\n/g, ',').slice(0, -1) + ']')];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    YTDlpWrap.bindAbortSignal = function (signal, process) {
        signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', function () {
            try {
                if (os_1.default.platform() === 'win32')
                    (0, child_process_1.execSync)("taskkill /pid ".concat(process.pid, " /T /F"));
                else {
                    (0, child_process_1.execSync)("pgrep -P ".concat(process.pid, " | xargs -L 1 kill"));
                }
            }
            catch (e) {
                // at least we tried
            }
            finally {
                process.kill(); // call to make sure that object state is updated even if task might be already killed by OS
            }
        });
    };
    YTDlpWrap.setDefaultOptions = function (options) {
        if (!options.maxBuffer)
            options.maxBuffer = 1024 * 1024 * 1024;
        return options;
    };
    YTDlpWrap.createError = function (code, processError, stderrData) {
        var errorMessage = '\nError code: ' + code;
        if (processError)
            errorMessage += '\n\nProcess error:\n' + processError;
        if (stderrData)
            errorMessage += '\n\nStderr:\n' + stderrData;
        return new Error(errorMessage);
    };
    YTDlpWrap.emitYoutubeDlEvents = function (stringData, emitter) {
        var outputLines = stringData.split(/\r|\n/g).filter(Boolean);
        for (var _i = 0, outputLines_1 = outputLines; _i < outputLines_1.length; _i++) {
            var outputLine = outputLines_1[_i];
            if (outputLine[0] == '[') {
                var progressMatch = outputLine.match(progressRegex);
                if (progressMatch) {
                    var progressObject = {};
                    progressObject.percent = parseFloat(progressMatch[1].replace('%', ''));
                    progressObject.totalSize = progressMatch[2].replace('~', '');
                    progressObject.currentSpeed = progressMatch[4];
                    progressObject.eta = progressMatch[6];
                    emitter.emit('progress', progressObject);
                }
                var eventType = outputLine
                    .split(' ')[0]
                    .replace('[', '')
                    .replace(']', '');
                var eventData = outputLine.substring(outputLine.indexOf(' '), outputLine.length);
                emitter.emit('ytDlpEvent', eventType, eventData);
            }
        }
    };
    return YTDlpWrap;
}());
exports.default = YTDlpWrap;
//# sourceMappingURL=index.js.map