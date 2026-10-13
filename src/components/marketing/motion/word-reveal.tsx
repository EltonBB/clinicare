import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode } from "react";

/** Accent color for the one emphasized phrase in a headline. */
export function Highlight({ children }: { children: ReactNode }) {
  return <span className="text-primary">{children}</span>;
}

function split(node: ReactNode, counter: { i: number }): ReactNode {
  if (typeof node === "string") {
    return node.split(/(\s+)/).map((part, idx) =>
      part.trim() === "" ? (
        part
      ) : (
        <span key={idx} className="hero-word" style={{ "--i": counter.i++ } as CSSProperties}>
          {part}
        </span>
      ),
    );
  }
  if (Array.isArray(node)) return Children.map(node, (child) => split(child, counter));
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, undefined, split(node.props.children, counter));
  }
  return node;
}

/** Wraps each word (recursing into elements like <Highlight>) in a
 *  `.hero-word` span so the headline un-blurs word by word on load. */
export function WordReveal({ children }: { children: ReactNode }) {
  return <>{split(children, { i: 0 })}</>;
}
