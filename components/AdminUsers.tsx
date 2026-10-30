"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";

type UserRow = { username: string; displayName: string; role: "admin" | "lead" | "member"; accounts: string[]; enabled: boolean; managed: boolean };

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"lead" | "member">("member");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not load users.");
      setUsers(body.users || []); setCanCreate(body.canCreate === true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load users."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, displayName, password, role, accounts: ["cdc"] }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not create user.");
      setUsername(""); setDisplayName(""); setPassword(""); setRole("member");
      setSuccess(`User ${body.user.displayName} created.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create user."); }
    finally { setSaving(false); }
  };
  return <section className="admin-users-page" aria-label="Dashboard users">
    <div className="admin-users-intro"><div><span className="admin-users-icon"><ShieldCheck size={20}/></span><div><h2>User access</h2><p>The administrator creates accounts. Leads can close notifications; members can view them.</p></div></div><button type="button" className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh users"}</button></div>
    {error && <p role="alert" className="admin-users-error">{error}</p>}{success && <p role="status" className="admin-users-success">{success}</p>}
    {!canCreate && !loading && <p className="admin-users-note">User creation needs dashboard password login enabled. Configure the administrator login in the server environment first.</p>}
    {canCreate && <form className="admin-user-form" onSubmit={submit}><h3><UserPlus size={17}/> Create a user</h3><div className="admin-user-fields"><label>Username<input required autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} pattern="[A-Za-z0-9@._-]{1,128}" maxLength={128} /></label><label>Display name<input required value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={128} /></label><label>Password<span className="admin-user-password"><input required type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={14} maxLength={1024} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span><small>At least 14 characters</small></label><label>Role<select value={role} onChange={event => setRole(event.target.value as "lead" | "member")}><option value="member">Member</option><option value="lead">Lead</option></select></label></div><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create user"}</button></form>}
    <div className="admin-user-list-head"><h3><Users size={17}/> Dashboard users</h3><span>{users.length} users</span></div>
    <div className="admin-user-table-wrap"><table className="admin-user-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Account access</th><th>Status</th></tr></thead><tbody>{users.map(user=><tr key={user.username}><td>{user.displayName}</td><td><code>{user.username}</code></td><td><span className={`admin-user-role ${user.role}`}>{user.role}</span></td><td>{user.accounts.map(account=>account === "nana-jewellers" ? "Nana Jewellers" : "CDC").join(", ")}</td><td>{user.enabled ? "Active" : "Disabled"}</td></tr>)}{!loading && !users.length && <tr><td colSpan={5}>No users found.</td></tr>}</tbody></table></div>
  </section>;
}
