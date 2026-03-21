import { RegisteredTool, ToolContext, ToolExecutionResult } from "./types";
import { getAllRegisteredTools, getToolByName } from "./registry";
import { Message } from "../types";
import Whatsapp from "../../managers/Whatsapp";
import { memory } from "../../managers/MemoryManager";
import beautifulLogger from "../../utils/beautifulLogger";
import getHomeDir from "../../utils/getHomeDir";
import fs from "fs/promises";
import path from "path";
import { toolEventEmitter } from "./streaming";

/**
 * Contexto de execução das tools
 */
export type ExecutorContext = {
  whatsapp: Whatsapp;
  sessionId: string;
  currentMessages: Message[];
  isGroup: boolean;
  onActionRecorded?: () => void;
};

/**
 * Executa uma tool pelo nome com os argumentos fornecidos
 */
export async function executeTool(
  toolName: string,
  args: any,
  context: ExecutorContext,
  maxRetries: number = 2
): Promise<ToolExecutionResult> {
  const tool = getToolByName(toolName);
  
  if (!tool) {
    return { success: false, error: `Tool '${toolName}' não encontrada` };
  }
  
  // Emite evento de chamada
  toolEventEmitter.emitToolCall(toolName, args);
  const startTime = Date.now();
  
  // Tenta executar com retry
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const toolContext: ToolContext = {
        whatsapp: context.whatsapp,
        sessionId: context.sessionId,
        memory: context.memory,
        currentMessages: context.currentMessages,
        isGroup: context.isGroup,
      };
      
      const result = await tool.fn(toolContext, args);
      
      // Emite evento de resultado
      toolEventEmitter.emitToolResult(toolName, { success: true, data: result }, startTime);
      
      return { success: true, data: result };
    } catch (error: any) {
      lastError = error;
      
      // Log do erro
      console.warn(`⚠️ Tentativa ${attempt}/${maxRetries + 1} da tool ${toolName} falhou:`, error.message || error);
      
      if (attempt <= maxRetries) {
        // Espera progressiva: 1s, 2s (exponencial)
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        console.log(`⏳ Tentando novamente em ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // Se todas as tentativas falharam
  const errorMessage = lastError?.message || 'Erro desconhecido';
  console.error(`❌ Tool ${toolName} falhou após ${maxRetries + 1} tentativas:`, errorMessage);
  
  // Emite evento de erro
  toolEventEmitter.emitError(errorMessage, `Tool ${toolName}`);
  
  return { success: false, error: errorMessage };
}

/**
 * Executa múltiplas tools em sequência
 */
export async function executeTools(
  toolsToExecute: Array<{ name: string; arguments: any }>,
  context: ExecutorContext
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  const toolsUsed: string[] = [];
  
  for (const toolCall of toolsToExecute) {
    const result = await executeTool(toolCall.name, toolCall.arguments, context);
    results.push(result);
    
    if (result.success) {
      toolsUsed.push(toolCall.name);
    } else {
      beautifulLogger.warn("TOOL_EXECUTION", `Tool ${toolCall.name} falhou: ${result.error}`);
    }
  }
  
  // Emite evento de resposta final
  toolEventEmitter.emitFinalResponse("Tools executadas", toolsUsed);
  
  return results;
}

/**
 * Encontra um arquivo de mídia em um diretório (case-insensitive)
 */
export async function findMediaPath(mediaDir: string, requestedFile: string): Promise<string | null> {
  const homeDir = getHomeDir();
  const fullDir = path.join(homeDir, mediaDir);
  
  try {
    const files = await fs.readdir(fullDir);
    const foundFile = files.find(file => file.toLowerCase() === requestedFile.toLowerCase());
    
    if (foundFile) {
      return path.join(fullDir, foundFile);
    }
    
    return null;
  } catch (error) {
    console.error(`Erro ao ler diretório ${fullDir}:`, error);
    return null;
  }
}

/**
 * Cria um executor com contexto pré-configurado
 */
export function createExecutor(context: Partial<ExecutorContext>) {
  return {
    executeTool: (toolName: string, args: any, maxRetries?: number) => 
      executeTool(toolName, args, context as ExecutorContext, maxRetries),
    executeTools: (tools: Array<{ name: string; arguments: any }>) => 
      executeTools(tools, context as ExecutorContext),
  };
}
