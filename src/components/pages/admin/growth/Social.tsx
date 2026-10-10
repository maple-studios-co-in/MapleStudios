"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "../AdminShell";
import { Badge, Btn, Card, Confirm, PageHead, SectionLabel, Spinner, Table, Td, Tr, useToast } from "../cms/ui";
import { ApiError, useAction, useApi, useItem, useList } from "./api";
import SocialComposer from "./SocialComposer";
import {
  Drawer,
  ErrorText,
  Kv,
  Muted,
  Notice,
  cap,
  fmtIst,
  fmtIstTime,
  growthTone,
  istDateKey,
  istParts,
  shiftDateKey,
  todayIst,
  weekdayOf,
} from "./shared";
import { PLATFORMS, PLATFORM_LABEL, type Platform, type SocialAccount, type SocialPost } from "./types";

/**
 * Connected accounts, a month calendar of posts, the current week as a
 * list, and a composer. Connecting goes through the backend's OAuth start
 * URL; a 503 means that platform's app keys are not in the server env yet.
 */

const SETUP_DOC = "docs/platform/social-apps-setup.md";
const SETUP_URL = `https://github.com/maple-studios-co-in/MapleStudios/blob/main/${SETUP_DOC}`;

const DOT: Record<Platform, string> = {
  x: "bg-[#11100e]",
  instagram: "bg-[#c13584]",
  linkedin: "bg-[#0a66c2]",
};

const STATUS_RING: Record<SocialPost["status"], string> = {
  draft: "border-[#d8c3a5] text-[#7d6f5f]",
  scheduled: "border-[#741a14]/50 text-[#741a14]",
  publishing: "border-[#e0a12a]/70 text-[#6b4a00]",
  published: "border-[#2f6b4a]/50 text-[#2f6b4a]",
  partial: "border-[#e0a12a] text-[#6b4a00]",
  failed: "border-[#a3231b]/60 text-[#a3231b]",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The post's calendar day in IST — scheduled time, else when it went out. */
function dayOf(p: SocialPost): string {
  const at = p.scheduledAt ?? p.publishedAt;
  return at ? istDateKey(at) : "";
}

export default function Social() {
  const api = useApi();
  const { show, node: toast } = useToast();
  const { busy, run } = useAction(show);

  const accounts = useList<SocialAccount>("/social/accounts");
  const [notConfigured, setNotConfigured] = useState<Partial<Record<Platform, string>>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<SocialAccount | null>(null);

  // calendar
  const today = todayIst();
  const [month, setMonth] = useState(() => {
    const p = istParts(new Date());
    return { y: p.y, m: p.m };
  });
  const [selectedDay, setSelectedDay] = useState(today);
  const range = useMemo(() => {
    const first = `${month.y}-${pad(month.m)}-01`;
    const dim = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    const last = `${month.y}-${pad(month.m)}-${pad(dim)}`;
    const start = shiftDateKey(first, -weekdayOf(first));
    const end = shiftDateKey(last, 6 - weekdayOf(last));
    const days: string[] = [];
    for (let k = start; k <= end; k = shiftDateKey(k, 1)) days.push(k);
    return { first, last, start, end, days };
  }, [month]);

  const posts = useList<SocialPost>("/social/posts", { from: range.start, to: range.end });
  const byDay = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    const drafts: SocialPost[] = [];
    for (const p of posts.items) {
      const k = dayOf(p);
      if (!k) {
        drafts.push(p);
        continue;
      }
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.scheduledAt ?? a.publishedAt ?? "").localeCompare(b.scheduledAt ?? b.publishedAt ?? ""));
    return { m, drafts };
  }, [posts.items]);

  const weekStart = shiftDateKey(selectedDay, -weekdayOf(selectedDay));
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStart, i));
  const weekPosts = weekDays.flatMap((k) => byDay.m.get(k) ?? []);

  const [composing, setComposing] = useState<{ post: SocialPost | null; date?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // the OAuth callback lands on /admin/social?connected=x or ?error=code
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get("connected");
    const err = sp.get("error");
    if (connected) show(`${PLATFORM_LABEL[connected as Platform] ?? cap(connected)} connected`);
    else if (err) show(`Connection failed: ${err}`, true);
    if (connected || err) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = (platform: Platform) =>
    run(`connect-${platform}`, async () => {
      try {
        const { url } = await api.request<{ url: string }>("GET", `/social/connect/${platform}`);
        window.location.assign(url);
      } catch (e) {
        if (e instanceof ApiError && e.status === 503) {
          setNotConfigured((n) => ({ ...n, [platform]: e.message }));
          return;
        }
        throw e;
      }
    });

  const reloadPosts = () => void posts.reload();

  return (
    <>
      <PageHead
        title="Social"
        sub="Connected accounts, the posting calendar, and a composer that writes once and publishes to X, Instagram and LinkedIn."
        action={
          <Btn variant="primary" onClick={() => setComposing({ post: null, date: selectedDay })}>
            <Plus size={13} /> New post
          </Btn>
        }
      />

      {/* ——— accounts ——— */}
      <ErrorText>{accounts.error}</ErrorText>
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const mine = accounts.items.filter((a) => a.platform === platform);
          const nc = notConfigured[platform];
          return (
            <Card key={platform}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-sans-luxury text-[13px] font-bold text-[#11100e]">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[platform]}`} />
                  {PLATFORM_LABEL[platform]}
                </p>
                <Btn onClick={() => connect(platform)} disabled={busy !== null}>
                  {busy === `connect-${platform}` ? "Opening…" : mine.length ? "Connect another" : "Connect"}
                </Btn>
              </div>
              {nc ? (
                <Notice>
                  <strong>Not configured</strong> — the server has no app keys for {PLATFORM_LABEL[platform]}. See{" "}
                  <a href={SETUP_URL} target="_blank" rel="noopener noreferrer" className="font-mono underline underline-offset-2">
                    {SETUP_DOC}
                  </a>
                  .
                </Notice>
              ) : null}
              {accounts.loading ? (
                <Muted>Loading…</Muted>
              ) : mine.length === 0 ? (
                <Muted>Not connected.</Muted>
              ) : (
                <ul className="space-y-2">
                  {mine.map((a) => (
                    <li key={a.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans-luxury text-[12.5px] text-[#11100e]">
                          {a.displayName || a.handle}{" "}
                          <span className="text-[#8b8178]">@{a.handle.replace(/^@/, "")}</span>
                        </p>
                        <p className="font-sans-luxury text-[11px] text-[#8b8178]">
                          connected {fmtIst(a.connectedAt, false)}
                          {a.expiresAt ? ` · expires ${fmtIst(a.expiresAt)}` : ""}
                        </p>
                      </div>
                      <Badge tone={growthTone(a.status)}>{a.status}</Badge>
                      {a.status !== "connected" ? (
                        <Btn onClick={() => connect(platform)} disabled={busy !== null}>
                          Reconnect
                        </Btn>
                      ) : null}
                      <button
                        aria-label={`Disconnect ${a.handle}`}
                        onClick={() => setConfirmDisconnect(a)}
                        className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <ErrorText>{posts.error}</ErrorText>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* ——— month ——— */}
        <Card pad={false} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#d8c3a5]/45 bg-[#f3e8d5]/45 px-4 py-2.5">
            <Btn
              aria-label="Previous month"
              onClick={() => setMonth((m) => (m.m === 1 ? { y: m.y - 1, m: 12 } : { y: m.y, m: m.m - 1 }))}
            >
              <ChevronLeft size={13} />
            </Btn>
            <div className="text-center">
              <p className="font-serif-luxury text-[19px] leading-none text-[#11100e]">
                {MONTHS[month.m - 1]} {month.y}
              </p>
              <button
                onClick={() => {
                  const p = istParts(new Date());
                  setMonth({ y: p.y, m: p.m });
                  setSelectedDay(today);
                }}
                className="mt-1 cursor-pointer font-sans-luxury text-[10px] font-bold uppercase tracking-[0.14em] text-[#741a14] hover:underline"
              >
                Today
              </button>
            </div>
            <Btn
              aria-label="Next month"
              onClick={() => setMonth((m) => (m.m === 12 ? { y: m.y + 1, m: 1 } : { y: m.y, m: m.m + 1 }))}
            >
              <ChevronRight size={13} />
            </Btn>
          </div>

          <div className="grid grid-cols-7 border-b border-[#d8c3a5]/45">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center font-sans-luxury text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
                {d}
              </div>
            ))}
          </div>

          {posts.loading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-7">
              {range.days.map((k) => {
                const inMonth = k >= range.first && k <= range.last;
                const dayPosts = byDay.m.get(k) ?? [];
                const isToday = k === today;
                const isSel = k === selectedDay;
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDay(k)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedDay(k)}
                    onDoubleClick={() => setComposing({ post: null, date: k })}
                    className={`min-h-[84px] cursor-pointer border-b border-r border-[#d8c3a5]/30 p-1.5 text-left transition-colors ${
                      isSel ? "bg-[#741a14]/8" : "hover:bg-[#f3e8d5]/50"
                    } ${inMonth ? "" : "opacity-45"}`}
                  >
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-sans-luxury text-[11px] ${
                        isToday ? "bg-[#741a14] font-bold text-[#fff8ed]" : "text-[#6b6259]"
                      }`}
                    >
                      {Number(k.slice(8))}
                    </span>
                    <ul className="mt-1 space-y-1">
                      {dayPosts.slice(0, 3).map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(p.id);
                            }}
                            title={p.text}
                            className={`flex w-full cursor-pointer items-center gap-1 rounded-[5px] border bg-[#fff8ed] px-1.5 py-[2px] text-left font-sans-luxury text-[10px] ${STATUS_RING[p.status]}`}
                          >
                            <span className="flex shrink-0 gap-[2px]">
                              {p.platforms.map((pl) => (
                                <span key={pl} className={`inline-block h-[6px] w-[6px] rounded-full ${DOT[pl]}`} />
                              ))}
                            </span>
                            <span className="truncate">
                              {p.scheduledAt ? fmtIstTime(p.scheduledAt).replace(/\s?[ap]m/i, (m) => m.trim()) : ""} {p.text}
                            </span>
                          </button>
                        </li>
                      ))}
                      {dayPosts.length > 3 ? (
                        <li className="px-1 font-sans-luxury text-[10px] text-[#8b8178]">+{dayPosts.length - 3} more</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <p className="px-4 py-2 font-sans-luxury text-[10.5px] text-[#a2988b]">
            Click a day to list its week · double-click to compose for that day
          </p>
        </Card>

        {/* ——— week list ——— */}
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>
                Week of {fmtIst(`${weekStart}T00:00:00+05:30`, false)}
              </SectionLabel>
              <Muted>{weekPosts.length} post{weekPosts.length === 1 ? "" : "s"}</Muted>
            </div>
            {weekPosts.length === 0 ? (
              <p className="py-6 text-center font-sans-luxury text-[12.5px] text-[#a2988b]">Nothing scheduled this week.</p>
            ) : (
              <ul className="divide-y divide-[#d8c3a5]/40">
                {weekPosts.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setOpenId(p.id)}
                      className="flex w-full cursor-pointer items-start gap-3 py-2.5 text-left hover:bg-[#f3e8d5]/40"
                    >
                      <span className="w-[72px] shrink-0 font-sans-luxury text-[11px] leading-[1.4] text-[#8b8178]">
                        {WEEKDAYS[weekdayOf(dayOf(p))]} {Number(dayOf(p).slice(8))}
                        <br />
                        {p.scheduledAt ? fmtIstTime(p.scheduledAt) : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-sans-luxury text-[12.5px] leading-[1.45] text-[#11100e]">{p.text}</span>
                        <span className="mt-1 flex items-center gap-1.5">
                          {p.platforms.map((pl) => (
                            <span key={pl} className={`inline-block h-[7px] w-[7px] rounded-full ${DOT[pl]}`} title={PLATFORM_LABEL[pl]} />
                          ))}
                          <Badge tone={growthTone(p.status)}>{p.status}</Badge>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {byDay.drafts.length ? (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Unscheduled drafts</SectionLabel>
                <Muted>{byDay.drafts.length}</Muted>
              </div>
              <ul className="divide-y divide-[#d8c3a5]/40">
                {byDay.drafts.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setOpenId(p.id)}
                      className="flex w-full cursor-pointer items-center gap-2 py-2 text-left hover:bg-[#f3e8d5]/40"
                    >
                      <span className="line-clamp-1 flex-1 font-sans-luxury text-[12.5px] text-[#11100e]">{p.text}</span>
                      <Badge tone="draft">draft</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {!posts.loading && posts.items.length === 0 && !posts.error ? (
        <div className="mt-4">
          <EmptyState>No posts in this range yet — compose one, or double-click a day.</EmptyState>
        </div>
      ) : null}

      {composing ? (
        <SocialComposer
          post={composing.post}
          defaultDate={composing.date}
          onClose={() => setComposing(null)}
          onSaved={(p) => {
            setComposing(null);
            reloadPosts();
            setOpenId(p.id);
          }}
          show={show}
        />
      ) : null}

      {openId ? (
        <PostDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={reloadPosts}
          onEdit={(p) => {
            setOpenId(null);
            setComposing({ post: p });
          }}
          show={show}
        />
      ) : null}

      {confirmDisconnect ? (
        <Confirm
          title={`Disconnect @${confirmDisconnect.handle.replace(/^@/, "")}?`}
          body="Scheduled posts for this platform will fail until an account is connected again. Tokens are deleted."
          confirmLabel="Disconnect"
          onCancel={() => setConfirmDisconnect(null)}
          onConfirm={() => {
            const a = confirmDisconnect;
            setConfirmDisconnect(null);
            void run(
              "disconnect",
              async () => {
                await api.request("DELETE", `/social/accounts/${a.id}`);
                await accounts.reload();
              },
              "Account disconnected"
            );
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ————— post drawer ————— */

function PostDrawer({
  id,
  onClose,
  onChanged,
  onEdit,
  show,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (p: SocialPost) => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { item: p, loading, error, setItem, reload } = useItem<SocialPost>(`/social/posts/${id}`);
  const { busy, run } = useAction(show);
  const [confirming, setConfirming] = useState<"delete" | "publish" | null>(null);

  // a publishing post settles within seconds — poll while it does
  useEffect(() => {
    if (p?.status !== "publishing") return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [p?.status, reload]);

  const post = (verb: "publish-now" | "cancel", done: string) =>
    run(
      verb,
      async () => {
        const res = await api.request<{ item: SocialPost }>("POST", `/social/posts/${id}/${verb}`);
        setItem(res.item);
        onChanged();
      },
      done
    );

  const editable = p ? p.status === "draft" || p.status === "scheduled" || p.status === "failed" : false;

  return (
    <Drawer
      title={p ? `${cap(p.status)} post` : "Post"}
      sub={
        p ? (
          <>
            {p.scheduledAt ? `Scheduled ${fmtIst(p.scheduledAt)}` : "Not scheduled"}
            {p.publishedAt ? ` · published ${fmtIst(p.publishedAt)}` : ""} · created {fmtIst(p.createdAt, false)}
          </>
        ) : undefined
      }
      onClose={onClose}
      footer={
        p ? (
          <>
            <Btn variant="quiet" onClick={() => setConfirming("delete")} disabled={busy !== null}>
              <Trash2 size={12} /> Delete
            </Btn>
            <span className="flex-1" />
            {p.status === "scheduled" ? (
              <Btn onClick={() => post("cancel", "Back to draft")} disabled={busy !== null}>
                Unschedule
              </Btn>
            ) : null}
            {editable ? (
              <Btn onClick={() => onEdit(p)} disabled={busy !== null}>
                <Pencil size={12} /> Edit
              </Btn>
            ) : null}
            {editable || p.status === "partial" ? (
              <Btn variant="primary" onClick={() => setConfirming("publish")} disabled={busy !== null}>
                {busy === "publish-now" ? "Publishing…" : "Publish now"}
              </Btn>
            ) : null}
          </>
        ) : undefined
      }
    >
      <ErrorText>{error}</ErrorText>
      {loading && !p ? <Spinner /> : null}
      {p ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={growthTone(p.status)}>{p.status}</Badge>
            {p.platforms.map((pl) => (
              <span key={pl} className="inline-flex items-center gap-1 font-sans-luxury text-[11.5px] text-[#6b6259]">
                <span className={`inline-block h-[7px] w-[7px] rounded-full ${DOT[pl]}`} /> {PLATFORM_LABEL[pl]}
              </span>
            ))}
          </div>

          <p className="mt-4 whitespace-pre-wrap rounded-[8px] bg-[#f3e8d5]/50 px-3 py-3 font-sans-luxury text-[13.5px] leading-[1.6] text-[#11100e]">
            {p.text}
          </p>

          {p.mediaUrls.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {p.mediaUrls.map((u, i) => (
                <a key={`${u}-${i}`} href={u} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[6px] border border-[#d8c3a5]/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}

          <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
            <SectionLabel>Per-platform results</SectionLabel>
            {p.results.length === 0 ? (
              <Muted>Nothing has been attempted yet.</Muted>
            ) : (
              <Table head={["Platform", "Status", "Link", "When"]}>
                {p.results.map((r) => (
                  <Tr key={r.platform}>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-block h-[7px] w-[7px] rounded-full ${DOT[r.platform]}`} /> {PLATFORM_LABEL[r.platform]}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={growthTone(r.status)}>{r.status}</Badge>
                      {r.error ? <span className="mt-1 block text-[11.5px] text-[#a3231b]">{r.error}</span> : null}
                    </Td>
                    <Td>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#741a14] underline underline-offset-2">
                          Open <ExternalLink size={11} />
                        </a>
                      ) : r.externalId ? (
                        <span className="font-mono text-[11px] text-[#8b8178]">{r.externalId}</span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[#8b8178]">{r.publishedAt ? fmtIst(r.publishedAt) : "—"}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </section>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <Kv label="Post id">
              <span className="font-mono text-[11px]">{p.id}</span>
            </Kv>
            <Kv label="Updated">{fmtIst(p.updatedAt)}</Kv>
          </dl>
        </>
      ) : null}

      {confirming === "delete" && p ? (
        <Confirm
          title="Delete this post?"
          body={p.status === "published" ? "This removes the record here; it does not delete the post on the platforms." : "The draft or schedule is removed; nothing has been published."}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            void run(
              "delete",
              async () => {
                await api.request("DELETE", `/social/posts/${id}`);
                onChanged();
                onClose();
              },
              "Post deleted"
            );
          }}
        />
      ) : null}

      {confirming === "publish" && p ? (
        <Confirm
          title="Publish now?"
          body={`Posts to ${p.platforms.map((pl) => PLATFORM_LABEL[pl]).join(", ")} immediately.`}
          confirmLabel="Publish"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            void post("publish-now", "Publishing…");
          }}
        />
      ) : null}
    </Drawer>
  );
}
