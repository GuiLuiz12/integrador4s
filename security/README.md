# Casos de teste do laboratório autorizado

Destinos limitados aos serviços do projeto Compose `governanca-saude`.

- Login válido, senha inválida, usuário desconhecido e token expirado.
- Recusa de consulta sem autenticação e ausência de rotas de edição.
- Somente SELECT para `clinical_reader`; inicialização por `lab_owner`.
- Verificação completa rejeita HTTP 200 com prontuário incorreto e respeita timeout total.
- Interrupção do banco por dois minutos com restauração; observar alerta e recuperação.
- Interrupção do verificador; falta de coleta não vira sucesso nem indisponibilidade clínica confirmada.
- Logs sem credenciais, tokens ou conteúdo clínico; teste automatizado cobre essa propriedade.

Nenhum teste ofensivo externo, scanner de vulnerabilidades ou dado real é utilizado. O esquema de acesso é deliberadamente simples e restrito a dados fictícios; não é adequado a prontuários reais.
