# Funding Bench 0

(written by Austin, 2026-08-07)

I'd like to create a new benchmark for seeing how well models (and scaffolds) can assess grant proposals, and predict whether different a proposal will get follow-up funding.

In this initial version of the benchmark, I'd like to:

1. Pull in historical project proposals from Manifund (including title, description, creator, date, target and max ask. Don't provide comments or funding data, as that leaks info.)
2. For each project, collect data on other funding history data available from public web search or eg from the Coefficient Giving website, SFF website, Longterm Wiki or others. This will be used for scoring.
3. Show all this data on a simple text-based website with some orange highlights. (We'll redesign via Claude Design later)
4. Construct a set of "funder rubrics" for several major funders eg individual cG funds, SFF, LTFF: a few paragraphs about their thesis, grantmaker bios, typical check size, total yearly spend and number of grants each year. Some of this info is on https://manifund.org/ais-funder-bulletin.
5. For a set of N models and M rubrics and K project proposal, evaluate how each model does.

- Eg: if Opus 3 is working off the LTFF rubric, how much does it recommend funding Apollo for, based on its July 2023 proposal?
- Ask it to reason a bit and then output a final $ figure
- And then compare that to 1. how much the project actually raised in 2023, and 2. how much the project raised in future years

To get it working end-to-end in the beginning:

- To start off with, pull in a selection of 5 of the large/successful-ish proposals (Timaeus, Apollo, Chinatalk, Lightcone, Forethought), 5 other decently-funded ones, as well as 10 others at random from Manifund.
- Create funder profiles for LTFF, two of the cG funds, and SFF
- For the initial models, use Claude 3.5 Sonnet, Claude 4.5 Sonnet, Claude 5 Opus, GPT 5.6 Terra, GPT 4o

Thoughts on tech stack:

- NextJS + Tailwind, Typescript-only
- InstantDB for storing data (and/or public/ JSON dumps seem reasonable for the dataset)
- OpenRouter for running different models, I'll provide a key in .env. Try to keep spend to $100 for the initial data collection + testing (I expect it shouldn't need that much though)
- LMK if other things (like Vercel Eve https://eve.dev/ ?) would make sense to use
- Strong preference to keep things simple, succinct, maintainable for now

Known limitations and constraints

- We're starting with AI safety grants only
- It's possible that current models may have memorized some information about success (eg for big cases like Apollo or Timaeus). We don't have a great solution to this atm, should look at what ForecastBench does.
- We're not starting with fancy harnesses or agentic calls (esp web search) because that easily defeats the point of the exercise
- I don't yet have a great answer for how to actually score a model's run; I think an impact-cert-ish approach (like we outline in https://manifund.substack.com/p/when-you-donate-can-matter-more-than) would be great, while also wanting to keep things simple
