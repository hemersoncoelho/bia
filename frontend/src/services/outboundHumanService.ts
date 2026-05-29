const OUTBOUND_HUMAN_WEBHOOK_URL =
  import.meta.env.VITE_N8N_OUTBOUND_HUMAN_WEBHOOK_URL ??
  'https://n8n.solucoesai.tech/webhook/sia-one-outbound-human';

type WebhookResponse = Record<string, unknown> | string | null;

export interface OutboundHumanPayload {
  phone: string;
  body: string;
  company_id: string;
  conversation_id: string;
  sender_name?: string | null;
  sender_id?: string | null;
  message_id?: string | number | null;
  existing_message_id?: string | number | null;
  should_persist_message?: boolean;
}

export interface OutboundHumanResult {
  success: boolean;
  error?: string;
  response?: WebhookResponse;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const getWebhookError = (data: WebhookResponse): string | undefined => {
  if (!isRecord(data)) return undefined;

  return (
    getString(data.error) ??
    getString(data.message) ??
    getString(data.reason)
  );
};

const parseWebhookResponse = async (response: Response): Promise<WebhookResponse> => {
  const raw = await response.text();
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw) as WebhookResponse;
  } catch {
    return raw;
  }
};

const isExplicitSuccess = (data: WebhookResponse): boolean => {
  if (!isRecord(data)) return false;

  const status = getString(data.status)?.toLowerCase();

  return (
    data.ok === true ||
    data.success === true ||
    data.sent === true ||
    data.dispatched === true ||
    status === 'ok' ||
    status === 'success' ||
    status === 'sent' ||
    status === 'delivered'
  );
};

const isExplicitFailure = (data: WebhookResponse): boolean => {
  if (!isRecord(data)) return false;

  const status = getString(data.status)?.toLowerCase();
  const hasFailureFlag =
    data.ok === false ||
    data.success === false ||
    data.sent === false ||
    data.dispatched === false ||
    status === 'error' ||
    status === 'failed';

  return hasFailureFlag || (!!data.error && !isExplicitSuccess(data));
};

export const dispatchHumanWhatsAppMessage = async (
  payload: OutboundHumanPayload
): Promise<OutboundHumanResult> => {
  try {
    const response = await fetch(OUTBOUND_HUMAN_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await parseWebhookResponse(response);

    if (!response.ok || isExplicitFailure(data)) {
      return {
        success: false,
        error:
          getWebhookError(data) ??
          (response.ok
            ? 'Falha ao enviar no WhatsApp.'
            : `Webhook n8n retornou HTTP ${response.status}.`),
        response: data,
      };
    }

    return { success: true, response: data };
  } catch (err) {
    console.error('[outbound-human n8n]', err);
    return { success: false, error: 'Erro de rede ao enviar mensagem.' };
  }
};
