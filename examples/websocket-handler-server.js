/**
 * Example WebSocket Server using PlivoWebSocketHandler
 * Demonstrates how to use the WebSocket handler to manage Plivo streams
 */

const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const plivo = require("plivo");
const {
  PlivoWebSocketHandlerFactory,
  WebSocketMessageTypes,
} = require("../lib/streaming/websocket-handler");

class PlivoWebSocketServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8080,
      httpPort: options.httpPort || 3000,
      ...options,
    };

    // Initialize Plivo client
    this.plivoClient = new plivo.Client(
      process.env.PLIVO_AUTH_ID,
      process.env.PLIVO_AUTH_TOKEN
    );

    // Initialize WebSocket handler factory
    this.handlerFactory = new PlivoWebSocketHandlerFactory(this.plivoClient, {
      enableAudioProcessing: true,
      defaultStreamOptions: {
        contentType: "audio/x-l16;rate=8000",
        statusCallbackUrl: `http://localhost:${this.options.httpPort}/stream-status`,
      },
    });

    this.setupHTTPServer();
    this.setupWebSocketServer();
  }

  setupHTTPServer() {
    this.app = express();
    this.app.use(express.json());

    // Stream status callback endpoint
    this.app.post("/stream-status", (req, res) => {
      console.log("Stream status callback:", req.body);
      res.status(200).send("OK");
    });

    // API endpoints for monitoring
    this.app.get("/status", (req, res) => {
      res.json({
        server: "healthy",
        handlers: this.handlerFactory.getStatus(),
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get("/handlers", (req, res) => {
      const handlers = this.handlerFactory
        .getActiveHandlers()
        .map((handler) => ({
          connectionId: handler.connectionId,
          status: handler.getStatus(),
        }));
      res.json(handlers);
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        activeHandlers: this.handlerFactory.getStatus().activeHandlersCount,
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
        const { req } = info;
        console.log(`WebSocket connection from: ${req.socket.remoteAddress}`);
        return true;
      },
    });

    console.log(`WebSocket server listening on port ${this.options.port}`);

    this.wss.on("connection", (ws, req) => {
      console.log("New WebSocket connection established");

      // Create handler for this connection
      const handler = this.handlerFactory.createHandler(ws, {
        clientInfo: {
          ip: req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });

      // Log handler events
      handler.on("disconnected", (data) => {
        console.log(`Handler disconnected: ${handler.connectionId}`, data);
      });

      handler.on("error", (error) => {
        console.error(`Handler error: ${handler.connectionId}`, error);
      });

      console.log(`Handler created: ${handler.connectionId}`);
    });

    this.wss.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
  }

  getStatus() {
    return {
      httpPort: this.options.httpPort,
      wsPort: this.options.port,
      connectedClients: this.wss.clients.size,
      handlerFactory: this.handlerFactory.getStatus(),
    };
  }

  shutdown() {
    console.log("Shutting down Plivo WebSocket server...");

    // Close all handlers
    this.handlerFactory.closeAllHandlers();

    // Close WebSocket server
    this.wss.close();

    // Close HTTP server
    this.httpServer.close();

    console.log("Server shutdown complete");
  }
}

// WebSocket Client Example for testing
class TestWebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.requestId = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.connected = true;
        console.log("Connected to WebSocket server");
        resolve();
      });

      this.ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on("close", (code, reason) => {
        this.connected = false;
        console.log(`Disconnected: ${code} - ${reason}`);
      });

      this.ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      });
    });
  }

  handleMessage(message) {
    console.log("Received message:", message);

    switch (message.type) {
      case WebSocketMessageTypes.CONNECTED:
        console.log(`Connected with ID: ${message.connectionId}`);
        break;
      case WebSocketMessageTypes.AUDIO_DATA:
        console.log(
          `Audio data received for call ${message.callUuid}: ${message.audioData.length} bytes (base64)`
        );
        break;
      case WebSocketMessageTypes.STREAM_STARTED:
        console.log(`Stream started for call ${message.callUuid}`);
        break;
      case WebSocketMessageTypes.STREAM_ERROR:
        console.error(`Stream error: ${message.error}`);
        break;
      default:
        console.log(`Unhandled message type: ${message.type}`);
    }
  }

  sendMessage(message) {
    if (this.connected) {
      this.ws.send(JSON.stringify({ requestId: ++this.requestId, ...message }));
    }
  }

  // Helper methods for testing
  startStream(callUuid, serviceUrl, streamOptions = {}) {
    this.sendMessage({
      type: WebSocketMessageTypes.START_STREAM,
      callUuid,
      serviceUrl,
      streamOptions,
    });
  }

  stopStream(callUuid, streamId) {
    this.sendMessage({
      type: WebSocketMessageTypes.STOP_STREAM,
      callUuid,
      streamId,
    });
  }

  sendAudio(callUuid, audioData, options = {}) {
    this.sendMessage({
      type: WebSocketMessageTypes.SEND_AUDIO,
      callUuid,
      audioData, // base64 encoded
      options,
    });
  }

  getStatus() {
    this.sendMessage({
      type: WebSocketMessageTypes.GET_STATUS,
    });
  }

  ping() {
    this.sendMessage({
      type: WebSocketMessageTypes.PING,
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new PlivoWebSocketServer({
    port: process.env.WS_PORT || 8080,
    httpPort: process.env.HTTP_PORT || 3000,
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    server.shutdown();
    process.exit(0);
  });

  console.log("Plivo WebSocket Handler Server started");
  console.log(`WebSocket URL: ws://localhost:${process.env.WS_PORT || 8080}`);
  console.log(`HTTP URL: http://localhost:${process.env.HTTP_PORT || 3000}`);
  console.log("Example usage:");
  console.log("curl http://localhost:3000/status");
  console.log("curl http://localhost:3000/handlers");

  // Example client usage (uncomment to test)
  /*
  setTimeout(async () => {
    console.log("\n--- Testing WebSocket Client ---");
    const client = new TestWebSocketClient(`ws://localhost:${process.env.WS_PORT || 8080}`);
    
    try {
      await client.connect();
      
      // Test ping
      client.ping();
      
      // Test status
      setTimeout(() => client.getStatus(), 1000);
      
      // Test stream start (replace with actual call UUID and service URL)
      setTimeout(() => {
        client.startStream(
          "test-call-uuid",
          "wss://your-stream-service.com/stream",
          { bidirectional: true }
        );
      }, 2000);
      
    } catch (error) {
      console.error("Client test failed:", error);
    }
  }, 3000);
  */
}

module.exports = { PlivoWebSocketServer, TestWebSocketClient };
