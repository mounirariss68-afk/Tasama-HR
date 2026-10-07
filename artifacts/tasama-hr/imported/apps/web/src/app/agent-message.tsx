import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Presentation only: keep the stored/model-provided answer unchanged.
 * Raw HTML and external images are deliberately not rendered. */
export function AgentMessage({ content }: { content: string }) {
  return (
    <div dir="auto" className="agent-message min-w-0 text-foreground leading-relaxed [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="my-3 leading-[1.65]">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold leading-snug">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold leading-snug">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-4 mb-2 font-semibold leading-snug">{children}</h4>,
          h4: ({ children }) => <h4 className="mt-4 mb-2 font-semibold leading-snug">{children}</h4>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 ps-5 marker:text-primary/70">{children}</ul>,
          ol: ({ children, start }) => <ol start={start} className="my-3 list-decimal space-y-1.5 ps-5 marker:font-medium marker:text-primary/70">{children}</ol>,
          li: ({ children }) => <li className="ps-1 leading-[1.65] [&>p]:my-1 [&>ul]:my-2 [&>ol]:my-2">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-3 border-s-2 border-primary/30 ps-3 text-muted-foreground">{children}</blockquote>,
          hr: () => <hr className="my-4 border-border/60" />,
          a: ({ children, href }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{children}</a> : <span>{children}</span>,
          // Prevent remote tracking images in model-generated answers.
          img: ({ alt }) => alt ? <span className="text-muted-foreground">{alt}</span> : null,
          code: ({ children }) => <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">{children}</code>,
          pre: ({ children }) => <pre dir="ltr" className="my-3 max-w-full overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed">{children}</pre>,
          table: ({ children }) => <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-border/60"><table className="w-full border-collapse text-start text-xs">{children}</table></div>,
          th: ({ children, style }) => <th style={style} className="border-b border-border/60 bg-muted/50 px-3 py-2 text-start font-semibold">{children}</th>,
          td: ({ children, style }) => <td style={style} className="border-b border-border/40 px-3 py-2 align-top">{children}</td>,
        }}
      >{content}</Markdown>
    </div>
  );
}
