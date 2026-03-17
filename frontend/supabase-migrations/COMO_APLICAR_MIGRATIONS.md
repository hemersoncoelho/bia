# Como aplicar migrations no Supabase

## Erro: "Could not find the function public.rpc_invite_member"

Esse erro ocorre quando a função `rpc_invite_member` ainda não foi criada no banco. Siga os passos abaixo para corrigir.

### Opção 1: Supabase Dashboard (recomendado)

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. No menu lateral, clique em **SQL Editor**
4. Clique em **New query**
5. Copie todo o conteúdo do arquivo `FIX_invite_member_standalone.sql`
6. Cole no editor e clique em **Run** (ou Ctrl+Enter)
7. Aguarde a mensagem de sucesso

### Opção 2: Supabase CLI

Se você usa Supabase CLI localmente:

```bash
cd frontend
supabase db push
# ou, para aplicar um arquivo específico:
supabase db execute -f supabase-migrations/FIX_invite_member_standalone.sql
```

### Verificação

Após executar o script, teste novamente o convite de membro em **Equipe → Convidar Membro**.

---

## Ordem das migrations (referência)

Se estiver aplicando migrations manualmente, a ordem sugerida é:

1. `supabase_schema.sql` (base)
2. `backend_teams_and_roles.sql` (times e funções auxiliares)
3. `backend_invite_and_teams.sql` ou `FIX_invite_member_standalone.sql` (convite de membros)

O arquivo `FIX_invite_member_standalone.sql` é autocontido e inclui tudo necessário para o convite funcionar.
