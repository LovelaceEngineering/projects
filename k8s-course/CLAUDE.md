# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

Authoring workspace for iximiuz Labs content (labs.iximiuz.com): a Kubernetes/containers course (Italian), standalone challenges, playgrounds, and legacy training material. All content is Markdown with YAML frontmatter; there is no build system, no tests, no package manager.

See `README.md` for the full course summary (modules, lessons, formato di ogni sessione).

## Active course

`courses/kubernets-for-engineers-italian-c57839fc/` is the ACTIVE course. Push with:

```
labctl content push -f course kubernets-for-engineers-italian-c57839fc
```

`trainings/kubernetes-course-2026-376aa76b/` is the original flat source material (8 unit files) that was migrated into the active course — do not edit in parallel.

## iximiuz content model

Hierarchy: `course → module → lesson → unit`. Each level is a directory with an `index.md` (or numbered index) whose frontmatter declares `kind`:

- Course root: `index.md` — `kind: course`
- Module: `module-N/0.index.md` — `kind: module`
- Lesson: `module-N/N.lesson-slug/index.md` — `kind: lesson` (requires `playground:` field to render at its URL)
- Unit: `module-N/N.lesson-slug/unit-N.md` — `kind: unit`

**Critical frontmatter rules** (violations cause `labctl push` to 400):

- Unit files allow ONLY `kind`, `title`, `name`. No `createdAt`, `updatedAt`, `challenges`.
- Lesson files allow `createdAt`/`updatedAt` and must include `playground:` for the URL to resolve.
- The **unit body markdown** is what renders on the lesson page; the lesson `index.md` body is overview/metadata and is not shown in the main content area. Put substantive content in `unit-*.md`.

Lesson URL shape: `/courses/{course-slug}/{module-dir}/{lesson-slug-from-frontmatter}`.

## Playgrounds

Playground references used across lessons:

- `docker` — module-1 and `module-2/1.preparare-ambiente`
- `k8s-omni` — all other module-2 lessons and all of module-3 (the `kubernetes` playground had issues; prefer `k8s-omni`)
- `kubernetes` / `k3s` — referenced by some module-4 challenge wrappers; the actual challenges live under `challenges/uN-*`

Custom playground specs live in `playgrounds/` (e.g. `vanilla/kubernetes-italian.yaml`).

## Structure at a glance

- `courses/` — iximiuz courses (content pushed via labctl). The active one is the Italian K8s course with modules 1–4 (module-4 = challenges).
- `challenges/` — standalone challenge content, one dir per challenge (`uN-*` naming maps to the unit/incontro it supports).
- `trainings/` — legacy flat training source; reference only.
- `playgrounds/` — playground YAML definitions.
- `roadmaps/` — currently empty.

## Working conventions

- Author content in Italian to match the active course.
- When adding a new lesson, create the lesson dir with `index.md` (with `playground:`) AND a `unit-1.md` containing the real content.
- After edits, push with the `labctl` command above and verify the lesson URL loads with its content.
