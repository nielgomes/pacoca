import { openai } from "../services/openai";
import * as fs from "fs";
import "dotenv/config";
import { withRetry } from "../utils/retry";
import config from '../utils/config';
import models from '../../model.json';

/**
 * Converte um arquivo local em dados base64 para a API.
 */
function fileToBase64(path: string): string {
    return Buffer.from(fs.readFileSync(path)).toString("base64");
}

/**
 * Envia um arquivo de áudio para a API para obter uma transcrição.
 * Usa OpenRouter com formato correto para áudio.
 */
export default async function analyzeAudio(audioPath: string): Promise<string> {
    const audioBase64 = fileToBase64(audioPath);
    const audioFormat = "ogg"; // Formato do arquivo

    console.log(`🎧 Analisando áudio: ${audioPath}`);

    // Usar modelo do config via OpenRouter
    const modelsData = models as Record<string, { MODEL_NAME: string }>;
    const modelConfig = modelsData[config.MAIN_MODEL];
    const MODEL_NAME = modelConfig.MODEL_NAME;

    const prompt = "Transcreva o áudio a seguir. Se o áudio estiver em outro idioma, transcreva no idioma original e depois forneça uma tradução para o português brasileiro entre parênteses. Se for apenas ruído ou música sem fala, retorne a string '<Música ou ruído ininteligível>'";

    try {
        const result = await withRetry(async () => {
            return await openai.chat.completions.create({
                model: MODEL_NAME,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "input_audio",
                                input_audio: {
                                    data: audioBase64,
                                    format: audioFormat,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 1000,
            }, {
                timeout: 60 * 1000,
            });
        }, 3, 2000);

        const text = result.choices[0]?.message?.content || "<Erro ao processar o áudio>";
        console.log(`🎤 Transcrição: "${text}"`);
        return text;

    } catch (error: any) {
        console.error("❌ Erro ao analisar áudio:", error.message || error);
        return "<Erro ao processar o áudio>";
    }
}