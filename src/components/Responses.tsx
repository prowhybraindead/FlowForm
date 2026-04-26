'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Form, Response } from '../types';
import { getFormRecord, listResponsesForForm } from '../lib/formsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { ArrowLeft, Users, MessageSquare, Download, Clock, Globe, Activity, GitBranch } from 'lucide-react';

interface ResponsesProps {
  formId: string;
  onBack: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const HEAT_COLORS = ['#f3f4f6', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444'];

export const Responses: React.FC<ResponsesProps> = ({ formId, onBack }) => {
  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setForm(await getFormRecord(formId));

        setResponses(await listResponsesForForm(formId));
      } catch (error) {
        console.error('Error fetching responses:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [formId]);

  const getChartData = (question: any) => {
    const counts: { [key: string]: number } = {};
    responses.forEach(resp => {
      const answer = resp.answers[question.id];
      if (Array.isArray(answer)) {
        answer.forEach(val => {
          counts[val] = (counts[val] || 0) + 1;
        });
      } else if (answer) {
        counts[answer] = (counts[answer] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  };

  const getWordFrequency = (questionId: string) => {
    const words: Record<string, number> = {};
    const stopWords = new Set<string>(['the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us']);
    
    responses.forEach(r => {
      const answer = r.answers[questionId];
      if (typeof answer === 'string') {
        const tokens: string[] = answer.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
        tokens.forEach(token => {
          if (!stopWords.has(token) && token.length > 2) {
            words[token] = (words[token] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([text, value]) => ({ text, value }));
  };

  const branchingAnalytics = useMemo(() => {
    if (!form) {
      return {
        hasSections: false,
        transitions: [] as Array<{ from: string; to: string; count: number; percentage: number }>,
        sectionVisits: [] as Array<{ sectionId: string; sectionTitle: string; visits: number }>,
        submitRoutes: 0,
        simulatedResponses: 0,
        cycleStops: 0,
        sectionFunnel: [] as Array<{ sectionId: string; sectionTitle: string; reached: number; reachRate: number; exitToSubmit: number; exitRate: number }>,
        branchOptionFunnel: [] as Array<{ questionId: string; questionTitle: string; optionLabel: string; targetLabel: string; count: number; percentage: number }>,
        dropoffHeatmap: [] as Array<{ sectionId: string; sectionTitle: string; dropoffRate: number; exitToSubmit: number; forwardMoves: number; backwardMoves: number; visits: number }>,
        completionTrend: [] as Array<{ date: string; count: number; cumulative: number }>,
        abandonedVisits: 0,
        responsePaths: {} as Record<string, { path: string; outcome: string; visitedSections: number }>,
      };
    }

    const sections: Array<{ id: string; title: string; questions: Form['questions']; isDefault: boolean; branchToSectionId?: string | '__submit__' }> = [];
    let currentSection = {
      id: '__default__',
      title: form.title || 'Form start',
      questions: [] as Form['questions'],
      isDefault: true,
      branchToSectionId: undefined as string | '__submit__' | undefined,
    };
    let sawSectionMarker = false;

    form.questions.forEach((question) => {
      if (question.type === 'section') {
        if (currentSection.questions.length > 0 || !currentSection.isDefault) {
          sections.push(currentSection);
        }
        currentSection = {
          id: question.id,
          title: question.title || 'Untitled section',
          questions: [],
          isDefault: false,
          branchToSectionId: question.branchToSectionId,
        };
        sawSectionMarker = true;
        return;
      }
      currentSection.questions.push(question);
    });

    if (currentSection.questions.length > 0 || (sawSectionMarker && !currentSection.isDefault)) {
      sections.push(currentSection);
    }

    const hasSections = sections.some((section) => !section.isDefault);
    const sectionIndexMap = new Map(sections.map((section, index) => [section.id, index]));
    const titleById = new Map(sections.map((section) => [section.id, section.title]));
    const transitionCounts = new Map<string, number>();
    const visitCounts = new Map<string, number>();
    const sectionReachCounts = new Map<string, number>();
    const sectionTransitionSummary = new Map<string, { submit: number; forward: number; backward: number }>();
    const optionSelectionCounts = new Map<string, number>();
    const responsePaths: Record<string, { path: string; outcome: string; visitedSections: number }> = {};
    let submitRoutes = 0;
    let cycleStops = 0;

    const branchingQuestions = form.questions.filter((question) => {
      if (question.type !== 'multiple_choice' && question.type !== 'dropdown') return false;
      if (!question.options?.length) return false;
      return Boolean(question.branchToSectionId || question.optionBranchToSectionIds?.some(Boolean));
    });

    const hasAnswer = (value: unknown) => (
      Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''
    );

    const resolveQuestionTarget = (answers: Response['answers'], question: Form['questions'][number]) => {
      const answerValue = answers[question.id];
      if (!hasAnswer(answerValue)) {
        return { target: '' as string | '__submit__' | '', optionIndex: -1 };
      }

      if (question.type === 'multiple_choice' || question.type === 'dropdown') {
        const optionIndex = typeof answerValue === 'string'
          ? (question.options?.findIndex((option) => option === answerValue) ?? -1)
          : -1;
        const optionTarget = optionIndex >= 0 ? question.optionBranchToSectionIds?.[optionIndex] : undefined;
        if (optionTarget) {
          return { target: optionTarget, optionIndex };
        }
      }

      return { target: question.branchToSectionId || '', optionIndex: -1 };
    };

    const recordTransition = (fromId: string, toId: string) => {
      const key = `${fromId}::${toId}`;
      transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
      if (toId === '__submit__') {
        submitRoutes += 1;
      }

      const summary = sectionTransitionSummary.get(fromId) || { submit: 0, forward: 0, backward: 0 };
      if (toId === '__submit__') {
        summary.submit += 1;
      } else {
        const fromIndex = sectionIndexMap.get(fromId) ?? -1;
        const toIndex = sectionIndexMap.get(toId) ?? -1;
        if (toIndex > fromIndex) {
          summary.forward += 1;
        } else {
          summary.backward += 1;
        }
      }
      sectionTransitionSummary.set(fromId, summary);
    };

    responses.forEach((response) => {
      if (sections.length === 0) return;

      branchingQuestions.forEach((question) => {
        const answer = response.answers[question.id];
        if (typeof answer !== 'string') return;
        const optionIndex = question.options?.findIndex((option) => option === answer) ?? -1;
        if (optionIndex < 0) return;
        const key = `${question.id}::${optionIndex}`;
        optionSelectionCounts.set(key, (optionSelectionCounts.get(key) || 0) + 1);
      });

      const maxHops = Math.max(sections.length * 3, 6);
      const visitedInOrder: string[] = [];
      const uniqueVisited = new Set<string>();
      let hops = 0;
      let currentIndex = 0;
      let outcome = 'submitted';

      while (currentIndex >= 0 && currentIndex < sections.length && hops < maxHops) {
        hops += 1;
        const section = sections[currentIndex];
        visitedInOrder.push(section.id);
        uniqueVisited.add(section.id);
        visitCounts.set(section.id, (visitCounts.get(section.id) || 0) + 1);

        let targetId: string | '__submit__' | '' = '';
        for (let idx = section.questions.length - 1; idx >= 0; idx -= 1) {
          const nextTarget = resolveQuestionTarget(response.answers, section.questions[idx]).target;
          if (nextTarget) {
            targetId = nextTarget;
            break;
          }
        }

        if (targetId === '__submit__') {
          recordTransition(section.id, '__submit__');
          outcome = 'submitted';
          break;
        }

        if (targetId && sectionIndexMap.has(targetId)) {
          recordTransition(section.id, targetId);
          currentIndex = sectionIndexMap.get(targetId)!;
          continue;
        }

        const fallbackTarget = section.branchToSectionId || '';
        if (fallbackTarget === '__submit__') {
          recordTransition(section.id, '__submit__');
          outcome = 'submitted';
          break;
        }
        if (fallbackTarget && sectionIndexMap.has(fallbackTarget)) {
          recordTransition(section.id, fallbackTarget);
          currentIndex = sectionIndexMap.get(fallbackTarget)!;
          continue;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex < sections.length) {
          const nextSectionId = sections[nextIndex].id;
          recordTransition(section.id, nextSectionId);
          currentIndex = nextIndex;
        } else {
          recordTransition(section.id, '__submit__');
          outcome = 'submitted';
          break;
        }
      }

      if (hops >= Math.max(sections.length * 3, 6)) {
        cycleStops += 1;
        outcome = 'cycle-stop';
      }

      uniqueVisited.forEach((sectionId) => {
        sectionReachCounts.set(sectionId, (sectionReachCounts.get(sectionId) || 0) + 1);
      });

      const readablePath = visitedInOrder.length > 0
        ? `${visitedInOrder.map((sectionId) => titleById.get(sectionId) || 'Unknown').join(' -> ')} -> ${outcome === 'cycle-stop' ? 'Safety stop' : 'Submit form'}`
        : 'No section visited';
      responsePaths[response.id] = {
        path: readablePath,
        outcome,
        visitedSections: uniqueVisited.size,
      };
    });

    const totalTransitions = Array.from(transitionCounts.values()).reduce((acc, value) => acc + value, 0);
    const transitions = Array.from(transitionCounts.entries())
      .map(([key, count]) => {
        const [fromId, toId] = key.split('::');
        return {
          from: titleById.get(fromId) || 'Unknown',
          to: toId === '__submit__' ? 'Submit form' : (titleById.get(toId) || 'Unknown section'),
          count,
          percentage: totalTransitions > 0 ? Math.round((count / totalTransitions) * 100) : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    const sectionVisits = sections
      .map((section) => ({
        sectionId: section.id,
        sectionTitle: section.title,
        visits: visitCounts.get(section.id) || 0,
      }))
      .sort((a, b) => b.visits - a.visits);

    const sectionFunnel = sections.map((section) => {
      const reached = sectionReachCounts.get(section.id) || 0;
      const summary = sectionTransitionSummary.get(section.id) || { submit: 0, forward: 0, backward: 0 };
      return {
        sectionId: section.id,
        sectionTitle: section.title,
        reached,
        reachRate: responses.length > 0 ? Math.round((reached / responses.length) * 100) : 0,
        exitToSubmit: summary.submit,
        exitRate: reached > 0 ? Math.round((summary.submit / reached) * 100) : 0,
      };
    });

    const branchOptionFunnel = branchingQuestions.flatMap((question) => {
      const totalSelections = question.options?.reduce((acc, _, optionIndex) => {
        const key = `${question.id}::${optionIndex}`;
        return acc + (optionSelectionCounts.get(key) || 0);
      }, 0) || 0;

      return (question.options || []).map((optionLabel, optionIndex) => {
        const key = `${question.id}::${optionIndex}`;
        const count = optionSelectionCounts.get(key) || 0;
        const targetId = question.optionBranchToSectionIds?.[optionIndex];
        const targetLabel = targetId === '__submit__'
          ? 'Submit form'
          : (targetId ? (titleById.get(targetId) || 'Unknown section') : 'Default next section');
        return {
          questionId: question.id,
          questionTitle: question.title || 'Untitled question',
          optionLabel,
          targetLabel,
          count,
          percentage: totalSelections > 0 ? Math.round((count / totalSelections) * 100) : 0,
        };
      });
    });

    const dropoffHeatmap = sections.map((section) => {
      const sectionSummary = sectionTransitionSummary.get(section.id) || { submit: 0, forward: 0, backward: 0 };
      const visits = visitCounts.get(section.id) || 0;
      const dropoffRate = visits > 0 ? Math.round((sectionSummary.submit / visits) * 100) : 0;
      return {
        sectionId: section.id,
        sectionTitle: section.title,
        dropoffRate,
        exitToSubmit: sectionSummary.submit,
        forwardMoves: sectionSummary.forward,
        backwardMoves: sectionSummary.backward,
        visits,
      };
    });

    const dailyCountMap = responses.reduce((acc, response) => {
      const date = new Date(response.submittedAt).toISOString().slice(0, 10);
      acc.set(date, (acc.get(date) || 0) + 1);
      return acc;
    }, new Map<string, number>());
    let cumulative = 0;
    const completionTrend = Array.from(dailyCountMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        cumulative += count;
        return { date, count, cumulative };
      });

    return {
      hasSections,
      transitions,
      sectionVisits,
      submitRoutes,
      simulatedResponses: responses.length,
      cycleStops,
      sectionFunnel,
      branchOptionFunnel,
      dropoffHeatmap,
      completionTrend,
      abandonedVisits: Math.max((form.views || 0) - responses.length, 0),
      responsePaths,
    };
  }, [form, responses]);

  const exportToCSV = () => {
    if (!form || responses.length === 0) return;

    const escapeCSV = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const formatAnswerForCsv = (question: Form['questions'][number], answer: unknown): string => {
      if (question.type !== 'image_upload') {
        return Array.isArray(answer) ? answer.join('; ') : String(answer ?? '');
      }

      const values = Array.isArray(answer) ? answer : [answer];
      const normalized: string[] = values
        .filter((item) => item !== undefined && item !== null && item !== '')
        .map((item) => String(item));

      const urlValues = normalized.filter((item) => /^https?:\/\//i.test(item));
      const inlineImageCount = normalized.filter((item) => item.startsWith('data:image/')).length;

      if (urlValues.length > 0) {
        return urlValues.join('; ');
      }
      if (inlineImageCount > 0) {
        return `[legacy-inline-image:${inlineImageCount}]`;
      }

      return normalized.join('; ');
    };
    const lines: string[] = [];

    lines.push(
      [
        'Response ID',
        'Submitted At',
        'Route Path',
        'Outcome',
        'Visited Sections',
        ...form.questions.map((q) => q.title),
      ].map(escapeCSV).join(',')
    );

    responses.forEach((response) => {
      const meta = branchingAnalytics.responsePaths[response.id];
      const row: string[] = [
        response.id,
        new Date(response.submittedAt).toISOString(),
        meta?.path || '',
        meta?.outcome || 'submitted',
        String(meta?.visitedSections ?? 0),
      ];
      form.questions.forEach((question) => {
        const answer = response.answers[question.id];
        row.push(formatAnswerForCsv(question, answer));
      });
      lines.push(row.map(escapeCSV).join(','));
    });

    if (branchingAnalytics.sectionFunnel.length > 0) {
      lines.push('');
      lines.push(['Section Funnel'].map(escapeCSV).join(','));
      lines.push(['Section', 'Reached', 'Reach Rate %', 'Exit to Submit', 'Exit Rate %'].map(escapeCSV).join(','));
      branchingAnalytics.sectionFunnel.forEach((item) => {
        lines.push([item.sectionTitle, item.reached, item.reachRate, item.exitToSubmit, item.exitRate].map(escapeCSV).join(','));
      });
    }

    if (branchingAnalytics.branchOptionFunnel.length > 0) {
      lines.push('');
      lines.push(['Branch Option Funnel'].map(escapeCSV).join(','));
      lines.push(['Question', 'Option', 'Target', 'Count', 'Share %'].map(escapeCSV).join(','));
      branchingAnalytics.branchOptionFunnel.forEach((item) => {
        lines.push([item.questionTitle, item.optionLabel, item.targetLabel, item.count, item.percentage].map(escapeCSV).join(','));
      });
    }

    if (branchingAnalytics.completionTrend.length > 0) {
      lines.push('');
      lines.push(['Completion Trend'].map(escapeCSV).join(','));
      lines.push(['Date', 'Responses', 'Cumulative'].map(escapeCSV).join(','));
      branchingAnalytics.completionTrend.forEach((item) => {
        lines.push([item.date, item.count, item.cumulative].map(escapeCSV).join(','));
      });
    }

    // Prefix UTF-8 BOM so Excel on Windows opens Vietnamese text correctly.
    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${form.title.replace(/\s+/g, '_')}_analytics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );

  if (!form) return <div>Form not found.</div>;

  return (
    <div className="container mx-auto p-8 space-y-10 max-w-4xl">
      <div className="flex items-center gap-6 bg-white p-10 rounded-[32px] border border-natural-border shadow-sm">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-natural-accent text-natural-muted shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-4xl font-serif font-light text-natural-primary truncate">{form.title}</h2>
          <div className="flex items-center gap-2 mt-2 text-natural-muted text-sm font-medium">
            <Users className="h-4 w-4" />
            {responses.length} Collected Insights
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <Button 
            onClick={exportToCSV}
            disabled={responses.length === 0}
            className="btn-natural shrink-0"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="bg-natural-accent p-1 rounded-full w-full max-w-[500px] mx-auto flex justify-center mb-10">
          <TabsTrigger value="summary" className="rounded-full px-8 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm text-natural-muted data-[state=active]:text-natural-primary">Summary View</TabsTrigger>
          <TabsTrigger value="individual" className="rounded-full px-8 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm text-natural-muted data-[state=active]:text-natural-primary">Raw Data</TabsTrigger>
          <TabsTrigger value="analytics" className="rounded-full px-8 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm text-natural-muted data-[state=active]:text-natural-primary">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-8">
          {form.questions.map((question) => {
            const hasData = responses.some(r => r.answers[question.id]);
            if (!hasData) return null;

            const chartData = getChartData(question);
            const isChartable = ['multiple_choice', 'checkbox', 'dropdown'].includes(question.type);

            return (
              <div key={question.id} className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] p-10 border border-natural-border">
                <div className="mb-8">
                  <h3 className="text-xl font-medium text-natural-primary mb-1">{question.title}</h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-natural-muted">{responses.filter(r => r.answers[question.id]).length} responses</p>
                </div>
                
                <div>
                  {isChartable ? (
                    <div className="h-[340px] w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                        {question.type === 'checkbox' ? (
                          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                            <XAxis type="number" axisLine={false} tickLine={false} className="text-xs" />
                            <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} className="text-xs" />
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }} />
                            <Bar dataKey="value" fill="#5C6351" radius={[0, 8, 8, 0]}>
                              {chartData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        ) : (
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }} />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(() => {
                        if (question.type === 'image_upload') return null;
                        const wordFreq = getWordFrequency(question.id);
                        if (wordFreq.length === 0) return null;
                        const maxFreq = Math.max(...wordFreq.map(w => w.value));
                        return (
                          <div className="flex flex-wrap gap-x-4 gap-y-3 items-center justify-center p-8 bg-natural-bg/50 rounded-2xl border border-natural-border/50">
                            {wordFreq.map((w, i) => (
                              <div
                                key={i}
                                className="text-natural-primary flex items-center gap-1 group cursor-default transition-all duration-300 hover:scale-110"
                                style={{ 
                                  fontSize: `${14 + (w.value / maxFreq) * 20}px`,
                                  opacity: 0.6 + (w.value / maxFreq) * 0.4,
                                  fontWeight: w.value >= maxFreq * 0.8 ? 700 : (w.value >= maxFreq * 0.5 ? 600 : 400)
                                }}
                                title={`${w.text}: ${w.value} occurrences`}
                              >
                                {w.text}
                                <span className="text-[10px] bg-natural-border px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap align-text-top mb-auto mt-1">
                                  {w.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <div className="grid gap-3">
                         {responses.map((r, i) => r.answers[question.id] && (
                           <div key={i} className="bg-natural-bg border border-natural-border p-5 rounded-2xl text-sm leading-relaxed text-natural-text font-light">
                             {question.type === 'image_upload' ? (
                               <div className="flex flex-wrap gap-4">
                                 {Array.isArray(r.answers[question.id]) ? r.answers[question.id].map((imgUrl: string, idx: number) => (
                                   <img key={idx} src={imgUrl} alt={`Response ${idx + 1}`} className="max-w-full h-auto max-h-48 rounded-xl object-contain" />
                                 )) : (
                                   <img src={r.answers[question.id]} alt="Response" className="max-w-full h-auto max-h-48 rounded-xl object-contain" />
                                 )}
                               </div>
                             ) : (
                               r.answers[question.id]
                             )}
                           </div>
                         )).filter(Boolean).slice(0, 10)}
                         {responses.filter(r => r.answers[question.id]).length > 10 && <p className="text-xs text-natural-muted text-center pt-4">Visualizing first 10 responses</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="individual" className="space-y-8">
          {responses.length === 0 ? (
            <div className="bg-white p-20 rounded-[32px] text-center border-2 border-dashed border-natural-border">
              <MessageSquare className="h-12 w-12 text-natural-border mx-auto mb-4" />
              <p className="text-natural-muted">No responses have arrived yet.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {responses.map((response, index) => (
                <div key={response.id} className="w-full bg-white rounded-[32px] shadow-[0_5px_15px_rgba(0,0,0,0.02)] border border-natural-border overflow-hidden">
                  <div className="bg-natural-accent/50 px-10 py-5 border-b border-natural-border flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest text-natural-primary">Response #{index + 1}</span>
                    <span className="text-xs text-natural-muted">
                      {new Date(response.submittedAt).toLocaleDateString()} at {new Date(response.submittedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="p-10 space-y-8">
                    {form.questions.map(q => (
                      <div key={q.id} className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-natural-muted">{q.title}</p>
                        <div className="bg-natural-bg p-4 rounded-2xl border border-natural-border text-natural-text font-light">
                          {q.type === 'image_upload' && response.answers[q.id] ? (
                            <div className="flex flex-wrap gap-4">
                              {Array.isArray(response.answers[q.id]) ? response.answers[q.id].map((imgUrl: string, idx: number) => (
                                <img key={idx} src={imgUrl} alt={`Response ${idx + 1}`} className="max-w-full h-auto max-h-48 rounded-xl object-contain" />
                              )) : (
                                <img src={response.answers[q.id]} alt="Response" className="max-w-full h-auto max-h-48 rounded-xl object-contain" />
                              )}
                            </div>
                          ) : Array.isArray(response.answers[q.id]) 
                            ? response.answers[q.id].join(', ') 
                            : (response.answers[q.id] || <span className="italic text-muted-foreground opacity-50">No data collected</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-8">
          {branchingAnalytics.hasSections && (
            <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-2xl flex items-center gap-2">
                  <GitBranch className="h-6 w-6 text-natural-primary" />
                  Branching Analytics
                </CardTitle>
                <CardDescription>
                  Route usage across sections and submit paths ({branchingAnalytics.simulatedResponses} responses).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-natural-border bg-natural-bg/60 p-4">
                    <p className="text-xs uppercase tracking-widest text-natural-muted">Top Route</p>
                    <p className="text-sm font-semibold text-natural-text mt-1">
                      {branchingAnalytics.transitions[0]
                        ? `${branchingAnalytics.transitions[0].from} -> ${branchingAnalytics.transitions[0].to}`
                        : 'No route data'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-natural-border bg-natural-bg/60 p-4">
                    <p className="text-xs uppercase tracking-widest text-natural-muted">Submit Route Hits</p>
                    <p className="text-2xl font-bold text-natural-primary mt-1">{branchingAnalytics.submitRoutes}</p>
                  </div>
                  <div className="rounded-2xl border border-natural-border bg-natural-bg/60 p-4">
                    <p className="text-xs uppercase tracking-widest text-natural-muted">Cycle Safety Stops</p>
                    <p className="text-2xl font-bold text-natural-primary mt-1">{branchingAnalytics.cycleStops}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-natural-border p-4">
                    <p className="text-sm font-semibold text-natural-text mb-3">Most Used Routes</p>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {branchingAnalytics.transitions.slice(0, 12).map((transition, index) => (
                        <div key={`${transition.from}-${transition.to}-${index}`} className="flex items-center justify-between rounded-xl bg-natural-bg/70 px-3 py-2">
                          <p className="text-sm text-natural-text">
                            {transition.from} <span className="text-natural-muted">→</span> {transition.to}
                          </p>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-natural-primary">{transition.count}</p>
                            <p className="text-[11px] text-natural-muted">{transition.percentage}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-natural-border p-4">
                    <p className="text-sm font-semibold text-natural-text mb-3">Section Visit Count</p>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {branchingAnalytics.sectionVisits.map((section) => (
                        <div key={section.sectionId} className="flex items-center justify-between rounded-xl bg-natural-bg/70 px-3 py-2">
                          <p className="text-sm text-natural-text">{section.sectionTitle}</p>
                          <p className="text-sm font-semibold text-natural-primary">{section.visits}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {branchingAnalytics.sectionFunnel.length > 0 && (
            <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-2xl">Section Funnel</CardTitle>
                <CardDescription>Reach rate and early submit exits by section.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                    <BarChart data={branchingAnalytics.sectionFunnel} margin={{ left: 16, right: 20, top: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="sectionTitle" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #E5E5E5', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
                      <Legend />
                      <Bar dataKey="reachRate" name="Reach %" fill="#5C6351" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="exitRate" name="Exit to Submit %" fill="#C97A63" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {branchingAnalytics.branchOptionFunnel.length > 0 && (
            <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-2xl">Branch Option Funnel</CardTitle>
                <CardDescription>Distribution of answer options on branch-enabled questions.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {branchingAnalytics.branchOptionFunnel
                    .filter((item) => item.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map((item, index) => (
                      <div key={`${item.questionId}-${item.optionLabel}-${item.targetLabel}-${index}`} className="rounded-2xl border border-natural-border bg-natural-bg/60 p-4">
                        <p className="text-xs uppercase tracking-widest text-natural-muted">{item.questionTitle}</p>
                        <div className="mt-2 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-natural-text">{item.optionLabel}</p>
                            <p className="text-xs text-natural-muted mt-1">Target: {item.targetLabel}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-natural-primary">{item.count}</p>
                            <p className="text-xs text-natural-muted">{item.percentage}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {branchingAnalytics.dropoffHeatmap.length > 0 && (
            <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-2xl">Drop-off Heatmap</CardTitle>
                <CardDescription>
                  Exit-to-submit intensity by section. Estimated unsubmitted views: {branchingAnalytics.abandonedVisits}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-3">
                  {branchingAnalytics.dropoffHeatmap.map((item) => {
                    const intensity = Math.min(5, Math.floor(item.dropoffRate / 20));
                    return (
                      <div
                        key={item.sectionId}
                        className="rounded-2xl border border-natural-border p-4"
                        style={{ backgroundColor: HEAT_COLORS[intensity] }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-natural-text">{item.sectionTitle}</p>
                          <p className="text-xs text-natural-muted">Drop-off {item.dropoffRate}%</p>
                        </div>
                        <div className="mt-2 text-xs text-natural-muted flex flex-wrap gap-3">
                          <span>Visits: {item.visits}</span>
                          <span>Exit to submit: {item.exitToSubmit}</span>
                          <span>Forward moves: {item.forwardMoves}</span>
                          <span>Backward moves: {item.backwardMoves}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {branchingAnalytics.completionTrend.length > 0 && (
            <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-2xl">Completion Trend</CardTitle>
                <CardDescription>Daily response volume and cumulative growth over time.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                    <LineChart data={branchingAnalytics.completionTrend} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #E5E5E5', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} />
                      <Legend />
                      <Line type="monotone" dataKey="count" name="Responses/day" stroke="#5C6351" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="#C97A63" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="rounded-[32px] border border-natural-border shadow-sm overflow-hidden flex flex-col justify-center items-center p-8 text-center bg-white">
              <Activity className="h-10 w-10 text-natural-primary mb-4" />
              <h3 className="text-xl font-semibold text-natural-primary">Completion Rate</h3>
              <p className="text-4xl font-bold text-natural-text mt-2">
                {form.views ? Math.round((responses.length / Math.max(form.views, responses.length)) * 100) : 100}%
              </p>
              <p className="text-sm text-natural-muted mt-2">
                {responses.length} responses out of {Math.max(form.views || 0, responses.length)} views
              </p>
            </Card>

            <Card className="rounded-[32px] border border-natural-border shadow-sm overflow-hidden flex flex-col justify-center items-center p-8 text-center bg-white">
              <Clock className="h-10 w-10 text-natural-primary mb-4" />
              <h3 className="text-xl font-semibold text-natural-primary">Avg. Time to Complete</h3>
              <p className="text-4xl font-bold text-natural-text mt-2">
                {responses.filter(r => r.timeToComplete).length > 0
                  ? (() => {
                      const avgSecs = Math.round(responses.filter(r => r.timeToComplete).reduce((acc, r) => acc + (r.timeToComplete || 0), 0) / responses.filter(r => r.timeToComplete).length);
                      const m = Math.floor(avgSecs / 60);
                      const s = avgSecs % 60;
                      return m > 0 ? `${m}m ${s}s` : `${s}s`;
                    })()
                  : 'N/A'
                }
              </p>
              <p className="text-sm text-natural-muted mt-2">
                Based on {responses.filter(r => r.timeToComplete).length} timed responses
              </p>
            </Card>

            <Card className="rounded-[32px] border border-natural-border shadow-sm overflow-hidden flex flex-col justify-center items-center p-8 text-center bg-white">
              <Globe className="h-10 w-10 text-natural-primary mb-4" />
              <h3 className="text-xl font-semibold text-natural-primary">Top Timezone</h3>
              <p className="text-2xl font-bold text-natural-text mt-2 break-all max-w-full px-2">
                {(() => {
                  const tzs = responses.map(r => r.timezone).filter(Boolean);
                  if (tzs.length === 0) return 'N/A';
                  const counts = tzs.reduce<Record<string, number>>((acc, tz) => {
                    acc[tz as string] = (acc[tz as string] || 0) + 1;
                    return acc;
                  }, {});
                  const top = Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
                  return top[0];
                })()}
              </p>
              <p className="text-sm text-natural-muted mt-2">
                Geographic distribution
              </p>
            </Card>
          </div>

          <Card className="rounded-[32px] border border-natural-border shadow-sm p-8 bg-white">
            <CardHeader className="p-0 pb-6 text-center">
              <CardTitle className="text-2xl">Geographic Distribution</CardTitle>
              <CardDescription>Based on respondent timezones</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {(() => {
                const tzData = responses.reduce((acc, r) => {
                  const tz = r.timezone || 'Unknown';
                  const existing = acc.find(item => item.name === tz);
                  if (existing) {
                    existing.value += 1;
                  } else {
                    acc.push({ name: tz, value: 1 });
                  }
                  return acc;
                }, [] as {name: string, value: number}[]);

                if (tzData.length === 0 || (tzData.length === 1 && tzData[0].name === 'Unknown')) {
                  return (
                    <div className="flex h-full items-center justify-center text-natural-muted italic">
                      No timezone data available
                    </div>
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                    <PieChart>
                      <Pie
                        data={tzData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={130}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {tzData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: '1px solid #E5E5E5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
