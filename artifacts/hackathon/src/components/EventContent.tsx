
import { useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
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

type OrganizerItem = PublishedItem & {
  published: boolean;
  authorId: string;
};

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
  kind: "announcement",
  title: "",
  body: "",
  url: "",
  position: 0,
  published: false,
};

const fieldClass =
  "block w-full rounded border border-[#353b45] bg-[#111418] p-2 text-[#f7f4ed]";

async function getItems<T>(
  path: string,
  signal: AbortSignal
): Promise<T[]> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    throw new Error("Could not load event content.");
  }

  return response.json();
}

// Participant-facing event content.
// Only items returned by the public API are displayed.
// The public API must enforce publication filtering.
export function PublishedEventContent({
  heading,
}: {
  heading: ReactNode;
}) {
  const content = useQuery({
    queryKey: [publicPath],
    queryFn: ({ signal }) =>
      getItems<PublishedItem>(publicPath, signal),
  });

  const items = content.data ?? [];

  const announcements = items
    .filter((item) => item.kind === "announcement")
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt) || 0;
      const bTime = Date.parse(b.updatedAt) || 0;
      return bTime - aTime || b.id - a.id;
    });

  const resources = items
    .filter((item) => item.kind === "resource" && item.url)
    .sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <section
      id="updates"
      className="section"
      data-testid="section-event-content"
    >
      <div className="container-shell">
        {heading}

        <div className="mx-auto grid max-w-3xl gap-4">
          {content.isPending && (
            <div className="panel p-6">
              <p
                role="status"
                className="text-sm text-[#9ca3af]"
              >
                Loading announcements and resources...
              </p>
            </div>
          )}

          {content.isError && (
            <div className="panel p-6">
              <p
                role="alert"
                className="text-sm text-[#9ca3af]"
              >
                Announcements and resources are temporarily
                unavailable. Please check back later.
              </p>
            </div>
          )}

          {content.isSuccess && (
            <>
              {announcements.length === 0 ? (
                <div
                  className="panel p-6"
                  data-testid="empty-announcements"
                >
                  <h3 className="font-semibold text-[#f7f4ed]">
                    Announcements
                  </h3>
                  <p className="mt-3 text-sm text-[#9ca3af]">
                    No announcements have been published yet.
                    Check back for updates.
                  </p>
                </div>
              ) : (
                announcements.map((item, index) => (
                  <article
                    key={item.id}
                    className="panel p-6"
                    data-testid={`announcement-${item.id}`}
                  >
                    {index === 0 && (
                      <span
                        className="mb-3 inline-block rounded bg-[#2d2148] px-3 py-1 text-xs font-semibold text-[#c4b5fd]"
                        data-testid="latest-announcement"
                      >
                        Latest Announcement
                      </span>
                    )}

                    <h3 className="text-lg font-semibold text-[#f7f4ed]">
                      {item.title}
                    </h3>

                    {item.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#9ca3af]">
                        {item.body}
                      </p>
                    )}
                  </article>
                ))
              )}

              <div
                className="panel p-6"
                data-testid="section-resources"
              >
                <p className="eyebrow">Resources</p>

                {resources.length === 0 ? (
                  <p
                    className="mt-3 text-sm text-[#9ca3af]"
                    data-testid="empty-resources"
                  >
                    No resources have been published yet.
                    Check back soon.
                  </p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {resources.map((item) => (
                      <li key={item.id}>
                        <a
                          className="inline-flex items-center gap-2 font-semibold text-[#c4b5fd] underline-offset-4 hover:underline"
                          href={item.url!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.title}
                          <ExternalLink size={13} />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// Organizer-facing content management.
// This section remains separate from the public Event Hub.
export function OrganizerEventContent() {
  const queryClient = useQueryClient();

  const items = useQuery({
    queryKey: [organizerPath],
    queryFn: ({ signal }) =>
      getItems<OrganizerItem>(organizerPath, signal),
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(
    method: "POST" | "PUT" | "DELETE",
    id?: number
  ) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        id ? `${organizerPath}/${id}` : organizerPath,
        {
          method,
          ...(method !== "DELETE" && {
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              kind: draft.kind,
              title: draft.title,
              body: draft.body,
              url: draft.url,
              position: draft.position,
              published: draft.published,
            }),
          }),
        }
      );

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => null);

        setMessage(
          payload?.error ?? "Could not save this change."
        );
        return;
      }

      if (method !== "DELETE" || draft.id === id) {
        setDraft(emptyDraft);
      }

      setMessage(
        method === "DELETE"
          ? "Item deleted."
          : "Item saved."
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [organizerPath],
        }),
        queryClient.invalidateQueries({
          queryKey: [publicPath],
        }),
      ]);
    } catch {
      setMessage(
        "Could not complete the request. Refresh the list before retrying."
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!busy) {
      void save(draft.id ? "PUT" : "POST", draft.id);
    }
  }

  return (
    <details
      className="panel mt-10 p-5"
      data-testid="panel-event-content"
    >
      <summary className="cursor-pointer text-xl font-bold">
        Manage announcements and resources

        <span className="ml-2 text-sm font-normal text-[#9ca3af]">
          (published items appear on the homepage)
        </span>
      </summary>

      <div className="mt-4 space-y-4">
        {items.isPending && (
          <p role="status">Loading content…</p>
        )}

        {items.isError && (
          <p role="alert">
            Could not load organizer content.
            Check your access or refresh.
          </p>
        )}

        <form onSubmit={submit}>
          <fieldset
            disabled={busy || !items.isSuccess}
            className="space-y-3"
          >
            <legend className="mb-2 font-semibold">
              {draft.id ? "Edit item" : "New item"}
            </legend>

            <label className="block">
              Type
              <select
                className={fieldClass}
                value={draft.kind}
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    kind:
                      event.target.value === "resource"
                        ? "resource"
                        : "announcement",
                  });
                }}
              >
                <option value="announcement">
                  Announcement
                </option>
                <option value="resource">
                  Resource link
                </option>
              </select>
            </label>

            <label className="block">
              Title
              <input
                className={fieldClass}
                required
                maxLength={160}
                value={draft.title}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    title: event.target.value,
                  })
                }
              />
            </label>

            {draft.kind === "announcement" ? (
              <label className="block">
                Announcement text
                <textarea
                  className={fieldClass}
                  required
                  maxLength={4000}
                  value={draft.body}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      body: event.target.value,
                    })
                  }
                />
              </label>
            ) : (
              <>
                <label className="block">
                  Resource URL
                  <input
                    className={fieldClass}
                    type="url"
                    required
                    maxLength={2048}
                    value={draft.url}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        url: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="block">
                  Display order (lowest first)
                  <input
                    className={fieldClass}
                    type="number"
                    required
                    min={0}
                    max={2147483647}
                    step={1}
                    value={
                      Number.isNaN(draft.position)
                        ? ""
                        : draft.position
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        position:
                          event.target.valueAsNumber,
                      })
                    }
                  />
                </label>
              </>
            )}

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    published: event.target.checked,
                  })
                }
              />
              Published
            </label>

            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                type="submit"
              >
                Save item
              </button>

              {draft.id && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setDraft(emptyDraft)}
                >
                  Cancel
                </button>
              )}
            </div>
          </fieldset>
        </form>

        {message && <p role="status">{message}</p>}

        <ul className="space-y-2">
          {items.data?.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-[#353b45] pt-2"
            >
              <span>
                {item.title} · {item.kind} ·{" "}
                {item.published ? "Published" : "Draft"}
              </span>

              <div className="flex gap-2">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMessage("");
                    setDraft({
                      ...item,
                      body: item.body ?? "",
                      url: item.url ?? "",
                    });
                  }}
                >
                  Edit
                </button>

                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${item.title}”?`
                      )
                    ) {
                      void save("DELETE", item.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
