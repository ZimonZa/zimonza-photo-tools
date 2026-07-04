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
  // Render the last word of the title with the gradient treatment.
  const words = title.split(" ");
  const last = words.pop();

  return (
    <div className="relative overflow-hidden">
      <div className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-[320px] opacity-70" />
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[320px]" />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <header className="mb-8 max-w-2xl animate-fade-up">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {words.join(" ")} <span className="gradient-text">{last}</span>
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            {description}
          </p>
        </header>

        {children}

        {faqs && faqs.length > 0 && (
          <section className="mx-auto mt-20 max-w-3xl">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Frequently asked <span className="gradient-text">questions</span>
            </h2>
            <dl className="mt-6 space-y-3">
              {faqs.map((faq) => (
                <div key={faq.q} className="glass rounded-2xl p-5">
                  <dt className="font-medium">{faq.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </dd>
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
    </div>
  );
}
