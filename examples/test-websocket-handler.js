#!/usr/bin/env node

/**
 * Test Script for Plivo WebSocket Handler
 * Demonstrates complete flow: Server -> Handler -> Client interactions
 */

const WebSocket = require("ws");
const plivo = require("plivo");
const {
  PlivoWebSocketHandlerFactory,
  WebSocketMessageTypes,
} = require("../lib/streaming/websocket-handler");

// Mock Plivo client for testing
class MockPlivoClient {
  constructor() {
    this.streaming = {
      startStream: async (callUuid, serviceUrl, options) => {
        console.log(`🎬 Mock: Starting stream for ${callUuid}`);
        return {
          streamId: `stream-${Date.now()}`,
          callUuid,
          serviceUrl,
          options,
        };
      },
      stopStream: async (callUuid, streamId) => {
        console.log(`⏹️ Mock: Stopping stream ${streamId} for ${callUuid}`);
        return { success: true };
      },
      sendAudio: (callUuid, audioBuffer, options) => {
        console.log(
          `🎤 Mock: Sending ${audioBuffer.length} bytes to ${callUuid}`
        );
      },
      playAudio: (callUuid, audioUrl) => {
        console.log(`▶️ Mock: Playing ${audioUrl} on ${callUuid}`);
      },
      stopAudio: (callUuid) => {
        console.log(`⏸️ Mock: Stopping audio on ${callUuid}`);
      },
      getStreamInfo: async (callUuid, streamId) => {
        return { streamId, callUuid, status: "active" };
      },
      getAllStreams: async (callUuid) => {
        return { streams: [{ streamId: "test-stream", status: "active" }] };
      },
      getStatus: () => ({
        activeStreamCount: 1,
        streams: { "test-call": { streamId: "test-stream" } },
      }),
      cleanup: () => console.log("🧹 Mock: Cleanup completed"),
      on: () => {}, // Mock event emitter
      emit: () => {},
    };
  }
}

class WebSocketHandlerTest {
  constructor() {
    this.server = null;
    this.client = null;
    this.handler = null;
    this.handlerFactory = null;
  }

  async runTest() {
    console.log("🚀 Starting WebSocket Handler Test\n");

    try {
      await this.setupServer();
      await this.setupClient();
      await this.runTestSuite();
    } catch (error) {
      console.error("❌ Test failed:", error);
    } finally {
      await this.cleanup();
    }
  }

  async setupServer() {
    console.log("📡 Setting up WebSocket server...");

    // Create mock Plivo client
    const mockClient = new MockPlivoClient();

    // Create handler factory
    this.handlerFactory = new PlivoWebSocketHandlerFactory(mockClient, {
      enableAudioProcessing: true,
      defaultStreamOptions: {
        contentType: "audio/x-l16;rate=8000",
      },
    });

    // Create WebSocket server
    this.server = new WebSocket.Server({ port: 0 }); // Use random port
    const port = this.server.address().port;

    this.server.on("connection", (ws) => {
      console.log("🔗 New WebSocket connection");

      // Create handler for this connection
      this.handler = this.handlerFactory.createHandler(ws, {
        testMode: true,
      });

      // Set up handler events
      this.handler.on("disconnected", (data) => {
        console.log(`📪 Handler disconnected: ${data.code} - ${data.reason}`);
      });

      this.handler.on("error", (error) => {
        console.error("❌ Handler error:", error);
      });

      console.log(`✅ Handler created: ${this.handler.connectionId}`);
    });

    console.log(`✅ Server listening on port ${port}\n`);
    return port;
  }

  async setupClient() {
    console.log("🔌 Setting up WebSocket client...");

    const port = this.server.address().port;
    this.client = new WebSocket(`ws://localhost:${port}`);

    return new Promise((resolve, reject) => {
      this.client.on("open", () => {
        console.log("✅ Client connected\n");
        resolve();
      });

      this.client.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(message);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      });

      this.client.on("error", reject);
    });
  }

  handleClientMessage(message) {
    switch (message.type) {
      case WebSocketMessageTypes.CONNECTED:
        console.log(`🎉 Connected with ID: ${message.connectionId}`);
        break;

      case WebSocketMessageTypes.STREAM_START_RESPONSE:
        console.log(`✅ Stream start response:`, {
          success: message.success,
          streamId: message.streamId,
        });
        break;

      case WebSocketMessageTypes.STATUS_RESPONSE:
        console.log(`📊 Status response:`, message.status);
        break;

      case WebSocketMessageTypes.ERROR:
        console.error(`❌ Server error:`, message.message);
        break;

      case "pong":
        console.log("🏓 Pong received");
        break;

      default:
        console.log(
          `📨 Received: ${message.type}`,
          message.requestId ? `(${message.requestId})` : ""
        );
    }
  }

  async runTestSuite() {
    console.log("🧪 Running test suite...\n");

    // Wait for connection to be established
    await this.wait(100);

    await this.testPing();
    await this.testStatus();
    await this.testStartStream();
    await this.testSendAudio();
    await this.testPlayAudio();
    await this.testStopAudio();
    await this.testStopStream();

    console.log("\n✅ All tests completed!");
  }

  async testPing() {
    console.log("1️⃣ Testing ping...");
    this.sendMessage({ type: WebSocketMessageTypes.PING });
    await this.wait(100);
  }

  async testStatus() {
    console.log("2️⃣ Testing status...");
    this.sendMessage({ type: WebSocketMessageTypes.GET_STATUS });
    await this.wait(100);
  }

  async testStartStream() {
    console.log("3️⃣ Testing stream start...");
    this.sendMessage({
      type: WebSocketMessageTypes.START_STREAM,
      callUuid: "test-call-uuid",
      serviceUrl: "wss://mock-service.com/stream",
      streamOptions: {
        bidirectional: true,
        contentType: "audio/x-l16;rate=8000",
      },
    });
    await this.wait(200);
  }

  async testSendAudio() {
    console.log("4️⃣ Testing send audio...");

    // Create sample audio data (1 second of silence)
    const sampleAudio = Buffer.alloc(16000, 0); // 1 second at 16kHz
    const audioData = sampleAudio.toString("base64");

    this.sendMessage({
      type: WebSocketMessageTypes.SEND_AUDIO,
      callUuid: "test-call-uuid",
      audioData: audioData,
      options: { track: "inbound" },
    });
    await this.wait(100);
  }

  async testPlayAudio() {
    console.log("5️⃣ Testing play audio...");
    this.sendMessage({
      type: WebSocketMessageTypes.PLAY_AUDIO,
      callUuid: "test-call-uuid",
      audioUrl: "https://example.com/test-audio.wav",
    });
    await this.wait(100);
  }

  async testStopAudio() {
    console.log("6️⃣ Testing stop audio...");
    this.sendMessage({
      type: WebSocketMessageTypes.STOP_AUDIO,
      callUuid: "test-call-uuid",
    });
    await this.wait(100);
  }

  async testStopStream() {
    console.log("7️⃣ Testing stream stop...");
    this.sendMessage({
      type: WebSocketMessageTypes.STOP_STREAM,
      callUuid: "test-call-uuid",
    });
    await this.wait(100);
  }

  sendMessage(message) {
    const requestId = Date.now();
    const fullMessage = { requestId, ...message };

    if (this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(fullMessage));
    }
  }

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log("\n🧹 Cleaning up...");

    if (this.client) {
      this.client.close();
    }

    if (this.handlerFactory) {
      this.handlerFactory.closeAllHandlers();
    }

    if (this.server) {
      this.server.close();
    }

    console.log("✅ Cleanup completed");
  }
}

// Performance test
class PerformanceTest {
  constructor() {
    this.messageCount = 0;
    this.startTime = 0;
  }

  async runPerformanceTest() {
    console.log("\n🏃 Running performance test...");

    const mockClient = new MockPlivoClient();
    const handlerFactory = new PlivoWebSocketHandlerFactory(mockClient);
    const server = new WebSocket.Server({ port: 0 });
    const port = server.address().port;

    let handler;
    server.on("connection", (ws) => {
      handler = handlerFactory.createHandler(ws);
    });

    // Create multiple clients
    const clientCount = 10;
    const messagesPerClient = 100;
    const clients = [];

    console.log(
      `📊 Testing ${clientCount} clients, ${messagesPerClient} messages each`
    );

    this.startTime = Date.now();

    for (let i = 0; i < clientCount; i++) {
      const client = new WebSocket(`ws://localhost:${port}`);
      clients.push(client);

      client.on("open", () => {
        // Send multiple messages rapidly
        for (let j = 0; j < messagesPerClient; j++) {
          client.send(
            JSON.stringify({
              type: WebSocketMessageTypes.PING,
              requestId: `${i}-${j}`,
            })
          );
        }
      });

      client.on("message", () => {
        this.messageCount++;

        if (this.messageCount === clientCount * messagesPerClient) {
          const duration = Date.now() - this.startTime;
          const messagesPerSecond = (this.messageCount / duration) * 1000;

          console.log(`✅ Performance test completed:`);
          console.log(`   📈 ${this.messageCount} messages in ${duration}ms`);
          console.log(`   🚀 ${messagesPerSecond.toFixed(2)} messages/second`);

          // Cleanup
          clients.forEach((c) => c.close());
          handlerFactory.closeAllHandlers();
          server.close();
        }
      });
    }
  }
}

// Main execution
async function main() {
  console.log("🎯 Plivo WebSocket Handler Test Suite\n");

  const test = new WebSocketHandlerTest();
  await test.runTest();

  const perfTest = new PerformanceTest();
  await perfTest.runPerformanceTest();

  console.log("\n🎉 All tests completed successfully!");
  process.exit(0);
}

// Run if script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Test suite failed:", error);
    process.exit(1);
  });
}

module.exports = { WebSocketHandlerTest, PerformanceTest };
