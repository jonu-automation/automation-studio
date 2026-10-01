import { EventEmitter } from "events";

const bus = new EventEmitter();
bus.setMaxListeners(500);

// Buffer events per execution so SSE clients that connect slightly late still get history
const eventBuffers = new Map<number, ExecutionEvent[]>();
const BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type ExecutionEventType =
  | "node:start"
  | "node:complete"
  | "workflow:start"
  | "workflow:done"
  | "workflow:paused";

export interface ExecutionEvent {
  eventType: ExecutionEventType;
  executionId: number;
  timestamp: string;
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  status?: string;
  durationMs?: number;
  output?: unknown;
  error?: string | null;
}

export function emitExecutionEvent(event: ExecutionEvent) {
  const { executionId } = event;

  // Buffer event
  if (!eventBuffers.has(executionId)) {
    eventBuffers.set(executionId, []);
    // Auto-clean buffer after TTL
    setTimeout(() => eventBuffers.delete(executionId), BUFFER_TTL_MS).unref();
  }
  eventBuffers.get(executionId)!.push(event);

  bus.emit(`execution:${executionId}`, event);
}

export function getBufferedEvents(executionId: number): ExecutionEvent[] {
  return eventBuffers.get(executionId) ?? [];
}

export function subscribeToExecution(
  executionId: number,
  handler: (event: ExecutionEvent) => void,
): () => void {
  const channel = `execution:${executionId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}
