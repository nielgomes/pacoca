export interface Message {
  content: string;
  name: string | undefined;
  ia: boolean;
  jid: string;
}

export interface BotAction {
  type: 'message' | 'sticker' | 'audio' | 'meme' | 'poll' | 'location' | 'contact';
  message?: {
    text: string;
    reply?: string;
  };
  sticker?: string;
  audio?: string;
  meme?: string;
  poll?: {
    question: string;
    options: string[];
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  contact?: {
    name: string;
    cell: string;
  };
}

export type BotResponse = BotAction[];

export interface GenerateResponseResult {
  actions: BotResponse;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
}
