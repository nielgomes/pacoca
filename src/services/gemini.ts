import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

// Pega a chave da API do arquivo .env
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  throw new Error("A variável de ambiente GEMINI_API_KEY não está definida.");
}

// Inicializa o cliente do Google Generative AI
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Exporta o modelo que usaremos para as tarefas multimodais
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

console.log("✅ Serviço do Google Gemini inicializado com sucesso.");