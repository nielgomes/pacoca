import path from "path";
import { BotResponse, Message } from "../inteligence/generateResponse";
import getHomeDir from "../utils/getHomeDir";
import Whatsapp from "./Whatsapp";
import beautifulLogger from "../utils/beautifulLogger";
import { memory } from "./MemoryManager";


// função auxiliar para encontrar mídias de forma case-insensitive.
/**
 * Procura um arquivo de mídia em um diretório, ignorando maiúsculas/minúsculas.
 * @param mediaDir O diretório onde procurar (ex: "stickers", "audios").
 * @param requestedFile O nome do arquivo solicitado pela IA.
 * @returns O caminho completo para o arquivo encontrado ou null se não encontrar.
 */
async function findMediaPath(mediaDir: string, requestedFile: string): Promise<string | null> {
    try {
        const fullDir = path.join(getHomeDir(), mediaDir);
        const files = await fs.readdir(fullDir);
        
        const foundFile = files.find(file => file.toLowerCase() === requestedFile.toLowerCase());

        if (foundFile) {
            return path.join(fullDir, foundFile);
        }

        beautifulLogger.warn("MediaFinder", `Arquivo "${requestedFile}" não encontrado no diretório "${mediaDir}".`);
        return null;
    } catch (error) {
        beautifulLogger.error("MediaFinder", `Erro ao ler o diretório "${mediaDir}".`, error);
        return null;
    }
}


type ActionContext = {
    whatsapp: Whatsapp;
    sessionId: string;
    currentMessages: Message[];
    isGroup: boolean;
};

export async function executeActions(response: BotResponse, context: ActionContext) {
    const { whatsapp, sessionId, currentMessages } = context;

    for (const action of response) {
        console.log(`🕵️ DEBUG: Processando ação do tipo: ${action.type}`);

        if (action.message) {
            console.log("🕵️ DEBUG: Entrou no bloco if (action.message)");
            const realMessageId = memory.getMessageId(action.message.reply ?? "not-is-message");
            if (action.message.reply && realMessageId) {
                const message = action.message.text;
                await whatsapp.sendTextReply(sessionId, realMessageId, message);
                currentMessages.push({ content: `(Paçoca): ${message}`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("message", { tipo: "resposta", conteúdo: message.substring(0, 50) });
            } else {
                const message = action.message.text;
                console.log(`🕵️ DEBUG: Preparando para enviar mensagem normal: "${message}"`);
                await whatsapp.sendText(sessionId, message);
                currentMessages.push({ content: `(Paçoca): ${message}`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("message", { tipo: "mensagem normal", conteúdo: message.substring(0, 50) });
            }
        } else if (action.sticker) {
            const stickerPath = await findMediaPath("stickers", action.sticker);
            if (stickerPath) {
                await whatsapp.sendSticker(sessionId, stickerPath);
                currentMessages.push({ content: `(Paçoca): <usou o sticker ${action.sticker}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("sticker", { arquivo: action.sticker });
            }
        } else if (action.audio) {
            const audioPath = await findMediaPath("audios", action.audio);
            if (audioPath) {
                await whatsapp.sendAudio(sessionId, audioPath);
                currentMessages.push({ content: `(Paçoca): <enviou o áudio ${action.audio}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("audio", { arquivo: action.audio });
            }
        } else if (action.meme) {
            const memePath = await findMediaPath("memes", action.meme);
            if (memePath) {
                await whatsapp.sendImage(sessionId, memePath);
                currentMessages.push({ content: `(Paçoca): <enviou o meme ${action.meme}>`, name: "Paçoca", jid: "", ia: true });
                beautifulLogger.actionSent("meme", { arquivo: action.meme });
            }
        } else if (action.poll) {
            // Lógica para criar uma enquete
            await whatsapp.createPoll(sessionId, action.poll.question, action.poll.options);

            currentMessages.push({
              content: `(Paçoca): <criou uma enquete: ${action.poll.question}>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            beautifulLogger.actionSent("poll", {
              pergunta: action.poll.question,
              opções: action.poll.options.join(", "),
            });
        } else if (action.location) {
            // Lógica para enviar uma localização
            currentMessages.push({
              content: `(Paçoca): <enviou uma localização (${action.location.latitude}, ${action.location.longitude})>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            await whatsapp.sendLocation(
              sessionId,
              action.location.latitude,
              action.location.longitude
            );
            beautifulLogger.actionSent("location", {
              coordenadas: `${action.location.latitude}, ${action.location.longitude}`,
            });
        } else if (action.contact) {
            // Lógica para enviar um contato
            currentMessages.push({
              content: `(Paçoca): <enviou um contato (${action.contact.name} (${action.contact.cell}))>`,
              name: "Paçoca",
              jid: "",
              ia: true,
            });
            await whatsapp.sendContact(sessionId, action.contact.cell, action.contact.name);
            beautifulLogger.actionSent("contact", {
              nome: action.contact.name,
              telefone: action.contact.cell,
            });
      } 
    }
}