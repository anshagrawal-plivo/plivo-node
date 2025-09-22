/**
 * WebSocket Server Example for Plivo Audio Streaming
 * Demonstrates how to create a WebSocket server that handles Plivo audio streams
 */

const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");

class PlivoStreamServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8080,
      httpPort: options.httpPort || 3000,
      enableRecording: options.enableRecording || true,
      recordingPath: options.recordingPath || "./recordings",
      ...options,
    };

    this.activeStreams = new Map();
    this.setupHTTPServer();
    this.setupWebSocketServer();
  }

  setupHTTPServer() {
    this.app = express();
    this.app.use(express.json());

    // Status callback endpoint
    this.app.post("/stream-status", (req, res) => {
      console.log("Stream status callback:", req.body);
      res.status(200).send("OK");
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        activeStreams: this.activeStreams.size,
        timestamp: new Date().toISOString(),
      });
    });

    // Start HTTP server
    this.httpServer = http.createServer(this.app);
    this.httpServer.listen(this.options.httpPort, () => {
      console.log(`HTTP server listening on port ${this.options.httpPort}`);
    });
  }

  setupWebSocketServer() {
    this.wss = new WebSocket.Server({
      port: this.options.port,
      verifyClient: (info) => {
        // Add authentication logic here if needed
        return true;
      },
    });

    console.log(`WebSocket server listening on port ${this.options.port}`);

    this.wss.on("connection", (ws, req) => {
      const streamId = this.generateStreamId();
      console.log(`New WebSocket connection: ${streamId}`);

      const streamData = {
        id: streamId,
        ws,
        callUuid: null,
        startTime: Date.now(),
        audioFrames: [],
        recording: null,
      };

      this.activeStreams.set(streamId, streamData);

      // Set up stream event handlers
      this.setupStreamHandlers(ws, streamData);
    });
  }

  setupStreamHandlers(ws, streamData) {
    const { id: streamId } = streamData;

    ws.on("message", (data) => {
      try {
        // Try to parse as JSON (stream events)
        const message = JSON.parse(data.toString());
        this.handleStreamEvent(message, streamData);
      } catch (error) {
        // Handle binary audio data
        this.handleAudioData(data, streamData);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(
        `WebSocket connection closed: ${streamId} (${code}: ${reason})`
      );
      this.cleanupStream(streamData);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for stream ${streamId}:`, error);
      this.cleanupStream(streamData);
    });

    // Send welcome message
    this.sendStreamEvent(ws, {
      event: "connected",
      streamId,
      timestamp: Date.now(),
    });
  }

  handleStreamEvent(event, streamData) {
    console.log(`Stream event: ${event.event}`, event);

    switch (event.event) {
      case "start":
        this.handleStreamStart(event, streamData);
        break;
      case "media":
        this.handleMediaEvent(event, streamData);
        break;
      case "stop":
        this.handleStreamStop(event, streamData);
        break;
      case "playAudio":
        this.handlePlayAudio(event, streamData);
        break;
      case "stopAudio":
        this.handleStopAudio(event, streamData);
        break;
      default:
        console.log(`Unknown stream event: ${event.event}`);
    }
  }

  handleStreamStart(event, streamData) {
    streamData.callUuid = event.callUuid;
    streamData.streamId = event.streamId;

    console.log(`Stream started: ${event.streamId} for call ${event.callUuid}`);

    // Initialize recording if enabled
    if (this.options.enableRecording) {
      this.initializeRecording(streamData);
    }

    // Send acknowledgment
    this.sendStreamEvent(streamData.ws, {
      event: "start",
      streamId: event.streamId,
      status: "ready",
      timestamp: Date.now(),
    });
  }

  handleMediaEvent(event, streamData) {
    if (event.media && event.media.payload) {
      // Decode base64 audio payload
      const audioBuffer = Buffer.from(event.media.payload, "base64");

      // Store audio frame
      streamData.audioFrames.push({
        timestamp: event.media.timestamp,
        track: event.media.track,
        audioBuffer,
      });

      // Save to recording if enabled
      if (streamData.recording) {
        streamData.recording.write(audioBuffer);
      }

      console.log(
        `Received audio: ${audioBuffer.length} bytes, track: ${event.media.track}`
      );

      // Echo audio back if bidirectional (for testing)
      if (event.bidirectional) {
        this.sendAudioBack(streamData, audioBuffer, event.media.track);
      }
    }
  }

  handleStreamStop(event, streamData) {
    console.log(`Stream stopped: ${event.streamId}`);
    this.cleanupStream(streamData);
  }

  handlePlayAudio(event, streamData) {
    console.log(`Play audio request: ${event.audioUrl}`);

    // In a real implementation, you would:
    // 1. Download the audio file
    // 2. Convert it to the appropriate format
    // 3. Stream it back to Plivo

    // For demo, send acknowledgment
    this.sendStreamEvent(streamData.ws, {
      event: "audioPlaying",
      audioUrl: event.audioUrl,
      status: "started",
      timestamp: Date.now(),
    });
  }

  handleStopAudio(event, streamData) {
    console.log("Stop audio request");

    this.sendStreamEvent(streamData.ws, {
      event: "audioStopped",
      status: "stopped",
      timestamp: Date.now(),
    });
  }

  handleAudioData(data, streamData) {
    // Handle raw binary audio data
    console.log(`Received raw audio data: ${data.length} bytes`);

    if (streamData.recording) {
      streamData.recording.write(data);
    }
  }

  sendStreamEvent(ws, event) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  sendAudioBack(streamData, audioBuffer, track) {
    // Example: Echo audio back (modify as needed)
    const mediaEvent = {
      event: "media",
      streamId: streamData.streamId,
      media: {
        timestamp: Date.now(),
        payload: audioBuffer.toString("base64"),
        track: track === "inbound" ? "outbound" : "inbound",
      },
    };

    this.sendStreamEvent(streamData.ws, mediaEvent);
  }

  initializeRecording(streamData) {
    if (!fs.existsSync(this.options.recordingPath)) {
      fs.mkdirSync(this.options.recordingPath, { recursive: true });
    }

    const filename = `recording-${streamData.callUuid}-${Date.now()}.raw`;
    const filepath = path.join(this.options.recordingPath, filename);

    streamData.recording = fs.createWriteStream(filepath);
    console.log(`Recording started: ${filepath}`);
  }

  cleanupStream(streamData) {
    // Close recording file
    if (streamData.recording) {
      streamData.recording.end();
      console.log(`Recording finished for stream ${streamData.id}`);
    }

    // Remove from active streams
    this.activeStreams.delete(streamData.id);

    // Log session statistics
    const duration = Date.now() - streamData.startTime;
    console.log(
      `Stream ${streamData.id} session ended. Duration: ${duration}ms, Frames: ${streamData.audioFrames.length}`
    );
  }

  generateStreamId() {
    return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getStatus() {
    const streams = Array.from(this.activeStreams.values()).map((stream) => ({
      id: stream.id,
      callUuid: stream.callUuid,
      startTime: stream.startTime,
      frameCount: stream.audioFrames.length,
    }));

    return {
      activeStreams: this.activeStreams.size,
      streams,
      uptime: process.uptime(),
    };
  }

  shutdown() {
    console.log("Shutting down stream server...");

    // Close all WebSocket connections
    this.wss.clients.forEach((ws) => {
      ws.close();
    });

    // Close servers
    this.wss.close();
    this.httpServer.close();

    console.log("Stream server shutdown complete");
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new PlivoStreamServer({
    port: process.env.WS_PORT || 8080,
    httpPort: process.env.HTTP_PORT || 3000,
    enableRecording: true,
    recordingPath: "./recordings",
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    server.shutdown();
    process.exit(0);
  });

  console.log("Plivo Stream Server started");
  console.log("WebSocket URL: ws://localhost:8080");
  console.log("HTTP URL: http://localhost:3000");
}

module.exports = PlivoStreamServer;
