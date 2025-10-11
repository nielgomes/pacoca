import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import * as fs from "fs";
import "dotenv/config";

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("A variável de ambiente GEMINI_API_KEY não está definida.");
}
const genAI = new GoogleGenerativeAI(geminiApiKey);

/**
 * Converte um arquivo local em uma parte de dados generativa para a API do Gemini.
 * @param path Caminho para o arquivo local.
 * @param mimeType O tipo MIME do arquivo.
 */
function fileToGenerativePart(path: string, mimeType: string) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(path)).toString("base64"),
            mimeType,
        },
    };
}

/**
 * Envia um arquivo de áudio para a API do Gemini para obter uma transcrição.
 * @param audioPath O caminho para o arquivo de áudio local.
 * @returns A transcrição do áudio como uma string.
 */
export default async function analyzeAudio(audioPath: string): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const audioMimeType = "audio/ogg"; // Baileys geralmente baixa como ogg

        console.log(`🎧 Analisando áudio: ${audioPath}`);

        const audioPart = fileToGenerativePart(audioPath, audioMimeType);

        const prompt = "Transcreva o áudio a seguir. Se o áudio estiver em outro idioma, transcreva no idioma original e depois forneça uma tradução para o português brasileiro entre parênteses. Se for apenas ruído ou música sem fala, retorne a string '<Música ou ruído ininteligível>'";

        const result = await model.generateContent([prompt, audioPart]);
        const response = result.response;
        const text = response.text();

        console.log(`🎤 Transcrição do Gemini: "${text}"`);
        return text;

    } catch (error) {
        console.error("❌ Erro ao analisar áudio com Gemini:", error);
        return "<Erro ao processar o áudio>";
    }
}