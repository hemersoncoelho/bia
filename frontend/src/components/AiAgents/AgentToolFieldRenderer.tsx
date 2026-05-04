import React from 'react';
import { cn } from '../../lib/utils';
import type { ToolFieldDef } from '../../types';

const inputCls =
  'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-primary ' +
  'placeholder-stone-600 outline-none focus:border-stone-500 focus:ring-1 ' +
  'focus:ring-stone-500/30 transition-all';

interface FieldRendererProps {
  field: ToolFieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  error?: string;
}

const ToggleField: React.FC<{
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ id, checked, onChange }) => (
  <label htmlFor={id} className="relative inline-flex items-center cursor-pointer shrink-0">
    <input
      id={id}
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <div
      className={cn(
        'w-9 h-5 rounded-full transition-colors',
        "after:content-[''] after:absolute after:top-0.5 after:left-0.5",
        'after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all',
        'peer-checked:after:translate-x-4',
        checked ? 'bg-indigo-600' : 'bg-stone-700'
      )}
    />
  </label>
);

export const AgentToolFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  error,
}) => {
  const labelCls = 'block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1';
  const descCls = 'text-[11px] text-stone-600 mt-0.5 leading-relaxed';
  const errCls = 'text-[11px] text-red-400 mt-1';

  const resolvedValue = value !== undefined ? value : field.default;

  if (field.type === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-3 p-3 bg-surface border border-border rounded-lg">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-300">{field.label}</p>
          {field.description && <p className={descCls}>{field.description}</p>}
          {error && <p className={errCls}>{error}</p>}
        </div>
        <ToggleField
          id={`field-${field.key}`}
          checked={Boolean(resolvedValue)}
          onChange={(v) => onChange(field.key, v)}
        />
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label htmlFor={`field-${field.key}`} className={labelCls}>
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.description && <p className={descCls}>{field.description}</p>}
        <textarea
          id={`field-${field.key}`}
          className={cn(inputCls, 'resize-none font-mono text-xs leading-relaxed mt-1.5')}
          rows={field.rows ?? 3}
          placeholder={field.placeholder ?? ''}
          value={typeof resolvedValue === 'string' ? resolvedValue : ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {error && <p className={errCls}>{error}</p>}
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label htmlFor={`field-${field.key}`} className={labelCls}>
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.description && <p className={descCls}>{field.description}</p>}
        <input
          id={`field-${field.key}`}
          type="number"
          className={cn(inputCls, 'mt-1.5')}
          placeholder={field.placeholder ?? String(field.default ?? '')}
          value={typeof resolvedValue === 'number' ? resolvedValue : (field.default as number ?? '')}
          min={field.min}
          max={field.max}
          step={field.key.includes('score') ? 0.05 : 1}
          onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
        />
        {field.min !== undefined && field.max !== undefined && (
          <p className="text-[10px] text-stone-600 mt-1">
            Entre {field.min} e {field.max}
          </p>
        )}
        {error && <p className={errCls}>{error}</p>}
      </div>
    );
  }

  if (field.type === 'select') {
    const opts = field.options ?? [];
    return (
      <div>
        <label htmlFor={`field-${field.key}`} className={labelCls}>
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.description && <p className={descCls}>{field.description}</p>}
        <select
          id={`field-${field.key}`}
          className={cn(inputCls, 'mt-1.5')}
          value={typeof resolvedValue === 'string' || typeof resolvedValue === 'number'
            ? String(resolvedValue)
            : ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value="">Selecione...</option>
          {opts.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className={errCls}>{error}</p>}
      </div>
    );
  }

  if (field.type === 'multiselect') {
    const opts = field.options ?? [];
    const selected: string[] = Array.isArray(resolvedValue)
      ? (resolvedValue as unknown[]).map(String)
      : [];
    const toggle = (v: string) => {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
      onChange(field.key, next);
    };
    return (
      <div>
        <span className={labelCls}>
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </span>
        {field.description && <p className={descCls}>{field.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {opts.map((opt) => {
            const active = selected.includes(String(opt.value));
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => toggle(String(opt.value))}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  active
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-surface border-border text-stone-500 hover:border-stone-500'
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {error && <p className={errCls}>{error}</p>}
      </div>
    );
  }

  // fallback: text
  return (
    <div>
      <label htmlFor={`field-${field.key}`} className={labelCls}>
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {field.description && <p className={descCls}>{field.description}</p>}
      <input
        id={`field-${field.key}`}
        type="text"
        className={cn(inputCls, 'mt-1.5')}
        placeholder={field.placeholder ?? ''}
        value={typeof resolvedValue === 'string' ? resolvedValue : ''}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
      {error && <p className={errCls}>{error}</p>}
    </div>
  );
};
