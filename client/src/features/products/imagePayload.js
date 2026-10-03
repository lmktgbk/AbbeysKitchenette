/** Override the JSON transport default when metadata and image share a multipart save. */
export function productPayload(data) {
  const { image_file, ...metadata } = data;
  if (!image_file) return { body: metadata, config: undefined };
  const form = new FormData();
  form.append("data", JSON.stringify(metadata));
  form.append("image", image_file);
  return { body: form, config: { headers: { "Content-Type": "multipart/form-data" } } };
}
