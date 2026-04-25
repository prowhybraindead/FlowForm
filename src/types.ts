export type QuestionType = 'short_answer' | 'paragraph' | 'multiple_choice' | 'checkbox' | 'dropdown' | 'date' | 'time' | 'email' | 'number' | 'image_upload';

export interface Condition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  options?: string[]; // For multiple_choice, checkbox, dropdown
  optionImages?: string[]; // Array of base64 strings corresponding to options index
  hasOtherOption?: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    minTime?: string;
    maxTime?: string;
    minDate?: string;
    maxDate?: string;
    dateConstraint?: 'past' | 'future' | 'none';
    pattern?: string;
    minSelections?: number;
    maxSelections?: number;
  };
  logic?: {
    action: 'show' | 'hide';
    matchType: 'all' | 'any';
    conditions: Condition[];
  };
}

export interface FormVersion {
  id: string;
  name: string;
  timestamp: number;
  data: Omit<Form, 'id' | 'views' | 'versions'>;
}

export interface Form {
  id: string;
  title: string;
  description?: string;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
  questions: Question[];
  versions?: FormVersion[];
  settings: {
    collectEmails: boolean;
    limitOneResponse: boolean;
    isPublic: boolean;
    customDomain?: string;
    publishImmediately?: boolean;
    expirationDate?: string;
    thankYouMessage?: string;
    redirectUrlAfterSubmit?: string;
    showProgressBar?: boolean;
    showOwnerProfile?: boolean;
  };
  theme?: {
    accentColor?: string;
    headerImage?: string;
    backgroundColor?: string;
    titleFont?: string;
    bodyFont?: string;
    logo?: string;
  };
  views?: number;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  updatedAt?: string;
}

export interface Response {
  id: string;
  formId: string;
  respondentEmail?: string;
  submittedAt: number;
  answers: {
    [questionId: string]: any;
  };
  timeToComplete?: number; // in seconds
  timezone?: string;
}
