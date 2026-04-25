'use client';

import React, { useEffect, useState } from 'react';
import { Form, Response } from '../types';
import { getFormRecord, listResponsesForForm } from '../lib/formsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ArrowLeft, Users, MessageSquare, Download, Clock, Globe, Activity } from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { useDarkMode } from '../hooks/useDarkMode';

interface ResponsesProps {
  formId: string;
  onBack: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const Responses: React.FC<ResponsesProps> = ({ formId, onBack }) => {
  const { isDark } = useDarkMode();
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

  const exportToCSV = () => {
    if (!form || responses.length === 0) return;

    const headers = ['Submitted At', ...form.questions.map(q => q.title)];
    
    const rows = responses.map(r => {
      const row = [new Date(r.submittedAt).toISOString()];
      form.questions.forEach(q => {
        let answer = r.answers[q.id];
        if (Array.isArray(answer)) {
          answer = answer.join('; ');
        }
        let formattedAnswer = answer ? String(answer).replace(/"/g, '""') : '';
        if (formattedAnswer.includes(',') || formattedAnswer.includes('"') || formattedAnswer.includes('\n')) {
          formattedAnswer = `"${formattedAnswer}"`;
        }
        row.push(formattedAnswer);
      });
      return row.join(',');
    });

    const csvContent = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${form.title.replace(/\s+/g, '_')}_responses.csv`);
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
          <DarkModeToggle />
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
                      <ResponsiveContainer width="100%" height="100%">
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
                  <ResponsiveContainer width="100%" height="100%">
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
