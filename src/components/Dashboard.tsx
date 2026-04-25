'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Form } from '../types';
import { createFormRecord, deleteFormRecord, listAccessibleForms } from '../lib/formsApi';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, FileText, BarChart2, MoreVertical, PartyPopper, MessageSquare, Briefcase, Search, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';

interface DashboardProps {
  onEdit: (formId: string) => void;
  onViewResults: (formId: string) => void;
}

const TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Form',
    icon: Plus,
    color: 'bg-natural-card',
    data: {
      title: 'Untitled Form',
      description: 'Add a description here',
      questions: [
        { id: crypto.randomUUID(), type: 'section', title: 'Start here', description: 'Use this section to group your first questions.', required: false },
        { id: crypto.randomUUID(), type: 'short_answer', title: 'Untitled Question', required: false },
      ],
      settings: { collectEmails: false, limitOneResponse: false, isPublic: true },
    }
  },
  {
    id: 'party',
    title: 'Party Invite',
    icon: PartyPopper,
    color: 'bg-orange-50',
    data: {
      title: 'Party Invitation',
      description: 'Join us for a celebration!',
      theme: { accentColor: '#ea580c', backgroundColor: '#fff7ed' },
      questions: [
        { id: crypto.randomUUID(), type: 'short_answer', title: 'What is your name?', required: true },
        { id: crypto.randomUUID(), type: 'multiple_choice', title: 'Can you attend?', options: ['Yes, count me in!', 'Sorry, cannot make it.'], required: true },
      ],
      settings: { collectEmails: false, limitOneResponse: true, isPublic: true },
    }
  },
  {
    id: 'feedback',
    title: 'Customer Feedback',
    icon: MessageSquare,
    color: 'bg-blue-50',
    data: {
      title: 'Customer Feedback',
      description: 'We value your feedback to help us improve.',
      theme: { accentColor: '#0284c7', backgroundColor: '#f0f9ff' },
      questions: [
        { id: crypto.randomUUID(), type: 'short_answer', title: 'How did you hear about us?', required: false },
        { id: crypto.randomUUID(), type: 'paragraph', title: 'Any suggestions for improvement?', required: false },
      ],
      settings: { collectEmails: true, limitOneResponse: true, isPublic: true },
    }
  },
  {
    id: 'contact',
    title: 'Contact Information',
    icon: Briefcase,
    color: 'bg-teal-50',
    data: {
      title: 'Contact Information',
      description: 'Please leave your contact details so we can reach you.',
      theme: { accentColor: '#0d9488', backgroundColor: '#f0fdf4' },
      questions: [
        { id: crypto.randomUUID(), type: 'short_answer', title: 'Full Name', required: true },
        { id: crypto.randomUUID(), type: 'short_answer', title: 'Email Address', required: true },
        { id: crypto.randomUUID(), type: 'short_answer', title: 'Phone Number', required: false },
      ],
      settings: { collectEmails: false, limitOneResponse: false, isPublic: true },
    }
  }
];

export const Dashboard: React.FC<DashboardProps> = ({ onEdit, onViewResults }) => {
  const { user } = useAuthStore();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title_asc' | 'title_desc'>('newest');

  const filteredForms = useMemo(() => {
    let result = [...forms];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.title.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q)));
    }
    
    result.sort((a, b) => {
      if (sortBy === 'newest') return b.updatedAt - a.updatedAt;
      if (sortBy === 'oldest') return a.updatedAt - b.updatedAt;
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
      if (sortBy === 'title_desc') return b.title.localeCompare(a.title);
      return 0;
    });

    return result;
  }, [forms, searchQuery, sortBy]);

  useEffect(() => {
    const fetchForms = async () => {
      if (!user) return;
      try {
        setForms(await listAccessibleForms(user.uid));
      } catch (error) {
        console.error('Error fetching forms:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, [user]);

  const createForm = async (templateData: any = TEMPLATES[0].data) => {
    if (!user) return;

    const hasSection = templateData.questions?.some((question: any) => question.type === 'section');
    const questions = hasSection
      ? templateData.questions
      : [
          { id: crypto.randomUUID(), type: 'section', title: 'Start here', description: 'Use this section to organize the first part of your form.', required: false },
          ...templateData.questions,
        ];

    const newForm: Omit<Form, 'id'> = {
      ...templateData,
      creatorId: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Ensure new IDs for questions if importing a template with predefined questions
      questions: questions.map((q: any) => ({ ...q, id: crypto.randomUUID() }))
    };

    try {
      const createdForm = await createFormRecord(newForm);
      onEdit(createdForm.id);
    } catch (error) {
      console.error('Error creating form:', error);
    }
  };

  const handleDeleteForm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this form?')) {
      setForms(prev => prev.filter(f => f.id !== id));
      try {
        await deleteFormRecord(id);
      } catch (error) {
        console.error('Error deleting form:', error);
      }
    }
  };

  return (
    <div className="container mx-auto p-8 space-y-10 grid-ambient">
      <div className="flex items-center justify-between surface-glass p-8">
        <div>
          <h2 className="text-4xl font-serif font-light text-natural-text">Your Realm</h2>
          <p className="text-natural-muted mt-1">Manage your surveys and responses in peace.</p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={() => createForm()} className="btn-natural">
            <Plus className="mr-2 h-4 w-4" />
            Create New Form
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-natural-text px-2">Start a new form</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {TEMPLATES.map((template) => (
            <div 
              key={template.id} 
              onClick={() => createForm(template.data)}
              className={`rounded-2xl border border-natural-border p-6 cursor-pointer hover:shadow-md transition-all duration-300 hover:border-natural-primary/30 flex flex-col items-center justify-center gap-4 text-center interactive-lift ${template.color}`}
            >
              <div className="p-4 bg-natural-bg rounded-full shadow-sm">
                <template.icon className="h-6 w-6 text-natural-primary" />
              </div>
              <span className="font-medium text-natural-text">{template.title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-natural-border">
        <h3 className="text-lg font-medium text-natural-text px-2 mb-6">Recent forms</h3>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-natural-primary border-t-transparent"></div>
        </div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-natural-card rounded-[32px] border-2 border-dashed border-natural-border">
          <FileText className="h-16 w-16 text-natural-border mb-4" />
          <h3 className="text-xl font-medium text-natural-primary">A quiet start</h3>
          <p className="text-natural-muted mb-8 max-w-sm text-center">Your form collection is empty. Plant a new seed to begin.</p>
          <Button onClick={() => createForm()} variant="outline" className="rounded-full border-natural-primary text-natural-primary hover:bg-natural-accent">
            Create First Form
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-natural-muted" />
              <Input
                placeholder="Search forms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-full bg-natural-card border-natural-border h-11"
              />
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full sm:w-48 h-11 rounded-full border border-natural-border bg-natural-card px-4 py-2 text-sm text-natural-text outline-none focus:ring-2 focus:ring-natural-primary/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_1rem_center] bg-no-repeat pr-10"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="title_desc">Title (Z-A)</option>
              </select>
            </div>
          </div>
          
          {filteredForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-natural-card rounded-[32px] border-2 border-dashed border-natural-border">
              <Search className="h-16 w-16 text-natural-border mb-4" />
              <h3 className="text-xl font-medium text-natural-primary">No results found</h3>
              <p className="text-natural-muted text-center max-w-sm mt-2">We couldn't find any forms matching your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredForms.map((form, index) => (
            <motion.div
              key={form.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="card-natural interactive-lift group h-full flex flex-col border-transparent hover:border-natural-primary/20 cursor-pointer">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-lg font-medium text-natural-primary line-clamp-1">{form.title}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="p-2 rounded-full hover:bg-natural-accent transition-colors cursor-pointer inline-flex items-center justify-center" aria-label="Form actions" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4 text-natural-muted" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-natural-card border-natural-border shadow-md rounded-xl py-1">
                        <DropdownMenuItem className="cursor-pointer hover:bg-natural-accent py-2 px-3 text-natural-text focus:bg-natural-accent" onClick={(e) => { e.stopPropagation(); onEdit(form.id); }}>
                          <FileText className="mr-2 h-4 w-4 text-natural-muted" />
                          Edit Form
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer hover:bg-natural-accent py-2 px-3 text-natural-text focus:bg-natural-accent" onClick={(e) => { e.stopPropagation(); onViewResults(form.id); }}>
                          <BarChart2 className="mr-2 h-4 w-4 text-natural-muted" />
                          View Results
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer hover:bg-natural-accent py-2 px-3 text-natural-text focus:bg-natural-accent" onClick={(e) => { e.stopPropagation(); window.open(`/f/${form.id}`, '_blank'); }}>
                          <ExternalLink className="mr-2 h-4 w-4 text-natural-muted" />
                          Preview Form
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-natural-border" />
                        <DropdownMenuItem className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 py-2 px-3" onClick={(e) => handleDeleteForm(e, form.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Form
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="text-natural-muted leading-relaxed line-clamp-2">
                    {form.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                <div className="mt-auto px-8 pb-8 pt-4">
                  <div className="flex gap-3 pt-6 border-t border-natural-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-full text-natural-muted hover:text-natural-primary hover:bg-natural-accent"
                      onClick={() => onEdit(form.id)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-full text-natural-muted hover:text-natural-primary hover:bg-natural-accent"
                      onClick={() => onViewResults(form.id)}
                    >
                      <BarChart2 className="mr-2 h-4 w-4" />
                      Results
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};
