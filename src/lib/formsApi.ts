import { CollaboratorRole, Form, FormAuditEvent, FormCollaborator, Response } from '../types';
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

type FormCollaboratorRow = {
  form_id: string;
  user_id: string;
  role: Exclude<CollaboratorRole, 'owner'>;
  created_at: string;
};

type FormAuditRow = {
  id: string;
  form_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type NewFormPayload = Omit<Form, 'id'>;
type NewResponsePayload = Omit<Response, 'id'>;

function isMissingSchemaObject(error: unknown, objectName: string) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === 'PGRST205'
    && candidate.message?.toLowerCase().includes(objectName.toLowerCase())
  );
}

function validateFormRouting(form: Partial<Form> | NewFormPayload) {
  if (!('questions' in form) || !Array.isArray(form.questions)) return;

  const questions = form.questions;
  const enforceForwardRoutes = Boolean(form.settings?.enforceForwardRoutes);
  const sectionIds = new Set(
    questions
      .filter((question) => question.type === 'section')
      .map((question) => question.id)
  );
  const sectionOrder = new Map<string, number>();
  let sourceSectionIndex = 0;
  let nextSectionIndex = 1;

  const isValidTarget = (target: string | '__submit__' | undefined) => {
    if (!target) return true;
    if (target === '__submit__') return true;
    return sectionIds.has(target);
  };

  for (const question of questions) {
    if (question.type === 'section') {
      sectionOrder.set(question.id, nextSectionIndex);
      sourceSectionIndex = nextSectionIndex;
      nextSectionIndex += 1;
      continue;
    }
    sectionOrder.set(question.id, sourceSectionIndex);
  }

  sourceSectionIndex = 0;
  for (const question of questions) {
    if (question.type === 'section') {
      sourceSectionIndex = sectionOrder.get(question.id) ?? sourceSectionIndex;
      continue;
    }

    const validateForwardTarget = (target: string | '__submit__' | undefined) => {
      if (!enforceForwardRoutes || !target || target === '__submit__') return;
      const targetSectionIndex = sectionOrder.get(target);
      if (targetSectionIndex !== undefined && targetSectionIndex <= sourceSectionIndex) {
        throw new Error(`Backward route is not allowed on question ${question.id}`);
      }
    };

    if (!isValidTarget(question.branchToSectionId)) {
      throw new Error(`Invalid section route target on question ${question.id}`);
    }
    validateForwardTarget(question.branchToSectionId);

    if (Array.isArray(question.optionBranchToSectionIds)) {
      for (const target of question.optionBranchToSectionIds) {
        if (!isValidTarget(target)) {
          throw new Error(`Invalid option section route target on question ${question.id}`);
        }
        validateForwardTarget(target);
      }
    }
  }
}

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

export async function listAccessibleForms(userId: string): Promise<Form[]> {
  const ownFormsPromise = supabase
    .from('forms')
    .select('*')
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false });

  const collaboratorLinksPromise = supabase
    .from('form_collaborators')
    .select('form_id')
    .eq('user_id', userId);

  const [{ data: ownFormsData, error: ownFormsError }, { data: collaboratorLinks, error: collaboratorLinksError }] = await Promise.all([
    ownFormsPromise,
    collaboratorLinksPromise,
  ]);

  if (ownFormsError) throw ownFormsError;
  if (collaboratorLinksError) {
    // Backward compatibility: migration for form_collaborators may not be applied yet.
    if (isMissingSchemaObject(collaboratorLinksError, 'form_collaborators')) {
      return ((ownFormsData || []) as FormRow[]).map(mapFormRow);
    }
    throw collaboratorLinksError;
  }

  const collaboratorFormIds = (collaboratorLinks || []).map((item: { form_id: string }) => item.form_id);
  if (collaboratorFormIds.length === 0) {
    return ((ownFormsData || []) as FormRow[]).map(mapFormRow);
  }

  const { data: sharedFormsData, error: sharedFormsError } = await supabase
    .from('forms')
    .select('*')
    .in('id', collaboratorFormIds)
    .order('updated_at', { ascending: false });

  if (sharedFormsError) throw sharedFormsError;

  const merged = [...((ownFormsData || []) as FormRow[]), ...((sharedFormsData || []) as FormRow[])];
  const dedupedById = new Map<string, FormRow>();
  merged.forEach((row) => {
    dedupedById.set(row.id, row);
  });

  return Array.from(dedupedById.values())
    .map(mapFormRow)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createFormRecord(form: NewFormPayload): Promise<Form> {
  validateFormRouting(form);

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
  validateFormRouting(form);

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

export async function getFormAccessRole(formId: string, userId: string): Promise<CollaboratorRole | null> {
  const form = await getFormRecord(formId);
  if (!form) return null;
  if (form.creatorId === userId) return 'owner';

  const { data, error } = await supabase
    .from('form_collaborators')
    .select('role')
    .eq('form_id', formId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.role as Exclude<CollaboratorRole, 'owner'> | undefined) || null;
}

export async function listFormCollaborators(formId: string): Promise<FormCollaborator[]> {
  const [form, linksResult] = await Promise.all([
    getFormRecord(formId),
    supabase
      .from('form_collaborators')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: true }),
  ]);

  if (!form) return [];
  if (linksResult.error) throw linksResult.error;

  const links = (linksResult.data || []) as FormCollaboratorRow[];
  const collaboratorUserIds = new Set<string>([form.creatorId, ...links.map((row) => row.user_id)]);
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', Array.from(collaboratorUserIds));

  if (profileError) throw profileError;

  const profileByUserId = new Map(
    (profileRows || []).map((profile: { user_id: string; display_name: string; avatar_url: string | null }) => [
      profile.user_id,
      profile,
    ])
  );

  const ownerProfile = profileByUserId.get(form.creatorId);
  const collaborators: FormCollaborator[] = [
    {
      formId,
      userId: form.creatorId,
      role: 'owner',
      createdAt: new Date(form.createdAt).toISOString(),
      displayName: ownerProfile?.display_name,
      avatarUrl: ownerProfile?.avatar_url || undefined,
    },
  ];

  links.forEach((row) => {
    const profile = profileByUserId.get(row.user_id);
    collaborators.push({
      formId: row.form_id,
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      displayName: profile?.display_name,
      avatarUrl: profile?.avatar_url || undefined,
    });
  });

  return collaborators;
}

export async function resolveCollaboratorUserIdByEmail(formId: string, email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await supabase.rpc('resolve_user_id_by_email_for_form_owner', {
    target_form_id: formId,
    target_email: normalizedEmail,
  });
  if (error) throw error;
  return (data as string | null) || null;
}

export async function upsertFormCollaborator(formId: string, userId: string, role: Exclude<CollaboratorRole, 'owner'>): Promise<void> {
  const { error } = await supabase
    .from('form_collaborators')
    .upsert(
      {
        form_id: formId,
        user_id: userId,
        role,
      },
      {
        onConflict: 'form_id,user_id',
      }
    );

  if (error) throw error;
}

export async function removeFormCollaborator(formId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('form_collaborators')
    .delete()
    .eq('form_id', formId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function listFormAuditEvents(formId: string, limit = 50): Promise<FormAuditEvent[]> {
  const { data: rows, error } = await supabase
    .from('form_audit_logs')
    .select('*')
    .eq('form_id', formId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const auditRows = (rows || []) as FormAuditRow[];
  const actorIds = Array.from(new Set(auditRows.map((row) => row.actor_user_id).filter(Boolean))) as string[];
  const { data: profileRows, error: profileError } = actorIds.length > 0
    ? await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', actorIds)
    : { data: [], error: null };

  if (profileError) throw profileError;
  const profileByUserId = new Map(
    (profileRows || []).map((profile: { user_id: string; display_name: string; avatar_url: string | null }) => [
      profile.user_id,
      profile,
    ])
  );

  return auditRows.map((row) => {
    const actorProfile = row.actor_user_id ? profileByUserId.get(row.actor_user_id) : undefined;
    return {
      id: row.id,
      formId: row.form_id,
      actorUserId: row.actor_user_id || undefined,
      eventType: row.event_type,
      payload: row.payload || undefined,
      createdAt: row.created_at,
      actorDisplayName: actorProfile?.display_name,
      actorAvatarUrl: actorProfile?.avatar_url || undefined,
    };
  });
}
