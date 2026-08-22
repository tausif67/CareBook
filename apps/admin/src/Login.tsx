import { FormEvent, useEffect, useRef, useState } from 'react';
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { ShieldCheck } from 'lucide-react';
import { exchangeAdminLocalOtp, exchangeAdminToken } from './api';
import { firebaseAuth, testAuthEnabled } from './firebase';

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult>();
  const [testOtpRequested, setTestOtpRequested] = useState(false);
  const [error, setError] = useState('');
  const verifier = useRef<RecaptchaVerifier | undefined>(undefined);

  useEffect(() => {
    if (testAuthEnabled || !firebaseAuth) return;
    verifier.current = new RecaptchaVerifier(firebaseAuth, 'recaptcha', { size: 'invisible' });
    return () => verifier.current?.clear();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (testAuthEnabled) {
        if (!testOtpRequested) {
          setTestOtpRequested(true);
          return;
        }
        const token = await exchangeAdminLocalOtp(phone, otp);
        localStorage.setItem('carebook-admin-token', token); onLogin(token);
        return;
      }
      if (!confirmation) {
        if (!verifier.current || !firebaseAuth) return;
        setConfirmation(await signInWithPhoneNumber(firebaseAuth, phone, verifier.current));
      } else {
        const credential = await confirmation.confirm(otp);
        const token = await exchangeAdminToken(await credential.user.getIdToken(true));
        localStorage.setItem('carebook-admin-token', token); onLogin(token);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Authentication failed'); }
  }

  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-mark"><ShieldCheck size={27} /></div>
      <h1>CareBook Admin</h1><p>Secure operations console</p>
      {testAuthEnabled && <div className="test-mode-note"><strong>Private test mode</strong><br />Use the admin number and OTP printed by pnpm testing:up</div>}
      <form onSubmit={submit}>
        {!(confirmation || testOtpRequested) ? <label>Admin mobile number<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></label>
          : <label>6-digit OTP<input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} required /></label>}
        {error && <div className="error">{error}</div>}
        <button type="submit">{confirmation || testOtpRequested ? 'Verify & sign in' : 'Send OTP'}</button>
        <div id="recaptcha" />
      </form>
      <small>Access is limited to pre-provisioned administrator accounts.</small>
    </section>
  </main>;
}
