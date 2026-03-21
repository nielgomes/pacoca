import { RegisteredTool, ToolContext, ToolFunction, ToolOptions } from "./types";
import { validateData } from "./schemas";

// Armazena todas as tools registradas
const registeredTools: RegisteredTool[] = [];

/**
 * Decorator para registrar tools
 * 
 * @param options - Opções da tool (descrição, validação, schema Zod)
 * @returns Method decorator
 */
export function tool(options: ToolOptions & { schema?: any }) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalFn = descriptor.value;
    
    // Validação com Zod se solicitado
    let wrappedFn: ToolFunction = originalFn;
    
    if (options.validate && options.schema) {
      wrappedFn = async (ctx: ToolContext, ...args: any[]) => {
        // Valida o primeiro argumento (data) com Zod
        if (args.length > 0) {
          const validation = validateData(options.schema, args[0]);
          if (!validation.success) {
            console.error(`❌ Validação falhou na tool ${propertyKey}:`, validation.error);
            throw new Error(validation.error);
          }
          // Usa dados validados
          return await originalFn(ctx, validation.data, ...args.slice(1));
        }
        return await originalFn(ctx, ...args);
      };
    }
    
    registeredTools.push({
      name: propertyKey,
      fn: wrappedFn,
      description: options.description,
      schema: options.schema || generateSchemaFromFn(originalFn),
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
