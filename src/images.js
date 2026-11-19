export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageFile(file) {
  if (!file || !ACCEPTED.has(file.type)) throw new Error('Choose a JPG, PNG, or WebP image. For HEIC photos, export as JPG first.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('This photo is too large. Choose an image smaller than 12 MB.');
  if (!file.size) throw new Error('This image file is empty. Please choose another photo.');
}

export async function prepareImage(file) {
  validateImageFile(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch (error) {
    if (error.message.includes('unavailable')) throw error;
    throw new Error('This photo could not be opened. Try another JPG, PNG, or WebP file.');
  } finally { URL.revokeObjectURL(objectUrl); }
}
