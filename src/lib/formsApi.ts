import { Form, Response } from '../types';
import { supabase } from './supabase';

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  creator_id: string;
  created_at: number;
  updated_at: number;
  questions: Form['questions'];
  settings: Form['settings'];
  theme: Form['theme'] | null;
  versions: Form['versions'] | null;
  views: number | null;
};

type ResponseRow = {
  id: string;
  form_id: string;
  respondent_email: string | null;
  submitted_at: number;
  answers: Response['answers'];
  time_to_complete: number | null;
  timezone: string | null;
};

type NewFormPayload = Omit<Form, 'id'>;
type NewResponsePayload = Omit<Response, 'id'>;

function mapFormRow(row: FormRow): Form {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    creatorId: row.creator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questions: row.questions || [],
    settings: row.settings,
    theme: row.theme || undefined,
    versions: row.versions || undefined,
    views: row.views || 0,
  };
}

function mapResponseRow(row: ResponseRow): Response {
  return {
    id: row.id,
    formId: row.form_id,
    respondentEmail: row.respondent_email || undefined,
    submittedAt: row.submitted_at,
    answers: row.answers || {},
    timeToComplete: row.time_to_complete || undefined,
    timezone: row.timezone || undefined,
  };
}

function formToRow(form: Partial<Form> | NewFormPayload) {
  const row: Record<string, unknown> = {};

  if ('title' in form) row.title = form.title;
  if ('description' in form) row.description = form.description || null;
  if ('creatorId' in form) row.creator_id = form.creatorId;
  if ('createdAt' in form) row.created_at = form.createdAt;
  if ('updatedAt' in form) row.updated_at = form.updatedAt;
  if ('questions' in form) row.questions = form.questions;
  if ('settings' in form) row.settings = form.settings;
  if ('theme' in form) row.theme = form.theme || null;
  if ('versions' in form) row.versions = form.versions || null;
  if ('views' in form) row.views = form.views || 0;

  return row;
}

function responseToRow(response: NewResponsePayload) {
  return {
    form_id: response.formId,
    respondent_email: response.respondentEmail || null,
    submitted_at: response.submittedAt,
    answers: response.answers,
    time_to_complete: response.timeToComplete || null,
    timezone: response.timezone || null,
  };
}

export async function listFormsByCreator(creatorId: string): Promise<Form[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data || []) as FormRow[]).map(mapFormRow);
}

export async function createFormRecord(form: NewFormPayload): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .insert(formToRow(form))
    .select('*')
    .single();

  if (error) throw error;
  return mapFormRow(data as FormRow);
}

export async function getFormRecord(formId: string): Promise<Form | null> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', formId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapFormRow(data as FormRow) : null;
}

export async function updateFormRecord(formId: string, form: Partial<Form>): Promise<void> {
  const { error } = await supabase
    .from('forms')
    .update(formToRow(form))
    .eq('id', formId);

  if (error) throw error;
}

export async function deleteFormRecord(formId: string): Promise<void> {
  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', formId);

  if (error) throw error;
}

export async function incrementFormViews(formId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_form_views', {
    target_form_id: formId,
  });

  if (error) throw error;
}

export async function createResponseRecord(response: NewResponsePayload): Promise<void> {
  const { error } = await supabase
    .from('responses')
    .insert(responseToRow(response));

  if (error) throw error;
}

export async function listResponsesForForm(formId: string): Promise<Response[]> {
  const { data, error } = await supabase
    .from('responses')
    .select('*')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return ((data || []) as ResponseRow[]).map(mapResponseRow);
}
