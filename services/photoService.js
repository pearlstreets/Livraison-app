/**
 * Photo proof service — pearl-delivery.
 *
 * Upload de photos pour pickup/delivery proof (Uber Eats / Stuart standard).
 * Utilise expo-image-picker pour la capture caméra et upload via API multipart.
 *
 * Endpoint backend : POST /api/v1/delivery/assignments/<id>/photo/
 *   - kind: 'pickup' | 'delivery' | 'damage' | 'wrong_address'
 *   - photo: file (multipart)
 *
 * Usage dans DeliveryFlowScreen.js :
 *   import { capturePickupPhoto, captureDeliveryPhoto } from '../services/photoService';
 *   const uri = await capturePickupPhoto(assignmentId);
 *   if (uri) advance('picked_up');
 */
import * as ImagePicker from 'expo-image-picker';
import api from './api';

const PHOTO_QUALITY = 0.7;
const PHOTO_MAX_DIM = 1280;

async function ensureCameraPermission() {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission denied');
  }
}

/**
 * Capture une photo via caméra (pas de galerie pour proof — anti-fraude).
 * Compress to PHOTO_MAX_DIM x PHOTO_QUALITY.
 */
export async function capturePhoto() {
  await ensureCameraPermission();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: PHOTO_QUALITY,
    exif: false,
  });
  if (result.canceled || !result.assets || !result.assets[0]) {
    return null;
  }
  return result.assets[0];
}

/**
 * Upload photo to backend assignment.
 * Returns {url, id, status} en cas de succès, null si échec.
 */
export async function uploadAssignmentPhoto(assignmentId, photoAsset, kind = 'delivery') {
  if (!assignmentId || !photoAsset?.uri) return null;
  const form = new FormData();
  form.append('photo', {
    uri: photoAsset.uri,
    type: photoAsset.mimeType || 'image/jpeg',
    name: photoAsset.fileName || `proof_${kind}_${Date.now()}.jpg`,
  });
  form.append('kind', kind);
  try {
    const { data } = await api.post(
      `/api/v1/delivery/assignments/${assignmentId}/photo/`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      },
    );
    return data?.data || data;
  } catch (err) {
    if (__DEV__) console.warn('[photo] upload failed:', err?.response?.status, err?.message);
    return null;
  }
}

/** Shortcut : capture + upload pickup. */
export async function capturePickupPhoto(assignmentId) {
  const asset = await capturePhoto();
  if (!asset) return null;
  return uploadAssignmentPhoto(assignmentId, asset, 'pickup');
}

/** Shortcut : capture + upload delivery. */
export async function captureDeliveryPhoto(assignmentId) {
  const asset = await capturePhoto();
  if (!asset) return null;
  return uploadAssignmentPhoto(assignmentId, asset, 'delivery');
}

/** Shortcut : photo de problème (damage, wrong address). */
export async function captureIssuePhoto(assignmentId, kind = 'damage') {
  const asset = await capturePhoto();
  if (!asset) return null;
  return uploadAssignmentPhoto(assignmentId, asset, kind);
}
