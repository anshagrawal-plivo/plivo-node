// Plivo Streaming Module
// Main entry point for WebSocket audio streaming capabilities

export { PlivoWebSocketClient } from "./websocket-client.js";
export {
  AudioProcessor,
  AudioConverter,
  AudioBufferManager,
  AudioFormats,
} from "./audio-processor.js";
export {
  PlivoStreamManager,
  StreamEvents,
  StreamPresets,
} from "./stream-manager.js";
export {
  PlivoWebSocketHandler,
  PlivoWebSocketHandlerFactory,
  WebSocketMessageTypes,
} from "./websocket-handler.js";

// Convenience exports for common use cases
export const Streaming = {
  Client: PlivoWebSocketClient,
  Manager: PlivoStreamManager,
  Handler: PlivoWebSocketHandler,
  HandlerFactory: PlivoWebSocketHandlerFactory,
  AudioProcessor,
  AudioConverter,
  AudioBufferManager,
  Formats: AudioFormats,
  Events: StreamEvents,
  Presets: StreamPresets,
  MessageTypes: WebSocketMessageTypes,
};

export default Streaming;
