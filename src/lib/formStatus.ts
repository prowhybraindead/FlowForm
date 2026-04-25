import { Form } from '../types';

export function isFormClosedBySettings(settings: Form['settings'] | undefined): boolean {
  if (!settings) return false;

  if (settings.publishImmediately === false) return true;
  if (settings.isPublic === false) return true;

  const expiration = settings.expirationDate ? new Date(settings.expirationDate) : null;
  if (expiration && !Number.isNaN(expiration.getTime()) && Date.now() > expiration.getTime()) {
    return true;
  }

  return false;
}

