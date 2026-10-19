/**
 * The page shell for Freecash's user-facing screens: escaping, one stylesheet, light and dark.
 * Plain template strings, because the screens are small and server-rendered.
 */

/** Escapes text for HTML content and quoted attributes. */
export const esc = (v: string | number) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const html = (body: string, status = 200, head = '') =>
  new Response(page(body, head), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

const page = (body: string, head: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Freecash offer</title>${head}
<style>
  :root { --bg:#0f1115; --card:#191c23; --text:#f2f3f5; --muted:#9aa1ad; --accent:#22c55e; --warn:#f59e0b; --line:#8882; }
  @media (prefers-color-scheme: light) { :root { --bg:#f5f6f8; --card:#fff; --text:#14161a; --muted:#5d6470; } }
  * { box-sizing:border-box } body { margin:0; padding:24px 16px; background:var(--bg); color:var(--text);
    font:16px/1.45 system-ui,sans-serif; max-width:480px; margin-inline:auto }
  .hi { color:var(--muted) } .card { background:var(--card); border-radius:16px; padding:20px } .center { text-align:center }
  .tag { color:var(--accent); font-weight:600; margin:0 } h1 { font-size:22px; margin:6px 0 14px }
  .boost { background:#22c55e1f; border:1px solid #22c55e66; border-radius:12px; padding:10px 12px; margin-bottom:12px }
  .boost .now { color:var(--accent); font-weight:700 } s { color:var(--muted); font-weight:400 }
  ol { list-style:none; padding:0; margin:0 0 16px } li { display:flex; justify-content:space-between; gap:12px;
    padding:10px 0; border-top:1px solid var(--line) } li.lead span { font-weight:600 }
  small { display:block; color:var(--muted); font-size:13px } .tag-p { font-style:normal; font-size:12px; color:var(--warn); margin-left:6px }
  li.held small { color:var(--warn) } li.cashable small { color:var(--accent) } li.expired, li.reversed { opacity:.55 }
  .rules { color:var(--muted); font-size:13px; padding-left:18px; margin:0 0 16px } .rules li { display:list-item; border:0; padding:2px 0 }
  button, .button { display:block; width:100%; padding:14px; border:0; border-radius:12px; background:var(--accent);
    color:#04130a; font:600 16px system-ui; text-align:center; text-decoration:none; cursor:pointer }
  .fine { color:var(--muted); font-size:13px } .fine a { color:inherit }
  .spinner { width:36px; height:36px; margin:8px auto 4px; border-radius:50%; border:3px solid var(--line); border-top-color:var(--accent);
    animation:spin 1s linear infinite } @keyframes spin { to { transform:rotate(360deg) } }
</style></head><body>${body}</body></html>`;
