/**
 * Serviço para geração de áudio usando o modelo openai/gpt-audio-mini
 * 
 * Este módulo utiliza a API da OpenRouter com o modelo multimodal que suporta
 * geração de áudio (modalities: ["text", "audio"]).
 * 
 * O áudio é gerado em chunks SSE (Server-Sent Events) e concatenado para
 * formar o arquivo de áudio final em formato WAV.
 */
import { openai } from "../services/openai";
import AUDIO_PERSONALITY_PROMPT, { AUDIO_VOICE_CONFIG } from "../constants/AUDIO_PERSONALITY_PROMPT";
import beautifulLogger from "../utils/beautifulLogger";
import config from "../utils/config";
import models from "../../model.json";
import path from "path";
import fs from "fs/promises";
import getHomeDir from "../utils/getHomeDir";

/**
 * Resultado da geração de áudio
 */
export interface AudioGenerationResult {
  /** Texto que foi falado no áudio (transcript) */
  transcript: string;
  /** Caminho do arquivo de áudio gerado */
  audioPath: string;
  /** Tamanho do arquivo em bytes */
  fileSize: number;
}

/**
 * Gera um áudio de resposta do Paçoca
 * 
 * @param userMessage - A mensagem do usuário que está sendo respondida
 * @param contextData - Dados de contexto (resumo da conversa, opiniões)
 * @param emotion - Emoção desejada para o tom de voz (opcional)
 * @returns Promise com o resultado da geração de áudio
 */
export async function generateAudioResponse(
  userMessage: string,
  contextData: string = "",
  emotion?: "sarcastic" | "happy" | "sad" | "surprised" | "joking"
): Promise<AudioGenerationResult> {
  beautifulLogger.aiGeneration("audio", "Iniciando geração de áudio...");

  // Carrega configuração do modelo de TTS
  const modelsData = models as Record<string, { MODEL_NAME: string; MODEL_PRICING: { input: number; output: number; } }>;
  const ttsModelConfig = modelsData["tts"];
  
  if (!ttsModelConfig) {
    throw new Error("Modelo 'tts' não encontrado em model.json. Adicione a configuração do modelo de áudio.");
  }
  
  const MODEL_NAME = ttsModelConfig.MODEL_NAME;
  
  beautifulLogger.aiGeneration("audio", `Usando modelo: ${MODEL_NAME}`);

  // Constrói o prompt do usuário com a emoção desejada
  let emotionInstruction = "";
  if (emotion) {
    const emotionMap: Record<string, string> = {
      sarcastic: "Responda de forma sarcástica/irônica, como quem está zoando.",
      happy: "Responda de forma alegre e animada!",
      sad: "Responda de forma desanimada, como quem está triste.",
      surprised: "Responda surpreso, com espanto!",
      joking: "Responda brincando, zoando, de forma leve.",
    };
    emotionInstruction = `\n\nEMOÇÃO: ${emotionMap[emotion] || ""}`;
  }

  // Prepara as mensagens para a API
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: AUDIO_PERSONALITY_PROMPT },
    {
      role: "user",
      content: `Responda em áudio para a seguinte mensagem:${contextData ? `\n\nContexto da conversa:\n${contextData}` : ""}

Mensagem do usuário: "${userMessage}"${emotionInstruction}

Lembre-se: O áudio deve ser curto (máx 10-15 segundos), natural como um adolescente falando com amigos.`
    },
  ];

  // Variáveis para coletar os chunks de áudio e transcript
  const audioChunks: string[] = [];
  let transcript = "";

  try {
    // Faz a chamada streaming para a API
    const stream = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      modalities: ["text", "audio"],
      audio: {
        voice: AUDIO_VOICE_CONFIG.DEFAULT_VOICE,
        format: AUDIO_VOICE_CONFIG.DEFAULT_FORMAT,
      },
      temperature: AUDIO_VOICE_CONFIG.TEMPERATURE,
      top_p: AUDIO_VOICE_CONFIG.TOP_P,
      max_tokens: AUDIO_VOICE_CONFIG.MAX_TOKENS,
      stream: true,
    }, {
      timeout: 60 * 1000, // 60 segundos timeout para geração de áudio
    });

    // Processa os chunks recebidos
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as any;
      
      if (delta?.audio) {
        // Coleta os dados de áudio
        if (delta.audio.data) {
          audioChunks.push(delta.audio.data);
        }
        // Coleta o transcript (texto da fala)
        if (delta.audio.transcript) {
          transcript += delta.audio.transcript;
        }
      }
    }

    if (audioChunks.length === 0) {
      throw new Error("Nenhum áudio foi gerado pela API");
    }

    // Decodifica os chunks de áudio
    const fullAudioBase64 = audioChunks.join("");
    const audioBytes = Buffer.from(fullAudioBase64, "base64");

    // Gera um nome de arquivo único
    const timestamp = Date.now();
    const audioFileName = `pacoca_audio_${timestamp}.${AUDIO_VOICE_CONFIG.DEFAULT_FORMAT}`;
    const audioDir = path.join(getHomeDir(), "whatsapp_session", "temp");
    
    // Garante que o diretório existe
    await fs.mkdir(audioDir, { recursive: true });
    
    const audioPath = path.join(audioDir, audioFileName);
    
    // Salva o arquivo de áudio
    await fs.writeFile(audioPath, audioBytes);

    beautifulLogger.aiGeneration("audio", {
      transcript: transcript.substring(0, 100) + (transcript.length > 100 ? "..." : ""),
      fileSize: audioBytes.length,
      filePath: audioPath,
    });

    return {
      transcript,
      audioPath,
      fileSize: audioBytes.length,
    };

  } catch (error: any) {
    beautifulLogger.error("AUDIO_GENERATION", "Erro ao gerar áudio", {
      error: error.message,
      model: MODEL_NAME,
    });
    throw error;
  }
}

/**
 * Decide se a resposta deve ser em áudio com base no texto
 * 
 * @param text - Texto da resposta gerada
 * @param hasMedia - Se a resposta inclui mídia (sticker, gif, etc)
 * @returns true se deve usar áudio, false se deve usar texto
 */
export function shouldUseAudio(text: string, hasMedia: boolean): boolean {
  // Se tem mídia (sticker, gif, etc), não usa áudio
  if (hasMedia) {
    return false;
  }
  
  // Se o texto é menor que o limite, usa áudio
  const textLength = text.length;
  const shouldAudio = textLength < AUDIO_VOICE_CONFIG.AUDIO_TEXT_LIMIT;
  
  beautifulLogger.aiGeneration("audio_decision", {
    textLength,
    limit: AUDIO_VOICE_CONFIG.AUDIO_TEXT_LIMIT,
    shouldUseAudio,
  });
  
  return shouldAudio;
}

/**
 * Limpa arquivos de áudio temporários mais antigos que X horas
 */
export async function cleanupOldAudioFiles(maxAgeHours: number = 24): Promise<number> {
  const audioDir = path.join(getHomeDir(), "whatsapp_session", "temp");
  
  try {
    const files = await fs.readdir(audioDir);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      if (file.startsWith("pacoca_audio_") && file.endsWith(`.${AUDIO_VOICE_CONFIG.DEFAULT_FORMAT}`)) {
        const filePath = path.join(audioDir, file);
        const stats = await fs.stat(filePath);
        const fileAge = now - stats.mtimeMs;
        const maxAge = maxAgeHours * 60 * 60 * 1000;
        
        if (fileAge > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
      beautifulLogger.info("CLEANUP", `Deleted ${deletedCount} old audio files`);
    }
    
    return deletedCount;
  } catch (error) {
    // Se o diretório não existe, não faz nada
    return 0;
  }
}