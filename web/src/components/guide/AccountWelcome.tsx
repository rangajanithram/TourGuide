'use client';

import { useRef, useState, useMemo, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExperienceMetrics from './ExperienceMetrics';
import { useAuth } from '@/context/AuthContext';
import { authErrorMessage, EMAIL_NOTICE } from '@/lib/auth-policy';
import { isSupabaseConfigured } from '@/lib/supabase';
import AuthCaptcha from '@/components/auth/AuthCaptcha';
import {
  ArrowRight,
  Compass,
  Eye,
  EyeOff,
  Leaf,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import './account.css';

const TravelWorld = dynamic(() => import('./TravelWorld'), { ssr: false });

function calculatePasswordStrength(password: string): {
  score: number;
  label: string;
  className: string;
} {
  if (!password) return { score: 0, label: '', className: '' };
  if (password.length < 12) return { score: 1, label: 'Use at least 12 characters', className: 'weak' };
  if (password.length < 16) return { score: 2, label: 'Longer is better; use a unique passphrase', className: 'medium' };
  return { score: 3, label: 'Good length; keep it unique', className: 'strong' };
}

export default function AccountWelcome({ initialMode = 'login', initialNotice = '' }: { initialMode?: 'login' | 'signup' | 'forgot_password'; initialNotice?: string }) {
  const router = useRouter();
  const { login, signup: authSignup, loginWithGoogle, resetPassword } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot_password'>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState(initialNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaCycle, setCaptchaCycle] = useState(0);
  const busy = useRef(false);
  const cooldown = useRef(0);
  const progress = useRef(initialMode === 'signup' ? 0.75 : initialMode === 'forgot_password' ? 0.5 : 0.3);
  const signup = mode === 'signup';
  const forgot = mode === 'forgot_password';

  const passwordStrength = useMemo(
    () => calculatePasswordStrength(fields.password),
    [fields.password]
  );

  function changeMode() {
    setFields(prev => ({ ...prev, password: '', confirmPassword: '' }));
    setCaptchaToken(''); setCaptchaCycle(v => v + 1);
    setMode(signup ? 'login' : 'signup');
    setErrorMessage('');
    setSuccessMessage('');
    setShowPassword(false);
    progress.current = signup ? 0.3 : 0.75;
  }

  function switchToForgotPassword() {
    setFields(prev => ({ ...prev, password: '', confirmPassword: '' }));
    setCaptchaToken(''); setCaptchaCycle(v => v + 1);
    setMode('forgot_password');
    setErrorMessage('');
    setSuccessMessage('');
    setShowPassword(false);
    progress.current = 0.5;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setErrorMessage('');
    setSuccessMessage('');
    if (!isSupabaseConfigured) { setErrorMessage('Account sign-in is not configured yet. Explore the guest planner below.'); return; }
    if (forgot && Date.now() < cooldown.current) { setErrorMessage('Please wait a minute before requesting another email.'); return; }
    if (signup && fields.password !== fields.confirmPassword) { setErrorMessage('The passwords do not match.'); return; }
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !captchaToken) { setErrorMessage('Complete the security check first.'); return; }

    // Pre-flight client validations to guard against malicious/empty submissions
    const cleanEmail = fields.email.trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (signup && fields.password.length < 12) {
      setErrorMessage('Use at least 12 characters. A unique passphrase works well.');
      return;
    }

    if (signup && fields.name.trim().length < 2) {
      setErrorMessage('Please provide your name (at least 2 characters).');
      return;
    }

    busy.current = true;
    setIsSubmitting(true);
    try {
      if (forgot) {
        cooldown.current = Date.now() + 60000;
        await resetPassword(cleanEmail, captchaToken);
        cooldown.current = Date.now() + 60000;
        setSuccessMessage(
          EMAIL_NOTICE
        );
        return;
      }

      if (signup) {
        await authSignup(fields.name.trim(), cleanEmail, fields.password, captchaToken);
        router.push('/check-email');
        return;
      } else {
        const user = await login(cleanEmail, fields.password, captchaToken);
        setSuccessMessage(`Welcome back, ${user.name}! Opening your account...`);
      }

      router.replace('/account');
      router.refresh();
    } catch (err: unknown) {
      const msg = authErrorMessage(err);
      setErrorMessage(msg);
    } finally {
      busy.current = false;
      setIsSubmitting(false);
      setCaptchaToken(''); setCaptchaCycle(v => v + 1);
    }
  }

  async function handleGoogleButtonClick() {
    if (busy.current) return;
    busy.current = true; setIsSubmitting(true); setErrorMessage('');
    try { await loginWithGoogle(); }
    catch (error) { setErrorMessage(isSupabaseConfigured ? authErrorMessage(error) : 'Account sign-in is not configured yet. Explore the guest planner below.'); }
    finally { busy.current = false; setIsSubmitting(false); }
  }

  return (
    <main className="account-page">
      <ExperienceMetrics />
      <header className="account-header">
        <Link href="/guide">
          <Compass size={25} />
          TripWeave<span>THE FOREST LINE</span>
        </Link>
        <Link href="/guide">
          Explore the guide <ArrowRight size={16} />
        </Link>
      </header>

      <div className={`account-shell ${signup ? 'account-signup' : ''}`}>
        <section className="account-story" aria-label="Welcome to TripWeave">
          <span className="account-eyebrow">
            <Leaf size={14} /> GOOD JOURNEYS START WITH CURIOSITY
          </span>
          <h1>
            {forgot ? (
              <>
                Safe &amp; sound.
                <br />
                <em>We&apos;ve got your back.</em>
              </>
            ) : signup ? (
              <>
                A new chapter.
                <br />
                <em>Your kind of adventure.</em>
              </>
            ) : (
              <>
                Somewhere wonderful
                <br />
                <em>is waiting.</em>
              </>
            )}
          </h1>
          <p>
            {forgot
              ? 'Forgotten passwords happen. We will send you a secure one-time link to safely recover your account.'
              : signup
              ? 'Dream up the places. Bring your favorite people. Let’s make room for the stories you’ll tell.'
              : 'A quiet trail. A city you’ve never met. A trip that feels like you. Start putting the pieces together.'}
          </p>
          <div className="account-world">
            <TravelWorld
              motionSpeed={1.4}
              progress={progress}
              night={false}
              paused={false}
              rotation={signup ? 0.5 : forgot ? 0.25 : 0}
            />
          </div>
          <div className="account-story-footer">
            <span>01 — DREAM IT</span>
            <i />
            <span>02 — PLAN IT</span>
            <i />
            <span>03 — LIVE IT</span>
          </div>
        </section>

        <section className="account-form-panel" aria-labelledby="account-heading">
          <span className="account-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2 id="account-heading">{forgot ? 'Account recovery.' : signup ? 'Come along.' : 'Welcome back.'}</h2>
          <p>
            {forgot
              ? 'Enter your registered email address to receive a secure password recovery link.'
              : signup
              ? 'Create your account, verify your email, and start your next journey.'
              : 'Sign in to manage your TripWeave account.'}
          </p>

          <div className="account-security-badge">
            <ShieldCheck size={14} />
            <span>
              Email verification is required. Use a unique password.
            </span>
          </div>

          {errorMessage && (
            <div className="account-error-banner" role="alert">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="account-success-banner" role="status">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={submit}>
            {signup && (
              <label key="name">
                Your name
                <input
                  value={fields.name}
                  onChange={(e) => setFields({ ...fields, name: e.target.value })}
                  name="name"
                  placeholder="Priya Sharma"
                  autoComplete="name"
                  required
                  maxLength={80}
                  disabled={isSubmitting}
                />
              </label>
            )}

            <label key="email">
              Email address
              <input
                value={fields.email}
                onChange={(e) => setFields({ ...fields, email: e.target.value })}
                type="email"
                name="email"
                placeholder="priya@example.com"
                autoComplete="email"
                required
                maxLength={254}
                disabled={isSubmitting}
              />
            </label>

            {!forgot && (
              <label key="password">
                <span className="flex justify-between items-center w-full">
                  <span>Password</span>
                  {!signup && (
                    <button
                      type="button"
                      onClick={switchToForgotPassword}
                      aria-label="Forgot password?"
                      className="text-[11px] text-amber-800 hover:underline bg-transparent border-0 p-0 cursor-pointer font-medium"
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
                <span className="password-field">
                  <input
                    value={fields.password}
                    onChange={(e) => setFields({ ...fields, password: e.target.value })}
                    name="password"
                    aria-label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={signup ? 'Create a strong password' : 'Enter your password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    required
                    minLength={signup ? 12 : 1}
                    maxLength={128}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {signup && fields.password.length > 0 && (
                  <div className="password-meter">
                    <div className="password-meter-bar">
                      <div
                        className={`password-meter-segment ${
                          passwordStrength.score >= 1 ? passwordStrength.className : ''
                        }`}
                      />
                      <div
                        className={`password-meter-segment ${
                          passwordStrength.score >= 2 ? passwordStrength.className : ''
                        }`}
                      />
                      <div
                        className={`password-meter-segment ${
                          passwordStrength.score >= 3 ? passwordStrength.className : ''
                        }`}
                      />
                    </div>
                    <div className="password-meter-text">
                      <span>{passwordStrength.label}</span>
                      <span className="flex items-center gap-1">
                        <Lock size={10} /> Unique passphrase
                      </span>
                    </div>
                  </div>
                )}
              </label>
            )}

            {signup && <label>Confirm password<input name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={fields.confirmPassword} onChange={e => setFields({ ...fields, confirmPassword: e.target.value })} disabled={isSubmitting} /></label>}
            <AuthCaptcha key={captchaCycle} onToken={setCaptchaToken} />
            <button className="account-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                'Processing...'
              ) : forgot ? (
                <>
                  Send password reset link <ArrowRight size={17} />
                </>
              ) : signup ? (
                <>
                  Sign up with email <ArrowRight size={17} />
                </>
              ) : (
                <>
                  Log in with email <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {!forgot && (
            <>
              <div className="account-divider">
                <span />
                OR CONTINUE WITH
                <span />
              </div>

              {/* Real Google Sign-In Container */}
              <div className="google-auth-wrapper">


                <button
                  type="button"
                  className="account-google-btn"
                  onClick={handleGoogleButtonClick}
                  disabled={isSubmitting}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>
            </>
          )}

          <p className="account-switch">
            {forgot ? (
              <>
                Remember your password?{' '}
                <button type="button" onClick={() => setMode('login')} disabled={isSubmitting}>
                  Log in <ArrowRight size={13} />
                </button>
              </>
            ) : signup ? (
              <>
                Already have an account?{' '}
                <button type="button" onClick={changeMode} disabled={isSubmitting}>
                  Log in <ArrowRight size={13} />
                </button>
              </>
            ) : (
              <>
                Don’t have an account?{' '}
                <button type="button" onClick={changeMode} disabled={isSubmitting}>
                  Sign up <ArrowRight size={13} />
                </button>
              </>
            )}
          </p>

          <Link href="/check-email">Check email / resend verification</Link>
          <Link className="account-guest" href="/planner">
            Continue as a guest to planner <ArrowRight size={16} />
          </Link>
          <p className="account-privacy">
            Your password is handled by Supabase. Never share a verification or recovery link.
          </p>
        </section>
      </div>

      <footer className="account-footer">
        <span>LESS PLANNING FRICTION. MORE POSSIBILITY.</span>
        <Link href="/planner">Go straight to the planner ↗</Link>
      </footer>
    </main>
  );
}
