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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const imageMimeType = "image/jpeg"; // Assumindo jpeg, pode ser ajustado

        console.log(`🖼️ Analisando imagem: ${imagePath}`);

        const imagePart = fileToGenerativePart(imagePath, imageMimeType);

        const prompt = `Sua tarefa é descrever o conteúdo de uma imagem de forma objetiva e concisa para que outra IA possa usar sua descrição para conversar sobre ela. Não faça elogios, análises subjetivas ou comentários sobre a qualidade. Apenas descreva os elementos visuais presentes. Se houver um texto do usuário junto com a imagem, use-o como contexto para sua descrição. Texto do usuário: "${userText || 'Nenhum'}"\n\nDescrição objetiva da imagem:`;

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