import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import * as fs from "fs";
import "dotenv/config";

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("A variável de ambiente GEMINI_API_KEY não está definida.");
}
const genAI = new GoogleGenerativeAI(geminiApiKey);

function fileToGenerativePart(path: string, mimeType: string) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

/**
 * Envia uma imagem e um texto opcional para a API do Gemini para obter uma descrição.
 * @param imagePath O caminho para o arquivo de imagem local.
 * @param userText O texto que o usuário enviou junto com a imagem (legenda).
 * @returns Uma descrição da imagem em formato de texto.
 */
export default async function analyzeImage(imagePath: string, userText?: string): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
        const imageMimeType = "image/jpeg"; // Assumindo jpeg, pode ser ajustado

        console.log(`🖼️ Analisando imagem: ${imagePath}`);

        const imagePart = fileToGenerativePart(imagePath, imageMimeType);

        const prompt = `Analise esta imagem. Seja descritivo e direto. Se o usuário enviou um texto junto, considere-o no seu comentário. O texto do usuário foi: "${userText || 'Nenhum'}"`;

        const result = await model.generateContent([prompt, imagePart]);
        const response = result.response;
        const text = response.text();

        console.log(`🎨 Descrição da Imagem do Gemini: "${text}"`);
        return text;

    } catch (error) {
        console.error("❌ Erro ao analisar imagem com Gemini:", error);
        return "<Erro ao processar a imagem>";
    }
}