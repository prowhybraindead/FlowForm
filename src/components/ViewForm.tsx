'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Form, Response, UserProfile } from '../types';
import { createResponseRecord, getFormRecord, incrementFormViews } from '../lib/formsApi';
import { getUserProfile } from '../lib/profilesApi';
import { uploadImageAsset } from '../lib/imageUpload';
import { isFormClosedBySettings } from '../lib/formStatus';
import { sanitizeRichTextHtml, stripRichText } from '../lib/richText';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { Check, CheckCircle2, Expand, RotateCw, UploadCloud, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface ViewFormProps {
  formId: string;
  isPreview?: boolean;
}

const brandFooterText = 'FlowForm by Lotus Esports Club';

function normalizeRespondentEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmailFormat(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requiresRespondentEmail(form: Form | null) {
  return Boolean(form?.settings?.collectEmails || form?.settings?.limitOneResponse);
}

export const ViewForm: React.FC<ViewFormProps> = ({ formId, isPreview = false }) => {
  const [form, setForm] = useState<Form | null>(null);
  const [answers, setAnswers] = useState<{ [key: string]: any }>({});
  const [otherText, setOtherText] = useState<{ [key: string]: string }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [respondentEmail, setRespondentEmail] = useState('');
  const [respondentEmailError, setRespondentEmailError] = useState('');
  const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [tempStorageClosed, setTempStorageClosed] = useState(false);
  const [questionImageRatioById, setQuestionImageRatioById] = useState<Record<string, number>>({});
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [activeImageSrc, setActiveImageSrc] = useState('');
  const [activeImageAlt, setActiveImageAlt] = useState('Question image');
  const [imageRotationDeg, setImageRotationDeg] = useState(0);
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragOriginOffsetRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const fetchedForm = await getFormRecord(formId);
        if (fetchedForm) {
          setForm(fetchedForm);
          setCurrentSectionIndex(0);
          setTempStorageClosed(false);

          if (process.env.NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS === 'true') {
            fetch(`/api/temp-storage/form-status?formId=${encodeURIComponent(formId)}`, { cache: 'no-store' })
              .then((response) => response.json())
              .then((payload) => {
                if (payload && typeof payload.is_closed === 'boolean') {
                  setTempStorageClosed(Boolean(payload.is_closed));
                }
              })
              .catch((error) => {
                console.error('Error fetching temp storage form status:', error);
              });
          }

          if (fetchedForm.settings?.showOwnerProfile) {
            try {
              setOwnerProfile(await getUserProfile(fetchedForm.creatorId));
            } catch (error) {
              console.error('Error fetching owner profile:', error);
              setOwnerProfile(null);
            }
          } else {
            setOwnerProfile(null);
          }
          
          if (!isPreview) {
            try {
              await incrementFormViews(formId);
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
    const questionsToValidate = useSectionFlow && activeSection
      ? activeSection.questions.filter(q => isQuestionVisible(q))
      : form?.questions?.filter(q => isQuestionVisible(q));

    const missing = questionsToValidate?.filter(q => q.type !== 'image_reader' && q.required && !answers[q.id]);
    if (missing && missing.length > 0) {
      toast.error(`Please answer required questions: ${missing.map(m => stripRichText(m.title) || 'Untitled question').join(', ')}`);
      return;
    }

    const shouldRequireRespondentEmail = requiresRespondentEmail(form);
    const normalizedRespondentEmail = normalizeRespondentEmail(respondentEmail);

    if (shouldRequireRespondentEmail && !normalizedRespondentEmail) {
      setRespondentEmailError('Email address is required');
      toast.error('Please enter your email address.');
      return;
    }

    if (shouldRequireRespondentEmail && !isValidEmailFormat(normalizedRespondentEmail)) {
      setRespondentEmailError('Enter a valid email address');
      toast.error('Please enter a valid email address.');
      return;
    }

    // Server-side validation for emails before submission
    const emailQuestions = form?.questions?.filter(q => isQuestionVisible(q) && q.type === 'email' && answers[q.id]) || [];
    setSubmitting(true);
    if (shouldRequireRespondentEmail) {
      try {
        const res = await fetch('/api/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedRespondentEmail })
        });
        const data = await res.json();
        if (!data.valid) {
          setSubmitting(false);
          setRespondentEmailError(data.error || 'Enter a valid email address');
          toast.error('Please enter a valid email address.');
          return;
        }
      } catch (err) {
        console.error('Respondent email validation error:', err);
      }
    }

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
          toast.error(`Invalid email in question: ${stripRichText(q.title) || 'Untitled question'}`);
          return;
        }
      } catch (err) {
        console.error('Email validation error:', err);
      }
    }
    
    setSubmitting(false);

    if (useSectionFlow) {
      const nextSectionIndex = resolveNextSectionIndex();
      if (nextSectionIndex === '__submit__') {
        setShowConfirmSubmit(true);
        return;
      }

      if (nextSectionIndex !== null) {
        setCurrentSectionIndex(nextSectionIndex);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

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
      await createResponseRecord({
        formId,
        respondentEmail: requiresRespondentEmail(form)
          ? normalizeRespondentEmail(respondentEmail)
          : undefined,
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
      const message = String(error?.message || 'Unknown error');
      if (message.includes('already submitted')) {
        toast.error('This email has already submitted a response for this form.');
      } else if (message.includes('Respondent email is required')) {
        setRespondentEmailError('Email address is required');
        toast.error('Please enter your email address.');
      } else if (message.includes('Respondent email is invalid')) {
        setRespondentEmailError('Enter a valid email address');
        toast.error('Please enter a valid email address.');
      } else {
        toast.error('Failed to submit response: ' + message);
      }
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

  const updateRespondentEmail = (value: string) => {
    setRespondentEmail(value);
    const normalizedEmail = normalizeRespondentEmail(value);

    if (!normalizedEmail) {
      setRespondentEmailError(requiresRespondentEmail(form) ? 'Email address is required' : '');
    } else if (!isValidEmailFormat(normalizedEmail)) {
      setRespondentEmailError('Enter a valid email address');
    } else {
      setRespondentEmailError('');
    }
  };

  const formSections = useMemo(() => {
    if (!form) return [];

    const sections: Array<{ id: string; title: string; description?: string; questions: any[]; isDefault: boolean; branchToSectionId?: string | '__submit__' }> = [];
    let currentSection = {
      id: '__default__',
      title: form.title,
      description: form.description,
      questions: [] as any[],
      isDefault: true,
      branchToSectionId: undefined as string | '__submit__' | undefined,
    };
    let sawSectionMarker = false;

    form.questions.forEach((question) => {
      if (question.type === 'section') {
        // Only flush the pre-section default bucket. Marker sections are already added once,
        // and their questions are mutated by reference as we iterate.
        if (currentSection.isDefault && currentSection.questions.length > 0) {
          sections.push(currentSection);
        }

        currentSection = {
          id: question.id,
          title: question.title || 'Untitled section',
          description: question.description,
          questions: [],
          isDefault: false,
          branchToSectionId: question.branchToSectionId,
        };
        sections.push(currentSection);
        sawSectionMarker = true;
        return;
      }

      currentSection.questions.push(question);
    });

    if (!sawSectionMarker && currentSection.questions.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }, [form]);

  const useSectionFlow = formSections.some((section) => !section.isDefault);
  const activeSection = useSectionFlow ? formSections[Math.min(currentSectionIndex, Math.max(formSections.length - 1, 0))] : null;

  const resolveQuestionBranchTarget = (question: any) => {
    const answerValue = answers[question.id];
    const hasAnswer = Array.isArray(answerValue) ? answerValue.length > 0 : answerValue !== undefined && answerValue !== null && answerValue !== '';

    if (!hasAnswer) {
      return '';
    }

    if (question.type === 'multiple_choice' || question.type === 'dropdown') {
      const optionIndex = question.options?.findIndex((option: string) => option === answerValue) ?? -1;
      const optionTarget = optionIndex >= 0 ? question.optionBranchToSectionIds?.[optionIndex] : undefined;
      if (optionTarget) return optionTarget;
    }

    return question.branchToSectionId || '';
  };

  const resolveNextSectionIndex = (): number | '__submit__' | null => {
    if (!useSectionFlow || !activeSection) return null;

    for (let idx = activeSection.questions.length - 1; idx >= 0; idx -= 1) {
      const targetSectionId = resolveQuestionBranchTarget(activeSection.questions[idx]);
      if (!targetSectionId) continue;

      if (targetSectionId === '__submit__') {
        return '__submit__';
      }

      const targetIndex = formSections.findIndex((section) => section.id === targetSectionId);
      if (targetIndex > currentSectionIndex) {
        return targetIndex;
      }
    }

    const nextIndex = currentSectionIndex + 1;
    const sectionLevelTarget = activeSection.branchToSectionId || '';
    if (sectionLevelTarget) {
      if (sectionLevelTarget === '__submit__') {
        return '__submit__';
      }
      const targetIndex = formSections.findIndex((section) => section.id === sectionLevelTarget);
      if (targetIndex > currentSectionIndex) {
        return targetIndex;
      }
    }

    return nextIndex < formSections.length ? nextIndex : null;
  };

  const goToPreviousSection = () => {
    if (!useSectionFlow) return;
    setCurrentSectionIndex((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openImageViewer = (src: string, alt: string) => {
    setActiveImageSrc(src);
    setActiveImageAlt(alt);
    setImageRotationDeg(0);
    setViewerScale(1);
    setViewerOffset({ x: 0, y: 0 });
    setImageViewerOpen(true);
  };

  const rotateViewerImage = () => {
    setImageRotationDeg((prev) => (prev + 90) % 360);
  };

  const clampScale = (nextScale: number) => Math.min(4, Math.max(1, nextScale));

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleViewerTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchStartDistanceRef.current = getTouchDistance(event.touches);
      pinchStartScaleRef.current = viewerScale;
      dragStartRef.current = null;
      return;
    }

    if (event.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 260) {
        setViewerScale((prev) => {
          const next = prev > 1 ? 1 : 2.2;
          if (next === 1) {
            setViewerOffset({ x: 0, y: 0 });
          }
          return next;
        });
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (viewerScale > 1) {
        const touch = event.touches[0];
        dragStartRef.current = { x: touch.clientX, y: touch.clientY };
        dragOriginOffsetRef.current = { ...viewerOffset };
      }
    }
  };

  const handleViewerTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStartDistanceRef.current) {
      event.preventDefault();
      const nextDistance = getTouchDistance(event.touches);
      if (!nextDistance) return;
      const ratio = nextDistance / pinchStartDistanceRef.current;
      const nextScale = clampScale(pinchStartScaleRef.current * ratio);
      setViewerScale(nextScale);
      if (nextScale <= 1.01) {
        setViewerOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (event.touches.length === 1 && viewerScale > 1 && dragStartRef.current) {
      event.preventDefault();
      const touch = event.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;
      setViewerOffset({
        x: dragOriginOffsetRef.current.x + dx,
        y: dragOriginOffsetRef.current.y + dy,
      });
    }
  };

  const handleViewerTouchEnd = () => {
    if (viewerScale <= 1.01) {
      setViewerScale(1);
      setViewerOffset({ x: 0, y: 0 });
    }
    pinchStartDistanceRef.current = null;
    dragStartRef.current = null;
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );

  if (!form) return <div className="text-center py-20 text-muted-foreground">Form not found or unavailable.</div>;

  const isExpired = Boolean(form.settings?.expirationDate && new Date() > new Date(form.settings.expirationDate));
  const isClosedBySettings = isFormClosedBySettings(form.settings);

  if (!isPreview) {
    if (isClosedBySettings || tempStorageClosed) {
      return (
        <div className="max-w-2xl mx-auto py-20 px-4 text-center">
          <h2 className="text-2xl font-bold mb-2">Form is not available</h2>
          <p className="text-natural-muted">
            {isExpired
              ? 'This form has expired and is no longer accepting responses.'
              : tempStorageClosed && !isClosedBySettings
                ? 'This form is temporarily closed by the upload backend and not accepting responses right now.'
                : 'This form is not currently accepting responses.'}
          </p>
          <p className="mt-8 text-xs font-medium tracking-wide text-natural-muted">{brandFooterText}</p>
        </div>
      );
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
            <CheckCircle2 className="h-16 w-16 text-natural-primary" />
          </div>
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: form.theme?.titleFont || 'var(--font-sans)' }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(form.title) || 'Untitled form' }}
          />
          
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
              setRespondentEmail('');
              setRespondentEmailError('');
              setCurrentSectionIndex(0);
            }}>
              Submit another response
            </Button>
          </div>
        </motion.div>
        <p className="mt-8 text-center text-xs font-medium tracking-wide text-natural-muted">{brandFooterText}</p>
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

  const visibleQuestions = useSectionFlow && activeSection
    ? activeSection.questions.filter(isQuestionVisible)
    : form.questions.filter(isQuestionVisible);
  const showRespondentEmailField = requiresRespondentEmail(form);
  const showOwnerProfile = Boolean(form.settings?.showOwnerProfile && ownerProfile);
  const totalFields = visibleQuestions.length + (showRespondentEmailField ? 1 : 0);
  const answeredCount = visibleQuestions.filter((q) => {
    const answer = answers[q.id];
    if (Array.isArray(answer)) return answer.length > 0;
    return !!answer;
  }).length;
  const respondentEmailAnswered = showRespondentEmailField && isValidEmailFormat(normalizeRespondentEmail(respondentEmail)) ? 1 : 0;
  const progressPercentage = useSectionFlow && formSections.length > 0
    ? Math.round((((currentSectionIndex) + ((answeredCount + respondentEmailAnswered) / Math.max(totalFields, 1))) / formSections.length) * 100)
    : (totalFields > 0 ? Math.round(((answeredCount + respondentEmailAnswered) / totalFields) * 100) : 0);

  const getOptionTileClass = (selected: boolean) =>
    `relative overflow-hidden ${
      selected
        ? 'border-natural-primary/50 bg-natural-primary/5 shadow-[0_10px_25px_rgba(0,0,0,0.22)]'
        : ''
    }`;
  const headerImageFit = form.theme?.headerImageFit || 'contain';
  const questionImageFit = form.theme?.questionImageFit || 'auto';
  const headerImagePosition = form.theme?.headerImagePosition || 'center';
  const headerImageObjectPosition =
    headerImagePosition === 'top'
      ? 'top center'
      : headerImagePosition === 'bottom'
        ? 'bottom center'
        : headerImagePosition === 'left'
          ? 'center left'
          : headerImagePosition === 'right'
            ? 'center right'
            : 'center center';

  const getQuestionImageClassName = (questionId: string) => {
    if (questionImageFit === 'contain') return 'w-full h-full object-contain';
    if (questionImageFit === 'cover') return 'w-full h-full object-cover';
    const ratio = questionImageRatioById[questionId];
    if (ratio !== undefined && ratio >= 2.8 && ratio <= 3.6) {
      return 'w-full h-full object-cover';
    }
    return 'w-full h-full object-contain';
  };

  return (
    <div className="bg-natural-bg min-h-screen py-16 px-6 relative grid-ambient" style={{ backgroundColor: form.theme?.backgroundColor || undefined }}>
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

      <form noValidate onSubmit={handleSubmit} className={`max-w-[720px] mx-auto space-y-10 ${form.settings?.showProgressBar ? 'mt-8' : ''}`} style={{ fontFamily: form.theme?.bodyFont || 'var(--font-sans)' }}>
        {isPreview && (
          <div className="bg-natural-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest mb-6 flex justify-center shadow-lg border border-natural-primary-hover" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
            Previewing Form Structure
          </div>
        )}

        {form.theme?.headerImage && (
          <div className="w-full rounded-[32px] overflow-hidden shadow-sm border border-natural-border bg-natural-bg/60 p-2">
            <div className="w-full aspect-[16/5] rounded-[24px] overflow-hidden bg-natural-accent/70 flex items-center justify-center">
              <img
                src={form.theme.headerImage}
                className={`w-full h-full ${headerImageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                style={{ objectPosition: headerImageObjectPosition }}
                alt="Form header"
              />
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full surface-glass p-12 relative border-t-[8px] border-natural-primary"
          style={{ borderTopColor: form.theme?.accentColor || undefined }}
        >
          {showOwnerProfile && (
            <div className="mb-6 flex w-full justify-end">
              <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-natural-border bg-natural-bg/80 px-3 py-2 text-left">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white border border-natural-border flex items-center justify-center">
                  {ownerProfile?.avatarUrl ? (
                    <img src={ownerProfile.avatarUrl} alt="" className="h-full w-full object-contain bg-white" />
                  ) : (
                    <span className="text-xs font-bold text-natural-primary">
                      {(ownerProfile?.displayName || 'F').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-natural-muted">Created by</p>
                  <p className="truncate text-sm font-medium text-natural-text">{ownerProfile?.displayName}</p>
                </div>
              </div>
            </div>
          )}
          {form.theme?.logo && (
            <div className="mb-6 w-24 h-24">
              <img src={form.theme.logo} alt="Form Logo" className="w-full h-full object-contain" />
            </div>
          )}
          <h1
            className="text-4xl font-serif font-light text-natural-text mb-4"
            style={{ fontFamily: form.theme?.titleFont || 'var(--font-sans)' }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(form.title) || 'Untitled form' }}
          />
          <div
            className="text-lg text-natural-muted leading-relaxed font-light"
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(form.description) }}
          />
        </motion.div>

        {showRespondentEmailField && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-12 border border-natural-border relative group transition-all focus-within:ring-2 focus-within:ring-natural-primary/10 interactive-lift"
            style={{ '--tw-ring-color': form.theme?.accentColor ? `${form.theme.accentColor}1a` : undefined } as any}
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="respondent-email" className="text-xl font-medium text-natural-text leading-snug">
                  Email address <span className="text-destructive ml-2">*</span>
                </Label>
                {form.settings?.limitOneResponse && (
                  <p className="text-sm text-natural-muted font-light">
                    This form allows one response per email address.
                  </p>
                )}
              </div>
              <div className="pt-2">
                <Input
                  id="respondent-email"
                  type="email"
                  aria-label="Email address"
                  placeholder="name@example.com"
                  value={respondentEmail}
                  onChange={(event) => updateRespondentEmail(event.target.value)}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(respondentEmailError)}
                  className={`h-14 rounded-2xl bg-natural-bg px-6 text-base focus:ring-natural-primary/10 interactive-field ${respondentEmailError ? 'border-destructive' : 'border-natural-border'}`}
                />
                {respondentEmailError && (
                  <div className="text-destructive text-sm mt-3 font-medium">
                    {respondentEmailError}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false} mode="wait">
          {useSectionFlow && activeSection && !activeSection.isDefault && (
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-10 border border-natural-border relative group transition-all interactive-lift"
            >
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Section</p>
              <h2
                className="text-2xl font-serif text-natural-text"
                style={{ fontFamily: form.theme?.titleFont || 'var(--font-sans)' }}
                dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(activeSection.title) || 'Untitled section' }}
              />
              {activeSection.description && (
                <div
                  className="text-natural-muted leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(activeSection.description) }}
                />
              )}
            </div>
            </motion.div>
          )}
        </AnimatePresence>

        {visibleQuestions.map((question, questionIndex) => (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: questionIndex * 0.04, ease: 'easeOut' }}
            className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-12 border border-natural-border relative group transition-all focus-within:ring-2 focus-within:ring-natural-primary/10 interactive-lift"
            style={{ '--tw-ring-color': form.theme?.accentColor ? `${form.theme.accentColor}1a` : undefined } as any}
          >
            <div className="space-y-6">
              {question.image && (
                <div className="overflow-hidden rounded-[24px] border border-natural-border bg-natural-bg p-2">
                  <div
                    className={`w-full rounded-[18px] bg-white/70 flex items-center justify-center overflow-hidden ${
                      question.type === 'image_reader' ? 'h-[360px] md:h-[620px]' : 'h-56'
                    }`}
                  >
                    <img
                      src={question.image}
                      alt={stripRichText(question.title) || 'Question image'}
                      className={question.type === 'image_reader' ? 'w-full h-full object-contain' : getQuestionImageClassName(question.id)}
                      onLoad={(event) => {
                        const { naturalWidth, naturalHeight } = event.currentTarget;
                        if (naturalWidth > 0 && naturalHeight > 0) {
                          const ratio = naturalWidth / naturalHeight;
                          setQuestionImageRatioById((prev) => (
                            prev[question.id] === ratio ? prev : { ...prev, [question.id]: ratio }
                          ));
                        }
                      }}
                    />
                  </div>
                  {question.type === 'image_reader' && (
                    <div className="flex items-center justify-end gap-2 p-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-full px-3 text-xs"
                        onClick={() => openImageViewer(question.image!, stripRichText(question.title) || 'Question image')}
                      >
                        <Expand className="h-4 w-4 mr-1" />
                        Fullscreen
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xl font-medium text-natural-text leading-snug">
                  <span dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(question.title) || 'Untitled question' }} /> 
                  {question.required && <span className="text-destructive ml-2">*</span>}
                </Label>
                {question.description && (
                  <div
                    className="text-natural-muted leading-relaxed font-light"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(question.description) }}
                  />
                )}
              </div>

              <div className="pt-2">
                {question.type === 'short_answer' && (
                  <Input 
                    aria-label={stripRichText(question.title) || 'Question'}
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
                    aria-label={stripRichText(question.title) || 'Question'}
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
                    aria-label={stripRichText(question.title) || 'Question'}
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
                    aria-label={stripRichText(question.title) || 'Question'}
                    className={`w-full rounded-[24px] border bg-natural-bg px-6 py-4 text-base focus:outline-none focus:ring-2 focus:ring-natural-primary/10 transition-all font-light resize-none min-h-[120px] ${errors[question.id] ? 'border-destructive' : 'border-natural-border'}`}
                    placeholder="Your answer"
                    rows={4}
                    value={answers[question.id] || ''}
                    onChange={(e) => updateAnswer(question, e.target.value)}
                    required={question.required}
                    aria-required={question.required}
                  />
                )}
                {question.type === 'image_reader' && (
                  <div className="w-full rounded-[24px] border border-dashed border-natural-border bg-natural-bg/60 px-6 py-6">
                    <p className="text-sm font-medium text-natural-text">Read-only image content</p>
                    <p className="mt-1 text-sm text-natural-muted">
                      This block is for reading the image only and does not require an answer.
                    </p>
                  </div>
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
                      {question.options?.map((option, i) => {
                        const isSelected = answers[question.id] === option;
                        return (
                        <div key={i} className={`flex flex-col space-y-3 option-tile cursor-pointer group/radio ${getOptionTileClass(isSelected)}`}>
                          <AnimatePresence>
                            {isSelected && (
                              <motion.span
                                key={`radio-ripple-${question.id}-${i}`}
                                initial={{ opacity: 0.25, scale: 0.2 }}
                                animate={{ opacity: 0, scale: 2.1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-full bg-natural-primary/40"
                              />
                            )}
                          </AnimatePresence>
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
                            <AnimatePresence>
                              {isSelected && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.7 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.7 }}
                                  transition={{ duration: 0.18, ease: 'easeOut' }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-natural-primary text-white"
                                >
                                  <Check className="h-4 w-4" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          {question.optionImages?.[i] && (
                            <div className="ml-10 max-w-[400px] overflow-hidden rounded-xl border border-natural-border">
                              <img src={question.optionImages[i]} alt={option} className="w-full h-auto max-h-80 object-contain bg-white/80 p-1" />
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {question.hasOtherOption && (() => {
                        const isOtherSelected = Boolean(answers[question.id] && !question.options?.includes(answers[question.id]));
                        return (
                        <div className={`flex items-center space-x-4 option-tile group/radio ${getOptionTileClass(isOtherSelected)}`}>
                          <AnimatePresence>
                            {isOtherSelected && (
                              <motion.span
                                key={`radio-ripple-${question.id}-other`}
                                initial={{ opacity: 0.25, scale: 0.2 }}
                                animate={{ opacity: 0, scale: 2.1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-full bg-natural-primary/40"
                              />
                            )}
                          </AnimatePresence>
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
                          <AnimatePresence>
                            {isOtherSelected && (
                              <motion.span
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-natural-primary text-white"
                              >
                                <Check className="h-4 w-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      )})()}
                    </div>
                  </RadioGroup>
                )}

                {question.type === 'checkbox' && (
                  <div className="space-y-4">
                    {question.options?.map((option, i) => {
                      const isChecked = (answers[question.id] || []).includes(option);
                      return (
                        <div key={i} className={`flex flex-col space-y-3 option-tile cursor-pointer group/check ${getOptionTileClass(isChecked)}`}>
                          <AnimatePresence>
                            {isChecked && (
                              <motion.span
                                key={`check-ripple-${question.id}-${i}`}
                                initial={{ opacity: 0.25, scale: 0.2 }}
                                animate={{ opacity: 0, scale: 2.1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-full bg-natural-primary/40"
                              />
                            )}
                          </AnimatePresence>
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
                            <AnimatePresence>
                              {isChecked && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.7 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.7 }}
                                  transition={{ duration: 0.18, ease: 'easeOut' }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-natural-primary text-white"
                                >
                                  <Check className="h-4 w-4" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          {question.optionImages?.[i] && (
                            <div className="ml-10 max-w-[400px] overflow-hidden rounded-xl border border-natural-border">
                              <img src={question.optionImages[i]} alt={option} className="w-full h-auto max-h-80 object-contain bg-white/80 p-1" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {question.hasOtherOption && (() => {
                      const isOtherChecked = Array.isArray(answers[question.id]) && answers[question.id].some((o: string) => !question.options?.includes(o));
                      return (
                        <div className={`flex items-center space-x-4 option-tile group/check ${getOptionTileClass(isOtherChecked)}`}>
                          <AnimatePresence>
                            {isOtherChecked && (
                              <motion.span
                                key={`check-ripple-${question.id}-other`}
                                initial={{ opacity: 0.25, scale: 0.2 }}
                                animate={{ opacity: 0, scale: 2.1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-full bg-natural-primary/40"
                              />
                            )}
                          </AnimatePresence>
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
                          <AnimatePresence>
                            {isOtherChecked && (
                              <motion.span
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-natural-primary text-white"
                              >
                                <Check className="h-4 w-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(question.type === 'dropdown') && (
                  <select 
                    aria-label={stripRichText(question.title) || 'Question'}
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
                    aria-label={stripRichText(question.title) || 'Question'}
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
                    aria-label={stripRichText(question.title) || 'Question'}
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
                      aria-label={stripRichText(question.title) || 'Question'}
                      id={`image_upload_${question.id}`}
                      className="hidden"
                      onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
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

                        try {
                          const uploadedImages = await Promise.all(
                            validFiles.map((file) => uploadImageAsset(file, { formId }))
                          );
                          updateAnswer(question, [...currentImages, ...uploadedImages]);
                        } catch (error) {
                          console.error('Response image upload failed:', error);
                          setErrors(prev => ({
                            ...prev,
                            [question.id]: error instanceof Error ? error.message : 'Failed to upload one or more images',
                          }));
                        }
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
          </motion.div>
        ))}

        <div className={`flex items-center py-8 ${useSectionFlow ? 'justify-between' : 'justify-end'}`}>
          {useSectionFlow && (
            <Button type="button" variant="ghost" onClick={goToPreviousSection} disabled={currentSectionIndex === 0 || submitting} className="rounded-full text-natural-muted hover:text-natural-primary font-medium">
              Back
            </Button>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={submitting} className="btn-natural px-10 h-14 text-lg" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
              {submitting ? 'Submitting...' : useSectionFlow && currentSectionIndex < formSections.length - 1 ? 'Next section' : 'Submit Response'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => {
              setAnswers({});
              setRespondentEmail('');
              setRespondentEmailError('');
              setCurrentSectionIndex(0);
            }} className="rounded-full text-natural-muted hover:text-red-500 font-medium">
              Clear form
            </Button>
          </div>
        </div>
      </form>
      <p className="mx-auto mt-8 max-w-[680px] px-4 pb-10 text-center text-xs font-medium tracking-wide text-natural-muted">{brandFooterText}</p>

      <AnimatePresence>
        {imageViewerOpen && activeImageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm p-3 md:p-6"
            onClick={() => setImageViewerOpen(false)}
          >
            <div className="absolute right-3 top-3 z-[120] flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-white/30 bg-black/50 px-3 text-white hover:bg-black/70"
                onClick={(event) => {
                  event.stopPropagation();
                  rotateViewerImage();
                }}
              >
                <RotateCw className="h-4 w-4 mr-1" />
                Rotate
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-white/30 bg-black/50 px-3 text-white hover:bg-black/70"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageViewerOpen(false);
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Close
              </Button>
            </div>

            <div
              className="h-full w-full flex items-center justify-center touch-none"
              onClick={(event) => event.stopPropagation()}
              onTouchStart={handleViewerTouchStart}
              onTouchMove={handleViewerTouchMove}
              onTouchEnd={handleViewerTouchEnd}
              onTouchCancel={handleViewerTouchEnd}
            >
              <img
                src={activeImageSrc}
                alt={activeImageAlt}
                className="max-h-full max-w-full object-contain"
                style={{ transform: `translate(${viewerOffset.x}px, ${viewerOffset.y}px) scale(${viewerScale}) rotate(${imageRotationDeg}deg)` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showConfirmSubmit} onOpenChange={setShowConfirmSubmit}>
        <DialogContent className="sm:max-w-md bg-white border border-natural-border p-6 shadow-xl max-h-[90vh] flex flex-col overflow-hidden" showCloseButton={true}>
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-serif text-natural-text">Confirm Submission</DialogTitle>
            <DialogDescription className="text-natural-muted">
              Are you sure you want to submit these answers? Please review them below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 space-y-4 py-2 border-y border-natural-border mb-4">
            {showRespondentEmailField && normalizeRespondentEmail(respondentEmail) && (
              <div className="border-b border-natural-border/50 pb-3">
                <h4 className="font-medium text-sm text-natural-text mb-1">Email address</h4>
                <div className="text-sm text-natural-primary whitespace-pre-wrap break-words font-light">
                  {normalizeRespondentEmail(respondentEmail)}
                </div>
              </div>
            )}
            {form && form.questions.filter(isQuestionVisible).filter(q => {
              const ans = answers[q.id];
              return ans && (!Array.isArray(ans) || ans.length > 0);
            }).length === 0 && !normalizeRespondentEmail(respondentEmail) ? (
              <div className="text-sm text-natural-muted italic py-4">No answers provided.</div>
            ) : (
              form?.questions.filter(isQuestionVisible).map(q => {
                const ans = answers[q.id];
                if (!ans || (Array.isArray(ans) && ans.length === 0)) return null;
                const formattedAnswer = Array.isArray(ans) ? ans.join('\n') : String(ans);
                const uploadedImages = q.type === 'image_upload'
                  ? (Array.isArray(ans) ? ans : [ans]).filter(Boolean)
                  : [];

                return (
                  <div key={q.id} className="border-b border-natural-border/50 pb-3 last:border-0 last:pb-0">
                    <h4
                      className="font-medium text-sm text-natural-text mb-1 whitespace-pre-line break-words"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(q.title) || 'Untitled Question' }}
                    />
                    {q.description && (
                      <div
                        className="text-xs text-natural-muted whitespace-pre-line break-words mb-1"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(q.description) }}
                      />
                    )}
                    {q.type === 'image_upload' ? (
                      <div className="space-y-2">
                        <p className="text-xs text-natural-muted">
                          Uploaded {uploadedImages.length} image{uploadedImages.length === 1 ? '' : 's'}
                        </p>
                        {uploadedImages.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {uploadedImages.slice(0, 6).map((src: string, index: number) => (
                              <div key={`${q.id}-preview-${index}`} className="aspect-square overflow-hidden rounded-lg border border-natural-border bg-natural-bg">
                                <img
                                  src={src}
                                  alt={`Uploaded preview ${index + 1}`}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {uploadedImages.length > 6 && (
                          <p className="text-xs text-natural-muted">+{uploadedImages.length - 6} more</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-natural-primary whitespace-pre-wrap break-words font-light">
                        {formattedAnswer}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="shrink-0 flex flex-col-reverse gap-3 bg-transparent border-t-0 -mx-0 -mb-0 p-0 sm:flex-row sm:justify-end mt-2">
            <Button variant="outline" onClick={() => setShowConfirmSubmit(false)} disabled={submitting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={executeFinalSubmit} disabled={submitting} className="btn-natural w-full sm:w-auto" style={{ backgroundColor: form.theme?.accentColor || undefined }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
