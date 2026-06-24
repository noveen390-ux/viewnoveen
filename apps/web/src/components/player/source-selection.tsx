'use client';

import { Link, Film, Upload } from 'lucide-react';

interface SourceSelectionProps {
  onSelectDirect: () => void;
  onSelectYoutube: () => void;
  onSelectDrive: () => void;
  onSelectLocal: () => void;
}

export function SourceSelection({ onSelectDirect, onSelectYoutube, onSelectDrive, onSelectLocal }: SourceSelectionProps) {
  const sources = [
    {
      id: 'youtube',
      label: 'YouTube',
      icon: Film,
      description: 'Search or paste a YouTube link',
      onClick: onSelectYoutube,
    },
    {
      id: 'google_drive',
      label: 'Google Drive',
      icon: Upload,
      description: 'Paste a Drive share link',
      onClick: onSelectDrive,
    },
    {
      id: 'local',
      label: 'Local File',
      icon: Upload,
      description: 'Upload from your device',
      onClick: onSelectLocal,
    },
    {
      id: 'direct',
      label: 'Direct URL',
      icon: Link,
      description: 'Paste a direct video link',
      onClick: onSelectDirect,
    },
  ];

  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="text-center max-w-lg mx-auto px-6">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Film className="w-8 h-8 text-primary" />
        </div>
        <p className="text-lg font-medium text-foreground mb-1">Choose a source</p>
        <p className="text-sm text-muted-foreground mb-8">
          Select where you want to play media from
        </p>
        <div className="grid grid-cols-2 gap-3">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={source.onClick}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-surface hover:border-primary/50 hover:bg-muted cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <source.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground">{source.label}</span>
              <span className="text-xs text-muted-foreground">{source.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
