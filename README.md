# NetPulse

Monitor de disponibilidade para serviços HTTP e portas TCP. Verifica cada alvo em intervalos configuráveis, guarda o histórico em SQLite, calcula uptime e latência média, e avisa por webhook quando algo cai ou volta.

A ideia surgiu de uma necessidade comum em infraestrutura: saber se o firewall, o PABX ou o servidor de arquivos de um cliente está respondendo, sem subir um Zabbix inteiro para isso.

## Como rodar

Requer Node.js 22.13 ou superior. Não há dependências para instalar.

```bash
npm start
```

Com Docker:

```bash
docker compose up --build
```

Variáveis de ambiente:

| Variável         | Padrão         | Descrição                                          |
| ---------------- | -------------- | -------------------------------------------------- |
| `PORT`           | `3000`         | Porta da API                                       |
| `DB_PATH`        | `netpulse.db`  | Arquivo do SQLite                                  |
| `WEBHOOK_URL`    | (vazio)        | URL que recebe os alertas (Slack, Discord, etc.)   |
| `TARGETS_FILE`   | (vazio)        | JSON com alvos iniciais, lido só com o banco vazio |
| `RETENTION_DAYS` | `30`           | Por quantos dias manter o histórico                |

## API

```bash
# cadastrar um alvo HTTP
curl -X POST localhost:3000/targets -H 'content-type: application/json' \
  -d '{"name": "Portal", "kind": "http", "address": "https://example.com"}'

# cadastrar uma porta TCP, alertando após 2 falhas seguidas
curl -X POST localhost:3000/targets -H 'content-type: application/json' \
  -d '{"name": "PABX SIP", "kind": "tcp", "address": "192.168.1.20:5060", "failThreshold": 2}'

curl localhost:3000/targets                     # lista
curl localhost:3000/targets/1                   # detalhes + últimas verificações
curl localhost:3000/targets/1/uptime?window=7d  # 1h, 24h, 7d ou 30d
curl -X DELETE localhost:3000/targets/1
```

Campos opcionais do cadastro: `intervalS` (10 a 3600, padrão 60), `timeoutMs` (500 a 30000, padrão 5000) e `failThreshold` (1 a 10, padrão 3).

## Decisões

- **Sem dependências.** `node:http`, `node:sqlite`, `node:net` e `node:test` cobrem tudo o que o projeto precisa. Menos coisa para atualizar e nenhuma vulnerabilidade de terceiros para acompanhar.
- **Limite de falhas antes do alerta.** Um timeout isolado não deveria acordar ninguém. O alvo só vira `down` depois de N falhas seguidas e volta para `up` no primeiro sucesso. A lógica está isolada em `src/state.js`, uma função pura, fácil de testar.
- **Sem verificações sobrepostas.** Se um check ainda está esperando o timeout quando chega a hora do próximo, a rodada é pulada em vez de abrir outra conexão.
- **Check HTTP não segue redirecionamento.** Um 301 conta como resposta válida do servidor. Assim o monitor mede o serviço, e não o destino do redirect.

## Estrutura

```
src/
  checks.js    verificações HTTP e TCP
  state.js     regra de transição up/down
  monitor.js   agendamento e execução dos checks
  store.js     consultas SQL
  api.js       rotas e validação
  http.js      roteador mínimo sobre node:http
  notifier.js  log + webhook
test/          testes com node:test, incluindo servidores reais em portas locais
```

## Testes

```bash
npm test
```

## Limitações e próximos passos

- Não há ICMP (ping): exigiria privilégio de root ou um binário externo. Um check TCP na porta de gerência costuma resolver.
- O contador de falhas fica em memória e zera em um restart.
- Ideias: painel web simples, check de validade de certificado TLS, exportação de métricas no formato Prometheus.

## Licença

MIT
