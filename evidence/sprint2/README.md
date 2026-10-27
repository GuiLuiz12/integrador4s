# Validação da entrega analítica — Sprint 2

Entrega: [relatório com as dez seções](../../docs/relatorio-sprint2.md), [dados e fontes](../../analysis/sprint2/README.md) e Dashboard v0.2. O relatório e as visões analíticas reutilizam o baseline e o experimento preservados; não houve nova coleta longa para esta entrega.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `npm run build` | TypeScript compilado |
| `npm test` | 36 testes aprovados |
| `npm run test:evidence` | 20 testes aprovados |
| `npm run analysis:sprint2` | Relatório, dados, fontes e dashboard gerados; integridade das fontes conferida |
| `npm run config:check` | Compose válido |
| `npm run test:rules` | Regras Prometheus aprovadas |
| `npm run test:integration` | Login/consulta, 100 registros, 3 identidades, permissões, idempotência, 7 alvos e métricas, portas loopback e limites aprovados |
| `npm run dashboard:verify` | Login, consultas operacionais, 16 consultas analíticas, 10 seções do relatório e hashes das 14 fontes servidas conferidos |

O teste opcional de instalação em VM Ubuntu não foi repetido: esta entrega não altera o instalador. A sessão longa e o verificador de aceite anterior não foram reexecutados. Sua rejeição original permanece documentada como limitação, sem bloquear o uso analítico aprovado.

## Capturas

As capturas usam o intervalo do experimento nos painéis operacionais. As visões analíticas têm o recorte fixo identificado no dashboard. Datas da captura, quantidade de painéis e erros de consulta/JavaScript estão em [validation.json](dashboard/validation.json).

- [Síntese](dashboard/sintese.png)
- [Baseline e tendências](dashboard/baseline.png)
- [Matriz e registro de riscos](dashboard/riscos.png)
- [Vulnerabilidades](dashboard/vulnerabilidades.png)
- [Incidentes e alertas](dashboard/incidentes.png)
- [KPIs e KRIs](dashboard/indicadores.png)
- [Operação](dashboard/operacao.png)
- [Infraestrutura](dashboard/infraestrutura.png)
- [Relatório no navegador](dashboard/relatorio.png)

Comando de reprodução, usando uma nova pasta para preservar estas capturas:

```bash
npm run dashboard:verify -- --from 2026-10-26T22:57:04.597Z --to 2026-10-26T23:57:05.715Z
```

A aprovação final da apresentação cabe à revisão do usuário. Os tratamentos de risco continuam propostos, sem declaração de implantação ou de risco mitigado.
