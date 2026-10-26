# Central de Benefícios · Módulo Mobilidade

Sistema de gestão de vale-transporte e fretado: inclusões do RH, trocas, aprovações, fila de espera, compras (mensal, admissional e complementar), rateio por unidade/CNPJ/seção, exportações em Excel, carga inicial e conferência com a folha.

Next.js 15 (App Router) · TypeScript · Tailwind · componentes no padrão shadcn · Supabase (PostgreSQL + Auth).

---

## Como colocar no ar

### 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Crie o banco de um destes jeitos:
   - **Pelo VS Code (recomendado):** preencha `DATABASE_URL` no `.env.local` (Supabase → botão **Connect** → **Session pooler** → copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco) e rode `npm run db:setup`. Ele aplica tudo na ordem e pode ser rodado de novo sem duplicar.
   - **Pelo SQL Editor do Supabase:** rode os arquivos de `supabase/migrations/` na ordem, de `0001` a `0006`.
3. (Opcional) Para testar com dados fictícios, rode `supabase/seed_demo.sql`. O próprio arquivo traz o bloco para apagar depois.
4. Em **Authentication → Sign In / Providers**:
   - desligue **Allow new users to sign up** (só o admin cria usuários);
   - desligue **Confirm email** (o login é por usuário, não por e-mail).
   - Se o projeto tiver **proteção de senha vazada** ligada, senhas fracas serão recusadas; use uma senha mais forte no `.env.local` ou desligue essa opção.

### 2. Configurar e rodar

```bash
npm install
cp .env.example .env.local      # preencha com as chaves de Project Settings → API
npm run db:setup                # cria as tabelas, regras e auditoria no Supabase
npm run seed:admin              # cria o administrador inicial
npm run dev                     # http://localhost:3000
```

O administrador inicial é criado com `ADMIN_USERNAME` e `ADMIN_PASSWORD` do `.env.local` (a senha nunca fica no código). **Troque a senha no primeiro acesso** em *Minha conta*.

> O Supabase Auth exige e-mail. Internamente, o usuário `lucas.pereira` vira `lucas.pereira@central-beneficios.local` (domínio em `AUTH_EMAIL_DOMAIN`). Ninguém recebe e-mail.

### 3. Publicar (Vercel)

Importe o repositório na Vercel e cadastre as mesmas variáveis do `.env.local`. A `SUPABASE_SERVICE_ROLE_KEY` fica só no servidor; nunca a coloque em variável `NEXT_PUBLIC_`.

### Ordem de uso no go-live

1. **Estrutura**: unidades → razões sociais (CNPJ) → seções.
2. **Vale-transporte**: operadoras e destinos (origem → destino, linha, tarifa).
3. **Fretado**: operadoras (cobrança na entrada), contratos (por assento, fechado ou misto + subsídios), rotas e horários com assentos.
4. **Calendário**: janela do mês, corte (dia 20), aprovação (dia 20), compra e crédito.
5. **Usuários**: um usuário de RH por unidade.
6. **Carga inicial**: baixe o modelo na própria tela (também em `public/modelos/`), preencha e suba.
7. A partir daí, o RH lança admissões e movimentações; você aprova e fecha as compras.

---

## Rastreabilidade

- Toda tabela tem `created_at/created_by/updated_at/updated_by`, preenchidos pelo banco com o usuário da sessão (não dá para falsificar pelo navegador).
- Toda inclusão, alteração e exclusão gera uma linha em `audit_log` com usuário, data/hora e o antes/depois de cada campo. Login, logout, exportações, carga e conferência também são registrados.
- A tela **Auditoria** filtra por usuário, ação, cadastro e período, e mostra o histórico completo de qualquer registro. A página de cada colaborador traz a trilha dele.
- O `audit_log` não tem política de escrita: só as funções do banco gravam; ninguém edita ou apaga pela aplicação.

## Segurança

- RLS em todas as tabelas. O RH lê só a própria unidade e **não grava direto nas tabelas**: tudo passa por funções do banco que conferem perfil e unidade. A aprovação é exclusiva do admin.
- Usuário desativado perde o acesso e fica bloqueado no login.

## Regras implementadas (resumo)

| Regra | Onde |
| --- | --- |
| Benefício único por grupo (limite parametrizável) | gatilho `tg_benefit_rules` |
| Controle de assentos por horário, sem overbooking em pedidos simultâneos | gatilho `tg_benefit_rules` (trava o horário) |
| Unidade → CNPJ → seção coerentes | gatilho `tg_employee_hierarchy` |
| Janela mensal trava inclusão/exclusão/alteração | `current_window()` |
| Troca de rota/categoria só vale no mês seguinte, com aprovação | `submit_category_change`, `approve_movement` |
| Troca de horário por turno: mesma rota/operadora, no meio do mês | `submit_schedule_swap` |
| Fila sem prazo, por ordem de pedido, troca automática ao aprovar | `approve_waitlist` |
| Proporcional: dias restantes com o dia da admissão, menos domingos, até 26 | `lib/calc.ts` |
| Contrato por assento, fechado ou misto (subsídio R$ ou %, entra ou não no rateio) | `lib/calc.ts` → `shareContract` |
| Acerto do fretado por assento para quem entrou depois do corte | `lib/purchase-engine.ts` |
| Compra: aberta (prévia) → fechada (foto) → paga (travada); reabre até ser paga | `close_purchase`, `reopen_purchase`, `mark_purchase_paid` |

## Testes

```bash
npm test          # regras de cálculo (proporcional, rateio, datas)
npm run typecheck
```

`supabase/tests/99_cenario.sql` exercita o fluxo completo no banco (inclusão, falta de vaga, fila, benefício único, permissões do RH, aprovações, exclusão, alteração cadastral, auditoria, fechamento e reabertura de compra). Ele precisa de um Postgres com o stub `00_stub_supabase.sql` antes das migrations.

## Estrutura

```
app/(app)/            telas logadas (colaboradores, movimentações, fila, aprovações, compras, parâmetros…)
app/api/              exportações em Excel
lib/calc.ts           regras de cálculo puras (testadas)
lib/purchase-engine.ts  cálculo das compras e do rateio
supabase/migrations/  banco, regras, segurança e auditoria
scripts/seed-admin.mjs  primeiro administrador
```

## Próximos passos combinados

- Layouts de envio específicos de cada operadora (fase 2). Hoje os arquivos saem num layout padrão por operadora.
- Módulos de Alimentação, Saúde e Odonto sobre a mesma estrutura.
