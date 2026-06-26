import type { ReactNode } from "react";

export interface Faq {
  q: string;
  a: string;
}

export function ToolPage({
  title,
  description,
  children,
  faqs,
}: {
  title: string;
  description: string;
  children: ReactNode;
  faqs?: Faq[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
      </header>

      {children}

      {faqs && faqs.length > 0 && (
        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
          <dl className="mt-6 divide-y divide-border">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-4">
                <dt className="font-medium">{faq.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
        </section>
      )}
    </div>
  );
}
