import { ToolContext } from "./types";

/**
 * Tipos de eventos de streaming
 */
export type ToolEventType = 
  | 'tool_call' 
  | 'tool_result' 
  | 'final_response'
  | 'error'
  | 'debug';

/**
 * Evento de chamada de tool
 */
export type ToolCallEvent = {
  type: 'tool_call';
  toolName: string;
  args: any;
  timestamp: number;
  sessionId: string;
};

/**
 * Evento de resultado de tool
 */
export type ToolResultEvent = {
  type: 'tool_result';
  toolName: string;
  result: { success: boolean; data?: any; error?: string };
  duration: number;
  timestamp: number;
  sessionId: string;
};

/**
 * Evento de resposta final
 */
export type FinalResponseEvent = {
  type: 'final_response';
  response: string;
  toolsUsed: string[];
  timestamp: number;
  sessionId: string;
};

/**
 * Evento de erro
 */
export type ErrorEvent = {
  type: 'error';
  error: string;
  context: string;
  timestamp: number;
  sessionId: string;
};

/**
 * Evento de debug
 */
export type DebugEvent = {
  type: 'debug';
  message: string;
  data?: any;
  timestamp: number;
  sessionId: string;
};

/**
 * Evento completo
 */
export type ToolEvent = 
  | ToolCallEvent 
  | ToolResultEvent 
  | FinalResponseEvent 
  | ErrorEvent 
  | DebugEvent;

/**
 * Interface para listeners de events
 */
export interface ToolEventListener {
  (event: ToolEvent): void;
}

/**
 * Gerenciador de events
 */
export class ToolEventEmitter {
  private listeners: ToolEventListener[] = [];
  private sessionId: string = '';

  /**
   * Define o sessionId atual
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Adiciona um listener
   */
  on(listener: ToolEventListener): () => void {
    this.listeners.push(listener);
    
    // Retorna função para remover o listener
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Emite um evento para todos os listeners
   */
  emit(event: ToolEvent): void {
    // Adiciona sessionId ao evento se não tiver
    const eventWithSessionId = {
      ...event,
      sessionId: event.sessionId || this.sessionId,
    };
    
    this.listeners.forEach(listener => {
      try {
        listener(eventWithSessionId);
      } catch (error) {
        console.error('Erro ao emitir evento:', error);
      }
    });
  }

  /**
   * Emite evento de chamada de tool
   */
  emitToolCall(toolName: string, args: any): void {
    this.emit({
      type: 'tool_call',
      toolName,
      args,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  /**
   * Emite evento de resultado de tool
   */
  emitToolResult(toolName: string, result: { success: boolean; data?: any; error?: string }, startTime: number): void {
    this.emit({
      type: 'tool_result',
      toolName,
      result,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  /**
   * Emite evento de resposta final
   */
  emitFinalResponse(response: string, toolsUsed: string[]): void {
    this.emit({
      type: 'final_response',
      response,
      toolsUsed,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  /**
   * Emite evento de erro
   */
  emitError(error: string, context: string): void {
    this.emit({
      type: 'error',
      error,
      context,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  /**
   * Emite evento de debug
   */
  emitDebug(message: string, data?: any): void {
    this.emit({
      type: 'debug',
      message,
      data,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }
}

// Instância global do emitter
export const toolEventEmitter = new ToolEventEmitter();
