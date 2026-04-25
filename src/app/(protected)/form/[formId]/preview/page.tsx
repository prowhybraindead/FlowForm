'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { ViewForm } from '../../../../../components/ViewForm';

export default function PreviewPage() {
  const router = useRouter();
  const params = useParams<{ formId: string }>();
  const formId = params.formId;
  const [viewMode, setViewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  return (
    <div className="relative min-h-screen bg-natural-bg/50">
      <div className="fixed top-20 right-8 z-50 flex items-center gap-4 bg-white p-2 rounded-full shadow-lg border border-natural-border">
        <div className="flex items-center gap-1 border-r border-natural-border pr-4 mr-2">
          <button
            onClick={() => setViewMode('desktop')}
            className={`p-2 rounded-full transition-colors ${viewMode === 'desktop' ? 'bg-natural-accent text-natural-primary' : 'text-natural-muted hover:bg-natural-accent/50'}`}
            title="Desktop View"
          >
            <Monitor className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('tablet')}
            className={`p-2 rounded-full transition-colors ${viewMode === 'tablet' ? 'bg-natural-accent text-natural-primary' : 'text-natural-muted hover:bg-natural-accent/50'}`}
            title="Tablet View"
          >
            <Tablet className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            className={`p-2 rounded-full transition-colors ${viewMode === 'mobile' ? 'bg-natural-accent text-natural-primary' : 'text-natural-muted hover:bg-natural-accent/50'}`}
            title="Mobile View"
          >
            <Smartphone className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => router.push(`/form/${formId}`)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-full hover:bg-primary/90 transition-all font-medium text-sm"
        >
          Back to Editor
        </button>
      </div>

      <div className="pt-20 pb-12 overflow-y-auto w-full h-screen flex justify-center">
        <div
          className={`transition-all duration-300 ease-in-out w-full border-x border-natural-border/50 shadow-2xl bg-white overflow-hidden ${
            viewMode === 'desktop' ? 'max-w-full' :
            viewMode === 'tablet' ? 'max-w-[768px]' :
            'max-w-[375px]'
          }`}
          style={{ height: 'max-content', minHeight: '100%' }}
        >
          <ViewForm formId={formId} isPreview />
        </div>
      </div>
    </div>
  );
}
