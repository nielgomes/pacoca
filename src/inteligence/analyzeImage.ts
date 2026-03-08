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
 * Envia uma imagem e um texto opcional para a API para obter uma descrição.
 * Usa OpenRouter (Google Gemini) em vez da API direta do Google.
 */
export default async function analyzeImage(imagePath: string, userText?: string): Promise<string> {
    const imageBase64 = fileToBase64(imagePath);
    const imageMimeType = "image/jpeg";

    console.log(`🖼️ Analisando imagem: ${imagePath}`);

    // Usar modelo do config via OpenRouter
    const modelsData = models as Record<string, { MODEL_NAME: string }>;
    const modelConfig = modelsData[config.MAIN_MODEL];
    const MODEL_NAME = modelConfig.MODEL_NAME;

    const prompt = `Sua tarefa é descrever o conteúdo de uma imagem de forma objetiva e concisa para que outra IA possa usar sua descrição para conversar sobre ela. Não faça elogios, análises subjetivas ou comentários sobre a qualidade. Apenas descreva os elementos visuais presentes. Se houver um texto do usuário junto com a imagem, use-o como contexto para sua descrição. Texto do usuário: "${userText || 'Nenhum'}"\n\nDescrição objetiva da imagem:`;

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
                                type: "image_url",
                                image_url: { url: `data:${imageMimeType};base64,${imageBase64}` },
                            },
                        ],
                    },
                ],
                max_tokens: 1000,
            }, {
                timeout: 60 * 1000,
            });
        }, 3, 2000);

        const text = result.choices[0]?.message?.content || "<Erro ao processar a imagem>";
        console.log(`🎨 Descrição da Imagem: "${text}"`);
        return text;

    } catch (error: any) {
        console.error("❌ Erro ao analisar imagem:", error.message || error);
        return "<Erro ao processar a imagem>";
    }
}