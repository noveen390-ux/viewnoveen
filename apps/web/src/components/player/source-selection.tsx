'use client';

import { Link, Film, Upload } from 'lucide-react';

interface SourceSelectionProps {
  onSelectDirect: () => void;
}

export function SourceSelection({ onSelectDirect }: SourceSelectionProps) {
  const sources = [
    {
      id: 'youtube',
      label: 'YouTube',
      icon: Film,
      description: 'Search or paste a YouTube link',
      disabled: true,
    },
    {
      id: 'google_drive',
      label: 'Google Drive',
      icon: Upload,
      description: 'Browse your Drive files',
      disabled: true,
    },
    {
      id: 'local',
      label: 'Local File',
      icon: Upload,
      description: 'Upload from your device',
      disabled: true,
    },
    {
      id: 'direct',
      label: 'Direct URL',
      icon: Link,
      description: 'Paste a direct video link',
      disabled: false,
      onClick: onSelectDirect,
    },
  ];

  return (
    <div className="h-full flex items-center justify-center bg-surface-950">
      <div className="text-center max-w-lg mx-auto px-6">
        <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <Film className="w-8 h-8 text-brand-400" />
        </div>
        <p className="text-lg font-medium text-white mb-1">Choose a source</p>
        <p className="text-sm text-surface-400 mb-8">
          Select where you want to play media from
        </p>
        <div className="grid grid-cols-2 gap-3">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={source.onClick}
              disabled={source.disabled}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                source.disabled
                  ? 'bg-surface-900 border-surface-800 opacity-40 cursor-not-allowed'
                  : 'bg-surface-900 border-surface-800 hover:border-brand-500/50 hover:bg-surface-800 cursor-pointer'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
                <source.icon className="w-5 h-5 text-surface-300" />
              </div>
              <span className="text-sm font-medium text-white">{source.label}</span>
              <span className="text-xs text-surface-500">{source.description}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-surface-600 mt-6">
          YouTube, Google Drive, and Local file support coming soon
        </p>
      </div>
    </div>
  );
}
