/** IDs and URL templates, used by Freecash and the mocks alike. */

/** Unguessable IDs: click IDs travel in URLs and act as bearer tokens for the landing page. */
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

/** Fills `{name}` placeholders, URL-encoding each value. Unknown placeholders are left as they are. */
export const fillTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => {
    const value = values[key];
    return value === undefined ? m : encodeURIComponent(value);
  });
