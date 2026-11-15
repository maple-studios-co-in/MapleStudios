"use client";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminShell";
import { teamRequest } from "../team/api";
import { Btn, Card, Field, Input, Select, PageHead, Badge } from "./ui";
type Account = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  active: boolean;
};
export default function Settings() {
  const { account, signOut } = useAdmin();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    role: "member",
    password: "",
  });
  const [password, setPassword] = useState({
    currentPassword: "",
    password: "",
  });
  const load = useCallback(async () => {
    if (account?.role !== "owner") return;
    try {
      setAccounts(
        (await teamRequest<{ items: Account[] }>("/auth/admins")).items,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    }
  }, [account?.role]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Account settings"
        sub="Individual sign-ins, access roles and password changes."
      />
      {error ? (
        <p role="alert" className="mb-4 text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-4 text-green-800">
          {message}
        </p>
      ) : null}
      <Card>
        <h2 className="mb-3 text-xl">Your account</h2>
        <p>
          {account?.name} · {account?.email} · {account?.role}
        </p>
        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await teamRequest("/auth/password", "POST", password);
              setPassword({ currentPassword: "", password: "" });
              signOut();
            }, "Password changed. Sign in again.");
          }}
        >
          <Field label="Current password">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password.currentPassword}
              onChange={(e) =>
                setPassword({ ...password, currentPassword: e.target.value })
              }
            />
          </Field>
          <Field label="New password (12+ characters)">
            <Input
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={password.password}
              onChange={(e) =>
                setPassword({ ...password, password: e.target.value })
              }
            />
          </Field>
          <div className="flex items-end">
            <Btn disabled={busy} type="submit">
              Change password
            </Btn>
          </div>
        </form>
      </Card>
      {account?.role === "owner" ? (
        <>
          <Card className="mt-5">
            <h2 className="mb-3 text-xl">Team access</h2>
            <p className="mb-4 text-sm text-[#6b6259]">
              Owners manage accounts and payroll. Admins manage studio work and
              employee records. Members use the team workspace. Creating an
              employee record does not grant sign-in access.
            </p>
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8c3a5] py-3"
              >
                <div>
                  <p>
                    {a.name} · {a.email}
                  </p>
                  <Badge>{a.active ? a.role : "disabled"}</Badge>
                </div>
                {a.id !== account.id ? (
                  <div className="flex gap-2">
                    <Select
                      aria-label={`Role for ${a.email}`}
                      disabled={busy}
                      value={a.role}
                      onChange={(e) =>
                        void run(
                          () =>
                            teamRequest(`/auth/admins/${a.id}`, "PATCH", {
                              role: e.target.value,
                            }),
                          "Role changed; old sessions revoked.",
                        )
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </Select>
                    <Btn
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            teamRequest(`/auth/admins/${a.id}`, "PATCH", {
                              active: !a.active,
                            }),
                          a.active
                            ? "Access revoked immediately."
                            : "Account enabled.",
                        )
                      }
                    >
                      {a.active ? "Disable" : "Enable"}
                    </Btn>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
          <Card className="mt-5">
            <h2 className="mb-3 text-xl">Create an account</h2>
            <p className="mb-4 text-sm">
              Set a unique initial password and share it securely. No invitation
              email is sent from this form.
            </p>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await teamRequest("/auth/admins", "POST", draft);
                  setDraft({
                    name: "",
                    email: "",
                    role: "member",
                    password: "",
                  });
                }, "Account created.");
              }}
            >
              <Field label="Name">
                <Input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Work email">
                <Input
                  type="email"
                  required
                  value={draft.email}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Role">
                <Select
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </Select>
              </Field>
              <Field label="Initial password (12+ characters)">
                <Input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(e) =>
                    setDraft({ ...draft, password: e.target.value })
                  }
                />
              </Field>
              <Btn type="submit" variant="primary" disabled={busy}>
                Create account
              </Btn>
            </form>
          </Card>
        </>
      ) : null}
    </>
  );
}
