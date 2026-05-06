import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
  ChevronUp,
  ChevronDown,
  Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

// ── Types ──────────────────────────────────────────────────

interface StageRow {
  id: string;
  name: string;
  position: number;
  color: string;
  win_probability: number;
  isNew?: boolean;
}

interface PipelineSettingsDrawerProps {
  pipelineId: string;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}

// ── Palette de cores predefinida ───────────────────────────

const COLOR_PALETTE = [
  '#6B7280', // cinza
  '#3B82F6', // azul
  '#8B5CF6', // violeta
  '#EC4899', // rosa
  '#F59E0B', // âmbar
  '#10B981', // verde
  '#EF4444', // vermelho
  '#06B6D4', // ciano
  '#F97316', // laranja
  '#84CC16', // lima
];

// ── Component ──────────────────────────────────────────────

export const PipelineSettingsDrawer: React.FC<PipelineSettingsDrawerProps> = ({
  pipelineId,
  companyId: _companyId,
  onClose,
  onSaved,
}) => {
  const [pipelineName, setPipelineName] = useState('');
  const [stages, setStages] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Edição inline de nome de etapa
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Seletor de cor
  const [colorPickerStageId, setColorPickerStageId] = useState<string | null>(null);

  // ── Fechar com ESC ───────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Foco no input de edição ───────────────────────────────

  useEffect(() => {
    if (editingStageId) editInputRef.current?.focus();
  }, [editingStageId]);

  // ── Fechar seletor de cor ao clicar fora ────────────────

  useEffect(() => {
    if (!colorPickerStageId) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById(`color-picker-${colorPickerStageId}`);
      if (el && !el.contains(e.target as Node)) setColorPickerStageId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerStageId]);

  // ── Carregar dados ────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: pl, error: plErr } = await supabase
        .from('pipelines')
        .select('name')
        .eq('id', pipelineId)
        .single();
      if (plErr) throw plErr;
      setPipelineName(pl?.name ?? '');

      const { data: stagesData, error: stErr } = await supabase
        .from('pipeline_stages')
        .select('id, name, position, color, win_probability')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true });
      if (stErr) throw stErr;
      setStages(
        (stagesData ?? []).map(s => ({
          ...s,
          color: s.color ?? '#6B7280',
          win_probability: s.win_probability ?? 0,
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Toast helper ─────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Salvar nome do pipeline ───────────────────────────────

  const savePipelineName = async () => {
    if (!pipelineName.trim()) return;
    setSaving(true);
    try {
      const { error: upErr } = await supabase
        .from('pipelines')
        .update({ name: pipelineName.trim(), updated_at: new Date().toISOString() })
        .eq('id', pipelineId);
      if (upErr) throw upErr;
      showToast('Nome do CRM atualizado.');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar nome.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Edição inline de estágio ─────────────────────────────

  const startEditStage = (stage: StageRow) => {
    setEditingStageId(stage.id);
    setEditingName(stage.name);
    setColorPickerStageId(null);
  };

  const commitStageEdit = async () => {
    if (!editingStageId) return;
    const next = editingName.trim();
    if (!next) {
      setEditingStageId(null);
      return;
    }
    const stage = stages.find(s => s.id === editingStageId);
    if (!stage || next === stage.name) {
      setEditingStageId(null);
      return;
    }
    // Optimistic
    setStages(prev => prev.map(s => s.id === editingStageId ? { ...s, name: next } : s));
    setEditingStageId(null);

    if (!stage.isNew) {
      try {
        const { error: upErr } = await supabase
          .from('pipeline_stages')
          .update({ name: next, updated_at: new Date().toISOString() })
          .eq('id', stage.id);
        if (upErr) throw upErr;
        showToast(`Etapa "${next}" atualizada.`);
        onSaved();
      } catch (err: any) {
        // Revert
        setStages(prev => prev.map(s => s.id === editingStageId ? { ...s, name: stage.name } : s));
        showToast(err.message || 'Erro ao renomear etapa.', false);
      }
    }
  };

  // ── Cor do estágio ────────────────────────────────────────

  const changeStageColor = async (stageId: string, color: string) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;
    // Optimistic
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, color } : s));
    setColorPickerStageId(null);

    if (!stage.isNew) {
      try {
        const { error: upErr } = await supabase
          .from('pipeline_stages')
          .update({ color, updated_at: new Date().toISOString() })
          .eq('id', stageId);
        if (upErr) throw upErr;
        showToast('Cor da etapa atualizada.');
        onSaved();
      } catch (err: any) {
        setStages(prev => prev.map(s => s.id === stageId ? { ...s, color: stage.color } : s));
        showToast(err.message || 'Erro ao atualizar cor.', false);
      }
    }
  };

  // ── Reordenação ───────────────────────────────────────────

  const moveStage = async (index: number, direction: 'up' | 'down') => {
    const newStages = [...stages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStages.length) return;

    // Swap
    [newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]];
    // Recompute positions
    const updated = newStages.map((s, i) => ({ ...s, position: i + 1 }));
    setStages(updated);

    // Persist only existing stages
    const toUpdate = updated.filter(s => !s.isNew);
    try {
      await Promise.all(
        toUpdate.map(s =>
          supabase
            .from('pipeline_stages')
            .update({ position: s.position, updated_at: new Date().toISOString() })
            .eq('id', s.id)
        )
      );
      showToast('Ordem das etapas atualizada.');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Erro ao reordenar etapas.', false);
      loadData(); // Revert from server
    }
  };

  // ── Adicionar nova etapa ──────────────────────────────────

  const addStage = () => {
    const newPosition = stages.length + 1;
    const tempId = `new-${Date.now()}`;
    setStages(prev => [
      ...prev,
      {
        id: tempId,
        name: `Nova Etapa ${newPosition}`,
        position: newPosition,
        color: COLOR_PALETTE[newPosition % COLOR_PALETTE.length],
        win_probability: 0,
        isNew: true,
      },
    ]);
    // Start editing the new stage immediately
    setTimeout(() => {
      setEditingStageId(tempId);
      setEditingName(`Nova Etapa ${newPosition}`);
    }, 50);
  };

  // ── Salvar nova etapa no banco ────────────────────────────

  const saveNewStage = async (stage: StageRow) => {
    if (!stage.isNew) return;
    try {
      const { data, error: insErr } = await supabase
        .from('pipeline_stages')
        .insert({
          pipeline_id: pipelineId,
          name: stage.name,
          position: stage.position,
          color: stage.color,
          win_probability: stage.win_probability,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      // Replace temp id with real id
      setStages(prev =>
        prev.map(s =>
          s.id === stage.id
            ? { ...s, id: (data as { id: string }).id, isNew: false }
            : s
        )
      );
      showToast(`Etapa "${stage.name}" criada.`);
      onSaved();
    } catch (err: any) {
      // Remove the temp stage
      setStages(prev => prev.filter(s => s.id !== stage.id));
      showToast(err.message || 'Erro ao criar etapa.', false);
    }
  };

  // Ao sair do modo de edição de uma etapa nova, persistir
  const handleStageEditBlur = async () => {
    const stage = stages.find(s => s.id === editingStageId);
    if (stage?.isNew) {
      const next = editingName.trim();
      if (!next) {
        setStages(prev => prev.filter(s => s.id !== stage.id));
        setEditingStageId(null);
        return;
      }
      setStages(prev => prev.map(s => s.id === stage.id ? { ...s, name: next } : s));
      setEditingStageId(null);
      await saveNewStage({ ...stage, name: next });
    } else {
      await commitStageEdit();
    }
  };

  // ── Deletar etapa ─────────────────────────────────────────

  const deleteStage = async (stage: StageRow) => {
    if (stage.isNew) {
      setStages(prev => prev.filter(s => s.id !== stage.id));
      return;
    }

    // Verificar deals ativos nessa etapa
    const { count, error: countErr } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', stage.id)
      .eq('status', 'open');

    if (countErr) {
      showToast('Erro ao verificar negócios nessa etapa.', false);
      return;
    }

    if ((count ?? 0) > 0) {
      showToast(
        `Etapa "${stage.name}" possui ${count} negócio(s) ativo(s). Mova-os antes de deletar.`,
        false
      );
      return;
    }

    // Optimistic remove
    setStages(prev => prev.filter(s => s.id !== stage.id));

    try {
      const { error: delErr } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', stage.id);
      if (delErr) throw delErr;
      showToast(`Etapa "${stage.name}" removida.`);
      onSaved();
    } catch (err: any) {
      // Revert
      setStages(prev => {
        const exists = prev.find(s => s.id === stage.id);
        if (exists) return prev;
        return [...prev, stage].sort((a, b) => a.position - b.position);
      });
      showToast(err.message || 'Erro ao deletar etapa.', false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[440px] bg-surface border-l border-border z-50 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-text-main">Configurar CRM</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">Jornada do Cliente</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text-main transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 shrink-0">
            <AlertCircle size={12} className="shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-border"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) transparent' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-stone-500" />
            </div>
          ) : (
            <>
              {/* ── Nome do Pipeline ── */}
              <div className="p-5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600 mb-3">
                  Nome do CRM
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={pipelineName}
                    onChange={e => setPipelineName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); savePipelineName(); }
                    }}
                    placeholder="Ex: Pipeline Comercial"
                    className="flex-1 bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-text-muted transition-colors"
                  />
                  <button
                    onClick={savePipelineName}
                    disabled={saving || !pipelineName.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-widest bg-white text-black rounded-lg hover:bg-stone-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Salvar
                  </button>
                </div>
              </div>

              {/* ── Etapas ── */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-stone-600">
                    Etapas da Jornada
                  </p>
                  <button
                    onClick={addStage}
                    className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-text-muted hover:text-text-main border border-border rounded-lg px-2.5 py-1.5 hover:bg-surface-hover transition-all"
                  >
                    <Plus size={12} />
                    Nova Etapa
                  </button>
                </div>

                {stages.length === 0 ? (
                  <div className="text-center py-8 text-stone-600 text-sm">
                    Nenhuma etapa configurada. Adicione a primeira!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stages.map((stage, index) => (
                      <div
                        key={stage.id}
                        className={cn(
                          'flex items-center gap-2.5 p-2.5 rounded-lg border transition-all',
                          editingStageId === stage.id
                            ? 'border-text-muted bg-surface-hover'
                            : 'border-border hover:border-stone-600 hover:bg-surface-hover/50'
                        )}
                      >
                        {/* Drag handle visual */}
                        <GripVertical size={14} className="text-stone-700 shrink-0" />

                        {/* Color swatch + picker */}
                        <div className="relative shrink-0" id={`color-picker-${stage.id}`}>
                          <button
                            onClick={() =>
                              setColorPickerStageId(
                                colorPickerStageId === stage.id ? null : stage.id
                              )
                            }
                            className="w-4 h-4 rounded-full border-2 border-border hover:scale-110 transition-transform"
                            style={{ backgroundColor: stage.color }}
                            title="Alterar cor"
                          />
                          {colorPickerStageId === stage.id && (
                            <div className="absolute left-0 top-7 z-50 bg-surface border border-border rounded-lg p-2.5 shadow-2xl grid grid-cols-5 gap-1.5 w-[120px]">
                              {COLOR_PALETTE.map(c => (
                                <button
                                  key={c}
                                  onClick={() => changeStageColor(stage.id, c)}
                                  className="w-5 h-5 rounded-full hover:scale-110 transition-transform border-2"
                                  style={{
                                    backgroundColor: c,
                                    borderColor: c === stage.color ? '#fff' : 'transparent',
                                  }}
                                  title={c}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Name (editable inline) */}
                        {editingStageId === stage.id ? (
                          <input
                            ref={editInputRef}
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleStageEditBlur(); }
                              if (e.key === 'Escape') {
                                setEditingStageId(null);
                                if (stage.isNew) setStages(prev => prev.filter(s => s.id !== stage.id));
                              }
                            }}
                            onBlur={handleStageEditBlur}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-text-main min-w-0"
                          />
                        ) : (
                          <span
                            className="flex-1 text-sm text-text-main cursor-text min-w-0 truncate"
                            onDoubleClick={() => startEditStage(stage)}
                            title="Clique duplo para editar"
                          >
                            {stage.name}
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEditStage(stage)}
                            className="p-1 rounded hover:bg-border text-stone-600 hover:text-text-main transition-colors"
                            title="Renomear"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => moveStage(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-border text-stone-600 hover:text-text-main transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Mover para cima"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            onClick={() => moveStage(index, 'down')}
                            disabled={index === stages.length - 1}
                            className="p-1 rounded hover:bg-border text-stone-600 hover:text-text-main transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Mover para baixo"
                          >
                            <ChevronDown size={12} />
                          </button>
                          <button
                            onClick={() => deleteStage(stage)}
                            className="p-1 rounded hover:bg-rose-500/10 text-stone-600 hover:text-rose-400 transition-colors"
                            title="Remover etapa"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-stone-700 mt-4 leading-relaxed">
                  Dica: etapas com negócios ativos não podem ser removidas. Reordene livremente sem
                  afetar negócios existentes.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-stone-700 font-mono">
            Pipeline ID: {pipelineId.slice(0, 8).toUpperCase()}
          </p>
          <button
            onClick={onClose}
            className="text-[11px] font-mono uppercase tracking-widest text-text-muted hover:text-text-main border border-border rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-all"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-8 left-1/2 -translate-x-1/2 z-[70]',
            'flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-2xl border',
            'text-sm font-medium transition-all',
            toast.ok
              ? 'bg-surface border-border text-text-main'
              : 'bg-rose-950 border-rose-800/60 text-rose-300'
          )}
        >
          {toast.ok
            ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            : <AlertCircle size={15} className="text-rose-400 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </>
  );
};
