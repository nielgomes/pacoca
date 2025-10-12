import fs from 'fs';
import path from 'path';
import getHomeDir from './getHomeDir';

// Define a estrutura esperada do arquivo de configuração
interface AppConfig {
    MODE: 'single' | 'dual';
    CREATIVE_MODEL: string;
    RELIABLE_MODEL: string;
}

const configPath = path.join(getHomeDir(), 'config.json');

let config: AppConfig;

try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(rawConfig);

    // Validação simples para garantir que os campos essenciais existem
    if (!config.MODE || !config.CREATIVE_MODEL || !config.RELIABLE_MODEL) {
        throw new Error("Arquivo de configuração inválido. Faltam campos essenciais.");
    }
    if (config.MODE !== 'single' && config.MODE !== 'dual') {
        throw new Error("O campo 'MODE' no config.json deve ser 'single' ou 'dual'.");
    }

} catch (error) {
    console.error("❌ Erro ao carregar o arquivo de configuração (config.json). Verifique se ele existe e está formatado corretamente.", error);
    // Se houver erro, usamos valores padrão seguros para evitar que a aplicação quebre
    config = {
        MODE: 'single',
        CREATIVE_MODEL: 'exp',
        RELIABLE_MODEL: 'nemo',
    };
    console.warn("⚠️ Usando configuração padrão: MODO single, MODELO nemo.");
}

export default config;