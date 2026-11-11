import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ContentKind = "announcement" | "resource";
type PublishedItem = {
  id: number;
  kind: ContentKind;
  title: string;
  body: string | null;
  url: string | null;
  position: number;
  updatedAt: string;
};
type OrganizerItem = PublishedItem & { published: boolean; authorId: string };
type Draft = {
  id?: number;
  kind: ContentKind;
  title: string;
  body: string;
  url: string;
  position: number;
  published: boolean;
};

const publicPath = "/api/event-content";
const organizerPath = "/api/admin/event-content";
const emptyDraft: Draft = {
  kind: "announcement", title: "", body: "", url: "", position: 0, published: false,
};
const fieldClass = "block w-full rounded border border-[#353b45] bg-[#111418] p-2 text-[#f7f4ed]";

async function getItems<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error("Could not load event content.");
  return response.json();
}

export function PublishedEventContent() {
  const content = useQuery({
    queryKey: [publicPath],
    queryFn: ({ signal }) => getItems<PublishedItem>(publicPath, signal),
  });

  return (
    <section className="container-shell py-12" aria-labelledby="event-content-heading">
      <h2 id="event-content-heading" className="display text-3xl">Announcements and resources</h2>
      {content.isPending && <p role="status">Loading event updates…</p>}
      {content.isError && <p role="status">Could not load event updates. Try refreshing.</p>}
      {content.data?.length === 0 && <p>No published updates yet.</p>}
      <ul className="mt-4 grid gap-3">
        {content.data?.map((item) => (
          <li key={item.id} className="panel p-4">
            {item.kind === "resource" && item.url ? (
              <a className="underline" href={item.url}>{item.title}</a>
            ) : (
              <>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrganizerEventContent() {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: [organizerPath],
    queryFn: ({ signal }) => getItems<OrganizerItem>(organizerPath, signal),
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(method: "POST" | "PUT" | "DELETE", id?: number) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(id ? `${organizerPath}/${id}` : organizerPath, {
        method,
        ...(method !== "DELETE" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: draft.kind,
            title: draft.title,
            body: draft.body,
            url: draft.url,
            position: draft.position,
            published: draft.published,
          }),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage(payload?.error ?? "Could not save this change.");
        return;
      }
      if (method !== "DELETE" || draft.id === id) setDraft(emptyDraft);
      setMessage(method === "DELETE" ? "Item deleted." : "Item saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [organizerPath] }),
        queryClient.invalidateQueries({ queryKey: [publicPath] }),
      ]);
    } catch {
      setMessage("Could not complete the request. Refresh the list before retrying.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void save(draft.id ? "PUT" : "POST", draft.id);
  }

  return (
    <section className="panel mb-8 space-y-4 p-5" aria-labelledby="organizer-content-heading">
      <h2 id="organizer-content-heading" className="text-xl font-bold">Manage announcements and resources</h2>
      {items.isPending && <p role="status">Loading content…</p>}
      {items.isError && <p role="alert">Could not load organizer content. Check your access or refresh.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={busy || !items.isSuccess} className="space-y-3">
          <legend className="mb-2 font-semibold">{draft.id ? "Edit item" : "New item"}</legend>
          <label className="block">Type
            <select className={fieldClass} value={draft.kind} onChange={(event) => {
              setDraft({ ...draft, kind: event.target.value === "resource" ? "resource" : "announcement" });
            }}>
              <option value="announcement">Announcement</option>
              <option value="resource">Resource link</option>
            </select>
          </label>
          <label className="block">Title
            <input className={fieldClass} required maxLength={160} value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          {draft.kind === "announcement" ? (
            <label className="block">Announcement text
              <textarea className={fieldClass} required maxLength={4000} value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            </label>
          ) : (
            <>
              <label className="block">Resource URL
                <input className={fieldClass} type="url" required maxLength={2048} value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
              </label>
              <label className="block">Display order (lowest first)
                <input className={fieldClass} type="number" required min={0} max={2147483647} step={1}
                  value={Number.isNaN(draft.position) ? "" : draft.position}
                  onChange={(event) => setDraft({ ...draft, position: event.target.valueAsNumber })} />
              </label>
            </>
          )}
          <label className="flex gap-2">
            <input type="checkbox" checked={draft.published}
              onChange={(event) => setDraft({ ...draft, published: event.target.checked })} />
            Published
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">Save item</button>
            {draft.id && <button className="btn btn-ghost" type="button" onClick={() => setDraft(emptyDraft)}>Cancel</button>}
          </div>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
      <ul className="space-y-2">
        {items.data?.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#353b45] pt-2">
            <span>{item.title} · {item.kind} · {item.published ? "Published" : "Draft"}</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => {
                setMessage("");
                setDraft({ ...item, body: item.body ?? "", url: item.url ?? "" });
              }}>Edit</button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => {
                if (window.confirm(`Delete “${item.title}”?`)) void save("DELETE", item.id);
              }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
