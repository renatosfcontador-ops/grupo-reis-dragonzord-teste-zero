# Arquitetura — DragonZord Teste Zero

## 1. Visão geral

O DragonZord é um painel de homologação e redirecionamento. Ele **não executa** os projetos catalogados:
apenas centraliza links oficiais, demonstrações, vídeos de referência e atalhos de sandbox. O objetivo é
permitir que um operador valide visualmente uma ferramenta em segundos, sem clonar repositórios pesados.

```
┌─────────────────────────────┐        HTTP         ┌─────────────────────────────┐
│  Front-end (raiz do repo)   │  ────────────────▶  │  Back-end (server.js)       │
│  index.html                 │                     │  - arquivos estáticos        │
│  assets/styles.css          │  ◀────────────────  │  - GET/POST/DELETE /api/... │
│  assets/app.js              │      JSON           │  - persistência em JSON     │
│  projects.json              │                     │                             │
└─────────────┬───────────────┘                     └──────────────┬──────────────┘
              │                                                    │
              │ links / iframes                                    │ reports/
              ▼                                                    ▼
┌─────────────────────────────┐                     ┌─────────────────────────────┐
│  GitHub · Demos · YouTube   │                     │  Relatórios de homologação  │
│  Kaggle (GPU sandbox)       │                     │  + overrides de URLs        │
└─────────────────────────────┘                     └─────────────────────────────┘
```

## 2. Camadas

### 2.1 Catálogo (`projects.json`)

Fonte única de verdade. Estrutura:

```json
{
  "meta": {
    "project": "DragonZord Teste Zero",
    "instance": "template",
    "subtitle": "Molde coringa reutilizável",
    "version": "1.0.0",
    "updatedAt": "2026-11-15"
  },
  "categories": [
    { "id": "browser", "label": "Agentes de Navegador", "short": "Navegador", "description": "..." }
  ],
  "projects": [
    {
      "id": 1,
      "name": "Projeto",
      "category": "browser",
      "description": "Resumo objetivo da utilidade.",
      "repoUrl": "https://github.com/org/repo",
      "demoUrl": "https://demo.example.com",
      "videoUrl": "https://www.youtube.com/results?search_query=...",
      "kaggleUrl": null,
      "embedUrl": null,
      "embeddable": false,
      "status": "pendente",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

Campos obrigatórios: `id`, `name`, `category`, `description`, `repoUrl`. Os demais são opcionais.

### 2.2 Front-end

- **`index.html`**: quatro abas — Grid de Comando, Relatórios, Kaggle Sandbox e Configurações — mais o
  modal de teste.
- **`assets/styles.css`**: tema escuro, responsivo e sem dependências externas.
- **`assets/app.js`**: estado, detecção de API, renderização, filtros, modal, relatórios, overrides e
  exportação.
- O front-end usa caminhos relativos (`projects.json`, `assets/...`), portanto funciona em subpastas e no
  GitHub Pages.

### 2.3 Back-end

Servidor HTTP nativo do Node.js, sem dependências:

- `GET /api/health` — status do serviço.
- `GET /api/projects` — catálogo.
- `GET /api/reports` — lista relatórios.
- `POST /api/reports` — cria relatório.
- `DELETE /api/reports?id=` — remove relatório.
- `GET /api/urls` — overrides de URL.
- `PUT /api/urls` — salva overrides.

O servidor também serve os arquivos estáticos, bloqueia path traversal e não expõe `reports/`, `docs/`,
`scripts/`, `server.js` ou `package.json`.

### 2.4 Persistência e degradação graciosa

| Dado | Com servidor | Sem servidor (GitHub Pages) |
| --- | --- | --- |
| Relatórios | `reports/reports.json` | `localStorage` (`dragonzord_reports_v1`) |
| Overrides | `reports/url-overrides.json` | `localStorage` (`dragonzord_overrides_v1`) |

Ao abrir a página em um host estático, o app detecta a ausência de `/api/health` e continua funcionando em
modo local. Nenhum dado sai do navegador.

## 3. Fluxo de teste

1. O operador filtra o grid por categoria ou busca por nome.
2. Clica em **Testar interface**.
3. O modal apresenta repositório, demo, vídeo e atalho Kaggle.
4. O operador abre a interface em nova aba (ou tenta o embed, quando o site permite).
5. Registra veredito, nota de usabilidade e observações na aba Relatórios.
6. O status do card passa a refletir o último veredito.

## 4. Isolamento de cargas

- Todo processamento pesado (Python, GPU, embeddings, motores locais) vai para notebooks do Kaggle.
- O painel apenas emite links; não executa scripts nem mantém credenciais.
- A infraestrutura de produção da AWS permanece intocada.
- Nenhum binário ou repositório pesado é baixado para a máquina do operador.

## 5. Extensibilidade

- **Novo projeto**: acrescente um objeto ao array `projects` em `projects.json`.
- **Nova categoria**: acrescente um objeto em `categories` e use o `id` nos projetos.
- **Nova instância**: rode `node scripts/create-instance.js <destino> <catalogo.json>`.
- **Novo campo**: adicione-o ao catálogo e trate-o em `assets/app.js` (card, modal ou relatório).

## 6. Decisões de projeto

- **Zero dependências**: elimina `npm install`, reduz superfície de ataque e facilita portabilidade.
- **JSON como contrato**: qualquer IA ou desenvolvedor consegue ler e editar o catálogo.
- **Degradação graciosa**: funciona com ou sem back-end.
- **Caminhos relativos**: compatível com GitHub Pages e subpastas.
- **Dados operacionais fora do Git**: relatórios e overrides ficam em `reports/` e são ignorados.