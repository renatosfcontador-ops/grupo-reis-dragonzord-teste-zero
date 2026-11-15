# Estaleiro — doca de montagem DragonZord

O **Estaleiro** é a doca onde o gestor seleciona módulos avulsos do catálogo, define um produto e registra
a arquitetura antes do deploy comercial.

## Como usar

1. Abra o painel e vá até a aba **Estaleiro**.
2. Filtre os módulos disponíveis no catálogo.
3. Marque os componentes que farão parte do produto.
4. Preencha nome, objetivo e notas de arquitetura.
5. Clique em **Salvar no estaleiro**.
6. Exporte o manifesto JSON para versionar ou compartilhar com a equipe.

## O que é persistido

- No servidor: o painel usa `localStorage` neste navegador.
- O manifesto exportado contém: nome, objetivo, notas, módulos selecionados, categoria, repositório,
  licença e semáforo de compliance (quando disponível).

## Segurança

Esta pasta contém apenas documentação. A interface do Estaleiro fica atrás do login do painel. Não coloque
credenciais, chaves privadas, dados de clientes ou código binário nesta pasta.

## Próximo passo

Ao estruturar um produto, valide:

- [ ] Todos os módulos têm `repoUrl` oficial.
- [ ] O semáforo de licença foi revisado.
- [ ] O objetivo e as notas explicam o valor operacional.
- [ ] O manifesto foi exportado e versionado.
- [ ] O produto está pronto para homologação no Kaggle Sandbox.