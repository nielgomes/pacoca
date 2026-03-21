import { RegisteredTool, ToolContext, ToolExecutionResult } from "./types";
import { getAllRegisteredTools, getToolByName } from "./registry";
import { Message } from "../types";
import Whatsapp from "../../managers/Whatsapp";
import { memory } from "../../managers/MemoryManager";
import beautifulLogger from "../../utils/beautifulLogger";
import { getHomeDir } from "../../utils/getHomeDir";
import fs from "fs/promises";
import path from "path";

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
  context: ExecutorContext
): Promise<ToolExecutionResult> {
  const tool = getToolByName(toolName);
  
  if (!tool) {
    return { success: false, error: `Tool '${toolName}' não encontrada` };
  }
  
  try {
    const toolContext: ToolContext = {
      whatsapp: context.whatsapp,
      sessionId: context.sessionId,
      memory: context.memory,
      currentMessages: context.currentMessages,
      isGroup: context.isGroup,
    };
    
    const result = await tool.fn(toolContext, args);
    
    return { success: true, data: result };
  } catch (error: any) {
    console.error(`❌ Erro ao executar tool ${toolName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Executa múltiplas tools em sequência
 */
export async function executeTools(
  toolsToExecute: Array<{ name: string; arguments: any }>,
  context: ExecutorContext
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  
  for (const toolCall of toolsToExecute) {
    const result = await executeTool(toolCall.name, toolCall.arguments, context);
    results.push(result);
    
    if (!result.success) {
      beautifulLogger.warn("TOOL_EXECUTION", `Tool ${toolCall.name} falhou: ${result.error}`);
    }
  }
  
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
    executeTool: (toolName: string, args: any) => 
      executeTool(toolName, args, context as ExecutorContext),
    executeTools: (tools: Array<{ name: string; arguments: any }>) => 
      executeTools(tools, context as ExecutorContext),
  };
}
