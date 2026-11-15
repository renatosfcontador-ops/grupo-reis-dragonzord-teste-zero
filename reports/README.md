# Relatórios de homologação

Esta pasta é o histórico operacional do DragonZord. Ela deve conter apenas relatórios, logs de teste e
sumários de validação — nunca código binário, dependências ou credenciais.

## Arquivos gerados em runtime

| Arquivo | Origem | Descrição |
| --- | --- | --- |
| `reports/reports.json` | API `POST /api/reports` | Relatórios persistidos pelo servidor local |
| `reports/url-overrides.json` | API `PUT /api/urls` | Sobrescritas de links por projeto |

Esses dois arquivos são ignorados pelo Git para evitar commits acidentais de dados operacionais. Use os
botões **Exportar JSON** e **Exportar CSV** na aba Relatórios para gerar uma cópia versionável.

## Formato de um relatório

```json
{
  "id": "175...-ab12cd",
  "projectId": 8,
  "projectName": "CrewAI",
  "operator": "Renato",
  "verdict": "patina",
  "usability": 2,
  "notes": "Instalação simples, mas a interface exige muitos cliques para chegar ao fluxo principal.",
  "createdAt": "2026-11-15T16:30:00.000Z"
}
```

- `verdict`: `aprovado`, `patina`, `reprovado` ou `pendente`.
- `usability`: nota de 0 a 5.
- `notes`: observação curta, objetiva e comparável entre operadores.

## Regra de ouro

O relatório só tem valor se outro operador conseguir repetir o teste a partir do repositório e das notas.
Registre o caminho percorrido, o que funcionou e onde o projeto "patinou".