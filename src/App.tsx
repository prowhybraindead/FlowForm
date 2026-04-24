/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { AuthWrapper } from './components/AuthWrapper';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { ViewForm } from './components/ViewForm';
import { Responses } from './components/Responses';
import { Toaster } from './components/ui/sonner';

import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { TooltipProvider } from './components/ui/tooltip';

const EditorWrapper = () => {
  const { formId } = useParams<{formId: string}>();
  const navigate = useNavigate();
  return (
    <Editor 
      formId={formId!} 
      onBack={() => navigate('/dashboard')} 
      onPreview={() => navigate(`/form/${formId}/preview`)} 
    />
  );
};

const ResponsesWrapper = () => {
  const { formId } = useParams<{formId: string}>();
  const navigate = useNavigate();
  return <Responses formId={formId!} onBack={() => navigate('/dashboard')} />;
};

const PreviewWrapper = () => {
  const { formId } = useParams<{formId: string}>();
  const navigate = useNavigate();
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
          onClick={() => navigate(`/form/${formId}`)}
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
          <ViewForm formId={formId!} isPreview />
        </div>
      </div>
    </div>
  );
};

const PublicViewWrapper = () => {
  const { formId } = useParams<{formId: string}>();
  return <ViewForm formId={formId!} />;
};

const DashboardWrapper = () => {
  const navigate = useNavigate();
  return (
    <Dashboard 
      onEdit={(formId) => navigate(`/form/${formId}`)} 
      onViewResults={(formId) => navigate(`/form/${formId}/responses`)} 
    />
  );
};

const LegacyRedirect = () => {
  const { formId } = useParams<{formId: string}>();
  return <Navigate to={`/f/${formId}`} replace />;
};

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/f/:formId" element={<><PublicViewWrapper /><Toaster /></>} />
          <Route path="/view/:formId" element={<LegacyRedirect />} />
          <Route path="*" element={
            <AuthWrapper>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardWrapper />} />
                <Route path="/form/:formId" element={<EditorWrapper />} />
                <Route path="/form/:formId/responses" element={<ResponsesWrapper />} />
                <Route path="/form/:formId/preview" element={<PreviewWrapper />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
              <Toaster />
            </AuthWrapper>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
