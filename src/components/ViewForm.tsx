import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, addDoc, collection, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Form, Response } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { CheckCircle2, UploadCloud } from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DarkModeToggle } from './DarkModeToggle';
import { useDarkMode } from '../hooks/useDarkMode';

interface ViewFormProps {
  formId: string;
  isPreview?: boolean;
}

export const ViewForm: React.FC<ViewFormProps> = ({ formId, isPreview = false }) => {
  const { isDark } = useDarkMode();
  const [form, setForm] = useState<Form | null>(null);
  const [answers, setAnswers] = useState<{ [key: string]: any }>({});
  const [otherText, setOtherText] = useState<{ [key: string]: string }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const docRef = doc(db, 'forms', formId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          setForm({ id: snapshot.id, ...snapshot.data() } as Form);
          
          if (!isPreview) {
            try {
              await updateDoc(docRef, {
                views: increment(1)
              });
            } catch (e) {
              console.error('Error updating view count:', e);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching form:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId, isPreview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (Object.values(errors).some(err => err)) {
      toast.error('Please fix the errors in the form before submitting.');
      return;
    }

    // Basic validation for required fields
    const missing = form?.questions?.filter(q => isQuestionVisible(q) && q.required && !answers[q.id]);
    if (missing && missing.length > 0) {
      toast.error(`Please answer required questions: ${missing.map(m => m.title).join(', ')}`);
      return;
    }

    // Server-side validation for emails before submission
    const emailQuestions = form?.questions?.filter(q => isQuestionVisible(q) && q.type === 'email' && answers[q.id]) || [];
    setSubmitting(true);
    for (const q of emailQuestions) {
      try {
        const res = await fetch('/api/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: answers[q.id] })
        });
        const data = await res.json();
        if (!data.valid) {
          setSubmitting(false);
          setErrors(prev => ({ ...prev, [q.id]: data.error }));
          toast.error(`Invalid email in question: ${q.title}`);
          return;
        }
      } catch (err) {
        console.error('Email validation error:', err);
      }
    }
    
    setSubmitting(false);
    setShowConfirmSubmit(true);
  };

  const executeFinalSubmit = async () => {
    setShowConfirmSubmit(false);
    if (isPreview) {
      toast.info('This is a preview. Responses are not saved.');
      // Handle the preview redirect logic if you still want it
      if (form?.settings?.redirectUrlAfterSubmit) {
        toast.success('Redirect simulated in preview');
      }
      setSubmitted(true);
      return;
    }

    setSubmitting(true);

    const timeToComplete = Math.floor((Date.now() - startTime.current) / 1000);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      await addDoc(collection(db, 'forms', formId, 'responses'), {
        formId,
        submittedAt: Date.now(),
        answers,
        timeToComplete,
        timezone,
      });
      
      if (form?.settings?.redirectUrlAfterSubmit && !isPreview) {
        window.location.href = form.settings.redirectUrlAfterSubmit;
      } else {
        setSubmitted(true);
        toast.success(isPreview && form.settings?.redirectUrlAfterSubmit ? 'Redirect simulated in preview' : 'Response submitted successfully');
      }
    } catch (error: any) {
      console.error('Error submitting response:', error);
      toast.error('Failed to submit response: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateAnswer = (question: any, value: any) => {
    setAnswers(prev => ({ ...prev, [question.id]: value }));
    let error = '';
    
    if (!value && question.required) {
      error = 'This field is required';
    } else if (value) {
      if (['short_answer', 'paragraph', 'email'].includes(question.type)) {
        if (question.validation?.minLength !== undefined && value.length < question.validation.minLength) {
          error = `Must be at least ${question.validation.minLength} characters`;
        } else if (question.validation?.maxLength !== undefined && value.length > question.validation.maxLength) {
          error = `Must be at most ${question.validation.maxLength} characters`;
        }

        if (!error && question.validation?.pattern) {
          try {
            const regex = new RegExp(question.validation.pattern);
            if (!regex.test(value)) {
              error = 'Format does not match required pattern';
            }
          } catch (e) {
            console.error('Invalid regex pattern:', e);
          }
        }
      }

      if (!error && question.type === 'checkbox') {
        const selections = value.length;
        if (question.validation?.minSelections !== undefined && selections < question.validation.minSelections) {
          error = `Select at least ${question.validation.minSelections} options`;
        } else if (question.validation?.maxSelections !== undefined && selections > question.validation.maxSelections) {
          error = `Select at most ${question.validation.maxSelections} options`;
        }
      }

      if (!error && question.type === 'email') {
        fetch('/api/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value })
        })
        .then(res => res.json())
        .then(data => {
          if (!data.valid) {
            setErrors(prev => ({ ...prev, [question.id]: data.error }));
          } else {
            setErrors(prev => {
              const next = { ...prev };
              delete next[question.id]; // clears error if valid
              return next;
            });
          }
        })
        .catch(err => console.error('Email validation error:', err));
        return;
      } else if (question.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          error = 'Must be a number';
        } else if (question.validation?.min !== undefined && num < question.validation.min) {
          error = `Must be at least ${question.validation.min}`;
        } else if (question.validation?.max !== undefined && num > question.validation.max) {
          error = `Must be at most ${question.validation.max}`;
        }
      } else if (question.type === 'date') {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        const [year, month, day] = value.split('-');
        const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
        
        if (question.validation?.dateConstraint === 'past' && parsedDate >= currentDate) {
          error = 'Date must be in the past';
        } else if (question.validation?.dateConstraint === 'future' && parsedDate <= currentDate) {
          error = 'Date must be in the future';
        }
        
        if (question.validation?.minDate && value < question.validation.minDate) {
          error = `Date must be on or after ${question.validation.minDate}`;
        }
        if (question.validation?.maxDate && value > question.validation.maxDate) {
          error = `Date must be on or before ${question.validation.maxDate}`;
        }
      } else if (question.type === 'time') {
        if (question.validation?.minTime && value < question.validation.minTime) {
          error = `Time must be after ${question.validation.minTime}`;
        }
        if (question.validation?.maxTime && value > question.validation.maxTime) {
          error = `Time must be before ${question.validation.maxTime}`;
        }
      }
    }
    
    setErrors(prev => ({ ...prev, [question.id]: error }));
  };

  const handleCheckboxChange = (question: any, option: string, checked: boolean) => {
    const current = answers[question.id] || [];
    if (checked) {
      updateAnswer(question, [...current, option]);
    } else {
      updateAnswer(question, current.filter((o: string) => o !== option));
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );

  if (!form) return <div className="text-center py-20 text-muted-foreground">Form not found or unavailable.</div>;

  if (!isPreview) {
    if (form.settings?.publishImmediately === false) {
      return (
        <div className="max-w-2xl mx-auto py-20 px-4 text-center">
          <h2 className="text-2xl font-bold mb-2">Form is not available</h2>
          <p className="text-natural-muted">This form is not currently accepting responses.</p>
        </div>
      );
    }
    
    if (form.settings?.expirationDate) {
      const expirationDate = new Date(form.settings.expirationDate);
      if (new Date() > expirationDate) {
        return (
          <div className="max-w-2xl mx-auto py-20 px-4 text-center">
            <h2 className="text-2xl font-bold mb-2">Form has expired</h2>
            <p className="text-natural-muted">This form is no longer accepting responses.</p>
          </div>
        );
      }
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-background border rounded-xl p-8 text-center space-y-4 shadow-sm"
          style={{ fontFamily: form.theme?.bodyFont || 'var(--font-sans)' }}
        >
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold" style={{ fontFamily: form.theme?.titleFont || 'var(--font-sans)' }}>{form.title}</h2>
          
          {isPreview && form.settings?.redirectUrlAfterSubmit ? (
            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg my-4 border border-blue-200">
              <p className="font-semibold mb-1">Preview Mode</p>
              <p className="text-sm">In the live form, respondents will be automatically redirected to: <br/>
                <a href={form.settings.redirectUrlAfterSubmit} target="_blank" rel="noreferrer" className="underline font-mono mt-2 block break-all">{form.settings.redirectUrlAfterSubmit}</a>
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground whitespace-pre-wrap">{form.settings?.thankYouMessage || 'Your response has been recorded.'}</p>
          )}

          <div className="pt-4">
            <Button variant="outline" onClick={() => {
              setSubmitted(false);
              setAnswers({});
            }}>
              Submit another response
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isQuestionVisible = (question: any) => {
    if (!question.logic) return true;
    const { action, matchType, conditions } = question.logic;
    
    const results = conditions.map((cond: any) => {
      if (!cond.questionId) return false;
      const sourceValue = answers[cond.questionId] || '';
      const targetValue = cond.value || '';
      
      switch (cond.operator) {
        case 'equals': return sourceValue.toString() === targetValue;
        case 'not_equals': return sourceValue.toString() !== targetValue;
        case 'contains': return sourceValue.toString().toLowerCase().includes(targetValue.toLowerCase());
        case 'greater_than': return Number(sourceValue) > Number(targetValue);
        case 'less_than': return Number(sourceValue) < Number(targetValue);
        default: return false;
      }
    });

    const isMatch = matchType === 'all' ? results.every((r: boolean) => r) : results.some((r: boolean) => r);
    return action === 'show' ? isMatch : !isMatch;
  };

  const visibleQuestions = form.questions.filter(isQuestionVisible);
  const totalQuestions = visibleQuestions.length;
  const answeredCount = visibleQuestions.filter((q) => {
    const answer = answers[q.id];
    if (Array.isArray(answer)) return answer.length > 0;
    return !!answer;
  }).length;
  const progressPercentage = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return (
    <div className="bg-natural-bg min-h-screen py-16 px-6 relative" style={{ backgroundColor: form.theme?.backgroundColor || undefined }}>
      <div className="fixed top-4 right-4 z-50">
        <DarkModeToggle className="bg-white/50 backdrop-blur" />
      </div>
      {form.settings?.showProgressBar && (
        <div className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur border-b border-natural-border px-6 py-4 shadow-sm">
          <div className="max-w-[680px] mx-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">Form Progress</span>
              <span className="text-sm font-medium" style={{ color: form.theme?.accentColor || 'var(--color-natural-primary)' }}>{progressPercentage}%</span>
            </div>
            <div className="w-full h-2 bg-natural-border rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 ease-out" 
                style={{ 
                  width: `${progressPercentage}%`, 
                  backgroundColor: form.theme?.accentColor || 'var(--color-natural-primary)' 
                }}
              />
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className={`max-w-[680px] mx-auto space-y-10 ${form.settings?.showProgressBar ? 'mt-8' : ''}`} style={{ fontFamily: form.theme?.bodyFont || 'var(--font-sans)' }}>
        {isPreview && (
          <div className="bg-natural-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest mb-6 flex justify-center shadow-lg border border-natural-primary-hover" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
            Previewing Form Structure
          </div>
        )}

        {form.theme?.headerImage && (
          <div className="w-full h-48 sm:h-64 rounded-[32px] overflow-hidden shadow-sm">
            <img src={form.theme.headerImage} className="w-full h-full object-cover" alt="Form header" />
          </div>
        )}

        <div className="w-full bg-white rounded-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.03)] border-t-[8px] border-natural-primary p-12 relative" style={{ borderTopColor: form.theme?.accentColor || undefined }}>
          {form.theme?.logo && (
            <div className="mb-6 w-24 h-24">
              <img src={form.theme.logo} alt="Form Logo" className="w-full h-full object-contain" />
            </div>
          )}
          <h1 className="text-4xl font-serif font-light text-natural-text mb-4" style={{ fontFamily: form.theme?.titleFont || 'var(--font-sans)' }}>{form.title}</h1>
          <p className="text-lg text-natural-muted leading-relaxed font-light">{form.description}</p>
        </div>

        {visibleQuestions.map((question) => (
          <div key={question.id} className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-12 border border-natural-border relative group transition-all focus-within:ring-2 focus-within:ring-natural-primary/10" style={{ '--tw-ring-color': form.theme?.accentColor ? `${form.theme.accentColor}1a` : undefined } as any}>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xl font-medium text-natural-text leading-snug">
                  {question.title} 
                  {question.required && <span className="text-destructive ml-2">*</span>}
                </Label>
              </div>

              <div className="pt-2">
                {question.type === 'short_answer' && (
                  <Input 
                    aria-label={question.title}
                    placeholder="Your answer" 
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                    className={`h-14 rounded-2xl bg-natural-bg px-6 text-base focus:ring-natural-primary/10 ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                  />
                )}

                {question.type === 'email' && (
                  <Input 
                    type="email"
                    aria-label={question.title}
                    placeholder="Email address" 
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                    className={`h-14 rounded-2xl bg-natural-bg px-6 text-base focus:ring-natural-primary/10 ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                  />
                )}

                {question.type === 'number' && (
                  <Input 
                    type="number"
                    aria-label={question.title}
                    placeholder="Number" 
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                    min={question.validation?.min}
                    max={question.validation?.max}
                    className={`h-14 rounded-2xl bg-natural-bg px-6 text-base focus:ring-natural-primary/10 ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                  />
                )}

                {question.type === 'paragraph' && (
                  <textarea 
                    aria-label={question.title}
                    className={`w-full rounded-[24px] border bg-natural-bg px-6 py-4 text-base focus:outline-none focus:ring-2 focus:ring-natural-primary/10 transition-all font-light resize-none min-h-[120px] ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                    placeholder="Your answer"
                    rows={4}
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                  />
                )}

                {question.type === 'multiple_choice' && (
                  <RadioGroup 
                    value={
                      answers[question.id] && !question.options?.includes(answers[question.id])
                        ? '__other__' 
                        : answers[question.id]
                    } 
                    onValueChange={(val) => {
                      if (val === '__other__') {
                        updateAnswer(question, otherText[question.id] || '');
                      } else {
                        updateAnswer(question, val);
                      }
                    }}
                    required={question.required}
                  >
                    <div className="space-y-4">
                      {question.options?.map((option, i) => (
                        <div key={i} className="flex flex-col space-y-3 p-4 rounded-2xl hover:bg-natural-accent transition-colors cursor-pointer group/radio">
                          <div className="flex items-center space-x-4">
                            <RadioGroupItem 
                              value={option} 
                              id={`${question.id}-${i}`} 
                              style={{ 
                                color: form.theme?.accentColor || undefined,
                                borderColor: answers[question.id] === option ? (form.theme?.accentColor || undefined) : undefined
                              }}
                              className="bg-white border-2 border-natural-border text-natural-primary h-6 w-6 focus:ring-natural-primary/10"
                            />
                            <Label htmlFor={`${question.id}-${i}`} className="text-lg font-light text-natural-text cursor-pointer flex-1 py-1">
                              {option}
                            </Label>
                          </div>
                          {question.optionImages?.[i] && (
                            <div className="ml-10 max-w-[400px] overflow-hidden rounded-xl border border-natural-border">
                              <img src={question.optionImages[i]} alt={option} className="w-full h-auto object-cover" />
                            </div>
                          )}
                        </div>
                      ))}
                      {question.hasOtherOption && (
                        <div className="flex items-center space-x-4 p-4 rounded-2xl hover:bg-natural-accent transition-colors group/radio">
                          <RadioGroupItem 
                            value="__other__" 
                            id={`${question.id}-other`} 
                            style={{ 
                              color: form.theme?.accentColor || undefined,
                              borderColor: (answers[question.id] && !question.options?.includes(answers[question.id])) ? (form.theme?.accentColor || undefined) : undefined
                            }}
                            className="bg-white border-2 border-natural-border text-natural-primary h-6 w-6 focus:ring-natural-primary/10 mt-1"
                          />
                          <Label htmlFor={`${question.id}-other`} className="text-lg font-light text-natural-text shrink-0 py-1 cursor-pointer">
                            Other:
                          </Label>
                          <Input 
                            type="text"
                            value={otherText[question.id] || ''}
                            onChange={(e) => {
                              const newText = e.target.value;
                              setOtherText(prev => ({ ...prev, [question.id]: newText }));
                              if ((answers[question.id] && !question.options?.includes(answers[question.id])) || answers[question.id] === '') {
                                updateAnswer(question, newText);
                              }
                            }}
                            onFocus={() => {
                              if (!answers[question.id] || question.options?.includes(answers[question.id])) {
                                updateAnswer(question, otherText[question.id] || '');
                              }
                            }}
                            className="flex-1 bg-transparent border-0 border-b-2 border-natural-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-natural-primary"
                            style={{ borderColor: answers[question.id] && !question.options?.includes(answers[question.id]) ? (form.theme?.accentColor || undefined) : undefined }}
                          />
                        </div>
                      )}
                    </div>
                  </RadioGroup>
                )}

                {question.type === 'checkbox' && (
                  <div className="space-y-4">
                    {question.options?.map((option, i) => {
                      const isChecked = (answers[question.id] || []).includes(option);
                      return (
                        <div key={i} className="flex flex-col space-y-3 p-4 rounded-2xl hover:bg-natural-accent transition-colors cursor-pointer group/check">
                          <div className="flex items-center space-x-4">
                            <Checkbox 
                              id={`${question.id}-${i}`} 
                              checked={isChecked}
                              onCheckedChange={(checked) => handleCheckboxChange(question, option, checked as boolean)}
                              style={{ 
                                backgroundColor: isChecked ? (form.theme?.accentColor || undefined) : undefined,
                                borderColor: isChecked ? (form.theme?.accentColor || undefined) : undefined
                              }}
                              className="h-6 w-6 rounded-md border-2 border-natural-border data-[state=checked]:bg-natural-primary data-[state=checked]:border-natural-primary"
                            />
                            <Label htmlFor={`${question.id}-${i}`} className="text-lg font-light text-natural-text cursor-pointer flex-1 py-1">
                              {option}
                            </Label>
                          </div>
                          {question.optionImages?.[i] && (
                            <div className="ml-10 max-w-[400px] overflow-hidden rounded-xl border border-natural-border">
                              <img src={question.optionImages[i]} alt={option} className="w-full h-auto object-cover" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {question.hasOtherOption && (() => {
                      const isOtherChecked = Array.isArray(answers[question.id]) && answers[question.id].some((o: string) => !question.options?.includes(o));
                      return (
                        <div className="flex items-center space-x-4 p-4 rounded-2xl hover:bg-natural-accent transition-colors group/check">
                          <Checkbox 
                            id={`${question.id}-other`} 
                            checked={isOtherChecked}
                            onCheckedChange={(checked) => {
                              const current = answers[question.id] || [];
                              if (checked) {
                                updateAnswer(question, [...current.filter((o: string) => question.options?.includes(o)), otherText[question.id] || '']);
                              } else {
                                updateAnswer(question, current.filter((o: string) => question.options?.includes(o)));
                              }
                            }}
                            style={{ 
                              backgroundColor: isOtherChecked ? (form.theme?.accentColor || undefined) : undefined,
                              borderColor: isOtherChecked ? (form.theme?.accentColor || undefined) : undefined
                            }}
                            className="h-6 w-6 rounded-md border-2 border-natural-border data-[state=checked]:bg-natural-primary data-[state=checked]:border-natural-primary mt-1"
                          />
                          <Label htmlFor={`${question.id}-other`} className="text-lg font-light text-natural-text shrink-0 py-1 cursor-pointer">
                            Other:
                          </Label>
                          <Input 
                            type="text"
                            value={otherText[question.id] || ''}
                            onChange={(e) => {
                              const newText = e.target.value;
                              setOtherText(prev => ({ ...prev, [question.id]: newText }));
                              if (isOtherChecked) {
                                const current = answers[question.id] || [];
                                updateAnswer(question, [...current.filter((o: string) => question.options?.includes(o)), newText]);
                              }
                            }}
                            onFocus={() => {
                              if (!isOtherChecked) {
                                const current = answers[question.id] || [];
                                updateAnswer(question, [...current.filter((o: string) => question.options?.includes(o)), otherText[question.id] || '']);
                              }
                            }}
                            className="flex-1 bg-transparent border-0 border-b-2 border-natural-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-natural-primary"
                            style={{ borderColor: isOtherChecked ? (form.theme?.accentColor || undefined) : undefined }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(question.type === 'dropdown') && (
                  <select 
                    aria-label={question.title}
                    className={`w-full h-14 rounded-2xl border bg-natural-bg px-6 text-base focus:outline-none focus:ring-2 focus:ring-natural-primary/10 transition-all font-light appearance-none hover:bg-white cursor-pointer ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                  >
                    <option value="">Select option</option>
                    {question.options?.map((option, i) => (
                      <option key={i} value={option}>{option}</option>
                    ))}
                  </select>
                )}

                {question.type === 'date' && (
                  <Input 
                    type="date"
                    aria-label={question.title}
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                    className={`h-14 rounded-2xl bg-natural-bg px-6 text-base ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                  />
                )}

                {question.type === 'time' && (
                  <Input 
                    type="time"
                    aria-label={question.title}
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                    className={`h-14 rounded-2xl bg-natural-bg px-6 text-base ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                  />
                )}

                {question.type === 'image_upload' && (
                  <div className="space-y-4">
                    <input 
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label={question.title}
                      id={`image_upload_${question.id}`}
                      className="hidden"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const files = Array.from(e.target.files || []) as File[];
                        const currentImages = Array.isArray(answers[question.id]) ? answers[question.id] : [];
                        
                        if (currentImages.length + files.length > 5) {
                          setErrors(prev => ({ ...prev, [question.id]: 'You can upload a maximum of 5 images' }));
                          return;
                        }

                        const validFiles = files.filter(file => file.size <= 5 * 1024 * 1024);
                        if (validFiles.length < files.length) {
                           setErrors(prev => ({ ...prev, [question.id]: 'Some images exceed the 5MB size limit' }));
                           if (validFiles.length === 0) return;
                        } else {
                           setErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors[question.id];
                              return newErrors;
                           });
                        }

                        let loadedImages: string[] = [];
                        let loadedCount = 0;

                        validFiles.forEach((file, index) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            loadedImages[index] = reader.result as string;
                            loadedCount++;
                            if (loadedCount === validFiles.length) {
                               updateAnswer(question, [...currentImages, ...loadedImages]);
                            }
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                    />
                    <div className="flex flex-col gap-4">
                        {Array.isArray(answers[question.id]) && answers[question.id].length > 0 && (
                            <div className="flex flex-wrap gap-4">
                                {answers[question.id].map((imgUrl: string, idx: number) => (
                                    <div key={idx} className="relative w-32 h-32 rounded-xl overflow-hidden border border-natural-border group">
                                        <img src={imgUrl} alt={`Uploaded ${idx + 1}`} className="w-full h-full object-cover" />
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                const newAnswers = [...answers[question.id]];
                                                newAnswers.splice(idx, 1);
                                                updateAnswer(question, newAnswers.length > 0 ? newAnswers : '');
                                            }}
                                            className="absolute inset-0 w-full h-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {(!answers[question.id] || (Array.isArray(answers[question.id]) && answers[question.id].length < 5)) && (
                            <Label 
                                htmlFor={`image_upload_${question.id}`} 
                                className={`flex items-center justify-center w-full md:w-1/2 h-20 border-2 border-dashed rounded-xl cursor-pointer text-natural-muted hover:bg-natural-bg/50 transition-colors ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    <UploadCloud className="h-5 w-5" />
                                    <span className="text-xs font-medium">Click to upload images (max 5)</span>
                                </div>
                            </Label>
                        )}
                    </div>
                  </div>
                )}
                
                {errors[question.id] && (
                  <div className="text-destructive text-sm mt-3 font-medium">
                    {errors[question.id]}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-between items-center py-8">
          <Button type="submit" size="lg" disabled={submitting} className="btn-natural px-10 h-14 text-lg" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
            {submitting ? 'Submitting...' : 'Submit Response'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAnswers({})} className="rounded-full text-natural-muted hover:text-red-500 font-medium">
            Clear form
          </Button>
        </div>
      </form>

      <Dialog open={showConfirmSubmit} onOpenChange={setShowConfirmSubmit}>
        <DialogContent className="sm:max-w-md bg-white border border-natural-border p-6 shadow-xl max-h-[90vh] flex flex-col" showCloseButton={true}>
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-serif text-natural-text">Confirm Submission</DialogTitle>
            <DialogDescription className="text-natural-muted">
              Are you sure you want to submit these answers? Please review them below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 py-2 border-y border-natural-border mb-4">
            {form && form.questions.filter(isQuestionVisible).filter(q => {
              const ans = answers[q.id];
              return ans && (!Array.isArray(ans) || ans.length > 0);
            }).length === 0 ? (
              <div className="text-sm text-natural-muted italic py-4">No answers provided.</div>
            ) : (
              form?.questions.filter(isQuestionVisible).map(q => {
                const ans = answers[q.id];
                if (!ans || (Array.isArray(ans) && ans.length === 0)) return null;
                return (
                  <div key={q.id} className="border-b border-natural-border/50 pb-3 last:border-0 last:pb-0">
                    <h4 className="font-medium text-sm text-natural-text mb-1">{q.title || 'Untitled Question'}</h4>
                    <div className="text-sm text-natural-primary whitespace-pre-wrap font-light">
                      {Array.isArray(ans) ? ans.join(', ') : ans.toString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="flex flex-row justify-end space-x-3 bg-transparent border-t-0 -mx-0 -mb-0 p-0 sm:justify-end mt-2">
            <Button variant="outline" onClick={() => setShowConfirmSubmit(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={executeFinalSubmit} disabled={submitting} className="btn-natural" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
