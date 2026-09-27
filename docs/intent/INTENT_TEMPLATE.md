# Intent: [Phase Name]

Confirmed via `interview-me` on [YYYY-MM-DD], ahead of a `spec-driven-development` pass.

## Outcome

[One to two sentences: what the user gets, stated concretely — name the real component(s)/file(s) involved, not an abstract description.]

## Behavior

- [Each bullet is one concrete, observable behavior — what happens when the user does X, exactly what gets called and with what existing convention it follows/breaks from.]
- [Call out anything counterintuitive or easy to get backwards explicitly — e.g. "X and Y are fully independent: doing A must never affect B."]
- [Note what stays unchanged/untouched when it would otherwise be a reasonable guess that it changed.]

## Style / constraint

- [A hard boundary the implementation must respect — e.g. "reuses existing primitive Z, not a new one" or "matches the minimal icon-first style of the surrounding component, no new label row."]
- [Cite the existing pattern/precedent being followed or deliberately not followed, and why.]

## Out of scope

- [Something a reasonable implementer might assume is included, explicitly excluded — one bullet per item.]
- [Any adjacent feature/mechanism that was considered and rejected, named explicitly so it isn't re-litigated later.]

## Known implementation note (not yet spec'd)

[Anything left open for the spec-driven-development pass to formalize — exact data shape, which existing field/module needs to change, a mechanism choice not yet made. Omit this section entirely if there's nothing left open.]
