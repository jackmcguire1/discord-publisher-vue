// Discord-flavoured markdown -> HTML for the live preview.
// Ported from Embed Generator (itself based on discord-markdown / discord-markdown-parser).
import markdown from "simple-markdown";
import highlight from "highlight.js/lib/common";

function htmlTag(tagName, content, attributes, isClosed = true) {
  attributes = attributes || {};
  let attributeString = "";
  for (const attr in attributes) {
    if (Object.prototype.hasOwnProperty.call(attributes, attr) && attributes[attr]) {
      attributeString += ` ${markdown.sanitizeText(attr)}="${markdown.sanitizeText(attributes[attr])}"`;
    }
  }
  const open = `<${tagName}${attributeString}>`;
  return isClosed ? open + content + `</${tagName}>` : open;
}

function relativeTime(date) {
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === "second") {
      return rtf.format(Math.round(diff / secs), unit);
    }
  }
  return "";
}

const titleRules = {
  newline: markdown.defaultRules.newline,
  escape: markdown.defaultRules.escape,
  em: Object.assign({}, markdown.defaultRules.em, {
    parse(capture, parse, state) {
      const parsed = markdown.defaultRules.em.parse(
        capture,
        parse,
        Object.assign({}, state, { inEmphasis: true })
      );
      return state.inEmphasis ? parsed.content : parsed;
    },
  }),
  strong: markdown.defaultRules.strong,
  u: markdown.defaultRules.u,
  strike: Object.assign({}, markdown.defaultRules.del, {
    match: markdown.inlineRegex(/^~~([\s\S]+?)~~(?!_)/),
  }),
  inlineCode: Object.assign({}, markdown.defaultRules.inlineCode, {
    match: (source) => markdown.defaultRules.inlineCode.match.regex.exec(source),
    html(node) {
      return htmlTag("code", markdown.sanitizeText(node.content.trim()));
    },
  }),
  text: Object.assign({}, markdown.defaultRules.text, {
    match: (source) =>
      /^[\s\S]+?(?=[^0-9A-Za-z\sÀ-￿-]|\n\n|\n|\w+:\S|$)/.exec(source),
    html(node, output, state) {
      return state.escapeHTML ? markdown.sanitizeText(node.content) : node.content;
    },
  }),
  emoticon: {
    order: markdown.defaultRules.text.order,
    match: (source) => /^(¯\\_\(ツ\)_\/¯)/.exec(source),
    parse: (capture) => ({ type: "text", content: capture[1] }),
    html: (node, output, state) => output(node.content, state),
  },
  br: Object.assign({}, markdown.defaultRules.br, {
    match: markdown.anyScopeRegex(/^\n/),
  }),
  spoiler: {
    order: 0,
    match: (source) => /^\|\|([\s\S]+?)\|\|/.exec(source),
    parse: (capture, parse, state) => ({ content: parse(capture[1], state) }),
    html: (node, output, state) =>
      htmlTag("span", output(node.content, state), { class: "discord-spoiler" }),
  },
  discordEmoji: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^<(a?):(\w+):(\d+)>/.exec(source),
    parse: (capture) => ({ animated: capture[1] === "a", name: capture[2], id: capture[3] }),
    html(node) {
      return htmlTag(
        "span",
        htmlTag(
          "img",
          "",
          {
            class: "discord-custom-emoji-image",
            src: `https://cdn.discordapp.com/emojis/${node.id}.${node.animated ? "gif" : "png"}`,
            title: `:${node.name}:`,
            alt: `:${node.name}:`,
          },
          false
        ),
        { class: "discord-custom-emoji" }
      );
    },
  },
};

const bodyRules = {
  ...titleRules,
  blockQuote: Object.assign({}, markdown.defaultRules.blockQuote, {
    match(source, state, prevSource) {
      return !/^$|\n *$/.test(prevSource) || state.inQuote
        ? null
        : /^( *>>> ([\s\S]*))|^( *> [^\n]*(\n *> [^\n]*)*\n?)/.exec(source);
    },
    parse(capture, parse, state) {
      const all = capture[0];
      const isBlock = Boolean(/^ *>>> ?/.exec(all));
      const removeSyntaxRegex = isBlock ? /^ *>>> ?/ : /^ *> ?/gm;
      const content = all.replace(removeSyntaxRegex, "");
      return { content: parse(content, Object.assign({}, state, { inQuote: true })) };
    },
    html: (node, output, state) =>
      htmlTag(
        "div",
        htmlTag("div", "", { class: "discord-quote-divider" }) +
          htmlTag("blockquote", output(node.content, state)),
        { class: "discord-quote-container" }
      ),
  }),
  codeBlock: Object.assign({}, markdown.defaultRules.codeBlock, {
    match: markdown.inlineRegex(/^```(([a-z0-9-]+?)\n+)?\n*([^]+?)\n*```/i),
    parse: (capture, parse, state) => ({
      lang: (capture[2] || "").trim(),
      content: capture[3] || "",
      inQuote: state.inQuote || false,
    }),
    html(node) {
      let code;
      if (node.lang && highlight.getLanguage(node.lang)) {
        code = highlight.highlight(node.content, { language: node.lang, ignoreIllegals: true });
      }
      return htmlTag(
        "pre",
        htmlTag("code", code ? code.value : markdown.sanitizeText(node.content), {
          class: `hljs${code ? " " + code.language : ""}`,
          style: "padding: 8px;",
        }),
        { style: "background-color: #2f3136; margin-top: 6px" }
      );
    },
  }),
  link: Object.assign({}, markdown.defaultRules.link, {
    html: (node, output, state) =>
      htmlTag("a", output(node.content, state), {
        href: markdown.sanitizeUrl(node.target),
        title: node.title,
        target: "_blank",
        rel: "noreferrer",
      }),
  }),
  autolink: Object.assign({}, markdown.defaultRules.autolink, {
    parse: (capture) => ({ content: [{ type: "text", content: capture[1] }], target: capture[1] }),
    html: (node, output, state) =>
      htmlTag("a", output(node.content, state), {
        href: markdown.sanitizeUrl(node.target),
        target: "_blank",
        rel: "noreferrer",
      }),
  }),
  url: Object.assign({}, markdown.defaultRules.url, {
    parse: (capture) => ({ content: [{ type: "text", content: capture[1] }], target: capture[1] }),
    html: (node, output, state) =>
      htmlTag("a", output(node.content, state), {
        href: markdown.sanitizeUrl(node.target),
        target: "_blank",
        rel: "noreferrer",
      }),
  }),
  heading: Object.assign({}, markdown.defaultRules.heading, {
    match(source, state) {
      if (
        state.prevCapture === null ||
        state.prevCapture[state.prevCapture.length - 1] === "\n"
      ) {
        return /^(#{1,3}) +([^\n]+?)(\n|$)/.exec(source);
      }
      return null;
    },
  }),
  subtext: {
    order: markdown.defaultRules.heading.order,
    match: (source, state) =>
      state.prevCapture === null || state.prevCapture[state.prevCapture.length - 1] === "\n"
        ? /^ *-# +((?!(-#)+)[^\n]+?) *(\n|$)/.exec(source)
        : null,
    parse: (capture) => ({ content: capture[1].trim() }),
    html: (node) => htmlTag("small", markdown.sanitizeText(node.content)),
  },
  list: Object.assign({}, markdown.defaultRules.list, {
    match(source, state, prevCapture) {
      state._list = true;
      return markdown.defaultRules.list.match(source, state, prevCapture);
    },
  }),
  discordUser: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^<@!?([0-9]*)>/.exec(source),
    parse: (capture) => ({ id: capture[1] }),
    html: (node) =>
      htmlTag("span", "@" + markdown.sanitizeText(node.id), {
        class: "discord-mention discord-user-mention",
      }),
  },
  discordChannel: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^<#?([0-9]*)>/.exec(source),
    parse: (capture) => ({ id: capture[1] }),
    html: (node) =>
      htmlTag("span", "#" + markdown.sanitizeText(node.id), { class: "discord-mention" }),
  },
  discordRole: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^<@&([0-9]*)>/.exec(source),
    parse: (capture) => ({ id: capture[1] }),
    html: (node) =>
      htmlTag("span", "@" + markdown.sanitizeText(node.id), {
        class: "discord-mention discord-role-mention",
      }),
  },
  discordEveryone: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^@everyone/.exec(source),
    parse: () => ({}),
    html: () => htmlTag("span", "@everyone", { class: "discord-mention discord-role-mention" }),
  },
  discordHere: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^@here/.exec(source),
    parse: () => ({}),
    html: () => htmlTag("span", "@here", { class: "discord-mention discord-role-mention" }),
  },
  discordTimestamp: {
    order: markdown.defaultRules.strong.order,
    match: (source) => /^<t:(\d+)(?::([a-zA-Z]))?>/.exec(source),
    parse: (capture) => ({ timestamp: parseInt(capture[1], 10), format: capture[2] || "f" }),
    html(node) {
      const date = new Date(node.timestamp * 1000);
      const options = {
        t: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        T: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        d: date.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" }),
        D: date.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
        f: date.toLocaleString([], { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        F: date.toLocaleString([], { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        R: relativeTime(date),
      };
      return htmlTag("span", options[node.format] || options.f, { class: "discord-timestamp" });
    },
  },
};

const parserTitle = markdown.parserFor(titleRules);
const htmlOutputTitle = markdown.outputFor(titleRules, "html");
const parseBody = markdown.parserFor(bodyRules);
const htmlOutputBody = markdown.outputFor(bodyRules, "html");

/**
 * @param {string} source
 * @param {{ isTitle?: boolean }} [options] Titles/field names only support inline formatting.
 */
export function toHTML(source, options = {}) {
  const parser = options.isTitle ? parserTitle : parseBody;
  const output = options.isTitle ? htmlOutputTitle : htmlOutputBody;
  const state = { inline: true, inQuote: false, inEmphasis: false, escapeHTML: true };
  return output(parser(source || "", state), state);
}
