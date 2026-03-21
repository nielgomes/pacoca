import { BotResponse, Message } from "../inteligence/types";
import Whatsapp from "./Whatsapp";
import beautifulLogger from "../utils/beautifulLogger";
import { memory } from "./MemoryManager";
import { executeTool, findMediaPath, ExecutorContext } from "../inteligence/tools/executor";
import { toolEventEmitter } from "../inteligence/tools/streaming";

// Mapeamento de BotAction para tool names
function getToolName(actionType: string): string | null {
  const mapping: Record<string, string> = {
    message: 'send_message',
    sticker: 'send_sticker',
    audio: 'send_audio',
    meme: 'send_meme_image',
    poll: 'create_poll',
    location: 'send_location',
    contact: 'send_contact',
    gif: 'send_gif',
    generated_audio: 'generate_audio',
  };
  
  return mapping[actionType] || null;
}

type ActionContext = {
  whatsapp: Whatsapp;
  sessionId: string;
  currentMessages: Message[];
  isGroup: boolean;
  onActionRecorded?: () => void;
};

/**
 * Executa ações usando o novo sistema de tools
 */
export async function executeActions(response: BotResponse, context: ActionContext) {
  const { whatsapp, sessionId, currentMessages, onActionRecorded } = context;
  
  // Configura o sessionId no emitter de events
  toolEventEmitter.setSessionId(sessionId);
  
  const appendBotContext = (content: string) => {
    currentMessages.push({
      content,
      name: "Paçoca",
      jid: "",
      ia: true,
      fromBot: true,
    });

    // Mantém o histórico enxuto imediatamente após cada ação
    memory.trimMessages();
    onActionRecorded?.();
  };

  // Cria contexto para execução de tools
  const toolContext: ExecutorContext = {
    whatsapp,
    sessionId,
    currentMessages,
    isGroup: context.isGroup,
    onActionRecorded: () => {
      memory.trimSessionMessages(sessionId, context.isGroup, 30);
      onActionRecorded?.();
    },
  };
  
  // Adiciona memory ao toolContext
  (toolContext as any).memory = memory;

  for (const action of response) {
    console.log(`🕵️ DEBUG: Processando ação do tipo: ${action.type}`);

    const toolName = getToolName(action.type);
    if (!toolName) {
      console.warn(`⚠️ Ação desconhecida: ${action.type}`);
      continue;
    }

    // Prepara os args baseados no tipo da ação
    let args: any = {};
    
    switch (action.type) {
      case 'message':
        args = {
          text: action.message?.text || '',
          reply_to_id: action.message?.reply,
        };
        break;
        
      case 'sticker':
        args = { sticker_name: action.sticker || '' };
        break;
        
      case 'audio':
        args = { audio_name: action.audio || '' };
        break;
        
      case 'meme':
        args = { meme_name: action.meme || '' };
        break;
        
      case 'poll':
        args = {
          question: action.poll?.question || '',
          options: action.poll?.options || ['', '', ''],
        };
        break;
        
      case 'location':
        args = {
          latitude: action.location?.latitude || 0,
          longitude: action.location?.longitude || 0,
        };
        break;
        
      case 'contact':
        args = {
          name: action.contact?.name || '',
          cell: action.contact?.cell || '',
        };
        break;
        
      case 'gif':
        args = {
          search_query: action.gif?.title || '',
          quantity: 1,
        };
        break;
        
      case 'generated_audio':
        args = {
          text: action.generatedAudio?.transcript || '',
          reply_to_id: action.generatedAudio?.reply,
        };
        break;
    }

    // Executa a tool
    const result = await executeTool(toolName, args, toolContext, 2);
    
    if (!result.success) {
      beautifulLogger.warn("TOOL_EXECUTION", `Tool ${toolName} falhou: ${result.error}`);
      
      // Fallback para mensagem de erro
      if (toolName === 'send_sticker' || toolName === 'send_audio' || toolName === 'send_meme_image') {
        const mediaType = toolName.replace('send_', '').replace('_image', '');
        const fileName = args[toolName.replace('send_', '').replace('_name', '') + (toolName.includes('audio') ? 'name' : 'name')] || 'arquivo';
        await whatsapp.sendText(sessionId, `Desculpe, não encontrei o ${mediaType} '${fileName}' 😢`);
      }
    } else {
      // Atualiza contexto se necessário
      if (toolName === 'send_message') {
        appendBotContext(`(Paçoca): ${args.text}`);
        beautifulLogger.actionSent("message", { 
          tipo: args.reply_to_id ? "resposta" : "mensagem normal", 
          conteúdo: args.text.substring(0, 50) 
        });
      }
    }
  }
}

// Re-exporta findMediaPath para compatibilidade
export { findMediaPath };
