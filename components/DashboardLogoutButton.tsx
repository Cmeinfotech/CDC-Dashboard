import { LogOut } from 'lucide-react';

export default function DashboardLogoutButton() {
  return <a className="dashboard-logout" href="/api/auth/logout" aria-label="Sign out" title="Sign out"><LogOut size={15} /><span>Sign out</span></a>;
}
