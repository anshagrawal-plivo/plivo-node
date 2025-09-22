import { EventEmitter } from "events";
import { PlivoWebSocketClient } from "./websocket-client.js";
import { AudioProcessor, AudioConverter } from "./audio-processor.js";

/**
 * Plivo Stream Manager
 * High-level interface for managing audio streams
 */
export class PlivoStreamManager extends EventEmitter {
  constructor(client, options = {}) {
    super();

    this.client = client;
    this.options = Object.assign(
      {
        autoReconnect: true,
        maxReconnectAttempts: 5,
        audioProcessing: true,
        bufferSize: 1600,
      },
      options
    );

    this.activeStreams = new Map();
    this.audioProcessor = null;

    if (this.options.audioProcessing) {
      this.audioProcessor = new AudioProcessor(this.options);
    }
  }

  /**
   * Start an audio stream for a call
   * @param {string} callUuid - Call UUID
   * @param {string} serviceUrl - WebSocket service URL
   * @param {object} streamOptions - Stream configuration options
   * @returns {Promise<PlivoWebSocketClient>} WebSocket client instance
   */
  async startStream(callUuid, serviceUrl, streamOptions = {}) {
    try {
      // First, initiate the stream via API
      const streamResponse = await this.client.calls.stream(
        callUuid,
        serviceUrl,
        streamOptions
      );

      // Create WebSocket client for the stream
      const wsClient = new PlivoWebSocketClient(this.options);

      // Set up event forwarding
      this.setupStreamEventHandlers(wsClient, callUuid);

      // Connect to the WebSocket
      await wsClient.connect(serviceUrl, {
        headers: streamOptions.extraHeaders || {},
      });

      // Store the active stream
      this.activeStreams.set(callUuid, {
        wsClient,
        streamId: streamResponse.streamId,
        options: streamOptions,
      });

      this.emit("streamStarted", {
        callUuid,
        streamId: streamResponse.streamId,
        wsClient,
      });

      return wsClient;
    } catch (error) {
      this.emit("streamError", { callUuid, error });
      throw error;
    }
  }

  /**
   * Stop an audio stream for a call
   * @param {string} callUuid - Call UUID
   * @param {string} streamId - Stream ID (optional)
   * @returns {Promise<void>}
   */
  async stopStream(callUuid, streamId = null) {
    try {
      const streamInfo = this.activeStreams.get(callUuid);

      if (streamInfo) {
        // Disconnect WebSocket
        streamInfo.wsClient.disconnect();

        // Stop stream via API
        if (streamId) {
          await this.client.calls.stopStream(callUuid, streamId);
        } else {
          await this.client.calls.stopAllStream(callUuid);
        }

        // Remove from active streams
        this.activeStreams.delete(callUuid);

        this.emit("streamStopped", { callUuid, streamId });
      }
    } catch (error) {
      this.emit("streamError", { callUuid, error });
      throw error;
    }
  }

  /**
   * Get information about an active stream
   * @param {string} callUuid - Call UUID
   * @param {string} streamId - Stream ID
   * @returns {Promise<object>} Stream information
   */
  async getStreamInfo(callUuid, streamId) {
    try {
      return await this.client.calls.getStream(callUuid, streamId);
    } catch (error) {
      this.emit("streamError", { callUuid, error });
      throw error;
    }
  }

  /**
   * Get all active streams for a call
   * @param {string} callUuid - Call UUID
   * @returns {Promise<object>} All streams information
   */
  async getAllStreams(callUuid) {
    try {
      return await this.client.calls.getAllStream(callUuid);
    } catch (error) {
      this.emit("streamError", { callUuid, error });
      throw error;
    }
  }

  /**
   * Send audio data to a stream
   * @param {string} callUuid - Call UUID
   * @param {Buffer} audioBuffer - Audio data to send
   * @param {object} options - Send options
   */
  sendAudio(callUuid, audioBuffer, options = {}) {
    const streamInfo = this.activeStreams.get(callUuid);

    if (!streamInfo) {
      throw new Error(`No active stream found for call ${callUuid}`);
    }

    // Process audio if processor is available
    let processedAudio = audioBuffer;
    if (this.audioProcessor && options.processAudio !== false) {
      processedAudio = this.audioProcessor.processAudioBuffer(audioBuffer);
    }

    streamInfo.wsClient.sendAudio(processedAudio, options);
  }

  /**
   * Play audio file on stream
   * @param {string} callUuid - Call UUID
   * @param {string} audioUrl - URL of audio file to play
   */
  playAudio(callUuid, audioUrl) {
    const streamInfo = this.activeStreams.get(callUuid);

    if (!streamInfo) {
      throw new Error(`No active stream found for call ${callUuid}`);
    }

    streamInfo.wsClient.playAudio(audioUrl);
  }

  /**
   * Stop playing audio on stream
   * @param {string} callUuid - Call UUID
   */
  stopAudio(callUuid) {
    const streamInfo = this.activeStreams.get(callUuid);

    if (!streamInfo) {
      throw new Error(`No active stream found for call ${callUuid}`);
    }

    streamInfo.wsClient.stopAudio();
  }

  /**
   * Set up event handlers for a WebSocket stream
   * @param {PlivoWebSocketClient} wsClient - WebSocket client
   * @param {string} callUuid - Call UUID
   */
  setupStreamEventHandlers(wsClient, callUuid) {
    wsClient.on("connected", () => {
      this.emit("streamConnected", { callUuid });
    });

    wsClient.on("disconnected", (data) => {
      this.emit("streamDisconnected", Object.assign({ callUuid }, data));
    });

    wsClient.on("audioData", (audioData) => {
      // Process audio if processor is available
      if (this.audioProcessor) {
        this.audioProcessor.write(audioData);
      }

      this.emit("audioData", Object.assign({ callUuid }, audioData));
    });

    wsClient.on("rawAudioData", (audioBuffer) => {
      this.emit("rawAudioData", { callUuid, audioBuffer });
    });

    wsClient.on("streamStart", (event) => {
      this.emit("streamStartEvent", Object.assign({ callUuid }, event));
    });

    wsClient.on("streamStop", (event) => {
      this.emit("streamStopEvent", Object.assign({ callUuid }, event));
    });

    wsClient.on("streamError", (event) => {
      this.emit("streamError", Object.assign({ callUuid }, event));
    });

    wsClient.on("error", (error) => {
      this.emit("streamError", { callUuid, error });
    });

    wsClient.on("reconnecting", (data) => {
      this.emit("streamReconnecting", Object.assign({ callUuid }, data));
    });

    wsClient.on("reconnectFailed", (data) => {
      this.emit("streamReconnectFailed", Object.assign({ callUuid }, data));
    });

    // Set up audio processing if enabled
    if (this.audioProcessor) {
      this.audioProcessor.on("data", (processedData) => {
        this.emit(
          "processedAudioData",
          Object.assign({ callUuid }, processedData)
        );
      });

      this.audioProcessor.on("error", (error) => {
        this.emit("audioProcessingError", { callUuid, error });
      });
    }
  }

  /**
   * Get status of all active streams
   * @returns {object} Status information
   */
  getStatus() {
    const streams = {};

    for (const [callUuid, streamInfo] of this.activeStreams) {
      streams[callUuid] = {
        streamId: streamInfo.streamId,
        wsStatus: streamInfo.wsClient.getStatus(),
        options: streamInfo.options,
      };
    }

    return {
      activeStreamCount: this.activeStreams.size,
      streams,
      audioProcessingEnabled: !!this.audioProcessor,
    };
  }

  /**
   * Cleanup all streams
   */
  cleanup() {
    for (const [callUuid] of this.activeStreams) {
      this.stopStream(callUuid).catch((error) => {
        console.error(`Error stopping stream for call ${callUuid}:`, error);
      });
    }

    if (this.audioProcessor) {
      this.audioProcessor.end();
    }
  }
}

/**
 * Stream event types for easier reference
 */
export const StreamEvents = {
  STREAM_STARTED: "streamStarted",
  STREAM_STOPPED: "streamStopped",
  STREAM_CONNECTED: "streamConnected",
  STREAM_DISCONNECTED: "streamDisconnected",
  STREAM_ERROR: "streamError",
  AUDIO_DATA: "audioData",
  RAW_AUDIO_DATA: "rawAudioData",
  PROCESSED_AUDIO_DATA: "processedAudioData",
  STREAM_RECONNECTING: "streamReconnecting",
  STREAM_RECONNECT_FAILED: "streamReconnectFailed",
  AUDIO_PROCESSING_ERROR: "audioProcessingError",
};

/**
 * Stream configuration presets
 */
export const StreamPresets = {
  // Basic audio streaming
  BASIC: {
    bidirectional: false,
    audioTrack: "inbound",
    contentType: "audio/x-l16;rate=8000",
    streamTimeout: 3600,
  },

  // Bidirectional streaming for real-time processing
  BIDIRECTIONAL: {
    bidirectional: true,
    audioTrack: "inbound",
    contentType: "audio/x-l16;rate=8000",
    streamTimeout: 3600,
  },

  // High quality audio streaming
  HIGH_QUALITY: {
    bidirectional: false,
    audioTrack: "both",
    contentType: "audio/x-l16;rate=16000",
    streamTimeout: 3600,
  },

  // Real-time transcription
  TRANSCRIPTION: {
    bidirectional: false,
    audioTrack: "inbound",
    contentType: "audio/x-l16;rate=16000",
    streamTimeout: 7200,
  },

  // Voice bot/assistant
  VOICE_BOT: {
    bidirectional: true,
    audioTrack: "inbound",
    contentType: "audio/x-mulaw;rate=8000",
    streamTimeout: 1800,
  },
};
