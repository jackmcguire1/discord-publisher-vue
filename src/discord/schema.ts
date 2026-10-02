import { z } from "zod";

// Discord webhook message schema, stripped down to the parts this app edits:
// webhook identity, plain content and up to ten rich embeds.
// Limits follow https://discord.com/developers/docs/resources/message#embed-object-embed-limits

let nextId = Date.now() % 1_000_000;
export function uniqueId(): number {
  return nextId++;
}

const VARIABLE_RE = /\{\{[^}]+\}\}/;
const HOSTNAME_RE = /\.[a-zA-Z]{2,}$/;

export function isHttpUrl(v: string): boolean {
  return isUrl(v);
}

function isUrl(v: string): boolean {
  if (VARIABLE_RE.test(v)) return true;
  try {
    const url = new URL(v);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      HOSTNAME_RE.test(url.hostname)
    );
  } catch {
    return false;
  }
}

const urlSchema = z.string().refine(isUrl, "Invalid URL");
const optionalUrl = z.optional(urlSchema);

export const embedFieldSchema = z.object({
  id: z.number().default(() => uniqueId()),
  name: z.string().min(1, "Name is required").max(256),
  value: z.string().min(1, "Value is required").max(1024),
  inline: z.optional(z.boolean()),
});
export type EmbedField = z.infer<typeof embedFieldSchema>;

export const embedSchema = z
  .object({
    id: z.number().default(() => uniqueId()),
    title: z.optional(z.string().max(256)),
    description: z.optional(z.string().max(4096)),
    url: optionalUrl,
    timestamp: z.optional(z.string()),
    color: z.optional(z.number().int().min(0).max(0xffffff)),
    footer: z.optional(
      z.object({
        text: z.optional(z.string().max(2048)),
        icon_url: optionalUrl,
      })
    ),
    author: z.optional(
      z.object({
        name: z.string().min(1, "Author name is required").max(256),
        url: optionalUrl,
        icon_url: optionalUrl,
      })
    ),
    image: z.optional(z.object({ url: optionalUrl })),
    thumbnail: z.optional(z.object({ url: optionalUrl })),
    fields: z.array(embedFieldSchema).max(25).default([]),
  })
  .superRefine((e, ctx) => {
    const empty =
      !e.title &&
      !e.description &&
      !e.author?.name &&
      !e.footer?.text &&
      !e.fields.length &&
      !e.image?.url &&
      !e.thumbnail?.url;
    if (empty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "An embed needs at least one of title, description, author, footer, fields or an image",
      });
    }
    const total =
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.footer?.text?.length ?? 0) +
      (e.author?.name?.length ?? 0) +
      e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    if (total > 6000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: `Embed text totals ${total} characters; Discord allows 6000`,
      });
    }
  });
export type Embed = z.infer<typeof embedSchema>;

export const messageSchema = z
  .object({
    content: z.string().max(2000).default(""),
    username: z.optional(
      z
        .string()
        .max(80)
        .refine(
          (v) => !/clyde|discord/i.test(v),
          "Username can't contain 'clyde' or 'discord'"
        )
        .refine(
          (v) => !["everyone", "here"].includes(v.toLowerCase()),
          "Username can't be 'everyone' or 'here'"
        )
    ),
    avatar_url: optionalUrl,
    tts: z.boolean().default(false),
    embeds: z.array(embedSchema).max(10).default([]),
  })
  .superRefine((m, ctx) => {
    if (!m.content && !m.embeds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Add some content or at least one embed",
      });
    }
  });
export type Message = z.infer<typeof messageSchema>;

/** Flattened `path -> first message` map for showing errors next to inputs. */
export type ValidationErrors = Record<string, string>;

export function validateMessage(msg: Message): ValidationErrors {
  const res = messageSchema.safeParse(msg);
  if (res.success) return {};
  const errors: ValidationErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export function emptyEmbed(): Embed {
  return { id: uniqueId(), fields: [] };
}

export function emptyField(): EmbedField {
  return { id: uniqueId(), name: "", value: "", inline: true };
}

export function emptyMessage(): Message {
  return { content: "", tts: false, embeds: [] };
}

/** Starter message shown on first load: a release announcement for the Stat-Milestones Twitch extension. */
export function defaultMessage(): Message {
  return {
    content: "",
    tts: false,
    username: "Stat-Milestones",
    avatar_url: "https://pbs.twimg.com/profile_images/1533157608537960449/h-KjDil9_400x400.jpg",
    embeds: [
      {
        id: uniqueId(),
        author: {
          name: "Stat-Milestones",
          icon_url: "https://pbs.twimg.com/profile_images/1533157608537960449/h-KjDil9_400x400.jpg",
          url: "https://stat-milestones.dev",
        },
        title: "Stat-Milestones v1.8.2 is live",
        url: "https://stat-milestones.dev",
        color: 0x9146ff,
        description:
          "A small maintenance release for the Stat-Milestones Twitch extension.\n\n" +
          "**What's new**\n" +
          "- Milestone gauges now update the moment a goal is hit instead of on the next poll\n" +
          "- Added a compact layout for the panel view\n\n" +
          "**Fixes**\n" +
          "- Charity campaign totals no longer reset when the stream goes offline\n" +
          "- Hype train progress respects the configured level cap\n\n" +
          "The update rolls out automatically; no action needed from streamers.",
        fields: [
          { id: uniqueId(), name: "Version", value: "v1.8.2", inline: true },
          { id: uniqueId(), name: "Release date", value: "30/09/2026", inline: true },
        ],
        footer: { text: "stat-milestones.dev" },
      },
    ],
  };
}

/**
 * Accepts a raw Discord webhook payload (e.g. pasted JSON, an exported file
 * or a message fetched from the API) and normalises it into editor state.
 * Nulls become undefined, ids are regenerated, unknown keys are dropped.
 */
export function parseIncomingMessage(raw: unknown): Message {
  const r = (raw ?? {}) as Record<string, any>;
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const embeds = Array.isArray(r.embeds) ? r.embeds : [];
  return {
    content: typeof r.content === "string" ? r.content : "",
    username: str(r.username),
    avatar_url: str(r.avatar_url),
    tts: Boolean(r.tts),
    embeds: embeds.slice(0, 10).map((e: Record<string, any>): Embed => {
      const fields = Array.isArray(e?.fields) ? e.fields : [];
      const color =
        typeof e?.color === "number"
          ? e.color
          : typeof e?.color === "string" && /^#?[0-9a-f]{6}$/i.test(e.color)
            ? parseInt(e.color.replace("#", ""), 16)
            : undefined;
      return {
        id: uniqueId(),
        title: str(e?.title),
        description: str(e?.description),
        url: str(e?.url),
        timestamp: str(e?.timestamp),
        color,
        footer: e?.footer
          ? { text: str(e.footer.text), icon_url: str(e.footer.icon_url) }
          : undefined,
        author: e?.author?.name
          ? {
              name: String(e.author.name),
              url: str(e.author.url),
              icon_url: str(e.author.icon_url),
            }
          : undefined,
        image: str(e?.image?.url) ? { url: str(e.image.url) } : undefined,
        thumbnail: str(e?.thumbnail?.url) ? { url: str(e.thumbnail.url) } : undefined,
        fields: fields.slice(0, 25).map(
          (f: Record<string, any>): EmbedField => ({
            id: uniqueId(),
            name: typeof f?.name === "string" ? f.name : "",
            value: typeof f?.value === "string" ? f.value : "",
            inline: Boolean(f?.inline),
          })
        ),
      };
    }),
  };
}
