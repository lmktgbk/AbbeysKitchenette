/**
 * Builds one product save request containing metadata and optional replacement-image bytes.
 * No file uses JSON, including a null image_url for removal. A new file uses multipart
 * with named data/image parts; the API owns replacement and old-asset cleanup.
 */
export function productPayload(data) {
  // Strip the browser File from metadata so it cannot be accidentally serialized as an empty JSON object.
  const { image_file, ...metadata } = data;
  if (!image_file) return { body: metadata, config: undefined };
  const form = new FormData();
  form.append("data", JSON.stringify(metadata));
  form.append("image", image_file);
  return { body: form, config: { headers: { "Content-Type": "multipart/form-data" } } };
}
