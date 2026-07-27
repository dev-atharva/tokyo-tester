import type { MDXComponents } from "mdx/types";
import { mdxComponents } from "@/modules/docs/components/mdx-components";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...mdxComponents,
    ...components,
  };
}
