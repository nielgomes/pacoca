// src/inteligence/tools/registeredTools.ts
// Registro manual das tools (evita decorators que não funcionam com esbuild)

import { RegisteredTool, ToolContext } from "./types";
import Whatsapp from "../../managers/Whatsapp";
import { memory } from "../../managers/MemoryManager";
import { searchGifs, pickRandomGif, getBestGifUrl, getBestGifMp4Url } from "../../services/giphy";
import { generateAudioResponse } from "../generateAudio";
import { findMediaPath } from "./executor";
import { z } from "zod";
import { SendMessageSchema, SendStickerSchema, SendAudioSchema, SendMemeImageSchema, CreatePollSchema, SendLocationSchema, SendContactSchema, SendGifSchema, GenerateAudioSchema, validateData } from "./schemas";

// Função auxiliar para criar tools
function createTool<T>(
  name: string,
  description: string,
  schema: any,
  fn: (ctx: ToolContext, data: T) => Promise<any>
): RegisteredTool {
  return {
    name,
    description,
    schema,
    fn: async (ctx: ToolContext, ...args: any[]) => {
      if (args.length > 0) {
        const validation = validateData(schema, args[0]);
        if (!validation.success) {
          throw new Error(validation.error);
        }
        return await fn(ctx, validation.data);
      }
      return await fn(ctx, ...args);
    }
  };
}

// --- TOOLS REGISTRADAS ---

// --- Tool para enviar GIF já buscado (não busca novamente) ---
const send_existing_gif = createTool(
  "send_existing_gif",
  "Envia um GIF já buscado (não busca novamente). Use quando o GIF já foi obtido.",
  z.object({
    url: z.string().url().describe("URL do GIF/MP4 para envio"),
    title: z.string().describe("Título do GIF"),
    altText: z.string().optional().describe("Texto alternativo"),
    pageUrl: z.string().url().optional().describe("URL da página do Giphy"),
    isMp4: z.boolean().optional().describe("Indica se é um vídeo MP4"),
  }).strip(), // Remove campos desconhecidos
  async (ctx, data: { url: string; title: string; altText?: string; pageUrl?: string; isMp4?: boolean }) => {
    const { url, title, isMp4 = false } = data;
    
    try {
      await ctx.whatsapp.sendGif(ctx.sessionId, url, isMp4);
      
      ctx.currentMessages.push({
        content: `<enviou um GIF: ${title}>`,
        name: "Paçoca",
        jid: "",
        ia: true,
        fromBot: true,
      });
      
      return { 
        success: true, 
        gif: { 
          title,
          url,
          isMp4,
          pageUrl: data.pageUrl || ''
        } 
      };
    } catch (error: any) {
      return { success: false, error: `Falha ao enviar GIF: ${error.message}` };
    }
  }
);

const send_message = createTool(
  "send_message",
  "Envia uma mensagem de texto no chat.",
  SendMessageSchema,
  async (ctx, data: { text: string; reply_to_id?: string }) => {
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
);

const send_sticker = createTool(
  "send_sticker",
  "Envia um sticker (figurinha) para expressar uma emoção.",
  SendStickerSchema,
  async (ctx, data: { sticker_name: string }) => {
    const { sticker_name } = data;
    const stickerPath = await findMediaPath("stickers", sticker_name);
    
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
);

const send_audio = createTool(
  "send_audio",
  "Envia um meme de áudio curto do catálogo. Use apenas quando o áudio for claramente relevante ao contexto.",
  SendAudioSchema,
  async (ctx, data: { audio_name: string }) => {
    const { audio_name } = data;
    const audioPath = await findMediaPath("audios", audio_name);
    
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
);

const send_meme_image = createTool(
  "send_meme_image",
  "Envia uma imagem de meme (.jpg).",
  SendMemeImageSchema,
  async (ctx, data: { meme_name: string }) => {
    const { meme_name } = data;
    const memePath = await findMediaPath("memes", meme_name);
    
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
);

const create_poll = createTool(
  "create_poll",
  "Cria uma enquete no chat.",
  CreatePollSchema,
  async (ctx, data: { question: string; options: [string, string, string] }) => {
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
);

const send_location = createTool(
  "send_location",
  "Envia uma localização geográfica.",
  SendLocationSchema,
  async (ctx, data: { latitude: number; longitude: number }) => {
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
);

const send_contact = createTool(
  "send_contact",
  "Envia um cartão de contato.",
  SendContactSchema,
  async (ctx, data: { name: string; cell: string }) => {
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
);

const send_gif = createTool(
  "send_gif",
  "Busca e envia um GIF do Giphy (internet animada).",
  SendGifSchema,
  async (ctx, data: { search_query: string; quantity?: number }) => {
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
);

const generate_audio = createTool(
  "generate_audio",
  "Gera e envia um áudio com TTS (text-to-speech).",
  GenerateAudioSchema,
  async (ctx, data: { text: string; reply_to_id?: string }) => {
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
);

// Exporta todas as tools
export const allTools: RegisteredTool[] = [
  send_existing_gif,
  send_message,
  send_sticker,
  send_audio,
  send_meme_image,
  create_poll,
  send_location,
  send_contact,
  send_gif,
  generate_audio,
];

// Exporta funções auxiliares
export { send_existing_gif, send_message, send_sticker, send_audio, send_meme_image, create_poll, send_location, send_contact, send_gif, generate_audio };
