# Default Design Tokens & Review Checklists

Use these **only when the user has no design system**. Always prefer the user's
own tokens when they exist.

## Spacing scale (8px base)

| Token | Value | Usage |
| --- | --- | --- |
| spacing-xs | 4px | Tight inline elements |
| spacing-sm | 8px | Related elements |
| spacing-md | 16px | Default padding |
| spacing-lg | 24px | Section spacing |
| spacing-xl | 32px | Major sections |
| spacing-2xl | 48px | Page-level spacing |

## Typography scale

| Level | Size | Weight | Usage |
| --- | --- | --- | --- |
| Display | 48–64px | Bold | Hero headlines |
| H1 | 32–40px | Bold | Page titles |
| H2 | 24–28px | Semibold | Section headers |
| H3 | 20–22px | Semibold | Subsections |
| Body | 16px | Regular | Main content |
| Small | 14px | Regular | Secondary text |
| Caption | 12px | Regular | Labels, hints |

## Color usage

| Purpose | Guidance |
| --- | --- |
| Primary | Main brand color, CTAs |
| Secondary | Supporting actions |
| Success | green range (~#22C55E) |
| Warning | amber range (~#F59E0B) |
| Error | red range (~#EF4444) |
| Neutral | gray scale for text/borders |

Limit to 1 primary + 1 secondary + neutrals. Limit to 1–2 typefaces.

## Common frame sizes

- Mobile: 375×812
- Desktop dashboard: 1440×900 (sidebar ~240px, header ~64px)

## Accessibility quick checks

1. Text contrast ≥ 4.5:1; large text ≥ 3:1 (WCAG 2.x AA, 1.4.3).
2. Target size: WCAG 2.2 **AA** minimum is 24×24 CSS px (2.5.8); 44×44 is the
   **AAA** target (2.5.5) and a common platform recommendation. Prefer 44×44
   where practical, but 24×24 is the AA floor.
3. Visible keyboard focus states.
4. Meaningful alt text for images.
5. Proper heading hierarchy (H1 → H2 → H3).
6. Never rely on color alone to convey meaning.

> Note: contrast ratios and target sizes are starting guidance. Full WCAG
> conformance requires manual testing with assistive technologies and expert
> accessibility review.

## Design review checklist

- [ ] Clear visual hierarchy
- [ ] Consistent spacing and alignment (8px grid)
- [ ] Body text ≥ 16px, readable
- [ ] Contrast meets WCAG AA
- [ ] Interactive elements obviously interactive
- [ ] Mobile-friendly touch targets
- [ ] Loading / empty / error states considered
- [ ] Consistent with the design system

Adapted from the public `github/awesome-copilot` Penpot UI/UX skill (MIT). Some
portions (tokens, checklists) remain substantially similar to the source; see
the [NOTICE](../../../NOTICE) file for attribution.
