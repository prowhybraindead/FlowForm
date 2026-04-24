import { create } from 'zustand';
import { Form, Question, QuestionType } from '../types';

interface FormState {
  currentForm: Form | null;
  past: Form[];
  future: Form[];
  setCurrentForm: (form: Form | null) => void;
  updateForm: (updates: Partial<Form>) => void;
  addQuestion: (type: QuestionType) => void;
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  removeQuestion: (id: string) => void;
  duplicateQuestion: (id: string) => void;
  reorderQuestions: (newQuestions: Question[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const DEFAULT_QUESTION_TITLE = 'Untitled Question';

const saveHistory = (state: FormState, newForm: Form): Partial<FormState> => {
  if (!state.currentForm) return { currentForm: newForm };
  // Only save to history if it actually changed meaningfully to avoid spamming 
  // (we skip this check for simplicity but could do deep compare if needed)
  const newPast = [...state.past, state.currentForm].slice(-50);
  return {
    past: newPast,
    future: [],
    currentForm: newForm,
    canUndo: true,
    canRedo: false,
  };
};

export const useFormStore = create<FormState>((set) => ({
  currentForm: null,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  setCurrentForm: (form) => set({ currentForm: form, past: [], future: [], canUndo: false, canRedo: false }),

  updateForm: (updates) =>
    set((state) => {
      if (!state.currentForm) return state;
      const newForm = { ...state.currentForm, ...updates };
      return saveHistory(state, newForm);
    }),

  addQuestion: (type) =>
    set((state) => {
      if (!state.currentForm) return state;
      const newQuestion: Question = {
        id: crypto.randomUUID(),
        type,
        title: DEFAULT_QUESTION_TITLE,
        required: false,
        options: (type === 'multiple_choice' || type === 'checkbox' || type === 'dropdown') ? ['Option 1'] : undefined,
      };
      const newForm = {
        ...state.currentForm,
        questions: [...state.currentForm.questions, newQuestion],
      };
      return saveHistory(state, newForm);
    }),

  updateQuestion: (id, updates) =>
    set((state) => {
      if (!state.currentForm) return state;
      const newForm = {
        ...state.currentForm,
        questions: state.currentForm.questions.map((q) =>
          q.id === id ? { ...q, ...updates } : q
        ),
      };
      // For performance/usability, we could conditionally avoid adding to history on every keystroke
      // but simple saveHistory works for now
      return saveHistory(state, newForm);
    }),

  removeQuestion: (id) =>
    set((state) => {
      if (!state.currentForm) return state;
      const newForm = {
        ...state.currentForm,
        questions: state.currentForm.questions.filter((q) => q.id !== id),
      };
      return saveHistory(state, newForm);
    }),

  duplicateQuestion: (id) =>
    set((state) => {
      if (!state.currentForm) return state;
      const questionToDuplicate = state.currentForm.questions.find((q) => q.id === id);
      if (!questionToDuplicate) return state;
      const newQuestion = { ...questionToDuplicate, id: crypto.randomUUID() };
      const index = state.currentForm.questions.findIndex((q) => q.id === id);
      const newQuestions = [...state.currentForm.questions];
      newQuestions.splice(index + 1, 0, newQuestion);
      const newForm = {
        ...state.currentForm,
        questions: newQuestions,
      };
      return saveHistory(state, newForm);
    }),

  reorderQuestions: (newQuestions) =>
    set((state) => {
      if (!state.currentForm) return state;
      const newForm = {
        ...state.currentForm,
        questions: newQuestions,
      };
      return saveHistory(state, newForm);
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0 || !state.currentForm) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return {
        past: newPast,
        future: [state.currentForm, ...state.future],
        currentForm: previous,
        canUndo: newPast.length > 0,
        canRedo: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0 || !state.currentForm) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.currentForm],
        future: newFuture,
        currentForm: next,
        canUndo: true,
        canRedo: newFuture.length > 0,
      };
    }),
}));
