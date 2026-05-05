import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Trash2,
  Image,
  Video,
  Loader2,
  AlertCircle,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import type { AgentToolAsset } from '../../types';

// ── Helpers ───────────────────────────────────────────────────

const SUPABASE_URL = 'https://phlgzzjyzkgvveqevqbg.supabase.co';
const BUCKET = 'media';

const isImage = (mime?: string) => mime?.startsWith('image/') ?? false;
const isVideo = (mime?: string) => mime?.startsWith('video/') ?? false;

// ── Tipos internos ────────────────────────────────────────────

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  error?: string;
  done: boolean;
}

// ── Props ─────────────────────────────────────────────────────

interface AgentToolAssetsProps {
  toolSlug: 'enviar_foto' | 'enviar_video';
  agentId: string;
  companyId: string;
  bindingId: string | undefined;
  assets: AgentToolAsset[];
  onAssetsChanged: (assets: AgentToolAsset[]) => void;
}

// ── Componente ────────────────────────────────────────────────

export const AgentToolAssets: React.FC<AgentToolAssetsProps> = ({
  toolSlug,
  agentId,
  companyId,
  bindingId,
  assets,
  onAssetsChanged,
}) => {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPhotoTool = toolSlug === 'enviar_foto';
  const accept = isPhotoTool ? 'image/*' : 'video/*';
  const mimeLabel = isPhotoTool ? 'imagens' : 'vídeos';
  const maxMB = isPhotoTool ? 10 : 50;
  const maxFiles = isPhotoTool ? 5 : 3;
  const Icon = isPhotoTool ? Image : Video;

  // ── Garante que binding existe antes de inserir assets ───────

  const ensureBinding = useCallback(async (): Promise<string | null> => {
    if (bindingId) return bindingId;

    const { data, error } = await supabase
      .from('agent_tool_bindings')
      .upsert(
        { company_id: companyId, agent_id: agentId, tool_slug: toolSlug, is_enabled: true, config: {} },
        { onConflict: 'company_id,agent_id,tool_slug' }
      )
      .select('id')
      .single();

    return error ? null : data.id;
  }, [bindingId, companyId, agentId, toolSlug]);

  // ── Upload de arquivo ─────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File) => {
      const uploadId = crypto.randomUUID();
      const storagePath = `tool-assets/${companyId}/${agentId}/${toolSlug}/${uploadId}-${file.name}`;
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

      setUploading((prev) => [
        ...prev,
        { id: uploadId, name: file.name, progress: 0, done: false },
      ]);

      // Upload Storage
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false });

      if (storageError) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, error: storageError.message, done: true } : u
          )
        );
        return;
      }

      // Garante binding antes de registrar asset
      const resolvedBindingId = await ensureBinding();
      if (!resolvedBindingId) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, error: 'Erro ao criar binding.', done: true } : u
          )
        );
        return;
      }

      // Registra na tabela agent_tool_assets
      const { data: assetRow, error: dbError } = await supabase
        .from('agent_tool_assets')
        .insert({
          company_id: companyId,
          binding_id: resolvedBindingId,
          tool_slug: toolSlug,
          file_name: file.name,
          storage_path: storagePath,
          public_url: publicUrl,
          mime_type: file.type,
          file_size_bytes: file.size,
          label: file.name.replace(/\.[^.]+$/, ''),
          sort_order: assets.length + 1,
        })
        .select()
        .single();

      if (dbError) {
        // Rollback storage
        await supabase.storage.from(BUCKET).remove([storagePath]);
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, error: dbError.message, done: true } : u
          )
        );
        return;
      }

      setUploading((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, progress: 100, done: true } : u))
      );
      onAssetsChanged([...assets, assetRow as AgentToolAsset]);

      // Remove da lista de uploading após 2s
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      }, 2000);
    },
    [companyId, agentId, toolSlug, assets, ensureBinding, onAssetsChanged]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = maxFiles - assets.length;
      const toUpload = Array.from(files).slice(0, remaining);

      for (const file of toUpload) {
        if (file.size > maxMB * 1024 * 1024) {
          alert(`"${file.name}" excede o limite de ${maxMB}MB.`);
          continue;
        }
        uploadFile(file);
      }
    },
    [assets.length, maxFiles, maxMB, uploadFile]
  );

  // ── Delete ────────────────────────────────────────────────────

  const handleDelete = async (asset: AgentToolAsset) => {
    if (!confirm(`Remover "${asset.label ?? asset.file_name}"?`)) return;
    setDeletingId(asset.id);

    const { data } = await supabase.rpc('rpc_delete_tool_asset', {
      p_asset_id: asset.id,
      p_company_id: companyId,
    });

    if (data?.success) {
      // Remove do Storage
      await supabase.storage.from(BUCKET).remove([data.storage_path]);
      onAssetsChanged(assets.filter((a) => a.id !== asset.id));
    }
    setDeletingId(null);
  };

  // ── Label edit ────────────────────────────────────────────────

  const handleLabelChange = async (asset: AgentToolAsset, newLabel: string) => {
    await supabase
      .from('agent_tool_assets')
      .update({ label: newLabel })
      .eq('id', asset.id);
    onAssetsChanged(assets.map((a) => (a.id === asset.id ? { ...a, label: newLabel } : a)));
  };

  // ── Render ────────────────────────────────────────────────────

  const canUploadMore = assets.length + uploading.filter((u) => !u.done).length < maxFiles;

  return (
    <div className="space-y-3">
      {/* Zona de drop / botão de upload */}
      {canUploadMore && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all',
            dragOver
              ? 'border-violet-500/60 bg-violet-500/10'
              : 'border-stone-700 hover:border-violet-500/40 hover:bg-violet-500/5'
          )}
        >
          <Upload size={20} className="text-stone-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-stone-400">
              Arraste {mimeLabel} ou clique para selecionar
            </p>
            <p className="text-[11px] text-stone-600 mt-0.5">
              Máx. {maxMB}MB por arquivo · até {maxFiles} {mimeLabel} · {maxFiles - assets.length} restante{maxFiles - assets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Uploads em andamento */}
      {uploading.map((u) => (
        <div
          key={u.id}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border text-xs',
            u.error
              ? 'bg-red-500/5 border-red-500/20 text-red-400'
              : u.done
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              : 'bg-surface border-border text-stone-400'
          )}
        >
          {u.error ? (
            <AlertCircle size={14} className="shrink-0" />
          ) : u.done ? (
            <CheckCircle2 size={14} className="shrink-0" />
          ) : (
            <Loader2 size={14} className="shrink-0 animate-spin" />
          )}
          <span className="flex-1 truncate">{u.name}</span>
          {u.error && <span className="shrink-0 text-[11px]">{u.error}</span>}
          {u.done && !u.error && <span className="shrink-0">Enviado!</span>}
        </div>
      ))}

      {/* Lista de assets cadastrados */}
      {assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg group"
            >
              {/* Preview thumbnail */}
              <div className="w-10 h-10 rounded-md overflow-hidden bg-stone-800 shrink-0 flex items-center justify-center">
                {isImage(asset.mime_type) ? (
                  <img
                    src={asset.public_url}
                    alt={asset.label ?? asset.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : isVideo(asset.mime_type) ? (
                  <Video size={16} className="text-stone-500" />
                ) : (
                  <Icon size={16} className="text-stone-500" />
                )}
              </div>

              {/* Info e label editável */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={asset.label ?? asset.file_name}
                  onChange={(e) => handleLabelChange(asset, e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-stone-300 outline-none focus:text-primary border-b border-transparent focus:border-stone-600 transition-colors pb-0.5"
                  title="Clique para editar o label"
                />
                <p className="text-[10px] text-stone-600 mt-0.5 truncate">
                  {asset.file_name}
                  {asset.mime_type && ` · ${asset.mime_type.split('/')[1]?.toUpperCase()}`}
                </p>
              </div>

              {/* Grip (futuro drag-reorder) + delete */}
              <div className="flex items-center gap-1 shrink-0">
                <GripVertical size={14} className="text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                <button
                  type="button"
                  disabled={deletingId === asset.id}
                  onClick={() => handleDelete(asset)}
                  className="p-1.5 text-stone-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  title="Remover asset"
                >
                  {deletingId === asset.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estado vazio */}
      {assets.length === 0 && uploading.length === 0 && (
        <p className="text-[11px] text-stone-600 text-center py-1">
          Nenhum asset cadastrado ainda. O agente não conseguirá usar esta ferramenta.
        </p>
      )}
    </div>
  );
};
