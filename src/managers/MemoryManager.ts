import { Message } from "../inteligence/types";

// Limites para evitar crescimento infinito de memória
const MAX_GROUP_MESSAGES = 100;
const MAX_PRIVATE_MESSAGES = 50;
const MAX_MESSAGE_IDS = 500;

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

// Função auxiliar para limitar tamanho de arrays
const trimArray = <T>(arr: T[], maxLength: number): T[] => {
    if (arr.length > maxLength) {
        return arr.slice(-maxLength);
    }
    return arr;
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

    // Métodos para limpar histórico (evita vazamento de memória)
    clearGroupMessages: () => {
        state.groupMessages = [];
    },
    
    clearPrivateMessages: (sessionId: string) => {
        state.privateMessages.delete(sessionId);
    },

    clearAllPrivateMessages: () => {
        state.privateMessages.clear();
    },

    // Limpa mensagens antigas para manter limite
    trimMessages: () => {
        // Limita mensagens de grupo
        state.groupMessages = trimArray(state.groupMessages, MAX_GROUP_MESSAGES);
        
        // Limita mensagens privadas de cada sessão
        for (const [sessionId, messages] of state.privateMessages.entries()) {
            const trimmed = trimArray(messages, MAX_PRIVATE_MESSAGES);
            if (trimmed.length === 0) {
                state.privateMessages.delete(sessionId);
            } else {
                state.privateMessages.set(sessionId, trimmed);
            }
        }

        // Limita o Map de IDs de mensagens (mantém apenas os mais recentes)
        if (state.messageIds.size > MAX_MESSAGE_IDS) {
            const entries = Array.from(state.messageIds.entries());
            state.messageIds = new Map(entries.slice(-MAX_MESSAGE_IDS));
        }
    },

    // Outros getters e setters que ṕodem ser úteis
    getMessageId: (key: string) => state.messageIds.get(key),
    setMessageId: (key: string, value: string) => { 
        state.messageIds.set(key, value);
        // Limpeza preventiva se cresceu demais
        if (state.messageIds.size > MAX_MESSAGE_IDS * 1.5) {
            const entries = Array.from(state.messageIds.entries());
            state.messageIds = new Map(entries.slice(-MAX_MESSAGE_IDS));
        }
    },

    getPrivateChatActivity: (sessionId: string) => state.privateChatActivity.get(sessionId),
    setPrivateChatActivity: (sessionId: string, time: number) => state.privateChatActivity.set(sessionId, time),

    isPendingFirstReply: (sessionId: string) => state.pendingFirstReply.has(sessionId),
    addPendingFirstReply: (sessionId: string) => state.pendingFirstReply.add(sessionId),
    removePendingFirstReply: (sessionId: string) => state.pendingFirstReply.delete(sessionId),
};