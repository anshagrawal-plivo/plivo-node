import { EventEmitter } from "events";
import { PlivoStreamManager } from "./stream-manager";
import { AudioProcessor } from "./audio-processor";

export interface WebSocketHandlerOptions {
  enableAudioProcessing?: boolean;
  autoStartStream?: boolean;
  defaultStreamOptions?: Record<string, any>;
  [key: string]: any;
}

export interface HandlerStatus {
  connectionId: string;
  isConnected: boolean;
  activeStreamsCount: number;
  activeStreams: string[];
  streamManagerStatus: any;
  audioProcessingEnabled: boolean;
  options: WebSocketHandlerOptions;
}

export interface IncomingMessage {
  type: string;
  requestId?: string;
  [key: string]: any;
}

export interface StreamStartMessage extends IncomingMessage {
  type: "startStream";
  callUuid: string;
  serviceUrl: string;
  streamOptions?: Record<string, any>;
}

export interface StreamStopMessage extends IncomingMessage {
  type: "stopStream";
  callUuid: string;
  streamId?: string;
}

export interface SendAudioMessage extends IncomingMessage {
  type: "sendAudio";
  callUuid: string;
  audioData: string; // base64 encoded
  options?: Record<string, any>;
}

export interface PlayAudioMessage extends IncomingMessage {
  type: "playAudio";
  callUuid: string;
  audioUrl: string;
}

export declare const WebSocketMessageTypes: {
  // Client to server
  START_STREAM: "startStream";
  STOP_STREAM: "stopStream";
  SEND_AUDIO: "sendAudio";
  PLAY_AUDIO: "playAudio";
  STOP_AUDIO: "stopAudio";
  GET_STREAM_INFO: "getStreamInfo";
  GET_ALL_STREAMS: "getAllStreams";
  GET_STATUS: "getStatus";
  PING: "ping";

  // Server to client
  CONNECTED: "connected";
  STREAM_STARTED: "streamStarted";
  STREAM_STOPPED: "streamStopped";
  STREAM_CONNECTED: "streamConnected";
  STREAM_DISCONNECTED: "streamDisconnected";
  AUDIO_DATA: "audioData";
  STREAM_ERROR: "streamError";
  ERROR: "error";
  PONG: "pong";

  // Responses
  STREAM_START_RESPONSE: "streamStartResponse";
  STREAM_STOP_RESPONSE: "streamStopResponse";
  SEND_AUDIO_RESPONSE: "sendAudioResponse";
  PLAY_AUDIO_RESPONSE: "playAudioResponse";
  STOP_AUDIO_RESPONSE: "stopAudioResponse";
  STREAM_INFO_RESPONSE: "streamInfoResponse";
  ALL_STREAMS_RESPONSE: "allStreamsResponse";
  STATUS_RESPONSE: "statusResponse";
};

export declare class PlivoWebSocketHandler extends EventEmitter {
  constructor(ws: any, client: any, options?: WebSocketHandlerOptions);

  readonly connectionId: string;
  readonly isConnected: boolean;
  readonly activeStreams: Map<string, any>;

  sendMessage(message: Record<string, any>): void;
  sendError(
    message: string,
    error?: Error | null,
    requestId?: string | null
  ): void;
  getStatus(): HandlerStatus;
  cleanup(): void;
  close(code?: number, reason?: string): void;

  convertAudioFormat(
    audioBuffer: Buffer,
    fromFormat: string,
    toFormat: string
  ): Buffer;
  setAudioProcessing(enabled: boolean, options?: Record<string, any>): void;

  // Event handlers
  on(
    event: "disconnected",
    listener: (data: { code: number; reason: string }) => void
  ): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "cleanup", listener: () => void): this;
}

export interface HandlerFactoryOptions extends WebSocketHandlerOptions {
  // Additional factory-specific options
}

export interface FactoryStatus {
  activeHandlersCount: number;
  handlerIds: string[];
  defaultOptions: HandlerFactoryOptions;
}

export declare class PlivoWebSocketHandlerFactory {
  constructor(client: any, defaultOptions?: HandlerFactoryOptions);

  createHandler(
    ws: any,
    options?: WebSocketHandlerOptions
  ): PlivoWebSocketHandler;
  getActiveHandlers(): PlivoWebSocketHandler[];
  getHandler(connectionId: string): PlivoWebSocketHandler | undefined;
  closeAllHandlers(): void;
  getStatus(): FactoryStatus;
}
