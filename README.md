# CTG Inteligente — Gestão de entidades tradicionalistas

Sistema web para gestão de entidades tradicionalistas (CTGs, piquetes, DTGs): quadro social, mensalidades, contas a pagar e receber, livro caixa, eventos e bailes, invernadas, patrimônio, relatórios em PDF e portal do sócio. Os dados ficam no **Firebase** (Firestore + Authentication) e vários CTGs podem usar a mesma instalação, cada um com seus dados separados.

## O que tem

| Módulo | O que faz |
|---|---|
| **Painel** | Saldo em caixa e banco, mensalidades do mês, atrasos, contas a vencer, gráfico de 6 meses, próximos eventos e aniversariantes |
| **Sócios** | Cadastro completo (CPF, nascimento, cartão MTG, endereço), categorias, titular/dependentes, situação, isenção, ficha em PDF, exportação para planilha |
| **Mensalidades** | Geração em lote (até 12 meses, sem duplicar), recebimento de várias mensalidades de uma vez com desconto/juros, recibo em PDF, estorno, cancelamento, cobrança por WhatsApp com a chave PIX |
| **Contas a pagar e receber** | Lançamento único ou parcelado/recorrente, baixa que lança no caixa sozinha, ligação com eventos |
| **Caixa** | Livro caixa por mês com saldo anterior, várias contas (dinheiro, banco…), transferências entre contas, livro caixa em PDF |
| **Eventos e bailes** | Agenda, venda de ingressos (sócio e não sócio), receitas e despesas do evento, prestação de contas em PDF |
| **Invernadas** | Grupos artísticos, integrantes com função, alerta de quem está sem cartão MTG, participações e premiações, relação de integrantes em PDF |
| **Patrimônio** | Inventário com tombo, estado, localização, empréstimos com data de devolução |
| **Relatórios** | Demonstrativo de receitas e despesas (por período), inadimplência, arrecadação anual, aniversariantes |
| **Usuários e acessos** | Criação de logins com papel, desativação, envio de redefinição de senha |
| **Portal do sócio** | O sócio vê as próprias mensalidades, baixa recibos, copia a chave PIX e acompanha a agenda |

### Papéis e permissões

| Papel | Pode |
|---|---|
| Administrador do sistema | Tudo, em todas as entidades; cadastra entidades |
| Patrão / Presidente | Tudo na sua entidade, inclusive usuários e configurações |
| Tesoureiro | Mensalidades, contas, caixa, eventos e patrimônio |
| Secretário | Sócios, eventos, invernadas e patrimônio |
| Coordenador artístico | Invernadas e eventos |
| Conselho / Consulta | Vê tudo, não altera nada |
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
- **Não renomeie contas financeiras** que já têm movimento (o saldo é calculado pelo nome).
- **Backup:** no console do Google Cloud é possível agendar exportações do Firestore; para algo simples, exporte as planilhas de sócios e os PDFs mensais.
- Desativar uma entidade em **Entidades** bloqueia o acesso de todos os usuários dela.
- **Excluir uma entidade** (ex.: cadastro duplicado) apaga de vez os sócios, mensalidades, caixa, eventos, invernadas, patrimônio e os acessos dela. Antes de excluir, o sistema mostra quantos registros ela tem e pede para digitar o nome. Entidades com nome repetido aparecem marcadas na lista. Os logins continuam no Firebase Authentication e podem ser apagados pelo console.

## Estrutura do código

```
firestore.rules            regras de segurança (permissões por papel)
firestore.indexes.json     índices necessários
src/lib/permissoes.js      matriz de papéis usada na interface
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
entidades/{id}/mensalidades/{id}    socioId, competencia (AAAA-MM), vencimento, valor, status
entidades/{id}/contas/{id}          tipo (pagar|receber), vencimento, valor, status
entidades/{id}/caixa/{id}           data, tipo (entrada|saida), valor, conta, categoria, origem
entidades/{id}/eventos/{id}
entidades/{id}/invernadas/{id}      integrantes[], participacoes[]
entidades/{id}/patrimonio/{id}
```
