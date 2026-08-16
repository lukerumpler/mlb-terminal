// Vercel entrypoint for the resilient news proxy.
// The implementation is shared with the Manus Express route so local preview
// and direct Vercel deployments use the same parser, fallback order, and cache metadata.
export { default } from "../server/api/news.js";
