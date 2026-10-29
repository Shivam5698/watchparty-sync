const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  const value = input.trim();
  if (videoIdPattern.test(value)) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com"
  ) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (segments.length >= 2 && ["embed", "shorts"].includes(segments[0])) {
      videoId = segments[1];
    }
  }

  return videoId && videoIdPattern.test(videoId) ? videoId : null;
}
