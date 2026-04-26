const TEMP_UPLOAD_ENDPOINT = '/api/temp-storage/upload';

interface UploadImageAssetOptions {
  formId?: string;
  uploaderId?: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadViaTempServer(file: File, options?: UploadImageAssetOptions): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  if (options?.formId) {
    form.append('formId', options.formId);
  }
  if (options?.uploaderId) {
    form.append('uploaderId', options.uploaderId);
  }

  const response = await fetch(TEMP_UPLOAD_ENDPOINT, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Upload failed.' }));
    throw new Error(payload.error || 'Upload failed.');
  }

  const payload = await response.json();
  if (!payload.url) {
    throw new Error('Upload response missing URL.');
  }

  return payload.url as string;
}

export async function uploadImageAsset(file: File, options?: UploadImageAssetOptions): Promise<string> {
  const enableTempStorage = process.env.NEXT_PUBLIC_ENABLE_TEMP_STORAGE_UPLOADS !== 'false';
  const allowBase64Fallback = process.env.NEXT_PUBLIC_ALLOW_BASE64_FALLBACK === 'true';

  if (!enableTempStorage) {
    if (allowBase64Fallback) {
      return readFileAsDataUrl(file);
    }
    throw new Error('Image upload is disabled. Enable temporary storage uploads to continue.');
  }

  try {
    return await uploadViaTempServer(file, options);
  } catch (error) {
    if (allowBase64Fallback) {
      console.error('Temporary storage upload failed, falling back to base64:', error);
      return readFileAsDataUrl(file);
    }
    throw new Error('Failed to upload image to temporary storage server.');
  }
}
