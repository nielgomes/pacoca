# Usamos uma única imagem base para todo o processo
FROM node:20-slim

# Define o diretório de trabalho
WORKDIR /usr/src/app

# Copia os arquivos de definição de dependências
COPY package*.json ./

RUN apt-get update && apt-get install -y git

# Instala TODAS as dependências (dev e produção)
RUN npm install

#RUN npm install @whiskeysockets/baileys@latest

# Copia todo o resto do código-fonte e arquivos de mídia
COPY . .

# Compila o TypeScript para JavaScript, criando a pasta /dist em Produção
RUN npm run build

# Define o comando para iniciar a aplicação
CMD [ "node", "dist/index.js" ]