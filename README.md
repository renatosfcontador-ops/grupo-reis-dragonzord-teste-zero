# DragonZord — Teste Zero

**Molde coringa reutilizável** para painéis de homologação de ferramentas de IA.

O DragonZord Teste Zero é o repositório-base do ecossistema. Ele contém um front-end responsivo, um
back-end leve sem dependências e um catálogo JSON centralizado. A partir dele, qualquer nova instância
(por exemplo, `DragonZord Teste 1`) pode ser gerada em poucos minutos.

> **Princípio:** o painel é um hub de redirecionamento. Ele não clona repositórios pesados, não instala
> dependências e não executa modelos localmente. Todo teste pesado vai para notebooks do Kaggle; a
> infraestrutura de produção da AWS permanece intocada.

---

## 1. O que este template entrega

- Grid de comando responsivo com cards, filtros por categoria e busca.
- Cada card exibe:
  - número na lista;
  - nome oficial;
  - categoria;
  - descrição curta da utilidade;
  - link para o repositório no GitHub;
  - botão **Testar interface**;
  - atalho opcional para vídeo do YouTube.
- Modal de teste com repositório, demo, vídeo e atalho Kaggle.
- Aba de **Relatórios de Teste** com veredito, nota de usabilidade e observações.
- Aba **Kaggle Sandbox** com regras de isolamento e atalhos por projeto.
- Aba **Configurações** com editor de overrides de URL e importação/exportação do catálogo.
- Persistência em `reports/reports.json` quando há servidor; `localStorage` quando o site é estático.
- Zero dependências externas.

---

## 2. Estrutura

```
dragonzord-teste-zero/
├── index.html                  # estrutura das abas + modal
├── assets/
│   ├── styles.css              # tema "Zord" responsivo
│   └── app.js                  # render, filtros, relatórios, overrides
├── projects.json               # CATÁLOGO: fonte única de verdade
├── server.js                   # back-end leve (API + arquivos estáticos)
├── package.json                # scripts; sem dependências
├── scripts/
│   └── create-instance.js      # gera uma nova instância a partir do molde
├── docs/
│   ├── ARCHITECTURE.md         # arquitetura e decisões
│   ├── INSTANCE-GUIDE.md       # guia para IA / novo dev
│   └── KAGGLE.md               # regras de sandbox
├── reports/
│   └── README.md               # pasta de relatórios locais
└── .github/
    └── workflows/
        └── deploy-pages.yml    # deploy automático no GitHub Pages
```

---

## 3. Rodar localmente

```bash
npm start
# abra http://localhost:3000
```

Requisitos: Node.js 18+. Não é necessário `npm install`.

### Modo estático

A raiz do repositório é 100% estática. Você pode publicar em GitHub Pages, Netlify, Cloudflare Pages ou
qualquer host estático. Sem back-end, o painel usa `localStorage` para relatórios e overrides.

---

## 4. Editar o catálogo

O arquivo `projects.json` controla tudo. Para adicionar um projeto, acrescente um objeto ao array
`projects`:

```json
{
  "id": 5,
  "name": "Novo Projeto",
  "category": "browser",
  "description": "O que o projeto faz e o que deve ser testado.",
  "repoUrl": "https://github.com/org/repo",
  "demoUrl": "https://demo.example.com",
  "videoUrl": "https://www.youtube.com/results?search_query=novo+projeto",
  "kaggleUrl": null,
  "embedUrl": null,
  "embeddable": false,
  "status": "pendente",
  "tags": ["python", "browser"]
}
```

- `category` deve ser um dos ids presentes em `categories` (`browser`, `multi`, `memory`, `lowcode`).
- Para remover um projeto, apague o objeto do array.
- `repoUrl` é obrigatório. Os demais campos são opcionais.
- O botão **Vídeo** aparece automaticamente quando `videoUrl` está preenchido.

### Categorias

| id | Rótulo | Foco |
| --- | --- | --- |
| `browser` | Agentes de Navegador | automação de browsers via IA |
| `multi` | Frameworks Multi-Agent | orquestração de papéis e tarefas |
| `memory` | Camadas de Memória | memória de longo prazo e contexto |
| `lowcode` | Automação Low-Code | fluxos visuais e automação |

---

## 5. Gerar uma nova instância

```bash
node scripts/create-instance.js ../dragonzord-teste-1 ../catalogos/teste-1.json
```

O script copia o template, ignora `.git`, `node_modules` e dados de runtime, injeta o catálogo e ajusta
`meta.project` e `package.json`.

Depois:

```bash
cd ../dragonzord-teste-1
npm start
npm run validate
```

O guia completo está em [`docs/INSTANCE-GUIDE.md`](docs/INSTANCE-GUIDE.md).

---

## 6. Back-end e API

```bash
node server.js
```

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | status do serviço |
| `GET` | `/api/projects` | catálogo |
| `GET` | `/api/reports` | lista relatórios |
| `POST` | `/api/reports` | cria relatório |
| `DELETE` | `/api/reports?id=` | remove relatório |
| `GET` | `/api/urls` | lê overrides |
| `PUT` | `/api/urls` | salva overrides |

O servidor bloqueia `reports/`, `docs/`, `scripts/`, `server.js` e `package.json` como arquivos estáticos.
Esses caminhos só são acessíveis via API ou sistema de arquivos.

---

## 7. Deploy

### GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica a raiz do repositório a cada push na branch `main`.
Ative **Settings → Pages → Source: GitHub Actions**.

### Servidor Node

Publique em qualquer host que suporte Node (Render, Railway, Fly.io, VM). Configure `PORT` por variável de
ambiente. Os relatórios passam a ser persistidos em `reports/reports.json`.

---

## 8. Relatórios e governança

- A pasta `reports/` contém apenas relatórios, logs e overrides de runtime.
- `reports/reports.json` e `reports/url-overrides.json` são ignorados pelo Git.
- Use **Exportar JSON** ou **Exportar CSV** para gerar uma cópia versionável.
- O histórico deve ser legível por qualquer IA ou gestor: data, projeto, operador, veredito, nota e
  observação objetiva.
- Nenhum binário, dependência pesada ou credencial deve entrar no repositório.

---

## 9. Acesso

O template inclui um overlay de login com sessão em `localStorage` (`dragonzord_auth`) e botão de
encerramento em **Configurações → Sair / Encerrar sessão**.

> **Aviso de segurança:** por ser um site estático, a validação é client-side e pode ser inspecionada ou
> contornada. Para proteção real, use Cloudflare Access, GitHub OAuth ou um back-end autenticado.

## 10. Licença

MIT.