"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { changePassword, updateProfile } from "@/services/auth-service";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();

  // Profile form state.
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form state.
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  // Redirect unauthenticated visitors once the session has resolved.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Seed the editable form from the loaded user.
  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone ?? "");
    }
  }, [user]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileErr(null);
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      await updateProfile({ full_name: fullName, phone });
      await refreshUser();
      setProfileMsg("Profile updated.");
    } catch (err) {
      setProfileErr(
        err instanceof ApiError
          ? err.message
          : "Unable to update profile. Please try again.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    setSavingPw(true);
    try {
      const res = await changePassword(currentPw, newPw);
      setPwMsg(res.detail || "Password changed.");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      setPwErr(
        err instanceof ApiError
          ? err.message
          : "Unable to change password. Please try again.",
      );
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Read-only account details */}
      <section className="mt-8 rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">Account details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </dt>
            <dd className="mt-1 text-sm">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1 text-sm capitalize">{user.status}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Roles
            </dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {user.roles.length > 0 ? (
                user.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No roles</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Editable profile */}
      <section className="mt-6 rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">Edit profile</h2>
        <form className="mt-4 space-y-4" onSubmit={handleProfileSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="full_name" className="text-sm font-medium">
              Full name
            </label>
            <input
              id="full_name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-medium">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {profileErr && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {profileErr}
            </p>
          )}
          {profileMsg && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              {profileMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="mt-6 rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">Change password</h2>
        <form className="mt-4 space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="current_password" className="text-sm font-medium">
              Current password
            </label>
            <input
              id="current_password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new_password" className="text-sm font-medium">
              New password
            </label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              required
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {pwErr && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {pwErr}
            </p>
          )}
          {pwMsg && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              {pwMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPw}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {savingPw ? "Updating…" : "Change password"}
          </button>
        </form>
      </section>
    </main>
  );
}
