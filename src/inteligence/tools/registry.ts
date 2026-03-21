import { RegisteredTool, ToolContext, ToolFunction, ToolOptions } from "./types";

// Armazena todas as tools registradas
const registeredTools: RegisteredTool[] = [];

/**
 * Decorator para registrar tools
 * 
 * @param options - Opções da tool (descrição, validação)
 * @returns Method decorator
 */
export function tool(options: ToolOptions) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalFn = descriptor.value;
    
    // Validação com Zod se solicitado
    let wrappedFn: ToolFunction = originalFn;
    
    if (options.validate) {
      wrappedFn = async (ctx: ToolContext, ...args: any[]) => {
        try {
          return await originalFn(ctx, ...args);
        } catch (error: any) {
          console.error(`❌ Erro na tool ${propertyKey}:`, error.message);
          throw error;
        }
      };
    }
    
    registeredTools.push({
      name: propertyKey,
      fn: wrappedFn,
      description: options.description,
      schema: generateSchemaFromFn(originalFn), // Gera schema a partir dos tipos
    });
    
    return descriptor;
  };
}

/**
 * Gera schema JSON a partir dos tipos da função (simplificado)
 * Em produção, usaríamos Zod para inferência mais robusta
 */
function generateSchemaFromFn(fn: Function): any {
  // Para simplificar, vamos usar um schema genérico
  // Em produção, usaríamos reflection metadata ou Zod
  return {
    type: "object",
    properties: {},
    required: [],
  };
}

/**
 * Retorna todas as tools registradas no formato OpenAI
 */
export function getOpenAITools(): ChatCompletionTool[] {
  return registeredTools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  }));
}

/**
 * Retorna todas as tools registradas
 */
export function getAllRegisteredTools(): RegisteredTool[] {
  return registeredTools;
}

/**
 * Encontra uma tool pelo nome
 */
export function getToolByName(name: string): RegisteredTool | undefined {
  return registeredTools.find(tool => tool.name === name);
}

/**
 * Limpa todas as tools registradas (útil para testes)
 */
export function clearTools(): void {
  registeredTools.length = 0;
}
