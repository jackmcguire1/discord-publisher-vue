import type { Message } from "./schema";

export const WEBHOOK_URL_RE =
  /^https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/;

export interface WebhookInfo {
  id: string;
  token: string;
  /** Canonical URL with no trailing slash or query string. */
  url: string;
}

export function parseWebhookUrl(input: string | null | undefined): WebhookInfo | null {
  if (!input) return null;
  const trimmed = input.trim().split("?")[0];
  const m = trimmed.match(WEBHOOK_URL_RE);
  if (!m) return null;
  return { id: m[1], token: m[2], url: trimmed.replace(/\/$/, "") };
}

/** Hide the token when displaying a webhook URL. */
export function maskWebhookUrl(url: string): string {
  const info = parseWebhookUrl(url);
  if (!info) return url;
  return `${info.url.slice(0, info.url.length - info.token.length)}${info.token.slice(0, 4)}…`;
}

/** The exact JSON Discord receives: editor-only ids and empty values removed. */
export interface WebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: Record<string, unknown>[];
}

function clean<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const inner = clean(v as Record<string, unknown>);
      if (inner === undefined) continue;
      out[k] = inner;
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

export function buildPayload(msg: Message, opts: { forEdit?: boolean } = {}): WebhookPayload {
  const payload: WebhookPayload = {
    content: msg.content || undefined,
    tts: msg.tts || undefined,
    embeds: msg.embeds.map((e) => {
      const { id: _id, fields, ...rest } = e;
      const embed = {
        ...rest,
        fields: fields.map(({ id: _fid, ...f }) => ({ ...f, inline: f.inline ?? false })),
      };
      return (clean(embed) ?? {}) as Record<string, unknown>;
    }),
  };
  if (!opts.forEdit) {
    // Discord ignores username/avatar/tts on PATCH /webhooks/{id}/{token}/messages/{id}
    payload.username = msg.username || undefined;
    payload.avatar_url = msg.avatar_url || undefined;
  } else {
    delete payload.tts;
  }
  const cleaned = (clean(payload as Record<string, unknown>) ?? {}) as WebhookPayload;
  if (opts.forEdit) {
    // On edit, an explicit empty string clears content and an empty array clears embeds,
    // so put them back after `clean` has stripped them.
    cleaned.content = msg.content;
    cleaned.embeds = cleaned.embeds ?? [];
  }
  return cleaned;
}

export interface PublishedRef {
  messageId: string;
  channelId: string;
  webhookId: string;
  threadId?: string;
}

export interface DiscordApiError {
  status: number;
  code?: number;
  message: string;
  errors?: unknown;
}

function withQuery(url: string, params: Record<string, string | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return q ? `${url}?${q}` : url;
}

async function discordFetch(url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw { status: 0, message: `Network error: ${(e as Error).message}` } as DiscordApiError;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    throw {
      status: res.status,
      code: body?.code,
      message: body?.message ?? `HTTP ${res.status}`,
      errors: body?.errors,
    } as DiscordApiError;
  }
  return body;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function sendMessage(
  webhookUrl: string,
  msg: Message,
  opts: { threadId?: string } = {}
): Promise<PublishedRef> {
  const info = parseWebhookUrl(webhookUrl);
  if (!info) throw { status: 0, message: "Invalid webhook URL" } as DiscordApiError;
  const url = withQuery(info.url, { wait: "true", thread_id: opts.threadId });
  const data = await discordFetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(buildPayload(msg)),
  });
  return {
    messageId: data.id,
    channelId: data.channel_id,
    webhookId: info.id,
    threadId: opts.threadId || undefined,
  };
}

export async function editMessage(
  webhookUrl: string,
  ref: PublishedRef,
  msg: Message
): Promise<PublishedRef> {
  const info = parseWebhookUrl(webhookUrl);
  if (!info) throw { status: 0, message: "Invalid webhook URL" } as DiscordApiError;
  const url = withQuery(`${info.url}/messages/${ref.messageId}`, { thread_id: ref.threadId });
  const data = await discordFetch(url, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(buildPayload(msg, { forEdit: true })),
  });
  return { ...ref, messageId: data.id, channelId: data.channel_id, webhookId: info.id };
}

export async function deleteMessage(webhookUrl: string, ref: PublishedRef): Promise<void> {
  const info = parseWebhookUrl(webhookUrl);
  if (!info) throw { status: 0, message: "Invalid webhook URL" } as DiscordApiError;
  const url = withQuery(`${info.url}/messages/${ref.messageId}`, { thread_id: ref.threadId });
  await discordFetch(url, { method: "DELETE" });
}

/** Fetch an existing webhook message so it can be loaded into the editor. */
export async function fetchMessage(webhookUrl: string, messageId: string, threadId?: string) {
  const info = parseWebhookUrl(webhookUrl);
  if (!info) throw { status: 0, message: "Invalid webhook URL" } as DiscordApiError;
  const url = withQuery(`${info.url}/messages/${messageId}`, { thread_id: threadId });
  return discordFetch(url, { method: "GET" });
}

export function messageLink(ref: PublishedRef, guildId = "@me"): string {
  return `https://discord.com/channels/${guildId}/${ref.threadId ?? ref.channelId}/${ref.messageId}`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function buildCurl(
  webhookUrl: string,
  msg: Message,
  opts: { threadId?: string; edit?: PublishedRef } = {}
): string {
  const info = parseWebhookUrl(webhookUrl);
  const base = info?.url ?? (webhookUrl || "https://discord.com/api/webhooks/<id>/<token>");
  const edit = opts.edit;
  const url = edit
    ? withQuery(`${base}/messages/${edit.messageId}`, { thread_id: edit.threadId })
    : withQuery(base, { wait: "true", thread_id: opts.threadId });
  const payload = JSON.stringify(buildPayload(msg, { forEdit: !!edit }), null, 2);
  return [
    `curl -X ${edit ? "PATCH" : "POST"} ${shellQuote(url)} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  --data-raw ${shellQuote(payload)}`,
  ].join("\n");
}
