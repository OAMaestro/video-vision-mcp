# yt-dlp-wrap

This is a fork of the great lib [youtube-dl-wrap](https://github.com/ghjbnm/youtube-dl-wrap) (written by [ghjbnm](https://github.com/ghjbnm)) rewritten in TypeScript.

![](https://github.com/foxesdocode/yt-dlp-wrap/workflows/CI%20tests/badge.svg)
<a href="https://npmjs.org/package/yt-dlp-wrap" title="View this project on NPM"><img src="https://img.shields.io/npm/v/yt-dlp-wrap.svg" alt="NPM version" /></a>

A simple node.js wrapper for [yt-dlp](https://github.com/yt-dlp/yt-dlp).

-   0 dependencies
-   EventEmitter, Promise and Stream interface
-   Progress events
-   Utility functions
-   Typescript Support

## Installation

You can install yt-dlp-wrap via npm (`npm i yt-dlp-wrap`).  
YT-dlp itself will not be automatically downloaded.  
Provide it yourself or use some of the following functions to download the binary.

Typescript (only import differs)

```typescript
import YTDlpWrap from 'yt-dlp-wrap';
```

Javascript

```javascript
const YTDlpWrap = require('yt-dlp-wrap').default;

//Get the data from the github releases API. In this case get page 1 with a maximum of 5 items.
let githubReleasesData = await YTDlpWrap.getGithubReleases(1, 5);

//Download the yt-dlp binary for the given version and platform to the provided path.
//By default the latest version will be downloaded to "./yt-dlp" and platform = os.platform().
await YTDlpWrap.downloadFromGithub(
    'path/to/yt-dlp/binary',
    '2020.06.16.1',
    'win32'
);

//Init an instance with a given binary path.
//If none is provided "yt-dlp" will be used as command.
const ytDlpWrap = new YTDlpWrap('path/to/yt-dlp/binary');
//The binary path can also be changed later on.
ytDlpWrap.setBinaryPath('path/to/another/yt-dlp/binary');
```

## Usage

### EventEmitter

Excecute yt-dlp and returns an [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter).  
The `ytDlpEvent` event will expose all yt-dlp events, for example:  
The log message `[download] Destination: output.mp4` will emit the event type `download` and the event data `Destination: output.mp4`.  
`ytDlpEmitter.ytDlpProcess` exposes the spawned yt-dlp process.

```javascript
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap('path/to/yt-dlp/binary');

let ytDlpEventEmitter = ytDlpWrap
    .exec([
        'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        '-f',
        'best',
        '-o',
        'output.mp4',
    ])
    .on('progress', (progress) =>
        console.log(
            progress.percent,
            progress.totalSize,
            progress.currentSpeed,
            progress.eta
        )
    )
    .on('ytDlpEvent', (eventType, eventData) =>
        console.log(eventType, eventData)
    )
    .on('error', (error) => console.error(error))
    .on('close', () => console.log('all done'));

console.log(ytDlpEventEmitter.ytDlpProcess.pid);
```

### Readable Stream

Excecute yt-dlp and returns an [Readable Stream](https://nodejs.org/api/stream.html#stream_class_stream_readable).  
The interface works just like the [EventEmitter](#EventEmitter).

```javascript
let readableStream = ytDlpWrap.execStream([
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    '-f',
    'best[ext=mp4]',
]);
readableStream.pipe(fs.createWriteStream('test.mp4'));
```

### Promise

Excecute yt-dlp and returns an [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

```javascript
let stdout = await ytDlpWrap.execPromise([
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    '-f',
    'best',
    '-o',
    'output.mp4',
]);
console.log(stdout);
```

### Options and Cancellation

Additionally you can set the options of the spawned process and abort the process.  
The abortion of the spawned process is handled by passing the signal of an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).

```javascript
let controller = new AbortController();
let ytDlpEventEmitter = ytDlpWrap.exec(
    [
        'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        '-f',
        'best',
        '-o',
        'output.mp4',
    ],
    { shell: true, detached: true },
    controller.signal
);

setTimeout(() => {
    controller.abort();
    console.log(ytDlpEventEmitter.ytDlpProcess.killed);
}, 500);
```

### Metadata

Returns the yt-dlp `--dump-json` metadata as an object.

```javascript
let metadata = await ytDlpWrap.getVideoInfo(
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
);
console.log(metadata.title);
```

### Utility functions

Just a few utility functions to get informations.

```javascript
let version = await ytDlpWrap.getVersion();
let userAgent = await ytDlpWrap.getUserAgent();
let help = await ytDlpWrap.getHelp();
let extractors = await ytDlpWrap.getExtractors();
let extractorDescriptions = await ytDlpWrap.getExtractorDescriptions();
```

## License

MIT
