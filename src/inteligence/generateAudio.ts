/**
 * Serviço para geração de áudio usando o modelo openai/gpt-audio-mini
 * 
 * Este módulo utiliza a API da OpenRouter com o modelo multimodal que suporta
 * geração de áudio (modalities: ["text", "audio"]).
 * 
 * O áudio é gerado em chunks SSE (Server-Sent Events) e concatenado para
 * formar o arquivo de áudio final em formato WAV.
 * 
 * Usa fetch direto pois o SDK openai não suporta modalities/audio quando
 * apontado para OpenRouter.
 * 
 * IMPORTANTE: O modelo exige stream: true + format: pcm16 para áudio
 */
import AUDIO_PERSONALITY_PROMPT, { AUDIO_VOICE_CONFIG } from "../constants/AUDIO_PERSONALITY_PROMPT";
import beautifulLogger from "../utils/beautifulLogger";
import config from "../utils/config";
import models from "../../model.json";
import path from "path";
import fs from "fs/promises";
import getHomeDir from "../utils/getHomeDir";

/**
 * Cria header WAV para dados PCM16
 */
function createWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataSize: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

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
    // Usa fetch direto pois o SDK openai não suporta modalities/audio
    // quando apontado para OpenRouter
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY não definida");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/nielgomes/pacoca",
        "X-Title": "Paçoca",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: messages,
        modalities: ["text", "audio"],
        audio: {
          voice: AUDIO_VOICE_CONFIG.DEFAULT_VOICE,
          format: "pcm16", // OBRIGATÓRIO com stream: true
        },
        temperature: AUDIO_VOICE_CONFIG.TEMPERATURE,
        top_p: AUDIO_VOICE_CONFIG.TOP_P,
        max_tokens: AUDIO_VOICE_CONFIG.MAX_TOKENS,
        stream: true, // OBRIGATÓRIO para áudio
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`Erro da API: ${response.status} - ${errorText}`);
    }

    // Processamento de streaming SSE
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let audioChunks: string[] = [];
    let transcriptChunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = line.slice(6);
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta || {};
              const audio = delta.audio || {};

              // Coleta chunks de áudio (base64 PCM16)
              if (audio.data) {
                audioChunks.push(audio.data);
              }
              // Coleta transcript para log/uso
              if (audio.transcript) {
                transcriptChunks.push(audio.transcript);
              }
            } catch (parseError) {
              // Ignora linhas malformadas
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (audioChunks.length === 0) {
      throw new Error("Nenhum chunk de áudio recebido");
    }

    // Debug: mostra quantos chunks foram recebidos
    beautifulLogger.aiGeneration("audio_debug", {
      chunksCount: audioChunks.length,
      totalBase64Length: audioChunks.join('').length,
      transcriptChunks: transcriptChunks.length,
    });

    // Juntando e decodificando áudio PCM16 raw
    const fullAudioB64 = audioChunks.join('');
    const pcmBuffer = Buffer.from(fullAudioB64, 'base64');
    const transcript = transcriptChunks.join('');

    // Cria header WAV para PCM16
    // 16000 Hz é mais compatível com WhatsApp e reconhecimento de voz
    const SAMPLE_RATE = 16000; 
    const WAV_HEADER = createWavHeader(SAMPLE_RATE, 1, 16, pcmBuffer.length);
    const wavBuffer = Buffer.concat([WAV_HEADER, pcmBuffer]);

    // Gera um nome de arquivo único
    const timestamp = Date.now();
    const audioFileName = `pacoca_audio_${timestamp}.wav`;
    const audioDir = path.join(getHomeDir(), "whatsapp_session", "temp");
    
    // Garante que o diretório existe
    await fs.mkdir(audioDir, { recursive: true });
    
    const audioPath = path.join(audioDir, audioFileName);
    
    // Salva o arquivo de áudio WAV
    await fs.writeFile(audioPath, wavBuffer);

    beautifulLogger.aiGeneration("audio", {
      transcript: transcript.substring(0, 100) + (transcript.length > 100 ? "..." : ""),
      fileSize: wavBuffer.length,
      filePath: audioPath,
    });

    return {
      transcript,
      audioPath,
      fileSize: wavBuffer.length,
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