'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFormStore } from '../store/useFormStore';
import { Question, QuestionType } from '../types';
import { getFormRecord, updateFormRecord } from '../lib/formsApi';
import { uploadImageAsset } from '../lib/imageUpload';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { DarkModeToggle } from './DarkModeToggle';
import { useDarkMode } from '../hooks/useDarkMode';
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Copy, 
  Settings, 
  Eye, 
  Share2, 
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Circle,
  Square,
  Type,
  AlignLeft,
  Calendar,
  Clock,
  CircleDot,
  CheckSquare,
  CheckCircle2,
  ListCollapse,
  Image as ImageIcon,
  UploadCloud,
  Mail,
  Hash,
  GitBranch,
  History,
  RotateCcw,
  Info,
  Undo2,
  Redo2
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { toast } from 'sonner';

const SaveStatus = ({ autoSaving, lastSavedAt }: { autoSaving: boolean, lastSavedAt: Date | null }) => {
  const [timeStr, setTimeStr] = useState<string>('Not saved');

  useEffect(() => {
    const updateTime = () => {
      if (autoSaving) {
        setTimeStr('');
        return;
      }
      if (!lastSavedAt) {
        setTimeStr('Not saved');
        return;
      }
      
      const seconds = Math.round((Date.now() - lastSavedAt.getTime()) / 1000);
      if (seconds < 60) {
        setTimeStr('Saved just now');
      } else {
        const minutes = Math.floor(seconds / 60);
        if (minutes === 1) setTimeStr('Saved 1 minute ago');
        else if (minutes < 60) setTimeStr(`Saved ${minutes} minutes ago`);
        else {
          const hours = Math.floor(minutes / 60);
          if (hours === 1) setTimeStr('Saved 1 hour ago');
          else if (hours < 24) setTimeStr(`Saved ${hours} hours ago`);
          else setTimeStr(`Saved ${lastSavedAt.toLocaleDateString()}`);
        }
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [autoSaving, lastSavedAt]);

  return (
    <div className="hidden lg:flex flex-col items-end mr-4 animate-in fade-in slide-in-from-top-1">
      <span className="text-[10px] uppercase tracking-widest font-bold text-natural-muted">
        {autoSaving ? 'Saving' : 'Status'}
      </span>
      <span className={`text-xs flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full mt-0.5 transition-colors duration-300 ${autoSaving ? 'bg-natural-primary/10 text-natural-primary' : 'bg-natural-accent/80 text-natural-text dark:bg-natural-border'}`}>
        {autoSaving ? (
          <>
            <RotateCcw className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <span>{timeStr}</span>
        )}
      </span>
    </div>
  );
};

interface EditorProps {
  formId: string;
  onBack: () => void;
  onPreview: (formId: string) => void;
}

const QUESTION_TYPES: { type: QuestionType, label: string, icon: any }[] = [
  { type: 'short_answer', label: 'Short answer', icon: Type },
  { type: 'paragraph', label: 'Paragraph', icon: AlignLeft },
  { type: 'multiple_choice', label: 'Multiple choice', icon: CircleDot },
  { type: 'checkbox', label: 'Checkboxes', icon: CheckSquare },
  { type: 'dropdown', label: 'Dropdown', icon: ListCollapse },
  { type: 'date', label: 'Date', icon: Calendar },
  { type: 'time', label: 'Time', icon: Clock },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'image_upload', label: 'Image Upload', icon: ImageIcon },
];

const FONT_OPTIONS = [
  { label: 'System Default (Inter)', value: 'var(--font-sans)', name: 'sans' },
  { label: 'Serif (Playfair Display)', value: 'var(--font-serif)', name: 'serif' },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', name: 'mono' },
];

export const Editor: React.FC<EditorProps> = ({ formId, onBack, onPreview }) => {
  const { isDark } = useDarkMode();
  const { currentForm, setCurrentForm, updateForm, updateQuestion, removeQuestion, duplicateQuestion, addQuestion, reorderQuestions, undo, redo, canUndo, canRedo } = useFormStore();
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [domainError, setDomainError] = useState('');
  const lastSyncedClosedState = useRef<boolean | null>(null);
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateForm({ settings: { ...currentForm?.settings, customDomain: value } });
    
    if (value) {
      // Improved URL validation: requires protocol, domain, and TLD
      const urlPattern = /^https?:\/\/([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i;
      if (!urlPattern.test(value)) {
        setDomainError('Enter a valid URL (e.g., https://forms.yourcompany.com)');
      } else {
        setDomainError('');
      }
    } else {
      setDomainError('');
    }
  };

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const remoteForm = await getFormRecord(formId);
        if (remoteForm) {
          
          // Check for local draft
          const draftKey = `form_draft_${formId}`;
          const localDraft = localStorage.getItem(draftKey);
          
          if (localDraft) {
            const parsedDraft = JSON.parse(localDraft);
            // Only suggest if draft is newer than remote
            if (parsedDraft.updatedAt > (remoteForm.updatedAt || 0)) {
              const recover = confirm('We found an unsaved draft of this form. Would you like to recover it?');
              if (recover) {
                setCurrentForm(parsedDraft);
                setLastSavedAt(new Date(parsedDraft.updatedAt));
                return;
              } else {
                localStorage.removeItem(draftKey);
              }
            }
          }
          
          setCurrentForm(remoteForm);
          if (remoteForm.updatedAt) {
            setLastSavedAt(new Date(remoteForm.updatedAt));
          }
        }
      } catch (error) {
        console.error('Error fetching form:', error);
      }
    };
    fetchForm();
  }, [formId, setCurrentForm]);

  // Auto-save effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea unless necessary,
      // but form actions are often global. We will prevent default on Ctrl+Z to use our store.
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      } else if (cmdOrCtrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  useEffect(() => {
    if (!currentForm) return;

    // Save to local storage immediately on change
    const draftKey = `form_draft_${formId}`;
    localStorage.setItem(draftKey, JSON.stringify({
      ...currentForm,
      updatedAt: Date.now()
    }));

    // Debounced save to Firebase
    const timeout = setTimeout(async () => {
      setAutoSaving(true);
      try {
        const now = Date.now();
        await updateFormRecord(formId, {
          ...currentForm,
          updatedAt: now,
        });
        setLastSavedAt(new Date(now));
        // Clear draft after successful remote save
        localStorage.removeItem(draftKey);
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setAutoSaving(false);
      }
    }, 3000); // 3 seconds debounced

    return () => clearTimeout(timeout);
  }, [currentForm, formId]);

  const isClosedForResponses = currentForm?.settings?.publishImmediately === false;

  useEffect(() => {
    if (!currentForm) return;
    if (process.env.NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS !== 'true') return;
    if (lastSyncedClosedState.current === isClosedForResponses) return;

    lastSyncedClosedState.current = isClosedForResponses;
    fetch('/api/temp-storage/form-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formId,
        isClosed: isClosedForResponses,
      }),
    }).catch((error) => {
      console.error('Failed to sync form status with temp storage:', error);
    });
  }, [currentForm, formId, isClosedForResponses]);

  const saveForm = async () => {
    if (!currentForm) return;
    setSaving(true);
    try {
      await updateFormRecord(formId, {
        ...currentForm,
        updatedAt: Date.now(),
      });
      localStorage.removeItem(`form_draft_${formId}`);
      setLastSavedAt(new Date());
      toast.success('Form saved successfully');
    } catch (error) {
      console.error('Error saving form:', error);
      toast.error('Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  const saveVersion = async () => {
    if (!currentForm || !newVersionName.trim()) return;
    setSavingVersion(true);
    try {
      const { id, views, versions, ...formData } = currentForm;
      const newVersion = {
        id: crypto.randomUUID(),
        name: newVersionName.trim(),
        timestamp: Date.now(),
        data: formData
      };
      
      const updatedVersions = [...(currentForm.versions || []), newVersion];
      
      await updateFormRecord(formId, {
        versions: updatedVersions,
        updatedAt: Date.now(),
      });
      
      setCurrentForm({ ...currentForm, versions: updatedVersions });
      setNewVersionName('');
      toast.success('Version saved');
    } catch (error) {
      console.error('Error saving version:', error);
      toast.error('Failed to save version');
    } finally {
      setSavingVersion(false);
    }
  };

  const restoreVersion = async (version: any) => {
    if (!currentForm) return;
    if (!confirm('Are you sure you want to restore this version? Unsaved changes will be lost.')) return;
    
    try {
      await updateFormRecord(formId, {
        ...version.data,
        updatedAt: Date.now(),
      });
      
      setCurrentForm({ ...currentForm, ...version.data });
      toast.success('Version restored');
      setHistoryOpen(false);
    } catch (error) {
      console.error('Error restoring version:', error);
      toast.error('Failed to restore version');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && currentForm) {
      const oldIndex = currentForm.questions.findIndex((q) => q.id === active.id);
      const newIndex = currentForm.questions.findIndex((q) => q.id === over?.id);
      reorderQuestions(arrayMove(currentForm.questions, oldIndex, newIndex));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image size must be less than 2MB');
        return;
      }

      try {
        const imageUrl = await uploadImageAsset(file, { formId });
        updateForm({ theme: { ...currentForm?.theme, headerImage: imageUrl } });
      } catch (error) {
        console.error('Header image upload failed:', error);
        toast.error('Failed to upload header image');
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image size must be less than 2MB');
        return;
      }

      try {
        const imageUrl = await uploadImageAsset(file, { formId });
        updateForm({ theme: { ...currentForm?.theme, logo: imageUrl } });
      } catch (error) {
        console.error('Logo upload failed:', error);
        toast.error('Failed to upload logo image');
      }
    }
  };

  if (!currentForm) return <div>Loading...</div>;

  const shareUrl = currentForm.settings?.customDomain
    ? `${currentForm.settings.customDomain.replace(/\/$/, '')}/f/${formId}` 
    : `${window.location.origin}/f/${formId}`;

  return (
    <div className="bg-natural-bg min-h-screen pb-24" style={{ backgroundColor: currentForm.theme?.backgroundColor || undefined }}>
      <Tabs defaultValue="questions" className="w-full">
        <header className="bg-white border-b border-natural-border sticky top-16 z-40 transition-shadow">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-natural-accent text-natural-muted">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-6 w-[1px] bg-natural-border hidden sm:block"></div>
              <Input 
                value={currentForm.title} 
                onChange={(e) => updateForm({ title: e.target.value })}
                className="font-medium text-lg border-transparent hover:bg-natural-accent focus:bg-white transition-all w-64 h-10 rounded-xl"
              />
            </div>
            
            <TabsList className="bg-natural-bg hidden md:flex">
              <TabsTrigger value="questions" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Questions</TabsTrigger>
              <TabsTrigger value="theme" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Theme</TabsTrigger>
              <TabsTrigger value="settings" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Settings</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <DarkModeToggle />
              <SaveStatus autoSaving={autoSaving} lastSavedAt={lastSavedAt} />
              
              <div className="hidden lg:flex items-center gap-1 border-r border-natural-border pr-3 mr-1">
                <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} className="rounded-full text-natural-muted hover:text-natural-primary h-8 w-8" title="Undo (Ctrl+Z)">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo} className="rounded-full text-natural-muted hover:text-natural-primary h-8 w-8" title="Redo (Ctrl+Y)">
                  <Redo2 className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="ghost" size="sm" onClick={() => onPreview(formId)} className="rounded-full text-natural-muted hover:text-natural-primary hidden lg:flex">
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button size="sm" onClick={saveForm} disabled={saving || autoSaving} className="btn-natural px-6 py-1.5 h-auto text-sm" style={{ backgroundColor: currentForm.theme?.accentColor || undefined }}>
                {saving ? 'Force Saving...' : 'Save Now'}
              </Button>
              
              <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogTrigger render={<Button variant="ghost" size="icon" className="rounded-full text-natural-muted hover:bg-natural-accent hidden sm:flex" title="Version History" />}>
                  <History className="h-4 w-4" />
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-white border border-natural-border p-6 shadow-xl" showCloseButton={true}>
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-serif text-natural-text">Version History</DialogTitle>
                    <DialogDescription className="text-natural-muted">
                      Save a snapshot of your form's current state, or restore a previous version.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 pt-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Version name (e.g., V1 Before Launch)"
                        value={newVersionName}
                        onChange={(e) => setNewVersionName(e.target.value)}
                        className="bg-natural-bg border-natural-border"
                      />
                      <Button onClick={saveVersion} disabled={!newVersionName.trim() || savingVersion} className="btn-natural shrink-0" style={{ backgroundColor: currentForm.theme?.accentColor || undefined }}>
                        Save Version
                      </Button>
                    </div>

                    <div className="space-y-3 mt-6">
                      <h4 className="text-sm font-semibold text-natural-text uppercase tracking-widest">Saved Versions</h4>
                      {!currentForm.versions || currentForm.versions.length === 0 ? (
                        <p className="text-sm text-natural-muted">No versions saved yet.</p>
                      ) : (
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                          {[...(currentForm.versions || [])].reverse().map((version) => (
                            <div key={version.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-natural-border bg-natural-bg/50 group">
                              <div>
                                <p className="font-medium text-natural-text text-sm">{version.name}</p>
                                <p className="text-xs text-natural-muted">{new Date(version.timestamp).toLocaleString()}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => restoreVersion(version)}
                                className="text-natural-muted hover:text-natural-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Restore
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger render={<Button variant="ghost" size="icon" className="rounded-full text-natural-muted hover:bg-natural-accent hidden sm:flex" />}>
                  <Share2 className="h-4 w-4" />
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-white border border-natural-border p-6 shadow-xl" showCloseButton={true}>
                  <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-serif text-natural-text">Share Form</DialogTitle>
                    <DialogDescription className="text-natural-muted">
                      Share this link to let others fill out your form.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center justify-center space-y-8 py-4">
                    <div className="bg-white p-4 rounded-xl border border-natural-border shadow-sm">
                      <QRCodeSVG value={shareUrl} size={200} />
                    </div>
                    <div className="flex w-full items-center gap-2">
                      <Input
                        readOnly
                        value={shareUrl}
                        className="flex-1 bg-natural-bg border-natural-border text-natural-text"
                      />
                      <Button type="button" onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        toast.success('Form link copied to clipboard');
                      }} className="btn-natural py-2 px-4 shadow-sm" style={{ backgroundColor: currentForm.theme?.accentColor || undefined }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <div className="md:hidden border-t border-natural-border p-2 flex justify-center bg-white">
            <TabsList className="bg-natural-bg w-full max-w-[300px]">
              <TabsTrigger value="questions" className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">Questions</TabsTrigger>
              <TabsTrigger value="theme" className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">Theme</TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">Settings</TabsTrigger>
            </TabsList>
          </div>
        </header>

        <TabsContent value="questions" className="mt-0 outline-none relative">
          
          {currentForm.settings?.showProgressBar && (
            <div className="w-full bg-white/80 backdrop-blur border-b border-natural-border px-6 py-4 shadow-sm sticky top-[64px] z-30">
              <div className="max-w-[720px] mx-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">Progress Bar Preview (50% Answered)</span>
                  <span className="text-sm font-medium" style={{ color: currentForm.theme?.accentColor || 'var(--color-natural-primary)' }}>50%</span>
                </div>
                <div className="w-full h-2 bg-natural-border rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-500 ease-out w-1/2" 
                    style={{ backgroundColor: currentForm.theme?.accentColor || 'var(--color-natural-primary)' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="max-w-[720px] mx-auto py-12 px-6 space-y-8">
            {currentForm.theme?.headerImage && (
              <div className="w-full h-48 rounded-[32px] overflow-hidden shadow-sm">
                <img src={currentForm.theme.headerImage} className="w-full h-full object-cover" alt="Form header" />
              </div>
            )}
            <div className="w-full bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border-t-[8px] border-natural-primary p-12 relative" style={{ borderTopColor: currentForm.theme?.accentColor || undefined }}>
              {currentForm.theme?.logo && (
                <div className="mb-6 w-24 h-24">
                  <img src={currentForm.theme.logo} alt="Form Logo" className="w-full h-full object-contain" />
                </div>
              )}
              <input 
                aria-label="Form Title"
                type="text"
                value={currentForm.title} 
                onChange={(e) => updateForm({ title: e.target.value })}
                placeholder="Form Title"
                className="w-full text-4xl font-serif font-light focus:outline-none border-b border-transparent focus:border-natural-border pb-3 text-natural-text"
                style={{ fontFamily: currentForm.theme?.titleFont || 'var(--font-sans)' }}
              />
              <textarea 
                aria-label="Form Description"
                value={currentForm.description} 
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Form description"
                rows={2}
                className="w-full mt-6 text-base text-natural-muted bg-transparent focus:outline-none resize-none leading-relaxed"
                style={{ fontFamily: currentForm.theme?.bodyFont || 'var(--font-sans)' }}
              />
            </div>

            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={currentForm.questions.map(q => q.id)}
                strategy={verticalListSortingStrategy}
                children={currentForm.questions.map((question) => (
                  <SortableQuestionItem 
                    key={question.id} 
                    formId={formId}
                    question={question}
                    allQuestions={currentForm.questions}
                    updateQuestion={updateQuestion}
                    removeQuestion={removeQuestion}
                    duplicateQuestion={duplicateQuestion}
                    accentColor={currentForm.theme?.accentColor}
                    titleFont={currentForm.theme?.titleFont}
                    bodyFont={currentForm.theme?.bodyFont}
                  />
                ))}
              />
            </DndContext>

            <div className="flex justify-center pt-8">
              <DropdownMenu>
                <DropdownMenuTrigger className="btn-natural shadow-xl scale-110 flex items-center gap-2 cursor-pointer" style={{ backgroundColor: currentForm.theme?.accentColor || undefined, borderColor: currentForm.theme?.accentColor || undefined }}>
                  <Plus className="h-5 w-5" />
                  Add Element
                </DropdownMenuTrigger>
                <DropdownMenuContent className="rounded-2xl border-natural-border p-2 bg-white">
                  {QUESTION_TYPES.map((qt) => (
                    <DropdownMenuItem key={qt.type} onClick={() => addQuestion(qt.type)} className="rounded-xl py-2 cursor-pointer">
                      <qt.icon className="mr-2 h-4 w-4 text-natural-muted" />
                      {qt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="theme" className="mt-0 outline-none">
          <div className="max-w-[720px] mx-auto py-12 px-6">
            <div className="w-full bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] p-12 border border-natural-border">
              <h2 className="text-2xl font-serif mb-8 text-natural-text">Theme Settings</h2>
              
              <div className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-natural-muted uppercase tracking-widest">Logo</Label>
                  <div className="relative">
                    <input 
                      aria-label="Upload logo"
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoUpload} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className="w-full h-16 border-2 border-dashed border-natural-border rounded-xl flex items-center justify-center text-natural-muted bg-natural-bg/50 hover:bg-natural-bg transition-colors group-hover:border-natural-primary/50">
                      <div className="flex items-center gap-2">
                        <UploadCloud className="h-5 w-5" />
                        <span className="text-sm font-medium">Click or drag logo to upload (max 2MB)</span>
                      </div>
                    </div>
                  </div>
                  {currentForm.theme?.logo && (
                    <div className="mt-4 h-24 w-24 rounded-xl overflow-hidden border border-natural-border relative group">
                      <img src={currentForm.theme.logo} alt="Logo preview" className="w-full h-full object-contain bg-natural-bg" />
                      <button 
                        type="button"
                        aria-label="Remove logo"
                        onClick={() => updateForm({ theme: { ...currentForm.theme, logo: '' } })}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold text-natural-muted uppercase tracking-widest">Header Image</Label>
                  <div className="relative">
                    <input 
                      aria-label="Upload header image"
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    />
                    <div className="w-full h-16 border-2 border-dashed border-natural-border rounded-xl flex items-center justify-center text-natural-muted bg-natural-bg/50 hover:bg-natural-bg transition-colors group-hover:border-natural-primary/50">
                      <div className="flex items-center gap-2">
                        <UploadCloud className="h-5 w-5" />
                        <span className="text-sm font-medium">Click or drag image to upload (max 2MB)</span>
                      </div>
                    </div>
                  </div>
                  {currentForm.theme?.headerImage && (
                    <div className="mt-4 h-32 rounded-xl overflow-hidden border border-natural-border w-full relative group">
                      <img src={currentForm.theme.headerImage} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        aria-label="Remove header image"
                        onClick={() => updateForm({ theme: { ...currentForm.theme, headerImage: '' } })}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Remove Image
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold text-natural-muted uppercase tracking-widest">Accent Color</Label>
                  <div className="flex flex-wrap gap-4">
                    {['#3C3D37', '#181C14', '#0d9488', '#0284c7', '#4f46e5', '#9333ea', '#e11d48', '#ea580c'].map((color) => (
                      <button
                        key={color}
                        onClick={() => updateForm({ theme: { ...currentForm.theme, accentColor: color } })}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${currentForm.theme?.accentColor === color ? 'border-natural-primary scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select accent color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-4 pt-2">
                    <Input 
                      type="color" 
                      value={currentForm.theme?.accentColor || '#3C3D37'}
                      onChange={(e) => updateForm({ theme: { ...currentForm.theme, accentColor: e.target.value } })}
                      className="w-12 h-12 p-1 rounded-xl cursor-pointer"
                    />
                    <span className="text-sm text-natural-muted">Custom color</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold text-natural-muted uppercase tracking-widest">Background Color</Label>
                  <div className="flex flex-wrap gap-4">
                    {['#FAF9F6', '#F5F5F5', '#f0fdf4', '#f0f9ff', '#f5f3ff', '#fff1f2', '#fff7ed', '#fefce8'].map((color) => (
                      <button
                        key={color}
                        onClick={() => updateForm({ theme: { ...currentForm.theme, backgroundColor: color } })}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${currentForm.theme?.backgroundColor === color ? 'border-natural-primary scale-110' : 'border-natural-border hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select background color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4 border-t border-natural-border pt-8">
                  <Label className="text-sm font-bold text-natural-muted uppercase tracking-widest">Typography</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-natural-text">Title Font</Label>
                      <select 
                        className="w-full h-12 rounded-xl border border-natural-border bg-natural-bg px-4 focus:outline-none focus:ring-2 focus:ring-natural-primary/20 appearance-none text-natural-text"
                        value={currentForm.theme?.titleFont || 'var(--font-sans)'}
                        onChange={(e) => updateForm({ theme: { ...currentForm.theme, titleFont: e.target.value } })}
                        style={{ fontFamily: currentForm.theme?.titleFont }}
                      >
                        {FONT_OPTIONS.map(font => (
                          <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-natural-text">Body Font</Label>
                      <select 
                        className="w-full h-12 rounded-xl border border-natural-border bg-natural-bg px-4 focus:outline-none focus:ring-2 focus:ring-natural-primary/20 appearance-none text-natural-text"
                        value={currentForm.theme?.bodyFont || 'var(--font-sans)'}
                        onChange={(e) => updateForm({ theme: { ...currentForm.theme, bodyFont: e.target.value } })}
                        style={{ fontFamily: currentForm.theme?.bodyFont }}
                      >
                        {FONT_OPTIONS.map(font => (
                          <option key={font.name} value={font.value} style={{ fontFamily: font.value }}>{font.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="settings" className="mt-0 outline-none">
          <div className="max-w-[720px] mx-auto py-12 px-6">
            <div className="w-full bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] p-12 border border-natural-border">
              <h2 className="text-2xl font-serif mb-8 text-natural-text">Form Settings</h2>
              
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Show progress bar
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Display a visual progress bar indicating the percentage of answered questions.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Respondents will see a progress bar at the top of the form.</p>
                  </div>
                  <Switch 
                    checked={currentForm.settings?.showProgressBar || false}
                    onCheckedChange={(checked) => updateForm({ settings: { ...currentForm.settings, showProgressBar: checked } })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Collect email addresses
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Forces respondents to enter a valid email address before submitting.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Respondents will be required to enter their email.</p>
                  </div>
                  <Switch 
                    checked={currentForm.settings?.collectEmails || false}
                    onCheckedChange={(checked) => updateForm({ settings: { ...currentForm.settings, collectEmails: checked } })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Limit to 1 response
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Restricts respondents to one submission per session to prevent duplicate entries.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Respondents can only submit the form once.</p>
                  </div>
                  <Switch 
                    checked={currentForm.settings?.limitOneResponse || false}
                    onCheckedChange={(checked) => updateForm({ settings: { ...currentForm.settings, limitOneResponse: checked } })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Public access
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Allows anyone with the link to view and submit the form without needing an account.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Allow anyone with the link to view and submit the form.</p>
                  </div>
                  <Switch 
                    checked={currentForm.settings?.isPublic ?? true}
                    onCheckedChange={(checked) => updateForm({ settings: { ...currentForm.settings, isPublic: checked } })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Publish immediately
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Makes your form live and accepting responses as soon as you share the link.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Make the form available immediately to respondents.</p>
                  </div>
                  <Switch 
                    checked={currentForm.settings?.publishImmediately ?? true}
                    onCheckedChange={(checked) => updateForm({ settings: { ...currentForm.settings, publishImmediately: checked } })}
                  />
                </div>

                <div className="flex items-start justify-between">
                  <div className="space-y-1 pr-6 flex-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Expiration Date
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Sets an automatic cutoff point when the form will stop accepting new responses.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Specify a date and time after which the form will no longer accept responses.</p>
                  </div>
                  <div className="flex-1 max-w-[300px]">
                    <Input 
                      type="datetime-local"
                      value={currentForm.settings?.expirationDate || ''}
                      onChange={(e) => updateForm({ settings: { ...currentForm.settings, expirationDate: e.target.value } })}
                      className="rounded-xl bg-natural-bg border-natural-border"
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between border-t border-natural-border pt-8">
                  <div className="space-y-1 pr-6 flex-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Thank you message
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>The post-submission message respondents see. Ignored if a redirect URL is set.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Customize the message shown after submission (ignored if a redirect URL is set).</p>
                  </div>
                  <div className="flex-1 max-w-[300px]">
                    <textarea 
                      placeholder="Thanks for submitting!"
                      value={currentForm.settings?.thankYouMessage || ''}
                      onChange={(e) => updateForm({ settings: { ...currentForm.settings, thankYouMessage: e.target.value } })}
                      className="w-full h-24 bg-natural-bg rounded-xl border border-natural-border p-3 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 resize-none disabled:opacity-50"
                      disabled={!!currentForm.settings?.redirectUrlAfterSubmit}
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between border-t border-natural-border pt-8">
                  <div className="space-y-1 pr-6 flex-1">
                    <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                      Redirect on completion
                      <Tooltip>
                        <TooltipTrigger type="button" className="cursor-help">
                          <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Sends respondents to another webpage (like your homepage) immediately after submission.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <p className="text-sm text-natural-muted">Send respondents to a custom URL instead of showing a thank you message.</p>
                  </div>
                  <div className="flex-1 max-w-[300px]">
                    <Input 
                      placeholder="https://example.com/thanks"
                      value={currentForm.settings?.redirectUrlAfterSubmit || ''}
                      onChange={(e) => updateForm({ settings: { ...currentForm.settings, redirectUrlAfterSubmit: e.target.value } })}
                      className="w-full h-10 bg-natural-bg border-natural-border"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col border-t border-natural-border pt-8">
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1 pr-6 flex-1">
                      <Label className="text-base font-medium text-natural-text flex items-center gap-2">
                        Custom Domain
                        <Tooltip>
                          <TooltipTrigger type="button" className="cursor-help">
                            <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Displays the form on your own branded URL instead of the default FormFlow link.</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <p className="text-sm text-natural-muted">Host your form on a subset of your own domain to maintain brand consistency.</p>
                    </div>
                    <div className="flex-1 max-w-[300px] flex flex-col gap-1">
                      <Input 
                        placeholder="https://forms.yourdomain.com"
                        value={currentForm.settings?.customDomain || ''}
                        onChange={handleDomainChange}
                        className={`w-full h-10 bg-natural-bg ${domainError ? 'border-destructive focus-visible:ring-destructive' : 'border-natural-border'}`}
                      />
                      {domainError && <span className="text-xs text-destructive mt-1">{domainError}</span>}
                    </div>
                  </div>

                  {currentForm.settings?.customDomain && !domainError && (
                    <div className="bg-natural-bg/50 border border-natural-border rounded-2xl p-6 mt-2 space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-natural-text">DNS Setup Required</h4>
                        <p className="text-xs text-natural-muted leading-relaxed">
                          To connect your custom domain, you'll need to create a <strong>CNAME</strong> record in your DNS provider's settings pointing to:
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between bg-white border border-natural-border px-4 py-2 rounded-xl">
                        <code className="text-xs font-mono text-natural-primary">cname.formflow.app</code>
                        <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase tracking-wider font-bold" onClick={() => {
                          navigator.clipboard.writeText('cname.formflow.app');
                          toast.success('CNAME value copied');
                        }}>Copy</Button>
                      </div>

                      <div className="p-3 bg-white border border-natural-border rounded-xl break-all">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-natural-muted block mb-2">Live Public Link</span>
                        <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-natural-primary hover:underline font-medium break-all">
                          {shareUrl}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const SortableQuestionItem = ({ formId, question, allQuestions, updateQuestion, removeQuestion, duplicateQuestion, accentColor, titleFont, bodyFont }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [previewValue, setPreviewValue] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const handlePreviewChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPreviewValue(val);
    
    if (!val && question.required) {
      setPreviewError('This field is required');
      return;
    }

    if (val) {
      if (['short_answer', 'paragraph', 'email'].includes(question.type)) {
        if (question.validation?.minLength !== undefined && val.length < question.validation.minLength) {
          setPreviewError(`Must be at least ${question.validation.minLength} characters`);
          return;
        }
        if (question.validation?.maxLength !== undefined && val.length > question.validation.maxLength) {
          setPreviewError(`Must be at most ${question.validation.maxLength} characters`);
          return;
        }

        if (question.validation?.pattern) {
          try {
            const regex = new RegExp(question.validation.pattern);
            if (!regex.test(val)) {
              setPreviewError('Format does not match required pattern');
              return;
            }
          } catch (e) {
            console.error('Invalid regex pattern:', e);
          }
        }
      }

      if (question.type === 'email') {
        fetch('/api/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: val })
        })
        .then(res => res.json())
        .then(data => {
          if (!data.valid) {
            setPreviewError(data.error);
          } else {
            setPreviewError('');
          }
        })
        .catch(err => {
          console.error('Email validation error:', err);
          setPreviewError('');
        });
        return;
      } else if (question.type === 'number') {
        const num = Number(val);
        if (isNaN(num)) {
          setPreviewError('Must be a number');
          return;
        }
        if (question.validation?.min !== undefined && num < question.validation.min) {
          setPreviewError(`Must be at least ${question.validation.min}`);
          return;
        }
        if (question.validation?.max !== undefined && num > question.validation.max) {
          setPreviewError(`Must be at most ${question.validation.max}`);
          return;
        }
      } else if (question.type === 'date') {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        const [year, month, day] = val.split('-');
        const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
        
        if (question.validation?.dateConstraint === 'past' && parsedDate >= currentDate) {
          setPreviewError('Date must be in the past');
          return;
        } else if (question.validation?.dateConstraint === 'future' && parsedDate <= currentDate) {
          setPreviewError('Date must be in the future');
          return;
        }
        if (question.validation?.minDate && val < question.validation.minDate) {
          setPreviewError(`Date must be on or after ${question.validation.minDate}`);
          return;
        }
        if (question.validation?.maxDate && val > question.validation.maxDate) {
          setPreviewError(`Date must be on or before ${question.validation.maxDate}`);
          return;
        }
      } else if (question.type === 'time') {
        if (question.validation?.minTime && val < question.validation.minTime) {
          setPreviewError(`Time must be after ${question.validation.minTime}`);
          return;
        }
        if (question.validation?.maxTime && val > question.validation.maxTime) {
          setPreviewError(`Time must be before ${question.validation.maxTime}`);
          return;
        }
      }
    }
    
    setPreviewError('');
  };

  const addOption = () => {
    const options = [...(question.options || []), `Option ${(question.options?.length || 0) + 1}`];
    updateQuestion(question.id, { options });
  };

  const addOtherOption = () => {
    updateQuestion(question.id, { hasOtherOption: true });
  };

  const removeOtherOption = () => {
    updateQuestion(question.id, { hasOtherOption: false });
  };

  const removeOption = (index: number) => {
    const options = question.options.filter((_: any, i: number) => i !== index);
    const optionImages = question.optionImages ? question.optionImages.filter((_: any, i: number) => i !== index) : undefined;
    updateQuestion(question.id, { options, optionImages });
  };

  const updateOption = (index: number, value: string) => {
    const options = [...question.options];
    options[index] = value;
    updateQuestion(question.id, { options });
  };

  const updateOptionImage = (index: number, imageUrl: string) => {
    const optionImages = [...(question.optionImages || [])];
    // Fill empty spots if necessary
    for (let i = 0; i < index; i++) {
        if (!optionImages[i]) optionImages[i] = '';
    }
    optionImages[index] = imageUrl;
    updateQuestion(question.id, { optionImages });
  };

  const removeOptionImage = (index: number) => {
    if (!question.optionImages) return;
    const optionImages = [...question.optionImages];
    optionImages[index] = '';
    updateQuestion(question.id, { optionImages });
  };

  const questionIndex = allQuestions?.findIndex((q: any) => q.id === question.id) ?? -1;
  const previousQuestions = questionIndex > 0 ? allQuestions.slice(0, questionIndex) : [];

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-10 border border-natural-border relative ring-2 ring-transparent transition-all" style={{ '--tw-ring-color': accentColor ? `${accentColor}1a` : undefined } as any}>
        <div 
          {...attributes} 
          {...listeners} 
          className="absolute left-1/2 -top-3 -translate-x-1/2 px-3 py-1 bg-natural-accent rounded-full text-[9px] uppercase tracking-widest font-bold text-natural-muted border border-natural-border cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Drag to Reorder
        </div>
        
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="relative flex-1 w-full">
              <input 
                aria-label="Question Title"
                value={question.title}
                onChange={(e) => updateQuestion(question.id, { title: e.target.value })}
                placeholder="Question"
                className="w-full text-xl font-medium bg-natural-bg p-4 pr-8 rounded-2xl focus:outline-none border border-natural-border text-natural-text"
                style={{ fontFamily: bodyFont || 'var(--font-sans)' }}
              />
              {question.required && (
                <span className="absolute right-4 top-4 text-destructive text-xl font-medium">*</span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-3 px-6 py-4 bg-white border border-natural-border rounded-2xl text-xs font-semibold text-natural-primary hover:bg-natural-accent transition-colors w-full md:w-auto min-w-[200px] justify-between cursor-pointer">
                <div className="flex items-center gap-2" style={{ color: accentColor || undefined }}>
                  {(() => {
                    const Icon = QUESTION_TYPES.find(qt => qt.type === question.type)?.icon;
                    return Icon ? <Icon className="h-4 w-4" /> : null;
                  })()}
                  {QUESTION_TYPES.find(qt => qt.type === question.type)?.label}
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-2xl">
                {QUESTION_TYPES.map((qt) => (
                  <DropdownMenuItem key={qt.type} onClick={() => updateQuestion(question.id, { type: qt.type })} className="rounded-xl py-2 cursor-pointer">
                    <qt.icon className="mr-2 h-4 w-4" />
                    {qt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Options for choices */}
          {(question.type === 'multiple_choice' || question.type === 'checkbox' || question.type === 'dropdown') && (
            <div className="space-y-4 pt-2">
              {question.options?.map((option: string, index: number) => (
                <div key={index} className="flex flex-col gap-2 group/option">
                  <div className="flex items-center gap-4">
                    <div className={`w-5 h-5 rounded-full border-2 border-natural-border shrink-0 ${question.type === 'checkbox' ? 'rounded-md' : ''}`}></div>
                    <input 
                      aria-label={`Option ${index + 1}`}
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="text-base bg-transparent border-b border-transparent focus:border-natural-border focus:outline-none py-1 flex-1 text-natural-text"
                    />
                    {(question.type === 'multiple_choice' || question.type === 'checkbox') && (
                      <div className="relative">
                        <input 
                          aria-label={`Upload image for option ${index + 1}`}
                          type="file" 
                          accept="image/*" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                toast.error('Image size must be less than 2MB');
                                return;
                              }

                              try {
                                const imageUrl = await uploadImageAsset(file, { formId });
                                updateOptionImage(index, imageUrl);
                              } catch (error) {
                                console.error('Option image upload failed:', error);
                                toast.error('Failed to upload option image');
                              }
                            }
                          }} 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                        />
                        <button 
                          aria-label={`Add image to Option ${index + 1}`}
                          type="button"
                          className="opacity-0 group-hover/option:opacity-100 focus-visible:opacity-100 p-2 text-natural-muted hover:text-natural-primary transition-opacity cursor-pointer flex items-center justify-center" 
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <button 
                      aria-label={`Remove Option ${index + 1}`}
                      type="button"
                      className="opacity-0 group-hover/option:opacity-100 focus-visible:opacity-100 p-2 text-red-300 hover:text-red-500 transition-opacity cursor-pointer" 
                      onClick={() => removeOption(index)}
                      disabled={question.options.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                  {question.optionImages?.[index] && (
                    <div className="ml-9 w-32 h-32 rounded-xl border border-natural-border relative group/image">
                      <img src={question.optionImages[index]} alt={`Option ${index + 1}`} className="w-full h-full object-cover rounded-xl" />
                      <button 
                        type="button"
                        aria-label={`Remove image for option ${index + 1}`}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black text-white rounded-lg opacity-0 group-hover/image:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => removeOptionImage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {question.hasOtherOption && (
                <div className="flex items-center gap-4 group/option">
                  <div className={`w-5 h-5 rounded-full border-2 border-natural-border ${question.type === 'multiple_choice' ? 'rounded-full' : 'rounded-md'}`}></div>
                  <input 
                    type="text" 
                    value="Other..." 
                    disabled 
                    className="flex-1 bg-transparent text-sm text-natural-text outline-none opacity-60 font-medium"
                  />
                  <button 
                    type="button"
                    aria-label="Remove Other option"
                    className="opacity-0 group-hover/option:opacity-100 focus-visible:opacity-100 p-2 text-red-300 hover:text-red-500 transition-opacity cursor-pointer" 
                    onClick={removeOtherOption}
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className={`w-5 h-5 border-2 border-natural-border border-dashed ${question.type === 'multiple_choice' ? 'rounded-full' : 'rounded-md'}`}></div>
                <div className="text-sm font-bold tracking-tight">
                  <button type="button" onClick={addOption} className="text-natural-muted hover:text-natural-primary cursor-pointer">
                    Add option
                  </button>
                  {!question.hasOtherOption && (
                    <>
                      <span className="opacity-40 font-normal text-natural-muted mx-1">or</span>
                      <button 
                        type="button" 
                        onClick={addOtherOption} 
                        className="text-natural-primary hover:opacity-80 cursor-pointer" 
                        style={{ color: accentColor || undefined }}
                      >
                        add "Other"
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Simple inputs for others */}
          {question.type === 'short_answer' && (
            <div className="pt-2">
              <input 
                aria-label="Short answer text preview"
                type="text" 
                placeholder="Short answer text"
                value={previewValue}
                onChange={handlePreviewChange}
                className={`w-full md:w-1/2 h-12 bg-natural-bg rounded-xl border flex items-center px-4 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 ${previewError ? 'border-destructive' : 'border-natural-border'}`} 
              />
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'email' && (
            <div className="pt-2">
              <div className="flex items-center gap-3 w-full md:w-1/2">
                <div className="relative flex-1">
                  <input 
                    aria-label="Email address preview"
                    type="email" 
                    placeholder="Email address"
                    value={previewValue}
                    onChange={handlePreviewChange}
                    className={`w-full h-12 bg-natural-bg rounded-xl border flex items-center px-4 pr-10 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 ${previewError ? 'border-destructive focus-visible:ring-destructive/20' : previewValue ? 'border-green-500 focus-visible:ring-green-500/20' : 'border-natural-border'}`} 
                  />
                  {previewValue && !previewError && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button type="button" className="text-natural-muted hover:text-natural-primary transition-colors flex-shrink-0 cursor-help" aria-label="Email format information" />
                    }
                  >
                      <Info className="h-5 w-5" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-sm">Must be a valid email address format (e.g., name@example.com).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'number' && (
            <div className="pt-2">
              <input 
                aria-label="Number preview"
                type="number" 
                placeholder="Number"
                value={previewValue}
                onChange={handlePreviewChange}
                className={`w-full md:w-1/2 h-12 bg-natural-bg rounded-xl border flex items-center px-4 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 ${previewError ? 'border-destructive' : 'border-natural-border'}`} 
              />
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'paragraph' && (
            <div className="pt-2">
              <textarea 
                aria-label="Long answer text preview"
                placeholder="Long answer text"
                value={previewValue}
                onChange={handlePreviewChange}
                className={`w-full h-24 bg-natural-bg rounded-2xl border flex items-start p-4 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 resize-none ${previewError ? 'border-destructive' : 'border-natural-border'}`} 
              />
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'date' && (
            <div className="pt-2">
              <input 
                aria-label="Date preview"
                type="date" 
                placeholder="Date"
                value={previewValue}
                onChange={handlePreviewChange}
                className={`w-full md:w-1/2 h-12 bg-natural-bg rounded-xl border flex items-center px-4 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 ${previewError ? 'border-destructive' : 'border-natural-border'}`} 
              />
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'time' && (
            <div className="pt-2">
              <input 
                aria-label="Time preview"
                type="time" 
                placeholder="Time"
                value={previewValue}
                onChange={handlePreviewChange}
                className={`w-full md:w-1/2 h-12 bg-natural-bg rounded-xl border flex items-center px-4 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/10 ${previewError ? 'border-destructive' : 'border-natural-border'}`} 
              />
              {previewError && <div className="text-destructive text-xs mt-1.5">{previewError}</div>}
            </div>
          )}
          {question.type === 'image_upload' && (
            <div className="pt-2">
              <div className="w-full md:w-1/2 h-20 border-2 border-dashed border-natural-border rounded-xl flex items-center justify-center text-natural-muted bg-natural-bg/50 pointer-events-none">
                <div className="flex flex-col items-center gap-1">
                  <UploadCloud className="h-5 w-5" />
                  <span className="text-xs font-medium">Respondents can upload up to 5 images here (max 5MB each)</span>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <div className="mt-6 p-6 rounded-2xl bg-natural-accent/30 border border-natural-border space-y-8 animate-in fade-in slide-in-from-top-2">
              {['number', 'date', 'time', 'short_answer', 'paragraph', 'email', 'checkbox'].includes(question.type) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-natural-primary">
                    <Settings className="h-4 w-4" />
                    Validation Rules
                  </div>
                  
                  <div className="bg-white p-4 rounded-xl border border-natural-border">
                    {['short_answer', 'paragraph', 'email'].includes(question.type) && (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                              Min Characters
                              <Tooltip>
                                <TooltipTrigger type="button" className="cursor-help">
                                  <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent><p>Sets a lower limit on response length to ensure detailed answers.</p></TooltipContent>
                              </Tooltip>
                            </label>
                            <input 
                              type="number" 
                              aria-label="Minimum Characters"
                              value={question.validation?.minLength ?? ''} 
                              onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })}
                              className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                              placeholder="No min"
                            />
                          </div>
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                              Max Characters
                              <Tooltip>
                                <TooltipTrigger type="button" className="cursor-help">
                                  <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent><p>Sets an upper limit to keep responses brief.</p></TooltipContent>
                              </Tooltip>
                            </label>
                            <input 
                              type="number" 
                              aria-label="Maximum Characters"
                              value={question.validation?.maxLength ?? ''} 
                              onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })}
                              className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                              placeholder="No max"
                            />
                          </div>
                        </div>
                        {['short_answer', 'paragraph', 'email'].includes(question.type) && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                              Regex Pattern (Validation)
                              <Tooltip>
                                <TooltipTrigger type="button" className="cursor-help">
                                  <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent><p>Advanced validation using Regular Expressions (e.g., ^[0-9]+$ for numbers).</p></TooltipContent>
                              </Tooltip>
                            </label>
                            <input 
                              type="text" 
                              aria-label="Regex Pattern"
                              value={question.validation?.pattern || ''} 
                              onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, pattern: e.target.value || undefined } })}
                              className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20 font-mono"
                              placeholder="e.g. ^[0-9]{5}$"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {question.type === 'checkbox' && (
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                        <div className="space-y-1 flex-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Min Selections
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>Requires respondents to choose at least this many checkboxes.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="number" 
                            aria-label="Minimum Selections"
                            value={question.validation?.minSelections ?? ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, minSelections: e.target.value ? Number(e.target.value) : undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                            placeholder="No min"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Max Selections
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>Prevents respondents from choosing more than this many checkboxes.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="number" 
                            aria-label="Maximum Selections"
                            value={question.validation?.maxSelections ?? ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, maxSelections: e.target.value ? Number(e.target.value) : undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                            placeholder="No max"
                          />
                        </div>
                      </div>
                    )}

                    {question.type === 'number' && (
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                        <div className="space-y-1 flex-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Minimum Value
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>The smallest number allowed as a valid response.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="number" 
                            aria-label="Minimum Value"
                            value={question.validation?.min ?? ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, min: e.target.value ? Number(e.target.value) : undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                            placeholder="No limit"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Maximum Value
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>The largest number allowed as a valid response.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="number" 
                            aria-label="Maximum Value"
                            value={question.validation?.max ?? ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, max: e.target.value ? Number(e.target.value) : undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                            placeholder="No limit"
                          />
                        </div>
                      </div>
                    )}

                    {question.type === 'date' && (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Date Constraints
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>Forces respondents to pick dates exclusively in the past or future.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <select 
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20 bg-white"
                            value={question.validation?.dateConstraint || 'none'}
                            onChange={(e) => updateQuestion(question.id, { 
                              validation: { 
                                ...question.validation, 
                                dateConstraint: e.target.value as 'past' | 'future' | 'none' 
                              } 
                            })}
                          >
                            <option value="none">Allow any date</option>
                            <option value="past">Must be a date in the past</option>
                            <option value="future">Must be a date in the future</option>
                          </select>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                              Minimum Date
                              <Tooltip>
                                <TooltipTrigger type="button" className="cursor-help">
                                  <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent><p>The earliest calendar date a respondent can select.</p></TooltipContent>
                              </Tooltip>
                            </label>
                            <input 
                              type="date" 
                              aria-label="Minimum Date"
                              value={question.validation?.minDate ?? ''} 
                              onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, minDate: e.target.value || undefined } })}
                              className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20 bg-white"
                            />
                          </div>
                          <div className="space-y-1 flex-1">
                            <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                              Maximum Date
                              <Tooltip>
                                <TooltipTrigger type="button" className="cursor-help">
                                  <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent><p>The latest calendar date a respondent can select.</p></TooltipContent>
                              </Tooltip>
                            </label>
                            <input 
                              type="date" 
                              aria-label="Maximum Date"
                              value={question.validation?.maxDate ?? ''} 
                              onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, maxDate: e.target.value || undefined } })}
                              className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {question.type === 'time' && (
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                        <div className="space-y-1 flex-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Minimum Time
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>The earliest time of day allowed as a response.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="time" 
                            aria-label="Minimum Time"
                            value={question.validation?.minTime || ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, minTime: e.target.value || undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-natural-muted flex items-center gap-1">
                            Maximum Time
                            <Tooltip>
                              <TooltipTrigger type="button" className="cursor-help">
                                <Info className="h-3 w-3 hover:text-natural-primary transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent><p>The latest time of day allowed as a response.</p></TooltipContent>
                            </Tooltip>
                          </label>
                          <input 
                            type="time" 
                            aria-label="Maximum Time"
                            value={question.validation?.maxTime || ''} 
                            onChange={(e) => updateQuestion(question.id, { validation: { ...question.validation, maxTime: e.target.value || undefined } })}
                            className="w-full h-9 rounded-lg border border-natural-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-natural-primary">
                    <GitBranch className="h-4 w-4" />
                    Conditional Logic
                    <Tooltip>
                      <TooltipTrigger type="button" className="cursor-help">
                        <Info className="h-4 w-4 text-natural-muted hover:text-natural-primary transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent><p>Dynamically reveals or hides this question based on answers to prior questions.</p></TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch 
                    checked={!!question.logic}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateQuestion(question.id, { 
                          logic: { 
                            action: 'show', 
                            matchType: 'all', 
                            conditions: [{ questionId: '', operator: 'equals', value: '' }] 
                          } 
                        });
                      } else {
                        updateQuestion(question.id, { logic: undefined });
                      }
                    }}
                  />
                </div>
                
                {question.logic && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-white px-4 py-2 border border-natural-border rounded-xl">
                      <select
                        className="h-8 bg-transparent text-sm font-semibold focus:outline-none text-natural-primary cursor-pointer"
                        value={question.logic.action}
                        onChange={(e) => updateQuestion(question.id, { logic: { ...question.logic!, action: e.target.value as 'show' | 'hide' } })}
                      >
                        <option value="show">Show</option>
                        <option value="hide">Hide</option>
                      </select>
                      <span className="text-sm text-natural-muted">this question if</span>
                      <select
                        className="h-8 bg-transparent text-sm font-semibold focus:outline-none text-natural-primary cursor-pointer"
                        value={question.logic.matchType}
                        onChange={(e) => updateQuestion(question.id, { logic: { ...question.logic!, matchType: e.target.value as 'all' | 'any' } })}
                      >
                        <option value="all">ALL</option>
                        <option value="any">ANY</option>
                      </select>
                      <span className="text-sm text-natural-muted">of the following match:</span>
                    </div>
                    
                    <div className="space-y-2 pl-4 border-l-2 border-natural-border">
                      {question.logic.conditions.map((condition: any, idx: number) => (
                        <div key={idx} className="flex gap-2 bg-white p-2 rounded-xl border border-natural-border shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                          <select
                            className="flex-1 h-9 px-3 rounded-lg border border-natural-border bg-natural-bg/50 text-sm focus:outline-none"
                            value={condition.questionId}
                            onChange={(e) => {
                              const newConditions = [...question.logic!.conditions];
                              newConditions[idx].questionId = e.target.value;
                              updateQuestion(question.id, { logic: { ...question.logic!, conditions: newConditions } });
                            }}
                          >
                            <option value="">Select a previous question...</option>
                            {previousQuestions.map((q: any) => (
                              <option key={q.id} value={q.id}>{q.title || 'Untitled Question'}</option>
                            ))}
                          </select>
                          
                          <select
                            className="w-[140px] h-9 px-3 rounded-lg border border-natural-border bg-natural-bg/50 text-sm focus:outline-none"
                            value={condition.operator}
                            onChange={(e) => {
                              const newConditions = [...question.logic!.conditions];
                              newConditions[idx].operator = e.target.value;
                              updateQuestion(question.id, { logic: { ...question.logic!, conditions: newConditions } });
                            }}
                          >
                            <option value="equals">is equal to</option>
                            <option value="not_equals">is not equal to</option>
                            <option value="contains">contains</option>
                            <option value="greater_than">greater than</option>
                            <option value="less_than">less than</option>
                          </select>
                          
                          <input
                            className="flex-1 h-9 px-3 rounded-lg border border-natural-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-natural-primary/20"
                            placeholder="Value..."
                            value={condition.value}
                            onChange={(e) => {
                              const newConditions = [...question.logic!.conditions];
                              newConditions[idx].value = e.target.value;
                              updateQuestion(question.id, { logic: { ...question.logic!, conditions: newConditions } });
                            }}
                          />
                          
                          <button 
                            type="button"
                            aria-label="Remove Logic Condition"
                            onClick={() => {
                              const newConditions = question.logic!.conditions.filter((_: any, i: number) => i !== idx);
                              updateQuestion(question.id, { logic: { ...question.logic!, conditions: newConditions } });
                            }}
                            className="w-9 h-9 flex items-center justify-center text-natural-muted hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      type="button"
                      aria-label="Add Logic Condition"
                      onClick={() => {
                        const newConditions = [...question.logic!.conditions, { questionId: '', operator: 'equals', value: '' }];
                        updateQuestion(question.id, { logic: { ...question.logic!, conditions: newConditions } });
                      }}
                      className="flex items-center gap-1.5 text-sm font-semibold text-natural-primary hover:bg-natural-primary/10 px-4 py-2 rounded-xl transition-colors ml-4 border border-transparent hover:border-natural-primary/20"
                    >
                      <Plus className="h-4 w-4" /> Add Condition
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-natural-accent flex items-center justify-end gap-6 text-natural-muted relative">
            <div className="absolute left-0">
              <button 
                type="button"
                aria-expanded={showSettings}
                aria-controls="advanced-settings-panel"
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 text-sm font-medium transition-colors px-3 py-1.5 rounded-lg border ${showSettings ? 'bg-natural-primary text-white border-transparent' : 'bg-transparent text-natural-muted hover:text-natural-primary hover:bg-natural-accent border-natural-border'}`}
                style={showSettings ? { backgroundColor: accentColor || undefined } : {}}
              >
                <Settings className="h-4 w-4" />
                Advanced Settings
                {showSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            
            <button type="button" aria-label="Duplicate question" onClick={() => duplicateQuestion(question.id)} className="hover:text-natural-primary transition-colors hover:bg-natural-accent p-2 rounded-lg" title="Duplicate"><Copy className="h-5 w-5" /></button>
            <button type="button" aria-label="Delete question" className="hover:text-destructive transition-colors hover:bg-destructive/10 p-2 rounded-lg" title="Delete" onClick={() => removeQuestion(question.id)}><Trash2 className="h-5 w-5" /></button>
            <div className="h-6 w-[1px] bg-natural-border"></div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1">
                Required
                <Tooltip>
                  <TooltipTrigger type="button" className="cursor-help">
                    <Info className="h-3 w-3 text-natural-muted hover:text-natural-primary transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent><p>Prevents respondents from submitting the form without answering this question.</p></TooltipContent>
                </Tooltip>
              </span>
              <Switch 
                checked={question.required} 
                onCheckedChange={(checked) => updateQuestion(question.id, { required: checked })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
