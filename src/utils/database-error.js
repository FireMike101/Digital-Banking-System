export function safeDatabaseError(error, uri = process.env.MONGODB_URI) {
  let text = `${error.name ?? 'Error'}${error.code ? ` (${error.code})` : ''}: ${error.message ?? 'No error message'}`;
  if (uri) text = text.split(uri).join('[MongoDB URI hidden]');
  text = text.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI hidden]');
  try {
    // Also hide the password if the error mentions it separately from the URI.
    const password = new URL(uri).password;
    if (password) {
      text = text.split(password).join('[password hidden]');
      text = text.split(decodeURIComponent(password)).join('[password hidden]');
    }
  } catch {
    // An invalid URI must not stop us from displaying the original diagnostic.
  }
  return text;
}
