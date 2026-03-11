// src/services/giphy.ts
import beautifulLogger from "../utils/beautifulLogger";

/**
 * Interface para representar um GIF retornado pela API do Giphy
 */
export interface GiphyGif {
  id: string;
  title: string;
  url: string;           // Página do GIF no Giphy
  embed_url: string;     // URL para embed
  alt_text: string;      // Descrição para acessibilidade
  rating: string;        // g, pg, pg-13, r
  // URLs das diferentes versões do GIF
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
      size: string;
      mp4: string;
      webp: string;
    };
    fixed_width: {
      url: string;
      width: string;
      height: string;
      size: string;
      mp4: string;
      webp: string;
    };
    fixed_height_small: {
      url: string;
      width: string;
      height: string;
      size: string;
      mp4: string;
      webp: string;
    };
    fixed_width_small: {
      url: string;
      width: string;
      height: string;
      size: string;
      mp4: string;
      webp: string;
    };
    downsized: {
      url: string;
      width: string;
      height: string;
      size: string;
    };
    downsized_small: {
      url: string;
      width: string;
      height: string;
      size: string;
      mp4?: string; // Opcional - algumas versões podem ter
    };
    downsized_medium: {
      url: string;
      width: string;
      height: string;
      size: string;
    };
    original: {
      url: string;
      width: string;
      height: string;
      size: string;
      frames: string;
      mp4: string;
      webp: string;
    };
    preview: {
      url: string;
      width: string;
      height: string;
      size: string;
    };
    preview_gif: {
      url: string;
      width: string;
      height: string;
      size: string;
    };
  };
}

/**
 * Interface para a resposta da API de busca do Giphy
 */
interface GiphySearchResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
  meta: {
    status: number;
    msg: string;
    response_id: string;
  };
}

/**
 * Interface para a resposta da API random do Giphy
 */
interface GiphyRandomResponse {
  data: GiphyGif;
  meta: {
    status: number;
    msg: string;
    response_id: string;
  };
}

// Variável de ambiente com a API key do Giphy
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const BASE_URL = "https://api.giphy.com/v1/gifs";

/**
 * Busca GIFs no Giphy por termo de pesquisa
 * @param query Termo de busca
 * @param limit Número de resultados (máx 50, padrão 5)
 * @param rating Rating máximo permitido (g, pg, pg-13, r) - padrão 'g' para até 16 anos
 * @param lang Idioma da busca (pt, en, etc.)
 * @returns Array de GIFs ou null em caso de erro
 */
export async function searchGifs(
  query: string,
  limit: number = 5,
  rating: string = "g",
  lang: string = "pt"
): Promise<GiphyGif[] | null> {
  if (!GIPHY_API_KEY) {
    beautifulLogger.error("GIPHY", "API key do Giphy não configurada no arquivo .env", {});
    return null;
  }

  try {
    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.append("api_key", GIPHY_API_KEY);
    url.searchParams.append("q", query);
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("rating", rating);
    url.searchParams.append("lang", lang);
    // Usar bundle otimizado para mensagens
    url.searchParams.append("bundle", "messaging_non_clips");

    beautifulLogger.info("GIPHY", `Buscando GIFs: "${query}" (limit: ${limit}, rating: ${rating}, lang: ${lang})`);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      beautifulLogger.error("GIPHY", `Erro na API do Giphy: ${response.status} ${response.statusText}`, {});
      return null;
    }

    const data: GiphySearchResponse = await response.json();

    if (data.meta.status !== 200) {
      beautifulLogger.error("GIPHY", `Erro do Giphy: ${data.meta.status} - ${data.meta.msg}`, {});
      return null;
    }

    beautifulLogger.info("GIPHY", `Encontrados ${data.data.length} GIFs para "${query}"`);

    return data.data;
  } catch (error: any) {
    beautifulLogger.error("GIPHY", `Erro ao buscar GIFs: ${error.message}`, {});
    return null;
  }
}

/**
 * Busca um GIF aleatório do Giphy para um tema/tag específico
 * @param tag Tag/tema para o GIF aleatório
 * @param rating Rating máximo permitido (g, pg, pg-13, r)
 * @returns GIF aleatório ou null em caso de erro
 */
export async function getRandomGif(
  tag: string,
  rating: string = "g"
): Promise<GiphyGif | null> {
  if (!GIPHY_API_KEY) {
    beautifulLogger.error("GIPHY", "API key do Giphy não configurada no arquivo .env", {});
    return null;
  }

  try {
    const url = new URL(`${BASE_URL}/random`);
    url.searchParams.append("api_key", GIPHY_API_KEY);
    url.searchParams.append("tag", tag);
    url.searchParams.append("rating", rating);

    beautifulLogger.info("GIPHY", `Buscando GIF aleatório para tag: "${tag}"`);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      beautifulLogger.error("GIPHY", `Erro na API do Giphy: ${response.status} ${response.statusText}`, {});
      return null;
    }

    const data: GiphyRandomResponse = await response.json();

    if (data.meta.status !== 200) {
      beautifulLogger.error("GIPHY", `Erro do Giphy: ${data.meta.status} - ${data.meta.msg}`, {});
      return null;
    }

    beautifulLogger.info("GIPHY", `GIF aleatório encontrado: ${data.data.title}`);

    return data.data;
  } catch (error: any) {
    beautifulLogger.error("GIPHY", `Erro ao buscar GIF aleatório: ${error.message}`, {});
    return null;
  }
}

/**
 * Obtém GIFs em alta (trending) no Giphy
 * @param limit Número de resultados (máx 50, padrão 5)
 * @param rating Rating máximo permitido
 * @returns Array de GIFs ou null em caso de erro
 */
export async function getTrendingGifs(
  limit: number = 5,
  rating: string = "g"
): Promise<GiphyGif[] | null> {
  if (!GIPHY_API_KEY) {
    beautifulLogger.error("GIPHY", "API key do Giphy não configurada no arquivo .env", {});
    return null;
  }

  try {
    const url = new URL(`${BASE_URL}/trending`);
    url.searchParams.append("api_key", GIPHY_API_KEY);
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("rating", rating);
    url.searchParams.append("bundle", "messaging_non_clips");

    beautifulLogger.info("GIPHY", `Buscando GIFs em alta (limit: ${limit}, rating: ${rating})`);

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      beautifulLogger.error("GIPHY", `Erro na API do Giphy: ${response.status} ${response.statusText}`, {});
      return null;
    }

    const data: GiphySearchResponse = await response.json();

    if (data.meta.status !== 200) {
      beautifulLogger.error("GIPHY", `Erro do Giphy: ${data.meta.status} - ${data.meta.msg}`, {});
      return null;
    }

    beautifulLogger.info("GIPHY", `Encontrados ${data.data.length} GIFs em alta`);

    return data.data;
  } catch (error: any) {
    beautifulLogger.error("GIPHY", `Erro ao buscar GIFs em alta: ${error.message}`, {});
    return null;
  }
}

/**
 * Escolhe um GIF aleatório de uma lista
 * @param gifs Array de GIFs para escolher
 * @returns GIF aleatório ou null se a lista estiver vazia
 */
export function pickRandomGif(gifs: GiphyGif[]): GiphyGif | null {
  if (!gifs || gifs.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * gifs.length);
  return gifs[randomIndex];
}

/**
 * Escolhe múltiplos GIFs aleatórios de uma lista
 * @param gifs Array de GIFs para escolher
 * @param count Número de GIFs para escolher
 * @returns Array de GIFs aleatórios
 */
export function pickRandomGifs(gifs: GiphyGif[], count: number): GiphyGif[] {
  if (!gifs || gifs.length === 0) {
    return [];
  }
  
  // Embaralhar o array e pegar os primeiros 'count' elementos
  const shuffled = [...gifs].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, gifs.length));
}

/**
 * Obtém a melhor URL do GIF para envio no WhatsApp
 * Preferência: fixed_height_small (menor tamanho, ideal para mobile)
 * @param gif O GIF do qual obter a URL
 * @returns URL do GIF otimizado para WhatsApp
 */
export function getBestGifUrl(gif: GiphyGif): string {
  // Tentar primeiro fixed_height_small (bom para WhatsApp)
  if (gif.images.fixed_height_small?.url) {
    return gif.images.fixed_height_small.url;
  }
  // Fallback para fixed_width_small
  if (gif.images.fixed_width_small?.url) {
    return gif.images.fixed_width_small.url;
  }
  // Fallback para downsized_small (otimizado por tamanho)
  if (gif.images.downsized_small?.url) {
    return gif.images.downsized_small.url;
  }
  // Fallback para downsized (até 2MB)
  if (gif.images.downsized?.url) {
    return gif.images.downsized.url;
  }
  // Último fallback: fixed_height
  if (gif.images.fixed_height?.url) {
    return gif.images.fixed_height.url;
  }
  // Fallback final: original
  return gif.images.original?.url || gif.url;
}

/**
 * Obtém a melhor URL em MP4 do GIF para envio no WhatsApp
 * Preferência: fixed_height_small (menor tamanho, ideal para mobile)
 * @param gif O GIF do qual obter a URL
 * @returns URL do MP4 otimizado para WhatsApp ou null
 */
export function getBestGifMp4Url(gif: GiphyGif): string | null {
  // Tentar primeiro fixed_height_small (bom para WhatsApp)
  if (gif.images.fixed_height_small?.mp4) {
    return gif.images.fixed_height_small.mp4;
  }
  // Fallback para fixed_width_small
  if (gif.images.fixed_width_small?.mp4) {
    return gif.images.fixed_width_small.mp4;
  }
  // Fallback para downsized_small
  if (gif.images.downsized_small?.mp4) {
    return gif.images.downsized_small.mp4;
  }
  // Fallback para fixed_height
  if (gif.images.fixed_height?.mp4) {
    return gif.images.fixed_height.mp4;
  }
  // Fallback final: original
  if (gif.images.original?.mp4) {
    return gif.images.original.mp4;
  }
  return null;
}
