# Guia de instanciamento — DragonZord Teste N

Este documento é o procedimento operacional para qualquer IA ou desenvolvedor que precise criar uma nova
instância do DragonZord a partir do Teste Zero.

## 1. Pré-requisitos

- Node.js 18 ou superior.
- Git e GitHub CLI (`gh`) autenticados.
- Uma lista de projetos em JSON com `name`, `category`, `description` e `repoUrl`.
- Opcional: URLs de vídeos do YouTube, demos e notebooks do Kaggle.

## 2. Criar a instância

Na raiz do template:

```bash
node scripts/create-instance.js ../dragonzord-teste-1 ../catalogos/teste-1.json
```

O script:

1. Copia toda a estrutura do template para a pasta de destino.
2. Ignora `.git`, `node_modules`, relatórios e overrides de runtime.
3. Injeta o catálogo em `projects.json`.
4. Ajusta `meta.project`, `meta.instance`, `meta.source` e `meta.updatedAt`.
5. Atualiza o nome e a descrição no `package.json`.

Se o catálogo não for informado, a instância nasce com os cards de exemplo do template.

## 3. Formato do catálogo

```json
{
  "meta": {
    "project": "DragonZord Teste 1",
    "instance": "teste-1",
    "subtitle": "Instância prática com 24 agentes",
    "source": "Vídeo de referência de André Lug"
  },
  "categories": [
    {
      "id": "browser",
      "label": "Agentes de Navegador",
      "short": "Navegador",
      "description": "Automação e controle de browsers via IA"
    }
  ],
  "projects": [
    {
      "id": 1,
      "name": "OpenClaw",
      "category": "browser",
      "description": "Agente de propósito geral que opera sistema, navegador e ferramentas.",
      "repoUrl": "https://github.com/openclaw/openclaw",
      "demoUrl": "https://openclaw.ai",
      "videoUrl": "https://www.youtube.com/results?search_query=openclaw+ai",
      "kaggleUrl": null,
      "embedUrl": null,
      "embeddable": false,
      "status": "pendente",
      "tags": ["openclaw", "browser", "desktop"]
    }
  ]
}
```

### Campos de link

| Campo | Uso |
| --- | --- |
| `repoUrl` | Cordão umbilical oficial no GitHub. Obrigatório. |
| `demoUrl` | Interface web, demonstração ou documentação interativa. |
| `videoUrl` | Vídeo de referência no YouTube. Pode ser uma busca. |
| `kaggleUrl` | Notebook específico para testes pesados. |
| `embedUrl` | URL permitida em iframe, quando o site não bloqueia. |
| `embeddable` | `true` para abrir o iframe automaticamente no modal. |

Para injetar uma lista de vídeos do YouTube, basta preencher `videoUrl` em cada projeto. O card passa a
exibir o botão **Vídeo** e o modal lista o link.

## 4. Validar

```bash
npm run validate
npm start
# abra http://localhost:3000
```

O comando `validate` verifica a sintaxe de `server.js`, `assets/app.js` e o JSON do catálogo.

## 5. Publicar no GitHub

```bash
cd ../dragonzord-teste-1
git init -b main
git add .
git commit -m "feat: deploy dragonzord teste-1 with 24 open-source agent integrations"
gh repo create renatosfcontador-ops/grupo-reis-dragonzord-teste-1 --public --source=. --remote=origin --push
```

Se o repositório remoto já existir:

```bash
git remote add origin https://github.com/renatosfcontador-ops/grupo-reis-dragonzord-teste-1.git
git push -u origin main
```

## 6. Checklist de aceite

- [ ] `projects.json` contém o número correto de projetos.
- [ ] Todos os `repoUrl` apontam para repositórios oficiais.
- [ ] `videoUrl` foi preenchido ou removido deliberadamente.
- [ ] `npm run validate` passou.
- [ ] O grid, os filtros e o modal funcionam.
- [ ] Um relatório de teste foi criado e aparece no histórico.
- [ ] O painel funciona em modo estático (sem servidor).
- [ ] O repositório remoto está sincronizado.