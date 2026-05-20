export interface StepDraft {
  _key: string;
  name: string;
  action_type: 'whatsapp_message' | 'create_task' | 'notify_user';
  relative_to: string;
  offset_minutes: number;
  message_text: string;
  requires_approval: boolean;
  is_active: boolean;
}

function makeKey(): string {
  return `step-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeSuggestedSteps(): StepDraft[] {
  return [
    {
      _key: makeKey(),
      name: 'Lembrete 1 dia antes',
      action_type: 'whatsapp_message',
      relative_to: 'appointment_start_at',
      offset_minutes: -1440,
      message_text: 'Olá {{contact.name}}, tudo bem? Passando para lembrar da sua consulta amanhã às {{appointment.time}}. Qualquer dúvida, estamos à disposição!',
      requires_approval: false,
      is_active: true,
    },
    {
      _key: makeKey(),
      name: 'Lembrete no dia da consulta',
      action_type: 'whatsapp_message',
      relative_to: 'appointment_start_at',
      offset_minutes: -480,
      message_text: 'Bom dia, {{contact.name}}! Sua consulta está confirmada para hoje às {{appointment.time}}. Até logo!',
      requires_approval: false,
      is_active: true,
    },
    {
      _key: makeKey(),
      name: 'Lembrete 2 horas antes',
      action_type: 'whatsapp_message',
      relative_to: 'appointment_start_at',
      offset_minutes: -120,
      message_text: 'Olá {{contact.name}}, em 2 horas você tem consulta às {{appointment.time}}. Lembre-se de chegar com 10 minutos de antecedência.',
      requires_approval: false,
      is_active: true,
    },
  ];
}

export function makeEmptyStep(): StepDraft {
  return {
    _key: makeKey(),
    name: '',
    action_type: 'whatsapp_message',
    relative_to: 'appointment_start_at',
    offset_minutes: -1440,
    message_text: '',
    requires_approval: false,
    is_active: true,
  };
}
