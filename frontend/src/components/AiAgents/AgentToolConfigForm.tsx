import React, { useState, useEffect } from 'react';
import { Save, Loader2, Settings2 } from 'lucide-react';
import { AgentToolFieldRenderer } from './AgentToolFieldRenderer';
import type { AgentTool, ToolFieldDef } from '../../types';

const getFields = (tool: AgentTool): ToolFieldDef[] => {
  const raw = tool.config_schema.fields;
  return Array.isArray(raw) ? (raw as ToolFieldDef[]) : [];
};

const buildDefaults = (fields: ToolFieldDef[], existing: Record<string, unknown>) => {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    result[f.key] = existing[f.key] !== undefined ? existing[f.key] : (f.default ?? '');
  }
  return result;
};

const validateFields = (
  fields: ToolFieldDef[],
  values: Record<string, unknown>
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.required) {
      const v = values[f.key];
      if (v === undefined || v === null || v === '') {
        errors[f.key] = 'Campo obrigatório.';
      }
    }
  }
  return errors;
};

interface AgentToolConfigFormProps {
  tool: AgentTool;
  onSave: (config: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}

export const AgentToolConfigForm: React.FC<AgentToolConfigFormProps> = ({
  tool,
  onSave,
  saving,
}) => {
  const fields = getFields(tool);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildDefaults(fields, tool.config)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Sincroniza com config vinda do servidor ao trocar de tool
  useEffect(() => {
    setValues(buildDefaults(getFields(tool), tool.config));
    setErrors({});
    setDirty(false);
  }, [tool.slug, tool.config]);

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    const validationErrors = validateFields(fields, values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await onSave(values);
    setDirty(false);
  };

  if (fields.length === 0) {
    return (
      <div className="flex items-start gap-2 p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-lg">
        <Settings2 size={13} className="text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-indigo-400">Configuração dinâmica</p>
          <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
            Esta ferramenta não possui campos configuráveis além das dependências.
            Os campos dinâmicos serão carregados do catálogo quando disponíveis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <AgentToolFieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={handleChange}
          error={errors[field.key]}
        />
      ))}

      <div className="pt-2 flex items-center justify-between gap-3">
        {dirty && (
          <p className="text-[11px] text-amber-400">Alterações não salvas</p>
        )}
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  );
};
