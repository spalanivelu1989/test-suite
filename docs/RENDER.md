# Rendering the board UML diagram

The source diagram lives in [`board-uml.puml`](board-uml.puml) (PlantUML).

## Prerequisite (one-time)

```bash
brew install plantuml
```

## Render

Run from the `docs/` directory:

```bash
cd docs

# PNG (for slides) — this is the default format
plantuml -tpng board-uml.puml

# SVG (vector, scales crisply for large screens / print)
plantuml -tsvg board-uml.puml

# PDF (for a deck / handout)
plantuml -tpdf board-uml.puml
```

## Output filename

PlantUML names the output after the diagram's `@startuml` id, **not** the source
filename. `board-uml.puml` starts with `@startuml ai-test-suite-workflow`, so it
renders to:

- `ai-test-suite-workflow.png`
- `ai-test-suite-workflow.svg`

To make the output match the source name instead, change the first line of
`board-uml.puml` from `@startuml ai-test-suite-workflow` to just `@startuml`,
and it will render to `board-uml.png`.
