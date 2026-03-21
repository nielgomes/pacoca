# Guia de Teste Container-First - Paçoca

Este guia explica como testar o projeto Paçoca usando Docker Compose.

## 📋 Pré-requisitos

- Docker instalado (versão 20+ recomendada)
- Docker Compose instalado (versão 2+)
- Node.js 20+ (para desenvolvimento local)
- npm ou yarn

## 🐳 Teste Container-First

### 1. Verificar Configuração

Antes de subir o container, verifique se o arquivo `.env` existe e está configurado:

```bash
# Verifica se o arquivo .env existe
ls -la .env

# Se não existir, copie o exemplo
cp .env.example .env
```

**Variáveis obrigatórias no `.env`:**
```env
OPENROUTER_API_KEY=sua-chave-aqui
GEMINI_API_KEY=sua-chave-aqui
GIPHY_API_KEY=sua-chave-aqui
```

### 2. Construir a Imagem

```bash
# Constrói a imagem Docker
docker-compose build

# Ou construir com cache desabilitado (útil após mudanças no Dockerfile)
docker-compose build --no-cache
```

### 3. Subir o Container

```bash
# Sube o container em modo detached (background)
docker-compose up -d

# Verifica o status dos containers
docker-compose ps

# Verifica logs em tempo real
docker-compose logs -f
```

### 4. Verificar Logs

```bash
# Ver logs do container
docker-compose logs pacoca

# Ver logs em tempo real
docker-compose logs -f pacoca

# Ver logs com timestamp
docker-compose logs -f -t pacoca

# Ver últimos 100 logs
docker-compose logs --tail=100 pacoca
```

### 5. Acessar o Container

```bash
# Acessar o shell do container
docker-compose exec pacoca sh

# Dentro do container, você pode:
# - Verificar arquivos
ls -la /usr/src/app

# - Verificar variáveis de ambiente
env | grep API_KEY

# - Executar comandos
node dist/index.js
```

### 6. Testar Funcionalidades

#### A. Testar Build do Projeto

```bash
# Acessar o container
docker-compose exec pacoca sh

# Executar build
npm run build

# Executar testes (se existirem)
npm test
```

#### B. Testar TypeScript

```bash
# Acessar o container
docker-compose exec pacoca sh

# Verificar erros de TypeScript
npx tsc --noEmit
```

#### C. Testar Logs e Streaming

Com o novo sistema de streaming de events, você pode ver logs detalhados:

```bash
# Ver logs em tempo real
docker-compose logs -f pacoca

# Procure por:
# 🤖 Tool "send_message" chamada
# ✅ Tool "send_message" retornou
# 📝 Resposta final
```

### 7. Parar o Container

```bash
# Parar o container
docker-compose down

# Parar e remover volumes (cuidado! perde a sessão do WhatsApp)
docker-compose down -v

# Parar e remover imagens
docker-compose down --rmi all
```

### 8. Rebuild e Reup (Pós-Modificações)

Após fazer mudanças no código:

```bash
# Parar container
docker-compose down

# Rebuild da imagem
docker-compose build --no-cache

# Reup do container
docker-compose up -d

# Ver logs
docker-compose logs -f pacoca
```

## 🛠️ Troubleshooting

### Erro: "Cannot find module"

```bash
# Rebuild completo
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Erro: "Permission denied"

```bash
# Verificar permissões do volume
ls -la whatsapp_session/

# Corrigir permissões
chmod -R 755 whatsapp_session/
```

### Erro: "API Key not configured"

```bash
# Verificar variáveis de ambiente
docker-compose exec pacoca env | grep API_KEY

# Se não estiver configurado, atualize o .env e rebuild
docker-compose down
docker-compose up -d
```

### Container não inicia

```bash
# Ver logs detalhados
docker-compose logs pacoca --tail=50

# Verificar se há erros de TypeScript
docker-compose exec pacoca npx tsc --noEmit
```

## 📊 Monitoramento

### Verificar Recursos do Container

```bash
# Ver uso de CPU e memória
docker stats pacoca-container

# Ver processos dentro do container
docker top pacoca-container
```

### Backup da Sessão

```bash
# Backup da sessão do WhatsApp
tar -czf whatsapp_session_backup.tar.gz whatsapp_session/

# Restaurar backup
tar -xzf whatsapp_session_backup.tar.gz
```

## 🔄 Desenvolvimento Local com Hot Reload

Para desenvolvimento com hot reload (sem rebuild a cada mudança):

```bash
# Usar docker-compose com volume de desenvolvimento
docker-compose up -d

# Acessar o container
docker-compose exec pacoca sh

# Executar em modo dev (se configurado)
npm run dev
```

## 📝 Fluxo de Trabalho Recomendado

### 1. Desenvolvimento Local

```bash
# Desenvolver normalmente
npm run dev
```

### 2. Teste em Container

```bash
# Buildar e subir
docker-compose build
docker-compose up -d

# Testar funcionalidades
docker-compose logs -f pacoca

# Verificar logs de tools
docker-compose logs pacoca | grep "Tool"
```

### 3. Commit e Push

```bash
# Commit das mudanças
git add .
git commit -m "feat: implementa validação Zod e streaming"
git push origin feature/custom_tools
```

### 4. Deploy em Produção

```bash
# No servidor de produção
git pull origin feature/custom_tools
docker-compose down
docker-compose build
docker-compose up -d
```

## 🎯 Verificação da Implementação

### 1. Verificar Schemas Zod

```bash
# Acessar o container
docker-compose exec pacoca sh

# Verificar se os schemas existem
ls -la /usr/src/app/src/inteligence/tools/schemas.ts

# Verificar conteúdo
cat /usr/src/app/src/inteligence/tools/schemas.ts | head -50
```

### 2. Verificar Streaming de Events

```bash
# Ver logs em tempo real
docker-compose logs -f pacoca

# Procure por eventos de tool
docker-compose logs pacoca | grep -E "(Tool|tool_call|tool_result)"
```

### 3. Verificar Executor Simplificado

```bash
# Ver logs
docker-compose logs pacoca | grep "DEBUG"

# Procure por execução de tools
docker-compose logs pacoca | grep "Processando ação"
```

## 🚀 Comandos Rápidos

```bash
# Subir tudo
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Parar
docker-compose down

# Rebuild
docker-compose down && docker-compose build && docker-compose up -d

# Acessar shell
docker-compose exec pacoca sh

# Ver recursos
docker stats pacoca-container
```

## 📚 Recursos Adicionais

- [Documentação Docker Compose](https://docs.docker.com/compose/)
- [Documentação Docker](https://docs.docker.com/engine/)
- [Best Practices Docker](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
