import { Platform } from "react-native";

function setMetaTag(nameOrProperty: string, content: string) {
  if (typeof document === "undefined") return;
  const el =
    document.querySelector(`meta[property="${nameOrProperty}"]`) ||
    document.querySelector(`meta[name="${nameOrProperty}"]`);
  if (el) {
    el.setAttribute("content", content);
  } else {
    const meta = document.createElement("meta");
    const isOg = nameOrProperty.startsWith("og:") || nameOrProperty.startsWith("article:");
    const isTwitter = nameOrProperty.startsWith("twitter:");
    meta.setAttribute(isOg ? "property" : "name", nameOrProperty);
    meta.setAttribute("content", content);
    document.head.appendChild(meta);
  }
}

function setLinkTag(rel: string, href: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector(`link[rel="${rel}"]`);
  if (el) {
    el.setAttribute("href", href);
  } else {
    const link = document.createElement("link");
    link.setAttribute("rel", rel);
    link.setAttribute("href", href);
    document.head.appendChild(link);
  }
}

const DEFAULT_TITLE = "AfuChat — Connect, Chat, Discover";
const DEFAULT_DESC = "Your all-in-one social platform. Chat in real time, discover trending content, share moments, and build your community.";
const DEFAULT_IMAGE = "https://afuchat.com/logo.png";
const DEFAULT_URL = "https://afuchat.com";

export function setPageMeta(params: {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: "article" | "profile" | "website";
  publishedAt?: string;
  author?: string;
}) {
  if (Platform.OS !== "web") return;

  const { title, description, image = DEFAULT_IMAGE, url = DEFAULT_URL, type = "article", publishedAt, author } = params;

  document.title = title;

  setMetaTag("description", description);
  setMetaTag("og:title", title);
  setMetaTag("og:description", description);
  setMetaTag("og:image", image);
  setMetaTag("og:url", url);
  setMetaTag("og:type", type);
  setMetaTag("og:site_name", "AfuChat");
  setMetaTag("twitter:title", title);
  setMetaTag("twitter:description", description);
  setMetaTag("twitter:image", image);
  setMetaTag("twitter:card", image !== DEFAULT_IMAGE ? "summary_large_image" : "summary");

  if (publishedAt) setMetaTag("article:published_time", publishedAt);
  if (author) setMetaTag("article:author", author);

  setLinkTag("canonical", url);
}

export function resetPageMeta() {
  if (Platform.OS !== "web") return;
  document.title = DEFAULT_TITLE;
  setMetaTag("description", DEFAULT_DESC);
  setMetaTag("og:title", DEFAULT_TITLE);
  setMetaTag("og:description", DEFAULT_DESC);
  setMetaTag("og:image", DEFAULT_IMAGE);
  setMetaTag("og:url", DEFAULT_URL);
  setMetaTag("og:type", "website");
  setMetaTag("twitter:title", DEFAULT_TITLE);
  setMetaTag("twitter:description", DEFAULT_DESC);
  setMetaTag("twitter:image", DEFAULT_IMAGE);
  setMetaTag("twitter:card", "summary");
  setLinkTag("canonical", DEFAULT_URL);
}
