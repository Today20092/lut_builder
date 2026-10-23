import { ArrowUpRight, Code2, Heart } from "lucide-react"

export function SiteFooter() {
  return <footer className="site-footer">
    <div><strong>LUT Builder</strong><p>Free, open-source tools for exposure monitoring.</p></div>
    <nav aria-label="Project links">
      <a href={`${import.meta.env.BASE_URL}docs/about/`}>About</a>
      <a href={`${import.meta.env.BASE_URL}docs/`}>Manual</a>
      <a href="https://github.com/Today20092/lut_builder" target="_blank" rel="noreferrer"><Code2 aria-hidden="true" />GitHub<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
      <a href="https://ko-fi.com/ayoubab1" target="_blank" rel="noreferrer"><Heart aria-hidden="true" />Support this project<ArrowUpRight aria-hidden="true" /><span className="sr-only"> on Ko-fi (opens in a new tab)</span></a>
    </nav>
    <p>Support development with a donation or purchase on Ko-fi.</p>
  </footer>
}
