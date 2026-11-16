/** A piece of text: plain, **bold**, `code` or a link. */
export interface Segment {
  t: string;
  b?: boolean;
  c?: boolean;
  href?: string;
}

export interface Release {
  version: string;
  /** yyyy-mm-dd, null for unreleased work */
  date: string | null;
  summary: Segment[];
  sections: { title: string; items: Segment[][] }[];
}
