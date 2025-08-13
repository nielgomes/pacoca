// src/services/openai.ts

import { OpenAI } from 'openai';

// Carrega as variáveis de ambiente necessárias para a OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.APP_URL || 'https://github.com/nielgomes/pacoca';
const APP_NAME = process.env.APP_NAME || 'Paçoca';

// Uma verificação de segurança para garantir que a chave da API foi configurada no .env
if (!OPENROUTER_API_KEY) {
  throw new Error('A variável de ambiente OPENROUTER_API_KEY não foi definida.');
}

/**
 * Instância do cliente OpenAI configurada para se comunicar com a API da OpenRouter.
 * Qualquer arquivo que importar 'openai' deste módulo usará automaticamente a OpenRouter.
 */
export const openai = new OpenAI({
  // URL base da API da OpenRouter
  baseURL: 'https://openrouter.ai/api/v1',

  // Chave de API fornecida pela OpenRouter
  apiKey: OPENROUTER_API_KEY,

  // Headers customizados recomendados pela documentação da OpenRouter
  // para identificar sua aplicação e facilitar o debugging.
  defaultHeaders: {
    'HTTP-Referer': APP_URL,
    'X-Title': APP_NAME,
  },
});