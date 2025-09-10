// Server-Sent Events utilities
export class SSEManager {
  private static connections = new Map<string, Set<ReadableStreamDefaultController>>();

  static addConnection(callId: string, controller: ReadableStreamDefaultController) {
    if (!this.connections.has(callId)) {
      this.connections.set(callId, new Set());
    }
    this.connections.get(callId)!.add(controller);
  }

  static removeConnection(callId: string, controller: ReadableStreamDefaultController) {
    const controllers = this.connections.get(callId);
    if (controllers) {
      controllers.delete(controller);
      if (controllers.size === 0) {
        this.connections.delete(callId);
      }
    }
  }

  static sendEvent(callId: string, event: string, data: any) {
    const controllers = this.connections.get(callId);
    if (!controllers) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    for (const controller of controllers) {
      try {
        controller.enqueue(encoded);
      } catch (error) {
        // Controller might be closed
        this.removeConnection(callId, controller);
      }
    }
  }

  static sendStatus(callId: string, status: 'queued' | 'transcribing' | 'analyzing' | 'done' | 'error', detail?: any) {
    this.sendEvent(callId, 'status', { status, detail, timestamp: new Date().toISOString() });
  }
}

// Batch progress tracking
export class BatchProgressTracker {
  private static progress = new Map<string, { scanned: number; posted: number; completed: number; failed: number; total: number }>();

  static initBatch(batchId: string, total: number) {
    this.progress.set(batchId, { scanned: 0, posted: 0, completed: 0, failed: 0, total });
    return batchId;
  }

  static updateProgress(batchId: string, update: Partial<{ scanned: number; posted: number; completed: number; failed: number }>) {
    const current = this.progress.get(batchId);
    if (!current) return null;
    
    const updated = {
      ...current,
      ...update
    };
    this.progress.set(batchId, updated);
    return updated;
  }

  static getProgress(batchId: string) {
    return this.progress.get(batchId) || null;
  }

  static cleanupOld() {
    // Clean up progress older than 1 hour
    // In production, track timestamps and clean periodically
  }
}