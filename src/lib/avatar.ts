import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Profile photos, taken from the device gallery and stored inline.
 *
 * Why not Cloud Storage
 * ---------------------
 * There is no bucket. Firebase Storage needs the Blaze plan and this project is
 * on Spark, so an upload 404s — which is why the web asked students to paste a
 * Google Drive or Photos share link instead of choosing their own picture, and
 * why mobile had no photo control at all.
 *
 * A profile photo does not need a bucket. Squared and resized to 256px, a JPEG
 * lands around 15-40 KB and a Firestore document holds 1 MiB, so the image
 * rides in `users/{uid}.photo_url` as a data URI. React Native's <Image>
 * accepts a data URI in `source.uri` exactly as it accepts an https one, so
 * nothing downstream changes.
 *
 * The same trade-off does NOT hold for syllabus materials or contest evidence:
 * those are arbitrary documents, and inlining them would exceed the document
 * limit and weigh down every read of the record holding them.
 *
 * Mirrors activklass-web/src/lib/avatar.js — same size, same budget, so a photo
 * set on a phone and one set on a laptop are the same kind of thing.
 */

export const AVATAR_SIZE = 256;

/** Well under Firestore's 1 MiB limit: the profile document is read on nearly
 *  every screen, so the real budget is read cost, not the hard limit. */
export const MAX_BYTES = 120 * 1024;

export class AvatarError extends Error {}

/**
 * Open the gallery, square-crop and shrink the chosen photo, and return it as
 * a `data:image/jpeg;base64,...` URI. Returns null if the picker was dismissed.
 *
 * `allowsEditing` with a 1:1 aspect lets the student choose what the circle
 * frames. Without it the crop is a blind centre-cut, which decapitates a
 * portrait taken in landscape.
 */
export async function pickAvatarFromGallery(): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    // An array, not the deprecated MediaTypeOptions enum.
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };

  /* Try the picker BEFORE asking for anything.
     On Android 13+ this opens the system photo picker, which needs no
     permission at all — and the manifest only carries READ_EXTERNAL_STORAGE,
     which those versions ignore. Requesting up front would therefore fail on
     exactly the devices that did not need the permission, and lock a student
     out of a picker that would have opened. So permission is a fallback for
     the older path, not a gate. */
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync(options);
  } catch {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new AvatarError(
        'ActivKlass needs permission to open your photos. You can grant it in Settings.'
      );
    }
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets?.length) return null;

  return toAvatarDataUri(result.assets[0].uri);
}

/**
 * Resize and encode, stepping quality down until it fits the budget.
 *
 * Uses the SDK 57 context API — `manipulate().resize().renderAsync()` — rather
 * than the deprecated `manipulateAsync`.
 */
export async function toAvatarDataUri(uri: string): Promise<string> {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
    .renderAsync();

  for (const compress of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const out = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress,
      base64: true,
    });
    if (!out.base64) continue;
    // base64 carries roughly 4 characters per 3 bytes of image.
    if (out.base64.length * 0.75 <= MAX_BYTES) {
      return `data:image/jpeg;base64,${out.base64}`;
    }
  }
  throw new AvatarError('Could not compress that photo small enough. Try another one.');
}
