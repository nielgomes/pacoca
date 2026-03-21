#!/bin/bash

# Script de teste container-first para o projeto Paçoca
# Este script executa os passos básicos de teste em container

set -e  # Sai se algum comando falhar

echo "========================================"
echo "🚀 Teste Container-First - Paçoca"
echo "========================================"
echo ""

# Verificar se docker-compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não encontrado!"
    echo "Instale com: sudo apt install docker-compose"
    exit 1
fi

# Verificar se o arquivo .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "Copie o exemplo: cp .env.example .env"
    echo "E configure as variáveis de ambiente."
    exit 1
fi

echo "✅ Pré-requisitos verificados"
echo ""

# Passo 1: Parar container anterior (se existir)
echo "🛑 Parando container anterior..."
docker-compose down --remove-orphans 2>/dev/null || true

# Passo 2: Construir a imagem
echo "🔨 Construindo imagem Docker..."
docker-compose build --no-cache

# Passo 3: Subir o container
echo "🚀 Subindo container..."
docker-compose up -d

# Passo 4: Esperar o container iniciar
echo "⏳ Aguardando container iniciar..."
sleep 10

# Passo 5: Verificar status
echo "📊 Verificando status..."
docker-compose ps

# Passo 6: Ver logs
echo "📝 Verificando logs..."
docker-compose logs pacoca --tail=50

# Passo 7: Testar execução de comandos dentro do container
echo ""
echo "🧪 Testando execução dentro do container..."
docker-compose exec pacoca node --version
docker-compose exec pacoca npm --version

# Passo 8: Verificar arquivos do projeto
echo ""
echo "📁 Verificando arquivos do projeto..."
docker-compose exec pacoca ls -la /usr/src/app/src/inteligence/tools/

# Passo 9: Verificar schemas Zod
echo ""
echo "📋 Verificando schemas Zod..."
docker-compose exec pacoca cat /usr/src/app/src/inteligence/tools/schemas.ts | head -20

# Passo 10: Verificar streaming
echo ""
echo "📡 Verificando streaming de events..."
docker-compose exec pacoca cat /usr/src/app/src/inteligence/tools/streaming.ts | head -20

echo ""
echo "========================================"
echo "✅ Teste container-first concluído!"
echo "========================================"
echo ""
echo "Para ver logs em tempo real:"
echo "  docker-compose logs -f"
echo ""
echo "Para acessar o shell do container:"
echo "  docker-compose exec pacoca sh"
echo ""
echo "Para parar o container:"
echo "  docker-compose down"
echo ""
