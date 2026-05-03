interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  children: string;
}

export function PlaceholderPage({ eyebrow, title, children }: PlaceholderPageProps) {
  return (
    <section className="page-placeholder" aria-labelledby="page-placeholder-title">
      <p className="section-label">{eyebrow}</p>
      <h2 id="page-placeholder-title">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
