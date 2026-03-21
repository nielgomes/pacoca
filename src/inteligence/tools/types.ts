import { ChatCompletionTool } from "openai/resources";
import { Message } from "../types";
import Whatsapp from "../../managers/Whatsapp";
import { memory } from "../../managers/MemoryManager";

/**
 * Contexto disponível para todas as tools
 */
export type ToolContext = {
  whatsapp: Whatsapp;
  sessionId: string;
  memory: typeof memory;
  currentMessages: Message[];
  isGroup: boolean;
};

/**
 * Opções para decorator @tool
 */
export type ToolOptions = {
  description: string;
  validate?: boolean;
};

/**
 * Função de tool com contexto
 */
export type ToolFunction<T = any> = (
  ctx: ToolContext,
  ...args: any[]
) => Promise<T>;

/**
 * Tool registrada com metadata
 */
export type RegisteredTool = {
  name: string;
  fn: ToolFunction;
  description: string;
  schema: any;
};

/**
 * Resultado da execução de uma tool
 */
export type ToolExecutionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Eventos de streaming para observabilidade
 */
export type ToolEvent = {
  type: "tool_call" | "tool_result" | "final_response";
  toolName?: string;
  args?: any;
  result?: any;
  response?: string;
  timestamp: number;
};
