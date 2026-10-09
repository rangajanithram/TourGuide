import AuthPanel from '@/components/auth/AuthPanel';
export const dynamic = 'force-dynamic';

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  const valid = ['signup', 'recovery'].includes(params.type || '') && Boolean(params.token_hash);
  return <AuthPanel title="Continue securely">{valid ? <>
    <p>Press Continue to use this single-use link. Only continue if you requested this email.</p>
    <form method="post" action="/auth/verify">
      <input type="hidden" name="token_hash" value={params.token_hash} />
      <input type="hidden" name="type" value={params.type} />
      <button className="bg-[#294333] text-white rounded-xl px-5 py-3">Continue</button>
    </form>
  </> : <p>This link is invalid. Request a new link from the login page.</p>}</AuthPanel>;
}
