"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Briefcase,
  CalendarCheck,
  CalendarClock,
  FileText,
  Film,
  Gauge,
  Handshake,
  History,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  MessageCircle,
  Newspaper,
  Search,
  Send,
  Settings as SettingsIcon,
  Share2,
  Sparkles,
  Star,
  Tags,
  Type,
  UserPlus,
  UserSearch,
  Users,
  Wrench,
} from "lucide-react";

import { sessionAction, sessionFetch, type Account, type BrowserSession } from "@/lib/admin/session-client";
import AuthenticatorForm from "@/components/pages/admin/security/AuthenticatorForm";
import LogoMark from "@/components/common/LogoMark";

/** Individual sessions are held in HttpOnly cookies; each API checks current access. */
type AdminCtx = {
  /** the validated key, "" until sign-in */
  key: string;
  account: Account | null;
  /** fetch against an /api/admin/* route with the key attached */
  adminFetch: (input: string, init?: RequestInit) => Promise<Response>;
  signOut: () => void;
};

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminShell>");
  return ctx;
}

type NavItem = { href: string; label: string; icon: typeof Gauge; exact?: boolean };

/** Grouped rail. "Studio" is the original operations console — those four
    screens and their routes are unchanged; the CMS groups are additive. */
const NAV: { group: string; items: NavItem[] }[] = [
  {group:"Business",items:[{href:"/admin/clients",label:"Clients",icon:Handshake},{href:"/admin/projects",label:"Projects",icon:Briefcase},{href:"/admin/drafts",label:"Client drafts",icon:FileText},{href:"/admin/company",label:"Company & templates",icon:SettingsIcon}]},
  {group:"Team",items:[{href:"/admin/team",label:"Team & attendance",icon:Users},{href:"/admin/payroll",label:"Payroll",icon:FileText}]},
  {
    group: "Studio",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/inquiries", label: "Inquiries", icon: Inbox },
      { href: "/admin/bookings", label: "Calls", icon: CalendarCheck },
      { href: "/admin/slots", label: "Availability", icon: CalendarClock },
    ],
  },
  {
    group: "Content",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: Gauge },
      { href: "/admin/portfolio", label: "Portfolio", icon: Briefcase },
      { href: "/admin/video", label: "Video", icon: Film },
      { href: "/admin/blog", label: "Blog", icon: FileText },
      { href: "/admin/services", label: "Services", icon: Wrench },
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/testimonials", label: "Testimonials", icon: MessageCircle },
      { href: "/admin/press", label: "Press", icon: Newspaper },
      { href: "/admin/recommendations", label: "Recommendations", icon: Star },
      { href: "/admin/careers", label: "Careers", icon: UserPlus },
    ],
  },
  {
    group: "Audience",
    items: [
      { href: "/admin/contacts", label: "Contacts", icon: Users },
      { href: "/admin/newsletter", label: "Newsletter", icon: Mail },
    ],
  },
  {
    group: "Growth",
    items: [
      { href: "/admin/leads", label: "Leads", icon: UserSearch },
      { href: "/admin/campaigns", label: "Campaigns", icon: Send },
      { href: "/admin/templates", label: "Templates", icon: LayoutTemplate },
      { href: "/admin/social", label: "Social", icon: Share2 },
      { href: "/admin/outreach", label: "Outreach", icon: Handshake },
    ],
  },
  {
    group: "Site",
    items: [
      { href: "/admin/homepage", label: "Homepage", icon: Sparkles },
      { href: "/admin/site-copy", label: "Site Copy", icon: Type },
      { href: "/admin/seo", label: "SEO", icon: Search },
      { href: "/admin/media", label: "Media", icon: ImageIcon },
      { href: "/admin/audit", label: "Audit", icon: History },
      { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
      { href: "/admin/security", label: "Security", icon: SettingsIcon },
    ],
  },
];



export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const key = "";
  const [account,setAccount]=useState<AdminCtx["account"]>(null);
  const [email,setEmail]=useState("");
  const [signingIn,setSigningIn]=useState(false);
  const [draft, setDraft] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pending, setPending] = useState<"mfa_required" | "enrolment_required" | null>(null);
  const [factorCode, setFactorCode] = useState("");
  const acceptSession = useCallback((session: BrowserSession) => {
    if ("state" in session) {
      setPending(session.state);
      setAccount(null);
      setAuthed(false);
    } else {
      setPending(null);
      setAccount(session.admin);
      setAuthed(true);
    }
    setDraft("");
    setFactorCode("");
  }, []);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let alive=true;
    sessionStorage.removeItem("maple-admin-key");
    void sessionFetch("/api/admin/session").then(async response=>{
      if(!alive) return;
      if(response.ok) { acceptSession(await response.json()); }
    }).catch(()=>{if(alive)setError("Unable to check your session. Please retry.");}).finally(()=>{if(alive)setChecking(false);});
    return ()=>{alive=false;};
  }, [acceptSession]);
  useEffect(()=>setNavOpen(false),[pathname]);
  const signIn=async(e:React.FormEvent)=>{
    e.preventDefault(); if(signingIn) return;
    setSigningIn(true);setError(null);
    try {
      const data = await sessionAction<BrowserSession>(
        pending === "mfa_required" ? { action: "verify", code: factorCode } : { email, password: draft },
      );
      acceptSession(data);
    } catch(error) { setError(error instanceof Error?error.message:"Sign-in failed. Please retry."); }
    finally {setSigningIn(false);}
  };
  const signOut=useCallback(async()=>{
    const response=await sessionFetch("/api/admin/session",{method:"DELETE"});
    if(!response.ok) {setError("Could not sign out. Please retry.");return;}
    setAccount(null);setAuthed(false);setPending(null);setFactorCode("");setError(null);
  },[]);
  const adminFetch=useCallback(async(input:string,init:RequestInit={})=>{
    const response=await sessionFetch(input,{...init,headers:{"content-type":"application/json",...init.headers}});
    if(response.status===401){setAccount(null);setAuthed(false);}
    return response;
  },[]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3e8d5]">
        <span className="font-sans-luxury text-[13px] uppercase tracking-[0.28em] text-[#741a14]/60">
          Checking session…
        </span>
      </div>
    );
  }

  if (pending === "enrolment_required") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#11100e] px-6 py-8">
        <section className="w-full max-w-[440px] rounded-xl border border-[#d8c3a5] bg-[#fff8ed] p-8 text-[#211715]">
          <h1 className="mb-3 font-serif-luxury text-3xl">Set up your authenticator</h1>
          <p className="mb-4 text-sm">Your account needs two-step sign-in before you can open the dashboard.</p>
          <AuthenticatorForm onComplete={acceptSession} onCancel={() => void signOut()} />
          {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
        </section>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#11100e] px-6">
        <motion.form
          onSubmit={signIn}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px] rounded-[14px] border border-[#d8c3a5]/30 bg-[#fff8ed] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        >
          <p className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.22em] text-[#741a14]">
            Authoring console
          </p>
          <h1 className="mt-3 font-serif-luxury text-[32px] leading-none text-[#11100e]">
            {pending ? "Verify your sign-in" : "Sign in to Maple"}
          </h1>
          <p className="mt-2 font-sans-luxury text-[13px] leading-[1.5] text-[#8b8178]">
            {pending ? "Enter a fresh code from your authenticator app or use one of your saved recovery codes." : "Use your individual Maple Studios account."}
          </p>
          {pending ? (
            <input aria-label="Authenticator or recovery code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} value={factorCode} onChange={e => setFactorCode(e.target.value)} required autoFocus className="mt-6 w-full rounded border border-[#d8c3a5] bg-white px-4 py-3 text-[#11100e]" />
          ) : (<>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username" aria-label="Work email" placeholder="you@maplestudios.ai" className="mt-6 w-full rounded border border-[#d8c3a5] bg-white px-4 py-3 text-[#11100e]" />
          <input
            required
            autoComplete="current-password"
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Password"
            aria-label="Password"
            autoFocus
            className="mt-6 w-full rounded-[7px] border border-[#d8c3a5] bg-white/70 px-4 py-3 font-sans-luxury text-[14px] text-[#11100e] outline-none focus:border-[#741a14]"
          />
          </>)}
          {error ? (
            <p role="alert" className="mt-2 font-sans-luxury text-[12.5px] text-[#a3231b]">
              {error}
            </p>
          ) : null}
          <button
            disabled={signingIn}
            type="submit"
            className="mt-5 w-full cursor-pointer rounded-full bg-[#741a14] px-4 py-3 font-sans-luxury text-[12px] font-bold uppercase tracking-[0.18em] text-[#fff8ed] transition-opacity hover:opacity-90"
          >
            {signingIn ? "Checking…" : pending ? "Verify" : "Sign in"}
          </button>
          {pending && <button type="button" onClick={() => void signOut()} className="mt-3 w-full text-sm text-[#741a14] underline">Start over</button>}
        </motion.form>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ key, account, adminFetch, signOut }}>
      <div className="min-h-screen bg-[#f3e8d5] text-[#11100e]">
        {/* ——— fixed rail ——— */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col overflow-y-auto bg-[#11100e] transition-transform duration-300 lg:translate-x-0 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Link href="/admin" className="flex items-center gap-2 px-5 py-5">
            <LogoMark className="h-[20px] w-auto text-[#fff8ed]" />
            <span className="font-serif-luxury text-[16px] italic leading-none text-[#fff8ed]">
              maple<span className="text-[#d87265]">.</span>studios
              <span className="text-[#d87265]">.</span>
            </span>
          </Link>

          <nav className="flex-1 px-2.5 pb-4">
            {NAV.filter(section=>account?.role !== "member" || ["Business","Team","Site"].includes(section.group)).map((section) => (
              <div key={section.group} className="mb-4">
                <p className="px-3 pb-1.5 font-sans-luxury text-[9px] font-bold uppercase tracking-[0.2em] text-[#fff8ed]/28">
                  {section.group}
                </p>
                <ul>
                  {section.items.filter(item=>account?.role === "owner" || !["/admin/payroll","/admin/audit"].includes(item.href) && (account?.role !== "member" || ["/admin/team","/admin/settings","/admin/projects","/admin/security"].includes(item.href))).map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`relative flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] font-sans-luxury text-[12.5px] transition-colors ${
                            active
                              ? "bg-[#741a14]/28 text-[#e88a7d]"
                              : "text-[#fff8ed]/62 hover:bg-white/5 hover:text-[#fff8ed]"
                          }`}
                        >
                          {active ? (
                            <motion.span
                              layoutId="admin-rail-active"
                              className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[#d87265]"
                            />
                          ) : null}
                          <Icon size={15} className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <p className="px-5 py-4 font-sans-luxury text-[9px] font-bold uppercase tracking-[0.2em] text-[#fff8ed]/25">
            Admin · v1.0
          </p>
        </aside>

        {/* scrim behind the rail on phones */}
        {navOpen ? (
          <button
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 cursor-pointer bg-[#11100e]/50 lg:hidden"
          />
        ) : null}

        {/* ——— canvas ——— */}
        <div className="lg:pl-[228px]">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#d8c3a5]/50 bg-[#f3e8d5]/92 px-5 py-3 backdrop-blur-sm sm:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNavOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="cursor-pointer rounded-[6px] border border-[#741a14]/25 px-2 py-1 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#741a14] lg:hidden"
              >
                Menu
              </button>
              <span className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.22em] text-[#8b8178]">
                {account?.name} · {account?.role}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* A fresh document applies the public site's headers. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="whitespace-nowrap rounded-full border border-[#741a14]/30 px-3 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
              >
                View site
              </a>
              <button
                onClick={signOut}
                className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#741a14] px-3 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff8ed] transition-opacity hover:opacity-90"
              >
                <LogOut size={12} />
                Sign out
              </button>
            </div>
          </header>

          <main className="mx-auto max-w-[1240px] px-5 pb-24 pt-7 sm:px-8">
            {error ? <p role="alert" className="mb-4 text-red-800">{error}</p> : null}
            {account?.role === "member" && !(["/admin/team","/admin/settings","/admin/projects","/admin/security"].includes(pathname)||pathname.startsWith("/admin/projects/")) ? <p>Your team workspace is ready. <Link href="/admin/team" className="underline">Open team & attendance</Link></p> : children}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/* ————— small shared pieces every admin screen uses ————— */

export function StatCard({
  label,
  value,
  hint,
  tone = "cream",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "cream" | "maroon";
}) {
  const maroon = tone === "maroon";
  return (
    <div
      className={`rounded-[12px] border p-5 ${
        maroon
          ? "border-[#741a14] bg-[#741a14] text-[#fff8ed]"
          : "border-[#d8c3a5]/45 bg-[#fff8ed] text-[#11100e]"
      }`}
    >
      <p
        className={`font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] ${
          maroon ? "text-[#fff8ed]/70" : "text-[#8b8178]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 font-serif-luxury text-[34px] leading-none ${
          maroon ? "text-[#fff8ed]" : "text-[#741a14]"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={`mt-2 font-sans-luxury text-[12px] leading-[1.45] ${
            maroon ? "text-[#fff8ed]/75" : "text-[#8b8178]"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif-luxury text-[clamp(26px,3.2vw,34px)] leading-none text-[#11100e]">
          {title}
        </h1>
        {sub ? (
          <p className="mt-2 max-w-[640px] font-sans-luxury text-[12.5px] leading-[1.55] text-[#8b8178]">
            {sub}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#741a14]/25 bg-[#fff8ed]/60 px-6 py-14 text-center">
      <p className="font-sans-luxury text-[13.5px] text-[#8b8178]">{children}</p>
    </div>
  );
}

/** "3 minutes ago" / "2 days ago" — the dashboard shows relative time
    everywhere, with the absolute stamp on hover via `title`. */
export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
