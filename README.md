# CTG Inteligente — Gestão de entidades tradicionalistas

Sistema web para gestão de entidades tradicionalistas (CTGs, piquetes, DTGs): quadro social, mensalidades, contas a pagar e receber, livro caixa, eventos e bailes, invernadas, patrimônio, relatórios em PDF e portal do sócio. Os dados ficam no **Firebase** (Firestore + Authentication) e vários CTGs podem usar a mesma instalação, cada um com seus dados separados.

## O que tem

| Módulo | O que faz |
|---|---|
| **Painel** | Faixa "o que precisa de atenção" (evento confirmado sem aviso, contas vencidas, atrasos, LGPD pendente), saldo em caixa e banco, mensalidades do mês, gráfico de 6 meses, próximos eventos e aniversariantes |
| **Sócios** | Cadastro completo (CPF, nascimento, cartão MTG, endereço), categorias, titular/dependentes, situação, isenção, autorização LGPD e preferência de avisos, ficha em PDF, exportação para planilha |
| **Avisos aos sócios** | Ao confirmar (ou cancelar) um evento, abre um aviso com o texto pronto. Publica no portal do sócio, copia para o grupo do WhatsApp, envia um a um pelo WhatsApp marcando quem já recebeu, abre o e-mail com os sócios em cópia oculta e mostra quem leu |
| **Mensalidades** | Geração em lote (até 12 meses, sem duplicar), recebimento de várias mensalidades de uma vez com desconto/juros, recibo em PDF, estorno, cancelamento, cobrança por WhatsApp com a chave PIX |
| **Contas a pagar e receber** | Lançamento único ou parcelado/recorrente, baixa que lança no caixa sozinha, ligação com eventos |
| **Caixa** | Livro caixa por mês com saldo anterior, várias contas (dinheiro, banco…), transferências entre contas, livro caixa em PDF |
| **Copa e estoque** | Produtos (cerveja, refrigerante, água, doces…) com custo, preço e estoque mínimo; compras que somam ao estoque e lançam no caixa; abertura e fechamento da copa a cada evento com cálculo do que foi vendido, do que deveria ter entrado e da diferença; conferência pelo tesoureiro; relatório de vendas, lucro e perdas |
| **Eventos e bailes** | Agenda, venda de ingressos (sócio e não sócio), receitas e despesas do evento, prestação de contas em PDF |
| **Invernadas** | Grupos artísticos, integrantes com função, alerta de quem está sem cartão MTG, participações e premiações, relação de integrantes em PDF |
| **Patrimônio** | Inventário com tombo, estado, localização, empréstimos com data de devolução |
| **Relatórios** | Demonstrativo de receitas e despesas (por período), inadimplência, arrecadação anual, aniversariantes |
| **Usuários e acessos** | Criação de logins com papel e senha forte (botão Gerar), desativação, envio de redefinição de senha |
| **Registro de atividades** | Quem criou, recebeu, estornou, excluiu, exportou ou liberou acesso, e quando. Ninguém consegue alterar nem apagar. Visível ao patrão e ao conselho fiscal |
| **Brasão e fotos** | Brasão/logo da entidade (menu, portal, carteirinha, recibos e todos os PDFs) e foto do sócio (ficha, ficha em PDF e carteirinha). O sócio pode trocar a própria foto pelo portal |
| **Portal do sócio** | Carteirinha digital com foto e brasão, avisos da entidade (com marcação de novos), mensalidades, recibos, chave PIX e agenda |

### Papéis e permissões

| Papel | Pode |
|---|---|
| Administrador do sistema | Tudo, em todas as entidades; cadastra entidades |
| Patrão / Presidente | Tudo na sua entidade, inclusive usuários e configurações |
| Tesoureiro | Mensalidades, contas, caixa, eventos e patrimônio |
| Secretário | Sócios, eventos, invernadas e patrimônio |
| Coordenador artístico | Invernadas e eventos |
| Conselho / Consulta | Vê tudo, não altera nada |
| Responsável pela copa | Só a copa e o estoque: abre, conta e fecha a copa. Não vê o caixa, os sócios nem o resto do sistema |
| Sócio | Só o portal com os próprios dados |

As permissões são aplicadas **no servidor** pelas regras do Firestore (`firestore.rules`), não só escondendo botões. A mesma matriz está em `src/lib/permissoes.js`.

---

## Instalação passo a passo

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo e de uma conta Google.

### 1. Criar o projeto no Firebase
1. Acesse <https://console.firebase.google.com> e clique em **Criar projeto** (ex.: `ctg-inteligente`). O Google Analytics é opcional.
2. Menu **Authentication → Começar → Método de login → E-mail/senha → Ativar**.
3. Menu **Firestore Database → Criar banco de dados**. Escolha a região `southamerica-east1 (São Paulo)` e o **modo de produção**.
4. Em **Configurações do projeto (engrenagem) → Seus apps**, clique no ícone **Web `</>`**, dê um nome e registre. Copie os valores do `firebaseConfig`.

O plano gratuito (Spark) aguenta tranquilamente um CTG com centenas de sócios.

### 2. Configurar o sistema
```bash
npm install
cp .env.example .env          # no Windows: copy .env.example .env
```
Abra o `.env` e cole os valores do `firebaseConfig`:
```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=ctg-inteligente.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ctg-inteligente
VITE_FIREBASE_STORAGE_BUCKET=ctg-inteligente.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Publicar as regras de segurança e os índices

> **Atualizando de uma versão anterior?** Publique as regras, os índices e o site juntos (`npm run deploy:regras` e depois `npm run deploy`). As regras novas exigem a assinatura que só a versão nova grava. Depois, entre como patrão ou secretário em **Sócios** e clique em **Proteger agora** se aparecer o aviso de CPFs fora da área protegida.

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc     # e troque SEU-PROJETO-FIREBASE pelo ID do projeto
firebase deploy --only firestore:rules,firestore:indexes
```
Os índices levam alguns minutos para ficar prontos (acompanhe em Firestore → Índices).

### 4. Rodar e fazer a primeira instalação
```bash
npm run dev
```
Abra o endereço mostrado (normalmente <http://localhost:5173>). Na primeira vez aparece a tela **Instalar o sistema**: quem preencher vira o administrador geral e já cadastra a primeira entidade.

Depois:
1. **Dados da entidade**: confira categorias de sócio e valores, dia de vencimento, chave PIX, contas financeiras e a patronagem.
2. **Usuários e acessos**: crie os logins do tesoureiro, secretário etc.
3. **Sócios**: cadastre o quadro social.
4. **Mensalidades → Gerar mensalidades**.

### 5. Colocar no ar
```bash
npm run deploy
```
O sistema fica em `https://SEU-PROJETO.web.app`. Para usar um domínio próprio, veja Hosting → Adicionar domínio personalizado no console.

---

## Segurança dos dados

O que o sistema faz sozinho:

- **Nada é público.** Toda leitura e gravação exige login e um perfil ativo ligado à entidade. Uma conta criada por fora (o Firebase permite isso) não enxerga nada.
- **Cada papel só faz o que lhe cabe**, e isso é conferido **no servidor** (`firestore.rules`), não só escondendo botões.
- **CPF, RG e endereço (LGPD)** ficam numa área protegida do cadastro que só patrão, secretário, coordenador artístico e o próprio sócio conseguem ler. O tesoureiro e o conselho veem o CPF mascarado. A planilha com dados pessoais só sai para patrão e secretário, e cada exportação fica registrada.
- **Assinatura em toda gravação:** o banco recusa qualquer alteração sem o identificador de quem fez e a hora do servidor; ninguém assina em nome de outro.
- **Nenhuma exclusão sem rastro:** apagar um lançamento, mensalidade, conta, sócio etc. só é aceito se uma linha for gravada no registro de atividades no mesmo instante. O registro não pode ser alterado nem apagado.
- **Validação de valores:** o banco recusa valor negativo, data inválida ou situação inventada.
- **Sessão expira** depois de 30 minutos sem uso.
- **Senhas provisórias** precisam ter 8 caracteres com letras e números (há um gerador).
- **Cabeçalhos de segurança** na hospedagem (`firebase.json`): política de conteúdo (CSP), HTTPS obrigatório, proteção contra o site ser embutido em outro e contra farejamento de tipo de arquivo. As fontes são servidas pelo próprio sistema, sem chamadas a terceiros.

Configurações recomendadas no console do Firebase (uma vez só):

1. **Authentication → Configurações → Proteção contra enumeração de e-mail**: ative.
2. **Authentication → Configurações → Política de senha**: exija 8+ caracteres com letras e números.
3. **Authentication → Configurações → Domínios autorizados**: deixe só o seu domínio (`SEU-PROJETO.web.app` e o domínio próprio, se tiver) e `localhost`.
4. **App Check (opcional, recomendado):** em *App Check → Apps*, registre o app Web com **reCAPTCHA v3**, coloque a chave do site em `VITE_RECAPTCHA_SITE_KEY` no `.env`, publique, e depois de alguns dias ative a *aplicação obrigatória* para Firestore e Authentication. Assim só o seu site consegue usar o banco.
5. **Alertas de orçamento** no Google Cloud, se usar o plano pago.

### Testar as regras de segurança

O projeto traz testes automáticos que tentam ações proibidas (sócio lendo mensalidade alheia, tesoureiro lendo CPF, exclusão sem registro, patrão se promovendo etc.) e conferem que o banco recusa. Precisam de [Java 11+](https://adoptium.net) instalado:

```bash
npm install -g firebase-tools
npm run test:regras
```

Rode sempre que mudar o `firestore.rules`.

## Avisos aos sócios

1. Em **Eventos**, abra o evento e clique em **Confirmar evento** (ou mude a situação para *Confirmado* ao editar). O aviso abre com o texto pronto: data, hora, local, atração, traje e ingressos.
2. Escolha o público (todos os ativos, só titulares, uma categoria ou uma invernada), revise e **Publique**. O aviso aparece na hora no portal de cada sócio, marcado como novo.
3. Na tela seguinte, repasse:
   - **Grupo do WhatsApp:** *Copiar mensagem* e colar no grupo;
   - **Um a um:** *Enviar* abre o WhatsApp com a mensagem pronta para aquele sócio e fica marcado como enviado;
   - **E-mail:** abre seu programa de e-mail com os sócios em cópia oculta (em lotes de 40).
4. Acompanhe em **Avisos aos sócios** quantos leram no portal e quem já recebeu pelo WhatsApp.

Se o evento for cancelado depois de anunciado, o sistema oferece o aviso de cancelamento. Sócios que pediram para não receber (*Aceita receber avisos* desmarcado no cadastro) continuam vendo no portal, mas ficam fora do WhatsApp e do e-mail.

> O envio pelo WhatsApp é manual (um clique por sócio) porque o envio automático exige a API paga do WhatsApp Business e um servidor. Se a entidade quiser isso no futuro, dá para ligar ao sistema.

## Copa nos eventos

1. **Uma vez:** em **Copa e estoque → Produtos**, clique em *Começar com itens comuns* (ou cadastre do zero) e ajuste preço de venda, custo e estoque mínimo.
2. **Compras:** registre cada compra em **Compras**. Soma ao estoque, atualiza o custo e lança a saída no caixa (ou a conta a pagar, se for a prazo).
3. **Antes do baile:** o responsável pela copa clica em **Abrir a copa**, escolhe o evento e confere a contagem (tudo que há na copa e no depósito). Diferenças viram ajuste registrado.
4. **Durante:** anota em *Reposição* o que chegar depois da abertura.
5. **No fim:** conta o que sobrou (*Fim*), informa cortesias e perdas e quanto entrou em dinheiro, PIX e cartão. O sistema mostra o que deveria ter entrado e a diferença. **Fechar a copa** baixa o estoque.
6. **Tesoureiro:** confere o dinheiro e clica em **Conferir e lançar no caixa**. A receita entra no caixa e na prestação de contas do evento.

Quem vende não é quem lança no caixa: o papel *Responsável pela copa* abre e fecha, mas só o tesoureiro (ou o patrão) confere. Tudo fica no registro de atividades.

## Rotina do tesoureiro

1. No início do mês: **Mensalidades → Gerar mensalidades** (ou gere o ano inteiro de uma vez).
2. Sócio pagou: **Receber**, marque os meses, confirme. O recibo baixa e o valor já entra no caixa.
3. Conta chegou: **Contas → Nova conta a pagar**. No dia do pagamento, **Pagar**.
4. Gastos e entradas avulsas (copa, gelo, rifa): **Caixa → Entrada / Saída**.
5. Depositou o dinheiro do caixa no banco: **Caixa → Transferir entre contas**.
6. Fim do mês: **Relatórios → Receitas e despesas** e **Caixa → Livro caixa** em PDF.

Para desfazer um recebimento ou pagamento use **Estornar** na tela de origem (Mensalidades ou Contas): o lançamento sai do caixa junto.

## Observações

- **Uma conta de login por e-mail.** Se você remover o acesso de alguém e quiser recriar com o mesmo e-mail, apague antes o usuário em Authentication no console do Firebase.
- **Imagens sem custo extra:** o brasão e as fotos são reduzidos no navegador e guardados comprimidos no próprio banco (brasão até ~180 KB, foto até ~90 KB). Assim o sistema não depende do Firebase Storage, que exige o plano pago em projetos novos.
- **Não renomeie contas financeiras** que já têm movimento (o saldo é calculado pelo nome).
- **Backup:** no console do Google Cloud é possível agendar exportações do Firestore; para algo simples, exporte as planilhas de sócios e os PDFs mensais.
- Desativar uma entidade em **Entidades** bloqueia o acesso de todos os usuários dela.
- **Excluir uma entidade** (ex.: cadastro duplicado) apaga de vez os sócios, mensalidades, caixa, eventos, invernadas, patrimônio e os acessos dela. Antes de excluir, o sistema mostra quantos registros ela tem e pede para digitar o nome. Entidades com nome repetido aparecem marcadas na lista. Os logins continuam no Firebase Authentication e podem ser apagados pelo console.

## Estrutura do código

```
firestore.rules            regras de segurança (permissões por papel)
firestore.indexes.json     índices necessários
src/lib/permissoes.js      matriz de papéis usada na interface
src/lib/socios.js          área protegida de dados pessoais (LGPD)
src/lib/avisos.js          público, textos prontos e envio dos avisos
src/lib/estoque.js         copa: abertura, fechamento, conferência, compras e ajustes
tests/regras.test.mjs      testes automáticos das regras de segurança
src/lib/db.js              leitura em tempo real e gravação no Firestore
src/lib/pdfImpl.js         recibos e relatórios em PDF
src/context/AuthContext    login, perfil e entidade atual
src/pages/                 uma tela por módulo
```

Estrutura dos dados no Firestore:
```
config/sistema
usuarios/{uid}                      nome, email, papel, entidadeId, socioId, ativo
entidades/{id}                      cadastro + config (categorias, contas, PIX)
entidades/{id}/socios/{id}
entidades/{id}/socios/{id}/privado/dados   CPF, RG, endereço (acesso restrito)
entidades/{id}/socios/{id}/foto/atual      foto do sócio (JPEG 300×300 comprimido)
entidades/{id}/mensalidades/{id}    socioId, competencia (AAAA-MM), vencimento, valor, status
entidades/{id}/contas/{id}          tipo (pagar|receber), vencimento, valor, status
entidades/{id}/caixa/{id}           data, tipo (entrada|saida), valor, conta, categoria, origem
entidades/{id}/eventos/{id}
entidades/{id}/invernadas/{id}      integrantes[], participacoes[]
entidades/{id}/patrimonio/{id}
entidades/{id}/avisos/{id}          titulo, mensagem, destinatarios[], enviadosWhatsapp[]
entidades/{id}/avisos/{id}/leituras/{uid}
entidades/{id}/produtos/{id}        nome, precoVenda, precoCusto, estoque, estoqueMinimo
entidades/{id}/movEstoque/{id}      compra, venda, perda, consumo, ajuste (somente acréscimo)
entidades/{id}/copa/{id}            fechamento da copa: itens, recebido, esperado, diferença, status
entidades/{id}/auditoria/{id}       registro de atividades (somente acréscimo)
```
