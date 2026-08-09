export default function AboutPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        How scoring works <span className="text-orange-600">(explained like you&apos;re 10)</span>
      </h1>

      <div className="mt-6 max-w-2xl space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-bold">The guessing game</h2>
          <p className="mt-2">
            We show the AI an old project that once asked for money — like &ldquo;we want to build a
            safer robot brain, please fund us.&rdquo; The AI pretends to be a real grant-maker,
            reads the pitch, and makes a guess:{" "}
            <strong>
              &ldquo;I think this project will raise about this many dollars each year.&rdquo;
            </strong>{" "}
            Importantly, the AI can&apos;t see how the story actually ended — we hid that part.
          </p>
          <p className="mt-2">
            Meanwhile, we secretly know the answer, because it all happened in the past. We add up
            the real donations the project got (from Manifund plus other funders we researched).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Grading one guess</h2>
          <p className="mt-2">
            We add up the AI&apos;s guessed dollars from the year the project asked until 2026, and
            add up the real dollars over the same years. Then we ask:{" "}
            <strong>how many &ldquo;times off&rdquo; was the guess?</strong> Not &ldquo;how many
            dollars off&rdquo; — because guessing $90,000 when the answer was $100,000 is a great
            guess, but being $90,000 off when the answer was $10,000 is terrible. So we care about
            the ratio:
          </p>
          <ul className="mt-3 space-y-1 border-l-2 border-orange-500 pl-4">
            <li>
              Guessed exactly right → perfect, <strong>100 points</strong>
            </li>
            <li>
              Off by 10× (guessed $1 million, real answer was $100,000) → lose a third of the
              points, <strong>~67</strong>
            </li>
            <li>
              Off by 100× → <strong>~33</strong>
            </li>
            <li>
              Off by 1,000× or worse → <strong>0 points</strong>
            </li>
          </ul>
          <p className="mt-3 text-neutral-500">
            That&apos;s the formula{" "}
            <code className="text-orange-600">1 − |log₁₀(pred/actual)|/3</code> — each power of ten
            you&apos;re off costs 33 points. And if a project raised $0, we pretend it raised $1,000
            so the math doesn&apos;t explode.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Grading the whole model</h2>
          <p className="mt-2">
            Each model plays this game lots of times — once for every combination of pretend-funder
            (4 of them) and project (20 of them), so up to 80 guesses. Its{" "}
            <strong>FundingBench Score is just the average of all those 0–100 grades.</strong>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Two bonus report-card stats</h2>
          <p className="mt-2">
            On the results page there are two extra numbers per model-and-funder pair:
          </p>
          <ul className="mt-3 space-y-2 border-l-2 border-orange-500 pl-4">
            <li>
              <strong>Median log error</strong> — the &ldquo;typical&rdquo; number of times-off. 1.0
              means the model is usually about 10× off.
            </li>
            <li>
              <strong>Spearman correlation</strong> — ignores the exact dollar amounts and asks: did
              the model at least put the projects in the right <em>order</em>? Did it know which
              project would be the big fundraiser and which would flop, even if its dollar guesses
              were wrong? 1.0 means perfect ordering, 0 means random.
            </li>
          </ul>
        </section>

        <p className="border-2 border-neutral-300 p-4 dark:border-neutral-700">
          So in one sentence:{" "}
          <strong>
            each model guesses how much money old projects ended up raising, gets 0–100 per guess
            based on how many times-off it was, and its score is the average.
          </strong>
        </p>
      </div>
    </div>
  );
}
