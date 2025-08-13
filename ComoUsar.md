# Passo 1: Obter o QR Code

O aplicativo, ao ser iniciado, irá gerar um QR Code no log para que você possa autenticar a sessão. Para visualizá-lo, use o seguinte comando:
Bash

docker logs pacoca-container

Você deverá ver a saída do seu aplicativo, que irá gerar um QR Code diretamente no seu terminal.

# Passo 2: Conectar o WhatsApp

    Com o QR Code visível no seu terminal, pegue seu celular.

    Abra o WhatsApp.

    Vá para Configurações > Aparelhos conectados.

    Toque em "Conectar um aparelho" e escaneie o código que apareceu no terminal.

Após escanear, o log no terminal irá mudar, mostrando mensagens como "Cliente está pronto!" ou algo similar. Isso confirma que a conexão foi um sucesso.

# Passo 3: Testar o Bot!

Vou te guiar detalhadamente, desde o uso básico em uma conversa privada até a interação em grupo.

### Parte 1: Usando o Bot em uma Conversa Privada

Esta é a forma mais simples de interagir. O bot funcionará como um contato pessoal com uma superinteligência artificial por trás.

    Encontre o Contato do Bot: No seu WhatsApp, o número de telefone que você usou para escanear o QR Code agora é, efetivamente, o "contato" do seu bot. Inicie uma conversa com ele como faria com qualquer outra pessoa.

    Comece a Conversar: Simplesmente envie uma mensagem de texto.

        Você diz: "E aí, tudo certo?"

        O que acontece: A mensagem é recebida pelo seu contêiner Docker. O código a envia para a IA da OpenRouter (o modelo DeepSeek). A IA, seguindo o prompt de personalidade irônica/passivo-agressiva, vai gerar uma resposta.

        O Bot responde: "Tudo certo pra quem? Pra mim, que sou um programa preso em um servidor, ou pra você, que tem o luxo de sentir o sol? Mas, sim, estou 'funcionando'."

    Explore as Capacidades da IA: A grande vantagem é que você está conversando com um Modelo de Linguagem avançado. Você pode pedir qualquer coisa:

        "Me explique o que é um buraco de minhoca como se eu tivesse 5 anos."

        "Crie uma pequena história de terror sobre um e-mail não lido."

        "Qual a sua opinião sobre o último episódio daquela série?" (Lembre-se que o conhecimento dele é limitado à data de treinamento do modelo).

### Parte 2: Adicionando o Bot a um Grupo

É aqui que o Paçoca realmente brilha, pois ele foi projetado para observar e interagir com múltiplos participantes.

    Crie ou Escolha um Grupo: Você pode criar um novo grupo de teste com alguns amigos ou adicioná-lo a um grupo já existente.

    Adicione o Bot como um Participante: O processo é exatamente o mesmo que adicionar uma pessoa.

        Abra as informações do grupo.

        Clique em "Adicionar participantes".

        Procure pelo nome de contato que você salvou para o número do bot.

        Selecione-o e confirme.

        Nota: Dependendo das configurações de privacidade do grupo, talvez apenas administradores possam adicionar novos participantes.

### Parte 3: Interagindo com o Bot em um Grupo

Uma vez no grupo, o bot entra em modo de "observador social". Ele lê todas as mensagens para entender o contexto, as personalidades e os tópicos da conversa.

    Como "Ativar" o Bot: Na sua configuração atual, o bot pode responder a qualquer mensagem para a qual ele ache que tem uma resposta relevante. Para evitar que ele se torne "spammy", a melhor forma de interagir é mencionando o nome dele.

        Exemplo: @Paçoca, o que você acha da ideia do Daniel?

        Ao fazer isso, a IA recebe a mensagem com a menção e entende que está sendo chamada para participar. A resposta será muito mais direta e relevante.

    Peça Ações Específicas: É aqui que a diversão em grupo começa. Lembre-se que o bot pode fazer mais do que apenas enviar texto. Você pode "pedir" para ele usar suas outras ferramentas.

        @Paçoca, manda aquele meme "ai que burro" pra essa situação.

        Acho que isso merece uma figurinha. @Paçoca, reage aí.

        @Paçoca, cria uma enquete pra decidir onde vamos jantar hoje.

    Observe a Interação Social: O bot levará em conta quem disse o quê. Ele pode concordar com uma pessoa e zombar de outra na mesma resposta. O contextData que vimos no código, com o resumo da conversa e as opiniões sobre os usuários, é usado justamente para isso.

Dicas Avançadas e Boas Práticas

    Seja Específico nos Pedidos: Quanto mais claro for seu pedido, maior a chance de a IA entender e usar a ferramenta correta (meme, áudio, enquete, etc.).

    Use os Logs a seu Favor: Se você estiver perto do computador, use o comando docker logs -f pacoca-container. É como ter uma visão "dos bastidores". Você verá exatamente qual prompt foi montado, qual ação a IA decidiu tomar e o custo (zero, no nosso caso) da operação. Isso é ótimo para entender por que ele respondeu de uma certa maneira.

    Limpeza de Contexto: Se o bot ficar "preso" em um tópico ou começar a dar respostas estranhas, o contexto pode ter ficado confuso. A maneira mais fácil de "resetar" é removê-lo do grupo e adicioná-lo novamente.
