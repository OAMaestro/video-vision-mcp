/// <reference types="node" />
import { EventEmitter } from 'events';
import { ChildProcess, ChildProcessWithoutNullStreams, ExecFileException, SpawnOptionsWithoutStdio } from 'child_process';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';
declare type YTDlpEventNameDataTypeMap = {
    close: [number | null];
    error: [Error];
    progress: [Progress];
    ytDlpEvent: [eventType: string, eventData: string];
};
declare type YTDlpEventName = keyof YTDlpEventNameDataTypeMap;
declare type YTDlpEventListener<EventName extends YTDlpEventName> = (...args: YTDlpEventNameDataTypeMap[EventName]) => void;
declare type YTDlpEventNameToEventListenerFunction<ReturnType> = <K extends YTDlpEventName>(channel: K, listener: YTDlpEventListener<K>) => ReturnType;
declare type YTDlpEventNameToEventDataFunction<ReturnType> = <K extends YTDlpEventName>(channel: K, ...args: YTDlpEventNameDataTypeMap[K]) => ReturnType;
export interface YTDlpEventEmitter extends EventEmitter {
    ytDlpProcess?: ChildProcessWithoutNullStreams;
    removeAllListeners(event?: YTDlpEventName | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listenerCount(eventName: YTDlpEventName): number;
    eventNames(): Array<YTDlpEventName>;
    addListener: YTDlpEventNameToEventListenerFunction<this>;
    prependListener: YTDlpEventNameToEventListenerFunction<this>;
    prependOnceListener: YTDlpEventNameToEventListenerFunction<this>;
    on: YTDlpEventNameToEventListenerFunction<this>;
    once: YTDlpEventNameToEventListenerFunction<this>;
    removeListener: YTDlpEventNameToEventListenerFunction<this>;
    off: YTDlpEventNameToEventListenerFunction<this>;
    listeners(eventName: YTDlpEventName): Function[];
    rawListeners(eventName: YTDlpEventName): Function[];
    emit: YTDlpEventNameToEventDataFunction<boolean>;
}
export interface YTDlpPromise<T> extends Promise<T> {
    ytDlpProcess?: ChildProcess;
}
declare type YTDlpReadableEventName = keyof YTDlpReadableEventNameDataTypeMap;
declare type YTDlpReadableEventListener<EventName extends YTDlpReadableEventName> = (...args: YTDlpReadableEventNameDataTypeMap[EventName]) => void;
declare type YTDlpReadableEventNameToEventListenerFunction<ReturnType> = <K extends YTDlpReadableEventName>(event: K, listener: YTDlpReadableEventListener<K>) => ReturnType;
declare type YTDlpReadableEventNameToEventDataFunction<ReturnType> = <K extends YTDlpReadableEventName>(event: K, ...args: YTDlpReadableEventNameDataTypeMap[K]) => ReturnType;
declare type YTDlpReadableEventNameDataTypeMap = {
    close: [];
    progress: [progress: Progress];
    ytDlpEvent: [eventType: string, eventData: string];
    data: [chunk: any];
    end: [];
    error: [error: Error];
    pause: [];
    readable: [];
    resume: [];
};
export interface YTDlpReadable extends Readable {
    ytDlpProcess?: ChildProcessWithoutNullStreams;
    /**
     * Event emitter
     * The defined events on documents including:
     * 1. close
     * 2. data
     * 3. end
     * 4. error
     * 5. pause
     * 6. readable
     * 7. resume
     * 8. ytDlpEvent
     * 9. progress
     */
    addListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    emit: YTDlpReadableEventNameToEventDataFunction<boolean>;
    on: YTDlpReadableEventNameToEventListenerFunction<this>;
    once: YTDlpReadableEventNameToEventListenerFunction<this>;
    prependListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    prependOnceListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    removeListener: YTDlpReadableEventNameToEventListenerFunction<this>;
}
export interface YTDlpOptions extends SpawnOptionsWithoutStdio {
    maxBuffer?: number;
}
export interface Progress {
    percent?: number;
    totalSize?: string;
    currentSpeed?: string;
    eta?: string;
}
export default class YTDlpWrap {
    private binaryPath;
    constructor(binaryPath?: string);
    getBinaryPath(): string;
    setBinaryPath(binaryPath: string): void;
    private static createGetMessage;
    private static processMessageToFile;
    static downloadFile(fileURL: string, filePath: string): Promise<IncomingMessage | undefined>;
    static getGithubReleases(page?: number, perPage?: number): Promise<any>;
    static downloadFromGithub(filePath?: string, version?: string, platform?: NodeJS.Platform): Promise<void>;
    exec(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpEventEmitter;
    execPromise(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpPromise<string>;
    execStream(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpReadable;
    getExtractors(): Promise<string[]>;
    getExtractorDescriptions(): Promise<string[]>;
    getHelp(): Promise<string>;
    getUserAgent(): Promise<string>;
    getVersion(): Promise<string>;
    getVideoInfo(ytDlpArguments: string | string[]): Promise<any>;
    static bindAbortSignal(signal: AbortSignal | null, process: ChildProcess): void;
    static setDefaultOptions(options: YTDlpOptions): YTDlpOptions;
    static createError(code: number | ExecFileException | null, processError: Error | null, stderrData: string): Error;
    static emitYoutubeDlEvents(stringData: string, emitter: YTDlpEventEmitter | YTDlpReadable): void;
}
export {};
