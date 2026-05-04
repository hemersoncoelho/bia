import React from 'react';
import type { AgentTool, ToolDependency } from '../../types';

const getWhenToUse = (tool: AgentTool): string => {
  const value = tool.when_to_use ?? tool.config_schema.when_to_use;
  return typeof value === 'string' ? value : 'Use quando a conversa exigir esta ação.';
};

const getInputSchema = (tool: AgentTool): Record<string, unknown> => {
  const value = tool.input_schema ?? tool.config_schema.input_schema;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

interface AgentToolPayloadPreviewProps {
  tool: AgentTool;
  dependencies: ToolDependency[];
}

export const AgentToolPayloadPreview: React.FC<AgentToolPayloadPreviewProps> = ({
  tool,
  dependencies,
}) => {
  const payload = {
    name: tool.slug,
    label: tool.name,
    description: tool.description,
    when_to_use: getWhenToUse(tool),
    type: tool.tool_type,
    enabled: tool.is_enabled,
    readiness: tool.readiness ?? 'inactive',
    requires_permission: [] as string[],
    depends_on: dependencies.map((dep) => dep.key),
    input_schema: getInputSchema(tool),
    config: tool.config,
    assets: (tool.assets ?? []).map((a) => ({
      id: a.id,
      label: a.label ?? a.file_name,
      public_url: a.public_url,
      mime_type: a.mime_type,
    })),
  };

  return (
    <div>
      <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">
        Preview payload n8n
      </p>
      <pre className="max-h-64 overflow-auto custom-scrollbar text-[10px] leading-relaxed bg-black/30 border border-border rounded-lg p-3 text-stone-400">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
};
