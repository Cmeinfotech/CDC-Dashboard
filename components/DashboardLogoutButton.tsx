import { LogOut } from 'lucide-react';

export default function DashboardLogoutButton() {
  return <form className="dashboard-logout-form" action="/api/auth/logout" method="post"><button className="dashboard-logout" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={15} /><span>Sign out</span></button></form>;
}
