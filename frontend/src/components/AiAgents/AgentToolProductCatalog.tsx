import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  DollarSign,
  Package,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import type { ProductCatalogItem } from '../../types';

// ── Tipos do formulário (módulo scope — OXC) ──────────────────

type ServiceTypeOption = {
  id: string;
  name: string;
  duration_minutes: number;
};

type FormState = {
  name: string;
  description: string;
  duration_minutes: string;
  price: string;
  is_active: boolean;
  service_type_id: string; // '' = sem vínculo
};

type FormErrors = Record<string, string>;

// ── Constantes ────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  duration_minutes: '',
  price: '',
  is_active: true,
  service_type_id: '',
};

// ── Helpers ───────────────────────────────────────────────────

function formatDuration(mins: number | null | undefined): string {
  if (mins == null) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '';
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Toggle inline ─────────────────────────────────────────────

interface InlineToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

const InlineToggle: React.FC<InlineToggleProps> = ({ checked, onChange, label }) => (
  <label className="relative inline-flex items-center gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <div
      className={cn(
        'w-9 h-5 rounded-full transition-colors shrink-0',
        "after:content-[''] after:absolute after:top-0.5 after:left-0.5",
        'after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all',
        'peer-checked:after:translate-x-4',
        checked ? 'bg-indigo-600' : 'bg-stone-700'
      )}
    />
    <span className="text-[11px] text-stone-400">{label}</span>
  </label>
);

// ── Componente principal ──────────────────────────────────────

interface AgentToolProductCatalogProps {
  companyId: string;
  onCountChange: (activeCount: number) => void;
}

export const AgentToolProductCatalog: React.FC<AgentToolProductCatalogProps> = ({
  companyId,
  onCountChange,
}) => {
  const [items, setItems] = useState<ProductCatalogItem[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 'new' ou id
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Ref estável para o callback — evita loop de re-fetch infinito
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  });

  const notifyCount = useCallback((list: ProductCatalogItem[]) => {
    onCountChangeRef.current(list.filter((i) => i.is_active).length);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setSaveError(null);

    const { data, error } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setSaveError('Erro ao carregar catálogo.');
      setLoading(false);
      return;
    }

    const list = (data ?? []) as ProductCatalogItem[];
    setItems(list);
    notifyCount(list);
    setLoading(false);
  }, [companyId, notifyCount]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Busca service_types ativos para o select de vínculo
  useEffect(() => {
    supabase
      .from('service_types')
      .select('id, name, duration_minutes')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setServiceTypes((data ?? []) as ServiceTypeOption[]);
      });
  }, [companyId]);

  // ── Helpers do formulário ──────────────────────────────────

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setErrors({});
    setSaveError(null);
  };

  const openEdit = (item: ProductCatalogItem) => {
    setEditing(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      duration_minutes: item.duration_minutes != null ? String(item.duration_minutes) : '',
      price: item.price != null ? String(item.price) : '',
      is_active: item.is_active,
      service_type_id: item.service_type_id ?? '',
    });
    setErrors({});
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSaveError(null);
  };

  const setField = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.name.trim()) {
      errs.name = 'Nome é obrigatório.';
    }
    if (
      form.duration_minutes !== '' &&
      (isNaN(Number(form.duration_minutes)) || Number(form.duration_minutes) <= 0)
    ) {
      errs.duration_minutes = 'Informe um número positivo de minutos.';
    }
    if (
      form.price !== '' &&
      (isNaN(Number(form.price)) || Number(form.price) < 0)
    ) {
      errs.price = 'Informe um valor válido (≥ 0).';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: form.duration_minutes !== '' ? Number(form.duration_minutes) : null,
      price: form.price !== '' ? Number(form.price) : null,
      is_active: form.is_active,
      service_type_id: form.service_type_id || null,
    };

    let newItems: ProductCatalogItem[];

    if (editing === 'new') {
      const { data, error } = await supabase
        .from('product_catalog')
        .insert(payload)
        .select()
        .single();

      if (error || !data) {
        setSaveError(error?.message ?? 'Erro ao salvar item.');
        setSaving(false);
        return;
      }
      newItems = [...items, data as ProductCatalogItem];
    } else {
      const { data, error } = await supabase
        .from('product_catalog')
        .update(payload)
        .eq('id', editing!)
        .eq('company_id', companyId)
        .select()
        .single();

      if (error || !data) {
        setSaveError(error?.message ?? 'Erro ao atualizar item.');
        setSaving(false);
        return;
      }
      newItems = items.map((i) => (i.id === editing ? (data as ProductCatalogItem) : i));
    }

    setItems(newItems);
    notifyCount(newItems);
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaving(false);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Remover este item do catálogo?')) return;
    setDeleting(itemId);

    const { error } = await supabase
      .from('product_catalog')
      .delete()
      .eq('id', itemId)
      .eq('company_id', companyId);

    if (!error) {
      const newItems = items.filter((i) => i.id !== itemId);
      setItems(newItems);
      notifyCount(newItems);
    }
    setDeleting(null);
  };

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-stone-500">
        <Loader2 size={13} className="animate-spin shrink-0" />
        <span className="text-xs">Carregando catálogo…</span>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Erro global */}
      {saveError && !editing && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertCircle size={12} className="shrink-0" />
          {saveError}
        </div>
      )}

      {/* Lista */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const linkedSt = item.service_type_id
              ? serviceTypes.find((s) => s.id === item.service_type_id)
              : null;

            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border bg-surface',
                  item.is_active ? 'border-border' : 'border-border opacity-55'
                )}
              >
                <span className="text-base leading-none select-none mt-0.5 shrink-0">
                  {item.price != null ? '💼' : '📦'}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-primary">{item.name}</span>
                    {!item.is_active && (
                      <span className="text-[10px] text-stone-500 bg-stone-800 border border-stone-700 rounded px-1.5 py-0">
                        Inativo
                      </span>
                    )}
                    {item.service_type_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0">
                        <Calendar size={9} />
                        Agendável
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {linkedSt && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400">
                        <Clock size={10} />
                        {formatDuration(linkedSt.duration_minutes)}
                        {' · '}
                        {linkedSt.name}
                      </span>
                    )}
                    {!linkedSt && item.duration_minutes != null && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
                        <Clock size={10} />
                        {formatDuration(item.duration_minutes)}
                      </span>
                    )}
                    {item.price != null && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <DollarSign size={10} />
                        {formatPrice(item.price)}
                      </span>
                    )}
                    {!linkedSt && item.duration_minutes == null && item.price == null && (
                      <span className="text-[10px] text-stone-600 italic">
                        Sem duração ou valor definidos
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    title="Editar"
                    className="p-1.5 text-stone-500 hover:text-primary hover:bg-stone-700/50 rounded transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    title="Remover"
                    className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  >
                    {deleting === item.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Estado vazio */}
      {items.length === 0 && !editing && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Package size={22} className="text-stone-600" />
          <p className="text-xs text-stone-500">Nenhum item cadastrado ainda.</p>
          <p className="text-[11px] text-stone-600 leading-relaxed max-w-[220px]">
            Adicione produtos ou serviços que o agente poderá consultar durante a conversa.
          </p>
        </div>
      )}

      {/* Formulário inline */}
      {editing && (
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 space-y-3">
          <p className="text-xs font-semibold text-teal-400">
            {editing === 'new' ? 'Novo produto/serviço' : 'Editar item'}
          </p>

          {/* Erro de save */}
          {saveError && (
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
              <AlertCircle size={11} className="shrink-0" />
              {saveError}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="text-[11px] text-stone-400 block mb-1">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Ex: Consultoria, Plano Premium, Corte de cabelo…"
              className={cn(
                'w-full px-3 py-2 text-sm bg-background border rounded-lg text-primary',
                'placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-teal-500',
                errors.name ? 'border-red-500' : 'border-border'
              )}
            />
            {errors.name && (
              <p className="text-[10px] text-red-400 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Descrição */}
          <div>
            <label className="text-[11px] text-stone-400 block mb-1">
              Descrição <span className="text-stone-600">(opcional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Descreva o produto ou serviço para o agente usar como contexto…"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-primary placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
            />
          </div>

          {/* Vínculo com agenda */}
          <div>
            <label className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
              <Calendar size={10} />
              Serviço da Agenda <span className="text-stone-600">(opcional)</span>
            </label>
            {serviceTypes.length > 0 ? (
              <>
                <select
                  value={form.service_type_id}
                  onChange={(e) => setField('service_type_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-primary focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Sem vínculo — apenas informativo</option>
                  {serviceTypes.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({formatDuration(st.duration_minutes)})
                    </option>
                  ))}
                </select>
                {form.service_type_id && (
                  <p className="text-[10px] text-indigo-400 mt-1 leading-relaxed">
                    O agente usará este serviço para verificar disponibilidade e criar agendamentos.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Nenhum serviço de agenda configurado. Cadastre em{' '}
                <a
                  href="/agenda/configuracoes"
                  className="text-indigo-400 hover:underline"
                >
                  Configurações da Agenda
                </a>{' '}
                para habilitar agendamentos.
              </p>
            )}
          </div>

          {/* Duração + Valor lado a lado */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                <Clock size={10} />
                Duração (min) <span className="text-stone-600">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setField('duration_minutes', e.target.value)}
                placeholder="Ex: 60"
                min={1}
                className={cn(
                  'w-full px-3 py-2 text-sm bg-background border rounded-lg text-primary',
                  'placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-teal-500',
                  errors.duration_minutes ? 'border-red-500' : 'border-border'
                )}
              />
              {errors.duration_minutes && (
                <p className="text-[10px] text-red-400 mt-1">{errors.duration_minutes}</p>
              )}
            </div>

            <div>
              <label className="text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                <DollarSign size={10} />
                Valor (R$) <span className="text-stone-600">(opcional)</span>
              </label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                placeholder="Ex: 150.00"
                min={0}
                step={0.01}
                className={cn(
                  'w-full px-3 py-2 text-sm bg-background border rounded-lg text-primary',
                  'placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-teal-500',
                  errors.price ? 'border-red-500' : 'border-border'
                )}
              />
              {errors.price && (
                <p className="text-[10px] text-red-400 mt-1">{errors.price}</p>
              )}
            </div>
          </div>

          {/* Toggle ativo */}
          <InlineToggle
            checked={form.is_active}
            onChange={(v) => setField('is_active', v)}
            label="Item ativo"
          />

          {/* Ações */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="flex-1 text-xs px-3 py-2 border border-border rounded-lg text-stone-400 hover:text-primary hover:bg-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-white text-black font-semibold rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Botão adicionar */}
      {!editing && (
        <button
          type="button"
          onClick={openNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-stone-700 rounded-lg text-xs text-stone-500 hover:text-primary hover:border-stone-500 hover:bg-surface transition-colors"
        >
          <Plus size={13} />
          Adicionar produto/serviço
        </button>
      )}
    </div>
  );
};
