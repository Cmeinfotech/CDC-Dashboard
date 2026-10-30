import type { Metadata } from 'next';
import DashboardLoginForm from '../../components/DashboardLoginForm';

export const metadata: Metadata = {
  title: 'Sign in · CDC Sales Analytics',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span className="auth-brand-mark">CDC</span><span><strong>CDC</strong><small>Sales intelligence</small></span></div>
    <div className="auth-heading"><h1>Welcome back</h1><p>Sign in to view your sales dashboard.</p></div>
    <DashboardLoginForm />
    <p className="auth-footnote">Your dashboard data is available to authorized users only.</p>
  </section></main>;
}
