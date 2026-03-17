-- Cria 2 conversas para testar isolamento RLS: Beatriz e Joana
-- Cada usuária deve ver apenas sua própria conversa ao fazer login

-- Contatos já criados: 98bc2dd6 (Cliente Teste Beatriz), 79608b4c (Cliente Teste Joana)
-- Beatriz: 4428a91a-763b-4bd9-9ed7-e513c57eb493
-- Joana: 098ed2cf-03ba-4bd8-9080-a0185fae04f9
-- OrtoATM: f5de34df-432f-4c67-a879-542278a86bf1

INSERT INTO public.conversations (
  company_id,
  contact_id,
  assigned_to,
  status,
  subject,
  last_message_preview,
  first_message_at,
  last_message_at
) VALUES 
  (
    'f5de34df-432f-4c67-a879-542278a86bf1',
    '98bc2dd6-b248-4751-8520-224b401efa4c',
    '4428a91a-763b-4bd9-9ed7-e513c57eb493',
    'open',
    'Conversa exclusiva da Beatriz',
    'Visível apenas para Beatriz.',
    now(),
    now()
  ),
  (
    'f5de34df-432f-4c67-a879-542278a86bf1',
    '79608b4c-dcb4-4d07-812e-74135638b005',
    '098ed2cf-03ba-4bd8-9080-a0185fae04f9',
    'open',
    'Conversa exclusiva da Joana',
    'Visível apenas para Joana.',
    now(),
    now()
  )
;
