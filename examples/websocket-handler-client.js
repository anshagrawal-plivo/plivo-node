/**
 * Example WebSocket Client for Plivo WebSocket Handler
 * Demonstrates how to connect to and interact with the WebSocket handler
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

/**
 * WebSocket Client for Plivo Streaming
 */
class PlivoWebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 2000,
      ...options,
    };

    this.ws = null;
    this.connected = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.reconnectAttempts = 0;
    this.connectionId = null;
    this.audioBuffer = [];
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.url}...`);

      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log("✅ Connected to WebSocket server");
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      });

      this.ws.on("close", (code, reason) => {
        this.connected = false;
        console.log(`❌ Disconnected: ${code} - ${reason}`);

        if (
          this.options.autoReconnect &&
          this.reconnectAttempts < this.options.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      });
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(message) {
    console.log(
      `📥 Received: ${message.type}`,
      message.requestId ? `(${message.requestId})` : ""
    );

    // Handle responses to pending requests
    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const { resolve, reject } = this.pendingRequests.get(message.requestId);
      this.pendingRequests.delete(message.requestId);

      if (message.type === "error") {
        reject(new Error(message.message));
      } else {
        resolve(message);
      }
      return;
    }

    // Handle server-initiated messages
    switch (message.type) {
      case "connected":
        this.connectionId = message.connectionId;
        console.log(`🔗 Connection ID: ${this.connectionId}`);
        break;

      case "audioData":
        this.handleAudioData(message);
        break;

      case "streamStarted":
        console.log(
          `🎵 Stream started for call ${message.callUuid} (Stream ID: ${message.streamId})`
        );
        break;

      case "streamStopped":
        console.log(`⏹️ Stream stopped for call ${message.callUuid}`);
        break;

      case "streamConnected":
        console.log(`🔌 Stream connected for call ${message.callUuid}`);
        break;

      case "streamDisconnected":
        console.log(`🔌❌ Stream disconnected for call ${message.callUuid}`);
        break;

      case "streamError":
        console.error(
          `❌ Stream error for call ${message.callUuid}: ${message.error}`
        );
        break;

      case "error":
        console.error(`❌ Server error: ${message.message}`);
        break;

      case "pong":
        console.log("🏓 Pong received");
        break;

      default:
        console.log(`🤷 Unhandled message type: ${message.type}`);
    }
  }

  /**
   * Handle incoming audio data
   */
  handleAudioData(message) {
    const { callUuid, timestamp, track, audioData, sequenceNumber } = message;

    console.log(
      `🎵 Audio data: Call ${callUuid}, Track ${track}, Size: ${
        audioData.length
      } bytes (base64), Seq: ${sequenceNumber || "N/A"}`
    );

    // Store audio for processing
    this.audioBuffer.push({
      callUuid,
      timestamp,
      track,
      audioBuffer: Buffer.from(audioData, "base64"),
      sequenceNumber,
    });

    // Process audio (example: save to file)
    this.processAudioData(Buffer.from(audioData, "base64"), callUuid, track);
  }

  /**
   * Process received audio data
   */
  processAudioData(audioBuffer, callUuid, track) {
    // Example: Save audio to file
    const filename = `audio-${callUuid}-${track}-${Date.now()}.raw`;
    const filepath = path.join(__dirname, "recordings", filename);

    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append audio data to file
    fs.appendFileSync(filepath, audioBuffer);
  }

  /**
   * Send message with request tracking
   */
  sendRequest(message) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("Not connected to WebSocket server"));
        return;
      }

      const requestId = ++this.requestId;
      const fullMessage = { requestId, ...message };

      this.pendingRequests.set(requestId, { resolve, reject });

      this.ws.send(JSON.stringify(fullMessage));

      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout: ${message.type}`));
        }
      }, 10000);
    });
  }

  /**
   * Send message without expecting response
   */
  sendMessage(message) {
    if (this.connected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start an audio stream
   */
  async startStream(callUuid, serviceUrl, streamOptions = {}) {
    console.log(`🚀 Starting stream for call ${callUuid}...`);

    return this.sendRequest({
      type: "startStream",
      callUuid,
      serviceUrl,
      streamOptions,
    });
  }

  /**
   * Stop an audio stream
   */
  async stopStream(callUuid, streamId = null) {
    console.log(`⏹️ Stopping stream for call ${callUuid}...`);

    return this.sendRequest({
      type: "stopStream",
      callUuid,
      streamId,
    });
  }

  /**
   * Send audio data to a stream
   */
  async sendAudio(callUuid, audioBuffer, options = {}) {
    console.log(
      `🎤 Sending audio to call ${callUuid}: ${audioBuffer.length} bytes`
    );

    const audioData = audioBuffer.toString("base64");

    return this.sendRequest({
      type: "sendAudio",
      callUuid,
      audioData,
      options,
    });
  }

  /**
   * Play audio file on stream
   */
  async playAudio(callUuid, audioUrl) {
    console.log(`▶️ Playing audio on call ${callUuid}: ${audioUrl}`);

    return this.sendRequest({
      type: "playAudio",
      callUuid,
      audioUrl,
    });
  }

  /**
   * Stop playing audio
   */
  async stopAudio(callUuid) {
    console.log(`⏸️ Stopping audio for call ${callUuid}`);

    return this.sendRequest({
      type: "stopAudio",
      callUuid,
    });
  }

  /**
   * Get stream information
   */
  async getStreamInfo(callUuid, streamId) {
    return this.sendRequest({
      type: "getStreamInfo",
      callUuid,
      streamId,
    });
  }

  /**
   * Get all streams for a call
   */
  async getAllStreams(callUuid) {
    return this.sendRequest({
      type: "getAllStreams",
      callUuid,
    });
  }

  /**
   * Get server status
   */
  async getStatus() {
    return this.sendRequest({
      type: "getStatus",
    });
  }

  /**
   * Send ping to server
   */
  ping() {
    this.sendMessage({
      type: "ping",
      timestamp: Date.now(),
    });
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    this.reconnectAttempts++;

    console.log(
      `🔄 Reconnecting in ${this.options.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, this.options.reconnectInterval);
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.options.autoReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }

  /**
   * Get collected audio data
   */
  getAudioBuffer() {
    return this.audioBuffer;
  }

  /**
   * Clear audio buffer
   */
  clearAudioBuffer() {
    this.audioBuffer = [];
  }
}

/**
 * Example usage and testing
 */
async function runExample() {
  const client = new PlivoWebSocketClient("ws://localhost:8080");

  try {
    // Connect to server
    await client.connect();

    // Test ping
    client.ping();

    // Get server status
    setTimeout(async () => {
      try {
        const status = await client.getStatus();
        console.log("📊 Server status:", JSON.stringify(status, null, 2));
      } catch (error) {
        console.error("Failed to get status:", error);
      }
    }, 1000);

    // Example stream operations (replace with actual values)
    setTimeout(async () => {
      try {
        // Start a stream
        const response = await client.startStream(
          "example-call-uuid",
          "wss://your-stream-service.com/stream",
          {
            bidirectional: true,
            contentType: "audio/x-l16;rate=8000",
          }
        );
        console.log("✅ Stream start response:", response);

        // Send some example audio data
        setTimeout(async () => {
          const exampleAudio = Buffer.alloc(1600, 0); // 100ms of silence at 8kHz
          await client.sendAudio("example-call-uuid", exampleAudio);
        }, 2000);

        // Stop the stream after 10 seconds
        setTimeout(async () => {
          await client.stopStream("example-call-uuid");
        }, 10000);
      } catch (error) {
        console.error("Stream operation failed:", error);
      }
    }, 2000);

    // Keep connection alive for testing
    console.log("🔄 Client running... Press Ctrl+C to exit");
  } catch (error) {
    console.error("Failed to connect:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down client...");
  process.exit(0);
});

// Run example if this file is executed directly
if (require.main === module) {
  runExample();
}

module.exports = PlivoWebSocketClient;
