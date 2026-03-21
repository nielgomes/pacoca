import { tool, getOpenAITools } from "./registry";
import { ToolContext } from "./types";
import Whatsapp from "../../managers/Whatsapp";
import { memory } from "../../managers/MemoryManager";
import { Message } from "../types";
import mediaCatalog from '../../../media_catalog.json';
import { searchGifs, pickRandomGif, getBestGifUrl, getBestGifMp4Url } from "../../services/giphy";
import { generateAudioResponse } from "../generateAudio";
import { 
  SendMessageSchema, 
  SendStickerSchema, 
  SendAudioSchema,
  SendMemeImageSchema,
  CreatePollSchema,
  SendLocationSchema,
  SendContactSchema,
  SendGifSchema,
  GenerateAudioSchema
} from "./schemas";

// Re-exporta para compatibilidade
export { getOpenAITools };

// --- CÁLCULO DE TOKENS ---
function calculateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- CARREGAMENTO ÚNICO DE MÍDIA ---
const stickerOptions = mediaCatalog.stickers.map(sticker => sticker.file);
const audioOptions = mediaCatalog.audios.map(audio => audio.file);
const memeOptions = mediaCatalog.memes.map(meme => meme.file);

// --- EXTRAÇÃO DE TERMOS PARA GIF ---
function extractGifSearchTerms(analysis: string, userRequest?: string): string {
    if (userRequest) {
        let cleanRequest = userRequest
            .toLowerCase()
            .replace(/manda(?:ão)?(?: um)?(?: gif)? de[s]?/gi, "")
            .replace(/me envia(?: um)?(?: gif)? de/gi, "")
            .replace(/me manda(?: um)?(?: gif)? de/gi, "")
            .replace(/gif de/gi, "")
            .replace(/gif do/gi, "")
            .replace(/quiero ver un gif de/gi, "")
            .replace(/want to see a gif of/gi, "")
            .replace(/can i see a gif of/gi, "")
            .replace(/manda um gif da/gi, "")
            .replace(/manda um gif do/gi, "")
            .trim();
        
        if (cleanRequest.length < 3 || ["gif", "um gif", "gifs"].includes(cleanRequest)) {
            cleanRequest = "";
        }
        
        if (cleanRequest.length > 0 && cleanRequest.length < 50) {
            return cleanRequest;
        }
    }
    
    const words = analysis.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3)
        .filter(w => !["uma", "isso", "essa", "este", "parece", "foto", "imagem", "pessoa", "objeto", "coisa", "pode", "ser", "muito", "tanto"].includes(w));
    
    if (words.length > 0) {
        return words.slice(0, 2).join(" ");
    }
    
    return "reação";
}

// --- TOOLS REGISTRADAS ---

/**
 * Envia uma mensagem de texto no chat.
 */
@tool({
  description: "Envia uma mensagem de texto no chat.",
  validate: true,
  schema: SendMessageSchema
})
async function send_message(ctx: ToolContext, data: { text: string; reply_to_id?: string }) {
  const { text, reply_to_id } = data;
  
  if (reply_to_id) {
    const realMessageId = ctx.memory.getMessageId(reply_to_id);
    if (realMessageId) {
      await ctx.whatsapp.sendTextReply(ctx.sessionId, realMessageId, text);
    } else {
      await ctx.whatsapp.sendText(ctx.sessionId, text);
    }
  } else {
    await ctx.whatsapp.sendText(ctx.sessionId, text);
  }
  
  ctx.currentMessages.push({
    content: text,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  ctx.memory.trimMessages();
  
  return { success: true, messageId: Date.now().toString() };
}

/**
 * Envia um sticker (figurinha) para expressar uma emoção.
 */
@tool({
  description: "Envia um sticker (figurinha) para expressar uma emoção.",
  validate: true,
  schema: SendStickerSchema
})
async function send_sticker(ctx: ToolContext, data: { sticker_name: string }) {
  const { sticker_name } = data;
  const stickerPath = findMediaPath("stickers", sticker_name);
  
  if (!stickerPath) {
    return { success: false, error: `Sticker '${sticker_name}' não encontrado` };
  }
  
  await ctx.whatsapp.sendSticker(ctx.sessionId, stickerPath);
  
  ctx.currentMessages.push({
    content: `<usou o sticker ${sticker_name}>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, sticker: sticker_name };
}

/**
 * Envia um meme de áudio curto do catálogo.
 */
@tool({
  description: "Envia um meme de áudio curto do catálogo. Use apenas quando o áudio for claramente relevante ao contexto.",
  validate: true,
  schema: SendAudioSchema
})
async function send_audio(ctx: ToolContext, data: { audio_name: string }) {
  const { audio_name } = data;
  const audioPath = findMediaPath("audios", audio_name);
  
  if (!audioPath) {
    return { success: false, error: `Áudio '${audio_name}' não encontrado` };
  }
  
  await ctx.whatsapp.sendAudio(ctx.sessionId, audioPath);
  
  ctx.currentMessages.push({
    content: `<enviou o áudio ${audio_name}>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, audio: audio_name };
}

/**
 * Envia uma imagem de meme (.jpg).
 */
@tool({
  description: "Envia uma imagem de meme (.jpg).",
  validate: true,
  schema: SendMemeImageSchema
})
async function send_meme_image(ctx: ToolContext, data: { meme_name: string }) {
  const { meme_name } = data;
  const memePath = findMediaPath("memes", meme_name);
  
  if (!memePath) {
    return { success: false, error: `Meme '${meme_name}' não encontrado` };
  }
  
  await ctx.whatsapp.sendImage(ctx.sessionId, memePath);
  
  ctx.currentMessages.push({
    content: `<enviou o meme ${meme_name}>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, meme: meme_name };
}

/**
 * Cria uma enquete no chat.
 */
@tool({
  description: "Cria uma enquete no chat.",
  validate: true,
  schema: CreatePollSchema
})
async function create_poll(ctx: ToolContext, data: { question: string; options: [string, string, string] }) {
  const { question, options } = data;
  await ctx.whatsapp.createPoll(ctx.sessionId, question, options);
  
  ctx.currentMessages.push({
    content: `<criou uma enquete: ${question}>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, poll: { question, options } };
}

/**
 * Envia uma localização geográfica.
 */
@tool({
  description: "Envia uma localização geográfica.",
  validate: true,
  schema: SendLocationSchema
})
async function send_location(ctx: ToolContext, data: { latitude: number; longitude: number }) {
  const { latitude, longitude } = data;
  await ctx.whatsapp.sendLocation(ctx.sessionId, latitude, longitude);
  
  ctx.currentMessages.push({
    content: `<enviou uma localização (${latitude}, ${longitude})>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, location: { latitude, longitude } };
}

/**
 * Envia um cartão de contato.
 */
@tool({
  description: "Envia um cartão de contato.",
  validate: true,
  schema: SendContactSchema
})
async function send_contact(ctx: ToolContext, data: { name: string; cell: string }) {
  const { name, cell } = data;
  await ctx.whatsapp.sendContact(ctx.sessionId, cell, name);
  
  ctx.currentMessages.push({
    content: `<enviou um contato (${name} (${cell}))>`,
    name: "Paçoca",
    jid: "",
    ia: true,
    fromBot: true,
  });
  
  return { success: true, contact: { name, cell } };
}

/**
 * Busca e envia um GIF do Giphy.
 */
@tool({
  description: "Busca e envia um GIF do Giphy (internet animada).",
  validate: true,
  schema: SendGifSchema
})
async function send_gif(ctx: ToolContext, data: { search_query: string; quantity?: number }) {
  const { search_query, quantity = 1 } = data;
  try {
    const gifs = await searchGifs(search_query, quantity);
    
    if (gifs.length === 0) {
      return { success: false, error: "Nenhum GIF encontrado" };
    }
    
    const gif = pickRandomGif(gifs);
    const gifUrl = getBestGifUrl(gif);
    const gifMp4 = getBestGifMp4Url(gif);
    
    await ctx.whatsapp.sendGif(ctx.sessionId, gifUrl, false);
    
    ctx.currentMessages.push({
      content: `<enviou um GIF: ${gif.title}>`,
      name: "Paçoca",
      jid: "",
      ia: true,
      fromBot: true,
    });
    
    return { 
      success: true, 
      gif: { 
        title: gif.title,
        url: gifUrl,
        mp4: gifMp4,
        pageUrl: gif.url
      } 
    };
  } catch (error: any) {
    return { success: false, error: `Falha ao buscar GIF: ${error.message}` };
  }
}

/**
 * Gera e envia um áudio com TTS.
 */
@tool({
  description: "Gera e envia um áudio com TTS (text-to-speech).",
  validate: true,
  schema: GenerateAudioSchema
})
async function generate_audio(ctx: ToolContext, data: { text: string; reply_to_id?: string }) {
  const { text, reply_to_id } = data;
  try {
    const audioObj = await generateAudioResponse(text, "");
    
    const realMessageId = reply_to_id ? ctx.memory.getMessageId(reply_to_id) : undefined;
    await ctx.whatsapp.sendAudio(ctx.sessionId, audioObj.audioPathOgg || audioObj.audioPath, realMessageId);
    
    ctx.currentMessages.push({
      content: `<enviou áudio gerado: "${text.substring(0, 50)}...">`,
      name: "Paçoca",
      jid: "",
      ia: true,
      fromBot: true,
    });
    
    return { 
      success: true, 
      audio: { 
        path: audioObj.audioPathOgg || audioObj.audioPath,
        transcript: audioObj.transcript
      } 
    };
  } catch (error: any) {
    return { success: false, error: `Falha ao gerar áudio: ${error.message}` };
  }
}

// --- FUNÇÕES AUXILIARES ---

/**
 * Procura um arquivo de mídia em um diretório (case-insensitive).
 */
function findMediaPath(mediaDir: string, requestedFile: string): string | null {
  // Em implementação real, usaríamos getHomeDir() e fs.promises
  // Para simplificar aqui, retornamos null (será implementado no executor)
  return null;
}
