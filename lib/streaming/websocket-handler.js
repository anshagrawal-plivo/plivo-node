import { EventEmitter } from "events";
import { PlivoStreamManager } from "./stream-manager.js";
import { AudioProcessor, AudioConverter } from "./audio-processor.js";

/**
 * WebSocket Handler for Plivo Streaming
 * Wraps an incoming WebSocket connection and provides methods to interact with Plivo streams
 */
export class PlivoWebSocketHandler extends EventEmitter {
  constructor(ws, client, options = {}) {
    super();

    this.ws = ws;
    this.client = client;
    this.options = {
      enableAudioProcessing: true,
      autoStartStream: false,
      defaultStreamOptions: {},
      ...options,
    };

    // Initialize stream manager
    this.streamManager = new PlivoStreamManager(this.client, this.options);

    // Active streams for this WebSocket connection
    this.activeStreams = new Map();

    // Audio processor if enabled
    this.audioProcessor = this.options.enableAudioProcessing
      ? new AudioProcessor(this.options)
      : null;

    // Connection state
    this.isConnected = true;
    this.connectionId = this.generateConnectionId();

    // Set up WebSocket event handlers
    this.setupWebSocketHandlers();

    // Set up stream manager event forwarding
    this.setupStreamEventForwarding();

    console.log(`WebSocket handler created: ${this.connectionId}`);
  }

  /**
   * Set up WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleIncomingMessage(message);
      } catch (error) {
        this.sendError("Invalid JSON message", error);
      }
    });

    this.ws.on("close", (code, reason) => {
      console.log(
        `WebSocket closed: ${this.connectionId} (${code}: ${reason})`
      );
      this.isConnected = false;
      this.cleanup();
      this.emit("disconnected", { code, reason: reason.toString() });
    });

    this.ws.on("error", (error) => {
      console.error(`WebSocket error: ${this.connectionId}`, error);
      this.emit("error", error);
    });

    // Send welcome message
    this.sendMessage({
      type: "connected",
      connectionId: this.connectionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Set up stream manager event forwarding
   */
  setupStreamEventForwarding() {
    // Forward stream events to WebSocket client
    this.streamManager.on("streamStarted", (data) => {
      this.activeStreams.set(data.callUuid, data);
      this.sendMessage({
        type: "streamStarted",
        ...data,
      });
    });

    this.streamManager.on("streamStopped", (data) => {
      this.activeStreams.delete(data.callUuid);
      this.sendMessage({
        type: "streamStopped",
        ...data,
      });
    });

    this.streamManager.on("audioData", (data) => {
      // Process audio if enabled
      let audioData = data;
      if (this.audioProcessor) {
        const processedBuffer = this.audioProcessor.processAudioBuffer(
          data.audioBuffer
        );
        audioData = { ...data, audioBuffer: processedBuffer };
      }

      this.sendMessage({
        type: "audioData",
        callUuid: audioData.callUuid,
        timestamp: audioData.timestamp,
        track: audioData.track,
        audioData: audioData.audioBuffer.toString("base64"),
        sequenceNumber: audioData.sequenceNumber,
      });
    });

    this.streamManager.on("streamError", (data) => {
      this.sendMessage({
        type: "streamError",
        ...data,
        error: data.error.message,
      });
    });

    this.streamManager.on("streamConnected", (data) => {
      this.sendMessage({
        type: "streamConnected",
        ...data,
      });
    });

    this.streamManager.on("streamDisconnected", (data) => {
      this.sendMessage({
        type: "streamDisconnected",
        ...data,
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleIncomingMessage(message) {
    try {
      switch (message.type) {
        case "startStream":
          await this.handleStartStream(message);
          break;
        case "stopStream":
          await this.handleStopStream(message);
          break;
        case "sendAudio":
          this.handleSendAudio(message);
          break;
        case "playAudio":
          this.handlePlayAudio(message);
          break;
        case "stopAudio":
          this.handleStopAudio(message);
          break;
        case "getStreamInfo":
          await this.handleGetStreamInfo(message);
          break;
        case "getAllStreams":
          await this.handleGetAllStreams(message);
          break;
        case "getStatus":
          this.handleGetStatus(message);
          break;
        case "ping":
          this.handlePing(message);
          break;
        default:
          this.sendError(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.sendError(`Error handling message: ${message.type}`, error);
    }
  }

  /**
   * Handle start stream request
   */
  async handleStartStream(message) {
    const { callUuid, serviceUrl, streamOptions = {}, requestId } = message;

    if (!callUuid || !serviceUrl) {
      return this.sendError("Missing callUuid or serviceUrl", null, requestId);
    }

    try {
      const wsClient = await this.streamManager.startStream(
        callUuid,
        serviceUrl,
        { ...this.options.defaultStreamOptions, ...streamOptions }
      );

      this.sendMessage({
        type: "streamStartResponse",
        requestId,
        success: true,
        callUuid,
        streamId: wsClient.streamId,
      });
    } catch (error) {
      this.sendError("Failed to start stream", error, requestId);
    }
  }

  /**
   * Handle stop stream request
   */
  async handleStopStream(message) {
    const { callUuid, streamId, requestId } = message;

    if (!callUuid) {
      return this.sendError("Missing callUuid", null, requestId);
    }

    try {
      await this.streamManager.stopStream(callUuid, streamId);

      this.sendMessage({
        type: "streamStopResponse",
        requestId,
        success: true,
        callUuid,
        streamId,
      });
    } catch (error) {
      this.sendError("Failed to stop stream", error, requestId);
    }
  }

  /**
   * Handle send audio request
   */
  handleSendAudio(message) {
    const { callUuid, audioData, options = {}, requestId } = message;

    if (!callUuid || !audioData) {
      return this.sendError("Missing callUuid or audioData", null, requestId);
    }

    try {
      const audioBuffer = Buffer.from(audioData, "base64");
      this.streamManager.sendAudio(callUuid, audioBuffer, options);

      this.sendMessage({
        type: "sendAudioResponse",
        requestId,
        success: true,
        callUuid,
      });
    } catch (error) {
      this.sendError("Failed to send audio", error, requestId);
    }
  }

  /**
   * Handle play audio request
   */
  handlePlayAudio(message) {
    const { callUuid, audioUrl, requestId } = message;

    if (!callUuid || !audioUrl) {
      return this.sendError("Missing callUuid or audioUrl", null, requestId);
    }

    try {
      this.streamManager.playAudio(callUuid, audioUrl);

      this.sendMessage({
        type: "playAudioResponse",
        requestId,
        success: true,
        callUuid,
        audioUrl,
      });
    } catch (error) {
      this.sendError("Failed to play audio", error, requestId);
    }
  }

  /**
   * Handle stop audio request
   */
  handleStopAudio(message) {
    const { callUuid, requestId } = message;

    if (!callUuid) {
      return this.sendError("Missing callUuid", null, requestId);
    }

    try {
      this.streamManager.stopAudio(callUuid);

      this.sendMessage({
        type: "stopAudioResponse",
        requestId,
        success: true,
        callUuid,
      });
    } catch (error) {
      this.sendError("Failed to stop audio", error, requestId);
    }
  }

  /**
   * Handle get stream info request
   */
  async handleGetStreamInfo(message) {
    const { callUuid, streamId, requestId } = message;

    if (!callUuid || !streamId) {
      return this.sendError("Missing callUuid or streamId", null, requestId);
    }

    try {
      const streamInfo = await this.streamManager.getStreamInfo(
        callUuid,
        streamId
      );

      this.sendMessage({
        type: "streamInfoResponse",
        requestId,
        success: true,
        callUuid,
        streamId,
        streamInfo,
      });
    } catch (error) {
      this.sendError("Failed to get stream info", error, requestId);
    }
  }

  /**
   * Handle get all streams request
   */
  async handleGetAllStreams(message) {
    const { callUuid, requestId } = message;

    if (!callUuid) {
      return this.sendError("Missing callUuid", null, requestId);
    }

    try {
      const streams = await this.streamManager.getAllStreams(callUuid);

      this.sendMessage({
        type: "allStreamsResponse",
        requestId,
        success: true,
        callUuid,
        streams,
      });
    } catch (error) {
      this.sendError("Failed to get all streams", error, requestId);
    }
  }

  /**
   * Handle get status request
   */
  handleGetStatus(message) {
    const { requestId } = message;

    try {
      const status = this.getStatus();

      this.sendMessage({
        type: "statusResponse",
        requestId,
        success: true,
        status,
      });
    } catch (error) {
      this.sendError("Failed to get status", error, requestId);
    }
  }

  /**
   * Handle ping request
   */
  handlePing(message) {
    const { requestId } = message;

    this.sendMessage({
      type: "pong",
      requestId,
      timestamp: Date.now(),
    });
  }

  /**
   * Send message to WebSocket client
   */
  sendMessage(message) {
    if (this.isConnected && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to WebSocket client
   */
  sendError(message, error = null, requestId = null) {
    console.error(`WebSocket handler error: ${message}`, error);

    this.sendMessage({
      type: "error",
      requestId,
      message,
      error: error ? error.message : null,
      timestamp: Date.now(),
    });
  }

  /**
   * Get status of the handler and active streams
   */
  getStatus() {
    const streamManagerStatus = this.streamManager.getStatus();

    return {
      connectionId: this.connectionId,
      isConnected: this.isConnected,
      activeStreamsCount: this.activeStreams.size,
      activeStreams: Array.from(this.activeStreams.keys()),
      streamManagerStatus,
      audioProcessingEnabled: !!this.audioProcessor,
      options: this.options,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log(`Cleaning up WebSocket handler: ${this.connectionId}`);

    // Stop all active streams
    for (const callUuid of this.activeStreams.keys()) {
      this.streamManager.stopStream(callUuid).catch((error) => {
        console.error(`Error stopping stream for call ${callUuid}:`, error);
      });
    }

    // Cleanup stream manager
    this.streamManager.cleanup();

    // Clear active streams
    this.activeStreams.clear();

    this.emit("cleanup");
  }

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close the WebSocket connection
   */
  close(code = 1000, reason = "Handler closed") {
    if (this.isConnected) {
      this.ws.close(code, reason);
    }
  }

  /**
   * Convert audio format for client
   */
  convertAudioFormat(audioBuffer, fromFormat, toFormat) {
    if (!this.audioProcessor) {
      return audioBuffer;
    }

    // Add format conversion logic based on requirements
    if (fromFormat === "mulaw" && toFormat === "linear") {
      return AudioConverter.mulawToLinear(audioBuffer);
    } else if (fromFormat === "linear" && toFormat === "mulaw") {
      return AudioConverter.linearToMulaw(audioBuffer);
    }

    return audioBuffer;
  }

  /**
   * Enable/disable audio processing
   */
  setAudioProcessing(enabled, options = {}) {
    if (enabled && !this.audioProcessor) {
      this.audioProcessor = new AudioProcessor({ ...this.options, ...options });
    } else if (!enabled) {
      this.audioProcessor = null;
    }

    this.sendMessage({
      type: "audioProcessingChanged",
      enabled,
      options,
    });
  }
}

/**
 * WebSocket Handler Factory
 * Creates handlers for incoming WebSocket connections
 */
export class PlivoWebSocketHandlerFactory {
  constructor(client, defaultOptions = {}) {
    this.client = client;
    this.defaultOptions = defaultOptions;
    this.activeHandlers = new Map();
  }

  /**
   * Create a handler for an incoming WebSocket connection
   */
  createHandler(ws, options = {}) {
    const handlerOptions = { ...this.defaultOptions, ...options };
    const handler = new PlivoWebSocketHandler(ws, this.client, handlerOptions);

    // Track active handlers
    this.activeHandlers.set(handler.connectionId, handler);

    // Remove handler when disconnected
    handler.on("disconnected", () => {
      this.activeHandlers.delete(handler.connectionId);
    });

    handler.on("cleanup", () => {
      this.activeHandlers.delete(handler.connectionId);
    });

    return handler;
  }

  /**
   * Get all active handlers
   */
  getActiveHandlers() {
    return Array.from(this.activeHandlers.values());
  }

  /**
   * Get handler by connection ID
   */
  getHandler(connectionId) {
    return this.activeHandlers.get(connectionId);
  }

  /**
   * Close all handlers
   */
  closeAllHandlers() {
    for (const handler of this.activeHandlers.values()) {
      handler.close();
    }
    this.activeHandlers.clear();
  }

  /**
   * Get factory status
   */
  getStatus() {
    return {
      activeHandlersCount: this.activeHandlers.size,
      handlerIds: Array.from(this.activeHandlers.keys()),
      defaultOptions: this.defaultOptions,
    };
  }
}

/**
 * Message types for WebSocket communication
 */
export const WebSocketMessageTypes = {
  // Client to server
  START_STREAM: "startStream",
  STOP_STREAM: "stopStream",
  SEND_AUDIO: "sendAudio",
  PLAY_AUDIO: "playAudio",
  STOP_AUDIO: "stopAudio",
  GET_STREAM_INFO: "getStreamInfo",
  GET_ALL_STREAMS: "getAllStreams",
  GET_STATUS: "getStatus",
  PING: "ping",

  // Server to client
  CONNECTED: "connected",
  STREAM_STARTED: "streamStarted",
  STREAM_STOPPED: "streamStopped",
  STREAM_CONNECTED: "streamConnected",
  STREAM_DISCONNECTED: "streamDisconnected",
  AUDIO_DATA: "audioData",
  STREAM_ERROR: "streamError",
  ERROR: "error",
  PONG: "pong",

  // Responses
  STREAM_START_RESPONSE: "streamStartResponse",
  STREAM_STOP_RESPONSE: "streamStopResponse",
  SEND_AUDIO_RESPONSE: "sendAudioResponse",
  PLAY_AUDIO_RESPONSE: "playAudioResponse",
  STOP_AUDIO_RESPONSE: "stopAudioResponse",
  STREAM_INFO_RESPONSE: "streamInfoResponse",
  ALL_STREAMS_RESPONSE: "allStreamsResponse",
  STATUS_RESPONSE: "statusResponse",
};
