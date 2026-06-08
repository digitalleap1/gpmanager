"use client";

import { KeyRound, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { changePassword, updateProfile } from "@/services/auth-service";

/** Derive up-to-two uppercase initials from a person's name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

const INPUT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

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
      <AppShell title="Profile">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
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
    <AppShell title="Profile">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header card */}
        <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
              {initialsOf(user.full_name)}
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <h2 className="truncate text-2xl font-bold tracking-tight text-[#1A1F4D]">
                {user.full_name}
              </h2>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
                <Mail className="h-4 w-4" />
                <span className="truncate">{user.email}</span>
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium capitalize text-secondary-foreground">
                  {user.status}
                </span>
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {role}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No roles</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Profile details */}
        <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#1A1F4D]">
            <User className="h-4 w-4 text-primary" />
            Profile details
          </h3>
          <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
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
                disabled={savingProfile}
                className={INPUT_CLS}
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
                disabled={savingProfile}
                placeholder="Optional"
                className={INPUT_CLS}
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
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                {profileMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        {/* Change password */}
        <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#1A1F4D]">
            <KeyRound className="h-4 w-4 text-primary" />
            Change password
          </h3>
          <form className="mt-5 space-y-4" onSubmit={handlePasswordSubmit}>
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
                disabled={savingPw}
                className={INPUT_CLS}
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
                disabled={savingPw}
                className={INPUT_CLS}
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
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                {pwMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={savingPw}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {savingPw ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
