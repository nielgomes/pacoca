# Sistema de Custom Tools - Paçoca

## Visão Geral

Este documento descreve o novo sistema de Custom Tools implementado no Paçoca, que utiliza decorators para registrar e executar tools com melhor DX (Developer Experience).

## Arquitetura

```
src/inteligence/tools/
├── types.ts          # Tipos TypeScript (ToolContext, ToolOptions, etc)
├── registry.ts       # Registro e gerenciamento de tools
├── index.ts          # Definição das tools com decorators
├── executor.ts       # Execução das tools
└── wrapper.ts        # Wrapper para compatibilidade
```

## Como Funciona

### 1. Registro de Tools (index.ts)

As tools são definidas usando o decorator `@tool`:

```typescript
import { tool } from "./registry";

@tool({
  description: "Envia uma mensagem de texto no chat.",
  validate: true
})
async function send_message(
  ctx: ToolContext,
  text: string,
  reply_to_id?: string
) {
  await ctx.whatsapp.sendText(ctx.sessionId, text);
  return { success: true, messageId: Date.now().toString() };
}
```

### 2. Registry (registry.ts)

O registry gerencia todas as tools registradas:

```typescript
import { getOpenAITools, getAllRegisteredTools } from "./registry";

// Retorna tools no formato OpenAI
const tools: ChatCompletionTool[] = getOpenAITools();

// Retorna todas as tools registradas
const allTools: RegisteredTool[] = getAllRegisteredTools();
```

### 3. Executor (executor.ts)

Executa as tools com contexto:

```typescript
import { executeTool, ExecutorContext } from "./executor";

const context: ExecutorContext = {
  whatsapp,
  sessionId,
  currentMessages,
  isGroup,
};

const result = await executeTool("send_message", {
  text: "Olá mundo!",
  reply_to_id: "12345"
}, context);
```

## Tipos Principais

### ToolContext

```typescript
type ToolContext = {
  whatsapp: Whatsapp;
  sessionId: string;
  memory: typeof memory;
  currentMessages: Message[];
  isGroup: boolean;
};
```

### ToolOptions

```typescript
type ToolOptions = {
  description: string;    // Descrição da tool (para LLM)
  validate?: boolean;     // Habilita validação com Zod
};
```

### ToolExecutionResult

```typescript
type ToolExecutionResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

## Migration Guide

### Antes (sem decorators)

```typescript
// generateResponse.ts
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Envia uma mensagem de texto no chat.",
      parameters: { ... },
    },
  },
];

// ActionExecutor.ts
if (action.message) {
  await whatsapp.sendText(sessionId, action.message.text);
}
```

### Depois (com decorators)

```typescript
// tools/index.ts
@tool({
  description: "Envia uma mensagem de texto no chat.",
  validate: true
})
async function send_message(
  ctx: ToolContext,
  text: string,
  reply_to_id?: string
) {
  await ctx.whatsapp.sendText(ctx.sessionId, text);
  return { success: true };
}

// generateResponse.ts
import { tools } from "./tools/wrapper";

// ActionExecutor.ts
await executeTool(toolName, args, context);
```

## Benefícios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Boilerplate** | Muito (schema JSON manual) | Nenhum (gerado automaticamente) |
| **Tipagem** | TypeScript (mas schema separado) | TypeScript nativo em tudo |
| **Validação** | Manual (JSON.parse + checks) | Automática (Zod) |
| **Testes** | Difíceis (mockar API) | Fáceis (chamar função direta) |
| **Documentação** | Escondida em JSON | Inline com JSDoc |
| **Reuso** | Duplicação necessária | Centralizado |

## Exemplo Completo

```typescript
// tools/index.ts
import { tool } from "./registry";
import { ToolContext } from "./types";

@tool({
  description: "Envia um sticker para expressar emoção",
  validate: true
})
async function send_sticker(ctx: ToolContext, sticker_name: string) {
  const stickerPath = findMediaPath("stickers", sticker_name);
  
  if (!stickerPath) {
    return { success: false, error: `Sticker '${sticker_name}' não encontrado` };
  }
  
  await ctx.whatsapp.sendSticker(ctx.sessionId, stickerPath);
  
  return { success: true, sticker: sticker_name };
}
```

## Próximos Passos

1. ✅ Criar estrutura de diretórios
2. ✅ Implementar sistema de decorators
3. ✅ Migrar tools existentes
4. ⏳ Adicionar validação com Zod
5. ⏳ Implementar streaming de events
6. ⏳ Criar testes unitários

## Troubleshooting

### Tool não encontrada

```typescript
// Verifique se a tool foi registrada
import { getAllRegisteredTools } from "./registry";
console.log(getAllRegisteredTools()); // Lista todas as tools
```

### Erro de validação

```typescript
// Habilitar validação no decorator
@tool({
  description: "Envia mensagem",
  validate: true  // ← Adicione esta linha
})
```

### Contexto não disponível

```typescript
// Certifique-se de passar o contexto correto
const context: ExecutorContext = {
  whatsapp,
  sessionId,
  currentMessages,
  isGroup,
};
```

## Contribuindo

1. Adicione novas tools em `src/inteligence/tools/index.ts`
2. Use o decorator `@tool` com descrição clara
3. Retorne `ToolExecutionResult` com sucesso/erro
4. Teste a tool isoladamente antes de integrar
