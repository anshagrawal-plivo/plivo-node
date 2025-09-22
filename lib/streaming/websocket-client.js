import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Plivo WebSocket Audio Stream Client
 * Handles real-time audio streaming over WebSocket connections
 */
export class PlivoWebSocketClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
      heartbeatInterval: 30000,
      ...options
    };
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.heartbeatTimer = null;
    this.isConnected = false;
    this.streamId = null;
    this.callUuid = null;
  }

  /**
   * Connect to Plivo's WebSocket stream
   * @param {string} streamUrl - WebSocket URL provided by Plivo
   * @param {object} options - Connection options
   */
  connect(streamUrl, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(streamUrl, {
          headers: options.headers || {},
          ...options.wsOptions
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.emit('disconnected', { code, reason: reason.toString() });
          
          if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect(streamUrl, options);
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Buffer|string} data - Raw message data
   */
  handleMessage(data) {
    try {
      // Parse JSON messages (stream events)
      const message = JSON.parse(data.toString());
      this.handleStreamEvent(message);
    } catch (error) {
      // Handle binary audio data
      this.handleAudioData(data);
    }
  }

  /**
   * Handle stream events (start, stop, error, etc.)
   * @param {object} event - Stream event object
   */
  handleStreamEvent(event) {
    switch (event.event) {
      case 'start':
        this.streamId = event.streamId;
        this.callUuid = event.callUuid;
        this.emit('streamStart', event);
        break;
      case 'stop':
        this.emit('streamStop', event);
        break;
      case 'media':
        this.handleMediaEvent(event);
        break;
      case 'error':
        this.emit('streamError', event);
        break;
      default:
        this.emit('streamEvent', event);
    }
  }

  /**
   * Handle media events containing audio data
   * @param {object} event - Media event object
   */
  handleMediaEvent(event) {
    if (event.media && event.media.payload) {
      // Decode base64 audio payload
      const audioBuffer = Buffer.from(event.media.payload, 'base64');
      this.emit('audioData', {
        timestamp: event.media.timestamp,
        track: event.media.track,
        audioBuffer: audioBuffer,
        sequenceNumber: event.sequenceNumber
      });
    }
  }

  /**
   * Handle raw audio data
   * @param {Buffer} data - Raw audio buffer
   */
  handleAudioData(data) {
    this.emit('rawAudioData', data);
  }

  /**
   * Send audio data to the stream (for bidirectional streams)
   * @param {Buffer} audioBuffer - Audio data to send
   * @param {object} options - Send options
   */
  sendAudio(audioBuffer, options = {}) {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    const mediaEvent = {
      event: 'media',
      streamId: this.streamId,
      media: {
        timestamp: options.timestamp || Date.now(),
        payload: audioBuffer.toString('base64'),
        track: options.track || 'inbound'
      }
    };

    this.ws.send(JSON.stringify(mediaEvent));
  }

  /**
   * Send play audio command (for bidirectional streams)
   * @param {string} audioUrl - URL of audio file to play
   */
  playAudio(audioUrl) {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    const playEvent = {
      event: 'playAudio',
      streamId: this.streamId,
      audioUrl: audioUrl
    };

    this.ws.send(JSON.stringify(playEvent));
  }

  /**
   * Stop playing audio
   */
  stopAudio() {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    const stopEvent = {
      event: 'stopAudio',
      streamId: this.streamId
    };

    this.ws.send(JSON.stringify(stopEvent));
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.ws.ping();
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   * @param {string} streamUrl - WebSocket URL
   * @param {object} options - Connection options
   */
  scheduleReconnect(streamUrl, options) {
    setTimeout(() => {
      this.reconnectAttempts++;
      this.emit('reconnecting', { attempt: this.reconnectAttempts });
      this.connect(streamUrl, options).catch((error) => {
        this.emit('reconnectFailed', { attempt: this.reconnectAttempts, error });
      });
    }, this.options.reconnectInterval * this.reconnectAttempts);
  }

  /**
   * Manually disconnect from the stream
   */
  disconnect() {
    this.options.autoReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws && this.isConnected) {
      this.ws.close();
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      streamId: this.streamId,
      callUuid: this.callUuid,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}
