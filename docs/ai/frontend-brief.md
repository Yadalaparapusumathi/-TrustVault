# Context file: brief given to the frontend agent (summary)

Reused whenever I asked an agent to add or change a screen. The full contract is `docs/API.md`.

- Stack: Vite, React 18, TypeScript (strict), Tailwind v3, react-router, @tanstack/react-query, lucide-react,
  sonner, Inter variable font. No component library; hand-built primitives in `src/components/ui`.
- Security rules for the client:
  - The client never decides access. Hide buttons for UX only; always handle 401/403/404/409 from the server.
  - CSRF: read the `XSRF-TOKEN` cookie, send it as `X-XSRF-TOKEN` on every non-GET; fetch `/api/auth/csrf` first.
  - `credentials: 'same-origin'`; no tokens in localStorage/sessionStorage; no `dangerouslySetInnerHTML`;
    no `window.open` of API URLs; downloads via fetch → Blob → temporary object URL.
  - `?next=` redirects accept same-origin relative paths only.
  - Built output must work under `script-src 'self'` (no inline scripts).
- 404 on a document shows "not found or you don't have access" (never distinguish).
- Access assistant: suggestions are displayed with reasons; granting is an explicit click that sends
  `suggestionId`; the copy states that suggestions never change access and both are audited.
- Deliverables: `npm run lint`, `npm test`, `npm run build` all clean; Dockerfile on nginx-unprivileged with CSP.
