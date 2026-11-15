# Kaggle Sandbox — regras de isolamento

O DragonZord é um painel de links. Ele não executa código, não mantém credenciais e não baixa
dependências. Quando um teste exige processamento real, o caminho é o Kaggle.

## 1. Quando usar

- Execução de scripts Python.
- Instalação de bibliotecas pesadas.
- Testes de embeddings, vetores ou modelos locais.
- Qualquer carga que exija GPU.
- Provas de conceito que não podem tocar a infraestrutura de produção da AWS.

## 2. Atalhos no painel

- Aba **Kaggle Sandbox**: abre um novo notebook ou uma busca de notebooks.
- Modal de cada projeto: linha **Notebook / busca Kaggle**.
- Se o projeto tiver `kaggleUrl` no catálogo, o botão abre o notebook específico.
- Sem `kaggleUrl`, o painel abre uma busca no Kaggle pelo nome do projeto.

## 3. Checklist obrigatório

1. Criar um notebook novo em `https://www.kaggle.com/code/new`.
2. Ativar **Accelerator → GPU T4 x2** apenas quando necessário.
3. Ativar **Internet** na sessão, se o teste precisar baixar modelos.
4. Nunca colar chaves AWS, tokens privados, senhas ou dados de clientes.
5. Nomear o notebook com o padrão `dragonzord-<projeto>-<data>`.
6. Salvar uma versão ao final de cada bateria.
7. Registrar o veredito no painel e colar o link do notebook nas notas.

## 4. Limites e cuidados

- Sessões do Kaggle são descartáveis e podem expirar.
- Não use o Kaggle como armazenamento permanente de dados sensíveis.
- Não aponte o notebook para recursos de produção da AWS.
- Mantenha os dados de homologação anonimizados.

## 5. Integração com o painel

O campo `kaggleUrl` no `projects.json` aceita qualquer URL de notebook do Kaggle. Se você não quiser fixar
um notebook, deixe `null`: o painel usará uma busca pelo nome do projeto.

Exemplo:

```json
{
  "id": 8,
  "name": "CrewAI",
  "kaggleUrl": "https://www.kaggle.com/code/seu-usuario/crewai-smoke-test"
}
```