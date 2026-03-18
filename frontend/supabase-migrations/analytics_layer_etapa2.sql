-- ============================================================
-- analytics_layer_etapa2.sql
-- SalesIA — Camada Analítica — Etapa 2
-- Governança, Confiabilidade Histórica e Performance
-- Data: 2026-03-18
-- ============================================================
--
-- ORDEM DE APLICAÇÃO (segura e idempotente):
--   Bloco 1  — Trigger automática para deal_stage_history
--   Bloco 2  — Tabela + função de snapshot diário materializado
--   Bloco 3  — Consolidação de usuários (ADD COLUMN em user_profiles)
--   Bloco 4  — Consolidação de memberships (migrar uc_only → company_memberships)
--   Bloco 5  — View v_agent_performance
--   Bloco 6  — View v_cohort_retention
--   Bloco 7  — Atualização das views canônicas (v_users_canonical, v_memberships_canonical)
--
-- ROLLBACK COMPLETO (em ordem inversa):
--   DROP VIEW  IF EXISTS public.v_cohort_retention;
--   DROP VIEW  IF EXISTS public.v_agent_performance;
--   DROP VIEW  IF EXISTS public.v_memberships_canonical;  -- recriar versão Etapa 1
--   DROP VIEW  IF EXISTS public.v_users_canonical;        -- recriar versão Etapa 1
--   -- memberships: não há rollback automático para os INSERTs (dados inseridos são reais)
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS email;
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS is_active;
--   DROP FUNCTION IF EXISTS public.fn_refresh_kpi_daily_snapshot(date);
--   DROP TABLE  IF EXISTS public.kpi_company_daily_snapshots;
--   DROP TRIGGER IF EXISTS trg_deal_stage_history ON public.deals;
--   DROP FUNCTION IF EXISTS public.fn_track_deal_stage_change();
-- ============================================================


-- ============================================================
-- BLOCO 1: TRIGGER AUTOMÁTICA PARA deal_stage_history
-- ------------------------------------------------------------
-- Objetivo : registrar automaticamente toda mudança de stage_id
--            em deals, preservando histórico para análise de
--            aging, taxa de avanço e previsibilidade comercial.
-- Tabelas  : deals (origem), deal_stage_history (destino)
-- Limitação: changed_by_user_id = auth.uid(), que é NULL quando
--            a operação ocorre via service_role ou triggers
--            internas. Isso é esperado e documentado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_track_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- IS NOT DISTINCT FROM trata corretamente o caso em que stage_id
  -- era NULL (deal recém-criado) ou passa para NULL (raro, mas possível).
  IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.deal_stage_history (
    company_id,
    deal_id,
    old_stage_id,
    new_stage_id,
    changed_by_user_id,
    changed_at
  ) VALUES (
    NEW.company_id,
    NEW.id,
    OLD.stage_id,
    NEW.stage_id,
    auth.uid(),   -- NULL para operações via service_role (esperado)
    now()
  );

  RETURN NEW;
END;
$$;

-- DROP IF EXISTS garante idempotência ao re-aplicar a migration
DROP TRIGGER IF EXISTS trg_deal_stage_history ON public.deals;

-- AFTER UPDATE OF stage_id: só dispara quando stage_id aparece no SET;
-- a verificação IS NOT DISTINCT FROM dentro da função é segunda linha de defesa.
CREATE TRIGGER trg_deal_stage_history
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_track_deal_stage_change();


-- ============================================================
-- BLOCO 2: SNAPSHOT MATERIALIZADO DIÁRIO
-- ------------------------------------------------------------
-- Objetivo : persistir KPIs diários por empresa, separando
--            métricas de FLUXO (eventos do dia) e ESTOQUE
--            (estado ao final do dia).
-- Tabela   : kpi_company_daily_snapshots (1 linha/empresa/dia)
-- Função   : fn_refresh_kpi_daily_snapshot(date) — upsert seguro
-- Cron     : recomendado rodar diariamente às 00:05 UTC
--            via pg_cron: SELECT cron.schedule('kpi-daily',
--              '5 0 * * *',
--              $$SELECT public.fn_refresh_kpi_daily_snapshot()$$);
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kpi_company_daily_snapshots (
  company_id            uuid          NOT NULL
    REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date         date          NOT NULL,

  -- === MÉTRICAS DE FLUXO (eventos que ocorreram naquele dia) ===
  -- Critério temporal: created_at ou closed_at dentro do dia UTC
  new_contacts          integer       NOT NULL DEFAULT 0,
  new_leads             integer       NOT NULL DEFAULT 0,
  new_conversations     integer       NOT NULL DEFAULT 0,
  closed_conversations  integer       NOT NULL DEFAULT 0,
  new_deals             integer       NOT NULL DEFAULT 0,
  won_deals             integer       NOT NULL DEFAULT 0,
  lost_deals            integer       NOT NULL DEFAULT 0,
  won_amount            numeric(15,2) NOT NULL DEFAULT 0,
  messages_inbound      integer       NOT NULL DEFAULT 0,
  messages_outbound     integer       NOT NULL DEFAULT 0,

  -- === MÉTRICAS DE ESTOQUE (estado ao final do dia) ===
  -- AVISO: para snapshots de hoje, refletem o estado real.
  -- Para backfills históricos, são reconstruções aproximadas
  -- baseadas em timestamps — não capturam soft-deletes tardios
  -- ou restaurações que ocorreram após a data.
  open_conversations    integer       NOT NULL DEFAULT 0,
  open_pipeline_amount  numeric(15,2) NOT NULL DEFAULT 0,
  tasks_open            integer       NOT NULL DEFAULT 0,
  tasks_overdue         integer       NOT NULL DEFAULT 0,

  -- Metadados
  computed_at           timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date
  ON public.kpi_company_daily_snapshots (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_company_date
  ON public.kpi_company_daily_snapshots (company_id, snapshot_date DESC);

COMMENT ON TABLE public.kpi_company_daily_snapshots IS
  'Snapshot diário de KPIs por empresa. '
  'Métricas de fluxo = eventos ocorridos no dia. '
  'Métricas de estoque = estado ao final do dia (aproximação para datas passadas). '
  'Atualizar diariamente via fn_refresh_kpi_daily_snapshot().';


-- Função de upsert para um dia específico.
-- Usa CTEs por tabela (não JOIN cruzado) para evitar explosão cartesiana.
-- Segura para re-execução: ON CONFLICT DO UPDATE atualiza todos os campos.
CREATE OR REPLACE FUNCTION public.fn_refresh_kpi_daily_snapshot(
  p_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start  timestamptz := p_date::timestamptz AT TIME ZONE 'UTC';
  v_end    timestamptz := (p_date + interval '1 day')::timestamptz AT TIME ZONE 'UTC';
BEGIN

  INSERT INTO public.kpi_company_daily_snapshots (
    company_id, snapshot_date,
    new_contacts, new_leads,
    new_conversations, closed_conversations,
    new_deals, won_deals, lost_deals, won_amount,
    messages_inbound, messages_outbound,
    open_conversations, open_pipeline_amount,
    tasks_open, tasks_overdue,
    computed_at
  )

  WITH
  -- ── Fluxo: contatos ──────────────────────────────────────
  contacts_agg AS (
    SELECT
      company_id,
      COUNT(*) FILTER (WHERE created_at >= v_start AND created_at < v_end)
        ::integer AS new_contacts,
      COUNT(*) FILTER (
        WHERE created_at >= v_start AND created_at < v_end
          AND lifecycle_stage = 'lead'
      )::integer AS new_leads
    FROM public.contacts
    GROUP BY company_id
  ),

  -- ── Fluxo + Estoque: conversas ───────────────────────────
  conv_agg AS (
    SELECT
      company_id,
      COUNT(*) FILTER (WHERE created_at >= v_start AND created_at < v_end)
        ::integer AS new_conversations,
      COUNT(*) FILTER (WHERE closed_at  >= v_start AND closed_at  < v_end)
        ::integer AS closed_conversations,
      -- Estoque: criadas antes do fim do dia e ainda abertas ao final do dia
      COUNT(*) FILTER (
        WHERE created_at < v_end
          AND (closed_at IS NULL OR closed_at >= v_end)
      )::integer AS open_conversations
    FROM public.conversations
    GROUP BY company_id
  ),

  -- ── Fluxo + Estoque: deals ───────────────────────────────
  deals_agg AS (
    SELECT
      company_id,
      COUNT(*) FILTER (WHERE created_at >= v_start AND created_at < v_end)
        ::integer AS new_deals,
      COUNT(*) FILTER (
        WHERE closed_at >= v_start AND closed_at < v_end AND status = 'won'
      )::integer AS won_deals,
      COUNT(*) FILTER (
        WHERE closed_at >= v_start AND closed_at < v_end AND status = 'lost'
      )::integer AS lost_deals,
      -- Valor ganho no dia
      COALESCE(SUM(amount) FILTER (
        WHERE closed_at >= v_start AND closed_at < v_end AND status = 'won'
      ), 0)::numeric(15,2) AS won_amount,
      -- Estoque: pipeline aberto ao final do dia
      COALESCE(SUM(amount) FILTER (
        WHERE created_at < v_end
          AND status = 'open'
          AND (closed_at IS NULL OR closed_at >= v_end)
      ), 0)::numeric(15,2) AS open_pipeline_amount
    FROM public.deals
    GROUP BY company_id
  ),

  -- ── Fluxo: mensagens ────────────────────────────────────
  messages_agg AS (
    SELECT
      company_id,
      COUNT(*) FILTER (
        WHERE created_at >= v_start AND created_at < v_end AND direction = 'inbound'
      )::integer AS messages_inbound,
      COUNT(*) FILTER (
        WHERE created_at >= v_start AND created_at < v_end AND direction = 'outbound'
      )::integer AS messages_outbound
    FROM public.messages
    GROUP BY company_id
  ),

  -- ── Estoque: tarefas ────────────────────────────────────
  -- tasks.status é text; valores confirmados: 'open', 'in_progress', 'done'
  tasks_agg AS (
    SELECT
      company_id,
      COUNT(*) FILTER (
        WHERE created_at < v_end
          AND status NOT IN ('done', 'cancelled')
      )::integer AS tasks_open,
      COUNT(*) FILTER (
        WHERE created_at < v_end
          AND status NOT IN ('done', 'cancelled')
          AND due_at IS NOT NULL
          AND due_at < v_end
      )::integer AS tasks_overdue
    FROM public.tasks
    GROUP BY company_id
  )

  SELECT
    c.id,
    p_date,
    COALESCE(ca.new_contacts,         0),
    COALESCE(ca.new_leads,            0),
    COALESCE(cv.new_conversations,    0),
    COALESCE(cv.closed_conversations, 0),
    COALESCE(da.new_deals,            0),
    COALESCE(da.won_deals,            0),
    COALESCE(da.lost_deals,           0),
    COALESCE(da.won_amount,           0),
    COALESCE(ma.messages_inbound,     0),
    COALESCE(ma.messages_outbound,    0),
    COALESCE(cv.open_conversations,   0),
    COALESCE(da.open_pipeline_amount, 0),
    COALESCE(ta.tasks_open,           0),
    COALESCE(ta.tasks_overdue,        0),
    now()
  FROM public.companies c
  LEFT JOIN contacts_agg ca ON ca.company_id = c.id
  LEFT JOIN conv_agg      cv ON cv.company_id = c.id
  LEFT JOIN deals_agg     da ON da.company_id = c.id
  LEFT JOIN messages_agg  ma ON ma.company_id = c.id
  LEFT JOIN tasks_agg     ta ON ta.company_id = c.id

  ON CONFLICT (company_id, snapshot_date) DO UPDATE SET
    new_contacts          = EXCLUDED.new_contacts,
    new_leads             = EXCLUDED.new_leads,
    new_conversations     = EXCLUDED.new_conversations,
    closed_conversations  = EXCLUDED.closed_conversations,
    new_deals             = EXCLUDED.new_deals,
    won_deals             = EXCLUDED.won_deals,
    lost_deals            = EXCLUDED.lost_deals,
    won_amount            = EXCLUDED.won_amount,
    messages_inbound      = EXCLUDED.messages_inbound,
    messages_outbound     = EXCLUDED.messages_outbound,
    open_conversations    = EXCLUDED.open_conversations,
    open_pipeline_amount  = EXCLUDED.open_pipeline_amount,
    tasks_open            = EXCLUDED.tasks_open,
    tasks_overdue         = EXCLUDED.tasks_overdue,
    computed_at           = EXCLUDED.computed_at;

END;
$$;


-- Backfill dos últimos 30 dias (idempotente — pode ser re-executado)
-- Para ampliar o histórico, ajuste o intervalo: 90 dias, 365 dias, etc.
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      (CURRENT_DATE - interval '30 days')::date,
      CURRENT_DATE,
      interval '1 day'
    )::date
  LOOP
    PERFORM public.fn_refresh_kpi_daily_snapshot(d);
  END LOOP;
  RAISE NOTICE 'Backfill concluído: % → %',
    (CURRENT_DATE - interval '30 days')::date, CURRENT_DATE;
END;
$$;


-- View de leitura sobre o snapshot (enriquece com nome da empresa)
-- Substitui a view v_kpi_company_daily anterior (que era dinâmica)
CREATE OR REPLACE VIEW public.v_kpi_company_daily AS
SELECT
  s.snapshot_date,
  c.name AS company_name,
  s.company_id,
  -- Fluxo
  s.new_contacts,
  s.new_leads,
  s.new_conversations,
  s.closed_conversations,
  s.new_deals,
  s.won_deals,
  s.lost_deals,
  s.won_amount,
  s.messages_inbound,
  s.messages_outbound,
  -- Estoque
  s.open_conversations,
  s.open_pipeline_amount,
  s.tasks_open,
  s.tasks_overdue,
  s.computed_at
FROM public.kpi_company_daily_snapshots s
JOIN public.companies c ON c.id = s.company_id;

COMMENT ON VIEW public.v_kpi_company_daily IS
  'Leitura amigável sobre kpi_company_daily_snapshots. '
  'Dados são persistidos; esta view apenas adiciona company_name. '
  'Atualizar snapshots via fn_refresh_kpi_daily_snapshot().';


-- ============================================================
-- BLOCO 3: CONSOLIDAÇÃO DE USUÁRIOS
-- ------------------------------------------------------------
-- Objetivo : tornar user_profiles a fonte canônica completa,
--            absorvendo email e is_active que hoje existem
--            somente em profiles.
-- Diagnóstico:
--   8 usuários em user_profiles.
--   Apenas 2 têm registro em profiles (hemersoncoelho21 + ana.ferreira).
--   6 existem somente em user_profiles (sem profiles).
-- Estratégia:
--   1. ADD COLUMN email, is_active em user_profiles
--   2. Backfill a partir de profiles (2 usuários com match)
--   3. Backfill via auth.users para os demais (email de auth)
--   4. profiles permanece intacta por compatibilidade (deprecação em Etapa 3)
-- ============================================================

-- Passo 3a: adicionar colunas de forma segura (IF NOT EXISTS)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email     text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Índice para buscas por email
CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON public.user_profiles (email)
  WHERE email IS NOT NULL;

-- Passo 3b: backfill dos 2 usuários que já têm registro em profiles
UPDATE public.user_profiles up
SET
  email     = p.email,
  is_active = p.is_active
FROM public.profiles p
WHERE p.user_id = up.id
  AND p.email IS NOT NULL
  AND (up.email IS NULL OR up.is_active IS DISTINCT FROM p.is_active);

-- Passo 3c: backfill de email via auth.users para todos os demais
-- auth.users é acessível dentro de função SECURITY DEFINER
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE au.id = up.id
  AND up.email IS NULL
  AND au.email IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.email IS
  'Email do usuário. Fonte primária: auth.users. '
  'Também espelhado em profiles.email para os 2 registros legados. '
  'Esta coluna é a referência canônica a partir da Etapa 2.';

COMMENT ON COLUMN public.user_profiles.is_active IS
  'Indica se o usuário está ativo na plataforma. '
  'Default TRUE. Gerenciado via profiles.is_active até a depreciação de profiles.';


-- ============================================================
-- BLOCO 4: CONSOLIDAÇÃO DE MEMBERSHIPS
-- ------------------------------------------------------------
-- Objetivo : migrar os registros exclusivos de user_companies
--            para company_memberships, tornando esta a fonte
--            única de vínculos usuário-empresa.
-- Diagnóstico:
--   5 registros uc_only (empresa OrtoATM: f5de34df-...)
--   3 registros cm_only (ana.ferreira em 3 empresas)
--   3 registros em ambas (hemersoncoelho21 em 3 empresas)
-- Estratégia:
--   INSERT ... WHERE NOT EXISTS (idempotente)
--   role_in_company → role (mesma company_role_enum)
--   team_id preservado onde disponível em company_memberships
-- ============================================================

-- Passo 4a (pré-requisito): company_memberships.user_id tem FK para profiles.user_id.
-- Usuários que existem apenas em user_profiles precisam ter um registro em profiles
-- antes de receber um membership.
INSERT INTO public.profiles (user_id, full_name, email, platform_role, is_active, created_at, updated_at)
SELECT
  up.id,
  up.full_name,
  up.email,
  CASE up.system_role::text
    WHEN 'platform_admin' THEN 'platform_admin'::public.platform_role_enum
    ELSE NULL  -- agents não têm equivalente em platform_role_enum
  END,
  up.is_active,
  up.created_at,
  up.updated_at
FROM public.user_profiles up
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = up.id
);

-- Passo 4b: copiar registros uc_only para company_memberships
-- user_companies.role_in_company é do tipo app_role; precisa de cast explícito
-- para company_role_enum. 'platform_admin' não existe em company_role_enum
-- e é mapeado para 'company_admin'.
INSERT INTO public.company_memberships (
  user_id,
  company_id,
  role,
  status,
  team_id,
  joined_at,
  created_at
)
SELECT
  uc.user_id,
  uc.company_id,
  CASE uc.role_in_company::text
    WHEN 'platform_admin' THEN 'company_admin'::public.company_role_enum
    WHEN 'company_admin'  THEN 'company_admin'::public.company_role_enum
    WHEN 'manager'        THEN 'manager'::public.company_role_enum
    WHEN 'agent'          THEN 'agent'::public.company_role_enum
    ELSE                       'agent'::public.company_role_enum
  END,
  'active'::public.membership_status_enum,
  uc.team_id,
  COALESCE(uc.created_at, now()),
  COALESCE(uc.created_at, now())
FROM public.user_companies uc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_memberships cm
  WHERE cm.user_id = uc.user_id
    AND cm.company_id = uc.company_id
);


-- ============================================================
-- BLOCO 5: VIEW v_agent_performance
-- ------------------------------------------------------------
-- Objetivo : métricas de performance por agente humano,
--            por empresa.
-- Fontes   : conversations, messages, deals, v_users_canonical
-- Limitações:
--   - avg_first_response_min: aproximação. Mede o tempo médio
--     entre qualquer mensagem 'contact' inbound e a primeira
--     resposta 'user' outbound seguinte na mesma conversa.
--     Não isola "turnos"; pode ser subestimado em conversas longas.
--   - Não cobre agentes de IA (ver sugestão Etapa 3).
--   - Win rate calculado sobre o total de deals do agente,
--     independente da janela temporal.
-- ============================================================

CREATE OR REPLACE VIEW public.v_agent_performance AS
WITH

-- Conversas por agente humano atribuído
human_conv AS (
  SELECT
    company_id,
    assigned_to_user_id                                                   AS agent_user_id,
    COUNT(*)                                                              AS conversations_total,
    COUNT(*) FILTER (WHERE closed_at IS NOT NULL)                        AS conversations_closed,
    COUNT(*) FILTER (WHERE closed_at IS NULL)                            AS conversations_open
  FROM public.conversations
  WHERE assigned_to_user_id IS NOT NULL
  GROUP BY company_id, assigned_to_user_id
),

-- Mensagens enviadas/recebidas em conversas do agente
-- sender_type = 'user' → mensagem do agente humano
human_msg AS (
  SELECT
    company_id,
    sender_user_id                                                        AS agent_user_id,
    COUNT(*) FILTER (WHERE direction = 'outbound' AND sender_type = 'user') AS messages_sent,
    COUNT(*) FILTER (WHERE direction = 'inbound')                          AS messages_received_in_conv
  FROM public.messages
  WHERE sender_user_id IS NOT NULL
  GROUP BY company_id, sender_user_id
),

-- Deals por agente dono (owner_user_id)
human_deals AS (
  SELECT
    company_id,
    owner_user_id                                                         AS agent_user_id,
    COUNT(*)                                                              AS deals_total,
    COUNT(*) FILTER (WHERE status = 'won')                               AS deals_won,
    COUNT(*) FILTER (WHERE status = 'lost')                              AS deals_lost,
    COUNT(*) FILTER (WHERE status = 'open')                              AS deals_open,
    COALESCE(SUM(amount) FILTER (WHERE status = 'won'),  0)              AS won_amount,
    COALESCE(SUM(amount) FILTER (WHERE status = 'open'), 0)              AS pipeline_amount
  FROM public.deals
  WHERE owner_user_id IS NOT NULL
  GROUP BY company_id, owner_user_id
),

-- Tempo médio de primeira resposta (em minutos)
-- Aproximação: para cada mensagem inbound de contato, pega a
-- menor diferença de tempo para a próxima mensagem outbound
-- do agente na mesma conversa.
response_times AS (
  SELECT
    m_out.company_id,
    m_out.sender_user_id                                                  AS agent_user_id,
    AVG(
      EXTRACT(EPOCH FROM (m_out.created_at - m_in.created_at)) / 60.0
    )                                                                     AS avg_response_min
  FROM public.messages m_in
  JOIN public.messages m_out
    ON  m_out.conversation_id = m_in.conversation_id
    AND m_out.sender_type     = 'user'
    AND m_out.direction       = 'outbound'
    AND m_out.created_at      > m_in.created_at
    AND m_out.sender_user_id  IS NOT NULL
  WHERE m_in.sender_type = 'contact'
    AND m_in.direction   = 'inbound'
  GROUP BY m_out.company_id, m_out.sender_user_id
),

-- União de todos os agentes identificados
all_agents AS (
  SELECT company_id, agent_user_id FROM human_conv
  UNION
  SELECT company_id, agent_user_id FROM human_msg
  UNION
  SELECT company_id, agent_user_id FROM human_deals
)

SELECT
  aa.company_id,
  aa.agent_user_id,
  uc.full_name                                                            AS agent_name,
  uc.email                                                                AS agent_email,
  'human'                                                                 AS agent_type,
  COALESCE(hc.conversations_total,   0)                                  AS conversations_total,
  COALESCE(hc.conversations_closed,  0)                                  AS conversations_closed,
  COALESCE(hc.conversations_open,    0)                                  AS conversations_open,
  COALESCE(hm.messages_sent,         0)                                  AS messages_sent,
  COALESCE(hm.messages_received_in_conv, 0)                              AS messages_received,
  COALESCE(hd.deals_total,           0)                                  AS deals_total,
  COALESCE(hd.deals_won,             0)                                  AS deals_won,
  COALESCE(hd.deals_lost,            0)                                  AS deals_lost,
  COALESCE(hd.deals_open,            0)                                  AS deals_open,
  COALESCE(hd.won_amount,            0)                                  AS won_amount,
  COALESCE(hd.pipeline_amount,       0)                                  AS pipeline_amount,
  CASE
    WHEN COALESCE(hd.deals_total, 0) > 0
    THEN ROUND(hd.deals_won::numeric / hd.deals_total * 100, 1)
  END                                                                     AS win_rate_pct,
  ROUND(rt.avg_response_min::numeric, 1)                                 AS avg_first_response_min
FROM all_agents aa
LEFT JOIN human_conv   hc ON hc.company_id = aa.company_id AND hc.agent_user_id = aa.agent_user_id
LEFT JOIN human_msg    hm ON hm.company_id = aa.company_id AND hm.agent_user_id = aa.agent_user_id
LEFT JOIN human_deals  hd ON hd.company_id = aa.company_id AND hd.agent_user_id = aa.agent_user_id
LEFT JOIN response_times rt ON rt.company_id = aa.company_id AND rt.agent_user_id = aa.agent_user_id
LEFT JOIN public.v_users_canonical uc ON uc.user_id = aa.agent_user_id;

COMMENT ON VIEW public.v_agent_performance IS
  'Performance de agentes humanos por empresa. '
  'avg_first_response_min: tempo médio entre mensagem inbound do contato e '
  'primeira resposta outbound do agente (aproximação por turno). '
  'win_rate_pct = deals_won / deals_total × 100. '
  'Para agentes de IA, ver sugestão Etapa 3 (v_ai_agent_performance).';


-- ============================================================
-- BLOCO 6: VIEW v_cohort_retention
-- ------------------------------------------------------------
-- Objetivo : análise de coorte de contatos por mês de criação,
--            rastreando atividade, conversão para deal e
--            conversão para cliente (deal ganho).
-- Fontes   : contacts, messages, deals, contact_events
-- Critério de coorte     : date_trunc('month', contacts.created_at)
-- Critério de atividade  : mensagem (inbound/outbound), deal
--                          criado, ou contact_event registrado
--                          no mês em questão.
-- Critério de conversão  : contato com ao menos 1 deal (any)
-- Critério de cliente    : contato com ao menos 1 deal won
-- Granularidade          : mensal (M+0, M+1, M+2, M+3, M+6, M+12)
-- ============================================================

CREATE OR REPLACE VIEW public.v_cohort_retention AS
WITH

-- Coorte de cada contato = mês de criação
contacts_cohort AS (
  SELECT
    id           AS contact_id,
    company_id,
    date_trunc('month', created_at)::date AS cohort_month
  FROM public.contacts
),

-- Atividade por contato e por mês
-- Definição: qualquer interação registrada (mensagem, deal, evento)
activity_months AS (
  SELECT DISTINCT
    contact_id,
    company_id,
    date_trunc('month', created_at)::date AS activity_month
  FROM public.messages
  WHERE contact_id IS NOT NULL

  UNION

  SELECT DISTINCT
    contact_id,
    company_id,
    date_trunc('month', created_at)::date AS activity_month
  FROM public.deals
  WHERE contact_id IS NOT NULL

  UNION

  SELECT DISTINCT
    contact_id,
    company_id,
    date_trunc('month', occurred_at)::date AS activity_month
  FROM public.contact_events
  WHERE contact_id IS NOT NULL
),

-- Meses decorridos entre cohort e atividade
cohort_activity AS (
  SELECT
    cc.company_id,
    cc.cohort_month,
    cc.contact_id,
    am.activity_month,
    (
      EXTRACT(YEAR  FROM AGE(am.activity_month::date, cc.cohort_month::date)) * 12 +
      EXTRACT(MONTH FROM AGE(am.activity_month::date, cc.cohort_month::date))
    )::integer AS months_after_cohort
  FROM contacts_cohort cc
  JOIN activity_months am
    ON  am.contact_id  = cc.contact_id
    AND am.company_id  = cc.company_id
    AND am.activity_month >= cc.cohort_month
),

-- Conversão: contato com ao menos 1 deal
contacts_with_deal AS (
  SELECT DISTINCT contact_id, company_id
  FROM public.deals
  WHERE contact_id IS NOT NULL
),

-- Conversão: contato com ao menos 1 deal ganho
contacts_won AS (
  SELECT DISTINCT contact_id, company_id
  FROM public.deals
  WHERE contact_id IS NOT NULL
    AND status = 'won'
)

SELECT
  cc.company_id,
  c.name                                                      AS company_name,
  cc.cohort_month,
  COUNT(DISTINCT cc.contact_id)                               AS cohort_size,

  -- Atividade por mês relativo
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 0)  AS active_m0,
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 1)  AS active_m1,
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 2)  AS active_m2,
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 3)  AS active_m3,
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 6)  AS active_m6,
  COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 12) AS active_m12,

  -- Taxas de retenção percentual
  CASE WHEN COUNT(DISTINCT cc.contact_id) > 0 THEN
    ROUND(COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 1)::numeric
      / COUNT(DISTINCT cc.contact_id) * 100, 1)
  END AS retention_m1_pct,
  CASE WHEN COUNT(DISTINCT cc.contact_id) > 0 THEN
    ROUND(COUNT(DISTINCT ca.contact_id) FILTER (WHERE ca.months_after_cohort = 3)::numeric
      / COUNT(DISTINCT cc.contact_id) * 100, 1)
  END AS retention_m3_pct,

  -- Conversão para deal e para cliente
  COUNT(DISTINCT cwd.contact_id) FILTER (WHERE cwd.contact_id IS NOT NULL) AS contacts_with_deal,
  COUNT(DISTINCT cw.contact_id)  FILTER (WHERE cw.contact_id  IS NOT NULL) AS contacts_won,

  -- Taxas de conversão percentual
  CASE WHEN COUNT(DISTINCT cc.contact_id) > 0 THEN
    ROUND(COUNT(DISTINCT cwd.contact_id) FILTER (WHERE cwd.contact_id IS NOT NULL)::numeric
      / COUNT(DISTINCT cc.contact_id) * 100, 1)
  END AS deal_conversion_pct,
  CASE WHEN COUNT(DISTINCT cc.contact_id) > 0 THEN
    ROUND(COUNT(DISTINCT cw.contact_id) FILTER (WHERE cw.contact_id IS NOT NULL)::numeric
      / COUNT(DISTINCT cc.contact_id) * 100, 1)
  END AS customer_conversion_pct

FROM contacts_cohort cc
JOIN  public.companies c ON c.id = cc.company_id
LEFT JOIN cohort_activity     ca  ON ca.contact_id  = cc.contact_id AND ca.company_id = cc.company_id
LEFT JOIN contacts_with_deal  cwd ON cwd.contact_id = cc.contact_id AND cwd.company_id = cc.company_id
LEFT JOIN contacts_won        cw  ON cw.contact_id  = cc.contact_id AND cw.company_id  = cc.company_id
GROUP BY cc.company_id, c.name, cc.cohort_month
ORDER BY cc.company_id, cc.cohort_month;

COMMENT ON VIEW public.v_cohort_retention IS
  'Coorte mensal de contatos. '
  'active_m0 = atividade no próprio mês de aquisição. '
  'Atividade = mensagem, deal ou contact_event registrado no mês. '
  'contacts_won = contato com ao menos 1 deal won (qualquer período). '
  'Para cohorts do mês corrente, métricas M+1 e posteriores serão 0 por design.';


-- ============================================================
-- BLOCO 7: ATUALIZAÇÃO DAS VIEWS CANÔNICAS
-- ------------------------------------------------------------
-- v_users_canonical     — user_profiles como fonte primária,
--                         email/is_active agora vindos da própria
--                         tabela (após backfill do Bloco 3).
-- v_memberships_canonical — company_memberships como fonte
--                           primária após backfill do Bloco 4.
-- ============================================================

CREATE OR REPLACE VIEW public.v_users_canonical AS
SELECT
  up.id                                                         AS user_id,
  up.full_name,
  -- email agora disponível diretamente em user_profiles (Bloco 3)
  COALESCE(up.email, p.email)                                   AS email,
  up.system_role::text                                          AS system_role,
  COALESCE(p.platform_role::text, up.system_role::text)         AS platform_role,
  COALESCE(up.is_active, COALESCE(p.is_active, true))           AS is_active,
  up.avatar_url,
  up.instance_whatsapp,
  up.connected,
  up.last_connected,
  up.created_at,
  up.updated_at,
  CASE
    WHEN p.user_id IS NOT NULL THEN 'both'
    ELSE 'user_profiles_only'
  END                                                           AS data_source
FROM public.user_profiles up
LEFT JOIN public.profiles p ON p.user_id = up.id;

COMMENT ON VIEW public.v_users_canonical IS
  'Fonte canônica de usuários. '
  'user_profiles é a tabela primária. '
  'profiles permanece como legado compatível até Etapa 3. '
  'email e is_active agora residem em user_profiles (Etapa 2).';


CREATE OR REPLACE VIEW public.v_memberships_canonical AS
SELECT
  COALESCE(cm.user_id,    uc.user_id)     AS user_id,
  COALESCE(cm.company_id, uc.company_id)  AS company_id,
  COALESCE(cm.role, uc.role_in_company::text::public.company_role_enum) AS role,
  COALESCE(cm.status::text, 'active')     AS status,
  -- team_id: company_memberships tem precedência
  COALESCE(cm.team_id, uc.team_id)        AS team_id,
  cm.joined_at,
  COALESCE(cm.created_at, uc.created_at)  AS created_at,
  CASE
    WHEN cm.user_id IS NOT NULL AND uc.user_id IS NOT NULL THEN 'both'
    WHEN cm.user_id IS NOT NULL                           THEN 'cm_only'
    ELSE 'uc_only'
  END                                     AS data_source
FROM public.company_memberships cm
FULL OUTER JOIN public.user_companies uc
  ON uc.user_id    = cm.user_id
 AND uc.company_id = cm.company_id;

COMMENT ON VIEW public.v_memberships_canonical IS
  'Fonte canônica de vínculos usuário-empresa. '
  'company_memberships é a fonte primária após backfill da Etapa 2. '
  'user_companies permanece como legado compatível até Etapa 3. '
  'Após validação, user_companies pode ser marcada como deprecated.';


-- ============================================================
-- SANITY CHECKS
-- ============================================================
-- Rodar após aplicação para validar consistência:

-- SC-1: Trigger funcionando — simule manualmente ou verifique estrutura
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'deals'
  AND trigger_name = 'trg_deal_stage_history';

-- SC-2: Snapshot populado para hoje
SELECT
  c.name,
  s.snapshot_date,
  s.new_contacts,
  s.new_conversations,
  s.open_conversations,
  s.open_pipeline_amount,
  s.computed_at
FROM public.kpi_company_daily_snapshots s
JOIN public.companies c ON c.id = s.company_id
WHERE s.snapshot_date = CURRENT_DATE
ORDER BY c.name;

-- SC-3: user_profiles com email preenchido (deve incluir todos os auth users)
SELECT
  id,
  full_name,
  email,
  system_role::text,
  is_active
FROM public.user_profiles
ORDER BY created_at;

-- SC-4: Memberships — não deve restar nenhum uc_only após backfill
SELECT data_source, COUNT(*) AS total
FROM public.v_memberships_canonical
GROUP BY data_source
ORDER BY data_source;

-- SC-5: v_agent_performance com dados
SELECT
  company_id,
  agent_name,
  conversations_total,
  messages_sent,
  deals_total,
  deals_won,
  win_rate_pct,
  avg_first_response_min
FROM public.v_agent_performance
ORDER BY company_id, conversations_total DESC;

-- SC-6: v_cohort_retention com dados
SELECT
  company_name,
  cohort_month,
  cohort_size,
  active_m0,
  active_m1,
  contacts_with_deal,
  contacts_won,
  deal_conversion_pct,
  customer_conversion_pct
FROM public.v_cohort_retention
ORDER BY company_name, cohort_month;

-- SC-7: Histórico de deals (deal_stage_history) — contar registros
SELECT COUNT(*) AS total_history_records FROM public.deal_stage_history;
