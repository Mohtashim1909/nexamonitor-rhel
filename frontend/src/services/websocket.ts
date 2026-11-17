import type { WebSocketStatus } from '@/types';

type MessageHandler = (data: any) => void;
type StatusListener = (status: WebSocketStatus) => void;

export class RealtimeWebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDelay: number = 1000;
  private readonly minDelay: number = 1000;
  private readonly maxDelay: number = 16000;
  private readonly backoffFactor: number = 1.5;
  private shouldConnect: boolean = false;
  private status: WebSocketStatus = 'DISCONNECTED';
  private url: string;

  constructor(url?: string) {
    const defaultBase = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000').replace(/^http/, 'ws');
    this.url = url || `${defaultBase}/ws/monitoring`;
  }

  public getStatus(): WebSocketStatus {
    return this.status;
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: WebSocketStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.error('[WS] Error in status listener', e);
        }
      });
    }
  }

  public connect() {
    this.shouldConnect = true;

    // Avoid duplicate connection if already open or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setStatus(this.currentDelay > this.minDelay ? 'RECONNECTING' : 'CONNECTING');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected to NexaMonitor stream:', this.url);
        this.currentDelay = this.minDelay; // Reset backoff on successful connection
        this.setStatus('CONNECTED');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          const type = payload.type || 'message';

          // Notify type-specific handlers
          const handlers = this.handlers.get(type);
          if (handlers) {
            handlers.forEach((h) => {
              try {
                h(payload.data !== undefined ? payload.data : payload);
              } catch (err) {
                console.error(`[WS] Error in handler for type "${type}"`, err);
              }
            });
          }

          // Also notify wildcard '*' handlers with the entire raw payload
          const wildcard = this.handlers.get('*');
          if (wildcard) {
            wildcard.forEach((h) => {
              try {
                h(payload);
              } catch (err) {
                console.error('[WS] Error in wildcard handler', err);
              }
            });
          }
        } catch (parseError) {
          console.warn('[WS] Received unparseable message:', event.data);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.shouldConnect) {
          this.setStatus('RECONNECTING');
          this.scheduleReconnect();
        } else {
          this.setStatus('DISCONNECTED');
        }
      };

      this.ws.onerror = (err) => {
        console.debug('[WS] Socket error encountered:', err);
        // onclose will be triggered automatically by browser
      };
    } catch (err) {
      console.warn('[WS] Exception while initializing socket:', err);
      if (this.shouldConnect) {
        this.setStatus('RECONNECTING');
        this.scheduleReconnect();
      } else {
        this.setStatus('DISCONNECTED');
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    console.log(`[WS] Scheduling reconnect in ${this.currentDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldConnect) {
        this.connect();
      }
    }, this.currentDelay);

    // Calculate next backoff with jitter
    this.currentDelay = Math.min(this.maxDelay, Math.round(this.currentDelay * this.backoffFactor));
  }

  public send(action: string, payload: Record<string, any> = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ action, ...payload }));
      } catch (err) {
        console.error('[WS] Failed to send text over socket:', err);
      }
    }
  }

  public on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unbind function for clean React lifecycle
    return () => {
      this.off(type, handler);
    };
  }

  public off(type: string, handler: MessageHandler) {
    const list = this.handlers.get(type);
    if (list) {
      list.delete(handler);
      if (list.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  public disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }
}

export const wsService = new RealtimeWebSocketService();
