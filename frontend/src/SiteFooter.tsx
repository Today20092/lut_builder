import { Code2, Heart } from "lucide-react"
import { ExternalLink } from "./HelpLink"

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>LUT Builder</strong>
        <p>Free, open-source tools for exposure monitoring.</p>
      </div>
      <nav aria-label="Project links">
        <a href={`${import.meta.env.BASE_URL}docs/about/`}>About</a>
        <a href={`${import.meta.env.BASE_URL}docs/`}>Manual</a>
        <ExternalLink href="https://github.com/Today20092/lut_builder">
          <Code2 aria-hidden="true" />
          GitHub
        </ExternalLink>
        <ExternalLink href="https://ko-fi.com/ayoubab1">
          <Heart aria-hidden="true" />
          Support this project<span className="sr-only"> on Ko-fi</span>
        </ExternalLink>
      </nav>
      <p>Support development with a donation or purchase on Ko-fi.</p>
    </footer>
  )
}
