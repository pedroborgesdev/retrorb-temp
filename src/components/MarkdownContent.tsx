import type { CSSProperties, RefObject } from 'react';
import type { InlineNode, MarkdownBlock } from '../lib/markdown';

function renderInline(nodes: InlineNode[]) {
  return nodes.map((node, index) => {
    if (node.type === 'strong') {
      return <strong key={index} className="font-semibold text-ink">{node.text}</strong>;
    }
    if (node.type === 'em') {
      return <em key={index} className="italic text-ink/90">{node.text}</em>;
    }
    if (node.type === 'del') {
      return <del key={index} className="line-through text-muted/75">{node.text}</del>;
    }
    if (node.type === 'code') {
      return (
        <code key={index} className="rounded-md border border-line bg-inset px-1.5 py-0.5 font-mono text-[12px] text-ink">
          {node.text}
        </code>
      );
    }
    if (node.type === 'link') {
      return (
        <a
          key={index}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent underline underline-offset-2 hover:brightness-110"
        >
          {node.label}
        </a>
      );
    }
    return <span key={index}>{node.text}</span>;
  });
}

export function MarkdownContent({
  blocks,
  paragraphRef,
  paragraphId,
  clampSingleParagraph = false,
  animate = false,
}: {
  blocks: MarkdownBlock[];
  paragraphRef?: RefObject<HTMLParagraphElement | null>;
  paragraphId?: string;
  clampSingleParagraph?: boolean;
  animate?: boolean;
}) {
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    return (
      <p
        ref={paragraphRef}
        id={paragraphId}
        style={animate ? ({ '--ai-step': 0 } as CSSProperties) : undefined}
        className={`whitespace-pre-line break-words text-sm leading-7 text-muted ${clampSingleParagraph ? 'line-clamp-8' : ''} ${animate ? 'retro-ai-block' : ''}`}
      >
        {renderInline(blocks[0].children)}
      </p>
    );
  }

  let step = 0;
  const nextReveal = (baseClass = ''): { className?: string; style?: CSSProperties } => {
    if (!animate) return baseClass ? { className: baseClass } : {};
    return {
      className: baseClass ? `${baseClass} retro-ai-block` : 'retro-ai-block',
      style: { '--ai-step': step++ } as CSSProperties,
    };
  };

  return (
    <div className="space-y-3 text-sm leading-7 text-muted">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h3 key={index} {...nextReveal('pt-1 font-display text-base font-semibold tracking-tight text-ink first:pt-0')}>
                {renderInline(block.children)}
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h4 key={index} {...nextReveal('flex items-center gap-2 pt-1.5 font-display text-[15px] font-semibold tracking-tight text-ink first:pt-0')}>
                <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-accent" />
                <span>{renderInline(block.children)}</span>
              </h4>
            );
          }
          if (block.level === 3) {
            return (
              <h5 key={index} {...nextReveal('flex items-center gap-2 pt-1 font-display text-sm font-semibold text-ink first:pt-0')}>
                <span aria-hidden="true" className="h-3.5 w-0.5 shrink-0 rounded-full bg-accent" />
                <span>{renderInline(block.children)}</span>
              </h5>
            );
          }
          return (
            <h6 key={index} {...nextReveal('pt-1 font-mono text-xs font-semibold uppercase tracking-wider text-ink/90 first:pt-0')}>
              {renderInline(block.children)}
            </h6>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={index} {...nextReveal('whitespace-pre-line break-words text-sm leading-7 text-muted')}>
              {renderInline(block.children)}
            </p>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} {...nextReveal('flex items-start gap-2.5')}>
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1 break-words">{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} {...nextReveal('flex items-start gap-2.5')}>
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border border-line bg-inset text-[11px] font-semibold tabular-nums text-ink">
                    {itemIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote key={index} {...nextReveal('space-y-1 rounded-r-xl border-l-2 border-accent/60 bg-inset/60 px-3.5 py-2.5 text-sm leading-6 text-ink/90')}>
              {block.lines.map((line, lineIndex) => (
                <div key={lineIndex}>{renderInline(line)}</div>
              ))}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={index} {...nextReveal('overflow-x-auto rounded-xl border border-line bg-inset p-3.5 font-mono text-xs leading-5 text-ink')}>
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={index} {...nextReveal('overflow-x-auto rounded-xl border border-line bg-inset/35')}>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-inset/70 text-ink">
                    {block.headers.map((cell, cellIndex) => (
                      <th key={cellIndex} className="px-3 py-2 font-semibold">
                        {renderInline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="transition-colors hover:bg-hover/40">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 text-muted">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <hr key={index} {...nextReveal('border-line/70')} />;
      })}
    </div>
  );
}
