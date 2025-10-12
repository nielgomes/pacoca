import { Message } from "../inteligence/generateResponse";

// O estado do bot agora vive dentro deste módulo
const state = {
    groupMessages: [] as Message[],
    privateMessages: new Map<string, Message[]>(),
    lastRapyResponseTime: 0,
    messageIds: new Map<string, string>(),
    silenced: false,
    isGenerating: false,
    privateChatActivity: new Map<string, number>(),
    pendingFirstReply: new Set<string>(),
};

// Exportamos um objeto com métodos para interagir com o estado (getters e setters)
export const memory = {
    // Métodos para obter o estado
    isSilenced: () => state.silenced,
    isGenerating: () => state.isGenerating,
    getLastResponseTime: () => state.lastRapyResponseTime,

    // Métodos para alterar o estado
    setSilenced: (value: boolean) => { state.silenced = value; },
    setGenerating: (value: boolean) => { state.isGenerating = value; },
    updateLastResponseTime: () => { state.lastRapyResponseTime = Date.now(); },

    // Métodos para gerenciar o histórico de mensagens
    getMessages: (sessionId: string, isGroup: boolean): Message[] => {
        if (isGroup) {
            return state.groupMessages;
        }
        if (!state.privateMessages.has(sessionId)) {
            state.privateMessages.set(sessionId, []);
        }
        return state.privateMessages.get(sessionId)!;
    },

    // Outros getters e setters que ṕodem ser úteis
    getMessageId: (key: string) => state.messageIds.get(key),
    setMessageId: (key: string, value: string) => state.messageIds.set(key, value),

    getPrivateChatActivity: (sessionId: string) => state.privateChatActivity.get(sessionId),
    setPrivateChatActivity: (sessionId: string, time: number) => state.privateChatActivity.set(sessionId, time),

    isPendingFirstReply: (sessionId: string) => state.pendingFirstReply.has(sessionId),
    addPendingFirstReply: (sessionId: string) => state.pendingFirstReply.add(sessionId),
    removePendingFirstReply: (sessionId: string) => state.pendingFirstReply.delete(sessionId),
};