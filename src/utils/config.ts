// src/utils/config.ts

import fs from 'fs';
import path from 'path';
import getHomeDir from './getHomeDir';

// Define a estrutura esperada do arquivo de configuração
interface AppConfig {
    MAIN_MODEL: string;
}

const configPath = path.join(getHomeDir(), 'config.json');

let config: AppConfig;

try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(rawConfig);

    // Validação simples
    if (!config.MAIN_MODEL) {
        throw new Error("Arquivo de configuração inválido. Falta o campo 'MAIN_MODEL'.");
    }

} catch (error) {
    console.error("❌ Erro ao carregar o arquivo de configuração (config.json). Verifique se ele existe e está formatado corretamente.", error);
    // Valores padrão seguros
    config = {
        MAIN_MODEL: 'nemo', // Usar Nemo como padrão seguro
    };
    console.warn("⚠️ Usando configuração padrão: MODELO nemo.");
}

export default config;