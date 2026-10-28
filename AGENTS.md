<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- Record deletion goes through the `delete_record` / `reset_all_data` database functions (direct DELETE is revoked from signed-in users) so stock, balances and audit log stay consistent.
- Server functions use the project-owned `requireAuth` middleware (`src/lib/auth.middleware.ts`), not the generated `requireSupabaseAuth`: it falls back to the build-time public backend URL/publishable key so server actions work even when the host injects no backend env vars; never use service-role keys in features.
